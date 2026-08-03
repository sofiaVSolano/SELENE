import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import Boton from "../../components/ui/Boton.jsx";
import { useLight } from "../../light/LightContext.jsx";
import { escena, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";
import Comparador from "./Comparador.jsx";
import LineaDeTiempo from "./LineaDeTiempo.jsx";
import { useMonitoreoCompartido } from "./MonitoreoContext.jsx";
import PanelLateral from "./PanelLateral.jsx";
import Visor from "./Visor.jsx";

/**
 * CENTRO INTELIGENTE DE MONITOREO
 * -----------------------------------------------------------------
 * No es un dashboard: es una sala de control con una sola ventana.
 * ~70 % del ancho es la imagen, ~30 % son anotaciones sobre ella, y
 * debajo la línea de tiempo de todo lo que se ha mirado.
 *
 * El detalle que cierra el sistema: cada inferencia RE-ILUMINA la
 * aplicación. `natural_score` mueve la intensidad de la fuente de luz
 * global y `porcentaje_natural` su temperatura, así que si la sala que
 * está mirando la cámara tiene mucha luz de día, SELENE entera se pone
 * más clara y más fría. La interfaz no representa el dato: lo padece.
 */

export default function CentroMonitoreo() {
  const m = useMonitoreoCompartido();
  const { iluminar } = useLight();
  const [comparando, setComparando] = useState(false);
  const [seleccion, setSeleccion] = useState([]);

  const analisis = m.capturaActiva?.analisis || null;
  // `activa === null` ya significa "sigue la última captura": es exactamente
  // la definición de "en vivo". Elegir una miniatura vieja en la línea de
  // tiempo pone un id concreto ahí, que es exactamente "revisando historial".
  const enVivo = m.activa === null;

  /* --- La luz de la app viene de la sala que se está midiendo --- */
  useEffect(() => {
    if (!analisis) return;
    const natural = (analisis.porcentaje_natural ?? 0) / 100;
    iluminar({
      x: 0.36, // la fuente vive sobre el visor
      y: 0.2,
      intensity: 0.42 + Math.min(0.55, (analisis.natural_score ?? 0.4) * 0.6),
      kelvin: 2400 + natural * 3200,
    });
  }, [analisis, iluminar]);

  const elegirCaptura = (id) => {
    if (!comparando) {
      m.setActiva(id);
      return;
    }
    setSeleccion((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const siguiente = [...prev, id].slice(-2);
      return siguiente;
    });
  };

  const alternarComparador = () => {
    sonido.click(!comparando);
    setComparando((v) => !v);
    setSeleccion([]);
  };

  const [ida, vuelta] = seleccion;
  const capA = m.capturas.find((c) => c.id === ida);
  const capB = m.capturas.find((c) => c.id === vuelta);
  const comparadorListo = comparando && capA && capB;
  // Se comparan siempre en orden cronológico, sin importar el orden de clic.
  const [antes, despues] =
    comparadorListo && new Date(capA.ts) <= new Date(capB.ts) ? [capA, capB] : [capB, capA];

  return (
    <motion.div
      {...escena}
      className="flex h-full flex-col overflow-y-auto px-4 py-4 sm:px-6 lg:overflow-hidden"
    >
      {/* ------------------------------ CABECERA ------------------------------ */}
      <header className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="annot mb-1">centro de monitoreo</p>
          <h1 className="serif text-[clamp(1.5rem,2.6vw,2.1rem)] leading-none">
            {m.capturaActiva
              ? m.capturaActiva.analisis.estado_ocupacion === "ocupado"
                ? "La sala está ocupada."
                : "La sala está vacía."
              : "La sala aún no ha sido mirada."}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Luminaria: sin ella no hay estimación de consumo */}
          <label className="flex items-center gap-2">
            <span className="annot">luminaria</span>
            <select
              value={m.idLuminaria}
              onChange={(e) => {
                m.setIdLuminaria(e.target.value);
                sonido.click(true);
              }}
              className="rounded-full border border-linen bg-paper px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2 outline-none transition-colors duration-300 hover:border-ink-4 focus:border-amber"
            >
              {m.luminarias.length === 0 && <option value="">sin luminarias</option>}
              {m.luminarias.map((l) => (
                <option key={l.id_luminaria} value={l.id_luminaria}>
                  {l.nombre} · {l.zona?.nombre}
                </option>
              ))}
            </select>
          </label>

          <Boton
            onClick={alternarComparador}
            disabled={m.capturas.length < 2}
            className={comparando ? "border-amber text-ink" : ""}
          >
            {comparando ? "salir del comparador" : "comparar capturas"}
          </Boton>
        </div>
      </header>

      {/* --------------------------- CUERPO 70 / 30 --------------------------- */}
      <div className="flex flex-1 flex-col gap-4 lg:min-h-0 lg:flex-row">
        <div className="flex min-w-0 flex-col lg:flex-[7]">
          <AnimatePresence mode="wait">
            {comparando ? (
              comparadorListo ? (
                <motion.div
                  key="comparador"
                  {...escena}
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <Comparador a={antes} b={despues} />
                </motion.div>
              ) : (
                <motion.div
                  key="elige"
                  {...escena}
                  className="surface flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[var(--r-xl)] px-8 text-center"
                >
                  <p className="serif max-w-[22ch] text-[1.5rem] leading-tight text-ink-2">
                    Elige <em className="text-ink">dos capturas</em> en la línea de tiempo.
                  </p>
                  <p className="annot">selene marcará sola lo que cambió entre ellas</p>
                </motion.div>
              )
            ) : (
              <motion.div key="visor" {...escena} className="flex min-h-0 flex-1 flex-col">
                <Visor
                  fuente={m.fuente}
                  captura={m.capturaActiva}
                  analizando={m.analizando}
                  auto={m.auto}
                  videoRef={m.videoRef}
                  reengancharCamara={m.reengancharCamara}
                  enVivo={enVivo}
                  onVolverEnVivo={() => m.setActiva(null)}
                  onIniciar={() => {
                    sonido.click(true);
                    m.iniciarMonitoreo();
                  }}
                  onDetener={() => {
                    sonido.click(false);
                    m.detenerMonitoreo();
                  }}
                  onAlternarAuto={() => {
                    sonido.click(!m.auto);
                    m.setAuto((v) => !v);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error del backend: papel que entra por la izquierda */}
          <AnimatePresence>
            {m.error && (
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={trans(0.3)}
                className="mt-3 border-l-2 border-clay pl-3 font-mono text-[11px] leading-relaxed text-clay"
              >
                {m.error}
              </motion.p>
            )}
          </AnimatePresence>

          <div className="mt-3 shrink-0" data-tour="linea-tiempo">
            <LineaDeTiempo
              capturas={m.capturas}
              activaId={m.capturaActiva?.id}
              onElegir={elegirCaptura}
              modoComparar={comparando}
              seleccion={seleccion}
            />
          </div>
        </div>

        {/* ----------------------------- ANOTACIONES ----------------------------- */}
        <div
          data-tour="panel"
          className="w-full shrink-0 lg:min-w-[286px] lg:max-w-[330px] lg:flex-[3] lg:overflow-y-auto lg:pr-1"
        >
          <PanelLateral
            analisis={analisis}
            anterior={m.anterior?.analisis}
            hayDatos={Boolean(analisis)}
          />
        </div>
      </div>
    </motion.div>
  );
}
