import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import Boton from "../../components/ui/Boton.jsx";
import { Filamento } from "../../components/ui/Cargando.jsx";
import { DUR, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";
import Cajas from "./Cajas.jsx";

/**
 * EL VISOR
 * -----------------------------------------------------------------
 * Ocupa ~70 % del ancho y es el protagonista de la pantalla: todo lo
 * demás son anotaciones sobre lo que aquí se ve.
 *
 * SELENE solo monitorea EN VIVO: un único gesto —"iniciar monitoreo"— abre
 * la cámara y arranca el análisis continuo a la vez. No hay paso de "ahora
 * dale a analizar" ni de subir un archivo: se mira, y punto.
 *
 * Mientras el monitoreo corre, la cámara NUNCA se congela: las cajas de la
 * última inferencia se dibujan encima del vídeo en vivo y se van
 * reemplazando solas con cada ciclo, así que lo que el usuario ve es
 * literalmente "mi cámara, analizando de seguido". Sólo se congela la
 * imagen cuando el usuario entra a revisar una captura vieja desde la
 * línea de tiempo — eso sigue existiendo, pero es una revisión de
 * historial, no el estado por defecto.
 */
function Marco() {
  const lados = [
    "left-3 top-3 border-l border-t",
    "right-3 top-3 border-r border-t",
    "right-3 bottom-3 border-r border-b",
    "left-3 bottom-3 border-l border-b",
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {lados.map((l) => (
        <span key={l} className={`absolute h-4 w-4 border-ink-4/70 ${l}`} />
      ))}
    </div>
  );
}

export default function Visor({
  fuente,
  captura,
  analizando,
  auto,
  videoRef,
  onIniciar,
  onDetener,
  onAlternarAuto,
  enVivo,
  onVolverEnVivo,
  reengancharCamara,
}) {
  const hayFuente = Boolean(fuente.tipo);
  const revisandoHistorial = Boolean(captura) && !enVivo;

  /* El estado del monitoreo sobrevive a la navegación, pero este <video> no:
     al montarse de nuevo hay que volver a colgarle el stream abierto. */
  useEffect(() => {
    reengancharCamara?.();
  }, [reengancharCamara]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* ------------------------------ ENCUADRE ------------------------------ */}
      <div className="surface relative min-h-0 flex-1 overflow-hidden rounded-[var(--r-xl)] bg-paper-3">
        <div className="relative h-full w-full">
          {/* Vídeo en vivo: siempre montado mientras hay cámara, para no
              perder el stream al alternar con la revisión de historial.
              `object-contain` (no una caja con aspect-ratio calculado a
              mano) es lo que hace que ocupe TODA la altura disponible: el
              cálculo anterior fijaba el ancho al 100 % y derivaba el alto
              de ahí, que en un panel ancho como este da un vídeo más bajo
              de lo que cabía. Dejar que el propio elemento decida su
              encaje usa la dimensión que de verdad limita, sea cual sea. */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ease-light"
            style={{ opacity: hayFuente && !revisandoHistorial ? 1 : 0 }}
          />
          {/* `hayFuente` es la condición que faltaba: sin ella, al detener
              el monitoreo (fuente.tipo vuelve a null) las cajas de la
              última inferencia se quedaban dibujadas sobre la pantalla de
              "iniciar monitoreo", porque `captura` sigue apuntando a esa
              última inferencia y nada más las estaba ocultando. */}
          {hayFuente && !revisandoHistorial && captura && (
            <Cajas
              ancho={captura.ancho}
              alto={captura.alto}
              personas={captura.analisis.personas}
              elementos={captura.analisis.elementos_iluminacion}
              claveCaptura={captura.id}
            />
          )}

          {/* Captura congelada: sólo al revisar historial */}
          <AnimatePresence>
            {revisandoHistorial && (
              <motion.div
                key={captura.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={trans(0.3)}
                className="absolute inset-0"
              >
                <img src={captura.imagen} alt="Captura analizada" className="h-full w-full object-contain" />
                <Cajas
                  ancho={captura.ancho}
                  alto={captura.alto}
                  personas={captura.analisis.personas}
                  elementos={captura.analisis.elementos_iluminacion}
                  claveCaptura={captura.id}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sin fuente todavía: un único gesto para empezar */}
          {!hayFuente && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={trans(DUR.entrada)}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-7 px-8 text-center"
            >
              <Filamento etiqueta="los modelos están listos y esperando" />
              <p className="serif max-w-[22ch] text-[1.6rem] leading-tight text-ink-2">
                Muéstrale una sala a <em className="text-ink">SELENE</em>.
              </p>
              <Boton
                variante="luz"
                onClick={onIniciar}
                className="px-8"
                icono={
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <rect x="3" y="7" width="13" height="10" rx="2" />
                    <path d="M16 10.6 L21 7.6 V16.4 L16 13.4 Z" />
                  </svg>
                }
              >
                iniciar monitoreo
              </Boton>
            </motion.div>
          )}

          <Marco />

          {/* Barrido de análisis: la luz recorriendo la escena */}
          <AnimatePresence>
            {analizando && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={trans(DUR.ui)}
                className="barrido pointer-events-none absolute inset-0 mix-blend-plus-lighter"
              />
            )}
          </AnimatePresence>

          {/* Estado, arriba a la izquierda del encuadre */}
          <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2.5">
            <motion.span
              className="block h-2 w-2 rounded-full"
              style={{
                background: analizando
                  ? "var(--amber)"
                  : hayFuente && auto
                    ? "var(--leaf)"
                    : "var(--ink-4)",
              }}
              animate={analizando ? { scale: [1, 1.55, 1], opacity: [1, 0.5, 1] } : { scale: 1, opacity: 1 }}
              transition={{ duration: 1.1, repeat: analizando ? Infinity : 0, ease: "easeInOut" }}
            />
            <span className="annot text-ink-2">
              {revisandoHistorial
                ? `captura · ${new Date(captura.ts).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                : analizando
                  ? "analizando"
                  : hayFuente
                    ? auto
                      ? "monitoreo en vivo"
                      : "en pausa"
                    : "sin iniciar"}
            </span>
          </div>

          {/* Volver a en vivo: sólo existe al revisar historial */}
          <AnimatePresence>
            {revisandoHistorial && (
              <motion.button
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={trans(DUR.ui)}
                onClick={() => {
                  sonido.click(false);
                  onVolverEnVivo();
                }}
                className="absolute right-4 top-4 z-20 rounded-full border border-linen bg-paper/90 px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-2 outline-none backdrop-blur transition-colors duration-300 hover:text-ink"
              >
                volver a en vivo
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ------------------------------ CONTROLES ------------------------------ */}
      {hayFuente && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Boton
            variante={auto ? "papel" : "luz"}
            onClick={onAlternarAuto}
            icono={
              <motion.span
                className="block h-1.5 w-1.5 rounded-full"
                style={{ background: auto ? "var(--amber)" : "var(--ink-4)" }}
                animate={auto ? { opacity: [1, 0.25, 1] } : { opacity: 1 }}
                transition={{ duration: 1.6, repeat: auto ? Infinity : 0 }}
              />
            }
          >
            {auto ? "pausar monitoreo" : "reanudar"}
          </Boton>

          <Boton onClick={onDetener}>detener monitoreo</Boton>
        </div>
      )}
    </section>
  );
}
