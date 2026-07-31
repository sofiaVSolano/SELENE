/** Efectos de una alerta: voz (Web Speech API) + notificación del sistema
 * (Notifications API). Ambas son opcionales por navegador/permiso, así que
 * cada función revisa soporte/permiso antes de usarse y nunca lanza. */

export function pedirPermisoNotificaciones() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

export function hablar(texto) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // no solapar si ya hay una alerta hablando
  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = "es-ES";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export function notificarSistema(titulo, texto) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    // eslint-disable-next-line no-new
    new Notification(titulo, { body: texto });
  } catch {
    /* algunos navegadores exigen HTTPS o un service worker; se ignora */
  }
}
