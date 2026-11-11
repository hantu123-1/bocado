// Arma public/datos/alimentos.json a partir de scripts/alimentos-base.txt
// y de los datos del USDA (FoodData Central, SR Legacy, dominio público).
//
// Uso: node scripts/generar-alimentos.mjs RUTA_A_LA_CARPETA_DEL_USDA
//   (la carpeta que contiene food.csv, food_nutrient.csv y food_portion.csv;
//    se descarga de https://fdc.nal.usda.gov/download-datasets)
// Si un alimento no se encuentra, muestra los más parecidos y no genera nada.
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const usda = process.argv[2] || process.env.USDA_DIR || "datos-usda";
const base = new URL("./alimentos-base.txt", import.meta.url);
const destino = new URL("../public/datos/alimentos.json", import.meta.url);

// Orden de los valores en "v" (siempre por 100 g)
const NUTRIENTES = [
  ["kcal", 1008, 0], ["prot", 1003, 1], ["carb", 1005, 1], ["gras", 1004, 1], ["fibra", 1079, 1],
  ["azuc", 2000, 1], ["sodio", 1093, 0], ["sat", 1258, 1], ["col", 1253, 0], ["calcio", 1087, 0],
  ["hierro", 1089, 1], ["potasio", 1092, 0], ["vitc", 1162, 1], ["vita", 1106, 0], ["vitd", 1114, 1],
];
const GRUPOS = {
  "Frutas": "fru", "Verduras": "ver", "Papas y tubérculos": "pap", "Legumbres": "leg", "Pan y cereales": "cer",
  "Carnes": "car", "Aves": "ave", "Pescados y mariscos": "pes", "Embutidos": "emb", "Huevos": "hue",
  "Lácteos": "lac", "Aceites y grasas": "ace", "Frutos secos y semillas": "fse", "Dulces y postres": "dul",
  "Bebidas": "beb", "Alcohol": "alc", "Salsas y condimentos": "sal", "Snacks": "sna", "Comida rápida": "rap",
  "Suplementos": "sup",
};
const LIQUIDO = /^(Leche (entera|semi|descremada|chocolatada)|Jugo|Néctar|Bebida|Kéfir|Caldo de pollo)/;
const ML = { cup: 236.6, "fl oz": 29.57, tbsp: 14.79, tsp: 4.93 };

// ---------- CSV ----------
function campos(linea) {
  const out = [];
  let i = 0;
  while (i <= linea.length) {
    if (linea[i] === '"') {
      let v = "";
      i++;
      while (i < linea.length) {
        if (linea[i] === '"' && linea[i + 1] === '"') { v += '"'; i += 2; }
        else if (linea[i] === '"') { i++; break; }
        else v += linea[i++];
      }
      out.push(v);
      i++; // coma
    } else {
      const fin = linea.indexOf(",", i);
      out.push(linea.slice(i, fin === -1 ? linea.length : fin));
      i = fin === -1 ? linea.length + 1 : fin + 1;
    }
  }
  return out;
}

async function recorrer(archivo, alLeer) {
  const rl = createInterface({ input: createReadStream(join(usda, archivo)), crlfDelay: Infinity });
  let cabecera = null;
  for await (const linea of rl) {
    if (!linea) continue;
    const c = campos(linea);
    if (!cabecera) { cabecera = c; continue; }
    alLeer(Object.fromEntries(cabecera.map((k, i) => [k, c[i]])));
  }
}

// ---------- Lista base ----------
function leerBase() {
  const items = [];
  let grupo = null;
  readFileSync(base, "utf8").split(/\r?\n/).forEach((linea, n) => {
    const l = linea.trim();
    if (!l || l.startsWith("# ")) return;
    if (l.startsWith("## ")) {
      grupo = GRUPOS[l.slice(3).trim()];
      if (!grupo) throw new Error(`Línea ${n + 1}: grupo desconocido "${l.slice(3)}"`);
      return;
    }
    const [nombres, descripcion, porciones = ""] = l.split("|").map((s) => s.trim());
    const [nombre, sinonimos = ""] = nombres.split(";").map((s) => s.trim());
    items.push({
      linea: n + 1, grupo, nombre, descripcion,
      sinonimos: sinonimos.split(",").map((s) => s.trim()).filter(Boolean),
      porciones: porciones.split(";").map((s) => s.trim()).filter(Boolean).map((p) => {
        const i = p.lastIndexOf("=");
        return { etiqueta: p.slice(0, i).trim(), ref: p.slice(i + 1).trim() };
      }),
    });
  });
  return items;
}

const normal = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const slug = (s) => normal(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function parecidos(descripcion, todas) {
  const palabras = new Set(normal(descripcion).split(/[^a-z0-9%]+/).filter((w) => w.length > 2));
  return todas
    .map((d) => {
      const w = normal(d).split(/[^a-z0-9%]+/);
      const comunes = w.filter((x) => palabras.has(x)).length;
      return { d, puntos: comunes / Math.sqrt(w.length + 1) };
    })
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 5)
    .map((x) => x.d);
}

function redondear(v, dec) {
  const f = 10 ** dec;
  return Math.round(v * f) / f;
}

// El USDA escribe las porciones de varias formas ("cup, sliced", "cup slices", "tablespoon"...)
const ALIAS = { tbsp: "tablespoon", tsp: "teaspoon" };
const sinComas = (s) => s.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();

function buscarPorcion(por, ref) {
  const r = sinComas(ref);
  const opciones = [r, ALIAS[r]].filter(Boolean);
  return por.find((x) => opciones.some((o) => sinComas(x.mod).startsWith(o)))
    || por.find((x) => opciones.some((o) => (" " + sinComas(x.mod) + " ").includes(" " + o + " ")));
}

function densidad(porciones) {
  for (const [unidad, ml] of Object.entries(ML)) {
    const p = buscarPorcion(porciones, unidad);
    if (p && Number(p.amount) > 0) return p.gramos / Number(p.amount) / ml;
  }
  return null;
}

function resolverPorcion(item, por, errores) {
  return item.porciones.map(({ etiqueta, ref }) => {
    let [r, factor] = ref.split("*");
    factor = factor ? Number(factor) : 1;
    let gramos;
    if (/^\d+(\.\d+)?$/.test(r)) gramos = Number(r);
    else if (r.startsWith("ml:")) {
      const d = densidad(por);
      if (d === null) console.warn(`Aviso: ${item.nombre} no tiene densidad en el USDA; "${etiqueta}" usa 1 g por ml`);
      gramos = Number(r.slice(3)) * (d ?? 1);
    } else {
      const p = buscarPorcion(por, r);
      if (!p) {
        errores.push(`Línea ${item.linea} (${item.nombre}): no hay porción "${r}". Hay: ${por.map((x) => x.mod).join(" · ") || "ninguna"}`);
        return null;
      }
      gramos = p.gramos / (Number(p.amount) || 1);
    }
    return [etiqueta, redondear(gramos * factor, 1)];
  }).filter(Boolean);
}

// ---------- Programa ----------
const items = leerBase();
const porDescripcion = new Map();
await recorrer("food.csv", (f) => porDescripcion.set(f.description, f.fdc_id));

const errores = [];
const ids = new Set();
for (const it of items) {
  it.fdc = porDescripcion.get(it.descripcion);
  if (!it.fdc) errores.push(`Línea ${it.linea} (${it.nombre}): no existe "${it.descripcion}". Parecidos:\n    ${parecidos(it.descripcion, [...porDescripcion.keys()]).join("\n    ")}`);
  ids.add(it.fdc);
}
if (errores.length) {
  console.error(errores.join("\n"));
  process.exit(1);
}

const valores = new Map();
const porcionesUsda = new Map();
const idsNutrientes = new Map(NUTRIENTES.map(([, id], i) => [String(id), i]));
await recorrer("food_nutrient.csv", (r) => {
  if (!ids.has(r.fdc_id) || !idsNutrientes.has(r.nutrient_id)) return;
  if (!valores.has(r.fdc_id)) valores.set(r.fdc_id, new Array(NUTRIENTES.length).fill(null));
  valores.get(r.fdc_id)[idsNutrientes.get(r.nutrient_id)] = Number(r.amount);
});
await recorrer("food_portion.csv", (r) => {
  if (!ids.has(r.fdc_id)) return;
  if (!porcionesUsda.has(r.fdc_id)) porcionesUsda.set(r.fdc_id, []);
  porcionesUsda.get(r.fdc_id).push({
    seq: Number(r.seq_num), amount: r.amount, gramos: Number(r.gram_weight),
    mod: (r.modifier || r.portion_description || "").toLowerCase().replace(/"/g, ""),
  });
});

const alimentos = [];
const vistos = new Set();
for (const it of items) {
  const por = (porcionesUsda.get(it.fdc) || []).sort((a, b) => a.seq - b.seq);
  const v = valores.get(it.fdc);
  if (!v || v[0] === null) { errores.push(`Línea ${it.linea} (${it.nombre}): el USDA no tiene calorías`); continue; }
  const id = slug(it.nombre);
  if (vistos.has(id)) { errores.push(`Línea ${it.linea}: nombre repetido "${it.nombre}"`); continue; }
  vistos.add(id);
  const a = {
    id,
    n: it.nombre,
    g: it.grupo,
    v: v.map((x, i) => (x === null ? null : redondear(x, NUTRIENTES[i][2]))),
    p: resolverPorcion(it, por, errores),
    f: it.fdc,
  };
  if (it.sinonimos.length) a.s = it.sinonimos.join(", ");
  if (LIQUIDO.test(it.nombre) || it.grupo === "beb" || it.grupo === "alc") a.l = 1;
  alimentos.push(a);
}
if (errores.length) {
  console.error(errores.join("\n"));
  process.exit(1);
}

mkdirSync(new URL("../public/datos/", import.meta.url), { recursive: true });
writeFileSync(destino, JSON.stringify({
  fuente: "USDA FoodData Central, SR Legacy (abril 2018). Dominio público.",
  nutrientes: NUTRIENTES.map(([k]) => k),
  alimentos,
}));
console.log(`Listo: ${alimentos.length} alimentos en public/datos/alimentos.json`);
