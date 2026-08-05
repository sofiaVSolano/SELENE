import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import Boton from "../../components/ui/Boton.jsx";
import { BombilloComputador } from "../../components/ui/Cargando.jsx";
import Contador from "../../components/ui/Contador.jsx";
import Lightbox from "../../components/ui/Lightbox.jsx";
import { useSpecular } from "../../lib/useSpecular.js";
import {
  borrarEjecucion,
  listarEjecuciones,
  MAX_EJECUCIONES,
  suscribirEjecuciones,
  vaciarEjecuciones,
} from "../../lib/almacen.js";
import { CURVA, escena, RESORTE, trans } from "../../lib/movimiento.js";
import { useMonitoreoCompartido } from "../monitoreo/MonitoreoContext.jsx";
import { sonido } from "../../lib/sound.js";

/**
 * VISTA · CAPTURAS
 * -----------------------------------------------------------------
 * Una galería, no una tabla. Cada ejecución es una tarjeta con su
 * miniatura, y al pasar el puntero la tarjeta cobra vida: la miniatura se
 * acerca un poco, la sombra crece, el brillo especular sigue al cursor y
 * las cifras que estaban en reposo se despliegan.
 *
 * En reposo cada tarjeta muestra sólo lo que se entiende de un vistazo
 * (hora, personas, ahorro). El resto —ventanas, luminarias, reparto de
 * luz, consumo— aparece al acercarse. Es lo que evita que veinte tarjetas
 * se conviertan en veinte tablas pequeñas.
 *
 * Borrar una foto de aquí también la borra de la línea de tiempo en vivo
 * del Centro de Monitoreo (`useMonitoreoCompartido().eliminarCaptura`):
 * son dos almacenes distintos (éste vive en localStorage, el otro sólo en
 * memoria de sesión) pero comparten el mismo id por captura, así que
 * quedarían desincronizados —la foto "borrada" seguiría apareciendo en el
 * comparador— si no se limpiaran los dos a la vez.
 */

const FILTROS = [
  { clave: "todas", etiqueta: "todas" },
  { clave: "ocupado", etiqueta: "con personas" },
  { clave: "vacio", etiqueta: "sala vacía" },
  { clave: "derroche", etiqueta: "posible derroche" },
];

/* Sala vacía con al menos una luminaria encendida: exactamente el caso que
   SELENE existe para detectar. Mismo criterio que usa `useMonitoreo` para
   avisar — uno solo en toda la app, no dos reglas que puedan divergir.

   Antes se pedía además `artificial > 55`, y eso dejaba pasar el caso más
   común de todos: `porcentaje_artificial` reparte 100 puntos entre luz
   natural y artificial, así que en cuanto la cámara ve una ventana el valor
   se hunde aunque la lámpara siga encendida — de día no marcaba nada. Que
   entre sol no es un atenuante, es lo contrario: una luz encendida con la
   sala vacía Y de día se desperdicia igual o más. */
export function esDerroche(e) {
  if (e.personas !== 0) return false;
  // Capturas guardadas antes de que el backend informara qué luminarias
  // emiten: se las juzga con el criterio viejo en vez de darlas por buenas,
  // para no vaciar de golpe el historial ya acumulado.
  if (e.luminariasEncendidas === undefined) return e.artificial > 55;
  return e.luminariasEncendidas > 0;
}

function Tarjeta({ e, indice, onBorrar, onAmpliar }) {
  const specular = useSpecular();
  const [abierta, setAbierta] = useState(false);
  const fecha = new Date(e.ts);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={trans(0.45, Math.min(0.4, indice * 0.045))}
      whileHover={{ y: -4 }}
      onHoverStart={() => {
        setAbierta(true);
        sonido.roce();
      }}
      onHoverEnd={() => setAbierta(false)}
      className="surface specular group relative flex flex-col overflow-hidden"
      {...specular}
    >
      {/* Miniatura: clic para agrandarla */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onAmpliar(e)}
        onKeyDown={(ev) => ev.key === "Enter" && onAmpliar(e)}
        aria-label="Ver la captura en grande"
        className="relative aspect-[16/10] cursor-zoom-in overflow-hidden bg-paper-3 outline-none"
      >
        <motion.img
          src={e.miniatura}
          alt=""
          className="h-full w-full object-cover"
          animate={{ scale: abierta ? 1.06 : 1 }}
          transition={{ duration: 0.5, ease: CURVA.luz }}
        />

        {/* Velo cálido que sube al acercarse: la tarjeta se ilumina */}
        <motion.span
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(0deg, rgba(255,176,32,0.22) 0%, transparent 55%)",
          }}
          animate={{ opacity: abierta ? 1 : 0 }}
          transition={trans(0.35)}
        />

        {/* Señal de que la imagen se puede agrandar */}
        <motion.span
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          animate={{ opacity: abierta ? 1 : 0, scale: abierta ? 1 : 0.85 }}
          transition={trans(0.3)}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-paper/60 bg-ink/30 text-paper backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="M19 19l-4.5-4.5" />
            </svg>
          </span>
        </motion.span>

        {/* Estado de ocupación */}
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-linen bg-paper/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-2 backdrop-blur">
          <span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: e.personas > 0 ? "var(--leaf)" : "var(--ink-4)" }}
          />
          {e.personas > 0 ? "ocupada" : "vacía"}
        </span>

        {esDerroche(e) && (
          <span className="absolute right-2.5 top-2.5 rounded-full bg-amber-hot px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-paper">
            posible derroche
          </span>
        )}

        <button
          onClick={(ev) => {
            ev.stopPropagation(); // no debe abrir el lightbox al borrar
            onBorrar(e.id);
            sonido.papel();
          }}
          aria-label="Quitar del historial"
          className="absolute bottom-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-linen bg-paper/90 text-ink-3 opacity-0 outline-none backdrop-blur transition-all duration-300 hover:text-clay group-hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12.2h9.4L17.5 7" />
          </svg>
        </button>
      </div>

      {/* Cifras */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="mono text-[11px] tabular-nums text-ink">
            {fecha.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="annot text-[9px]">
            {fecha.toLocaleDateString("es", { day: "2-digit", month: "short" })}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { et: "personas", v: e.personas, d: 0 },
            { et: "ventanas", v: e.ventanas, d: 0 },
            { et: "luminarias", v: e.luminarias, d: 0 },
          ].map((x) => (
            <div key={x.et}>
              <p className="annot text-[8.5px]">{x.et}</p>
              <Contador valor={x.v} decimales={x.d} duracion={0.5} className="text-[17px]" />
            </div>
          ))}
        </div>

        {/* Reparto de luz: una sola barra, dos tintas */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between">
            <span className="annot text-[8.5px]">natural {e.natural.toFixed(0)} %</span>
            <span className="annot text-[8.5px]">artificial {e.artificial.toFixed(0)} %</span>
          </div>
          <div className="flex h-[3px] w-full overflow-hidden rounded-full bg-linen">
            <motion.span
              className="h-full"
              style={{ background: "var(--sun)" }}
              initial={{ width: 0 }}
              animate={{ width: `${e.natural}%` }}
              transition={RESORTE.firme}
            />
            <motion.span
              className="h-full"
              style={{ background: "var(--ember)" }}
              initial={{ width: 0 }}
              animate={{ width: `${e.artificial}%` }}
              transition={RESORTE.firme}
            />
          </div>
        </div>

        {/* Detalle que sólo aparece al acercarse */}
        <AnimatePresence initial={false}>
          {abierta && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: CURVA.luz }}
              className="overflow-hidden"
            >
              <div className="mt-3 border-t border-linen pt-3">
                <div className="flex justify-between">
                  <span className="annot text-[9px]">consumo</span>
                  <span className="mono text-[11px] text-ink-2">
                    {e.consumo === null ? "—" : `${(e.consumo * 1000).toFixed(1)} Wh`}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="annot text-[9px]">ahorro</span>
                  <span className="mono text-[11px] text-leaf">
                    {e.ahorro ? `${(e.ahorro * 1000).toFixed(1)} Wh` : "—"}
                  </span>
                </div>
                {e.recomendacion && (
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-3">{e.recomendacion}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

export default function VistaCapturas() {
  const m = useMonitoreoCompartido();
  const [ejecuciones, setEjecuciones] = useState(() => listarEjecuciones());
  const [filtro, setFiltro] = useState("todas");
  const [ampliada, setAmpliada] = useState(null);
  // Borrar todo el historial de un golpe merece un segundo clic de
  // confirmación; borrar una sola captura no (ese ya tiene su propio
  // deshacer implícito: siempre puedes volver a analizar la sala).
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);
  // El bombillo se posa sobre el computador un instante al entrar a esta
  // pestaña, aunque los datos ya estén listos en localStorage: es la
  // entrada, no una espera real.
  const [cargando, setCargando] = useState(true);

  useEffect(() => suscribirEjecuciones(setEjecuciones), []);

  useEffect(() => {
    const id = window.setTimeout(() => setCargando(false), 620);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!confirmarVaciar) return undefined;
    const id = window.setTimeout(() => setConfirmarVaciar(false), 3200);
    return () => window.clearTimeout(id);
  }, [confirmarVaciar]);

  const visibles = useMemo(() => {
    if (filtro === "ocupado") return ejecuciones.filter((e) => e.personas > 0);
    if (filtro === "vacio") return ejecuciones.filter((e) => e.personas === 0);
    if (filtro === "derroche") return ejecuciones.filter(esDerroche);
    return ejecuciones;
  }, [ejecuciones, filtro]);

  const totales = useMemo(
    () => ({
      ejecuciones: ejecuciones.length,
      personas: ejecuciones.reduce((s, e) => s + e.personas, 0),
      ahorro: ejecuciones.reduce((s, e) => s + (e.ahorro || 0), 0) * 1000,
      derroches: ejecuciones.filter(esDerroche).length,
    }),
    [ejecuciones]
  );

  if (cargando) {
    return (
      <motion.div
        {...escena}
        className="flex min-h-[60vh] items-center justify-center"
      >
        <BombilloComputador />
      </motion.div>
    );
  }

  return (
    <motion.div {...escena}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-5">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              onClick={() => {
                setFiltro(f.clave);
                sonido.click(true);
              }}
              onMouseEnter={() => sonido.roce()}
              className="relative rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] outline-none transition-colors duration-300"
              style={{ color: filtro === f.clave ? "var(--ink)" : "var(--ink-3)" }}
            >
              {filtro === f.clave && (
                <motion.span
                  layoutId="luz-filtro-capturas"
                  transition={RESORTE.firme}
                  className="absolute inset-0 rounded-full border border-linen bg-paper shadow-raise"
                />
              )}
              <span className="relative">{f.etiqueta}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          {/* El tope no es invisible: se ve cuánto queda antes de que la
              captura más vieja empiece a soltarse para dejar sitio. */}
          <div title="Al llegar al tope, la captura más antigua se descarta para dejar sitio a la nueva.">
            <p className="annot text-[9px]">capturas guardadas</p>
            <p className="flex items-baseline gap-1">
              <Contador valor={totales.ejecuciones} className="text-[17px] leading-none" />
              <span className="mono text-[11px] text-ink-3">/ {MAX_EJECUCIONES}</span>
            </p>
            <div className="mt-1 h-[3px] w-16 overflow-hidden rounded-full bg-linen">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    totales.ejecuciones >= MAX_EJECUCIONES ? "var(--clay)" : "var(--amber)",
                }}
                animate={{ width: `${Math.min(100, (totales.ejecuciones / MAX_EJECUCIONES) * 100)}%` }}
                transition={RESORTE.firme}
              />
            </div>
          </div>

          {[
            { et: "personas vistas", v: totales.personas, d: 0, s: "" },
            { et: "ahorro acumulado", v: totales.ahorro, d: 1, s: " Wh" },
            { et: "posibles derroches", v: totales.derroches, d: 0, s: "" },
          ].map((x) => (
            <div key={x.et}>
              <p className="annot text-[9px]">{x.et}</p>
              <Contador
                valor={x.v}
                decimales={x.d}
                sufijo={x.s}
                className="text-[17px] leading-none"
              />
            </div>
          ))}

          {ejecuciones.length > 0 && (
            <Boton
              variante="linea"
              style={confirmarVaciar ? { color: "var(--clay)" } : undefined}
              onClick={() => {
                if (!confirmarVaciar) {
                  setConfirmarVaciar(true);
                  sonido.roce();
                  return;
                }
                vaciarEjecuciones();
                m.limpiar(); // también desaparecen de la línea de tiempo en vivo
                setConfirmarVaciar(false);
                sonido.papel();
              }}
            >
              {confirmarVaciar ? "confirmar: borrar todas" : "borrar todas"}
            </Boton>
          )}
        </div>
      </div>

      {visibles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={trans(0.45)}
          className="flex min-h-[46vh] flex-col items-center justify-center gap-4 rounded-[var(--r-xl)] border border-dashed border-linen text-center"
        >
          <p className="serif max-w-[24ch] text-[1.5rem] leading-tight text-ink-2">
            {ejecuciones.length === 0
              ? "Aquí se guardará cada sala que mires."
              : "Ninguna ejecución encaja con ese filtro."}
          </p>
          {ejecuciones.length === 0 && (
            <p className="annot">empieza el monitoreo para que aparezca la primera</p>
          )}
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {visibles.map((e, i) => (
              <Tarjeta
                key={e.id}
                e={e}
                indice={i}
                onBorrar={(id) => {
                  setEjecuciones(borrarEjecucion(id));
                  m.eliminarCaptura(id); // misma foto, misma id, también en la línea de tiempo
                }}
                onAmpliar={setAmpliada}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {ampliada && (
          <Lightbox
            imagen={ampliada.miniatura}
            titulo={`${new Date(ampliada.ts).toLocaleDateString("es", { day: "2-digit", month: "short" })} · ${new Date(ampliada.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`}
            detalle={`${ampliada.personas} personas · ${ampliada.ventanas} ventanas · ${ampliada.luminarias} luminarias`}
            onCerrar={() => setAmpliada(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
