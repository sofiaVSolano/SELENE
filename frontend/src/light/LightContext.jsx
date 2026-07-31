import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * MOTOR DE LUZ
 * -----------------------------------------------------------------
 * Toda SELENE se ilumina desde UNA sola fuente. Este provider es esa
 * fuente: posición, intensidad y temperatura de color (kelvin).
 *
 * No renderiza nada. Escribe custom properties en <html> y el sistema
 * de diseño (index.css) deriva de ellas cada sombra, halo y degradado.
 * Consecuencia: cuando el modulo de vision mide mas luz natural, la
 * interfaz entera se re-ilumina fisicamente. La luz es el dato.
 */

const LightCtx = createContext(null);

/** Kelvin -> RGB (aproximacion de Tanner Helland, suficiente y barata). */
export function kelvinToRgb(kelvin) {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r, g, b;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;

  const clamp = (v) => Math.round(Math.min(255, Math.max(0, v)));
  return [clamp(r), clamp(g), clamp(b)];
}

/** Temperatura de color "natural" segun la hora local real. */
export function kelvinDeLaHora(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  // noche cerrada -> luz de luna fria y tenue; mediodia -> luz de dia
  if (h < 5 || h >= 21) return 6100;
  if (h < 7) return 2400; // amanecer
  if (h < 10) return 4200;
  if (h < 16) return 5600; // dia pleno
  if (h < 19) return 3400; // tarde
  return 2600; // atardecer / lampara
}

export function intensidadDeLaHora(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 5 || h >= 22) return 0.3;
  if (h < 7) return 0.5;
  if (h < 18) return 0.92;
  if (h < 20) return 0.7;
  return 0.45;
}

const ESTADO_INICIAL = {
  x: 0.5,
  y: 0.1,
  intensity: 0,
  kelvin: 2700,
};

export function LightProvider({ children }) {
  const [light, setLight] = useState(ESTADO_INICIAL);
  const [encendida, setEncendida] = useState(false);
  const raf = useRef(0);
  const actual = useRef({ ...ESTADO_INICIAL });
  const objetivo = useRef({ ...ESTADO_INICIAL });

  // Interpolacion suave y continua: la luz nunca "salta", siempre transita.
  useEffect(() => {
    objetivo.current = light;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;

    const escribir = (s) => {
      const [r, g, b] = kelvinToRgb(s.kelvin);
      root.style.setProperty("--light-x", s.x.toFixed(4));
      root.style.setProperty("--light-y", s.y.toFixed(4));
      root.style.setProperty("--light-i", s.intensity.toFixed(4));
      root.style.setProperty("--light-k", Math.round(s.kelvin));
      root.style.setProperty("--light-rgb", `${r} ${g} ${b}`);
    };

    if (reduce) {
      actual.current = { ...light };
      escribir(light);
      return undefined;
    }

    const tick = () => {
      const a = actual.current;
      const o = objetivo.current;
      const k = 0.085; // inercia de la luz
      a.x += (o.x - a.x) * k;
      a.y += (o.y - a.y) * k;
      a.intensity += (o.intensity - a.intensity) * k;
      a.kelvin += (o.kelvin - a.kelvin) * (k * 0.7);
      escribir(a);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [light]);

  /** Mueve la fuente de luz. Acepta valores parciales. */
  const iluminar = useCallback((parcial) => {
    setLight((prev) => ({ ...prev, ...parcial }));
  }, []);

  /**
   * Enciende la app desde el punto exacto donde el usuario hizo el gesto.
   * La luz de la ignicion SE CONVIERTE en la luz ambiente de la sesion:
   * si encendiste el fosforo a la izquierda, la landing queda iluminada
   * desde la izquierda. Continuidad fisica entre pantallas.
   */
  const encender = useCallback((origen = {}) => {
    setEncendida(true);
    setLight((prev) => ({
      x: origen.x ?? prev.x,
      y: origen.y ?? prev.y,
      intensity: origen.intensity ?? 0.85,
      kelvin: origen.kelvin ?? kelvinDeLaHora(),
    }));
  }, []);

  /** Pulso breve de luz: feedback fisico para acciones importantes. */
  const destello = useCallback((fuerza = 0.35, ms = 420) => {
    setLight((prev) => ({ ...prev, intensity: Math.min(1, prev.intensity + fuerza) }));
    window.setTimeout(() => {
      setLight((prev) => ({ ...prev, intensity: Math.max(0, prev.intensity - fuerza) }));
    }, ms);
  }, []);

  /** Parpadeo de fallo: la sala reacciona a un error, en vez de un toast rojo. */
  const parpadeo = useCallback(() => {
    const pasos = [0.25, 0.9, 0.35, 1, 0.8];
    pasos.forEach((factor, i) => {
      window.setTimeout(() => {
        setLight((prev) => ({ ...prev, intensity: prev.intensity * factor + 0.05 }));
      }, i * 85);
    });
  }, []);

  const valor = useMemo(
    () => ({ light, encendida, iluminar, encender, destello, parpadeo, setEncendida }),
    [light, encendida, iluminar, encender, destello, parpadeo]
  );

  return <LightCtx.Provider value={valor}>{children}</LightCtx.Provider>;
}

export function useLight() {
  const ctx = useContext(LightCtx);
  if (!ctx) throw new Error("useLight debe usarse dentro de <LightProvider>");
  return ctx;
}
