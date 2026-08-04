import { motion } from "framer-motion";
import { useMemo } from "react";
import { CURVA } from "../lib/movimiento.js";

/**
 * LAS PARTÍCULAS DE LUM
 * -----------------------------------------------------------------
 * Lum nunca aparece ni desaparece: se forma y se deshace. En `entrada` las
 * partículas caen hacia el centro y ahí nace el cuerpo; en `salida` salen
 * disparadas y el cuerpo se apaga con ellas.
 *
 * Vive fuera del recorrido porque Lum ya no es sólo el guía de bienvenida:
 * el aviso de derroche lo forma igual, y las dos apariciones tienen que
 * usar exactamente la misma física o se leerían como dos personajes.
 *
 * Se monta centrado sobre el bombillo, así que su contenedor tiene que ser
 * `relative` y del tamaño de Lum.
 */
export default function Particulas({ modo = "salida", cantidad = 18 }) {
  const semillas = useMemo(
    () =>
      Array.from({ length: cantidad }, (_, i) => ({
        id: i,
        ang: (i / cantidad) * Math.PI * 2 + Math.random() * 0.4,
        dist: 34 + Math.random() * 46,
        escala: 0.4 + Math.random() * 0.8,
        retraso: Math.random() * 0.22,
      })),
    [cantidad]
  );

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
      {semillas.map((s) => {
        const dx = Math.cos(s.ang) * s.dist;
        const dy = Math.sin(s.ang) * s.dist;
        const desde =
          modo === "entrada"
            ? { x: dx, y: dy, opacity: 0, scale: 0 }
            : { x: 0, y: 0, opacity: 1, scale: s.escala };
        const hasta =
          modo === "entrada"
            ? { x: 0, y: 0, opacity: [0, 1, 0], scale: s.escala }
            : { x: dx, y: dy, opacity: 0, scale: 0 };
        return (
          <motion.span
            key={s.id}
            className="absolute block h-[3px] w-[3px] rounded-full"
            style={{
              background: "rgb(var(--light-rgb))",
              boxShadow: "0 0 6px 2px rgb(var(--light-rgb) / 0.8)",
            }}
            initial={desde}
            animate={hasta}
            transition={{ duration: 0.9, delay: s.retraso, ease: CURVA.luz }}
          />
        );
      })}
    </div>
  );
}
