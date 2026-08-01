import { estaSilenciado, suscribirSonido } from "./sound.js";

/**
 * VOZ DE ALERTA
 * -----------------------------------------------------------------
 * La única voz hablada de toda la aplicación: la alerta de derroche
 * energético. Usa `SpeechSynthesis` del navegador a propósito, no la voz
 * de OpenAI del asistente — esa requiere ida y vuelta al servidor
 * (transcribir, generar, sintetizar) y una alerta de "hay luces encendidas
 * en una sala vacía AHORA MISMO" tiene que sonar sin esperar un solo
 * milisegundo de red. Es también, como el resto del motor de sonido, cero
 * KB de assets.
 *
 * Comparte el interruptor de silencio con `sound.js`: si la app está
 * muda, la alerta tampoco habla, y silenciar a media frase corta la voz en
 * seco en vez de dejarla terminar.
 */

let vocesCache = null;

function voces() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  if (!vocesCache || !vocesCache.length) vocesCache = window.speechSynthesis.getVoices();
  return vocesCache || [];
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  // Chrome carga la lista de voces de forma asincrona la primera vez.
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    vocesCache = window.speechSynthesis.getVoices();
  });
  // Si el usuario silencia mientras SELENE está hablando, se calla ya.
  suscribirSonido((silenciado) => {
    if (silenciado) window.speechSynthesis.cancel();
  });
}

function vozEspanola() {
  const lista = voces();
  return (
    lista.find((v) => /es[-_](CO|MX|ES|419|US)/i.test(v.lang)) ||
    lista.find((v) => /^es/i.test(v.lang)) ||
    null
  );
}

/**
 * Habla una alerta. Cancela cualquier alerta anterior todavía en curso —
 * dos avisos superpuestos son ruido, no información.
 */
export function hablarAlerta(texto) {
  if (typeof window === "undefined" || !window.speechSynthesis || estaSilenciado()) return;

  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(texto);
  utter.lang = "es-ES";
  utter.rate = 1.02;
  utter.pitch = 1.05;
  utter.volume = 0.9;
  const voz = vozEspanola();
  if (voz) utter.voice = voz;

  window.speechSynthesis.speak(utter);
}
