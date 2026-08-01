import { AnimatePresence, motion } from "framer-motion";
import { useId, useState } from "react";
import { CURVA, DUR, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * CAMPO
 * -----------------------------------------------------------------
 * Un input sin caja. Sólo una línea de tinta que, al enfocar, se
 * convierte en una línea de luz que crece de izquierda a derecha — el
 * mismo gesto que hace el filamento al encender.
 *
 * La validación no muestra un mensaje rojo debajo: la propia línea cambia
 * de temperatura (verde correcto, arcilla incorrecto) y aparece una marca
 * que se DIBUJA. El texto de error sólo se usa cuando explica algo que la
 * línea no puede decir.
 */
export default function Campo({
  etiqueta,
  tipo = "text",
  valor,
  onChange,
  estado = "neutro", // neutro | valido | invalido
  ayuda = null,
  sufijo = null,
  autoComplete,
  required = false,
  ...resto
}) {
  const id = useId();
  const [foco, setFoco] = useState(false);
  const lleno = String(valor ?? "").length > 0;

  const colorLinea =
    estado === "valido" ? "var(--leaf)" : estado === "invalido" ? "var(--clay)" : "var(--amber)";

  return (
    <div className="relative pt-5">
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-0 origin-left font-mono uppercase tracking-[0.2em] text-ink-3 transition-all duration-300 ease-light"
        style={{
          top: foco || lleno ? 0 : 22,
          fontSize: foco || lleno ? "9.5px" : "11px",
          color: foco ? "var(--ink-2)" : "var(--ink-3)",
          letterSpacing: foco || lleno ? "0.24em" : "0.2em",
        }}
      >
        {etiqueta}
      </label>

      <div className="flex items-center gap-3">
        <input
          id={id}
          type={tipo}
          value={valor}
          required={required}
          autoComplete={autoComplete}
          onChange={onChange}
          onFocus={() => {
            setFoco(true);
            sonido.roce();
          }}
          onBlur={() => setFoco(false)}
          className="peer w-full bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink-4"
          {...resto}
        />

        {sufijo}

        <AnimatePresence>
          {estado === "valido" && (
            <motion.svg
              key="ok"
              viewBox="0 0 20 20"
              className="h-4 w-4 shrink-0 text-leaf"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={trans(DUR.ui)}
            >
              <motion.path
                d="M4 10.5 L8.2 14.5 L16 5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.34, ease: CURVA.luz }}
              />
            </motion.svg>
          )}
        </AnimatePresence>
      </div>

      {/* Línea de tinta + línea de luz */}
      <div className="relative h-px w-full bg-linen">
        <motion.span
          className="absolute inset-y-0 left-0 block origin-left"
          style={{ background: colorLinea, height: 1.5 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: foco || estado !== "neutro" ? 1 : 0 }}
          transition={trans(DUR.ui)}
        />
        <motion.span
          className="pointer-events-none absolute -inset-x-2 -bottom-2 h-4 blur-md"
          style={{ background: colorLinea }}
          animate={{ opacity: foco ? 0.22 : 0 }}
          transition={trans(DUR.ui)}
        />
      </div>

      <AnimatePresence>
        {ayuda && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={trans(DUR.ui)}
            className={`mt-2 font-mono text-[10px] leading-relaxed ${
              estado === "invalido" ? "text-clay" : "text-ink-3"
            }`}
          >
            {ayuda}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
