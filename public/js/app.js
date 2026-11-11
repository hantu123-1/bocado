// ============================================================
//  Bocado — app de alimentación
//  Arranque: abre los datos, conecta las pantallas y la barra
//  de pestañas, sincroniza con la nube y muestra el asistente
//  la primera vez.
// ============================================================
import * as db from "./db.js";
import * as sync from "./sync.js";
import * as A from "./alimentos.js";
import * as avisos from "./avisos.js";
import { $, $$, hoyISO, abrirHoja, ICONOS } from "./util.js";
import { perfilCompleto } from "./nutricion.js";
import { perfil, actualizarMetasGuardadas } from "./perfil.js";
import * as hoy from "./vistas/hoy.js";
import * as progreso from "./vistas/progreso.js";
import * as ayuno from "./vistas/ayuno.js";
import * as mas from "./vistas/mas.js";
import { abrirSelector, comidaPorHora } from "./vistas/selector.js";

const VISTAS = { hoy, progreso, ayuno, mas };
let actual = "hoy";
let pintadoPendiente = false;
let diaVisto = hoyISO();

const raiz = (v) => $(`[data-vista="${v}"]`);
const pintarActual = () => VISTAS[actual].pintar(raiz(actual));

function programarPintado() {
  if (pintadoPendiente) return;
  pintadoPendiente = true;
  requestAnimationFrame(() => { pintadoPendiente = false; pintarActual(); });
}

function mostrar(v) {
  if (!VISTAS[v]) v = "hoy";
  const cambio = v !== actual;
  actual = v;
  for (const k of Object.keys(VISTAS)) raiz(k).hidden = k !== v;
  $$("[data-tab]").forEach((b) => (b.dataset.tab === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  pintarActual();
  if (cambio) window.scrollTo({ top: 0 });
}

function pintarIndicador(e) {
  $("[data-tab='mas'] .tab__punto").hidden = !(e.fase === "error" || (e.fase === "sin-conexion" && e.pendientes > 0));
  if (actual === "mas") programarPintado();
}

// Enlaces de los recordatorios: ?agregar=almuerzo, ?agua=1, ?peso=1, ?vista=ayuno
function abrirDesdeUrl(url) {
  const q = new URL(url, location.href).searchParams;
  if (q.get("vista")) mostrar(q.get("vista"));
  if (q.get("agregar")) {
    hoy.irAFecha(hoyISO());
    mostrar("hoy");
    abrirSelector({ fecha: hoyISO(), comida: q.get("agregar") });
  }
  if (q.get("agua")) { mostrar("hoy"); hoy.hojaAgua(hoyISO()); }
  if (q.get("peso")) { mostrar("progreso"); progreso.registrarPeso(); }
}

function bienvenida() {
  return new Promise((resolver) => {
    const h = abrirHoja({
      titulo: "Bienvenido a Bocado",
      clase: "hoja--media",
      alCerrar: resolver,
      html: `<div class="bienvenida">
        <img src="icono-192.png" alt="" width="72" height="72">
        <p>Anota lo que comes y mira al instante tus calorías, proteínas, agua y frutas y verduras. Sigue tu peso, tus medidas y tus ayunos.</p>
        <ul class="bienvenida__lista">
          <li>${ICONOS.buscar}Más de 300 alimentos con nombres chilenos y miles de productos envasados</li>
          <li>${ICONOS.codigo}Escanea el código de barras de lo que compras</li>
          <li>${ICONOS.campana}Recordatorios para comer, tomar agua y pesarte</li>
        </ul>
        <button type="button" class="btn btn--primario btn--ancho" data-nube>${ICONOS.nube}Conectar mi nube</button>
        <button type="button" class="btn btn--texto btn--ancho" data-cerrar>Empezar sin nube</button>
      </div>`,
    });
    h.cuerpo.querySelector("[data-nube]").onclick = async () => {
      if (await mas.hojaNube({ asistente: true })) h.cerrar();
    };
  });
}

async function asistente() {
  if (!sync.clave()) await bienvenida();
  // Si la nube ya tenía tu perfil (otro dispositivo), no se pregunta de nuevo
  if (!perfilCompleto(perfil())) await mas.editarPerfil({ asistente: true });
}

async function iniciar() {
  await db.abrir();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.tipo === "abrir") abrirDesdeUrl(e.data.url || "./");
    });
  }

  hoy.conectar(raiz("hoy"), { alCambiarFecha: pintarActual, abrirPerfil: () => mas.editarPerfil() });
  progreso.conectar(raiz("progreso"));
  ayuno.conectar(raiz("ayuno"));
  mas.conectar(raiz("mas"));
  db.alCambiar(programarPintado);
  sync.alCambiarEstado(pintarIndicador);
  document.addEventListener("navegar", (e) => mostrar(e.detail));
  $$("[data-tab]").forEach((b) => b.addEventListener("click", () => mostrar(b.dataset.tab)));
  $("[data-agregar-global]").addEventListener("click", () =>
    abrirSelector({ fecha: actual === "hoy" ? hoy.fechaActual() : hoyISO(), comida: comidaPorHora() }));

  A.cargarBase().catch(() => {});
  mostrar("hoy");

  // Reloj del ayuno y cambio de día
  setInterval(() => { if (actual === "ayuno" && document.visibilityState === "visible") ayuno.latido(raiz("ayuno")); }, 1000);
  setInterval(() => {
    const h = hoyISO();
    if (h !== diaVisto) {
      if (hoy.fechaActual() === diaVisto) hoy.irAFecha(h);
      diaVisto = h;
      pintarActual();
    } else if (actual === "hoy" && ayuno.hayAyuno() && !document.querySelector("dialog[open]")) {
      pintarActual();
    }
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && hoyISO() !== diaVisto) {
      if (hoy.fechaActual() === diaVisto) hoy.irAFecha(hoyISO());
      diaVisto = hoyISO();
      pintarActual();
    }
  });

  sync.iniciar().then(() => actualizarMetasGuardadas()).catch(() => {});
  if (avisos.soportaPush && Notification.permission === "granted" && sync.clave()) {
    avisos.sincronizarSuscripcion().catch(() => {});
  }

  abrirDesdeUrl(location.href);
  if (location.search) history.replaceState(null, "", location.pathname);
  if (!perfilCompleto(perfil())) asistente();
}

iniciar();
