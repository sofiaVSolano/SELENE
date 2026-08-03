import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { useLight } from "../light/LightContext.jsx";
import { desbloquearAudio, sonido } from "../lib/sound.js";
import { useTeclaIgnicion } from "./piezas.jsx";
import Bombillo from "./variantes/Bombillo.jsx";
import Fosforo from "./variantes/Fosforo.jsx";
import Interruptor from "./variantes/Interruptor.jsx";
import Lampara from "./variantes/Lampara.jsx";
import Sensor from "./variantes/Sensor.jsx";

// La linterna salió de la rotación: quedó fuera de esta lista a propósito.
// El archivo (`variantes/Linterna.jsx`) sigue en el repo sin usarse por si
// se retoma, no se borró sin que lo pidan explícitamente.
const MECANISMOS = [
  { id: "bombillo", nombre: "bombillo", Componente: Bombillo },
  { id: "interruptor", nombre: "interruptor", Componente: Interruptor },
  { id: "fosforo", nombre: "fósforo", Componente: Fosforo },
  { id: "sensor", nombre: "sensor pir", Componente: Sensor },
  { id: "lampara", nombre: "lámpara", Componente: Lampara },
];

const KEY_ULTIMO = "selene_ultimo_mecanismo";

/**
 * Elige un mecanismo distinto al de la sesion anterior.
 * Detalle que importa en una sustentacion: si abres la app tres veces
 * seguidas delante del jurado, ven tres mecanismos distintos garantizados.
 */
function elegirMecanismo() {
  // ?mecanismo=interruptor fuerza uno concreto: sirve para iterar sobre
  // una variante sin depender del azar, y para fijarlo en una demo.
  const forzado = new URLSearchParams(window.location.search).get("mecanismo");
  const fijo = MECANISMOS.find((m) => m.id === forzado);
  if (fijo) return fijo;

  const ultimo = typeof localStorage !== "undefined" ? localStorage.getItem(KEY_ULTIMO) : null;
  const candidatos = MECANISMOS.filter((m) => m.id !== ultimo);
  const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
  try {
    localStorage.setItem(KEY_ULTIMO, elegido.id);
  } catch {
    /* modo privado */
  }
  return elegido;
}

/**
 * PANTALLA DE IGNICION
 * -----------------------------------------------------------------
 * No hay boton "Entrar". Hay un aparato que hay que encender.
 *
 * La idea que sostiene todo: la luz del gesto NO se descarta al pasar a
 * la landing. El punto donde encendiste se convierte en la fuente de luz
 * ambiente de la sesion completa. Si prendes el fosforo a la izquierda,
 * toda la aplicacion queda iluminada desde la izquierda.
 */
export default function IgnitionGate({ onCompleto }) {
  const { encender } = useLight();
  const [mecanismo, setMecanismo] = useState(() => elegirMecanismo());
  const [origen, setOrigen] = useState(null);

  const encendiendo = origen !== null;

  const alEncender = useCallback(
    (punto) => {
      if (encendiendo) return;
      desbloquearAudio();
      const destino = { x: punto.x ?? 0.5, y: punto.y ?? 0.45, kelvin: punto.kelvin ?? 2900 };
      setOrigen(destino);
      sonido.luz();
      encender({ ...destino, intensity: 0.9 });
      window.setTimeout(onCompleto, 1500);
    },
    [encender, encendiendo, onCompleto]
  );

  useTeclaIgnicion(alEncender, !encendiendo);

  const cambiar = () => {
    if (encendiendo) return;
    desbloquearAudio();
    sonido.roce();
    setMecanismo((prev) => {
      const otros = MECANISMOS.filter((m) => m.id !== prev.id);
      const nuevo = otros[Math.floor(Math.random() * otros.length)];
      try {
        localStorage.setItem(KEY_ULTIMO, nuevo.id);
      } catch {
        /* modo privado */
      }
      return nuevo;
    });
  };

  const { Componente, nombre, id } = mecanismo;
  const indice = useMemo(() => MECANISMOS.findIndex((m) => m.id === id) + 1, [id]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
      style={{ background: "#050403" }}
      animate={{ opacity: encendiendo ? [1, 1, 0] : 1 }}
      transition={{ duration: 1.5, times: [0, 0.42, 1], ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={desbloquearAudio}
    >
      {/* Grano: incluso el negro tiene textura, nunca es un #000 plano */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E\")",
        }}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={id}
          initial={{ opacity: 0, scale: 0.965, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 1.02, filter: "blur(6px)" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10"
        >
          <Componente onEncender={alEncender} />
        </motion.div>
      </AnimatePresence>

      {/* Firma del mecanismo. Deja claro que hay mas de uno. */}
      <div className="absolute left-4 top-4 z-20 font-mono text-[10px] uppercase tracking-[0.34em] text-white/25 sm:left-8 sm:top-8">
        selene · mecanismo {String(indice).padStart(2, "0")} / {String(MECANISMOS.length).padStart(2, "0")}
        <span className="ml-3 text-white/40">{nombre}</span>
      </div>

      {/* Cambiar mecanismo: discreto, aparece al acercarse. Util en demo. */}
      {!encendiendo && (
        <button
          onClick={cambiar}
          className="group absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/20 outline-none transition-all duration-300 hover:border-white/25 hover:text-white/60 sm:bottom-8 sm:right-8"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" className="transition-transform duration-500 group-hover:rotate-180">
            <path
              d="M10 6a4 4 0 1 1-1.2-2.85M10 1.5V4H7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          otro mecanismo
        </button>
      )}

      {/* Estallido de luz desde el punto exacto del gesto */}
      <AnimatePresence>
        {encendiendo && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.9, 0] }}
            transition={{ duration: 1.5, times: [0, 0.22, 0.5, 1], ease: [0.22, 1, 0.36, 1] }}
            style={{
              background: `radial-gradient(circle at ${origen.x * 100}% ${origen.y * 100}%, rgba(255,247,231,1) 0%, rgba(255,214,150,0.92) 18%, rgba(255,176,32,0.4) 40%, transparent 72%)`,
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
