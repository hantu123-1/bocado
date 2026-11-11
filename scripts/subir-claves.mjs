// Sube a Cloudflare las claves VAPID que están en .dev.vars, sin mostrarlas.
// La clave de la app (APP_CLAVE) la eliges tú aparte: npx wrangler secret put APP_CLAVE
// Uso: npm run subir-claves
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const vars = Object.fromEntries(
  readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

for (const nombre of ["VAPID_PUBLIC", "VAPID_PRIVATE"]) {
  if (!vars[nombre]) { console.error(`Falta ${nombre} en .dev.vars (ejecuta antes: npm run claves)`); process.exit(1); }
  const r = spawnSync("npx", ["wrangler", "secret", "put", nombre], { input: vars[nombre], stdio: ["pipe", "inherit", "inherit"], shell: true });
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log("Claves VAPID subidas a Cloudflare.");
