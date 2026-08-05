import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import SelectorSala from "../../components/SelectorSala.jsx";
import { escena, RESORTE } from "../../lib/movimiento.js";
import { useSalaSeleccionada } from "../../lib/salaSeleccionada.js";
import { sonido } from "../../lib/sound.js";
import VistaAlertas from "./VistaAlertas.jsx";
import VistaCapturas from "./VistaCapturas.jsx";
import VistaReportes from "./VistaReportes.jsx";

/**
 * HISTORIAL
 * -----------------------------------------------------------------
 * Tres registros de lo que SELENE ha hecho, no uno: lo que ha VISTO
 * (capturas), lo que ha AVISADO (alertas de derroche, en voz) y lo que ha
 * ESCRITO (reportes). Comparten cabecera y pestaña, pero cada uno es su
 * propia vista con su propia entrada — capturas se posa sobre un
 * computador, reportes sobre unas hojas — porque no todos cargan igual:
 * capturas y alertas ya viven en el navegador, reportes viaja al backend.
 */

const PESTANAS = [
  { clave: "capturas", etiqueta: "capturas" },
  { clave: "alertas", etiqueta: "alertas" },
  { clave: "reportes", etiqueta: "reportes" },
];

export default function HistorialPage() {
  const [pestana, setPestana] = useState("capturas");
  // La sala elegida gobierna las tres vistas Y el reporte que se imprime
  // desde el asistente. Por eso es un estado compartido de la app y no local
  // de esta pantalla (ver `lib/salaSeleccionada.js`).
  const [sala, setSala] = useSalaSeleccionada();

  return (
    <motion.div {...escena} className="flex h-full flex-col px-4 py-5 sm:px-8 sm:py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="annot mb-1">historial</p>
          <h1 className="serif text-[clamp(1.6rem,2.8vw,2.2rem)] leading-none">
            Todo lo que SELENE ha visto, avisado e impreso.
          </h1>
        </div>

        <div data-tour="pestanas-historial" className="flex gap-1 rounded-full border border-linen bg-paper-2/60 p-1">
          {PESTANAS.map((p) => (
            <button
              key={p.clave}
              onClick={() => {
                if (p.clave !== pestana) sonido.click(true);
                setPestana(p.clave);
              }}
              onMouseEnter={() => sonido.roce()}
              className="relative rounded-full px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] outline-none transition-colors duration-300"
              style={{ color: pestana === p.clave ? "var(--ink)" : "var(--ink-3)" }}
            >
              {pestana === p.clave && (
                <motion.span
                  layoutId="luz-pestana-historial"
                  transition={RESORTE.firme}
                  className="absolute inset-0 rounded-full border border-linen bg-paper shadow-raise"
                />
              )}
              <span className="relative">{p.etiqueta}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="mb-4">
        <SelectorSala valor={sala} onChange={setSala} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {pestana === "capturas" && <VistaCapturas key="capturas" sala={sala} />}
          {pestana === "alertas" && <VistaAlertas key="alertas" sala={sala} />}
          {/* Los reportes ya generados NO se filtran: cada uno lleva su
              alcance escrito en el periodo ("julio de 2026 · Salón"), y
              esconder los de otras salas dejaría al usuario sin ver que ya
              existe el que busca. */}
          {pestana === "reportes" && <VistaReportes key="reportes" />}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
