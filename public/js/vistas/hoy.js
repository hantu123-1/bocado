// ============================================================
//  Hoy: calorías y macros del día, agua, frutas y verduras,
//  ayuno en curso y las comidas con lo que anotaste.
// ============================================================
import * as db from "../db.js";
import { esc, num, ICONOS, hoyISO, sumarDias, nombreDia, fechaLarga, toast, uid, horaActual, abrirHoja, confirmar } from "../util.js";
import { COMIDAS, totalesDe, kcalDe, porcionesFyV, I, INFO, referencias, estadoAyuno, edad } from "../nutricion.js";
import { anillo } from "../graficos.js";
import { abrirSelector, nombreComida } from "./selector.js";
import { guardarComida } from "./propios.js";
import { metasActuales, perfil } from "../perfil.js";

let fecha = hoyISO();
let nutrientesAbiertos = false;
export const fechaActual = () => fecha;
export function irAFecha(f) { fecha = f; }

const navegar = (vista) => document.dispatchEvent(new CustomEvent("navegar", { detail: vista }));

function barraMacro(clase, nombre, valor, meta) {
  const pct = meta ? Math.min(100, (valor / meta) * 100) : 0;
  return `<div class="macro ${clase}">
    <div class="macro__texto"><span>${nombre}</span><span><strong>${num(valor)}</strong> / ${num(meta)} g</span></div>
    <div class="barra"><span style="width:${pct.toFixed(1)}%"></span></div></div>`;
}

function textoCantidad(e) {
  if (e.fuente === "rapido") return "Calorías rápidas";
  if (!e.por || e.por === "g" || e.por === "ml") return `${num(e.g)} ${e.por || "g"}`;
  return e.cant === 1 ? e.por : `${num(e.cant, 2)} × ${e.por}`;
}

const mayuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function filaNutriente(k, valor, meta, limite) {
  const pct = meta ? (valor / meta) * 100 : 0;
  const clase = limite && pct > 100 ? " barra--exceso" : "";
  return `<div class="nutriente">
    <div class="nutriente__texto"><span>${INFO[k].nombre}</span>
      <span>${num(valor, INFO[k].dec)} ${INFO[k].unidad}${meta ? ` <small>${limite ? "límite" : "meta"} ${num(meta)} ${INFO[k].unidad}</small>` : ""}</span></div>
    ${meta ? `<div class="barra barra--fina${clase}"><span style="width:${Math.min(100, pct).toFixed(1)}%"></span></div>` : ""}</div>`;
}

export function pintar(raiz) {
  const metas = metasActuales(fecha);
  const entradas = db.todos("entrada").filter((e) => e.fecha === fecha);
  const tot = totalesDe(entradas);
  const kcal = tot[0];
  const restan = metas.kcal - kcal;
  const agua = db.todos("agua").filter((a) => a.fecha === fecha).reduce((s, a) => s + a.ml, 0);
  const fyv = porcionesFyV(entradas);
  const ayuno = db.todos("ayuno").find((a) => !a.fin);
  const p = perfil();
  const ref = referencias(p ? p.sexo : "hombre", p && p.nacimiento ? edad(p.nacimiento, fecha) : 40);
  const esHoy = fecha === hoyISO();

  const comidas = COMIDAS.map((c) => {
    const lista = entradas.filter((e) => e.comida === c.id).sort((a, b) => (a.hora < b.hora ? -1 : 1));
    const total = lista.reduce((s, e) => s + kcalDe(e), 0);
    return `<article class="comida tarjeta">
      <header class="comida__cabecera">
        <h2>${c.nombre}</h2>
        <span class="comida__kcal">${lista.length ? `${num(total)} kcal` : ""}</span>
        <button type="button" class="icono-btn" data-menu-comida="${c.id}" aria-label="Opciones de ${c.nombre}">${ICONOS.puntos}</button>
      </header>
      ${lista.length ? `<ul class="entradas">${lista.map((e) => `<li><button type="button" class="entrada" data-entrada="${esc(e.id)}">
        <span class="entrada__nombre">${esc(e.n)}${e.marca ? ` <small>${esc(e.marca)}</small>` : ""}</span>
        <span class="entrada__detalle">${esc(textoCantidad(e))}</span>
        <span class="entrada__kcal">${num(kcalDe(e))}</span></button></li>`).join("")}</ul>` : ""}
      <button type="button" class="comida__agregar" data-agregar="${c.id}">${ICONOS.mas}Agregar</button>
    </article>`;
  }).join("");

  raiz.innerHTML = `
    <header class="cabecera">
      <button type="button" class="icono-btn" data-dia="-1" aria-label="Día anterior">${ICONOS.izq}</button>
      <label class="cabecera__fecha">
        <strong>${esc(nombreDia(fecha))}</strong><small>${esc(mayuscula(fechaLarga(fecha)))}</small>
        <input type="date" data-fecha value="${fecha}" aria-label="Elegir fecha">
      </label>
      <button type="button" class="icono-btn" data-dia="1" aria-label="Día siguiente">${ICONOS.der}</button>
    </header>
    ${metas.base ? `<button type="button" class="aviso" data-completar-perfil>${ICONOS.info}<span>Completa tu perfil para calcular tus metas. Por ahora se usan 2.000 kcal.</span></button>` : ""}
    ${!esHoy ? `<button type="button" class="aviso aviso--suave" data-ir-hoy>${ICONOS.reloj}<span>Estás viendo ${esc(nombreDia(fecha).toLowerCase())}. Toca para volver a hoy.</span></button>` : ""}

    <section class="resumen tarjeta" aria-label="Resumen del día">
      <div class="resumen__anillo">
        ${anillo(metas.kcal ? kcal / metas.kcal : 0, { clase: restan < 0 ? "anillo--exceso" : "" })}
        <div class="resumen__centro"><strong>${num(kcal)}</strong><span>de ${num(metas.kcal)} kcal</span></div>
      </div>
      <div class="resumen__lado">
        <p class="resumen__restan">${restan >= 0 ? `Te quedan <strong>${num(restan)}</strong> kcal` : `Te pasaste por <strong>${num(-restan)}</strong> kcal`}</p>
        ${barraMacro("m-prot", "Proteínas", tot[I.prot], metas.prot)}
        ${barraMacro("m-carb", "Carbohidratos", tot[I.carb], metas.carb)}
        ${barraMacro("m-gras", "Grasas", tot[I.gras], metas.gras)}
      </div>
    </section>

    <section class="minis">
      <div class="mini tarjeta mini--agua">
        <button type="button" class="mini__cuerpo" data-agua>
          ${ICONOS.gota}<span><strong>${num(agua)}</strong> / ${num(metas.agua)} ml</span><small>Agua</small>
          <span class="barra barra--fina"><span style="width:${Math.min(100, (agua / metas.agua) * 100).toFixed(1)}%"></span></span>
        </button>
        <button type="button" class="mini__mas" data-agua-mas="250" aria-label="Agregar un vaso de agua (250 ml)">${ICONOS.mas}<small>250</small></button>
      </div>
      <div class="mini tarjeta mini--fyv">
        <div class="mini__cuerpo">${ICONOS.hoja}<span><strong>${num(fyv, 1)}</strong> / 5</span><small>Frutas y verduras</small>
          <span class="barra barra--fina"><span style="width:${Math.min(100, (fyv / 5) * 100).toFixed(1)}%"></span></span></div>
      </div>
      ${ayuno && esHoy ? (() => {
        const e = estadoAyuno(ayuno, Date.now());
        return `<button type="button" class="mini tarjeta mini--ayuno" data-ir-ayuno>
          <span class="mini__cuerpo">${ICONOS.reloj}<span><strong>${Math.floor(e.transcurrido / 3600000)} h ${String(Math.floor(e.transcurrido / 60000) % 60).padStart(2, "0")}</strong> / ${ayuno.horas} h</span><small>${e.cumplido ? "Ayuno cumplido" : "Ayuno en curso"}</small>
          <span class="barra barra--fina"><span style="width:${(e.progreso * 100).toFixed(1)}%"></span></span></span></button>`;
      })() : ""}
    </section>

    <section class="comidas">${comidas}</section>

    <details class="tarjeta nutrientes" data-nutrientes${nutrientesAbiertos ? " open" : ""}>
      <summary>Nutrientes del día</summary>
      ${filaNutriente("fibra", tot[I.fibra], metas.fibra)}
      ${filaNutriente("azuc", tot[I.azuc], metas.azuc, true)}
      ${filaNutriente("sat", tot[I.sat], metas.sat, true)}
      ${filaNutriente("sodio", tot[I.sodio], metas.sodio, true)}
      ${filaNutriente("col", tot[I.col], ref.col, true)}
      <h3 class="lista-titulo">Vitaminas y minerales</h3>
      ${["calcio", "hierro", "potasio", "vitc", "vita", "vitd"].map((k) => filaNutriente(k, tot[I[k]], ref[k])).join("")}
      <p class="nota">Los azúcares incluyen los de la fruta y la leche, así que superar un poco el límite no es grave. Vitaminas y minerales: solo cuentan los alimentos que traen ese dato.</p>
    </details>`;

  raiz.querySelector("[data-nutrientes]").addEventListener("toggle", (e) => { nutrientesAbiertos = e.target.open; });
}

// ---------- Agua ----------
export async function sumarAgua(ml, f = fecha) {
  const id = uid();
  await db.guardar("agua", id, { fecha: f, ml, hora: horaActual() });
  toast(`+${num(ml)} ml de agua`, { texto: "Deshacer", alTocar: () => db.borrar("agua", id) });
}

export function hojaAgua(f = fecha) {
  const h = abrirHoja({ titulo: "Agua", clase: "hoja--media" });
  const pintar = () => {
    const metas = metasActuales(f);
    const lista = db.todos("agua").filter((a) => a.fecha === f).sort((a, b) => (a.hora < b.hora ? 1 : -1));
    const total = lista.reduce((s, a) => s + a.ml, 0);
    h.cuerpo.innerHTML = `
      <p class="agua__total"><strong>${num(total)}</strong> de ${num(metas.agua)} ml · ${esc(nombreDia(f))}</p>
      <div class="agua__botones">
        ${[[150, "Taza"], [250, "Vaso"], [500, "Botella"], [1000, "1 litro"]].map(([ml, n]) => `<button type="button" class="btn btn--borde" data-ml="${ml}">${ICONOS.gota}${n}<small>${ml} ml</small></button>`).join("")}
      </div>
      <form class="fila-input" data-otro><input name="ml" inputmode="numeric" placeholder="Otra cantidad (ml)" autocomplete="off"><button class="btn btn--primario" type="submit">Sumar</button></form>
      <ul class="lista-simple">${lista.map((a) => `<li><div class="fila-con-accion"><span>${num(a.ml)} ml <small>${esc(a.hora)}</small></span>
        <button type="button" class="icono-btn" data-quitar="${esc(a.id)}" aria-label="Quitar">${ICONOS.basura}</button></div></li>`).join("")}</ul>
      <p class="nota">Tu meta es de unos 35 ml por kilo de peso. Puedes cambiarla en Más › Mis metas. El café, el té y las agüitas también cuentan.</p>`;
  };
  pintar();
  const quitar = db.alCambiar((t) => { if (t.has("agua")) pintar(); });
  h.hoja.addEventListener("close", quitar);
  h.cuerpo.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.ml) sumarAgua(Number(t.dataset.ml), f);
    if (t.dataset.quitar) db.borrar("agua", t.dataset.quitar);
  });
  h.cuerpo.addEventListener("submit", (e) => {
    e.preventDefault();
    const ml = Math.round(Number(new FormData(e.target).get("ml")));
    if (ml > 0 && ml <= 5000) { sumarAgua(ml, f); e.target.reset(); }
  });
}

// ---------- Opciones de una comida ----------
async function copiarDe(origen, comida) {
  const lista = db.todos("entrada").filter((e) => e.fecha === origen && e.comida === comida);
  const hora = horaActual();
  for (const { id, ...e } of lista) await db.guardar("entrada", uid(), { ...e, fecha, hora });
  toast(`${lista.length} ${lista.length === 1 ? "alimento copiado" : "alimentos copiados"}`);
}

function menuComida(comida) {
  const lista = db.todos("entrada").filter((e) => e.fecha === fecha && e.comida === comida);
  const ayer = sumarDias(fecha, -1);
  const deAyer = db.todos("entrada").filter((e) => e.fecha === ayer && e.comida === comida);
  const nombre = nombreComida(comida);
  const h = abrirHoja({
    titulo: nombre,
    clase: "hoja--chica",
    html: `<div class="menu">
      ${deAyer.length ? `<button type="button" class="menu__item" data-op="ayer">${ICONOS.copiar}Copiar ${nombre.toLowerCase()} de ayer <small>${deAyer.length} alimentos · ${num(deAyer.reduce((s, e) => s + kcalDe(e), 0))} kcal</small></button>` : ""}
      ${lista.length ? `<button type="button" class="menu__item" data-op="guardar">${ICONOS.guardar}Guardar como comida <small>para repetirla con un toque</small></button>` : ""}
      ${lista.length ? `<button type="button" class="menu__item menu__item--peligro" data-op="vaciar">${ICONOS.basura}Eliminar todo lo de ${nombre.toLowerCase()}</button>` : ""}
      ${!lista.length && !deAyer.length ? '<p class="nota">Aún no hay nada que copiar ni guardar en esta comida.</p>' : ""}
    </div>`,
  });
  h.cuerpo.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-op]");
    if (!t) return;
    h.cerrar();
    if (t.dataset.op === "ayer") copiarDe(ayer, comida);
    if (t.dataset.op === "guardar") guardarComida(lista, `Mi ${nombre.toLowerCase()}`);
    if (t.dataset.op === "vaciar" && (await confirmar(`¿Eliminar los ${lista.length} alimentos de ${nombre.toLowerCase()}?`, { si: "Eliminar", peligro: true }))) {
      for (const x of lista) await db.borrar("entrada", x.id);
      toast("Eliminados", { texto: "Deshacer", alTocar: () => lista.forEach((x) => db.guardar("entrada", x.id, x)) });
    }
  });
}

// ---------- Eventos ----------
export function conectar(raiz, { alCambiarFecha, abrirPerfil }) {
  raiz.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.dia) { fecha = sumarDias(fecha, Number(t.dataset.dia)); alCambiarFecha(); }
    else if (t.matches("[data-ir-hoy]")) { fecha = hoyISO(); alCambiarFecha(); }
    else if (t.dataset.agregar) abrirSelector({ fecha, comida: t.dataset.agregar });
    else if (t.dataset.entrada) {
      const entrada = db.obtener("entrada", t.dataset.entrada);
      if (entrada) abrirSelector({ fecha, editar: entrada });
    }
    else if (t.dataset.menuComida) menuComida(t.dataset.menuComida);
    else if (t.dataset.aguaMas) sumarAgua(Number(t.dataset.aguaMas));
    else if (t.matches("[data-agua]")) hojaAgua();
    else if (t.matches("[data-ir-ayuno]")) navegar("ayuno");
    else if (t.matches("[data-completar-perfil]")) abrirPerfil();
  });
  raiz.addEventListener("change", (e) => {
    if (e.target.matches("[data-fecha]") && e.target.value) { fecha = e.target.value; alCambiarFecha(); }
  });
}
