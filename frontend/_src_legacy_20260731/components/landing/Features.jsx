import { motion } from "framer-motion";
import TiltCard from "../TiltCard.jsx";

const FEATURES = [
  {
    title: "Detección de ocupación",
    desc: "Modelos de detección de personas evalúan cada zona en tiempo real y registran el instante exacto de cada detección.",
    icon: (
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
    ),
  },
  {
    title: "Análisis de iluminación",
    desc: "Distingue luz natural de artificial por escena y calcula el porcentaje óptimo para cada ventana y luminaria.",
    icon: <path d="M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8l1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z" />,
  },
  {
    title: "Alertas automáticas",
    desc: "Genera encendidos, apagados y avisos de falla al instante, con prioridad y trazabilidad completa por luminaria.",
    icon: <path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zm7-6V11a7 7 0 10-14 0v5l-2 2v1h18v-1l-2-2z" />,
  },
  {
    title: "Consultas en lenguaje natural",
    desc: "Preguntá \"¿cuánto consumió el piso 3 esta semana?\" y recibí una respuesta directa, sin dashboards que interpretar.",
    icon: <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />,
  },
  {
    title: "Patrones y recomendaciones",
    desc: "Aprende el ritmo de uso de cada espacio y sugiere ajustes de horario que reducen consumo sin sacrificar confort.",
    icon: <path d="M3 3v18h18M7 15l4-6 4 3 5-8" />,
  },
  {
    title: "Reportes exportables",
    desc: "Consumo, ocupación y alertas listos para auditoría — PDF, CSV o HTML generados bajo demanda por período.",
    icon: <path d="M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6" />,
  },
];

export default function Features() {
  return (
    <section id="producto" className="mx-auto max-w-7xl px-6 py-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="mx-auto mb-16 max-w-2xl text-center"
      >
        <span className="font-mono text-xs uppercase tracking-widest text-beam-400">Producto</span>
        <h2 className="mt-3 font-display text-4xl font-semibold text-haze-100">
          Un sistema, cinco decisiones automáticas
        </h2>
        <p className="mt-4 text-haze-300">
          Todo lo que necesitás para pasar de cámaras pasivas a un sistema que
          decide por vos.
        </p>
      </motion.div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.08 }}
          >
            <TiltCard>
              <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-beam-gradient text-void-950">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 className="font-display text-lg font-semibold text-haze-100">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-400">{f.desc}</p>
            </TiltCard>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
