// ============================================================
//  Sincronización con la nube: sube lo pendiente y baja lo
//  que llegó desde otro dispositivo. La app funciona igual sin
//  internet; los cambios se suben cuando vuelve la conexión.
// ============================================================
import * as db from "./db.js";

const LOTE = 400;
const oyentes = new Set();
let estado = { fase: "inactivo", ultimo: null, error: "" };   // inactivo | sincronizando | listo | sin-conexion | error | sin-clave
let enCurso = null;
let otraVez = false;
let temporizador;

export const clave = () => db.leerMeta("clave", "");
export const obtenerEstado = () => ({ ...estado, pendientes: db.pendientes().length, clave: !!clave() });

export function alCambiarEstado(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function cambiar(nuevo) {
  estado = { ...estado, ...nuevo };
  const e = obtenerEstado();
  oyentes.forEach((fn) => fn(e));
}

export class ErrorClave extends Error {}

// Llamada al servidor con la clave guardada (o la que se está probando)
export async function api(ruta, { method = "GET", body, claveUsada } = {}) {
  const r = await fetch(ruta, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (claveUsada ?? clave()) },
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) throw new ErrorClave(data.error || "Clave incorrecta");
  if (!r.ok) throw new Error(data.error || "El servidor respondió " + r.status);
  return data;
}

// Comprueba una clave nueva y la guarda si es correcta
export async function probarClave(c) {
  await api("/api/estado", { claveUsada: c });
  await db.guardarMeta("clave", c);
  await db.guardarMeta("cursor", 0);   // baja todo lo que ya hay en la nube
  return sincronizar();
}

export async function olvidarClave() {
  await db.guardarMeta("clave", "");
  cambiar({ fase: "sin-clave" });
}

async function ciclo() {
  // 1. Subir lo pendiente (por partes) y bajar lo nuevo
  let mas = true;
  let vueltas = 0;
  while (mas && vueltas++ < 50) {
    const lote = db.pendientes().slice(0, LOTE);
    const enviados = lote.map((r) => ({ tipo: r.tipo, id: r.id, mod: r.mod }));
    const res = await api("/api/sincronizar", {
      method: "POST",
      body: { desde: db.leerMeta("cursor", 0), cambios: lote.map((r) => ({ tipo: r.tipo, id: r.id, datos: r.datos, mod: r.mod, borrado: r.borrado })) },
    });
    await db.marcarEnviados(enviados);
    await db.aplicarRemotos(res.cambios || []);
    await db.guardarMeta("cursor", res.cursor || 0);
    mas = res.mas || (db.pendientes().length > 0 && lote.length === LOTE);
  }
}

export async function sincronizar() {
  if (!clave()) { cambiar({ fase: "sin-clave" }); return; }
  if (enCurso) { otraVez = true; return enCurso; }
  if (!navigator.onLine) { cambiar({ fase: "sin-conexion" }); return; }
  cambiar({ fase: "sincronizando" });
  enCurso = (async () => {
    try {
      await ciclo();
      cambiar({ fase: "listo", ultimo: Date.now(), error: "" });
    } catch (e) {
      if (e instanceof ErrorClave) {
        await db.guardarMeta("clave", "");
        cambiar({ fase: "error", error: "La clave de la nube cambió. Escríbela de nuevo en Más › Nube." });
      } else if (e instanceof TypeError) {
        cambiar({ fase: "sin-conexion", error: "" });
      } else {
        cambiar({ fase: "error", error: e.message });
      }
    } finally {
      enCurso = null;
      if (otraVez) { otraVez = false; programar(500); }
    }
  })();
  return enCurso;
}

// Sincroniza poco después de un cambio (junta varios cambios seguidos)
export function programar(ms = 1500) {
  clearTimeout(temporizador);
  temporizador = setTimeout(sincronizar, ms);
}

export function iniciar() {
  db.alCambiar(() => { if (clave()) { cambiar({}); programar(); } });
  window.addEventListener("online", () => sincronizar());
  window.addEventListener("offline", () => cambiar({ fase: "sin-conexion" }));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
  setInterval(() => { if (document.visibilityState === "visible") sincronizar(); }, 60000);
  return sincronizar();
}
