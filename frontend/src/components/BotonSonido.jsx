import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { alternarSonido, estaSilenciado, sonido, suscribirSonido } from "../lib/sound.js";

/**
 * Interruptor de sonido. No es un icono de altavoz tachado: son ondas
 * que dejan de propagarse. Coherente con el lenguaje del resto.
 *
 * `compacto` deja solo el icono, en un círculo de 36px igual que sus vecinos
 * del riel. Nació de un problema medible: la píldora con la palabra "audio"
 * ocupa ~88px, y en el riel se metía a `scale-[0.72]`. Escalar NO cambia la
 * caja de layout, así que seguía reservando 88px dentro de un riel de 76 —
 * y en la barra inferior de un móvil de 320px empujaba el botón de sesión
 * fuera de la pantalla. Sin etiqueta no hay nada que escalar ni que mentir.
 */
export default function BotonSonido({ oscuro = false, compacto = false }) {
  const [mudo, setMudo] = useState(estaSilenciado());

  useEffect(() => suscribirSonido(setMudo), []);

  return (
    <button
      onClick={() => {
        const nuevo = alternarSonido();
        if (!nuevo) sonido.roce();
      }}
      aria-label={mudo ? "Activar sonido" : "Silenciar"}
      title={compacto ? (mudo ? "Activar sonido" : "Silenciar") : undefined}
      className={`flex h-9 shrink-0 items-center rounded-full border outline-none transition-colors duration-300 ${
        compacto ? "w-9 justify-center" : "gap-2 px-3"
      } ${
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
      {!compacto && (
        <span className="font-mono text-[9px] uppercase tracking-[0.28em]">{mudo ? "mudo" : "audio"}</span>
      )}
    </button>
  );
}
