// ============================================================
//  Progreso: peso con tendencia, IMC y medidas; calorías, macros
//  y agua de los últimos días; lo que más calorías te aporta.
// ============================================================
import * as db from "../db.js";
import { esc, num, ICONOS, hoyISO, sumarDias, fechaCorta, nombreDia, abrirHoja, toast, leerNumero, confirmar, fechaDe } from "../util.js";
import { tendencia, cambioSemanal, imc, categoriaImc, totalesDe, kcalDe, I, racha } from "../nutricion.js";
import { lineaPeso, barras } from "../graficos.js";
import { metasActuales, perfil, actualizarMetasGuardadas } from "../perfil.js";

const MEDIDAS = [["cintura", "Cintura"], ["cadera", "Cadera"], ["cuello", "Cuello"], ["pecho", "Pecho"], ["brazo", "Brazo"], ["muslo", "Muslo"]];
const RANGOS_PESO = [[30, "1 mes"], [90, "3 meses"], [180, "6 meses"], [365, "1 año"], [0, "Todo"]];
let rangoPeso = 90;
let rangoDias = 7;

const signo = (x, dec = 1) => (x > 0 ? "+" : x < 0 ? "−" : "") + num(Math.abs(x), dec);

function tarjetaPeso() {
  const p = perfil();
  const serie = tendencia(db.todos("peso").filter((x) => x.kg > 0));
  if (!serie.length) {
    return `<section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Peso</h2></header>
      <div class="vacio">${ICONOS.balanza}<p>Anota tu peso para ver tu tendencia. Lo ideal: en ayunas, una o dos veces por semana.</p>
      <button type="button" class="btn btn--primario" data-registrar-peso>Registrar peso</button></div></section>`;
  }
  const ultimo = serie[serie.length - 1];
  const semanal = cambioSemanal(serie);
  const indice = p && p.altura ? imc(ultimo.t, p.altura) : null;
  const desde = rangoPeso ? sumarDias(hoyISO(), -rangoPeso) : "";
  const visible = serie.filter((x) => x.fecha >= desde);
  const meta = p && p.pesoMeta ? Number(p.pesoMeta) : null;

  let textoMeta = "";
  if (meta) {
    const falta = ultimo.t - meta;
    if (Math.abs(falta) < 0.3) textoMeta = `Llegaste a tu meta de ${num(meta, 1)} kg. ¡Bien!`;
    else {
      const vaBien = semanal !== null && Math.sign(semanal) === -Math.sign(falta) && Math.abs(semanal) >= 0.05;
      textoMeta = `Te faltan <strong>${num(Math.abs(falta), 1)} kg</strong> para tu meta de ${num(meta, 1)} kg` +
        (vaBien ? `: unas ${Math.ceil(Math.abs(falta) / Math.abs(semanal))} semanas al ritmo de tu tendencia.` : ".");
    }
  }

  const historial = [...serie].reverse().slice(0, 8);
  return `<section class="tarjeta">
    <header class="tarjeta__cabecera"><h2>Peso</h2>
      <button type="button" class="btn btn--chico btn--borde" data-registrar-peso>${ICONOS.mas}Registrar</button></header>
    <div class="cifras">
      <div><strong>${num(ultimo.kg, 1)}</strong><span>kg · ${esc(nombreDia(ultimo.fecha).toLowerCase())}</span></div>
      <div><strong>${semanal === null ? "–" : signo(semanal, 2)}</strong><span>kg por semana</span></div>
      ${indice ? `<div><strong>${num(indice, 1)}</strong><span>IMC · ${categoriaImc(indice)}</span></div>` : ""}
    </div>
    ${textoMeta ? `<p class="texto-meta">${textoMeta}</p>` : ""}
    <div class="segmentos" role="radiogroup" aria-label="Período">${RANGOS_PESO.map(([d, n]) => `<button type="button" role="radio" data-rango-peso="${d}" aria-checked="${d === rangoPeso}">${n}</button>`).join("")}</div>
    ${visible.length ? lineaPeso(visible, { meta }) : `<p class="nota">No hay pesajes en este período.</p>`}
    <p class="nota">Puntos: tus pesajes. Línea: tu tendencia, que suaviza los cambios normales de un día a otro (agua, sal, digestión). Fíjate en la línea.</p>
    <ul class="lista-simple">${historial.map((x) => `<li><button type="button" data-editar-peso="${esc(x.fecha)}">
      <span>${esc(fechaCorta(x.fecha))} <small>${MEDIDAS.filter(([k]) => x[k]).map(([k, n]) => `${n} ${num(x[k], 1)}`).join(" · ")}${x.grasa ? ` · Grasa ${num(x.grasa, 1)} %` : ""}</small></span>
      <span class="dato">${num(x.kg, 1)} kg</span></button></li>`).join("")}</ul>
  </section>`;
}

function tarjetaMedidas() {
  const conMedidas = db.todos("peso").filter((x) => MEDIDAS.some(([k]) => x[k]) || x.grasa).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  if (!conMedidas.length) return "";
  const filas = [...MEDIDAS, ["grasa", "Grasa corporal"]].map(([k, n]) => {
    const con = conMedidas.filter((x) => x[k]);
    if (!con.length) return "";
    const primero = con[0];
    const ultimo = con[con.length - 1];
    const u = k === "grasa" ? "%" : "cm";
    return `<li><div class="fila-con-accion"><span>${n} <small>desde ${esc(fechaCorta(primero.fecha))}</small></span>
      <span class="dato">${num(ultimo[k], 1)} ${u}${con.length > 1 ? ` <small>${signo(ultimo[k] - primero[k])}</small>` : ""}</span></div></li>`;
  }).join("");
  return `<section class="tarjeta"><header class="tarjeta__cabecera"><h2>Medidas</h2></header><ul class="lista-simple">${filas}</ul></section>`;
}

function tarjetasDias() {
  const hoy = hoyISO();
  const metas = metasActuales();
  const dias = Array.from({ length: rangoDias }, (_, i) => sumarDias(hoy, i - rangoDias + 1));
  const entradas = db.todos("entrada").filter((e) => e.fecha >= dias[0]);
  const aguaTodo = db.todos("agua").filter((a) => a.fecha >= dias[0]);
  const porDia = dias.map((f) => {
    const lista = entradas.filter((e) => e.fecha === f);
    return { fecha: f, lista, tot: totalesDe(lista), agua: aguaTodo.filter((a) => a.fecha === f).reduce((s, a) => s + a.ml, 0) };
  });
  // Promedios con los días completos que tienen algo anotado (hoy no cuenta: el día no ha terminado),
  // salvo que hoy sea el único día con datos
  const completos = porDia.filter((d) => d.lista.length && d.fecha !== hoy);
  const anotados = completos.length ? completos : porDia.filter((d) => d.lista.length);
  const prom = (fn) => (anotados.length ? anotados.reduce((s, d) => s + fn(d), 0) / anotados.length : 0);
  const kcalProm = prom((d) => d.tot[0]);
  const enMeta = anotados.filter((d) => Math.abs(d.tot[0] - metas.kcal) <= metas.kcal * 0.1).length;
  const p = prom((d) => d.tot[I.prot]);
  const c = prom((d) => d.tot[I.carb]);
  const g = prom((d) => d.tot[I.gras]);
  const energia = p * 4 + c * 4 + g * 9 || 1;
  // Agua: desde el primer día que usaste la app (sin hoy, salvo que sea el único)
  const primerDia = [...db.todos("entrada"), ...db.todos("agua")].reduce((m, x) => (x.fecha < m ? x.fecha : m), hoy);
  const desdeInicio = porDia.filter((d) => d.fecha >= primerDia);
  const conAgua = desdeInicio.length > 1 ? desdeInicio.filter((d) => d.fecha !== hoy) : desdeInicio;
  const aguaProm = conAgua.length ? conAgua.reduce((s, d) => s + d.agua, 0) / conAgua.length : 0;
  const fechasConDatos = [...new Set(db.todos("entrada").map((e) => e.fecha))];
  const etiqueta = (f) => (rangoDias <= 7 ? fechaDe(f).toLocaleDateString("es-CL", { weekday: "narrow" }) : String(fechaDe(f).getDate()));

  // Lo que más calorías aporta
  const aporte = new Map();
  for (const e of entradas) {
    const clave = e.ref || "n:" + e.n;
    const x = aporte.get(clave) || { n: e.n, kcal: 0, veces: 0 };
    x.kcal += kcalDe(e);
    x.veces++;
    aporte.set(clave, x);
  }
  const top = [...aporte.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 8);
  const totalKcal = entradas.reduce((s, e) => s + kcalDe(e), 0) || 1;

  return `
    <div class="segmentos segmentos--centro" role="radiogroup" aria-label="Período">
      ${[[7, "7 días"], [14, "14 días"], [30, "30 días"]].map(([d, n]) => `<button type="button" role="radio" data-rango-dias="${d}" aria-checked="${d === rangoDias}">${n}</button>`).join("")}
    </div>
    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Calorías</h2></header>
      <div class="cifras">
        <div><strong>${anotados.length ? num(kcalProm) : "–"}</strong><span>promedio por día</span></div>
        <div><strong>${enMeta}<small>/${anotados.length}</small></strong><span>días en tu meta (±10 %)</span></div>
        <div><strong>${racha(fechasConDatos, hoy)}</strong><span>días seguidos anotando</span></div>
      </div>
      ${barras(porDia.map((d) => ({
        etiqueta: etiqueta(d.fecha), valor: d.tot[0],
        clase: d.fecha === hoy ? "g-barra--hoy" : d.tot[0] > metas.kcal * 1.1 ? "g-barra--exceso" : "",
      })), { meta: metas.kcal })}
      <p class="nota">La línea es tu meta de ${num(metas.kcal)} kcal. ${completos.length ? "Los promedios no cuentan hoy ni los días sin nada anotado." : "Por ahora los promedios usan solo hoy."}</p>
    </section>
    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Macros promedio</h2></header>
      ${anotados.length ? `<div class="reparto" aria-hidden="true">
          <span class="m-prot" style="width:${((p * 4) / energia) * 100}%"></span><span class="m-carb" style="width:${((c * 4) / energia) * 100}%"></span><span class="m-gras" style="width:${((g * 9) / energia) * 100}%"></span></div>
        <div class="cifras cifras--3">
          <div class="m-prot"><strong>${num(p)} g</strong><span>Proteínas · ${num(((p * 4) / energia) * 100)} %</span><small>meta ${num(metas.prot)} g</small></div>
          <div class="m-carb"><strong>${num(c)} g</strong><span>Carbohidratos · ${num(((c * 4) / energia) * 100)} %</span><small>meta ${num(metas.carb)} g</small></div>
          <div class="m-gras"><strong>${num(g)} g</strong><span>Grasas · ${num(((g * 9) / energia) * 100)} %</span><small>meta ${num(metas.gras)} g</small></div>
        </div>` : `<p class="nota">Cuando tengas días anotados, aquí verás cómo se reparten tus calorías.</p>`}
    </section>
    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Agua</h2></header>
      <div class="cifras">
        <div><strong>${num(aguaProm)}</strong><span>ml por día en promedio</span></div>
        <div><strong>${conAgua.filter((d) => d.agua >= metas.agua).length}<small>/${conAgua.length}</small></strong><span>días con tu meta de ${num(metas.agua)} ml</span></div>
      </div>
      ${barras(porDia.map((d) => ({ etiqueta: etiqueta(d.fecha), valor: d.agua, clase: "g-barra--agua" + (d.fecha === hoy ? " g-barra--hoy" : "") })), { meta: metas.agua, alto: 130 })}
    </section>
    <section class="tarjeta">
      <header class="tarjeta__cabecera"><h2>Lo que más calorías te aporta</h2></header>
      ${top.length ? `<ul class="lista-simple">${top.map((x) => `<li><div class="fila-con-accion">
        <span>${esc(x.n)} <small>${x.veces} ${x.veces === 1 ? "vez" : "veces"}</small></span>
        <span class="dato">${num(x.kcal)} kcal <small>${num((x.kcal / totalKcal) * 100)} %</small></span></div></li>`).join("")}</ul>`
        : `<p class="nota">Aún no hay comidas anotadas en este período.</p>`}
    </section>`;
}

export function pintar(raiz) {
  raiz.innerHTML = `<header class="cabecera cabecera--titulo"><h1>Progreso</h1></header>` + tarjetaPeso() + tarjetaMedidas() + tarjetasDias();
}

// ---------- Registrar peso ----------
// Sin "editar", abre un pesaje nuevo (si ya había uno ese día, se reemplaza: uno por día)
export function registrarPeso(fecha = hoyISO(), editar = false) {
  const existente = editar ? db.obtener("peso", fecha) : null;
  const x = existente || {};
  const h = abrirHoja({
    titulo: existente ? "Editar pesaje" : "Registrar peso",
    clase: "hoja--alta",
    html: `<form class="formulario" data-form>
      <div class="fila-2">
        <label>Fecha <input type="date" name="fecha" value="${esc(fecha)}" max="${hoyISO()}" required></label>
        <label>Peso (kg) <input name="kg" inputmode="decimal" required value="${x.kg ? num(x.kg, 1) : ""}" autocomplete="off" placeholder="72,5"></label>
      </div>
      <details${MEDIDAS.some(([k]) => x[k]) || x.grasa ? " open" : ""}>
        <summary>Medidas y grasa corporal (opcional)</summary>
        <div class="fila-2">
          ${MEDIDAS.map(([k, n]) => `<label>${n} (cm)<input name="${k}" inputmode="decimal" value="${x[k] ? num(x[k], 1) : ""}" autocomplete="off"></label>`).join("")}
          <label>Grasa corporal (%)<input name="grasa" inputmode="decimal" value="${x.grasa ? num(x.grasa, 1) : ""}" autocomplete="off"></label>
        </div>
        <p class="nota">Mide la cintura a la altura del ombligo, sin apretar. Mide siempre igual y a la misma hora.</p>
      </details>
      <label>Nota <input name="nota" value="${esc(x.nota || "")}" autocomplete="off" placeholder="Opcional"></label>
      <button type="submit" class="btn btn--primario btn--ancho">Guardar</button>
      ${existente ? `<button type="button" class="btn btn--texto-peligro btn--ancho" data-borrar>${ICONOS.basura}Eliminar pesaje</button>` : ""}
    </form>`,
  });
  const form = h.cuerpo.querySelector("[data-form]");
  if (!existente) setTimeout(() => form.kg.focus(), 250);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const kg = leerNumero(f.get("kg"));
    if (!(kg >= 20 && kg <= 400)) { toast("Revisa el peso"); return; }
    const nuevaFecha = f.get("fecha");
    const datos = { fecha: nuevaFecha, kg: Math.round(kg * 10) / 10 };
    for (const [k] of [...MEDIDAS, ["grasa"]]) {
      const v = leerNumero(f.get(k));
      if (v > 0) datos[k] = Math.round(v * 10) / 10;
    }
    const nota = String(f.get("nota") || "").trim();
    if (nota) datos.nota = nota;
    const reemplaza = (!existente || nuevaFecha !== fecha) && db.obtener("peso", nuevaFecha);
    if (existente && nuevaFecha !== fecha) await db.borrar("peso", fecha);
    await db.guardar("peso", nuevaFecha, datos);
    await actualizarMetasGuardadas();
    toast(reemplaza ? "Peso guardado (reemplaza el de ese día)" : "Peso guardado");
    h.cerrar();
  });
  const borrar = h.cuerpo.querySelector("[data-borrar]");
  if (borrar) borrar.onclick = async () => {
    if (!(await confirmar("¿Eliminar este pesaje?", { si: "Eliminar", peligro: true }))) return;
    await db.borrar("peso", fecha);
    await actualizarMetasGuardadas();
    h.cerrar();
  };
}

export function conectar(raiz) {
  raiz.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.matches("[data-registrar-peso]")) registrarPeso();
    if (t.dataset.editarPeso) registrarPeso(t.dataset.editarPeso, true);
    if (t.dataset.rangoPeso !== undefined) { rangoPeso = Number(t.dataset.rangoPeso); pintar(raiz); }
    if (t.dataset.rangoDias) { rangoDias = Number(t.dataset.rangoDias); pintar(raiz); }
  });
}
