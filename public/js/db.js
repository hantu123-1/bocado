// ============================================================
//  Datos del celular. Todo se carga en memoria al abrir la app
//  y cada cambio se guarda en IndexedDB y queda "pendiente"
//  hasta que la sincronización lo sube a la nube.
//
//  Registro: { tipo, id, datos, mod, borrado, pendiente }
//  mod = momento del cambio (ms). Entre dos versiones gana la de mod mayor.
// ============================================================
const NOMBRE = "bocado";
const VERSION = 1;

let idb = null;
const porTipo = new Map();      // tipo -> Map(id -> registro)
const meta = new Map();         // ajustes locales: clave, cursor, etc.
const oyentes = new Set();
let tiposCambiados = new Set();
let avisoProgramado = false;

const k = (tipo, id) => tipo + "|" + id;

function pedido(req) {
  return new Promise((ok, mal) => { req.onsuccess = () => ok(req.result); req.onerror = () => mal(req.error); });
}

function transaccion(almacen, modo, fn) {
  return new Promise((ok, mal) => {
    if (!idb) { ok(); return; }   // sin IndexedDB (modo privado): solo en memoria
    const tx = idb.transaction(almacen, modo);
    fn(tx.objectStore(almacen));
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error);
  });
}

function mapa(tipo) {
  if (!porTipo.has(tipo)) porTipo.set(tipo, new Map());
  return porTipo.get(tipo);
}

function avisar(tipo) {
  tiposCambiados.add(tipo);
  if (avisoProgramado) return;
  avisoProgramado = true;
  queueMicrotask(() => {
    const tipos = tiposCambiados;
    tiposCambiados = new Set();
    avisoProgramado = false;
    oyentes.forEach((fn) => fn(tipos));
  });
}

export async function abrir() {
  try {
    const req = indexedDB.open(NOMBRE, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains("registros")) d.createObjectStore("registros", { keyPath: "k" });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
    };
    idb = await pedido(req);
    const tx = idb.transaction(["registros", "meta"], "readonly");
    const [registros, metas] = await Promise.all([
      pedido(tx.objectStore("registros").getAll()),
      pedido(tx.objectStore("meta").getAll()),
    ]);
    for (const r of registros) mapa(r.tipo).set(r.id, r);
    for (const m of metas) meta.set(m.k, m.v);
  } catch (e) {
    console.warn("IndexedDB no disponible; los datos solo quedan en memoria", e);
    idb = null;
  }
}

export function alCambiar(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

// ---------- Lectura ----------
export function todos(tipo) {
  const out = [];
  for (const r of mapa(tipo).values()) if (!r.borrado) out.push({ id: r.id, ...r.datos });
  return out;
}

export function obtener(tipo, id) {
  const r = mapa(tipo).get(id);
  return r && !r.borrado ? { id: r.id, ...r.datos } : null;
}

export function pendientes() {
  const out = [];
  for (const m of porTipo.values()) for (const r of m.values()) if (r.pendiente) out.push(r);
  return out;
}

// ---------- Escritura ----------
async function escribir(registros) {
  await transaccion("registros", "readwrite", (s) => registros.forEach((r) => s.put({ ...r, k: k(r.tipo, r.id) })));
}

export async function guardar(tipo, id, datos) {
  const anterior = mapa(tipo).get(id);
  const limpio = { ...datos };
  delete limpio.id;
  // Siempre más nuevo que la versión que ya conocemos, aunque el reloj del celular esté atrasado
  const mod = Math.max(Date.now(), anterior ? anterior.mod + 1 : 0);
  const r = { tipo, id, datos: limpio, mod, borrado: false, pendiente: true };
  mapa(tipo).set(id, r);
  avisar(tipo);
  await escribir([r]);
  return { id, ...limpio };
}

export async function borrar(tipo, id) {
  const anterior = mapa(tipo).get(id);
  if (!anterior || anterior.borrado) return;
  const r = { tipo, id, datos: {}, mod: Math.max(Date.now(), anterior.mod + 1), borrado: true, pendiente: true };
  mapa(tipo).set(id, r);
  avisar(tipo);
  await escribir([r]);
}

// Después de subir: deja de estar pendiente si no cambió mientras tanto
export async function marcarEnviados(enviados) {
  const listos = [];
  for (const e of enviados) {
    const r = mapa(e.tipo).get(e.id);
    if (r && r.pendiente && r.mod === e.mod) { r.pendiente = false; listos.push(r); }
  }
  await escribir(listos);
}

// Cambios que llegan de la nube (desde otro dispositivo)
export async function aplicarRemotos(cambios) {
  const nuevos = [];
  for (const c of cambios) {
    const local = mapa(c.tipo).get(c.id);
    if (local && local.mod > c.mod) continue;            // lo local es más nuevo: se sube después
    if (local && local.mod === c.mod && !local.pendiente) continue;
    const r = { tipo: c.tipo, id: c.id, datos: c.datos || {}, mod: c.mod, borrado: !!c.borrado, pendiente: false };
    mapa(c.tipo).set(c.id, r);
    nuevos.push(r);
    avisar(c.tipo);
  }
  await escribir(nuevos);
  return nuevos.length;
}

// Todo, para el respaldo
export function exportar() {
  const out = [];
  for (const m of porTipo.values()) for (const r of m.values()) if (!r.borrado) out.push({ tipo: r.tipo, id: r.id, datos: r.datos, mod: r.mod });
  return out;
}

// Restaura un respaldo: cada registro se trata como un cambio nuevo
export async function importar(registros) {
  const lista = [];
  const ahora = Date.now();
  for (const x of registros) {
    if (!x || !x.tipo || !x.id || typeof x.datos !== "object") continue;
    const anterior = mapa(x.tipo).get(x.id);
    const r = { tipo: x.tipo, id: String(x.id), datos: x.datos, mod: Math.max(ahora, anterior ? anterior.mod + 1 : 0), borrado: false, pendiente: true };
    mapa(r.tipo).set(r.id, r);
    lista.push(r);
    avisar(r.tipo);
  }
  await escribir(lista);
  return lista.length;
}

// ---------- Ajustes locales (no se sincronizan) ----------
export const leerMeta = (clave, porDefecto = null) => (meta.has(clave) ? meta.get(clave) : porDefecto);

export async function guardarMeta(clave, valor) {
  meta.set(clave, valor);
  await transaccion("meta", "readwrite", (s) => s.put({ k: clave, v: valor }));
}

// Borra los datos de este celular (no los de la nube)
export async function vaciar() {
  porTipo.clear();
  meta.clear();
  await transaccion("registros", "readwrite", (s) => s.clear());
  await transaccion("meta", "readwrite", (s) => s.clear());
}
