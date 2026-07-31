import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import HudFrame from "../HudFrame.jsx";

export default function Hero() {
  return (
    <section className="relative mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-20 lg:grid-cols-2 lg:items-center lg:pt-28">
      <div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full border border-beam-500/30 bg-beam-500/10 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-beam-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-beam-400 animate-blink" />
          Visión por computador · tiempo real
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="font-display text-5xl font-semibold leading-[1.05] tracking-tight text-haze-100 sm:text-6xl"
        >
          Luz donde hay
          <br />
          <span className="text-gradient-beam">gente. Oscuridad</span>
          <br />
          donde no.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mt-6 max-w-lg text-lg text-haze-300"
        >
          SELENE observa tus espacios cerrados con IA, detecta ocupación en
          tiempo real y decide cuándo encender, atenuar o apagar cada
          luminaria — con evidencia, no con suposiciones.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-9 flex flex-wrap items-center gap-4"
        >
          <Link
            to="/acceso?modo=registro"
            className="group relative overflow-hidden rounded-full bg-beam-gradient px-7 py-3.5 text-sm font-semibold text-void-950 shadow-lg shadow-beam-500/20 transition hover:brightness-110"
          >
            Activar SELENE
          </Link>
          <a
            href="#como-funciona"
            className="rounded-full border border-white/10 px-7 py-3.5 text-sm font-semibold text-haze-200 transition hover:border-beam-400/50 hover:text-white"
          >
            Ver cómo funciona
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-white/5 pt-6 font-mono"
        >
          {[
            ["99.2%", "uptime detección"],
            ["<180ms", "latencia por frame"],
            ["24/7", "monitoreo autónomo"],
          ].map(([value, label]) => (
            <div key={label}>
              <p className="text-xl font-semibold text-haze-100">{value}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-haze-400">{label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="relative"
      >
        <div className="absolute -inset-10 -z-10 bg-beam-radial blur-2xl" />
        <HudFrame className="rounded-2xl border border-white/10 bg-void-800/80 p-3 shadow-2xl shadow-black/50 backdrop-blur">
          <div className="flex items-center justify-between px-2 pb-3 font-mono text-[11px] text-haze-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-blink" />
              CAM_01 · EN VIVO
            </span>
            <span>1920×1080 · 30FPS</span>
          </div>

          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-gradient-to-br from-void-700 via-void-800 to-void-950">
            <div className="absolute inset-x-0 top-0 h-28 animate-scanline bg-gradient-to-b from-transparent via-beam-400/10 to-transparent" />

            {/* silueta */}
            <svg viewBox="0 0 200 160" className="absolute bottom-0 left-1/2 h-[78%] -translate-x-1/2 opacity-80">
              <ellipse cx="100" cy="150" rx="34" ry="6" fill="#000" opacity="0.35" />
              <circle cx="100" cy="46" r="16" fill="#3a3a40" />
              <path d="M70 150 C68 100 74 78 100 78 C126 78 132 100 130 150 Z" fill="#28282c" />
            </svg>

            <motion.div
              initial={{ opacity: 0, scale: 1.15 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 1, repeat: Infinity, repeatType: "reverse", repeatDelay: 2.2 }}
              className="absolute left-[27%] top-[18%] h-[64%] w-[46%] rounded-md border-2 border-beam-400"
            >
              <span className="absolute -top-6 left-0 rounded bg-beam-500 px-2 py-0.5 font-mono text-[10px] font-semibold text-void-950">
                person · 0.97
              </span>
            </motion.div>

            <div className="absolute left-[6%] top-[10%] h-16 w-20 rounded-sm border border-glow-400/70">
              <span className="absolute -top-5 left-0 rounded bg-glow-500/90 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-void-950">
                luminaire · 0.88
              </span>
            </div>

            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-lg border border-white/10 bg-void-950/70 px-3 py-2 font-mono text-[10px] text-haze-300 backdrop-blur">
              <span className="flex items-center gap-1.5 text-beam-300">
                <span className="h-1.5 w-1.5 rounded-full bg-beam-400" />
                OCUPADO
              </span>
              <span>NATURAL 64%</span>
              <span>ARTIFICIAL 36%</span>
            </div>
          </div>
        </HudFrame>
      </motion.div>
    </section>
  );
}
