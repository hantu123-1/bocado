// ============================================================
//  Bocado: servidor de la app de alimentación.
//  Guarda la copia en la nube de lo que anotas en el celular,
//  busca productos envasados en Open Food Facts y envía los
//  recordatorios.
//
//  Rutas (todas requieren la clave):
//    GET  /api/estado               comprueba la clave
//    POST /api/sincronizar          sube cambios y baja los nuevos
//    GET  /api/producto/:codigo     producto por código de barras
//    GET  /api/productos?q=         buscar productos envasados en Chile
//    GET  /api/vapid                clave pública para suscribirse a avisos
//    POST /api/suscripcion          registrar este dispositivo
//    POST /api/prueba               enviar un aviso de prueba
//  Tarea programada (cada 5 minutos): recordatorios.
// ============================================================
import { sendPush } from "./webpush.js";
import { horaLocal, candidatos, redactar, ayunoCumplido } from "./recordatorios.js";

const TIPOS = ["perfil", "entrada", "agua", "peso", "alimento", "receta", "comida", "ayuno", "favorito", "producto"];
const LOTE = 1000;             // registros por respuesta de sincronización
const MAX_CAMBIOS = 500;       // registros que el celular sube por vez
const ZONA = "America/Santiago";
const OFF = "https://world.openfoodfacts.org";
const OFF_BUSCAR = "https://search.openfoodfacts.org/search";
const OFF_AGENTE = "Bocado/1.0 (app personal de alimentacion)";
const OFF_CAMPOS = "code,product_name,product_name_es,generic_name,brands,quantity,product_quantity,serving_size,serving_quantity,nutriments,image_front_small_url";
const te = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    try {
      if (pathname.startsWith("/api/")) {
        const rechazo = await revisarClave(request, env);
        if (rechazo) return rechazo;

        if (pathname === "/api/estado" && method === "GET") return json({ ok: true });
        if (pathname === "/api/sincronizar" && method === "POST") return await sincronizar(request, env);
        const m = pathname.match(/^\/api\/producto\/(\d{6,14})$/);
        if (m && method === "GET") return await producto(m[1], ctx);
        if (pathname === "/api/productos" && method === "GET") return await buscarProductos(url.searchParams.get("q"), ctx);
        if (pathname === "/api/vapid" && method === "GET") return json({ publicKey: env.VAPID_PUBLIC || "" });
        if (pathname === "/api/suscripcion" && method === "POST") return await suscribir(request, env);
        if (pathname === "/api/prueba" && method === "POST") {
          return json(await avisar(env, { title: "Bocado", body: "Los recordatorios funcionan ✓", tag: "prueba", url: "./" }));
        }
      }
      return json({ error: "No encontrado" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Error interno" }, 500);
    }
  },

  // Recordatorios (ver "triggers" en wrangler.jsonc)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(recordar(env, event.scheduledTime || Date.now()));
  },
};

// ---------- Utilidades ----------
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

function ip(request) {
  return request.headers.get("CF-Connecting-IP") || "local";
}

// Cuenta eventos recientes de una clave (ej. "login:1.2.3.4") para limitar abusos.
async function excedido(env, clave, maximo, segundos) {
  const desde = Date.now() - segundos * 1000;
  const fila = await env.DB.prepare("SELECT COUNT(*) AS n FROM limites WHERE clave = ?1 AND ts > ?2").bind(clave, desde).first();
  return fila.n >= maximo;
}
async function anotar(env, clave) {
  const ahora = Date.now();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO limites (clave, ts) VALUES (?1, ?2)").bind(clave, ahora),
    env.DB.prepare("DELETE FROM limites WHERE ts < ?1").bind(ahora - 86400 * 1000),
  ]);
}

async function iguales(a, b) {
  const [ha, hb] = await Promise.all([a, b].map((x) => crypto.subtle.digest("SHA-256", te.encode(x))));
  return crypto.subtle.timingSafeEqual(ha, hb);
}

async function revisarClave(request, env) {
  const clave = "login:" + ip(request);
  if (await excedido(env, clave, 10, 900)) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
  const dada = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (env.APP_CLAVE && dada && (await iguales(dada, env.APP_CLAVE))) return null;
  await anotar(env, clave);
  return json({ error: "Clave incorrecta" }, 401);
}

const texto = (v, max) => String(v ?? "").trim().slice(0, max);

// ---------- Sincronización ----------
// El celular sube sus cambios y recibe los que llegaron desde otro dispositivo.
// Si dos dispositivos cambian el mismo registro, gana el cambio más reciente (mod).
function limpiarCambio(c) {
  if (!c || !TIPOS.includes(c.tipo)) return null;
  const id = texto(c.id, 80);
  const mod = Math.round(Number(c.mod));
  if (!id || !Number.isFinite(mod) || mod <= 0) return null;
  const borrado = c.borrado ? 1 : 0;
  const datos = borrado ? {} : c.datos;
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null;
  if (JSON.stringify(datos).length > 50000) return null;
  return { tipo: c.tipo, id, datos, mod, borrado };
}

async function sincronizar(request, env) {
  const cuerpo = await request.text();
  if (cuerpo.length > 5_000_000) return json({ error: "Demasiados cambios de una vez" }, 413);
  let d;
  try { d = JSON.parse(cuerpo); } catch { return json({ error: "Formato inválido" }, 400); }

  const cambios = (Array.isArray(d.cambios) ? d.cambios : []).slice(0, MAX_CAMBIOS).map(limpiarCambio).filter(Boolean);
  if (cambios.length) {
    // Una sola consulta para todos los cambios: solo reemplaza si el cambio es más nuevo.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO registros (tipo, id, datos, mod, borrado, seq)
         SELECT json_extract(j.value, '$.tipo'), json_extract(j.value, '$.id'), json_extract(j.value, '$.datos'),
                json_extract(j.value, '$.mod'), json_extract(j.value, '$.borrado'),
                (SELECT seq FROM contador WHERE id = 1) + j.key + 1
         FROM json_each(?1) AS j WHERE true
         ON CONFLICT (tipo, id) DO UPDATE SET
           datos = excluded.datos, mod = excluded.mod, borrado = excluded.borrado, seq = excluded.seq
         WHERE excluded.mod > registros.mod`
      ).bind(JSON.stringify(cambios)),
      env.DB.prepare("UPDATE contador SET seq = seq + ?1 WHERE id = 1").bind(cambios.length),
    ]);
  }

  const total = (await env.DB.prepare("SELECT seq FROM contador WHERE id = 1").first()).seq;
  let desde = Math.max(0, Math.floor(Number(d.desde) || 0));
  if (desde > total) desde = 0; // la base de datos se reinició: el celular vuelve a bajar todo
  const { results } = await env.DB.prepare(
    "SELECT tipo, id, datos, mod, borrado, seq FROM registros WHERE seq > ?1 ORDER BY seq LIMIT ?2"
  ).bind(desde, LOTE + 1).all();
  const filas = results.slice(0, LOTE);
  return json({
    recibidos: cambios.length,
    cursor: filas.length ? filas[filas.length - 1].seq : desde,
    mas: results.length > LOTE,
    cambios: filas.map((r) => ({ tipo: r.tipo, id: r.id, datos: JSON.parse(r.datos), mod: r.mod, borrado: !!r.borrado })),
  });
}

// ---------- Productos envasados (Open Food Facts) ----------
async function offFetch(url, ctx, segundos) {
  const cache = caches.default;
  const llave = new Request(url);
  const guardada = await cache.match(llave);
  if (guardada) return guardada.json();
  const r = await fetch(url, { headers: { "User-Agent": OFF_AGENTE, Accept: "application/json" } });
  if (!r.ok) throw new Error("Open Food Facts respondió " + r.status);
  const data = await r.json();
  ctx.waitUntil(cache.put(llave, new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${segundos}` },
  })));
  return data;
}

const n100 = (nu, clave, factor = 1) => {
  const v = Number(nu[clave + "_100g"]);
  return Number.isFinite(v) && nu[clave + "_100g"] !== "" ? Math.round(v * factor * 10) / 10 : null;
};

// Convierte un producto de Open Food Facts al formato de la app (valores por 100 g o 100 ml)
export function convertirProducto(p) {
  const nu = p.nutriments || {};
  let kcal = n100(nu, "energy-kcal");
  if (kcal === null) kcal = n100(nu, "energy-kj", 1 / 4.184) ?? n100(nu, "energy", 1 / 4.184);
  const cantidad = texto(p.quantity, 40);
  const liquido = /\b\d+([.,]\d+)?\s*(ml|cc|cl|l|lt|lts|litros?)\b/i.test(cantidad + " " + texto(p.serving_size, 40));
  const unidad = liquido ? "ml" : "g";
  const porciones = [];
  const porcion = Number(p.serving_quantity);
  if (porcion > 0) porciones.push([`1 porción (${Math.round(porcion)} ${unidad})`, Math.round(porcion * 10) / 10]);
  const envase = Number(p.product_quantity);
  if (envase > 0 && envase !== porcion) porciones.push([`1 envase (${Math.round(envase)} ${unidad})`, Math.round(envase * 10) / 10]);
  return {
    codigo: texto(p.code, 14),
    n: texto(p.product_name_es || p.product_name || p.generic_name, 120) || "Producto sin nombre",
    marca: texto(String(p.brands || "").split(",")[0], 60),
    cantidad,
    v: [
      kcal === null ? null : Math.round(kcal), n100(nu, "proteins"), n100(nu, "carbohydrates"), n100(nu, "fat"),
      n100(nu, "fiber"), n100(nu, "sugars"), n100(nu, "sodium", 1000), n100(nu, "saturated-fat"),
      n100(nu, "cholesterol", 1000), n100(nu, "calcium", 1000), n100(nu, "iron", 1000), n100(nu, "potassium", 1000),
      n100(nu, "vitamin-c", 1000), n100(nu, "vitamin-a", 1e6), n100(nu, "vitamin-d", 1e6),
    ],
    l: liquido ? 1 : 0,
    p: porciones,
    img: texto(p.image_front_small_url, 300),
  };
}

async function producto(codigo, ctx) {
  try {
    const d = await offFetch(`${OFF}/api/v2/product/${codigo}.json?fields=${OFF_CAMPOS}`, ctx, 7 * 86400);
    if (d.status !== 1 || !d.product) return json({ producto: null });
    const p = convertirProducto(d.product);
    return json({ producto: p.v[0] === null ? { ...p, sinDatos: true } : p });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo consultar Open Food Facts. Intenta de nuevo." }, 502);
  }
}

async function buscarProductos(q, ctx) {
  q = texto(q, 80).replace(/["\\:()]/g, " ").trim();
  if (q.length < 3) return json({ productos: [] });
  const url = `${OFF_BUSCAR}?q=${encodeURIComponent(q + ' countries_tags:"en:chile"')}&page_size=20&fields=${OFF_CAMPOS}`;
  try {
    const d = await offFetch(url, ctx, 86400);
    const productos = (d.hits || []).map(convertirProducto).filter((p) => p.v[0] !== null && p.n !== "Producto sin nombre");
    return json({ productos });
  } catch (e) {
    console.error(e);
    return json({ error: "No se pudo buscar en Open Food Facts." }, 502);
  }
}

// ---------- Avisos ----------
async function suscribir(request, env) {
  let d;
  try { d = await request.json(); } catch { return json({ error: "Formato inválido" }, 400); }
  const endpoint = texto(d.endpoint, 1000);
  const p256dh = texto(d.keys && d.keys.p256dh, 200);
  const auth = texto(d.keys && d.keys.auth, 100);
  if (!endpoint.startsWith("https://") || !p256dh || !auth) return json({ error: "Suscripción inválida" }, 400);
  await env.DB.prepare(
    "INSERT INTO suscripciones (endpoint, p256dh, auth, creado) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (endpoint) DO UPDATE SET p256dh = ?2, auth = ?3"
  ).bind(endpoint, p256dh, auth, new Date().toISOString()).run();
  return json({ ok: true });
}

// Envía el aviso a todos los dispositivos suscritos y borra los que ya no existen.
async function avisar(env, aviso) {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return { enviados: 0, error: "Faltan las claves VAPID" };
  const vapid = { publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT };
  const { results } = await env.DB.prepare("SELECT * FROM suscripciones").all();
  let enviados = 0;
  await Promise.all(results.map(async (sub) => {
    try {
      const r = await sendPush(sub, aviso, vapid);
      if (r.status === 404 || r.status === 410) {
        await env.DB.prepare("DELETE FROM suscripciones WHERE endpoint = ?1").bind(sub.endpoint).run();
      } else if (r.ok) {
        enviados++;
      } else {
        console.error("Push rechazado", r.status, await r.text());
      }
    } catch (e) {
      console.error("Push falló", e);
    }
  }));
  return { enviados, dispositivos: results.length };
}

// Marca el aviso como enviado. Devuelve false si ya se había enviado.
async function primeraVez(env, clave) {
  const r = await env.DB.prepare("INSERT INTO avisos_enviados (clave, ts) VALUES (?1, ?2) ON CONFLICT DO NOTHING RETURNING clave")
    .bind(clave, Date.now()).first();
  return !!r;
}

async function datosDelDia(env, fecha) {
  const [comidas, agua, peso] = await env.DB.batch([
    env.DB.prepare(
      `SELECT json_extract(datos, '$.comida') AS comida, COUNT(*) AS n,
              SUM(json_extract(datos, '$.g') * json_extract(datos, '$.v[0]') / 100.0) AS kcal,
              SUM(json_extract(datos, '$.g') * json_extract(datos, '$.v[1]') / 100.0) AS prot
       FROM registros WHERE tipo = 'entrada' AND json_extract(datos, '$.fecha') = ?1 AND borrado = 0
       GROUP BY comida`
    ).bind(fecha),
    env.DB.prepare(
      "SELECT COALESCE(SUM(json_extract(datos, '$.ml')), 0) AS ml FROM registros WHERE tipo = 'agua' AND json_extract(datos, '$.fecha') = ?1 AND borrado = 0"
    ).bind(fecha),
    env.DB.prepare("SELECT COUNT(*) AS n FROM registros WHERE tipo = 'peso' AND id = ?1 AND borrado = 0").bind(fecha),
  ]);
  return {
    comidas: Object.fromEntries(comidas.results.map((r) => [r.comida, { n: r.n, kcal: r.kcal || 0, prot: r.prot || 0 }])),
    agua: agua.results[0].ml || 0,
    pesoHoy: peso.results[0].n > 0,
  };
}

async function recordar(env, ahora) {
  await env.DB.prepare("DELETE FROM avisos_enviados WHERE ts < ?1").bind(ahora - 3 * 86400000).run();
  const fila = await env.DB.prepare("SELECT datos FROM registros WHERE tipo = 'perfil' AND id = 'yo' AND borrado = 0").first();
  if (!fila) return;
  const perfil = JSON.parse(fila.datos);
  const r = perfil.recordatorios || {};

  // Ayuno cumplido
  if (r.ayuno && r.ayuno.activo) {
    const { results } = await env.DB.prepare(
      "SELECT id, datos FROM registros WHERE tipo = 'ayuno' AND borrado = 0 AND json_extract(datos, '$.fin') IS NULL"
    ).all();
    for (const a of results) {
      const aviso = ayunoCumplido(JSON.parse(a.datos), ahora);
      if (aviso && (await primeraVez(env, "ayuno:" + a.id))) await avisar(env, { ...aviso, tag: "ayuno" });
    }
  }

  const local = horaLocal(new Date(ahora), perfil.zona || ZONA);
  const lista = candidatos(perfil, local);
  if (!lista.length) return;
  const dia = await datosDelDia(env, local.fecha);
  for (const c of lista) {
    const aviso = redactar(c, dia, perfil.metas);
    if (aviso && (await primeraVez(env, c.clave))) await avisar(env, { ...aviso, tag: c.tipo });
  }
}
