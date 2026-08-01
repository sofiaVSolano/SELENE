import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { CURVA, RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * LÍNEA DE TIEMPO
 * -----------------------------------------------------------------
 * Debajo del visor. Cada inferencia es una miniatura sobre una regla de
 * tiempo real, y por eso las miniaturas NO están repartidas a distancia
 * fija: se separan según cuánto tiempo pasó entre capturas. Una ráfaga en
 * análisis continuo se ve apretada; una captura manual media hora después
 * deja un hueco. La línea cuenta el ritmo del monitoreo, no sólo el orden.
 *
 * Sobre la selección: no hay recuadro de color. La miniatura activa se
 * levanta, gana sombra y enciende su punto en la regla — el mismo
 * vocabulario que usa el riel de navegación.
 */

export default function LineaDeTiempo({
  capturas,
  activaId,
  onElegir,
  modoComparar,
  seleccion = [],
}) {
  const carril = useRef(null);
  const cantidad = capturas.length;

  /* Al llegar una captura nueva, la línea se desplaza sola hasta el final:
     en análisis continuo, perseguir la barra a mano sería insufrible. */
  useEffect(() => {
    const nodo = carril.current;
    if (!nodo) return;
    nodo.scrollTo({ left: nodo.scrollWidth, behavior: "smooth" });
  }, [cantidad]);

  if (!cantidad) {
    return (
      <div className="flex h-[78px] items-center justify-center rounded-[var(--r-lg)] border border-dashed border-linen">
        <p className="annot text-ink-4">la línea de tiempo se construye con cada análisis</p>
      </div>
    );
  }

  const t0 = new Date(capturas[0].ts).getTime();
  const tN = new Date(capturas[cantidad - 1].ts).getTime();
  const lapso = Math.max(1, tN - t0);

  return (
    <div className="relative">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="annot">
          línea de tiempo · {cantidad} {cantidad === 1 ? "inferencia" : "inferencias"}
        </p>
        {modoComparar && (
          <p className="annot text-amber-hot">
            {seleccion.length === 0
              ? "elige la primera captura"
              : seleccion.length === 1
                ? "elige la segunda"
                : "comparando"}
          </p>
        )}
      </div>

      <div
        ref={carril}
        className="flex gap-2 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin]"
      >
        {capturas.map((c, i) => {
          const activa = modoComparar ? seleccion.includes(c.id) : c.id === activaId;
          const posicion = seleccion.indexOf(c.id);
          // Hueco proporcional al tiempo transcurrido, con tope para que una
          // pausa larga no empuje la línea fuera de la pantalla.
          const hueco =
            i === 0
              ? 0
              : Math.min(
                  56,
                  ((new Date(c.ts).getTime() - new Date(capturas[i - 1].ts).getTime()) / lapso) *
                    cantidad *
                    22
                );

          return (
            <motion.button
              key={c.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={trans(0.42)}
              style={{ marginLeft: hueco }}
              onClick={() => {
                sonido.click(true);
                onElegir(c.id);
              }}
              onMouseEnter={() => sonido.roce()}
              whileHover={{ y: -4 }}
              className="group relative shrink-0 outline-none"
              aria-label={`Captura de las ${new Date(c.ts).toLocaleTimeString("es")}`}
            >
              <motion.span
                className="block overflow-hidden rounded-[10px] border"
                animate={{
                  borderColor: activa ? "var(--amber)" : "var(--linen)",
                  boxShadow: activa ? "var(--shadow-float)" : "var(--shadow-raise)",
                }}
                transition={RESORTE.firme}
              >
                <img
                  src={c.miniatura}
                  alt=""
                  className="h-[46px] w-[66px] object-cover transition-[filter] duration-300 ease-light"
                  style={{ filter: activa ? "none" : "saturate(0.82) brightness(1.02)" }}
                />
              </motion.span>

              {/* Orden en el comparador: 1 y 2 */}
              {modoComparar && posicion >= 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={RESORTE.objeto}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber font-mono text-[10px] text-ink shadow-raise"
                >
                  {posicion + 1}
                </motion.span>
              )}

              {/* Punto sobre la regla */}
              <span className="mt-1.5 flex items-center justify-center gap-1">
                <motion.span
                  className="block h-1 w-1 rounded-full"
                  animate={{
                    backgroundColor: activa ? "var(--amber)" : "var(--ink-4)",
                    scale: activa ? 1.5 : 1,
                  }}
                  transition={RESORTE.firme}
                />
                <span className="mono text-[8.5px] tabular-nums text-ink-4">
                  {new Date(c.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>

              {/* Cuántas personas tenía esa captura, al pasar el puntero */}
              <span className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-linen bg-paper px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2 opacity-0 shadow-raise transition-opacity duration-200 group-hover:opacity-100">
                {c.analisis.personas_detectadas} pers · {c.analisis.num_luminarias} lum
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* La regla propiamente dicha */}
      <motion.span
        className="absolute bottom-[9px] left-0 block h-px w-full origin-left bg-linen"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.6, ease: CURVA.luz }}
      />
    </div>
  );
}
