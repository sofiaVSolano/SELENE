import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista, TrazoGesto, origenDesde } from "../piezas.jsx";

const TIRON_MINIMO = 46;

/**
 * VARIANTE 6 · LAMPARA DE ESCRITORIO
 * Hay que TIRAR de la cuerda, no tocarla. Si el tiron es corto, la cuerda
 * rebota con inercia y la lampara no enciende: el sistema te dice "un poco
 * mas" con fisica, no con un mensaje de error.
 */
export default function Lampara({ onEncender }) {
  const y = useMotionValue(0);
  const [encendida, setEncendida] = useState(false);
  const [flojo, setFlojo] = useState(false);
  const ref = useRef(null);

  const largoCuerda = useTransform(y, [0, 96], [78, 106]); // la cuerda se estira al tirar
  const opacidadLuz = useTransform(y, [0, 60], [0, 0.18]);

  const soltar = () => {
    if (encendida) return;
    const tiron = y.get();
    // Rebote elastico de cuerda real (oscila, no vuelve seco)
    animate(y, 0, { type: "spring", stiffness: 260, damping: 8.5, mass: 0.7 });

    if (tiron >= TIRON_MINIMO) {
      setEncendida(true);
      sonido.click(true);
      window.setTimeout(() => onEncender({ ...origenDesde(ref.current), y: 0.34, kelvin: 2600 }), 220);
    } else {
      setFlojo(true);
      sonido.click(false);
      window.setTimeout(() => setFlojo(false), 1400);
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      <div ref={ref} className="relative">
        {/* Cono de luz proyectado sobre el escritorio */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[118px] h-[300px] w-[420px] -translate-x-1/2"
          style={{ opacity: encendida ? 1 : opacidadLuz }}
          animate={encendida ? { opacity: 1 } : {}}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="h-full w-full"
            style={{
              clipPath: "polygon(41% 0%, 59% 0%, 100% 100%, 0% 100%)",
              background:
                "linear-gradient(180deg, rgba(255,214,150,0.55) 0%, rgba(255,196,107,0.16) 45%, transparent 92%)",
              filter: "blur(6px)",
            }}
          />
        </motion.div>

        <svg width="330" height="270" viewBox="0 0 330 270" className="relative">
          {/* Brazo articulado */}
          <path
            d="M250 246 L250 200 L196 120 L142 96"
            fill="none"
            stroke="rgba(255,255,255,0.24)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="250" cy="200" r="6" fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="2" />
          <circle cx="196" cy="120" r="5" fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="2" />
          {/* Base */}
          <ellipse cx="250" cy="248" rx="52" ry="9" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
          {/* Pantalla de la lampara */}
          <path
            d="M104 74 L172 108 L146 134 L86 100 Z"
            fill={encendida ? "rgba(255,214,150,0.14)" : "rgba(255,255,255,0.03)"}
            stroke="rgba(255,255,255,0.3)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {/* Bombilla dentro */}
          <motion.circle
            cx="120"
            cy="112"
            r="11"
            animate={{
              fill: encendida ? "#fff3d6" : "rgba(255,255,255,0.1)",
              filter: encendida ? "drop-shadow(0 0 34px rgba(255,190,90,1))" : "none",
            }}
            transition={{ duration: 0.5 }}
          />
        </svg>

        {/* Cuerda: el gesto real */}
        <div className="absolute left-[168px] top-[128px]">
          <motion.svg width="20" height="140" viewBox="0 0 20 140" style={{ overflow: "visible" }}>
            <motion.line
              x1="10"
              y1="0"
              x2="10"
              y2={largoCuerda}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1.4"
            />
          </motion.svg>

          <motion.button
            drag="y"
            dragConstraints={{ top: 0, bottom: 96 }}
            dragElastic={0.18}
            dragMomentum={false}
            style={{ y }}
            onDragEnd={soltar}
            aria-label="Tirar de la cuerda para encender la lámpara"
            className="absolute left-1/2 top-[74px] h-8 w-8 -translate-x-1/2 cursor-grab rounded-full border border-white/25 bg-white/[0.06] outline-none active:cursor-grabbing"
            whileHover={{ scale: 1.12 }}
            whileTap={{ scale: 0.94 }}
          >
            <span className="absolute inset-[7px] rounded-full border border-white/20" />
          </motion.button>
        </div>

        {!encendida && (
          <svg className="pointer-events-none absolute left-[212px] top-[190px] h-28 w-16" viewBox="0 0 60 110">
            <TrazoGesto d="M30 12 L30 84" />
            <TrazoGesto d="M18 70 L30 86 L42 70" retraso={2.6} />
          </svg>
        )}
      </div>

      <Pista>{flojo ? "más fuerte…" : "tira de la cuerda"}</Pista>
    </div>
  );
}
