import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Boton from "../../components/ui/Boton.jsx";
import { BombilloPapeles } from "../../components/ui/Cargando.jsx";
import VisorDocumento from "../../components/ui/VisorDocumento.jsx";
import { ApiError, api } from "../../lib/api.js";
import { CURVA, escena, trans } from "../../lib/movimiento.js";
import { useSpecular } from "../../lib/useSpecular.js";
import { sonido } from "../../lib/sound.js";

/**
 * VISTA · REPORTES
 * -----------------------------------------------------------------
 * Todo lo que la impresora (`modules/reportes/Impresora.jsx`) ha compuesto
 * queda archivado aquí. Es la única de las tres pestañas que depende de
 * verdad del backend (`GET /api/asistente/reportes`), así que el bombillo
 * con papeles no es puro teatro: se ve mientras la lista viaja de verdad,
 * con un mínimo de tiempo para que no sea un parpadeo si la red es rápida.
 *
 * Dos cosas que fallaban antes de corregirlas aquí:
 *
 *   · "Visualizar" abría el PDF con `window.open()`. Intentar reservar la
 *     pestaña ANTES del await que trae el blob (para que el navegador
 *     siguiera contando la apertura como parte del clic) tampoco bastaba:
 *     pasarle `"noopener"` a `window.open` hace que varios navegadores
 *     devuelvan `null` ahí mismo, así que la "reserva" nunca existía de
 *     verdad y el bloqueo de pop-ups seguía ganando siempre. La solución
 *     real es no depender de una ventana nueva: el PDF se enseña dentro
 *     de la propia aplicación, en `VisorDocumento` (un `<iframe>` sobre
 *     vidrio, ver ese componente para el detalle del portal).
 *   · "Descargar" hacía `.click()` sobre un `<a>` que nunca se insertaba
 *     en el documento; en varios navegadores eso no dispara la descarga.
 *     Ahora se agrega al DOM, se pulsa y se retira.
 *
 * El PDF se trae siempre como blob autenticado, nunca abriendo
 * `url_descarga` a pelo: ese endpoint exige el token, y una navegación
 * normal no lo manda.
 */

const MIN_MS = 550;

const ETIQUETA_TIPO = {
  consumo_diario: "consumo diario",
  consumo_mensual: "consumo mensual",
  plan_ahorro: "plan de ahorro",
  general: "general",
};

function TarjetaReporte({ r, indice, onEliminado }) {
  const specular = useSpecular();
  const [abierta, setAbierta] = useState(false);
  const [pdf, setPdf] = useState(null);
  const [cargandoPdf, setCargandoPdf] = useState(false);
  const [mostrandoPdf, setMostrandoPdf] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => pdf && URL.revokeObjectURL(pdf.url), [pdf]);

  useEffect(() => {
    if (!confirmarBorrado) return undefined;
    const id = window.setTimeout(() => setConfirmarBorrado(false), 3200);
    return () => window.clearTimeout(id);
  }, [confirmarBorrado]);

  const obtenerPdf = async () => {
    if (pdf) return pdf;
    setCargandoPdf(true);
    setError("");
    try {
      const blob = await api.descargarReporteAsistente(r.id_reporte);
      const nuevo = { blob, url: URL.createObjectURL(blob) };
      setPdf(nuevo);
      return nuevo;
    } finally {
      setCargandoPdf(false);
    }
  };

  const visualizar = async () => {
    setError("");
    try {
      await obtenerPdf();
      setMostrandoPdf(true);
      sonido.papel();
    } catch (e) {
      // El motivo real (p. ej. "el archivo ya no existe en disco" cuando el
      // backend se reconstruyó sin volumen persistente para los PDF) sí
      // ayuda a diagnosticar; un "no se pudo" genérico no dice nada.
      setError(e instanceof ApiError ? e.message : "No se pudo abrir el reporte.");
    }
  };

  const descargar = async () => {
    try {
      const { url } = await obtenerPdf();
      const a = document.createElement("a");
      a.href = url;
      a.download = `selene-${r.clave_reporte || "reporte"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      sonido.papel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo descargar el archivo.");
    }
  };

  const eliminar = async () => {
    if (!confirmarBorrado) {
      setConfirmarBorrado(true);
      sonido.roce();
      return;
    }
    setEliminando(true);
    setError("");
    try {
      await api.eliminarReporteAsistente(r.id_reporte);
      sonido.papel();
      onEliminado(r.id_reporte);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo eliminar el reporte.");
      setEliminando(false);
      setConfirmarBorrado(false);
    }
  };

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
      className="surface specular relative flex flex-col overflow-hidden p-5"
      {...specular}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-amber-hot to-amber-soft" />

      <div className="mb-3 flex items-baseline justify-between">
        <p className="annot text-amber-hot">{ETIQUETA_TIPO[r.clave_reporte] || r.tipo_reporte}</p>
        <p className="mono text-[10px] tabular-nums text-ink-3">
          {new Date(r.fecha_generacion).toLocaleDateString("es", { day: "2-digit", month: "short" })}
        </p>
      </div>

      <p className="serif mb-2 text-[1.2rem] leading-tight text-ink">{r.periodo}</p>
      <p className="line-clamp-3 flex-1 text-[12px] leading-relaxed text-ink-2">
        {r.resumen || "Reporte generado por SELENE."}
      </p>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="mt-2 overflow-hidden font-mono text-[10px] leading-relaxed text-clay"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: CURVA.luz }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex flex-wrap gap-2 border-t border-linen pt-3">
              <Boton variante="luz" onClick={visualizar} disabled={cargandoPdf || eliminando}>
                {cargandoPdf ? "abriendo…" : "visualizar"}
              </Boton>
              <Boton onClick={descargar} disabled={cargandoPdf || eliminando}>
                descargar
              </Boton>
              <Boton
                variante="linea"
                onClick={eliminar}
                disabled={eliminando}
                style={confirmarBorrado ? { color: "var(--clay)" } : undefined}
              >
                {eliminando ? "eliminando…" : confirmarBorrado ? "confirmar borrado" : "eliminar"}
              </Boton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mostrandoPdf && pdf && (
          <VisorDocumento
            url={pdf.url}
            titulo={`${ETIQUETA_TIPO[r.clave_reporte] || r.tipo_reporte} · ${r.periodo}`}
            onCerrar={() => setMostrandoPdf(false)}
          />
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function VistaReportes() {
  const [reportes, setReportes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    const inicio = performance.now();

    api
      .listarReportesAsistente()
      .then(async (lista) => {
        const restante = Math.max(0, MIN_MS - (performance.now() - inicio));
        await new Promise((res) => window.setTimeout(res, restante));
        if (vivo.current) setReportes(lista);
      })
      .catch((e) => {
        if (vivo.current) {
          setError(
            e instanceof ApiError ? e.message : "No se pudo cargar el historial de reportes."
          );
        }
      })
      .finally(() => {
        if (vivo.current) setCargando(false);
      });

    return () => {
      vivo.current = false;
    };
  }, []);

  if (cargando) {
    return (
      <motion.div {...escena} className="flex min-h-[60vh] items-center justify-center">
        <BombilloPapeles />
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        {...escena}
        className="flex min-h-[46vh] flex-col items-center justify-center gap-3 text-center"
      >
        <p className="border-l-2 border-clay pl-3 font-mono text-[11px] leading-relaxed text-clay">
          {error}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div {...escena}>
      <div className="mb-5">
        <p className="annot">
          {reportes.length} {reportes.length === 1 ? "reporte generado" : "reportes generados"}
        </p>
      </div>

      {reportes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={trans(0.45)}
          className="flex min-h-[46vh] flex-col items-center justify-center gap-4 rounded-[var(--r-xl)] border border-dashed border-linen text-center"
        >
          <p className="serif max-w-[26ch] text-[1.5rem] leading-tight text-ink-2">
            Todavía no le has pedido un reporte a SELENE.
          </p>
          <p className="annot">pídeselo al asistente: "genera un reporte"</p>
        </motion.div>
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {reportes.map((r, i) => (
              <TarjetaReporte
                key={r.id_reporte}
                r={r}
                indice={i}
                onEliminado={(id) => setReportes((prev) => prev.filter((x) => x.id_reporte !== id))}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}
