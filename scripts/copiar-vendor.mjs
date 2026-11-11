// Copia a public/vendor el lector de códigos de barras (barcode-detector + zxing-wasm),
// para que funcione sin internet y sin depender de otro sitio.
// Uso: npm run vendor (después de npm install)
import { copyFileSync, mkdirSync } from "node:fs";

const nm = new URL("../node_modules/", import.meta.url);
const destino = new URL("../public/vendor/", import.meta.url);
mkdirSync(destino, { recursive: true });
copyFileSync(new URL("barcode-detector/dist/iife/ponyfill.js", nm), new URL("barcode-detector.js", destino));
copyFileSync(new URL("zxing-wasm/dist/reader/zxing_reader.wasm", nm), new URL("zxing_reader.wasm", destino));
console.log("Listo: public/vendor/barcode-detector.js y zxing_reader.wasm");
