import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CURVA } from "../lib/movimiento.js";
import { useLight } from "./LightContext.jsx";
import { suscribirPulso } from "./pulso.js";

/**
 * La onda que recorre la aplicación cuando llega información nueva.
 *
 * Dos capas a la vez, y por eso se siente física en vez de decorativa:
 *   1. La fuente de luz GLOBAL sube de intensidad (`destello`), así que
 *      cada sombra y cada halo de la pantalla se re-calculan solos.
 *   2. Un frente de onda circular nace en el punto donde ocurrió el dato
 *      y barre la interfaz.
 *
 * Se monta una sola vez, en el shell interno.
 */
export default function PulsoDeLuz() {
  const [ondas, setOndas] = useState([]);
  const { destello, parpadeo } = useLight();

  useEffect(
    () =>
      suscribirPulso(({ fuerza, tipo, origen }) => {
        if (tipo === "fallo") parpadeo();
        else destello(fuerza, 460);

        const id = `${Date.now()}-${Math.random()}`;
        setOndas((prev) => [...prev.slice(-2), { id, tipo, origen }]);
        window.setTimeout(() => setOndas((prev) => prev.filter((o) => o.id !== id)), 900);
      }),
    [destello, parpadeo]
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <AnimatePresence>
        {ondas.map((onda) => (
          <motion.span
            key={onda.id}
            initial={{ opacity: 0.5, scale: 0 }}
            animate={{ opacity: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: CURVA.luz }}
            style={{
              left: `${onda.origen.x * 100}%`,
              top: `${onda.origen.y * 100}%`,
              background:
                onda.tipo === "fallo"
                  ? "radial-gradient(circle, rgba(216,80,60,0.16) 30%, transparent 62%)"
                  : onda.tipo === "exito"
                    ? "radial-gradient(circle, rgba(62,155,107,0.16) 30%, transparent 62%)"
                    : "radial-gradient(circle, rgb(var(--light-rgb) / 0.30) 30%, transparent 62%)",
            }}
            className="absolute block h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
