import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import Boton from "../../components/ui/Boton.jsx";
import Contador from "../../components/ui/Contador.jsx";
import Lightbox from "../../components/ui/Lightbox.jsx";
import { api, ApiError } from "../../lib/api.js";
import { TODAS } from "../../lib/salaFiltro.js";
import { useImagenSegura } from "../../lib/useImagenSegura.js";
import { useSpecular } from "../../lib/useSpecular.js";
import { CURVA, escena, RESORTE, trans } from "../../lib/movimiento.js";
import { suscribirOportunidad } from "../../oportunidad/bus.js";
import { sonido } from "../../lib/sound.js";

/**
 * VISTA · ALERTAS
 * -----------------------------------------------------------------
 * Cada vez que `useMonitoreo` detecta una sala vacía con la luz artificial
 * encendida, Lum aparece y lo dice EN EL MOMENTO (ver
 * `oportunidad/AvisoDeOportunidad.jsx`) y queda un registro aquí: día,
 * hora, la imagen exacta que disparó la alerta y la sala. La escena es el
 * instante; esta galería es la memoria.
 *
 * Igual que `VistaCapturas`, los datos salen del servidor (`GET
 * /api/alertas/historial`), no de `localStorage`: zona, luminaria e imagen
 * ya vienen resueltas por el backend, que ancla cada alerta a la detección
 * que la disparó (`Recomendacion.id_deteccion_origen`).
 *
 * Se refresca sola: al montar, al cambiar de sala, en cuanto esta misma
 * sesión dispara una alerta (suscrita a `oportunidad/bus.js`, el mismo aviso
 * que monta la escena de Lum) y con un sondeo de respaldo cada 25 s mientras
 * la pestaña está visible, por si la alerta vino de otra pestaña o
 * dispositivo.
 *
 * Misma gramática visual que las capturas —tarjeta que cobra vida al
 * acercarse— porque las tres pestañas del historial tienen que sentirse
 * hechas por la misma mano.
 */

const FILTROS = [
  { clave: "todas", etiqueta: "todas" },
  { clave: "alta", etiqueta: "prioridad alta" },
  { clave: "media", etiqueta: "prioridad media" },
];

const COLOR_PRIORIDAD = { alta: "var(--clay)", media: "var(--amber)" };

/** Misma idea que `normalizar` en `VistaCapturas`: mapea la fila de la API a
 * los nombres cortos que ya usaba este archivo cuando la fuente era
 * `lib/alertasAlmacen.js`. */
function normalizar(r) {
  return {
    id: r.id_recomendacion,
    ts: r.fecha_hora,
    idZona: r.id_zona,
    zona: r.zona,
    luminaria: r.luminaria,
    mensaje: r.mensaje,
    prioridad: r.prioridad,
    segundosSinOcupacion: r.segundos_sin_ocupacion,
    porcentajeArtificial: r.porcentaje_artificial,
    luminariasVisibles: r.luminarias_visibles,
    luminariasEncendidas: r.luminarias_encendidas,
    imagenUrl: r.imagen_url,
  };
}

function Tarjeta({ a, indice, onBorrar, onAmpliar }) {
  const specular = useSpecular();
  const [abierta, setAbierta] = useState(false);
  const { url: imagen } = useImagenSegura(a.imagenUrl);
  const fecha = new Date(a.ts);
  const color = COLOR_PRIORIDAD[a.prioridad] || "var(--amber)";

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
      {/* Imagen: clic para agrandarla, misma gramática que las capturas */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => imagen && onAmpliar(a, imagen)}
        onKeyDown={(e) => e.key === "Enter" && imagen && onAmpliar(a, imagen)}
        aria-label="Ver la imagen de la alerta en grande"
        className="relative aspect-[16/10] cursor-zoom-in overflow-hidden bg-paper-3 outline-none"
      >
        {imagen && (
          <motion.img
            src={imagen}
            alt=""
            className="h-full w-full object-cover"
            animate={{ scale: abierta ? 1.06 : 1 }}
            transition={{ duration: 0.5, ease: CURVA.luz }}
          />
        )}

        {/* Velo de alerta: rojo/ámbar según prioridad, no el ámbar genérico
            de las capturas — aquí el color SÍ es el mensaje. */}
        <motion.span
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(0deg, ${color}33 0%, transparent 55%)` }}
          animate={{ opacity: abierta ? 1 : 0.55 }}
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

        <span
          className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-linen bg-paper/90 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-2 backdrop-blur"
        >
          <motion.span
            className="block h-1.5 w-1.5 rounded-full"
            style={{ background: color }}
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
          prioridad {a.prioridad}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation(); // no debe abrir el lightbox al borrar
            onBorrar(a.id);
            sonido.papel();
          }}
          aria-label="Quitar alerta"
          className="absolute bottom-2.5 right-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-linen bg-paper/90 text-ink-3 opacity-0 outline-none backdrop-blur transition-all duration-300 hover:text-clay group-hover:opacity-100"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12.2h9.4L17.5 7" />
          </svg>
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="mono text-[11px] tabular-nums text-ink">
            {fecha.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="annot text-[9px]">
            {fecha.toLocaleDateString("es", { day: "2-digit", month: "short" })}
          </p>
        </div>

        <p className="serif text-[1.05rem] leading-tight text-ink">
          {a.zona || "sala"}
          {a.luminaria && <span className="text-ink-3"> · {a.luminaria}</span>}
        </p>

        <p className="mono mt-1.5 text-[10px] text-ink-3">
          <Contador valor={a.segundosSinOcupacion ?? 0} decimales={0} duracion={0.4} className="text-[10px]" /> s
          vacía · <Contador valor={a.porcentajeArtificial ?? 0} decimales={0} duracion={0.4} className="text-[10px]" />% artificial
        </p>

        <AnimatePresence initial={false}>
          {abierta && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: CURVA.luz }}
              className="overflow-hidden"
            >
              <p className="mt-3 border-t border-linen pt-3 text-[11.5px] leading-relaxed text-ink-2">
                {a.mensaje}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}

export default function VistaAlertas({ sala = TODAS }) {
  const [alertas, setAlertas] = useState([]);
  const [filtro, setFiltro] = useState("todas");
  const [ampliada, setAmpliada] = useState(null);
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const idZona = sala !== TODAS ? sala : undefined;

  /* `silencioso`: mismo motivo que en `VistaCapturas` — un refresco de
     fondo no debe hacer parpadear la galería ni tapar lo que ya se ve con
     un banner de error por un fallo pasajero de red. */
  const cargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) {
        setCargando(true);
        setError(null);
      }
      try {
        const filas = await api.historialAlertasSala(idZona, { limite: 100 });
        setAlertas(filas.map(normalizar));
        if (!silencioso) setError(null);
      } catch (e) {
        if (!silencioso) setError(e instanceof ApiError ? e.message : "No se pudo cargar el historial de alertas.");
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [idZona]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  /* Refresco automático, en dos capas — igual que `VistaCapturas`:
     1) Evento: en cuanto ESTA sesión dispara una alerta (mismo aviso que
        monta la escena de Lum, ver `oportunidad/bus.js`), se vuelve a pedir
        el historial sin esperar al sondeo.
     2) Sondeo: cada 25 s, y solo con la pestaña visible, por si la alerta
        vino de otra pestaña o dispositivo monitoreando la misma sala. */
  useEffect(() => suscribirOportunidad(() => cargar({ silencioso: true })), [cargar]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") cargar({ silencioso: true });
    }, 25000);
    return () => window.clearInterval(id);
  }, [cargar]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === "visible") cargar({ silencioso: true });
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  useEffect(() => {
    if (!confirmarVaciar) return undefined;
    const id = window.setTimeout(() => setConfirmarVaciar(false), 3200);
    return () => window.clearTimeout(id);
  }, [confirmarVaciar]);

  const visibles = useMemo(() => {
    if (filtro === "alta" || filtro === "media") {
      return alertas.filter((a) => a.prioridad === filtro);
    }
    return alertas;
  }, [alertas, filtro]);

  const totales = useMemo(
    () => ({
      alertas: alertas.length,
      altas: alertas.filter((a) => a.prioridad === "alta").length,
    }),
    [alertas]
  );

  const borrar = async (id) => {
    try {
      await api.eliminarAlerta(id);
      setAlertas((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo borrar la alerta.");
    }
  };

  const vaciarTodas = async () => {
    try {
      await api.vaciarAlertas(idZona);
      setAlertas([]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudieron borrar las alertas.");
    }
  };

  if (cargando) {
    return (
      <motion.div {...escena} className="flex min-h-[60vh] items-center justify-center">
        <p className="annot">cargando alertas…</p>
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
                  layoutId="luz-filtro-alertas"
                  transition={RESORTE.firme}
                  className="absolute inset-0 rounded-full border border-linen bg-paper shadow-raise"
                />
              )}
              <span className="relative">{f.etiqueta}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-6">
          {[
            { et: "alertas", v: totales.alertas },
            { et: "prioridad alta", v: totales.altas },
          ].map((x) => (
            <div key={x.et}>
              <p className="annot text-[9px]">{x.et}</p>
              <Contador valor={x.v} className="text-[17px] leading-none" />
            </div>
          ))}

          {alertas.length > 0 && (
            <Boton
              variante="linea"
              style={confirmarVaciar ? { color: "var(--clay)" } : undefined}
              onClick={() => {
                if (!confirmarVaciar) {
                  setConfirmarVaciar(true);
                  sonido.roce();
                  return;
                }
                vaciarTodas();
                setConfirmarVaciar(false);
                sonido.papel();
              }}
            >
              {confirmarVaciar ? "confirmar: borrar todas" : "borrar todas"}
            </Boton>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 border-l-2 border-clay pl-3 font-mono text-[11px] leading-relaxed text-clay">
          {error}
        </p>
      )}

      {visibles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={trans(0.45)}
          className="flex min-h-[46vh] flex-col items-center justify-center gap-4 rounded-[var(--r-xl)] border border-dashed border-linen text-center"
        >
          <p className="serif max-w-[26ch] text-[1.5rem] leading-tight text-ink-2">
            {alertas.length === 0
              ? "Ninguna sala vacía ha dejado la luz encendida. Todavía."
              : "Ninguna alerta encaja con ese filtro."}
          </p>
          {alertas.length === 0 && (
            <p className="annot">lum aparece solo y lo dice cuando eso pase</p>
          )}
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {visibles.map((a, i) => (
              <Tarjeta
                key={a.id}
                a={a}
                indice={i}
                onBorrar={borrar}
                onAmpliar={(alerta, url) => setAmpliada({ ...alerta, url })}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {ampliada && (
          <Lightbox
            imagen={ampliada.url}
            titulo={`${ampliada.zona || "sala"}${ampliada.luminaria ? ` · ${ampliada.luminaria}` : ""}`}
            detalle={`${new Date(ampliada.ts).toLocaleDateString("es", { day: "2-digit", month: "short" })} · ${new Date(ampliada.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })} · prioridad ${ampliada.prioridad}`}
            nota={ampliada.mensaje}
            onCerrar={() => setAmpliada(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
