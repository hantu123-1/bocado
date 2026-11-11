// ============================================================
//  Envío de notificaciones Web Push sin librerías.
//  - Cifrado del mensaje: RFC 8291 (aes128gcm).
//  - Firma del remitente (VAPID): RFC 8292.
//  Funciona en Cloudflare Workers y en Node (usa WebCrypto).
// ============================================================
const te = new TextEncoder();

export function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// Cifra el texto para un dispositivo (p256dh y auth vienen de su suscripción).
export async function encrypt(text, p256dh, auth) {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);

  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = concat(te.encode(text), new Uint8Array([2])); // 2 = último (y único) bloque
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));

  // Encabezado: salt (16) | tamaño de bloque (4) | largo de la clave (1) | clave pública (65)
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// Cabecera Authorization firmada con las claves VAPID del panel.
export async function vapidHeader(endpoint, vapid) {
  const pub = fromB64url(vapid.publicKey);
  const jwk = {
    kty: "EC", crv: "P-256", ext: true,
    x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: vapid.privateKey,
  };
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64url(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(te.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: vapid.subject,
  })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(header + "." + claims));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

// Envía un aviso a una suscripción. Devuelve la respuesta del servicio push
// (404 o 410 = el dispositivo ya no existe y hay que borrar la suscripción).
export async function sendPush(sub, payload, vapid) {
  const body = await encrypt(JSON.stringify(payload), sub.p256dh, sub.auth);
  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "high",
    },
    body,
  });
}
