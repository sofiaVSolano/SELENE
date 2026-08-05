import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { DUR, trans } from "../lib/movimiento.js";
import { TODAS } from "../lib/salaFiltro.js";
import { sonido } from "../lib/sound.js";

/**
 * ELEGIR DE QUÉ SALA ES EL HISTORIAL
 * -----------------------------------------------------------------
 * Gobierna las tres pestañas a la vez y también el reporte que se imprime:
 * mirar las capturas de una sala y llevarse un PDF de toda la instalación
 * sería la peor manera de equivocarse, porque el PDF no se ve raro.
 *
 * Sin `layoutId`, igual que el elector de la pantalla de salas: esta cabecera
 * puede desmontarse al cambiar de módulo y un `layoutId` que ya animó deja la
 * salida sin terminar (ver `modules/salas/Opciones.jsx`).
 */
export default function SelectorSala({ valor, onChange }) {
  const [salas, setSalas] = useState([]);

  useEffect(() => {
    api
      .listZonas()
      .then(setSalas)
      .catch(() => setSalas([]));
  }, []);

  // Con una sola sala el selector no ofrece ninguna decisión: filtrar por
  // "la única" y por "todas" da lo mismo, y un control que no hace nada solo
  // ocupa sitio.
  if (salas.length < 2) return null;

  const opciones = [{ id: TODAS, nombre: "todas las salas" }, ...salas.map((s) => ({ id: s.id_zona, nombre: s.nombre }))];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="annot mr-1 text-[9.5px]">sala</span>
      {opciones.map((o) => {
        const activa = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => {
              if (!activa) sonido.click(true);
              onChange(o.id);
            }}
            onMouseEnter={() => sonido.roce()}
            aria-pressed={activa}
            className="relative max-w-[12rem] truncate rounded-full px-3 py-1.5 font-mono text-[10px] lowercase tracking-[0.14em] outline-none transition-colors duration-300"
            style={{ color: activa ? "var(--ink)" : "var(--ink-3)" }}
          >
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: activa ? 1 : 0, scale: activa ? 1 : 0.9 }}
              transition={trans(DUR.ui)}
              className="absolute inset-0 rounded-full border border-linen bg-paper shadow-raise"
            />
            <span className="relative">{o.nombre}</span>
          </button>
        );
      })}
    </div>
  );
}
