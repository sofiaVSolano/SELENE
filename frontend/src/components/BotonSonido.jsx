import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { alternarSonido, estaSilenciado, sonido, suscribirSonido } from "../lib/sound.js";

/**
 * Interruptor de sonido. No es un icono de altavoz tachado: son ondas
 * que dejan de propagarse. Coherente con el lenguaje del resto.
 */
export default function BotonSonido({ oscuro = false }) {
  const [mudo, setMudo] = useState(estaSilenciado());

  useEffect(() => suscribirSonido(setMudo), []);

  return (
    <button
      onClick={() => {
        const nuevo = alternarSonido();
        if (!nuevo) sonido.roce();
      }}
      aria-label={mudo ? "Activar sonido" : "Silenciar"}
      className={`flex h-9 items-center gap-2 rounded-full border px-3 outline-none transition-colors duration-300 ${
        oscuro
          ? "border-white/12 text-white/40 hover:border-white/30 hover:text-white/80"
          : "border-linen text-ink-3 hover:border-ink-4 hover:text-ink"
      }`}
    >
      <svg width="16" height="14" viewBox="0 0 16 14">
        <path d="M2 5 L5 5 L9 2 L9 12 L5 9 L2 9 Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        {[0, 1].map((i) => (
          <motion.path
            key={i}
            d={i === 0 ? "M11.4 5.2 A3 3 0 0 1 11.4 8.8" : "M13.2 3.4 A5.6 5.6 0 0 1 13.2 10.6"}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            animate={mudo ? { opacity: 0, x: -3 } : { opacity: [0.4, 1, 0.4], x: 0 }}
            transition={
              mudo
                ? { duration: 0.3 }
                : { duration: 2.4, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }
            }
          />
        ))}
      </svg>
      <span className="font-mono text-[9px] uppercase tracking-[0.28em]">{mudo ? "mudo" : "audio"}</span>
    </button>
  );
}
