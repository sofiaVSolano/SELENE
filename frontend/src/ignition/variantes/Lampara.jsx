import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista, TrazoGesto, origenDesde } from "../piezas.jsx";

const TIRON_MINIMO = 46;
const CADENA_Y = 178; // donde nace la cadena, bajo el portalamparas
const CADENA_LARGO = 84; // largo en reposo

/**
 * VARIANTE 6 · LAMPARA DE ESCRITORIO
 * -----------------------------------------------------------------
 * Lampara de cuello de cisne con cadenilla de tiro. Todo vive dentro del
 * mismo SVG (incluido el cono de luz) para que nada se desalinee al
 * cambiar de tamaño la ventana.
 *
 * La cadena no es una linea: es un trazo punteado con extremos redondos,
 * asi cada guion se lee como una cuenta metalica y se estira sola al tirar.
 *
 * Si el tiron es corto, la cadena rebota con inercia y la lampara no
 * enciende: el sistema dice "un poco mas" con fisica, no con un error.
 */
export default function Lampara({ onEncender }) {
  const y = useMotionValue(0);
  const [encendida, setEncendida] = useState(false);
  const [flojo, setFlojo] = useState(false);
  const ref = useRef(null);

  const finCadena = useTransform(y, (v) => CADENA_Y + CADENA_LARGO + v);

  /* El cono tiene UNA sola fuente de opacidad. Mientras se tira, insinua
     luz segun la tension; al encender, se anima a fondo. Mezclar `style`
     y `animate` sobre la misma propiedad es lo que produce parpadeos. */
  const luzCono = useMotionValue(0.05);
  useMotionValueEvent(y, "change", (v) => {
    if (!encendida) luzCono.set(0.05 + Math.min(1, v / 96) * 0.25);
  });

  const soltar = () => {
    if (encendida) return;
    const tiron = y.get();
    // Rebote elastico de cadena real: oscila, no vuelve seco
    animate(y, 0, { type: "spring", stiffness: 260, damping: 8.5, mass: 0.7 });

    if (tiron >= TIRON_MINIMO) {
      setEncendida(true);
      sonido.click(true);
      animate(luzCono, 1, { duration: 0.85, ease: [0.22, 1, 0.36, 1] });
      window.setTimeout(() => onEncender({ ...origenDesde(ref.current), y: 0.36, kelvin: 2600 }), 220);
    } else {
      setFlojo(true);
      sonido.click(false);
      window.setTimeout(() => setFlojo(false), 1400);
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      <div ref={ref} className="relative">
        <svg width="400" height="380" viewBox="0 0 400 380" className="relative overflow-visible">
          <defs>
            <linearGradient id="conoLampara" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffe6bd" stopOpacity="0.8" />
              <stop offset="48%" stopColor="#ffb020" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ff7a18" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="focoLampara" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff6e2" />
              <stop offset="40%" stopColor="#ffc46b" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
            </radialGradient>
            <filter id="difusaLampara" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* Cono de luz: nace exactamente en la boca de la pantalla */}
          <motion.path
            d="M206 176 L302 176 L372 372 L136 372 Z"
            fill="url(#conoLampara)"
            filter="url(#difusaLampara)"
            style={{ opacity: luzCono }}
          />

          {/* Charco de luz sobre el escritorio */}
          <motion.ellipse
            cx="254"
            cy="366"
            rx="118"
            ry="16"
            fill="#ffc46b"
            filter="url(#difusaLampara)"
            animate={{ opacity: encendida ? 0.55 : 0 }}
            transition={{ duration: 0.9 }}
          />

          {/* Base: cuerpo + elipse de apoyo */}
          <g stroke="rgba(255,255,255,0.32)" strokeWidth="2.4" fill="none" strokeLinejoin="round">
            <path d="M98 322 Q98 296 152 296 Q206 296 206 322" />
            <ellipse cx="152" cy="322" rx="54" ry="11" />
            {/* Cuello de cisne */}
            <path d="M152 296 L152 246 C152 176 172 126 244 118" strokeWidth="3" strokeLinecap="round" />
            {/* Collar del cuello */}
            <path d="M142 250 L162 250" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Pantalla: cupula + labio interior (el labio da el volumen) */}
          <path
            d="M202 176 Q254 100 306 176 Z"
            fill="rgba(255,255,255,0.035)"
            stroke="rgba(255,255,255,0.38)"
            strokeWidth="2.6"
            strokeLinejoin="round"
          />
          <ellipse cx="254" cy="176" rx="52" ry="9" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.6" />
          <path d="M232 112 L276 112" stroke="rgba(255,255,255,0.18)" strokeWidth="1.4" strokeLinecap="round" />

          {/* Portalamparas y bombilla */}
          <path d="M246 168 L262 168 L262 178 L246 178 Z" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.6" />
          <motion.circle
            cx="254"
            cy="190"
            r="12"
            animate={{
              fill: encendida ? "#fff3d6" : "rgba(255,255,255,0.09)",
              filter: encendida ? "drop-shadow(0 0 30px rgba(255,190,90,1))" : "none",
            }}
            transition={{ duration: 0.5 }}
          />
          <motion.circle
            cx="254"
            cy="190"
            r="46"
            fill="url(#focoLampara)"
            animate={{ opacity: encendida ? 1 : 0 }}
            transition={{ duration: 0.8 }}
          />

          {/* Cadenilla: los guiones redondos SON las cuentas */}
          <motion.line
            x1="292"
            y1={CADENA_Y}
            x2="292"
            y2={finCadena}
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeDasharray="0.1 7.5"
          />
        </svg>

        {/* Anilla de tiro: el objetivo real del gesto */}
        <motion.button
          drag="y"
          dragConstraints={{ top: 0, bottom: 96 }}
          dragElastic={0.16}
          dragMomentum={false}
          style={{ y, left: 270, top: 240 }}
          onDragEnd={soltar}
          aria-label="Tirar de la cadena para encender la lámpara"
          className="absolute h-11 w-11 cursor-grab rounded-full outline-none active:cursor-grabbing"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.94 }}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 block h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white/45" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
        </motion.button>

        {!encendida && (
          <svg className="pointer-events-none absolute left-[318px] top-[276px] h-28 w-16" viewBox="0 0 60 110">
            <TrazoGesto d="M30 12 L30 84" />
            <TrazoGesto d="M18 70 L30 86 L42 70" retraso={2.6} />
          </svg>
        )}
      </div>

      <Pista>{flojo ? "más fuerte…" : "tira de la cadena"}</Pista>
    </div>
  );
}
