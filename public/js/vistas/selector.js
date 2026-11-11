// ============================================================
//  Agregar alimentos: buscador, sugeridos, favoritos, tus
//  alimentos y recetas, comidas guardadas, código de barras,
//  calorías rápidas y el detalle con porciones y nutrientes.
//
//  modo "diario": anota en el día (y queda abierto para agregar más)
//  modo "ingrediente": devuelve el alimento elegido (para recetas)
// ============================================================
import * as db from "../db.js";
import * as A from "../alimentos.js";
import { api, clave } from "../sync.js";
import { escanear } from "../escaner.js";
import { abrirHoja, esc, num, ICONOS, toast, leerNumero, uid, confirmar, nombreDia, horaActual } from "../util.js";
import { COMIDAS, valores, sellos, I, INFO, kcalDe } from "../nutricion.js";
import { editarAlimento } from "./propios.js";

export function comidaPorHora(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  if (m < 11 * 60) return "desayuno";
  if (m < 16 * 60) return "almuerzo";
  if (m < 19 * 60 + 30) return "once";
  return "cena";
}
export const nombreComida = (id) => (COMIDAS.find((c) => c.id === id) || {}).nombre || id;

const unidad = (a) => (a.l ? "ml" : "g");
const v1 = (x, dec) => (x === null || x === undefined ? "–" : num(x, dec));

export function etiquetaPorcion(p, a) {
  if (p.suelta || a.fuente === "rapido") return p.n;
  return p.n.includes("(") ? p.n : `${p.n} (${num(p.g, 0)} ${unidad(a)})`;
}

function porcionLista(a) {
  const p = (a.p || [])[0];
  return p ? { n: p[0], g: p[1] } : { n: "100 " + unidad(a), g: 100 };
}

function filaAlimento(a, ultima) {
  let texto;
  let kcal;
  if (ultima) {
    if (!ultima.por || ultima.por === "g" || ultima.por === "ml") texto = `${num(ultima.g)} ${ultima.por || "g"}`;
    else texto = ultima.cant === 1 ? ultima.por : `${num(ultima.cant, 2)} × ${ultima.por}`;
    kcal = kcalDe({ v: a.v, g: ultima.g });
  } else {
    const p = porcionLista(a);
    texto = p.n;
    kcal = ((a.v[0] || 0) * p.g) / 100;
  }
  const extra = a.marca ? esc(a.marca) + " · " : "";
  return `<li><button type="button" class="fila-alimento" data-ref="${esc(a.ref || "")}">
    <span class="fila-alimento__nombre">${esc(a.n)}</span>
    <span class="fila-alimento__detalle">${extra}${esc(texto)}${a.fuente === "propio" || a.fuente === "receta" ? ` · <span class="fuente">${esc(A.FUENTES[a.fuente])}</span>` : ""}</span>
    <span class="fila-alimento__kcal">${num(kcal)}<small> kcal</small></span>
  </button></li>`;
}

// Tabla de nutrientes de una cantidad
export function tablaNutrientes(val, { completa = false } = {}) {
  const fila = (k) => `<div><dt>${INFO[k].nombre}</dt><dd>${v1(val[I[k]], INFO[k].dec)} ${INFO[k].unidad}</dd></div>`;
  return `<div class="macros-det">
      <div class="macros-det__kcal"><strong>${v1(val[0], 0)}</strong><span>kcal</span></div>
      <div class="m-prot"><strong>${v1(val[1], 1)} g</strong><span>Proteínas</span></div>
      <div class="m-carb"><strong>${v1(val[2], 1)} g</strong><span>Carbohidratos</span></div>
      <div class="m-gras"><strong>${v1(val[3], 1)} g</strong><span>Grasas</span></div>
    </div>
    <dl class="nutri-mini">${["fibra", "azuc", "sat", "sodio"].map(fila).join("")}</dl>
    ${completa ? `<details class="mas-nutrientes"><summary>Vitaminas y minerales</summary><dl class="nutri-mini">${["col", "calcio", "hierro", "potasio", "vitc", "vita", "vitd"].map(fila).join("")}</dl></details>` : ""}`;
}

export function abrirSelector({ fecha, comida, modo = "diario", alElegir, editar = null } = {}) {
  const st = {
    fecha, comida: comida || comidaPorHora(), modo, pestana: "sugeridos", q: "",
    vista: "lista", actual: null, editando: editar, agregados: 0,
    off: { q: "", productos: [], cargando: false, error: "" },
  };
  const diario = modo === "diario";
  const h = abrirHoja({ titulo: editar ? "Editar" : diario ? "Agregar alimento" : "Agregar ingrediente", clase: "hoja--alta selector" });
  const cuerpo = h.cuerpo;
  let tBusqueda;
  let tOff;

  // ---------- Lista ----------
  function pintarLista() {
    st.vista = "lista";
    const comidas = COMIDAS.map((c) => `<option value="${c.id}"${c.id === st.comida ? " selected" : ""}>${c.nombre}</option>`).join("");
    const pestanas = [["sugeridos", "Sugeridos"], ["favoritos", "Favoritos"], ["mios", "Míos"], ["recetas", "Recetas"], ...(diario ? [["comidas", "Comidas"]] : [])];
    cuerpo.innerHTML = `
      ${diario ? `<p class="selector__destino">Agregar a <select data-comida aria-label="Comida">${comidas}</select> · ${esc(nombreDia(st.fecha))}</p>` : ""}
      <div class="buscador">${ICONOS.buscar}
        <input type="search" data-q placeholder="Buscar: marraqueta, palta, leche…" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" value="${esc(st.q)}">
      </div>
      <div class="acciones-rapidas">
        <button type="button" data-escanear>${ICONOS.codigo}<span>Escanear</span></button>
        ${diario ? `<button type="button" data-rapido>${ICONOS.rayo}<span>Calorías rápidas</span></button>` : ""}
        <button type="button" data-crear>${ICONOS.mas}<span>Crear alimento</span></button>
      </div>
      <div class="pestanas" role="tablist" data-pestanas>${pestanas.map(([id, n]) => `<button type="button" role="tab" data-pestana="${id}" aria-selected="${id === st.pestana}">${n}</button>`).join("")}</div>
      <ul class="lista-alimentos" data-lista></ul>
      <div data-off></div>
      <div class="selector__pie" data-pie hidden><button type="button" class="btn btn--primario" data-listo></button></div>`;
    pintarResultados();
    pintarPie();
  }

  function pintarPie() {
    const pie = cuerpo.querySelector("[data-pie]");
    if (!pie) return;
    pie.hidden = !st.agregados;
    pie.querySelector("button").textContent = `Listo · ${st.agregados} ${st.agregados === 1 ? "agregado" : "agregados"}`;
  }

  function pintarResultados() {
    const lista = cuerpo.querySelector("[data-lista]");
    if (!lista) return;
    cuerpo.querySelector("[data-pestanas]").hidden = !!st.q;
    let html = "";
    if (st.q) {
      const res = A.buscar(st.q);
      html = res.map((a) => filaAlimento(a)).join("") ||
        `<li class="vacio-chico">No hay coincidencias en tus alimentos ni en la base. Prueba otra palabra, escanea el código o créalo.</li>`;
    } else if (st.pestana === "sugeridos") {
      const sug = A.sugeridos(st.comida);
      const vistos = new Set(sug.map((x) => x.alimento.ref));
      const rec = A.recientes(25).filter((x) => !vistos.has(x.alimento.ref));
      html = (sug.length ? `<li class="lista-titulo">Lo que sueles comer en ${esc(nombreComida(st.comida).toLowerCase())}</li>` + sug.map((x) => filaAlimento(x.alimento, x.ultima)).join("") : "") +
        (rec.length ? `<li class="lista-titulo">Recientes</li>` + rec.map((x) => filaAlimento(x.alimento, x.ultima)).join("") : "");
      if (!html) html = `<li class="vacio-chico">Busca un alimento arriba. Lo que anotes seguido aparecerá aquí para agregarlo con un toque.</li>`;
    } else if (st.pestana === "favoritos") {
      html = A.favoritos().map((a) => filaAlimento(a)).join("") ||
        `<li class="vacio-chico">Toca la estrella en el detalle de un alimento para tenerlo aquí.</li>`;
    } else if (st.pestana === "mios") {
      html = db.todos("alimento").sort((a, b) => a.n.localeCompare(b.n, "es")).map((a) => filaAlimento(A.desdePropio(a))).join("") +
        db.todos("producto").sort((a, b) => a.n.localeCompare(b.n, "es")).map((p) => filaAlimento(A.desdeProducto(p))).join("") ||
        `<li class="vacio-chico">Aquí quedan los alimentos que crees y los productos que escanees.</li>`;
    } else if (st.pestana === "recetas") {
      html = db.todos("receta").sort((a, b) => a.n.localeCompare(b.n, "es")).map((r) => filaAlimento(A.desdeReceta(r))).join("") ||
        `<li class="vacio-chico">Crea recetas en Más › Recetas: sumas los ingredientes una vez y luego anotas porciones.</li>`;
    } else if (st.pestana === "comidas") {
      html = db.todos("comida").sort((a, b) => a.n.localeCompare(b.n, "es")).map((c) => {
        const kcal = c.items.reduce((s, x) => s + kcalDe(x), 0);
        return `<li><button type="button" class="fila-alimento" data-guardada="${esc(c.id)}">
          <span class="fila-alimento__nombre">${esc(c.n)}</span>
          <span class="fila-alimento__detalle">${c.items.length} ${c.items.length === 1 ? "alimento" : "alimentos"}: ${esc(c.items.map((x) => x.n).join(", "))}</span>
          <span class="fila-alimento__kcal">${num(kcal)}<small> kcal</small></span></button></li>`;
      }).join("") || `<li class="vacio-chico">En el diario, toca ··· en una comida y elige «Guardar como comida» para repetirla con un toque.</li>`;
    }
    lista.innerHTML = html;
    pintarOff();
  }

  // Productos envasados de Open Food Facts (a través del servidor)
  function pintarOff() {
    const caja = cuerpo.querySelector("[data-off]");
    if (!caja) return;
    if (!st.q || st.q.trim().length < 3) { caja.innerHTML = ""; return; }
    if (!clave()) {
      caja.innerHTML = `<p class="nota">Para buscar productos envasados (galletas, yogures, bebidas…), conecta la nube en Más › Nube.</p>`;
      return;
    }
    const o = st.off;
    let html = `<h3 class="lista-titulo lista-titulo--off">Productos envasados en Chile <small>Open Food Facts</small></h3>`;
    if (o.cargando) html += `<p class="nota">Buscando…</p>`;
    else if (o.error) html += `<p class="nota">${esc(o.error)}</p>`;
    else if (o.q === st.q.trim()) {
      html += o.productos.length
        ? `<ul class="lista-alimentos">${o.productos.map((p) => filaAlimento(A.desdeProducto(p))).join("")}</ul>`
        : `<p class="nota">Sin resultados. Si tienes el producto a mano, escanea su código.</p>`;
    }
    caja.innerHTML = html;
  }

  async function buscarOff() {
    const q = st.q.trim();
    if (q.length < 3 || !clave() || !navigator.onLine) { pintarOff(); return; }
    st.off = { q, productos: [], cargando: true, error: "" };
    pintarOff();
    try {
      const r = await api("/api/productos?q=" + encodeURIComponent(q));
      if (st.q.trim() !== q) return;
      st.off = { q, productos: r.productos || [], cargando: false, error: "" };
    } catch (e) {
      st.off = { q, productos: [], cargando: false, error: e instanceof TypeError ? "Sin conexión." : e.message };
    }
    if (st.vista === "lista") pintarOff();
  }

  function buscarRef(ref) {
    if (!ref) return null;
    const a = A.resolver(ref);
    if (a) return a;
    if (ref.startsWith("o:")) {
      const p = st.off.productos.find((x) => "o:" + x.codigo === ref);
      if (p) return A.desdeProducto(p);
    }
    const fav = db.todos("favorito").find((f) => f.ref === ref);
    if (fav) return { ...fav.copia, ref };
    const ultima = A.ultimaVez(ref);
    return ultima ? A.desdeEntrada(ultima) : null;
  }

  // ---------- Detalle ----------
  function abrirDetalle(a, inicial) {
    const ini = inicial || A.porcionInicial(a);
    st.actual = { alimento: a, porcion: ini.porcion, cant: ini.cant };
    pintarDetalle();
  }

  function pintarDetalle() {
    st.vista = "detalle";
    const { alimento: a, porcion } = st.actual;
    const porciones = A.porcionesDe(a);
    const ss = a.fuente === "producto" || a.fuente === "propio" ? sellos(a.v, a.l) : [];
    const fav = a.ref ? A.esFavorito(a.ref) : false;
    const e = st.editando;
    const comidas = COMIDAS.map((c) => `<button type="button" role="radio" data-mover="${c.id}" aria-checked="${c.id === st.comida}">${c.nombre}</button>`).join("");
    cuerpo.innerHTML = `
      ${e ? "" : `<button type="button" class="volver" data-volver>${ICONOS.izq}Volver</button>`}
      <div class="det">
        <div class="det__cabeza">
          <div>
            <h3>${esc(a.n)}</h3>
            <p class="det__marca">${[a.marca, a.cantidad].filter(Boolean).map(esc).join(" · ")}
              <span class="chip">${esc(A.FUENTES[a.fuente] || "")}</span>${a.aprox ? ' <span class="chip chip--aviso">Valores aproximados</span>' : ""}</p>
          </div>
          ${a.ref ? `<button type="button" class="icono-btn estrella" data-favorito aria-pressed="${fav}" aria-label="Favorito">${ICONOS.estrella}</button>` : ""}
        </div>
        ${ss.length ? `<div class="sellos" aria-label="Sellos de advertencia">${ss.map((s) => `<span class="sello"><small>ALTO EN</small>${esc(s.texto.slice(8))}</span>`).join("")}</div>` : ""}
        <div class="cantidad">
          <button type="button" class="icono-btn icono-btn--borde" data-paso="-1" aria-label="Menos">${ICONOS.menos}</button>
          <input data-cant inputmode="decimal" autocomplete="off" aria-label="Cantidad" value="${num(st.actual.cant, 2)}">
          <button type="button" class="icono-btn icono-btn--borde" data-paso="1" aria-label="Más">${ICONOS.mas}</button>
        </div>
        <div class="porciones" role="radiogroup" aria-label="Porción">
          ${porciones.map((p, i) => `<button type="button" role="radio" data-porcion="${i}" aria-checked="${p.n === porcion.n}">${esc(etiquetaPorcion(p, a))}</button>`).join("")}
        </div>
        <div data-total></div>
        ${e ? `<p class="det__etiqueta">Comida</p><div class="porciones" role="radiogroup" aria-label="Comida">${comidas}</div>` : ""}
        <button type="button" class="btn btn--primario btn--ancho" data-confirmar></button>
        ${e ? `<button type="button" class="btn btn--texto-peligro btn--ancho" data-eliminar>${ICONOS.basura}Eliminar de ${esc(nombreComida(e.comida))}</button>` : ""}
        ${a.fuente === "base" ? `<p class="nota">Valores del USDA (FoodData Central). ${a.aprox ? "Este alimento no está en el USDA: se usa el más parecido." : ""}</p>` : ""}
        ${a.fuente === "producto" ? `<p class="nota">Datos de Open Food Facts, escritos por voluntarios. Compáralos con la etiqueta si algo no cuadra.</p>` : ""}
      </div>`;
    pintarTotal();
  }

  function gramos() {
    const { cant, porcion } = st.actual;
    return cant * porcion.g;
  }

  function pintarTotal() {
    const caja = cuerpo.querySelector("[data-total]");
    if (!caja) return;
    const a = st.actual.alimento;
    const g = gramos();
    const val = valores(a.v, g);
    caja.innerHTML = `<p class="det__gramos">${num(g, 0)} ${unidad(a)}</p>` + tablaNutrientes(val, { completa: true });
    const btn = cuerpo.querySelector("[data-confirmar]");
    const kcal = num(val[0] || 0);
    if (st.editando) btn.textContent = `Guardar · ${kcal} kcal`;
    else if (diario) btn.textContent = `Agregar a ${nombreComida(st.comida)} · ${kcal} kcal`;
    else btn.textContent = `Usar · ${kcal} kcal`;
    btn.disabled = !(g > 0);
  }

  async function confirmarDetalle() {
    const { alimento: a, porcion, cant } = st.actual;
    if (!(cant > 0)) return;
    if (!diario) {
      alElegir({ ref: a.ref, n: a.n, g: Math.round(cant * porcion.g * 10) / 10, cant, por: porcion.n, porG: porcion.g, v: a.v, grp: a.g, l: a.l });
      h.cerrar();
      return;
    }
    await A.guardarProducto(a);
    if (st.editando) {
      const e = st.editando;
      await db.guardar("entrada", e.id, { ...e, ...A.datosEntrada(a, { cant, porcion, comida: st.comida, fecha: e.fecha, hora: e.hora }) });
      toast("Cambios guardados");
      h.cerrar();
      return;
    }
    const id = uid();
    await db.guardar("entrada", id, A.datosEntrada(a, { cant, porcion, comida: st.comida, fecha: st.fecha }));
    st.agregados++;
    toast(`${a.n} agregado`, { texto: "Deshacer", alTocar: () => { db.borrar("entrada", id); st.agregados = Math.max(0, st.agregados - 1); pintarPie(); } });
    pintarLista();
    const input = cuerpo.querySelector("[data-q]");
    if (input && st.q) input.select();
  }

  // ---------- Calorías rápidas ----------
  function pintarRapido() {
    st.vista = "rapido";
    cuerpo.innerHTML = `
      <button type="button" class="volver" data-volver>${ICONOS.izq}Volver</button>
      <form class="formulario" data-form-rapido>
        <p class="nota">Para cuando no sabes exactamente qué comiste: anota solo las calorías (y, si quieres, los macros).</p>
        <label>Descripción <input name="n" placeholder="Ej.: Completo en la calle" autocomplete="off"></label>
        <label>Calorías (kcal) <input name="kcal" inputmode="decimal" required autocomplete="off"></label>
        <div class="fila-3">
          <label>Proteínas (g) <input name="prot" inputmode="decimal" autocomplete="off"></label>
          <label>Carbohidratos (g) <input name="carb" inputmode="decimal" autocomplete="off"></label>
          <label>Grasas (g) <input name="gras" inputmode="decimal" autocomplete="off"></label>
        </div>
        <button type="submit" class="btn btn--primario btn--ancho">Agregar a ${esc(nombreComida(st.comida))}</button>
      </form>`;
    cuerpo.querySelector("[name=kcal]").focus();
  }

  async function guardarRapido(form) {
    const f = new FormData(form);
    const kcal = leerNumero(f.get("kcal"));
    if (!(kcal > 0)) { toast("Escribe las calorías"); return; }
    const opcional = (k) => { const x = leerNumero(f.get(k)); return x >= 0 ? x : null; };
    const v = new Array(15).fill(null);
    v[0] = kcal; v[1] = opcional("prot"); v[2] = opcional("carb"); v[3] = opcional("gras");
    const a = { ref: null, n: String(f.get("n") || "").trim() || "Calorías rápidas", g: "otr", v, l: 0, fuente: "rapido" };
    await db.guardar("entrada", uid(), A.datosEntrada(a, { cant: 1, porcion: { n: "1 porción", g: 100 }, comida: st.comida, fecha: st.fecha }));
    st.agregados++;
    toast("Agregado");
    pintarLista();
  }

  // ---------- Código de barras ----------
  async function porCodigo() {
    const codigo = await escanear();
    if (!codigo) return;
    const local = A.porCodigo(codigo);
    if (local) { abrirDetalle(local); return; }
    if (!clave() || !navigator.onLine) {
      if (await confirmar(`No tienes guardado el producto ${codigo}. ¿Lo creas con los datos de la etiqueta?`, { si: "Crear" })) crear({ codigo });
      return;
    }
    toast("Buscando el producto…");
    try {
      const r = await api("/api/producto/" + codigo);
      if (r.producto && !r.producto.sinDatos) { abrirDetalle(A.desdeProducto(r.producto)); return; }
      const nombre = r.producto ? r.producto.n : "";
      const texto = r.producto
        ? `«${nombre}» está en Open Food Facts, pero sin información nutricional. ¿Lo creas con los datos de la etiqueta?`
        : "Este producto no está en Open Food Facts. ¿Lo creas con los datos de la etiqueta?";
      if (await confirmar(texto, { si: "Crear" })) crear({ codigo, n: nombre === "Producto sin nombre" ? "" : nombre, marca: r.producto ? r.producto.marca : "" });
    } catch (e) {
      toast(e instanceof TypeError ? "Sin conexión." : e.message);
    }
  }

  async function crear(inicial = {}) {
    const a = await editarAlimento(null, { n: st.q, ...inicial });
    if (a) abrirDetalle(A.desdePropio(a));
  }

  async function agregarGuardada(id) {
    const c = db.obtener("comida", id);
    if (!c) return;
    if (!(await confirmar(`¿Agregar «${c.n}» a ${nombreComida(st.comida)}?`, { si: "Agregar" }))) return;
    const hora = horaActual();
    for (const x of c.items) await db.guardar("entrada", uid(), { ...x, fecha: st.fecha, comida: st.comida, hora });
    st.agregados += c.items.length;
    toast(`${c.n} agregada`);
    pintarLista();
  }

  // ---------- Eventos ----------
  cuerpo.addEventListener("input", (e) => {
    if (e.target.matches("[data-q]")) {
      st.q = e.target.value;
      clearTimeout(tBusqueda);
      clearTimeout(tOff);
      tBusqueda = setTimeout(pintarResultados, 90);
      tOff = setTimeout(buscarOff, 700);
    }
    if (e.target.matches("[data-cant]")) {
      const v = leerNumero(e.target.value);
      st.actual.cant = v > 0 ? v : 0;
      pintarTotal();
    }
  });
  cuerpo.addEventListener("change", (e) => {
    if (e.target.matches("[data-comida]")) { st.comida = e.target.value; pintarResultados(); }
  });
  cuerpo.addEventListener("submit", (e) => {
    if (e.target.matches("[data-form-rapido]")) { e.preventDefault(); guardarRapido(e.target); }
  });
  cuerpo.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-cant]")) { e.preventDefault(); confirmarDetalle(); }
  });
  cuerpo.addEventListener("click", async (e) => {
    const t = e.target.closest("button, [data-ref]");
    if (!t) return;
    if (t.matches("[data-ref]")) {
      const a = buscarRef(t.dataset.ref);
      if (a) abrirDetalle(a);
      return;
    }
    if (t.matches("[data-guardada]")) return agregarGuardada(t.dataset.guardada);
    if (t.matches("[data-pestana]")) { st.pestana = t.dataset.pestana; pintarLista(); return; }
    if (t.matches("[data-volver]")) { pintarLista(); return; }
    if (t.matches("[data-listo]")) { h.cerrar(); return; }
    if (t.matches("[data-escanear]")) return porCodigo();
    if (t.matches("[data-rapido]")) return pintarRapido();
    if (t.matches("[data-crear]")) return crear();
    if (t.matches("[data-confirmar]")) return confirmarDetalle();
    if (t.matches("[data-favorito]")) {
      const activo = await A.alternarFavorito(st.actual.alimento);
      t.setAttribute("aria-pressed", String(activo));
      toast(activo ? "Agregado a favoritos" : "Quitado de favoritos");
      return;
    }
    if (t.matches("[data-paso]")) {
      const p = st.actual.porcion;
      const paso = p.suelta ? (st.actual.cant >= 100 ? 10 : 5) : st.actual.cant < 1 ? 0.25 : 0.5;
      const nuevo = Math.max(p.suelta ? 1 : 0.25, Math.round((st.actual.cant + paso * Number(t.dataset.paso)) * 100) / 100);
      st.actual.cant = nuevo;
      cuerpo.querySelector("[data-cant]").value = num(nuevo, 2);
      pintarTotal();
      return;
    }
    if (t.matches("[data-porcion]")) {
      const lista = A.porcionesDe(st.actual.alimento);
      const nueva = lista[Number(t.dataset.porcion)];
      const g = gramos();
      // Mantiene la misma cantidad en gramos al pasar a "g", y 1 al pasar a una porción
      st.actual.porcion = nueva;
      st.actual.cant = nueva.suelta ? Math.round(g) || 100 : 1;
      pintarDetalle();
      return;
    }
    if (t.matches("[data-mover]")) {
      st.comida = t.dataset.mover;
      cuerpo.querySelectorAll("[data-mover]").forEach((b) => b.setAttribute("aria-checked", String(b === t)));
      return;
    }
    if (t.matches("[data-eliminar]")) {
      const e2 = st.editando;
      await db.borrar("entrada", e2.id);
      h.cerrar();
      toast(`${e2.n} eliminado`, { texto: "Deshacer", alTocar: () => db.guardar("entrada", e2.id, e2) });
    }
  });

  // ---------- Inicio ----------
  A.cargarBase()
    .catch(() => toast("No se pudo cargar la base de alimentos. Revisa tu conexión."))
    .then(() => {
      if (editar) {
        const a = A.resolver(editar.ref) || A.desdeEntrada(editar);
        const porciones = A.porcionesDe(a);
        const porcion = porciones.find((p) => p.n === editar.por) || porciones[porciones.length - 1];
        st.comida = editar.comida;
        abrirDetalle(a, { porcion, cant: porcion.suelta ? editar.g : editar.cant });
      } else {
        pintarLista();
        if (!matchMedia("(pointer: coarse)").matches) cuerpo.querySelector("[data-q]").focus();
      }
    });
  return h;
}
