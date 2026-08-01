import { motion } from "framer-motion";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RESORTE, trans } from "../../lib/movimiento.js";

/**
 * VISOR DE DOCUMENTO
 * -----------------------------------------------------------------
 * "Visualizar" un reporte no abre una pestaña del navegador: lo enseña
 * dentro de la propia aplicación, en un `<iframe>` sobre vidrio. Dos
 * razones, no una:
 *
 *   1. `window.open()` DESPUÉS de esperar el blob del PDF ya no cuenta
 *      como parte del gesto de clic para el navegador, así que lo trata
 *      como pop-up y lo bloquea — en silencio. Intentar "reservar" la
 *      ventana antes con `window.open("", "_blank", "noopener")` no sirve:
 *      pasar `noopener` hace que varios navegadores devuelvan `null` ahí
 *      mismo, así que la reserva nunca existía y el bloqueo seguía
 *      pasando siempre. Sin ventana nueva de por medio, no hay nada que
 *      bloquear.
 *   2. Encaja con el resto de SELENE: nada en esta aplicación depende de
 *      la ventana del navegador (ni el login, ni el chat, ni la
 *      impresora), así que el PDF tampoco debería salir de ella.
 *
 * `createPortal` a `document.body` es obligatorio y no cosmético: este
 * visor se abre desde tarjetas que están dentro de otros `motion.div`
 * animados (la propia entrada de la vista, el hover de la tarjeta). Un
 * ancestro con transform — incluso uno que Framer Motion deja en
 * `translateY(0px)` en reposo — crea un nuevo contenedor de bloque para
 * `position: fixed`, y el visor quedaría encerrado dentro de la tarjeta
 * en vez de cubrir la pantalla. El portal lo saca de esa jerarquía.
 */
export default function VisorDocumento({ url, titulo, onCerrar }) {
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-paper/80 p-4 backdrop-blur-md sm:p-8"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={RESORTE.objeto}
        className="vidrio relative flex h-full w-full max-w-[880px] flex-col overflow-hidden p-3"
      >
        <div className="mb-2 flex shrink-0 items-center justify-between px-1">
          <p className="annot truncate pr-3">{titulo || "reporte"}</p>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-linen bg-paper/90 text-ink-3 outline-none transition-colors duration-300 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <iframe
          src={url}
          title={titulo || "Reporte"}
          className="min-h-0 flex-1 rounded-[calc(var(--r-xl)-6px)] border border-linen bg-paper"
        />
      </motion.div>
    </motion.div>,
    document.body
  );
}
