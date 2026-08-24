import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import SelectorSala from "../../components/SelectorSala.jsx";
import Boton from "../../components/ui/Boton.jsx";
import VisorDocumento from "../../components/ui/VisorDocumento.jsx";
import { emitirPulso } from "../../light/pulso.js";
import { api, ApiError } from "../../lib/api.js";
import { figurasParaReporte } from "../../lib/figuras.js";
import { CURVA, RESORTE, trans } from "../../lib/movimiento.js";
import { TODAS } from "../../lib/salaFiltro.js";
import { useSalaSeleccionada } from "../../lib/salaSeleccionada.js";
import { sonido } from "../../lib/sound.js";

/**
 * LA IMPRESORA
 * -----------------------------------------------------------------
 * Generar un reporte no es descargar un archivo: es ver cómo se imprime.
 *
 * Por qué merece la pena el teatro: el backend tarda entre tres y quince
 * segundos en componer el PDF (llama al modelo, arma los datos y renderiza).
 * Ese tiempo existe igual. Un spinner lo convierte en espera; la impresora
 * lo convierte en el momento más memorable de la aplicación, sin añadir ni
 * un milisegundo.
 *
 * La coreografía tiene un mínimo de 3,6 s aunque el servidor conteste antes
 * —una impresora que escupe la hoja instantáneamente no se lee como una
 * impresora— y espera lo que haga falta si tarda más.
 *
 * El "trrrrrr" es ruido de banda estrecha modulado a 26 Hz (`sonido.rodillo`),
 * no un archivo de audio.
 */

const MIN_MS = 3600;

const TIPOS = [
  { clave: "detallado", etiqueta: "detallado a tu medida", nota: "tú decides qué cubre" },
  { clave: "general", etiqueta: "general", nota: "todo lo conversado" },
  { clave: "consumo_diario", etiqueta: "consumo diario", nota: "día por día" },
  { clave: "consumo_mensual", etiqueta: "consumo mensual", nota: "mes por mes" },
  { clave: "plan_ahorro", etiqueta: "plan de ahorro", nota: "qué hacer ahora" },
];

/** Las líneas que van "saliendo impresas" sobre el papel. */
function LineaImpresa({ texto, indice, ancho }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, delay: indice * 0.055 }}
      className="mono text-[9.5px] leading-[1.55] text-ink-2"
      style={{ width: ancho }}
    >
      {texto}
    </motion.p>
  );
}

export default function Impresora({ claveInicial = "general", instruccionesIniciales = "", onCerrar, onListo }) {
  const [clave, setClave] = useState(claveInicial);
  const [instrucciones, setInstrucciones] = useState(instruccionesIniciales);
  const [fase, setFase] = useState("elegir"); // elegir|imprimiendo|cayendo|listo|error
  const [progreso, setProgreso] = useState(0);
  const [reporte, setReporte] = useState(null);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  /* El PDF vive en el navegador, no en una URL abierta.
     `GET /reporte/{id}/descargar` exige el Bearer token, así que abrir
     `url_descarga` en una pestaña nueva devolvería 401: una navegación normal
     no lleva cabecera de autorización. Se descarga el blob con el token y se
     trabaja sobre un object URL local. */
  const [pdf, setPdf] = useState(null); // { blob, url }
  const [mostrandoPdf, setMostrandoPdf] = useState(false);

  /* La sala que se está mirando en el historial manda también aquí: el
     reporte cubre lo mismo que estabas viendo. Se puede cambiar sin salir de
     la impresora, porque desde el asistente no se ve el selector del
     historial y había que poder saber —y corregir— el alcance antes de
     imprimir. */
  const [sala, setSala] = useSalaSeleccionada();

  /* Las figuras se recalculan al cambiar de sala (si no, la evidencia visual
     sería de otra sala que las cifras) pero NO en cada render: una captura
     nueva entrando a media impresión cambiaría el documento a mitad de
     camino.

     Es async porque ahora las imágenes viven en el servidor (`lib/figuras.js`)
     y hay que descargarlas y volverlas base64 antes de poder adjuntarlas. */
  const [figuras, setFiguras] = useState([]);
  useEffect(() => {
    let vivo = true;
    figurasParaReporte(sala).then((f) => {
      if (vivo) setFiguras(f);
    });
    return () => {
      vivo = false;
    };
  }, [sala]);

  const detenerRodillo = useRef(null);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      detenerRodillo.current?.();
    };
  }, []);

  useEffect(() => () => pdf && URL.revokeObjectURL(pdf.url), [pdf]);

  /** Trae el PDF una sola vez y lo deja cacheado para las tres acciones. */
  const obtenerPdf = async (r) => {
    if (pdf) return pdf;
    const blob = await api.descargarReporteAsistente(r.id_reporte);
    const nuevo = { blob, url: URL.createObjectURL(blob) };
    setPdf(nuevo);
    return nuevo;
  };

  async function imprimir() {
    setFase("imprimiendo");
    setProgreso(0);
    setError("");
    detenerRodillo.current = sonido.rodillo();

    const inicio = performance.now();
    // El progreso avanza hasta el 92 % con el tiempo; el último tramo lo
    // cierra la respuesta real, así que la barra nunca miente.
    const barra = window.setInterval(() => {
      setProgreso((p) => Math.min(0.92, p + 0.012 + Math.random() * 0.01));
    }, 60);
    const golpes = window.setInterval(() => sonido.lineaImpresa(), 190);

    try {
      const r = await api.generarReporteAsistente({
        clave_reporte: clave,
        // Restringe TODO el reporte a la sala, no solo las figuras: consumo,
        // ocupación, iluminación, eventos y desglose por luminaria (ver
        // `recolectar_panorama` en `assistant/report_data.py`).
        ...(sala !== TODAS ? { id_zona: sala } : {}),
        ...(clave === "detallado" ? { instrucciones: instrucciones.trim() } : {}),
        // Las imágenes de detección viven en el navegador, así que la sección
        // de evidencia visual del PDF sólo existe si se las manda aquí.
        figuras,
      });
      const restante = Math.max(0, MIN_MS - (performance.now() - inicio));
      await new Promise((res) => window.setTimeout(res, restante));
      if (!vivo.current) return;

      window.clearInterval(barra);
      window.clearInterval(golpes);
      detenerRodillo.current?.();
      setProgreso(1);
      setReporte(r);

      // La hoja termina de salir, cae en la bandeja y suena al posarse.
      setFase("cayendo");
      window.setTimeout(() => {
        if (!vivo.current) return;
        sonido.hojaCae();
        setFase("listo");
        sonido.confirmar();
        emitirPulso({ fuerza: 0.34, tipo: "exito", origen: { x: 0.5, y: 0.45 } });
        onListo?.(r);
      }, 620);
    } catch (e) {
      window.clearInterval(barra);
      window.clearInterval(golpes);
      detenerRodillo.current?.();
      if (!vivo.current) return;
      setError(
        e instanceof ApiError ? e.message : "La impresora no pudo componer el reporte."
      );
      setFase("error");
      sonido.fallo();
      emitirPulso({ tipo: "fallo" });
    }
  }

  /**
   * "Visualizar" enseña el PDF dentro de la propia aplicación (ver
   * `VisorDocumento`) en vez de abrir una pestaña nueva. Intentarlo con
   * `window.open()` — incluso reservando la ventana antes del await —
   * seguía fallando: pasarle `"noopener"` hace que varios navegadores
   * devuelvan `null` de la reserva, así que nunca había ventana real que
   * navegar y el bloqueo de pop-ups ganaba siempre.
   */
  const visualizar = async () => {
    setError("");
    try {
      await obtenerPdf(reporte);
      setMostrandoPdf(true);
      sonido.papel();
    } catch (e) {
      // El motivo real (p. ej. 404 "el archivo ya no existe en disco") es lo
      // que hay que mostrar; un "no se pudo" genérico oculta justo el dato
      // que explica por qué falló.
      setError(e instanceof ApiError ? e.message : "No se pudo abrir el reporte.");
    }
  };

  const descargar = async () => {
    try {
      const { url } = await obtenerPdf(reporte);
      const a = document.createElement("a");
      a.href = url;
      a.download = `selene-${reporte.clave_reporte || "reporte"}.pdf`;
      // Sin insertarlo en el documento, `.click()` no dispara la descarga
      // en varios navegadores.
      document.body.appendChild(a);
      a.click();
      a.remove();
      sonido.papel();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo descargar el archivo.");
    }
  };

  /**
   * Compartir el archivo, no un enlace: `url_descarga` sólo funciona con el
   * token de esta sesión, así que enviarla a alguien sería enviarle un 401.
   */
  const compartir = async () => {
    try {
      const { blob } = await obtenerPdf(reporte);
      const archivo = new File([blob], `selene-${reporte.clave_reporte || "reporte"}.pdf`, {
        type: "application/pdf",
      });

      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({
          files: [archivo],
          title: `SELENE · ${reporte.tipo_reporte}`,
          text: reporte.resumen || "Reporte de eficiencia energética generado por SELENE.",
        });
        sonido.confirmar();
        return;
      }

      // Sin API de compartir: al portapapeles va el resumen, que sí sirve
      // pegado en un correo o un chat.
      await navigator.clipboard?.writeText(
        `SELENE · ${reporte.tipo_reporte} (${reporte.periodo})\n\n${reporte.resumen || ""}`
      );
      setCopiado(true);
      sonido.confirmar();
      window.setTimeout(() => setCopiado(false), 2200);
    } catch {
      /* el usuario canceló el diálogo del sistema, o no hay portapapeles */
    }
  };

  const imprimiendo = fase === "imprimiendo";
  const hayHoja = fase !== "elegir" && fase !== "error";
  const alturaHoja = fase === "imprimiendo" ? progreso * 210 : hayHoja ? 210 : 0;

  const lineas = reporte
    ? [
        `SELENE · ${(reporte.tipo_reporte || "reporte").toUpperCase()}`,
        `periodo · ${reporte.periodo || "—"}`,
        "─────────────────────────────",
        ...(reporte.resumen || "Reporte generado.")
          .replace(/\s+/g, " ")
          .match(/.{1,42}(\s|$)/g)
          ?.slice(0, 7) || [],
      ]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={trans(0.3)}
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-paper/70 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-6"
      onClick={(e) => e.target === e.currentTarget && fase !== "imprimiendo" && onCerrar()}
    >
      {/* La maquina, las cinco plantillas y el boton no caben en la altura de
          un telefono: el dialogo se limita al viewport y desplaza por dentro
          en vez de desbordar sin salida. */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.97 }}
        transition={RESORTE.objeto}
        className="vidrio relative max-h-[92dvh] w-full max-w-[560px] overflow-y-auto px-5 py-6 sm:px-8 sm:py-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="annot mb-1">reporte</p>
            <h2 className="serif text-[1.7rem] leading-none">
              {fase === "listo" ? "Tu reporte está listo." : "La impresora de SELENE."}
            </h2>
          </div>
          <button
            onClick={onCerrar}
            disabled={imprimiendo}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-linen bg-paper text-ink-3 outline-none transition-colors duration-300 hover:text-ink disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* ---------------------------- LA MÁQUINA ---------------------------- */}
        <div className="relative mx-auto flex w-full max-w-[300px] flex-col items-center">
          {/* Cuerpo */}
          <motion.svg
            viewBox="0 0 300 96"
            className="w-full"
            animate={imprimiendo ? { y: [0, -0.6, 0.4, 0] } : { y: 0 }}
            transition={{ duration: 0.14, repeat: imprimiendo ? Infinity : 0 }}
          >
            {/* Bandeja de alimentación trasera */}
            <path d="M74 20 h152 l-10 -12 h-132 z" fill="var(--paper-3)" stroke="var(--ink-4)" strokeWidth="1.4" strokeLinejoin="round" />
            {/* Carcasa */}
            <rect x="34" y="20" width="232" height="56" rx="9" fill="var(--paper-2)" stroke="var(--ink-4)" strokeWidth="1.6" />
            <rect x="34" y="20" width="232" height="18" rx="9" fill="var(--paper)" opacity="0.7" />
            {/* Ranura de salida */}
            <rect x="66" y="66" width="168" height="6" rx="3" fill="var(--ink)" opacity="0.82" />
            {/* Luz de estado */}
            <motion.circle
              cx="248"
              cy="34"
              r="3.4"
              animate={{
                fill:
                  fase === "error" ? "#d8503c" : fase === "listo" ? "#3e9b6b" : imprimiendo ? "#ffb020" : "#c3bcb2",
                opacity: imprimiendo ? [1, 0.35, 1] : 1,
              }}
              transition={{ duration: 0.85, repeat: imprimiendo ? Infinity : 0 }}
            />
            {/* Rejilla de ventilación: detalle que le da edad al objeto */}
            {[0, 1, 2, 3, 4].map((i) => (
              <rect key={i} x={52} y={44 + i * 5} width="26" height="2" rx="1" fill="var(--ink-4)" opacity="0.5" />
            ))}
          </motion.svg>

          {/* -------------------------- LA HOJA -------------------------- */}
          <div className="relative -mt-[24px] w-[196px]" style={{ perspective: 700 }}>
            <motion.div
              className="fibra relative mx-auto overflow-hidden rounded-b-[3px] border border-linen border-t-0 bg-paper px-3 pt-2 shadow-float"
              style={{ transformOrigin: "top center" }}
              animate={{
                height: alturaHoja,
                y: fase === "cayendo" || fase === "listo" ? 26 : 0,
                rotate: fase === "cayendo" || fase === "listo" ? -1.4 : 0,
              }}
              transition={
                fase === "cayendo"
                  ? { duration: 0.6, ease: CURVA.objeto }
                  : { duration: 0.25, ease: "linear" }
              }
            >
              {/* Perforaciones laterales de papel continuo */}
              <span className="absolute inset-y-0 left-0 flex w-2 flex-col items-center justify-start gap-[7px] pt-1.5">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={i} className="block h-1 w-1 rounded-full bg-linen" />
                ))}
              </span>
              <span className="absolute inset-y-0 right-0 flex w-2 flex-col items-center justify-start gap-[7px] pt-1.5">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={i} className="block h-1 w-1 rounded-full bg-linen" />
                ))}
              </span>

              <div className="px-2.5">
                {imprimiendo && !reporte && (
                  <div className="flex flex-col gap-[5px] pt-1">
                    {Array.from({ length: Math.floor(progreso * 12) }).map((_, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        transition={{ duration: 0.18 }}
                        className="block h-[3px] origin-left rounded-full bg-linen"
                        style={{ width: `${58 + ((i * 37) % 40)}%` }}
                      />
                    ))}
                  </div>
                )}

                {reporte &&
                  lineas.map((l, i) => (
                    <LineaImpresa key={`${l}-${i}`} texto={l} indice={i} ancho="100%" />
                  ))}
              </div>
            </motion.div>

            {/* Bandeja receptora */}
            <motion.div
              className="mx-auto mt-1 h-[9px] w-[224px] rounded-b-[10px] border border-t-0 border-linen bg-paper-2"
              animate={{
                boxShadow: fase === "listo" ? "var(--shadow-float)" : "var(--shadow-raise)",
              }}
              transition={trans(0.3)}
            />
          </div>
        </div>

        {/* --------------------------- BARRA / ACCIONES --------------------------- */}
        <div className="mt-7">
          <AnimatePresence mode="wait">
            {fase === "elegir" && (
              <motion.div key="elegir" {...{ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: trans(0.3) }}>
                <p className="annot mb-2.5">qué quieres que imprima</p>

                {/* "Detallado" va aparte del resto: no es una plantilla más
                    que elegir, es el LLM redactando a la medida de lo que
                    se le pida, así que merece su propio espacio y su propia
                    caja de texto. */}
                <button
                  onClick={() => {
                    setClave("detallado");
                    sonido.click(true);
                  }}
                  onMouseEnter={() => sonido.roce()}
                  className={`mb-2.5 w-full rounded-[12px] border px-3.5 py-3 text-left outline-none transition-all duration-300 ease-light ${
                    clave === "detallado"
                      ? "border-amber bg-paper shadow-raise"
                      : "border-linen bg-paper/60 hover:border-ink-4"
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
                    <span className="block h-1.5 w-1.5 rounded-full bg-amber" />
                    detallado a tu medida
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    tú describes qué quieres · el LLM redacta el reporte con lo que haya disponible
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {clave === "detallado" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: CURVA.luz }}
                      className="overflow-hidden"
                    >
                      <textarea
                        value={instrucciones}
                        onChange={(e) => setInstrucciones(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder='p. ej. "enfócate en el consumo del pasillo esta semana y compáralo con el mes pasado"'
                        className="mb-2.5 w-full resize-none rounded-[12px] border border-linen bg-paper/60 px-3 py-2.5 text-[16px] leading-relaxed text-ink outline-none transition-colors duration-300 placeholder:text-ink-3 focus:border-amber sm:text-[12.5px]"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mb-6 grid grid-cols-2 gap-2">
                  {TIPOS.filter((t) => t.clave !== "detallado").map((t) => (
                    <button
                      key={t.clave}
                      onClick={() => {
                        setClave(t.clave);
                        sonido.click(true);
                      }}
                      onMouseEnter={() => sonido.roce()}
                      className={`rounded-[12px] border px-3 py-2.5 text-left outline-none transition-all duration-300 ease-light ${
                        clave === t.clave
                          ? "border-amber bg-paper shadow-raise"
                          : "border-linen bg-paper/60 hover:border-ink-4"
                      }`}
                    >
                      <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink">
                        {t.etiqueta}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-3">{t.nota}</span>
                    </button>
                  ))}
                </div>
                {/* El alcance, ANTES de imprimir: un PDF de la sala
                    equivocada no se ve equivocado. */}
                <div className="mb-4 flex justify-center">
                  <SelectorSala valor={sala} onChange={setSala} />
                </div>

                <div className="flex flex-col items-center gap-3">
                  <Boton variante="luz" onClick={imprimir} className="px-8 py-3">
                    imprimir
                  </Boton>
                  {/* Que el usuario sepa que va a salir en el PDF antes de
                      pedirlo: las figuras se adjuntan solas. */}
                  <p className="annot text-center text-[9px]">
                    {figuras.length
                      ? `se adjuntarán ${figuras.length} ${figuras.length === 1 ? "figura" : "figuras"} de detección`
                      : "todavía no hay capturas para la evidencia visual"}
                  </p>
                </div>
              </motion.div>
            )}

            {imprimiendo && (
              <motion.div key="barra" {...{ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: trans(0.3) }}>
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="annot">imprimiendo</p>
                  <p className="mono text-[10px] tabular-nums text-ink-3">
                    {Math.round(progreso * 100)} %
                  </p>
                </div>
                <div className="h-[3px] w-full overflow-hidden rounded-full bg-linen">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-hot to-amber-soft"
                    animate={{ width: `${progreso * 100}%` }}
                    transition={{ duration: 0.25, ease: "linear" }}
                  />
                </div>
              </motion.div>
            )}

            {fase === "listo" && (
              <motion.div
                key="listo"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={trans(0.4, 0.15)}
                className="flex flex-wrap items-center justify-center gap-2.5"
              >
                <Boton variante="luz" onClick={visualizar}>
                  visualizar
                </Boton>
                <Boton onClick={descargar}>descargar</Boton>
                <Boton onClick={compartir}>{copiado ? "enlace copiado" : "compartir"}</Boton>
              </motion.div>
            )}

            {fase === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={trans(0.3)}
                className="flex flex-col items-center gap-4"
              >
                <p className="border-l-2 border-clay pl-3 font-mono text-[11px] leading-relaxed text-clay">
                  {error}
                </p>
                <Boton onClick={imprimir}>reintentar</Boton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence>
        {mostrandoPdf && pdf && (
          <VisorDocumento
            url={pdf.url}
            titulo={reporte ? `${reporte.tipo_reporte} · ${reporte.periodo}` : "reporte"}
            onCerrar={() => setMostrandoPdf(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
