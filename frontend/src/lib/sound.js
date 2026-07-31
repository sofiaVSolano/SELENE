/**
 * MOTOR DE SONIDO SINTETIZADO
 * -----------------------------------------------------------------
 * Cero archivos de audio: todo se genera con WebAudio en tiempo real.
 * Ventajas reales (no cosmeticas):
 *   - 0 KB de assets y 0 requests.
 *   - Cada sonido se parametriza con el dato que lo dispara (p. ej. el
 *     tono del "tick" de deteccion sube con la confianza del modelo).
 *   - Nunca suenan dos veces igual: hay micro-variacion aleatoria, que
 *     es lo que separa un sonido "de plantilla" de uno que se siente vivo.
 *
 * Politica de autoplay: el AudioContext solo se crea tras el primer
 * gesto del usuario. La pantalla de ignicion ES ese gesto, asi que el
 * audio queda desbloqueado justo cuando se enciende la luz.
 */

const KEY_MUTE = "selene_sonido";

let ctx = null;
let master = null;
let silenciado = typeof localStorage !== "undefined" && localStorage.getItem(KEY_MUTE) === "off";
const oyentes = new Set();

function motor() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = silenciado ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function desbloquearAudio() {
  motor();
}

export function estaSilenciado() {
  return silenciado;
}

export function alternarSonido() {
  silenciado = !silenciado;
  localStorage.setItem(KEY_MUTE, silenciado ? "off" : "on");
  if (master) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(silenciado ? 0 : 0.5, t, 0.05);
  }
  oyentes.forEach((fn) => fn(silenciado));
  return silenciado;
}

export function suscribirSonido(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

const rnd = (a, b) => a + Math.random() * (b - a);

/** Ruido blanco reutilizable (base de clicks, chispas, papel, impresora). */
function bufferRuido(segundos = 1) {
  const ac = motor();
  const largo = Math.floor(ac.sampleRate * segundos);
  const buffer = ac.createBuffer(1, largo, ac.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < largo; i += 1) datos[i] = Math.random() * 2 - 1;
  return buffer;
}

function ruido({ dur = 0.08, tipo = "bandpass", freq = 1800, q = 1, gain = 0.3, decay = 0.05 }) {
  const ac = motor();
  if (!ac) return;
  const src = ac.createBufferSource();
  src.buffer = bufferRuido(Math.max(dur, 0.05));
  const filtro = ac.createBiquadFilter();
  filtro.type = tipo;
  filtro.frequency.value = freq;
  filtro.Q.value = q;
  const g = ac.createGain();
  const t = ac.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + decay);
  src.connect(filtro).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + decay + 0.02);
}

function tono({
  freq = 440,
  dur = 0.25,
  tipo = "sine",
  gain = 0.18,
  ataque = 0.008,
  glide = null,
  detune = 0,
}) {
  const ac = motor();
  if (!ac) return;
  const osc = ac.createOscillator();
  osc.type = tipo;
  osc.detune.value = detune;
  const g = ac.createGain();
  const t = ac.currentTime;
  osc.frequency.setValueAtTime(freq, t);
  if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/* ============================ VOCABULARIO SONORO ============================ */
/* Solo 12 sonidos en toda la app. Restriccion deliberada: un vocabulario
   corto y coherente se percibe como "diseñado"; uno largo, como ruido.   */

export const sonido = {
  /** Click mecanico de interruptor. Distinto tono al encender y al apagar. */
  click(encender = true) {
    ruido({ dur: 0.012, tipo: "highpass", freq: encender ? 2600 : 1900, gain: 0.34, decay: 0.02 });
    tono({ freq: encender ? 190 : 140, dur: 0.05, tipo: "triangle", gain: 0.1, glide: encender ? 120 : 90 });
  },

  /** Hover: casi imperceptible. Si se nota, esta mal calibrado. */
  roce() {
    ruido({ dur: 0.02, tipo: "bandpass", freq: rnd(3200, 4200), q: 2, gain: 0.035, decay: 0.03 });
  },

  /** Pulsacion de boton: la luz se comprime. */
  pulso() {
    tono({ freq: 320, dur: 0.07, tipo: "sine", gain: 0.09, glide: 210 });
    ruido({ dur: 0.01, tipo: "highpass", freq: 3000, gain: 0.12, decay: 0.02 });
  },

  /** Filamento calentandose: zumbido que sube. Se usa en la ignicion. */
  filamento(duracion = 1.6) {
    const ac = motor();
    if (!ac) return () => {};
    const osc = ac.createOscillator();
    const osc2 = ac.createOscillator();
    const g = ac.createGain();
    const filtro = ac.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 900;
    const t = ac.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(50, t);
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(100.7, t); // ligero desafine = zumbido real
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + duracion * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracion + 0.6);
    osc.connect(g);
    osc2.connect(g);
    g.connect(filtro).connect(master);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + duracion + 0.7);
    osc2.stop(t + duracion + 0.7);
    return () => {
      try {
        osc.stop();
        osc2.stop();
      } catch {
        /* ya detenido */
      }
    };
  },

  /** Cerilla raspando la lija. */
  raspar() {
    ruido({ dur: 0.09, tipo: "bandpass", freq: rnd(1400, 2600), q: 0.8, gain: 0.22, decay: 0.06 });
  },

  /** Ignicion de llama: golpe de aire. */
  llama() {
    ruido({ dur: 0.22, tipo: "lowpass", freq: 900, gain: 0.4, decay: 0.35 });
    tono({ freq: 620, dur: 0.35, tipo: "sine", gain: 0.06, glide: 180 });
  },

  /** Luz encendida: acorde calido de dos notas. El "sello" de SELENE. */
  luz() {
    tono({ freq: 523.25, dur: 1.5, tipo: "sine", gain: 0.13, ataque: 0.06 });
    tono({ freq: 659.25, dur: 1.9, tipo: "sine", gain: 0.09, ataque: 0.12, detune: -4 });
    tono({ freq: 1046.5, dur: 2.4, tipo: "sine", gain: 0.04, ataque: 0.3 });
  },

  /** Deteccion confirmada. El tono sube con la confianza del modelo. */
  deteccion(confianza = 0.8) {
    tono({ freq: 900 + confianza * 900, dur: 0.09, tipo: "sine", gain: 0.055, ataque: 0.004 });
  },

  /** Hoja de papel deslizandose (toasts, notas, recomendaciones). */
  papel() {
    ruido({ dur: 0.16, tipo: "highpass", freq: rnd(2200, 3400), gain: 0.09, decay: 0.12 });
  },

  /** Tecla de terminal CRT. */
  tecla() {
    ruido({ dur: 0.008, tipo: "bandpass", freq: rnd(1800, 3000), q: 1.5, gain: 0.09, decay: 0.015 });
  },

  /** Encendido de tubo de rayos catodicos: chasquido + silbido que se apaga. */
  crt() {
    ruido({ dur: 0.03, tipo: "highpass", freq: 4000, gain: 0.3, decay: 0.05 });
    const ac = motor();
    if (!ac) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime;
    osc.type = "sine";
    osc.frequency.setValueAtTime(15700, t); // frecuencia real de barrido horizontal
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.012, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 2);
  },

  /** Una linea de impresora matricial. Se encadena para "imprimir". */
  lineaImpresa() {
    ruido({ dur: 0.055, tipo: "bandpass", freq: rnd(700, 1300), q: 3, gain: 0.2, decay: 0.03 });
    tono({ freq: rnd(120, 170), dur: 0.06, tipo: "square", gain: 0.035 });
  },

  /** Alerta suave: nunca un pitido agresivo. */
  aviso() {
    tono({ freq: 392, dur: 0.5, tipo: "sine", gain: 0.1, ataque: 0.02 });
    setTimeout(() => tono({ freq: 329.63, dur: 0.7, tipo: "sine", gain: 0.08, ataque: 0.02 }), 130);
  },
};
