import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api, ApiError } from "../lib/api.js";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import SceneBackground from "../components/SceneBackground.jsx";

const ESTADO_LABEL = {
  inactivo: "Mantén presionado para preguntar",
  grabando: "Escuchando…",
  transcribiendo: "Transcribiendo…",
  pensando: "Pensando…",
  hablando: "Respondiendo…",
};

export default function AssistantPage() {
  const [historial, setHistorial] = useState([]);
  const [estado, setEstado] = useState("inactivo");
  const [error, setError] = useState("");
  const [reportes, setReportes] = useState([]);
  const [generandoReporte, setGenerandoReporte] = useState(null);
  const [sugerencias, setSugerencias] = useState([]);
  const [soporteAudio, setSoporteAudio] = useState(true);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!("mediaDevices" in navigator) || !window.MediaRecorder) setSoporteAudio(false);
    api
      .historialAsistente(30)
      .then((data) => setHistorial(data.map((h) => ({ ...h, audioUrl: null }))))
      .catch(() => {});
    api
      .listarReportesAsistente(10)
      .then(setReportes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [historial]);

  useEffect(() => {
    if (historial.length === 0) return;
    api
      .sugerirTiposReporte(30)
      .then(setSugerencias)
      .catch(() => {});
  }, [historial.length]);

  async function iniciarGrabacion() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) enviarPregunta(blob);
        else setEstado("inactivo");
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setEstado("grabando");
    } catch {
      setError("No se pudo acceder al micrófono. Revisá los permisos del navegador.");
    }
  }

  function detenerGrabacion() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setEstado("transcribiendo");
      mediaRecorderRef.current.stop();
    }
  }

  async function enviarPregunta(blob) {
    try {
      const form = new FormData();
      form.append("audio", blob, "pregunta.webm");
      setEstado("pensando");
      const resp = await api.preguntarAsistente(form);
      const audioUrl = `data:audio/mpeg;base64,${resp.respuesta_audio_base64}`;

      setHistorial((prev) => [
        ...prev,
        {
          id_consulta: resp.id_consulta,
          pregunta: resp.transcripcion,
          respuesta: resp.respuesta_texto,
          fecha_hora: new Date().toISOString(),
          tiempo_respuesta: resp.tiempo_respuesta,
          audioUrl,
        },
      ]);

      setEstado("hablando");
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play().catch(() => setEstado("inactivo"));
      } else {
        setEstado("inactivo");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo procesar la pregunta.");
      setEstado("inactivo");
    }
  }

  async function handleGenerarReporte(claveReporte) {
    setGenerandoReporte(claveReporte);
    setError("");
    try {
      const reporte = await api.generarReporteAsistente({ clave_reporte: claveReporte, limite_consultas: 30 });
      setReportes((prev) => [reporte, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el reporte.");
    } finally {
      setGenerandoReporte(null);
    }
  }

  async function handleDescargar(reporte) {
    try {
      const blob = await api.descargarReporteAsistente(reporte.id_reporte);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${reporte.clave_reporte || "consumo"}-${reporte.id_reporte.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo descargar el reporte.");
    }
  }

  const grabando = estado === "grabando";
  const ocupado = estado === "transcribiendo" || estado === "pensando";

  return (
    <SceneBackground className="min-h-screen">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-6">
            <h1 className="font-display text-2xl font-semibold text-haze-100">Asistente de voz</h1>
            <p className="text-sm text-haze-400">
              Preguntá sobre consumo, ahorro o el estado del sistema. Respuestas ancladas en los datos ya
              analizados por SELENE.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col rounded-2xl border border-white/10 bg-void-800/60 p-5">
              <div ref={scrollRef} className="mb-4 h-[50vh] space-y-3 overflow-y-auto pr-1">
                {historial.length === 0 && (
                  <p className="mt-10 text-center text-xs text-haze-500">
                    Todavía no hay preguntas en esta conversación. Mantené presionado el botón de abajo y hablá.
                  </p>
                )}
                {historial.map((h, i) => (
                  <ChatExchange key={h.id_consulta || i} item={h} />
                ))}
              </div>

              <audio ref={audioRef} onEnded={() => setEstado("inactivo")} className="hidden" />

              {!soporteAudio && (
                <p className="mb-3 text-center font-mono text-[11px] text-red-300">
                  Este navegador no soporta grabación de audio (MediaRecorder).
                </p>
              )}

              <div className="flex flex-col items-center gap-2 border-t border-white/5 pt-4">
                <button
                  disabled={!soporteAudio || ocupado || estado === "hablando"}
                  onMouseDown={iniciarGrabacion}
                  onMouseUp={detenerGrabacion}
                  onMouseLeave={() => grabando && detenerGrabacion()}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    iniciarGrabacion();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    detenerGrabacion();
                  }}
                  className={`flex h-16 w-16 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    grabando ? "scale-110 bg-red-500 animate-pulse-slow" : "bg-beam-gradient hover:brightness-110"
                  }`}
                >
                  <MicIcon />
                </button>
                <p className="font-mono text-[11px] uppercase tracking-widest text-haze-400">
                  {ESTADO_LABEL[estado]}
                </p>
              </div>

              {error && <p className="mt-3 text-center font-mono text-[11px] text-red-300">{error}</p>}
            </div>

            <div className="flex flex-col gap-5">
              <div className="rounded-2xl border border-white/10 bg-void-800/60 p-5">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-haze-400">
                  Reportes sugeridos
                </p>
                {historial.length === 0 && (
                  <p className="text-[11px] text-haze-500">Hacé al menos una pregunta para que SELENE sugiera un reporte.</p>
                )}
                {historial.length > 0 && sugerencias.length === 0 && (
                  <p className="text-[11px] text-haze-500">Buscando reportes relevantes según la conversación…</p>
                )}
                <div className="flex flex-col gap-2">
                  {sugerencias.map((s) => (
                    <button
                      key={s.clave}
                      onClick={() => handleGenerarReporte(s.clave)}
                      disabled={Boolean(generandoReporte)}
                      className="w-full rounded-lg bg-beam-gradient px-4 py-2 text-xs font-semibold text-void-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {generandoReporte === s.clave ? "Generando…" : `Generar: ${s.etiqueta}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-void-800/60 p-5">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-haze-400">
                  Reportes generados
                </p>
                <div className="space-y-2">
                  {reportes.length === 0 && <p className="text-xs text-haze-500">Todavía no generaste ningún reporte.</p>}
                  {reportes.map((r) => (
                    <div
                      key={r.id_reporte}
                      className="rounded-lg border border-white/5 bg-void-900/60 px-3 py-2 text-xs text-haze-300"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-haze-500">
                        <span>{new Date(r.fecha_generacion).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 leading-relaxed">{r.resumen}</p>
                      <button
                        onClick={() => handleDescargar(r)}
                        className="mt-2 text-[11px] font-semibold text-beam-300 hover:text-beam-200"
                      >
                        Descargar (.pdf)
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SceneBackground>
  );
}

function ChatExchange({ item }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
      <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-beam-500/15 px-3 py-2 text-sm text-haze-100">
        {item.pregunta}
      </div>
      <div className="mr-auto max-w-[85%] rounded-xl rounded-tl-sm border border-white/5 bg-void-900/60 px-3 py-2 text-sm leading-relaxed text-haze-200">
        {item.respuesta || "(sin respuesta)"}
      </div>
    </motion.div>
  );
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0c0c0e" strokeWidth="2">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 19v3" strokeLinecap="round" />
    </svg>
  );
}
