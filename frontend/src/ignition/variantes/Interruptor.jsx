import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista, TrazoGesto, origenDesde } from "../piezas.jsx";

const RECORRIDO = 78; // px de arrastre util
const CENTRO = RECORRIDO / 2; // punto de conmutacion del biestable
const PIVOTE_Y = 214; // eje de giro de la palanca, en coords del SVG
const LARGO = 74; // longitud de la palanca

/**
 * VARIANTE 2 · INTERRUPTOR DE PALANCA
 * -----------------------------------------------------------------
 * La clave para que se lea como palanca y no como un control deslizante:
 * visto de frente, una palanca NO se desplaza, gira sobre un pivote que
 * esta detras de la placa. Al pasar por el centro apunta hacia el
 * observador y se ve corta (escorzo). Por eso aqui no se anima una
 * posicion: se anima la punta de la palanca entre -1 y +1, y el cuerpo
 * se redibuja como un tronco conico entre el pivote y esa punta.
 *
 * Segundo detalle mecanico: es biestable. En cuanto cruza el centro, el
 * muelle interno lo termina de tirar y hace clic, aunque no lo sueltes.
 */
export default function Interruptor({ onEncender }) {
  const y = useMotionValue(0);
  const [listo, setListo] = useState(false);
  const ref = useRef(null);

  // -1 = abajo (apagado) · 0 = apuntando al observador · +1 = arriba
  const inclinacion = useTransform(y, [0, -RECORRIDO], [-1, 1]);
  const puntaY = useTransform(inclinacion, (v) => PIVOTE_Y - LARGO * v);

  /* Cuerpo de la palanca: tronco conico entre pivote y punta, con la
     punta redondeada. El flag de barrido se invierte segun el lado, si no
     la tapa se abombaria hacia dentro al apuntar hacia abajo.          */
  const cuerpo = useTransform(puntaY, (py) => {
    const arriba = py < PIVOTE_Y;
    const barrido = arriba ? 1 : 0;
    return `M104 ${PIVOTE_Y} L110.5 ${py} A 9.5 9.5 0 0 ${barrido} 129.5 ${py} L136 ${PIVOTE_Y} Z`;
  });
  const brillo = useTransform(puntaY, (py) => `M110 ${PIVOTE_Y - 4} L114.5 ${py + (py < PIVOTE_Y ? 4 : -4)}`);

  // Escorzo: al apuntar de frente la palanca casi desaparece y se ve la tapa
  const opacidadCuerpo = useTransform(inclinacion, [-1, -0.12, 0.12, 1], [1, 0.35, 0.35, 1]);
  const luz = useTransform(inclinacion, [-1, 0.2, 1], [0, 0.1, 1]);
  const haloEscala = useTransform(luz, [0, 1], [0.7, 1.6]);

  const conmutar = () => {
    if (listo) return;
    setListo(true);
    sonido.click(true);
    animate(y, -RECORRIDO, { type: "spring", stiffness: 900, damping: 26 });
    window.setTimeout(() => onEncender({ ...origenDesde(ref.current), kelvin: 3000 }), 300);
  };

  // Biestable: cruzar el centro dispara el mecanismo, se suelte o no
  useMotionValueEvent(y, "change", (v) => {
    if (!listo && v <= -CENTRO) conmutar();
  });

  const soltar = () => {
    if (listo) return;
    animate(y, 0, { type: "spring", stiffness: 1000, damping: 32 });
    sonido.click(false);
  };

  return (
    <div className="relative flex flex-col items-center">
      <motion.span
        aria-hidden
        style={{ opacity: luz, scale: haloEscala }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,196,107,0.65)_0%,transparent_66%)] blur-2xl"
      />

      <div ref={ref} className="relative">
        <svg width="240" height="430" viewBox="0 0 240 430" className="relative">
          <defs>
            <linearGradient id="placa" x1="0" y1="0" x2="0.35" y2="1">
              <stop offset="0%" stopColor="#232120" />
              <stop offset="52%" stopColor="#171514" />
              <stop offset="100%" stopColor="#0e0d0c" />
            </linearGradient>
            <linearGradient id="palanca" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5c5651" />
              <stop offset="26%" stopColor="#cfc7bd" />
              <stop offset="58%" stopColor="#8c847c" />
              <stop offset="100%" stopColor="#3d3936" />
            </linearGradient>
            <radialGradient id="hueco" cx="50%" cy="38%" r="70%">
              <stop offset="0%" stopColor="#000" />
              <stop offset="100%" stopColor="#151312" />
            </radialGradient>
          </defs>

          {/* Sombra de la placa sobre la pared */}
          <rect x="26" y="42" width="188" height="330" rx="12" fill="#000" opacity="0.55" style={{ filter: "blur(10px)" }} />

          {/* Placa */}
          <rect x="24" y="36" width="188" height="330" rx="11" fill="url(#placa)" />
          {/* Chaflan: luz arriba, sombra abajo. Sin esto la placa es plana. */}
          <path
            d="M35 366 L35 47 A 11 11 0 0 1 46 36 L190 36"
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="1.6"
          />
          <path
            d="M201 36 L201 355 A 11 11 0 0 1 190 366 L46 366"
            fill="none"
            stroke="rgba(0,0,0,0.65)"
            strokeWidth="1.6"
          />
          <rect x="35" y="47" width="166" height="308" rx="7" fill="none" stroke="rgba(255,255,255,0.05)" />

          {/* Tornillos: nunca quedan alineados entre si */}
          {[
            [118, 74, 22],
            [118, 328, -47],
          ].map(([cx, cy, giro]) => (
            <g key={cy}>
              <circle cx={cx} cy={cy} r="7" fill="#0b0a0a" />
              <circle cx={cx} cy={cy} r="7" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
              <line
                x1={cx - 4.6}
                y1={cy}
                x2={cx + 4.6}
                y2={cy}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="1.4"
                transform={`rotate(${giro} ${cx} ${cy})`}
              />
            </g>
          ))}

          {/* Ranura por la que sale la palanca */}
          <rect x="102" y="176" width="36" height="78" rx="18" fill="url(#hueco)" />
          <rect
            x="102"
            y="176"
            width="36"
            height="78"
            rx="18"
            fill="none"
            stroke="rgba(0,0,0,0.9)"
            strokeWidth="2"
          />
          <path d="M104 190 A 16 16 0 0 1 120 178" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.4" />

          {/* Palanca */}
          <motion.g style={{ opacity: opacidadCuerpo }}>
            <motion.path d={cuerpo} fill="url(#palanca)" />
            <motion.path d={brillo} stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" fill="none" />
          </motion.g>
          {/* Tapa de la punta: se queda visible aunque la palanca este de frente */}
          <motion.circle cx="120" cy={puntaY} r="9.5" fill="url(#palanca)" />
          <motion.ellipse cx="116" cy={puntaY} rx="3" ry="4" fill="rgba(255,255,255,0.4)" />

          {/* Casquillo: la palanca sale de detras de el, no flota sobre la placa */}
          <ellipse cx="120" cy={PIVOTE_Y} rx="17" ry="15" fill="#141211" />
          <ellipse cx="120" cy={PIVOTE_Y} rx="17" ry="15" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="1.4" />
          <path d="M106 209 A 16 12 0 0 1 134 209" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" />
        </svg>

        {/* Zona de arrastre: grande y transparente. Se agarra la palanca,
            pero el area util cubre toda la ranura. */}
        <motion.button
          drag={listo ? false : "y"}
          dragConstraints={{ top: -RECORRIDO, bottom: 0 }}
          dragElastic={0.04}
          dragMomentum={false}
          style={{ y }}
          onDragEnd={soltar}
          aria-label="Subir la palanca del interruptor"
          className="absolute left-1/2 top-[164px] h-[142px] w-[88px] -translate-x-1/2 cursor-grab rounded-full outline-none active:cursor-grabbing"
        />

        {!listo && (
          <svg className="pointer-events-none absolute -right-12 top-[150px] h-32 w-16" viewBox="0 0 60 120">
            <TrazoGesto d="M30 96 L30 30" />
            <TrazoGesto d="M18 44 L30 28 L42 44" retraso={2.6} />
          </svg>
        )}
      </div>

      <Pista>sube la palanca</Pista>
    </div>
  );
}
