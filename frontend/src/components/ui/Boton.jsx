import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { CURVA, RESORTE } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * El único botón de la aplicación.
 *
 * Tres variantes y ni una más: `luz` (acción principal, el ámbar),
 * `papel` (secundaria) y `linea` (terciaria, sin caja). Que exista un solo
 * componente es lo que hace que el chat, el monitoreo y los reportes se
 * sientan del mismo producto.
 *
 * Al pulsar nace un ripple EN EL PUNTO del clic, con el color de la luz
 * global: no es un ripple de Material, es la luz reaccionando al dedo.
 */

const ESTILOS = {
  luz: "border-transparent text-ink shadow-raise",
  papel: "border-linen bg-paper text-ink-2 hover:text-ink shadow-raise",
  linea: "border-transparent text-ink-3 hover:text-ink",
};

export default function Boton({
  children,
  variante = "papel",
  icono = null,
  onClick,
  disabled = false,
  tipo = "button",
  className = "",
  ...resto
}) {
  const [ondas, setOndas] = useState([]);
  const contador = useRef(0);

  const pulsar = (e) => {
    if (disabled) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const id = (contador.current += 1);
    setOndas((prev) => [...prev, { id, x: e.clientX - caja.left, y: e.clientY - caja.top }]);
    window.setTimeout(() => setOndas((prev) => prev.filter((o) => o.id !== id)), 620);
    sonido.pulso();
    onClick?.(e);
  };

  return (
    <motion.button
      type={tipo}
      disabled={disabled}
      onClick={pulsar}
      onHoverStart={() => !disabled && sonido.roce()}
      whileHover={disabled ? undefined : { y: -1.5 }}
      whileTap={disabled ? undefined : { y: 0, scale: 0.985 }}
      transition={RESORTE.firme}
      className={`group relative flex items-center justify-center gap-2 overflow-hidden rounded-full border px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] outline-none transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-45 ${ESTILOS[variante]} ${className}`}
      style={
        variante === "luz"
          ? {
              background:
                "linear-gradient(100deg, var(--sun) 0%, var(--amber) 55%, var(--ember) 130%)",
            }
          : undefined
      }
      {...resto}
    >
      {/* Brillo que cruza el botón principal al pasar el puntero */}
      {variante === "luz" && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/55 to-transparent transition-transform duration-[600ms] ease-light group-hover:translate-x-full" />
      )}

      {ondas.map((o) => (
        <motion.span
          key={o.id}
          initial={{ opacity: 0.55, scale: 0 }}
          animate={{ opacity: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: CURVA.luz }}
          style={{ left: o.x, top: o.y }}
          className="pointer-events-none absolute h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(var(--light-rgb)/0.75)_0%,transparent_65%)]"
        />
      ))}

      {icono && <span className="relative z-10 flex h-4 w-4 items-center justify-center">{icono}</span>}
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
