import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista } from "../piezas.jsx";

const RADIO_HAZ = 170;
const MANTENER = 900; // ms sobre el logo

/**
 * VARIANTE 5 · LINTERNA
 * El unico caso en que la oscuridad es el juego: la app esta ahi, solo
 * que no la ves. El logo se esconde en una posicion distinta cada vez,
 * siempre fuera del centro (si cayera en el centro seria trivial).
 */
export default function Linterna({ onEncender }) {
  const objetivo = useMemo(() => {
    const angulo = Math.random() * Math.PI * 2;
    const dist = 0.24 + Math.random() * 0.13; // ni al centro ni en el borde
    return { x: 0.5 + Math.cos(angulo) * dist, y: 0.5 + Math.sin(angulo) * dist * 0.8 };
  }, []);

  const [cerca, setCerca] = useState(0); // 0..1 de "encontrado"
  const [hallado, setHallado] = useState(false);
  const encontradoRef = useRef(0);
  const posRef = useRef({ x: 0.5, y: 0.5 });

  /* El haz se posiciona con `transform`, no con left/top: animar left/top
     obliga al navegador a recalcular layout en cada frame y ese es el
     retraso que se veia. Ademas el muelle es casi critico (rigidez alta,
     masa minima): una linterna sigue a la mano, no la persigue.        */
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const hazX = useSpring(mx, { stiffness: 1400, damping: 62, mass: 0.1 });
  const hazY = useSpring(my, { stiffness: 1400, damping: 62, mass: 0.1 });

  useEffect(() => {
    const mover = (e) => {
      const px = e.touches ? e.touches[0].clientX : e.clientX;
      const py = e.touches ? e.touches[0].clientY : e.clientY;
      mx.set(px - RADIO_HAZ);
      my.set(py - RADIO_HAZ);
      posRef.current = { x: px / window.innerWidth, y: py / window.innerHeight };
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("touchmove", mover, { passive: true });

    const id = window.setInterval(() => {
      if (encontradoRef.current >= MANTENER) return;
      const dx = (posRef.current.x - objetivo.x) * window.innerWidth;
      const dy = (posRef.current.y - objetivo.y) * window.innerHeight;
      const dentro = Math.hypot(dx, dy) < RADIO_HAZ * 0.55;

      encontradoRef.current = Math.max(0, encontradoRef.current + (dentro ? 60 : -90));
      setCerca(Math.min(1, encontradoRef.current / MANTENER));

      if (encontradoRef.current >= MANTENER) {
        setHallado(true);
        sonido.deteccion(1);
        window.setTimeout(() => onEncender({ ...objetivo, kelvin: 3600 }), 380);
      }
    }, 60);

    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("touchmove", mover);
      window.clearInterval(id);
    };
  }, [mx, my, objetivo]);

  return (
    <>
      {/* Haz de la linterna */}
      <motion.div
        aria-hidden
        style={{ x: hazX, y: hazY }}
        className="pointer-events-none fixed left-0 top-0 z-20 will-change-transform"
      >
        <div
          className="rounded-full"
          style={{
            width: RADIO_HAZ * 2,
            height: RADIO_HAZ * 2,
            background:
              "radial-gradient(circle, rgba(255,231,196,0.30) 0%, rgba(255,206,140,0.13) 38%, rgba(255,180,90,0.04) 62%, transparent 74%)",
          }}
        />
      </motion.div>

      {/* Logo escondido: solo existe si lo alumbras */}
      <motion.div
        className="pointer-events-none fixed z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${objetivo.x * 100}%`, top: `${objetivo.y * 100}%` }}
        animate={{ opacity: 0.06 + cerca * 0.94, scale: 1 + cerca * 0.12 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <svg width="128" height="128" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r="26"
            fill="none"
            stroke={hallado ? "#fff3d6" : "#ffb020"}
            strokeWidth="1.6"
            style={{ filter: `drop-shadow(0 0 ${cerca * 22}px rgba(255,176,32,0.9))` }}
          />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <motion.line
              key={a}
              x1="64"
              y1="64"
              x2="64"
              y2="18"
              stroke={hallado ? "#fff3d6" : "#ffb020"}
              strokeWidth="1.4"
              strokeLinecap="round"
              transform={`rotate(${a} 64 64)`}
              animate={{ opacity: 0.2 + cerca * 0.8, y1: -cerca * 6 }}
              style={{ transformOrigin: "64px 64px" }}
            />
          ))}
          <circle cx="64" cy="64" r={4 + cerca * 5} fill={hallado ? "#fff" : "#ffd98a"} />
        </svg>
      </motion.div>

      <div className="relative flex flex-col items-center">
        <Pista retraso={0.9}>{hallado ? "encontrado" : "busca el logo con la linterna"}</Pista>
      </div>
    </>
  );
}
