import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Boton from "../../components/ui/Boton.jsx";
import Campo from "../../components/ui/Campo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { ApiError, api } from "../../lib/api.js";
import { RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * CONFIGURACION · RESUMEN DIARIO POR CORREO
 * -----------------------------------------------------------------
 * A qué hora y a qué correo le llega a esta cuenta, cada día, lo que hizo
 * (consultas al asistente, reportes que generó) y lo que SELENE encontró
 * (hallazgos de derroche) — por SMTP, sin ningún proveedor externo de por
 * medio. Si el día no tuvo nada de eso, el correo lo dice así de claro.
 *
 * Mismo patrón de modal que `VisorDocumento`: portal a `document.body`
 * porque se abre desde el riel de navegación, que ya vive dentro de varios
 * `motion.div` con transform.
 */

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function ConfiguracionCorreo({ onCerrar }) {
  const { usuario } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [activo, setActivo] = useState(false);
  const [horaEnvio, setHoraEnvio] = useState("08:00");
  const [correoDestino, setCorreoDestino] = useState(usuario?.correo || "");
  const [ultimaFechaEnviada, setUltimaFechaEnviada] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    const vivo = { current: true };
    api
      .obtenerConfigReporteEmail()
      .then((c) => {
        if (!vivo.current) return;
        setActivo(c.activo);
        setHoraEnvio(c.hora_envio);
        setCorreoDestino(c.correo_destino);
        setUltimaFechaEnviada(c.ultima_fecha_enviada);
      })
      .catch((e) => {
        if (vivo.current) setError(e instanceof ApiError ? e.message : "No se pudo cargar la configuración.");
      })
      .finally(() => {
        if (vivo.current) setCargando(false);
      });
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    const alTeclear = (e) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  const correoOk = RE_CORREO.test(correoDestino);

  const guardar = async () => {
    if (!correoOk || guardando) return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const c = await api.actualizarConfigReporteEmail({
        activo,
        hora_envio: horaEnvio,
        correo_destino: correoDestino.trim(),
      });
      setActivo(c.activo);
      setHoraEnvio(c.hora_envio);
      setCorreoDestino(c.correo_destino);
      setAviso(activo ? "Guardado: el resumen llegará todos los días a esa hora." : "Guardado. El envío diario quedó desactivado.");
      sonido.confirmar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar la configuración.");
      sonido.fallo();
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    if (probando) return;
    setProbando(true);
    setError("");
    setAviso("");
    try {
      await api.probarConfigReporteEmail();
      setAviso(`Se envió el resumen de hoy a ${correoDestino}. Revisa la bandeja (y spam).`);
      sonido.confirmar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar el correo de prueba.");
      sonido.fallo();
    } finally {
      setProbando(false);
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={trans(0.3)}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-paper/80 p-4 backdrop-blur-md sm:p-8"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 14, scale: 0.98 }}
        transition={RESORTE.objeto}
        className="vidrio relative flex w-full max-w-[460px] flex-col overflow-hidden p-6"
      >
        <div className="mb-1 flex items-start justify-between">
          <div>
            <p className="annot mb-1">cuenta</p>
            <h2 className="serif text-[1.4rem] leading-tight text-ink">Resumen diario por correo</h2>
          </div>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-linen bg-paper/90 text-ink-3 outline-none transition-colors duration-300 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="mb-5 text-[12px] leading-relaxed text-ink-2">
          Cada día, a la hora que elijas, esta cuenta ({usuario?.correo}) recibe un correo con sus
          consultas al asistente, los reportes que generó y los hallazgos de derroche del sistema. Si
          ese día no hubo nada de eso, el correo lo dice.
        </p>

        {cargando ? (
          <p className="py-8 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
            cargando…
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Interruptor activo/desactivado: mismo control segmentado que las
                pestañas de Historial, no un <input type="checkbox"> suelto —
                coherente con el resto de la interfaz. */}
            <div>
              <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-3">envío diario</p>
              <div className="flex gap-1 rounded-full border border-linen bg-paper-2/60 p-1">
                {[
                  { valor: true, etiqueta: "activo" },
                  { valor: false, etiqueta: "desactivado" },
                ].map((op) => (
                  <button
                    key={String(op.valor)}
                    onClick={() => {
                      if (op.valor !== activo) sonido.click(op.valor);
                      setActivo(op.valor);
                    }}
                    className="relative flex-1 rounded-full px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] outline-none transition-colors duration-300"
                    style={{ color: activo === op.valor ? "var(--ink)" : "var(--ink-3)" }}
                  >
                    {activo === op.valor && (
                      <motion.span
                        layoutId="luz-envio-diario"
                        transition={RESORTE.firme}
                        className="absolute inset-0 rounded-full border border-linen bg-paper shadow-raise"
                      />
                    )}
                    <span className="relative">{op.etiqueta}</span>
                  </button>
                ))}
              </div>
            </div>

            <Campo
              etiqueta="hora de envío"
              tipo="time"
              valor={horaEnvio}
              onChange={(e) => setHoraEnvio(e.target.value)}
              estado="neutro"
              ayuda={`Hora local (zona horaria del servidor). Hoy: ${
                ultimaFechaEnviada ? `último envío ${ultimaFechaEnviada}` : "todavía no se ha enviado"
              }.`}
            />

            <Campo
              etiqueta="correo de destino"
              tipo="email"
              valor={correoDestino}
              onChange={(e) => {
                setCorreoDestino(e.target.value);
                setAviso("");
              }}
              estado={correoDestino ? (correoOk ? "valido" : "invalido") : "neutro"}
              ayuda={correoDestino && !correoOk ? "Ese correo no parece válido." : null}
              autoComplete="email"
            />
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-4 overflow-hidden border-l-2 border-clay pl-3 font-mono text-[10.5px] leading-relaxed text-clay"
            >
              {error}
            </motion.p>
          )}
          {!error && aviso && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-4 overflow-hidden border-l-2 border-leaf pl-3 font-mono text-[10.5px] leading-relaxed text-ink-2"
            >
              {aviso}
            </motion.p>
          )}
        </AnimatePresence>

        {!cargando && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Boton variante="luz" onClick={guardar} disabled={!correoOk || guardando}>
              {guardando ? "guardando…" : "guardar cambios"}
            </Boton>
            <Boton variante="papel" onClick={probar} disabled={probando}>
              {probando ? "enviando…" : "enviar de prueba"}
            </Boton>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}
