// Gráficos en SVG (anillo, línea de peso y barras), sin librerías.
// Los colores vienen del CSS (clases), así funcionan en modo claro y oscuro.
import { esc, num, fechaCorta, fechaDe } from "./util.js";

export function anillo(pct, { tam = 168, grosor = 14, clase = "" } = {}) {
  const r = (tam - grosor) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct || 0));
  const exceso = pct > 1 ? Math.min(1, pct - 1) : 0;
  const centro = tam / 2;
  const arco = (cls, fr) =>
    `<circle cx="${centro}" cy="${centro}" r="${r}" class="${cls}" stroke-width="${grosor}" fill="none"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - fr)).toFixed(1)}"
      transform="rotate(-90 ${centro} ${centro})" stroke-linecap="round"/>`;
  return `<svg class="anillo ${clase}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
    <circle cx="${centro}" cy="${centro}" r="${r}" class="anillo__fondo" stroke-width="${grosor}" fill="none"/>
    ${p > 0 ? arco("anillo__valor", p) : ""}
    ${exceso > 0 ? arco("anillo__exceso", exceso) : ""}
  </svg>`;
}

// Escala "bonita" para el eje Y
function limites(valores, relleno = 0.1) {
  let min = Math.min(...valores);
  let max = Math.max(...valores);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * relleno;
  return [min - pad, max + pad];
}

function marcas(min, max, n = 4) {
  const paso = (max - min) / n;
  const pot = 10 ** Math.floor(Math.log10(paso));
  const bonito = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((m) => m >= paso) || paso;
  const out = [];
  for (let v = Math.ceil(min / bonito) * bonito; v <= max; v += bonito) out.push(Math.round(v * 100) / 100);
  return out;
}

// serie: [{ fecha, kg, t }] ordenada por fecha
export function lineaPeso(serie, { meta = null, alto = 200 } = {}) {
  if (!serie.length) return "";
  const ancho = 340;
  const m = { izq: 34, der: 8, arr: 10, aba: 22 };
  const x0 = fechaDe(serie[0].fecha).getTime();
  const x1 = Math.max(fechaDe(serie[serie.length - 1].fecha).getTime(), x0 + 86400000);
  const ys = serie.flatMap((p) => [p.kg, p.t]);
  if (meta) ys.push(meta);
  const [y0, y1] = limites(ys);
  const X = (f) => m.izq + ((fechaDe(f).getTime() - x0) / (x1 - x0)) * (ancho - m.izq - m.der);
  const Y = (v) => m.arr + (1 - (v - y0) / (y1 - y0)) * (alto - m.arr - m.aba);

  const rejilla = marcas(y0, y1).map((v) =>
    `<line x1="${m.izq}" x2="${ancho - m.der}" y1="${Y(v)}" y2="${Y(v)}" class="g-rejilla"/>
     <text x="${m.izq - 5}" y="${Y(v) + 3.5}" class="g-eje" text-anchor="end">${num(v, 1)}</text>`).join("");
  const fechas = [serie[0], serie[Math.floor(serie.length / 2)], serie[serie.length - 1]]
    .filter((p, i, a) => a.indexOf(p) === i)
    .map((p, i, a) => `<text x="${X(p.fecha)}" y="${alto - 6}" class="g-eje" text-anchor="${i === 0 ? "start" : i === a.length - 1 ? "end" : "middle"}">${esc(fechaCorta(p.fecha))}</text>`).join("");
  const lineaMeta = meta
    ? `<line x1="${m.izq}" x2="${ancho - m.der}" y1="${Y(meta)}" y2="${Y(meta)}" class="g-meta"/>
       <text x="${ancho - m.der}" y="${Y(meta) - 4}" class="g-eje g-eje--meta" text-anchor="end">Meta ${num(meta, 1)}</text>`
    : "";
  const puntos = serie.map((p) => `<circle cx="${X(p.fecha).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="2.6" class="g-punto"/>`).join("");
  const camino = serie.map((p, i) => `${i ? "L" : "M"}${X(p.fecha).toFixed(1)},${Y(p.t).toFixed(1)}`).join(" ");
  return `<svg class="grafico" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Gráfico de peso">
    ${rejilla}${lineaMeta}${puntos}<path d="${camino}" class="g-tendencia"/>${fechas}</svg>`;
}

// datos: [{ etiqueta, valor, clase }]
export function barras(datos, { meta = null, alto = 170, formato = (v) => num(v) } = {}) {
  if (!datos.length) return "";
  const ancho = 340;
  const m = { izq: 34, der: 6, arr: 12, aba: 20 };
  const max = Math.max(meta || 0, ...datos.map((d) => d.valor)) * 1.1 || 1;
  const Y = (v) => m.arr + (1 - v / max) * (alto - m.arr - m.aba);
  const paso = (ancho - m.izq - m.der) / datos.length;
  const anchoBarra = Math.max(3, Math.min(26, paso * 0.68));
  const cadaCuanto = Math.ceil(datos.length / 8);
  const rejilla = marcas(0, max, 3).map((v) =>
    `<line x1="${m.izq}" x2="${ancho - m.der}" y1="${Y(v)}" y2="${Y(v)}" class="g-rejilla"/>
     <text x="${m.izq - 5}" y="${Y(v) + 3.5}" class="g-eje" text-anchor="end">${esc(formato(v))}</text>`).join("");
  const cuerpo = datos.map((d, i) => {
    const x = m.izq + paso * i + (paso - anchoBarra) / 2;
    const y = Y(d.valor);
    const etiqueta = i % cadaCuanto === 0 || i === datos.length - 1
      ? `<text x="${x + anchoBarra / 2}" y="${alto - 6}" class="g-eje" text-anchor="middle">${esc(d.etiqueta)}</text>` : "";
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${anchoBarra.toFixed(1)}" height="${Math.max(0, Y(0) - y).toFixed(1)}" rx="3" class="g-barra ${d.clase || ""}"><title>${esc(d.etiqueta)}: ${esc(formato(d.valor))}</title></rect>${etiqueta}`;
  }).join("");
  const lineaMeta = meta
    ? `<line x1="${m.izq}" x2="${ancho - m.der}" y1="${Y(meta)}" y2="${Y(meta)}" class="g-meta"/>` : "";
  return `<svg class="grafico" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Gráfico de barras">${rejilla}${cuerpo}${lineaMeta}</svg>`;
}
