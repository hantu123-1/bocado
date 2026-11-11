// ============================================================
//  Ayuno intermitente: cronómetro, protocolos (16:8, 18:6…),
//  historial y aviso al cumplir la meta.
// ============================================================
import * as db from "../db.js";
import { esc, ICONOS, uid, toast, abrirHoja, confirmar, duracion, fechaCorta, hoyISO } from "../util.js";
import { PROTOCOLOS, estadoAyuno } from "../nutricion.js";
import { anillo } from "../graficos.js";
import { perfil, guardarPerfil } from "../perfil.js";

const activo = () => db.todos("ayuno").find((a) => !a.fin);
const horasElegidas = () => (perfil() && perfil().ayunoHoras) || 16;

function reloj(ms) {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
}

function hora(ms) {
  const d = new Date(ms);
  const dia = hoyISO(d) === hoyISO() ? "hoy" : hoyISO(d) === hoyISO(new Date(Date.now() + 86400000)) ? "mañana" : d.toLocaleDateString("es-CL", { weekday: "long" });
  return `${d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} (${dia})`;
}

const aLocal = (ms) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export function pintar(raiz) {
  const a = activo();
  const historial = db.todos("ayuno").filter((x) => x.fin).sort((x, y) => y.inicio - x.inicio);
  const semana = historial.filter((x) => x.inicio > Date.now() - 7 * 86400000);
  const cumplidos = semana.filter((x) => estadoAyuno(x).cumplido).length;
  const promedio = semana.length ? semana.reduce((s, x) => s + (x.fin - x.inicio), 0) / semana.length : 0;
  const masLargo = historial.reduce((m, x) => Math.max(m, x.fin - x.inicio), 0);
  const elegido = a ? a.horas : horasElegidas();
  const protocolos = PROTOCOLOS.map((p) => `<button type="button" role="radio" data-horas="${p.horas}" aria-checked="${p.horas === elegido}">${p.nombre}</button>`).join("");

  let principal;
  if (a) {
    const e = estadoAyuno(a, Date.now());
    principal = `<div class="ayuno-reloj">
        ${anillo(e.progreso, { tam: 240, grosor: 16, clase: e.cumplido ? "anillo--cumplido" : "" })}
        <div class="ayuno-reloj__centro">
          <small>${e.cumplido ? "¡Meta cumplida!" : "Llevas"}</small>
          <strong data-reloj>${reloj(e.transcurrido)}</strong>
          <small>de ${a.horas} horas</small>
        </div>
      </div>
      <p class="ayuno-texto">Empezaste a las ${esc(hora(a.inicio))}. ${e.cumplido ? "Ya puedes comer cuando quieras." : `Termina a las ${esc(hora(a.inicio + a.horas * 3600000))}.`}</p>
      <div class="segmentos segmentos--centro" role="radiogroup" aria-label="Meta del ayuno">${protocolos}</div>
      <button type="button" class="btn btn--primario btn--ancho" data-terminar>Terminar ayuno</button>
      <button type="button" class="btn btn--texto btn--ancho" data-cambiar-inicio>Cambiar la hora de inicio</button>`;
  } else {
    principal = `<div class="ayuno-reloj ayuno-reloj--quieto">
        ${anillo(0, { tam: 240, grosor: 16 })}
        <div class="ayuno-reloj__centro"><small>Ayuno de</small><strong>${elegido} h</strong><small>comes en ${24 - elegido} h</small></div>
      </div>
      <p class="ayuno-texto">Elige cuántas horas quieres ayunar y empieza después de tu última comida.</p>
      <div class="segmentos segmentos--centro" role="radiogroup" aria-label="Horas de ayuno">${protocolos}</div>
      <button type="button" class="btn btn--primario btn--ancho" data-empezar>Empezar ahora</button>
      <button type="button" class="btn btn--texto btn--ancho" data-empezar-antes>Empecé antes…</button>`;
  }

  raiz.innerHTML = `<header class="cabecera cabecera--titulo"><h1>Ayuno</h1></header>
    <section class="tarjeta ayuno">${principal}</section>
    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Últimos 7 días</h2></header>
      <div class="cifras">
        <div><strong>${cumplidos}<small>/${semana.length}</small></strong><span>ayunos cumplidos</span></div>
        <div><strong>${semana.length ? esc(duracion(promedio)) : "–"}</strong><span>duración promedio</span></div>
        <div><strong>${masLargo ? esc(duracion(masLargo)) : "–"}</strong><span>tu ayuno más largo</span></div>
      </div>
      <ul class="lista-simple">${historial.slice(0, 10).map((x) => {
        const e = estadoAyuno(x);
        return `<li><div class="fila-con-accion"><span>${esc(fechaCorta(hoyISO(new Date(x.inicio))))} <small>meta ${x.horas} h</small></span>
          <span class="dato${e.cumplido ? " dato--ok" : ""}">${esc(duracion(e.transcurrido))}${e.cumplido ? " ✓" : ""}</span>
          <button type="button" class="icono-btn" data-borrar="${esc(x.id)}" aria-label="Eliminar">${ICONOS.basura}</button></div></li>`;
      }).join("") || '<li class="vacio-chico">Aquí verás tus ayunos terminados.</li>'}</ul>
    </section>
    <p class="nota nota--suelta">El ayuno no es para todos. Si estás embarazada, das pecho, tienes diabetes, tomas medicamentos o has tenido un trastorno de la conducta alimentaria, consúltalo antes con un profesional.</p>`;
}

// Actualiza solo el reloj (cada segundo, sin redibujar la pantalla)
export function latido(raiz) {
  const a = activo();
  const el = raiz.querySelector("[data-reloj]");
  if (!a || !el) return;
  const e = estadoAyuno(a, Date.now());
  el.textContent = reloj(e.transcurrido);
  if (e.cumplido && !raiz.querySelector(".anillo--cumplido")) pintar(raiz);
}

function pedirHora(titulo, inicial) {
  return new Promise((resolver) => {
    let valor = null;
    const h = abrirHoja({
      titulo, clase: "hoja--chica", alCerrar: () => resolver(valor),
      html: `<form class="formulario" data-form><label>Fecha y hora <input type="datetime-local" name="t" value="${aLocal(inicial)}" max="${aLocal(Date.now())}" required></label>
        <button type="submit" class="btn btn--primario btn--ancho">Listo</button></form>`,
    });
    h.cuerpo.querySelector("[data-form]").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = new Date(new FormData(e.target).get("t")).getTime();
      if (!(t <= Date.now())) { toast("La hora no puede ser en el futuro"); return; }
      valor = t;
      h.cerrar();
    });
  });
}

export function conectar(raiz) {
  raiz.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    const a = activo();
    if (t.dataset.horas) {
      const horas = Number(t.dataset.horas);
      if (a) await db.guardar("ayuno", a.id, { ...a, horas });
      await guardarPerfil({ ayunoHoras: horas });
    }
    if (t.matches("[data-empezar]")) {
      await db.guardar("ayuno", uid(), { inicio: Date.now(), fin: null, horas: horasElegidas() });
      toast("Ayuno iniciado. Te avisaremos al cumplirlo si tienes los recordatorios activos.");
    }
    if (t.matches("[data-empezar-antes]")) {
      const inicio = await pedirHora("¿Cuándo empezaste?", Date.now() - 2 * 3600000);
      if (inicio) await db.guardar("ayuno", uid(), { inicio, fin: null, horas: horasElegidas() });
    }
    if (t.matches("[data-cambiar-inicio]") && a) {
      const inicio = await pedirHora("¿Cuándo empezaste?", a.inicio);
      if (inicio) await db.guardar("ayuno", a.id, { ...a, inicio });
    }
    if (t.matches("[data-terminar]") && a) {
      const e2 = estadoAyuno(a, Date.now());
      if (!e2.cumplido && !(await confirmar(`Llevas ${duracion(e2.transcurrido)} de ${a.horas} h. ¿Terminar igual?`, { si: "Terminar" }))) return;
      await db.guardar("ayuno", a.id, { ...a, fin: Date.now() });
      toast(e2.cumplido ? `¡Ayuno de ${duracion(e2.transcurrido)} cumplido!` : "Ayuno terminado");
    }
    if (t.dataset.borrar && (await confirmar("¿Eliminar este ayuno del historial?", { si: "Eliminar", peligro: true }))) {
      await db.borrar("ayuno", t.dataset.borrar);
    }
  });
}

export const hayAyuno = () => !!activo();
