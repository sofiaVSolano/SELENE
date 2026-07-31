import { motion } from "framer-motion";
import { useEffect } from "react";

/**
 * Piezas compartidas por las variantes de ignicion.
 * Regla comun a las 6: nunca hay una pantalla estatica esperando.
 * Siempre hay algo respirando y siempre se explica el gesto sin texto largo.
 */

/** Pista de gesto: aparece sola tras un silencio, nunca de entrada. */
export function Pista({ children, retraso = 1.6 }) {
  return (
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: [0, 0.55, 0.32, 0.55], y: 0 }}
      transition={{
        opacity: { delay: retraso, duration: 4.5, repeat: Infinity, ease: "easeInOut" },
        y: { delay: retraso, duration: 0.8, ease: [0.22, 1, 0.36, 1] },
      }}
      className="absolute bottom-16 left-1/2 -translate-x-1/2 select-none text-center font-mono text-[11px] uppercase tracking-[0.34em] text-white/45"
    >
      {children}
    </motion.p>
  );
}

/** Flecha/trazo que dibuja el gesto necesario. Se repite en bucle lento. */
export function TrazoGesto({ d, retraso = 2.2, ...props }) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="rgba(255,255,255,0.28)"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeDasharray="1 1"
      pathLength={1}
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: [0, 1, 1], opacity: [0, 0.9, 0] }}
      transition={{ delay: retraso, duration: 2.6, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" }}
      {...props}
    />
  );
}

/** Respiracion: lo que aun no esta encendido, late muy despacio. */
export const respira = {
  animate: { opacity: [0.55, 0.9, 0.55], scale: [1, 1.012, 1] },
  transition: { duration: 4.2, repeat: Infinity, ease: "easeInOut" },
};

/**
 * Accesibilidad: cualquier variante se enciende con Espacio o Enter.
 * Un gesto bonito no puede ser un muro. Tambien cubre el mando del
 * proyector en una sustentacion, que suele mandar teclas y no clics.
 */
export function useTeclaIgnicion(encender, activo = true) {
  useEffect(() => {
    if (!activo) return undefined;
    const onKey = (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        encender({ x: 0.5, y: 0.45 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [encender, activo]);
}

/** Normaliza coordenadas de pantalla a 0..1 para la fuente de luz global. */
export function origenDesde(el) {
  if (!el) return { x: 0.5, y: 0.45 };
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height / 2) / window.innerHeight,
  };
}
