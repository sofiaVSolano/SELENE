import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api.js";
import { hablar, notificarSistema } from "../../lib/alerts.js";
import HudFrame from "../HudFrame.jsx";

const CAPTURE_WIDTH = 640;
const SCAN_INTERVAL_MS = 1400;
const BOX_COLORS = { persona: "#ff7a00", iluminacion: "#ffd000" };

// Umbral desde el que se considera "luz encendida": % de iluminacion
// artificial que devuelve lightingAnalyzer para la escena. Es una heuristica
// (no hay lectura directa de un interruptor/relé), pero es una senal solida:
// una escena vacia con >=35% de luz artificial casi siempre tiene la
// luminaria prendida.
const LUZ_ENCENDIDA_UMBRAL = 35;
const SIN_OCUPACION_ALERTA_MS = 10_000;

export default function CameraPanel({ luminariaId, scanning, setScanning, onResult, onAlerta }) {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const captureCanvasRef = useRef(null);
  const scanningRef = useRef(false);
  const aspectRef = useRef(4 / 3);
  const luminariaIdRef = useRef(luminariaId);
  const vacioLuzDesdeRef = useRef(null);
  const alertaDisparadaRef = useRef(false);

  const [aspect, setAspect] = useState(4 / 3);
  const [cameraError, setCameraError] = useState("");
  const [scanError, setScanError] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [alertaProgresoMs, setAlertaProgresoMs] = useState(0);

  // --- Camara: pedir permiso y adjuntar el stream una sola vez ------------
  useEffect(() => {
    let stream;
    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          setStreaming(true);
        }
      })
      .catch(() => setCameraError("No se pudo acceder a la cámara. Revisá los permisos del navegador."));

    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    luminariaIdRef.current = luminariaId;
  }, [luminariaId]);

  useEffect(() => {
    scanningRef.current = scanning;
    if (scanning) {
      runLoop();
    } else {
      vacioLuzDesdeRef.current = null;
      alertaDisparadaRef.current = false;
      setAlertaProgresoMs(0);
    }
  }, [scanning]);

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (v && v.videoWidth) {
      const a = v.videoWidth / v.videoHeight;
      aspectRef.current = a;
      setAspect(a);
    }
  }

  async function runLoop() {
    setScanError("");
    while (scanningRef.current) {
      const start = performance.now();
      try {
        // eslint-disable-next-line no-await-in-loop
        await captureAndAnalyze();
      } catch (err) {
        setScanError(err instanceof ApiError ? err.message : "No se pudo analizar el frame.");
      }
      const elapsed = performance.now() - start;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, Math.max(SCAN_INTERVAL_MS - elapsed, 250)));
    }
  }

  async function captureAndAnalyze() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const w = CAPTURE_WIDTH;
    const h = Math.round(CAPTURE_WIDTH / aspectRef.current);

    const canvas = captureCanvasRef.current;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return;

    const form = new FormData();
    form.append("imagen", blob, "frame.jpg");
    if (luminariaIdRef.current) form.append("id_luminaria", luminariaIdRef.current);

    const resultado = await api.analyzeFrame(form);
    drawBoxes(resultado, w, h);
    onResult?.(resultado);
    evaluarAlertaOcupacionLuz(resultado);
  }

  function evaluarAlertaOcupacionLuz(resultado) {
    const vacia = resultado.estado_ocupacion === "vacio";
    const luzEncendida = resultado.porcentaje_artificial >= LUZ_ENCENDIDA_UMBRAL;

    if (!(vacia && luzEncendida)) {
      vacioLuzDesdeRef.current = null;
      alertaDisparadaRef.current = false;
      setAlertaProgresoMs(0);
      return;
    }

    if (vacioLuzDesdeRef.current === null) vacioLuzDesdeRef.current = Date.now();
    const transcurrido = Date.now() - vacioLuzDesdeRef.current;
    setAlertaProgresoMs(transcurrido);

    if (transcurrido >= SIN_OCUPACION_ALERTA_MS && !alertaDisparadaRef.current) {
      alertaDisparadaRef.current = true;
      dispararAlerta(Math.round(transcurrido / 1000), resultado.porcentaje_artificial);
    }
  }

  async function dispararAlerta(segundos, porcentajeArtificial) {
    const mensajeInmediato =
      "Oye, no hay nadie en esta zona y las luces están encendidas. Recomiendo apagarlas.";

    hablar(mensajeInmediato);
    notificarSistema("SELENE · Anomalía detectada", mensajeInmediato);
    onAlerta?.({ mensaje: mensajeInmediato, fecha_hora: new Date().toISOString(), guardada: false });

    if (!luminariaIdRef.current) return;
    try {
      const data = await api.reportarAlerta({
        id_luminaria: luminariaIdRef.current,
        segundos_sin_ocupacion: segundos,
        porcentaje_artificial: porcentajeArtificial,
      });
      onAlerta?.({ ...data, guardada: true });
    } catch {
      // ya se hablo/mostro localmente; si falla el guardado no bloquea el escaneo
    }
  }

  function drawBoxes(resultado, captureW, captureH) {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / captureW;
    const scaleY = canvas.height / captureH;

    const draw = (items, color, kind) => {
      items.forEach((item) => {
        const { x1, y1, x2, y2 } = item.bbox;
        const x = x1 * scaleX;
        const y = y1 * scaleY;
        const w = (x2 - x1) * scaleX;
        const h = (y2 - y1) * scaleY;

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        const label = `${item.clase} · ${(item.confianza * 100).toFixed(0)}%`;
        ctx.font = "600 11px 'JetBrains Mono', monospace";
        const textW = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, Math.max(y - 18, 0), textW + 10, 18);
        ctx.fillStyle = "#0c0c0e";
        ctx.fillText(label, x + 4, Math.max(y - 5, 13));
      });
    };

    draw(resultado.personas, BOX_COLORS.persona, "persona");
    draw(resultado.elementos_iluminacion, BOX_COLORS.iluminacion, "iluminacion");
  }

  return (
    <HudFrame className="rounded-2xl border border-white/10 bg-void-800/60 p-3">
      <div className="flex items-center justify-between px-2 pb-3 font-mono text-[11px] text-haze-400">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${scanning ? "bg-red-500 animate-blink" : "bg-haze-500"}`} />
          {scanning ? "ESCANEANDO EN VIVO" : streaming ? "CÁMARA LISTA" : "INICIALIZANDO CÁMARA…"}
        </span>
        <button
          onClick={() => setScanning(!scanning)}
          disabled={!streaming || !luminariaId}
          className="rounded-full bg-beam-gradient px-4 py-1.5 text-[11px] font-semibold text-void-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {scanning ? "Detener escaneo" : "Iniciar escaneo"}
        </button>
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-void-950" style={{ aspectRatio: aspect }}>
        <video
          ref={videoRef}
          onLoadedMetadata={handleLoadedMetadata}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <canvas ref={captureCanvasRef} className="hidden" />

        {alertaProgresoMs > 0 && (
          <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-red-500/40 bg-void-950/80 px-3 py-2 font-mono text-[10px] text-red-300 backdrop-blur">
            <div className="flex items-center justify-between">
              <span>SIN OCUPACIÓN + LUZ ENCENDIDA</span>
              <span>{Math.min(Math.round(alertaProgresoMs / 1000), 10)}s / 10s</span>
            </div>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-red-950/60">
              <div
                className="h-full bg-red-400 transition-[width]"
                style={{ width: `${Math.min((alertaProgresoMs / SIN_OCUPACION_ALERTA_MS) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {!streaming && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-haze-400">
            Solicitando acceso a la cámara…
          </div>
        )}

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-void-950/90 px-8 text-center font-mono text-xs text-red-300">
            {cameraError}
          </div>
        )}
      </div>

      {scanError && (
        <p className="mt-2 px-1 font-mono text-[11px] text-red-300">{scanError}</p>
      )}
      {!luminariaId && (
        <p className="mt-2 px-1 font-mono text-[11px] text-beam-300">
          Elegí o creá una luminaria a la derecha para poder iniciar el escaneo.
        </p>
      )}
    </HudFrame>
  );
}
