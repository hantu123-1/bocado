// Cálculos de nutrición. Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tmb, edad, calcularMetas, sellos, tendencia, cambioSemanal, racha, porcionesFyV, valores, totalesDe, estadoAyuno, imc, categoriaImc, NUT,
} from "../public/js/nutricion.js";

const v = (o) => NUT.map((k) => (k in o ? o[k] : null));

test("gasto en reposo con Mifflin-St Jeor", () => {
  assert.equal(tmb({ sexo: "hombre", peso: 80, altura: 180, edad: 30 }), 1780);
  assert.equal(tmb({ sexo: "mujer", peso: 60, altura: 165, edad: 40 }), 1270.25);
});

test("edad cumplida según la fecha", () => {
  assert.equal(edad("1996-10-31", "2026-10-31"), 30);
  assert.equal(edad("1996-11-01", "2026-10-31"), 29);
});

test("metas para bajar 0,5 kg por semana", () => {
  const m = calcularMetas({ sexo: "hombre", nacimiento: "1996-01-01", altura: 180, actividad: "moderada", objetivo: "bajar", ritmo: 0.5 }, 80, "2026-10-31");
  assert.equal(m.tmb, 1780);
  assert.equal(m.gasto, 2759);
  assert.equal(m.kcal, 2210);          // 2.759 − 550, redondeado a 10
  assert.equal(m.prot, 144);           // 1,8 g por kilo
  assert.equal(m.gras, 74);            // 30 % de las calorías
  assert.equal(m.carb, 243);           // el resto
  assert.equal(m.agua, 2800);
  assert.equal(m.limitada, false);
});

test("la meta para bajar no queda bajo el mínimo", () => {
  const m = calcularMetas({ sexo: "mujer", nacimiento: "1966-01-01", altura: 155, actividad: "sedentaria", objetivo: "bajar", ritmo: 1 }, 50, "2026-10-31");
  assert.equal(m.kcal, 1200);
  assert.equal(m.limitada, true);
});

test("meta de calorías a mano y macros por porcentaje", () => {
  const m = calcularMetas({
    sexo: "mujer", nacimiento: "1990-05-05", altura: 165, actividad: "ligera", objetivo: "mantener",
    kcalManual: 1800, macros: { modo: "manual", prot: 30, carb: 40, gras: 30 },
  }, 62, "2026-10-31");
  assert.equal(m.kcal, 1800);
  assert.equal(m.prot, 135);
  assert.equal(m.carb, 180);
  assert.equal(m.gras, 60);
});

test("con IMC alto la proteína usa el peso de un IMC de 25", () => {
  const m = calcularMetas({ sexo: "hombre", nacimiento: "1980-01-01", altura: 170, actividad: "ligera", objetivo: "bajar", ritmo: 0.5 }, 110, "2026-10-31");
  assert.ok(imc(110, 170) >= 30);
  assert.equal(m.prot, Math.round(25 * 1.7 ** 2 * 1.8));
  assert.equal(categoriaImc(imc(110, 170)), "Obesidad");
});

test("sellos ALTO EN de la Ley 20.606", () => {
  const galleta = v({ kcal: 480, azuc: 25, sodio: 300, sat: 8 });
  assert.deepEqual(sellos(galleta, false).map((s) => s.clave), ["kcal", "azuc", "sat"]);
  const bebida = v({ kcal: 42, azuc: 10.4, sodio: 3, sat: 0 });
  assert.deepEqual(sellos(bebida, true).map((s) => s.texto), ["ALTO EN AZÚCARES"]);
  assert.deepEqual(sellos(v({ kcal: 50 }), false), []);
});

test("valores por cantidad y totales del día", () => {
  const platano = v({ kcal: 89, prot: 1.1 });
  assert.equal(valores(platano, 118)[0], 105.02);
  const t = totalesDe([{ v: platano, g: 100 }, { v: v({ kcal: 272, prot: 10.8 }), g: 50 }]);
  assert.equal(t[0], 225);
  assert.equal(Math.round(t[1] * 10) / 10, 6.5);
});

test("frutas y verduras: porciones de 80 g, el jugo cuenta una sola vez", () => {
  const e = [
    { grp: "fru", g: 160 },
    { grp: "fru", g: 200, l: 1 },
    { grp: "ver", g: 40 },
    { grp: "cer", g: 100 },
  ];
  assert.equal(porcionesFyV(e), 3.5);
});

test("tendencia del peso y cambio semanal", () => {
  const pesos = Array.from({ length: 21 }, (_, i) => ({ fecha: `2026-10-${String(i + 1).padStart(2, "0")}`, kg: 80 - i * 0.1 }));
  const serie = tendencia(pesos);
  assert.equal(serie.length, 21);
  assert.ok(serie[20].t > serie[20].kg, "la tendencia va un poco atrás del último peso");
  const semanal = cambioSemanal(serie);
  assert.ok(semanal < -0.4 && semanal > -0.8, "baja unos 0,7 kg por semana: " + semanal);
});

test("días seguidos anotando", () => {
  assert.equal(racha(["2026-10-29", "2026-10-30", "2026-10-31"], "2026-10-31"), 3);
  assert.equal(racha(["2026-10-29", "2026-10-30"], "2026-10-31"), 2);   // hoy aún sin anotar
  assert.equal(racha(["2026-10-28"], "2026-10-31"), 0);
});

test("estado del ayuno", () => {
  const inicio = Date.UTC(2026, 9, 31, 0, 0);
  const e = estadoAyuno({ inicio, horas: 16 }, inicio + 8 * 3600000);
  assert.equal(e.progreso, 0.5);
  assert.equal(e.cumplido, false);
  assert.equal(estadoAyuno({ inicio, horas: 16, fin: inicio + 17 * 3600000 }).cumplido, true);
});
