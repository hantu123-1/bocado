// ============================================================
//  Cálculos de nutrición: metas, sumas del día, IMC, sellos
//  "ALTO EN", tendencia del peso y ayuno.
//  No toca la pantalla ni la base de datos (se prueba con npm test).
// ============================================================

// Orden de los valores de cada alimento (siempre por 100 g o 100 ml)
export const NUT = ["kcal", "prot", "carb", "gras", "fibra", "azuc", "sodio", "sat", "col", "calcio", "hierro", "potasio", "vitc", "vita", "vitd"];
export const I = Object.fromEntries(NUT.map((k, i) => [k, i]));
export const INFO = {
  kcal: { nombre: "Calorías", unidad: "kcal", dec: 0 },
  prot: { nombre: "Proteínas", unidad: "g", dec: 1 },
  carb: { nombre: "Carbohidratos", unidad: "g", dec: 1 },
  gras: { nombre: "Grasas", unidad: "g", dec: 1 },
  fibra: { nombre: "Fibra", unidad: "g", dec: 1 },
  azuc: { nombre: "Azúcares", unidad: "g", dec: 1 },
  sodio: { nombre: "Sodio", unidad: "mg", dec: 0 },
  sat: { nombre: "Grasas saturadas", unidad: "g", dec: 1 },
  col: { nombre: "Colesterol", unidad: "mg", dec: 0 },
  calcio: { nombre: "Calcio", unidad: "mg", dec: 0 },
  hierro: { nombre: "Hierro", unidad: "mg", dec: 1 },
  potasio: { nombre: "Potasio", unidad: "mg", dec: 0 },
  vitc: { nombre: "Vitamina C", unidad: "mg", dec: 0 },
  vita: { nombre: "Vitamina A", unidad: "µg", dec: 0 },
  vitd: { nombre: "Vitamina D", unidad: "µg", dec: 1 },
};

export const COMIDAS = [
  { id: "desayuno", nombre: "Desayuno" },
  { id: "almuerzo", nombre: "Almuerzo" },
  { id: "once", nombre: "Once" },
  { id: "cena", nombre: "Cena" },
  { id: "colacion", nombre: "Colaciones" },
];

export const ACTIVIDAD = {
  sedentaria: { nombre: "Sedentaria", detalle: "Trabajo sentado y casi nada de ejercicio", factor: 1.2 },
  ligera: { nombre: "Ligera", detalle: "Ejercicio 1 a 3 días por semana", factor: 1.375 },
  moderada: { nombre: "Moderada", detalle: "Ejercicio 3 a 5 días por semana", factor: 1.55 },
  alta: { nombre: "Alta", detalle: "Ejercicio intenso 6 a 7 días por semana", factor: 1.725 },
  muyAlta: { nombre: "Muy alta", detalle: "Trabajo físico pesado o entrenas dos veces al día", factor: 1.9 },
};

export const OBJETIVOS = {
  bajar: "Bajar de peso",
  mantener: "Mantener mi peso",
  subir: "Subir de peso o ganar músculo",
};

export const PROTOCOLOS = [
  { horas: 12, nombre: "12:12" },
  { horas: 14, nombre: "14:10" },
  { horas: 16, nombre: "16:8" },
  { horas: 18, nombre: "18:6" },
  { horas: 20, nombre: "20:4" },
  { horas: 23, nombre: "23:1" },
];

// Ley 20.606 (límites vigentes desde 2019), por 100 g o 100 ml
export const LIMITES_SELLOS = {
  solido: { kcal: 275, azuc: 10, sodio: 400, sat: 4 },
  liquido: { kcal: 70, azuc: 5, sodio: 100, sat: 3 },
};
const NOMBRE_SELLO = { kcal: "CALORÍAS", azuc: "AZÚCARES", sodio: "SODIO", sat: "GRASAS SATURADAS" };

const KCAL_POR_KG = 7700;
const redondear = (x, paso = 1) => Math.round(x / paso) * paso;

// ---------- Sumas ----------
// Valores de una cantidad en gramos (v es por 100 g)
export function valores(v, gramos) {
  return NUT.map((_, i) => (v[i] === null || v[i] === undefined ? null : (v[i] * gramos) / 100));
}

export function sumar(listas) {
  const total = NUT.map(() => 0);
  for (const l of listas) l.forEach((x, i) => { if (x) total[i] += x; });
  return total;
}

export const totalesDe = (entradas) => sumar(entradas.map((e) => valores(e.v, e.g)));
export const kcalDe = (e) => ((e.v[0] || 0) * e.g) / 100;

// ---------- Perfil y metas ----------
export function edad(nacimiento, hoy) {
  if (!nacimiento) return null;
  const [a, m, d] = nacimiento.split("-").map(Number);
  const [ha, hm, hd] = hoy.split("-").map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

// Gasto en reposo, fórmula de Mifflin-St Jeor
export function tmb({ sexo, peso, altura, edad }) {
  return 10 * peso + 6.25 * altura - 5 * edad + (sexo === "mujer" ? -161 : 5);
}

export const imc = (peso, alturaCm) => peso / (alturaCm / 100) ** 2;

export function categoriaImc(x) {
  if (x < 18.5) return "Bajo peso";
  if (x < 25) return "Normal";
  if (x < 30) return "Sobrepeso";
  return "Obesidad";
}

export function perfilCompleto(p) {
  return !!(p && p.sexo && p.nacimiento && p.altura > 0 && p.actividad && p.objetivo);
}

// Metas diarias a partir del perfil y del peso actual
export function calcularMetas(perfil, peso, hoy) {
  const e = edad(perfil.nacimiento, hoy);
  const base = tmb({ sexo: perfil.sexo, peso, altura: perfil.altura, edad: e });
  const gasto = base * (ACTIVIDAD[perfil.actividad] || ACTIVIDAD.sedentaria).factor;
  const ritmo = Number(perfil.ritmo) || 0;
  const ajuste = perfil.objetivo === "bajar" ? -ritmo : perfil.objetivo === "subir" ? ritmo : 0;
  const ideal = gasto + (ajuste * KCAL_POR_KG) / 7;

  // Para bajar de peso, no menos de 1.200 kcal (mujer) o 1.500 kcal (hombre)
  let kcal = ideal;
  let limitada = false;
  if (perfil.objetivo === "bajar") {
    const piso = Math.min(perfil.sexo === "mujer" ? 1200 : 1500, gasto);
    if (kcal < piso) { kcal = piso; limitada = true; }
  }
  const manual = Number(perfil.kcalManual) > 0;
  if (manual) kcal = Number(perfil.kcalManual);
  kcal = redondear(kcal, 10);

  const indice = imc(peso, perfil.altura);
  let prot, carb, gras;
  const m = perfil.macros || {};
  if (m.modo === "manual" && m.prot + m.carb + m.gras === 100) {
    prot = (kcal * m.prot) / 100 / 4;
    carb = (kcal * m.carb) / 100 / 4;
    gras = (kcal * m.gras) / 100 / 9;
  } else {
    // Proteína por kilo; con IMC de 30 o más se usa el peso que daría un IMC de 25
    const pesoRef = indice >= 30 ? 25 * (perfil.altura / 100) ** 2 : peso;
    const porKilo = perfil.objetivo === "mantener" ? 1.4 : 1.8;
    prot = Math.min(pesoRef * porKilo, (kcal * 0.35) / 4);
    gras = (kcal * 0.3) / 9;
    carb = Math.max(0, (kcal - prot * 4 - gras * 9) / 4);
  }

  const agua = Number(perfil.aguaManual) > 0
    ? Number(perfil.aguaManual)
    : Math.min(4000, Math.max(1500, redondear(peso * 35, 50)));

  return {
    edad: e,
    imc: Math.round(indice * 10) / 10,
    tmb: Math.round(base),
    gasto: Math.round(gasto),
    kcal,
    limitada,
    manual,
    prot: Math.round(prot),
    carb: Math.round(carb),
    gras: Math.round(gras),
    fibra: Math.max(25, Math.round((kcal / 1000) * 14)),
    azuc: Math.round((kcal * 0.1) / 4),
    sat: Math.round((kcal * 0.1) / 9),
    sodio: 2000,
    agua,
  };
}

// Referencias diarias de vitaminas y minerales para adultos
export function referencias(sexo, años) {
  const mujer = sexo === "mujer";
  return {
    calcio: mujer && años > 50 ? 1200 : años > 70 ? 1200 : 1000,
    hierro: mujer && años <= 50 ? 18 : 8,
    potasio: 3500,
    vitc: mujer ? 75 : 90,
    vita: mujer ? 700 : 900,
    vitd: años > 70 ? 20 : 15,
    col: 300,
  };
}

// Semanas que faltan para llegar al peso meta con el ritmo elegido
export function semanasParaMeta(peso, meta, ritmo) {
  if (!meta || !ritmo || Math.abs(peso - meta) < 0.1) return 0;
  return Math.ceil(Math.abs(peso - meta) / ritmo);
}

// ---------- Etiquetado chileno ----------
export function sellos(v, liquido) {
  const lim = liquido ? LIMITES_SELLOS.liquido : LIMITES_SELLOS.solido;
  return Object.keys(lim)
    .filter((k) => v[I[k]] !== null && v[I[k]] !== undefined && v[I[k]] > lim[k])
    .map((k) => ({ clave: k, texto: "ALTO EN " + NOMBRE_SELLO[k] }));
}

// ---------- Frutas y verduras ----------
// Porciones de 80 g (meta: 5 al día). Los jugos cuentan como una porción como máximo.
export function porcionesFyV(entradas) {
  let solidos = 0;
  let jugos = 0;
  for (const e of entradas) {
    if (e.grp !== "fru" && e.grp !== "ver") continue;
    if (e.l) jugos += e.g;
    else solidos += e.g;
  }
  return Math.floor(((solidos + Math.min(jugos, 80)) / 80) * 10) / 10;
}

// ---------- Peso ----------
// Media móvil exponencial: suaviza las subidas y bajadas de un día a otro
export function tendencia(pesos) {
  const ordenados = [...pesos].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  let t = null;
  let anterior = null;
  return ordenados.map((p) => {
    if (t === null) t = p.kg;
    else {
      const dias = Math.max(1, (Date.parse(p.fecha) - Date.parse(anterior)) / 86400000);
      const a = 1 - 0.9 ** dias;
      t = t + a * (p.kg - t);
    }
    anterior = p.fecha;
    return { ...p, t: Math.round(t * 100) / 100 };
  });
}

// Cambio por semana según la tendencia de los últimos días (regresión lineal)
export function cambioSemanal(serie, dias = 28) {
  if (serie.length < 2) return null;
  const fin = Date.parse(serie[serie.length - 1].fecha);
  const puntos = serie.filter((p) => fin - Date.parse(p.fecha) <= dias * 86400000);
  if (puntos.length < 2) return null;
  const xs = puntos.map((p) => (Date.parse(p.fecha) - fin) / 86400000);
  const ys = puntos.map((p) => p.t);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (!den) return null;
  return Math.round((num / den) * 7 * 100) / 100;
}

// ---------- Constancia ----------
// Días seguidos con algo anotado, terminando hoy (o ayer, si hoy aún no anotas)
export function racha(fechas, hoy) {
  const set = new Set(fechas);
  const dia = (iso, n) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  let f = set.has(hoy) ? hoy : dia(hoy, -1);
  let n = 0;
  while (set.has(f)) { n++; f = dia(f, -1); }
  return n;
}

// ---------- Ayuno ----------
export function estadoAyuno(ayuno, ahora) {
  const fin = ayuno.fin || ahora;
  const transcurrido = Math.max(0, fin - ayuno.inicio);
  const meta = (ayuno.horas || 16) * 3600000;
  return { transcurrido, meta, progreso: Math.min(1, transcurrido / meta), cumplido: transcurrido >= meta };
}
