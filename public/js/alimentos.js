// ============================================================
//  Catálogo de alimentos: base (USDA), los tuyos, tus recetas y
//  los productos envasados que ya escaneaste. Búsqueda, recientes,
//  favoritos y porciones.
//
//  Un alimento: { ref, n, marca, g (grupo), v (por 100 g), p: [[porción, gramos]], l (líquido), fuente }
//  ref: "b:id" base · "a:id" tuyo · "r:id" receta · "o:código" producto envasado
// ============================================================
import * as db from "./db.js";
import { normalizar, hoyISO, sumarDias, horaActual } from "./util.js";
import { valores, sumar } from "./nutricion.js";

export const GRUPOS = {
  fru: "Frutas", ver: "Verduras", pap: "Papas y tubérculos", leg: "Legumbres", cer: "Pan y cereales",
  car: "Carnes", ave: "Aves", pes: "Pescados y mariscos", emb: "Embutidos", hue: "Huevos", lac: "Lácteos",
  ace: "Aceites y grasas", fse: "Frutos secos y semillas", dul: "Dulces y postres", beb: "Bebidas",
  alc: "Alcohol", sal: "Salsas y condimentos", sna: "Snacks", rap: "Comida rápida", sup: "Suplementos",
  rec: "Recetas", otr: "Otros",
};
export const FUENTES = { base: "USDA", propio: "Tuyo", receta: "Receta", producto: "Open Food Facts", rapido: "Rápido" };

let base = [];
let porRef = new Map();
let carga = null;

export function cargarBase() {
  if (!carga) {
    carga = fetch("datos/alimentos.json")
      .then((r) => r.json())
      .then((d) => {
        base = d.alimentos.map((a) => ({
          ref: "b:" + a.id, n: a.n, s: a.s || "", g: a.g, v: a.v, p: a.p || [], l: a.l || 0,
          fuente: "base", aprox: a.n.includes("(aprox.)"),
        }));
        porRef = new Map(base.map((a) => [a.ref, a]));
      })
      .catch((e) => { carga = null; throw e; });
  }
  return carga;
}

// ---------- Conversión desde cada fuente ----------
export const desdePropio = (a) => ({
  ref: "a:" + a.id, n: a.n, marca: a.marca || "", g: a.g || "otr", v: a.v, p: a.p || [], l: a.l ? 1 : 0,
  fuente: "propio", codigo: a.codigo || "",
});

export function desdeReceta(r) {
  const ingredientes = r.ingredientes || [];
  const crudo = ingredientes.reduce((s, i) => s + i.g, 0);
  const final = Number(r.pesoFinal) > 0 ? Number(r.pesoFinal) : crudo;
  const total = sumar(ingredientes.map((i) => valores(i.v, i.g)));
  const porciones = Math.max(1, Number(r.porciones) || 1);
  return {
    ref: "r:" + r.id, n: r.n, g: "rec", fuente: "receta",
    v: total.map((x) => (final ? (x * 100) / final : 0)),
    p: [["1 porción", Math.round((final / porciones) * 10) / 10], ["Receta completa", Math.round(final)]],
    l: 0,
  };
}

export const desdeProducto = (p) => ({
  ref: "o:" + p.codigo, n: p.n, marca: p.marca || "", g: "otr", v: p.v, p: p.p || [], l: p.l ? 1 : 0,
  fuente: "producto", codigo: p.codigo, cantidad: p.cantidad || "", img: p.img || "",
});

// Alimento guardado dentro de una comida anotada (por si el original ya no existe)
export const desdeEntrada = (e) => ({
  ref: e.ref, n: e.n, marca: e.marca || "", g: e.grp || "otr", v: e.v, l: e.l ? 1 : 0,
  p: e.por && e.porG && e.por !== "g" && e.por !== "ml" ? [[e.por, e.porG]] : [],
  fuente: e.fuente || "rapido",
});

export function resolver(ref) {
  if (!ref) return null;
  const [tipo, id] = [ref.slice(0, 1), ref.slice(2)];
  if (tipo === "b") return porRef.get(ref) || null;
  if (tipo === "a") { const a = db.obtener("alimento", id); return a ? desdePropio(a) : null; }
  if (tipo === "r") { const r = db.obtener("receta", id); return r ? desdeReceta(r) : null; }
  if (tipo === "o") { const p = db.obtener("producto", id); return p ? desdeProducto(p) : null; }
  return null;
}

function catalogo() {
  return [
    ...db.todos("alimento").map(desdePropio),
    ...db.todos("receta").map(desdeReceta),
    ...db.todos("producto").map(desdeProducto),
    ...base,
  ];
}

// ---------- Uso (para ordenar por lo que más comes) ----------
export function entradasDesde(dias) {
  const desde = sumarDias(hoyISO(), -dias);
  return db.todos("entrada").filter((e) => e.fecha >= desde);
}

function frecuencias(entradas) {
  const f = new Map();
  for (const e of entradas) if (e.ref) f.set(e.ref, (f.get(e.ref) || 0) + 1);
  return f;
}

// ---------- Búsqueda ----------
const palabras = (s) => " " + normalizar(s).replace(/[^a-z0-9%]+/g, " ") + " ";

export function buscar(q, limite = 40) {
  const consulta = normalizar(q).trim();
  const tokens = consulta.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const usos = frecuencias(entradasDesde(90));
  const res = [];
  for (const a of catalogo()) {
    const nombre = palabras(a.n + " " + (a.marca || ""));
    const sinonimos = palabras(a.s || "");
    let puntos = 0;
    let calza = true;
    for (const t of tokens) {
      const raiz = t.length > 3 ? t.replace(/(es|s)$/, "") : t;   // plurales simples
      if (nombre.includes(" " + raiz)) puntos += 3;
      else if (sinonimos.includes(" " + raiz)) puntos += 2;
      else if (nombre.includes(raiz) || sinonimos.includes(raiz)) puntos += 1;
      else { calza = false; break; }
    }
    if (!calza) continue;
    if (nombre.startsWith(" " + consulta)) puntos += 4;
    if (a.aprox) puntos -= 0.5;
    if (a.fuente !== "base") puntos += 0.5;
    puntos += Math.min(3, Math.log2(1 + (usos.get(a.ref) || 0)));
    puntos -= a.n.length / 100;
    res.push({ a, puntos });
  }
  return res.sort((x, y) => y.puntos - x.puntos).slice(0, limite).map((x) => x.a);
}

export const porCodigo = (codigo) => {
  const propio = db.todos("alimento").find((a) => a.codigo === codigo);
  if (propio) return desdePropio(propio);
  const p = db.obtener("producto", codigo);
  return p ? desdeProducto(p) : null;
};

// ---------- Recientes, sugeridos y favoritos ----------
// Lo último que anotaste, con la cantidad que usaste esa vez
export function recientes(limite = 30, comida = null) {
  const entradas = entradasDesde(60)
    .filter((e) => e.ref && (!comida || e.comida === comida))
    .sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1));
  const vistos = new Set();
  const out = [];
  for (const e of entradas) {
    if (vistos.has(e.ref)) continue;
    vistos.add(e.ref);
    out.push({ alimento: resolver(e.ref) || desdeEntrada(e), ultima: e });
    if (out.length >= limite) break;
  }
  return out;
}

// Lo que sueles comer en esta comida, de lo más frecuente a lo menos
export function sugeridos(comida, limite = 12) {
  const entradas = entradasDesde(45).filter((e) => e.ref && e.comida === comida);
  const f = frecuencias(entradas);
  const ultima = new Map();
  for (const e of entradas) if (!ultima.has(e.ref) || ultima.get(e.ref).fecha < e.fecha) ultima.set(e.ref, e);
  return [...f.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([ref]) => ({ alimento: resolver(ref) || desdeEntrada(ultima.get(ref)), ultima: ultima.get(ref) }));
}

export const ultimaVez = (ref) => {
  let ultima = null;
  for (const e of db.todos("entrada")) if (e.ref === ref && (!ultima || e.fecha + e.hora > ultima.fecha + ultima.hora)) ultima = e;
  return ultima;
};

const idFavorito = (ref) => ref.replace(":", "-");
export const esFavorito = (ref) => !!db.obtener("favorito", idFavorito(ref));
export function favoritos() {
  return db.todos("favorito")
    .sort((a, b) => a.n.localeCompare(b.n, "es"))
    .map((f) => resolver(f.ref) || { ...f.copia, ref: f.ref })
    .filter(Boolean);
}
export async function alternarFavorito(a) {
  if (esFavorito(a.ref)) await db.borrar("favorito", idFavorito(a.ref));
  else await db.guardar("favorito", idFavorito(a.ref), { ref: a.ref, n: a.n, copia: { n: a.n, marca: a.marca || "", g: a.g, v: a.v, p: a.p, l: a.l, fuente: a.fuente } });
  return esFavorito(a.ref);
}

// ---------- Porciones ----------
export function porcionesDe(a) {
  const lista = (a.p || []).filter(([, g]) => g > 0).map(([n, g]) => ({ n, g }));
  lista.push({ n: a.l ? "ml" : "g", g: 1, suelta: true });
  return lista;
}

export function porcionInicial(a) {
  const ultima = ultimaVez(a.ref);
  const lista = porcionesDe(a);
  if (ultima) {
    const p = lista.find((x) => x.n === ultima.por) || lista[lista.length - 1];
    return { porcion: p, cant: p.suelta ? ultima.g : ultima.cant };
  }
  return lista.length > 1 ? { porcion: lista[0], cant: 1 } : { porcion: lista[0], cant: 100 };
}

// ---------- Anotar ----------
export function datosEntrada(a, { cant, porcion, comida, fecha, hora }) {
  return {
    fecha, comida, hora: hora || horaActual(),
    ref: a.ref || null, n: a.n, marca: a.marca || "", fuente: a.fuente,
    g: Math.round(cant * porcion.g * 10) / 10, cant, por: porcion.n, porG: porcion.g,
    v: a.v, grp: a.g, l: a.l ? 1 : 0,
  };
}

// Guarda el producto envasado para tenerlo sin internet y en las búsquedas
export async function guardarProducto(a) {
  if (a.fuente !== "producto" || !a.codigo) return;
  if (db.obtener("producto", a.codigo)) return;
  await db.guardar("producto", a.codigo, { codigo: a.codigo, n: a.n, marca: a.marca, v: a.v, p: a.p, l: a.l, cantidad: a.cantidad || "", img: a.img || "" });
}
