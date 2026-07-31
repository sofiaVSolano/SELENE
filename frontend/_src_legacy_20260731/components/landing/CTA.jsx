import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export default function CTA() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-28">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="relative overflow-hidden rounded-3xl border border-beam-500/20 bg-gradient-to-br from-void-800 to-void-900 px-8 py-16 text-center sm:px-16"
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 bg-beam-radial blur-3xl" />
        <div className="relative">
          <span className="font-mono text-xs uppercase tracking-widest text-beam-400">
            Empezá hoy
          </span>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-4xl font-semibold text-haze-100 sm:text-5xl">
            Tus luminarias ya pueden ver. Es hora de que decidan.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-haze-300">
            Creá tu cuenta, conectá una cámara y mirá el primer escaneo de
            ocupación en menos de cinco minutos.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/acceso?modo=registro"
              className="rounded-full bg-beam-gradient px-8 py-3.5 text-sm font-semibold text-void-950 shadow-lg shadow-beam-500/25 transition hover:brightness-110"
            >
              Crear cuenta gratis
            </Link>
            <Link
              to="/acceso"
              className="rounded-full border border-white/10 px-8 py-3.5 text-sm font-semibold text-haze-200 transition hover:border-beam-400/50 hover:text-white"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
