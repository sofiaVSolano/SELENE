import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { DUR, RESORTE, trans } from "../../lib/movimiento.js";
import { useSpecular } from "../../lib/useSpecular.js";

/**
 * MÓDULO FLOTANTE
 * -----------------------------------------------------------------
 * La unidad del panel lateral. No es una tarjeta de dashboard: es una
 * placa de papel levantada, con su icono propio, su anotación técnica y
 * su filo de luz.
 *
 * `dato` es la clave del comportamiento: cuando cambia, el módulo enciende
 * su filo superior durante un momento. Con seis módulos en pantalla, ver
 * cuáles se encendieron dice de un vistazo qué cambió en la última
 * inferencia — información real, no decoración.
 */
export default function Modulo({
  icono,
  titulo,
  anotacion = null,
  dato = null,
  indice = 0,
  children,
  className = "",
  ...resto
}) {
  const specular = useSpecular();
  const [vivo, setVivo] = useState(false);
  const primera = useRef(true);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return undefined;
    }
    setVivo(true);
    const id = window.setTimeout(() => setVivo(false), 900);
    return () => window.clearTimeout(id);
  }, [dato]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={trans(DUR.entrada, indice * 0.06)}
      data-vivo={vivo ? "si" : "no"}
      className={`modulo filo specular overflow-hidden p-4 ${className}`}
      {...specular}
      {...resto}
    >
      <header className="mb-3 flex items-center gap-2.5">
        <motion.span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-linen bg-paper text-ink-2"
          animate={vivo ? { scale: [1, 1.14, 1], color: ["#6b6257", "#ff7a18", "#6b6257"] } : {}}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {icono}
        </motion.span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-[10px] uppercase tracking-[0.22em] text-ink-2">
            {titulo}
          </h3>
          {anotacion && <p className="truncate text-[10px] text-ink-4">{anotacion}</p>}
        </div>
      </header>

      {children}
    </motion.section>
  );
}

/** Fila etiqueta/valor. Toda cifra secundaria del sistema usa esta forma. */
export function Renglon({ etiqueta, children, acento = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-linen/70 py-1.5 first:border-t-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
        {etiqueta}
      </span>
      <span className={`text-[13px] ${acento ? "text-ink" : "text-ink-2"}`}>{children}</span>
    </div>
  );
}

/** Barra de proporción. Se usa para áreas, porcentajes y scores. */
export function Barra({ valor = 0, color = "var(--amber)", alto = 3 }) {
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-linen"
      style={{ height: alto }}
      role="presentation"
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, valor * 100))}%` }}
        transition={RESORTE.firme}
      />
    </div>
  );
}
