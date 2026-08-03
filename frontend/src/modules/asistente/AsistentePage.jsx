import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Particulas } from "../../components/ui/Cargando.jsx";
import { emitirPulso } from "../../light/pulso.js";
import { api, ApiError } from "../../lib/api.js";
import { CURVA, escena, RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";
import Impresora from "../reportes/Impresora.jsx";
import BarraConversaciones from "./BarraConversaciones.jsx";
import ModoVoz from "./ModoVoz.jsx";
import { useConversaciones } from "./conversaciones.js";

/**
 * CHAT INTELIGENTE
 * -----------------------------------------------------------------
 * La estructura es la de un chat moderno —barra lateral con historial,
 * hilo central, compositor abajo— porque pelearse con una convención que
 * el usuario ya domina no aporta nada. Lo que cambia es todo lo demás.
 *
 *   · Las respuestas no aparecen: se REVELAN palabra a palabra. El texto
 *     llega completo del servidor; el revelado es local y dura ~450 ms,
 *     lo justo para que se lea como alguien escribiendo y no como un
 *     bloque que se pega.
 *   · Mientras SELENE piensa no hay puntos suspensivos: hay partículas.
 *   · Pedir un reporte por escrito abre la impresora, no una descarga.
 *   · El modo voz no es un botón más: sustituye el compositor entero.
 */

const RE_REPORTE = /\b(gener[ae]|haz|hazme|crea|arma|quiero|dame|imprim\w*)\b[^.?!]*\breporte/i;

/** Revelado palabra a palabra. El texto ya está; esto sólo lo sirve. */
function TextoRevelado({ texto, animar = true }) {
  const palabras = texto.split(/(\s+)/);
  if (!animar) return <span>{texto}</span>;

  return (
    <span>
      {palabras.map((p, i) => (
        <motion.span
          key={`${i}-${p}`}
          initial={{ opacity: 0, filter: "blur(3px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{
            duration: 0.22,
            delay: Math.min(1.6, i * 0.014), // techo: un párrafo largo no puede tardar más
            ease: CURVA.luz,
          }}
        >
          {p}
        </motion.span>
      ))}
    </span>
  );
}

function Mensaje({ mensaje, esUltimo }) {
  const deSelene = mensaje.rol === "selene";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={trans(0.42)}
      className={`flex gap-3 ${deSelene ? "" : "justify-end"}`}
    >
      {deSelene && (
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-linen bg-paper shadow-raise">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="var(--amber)" strokeWidth="1.6" strokeLinecap="round">
            <path d="M9.6 17.6h4.8M10.3 20.2h3.4" />
            <path d="M12 3.6a5.2 5.2 0 0 1 3 9.5c-.5.35-.8.85-.8 1.45v.3H9.8v-.3c0-.6-.3-1.1-.8-1.45A5.2 5.2 0 0 1 12 3.6Z" />
          </svg>
        </span>
      )}

      <div className={deSelene ? "max-w-[70ch]" : "max-w-[54ch]"}>
        <div
          className={
            deSelene
              ? "text-[14.5px] leading-[1.72] text-ink"
              : "surface rounded-[16px] px-4 py-2.5 text-[14px] leading-[1.6] text-ink"
          }
        >
          {deSelene ? (
            <TextoRevelado texto={mensaje.texto} animar={Boolean(esUltimo && mensaje.nuevo)} />
          ) : (
            mensaje.texto
          )}
        </div>
        {mensaje.porVoz && (
          <p className="annot mt-1.5 text-[9px]">
            {deSelene ? "respondido en voz" : "dicho por voz"}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default function AsistentePage() {
  const c = useConversaciones();
  const [borrador, setBorrador] = useState("");
  const [pensando, setPensando] = useState(false);
  const [modoVoz, setModoVoz] = useState(false);
  const [impresora, setImpresora] = useState(false);
  const [barraAbierta, setBarraAbierta] = useState(false);
  // Sólo se llena cuando la impresora se abre porque el usuario pidió un
  // reporte EN EL CHAT (ver `enviar`); abrirla desde el ícono del compositor
  // no trae ninguna instrucción implícita, así que arranca vacío.
  const [instruccionesReporte, setInstruccionesReporte] = useState("");
  const [error, setError] = useState("");

  const hilo = useRef(null);
  const textarea = useRef(null);

  const mensajes = c.activa?.mensajes ?? [];

  useEffect(() => {
    hilo.current?.scrollTo({ top: hilo.current.scrollHeight, behavior: "smooth" });
  }, [mensajes.length, pensando]);

  /* El compositor crece con el texto hasta un tope, como debe ser. También
     se ajusta al placeholder cuando está vacío, y por eso el placeholder es
     corto: el texto largo anterior envolvía a cuatro renglones en un móvil y
     dejaba el compositor inflado antes de escribir nada. Lo que decía de más
     ya lo dicen el encabezado y las tres sugerencias de arriba. */
  useEffect(() => {
    const nodo = textarea.current;
    if (!nodo) return;
    nodo.style.height = "auto";
    nodo.style.height = `${Math.min(150, nodo.scrollHeight)}px`;
  }, [borrador]);

  async function enviar(texto) {
    const limpio = texto.trim();
    if (!limpio || pensando) return;

    setBorrador("");
    setError("");
    const id = c.agregarMensaje(c.activaId, { rol: "usuario", texto: limpio });
    sonido.pulso();

    // Intención de reporte: la impresora se encarga, no el chat. Lo que
    // escribió se pasa tal cual como instrucciones del reporte "detallado" —
    // si pidió "un reporte del consumo del pasillo esta semana", eso es
    // exactamente lo que debe redactar el LLM, no un resumen genérico.
    if (RE_REPORTE.test(limpio)) {
      c.agregarMensaje(id, {
        rol: "selene",
        texto: "Enciendo la impresora. Lo compongo detallado, a la medida de lo que acabas de pedir.",
        nuevo: true,
      });
      setInstruccionesReporte(limpio);
      window.setTimeout(() => setImpresora(true), 500);
      return;
    }

    setPensando(true);
    try {
      const r = await api.preguntarAsistenteTexto(limpio);
      c.agregarMensaje(id, { rol: "selene", texto: r.respuesta_texto, nuevo: true });
      sonido.papel();
      emitirPulso({ fuerza: 0.24, tipo: "dato", origen: { x: 0.6, y: 0.5 } });
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "No se pudo hablar con el asistente."
      );
      sonido.fallo();
      emitirPulso({ tipo: "fallo" });
    } finally {
      setPensando(false);
    }
  }

  const sugerencias = [
    "¿Dónde se está yendo más energía?",
    "¿Cuánto podría ahorrar apagando el pasillo?",
    "Genera un reporte del último mes",
  ];

  return (
    <motion.div {...escena} className="flex h-full min-h-0">
      <BarraConversaciones
        visibles={c.visibles}
        activaId={c.activaId}
        busqueda={c.busqueda}
        setBusqueda={c.setBusqueda}
        onElegir={c.setActivaId}
        onCrear={c.crear}
        onEliminar={c.eliminar}
        onRenombrar={c.renombrar}
        onAnclar={c.anclar}
        abierta={barraAbierta}
        onCerrar={() => setBarraAbierta(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Abrir el historial: sólo hace falta en móvil, donde vive oculto */}
        <div className="flex shrink-0 items-center px-4 pt-4 lg:hidden">
          <button
            onClick={() => {
              sonido.roce();
              setBarraAbierta(true);
            }}
            aria-label="Ver conversaciones"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-linen bg-paper text-ink-2 outline-none transition-colors duration-300 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
          </button>
        </div>

        {/* ------------------------------- HILO ------------------------------- */}
        <div ref={hilo} className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-[760px]">
            {mensajes.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={trans(0.5)}
                className="flex min-h-[52vh] flex-col items-center justify-center text-center"
              >
                <motion.span
                  className="mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-linen bg-paper shadow-raise"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="var(--amber)" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M9.6 17.6h4.8M10.3 20.2h3.4" />
                    <path d="M12 3.6a5.2 5.2 0 0 1 3 9.5c-.5.35-.8.85-.8 1.45v.3H9.8v-.3c0-.6-.3-1.1-.8-1.45A5.2 5.2 0 0 1 12 3.6Z" />
                  </svg>
                </motion.span>

                <h1 className="serif mb-3 text-[clamp(1.8rem,3.4vw,2.6rem)] leading-[1.06]">
                  Pregúntale a la sala.
                </h1>
                <p className="mb-9 max-w-[38ch] text-[13.5px] leading-relaxed text-ink-2">
                  SELENE conoce cada detección, cada consumo estimado y cada recomendación que ha
                  emitido. Habla o escribe.
                </p>

                <div className="flex flex-wrap justify-center gap-2">
                  {sugerencias.map((s, i) => (
                    <motion.button
                      key={s}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={trans(0.4, 0.2 + i * 0.07)}
                      whileHover={{ y: -2 }}
                      onClick={() => enviar(s)}
                      onMouseEnter={() => sonido.roce()}
                      className="rounded-full border border-linen bg-paper px-4 py-2 text-[12px] text-ink-2 outline-none shadow-raise transition-colors duration-300 hover:text-ink"
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-6">
                <AnimatePresence initial={false}>
                  {mensajes.map((m, i) => (
                    <Mensaje key={m.id} mensaje={m} esUltimo={i === mensajes.length - 1} />
                  ))}
                </AnimatePresence>

                <AnimatePresence>
                  {pensando && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={trans(0.3)}
                      className="flex items-center gap-3 pl-10"
                    >
                      <Particulas compacto />
                      <span className="annot">buscando en lo que ha medido</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={trans(0.3)}
                  className="mt-6 border-l-2 border-clay pl-3 font-mono text-[11px] leading-relaxed text-clay"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ---------------------------- COMPOSITOR ---------------------------- */}
        <div className="shrink-0 px-4 pb-4 sm:px-8 sm:pb-6">
          <div className="mx-auto max-w-[760px]">
            <AnimatePresence mode="wait">
              {modoVoz ? (
                <ModoVoz
                  key="voz"
                  onCerrar={() => setModoVoz(false)}
                  onTurno={({ pregunta, respuesta }) => {
                    const id = c.agregarMensaje(c.activaId, {
                      rol: "usuario",
                      texto: pregunta,
                      porVoz: true,
                    });
                    c.agregarMensaje(id, {
                      rol: "selene",
                      texto: respuesta,
                      porVoz: true,
                      nuevo: true,
                    });
                  }}
                />
              ) : (
                <motion.div
                  key="texto"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={trans(0.42)}
                  data-tour="compositor"
                  className="surface specular flex items-end gap-2 rounded-[22px] px-3 py-2.5"
                >
                  <textarea
                    ref={textarea}
                    rows={1}
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar(borrador);
                      }
                    }}
                    placeholder="Pregunta o pide un reporte…"
                    className="max-h-[150px] min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-relaxed text-ink outline-none placeholder:text-ink-4 sm:text-[14px]"
                  />

                  {/* Reporte */}
                  <button
                    onClick={() => {
                      sonido.click(true);
                      setInstruccionesReporte("");
                      setImpresora(true);
                    }}
                    onMouseEnter={() => sonido.roce()}
                    aria-label="Generar un reporte"
                    data-tour="boton-reporte"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-linen bg-paper text-ink-3 outline-none transition-colors duration-300 hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                      <path d="M7 9V4h10v5M7 18v3h10v-3" />
                      <rect x="4" y="9" width="16" height="9" rx="2" />
                    </svg>
                  </button>

                  {/* Voz */}
                  <motion.button
                    whileHover={{ y: -1.5 }}
                    whileTap={{ scale: 0.96 }}
                    transition={RESORTE.firme}
                    onClick={() => {
                      sonido.microfono(true);
                      setModoVoz(true);
                    }}
                    aria-label="Hablar con SELENE"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-linen bg-paper text-ink-2 outline-none transition-colors duration-300 hover:text-ink"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
                    </svg>
                  </motion.button>

                  {/* Enviar */}
                  <motion.button
                    whileHover={{ y: -1.5 }}
                    whileTap={{ scale: 0.96 }}
                    transition={RESORTE.firme}
                    disabled={!borrador.trim() || pensando}
                    onClick={() => enviar(borrador)}
                    aria-label="Enviar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink shadow-raise outline-none transition-opacity duration-300 disabled:opacity-35"
                    style={{
                      background: "linear-gradient(100deg, var(--sun), var(--amber) 60%, var(--ember))",
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M6 11l6-6 6 6" />
                    </svg>
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="annot mt-2.5 text-center text-[9px]">
              selene responde con lo que ha medido · nunca acciona una luminaria
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {impresora && (
          <Impresora
            claveInicial={instruccionesReporte ? "detallado" : "general"}
            instruccionesIniciales={instruccionesReporte}
            onCerrar={() => setImpresora(false)}
            onListo={(r) =>
              c.agregarMensaje(c.activaId, {
                rol: "selene",
                texto: `Listo. ${r.resumen || "El reporte quedó impreso."}`,
                nuevo: true,
              })
            }
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
