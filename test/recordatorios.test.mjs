// Recordatorios y productos de Open Food Facts. Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { horaLocal, candidatos, redactar, ayunoCumplido, VENTANA } from "../src/recordatorios.js";
import { convertirProducto } from "../src/index.js";

const perfil = {
  recordatorios: {
    comidas: { activo: true, horas: { almuerzo: "13:00", cena: "21:00" } },
    agua: { activo: true, cadaHoras: 2, desde: "09:00", hasta: "21:00" },
    peso: { activo: true, dia: 6, hora: "08:00" },
    resumen: { activo: true, hora: "22:00" },
  },
};
const local = (hhmm, dia = 6) => {
  const [h, m] = hhmm.split(":").map(Number);
  return { fecha: "2026-10-31", minutos: h * 60 + m, dia };
};
const sinNada = { comidas: {}, agua: 0, pesoHoy: false };

test("hora local en Chile (horario de verano)", () => {
  const l = horaLocal(new Date(Date.UTC(2026, 9, 31, 16, 10)), "America/Santiago");
  assert.deepEqual(l, { fecha: "2026-10-31", minutos: 13 * 60 + 10, dia: 6 });
});

test("el recordatorio de comida sale dentro de la ventana", () => {
  assert.ok(candidatos(perfil, local("13:05")).some((c) => c.clave === "comida:almuerzo:2026-10-31"));
  assert.ok(!candidatos(perfil, local("12:55")).some((c) => c.tipo === "comida"));
  const tarde = local("13:00");
  tarde.minutos += VENTANA;
  assert.ok(!candidatos(perfil, tarde).some((c) => c.tipo === "comida"));
});

test("no recuerda una comida que ya anotaste", () => {
  const c = candidatos(perfil, local("13:05")).find((x) => x.tipo === "comida");
  assert.equal(redactar(c, { ...sinNada, comidas: { almuerzo: { n: 2, kcal: 600, prot: 30 } } }), null);
  assert.match(redactar(c, sinNada).body, /el almuerzo/);
});

test("agua: solo si vas atrasado", () => {
  const c = candidatos(perfil, local("13:00")).find((x) => x.tipo === "agua");
  assert.ok(c, "a las 13:00 toca revisar el agua (cada 2 horas desde las 9)");
  assert.ok(redactar(c, { ...sinNada, agua: 250 }, { agua: 2000 }));   // se esperaban ~667 ml
  assert.equal(redactar(c, { ...sinNada, agua: 600 }, { agua: 2000 }), null);
});

test("pesaje semanal solo el día elegido y si no te pesaste", () => {
  assert.ok(candidatos(perfil, local("08:10", 6)).some((c) => c.tipo === "peso"));
  assert.ok(!candidatos(perfil, local("08:10", 5)).some((c) => c.tipo === "peso"));
  const c = candidatos(perfil, local("08:10", 6)).find((x) => x.tipo === "peso");
  assert.equal(redactar(c, { ...sinNada, pesoHoy: true }), null);
});

test("resumen del día con calorías y proteína", () => {
  const c = candidatos(perfil, local("22:00")).find((x) => x.tipo === "resumen");
  const r = redactar(c, { comidas: { almuerzo: { n: 2, kcal: 700, prot: 40 }, cena: { n: 1, kcal: 500, prot: 30 } }, agua: 1500, pesoHoy: false }, { kcal: 2000, prot: 120 });
  assert.equal(r.body, "1.200 de 2.000 kcal · proteína 70 de 120 g · agua 1.500 ml");
});

test("aviso de ayuno cumplido", () => {
  const inicio = Date.UTC(2026, 9, 30, 23, 0);
  assert.equal(ayunoCumplido({ inicio, horas: 16, fin: null }, inicio + 15 * 3600000), null);
  assert.ok(ayunoCumplido({ inicio, horas: 16, fin: null }, inicio + 16 * 3600000));
  assert.equal(ayunoCumplido({ inicio, horas: 16, fin: inicio + 17 * 3600000 }, inicio + 18 * 3600000), null);
});

test("producto de Open Food Facts al formato de la app", () => {
  const p = convertirProducto({
    code: "7802900001292", product_name: "Leche Natural Semidescremada", brands: "Soprole,Otra",
    quantity: "1 L", serving_quantity: 200, product_quantity: 1000,
    nutriments: { "energy-kcal_100g": 46, proteins_100g: 3.1, carbohydrates_100g: 4.7, fat_100g: 1.5, sugars_100g: 4.7, sodium_100g: 0.044, "saturated-fat_100g": 1 },
  });
  assert.equal(p.n, "Leche Natural Semidescremada");
  assert.equal(p.marca, "Soprole");
  assert.equal(p.l, 1);
  assert.deepEqual(p.v.slice(0, 8), [46, 3.1, 4.7, 1.5, null, 4.7, 44, 1]);
  assert.deepEqual(p.p, [["1 porción (200 ml)", 200], ["1 envase (1000 ml)", 1000]]);

  const sinKcal = convertirProducto({ code: "1", product_name: "X", nutriments: { energy_100g: 1000 } });
  assert.equal(sinKcal.v[0], 239);   // 1.000 kJ ≈ 239 kcal
});
