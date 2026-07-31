import { motion, useTransform } from "framer-motion";

/**
 * LA HABITACION
 * -----------------------------------------------------------------
 * La landing no describe la herramienta: la ejecuta. Es una seccion de
 * una sala real dibujada como un plano tecnico, y el scroll mueve el sol.
 * En 15 segundos el visitante ve el producto entero funcionando —
 * entra luz natural, el sistema la detecta, apaga luminarias, la persona
 * se va, el consumo cae— sin leer un parrafo.
 *
 * Todo se deriva de una sola MotionValue `t` (0..1). Nada usa estado de
 * React por frame: el SVG se anima en el compositor.
 */

const TINTA = "#c3bcb2";
const TINTA_FUERTE = "#6b6257";

/** Corchetes de deteccion: se dibujan solos, como los del modelo real. */
function Marco({ x, y, w, h, activo, etiqueta, confianza, color = "#ffb020" }) {
  const l = 18;
  const esquinas = [
    `M${x} ${y + l} L${x} ${y} L${x + l} ${y}`,
    `M${x + w - l} ${y} L${x + w} ${y} L${x + w} ${y + l}`,
    `M${x + w} ${y + h - l} L${x + w} ${y + h} L${x + w - l} ${y + h}`,
    `M${x + l} ${y + h} L${x} ${y + h} L${x} ${y + h - l}`,
  ];

  return (
    <motion.g style={{ opacity: activo }}>
      {esquinas.map((d) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <text
        x={x}
        y={y - 12}
        fill={color}
        fontSize="13"
        fontFamily="'Geist Mono Variable', monospace"
        letterSpacing="1.6"
      >
        {etiqueta}
        <tspan fill={TINTA_FUERTE} dx="10">
          {confianza}
        </tspan>
      </text>
    </motion.g>
  );
}

/** Luminaria de techo con su cono de luz. Se apaga en el instante indicado. */
function Luminaria({ x, t, apaga }) {
  const encendida = useTransform(t, [apaga - 0.05, apaga], [1, 0]);
  const opacidadCono = useTransform(encendida, [0, 1], [0, 0.5]);
  const opacidadHalo = useTransform(encendida, [0, 1], [0, 0.25]);

  return (
    <g>
      <line x1={x} y1="80" x2={x} y2="168" stroke={TINTA} strokeWidth="1.5" />
      <path
        d={`M${x - 34} 210 L${x} 168 L${x + 34} 210 Z`}
        fill="none"
        stroke={TINTA_FUERTE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Cono proyectado */}
      <motion.path
        d={`M${x - 30} 212 L${x + 30} 212 L${x + 132} 600 L${x - 132} 600 Z`}
        fill="url(#gradCono)"
        style={{ opacity: opacidadCono }}
      />
      {/* Filamento */}
      <motion.circle cx={x} cy="204" r="7" fill="#ffd98a" style={{ opacity: encendida }} />
      <motion.circle cx={x} cy="204" r="20" fill="#ffb020" style={{ opacity: opacidadHalo }} />
    </g>
  );
}

export default function Habitacion({ t }) {
  /* --- Sol: recorre un arco visible a traves de la ventana --- */
  const solX = useTransform(t, [0, 1], [1180, 900]);
  const solY = useTransform(t, [0, 0.5, 1], [420, 150, 400]);
  const solOpacidad = useTransform(t, [0, 0.08, 0.9, 1], [0, 1, 1, 0.35]);
  const cieloAlto = useTransform(t, [0, 0.25, 0.5, 0.8, 1], ["#2a2216", "#f0c48a", "#dff0fb", "#f6c98f", "#3a2b1c"]);
  const cieloBajo = useTransform(t, [0, 0.25, 0.5, 0.8, 1], ["#4a3a22", "#ffd9a0", "#f4fbff", "#ffb072", "#5c4126"]);

  /* --- Haz de luz natural: entra por la ventana y barre el piso --- */
  const hazOpacidad = useTransform(t, [0.08, 0.3, 0.72, 0.92], [0, 0.85, 0.85, 0]);
  const hazIzq = useTransform(t, [0.1, 0.5, 0.9], [180, 620, 300]);
  const hazDer = useTransform(t, [0.1, 0.5, 0.9], [560, 900, 640]);
  const haz = useTransform([hazIzq, hazDer], ([a, b]) => `M900 168 L1086 168 L${b} 600 L${a} 600 Z`);

  /* --- Detecciones: aparecen cuando el modelo "las ve" --- */
  const marcoVentana = useTransform(t, [0.17, 0.22], [0, 1]);
  const marcoLuminarias = useTransform(t, [0.33, 0.38], [0, 1]);
  const marcoPersona = useTransform(t, [0.1, 0.14, 0.6, 0.64], [0, 1, 1, 0]);

  /* --- La persona trabaja y luego se va --- */
  const personaX = useTransform(t, [0.6, 0.72], [0, -320]);
  const personaOpacidad = useTransform(t, [0.05, 0.1, 0.62, 0.7], [0, 1, 1, 0]);

  /* --- Calidez global de la escena --- */
  const calidez = useTransform(t, [0, 0.45, 1], [0.32, 0.04, 0.28]);

  return (
    <svg viewBox="0 0 1200 720" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="gradCielo" x1="0" y1="0" x2="0" y2="1">
          <motion.stop offset="0%" style={{ stopColor: cieloAlto }} />
          <motion.stop offset="100%" style={{ stopColor: cieloBajo }} />
        </linearGradient>
        <linearGradient id="gradHaz" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#fff3d6" stopOpacity="0.92" />
          <stop offset="55%" stopColor="#ffd98a" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#ffb020" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="gradCono" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#ffc46b" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
        </linearGradient>
        <clipPath id="recorteVentana">
          <rect x="900" y="168" width="186" height="262" rx="2" />
        </clipPath>
        <filter id="difuso" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* Exterior visto por la ventana */}
      <g clipPath="url(#recorteVentana)">
        <rect x="900" y="168" width="186" height="262" fill="url(#gradCielo)" />
        <motion.circle cx={solX} cy={solY} r="26" fill="#fff6e2" style={{ opacity: solOpacidad }} filter="url(#difuso)" />
        <motion.circle cx={solX} cy={solY} r="13" fill="#fffdf7" style={{ opacity: solOpacidad }} />
      </g>

      {/* Haz de luz natural sobre el piso */}
      <motion.path d={haz} fill="url(#gradHaz)" style={{ opacity: hazOpacidad }} filter="url(#difuso)" />

      {/* Arquitectura: linea fina, como un plano */}
      <g stroke={TINTA_FUERTE} strokeWidth="2" fill="none" strokeLinecap="square">
        <path d="M100 80 L1100 80" />
        <path d="M100 80 L100 600" />
        <path d="M1100 80 L1100 600" />
        <path d="M60 600 L1140 600" />
      </g>
      {/* Marco de la ventana */}
      <g stroke={TINTA_FUERTE} strokeWidth="2.5" fill="none">
        <rect x="900" y="168" width="186" height="262" rx="2" />
        <path d="M993 168 L993 430 M900 299 L1086 299" strokeWidth="1.5" />
      </g>

      <Luminaria x={262} t={t} apaga={0.44} />
      <Luminaria x={470} t={t} apaga={0.5} />
      <Luminaria x={678} t={t} apaga={0.68} />

      {/* Escritorio */}
      <g stroke={TINTA_FUERTE} strokeWidth="2" fill="none" strokeLinejoin="round">
        <path d="M420 488 L700 488 L700 496 L420 496 Z" />
        <path d="M436 496 L436 600 M684 496 L684 600" />
        {/* Monitor */}
        <path d="M520 424 L610 424 L610 486 L520 486 Z" />
        <path d="M560 486 L560 488" />
      </g>

      {/* Persona */}
      <motion.g style={{ x: personaX, opacity: personaOpacidad }}>
        <g stroke={TINTA_FUERTE} strokeWidth="2.4" fill="none" strokeLinecap="round">
          <circle cx="352" cy="404" r="21" />
          <path d="M352 425 L352 512" />
          <path d="M352 446 L392 470" />
          <path d="M352 512 L330 600 M352 512 L378 600" />
        </g>
        <Marco x={306} y={370} w={104} h={244} activo={marcoPersona} etiqueta="PERSONA" confianza="0.96" color="#3e9b6b" />
      </motion.g>

      <Marco x={884} y={152} w={218} h={294} activo={marcoVentana} etiqueta="VENTANA" confianza="0.94" />
      <Marco x={222} y={158} w={512} h={72} activo={marcoLuminarias} etiqueta="LUMINARIAS ×3" confianza="0.91" />

      {/* Temperatura ambiente de la escena: la sala entera se tiñe */}
      <motion.rect
        x="0"
        y="0"
        width="1200"
        height="720"
        fill="#ff9a2e"
        style={{ opacity: calidez, mixBlendMode: "multiply" }}
        pointerEvents="none"
      />
    </svg>
  );
}
