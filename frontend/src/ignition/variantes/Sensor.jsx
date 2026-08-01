import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista } from "../piezas.jsx";

const NECESARIO = 2600; // px de movimiento acumulado
const FUGA = 0.965; // el sensor "olvida": si te detienes, baja

/**
 * VARIANTE 4 · SENSOR DE MOVIMIENTO (PIR)
 * Es la variante mas honesta con la tesis: replica el sensor de presencia
 * que la herramienta busca sustituir por vision artificial. Y como un PIR
 * real, solo ve movimiento: si te quedas quieto, la lectura decae.
 */
export default function Sensor({ onEncender }) {
  const [carga, setCarga] = useState(0);
  const [detectado, setDetectado] = useState(false);
  const previo = useRef(null);
  const cargaRef = useRef(0);
  const cursor = useRef({ x: 0.5, y: 0.5 });

  /* Aqui el retraso SI es deliberado (un PIR reacciona con inercia), pero
     va por transform igual que la linterna: nunca por left/top. */
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const luzX = useSpring(mx, { stiffness: 340, damping: 30, mass: 0.45 });
  const luzY = useSpring(my, { stiffness: 340, damping: 30, mass: 0.45 });

  useEffect(() => {
    const mover = (e) => {
      const px = e.touches ? e.touches[0].clientX : e.clientX;
      const py = e.touches ? e.touches[0].clientY : e.clientY;
      mx.set(px - 210);
      my.set(py - 210);
      cursor.current = { x: px / window.innerWidth, y: py / window.innerHeight };

      if (previo.current && !detectado) {
        const d = Math.hypot(px - previo.current.x, py - previo.current.y);
        if (d > 1) {
          cargaRef.current = Math.min(NECESARIO, cargaRef.current + d);
          setCarga(cargaRef.current);
          if (cargaRef.current >= NECESARIO) {
            setDetectado(true);
            sonido.deteccion(1);
            window.setTimeout(() => onEncender({ ...cursor.current, kelvin: 4000 }), 420);
          }
        }
      }
      previo.current = { x: px, y: py };
    };

    window.addEventListener("mousemove", mover);
    window.addEventListener("touchmove", mover, { passive: true });

    // Fuga continua: obliga a moverse de verdad, no a un tiron
    const id = window.setInterval(() => {
      if (detectado) return;
      cargaRef.current *= FUGA;
      setCarga(cargaRef.current);
    }, 90);

    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("touchmove", mover);
      window.clearInterval(id);
    };
  }, [detectado, mx, my, onEncender]);

  const p = Math.min(1, carga / NECESARIO);
  const radio = 78;
  const circunferencia = 2 * Math.PI * radio;

  return (
    <div className="relative flex flex-col items-center">
      {/* La luz persigue al cursor por toda la pantalla */}
      <motion.div
        aria-hidden
        style={{ x: luzX, y: luzY, opacity: 0.14 + p * 0.5, scale: 0.7 + p * 0.9 }}
        className="pointer-events-none fixed left-0 top-0 z-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,196,107,0.55)_0%,transparent_66%)] blur-2xl will-change-transform"
      />

      <div className="relative z-10 flex h-[240px] w-[240px] items-center justify-center">
        <svg width="200" height="200" viewBox="0 0 200 200" className="absolute">
          {/* Anillo de lectura */}
          <circle cx="100" cy="100" r={radio} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          <motion.circle
            cx="100"
            cy="100"
            r={radio}
            fill="none"
            stroke={detectado ? "#fff0cf" : "#ffb020"}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circunferencia}
            animate={{ strokeDashoffset: circunferencia * (1 - p) }}
            transition={{ duration: 0.18, ease: "linear" }}
            transform="rotate(-90 100 100)"
            style={{ filter: `drop-shadow(0 0 ${6 + p * 20}px rgba(255,176,32,0.9))` }}
          />
          {/* Lente fresnel del sensor */}
          {[26, 38, 50].map((r, i) => (
            <motion.circle
              key={r}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1"
              animate={{ opacity: [0.25, 0.6, 0.25] }}
              transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.25, ease: "easeInOut" }}
            />
          ))}
          <circle cx="100" cy="100" r="9" fill={detectado ? "#fff0cf" : "rgba(255,176,32,0.5)"} />
        </svg>

        <span className="relative z-10 mt-[124px] font-mono text-[11px] tabular-nums tracking-[0.3em] text-white/50">
          {String(Math.round(p * 100)).padStart(3, "0")}%
        </span>
      </div>

      <Pista retraso={0.9}>{detectado ? "presencia confirmada" : "muévete · el sensor te busca"}</Pista>
    </div>
  );
}
