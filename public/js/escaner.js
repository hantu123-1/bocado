// ============================================================
//  Lector de códigos de barras con la cámara.
//  Safari del iPhone no trae lector propio: se usa zxing (WebAssembly),
//  guardado en public/vendor para que funcione sin internet.
// ============================================================
import { ICONOS } from "./util.js";

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e"];
let carga = null;

function cargarLector() {
  if ("BarcodeDetector" in window) return Promise.resolve(window.BarcodeDetector);
  if (!carga) {
    carga = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = "vendor/barcode-detector.js";
      s.onload = () => {
        const lib = window.BarcodeDetectionAPI;
        const wasm = new URL("vendor/zxing_reader.wasm", location.href).href;
        lib.setZXingModuleOverrides({ locateFile: (ruta, prefijo) => (ruta.endsWith(".wasm") ? wasm : prefijo + ruta) });
        ok(lib.BarcodeDetector);
      };
      s.onerror = () => { carga = null; mal(new Error("No se pudo cargar el lector de códigos")); };
      document.head.appendChild(s);
    });
  }
  return carga;
}

const valido = (c) => /^\d{8,14}$/.test(c);

// Abre la cámara y devuelve el código leído (o null si se cancela)
export function escanear() {
  return new Promise((resolver) => {
    // Es un <dialog> modal para quedar encima de la hoja de "Agregar" (que también es modal)
    const capa = document.createElement("dialog");
    capa.className = "escaner";
    capa.setAttribute("aria-label", "Escanear código de barras");
    capa.innerHTML = `
      <video playsinline muted autoplay></video>
      <div class="escaner__marco" aria-hidden="true"></div>
      <p class="escaner__texto" data-texto>Abriendo la cámara…</p>
      <form class="escaner__manual" data-manual hidden>
        <label for="codigo-manual">Código de barras</label>
        <div class="fila-input">
          <input id="codigo-manual" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="7801234567890">
          <button type="submit" class="btn btn--primario">Buscar</button>
        </div>
      </form>
      <div class="escaner__acciones">
        <button type="button" class="btn btn--vidrio" data-escribir>${ICONOS.teclado}Escribir</button>
        <label class="btn btn--vidrio">${ICONOS.camara}Foto<input type="file" accept="image/*" capture="environment" hidden data-foto></label>
        <button type="button" class="btn btn--vidrio" data-cancelar>Cancelar</button>
      </div>`;
    document.body.appendChild(capa);
    capa.showModal();
    const video = capa.querySelector("video");
    const texto = capa.querySelector("[data-texto]");
    let flujo = null;
    let activo = true;
    let anterior = "";

    const terminar = (codigo) => {
      if (!activo) return;
      activo = false;
      if (flujo) flujo.getTracks().forEach((t) => t.stop());
      capa.close();
      capa.remove();
      resolver(codigo);
    };
    capa.addEventListener("cancel", (e) => { e.preventDefault(); terminar(null); });
    const mostrarManual = (mensaje) => {
      if (mensaje) texto.textContent = mensaje;
      capa.querySelector("[data-manual]").hidden = false;
      capa.querySelector("#codigo-manual").focus();
    };

    capa.querySelector("[data-cancelar]").onclick = () => terminar(null);
    capa.querySelector("[data-escribir]").onclick = () => mostrarManual();
    capa.querySelector("[data-manual]").onsubmit = (e) => {
      e.preventDefault();
      const c = capa.querySelector("#codigo-manual").value.replace(/\D/g, "");
      if (valido(c)) terminar(c);
      else texto.textContent = "El código debe tener entre 8 y 14 números.";
    };

    let lector = null;
    capa.querySelector("[data-foto]").onchange = async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      texto.textContent = "Leyendo la foto…";
      try {
        lector = lector || new (await cargarLector())({ formats: FORMATOS });
        const imagen = await createImageBitmap(archivo);
        const r = await lector.detect(imagen);
        const c = r.map((x) => x.rawValue).find(valido);
        if (c) terminar(c);
        else mostrarManual("No se vio un código en la foto. Prueba de más cerca o escríbelo.");
      } catch (err) {
        mostrarManual("No se pudo leer la foto. Escribe el código.");
      }
    };

    (async () => {
      try {
        const Detector = await cargarLector();
        lector = new Detector({ formats: FORMATOS });
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!activo) { flujo.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = flujo;
        await video.play().catch(() => {});
        texto.textContent = "Apunta al código de barras";
        const mirar = async () => {
          if (!activo) return;
          if (video.readyState >= 2) {
            try {
              const r = await lector.detect(video);
              const c = r.map((x) => x.rawValue).find(valido);
              // Se pide la misma lectura dos veces seguidas para evitar errores
              if (c && c === anterior) { terminar(c); return; }
              anterior = c || "";
            } catch (err) { /* cuadro ilegible: se sigue mirando */ }
          }
          setTimeout(mirar, 180);
        };
        mirar();
      } catch (err) {
        const sinPermiso = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
        mostrarManual(sinPermiso
          ? "No hay permiso para usar la cámara. Actívalo en Ajustes › Safari › Cámara, o escribe el código."
          : "No se pudo abrir la cámara. Usa «Foto» o escribe el código.");
      }
    })();
  });
}
