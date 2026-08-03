import { motion } from "framer-motion";
import { RESORTE, trans } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";

/**
 * CONTROLES DEL RECORRIDO
 * -----------------------------------------------------------------
 * Una barra baja, discreta, con el mismo lenguaje que el resto de SELENE:
 * papel elevado, tipografía mono en versalitas, la luz como único acento.
 *
 * El usuario manda sobre el recorrido, no al revés: puede pausar, retroceder,
 * repetir con otras palabras, saltar o terminar cuando quiera. Los ajustes de
 * accesibilidad (volumen, velocidad, subtítulos, silencio) viven detrás de un
 * único botón para no convertir la barra en un panel de control — pero están
 * a un clic, no enterrados.
 */

const Icono = {
  pausa: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
  atras: <path d="M15 6l-6 6 6 6" />,
  saltar: <path d="M9 6l6 6-6 6" />,
  repetir: <path d="M4 12a8 8 0 1 1 2.5 5.8M4 18v-5h5" />,
  cerrar: <path d="M6 6l12 12M18 6L6 18" />,
  ajustes: <path d="M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.84 2.83l-.06-.06a1.7 1.7 0 0 0-2.88 1.2v.17a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-3-1.31l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0-1.2-2.88H2.8a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.31-3l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34h.08A1.7 1.7 0 0 0 10 2.8V2.6a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 2.88 1.2l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0 1.2 2.88h.17a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.59 1.4z" />,
  sonando: <path d="M11 5 6.5 9H3v6h3.5L11 19zM15.5 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />,
  mudo: <path d="M11 5 6.5 9H3v6h3.5L11 19zM16 10l5 4M21 10l-5 4" />,
  subtitulos: <path d="M4 6h16v12H4zM7.5 11.5h3M13.5 11.5h3M7.5 14.5h9" />,
};

function Boton({ etiqueta, children, onClick, activo = false, ancho = false, deshabilitado = false }) {
  return (
    <motion.button
      whileHover={deshabilitado ? {} : { y: -1.5 }}
      whileTap={deshabilitado ? {} : { scale: 0.94 }}
      transition={RESORTE.firme}
      onClick={() => {
        if (deshabilitado) return;
        sonido.roce();
        onClick();
      }}
      disabled={deshabilitado}
      title={etiqueta}
      aria-label={etiqueta}
      className={`flex h-9 items-center justify-center gap-2 rounded-full border bg-paper outline-none transition-colors duration-300 disabled:cursor-default disabled:opacity-30 ${
        ancho ? "px-4" : "w-9"
      } ${activo ? "border-amber text-ink" : "border-linen text-ink-2 hover:text-ink"}`}
    >
      {children}
    </motion.button>
  );
}

function Svg({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[15px] w-[15px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export default function Controles({
  pausado,
  primero,
  ultimo,
  mudo,
  volumen,
  velocidad,
  subtitulos,
  ajustes,
  onAjustes,
  onPausar,
  onReanudar,
  onAtras,
  onSaltar,
  onRepetir,
  onTerminar,
  onMudo,
  onVolumen,
  onVelocidad,
  onSubtitulos,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={trans(0.42)}
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-3 pb-4 sm:pb-6"
    >
      {/* --- Ajustes de accesibilidad, plegados por defecto --- */}
      {ajustes && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={trans(0.3)}
          className="surface flex w-full max-w-[420px] flex-col gap-3 rounded-[var(--r-lg)] px-4 py-3"
        >
          <label className="flex items-center gap-3">
            <span className="annot w-16 shrink-0">volumen</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volumen}
              onChange={(e) => onVolumen(Number(e.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-linen accent-amber outline-none"
              aria-label="Volumen de la narración"
            />
            <span className="mono w-8 shrink-0 text-right text-[10px] tabular-nums text-ink-3">
              {Math.round(volumen * 100)}
            </span>
          </label>

          <div className="flex items-center gap-3">
            <span className="annot w-16 shrink-0">velocidad</span>
            <div className="flex flex-1 gap-1.5">
              {[0.75, 1, 1.25, 1.5].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    sonido.click(true);
                    onVelocidad(v);
                  }}
                  className={`flex-1 rounded-full border py-1 font-mono text-[10px] tabular-nums outline-none transition-colors duration-300 ${
                    velocidad === v
                      ? "border-amber bg-paper text-ink"
                      : "border-linen text-ink-3 hover:text-ink"
                  }`}
                >
                  {v}×
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Boton etiqueta={subtitulos ? "Ocultar subtítulos" : "Mostrar subtítulos"} onClick={onSubtitulos} activo={subtitulos}>
              <Svg>{Icono.subtitulos}</Svg>
            </Boton>
            <Boton etiqueta={mudo ? "Activar la voz" : "Silenciar la voz"} onClick={onMudo} activo={!mudo}>
              <Svg>{mudo ? Icono.mudo : Icono.sonando}</Svg>
            </Boton>
            <span className="annot ml-1">
              {mudo ? "narración silenciada" : "narración activa"}
            </span>
          </div>
        </motion.div>
      )}

      {/* --- Barra principal ---
          `shadow-float` y no la sombra normal de `.surface`: la barra flota
          POR ENCIMA de una escena atenuada, y con la sombra corta se leía
          pegada al fondo, como si fuera parte de la página de debajo. */}
      <div className="surface flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-2 shadow-float sm:gap-2 sm:px-3">
        <Boton etiqueta="Anterior" onClick={onAtras} deshabilitado={primero}>
          <Svg>{Icono.atras}</Svg>
        </Boton>

        <Boton etiqueta={pausado ? "Continuar" : "Pausar"} onClick={pausado ? onReanudar : onPausar}>
          <Svg>{pausado ? Icono.play : Icono.pausa}</Svg>
        </Boton>

        <Boton etiqueta="Repetir con otras palabras" onClick={onRepetir}>
          <Svg>{Icono.repetir}</Svg>
        </Boton>

        <Boton etiqueta={ultimo ? "Terminar" : "Siguiente"} onClick={onSaltar}>
          <Svg>{Icono.saltar}</Svg>
        </Boton>

        <span className="mx-0.5 h-5 w-px bg-linen" />

        <Boton etiqueta="Ajustes de narración" onClick={onAjustes} activo={ajustes}>
          <Svg>{Icono.ajustes}</Svg>
        </Boton>

        <Boton etiqueta="Salir del recorrido" onClick={onTerminar} ancho>
          <Svg>{Icono.cerrar}</Svg>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em]">salir</span>
        </Boton>
      </div>
    </motion.div>
  );
}
