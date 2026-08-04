import { api } from "../lib/api.js";
import { estaSilenciado, suscribirSonido } from "../lib/sound.js";

/**
 * LA VOZ DE LUM
 * -----------------------------------------------------------------
 * La usan las dos apariciones de la mascota —el recorrido de bienvenida y
 * el aviso de derroche— a propósito: si el aviso hablara con otro motor,
 * Lum tendría dos voces distintas y dejaría de ser el mismo personaje.
 *
 * Dos motores, una sola interfaz.
 *
 *   1. **TTS de OpenAI** (`POST /api/recorrido/narrar`), el mismo que ya usa
 *      el asistente. Es la voz cálida que el recorrido necesita.
 *   2. **`SpeechSynthesis` del navegador** como red de seguridad. Suena peor,
 *      pero es instantáneo y funciona sin red.
 *
 * La regla: el recorrido NUNCA se queda esperando a la voz. Si el servidor
 * tarda más de `MS_ESPERA_MAX` o responde 503 (sin clave de TTS configurada),
 * se cae al navegador y se sigue. Un tour que se congela porque el audio no
 * llega es peor que un tour con voz mediocre.
 *
 * El audio se cachea por texto exacto en el navegador además de en el
 * servidor: relanzar el recorrido desde el botón de ayuda no vuelve a pedir
 * una sola frase.
 *
 * **El "turno".** Pedir el audio a la red tarda un momento. Si en ese
 * instante el usuario navega a otro paso (adelante, atrás o saltar), la
 * respuesta vieja seguía llegando tarde y se reproducía igual, aunque el
 * usuario ya estuviera en otra parada — se oía la voz de un paso encima del
 * paso que se veía en pantalla. `detener()` solo paraba lo que YA sonaba;
 * no invalidaba un pedido de red todavía en camino. Cada llamada a
 * `hablar()` toma un número de turno; si su respuesta llega después de que
 * ya se pidió otra frase, se descarta en vez de sonar.
 */

const MS_ESPERA_MAX = 4500;

/** Cuánto se tarda en leer un texto en voz alta, a ~2,8 palabras por segundo. */
function msDeLectura(texto, velocidad = 1) {
  return Math.max(2000, (texto.split(/\s+/).length / 2.8) * 1000) / velocidad;
}

/** Blobs ya sintetizados, por texto exacto. Vive lo que viva la pestaña. */
const cache = new Map();

function hayVozNavegador() {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

export function crearNarrador() {
  let audio = null; // HTMLAudioElement en curso
  let utter = null; // SpeechSynthesisUtterance en curso
  let cancelarActual = null; // resuelve la promesa en curso
  let volumen = 0.9;
  let velocidad = 1;
  let mudo = false;
  // Se incrementa en cada `hablar()`. Una respuesta que llega tarde se
  // reconoce comparando su turno contra este valor: si ya no coinciden, algo
  // más nuevo la superó y no debe sonar.
  let turnoActual = 0;

  // El interruptor global de sonido manda sobre todo: si la app está muda,
  // Lum tampoco habla, y silenciar a media frase corta la voz en seco.
  const desuscribir = suscribirSonido((silenciado) => {
    if (silenciado) detener();
  });

  function limpiar() {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio = null;
    }
    if (utter && hayVozNavegador()) {
      window.speechSynthesis.cancel();
      utter = null;
    }
  }

  function detener() {
    // También invalida cualquier pedido de red en camino, aunque no haya un
    // `hablar()` siguiente que lo haga por su cuenta (p. ej. al salir del
    // recorrido con una síntesis todavía en vuelo).
    turnoActual++;
    limpiar();
    const resolver = cancelarActual;
    cancelarActual = null;
    resolver?.("cancelado");
  }

  /** Voz del navegador. Devuelve una promesa que resuelve al terminar. */
  function hablarConNavegador(texto, turno) {
    return new Promise((resolve) => {
      cancelarActual = resolve;

      if (!hayVozNavegador()) {
        // Sin ningún motor de voz: los subtítulos siguen, así que se estima
        // un tiempo de lectura para que el recorrido avance solo.
        const id = window.setTimeout(() => resolve("fin"), msDeLectura(texto, velocidad));
        cancelarActual = (motivo) => {
          window.clearTimeout(id);
          resolve(motivo);
        };
        return;
      }

      window.speechSynthesis.cancel();
      // Bug conocido de Chromium/Edge: si `speak()` se llama en el MISMO
      // tick que `cancel()`, el motor a veces deja sonando la frase
      // anterior y la nueva ni siquiera arranca. Un tick de por medio (con
      // 0 ms basta) le da tiempo al cancelado a aplicarse de verdad.
      window.setTimeout(() => {
        if (turno !== turnoActual) {
          resolve("cancelado");
          return;
        }
        utter = new SpeechSynthesisUtterance(texto);
        utter.lang = "es-ES";
        utter.rate = 1.02 * velocidad;
        utter.pitch = 1.06;
        utter.volume = volumen;
        const voces = window.speechSynthesis.getVoices();
        const es =
          voces.find((v) => /es[-_](CO|MX|ES|419|US)/i.test(v.lang)) ||
          voces.find((v) => /^es/i.test(v.lang));
        if (es) utter.voice = es;
        utter.onend = () => resolve("fin");
        utter.onerror = () => resolve("fin");
        cancelarActual = resolve;
        window.speechSynthesis.speak(utter);
      }, 0);
    });
  }

  /**
   * Reproduce un blob MP3. Resuelve al terminar.
   *
   * Si el audio no llega a sonar (autoplay bloqueado, códec rechazado), NO se
   * resuelve al instante: eso haría que el recorrido se disparara de paso en
   * paso más rápido de lo que nadie puede leer. Se espera el tiempo de
   * lectura del texto, que es exactamente lo que tarda alguien en leer el
   * subtítulo — que es lo único que va a tener.
   */
  function reproducirBlob(blob, texto, turno) {
    return new Promise((resolve) => {
      // Superado justo antes de empezar a sonar: no se reproduce nada.
      if (turno !== turnoActual) {
        resolve("cancelado");
        return;
      }
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);
      audio.volume = volumen;
      audio.playbackRate = velocidad;
      let respaldo = 0;

      const terminar = (motivo) => {
        window.clearTimeout(respaldo);
        URL.revokeObjectURL(url);
        resolve(motivo);
      };
      const caerALectura = () => {
        window.clearTimeout(respaldo);
        respaldo = window.setTimeout(() => terminar("fin"), msDeLectura(texto, velocidad));
      };

      audio.onended = () => terminar("fin");
      audio.onerror = caerALectura;
      cancelarActual = terminar;
      audio.play().catch(caerALectura);
    });
  }

  /**
   * Dice una frase. Resuelve cuando termina (o cuando se cancela), así que
   * el orquestador del recorrido puede hacer `await narrador.hablar(...)`.
   */
  async function hablar(texto) {
    const turno = ++turnoActual;
    limpiar();
    if (mudo || estaSilenciado()) {
      // Mudo no significa "salta el paso": los subtítulos se leen igual, así
      // que se respeta un tiempo de lectura proporcional al texto.
      return new Promise((resolve) => {
        const id = window.setTimeout(() => resolve("fin"), msDeLectura(texto, velocidad));
        cancelarActual = (motivo) => {
          window.clearTimeout(id);
          resolve(motivo);
        };
      });
    }

    const enCache = cache.get(texto);
    if (enCache) return reproducirBlob(enCache, texto, turno);

    try {
      // Carrera contra el reloj: la voz buena solo si llega a tiempo.
      const blob = await Promise.race([
        api.narrarRecorrido(texto),
        new Promise((_, rechazar) =>
          window.setTimeout(() => rechazar(new Error("tts-lento")), MS_ESPERA_MAX)
        ),
      ]);
      // La pieza que faltaba: si mientras se esperaba la red el usuario ya
      // pidió otra frase (se devolvió, avanzó o saltó), esta respuesta llegó
      // tarde. No se reproduce aunque la síntesis haya sido exitosa — sin
      // este corte es exactamente cuando la voz de un paso viejo terminaba
      // sonando encima del paso en pantalla.
      if (turno !== turnoActual) return "cancelado";
      cache.set(texto, blob);
      return await reproducirBlob(blob, texto, turno);
    } catch {
      if (turno !== turnoActual) return "cancelado";
      return hablarConNavegador(texto, turno);
    }
  }

  /** Adelanta la síntesis de una frase futura, sin reproducirla. */
  async function precargar(texto) {
    if (!texto || cache.has(texto) || mudo || estaSilenciado()) return;
    try {
      cache.set(texto, await api.narrarRecorrido(texto));
    } catch {
      /* si falla, `hablar` caerá a la voz del navegador llegado el momento */
    }
  }

  return {
    hablar,
    precargar,
    detener,
    pausar() {
      audio?.pause();
      if (utter && hayVozNavegador()) window.speechSynthesis.pause();
    },
    reanudar() {
      audio?.play().catch(() => {});
      if (utter && hayVozNavegador()) window.speechSynthesis.resume();
    },
    setVolumen(v) {
      volumen = Math.min(1, Math.max(0, v));
      if (audio) audio.volume = volumen;
    },
    setVelocidad(v) {
      velocidad = Math.min(2, Math.max(0.5, v));
      if (audio) audio.playbackRate = velocidad;
    },
    setMudo(v) {
      mudo = v;
      if (v) limpiar();
    },
    destruir() {
      detener();
      desuscribir?.();
    },
  };
}
