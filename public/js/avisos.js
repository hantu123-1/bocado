// Recordatorios en el celular (notificaciones Web Push).
// En el iPhone solo funcionan con la app instalada en la pantalla de inicio.
import { api } from "./sync.js";

export const esIOS = "standalone" in navigator;   // solo Safari de iPhone/iPad define navigator.standalone
export const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const soportaPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function estadoPermiso() {
  if (!soportaPush) return esIOS && !instalada ? "instalar" : "no-soportado";
  return Notification.permission;   // default | granted | denied
}

function desdeB64(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function mismaClave(sub, publica) {
  const actual = sub.options && sub.options.applicationServerKey;
  if (!actual) return true;
  const a = new Uint8Array(actual);
  const b = desdeB64(publica);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function sincronizarSuscripcion(nueva = false) {
  const reg = await navigator.serviceWorker.ready;
  const data = await api("/api/vapid");
  if (!data.publicKey) throw new Error("el servidor aún no tiene las claves de avisos");
  let sub = await reg.pushManager.getSubscription();
  if (sub && (nueva || !mismaClave(sub, data.publicKey))) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desdeB64(data.publicKey) });
  await api("/api/suscripcion", { method: "POST", body: sub.toJSON() });
}

// Pide permiso y registra este celular. Devuelve true si quedó activo.
export async function activar(nueva = false) {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") return false;
  await sincronizarSuscripcion(nueva);
  return true;
}

export const probar = () => api("/api/prueba", { method: "POST" });
