/**
 * GRAMÁTICA DE MOVIMIENTO
 * -----------------------------------------------------------------
 * Un solo archivo decide cómo se mueve SELENE entera. Si una pantalla
 * necesita una curva o una duración que no está aquí, casi siempre es
 * que la pantalla está mal, no que falte un token.
 *
 * Dos curvas, heredadas del sistema "Papel y Luz":
 *   LUZ    -> sube rápido y muere lento. Todo lo que ilumina, aparece o
 *             se desvanece usa esta.
 *   OBJETO -> tiene peso y rebota un poco. Todo lo que se puede tocar
 *             (botones, tarjetas, el bombillo) usa esta.
 *
 * Todas las duraciones viven entre 250 ms y 500 ms salvo dos excepciones
 * deliberadas: las micro-respuestas al puntero (120 ms, por debajo del
 * umbral de "esperar") y las transiciones de escena completa (700 ms+,
 * porque cambiar de contexto sí debe costar).
 */

export const CURVA = {
  luz: [0.22, 1, 0.36, 1],
  objeto: [0.34, 1.36, 0.64, 1],
};

export const DUR = {
  micro: 0.12,
  ui: 0.28,
  entrada: 0.42,
  bloom: 0.7,
  escena: 1.1,
};

/** Resortes. Nunca instanciar uno nuevo a ojo: elegir de aquí. */
export const RESORTE = {
  /** Interfaz que responde al dedo: rápido, sin rebote perceptible. */
  firme: { type: "spring", stiffness: 420, damping: 34 },
  /** Objetos con masa: el bombillo, las tarjetas al entrar. */
  objeto: { type: "spring", stiffness: 260, damping: 22 },
  /** Cosas que celebran: el salto del bombillo. */
  alegre: { type: "spring", stiffness: 520, damping: 12, mass: 0.6 },
};

export const trans = (duration = DUR.entrada, delay = 0) => ({
  duration,
  delay,
  ease: CURVA.luz,
});

/**
 * Entrada estándar: nada aparece de golpe, todo llega desde abajo con la
 * luz subiendo. `i` escalona elementos hermanos.
 */
export const entrada = (i = 0, y = 14) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: y * -0.5 },
  transition: trans(DUR.entrada, i * 0.055),
});

/** Contenedor que reparte la entrada entre sus hijos. */
export const escalonado = (retraso = 0.06) => ({
  initial: {},
  animate: { transition: { staggerChildren: retraso, delayChildren: 0.05 } },
});

export const hijo = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: trans(DUR.entrada) },
};

/**
 * Transición entre pantallas internas: la luz cambia de sala.
 *
 * Deliberadamente sin `filter: blur`. Queda precioso, pero una de estas
 * pantallas contiene vídeo en vivo y desenfocar una capa a pantalla completa
 * durante medio segundo tira fotogramas justo cuando el usuario está mirando
 * si la aplicación es fluida. Opacidad y desplazamiento van al compositor y no
 * cuestan nada.
 */
export const escena = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: trans(0.5) },
  exit: { opacity: 0, y: -6, transition: trans(DUR.ui) },
};

/** Respuesta táctil compartida por todo lo pulsable. */
export const tactil = {
  whileHover: { y: -1.5 },
  whileTap: { y: 0, scale: 0.985 },
  transition: RESORTE.firme,
};

/** ¿El usuario pidió menos movimiento? Respetarlo no es opcional. */
export function menosMovimiento() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
