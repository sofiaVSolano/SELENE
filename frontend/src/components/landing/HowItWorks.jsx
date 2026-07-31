import { motion } from "framer-motion";

const STEPS = [
  {
    n: "01",
    title: "Captura",
    desc: "La cámara de la zona transmite video en vivo al motor de inferencia de SELENE.",
  },
  {
    n: "02",
    title: "Detección",
    desc: "Redes de detección ubican personas, ventanas y luminarias en cada frame con su nivel de confianza.",
  },
  {
    n: "03",
    title: "Análisis",
    desc: "Se calcula ocupación, % de luz natural/artificial y se compara contra el patrón de uso histórico.",
  },
  {
    n: "04",
    title: "Acción",
    desc: "SELENE enciende, atenúa o apaga — y deja registro exacto de la hora de cada decisión.",
  },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="relative border-y border-white/5 bg-void-900/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mb-16 max-w-2xl"
        >
          <span className="font-mono text-xs uppercase tracking-widest text-beam-400">Cómo funciona</span>
          <h2 className="mt-3 font-display text-4xl font-semibold text-haze-100">
            De un frame de video a una decisión, en menos de 200ms
          </h2>
        </motion.div>

        <div className="relative grid gap-8 md:grid-cols-4">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-beam-500/40 to-transparent md:block" />
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-beam-400/40 bg-void-950 font-mono text-sm text-beam-300">
                {s.n}
              </div>
              <h3 className="font-display text-lg font-semibold text-haze-100">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-haze-400">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
