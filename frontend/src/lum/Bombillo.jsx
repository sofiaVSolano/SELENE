import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * LUM · la mascota de SELENE
 * -----------------------------------------------------------------
 * Un bombillo pequeño que respira. No es un icono con animaciones pegadas:
 * es un objeto con estados internos que se combinan, y de esa combinación
 * sale la personalidad.
 *
 * Lo que lo hace sentir vivo, en orden de importancia:
 *
 *   1. **Nunca está quieto.** Aunque no pase nada, flota y la intensidad de
 *      su luz sube y baja en un ciclo lento (`respiracion`). Un elemento
 *      perfectamente inmóvil se lee como una imagen; uno que deriva medio
 *      píxel se lee como un ser.
 *   2. **Mira.** Las pupilas siguen un punto del mundo (`mirandoA`), y el
 *      cuerpo se inclina un poco hacia allá. Cuando el recorrido señala una
 *      sección, Lum la mira de verdad — no gira un puntero, dirige la
 *      atención, que es lo que hace un guía.
 *   3. **Parpadea a destiempo.** Con intervalo aleatorio y algún parpadeo
 *      doble. Un parpadeo regular es un metrónomo y delata la máquina.
 *   4. **El filamento es la boca.** No hay una boca dibujada aparte: la
 *      curva que sonríe ES el filamento del bombillo. Ese detalle es el que
 *      lo mantiene siendo un objeto de SELENE y no una carita genérica.
 *
 * Todos los colores salen de la fuente de luz global (`--light-rgb`) y de la
 * paleta ámbar del sistema. Cero azul, igual que el resto de la aplicación.
 */

/* Los estados de ánimo no son decorativos: cada uno cambia curvatura de boca,
   apertura de ojos e intensidad del halo a la vez. Un solo nombre mueve las
   tres cosas, que es lo que evita combinaciones incoherentes. */
const ANIMOS = {
  durmiendo: { boca: 0, ojos: 0.06, halo: 0.25, cejas: 0 },
  neutral: { boca: 0.28, ojos: 1, halo: 0.7, cejas: 0 },
  contento: { boca: 1, ojos: 0.92, halo: 1, cejas: 0.15 },
  explicando: { boca: 0.5, ojos: 1, halo: 0.85, cejas: 0.05 },
  atento: { boca: 0.18, ojos: 1.08, halo: 0.78, cejas: 0.3 },
  despidiendo: { boca: 1, ojos: 0.5, halo: 1.25, cejas: 0.2 },
  /* `boca` negativa curva el filamento hacia arriba: la única forma de que
     Lum dude sin dibujarle una boca aparte. Se usa cuando encuentra algo
     que no cuadra —una sala vacía con la luz puesta— y por eso el halo baja
     un poco: está pensando, no alarmando. */
  pensativo: { boca: -0.3, ojos: 0.84, halo: 0.62, cejas: 0.45 },
  /* Celebrando: sonrisa más ancha que `contento` y ojos entrecerrados de
     gusto, con el halo por encima de 1 (la alegría se ve antes de leerse). */
  celebrando: { boca: 1.3, ojos: 0.52, halo: 1.4, cejas: 0.18 },
};

export default function Bombillo({
  tamano = 74,
  animo = "neutral",
  hablando = false,
  /** Punto de la pantalla que Lum debe mirar, en px de viewport. */
  mirandoA = null,
  /** 0..1 — cuánto se ha formado desde las partículas. Gobierna la entrada. */
  formacion = 1,
}) {
  const objetivo = ANIMOS[animo] ?? ANIMOS.neutral;
  const [parpadeo, setParpadeo] = useState(1);
  const contenedor = useRef(null);

  /* --- Parpadeo con ritmo irregular, y a veces doble --- */
  useEffect(() => {
    if (formacion < 0.98) return undefined;
    let vivo = true;
    let id;

    const cerrarYAbrir = (alTerminar) => {
      setParpadeo(0);
      window.setTimeout(() => {
        if (!vivo) return;
        setParpadeo(1);
        alTerminar?.();
      }, 82);
    };

    const programar = () => {
      // Entre 2,6 y 6,4 s: lo bastante irregular para no leerse como reloj.
      id = window.setTimeout(() => {
        if (!vivo) return;
        const doble = Math.random() < 0.22;
        cerrarYAbrir(doble ? () => window.setTimeout(() => vivo && cerrarYAbrir(), 150) : undefined);
        programar();
      }, 2600 + Math.random() * 3800);
    };

    programar();
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [formacion]);

  /* --- La mirada: las pupilas persiguen el punto, con inercia --- */
  const miradaX = useMotionValue(0);
  const miradaY = useMotionValue(0);
  const px = useSpring(miradaX, { stiffness: 170, damping: 18 });
  const py = useSpring(miradaY, { stiffness: 170, damping: 18 });
  // El cuerpo se inclina hacia donde mira: la cabeza sigue a los ojos.
  const inclinacion = useTransform(px, [-2.6, 2.6], [-7, 7]);

  useEffect(() => {
    if (!mirandoA || !contenedor.current) {
      miradaX.set(0);
      miradaY.set(0);
      return;
    }
    const r = contenedor.current.getBoundingClientRect();
    const dx = mirandoA.x - (r.left + r.width / 2);
    const dy = mirandoA.y - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1;
    // Recorrido corto: un ojo que se va al borde parece bizco, no atento.
    const alcance = 2.6;
    miradaX.set((dx / dist) * alcance);
    miradaY.set((dy / dist) * alcance * 0.7);
  }, [mirandoA, miradaX, miradaY]);

  const ojoAbierto = objetivo.ojos * parpadeo * formacion;
  const s = tamano / 100; // el viewBox es 100x100; todo se escala desde ahí

  return (
    <div
      ref={contenedor}
      className="pointer-events-none relative"
      style={{ width: tamano, height: tamano }}
      aria-hidden
    >
      {/* Halo: la luz que Lum emite sobre el papel. Respira siempre. */}
      <motion.span
        className="absolute left-1/2 top-1/2 block rounded-full"
        style={{
          width: tamano * 2.6,
          height: tamano * 2.6,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgb(var(--light-rgb) / 0.55) 0%, rgb(var(--light-rgb) / 0.18) 34%, transparent 68%)",
          filter: "blur(6px)",
        }}
        animate={{
          opacity: [
            objetivo.halo * 0.62 * formacion,
            objetivo.halo * 0.95 * formacion,
            objetivo.halo * 0.62 * formacion,
          ],
          scale: hablando ? [1, 1.09, 1] : [0.97, 1.04, 0.97],
        }}
        transition={{
          duration: hablando ? 1.5 : 4.6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <motion.svg
        viewBox="0 0 100 100"
        className="relative h-full w-full overflow-visible"
        style={{ rotate: inclinacion }}
        animate={
          hablando
            ? { y: [0, -1.6, 0, -1, 0] } // asiente muy poco mientras habla
            : { y: [0, -2.4, 0] } // flota en reposo
        }
        transition={{
          duration: hablando ? 2.1 : 5.2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <defs>
          <radialGradient id="lum-vidrio" cx="42%" cy="36%" r="68%">
            <stop offset="0%" stopColor="rgb(var(--light-rgb))" stopOpacity="0.95" />
            <stop offset="52%" stopColor="#ffd98a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffb020" stopOpacity="0.22" />
          </radialGradient>
          <linearGradient id="lum-rosca" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ink-4)" />
            <stop offset="100%" stopColor="var(--ink-3)" />
          </linearGradient>
        </defs>

        {/* --- Rosca: se dibuja antes que el vidrio para quedar detrás --- */}
        <motion.g
          animate={{ opacity: formacion }}
          transition={{ duration: 0.4 }}
        >
          <rect x="42" y="72" width="16" height="15" rx="3.4" fill="url(#lum-rosca)" />
          <path
            d="M42 77 Q50 79.6 58 77 M42 81.4 Q50 84 58 81.4"
            stroke="var(--paper)"
            strokeWidth="1.1"
            fill="none"
            opacity="0.6"
          />
          <path d="M45 87 L55 87 L52.6 91 L47.4 91 Z" fill="var(--ink-3)" />
        </motion.g>

        {/* --- Vidrio --- */}
        <motion.circle
          cx="50"
          cy="45"
          r="30"
          fill="url(#lum-vidrio)"
          stroke="rgb(var(--light-rgb) / 0.85)"
          strokeWidth="1.5"
          animate={{ scale: formacion, opacity: formacion }}
          style={{ transformOrigin: "50px 45px" }}
          transition={{ type: "spring", stiffness: 190, damping: 15 }}
        />
        {/* Brillo especular: le da volumen de vidrio, no de círculo plano */}
        <ellipse cx="38" cy="32" rx="8.5" ry="6" fill="#fff" opacity={0.5 * formacion} transform="rotate(-28 38 32)" />

        {/* --- Ojos ---
            `initial` no es decorativo: sin un valor de partida framer intenta
            interpolar `ry` desde el atributo que el elemento no tiene todavía
            y escribe literalmente "undefined" en el SVG (el navegador lo
            rechaza y lo grita por consola). De paso hace lo que queremos: los
            ojos se abren, no aparecen abiertos. */}
        <motion.g style={{ x: px, y: py }}>
          {[38, 62].map((cx) => (
            <motion.ellipse
              key={cx}
              cx={cx}
              cy={44}
              rx={4.4}
              fill="var(--ink)"
              initial={{ ry: 0.35 }}
              animate={{ ry: 5.6 * ojoAbierto + 0.35 }}
              transition={{ duration: 0.09, ease: "easeOut" }}
            />
          ))}
          {/* Chispa del ojo: sin esto la mirada es opaca y algo inquietante */}
          {[39.6, 63.6].map((cx) => (
            <motion.circle
              key={cx}
              cx={cx}
              cy={42}
              r={1.35}
              fill="#fff"
              animate={{ opacity: ojoAbierto > 0.5 ? 0.92 : 0 }}
              transition={{ duration: 0.09 }}
            />
          ))}
        </motion.g>

        {/* --- Cejas: sutiles, solo aparecen cuando hay que enfatizar --- */}
        {objetivo.cejas > 0.02 && (
          <motion.g
            stroke="var(--ink-2)"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: objetivo.cejas * 2.2 * formacion }}
            transition={{ duration: 0.35 }}
          >
            {/* Mismo motivo que en los ojos: se parte de la ceja en reposo
                (cejas = 0) y se levanta hasta la del ánimo. */}
            <motion.path
              initial={{ d: "M33 36 Q38 33 43 36" }}
              animate={{ d: `M33 ${36 - objetivo.cejas * 3} Q38 ${33 - objetivo.cejas * 4} 43 ${36 - objetivo.cejas * 3}` }}
            />
            <motion.path
              initial={{ d: "M57 36 Q62 33 67 36" }}
              animate={{ d: `M57 ${36 - objetivo.cejas * 3} Q62 ${33 - objetivo.cejas * 4} 67 ${36 - objetivo.cejas * 3}` }}
            />
          </motion.g>
        )}

        {/* --- La boca ES el filamento. Los dos soportes lo sostienen. --- */}
        <motion.g
          animate={{ opacity: formacion }}
          stroke="rgb(var(--light-rgb))"
          strokeWidth="2.1"
          strokeLinecap="round"
          fill="none"
          style={{ filter: "drop-shadow(0 0 4px rgb(var(--light-rgb) / 0.9))" }}
        >
          <motion.path
            // Arranca recto (el filamento frío) y se curva hacia el ánimo.
            initial={{ d: "M40 57 Q50 57 60 57" }}
            animate={{
              // La curvatura de la sonrisa sale del ánimo; al hablar, oscila.
              d: `M40 57 Q50 ${57 + objetivo.boca * 9} 60 57`,
            }}
            transition={{ type: "spring", stiffness: 150, damping: 16 }}
          />
          <path d="M40 57 L38 66 M60 57 L62 66" opacity="0.45" />
        </motion.g>
      </motion.svg>
    </div>
  );
}
