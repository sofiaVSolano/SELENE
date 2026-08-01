import { motion } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RESORTE, trans } from "../../lib/movimiento.js";

/**
 * LIGHTBOX
 * -----------------------------------------------------------------
 * "Al hacer clic, la imagen se agranda": el visor de una sola foto que
 * comparten las galerías del historial (capturas y alertas). Vidrio sobre
 * papel, como cualquier otro modal de la aplicación (ver
 * `modules/reportes/Impresora.jsx`) — no debía sentirse como un
 * componente aparte sólo porque vive en otra pantalla.
 *
 * `createPortal` a `document.body`: las tarjetas que abren este visor
 * viven dentro de `motion.div` animados (la entrada de la vista, el hover
 * de la propia tarjeta). Cualquier ancestro con transform —incluso uno
 * que Framer Motion deja como `translateY(0px)` en reposo— crea un nuevo
 * contenedor de bloque para `position: fixed`, y el visor quedaría
 * encerrado dentro de la tarjeta en vez de cubrir la pantalla.
 */
export default function Lightbox({ imagen, titulo, detalle, nota, onCerrar }) {
  useEffect(() => {
    const alTeclear = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={trans(0.3)}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-paper/75 px-6 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.97 }}
        transition={RESORTE.objeto}
        className="vidrio relative max-w-[min(92vw,760px)] overflow-hidden p-3"
      >
        <button
          onClick={onCerrar}
          aria-label="Cerrar"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-linen bg-paper/90 text-ink-3 outline-none backdrop-blur transition-colors duration-300 hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <img
          src={imagen}
          alt=""
          className="max-h-[72vh] w-full rounded-[calc(var(--r-xl)-6px)] object-contain"
        />

        {(titulo || detalle || nota) && (
          <div className="px-2 pb-1 pt-3">
            {titulo && <p className="serif text-[1.1rem] leading-tight text-ink">{titulo}</p>}
            {detalle && <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{detalle}</p>}
            {nota && <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{nota}</p>}
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}
