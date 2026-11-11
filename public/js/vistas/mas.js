// ============================================================
//  Más: perfil y metas, recordatorios, tus alimentos y recetas,
//  nube, respaldo y fuentes. También el asistente inicial.
// ============================================================
import * as db from "../db.js";
import * as sync from "../sync.js";
import * as avisos from "../avisos.js";
import { esc, num, ICONOS, abrirHoja, toast, leerNumero, confirmar, hoyISO, sumarDias } from "../util.js";
import { ACTIVIDAD, OBJETIVOS, calcularMetas, perfilCompleto, valores, semanasParaMeta } from "../nutricion.js";
import { perfil, guardarPerfil, metasActuales, pesoActual, RECORDATORIOS_INICIALES } from "../perfil.js";
import { listaAlimentos, listaRecetas, listaComidas } from "./propios.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function textoSync(e) {
  if (!e.clave) return "No conectada: los datos quedan solo en este celular";
  if (e.fase === "sincronizando") return "Sincronizando…";
  if (e.fase === "sin-conexion") return e.pendientes ? `Sin internet · ${e.pendientes} cambios por subir` : "Sin internet";
  if (e.fase === "error") return e.error || "Error al sincronizar";
  if (e.ultimo) return "Al día · " + new Date(e.ultimo).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return "Conectada";
}

export function pintar(raiz) {
  const p = perfil();
  const m = metasActuales();
  const e = sync.obtenerEstado();
  const fila = (accion, icono, titulo, detalle, alerta = false) => `<li><button type="button" class="ajuste" data-abrir="${accion}">
    ${icono}<span><strong>${titulo}</strong><small${alerta ? ' class="alerta"' : ""}>${detalle}</small></span>${ICONOS.der}</button></li>`;
  const r = (p && p.recordatorios) || {};
  const activos = ["comidas", "agua", "peso", "ayuno", "resumen"].filter((k) => r[k] && r[k].activo).length;
  raiz.innerHTML = `<header class="cabecera cabecera--titulo"><h1>Más</h1></header>
    <ul class="ajustes tarjeta">
      ${fila("perfil", ICONOS.ajustes, "Mis metas", perfilCompleto(p) ? `${num(m.kcal)} kcal · ${esc(OBJETIVOS[p.objetivo])}` : "Completa tu perfil", !perfilCompleto(p))}
      ${fila("recordatorios", ICONOS.campana, "Recordatorios", activos ? `${activos} activos` : "Desactivados")}
    </ul>
    <ul class="ajustes tarjeta">
      ${fila("alimentos", ICONOS.caja, "Mis alimentos", `${db.todos("alimento").length} creados · ${db.todos("producto").length} escaneados`)}
      ${fila("recetas", ICONOS.olla, "Recetas", `${db.todos("receta").length} recetas`)}
      ${fila("comidas", ICONOS.plato, "Comidas guardadas", `${db.todos("comida").length} comidas`)}
    </ul>
    <ul class="ajustes tarjeta">
      ${fila("nube", ICONOS.nube, "Nube", esc(textoSync(e)), e.fase === "error")}
      ${fila("respaldo", ICONOS.descargar, "Respaldo y exportar", "Descarga tus datos o pásalos a Excel")}
      ${fila("acerca", ICONOS.info, "Acerca de los datos", "Fuentes, cálculos y avisos")}
    </ul>`;
}

// ---------- Perfil y metas ----------
export function editarPerfil({ asistente = false } = {}) {
  return new Promise((resolver) => {
    const p = perfil() || {};
    const pesoReg = pesoActual();
    const opciones = (obj, actual) => Object.entries(obj).map(([k, v]) => `<label class="opcion"><input type="radio" name="__" value="${k}"${k === actual ? " checked" : ""}><span><strong>${esc(v.nombre || v)}</strong>${v.detalle ? `<small>${esc(v.detalle)}</small>` : ""}</span></label>`).join("");
    const ritmos = (obj) => [0.25, 0.5, 0.75, 1].filter((x) => obj !== "subir" || x <= 0.5)
      .map((x) => `<option value="${x}"${Number(p.ritmo || 0.5) === x ? " selected" : ""}>${num(x, 2)} kg/semana</option>`).join("");
    const m = p.macros || {};
    let guardado = false;
    const h = abrirHoja({
      titulo: asistente ? "Tu perfil" : "Mis metas",
      clase: "hoja--alta",
      alCerrar: () => resolver(guardado),
      html: `<form class="formulario" data-form>
        ${asistente ? '<p class="nota">Con estos datos calculamos cuánto gastas al día y tu meta de calorías, proteínas y agua. Puedes cambiarlos cuando quieras.</p>' : ""}
        <fieldset><legend>Tus datos</legend>
          <div class="segmentado" role="radiogroup" aria-label="Sexo">
            <label><input type="radio" name="sexo" value="mujer"${p.sexo === "mujer" ? " checked" : ""} required> Mujer</label>
            <label><input type="radio" name="sexo" value="hombre"${p.sexo === "hombre" ? " checked" : ""}> Hombre</label>
          </div>
          <div class="fila-2">
            <label>Fecha de nacimiento <input type="date" name="nacimiento" value="${esc(p.nacimiento || "")}" max="${sumarDias(hoyISO(), -365 * 14)}" required></label>
            <label>Estatura (cm) <input name="altura" inputmode="numeric" value="${esc(p.altura || "")}" required autocomplete="off" placeholder="170"></label>
          </div>
          ${pesoReg && db.todos("peso").length
            ? `<p class="nota">Peso actual: <strong>${num(pesoReg, 1)} kg</strong> (tu último pesaje). Para cambiarlo, registra un pesaje en Progreso.</p>`
            : `<label>Peso actual (kg) <input name="peso" inputmode="decimal" value="${pesoReg ? num(pesoReg, 1) : ""}" required autocomplete="off" placeholder="72,5"></label>`}
        </fieldset>
        <fieldset><legend>Actividad física</legend><div class="opciones" data-grupo="actividad">${opciones(ACTIVIDAD, p.actividad || "ligera").replace(/name="__"/g, 'name="actividad"')}</div></fieldset>
        <fieldset><legend>Objetivo</legend>
          <div class="opciones" data-grupo="objetivo">${opciones(OBJETIVOS, p.objetivo || "bajar").replace(/name="__"/g, 'name="objetivo"')}</div>
          <div class="fila-2" data-ritmo>
            <label>Ritmo <select name="ritmo">${ritmos(p.objetivo || "bajar")}</select></label>
            <label>Peso meta (kg) <input name="pesoMeta" inputmode="decimal" value="${p.pesoMeta ? num(p.pesoMeta, 1) : ""}" autocomplete="off"></label>
          </div>
        </fieldset>
        <div class="resultado tarjeta" data-resultado></div>
        <details${p.kcalManual || m.modo === "manual" || p.aguaManual ? " open" : ""}><summary>Ajustes avanzados</summary>
          <label>Meta de calorías a mano (kcal) <input name="kcalManual" inputmode="numeric" value="${esc(p.kcalManual || "")}" placeholder="Automática" autocomplete="off"></label>
          <label class="check"><input type="checkbox" name="macrosManual"${m.modo === "manual" ? " checked" : ""}> Elegir el reparto de macros (%)</label>
          <div class="fila-3" data-macros${m.modo === "manual" ? "" : " hidden"}>
            <label>Proteínas % <input name="mp" inputmode="numeric" value="${m.prot || 25}"></label>
            <label>Carbohidratos % <input name="mc" inputmode="numeric" value="${m.carb || 45}"></label>
            <label>Grasas % <input name="mg" inputmode="numeric" value="${m.gras || 30}"></label>
          </div>
          <label>Meta de agua a mano (ml) <input name="aguaManual" inputmode="numeric" value="${esc(p.aguaManual || "")}" placeholder="Automática" autocomplete="off"></label>
        </details>
        <button type="submit" class="btn btn--primario btn--ancho">${asistente ? "Empezar" : "Guardar"}</button>
      </form>`,
    });
    const form = h.cuerpo.querySelector("[data-form]");
    const leer = () => {
      const f = new FormData(form);
      const objetivo = f.get("objetivo");
      const macrosManual = !!f.get("macrosManual");
      return {
        sexo: f.get("sexo"), nacimiento: f.get("nacimiento"), altura: Math.round(leerNumero(f.get("altura"))),
        peso: f.has("peso") ? leerNumero(f.get("peso")) : pesoReg,
        actividad: f.get("actividad"), objetivo, ritmo: objetivo === "mantener" ? 0 : Number(f.get("ritmo")),
        pesoMeta: leerNumero(f.get("pesoMeta")) > 0 ? leerNumero(f.get("pesoMeta")) : null,
        kcalManual: leerNumero(f.get("kcalManual")) > 0 ? Math.round(leerNumero(f.get("kcalManual"))) : null,
        aguaManual: leerNumero(f.get("aguaManual")) > 0 ? Math.round(leerNumero(f.get("aguaManual"))) : null,
        macros: macrosManual
          ? { modo: "manual", prot: Math.round(leerNumero(f.get("mp"))), carb: Math.round(leerNumero(f.get("mc"))), gras: Math.round(leerNumero(f.get("mg"))) }
          : { modo: "auto" },
      };
    };
    const pintarResultado = () => {
      const d = leer();
      const caja = h.cuerpo.querySelector("[data-resultado]");
      h.cuerpo.querySelector("[data-ritmo]").hidden = d.objetivo === "mantener";
      h.cuerpo.querySelector("[data-macros]").hidden = d.macros.modo !== "manual";
      const sumaMacros = d.macros.modo === "manual" ? d.macros.prot + d.macros.carb + d.macros.gras : 100;
      if (!perfilCompleto(d) || !(d.peso > 0) || !(d.altura > 100)) {
        caja.innerHTML = '<p class="nota">Completa tus datos para ver tus metas.</p>';
        return;
      }
      const r = calcularMetas(d, d.peso, hoyISO());
      const semanas = d.objetivo !== "mantener" && d.pesoMeta ? semanasParaMeta(d.peso, d.pesoMeta, d.ritmo) : 0;
      caja.innerHTML = `<h3>Tus metas diarias</h3>
        <div class="cifras">
          <div><strong>${num(r.kcal)}</strong><span>kcal al día</span></div>
          <div><strong>${num(r.gasto)}</strong><span>kcal que gastas al día</span></div>
          <div><strong>${num(r.tmb)}</strong><span>kcal en reposo</span></div>
        </div>
        <div class="cifras cifras--3">
          <div class="m-prot"><strong>${num(r.prot)} g</strong><span>Proteínas</span></div>
          <div class="m-carb"><strong>${num(r.carb)} g</strong><span>Carbohidratos</span></div>
          <div class="m-gras"><strong>${num(r.gras)} g</strong><span>Grasas</span></div>
        </div>
        <p class="nota">Agua: ${num(r.agua)} ml · Fibra: ${num(r.fibra)} g · IMC: ${num(r.imc, 1)}${semanas ? ` · Llegarías a ${num(d.pesoMeta, 1)} kg en unas ${semanas} semanas` : ""}</p>
        ${sumaMacros !== 100 ? `<p class="alerta">Los porcentajes de macros suman ${sumaMacros} %: deben sumar 100 %. Mientras tanto se usa el reparto automático.</p>` : ""}
        ${r.limitada ? `<p class="alerta">Con ese ritmo la meta quedaba muy baja, así que se dejó en ${num(r.kcal)} kcal, el mínimo recomendado. Si quieres bajar más rápido, consúltalo con un profesional.</p>` : ""}`;
    };
    form.addEventListener("input", pintarResultado);
    form.addEventListener("change", (e) => {
      if (e.target.name === "objetivo") {
        const sel = form.querySelector("[name=ritmo]");
        const actual = Number(sel.value);
        sel.innerHTML = ritmos(e.target.value);
        if ([...sel.options].some((o) => Number(o.value) === actual)) sel.value = String(actual);
        pintarResultado();
      }
    });
    pintarResultado();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = leer();
      if (!(d.altura >= 100 && d.altura <= 250)) { toast("Revisa tu estatura (en centímetros)"); return; }
      if (!(d.peso >= 20 && d.peso <= 400)) { toast("Revisa tu peso"); return; }
      const { peso, ...resto } = d;
      if (resto.macros.modo === "manual" && resto.macros.prot + resto.macros.carb + resto.macros.gras !== 100) resto.macros = { modo: "auto" };
      if (!db.todos("peso").length) {
        resto.pesoInicial = Math.round(peso * 10) / 10;
        await db.guardar("peso", hoyISO(), { fecha: hoyISO(), kg: resto.pesoInicial });
      }
      await guardarPerfil(resto);
      guardado = true;
      toast(asistente ? "¡Listo! Ya puedes anotar lo que comes" : "Metas guardadas");
      h.cerrar();
    });
  });
}

// ---------- Recordatorios ----------
function hojaRecordatorios() {
  const h = abrirHoja({ titulo: "Recordatorios", clase: "hoja--alta" });
  const pintar = () => {
    const p = perfil() || {};
    const r = { ...RECORDATORIOS_INICIALES, ...(p.recordatorios || {}) };
    const permiso = avisos.estadoPermiso();
    let estado;
    if (!sync.clave()) estado = `<p class="alerta">Los recordatorios los envía la nube: primero conéctala en Más › Nube.</p>`;
    else if (permiso === "instalar") estado = `<p class="alerta">En el iPhone, los avisos solo llegan con la app instalada: en Safari toca Compartir y luego «Agregar a inicio». Después ábrela desde ese ícono.</p>`;
    else if (permiso === "no-soportado") estado = `<p class="alerta">Este navegador no puede recibir avisos.</p>`;
    else if (permiso === "denied") estado = `<p class="alerta">Los avisos están bloqueados. Actívalos en Ajustes › Notificaciones › Bocado.</p>`;
    else if (permiso === "default") estado = `<button type="button" class="btn btn--primario btn--ancho" data-activar>${ICONOS.campana}Activar avisos en este celular</button>`;
    else estado = `<p class="ok">Avisos activados en este celular ✓</p><button type="button" class="btn btn--borde btn--ancho" data-probar>Enviar un aviso de prueba</button>`;
    const interruptor = (k, titulo, detalle) => `<label class="interruptor"><span><strong>${titulo}</strong><small>${detalle}</small></span>
      <input type="checkbox" data-activo="${k}"${r[k].activo ? " checked" : ""}><span class="interruptor__pista" aria-hidden="true"></span></label>`;
    h.cuerpo.innerHTML = `${estado}
      <form class="formulario" data-form>
        <fieldset>${interruptor("comidas", "Comidas", "Si llega la hora y aún no anotas esa comida")}
          <div class="fila-2"${r.comidas.activo ? "" : " hidden"}>${["desayuno", "almuerzo", "once", "cena"].map((c) => `<label>${c[0].toUpperCase() + c.slice(1)}<input type="time" data-comida-hora="${c}" value="${esc(r.comidas.horas[c] || "")}"></label>`).join("")}</div>
        </fieldset>
        <fieldset>${interruptor("agua", "Agua", "Solo si vas atrasado con tu meta del día")}
          <div class="fila-3"${r.agua.activo ? "" : " hidden"}>
            <label>Cada <select data-agua="cadaHoras">${[1, 2, 3].map((x) => `<option value="${x}"${Number(r.agua.cadaHoras) === x ? " selected" : ""}>${x} ${x === 1 ? "hora" : "horas"}</option>`).join("")}</select></label>
            <label>Desde <input type="time" data-agua="desde" value="${esc(r.agua.desde)}"></label>
            <label>Hasta <input type="time" data-agua="hasta" value="${esc(r.agua.hasta)}"></label>
          </div>
        </fieldset>
        <fieldset>${interruptor("peso", "Pesarte", "Una vez por semana, si ese día no te has pesado")}
          <div class="fila-2"${r.peso.activo ? "" : " hidden"}>
            <label>Día <select data-peso="dia">${DIAS.map((d, i) => `<option value="${i}"${Number(r.peso.dia) === i ? " selected" : ""}>${d}</option>`).join("")}</select></label>
            <label>Hora <input type="time" data-peso="hora" value="${esc(r.peso.hora)}"></label>
          </div>
        </fieldset>
        <fieldset>${interruptor("ayuno", "Ayuno cumplido", "Cuando llegas a las horas de tu ayuno")}</fieldset>
        <fieldset>${interruptor("resumen", "Resumen del día", "Calorías, proteína y agua del día")}
          <div class="fila-2"${r.resumen.activo ? "" : " hidden"}><label>Hora <input type="time" data-resumen="hora" value="${esc(r.resumen.hora)}"></label></div>
        </fieldset>
      </form>
      <p class="nota">Los avisos pueden llegar hasta 5 minutos después de la hora elegida.</p>`;
  };
  const guardar = async () => {
    const p = perfil() || {};
    const r = JSON.parse(JSON.stringify({ ...RECORDATORIOS_INICIALES, ...(p.recordatorios || {}) }));
    h.cuerpo.querySelectorAll("[data-activo]").forEach((x) => { r[x.dataset.activo].activo = x.checked; });
    h.cuerpo.querySelectorAll("[data-comida-hora]").forEach((x) => { r.comidas.horas[x.dataset.comidaHora] = x.value; });
    h.cuerpo.querySelectorAll("[data-agua]").forEach((x) => { r.agua[x.dataset.agua] = x.dataset.agua === "cadaHoras" ? Number(x.value) : x.value; });
    h.cuerpo.querySelectorAll("[data-peso]").forEach((x) => { r.peso[x.dataset.peso] = x.dataset.peso === "dia" ? Number(x.value) : x.value; });
    h.cuerpo.querySelectorAll("[data-resumen]").forEach((x) => { r.resumen[x.dataset.resumen] = x.value; });
    await guardarPerfil({ recordatorios: r });
  };
  pintar();
  h.cuerpo.addEventListener("change", async (e) => {
    if (e.target.matches("[data-activo]")) {
      const extra = e.target.closest("fieldset").querySelector("div");
      if (extra) extra.hidden = !e.target.checked;
    }
    await guardar();
  });
  h.cuerpo.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    try {
      if (t.matches("[data-activar]")) {
        if (await avisos.activar()) toast("Avisos activados ✓");
        pintar();
      }
      if (t.matches("[data-probar]")) {
        const r = await avisos.probar();
        if (r.error) toast(r.error);
        else if (!r.dispositivos) toast("Ningún dispositivo tiene los avisos activados.");
        else toast(`Aviso enviado a ${r.enviados} de ${r.dispositivos} ${r.dispositivos === 1 ? "dispositivo" : "dispositivos"}`);
      }
    } catch (err) {
      toast("No se pudo: " + err.message);
    }
  });
}

// ---------- Nube ----------
export function hojaNube({ asistente = false } = {}) {
  return new Promise((resolver) => {
    let conectada = false;
    const h = abrirHoja({ titulo: "Nube", clase: "hoja--media", alCerrar: () => resolver(conectada) });
    const pintar = () => {
      const e = sync.obtenerEstado();
      h.cuerpo.innerHTML = e.clave
        ? `<p class="estado-nube">${ICONOS.nube}<span><strong>Conectada</strong><small>${esc(textoSync(e))}</small></span></p>
           <p class="nota">Tus datos se guardan en este celular y se copian a tu nube (Cloudflare). Si cambias de celular o abres la app en el computador, escribe la misma clave y aparecerá todo.</p>
           <button type="button" class="btn btn--primario btn--ancho" data-ahora>${ICONOS.sincronizar}Sincronizar ahora</button>
           <button type="button" class="btn btn--texto-peligro btn--ancho" data-salir>Desconectar este celular</button>`
        : `<form class="formulario" data-form>
             <p class="nota">${asistente ? "Si ya usas Bocado en otro dispositivo, escribe tu clave y se traerán tus datos. " : ""}Con la nube conectada, tus datos quedan respaldados y llegan los recordatorios y la búsqueda de productos envasados.</p>
             <label>Clave de la nube <input name="clave" type="password" autocomplete="current-password" required enterkeyhint="go"></label>
             <p class="error" data-error role="alert">${e.fase === "error" ? esc(e.error) : ""}</p>
             <button type="submit" class="btn btn--primario btn--ancho">Conectar</button>
             ${asistente ? '<button type="button" class="btn btn--texto btn--ancho" data-cerrar>Ahora no (usar solo en este celular)</button>' : ""}
           </form>`;
    };
    pintar();
    const quitar = sync.alCambiarEstado(() => { if (!h.cuerpo.querySelector("input")) pintar(); });
    h.hoja.addEventListener("close", quitar);
    h.cuerpo.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      const error = h.cuerpo.querySelector("[data-error]");
      btn.disabled = true;
      error.textContent = "";
      try {
        await sync.probarClave(String(new FormData(e.target).get("clave")).trim());
        conectada = true;
        toast("Nube conectada ✓");
        if (asistente) h.cerrar(); else pintar();
      } catch (err) {
        error.textContent = err instanceof TypeError ? "Sin conexión. Revisa tu internet." : err.message;
      } finally {
        btn.disabled = false;
      }
    });
    h.cuerpo.addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.matches("[data-ahora]")) sync.sincronizar();
      if (t.matches("[data-salir]")) {
        const pendientes = db.pendientes().length;
        const texto = pendientes
          ? `Hay ${pendientes} cambios que aún no se suben. Si desconectas, quedarán solo en este celular. ¿Desconectar?`
          : "¿Desconectar este celular de la nube? Tus datos siguen aquí y en la nube.";
        if (await confirmar(texto, { si: "Desconectar", peligro: true })) { await sync.olvidarClave(); pintar(); }
      }
    });
  });
}

// ---------- Respaldo ----------
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const celda = (v) => {
  const s = typeof v === "number" ? v.toLocaleString("es-CL", { maximumFractionDigits: 1, useGrouping: false }) : String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (filas) => "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n");

function hojaRespaldo() {
  const h = abrirHoja({
    titulo: "Respaldo y exportar",
    clase: "hoja--media",
    html: `<div class="menu">
      <button type="button" class="menu__item" data-op="json">${ICONOS.descargar}Descargar respaldo completo <small>Un archivo con todo (para guardarlo o restaurarlo)</small></button>
      <label class="menu__item">${ICONOS.subir}Restaurar un respaldo <small>Suma los datos del archivo a los de ahora</small><input type="file" accept="application/json,.json" hidden data-restaurar></label>
      <button type="button" class="menu__item" data-op="diario">${ICONOS.descargar}Diario de comidas para Excel <small>Una fila por alimento anotado</small></button>
      <button type="button" class="menu__item" data-op="peso">${ICONOS.descargar}Pesos y medidas para Excel</button>
    </div>`,
  });
  h.cuerpo.addEventListener("click", (e) => {
    const t = e.target.closest("[data-op]");
    if (!t) return;
    const hoy = hoyISO();
    if (t.dataset.op === "json") {
      descargar(`bocado-respaldo-${hoy}.json`, JSON.stringify({ app: "bocado", version: 1, fecha: new Date().toISOString(), registros: db.exportar() }), "application/json");
    }
    if (t.dataset.op === "diario") {
      const filas = db.todos("entrada").sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? -1 : 1)).map((x) => {
        const v = valores(x.v, x.g);
        return [x.fecha, x.hora, x.comida, x.n, x.marca, x.por === "g" || x.por === "ml" ? `${x.g} ${x.por}` : `${x.cant} × ${x.por}`, x.g, v[0], v[1], v[2], v[3], v[4], v[5], v[6]];
      });
      descargar(`bocado-diario-${hoy}.csv`, csv([["Fecha", "Hora", "Comida", "Alimento", "Marca", "Cantidad", "Gramos", "kcal", "Proteínas (g)", "Carbohidratos (g)", "Grasas (g)", "Fibra (g)", "Azúcares (g)", "Sodio (mg)"], ...filas]), "text/csv");
    }
    if (t.dataset.op === "peso") {
      const filas = db.todos("peso").sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
        .map((x) => [x.fecha, x.kg, x.grasa, x.cintura, x.cadera, x.cuello, x.pecho, x.brazo, x.muslo, x.nota]);
      descargar(`bocado-peso-${hoy}.csv`, csv([["Fecha", "Peso (kg)", "Grasa (%)", "Cintura", "Cadera", "Cuello", "Pecho", "Brazo", "Muslo", "Nota"], ...filas]), "text/csv");
    }
  });
  h.cuerpo.querySelector("[data-restaurar]").addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try {
      const d = JSON.parse(await archivo.text());
      if (d.app !== "bocado" || !Array.isArray(d.registros)) throw new Error("formato");
      if (!(await confirmar(`El respaldo tiene ${d.registros.length} registros. ¿Restaurarlo?`, { si: "Restaurar" }))) return;
      const n = await db.importar(d.registros);
      toast(`${n} registros restaurados`);
      h.cerrar();
    } catch (err) {
      toast("Ese archivo no es un respaldo de Bocado");
    }
  });
}

// ---------- Acerca de ----------
function hojaAcerca() {
  abrirHoja({
    titulo: "Acerca de los datos",
    clase: "hoja--alta",
    html: `<div class="texto-largo">
      <h3>De dónde salen los valores</h3>
      <p><strong>Alimentos de la base:</strong> USDA FoodData Central, SR Legacy (Departamento de Agricultura de EE. UU.), de dominio público. Los nombres están adaptados a Chile; los marcados «aprox.» no están en el USDA y usan el alimento más parecido (por ejemplo, la hallulla usa el pan de mesa).</p>
      <p><strong>Productos envasados:</strong> Open Food Facts, una base abierta hecha por voluntarios, con licencia ODbL. Puede tener errores: si algo no cuadra con la etiqueta, créalo como alimento propio.</p>
      <p><strong>Pesos de las porciones:</strong> del USDA. Las porciones chilenas (marraqueta, hallulla, sopaipilla) son aproximadas: si puedes, pesa.</p>
      <h3>Cómo se calculan tus metas</h3>
      <p>Gasto en reposo con la fórmula de Mifflin-St Jeor, multiplicado por tu nivel de actividad. Para bajar o subir se restan o suman unas 7.700 kcal por kilo, repartidas por semana. Para bajar, la meta no baja de 1.200 kcal (mujer) o 1.500 kcal (hombre).</p>
      <p>Proteínas: 1,8 g por kilo si quieres bajar o subir, 1,4 g si quieres mantener (con un IMC de 30 o más se usa el peso que daría un IMC de 25). Grasas: 30 % de las calorías. Carbohidratos: el resto. Agua: unos 35 ml por kilo.</p>
      <p>Límites: sodio menos de 2.000 mg y azúcares y grasas saturadas menos del 10 % de las calorías (recomendaciones de la OMS). Los sellos «ALTO EN» usan los límites de la Ley 20.606 por 100 g o 100 ml.</p>
      <h3>Importante</h3>
      <p>Esta app es una ayuda para conocer lo que comes. No reemplaza a un nutricionista ni a un médico, sobre todo si tienes una enfermedad, estás embarazada o tomas medicamentos.</p>
    </div>`,
  });
}

export function conectar(raiz) {
  raiz.addEventListener("click", (e) => {
    const t = e.target.closest("[data-abrir]");
    if (!t) return;
    const a = t.dataset.abrir;
    if (a === "perfil") editarPerfil();
    if (a === "recordatorios") hojaRecordatorios();
    if (a === "alimentos") listaAlimentos();
    if (a === "recetas") listaRecetas();
    if (a === "comidas") listaComidas();
    if (a === "nube") hojaNube();
    if (a === "respaldo") hojaRespaldo();
    if (a === "acerca") hojaAcerca();
  });
}
