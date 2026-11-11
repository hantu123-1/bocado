// Verifica el cifrado y la firma de los avisos contra implementaciones de referencia.
// Uso: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, createPublicKey, randomBytes, verify } from "node:crypto";
import ece from "http_ece";
import { encrypt, vapidHeader, b64url, fromB64url } from "../src/webpush.js";

test("el aviso cifrado se descifra con http_ece (RFC 8291)", async () => {
  const celular = createECDH("prime256v1");
  celular.generateKeys();
  const auth = randomBytes(16);
  const mensaje = JSON.stringify({ title: "Nuevo pedido", body: "Juan · Barbería El Corte\nPack Despega · $74.990" });

  const cifrado = await encrypt(mensaje, b64url(celular.getPublicKey()), b64url(auth));
  const plano = ece.decrypt(Buffer.from(cifrado), { version: "aes128gcm", privateKey: celular, authSecret: auth });
  assert.equal(plano.toString("utf8"), mensaje);
});

test("la firma VAPID es un JWT ES256 válido para el servicio push", async () => {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
  const privada = (await crypto.subtle.exportKey("jwk", par.privateKey)).d;
  const endpoint = "https://web.push.apple.com/QGuQyavXutnMH";

  const h = await vapidHeader(endpoint, { publicKey: publica, privateKey: privada, subject: "mailto:ejemplo@example.com" });
  const m = h.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
  assert.ok(m, "formato de la cabecera");
  assert.equal(m[4], publica);

  const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
  assert.equal(claims.aud, "https://web.push.apple.com");
  assert.equal(claims.sub, "mailto:ejemplo@example.com");
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);

  const clave = createPublicKey({ key: await crypto.subtle.exportKey("jwk", par.publicKey), format: "jwk" });
  const ok = verify("sha256", Buffer.from(m[1] + "." + m[2]), { key: clave, dsaEncoding: "ieee-p1363" }, Buffer.from(fromB64url(m[3])));
  assert.ok(ok, "firma válida");
});
