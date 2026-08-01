import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";
import { useEffect, useRef } from "react";
import { CURVA, menosMovimiento } from "../../lib/movimiento.js";

/**
 * Número que sube hasta su valor en vez de aparecer.
 *
 * Escribe en el DOM desde la MotionValue (igual que <Cifra/>), así que
 * contar de 0 a 1.284 no provoca un solo re-render de React. Se puede
 * poner uno en cada módulo del panel sin coste.
 *
 * `desde` permite lo que pidió el diseño en el módulo de personas: cuando
 * llega una captura nueva, el contador no arranca en 0 otra vez — sale del
 * valor anterior, y así el salto ES la variación.
 */
export default function Contador({
  valor = 0,
  desde = null,
  decimales = 0,
  duracion = 0.65,
  prefijo = "",
  sufijo = "",
  className = "",
}) {
  const ref = useRef(null);
  const mv = useMotionValue(desde ?? 0);
  const anterior = useRef(desde ?? 0);

  useMotionValueEvent(mv, "change", (v) => {
    if (ref.current) ref.current.textContent = prefijo + Number(v).toFixed(decimales) + sufijo;
  });

  useEffect(() => {
    const destino = Number.isFinite(valor) ? valor : 0;
    if (menosMovimiento()) {
      mv.set(destino);
      anterior.current = destino;
      return undefined;
    }
    const control = animate(mv, destino, {
      duration: duracion,
      ease: CURVA.luz,
      onComplete: () => {
        anterior.current = destino;
      },
    });
    return () => control.stop();
  }, [valor, duracion, mv]);

  return (
    <span ref={ref} className={`mono tabular-nums ${className}`}>
      {prefijo + Number(desde ?? 0).toFixed(decimales) + sufijo}
    </span>
  );
}
