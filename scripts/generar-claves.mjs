// Genera las claves VAPID (identifican a la app ante Apple/Google para enviar avisos)
// y las guarda en .dev.vars. No las muestra en pantalla.
// Uso: npm run claves
import { existsSync, writeFileSync } from "node:fs";
import { b64url } from "../src/webpush.js";

const destino = new URL("../.dev.vars", import.meta.url);
if (existsSync(destino)) {
  console.log(".dev.vars ya existe: no se cambió nada (bórralo a mano si de verdad quieres claves nuevas;");
  console.log("ojo: con claves nuevas el celular tendrá que volver a activar los avisos).");
  process.exit(0);
}

const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const privada = await crypto.subtle.exportKey("jwk", par.privateKey);
const publica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));

writeFileSync(destino, [
  "# Valores para probar en este computador (npm run dev). No subir a GitHub.",
  "APP_CLAVE=prueba-local",
  "VAPID_PUBLIC=" + b64url(publica),
  "VAPID_PRIVATE=" + privada.d,
  "",
].join("\n"));
console.log("Listo: claves guardadas en .dev.vars");
