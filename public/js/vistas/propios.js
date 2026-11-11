// ============================================================
//  Tus alimentos (con los datos de la etiqueta), tus recetas
//  y las comidas guardadas para repetir con un toque.
// ============================================================
import * as db from "../db.js";
import * as A from "../alimentos.js";
import { abrirHoja, esc, num, ICONOS, toast, leerNumero, uid, confirmar } from "../util.js";
import { valores, sellos, sumar, kcalDe, NUT } from "../nutricion.js";
import { abrirSelector, tablaNutrientes } from "./selector.js";

const CAMPOS = [
  ["kcal", "Energía (kcal)", true],
  ["prot", "Proteínas (g)"],
  ["gras", "Grasas totales (g)"],
  ["sat", "Grasas saturadas (g)"],
  ["carb", "Hidratos de carbono disponibles (g)"],
  ["azuc", "Azúcares totales (g)"],
  ["fibra", "Fibra dietética (g)"],
  ["sodio", "Sodio (mg)"],
];

// ---------- Tus alimentos ----------
// Devuelve el alimento guardado (o null si se cancela)
export function editarAlimento(existente, inicial = {}) {
  return new Promise((resolver) => {
    const a = existente || { n: inicial.n || "", marca: inicial.marca || "", codigo: inicial.codigo || "", g: "otr", v: new Array(15).fill(null), p: [], l: 0 };
    let resultado = null;
    const grupos = Object.entries(A.GRUPOS).filter(([k]) => k !== "rec")
      .map(([k, n]) => `<option value="${k}"${k === a.g ? " selected" : ""}>${n}</option>`).join("");
    const p = a.p || [];
    const h = abrirHoja({
      titulo: existente ? "Editar alimento" : "Crear alimento",
      clase: "hoja--alta",
      alCerrar: () => resolver(resultado),
      html: `<form class="formulario" data-form>
        <label>Nombre <input name="n" required value="${esc(a.n)}" autocomplete="off" placeholder="Ej.: Yogur proteico frutilla"></label>
        <div class="fila-2">
          <label>Marca <input name="marca" value="${esc(a.marca || "")}" autocomplete="off"></label>
          <label>Código de barras <input name="codigo" inputmode="numeric" value="${esc(a.codigo || "")}" autocomplete="off"></label>
        </div>
        <div class="fila-2">
          <label>Grupo <select name="g">${grupos}</select></label>
          <label class="check"><input type="checkbox" name="l"${a.l ? " checked" : ""}> Es líquido (ml)</label>
        </div>
        <fieldset>
          <legend>Información nutricional</legend>
          <p class="nota">Cópiala de la etiqueta. En Chile la etiqueta trae una columna «100 g» (o 100 ml): usa esa.</p>
          <div class="segmentado" role="radiogroup">
            <label><input type="radio" name="base" value="100" checked> Por 100 g/ml</label>
            <label><input type="radio" name="base" value="porcion"> Por porción</label>
          </div>
          <label data-porcion-base hidden>La porción pesa (g o ml) <input name="baseG" inputmode="decimal" autocomplete="off"></label>
          <div class="fila-2">
            ${CAMPOS.map(([k, n, req]) => `<label>${n}<input name="${k}" inputmode="decimal" autocomplete="off"${req ? " required" : ""} value="${a.v[NUT.indexOf(k)] ?? ""}"></label>`).join("")}
          </div>
          <div data-sellos></div>
        </fieldset>
        <fieldset>
          <legend>Porción habitual (opcional)</legend>
          <div class="fila-2">
            <label>Nombre <input name="pn" value="${esc(p[0] ? p[0][0] : "")}" placeholder="1 barra, 1 pote…" autocomplete="off"></label>
            <label>Gramos o ml <input name="pg" inputmode="decimal" value="${p[0] ? p[0][1] : ""}" autocomplete="off"></label>
          </div>
        </fieldset>
        <button type="submit" class="btn btn--primario btn--ancho">Guardar</button>
        ${existente ? `<button type="button" class="btn btn--texto-peligro btn--ancho" data-borrar>${ICONOS.basura}Eliminar alimento</button>` : ""}
      </form>`,
    });
    const form = h.cuerpo.querySelector("[data-form]");
    const leer = () => {
      const f = new FormData(form);
      const porPorcion = f.get("base") === "porcion";
      const baseG = leerNumero(f.get("baseG"));
      const factor = porPorcion ? (baseG > 0 ? 100 / baseG : NaN) : 1;
      const v = new Array(15).fill(null);
      for (const [k] of CAMPOS) {
        const x = leerNumero(f.get(k));
        if (String(f.get(k)).trim() !== "" && x >= 0) v[NUT.indexOf(k)] = Math.round(x * factor * 10) / 10;
      }
      return { f, v, porPorcion, baseG };
    };
    const pintarSellos = () => {
      const { f, v } = leer();
      const ss = sellos(v, !!f.get("l"));
      h.cuerpo.querySelector("[data-sellos]").innerHTML = ss.length
        ? `<div class="sellos">${ss.map((s) => `<span class="sello"><small>ALTO EN</small>${esc(s.texto.slice(8))}</span>`).join("")}</div>` : "";
    };
    form.addEventListener("input", () => {
      h.cuerpo.querySelector("[data-porcion-base]").hidden = new FormData(form).get("base") !== "porcion";
      pintarSellos();
    });
    pintarSellos();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { f, v, porPorcion, baseG } = leer();
      if (porPorcion && !(baseG > 0)) { toast("Escribe cuánto pesa la porción"); return; }
      if (v[0] === null) { toast("Faltan las calorías"); return; }
      const pg = leerNumero(f.get("pg"));
      const porciones = [];
      if (String(f.get("pn")).trim() && pg > 0) porciones.push([String(f.get("pn")).trim(), pg]);
      else if (porPorcion) porciones.push(["1 porción", baseG]);
      const codigo = String(f.get("codigo") || "").replace(/\D/g, "");
      const datos = {
        n: String(f.get("n")).trim(), marca: String(f.get("marca") || "").trim(), codigo,
        g: f.get("g"), l: f.get("l") ? 1 : 0, v, p: porciones, creado: a.creado || Date.now(),
      };
      resultado = await db.guardar("alimento", existente ? existente.id : uid(), datos);
      toast("Alimento guardado");
      h.cerrar();
    });
    const borrar = h.cuerpo.querySelector("[data-borrar]");
    if (borrar) borrar.onclick = async () => {
      if (!(await confirmar(`¿Eliminar «${a.n}»? Lo que ya anotaste no cambia.`, { si: "Eliminar", peligro: true }))) return;
      await db.borrar("alimento", existente.id);
      h.cerrar();
    };
  });
}

export function listaAlimentos() {
  const h = abrirHoja({ titulo: "Mis alimentos", clase: "hoja--alta" });
  const pintar = () => {
    const propios = db.todos("alimento").sort((a, b) => a.n.localeCompare(b.n, "es"));
    const productos = db.todos("producto").sort((a, b) => a.n.localeCompare(b.n, "es"));
    h.cuerpo.innerHTML = `
      <button type="button" class="btn btn--primario btn--ancho" data-nuevo>${ICONOS.mas}Crear alimento</button>
      <h3 class="lista-titulo">Creados por ti</h3>
      <ul class="lista-simple">${propios.map((a) => `<li><button type="button" data-editar="${esc(a.id)}">
        <span>${esc(a.n)}${a.marca ? ` <small>${esc(a.marca)}</small>` : ""}</span><span class="dato">${num(a.v[0])} kcal/100</span></button></li>`).join("") ||
        '<li class="vacio-chico">Aún no creas alimentos. Sirve para productos que no están en la base: copias la etiqueta una vez.</li>'}</ul>
      <h3 class="lista-titulo">Productos escaneados</h3>
      <ul class="lista-simple">${productos.map((p) => `<li><div class="fila-con-accion"><span>${esc(p.n)}${p.marca ? ` <small>${esc(p.marca)}</small>` : ""}</span>
        <button type="button" class="icono-btn" data-olvidar="${esc(p.codigo)}" aria-label="Quitar">${ICONOS.basura}</button></div></li>`).join("") ||
        '<li class="vacio-chico">Los productos que escanees quedan aquí, para usarlos sin internet.</li>'}</ul>`;
  };
  pintar();
  const quitar = db.alCambiar((tipos) => { if (tipos.has("alimento") || tipos.has("producto")) pintar(); });
  h.hoja.addEventListener("close", quitar);
  h.cuerpo.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("[data-nuevo]")) editarAlimento(null);
    if (t.matches("[data-editar]")) editarAlimento(db.obtener("alimento", t.dataset.editar));
    if (t.matches("[data-olvidar]")) {
      if (await confirmar("¿Quitar este producto de tu lista? Lo que ya anotaste no cambia.", { si: "Quitar", peligro: true })) db.borrar("producto", t.dataset.olvidar);
    }
  });
}

// ---------- Recetas ----------
export function editarReceta(existente) {
  const r = existente
    ? { ...existente, ingredientes: [...(existente.ingredientes || [])] }
    : { n: "", porciones: 4, ingredientes: [], pesoFinal: "" };
  const h = abrirHoja({ titulo: existente ? "Editar receta" : "Nueva receta", clase: "hoja--alta" });
  const pintar = () => {
    const total = sumar(r.ingredientes.map((i) => valores(i.v, i.g)));
    const porciones = Math.max(1, Number(r.porciones) || 1);
    const crudo = r.ingredientes.reduce((s, i) => s + i.g, 0);
    h.cuerpo.innerHTML = `<form class="formulario" data-form>
      <label>Nombre <input name="n" required value="${esc(r.n)}" placeholder="Ej.: Porotos con riendas" autocomplete="off"></label>
      <div class="fila-2">
        <label>¿Para cuántas porciones? <input name="porciones" inputmode="numeric" value="${esc(r.porciones)}" required></label>
        <label>Peso final cocido (g, opcional) <input name="pesoFinal" inputmode="decimal" value="${esc(r.pesoFinal || "")}" placeholder="${num(crudo)}"></label>
      </div>
      <p class="nota">El peso final es opcional: si pesas la olla al terminar (sin la olla), la app puede calcular cuánto es una porción en gramos.</p>
      <h3 class="lista-titulo">Ingredientes</h3>
      <ul class="lista-simple">${r.ingredientes.map((i, n) => `<li><div class="fila-con-accion">
        <span>${esc(i.n)} <small>${i.por === "g" || i.por === "ml" ? `${num(i.g)} ${i.por}` : `${num(i.cant, 2)} × ${esc(i.por)} (${num(i.g)} g)`}</small></span>
        <span class="dato">${num(kcalDe(i))} kcal</span>
        <button type="button" class="icono-btn" data-quitar="${n}" aria-label="Quitar">${ICONOS.basura}</button></div></li>`).join("") ||
        '<li class="vacio-chico">Agrega los ingredientes crudos, con la cantidad que usas para toda la receta.</li>'}</ul>
      <button type="button" class="btn btn--borde btn--ancho" data-ingrediente>${ICONOS.mas}Agregar ingrediente</button>
      ${r.ingredientes.length ? `<h3 class="lista-titulo">Una porción</h3>${tablaNutrientes(total.map((x) => x / porciones))}` : ""}
      <button type="submit" class="btn btn--primario btn--ancho">Guardar receta</button>
      ${existente ? `<button type="button" class="btn btn--texto-peligro btn--ancho" data-borrar>${ICONOS.basura}Eliminar receta</button>` : ""}
    </form>`;
  };
  const leerForm = () => {
    const f = new FormData(h.cuerpo.querySelector("[data-form]"));
    r.n = String(f.get("n") || "");
    r.porciones = f.get("porciones");
    r.pesoFinal = f.get("pesoFinal");
  };
  pintar();
  h.cuerpo.addEventListener("input", (e) => { if (e.target.name === "porciones") { leerForm(); pintar(); h.cuerpo.querySelector("[name=porciones]").focus(); } });
  h.cuerpo.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("[data-ingrediente]")) {
      leerForm();
      abrirSelector({ modo: "ingrediente", alElegir: (i) => { r.ingredientes.push(i); pintar(); } });
    }
    if (t.matches("[data-quitar]")) { leerForm(); r.ingredientes.splice(Number(t.dataset.quitar), 1); pintar(); }
    if (t.matches("[data-borrar]")) {
      if (!(await confirmar(`¿Eliminar la receta «${r.n}»? Lo que ya anotaste no cambia.`, { si: "Eliminar", peligro: true }))) return;
      await db.borrar("receta", existente.id);
      h.cerrar();
    }
  });
  h.cuerpo.addEventListener("submit", async (e) => {
    e.preventDefault();
    leerForm();
    const porciones = Math.round(leerNumero(r.porciones));
    if (!r.n.trim() || !(porciones >= 1)) { toast("Faltan el nombre o las porciones"); return; }
    if (!r.ingredientes.length) { toast("Agrega al menos un ingrediente"); return; }
    const pesoFinal = leerNumero(r.pesoFinal);
    await db.guardar("receta", existente ? existente.id : uid(), {
      n: r.n.trim(), porciones, pesoFinal: pesoFinal > 0 ? pesoFinal : null, ingredientes: r.ingredientes,
    });
    toast("Receta guardada");
    h.cerrar();
  });
}

export function listaRecetas() {
  const h = abrirHoja({ titulo: "Recetas", clase: "hoja--alta" });
  const pintar = () => {
    const recetas = db.todos("receta").sort((a, b) => a.n.localeCompare(b.n, "es"));
    h.cuerpo.innerHTML = `<button type="button" class="btn btn--primario btn--ancho" data-nueva>${ICONOS.mas}Nueva receta</button>
      <ul class="lista-simple">${recetas.map((r) => {
        const a = A.desdeReceta(r);
        return `<li><button type="button" data-editar="${esc(r.id)}"><span>${esc(r.n)} <small>${r.porciones} porciones · ${r.ingredientes.length} ingredientes</small></span>
          <span class="dato">${num((a.v[0] * a.p[0][1]) / 100)} kcal/porción</span></button></li>`;
      }).join("") || '<li class="vacio-chico">Tus platos de siempre (cazuela, porotos, queque…): sumas los ingredientes una vez y después anotas porciones.</li>'}</ul>`;
  };
  pintar();
  const quitar = db.alCambiar((tipos) => { if (tipos.has("receta")) pintar(); });
  h.hoja.addEventListener("close", quitar);
  h.cuerpo.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("[data-nueva]")) editarReceta(null);
    if (t.matches("[data-editar]")) editarReceta(db.obtener("receta", t.dataset.editar));
  });
}

// ---------- Comidas guardadas ----------
export function guardarComida(entradas, sugerido) {
  const h = abrirHoja({
    titulo: "Guardar como comida",
    clase: "hoja--chica",
    html: `<form class="formulario" data-form>
      <p class="nota">${entradas.length} ${entradas.length === 1 ? "alimento" : "alimentos"}: ${esc(entradas.map((e) => e.n).join(", "))}</p>
      <label>Nombre <input name="n" required value="${esc(sugerido)}" autocomplete="off"></label>
      <button type="submit" class="btn btn--primario btn--ancho">Guardar</button></form>`,
  });
  h.cuerpo.querySelector("[data-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = String(new FormData(e.target).get("n")).trim();
    const items = entradas.map(({ id, fecha, comida, hora, ...resto }) => resto);
    await db.guardar("comida", uid(), { n, items });
    toast("Comida guardada. La encuentras en Agregar › Comidas");
    h.cerrar();
  });
}

export function listaComidas() {
  const h = abrirHoja({ titulo: "Comidas guardadas", clase: "hoja--alta" });
  const pintar = () => {
    const comidas = db.todos("comida").sort((a, b) => a.n.localeCompare(b.n, "es"));
    h.cuerpo.innerHTML = `<ul class="lista-simple">${comidas.map((c) => `<li><div class="fila-con-accion">
        <span>${esc(c.n)} <small>${esc(c.items.map((x) => x.n).join(", "))}</small></span>
        <span class="dato">${num(c.items.reduce((s, x) => s + kcalDe(x), 0))} kcal</span>
        <button type="button" class="icono-btn" data-borrar="${esc(c.id)}" aria-label="Eliminar">${ICONOS.basura}</button></div></li>`).join("") ||
      '<li class="vacio-chico">En el diario, toca ··· en una comida y elige «Guardar como comida». Sirve para tu desayuno de siempre.</li>'}</ul>`;
  };
  pintar();
  const quitar = db.alCambiar((tipos) => { if (tipos.has("comida")) pintar(); });
  h.hoja.addEventListener("close", quitar);
  h.cuerpo.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-borrar]");
    if (t && (await confirmar("¿Eliminar esta comida guardada?", { si: "Eliminar", peligro: true }))) db.borrar("comida", t.dataset.borrar);
  });
}
