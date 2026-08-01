import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * BARRA DE CONVERSACIONES
 * -----------------------------------------------------------------
 * La estructura es la de ChatGPT porque esa estructura ya la sabe usar
 * todo el mundo y pelearse con ella no le aporta nada al proyecto. Lo que
 * cambia es el material: papel y luz en vez de gris sobre gris.
 *
 * Diferencias que sí importan:
 *   · La conversación activa no se marca con un fondo de color, sino con
 *     una luz que se DESLIZA entre elementos (layoutId compartido), igual
 *     que en el riel de navegación.
 *   · Las acciones (anclar, renombrar, borrar) no viven en un menú de tres
 *     puntos: aparecen al pasar el puntero y desaparecen al salir.
 *   · Borrar pide confirmación en el sitio, sin diálogo modal.
 */

function Icono({ d, ...resto }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...resto}>
      {d}
    </svg>
  );
}

function Fila({ conversacion: c, activa, onElegir, onEliminar, onRenombrar, onAnclar }) {
  const [editando, setEditando] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [texto, setTexto] = useState(c.titulo);
  const input = useRef(null);

  useEffect(() => {
    if (editando) input.current?.select();
  }, [editando]);

  useEffect(() => {
    if (!borrar) return undefined;
    const id = window.setTimeout(() => setBorrar(false), 3200);
    return () => window.clearTimeout(id);
  }, [borrar]);

  const confirmarNombre = () => {
    setEditando(false);
    if (texto.trim() && texto !== c.titulo) {
      onRenombrar(c.id, texto);
      sonido.confirmar();
    } else {
      setTexto(c.titulo);
    }
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10, height: 0 }}
      transition={trans(0.32)}
      className="group relative"
    >
      {activa && (
        <motion.span
          layoutId="luz-conversacion"
          transition={RESORTE.firme}
          className="absolute inset-0 rounded-[12px] border border-linen bg-paper shadow-raise"
        />
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (editando) return;
          sonido.roce();
          onElegir(c.id);
        }}
        onKeyDown={(e) => e.key === "Enter" && onElegir(c.id)}
        className="relative flex items-center gap-2 rounded-[12px] px-2.5 py-2 outline-none"
      >
        {/* Punto de anclaje */}
        <motion.span
          className="block h-1.5 w-1.5 shrink-0 rounded-full"
          animate={{
            backgroundColor: c.anclada ? "var(--amber)" : activa ? "var(--ink-3)" : "var(--ink-4)",
            scale: c.anclada ? 1.2 : 1,
          }}
          transition={RESORTE.firme}
        />

        {editando ? (
          <input
            ref={input}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={confirmarNombre}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarNombre();
              if (e.key === "Escape") {
                setTexto(c.titulo);
                setEditando(false);
              }
            }}
            className="min-w-0 flex-1 border-b border-amber bg-transparent text-[12.5px] text-ink outline-none"
          />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate text-[12.5px] transition-colors duration-300 ${
              activa ? "text-ink" : "text-ink-2 group-hover:text-ink"
            }`}
          >
            {c.titulo}
          </span>
        )}

        {/* Acciones: sólo al pasar el puntero */}
        <AnimatePresence>
          {!editando && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAnclar(c.id);
                  sonido.click(!c.anclada);
                }}
                aria-label={c.anclada ? "Desanclar" : "Anclar"}
                className="rounded p-1 text-ink-3 outline-none transition-colors hover:text-amber-hot"
              >
                <Icono
                  className="h-3.5 w-3.5"
                  d={<path d="M9 4h6l-1 6 3.5 3H6.5L10 10 9 4ZM12 13v7" />}
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditando(true);
                }}
                aria-label="Renombrar"
                className="rounded p-1 text-ink-3 outline-none transition-colors hover:text-ink"
              >
                <Icono className="h-3.5 w-3.5" d={<path d="M4 20h4L19 9l-4-4L4 16v4ZM14.5 5.5l4 4" />} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (borrar) {
                    onEliminar(c.id);
                    sonido.papel();
                  } else {
                    setBorrar(true);
                    sonido.roce();
                  }
                }}
                aria-label={borrar ? "Confirmar borrado" : "Eliminar"}
                className={`rounded p-1 outline-none transition-colors ${
                  borrar ? "text-clay" : "text-ink-3 hover:text-clay"
                }`}
              >
                {borrar ? (
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.1em]">seguro</span>
                ) : (
                  <Icono
                    className="h-3.5 w-3.5"
                    d={<path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12.2h9.4L17.5 7" />}
                  />
                )}
              </button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

export default function BarraConversaciones({
  visibles,
  activaId,
  busqueda,
  setBusqueda,
  onElegir,
  onCrear,
  onEliminar,
  onRenombrar,
  onAnclar,
}) {
  const ancladas = visibles.filter((c) => c.anclada);
  const resto = visibles.filter((c) => !c.anclada);

  return (
    <div className="flex h-full w-[248px] shrink-0 flex-col border-r border-linen bg-paper-2/50 px-3 py-4">
      <button
        onClick={() => {
          onCrear();
          sonido.click(true);
        }}
        onMouseEnter={() => sonido.roce()}
        className="group mb-3 flex items-center gap-2.5 rounded-[12px] border border-linen bg-paper px-3 py-2.5 text-left outline-none shadow-raise transition-all duration-300 ease-light hover:-translate-y-px hover:shadow-float"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <Icono className="h-4 w-4 text-ink-2" d={<path d="M12 5v14M5 12h14" />} />
          <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(255,176,32,0.45),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-2 transition-colors group-hover:text-ink">
          nueva conversación
        </span>
      </button>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <Icono
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4"
          d={
            <>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </>
          }
        />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="buscar"
          className="w-full rounded-full border border-linen bg-paper py-1.5 pl-8 pr-3 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink outline-none transition-colors duration-300 placeholder:text-ink-4 focus:border-amber"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {ancladas.length > 0 && (
          <>
            <p className="annot mb-1.5 px-2.5 text-[9px]">ancladas</p>
            <ul className="mb-4 flex flex-col gap-0.5">
              <AnimatePresence initial={false}>
                {ancladas.map((c) => (
                  <Fila
                    key={c.id}
                    conversacion={c}
                    activa={c.id === activaId}
                    onElegir={onElegir}
                    onEliminar={onEliminar}
                    onRenombrar={onRenombrar}
                    onAnclar={onAnclar}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </>
        )}

        {resto.length > 0 && <p className="annot mb-1.5 px-2.5 text-[9px]">historial</p>}
        <ul className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {resto.map((c) => (
              <Fila
                key={c.id}
                conversacion={c}
                activa={c.id === activaId}
                onElegir={onElegir}
                onEliminar={onEliminar}
                onRenombrar={onRenombrar}
                onAnclar={onAnclar}
              />
            ))}
          </AnimatePresence>
        </ul>

        {visibles.length === 0 && (
          <p className="px-2.5 py-6 text-[12px] leading-relaxed text-ink-4">
            {busqueda ? "Nada coincide con esa búsqueda." : "Todavía no has preguntado nada."}
          </p>
        )}
      </div>
    </div>
  );
}
