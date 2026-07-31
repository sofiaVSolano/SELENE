import { motion } from "framer-motion";
import Logo from "../Logo.jsx";

const TAGS = [
  { label: "rostro · 0.91", top: "22%", left: "58%", delay: 0 },
  { label: "movimiento · 0.76", top: "64%", left: "20%", delay: 1.4 },
  { label: "acceso · verificando", top: "40%", left: "68%", delay: 2.6 },
  { label: "sesión · segura", top: "76%", left: "60%", delay: 0.7 },
];

/** Panel izquierdo del acceso: un "radar" de escaneo con anillos concéntricos
 * y tags HUD flotantes — reemplaza la típica imagen de stock de un login. */
export default function RadarPanel() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-void-900 p-10 lg:flex">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 mask-fade-b bg-grid" />

      <Logo className="relative z-10" />

      <div className="relative flex flex-1 items-center justify-center">
        <div className="relative flex h-72 w-72 items-center justify-center">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border border-beam-400/30"
              initial={{ width: 0, height: 0, opacity: 0.8 }}
              animate={{ width: 288, height: 288, opacity: 0 }}
              transition={{ duration: 3.2, repeat: Infinity, delay: i * 1.05, ease: "easeOut" }}
            />
          ))}
          <div className="h-24 w-24 rounded-full bg-beam-radial" />
          <div className="absolute h-2 w-2 rounded-full bg-beam-400 shadow-[0_0_18px_4px_rgba(255,122,0,0.55)]" />

          {TAGS.map((t) => (
            <motion.span
              key={t.label}
              className="absolute rounded border border-beam-400/40 bg-void-950/80 px-2 py-1 font-mono text-[10px] text-beam-300 backdrop-blur"
              style={{ top: t.top, left: t.left }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, -6] }}
              transition={{ duration: 3.2, repeat: Infinity, delay: t.delay, times: [0, 0.15, 0.8, 1] }}
            >
              {t.label}
            </motion.span>
          ))}
        </div>
      </div>

      <div className="relative z-10 max-w-sm">
        <p className="font-display text-2xl font-semibold leading-snug text-haze-100">
          Cada sesión, cada detección, cada decisión — con hora exacta.
        </p>
        <p className="mt-3 text-sm text-haze-400">
          SELENE registra la trazabilidad completa de tu operación: quién
          entra, qué ve el sistema y cuándo actúa.
        </p>
      </div>
    </div>
  );
}
