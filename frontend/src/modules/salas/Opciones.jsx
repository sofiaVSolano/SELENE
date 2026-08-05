import { motion } from "framer-motion";
import { DUR, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * ELECTOR DE UNA OPCIÓN ENTRE POCAS
 * -----------------------------------------------------------------
 * Un `<select>` nativo trae su propia caja, su flecha y su menú del sistema
 * operativo — tres cosas que no son de "Papel y Luz" y que además se ven
 * distintas en cada navegador. Con cinco o seis opciones no hace falta
 * esconderlas: se muestran todas y la elegida se lleva la placa de luz.
 *
 * La placa es una POR CHIP que aparece y desaparece, y no una sola compartida
 * que se desliza con `layoutId` como en las pestañas del historial. Allí el
 * truco es seguro porque nada se desmonta; aquí este elector vive dentro de
 * formularios que se cierran, y un elemento con `layoutId` que ya animó y
 * luego se desmonta dentro de un `AnimatePresence` deja la salida sin
 * terminar: el formulario se quedaba pegado en pantalla para siempre, con lo
 * ya tecleado dentro. Se encontró manejando la pantalla en un navegador real.
 */
export default function Opciones({ etiqueta, valor, opciones, onChange }) {
  return (
    <div>
      <p className="annot mb-2 text-[9.5px]">{etiqueta}</p>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map((o) => {
          const activa = o === valor;
          return (
            <button
              key={o}
              type="button"
              onClick={() => {
                if (!activa) sonido.click(true);
                onChange(o);
              }}
              onMouseEnter={() => sonido.roce()}
              aria-pressed={activa}
              className="relative rounded-full px-3 py-1.5 font-mono text-[10px] lowercase tracking-[0.14em] outline-none transition-colors duration-300"
              style={{ color: activa ? "var(--ink)" : "var(--ink-3)" }}
            >
              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: activa ? 1 : 0, scale: activa ? 1 : 0.9 }}
                transition={trans(DUR.ui)}
                className="absolute inset-0 rounded-full border border-linen bg-paper shadow-raise"
              />
              <span className="relative">{o}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
