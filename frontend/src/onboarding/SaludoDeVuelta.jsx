import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { trans } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";
import Bombillo from "../lum/Bombillo.jsx";
import { SALUDOS_DE_VUELTA } from "./guion.js";

/**
 * SALUDO DE VUELTA
 * -----------------------------------------------------------------
 * Para quien ya hizo el recorrido. Lum asoma dos segundos en una esquina,
 * saluda y se va. Nada que cerrar, nada que leer obligatoriamente, nada que
 * bloquee: si el usuario está escribiendo, ni se entera.
 *
 * Es deliberadamente MUCHO más corto y silencioso que el recorrido. La gracia
 * de una mascota es que reconozca al usuario, no que le pida atención cada
 * vez que entra. Sin voz: a los cuatro logins, una frase hablada al abrir
 * pasaría de simpática a molesta.
 */
export default function SaludoDeVuelta({ nombre, onFin }) {
  const [visible, setVisible] = useState(false);
  const frase = useMemo(() => {
    const base = SALUDOS_DE_VUELTA[Math.floor(Math.random() * SALUDOS_DE_VUELTA.length)];
    // Si sabemos el nombre, se personaliza el saludo más obvio.
    const soloNombre = (nombre || "").trim().split(/\s+/)[0];
    if (soloNombre && base === "¡Qué bueno verte de nuevo!") {
      return `¡Qué bueno verte, ${soloNombre}!`;
    }
    return base;
  }, [nombre]);

  useEffect(() => {
    // Entra con retraso: si aparece a la vez que la pantalla, se pierde entre
    // el resto de cosas que están montándose.
    const aparecer = window.setTimeout(() => {
      setVisible(true);
      sonido.chispa();
    }, 900);
    const irse = window.setTimeout(() => setVisible(false), 4200);
    const fin = window.setTimeout(() => onFin?.(), 5000);
    return () => {
      window.clearTimeout(aparecer);
      window.clearTimeout(irse);
      window.clearTimeout(fin);
    };
  }, [onFin]);

  return (
    <motion.div
      className="pointer-events-none fixed bottom-24 right-4 z-[85] flex items-end gap-2 sm:bottom-8 sm:right-8"
      initial={{ opacity: 0, y: 16, scale: 0.9 }}
      animate={
        visible
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 10, scale: 0.92 }
      }
      transition={trans(0.55)}
      aria-live="polite"
    >
      <Bombillo tamano={46} animo="contento" mirandoA={null} />
      <motion.div
        className="vidrio mb-2 px-3.5 py-2"
        initial={{ opacity: 0, x: 8 }}
        animate={visible ? { opacity: 1, x: 0 } : { opacity: 0, x: 6 }}
        transition={trans(0.4, 0.12)}
      >
        <p className="text-[12.5px] leading-snug text-ink">{frase}</p>
      </motion.div>
    </motion.div>
  );
}
