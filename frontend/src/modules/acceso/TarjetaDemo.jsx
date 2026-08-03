import { motion } from "framer-motion";
import Boton from "../../components/ui/Boton.jsx";
import { DUR, trans } from "../../lib/movimiento.js";

/** Hoja de papel con la cuenta de prueba, para quien no quiera registrarse.
 * Vive fuera de la tarjeta de vidrio -- es una anotación al margen del
 * formulario, no un campo más. */
export default function TarjetaDemo({ onUsar }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={trans(DUR.ui)}
    >
      <div className="surface mb-7 flex items-center justify-between gap-4 px-4 py-3">
        <div className="min-w-0">
          <p className="annot">acceso rápido</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-2">
            Ingresá con estas credenciales de prueba
          </p>
        </div>
        <Boton variante="papel" className="shrink-0 px-4 py-2" onClick={onUsar}>
          usar
        </Boton>
      </div>
    </motion.div>
  );
}
