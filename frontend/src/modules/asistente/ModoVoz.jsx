import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLight } from "../../light/LightContext.jsx";
import { emitirPulso } from "../../light/pulso.js";
import { api, ApiError } from "../../lib/api.js";
import { CURVA, RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";
import Onda from "./Onda.jsx";

/**
 * MODO VOZ
 * -----------------------------------------------------------------
 * No hay botón de grabar. Al entrar en modo voz, TODA la parte inferior
 * de la pantalla se transforma: el compositor de texto desaparece y en su
 * lugar queda la onda, ocupando el ancho completo.
 *
 * El turno se cierra solo. Se mide el nivel del micrófono en tiempo real
 * y, tras 1,3 s de silencio habiendo hablado antes, se envía. Tener que
 * pulsar "parar" rompe la ilusión de conversación — es la diferencia
 * entre dictar y hablar con alguien.
 *
 * Mientras SELENE escucha, su bombillo palpita: es el único momento de la
 * aplicación en que la luz late sin que haya llegado un dato, y significa
 * exactamente eso — "te estoy oyendo".
 */

const SILENCIO_MS = 1300;
const UMBRAL_VOZ = 0.045; // RMS normalizado por encima del cual se considera voz

export default function ModoVoz({ onTurno, onCerrar }) {
  const [estado, setEstado] = useState("iniciando"); // iniciando|escuchando|pensando|hablando|error
  const [analyser, setAnalyser] = useState(null);
  const [aviso, setAviso] = useState("");
  const [transcripcion, setTranscripcion] = useState("");

  const ctxAudio = useRef(null);
  const stream = useRef(null);
  const grabadora = useRef(null);
  const trozos = useRef([]);
  const vigilante = useRef(0);
  const hablo = useRef(false);
  const ultimoSonido = useRef(0);
  const reproductor = useRef(null);
  const vivo = useRef(true);
  /* `enviar` necesita volver a escuchar cuando SELENE termina de hablar, pero
     `escuchar` se define después y a su vez depende de `enviar`. La referencia
     rompe el ciclo sin dejar closures viejas por medio. */
  const escucharRef = useRef(() => {});

  const { iluminar, light } = useLight();
  const intensidadBase = useRef(light.intensity);

  useEffect(() => {
    if (estado !== "escuchando") intensidadBase.current = light.intensity;
  }, [estado, light.intensity]);

  /* --- El bombillo de la interfaz palpita mientras se escucha --- */
  useEffect(() => {
    if (estado !== "escuchando") return undefined;
    let arriba = true;
    const id = window.setInterval(() => {
      arriba = !arriba;
      iluminar({ intensity: intensidadBase.current + (arriba ? 0.14 : 0) });
    }, 900);
    return () => {
      window.clearInterval(id);
      iluminar({ intensity: intensidadBase.current });
    };
  }, [estado, iluminar]);

  const limpiar = useCallback(() => {
    window.clearInterval(vigilante.current);
    try {
      grabadora.current?.state === "recording" && grabadora.current.stop();
    } catch {
      /* ya detenida */
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    reproductor.current?.pause();
    ctxAudio.current?.close().catch(() => {});
    ctxAudio.current = null;
    stream.current = null;
  }, []);

  /** Envía el clip grabado y reproduce la respuesta hablada. */
  const enviar = useCallback(
    async (blob) => {
      if (!blob || blob.size < 2000) {
        // Clip demasiado corto para contener una frase: se vuelve a escuchar.
        setEstado("escuchando");
        return;
      }
      setEstado("pensando");
      setAnalyser(null);
      sonido.microfono(false);

      try {
        const form = new FormData();
        form.append("audio", blob, "pregunta.webm");
        const r = await api.preguntarAsistente(form);
        if (!vivo.current) return;

        setTranscripcion(r.transcripcion);
        onTurno?.({ pregunta: r.transcripcion, respuesta: r.respuesta_texto, porVoz: true });
        emitirPulso({ fuerza: 0.28, tipo: "dato", origen: { x: 0.5, y: 0.88 } });

        // Reproducción con su propio analizador: la onda dibuja la voz real.
        const audio = new Audio(`data:audio/mp3;base64,${r.respuesta_audio_base64}`);
        reproductor.current = audio;
        const AC = window.AudioContext || window.webkitAudioContext;
        await ctxAudio.current?.close().catch(() => {}); // el del micrófono ya no hace falta
        const ctx = new AC();
        ctxAudio.current = ctx;
        const nodo = ctx.createMediaElementSource(audio);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        nodo.connect(an);
        an.connect(ctx.destination);

        setAnalyser(an);
        setEstado("hablando");
        audio.onended = () => {
          if (!vivo.current) return;
          setAnalyser(null);
          escucharRef.current(); // el turno vuelve al usuario, sin pedir permiso
        };
        await audio.play();
      } catch (e) {
        if (!vivo.current) return;
        setAviso(
          e instanceof ApiError
            ? e.message
            : "No se pudo hablar con el asistente. Revisa la conexión."
        );
        setEstado("error");
        sonido.fallo();
        emitirPulso({ tipo: "fallo" });
      }
    },
    [onTurno]
  );

  /** Abre el micrófono y empieza un turno de escucha. */
  const escuchar = useCallback(async () => {
    try {
      setAviso("");
      setEstado("iniciando");

      if (!stream.current) {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      await ctxAudio.current?.close().catch(() => {}); // no acumular contextos entre turnos
      const ctx = new AC();
      ctxAudio.current = ctx;
      const fuente = ctx.createMediaStreamSource(stream.current);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.6;
      fuente.connect(an);

      trozos.current = [];
      const grab = new MediaRecorder(stream.current);
      grabadora.current = grab;
      grab.ondataavailable = (e) => e.data.size && trozos.current.push(e.data);
      grab.onstop = () => enviar(new Blob(trozos.current, { type: "audio/webm" }));
      grab.start();

      setAnalyser(an);
      setEstado("escuchando");
      sonido.microfono(true);

      hablo.current = false;
      ultimoSonido.current = performance.now();
      const muestras = new Uint8Array(an.fftSize);

      window.clearInterval(vigilante.current);
      vigilante.current = window.setInterval(() => {
        an.getByteTimeDomainData(muestras);
        let suma = 0;
        for (let i = 0; i < muestras.length; i += 1) {
          const v = (muestras[i] - 128) / 128;
          suma += v * v;
        }
        const rms = Math.sqrt(suma / muestras.length);

        if (rms > UMBRAL_VOZ) {
          hablo.current = true;
          ultimoSonido.current = performance.now();
          return;
        }
        // Silencio sostenido tras haber hablado: se cierra el turno solo.
        if (hablo.current && performance.now() - ultimoSonido.current > SILENCIO_MS) {
          window.clearInterval(vigilante.current);
          if (grabadora.current?.state === "recording") grabadora.current.stop();
        }
      }, 120);
    } catch {
      setAviso("SELENE necesita permiso para usar el micrófono.");
      setEstado("error");
    }
  }, [enviar]);

  escucharRef.current = escuchar;

  useEffect(() => {
    vivo.current = true;
    escuchar();
    return () => {
      vivo.current = false;
      limpiar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cerrar = () => {
    limpiar();
    sonido.microfono(false);
    onCerrar();
  };

  const rotulo = {
    iniciando: "abriendo el micrófono",
    escuchando: "te escucho",
    pensando: "pensando",
    hablando: "selene responde",
    error: "algo salió mal",
  }[estado];

  return (
    <motion.div
      initial={{ opacity: 0, y: 34 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 34 }}
      transition={trans(0.42)}
      className="vidrio relative overflow-hidden px-6 py-5"
    >
      {/* Resplandor de fondo: cambia de color con el turno */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 blur-2xl"
        animate={{
          opacity: estado === "hablando" ? 0.5 : estado === "escuchando" ? 0.28 : 0.12,
          background:
            estado === "hablando"
              ? "radial-gradient(60% 100% at 50% 100%, rgba(255,176,32,0.75), transparent 70%)"
              : "radial-gradient(60% 100% at 50% 100%, rgba(25,21,18,0.28), transparent 70%)",
        }}
        transition={trans(0.5)}
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* El bombillo que palpita mientras escucha */}
          <motion.span
            className="relative flex h-7 w-7 items-center justify-center"
            animate={
              estado === "escuchando"
                ? { scale: [1, 1.12, 1] }
                : estado === "hablando"
                  ? { scale: [1, 1.05, 1] }
                  : { scale: 1 }
            }
            transition={{
              duration: estado === "escuchando" ? 1.8 : 0.9,
              repeat: estado === "escuchando" || estado === "hablando" ? Infinity : 0,
              ease: "easeInOut",
            }}
          >
            <motion.span
              className="absolute inset-0 rounded-full blur-md"
              animate={{
                opacity: estado === "escuchando" ? [0.35, 0.85, 0.35] : estado === "hablando" ? 0.8 : 0.15,
                backgroundColor: estado === "error" ? "#d8503c" : "#ffb020",
              }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            />
            <svg viewBox="0 0 24 24" className="relative h-4 w-4" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M9.6 17.6h4.8M10.3 20.2h3.4" />
              <path d="M12 3.6a5.2 5.2 0 0 1 3 9.5c-.5.35-.8.85-.8 1.45v.3H9.8v-.3c0-.6-.3-1.1-.8-1.45A5.2 5.2 0 0 1 12 3.6Z" />
            </svg>
          </motion.span>

          <div>
            <p className="annot" style={{ color: estado === "error" ? "var(--clay)" : undefined }}>
              {rotulo}
            </p>
            <AnimatePresence mode="wait">
              {transcripcion && estado !== "escuchando" && (
                <motion.p
                  key={transcripcion}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={trans(0.3)}
                  className="mt-0.5 max-w-[34ch] truncate text-[12px] text-ink-2"
                >
                  «{transcripcion}»
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mx-4 min-w-0 flex-1">
          <Onda
            analyser={analyser}
            estado={estado === "hablando" ? "hablando" : estado === "escuchando" ? "escuchando" : "pensando"}
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {estado === "escuchando" && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={RESORTE.firme}
              onClick={() => {
                if (grabadora.current?.state === "recording") grabadora.current.stop();
              }}
              className="rounded-full border border-linen bg-paper px-3.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-2 outline-none transition-colors duration-300 hover:text-ink"
            >
              ya terminé
            </motion.button>
          )}
          {estado === "error" && (
            <button
              onClick={escuchar}
              className="rounded-full border border-linen bg-paper px-3.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-2 outline-none transition-colors duration-300 hover:text-ink"
            >
              reintentar
            </button>
          )}
          <button
            onClick={cerrar}
            aria-label="Salir del modo voz"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-linen bg-paper text-ink-3 outline-none transition-colors duration-300 hover:border-ink-4 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {aviso && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: CURVA.luz }}
            className="relative mt-3 border-l-2 border-clay pl-3 font-mono text-[11px] text-clay"
          >
            {aviso}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
