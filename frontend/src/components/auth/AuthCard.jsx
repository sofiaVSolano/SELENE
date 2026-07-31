import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { ApiError } from "../../lib/api.js";
import HudFrame from "../HudFrame.jsx";

const MODES = [
  { id: "login", label: "Iniciar sesión" },
  { id: "register", label: "Crear cuenta" },
];

export default function AuthCard({ initialMode = "login" }) {
  const [mode, setMode] = useState(initialMode);
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();

  const checks = {
    length: contrasena.length >= 8,
    number: /\d/.test(contrasena),
    letter: /[a-zA-Z]/.test(contrasena),
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(correo, contrasena);
      } else {
        await register(nombre, correo, contrasena);
      }
      navigate("/panel");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-8 flex rounded-full border border-white/10 bg-void-800/60 p-1 font-mono text-xs">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id);
                setError("");
              }}
              className="relative flex-1 rounded-full px-4 py-2.5 uppercase tracking-wide transition-colors"
            >
              {mode === m.id && (
                <motion.span
                  layoutId="auth-pill"
                  className="absolute inset-0 rounded-full bg-beam-gradient"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className={`relative z-10 ${mode === m.id ? "text-void-950" : "text-haze-400"}`}>
                {m.label}
              </span>
            </button>
          ))}
        </div>

        <HudFrame className="rounded-2xl border border-white/10 bg-void-800/60 p-8 backdrop-blur">
          <p className="font-mono text-[11px] uppercase tracking-widest text-beam-400">
            ID://ACCESO
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-haze-100">
            {mode === "login" ? "Bienvenido de vuelta" : "Registrá tu cuenta"}
          </h1>
          <p className="mt-1 text-sm text-haze-400">
            {mode === "login"
              ? "Ingresá tus credenciales para acceder al panel de escaneo."
              : "Vas a poder ver el panel de cámaras apenas confirmes tu correo y contraseña."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <AnimatePresence mode="popLayout">
              {mode === "register" && (
                <motion.div
                  key="nombre"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <FieldTerminal label="NOMBRE" tag="usuario">
                    <input
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ada Lovelace"
                      className="w-full bg-transparent py-2 text-haze-100 placeholder:text-haze-400/50 focus:outline-none"
                    />
                  </FieldTerminal>
                </motion.div>
              )}
            </AnimatePresence>

            <FieldTerminal label="CORREO" tag="auth">
              <input
                required
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="tu@empresa.com"
                className="w-full bg-transparent py-2 text-haze-100 placeholder:text-haze-400/50 focus:outline-none"
              />
            </FieldTerminal>

            <div>
              <FieldTerminal label="CONTRASEÑA" tag="secreto">
                <input
                  required
                  type="password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent py-2 text-haze-100 placeholder:text-haze-400/50 focus:outline-none"
                />
              </FieldTerminal>

              {mode === "register" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip ok={checks.length}>MIN 8</Chip>
                  <Chip ok={checks.letter}>LETRA</Chip>
                  <Chip ok={checks.number}>NÚMERO</Chip>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden rounded-xl bg-beam-gradient py-3.5 text-sm font-semibold text-void-950 transition hover:brightness-110 disabled:opacity-70"
            >
              {loading && (
                <motion.span
                  className="absolute inset-y-0 w-1/3 bg-white/40"
                  initial={{ x: "-100%" }}
                  animate={{ x: "300%" }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              )}
              <span className="relative">
                {loading ? "Escaneando credenciales..." : mode === "login" ? "Entrar al panel" : "Crear cuenta"}
              </span>
            </button>
          </form>
        </HudFrame>
      </div>
    </div>
  );
}

function FieldTerminal({ label, tag, children }) {
  return (
    <div className="border-b border-white/10 pb-1 transition-colors focus-within:border-beam-400">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-haze-400">
        <span>{label}</span>
        <span className="text-haze-500">//{tag}</span>
      </div>
      {children}
    </div>
  );
}

function Chip({ ok, children }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] transition-colors ${
        ok ? "border-beam-400/50 bg-beam-500/10 text-beam-300" : "border-white/10 text-haze-500"
      }`}
    >
      {ok ? "✓ " : ""}
      {children}
    </span>
  );
}
