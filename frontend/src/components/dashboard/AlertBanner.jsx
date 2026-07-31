import { AnimatePresence, motion } from "framer-motion";

/** Toast que aparece cuando SELENE detecta una anomalía (zona vacía con luz
 * encendida) — la confirmación visual de que la alerta hablada/del sistema
 * efectivamente se generó y quedó reportada. */
export default function AlertBanner({ alerta, onClose }) {
  return (
    <AnimatePresence>
      {alerta && (
        <motion.div
          initial={{ opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ duration: 0.25 }}
          className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-300">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1 1 0 003 19.7h18a1 1 0 00.89-1.66L13.71 3.86a1 1 0 00-1.72 0z" />
            </svg>
          </span>
          <div className="flex-1">
            <p className="font-mono text-[11px] uppercase tracking-widest text-red-300">
              Anomalía detectada
            </p>
            <p className="mt-1 text-sm text-haze-100">{alerta.mensaje}</p>
            <p className="mt-1 font-mono text-[10px] text-haze-500">
              {alerta.guardada ? "Guardada en el reporte de recomendaciones." : "Guardando en el reporte…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-haze-500 transition hover:text-haze-200"
            aria-label="Cerrar alerta"
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
