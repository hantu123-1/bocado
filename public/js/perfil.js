// Perfil (datos personales, objetivo y recordatorios) y metas del día.
import * as db from "./db.js";
import { hoyISO } from "./util.js";
import { calcularMetas, perfilCompleto } from "./nutricion.js";

// Metas mientras no completes tu perfil
const METAS_BASE = { kcal: 2000, prot: 75, carb: 250, gras: 67, fibra: 28, azuc: 50, sat: 22, sodio: 2000, agua: 2000, base: true };

export const RECORDATORIOS_INICIALES = {
  comidas: { activo: false, horas: { desayuno: "09:00", almuerzo: "14:00", once: "18:30", cena: "21:30" } },
  agua: { activo: false, cadaHoras: 2, desde: "09:00", hasta: "21:00" },
  peso: { activo: false, dia: 1, hora: "08:00" },
  ayuno: { activo: true },
  resumen: { activo: false, hora: "22:00" },
};

export const perfil = () => db.obtener("perfil", "yo");

export function ultimoPeso(hasta = hoyISO()) {
  const pesos = db.todos("peso").filter((p) => p.fecha <= hasta).sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  return pesos[0] || null;
}

export function pesoActual(fecha = hoyISO()) {
  const p = ultimoPeso(fecha);
  if (p) return p.kg;
  const pr = perfil();
  return pr && pr.pesoInicial ? pr.pesoInicial : null;
}

export function metasActuales(fecha = hoyISO()) {
  const p = perfil();
  const peso = pesoActual(fecha) || pesoActual();
  if (!perfilCompleto(p) || !peso) return METAS_BASE;
  return calcularMetas(p, peso, fecha);
}

// Guarda el perfil junto con las metas ya calculadas: el servidor las usa en los recordatorios
export async function guardarPerfil(cambios) {
  const actual = perfil() || { recordatorios: RECORDATORIOS_INICIALES, creado: Date.now() };
  const nuevo = { ...actual, ...cambios, zona: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago" };
  delete nuevo.id;
  const peso = pesoActual() || nuevo.pesoInicial;
  if (perfilCompleto(nuevo) && peso) {
    const m = calcularMetas(nuevo, peso, hoyISO());
    nuevo.metas = { kcal: m.kcal, prot: m.prot, carb: m.carb, gras: m.gras, agua: m.agua };
  }
  return db.guardar("perfil", "yo", nuevo);
}

// Si cambió el peso, las metas guardadas para el servidor se actualizan
export async function actualizarMetasGuardadas() {
  const p = perfil();
  if (!perfilCompleto(p)) return;
  const m = metasActuales();
  const g = p.metas || {};
  if (g.kcal !== m.kcal || g.prot !== m.prot || g.agua !== m.agua) await guardarPerfil({});
}
