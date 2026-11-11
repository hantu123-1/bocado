// ============================================================
//  Recordatorios: decide qué avisos tocan ahora y qué dicen.
//  No toca la base de datos (así se puede probar con npm test).
// ============================================================

// Si la tarea programada se atrasa, el aviso igual sale dentro de esta ventana (minutos)
export const VENTANA = 30;
const COMIDAS = { desayuno: "el desayuno", almuerzo: "el almuerzo", once: "la once", cena: "la cena" };
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("es-CL");

// Fecha (AAAA-MM-DD), minutos desde medianoche y día de la semana (0 = domingo) en la zona del usuario
export function horaLocal(fecha, zona) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute), dia: DIAS[p.weekday] };
}

export function aMinutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const toca = (inicio, ahora) => inicio !== null && ahora >= inicio && ahora < inicio + VENTANA;

// Recordatorios cuya hora llegó (todavía sin revisar si hacen falta)
export function candidatos(perfil, local) {
  const r = (perfil && perfil.recordatorios) || {};
  const lista = [];
  if (r.comidas && r.comidas.activo) {
    for (const [comida, hora] of Object.entries(r.comidas.horas || {})) {
      if (COMIDAS[comida] && toca(aMinutos(hora), local.minutos)) {
        lista.push({ tipo: "comida", comida, clave: `comida:${comida}:${local.fecha}` });
      }
    }
  }
  if (r.agua && r.agua.activo) {
    const desde = aMinutos(r.agua.desde);
    const hasta = aMinutos(r.agua.hasta);
    const cada = Math.max(1, Number(r.agua.cadaHoras) || 2) * 60;
    if (desde !== null && hasta !== null && hasta > desde) {
      for (let t = desde + cada; t <= hasta; t += cada) {
        if (toca(t, local.minutos)) lista.push({ tipo: "agua", momento: t, desde, hasta, clave: `agua:${local.fecha}:${t}` });
      }
    }
  }
  if (r.peso && r.peso.activo && Number(r.peso.dia) === local.dia && toca(aMinutos(r.peso.hora), local.minutos)) {
    lista.push({ tipo: "peso", clave: `peso:${local.fecha}` });
  }
  if (r.resumen && r.resumen.activo && toca(aMinutos(r.resumen.hora), local.minutos)) {
    lista.push({ tipo: "resumen", clave: `resumen:${local.fecha}` });
  }
  return lista;
}

// Texto del aviso, o null si ya no hace falta (por ejemplo, ya anotaste el almuerzo).
// dia = { comidas: { almuerzo: { n, kcal, prot } }, agua: ml, pesoHoy: bool }
export function redactar(c, dia, metas) {
  metas = metas || {};
  if (c.tipo === "comida") {
    if (dia.comidas[c.comida] && dia.comidas[c.comida].n > 0) return null;
    return {
      title: "¿Qué comiste?",
      body: `Aún no anotas ${COMIDAS[c.comida]}. Toca para registrarlo.`,
      url: "./?agregar=" + c.comida,
    };
  }
  if (c.tipo === "agua") {
    const meta = Number(metas.agua) || 2000;
    const esperado = meta * (c.momento - c.desde) / (c.hasta - c.desde);
    if (dia.agua >= esperado - 150) return null;
    return { title: "Hora de tomar agua", body: `Llevas ${fmt(dia.agua)} de ${fmt(meta)} ml hoy.`, url: "./?agua=1" };
  }
  if (c.tipo === "peso") {
    if (dia.pesoHoy) return null;
    return { title: "Día de pesarte", body: "Anota tu peso, idealmente en ayunas, para seguir tu tendencia.", url: "./?peso=1" };
  }
  if (c.tipo === "resumen") {
    const kcal = Object.values(dia.comidas).reduce((s, x) => s + (x.kcal || 0), 0);
    const prot = Object.values(dia.comidas).reduce((s, x) => s + (x.prot || 0), 0);
    if (!kcal) return { title: "Tu día", body: "Hoy no anotaste comidas. ¿Las agregas antes de dormir?", url: "./" };
    const partes = [`${fmt(kcal)} de ${fmt(metas.kcal)} kcal`];
    if (metas.prot) partes.push(`proteína ${fmt(prot)} de ${fmt(metas.prot)} g`);
    partes.push(`agua ${fmt(dia.agua)} ml`);
    return { title: "Tu día", body: partes.join(" · "), url: "./" };
  }
  return null;
}

// Ayuno en curso que ya cumplió su meta
export function ayunoCumplido(ayuno, ahora) {
  if (!ayuno || ayuno.fin || !ayuno.inicio || !ayuno.horas) return null;
  if (ahora < ayuno.inicio + ayuno.horas * 3600000) return null;
  return {
    title: "¡Ayuno cumplido!",
    body: `Llevas ${fmt(ayuno.horas)} horas de ayuno. Cuando comas, márcalo como terminado.`,
    url: "./?vista=ayuno",
  };
}
