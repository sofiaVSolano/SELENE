import { useMotionValueEvent } from "framer-motion";
import { useRef } from "react";

/**
 * Cifra viva: escribe directamente en el DOM desde una MotionValue.
 * Cero re-renders de React por frame — el numero puede correr a 60fps
 * sin que el resto de la pantalla se entere.
 */
export default function Cifra({ valor, decimales = 0, className = "", sufijo = "" }) {
  const ref = useRef(null);

  useMotionValueEvent(valor, "change", (v) => {
    if (ref.current) ref.current.textContent = Number(v).toFixed(decimales) + sufijo;
  });

  return (
    <span ref={ref} className={`mono tabular-nums ${className}`}>
      {Number(valor.get()).toFixed(decimales) + sufijo}
    </span>
  );
}
