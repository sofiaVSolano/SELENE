import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { DUR, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";
import { useSpecular } from "../../lib/useSpecular.js";
import FormularioSala from "./FormularioSala.jsx";

/**
 * UNA SALA CON LAS LUMINARIAS QUE SELENE LE HA VISTO
 * -----------------------------------------------------------------
 * Las luminarias NO se escriben: aparecen solas cuando el monitoreo de la
 * sala las detecta (ver `backend/api/luminarias_auto.py`). Por eso esta lista
 * es de solo lectura — no hay botón de añadir, ni de editar, ni de borrar una
 * suelta. Lo único que se declara es la potencia, que se declara en la sala
 * porque una cámara no puede ver los vatios de una lámpara.
 *
 * Borrar la sala se lleva TODO su historial. Se pregunta antes, en el sitio,
 * diciendo cuánto se va a perder — un número concreto, no "esta acción no se
 * puede deshacer", que nadie lee.
 */

const IconoSala = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
    <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" strokeLinejoin="round" />
  </svg>
);

/** Resume el impacto en una frase; null mientras se consulta. */
function fraseImpacto(i) {
  if (!i) return "…";
  const partes = [
    [i.luminarias, "luminaria", "luminarias"],
    [i.detecciones, "captura", "capturas"],
    [i.eventos, "evento", "eventos"],
    [i.registros_consumo, "registro de consumo", "registros de consumo"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, s, p]) => `${n} ${n === 1 ? s : p}`);
  return partes.length ? `se perderán ${partes.join(", ")}` : "no tiene historial";
}

export default function TarjetaSala({ sala, indice, acciones }) {
  const specular = useSpecular();
  const [modo, setModo] = useState(null); // null | editar | borrar
  const [impacto, setImpacto] = useState(null);
  const [error, setError] = useState(null);

  const detalle = [sala.tipo_espacio, sala.edificio, sala.piso && `piso ${sala.piso}`]
    .filter(Boolean)
    .join(" · ");

  const pedirBorrado = async () => {
    sonido.roce();
    setModo("borrar");
    setImpacto(null);
    setError(null);
    setImpacto(await acciones.impactoBorrado(sala.id_zona));
  };

  const eliminar = async () => {
    setModo(null);
    setError(await acciones.eliminarSala(sala.id_zona));
  };

  const encendidas = sala.luminarias.filter((l) => l.estado_actual === "encendida").length;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={trans(DUR.entrada, Math.min(0.3, indice * 0.05))}
      className="modulo filo specular overflow-hidden p-4 sm:p-5"
      {...specular}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-linen bg-paper text-ink-2">
            {IconoSala}
          </span>
          <div className="min-w-0">
            <h2 className="serif truncate text-[1.25rem] leading-tight">{sala.nombre}</h2>
            <p className="annot mt-0.5 truncate text-[9.5px]">
              {detalle} · {sala.potencia_luminaria_w} W por luminaria
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {modo === "borrar" ? (
            <motion.div
              key="c"
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={trans(DUR.ui)}
              className="flex flex-col items-end gap-1"
            >
              <span className="font-mono text-[10px] text-clay">{fraseImpacto(impacto)}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-ink-3">¿borrar la sala y todo eso?</span>
                <button
                  onClick={eliminar}
                  className="font-mono text-[10px] uppercase tracking-[0.16em] text-clay outline-none hover:underline"
                >
                  sí, borrar
                </button>
                <button
                  onClick={() => setModo(null)}
                  className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 outline-none hover:text-ink"
                >
                  no
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="a" className="flex gap-2.5">
              <button
                onClick={() => {
                  sonido.click(true);
                  setModo(modo === "editar" ? null : "editar");
                  setError(null);
                }}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 outline-none hover:text-ink"
              >
                editar
              </button>
              <button
                onClick={pedirBorrado}
                className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 outline-none hover:text-clay"
              >
                eliminar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {error && <p className="mt-3 font-mono text-[10px] leading-relaxed text-clay">{error}</p>}

      <AnimatePresence>
        {modo === "editar" && (
          <FormularioSala
            key="edit"
            sala={sala}
            onCancelar={() => setModo(null)}
            onGuardar={async (datos) => {
              const fallo = await acciones.editarSala(sala.id_zona, datos);
              if (!fallo) setModo(null);
              return fallo;
            }}
          />
        )}
      </AnimatePresence>

      <div className="mt-4">
        <p className="annot mb-1.5 text-[9.5px]">
          luminarias detectadas
          {sala.luminarias.length > 0 ? ` · ${sala.luminarias.length}` : ""}
          {encendidas > 0 ? ` · ${encendidas} encendida${encendidas === 1 ? "" : "s"}` : ""}
        </p>

        {sala.luminarias.length === 0 ? (
          /* No es un vacío que el usuario deba rellenar: es que la cámara
             todavía no ha mirado esta sala. */
          <p className="rounded-xl border border-dashed border-linen px-3 py-2.5 font-mono text-[10px] leading-relaxed text-ink-4">
            Ninguna todavía. SELENE las registra sola en cuanto monitorees esta sala y la cámara
            las vea; no hay que escribirlas.
          </p>
        ) : (
          <ul>
            {sala.luminarias.map((l) => (
              <li
                key={l.id_luminaria}
                className="flex items-center gap-3 border-t border-linen/70 py-2 first:border-t-0"
              >
                <span
                  title={l.estado_actual}
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    background: l.estado_actual === "encendida" ? "var(--amber)" : "var(--linen)",
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{l.nombre}</span>
                <span className="font-mono text-[10px] lowercase tracking-[0.14em] text-ink-3">
                  {l.potencia_w} W
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.article>
  );
}
