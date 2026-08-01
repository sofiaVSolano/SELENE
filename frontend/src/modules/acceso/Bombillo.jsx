import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { CURVA, DUR, RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";
import { NIVELES } from "./fuerza.js";

/**
 * EL BOMBILLO
 * -----------------------------------------------------------------
 * La contraseña no se mide con una barrita de colores: se mide con luz.
 * El mismo objeto que da nombre al proyecto reacciona a lo que escribes.
 *
 *   0 · muy mala   -> apagado, el vidrio agrietado, rojo, titila.
 *   1 · débil      -> rojo, casi sin intensidad.
 *   2 · aceptable  -> naranja, empieza a alumbrar.
 *   3 · buena      -> ámbar, alumbra de verdad y late.
 *   4 · excelente  -> verde muy brillante, y aparece una cara.
 *
 * Sobre la cara: es dos arcos y una curva, en tinta al 45 % de opacidad y
 * de 1,4 px de grosor. Esa contención es lo que la separa de un emoji.
 * Parpadea cada pocos segundos y los ojos siguen al puntero un máximo de
 * 1,6 px — lo justo para que el ojo humano lo registre sin poder decir
 * exactamente qué se movió.
 */

const OJOS = { izq: 51, der: 69, y: 63 };

/** El vidrio roto sólo existe en el nivel más bajo. */
const GRIETAS = [
  "M40 44 L49 55 L44 62 L53 70",
  "M78 52 L70 60 L76 68",
  "M60 30 L57 42 L63 50 L59 60",
];

export default function Bombillo({ nivel = -1, escribiendo = false, terminado = false, tamano = 92 }) {
  const [saltando, setSaltando] = useState(false);
  const [parpadeo, setParpadeo] = useState(false);
  const nivelPrevio = useRef(nivel);

  const punteroX = useMotionValue(0);
  const ojoX = useSpring(punteroX, { stiffness: 120, damping: 18 });

  const encendido = nivel >= 1;
  const feliz = nivel === 4;
  const color = nivel < 0 ? "var(--ink-4)" : NIVELES[nivel].color;

  // Intensidad de la luz que emite el bombillo. Es una curva, no una rampa
  // lineal: entre "débil" y "aceptable" el salto perceptual debe notarse.
  const intensidad = nivel < 0 ? 0 : [0.06, 0.2, 0.48, 0.78, 1][nivel];

  /* --- Los ojos siguen al puntero, pero muy poco --- */
  useEffect(() => {
    if (!feliz) return undefined;
    const mover = (e) => {
      const centro = window.innerWidth / 2;
      punteroX.set(Math.max(-1.6, Math.min(1.6, ((e.clientX - centro) / centro) * 1.6)));
    };
    window.addEventListener("pointermove", mover);
    return () => window.removeEventListener("pointermove", mover);
  }, [feliz, punteroX]);

  /* --- Parpadeo con ritmo irregular: uno regular parece un LED --- */
  useEffect(() => {
    if (!feliz) return undefined;
    let id;
    const programar = () => {
      id = window.setTimeout(() => {
        setParpadeo(true);
        window.setTimeout(() => setParpadeo(false), 130);
        programar();
      }, 2600 + Math.random() * 3400);
    };
    programar();
    return () => window.clearTimeout(id);
  }, [feliz]);

  /* --- El salto de felicidad --- */
  useEffect(() => {
    const subio = nivel > nivelPrevio.current;
    nivelPrevio.current = nivel;
    if (nivel === 4 && subio) saltar();
  }, [nivel]);

  useEffect(() => {
    if (terminado && nivel === 4) saltar();
  }, [terminado, nivel]);

  function saltar() {
    setSaltando(true);
    sonido.confirmar();
    window.setTimeout(() => setSaltando(false), 620);
  }

  return (
    <div
      className="relative flex shrink-0 flex-col items-center"
      style={{ width: tamano }}
      aria-hidden
    >
      {/* Halo: la luz que el bombillo derrama sobre el papel */}
      <motion.span
        className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{ width: tamano * 2.1, height: tamano * 2.1, background: color }}
        animate={{ opacity: intensidad * 0.42, scale: encendido ? 1 : 0.7 }}
        transition={trans(DUR.bloom)}
      />

      <motion.svg
        viewBox="0 0 120 150"
        style={{ width: tamano, height: tamano * 1.25 }}
        className="relative overflow-visible"
        animate={
          saltando
            ? { y: [0, -16, 0, -5, 0], rotate: [0, -3, 2, -1, 0] }
            : escribiendo
              ? { y: [0, -1.5, 0] }
              : { y: 0, rotate: 0 }
        }
        transition={
          saltando
            ? { duration: 0.62, ease: CURVA.objeto, times: [0, 0.28, 0.55, 0.78, 1] }
            : { duration: 0.32, ease: "easeOut" }
        }
      >
        <defs>
          <radialGradient id="brilloBombillo" cx="50%" cy="46%" r="52%">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="55%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="vidrioBombillo" x1="30%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#f1ece4" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* Rayos: sólo cuando el bombillo alumbra de verdad */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
          <motion.line
            key={a}
            x1="60"
            y1="8"
            x2="60"
            y2="-4"
            stroke={color}
            strokeWidth="2.2"
            strokeLinecap="round"
            transform={`rotate(${a} 60 58)`}
            initial={false}
            animate={{
              opacity: nivel >= 3 ? [0.25, 0.8, 0.25] : 0,
              scaleY: nivel >= 3 ? 1 : 0.4,
            }}
            transition={{
              duration: 2.6,
              repeat: nivel >= 3 ? Infinity : 0,
              delay: i * 0.09,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "60px 8px" }}
          />
        ))}

        {/* Casquillo */}
        <path d="M47 96 h26 v9 h-26 z" fill="var(--ink-4)" />
        <path
          d="M46 105 h28 l-2 8 h-24 z M48 113 h24 l-2 8 h-20 z M50 121 h20 l-3 7 h-14 z"
          fill="var(--ink-3)"
        />

        {/* Luz interior */}
        <motion.circle
          cx="60"
          cy="58"
          r="40"
          fill="url(#brilloBombillo)"
          animate={
            nivel === 0
              ? { opacity: [0.55, 0.12, 0.5, 0.08, 0.42] } // el titileo del vidrio roto
              : { opacity: intensidad }
          }
          transition={
            nivel === 0
              ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
              : trans(DUR.bloom)
          }
        />

        {/* Vidrio */}
        <path
          d="M60 12 c-22 0 -39 17.5 -39 39 0 15.5 8.5 24.5 14.5 32 4 5 6.5 9 6.5 13 h36 c0-4 2.5-8 6.5-13 6-7.5 14.5-16.5 14.5-32 0-21.5-17-39-39-39 z"
          fill="url(#vidrioBombillo)"
          fillOpacity="0.5"
          stroke="var(--ink-4)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        {/* Reflejo especular fijo: sin él, el vidrio parece plástico */}
        <path
          d="M38 40 c3-11 11-18 20-20"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3.4"
          strokeLinecap="round"
          opacity="0.85"
        />

        {/* Filamento: se apaga cuando aparece la cara, para no competir */}
        <motion.path
          d="M45 82 L45 64 L52 78 L60 60 L68 78 L75 64 L75 82"
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
          animate={{
            opacity: feliz ? 0.22 : nivel < 0 ? 0.35 : 0.45 + intensidad * 0.55,
          }}
          transition={trans(DUR.ui)}
          style={{ filter: encendido ? `drop-shadow(0 0 5px ${color})` : "none" }}
        />

        {/* Grietas: el vidrio roto del nivel más bajo */}
        <AnimatePresence>
          {nivel === 0 && (
            <motion.g
              key="grietas"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={trans(DUR.ui)}
            >
              {GRIETAS.map((d, i) => (
                <motion.path
                  key={d}
                  d={d}
                  fill="none"
                  stroke="var(--clay)"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.34, delay: i * 0.07, ease: CURVA.luz }}
                  opacity="0.85"
                />
              ))}
            </motion.g>
          )}
        </AnimatePresence>

        {/* La cara. Sólo en "excelente". */}
        <AnimatePresence>
          {feliz && (
            <motion.g
              key="cara"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 0.45, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ ...trans(DUR.ui), delay: 0.12 }}
              stroke="var(--ink)"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
            >
              <motion.g style={{ x: ojoX }}>
                <motion.line
                  x1={OJOS.izq}
                  y1={OJOS.y - 2.5}
                  x2={OJOS.izq}
                  y2={OJOS.y + 2.5}
                  animate={{ scaleY: parpadeo ? 0.08 : 1 }}
                  transition={{ duration: 0.09 }}
                  style={{ transformOrigin: `${OJOS.izq}px ${OJOS.y}px` }}
                />
                <motion.line
                  x1={OJOS.der}
                  y1={OJOS.y - 2.5}
                  x2={OJOS.der}
                  y2={OJOS.y + 2.5}
                  animate={{ scaleY: parpadeo ? 0.08 : 1 }}
                  transition={{ duration: 0.09 }}
                  style={{ transformOrigin: `${OJOS.der}px ${OJOS.y}px` }}
                />
              </motion.g>

              <motion.path
                d="M52 72 q8 7 16 0"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.2, ease: CURVA.luz }}
              />
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>

      {/* Etiqueta del nivel: cambia con un pequeño desplazamiento vertical */}
      <div className="relative mt-1 h-4 w-full overflow-hidden">
        <AnimatePresence mode="wait">
          {nivel >= 0 && (
            <motion.p
              key={nivel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={RESORTE.firme}
              className="absolute inset-x-0 text-center font-mono text-[9.5px] uppercase tracking-[0.2em]"
              style={{ color }}
            >
              {NIVELES[nivel].etiqueta}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
