// Utilidades de pantalla: textos, fechas, números, avisos cortos y hojas.

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const num = (n, dec = 0) =>
  Number(n || 0).toLocaleString("es-CL", { maximumFractionDigits: dec, minimumFractionDigits: 0 });

// Número escrito con coma o punto ("1,5" o "1.5")
export function leerNumero(texto) {
  const v = Number(String(texto ?? "").trim().replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------- Fechas (siempre en la hora local del celular) ----------
export function hoyISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const fechaDe = (iso) => new Date(iso + "T12:00:00");
export function sumarDias(iso, n) {
  const d = fechaDe(iso);
  d.setDate(d.getDate() + n);
  return hoyISO(d);
}
export function horaActual(d = new Date()) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function nombreDia(iso) {
  const hoy = hoyISO();
  if (iso === hoy) return "Hoy";
  if (iso === sumarDias(hoy, -1)) return "Ayer";
  if (iso === sumarDias(hoy, 1)) return "Mañana";
  return fechaDe(iso).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}
export const fechaLarga = (iso) => fechaDe(iso).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
export const fechaCorta = (iso) => fechaDe(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });

export function duracion(ms) {
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60);
  return h ? `${h} h ${String(min % 60).padStart(2, "0")} min` : `${min} min`;
}

// ---------- Aviso corto ----------
// Es un "popover": así queda encima de las hojas abiertas (que son modales)
let toastTimer;
function ocultarToast(el) {
  el.classList.remove("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (el.hidePopover && el.matches(":popover-open")) el.hidePopover(); }, 220);
}
export function toast(texto, accion) {
  const el = $("[data-toast]");
  el.innerHTML = `<span>${esc(texto)}</span>` + (accion ? `<button type="button">${esc(accion.texto)}</button>` : "");
  if (accion) el.querySelector("button").onclick = () => { ocultarToast(el); accion.alTocar(); };
  clearTimeout(toastTimer);
  if (el.showPopover) {
    if (el.matches(":popover-open")) el.hidePopover();   // vuelve a mostrarlo encima de todo
    el.showPopover();
  }
  requestAnimationFrame(() => el.classList.add("visible"));
  toastTimer = setTimeout(() => ocultarToast(el), accion ? 5000 : 2600);
}

// ---------- Hojas (paneles que suben desde abajo) ----------
const rapido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Crea una hoja con el contenido dado. Devuelve { hoja, cuerpo, cerrar }.
export function abrirHoja({ titulo, html = "", clase = "", alCerrar } = {}) {
  const d = document.createElement("dialog");
  d.className = "hoja " + clase;
  d.innerHTML =
    '<div class="hoja__asa" aria-hidden="true"></div>' +
    '<header class="hoja__cabecera"><h2>' + esc(titulo || "") + "</h2>" +
    '<button type="button" class="icono-btn" data-cerrar aria-label="Cerrar">' + ICONOS.cerrar + "</button></header>" +
    '<div class="hoja__cuerpo" tabindex="-1"></div>';
  const cuerpo = d.querySelector(".hoja__cuerpo");
  cuerpo.innerHTML = html;
  document.body.appendChild(d);

  let cerrada = false;
  const cerrar = () => {
    if (cerrada) return;
    cerrada = true;
    d.classList.add("cerrando");
    setTimeout(() => { d.close(); d.remove(); if (alCerrar) alCerrar(); }, rapido() ? 0 : 200);
  };
  d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-cerrar]")) cerrar(); });
  d.showModal();
  cuerpo.focus({ preventScroll: true });
  return { hoja: d, cuerpo, cerrar, titulo: (t) => { d.querySelector(".hoja__cabecera h2").textContent = t; } };
}

export function confirmar(texto, { si = "Sí", no = "Cancelar", peligro = false } = {}) {
  return new Promise((resolver) => {
    let respuesta = false;
    const h = abrirHoja({
      titulo: texto,
      clase: "hoja--chica",
      alCerrar: () => resolver(respuesta),
      html: `<div class="acciones-fila">
        <button type="button" class="btn btn--borde" data-no>${esc(no)}</button>
        <button type="button" class="btn ${peligro ? "btn--peligro" : "btn--primario"}" data-si>${esc(si)}</button></div>`,
    });
    h.cuerpo.querySelector("[data-si]").onclick = () => { respuesta = true; h.cerrar(); };
    h.cuerpo.querySelector("[data-no]").onclick = () => h.cerrar();
  });
}

// ---------- Íconos (SVG de trazo) ----------
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICONOS = {
  cerrar: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  menos: svg('<path d="M5 12h14"/>'),
  izq: svg('<path d="m15 18-6-6 6-6"/>'),
  der: svg('<path d="m9 18 6-6-6-6"/>'),
  buscar: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  codigo: svg('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>'),
  rayo: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  estrella: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>'),
  basura: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  lapiz: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>'),
  puntos: svg('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  gota: svg('<path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/>'),
  hoja: svg('<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19 13 11"/>'),
  reloj: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  plato: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>'),
  grafico: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  ajustes: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  nube: svg('<path d="M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z"/>'),
  campana: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  libro: svg('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a2 2 0 0 0-2 2"/><path d="M20 4v14h-6"/>'),
  olla: svg('<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h20M9 6c0-1 1-2 0-3M13 6c0-1 1-2 0-3"/>'),
  caja: svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  copiar: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  guardar: svg('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7M8 20v-6h8v6"/>'),
  camara: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  teclado: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M7 14h10"/>'),
  balanza: svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9a5 5 0 0 1 8 0l-3 3"/>'),
  sincronizar: svg('<path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5M20 20v-4h-4"/>'),
  descargar: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  subir: svg('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
};
