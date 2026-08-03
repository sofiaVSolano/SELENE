import { motion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useLight } from "../light/LightContext.jsx";
import { sonido } from "../lib/sound.js";

/**
 * PUNTO DE MONITOREO · la cámara
 * -----------------------------------------------------------------
 * La entrada a la herramienta no es un botón: es una cámara de video. En
 * reposo su piloto late en ámbar (standby, como una cámara apagada pero
 * lista). Al acercarte, el lente se enciende y un halo cálido la rodea.
 * Al entrar, el lente destella y ese estallido de luz es la propia
 * transición de página.
 *
 * Es la metáfora correcta: lo que hay del otro lado es literalmente una
 * cámara mirando una sala.
 */

export default function PuntoMonitoreo({ tamano = 44, etiqueta = "iniciar monitoreo", grande = false }) {
  const [hover, setHover] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const navegar = useNavigate();
  const { usuario } = useAuth();
  const { destello } = useLight();

  const abierto = hover || entrando;

  const entrar = () => {
    if (entrando) return;
    setEntrando(true);
    sonido.click(true);
    destello(0.5, 700);
    // Sin sesion, el destino natural es el acceso: se entra igual, solo
    // que pasando por la puerta. El gesto nunca falla.
    window.setTimeout(() => navegar(usuario ? "/panel" : "/acceso", { state: { intencion: "monitoreo" } }), 480);
  };

  /* En `grande`, la camara y su rotulo en una sola fila miden mas que un
     telefono (368 px contra 360) y le sacaban barra horizontal a la landing
     entera. Por debajo de `sm` se apilan; desde ahi, la fila de siempre. */
  const disposicion = grande
    ? "flex-col gap-5 text-center sm:flex-row sm:gap-9 sm:text-left"
    : "gap-3";

  return (
    <motion.button
      onClick={entrar}
      onHoverStart={() => {
        setHover(true);
        sonido.roce();
      }}
      onHoverEnd={() => setHover(false)}
      aria-label={etiqueta}
      className={`group relative flex items-center outline-none ${disposicion}`}
    >
      <motion.span
        className="relative block shrink-0"
        style={{ width: tamano, height: tamano }}
        animate={{ scale: entrando ? 1.35 : abierto ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 20 }}
      >
        <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id={`luzLente-${tamano}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff6e2" />
              <stop offset="45%" stopColor="#ffb020" />
              <stop offset="100%" stopColor="#ff7a18" stopOpacity="0.15" />
            </radialGradient>
          </defs>

          {/* Cuerpo de la cámara */}
          <rect
            x="18"
            y="38"
            width="58"
            height="44"
            rx="11"
            fill="var(--paper)"
            stroke="var(--ink-4)"
            strokeWidth="2.2"
          />

          {/* Visor lateral: el detalle que la hace reconocible como cámara de video */}
          <motion.path
            d="M76 51 L102 38 L102 82 L76 69 Z"
            fill="var(--paper)"
            stroke="var(--ink-4)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            animate={{ x: abierto ? 2 : 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* El lente: la luz que hay detrás, igual que antes tenía el obturador */}
          <motion.circle
            cx="44"
            cy="60"
            r="17"
            fill={`url(#luzLente-${tamano})`}
            animate={{ opacity: entrando ? 1 : abierto ? 0.95 : 0.5, scale: abierto ? 1.08 : 1 }}
            style={{ transformOrigin: "44px 60px" }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
          <circle cx="44" cy="60" r="17" fill="none" stroke="var(--ink-4)" strokeWidth="2" />

          {/* Aro que se enciende al acercarse */}
          <motion.circle
            cx="44"
            cy="60"
            r="21.5"
            fill="none"
            stroke="#ffb020"
            strokeWidth="1.5"
            animate={{ opacity: abierto ? 0.9 : 0, scale: abierto ? 1 : 0.9 }}
            style={{ transformOrigin: "44px 60px" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Piloto de grabación: late en standby, queda fijo al activarse */}
          <motion.circle
            cx="30"
            cy="47"
            r="3"
            fill="var(--amber)"
            animate={
              abierto
                ? { opacity: 1, scale: 1.25 }
                : { opacity: [0.35, 1, 0.35], scale: [0.9, 1.15, 0.9] }
            }
            style={{ transformOrigin: "30px 47px" }}
            transition={
              abierto
                ? { duration: 0.3 }
                : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }
            }
          />
        </svg>

        {/* Halo: solo existe cuando la cámara está activa */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          animate={{
            boxShadow: abierto
              ? "0 0 30px 6px rgba(255,176,32,0.5), 0 0 80px 22px rgba(255,176,32,0.18)"
              : "0 0 0 0 rgba(255,176,32,0)",
          }}
          transition={{ duration: 0.5 }}
        />
      </motion.span>

      <span
        className={`overflow-hidden ${
          grande ? "text-center sm:text-left" : "hidden text-left md:block"
        }`}
      >
        <motion.span
          className={`block whitespace-nowrap font-mono uppercase tracking-[0.32em] text-ink-2 ${
            grande ? "text-[13px]" : "text-[10px]"
          }`}
          // En `grande` el texto siempre está a opacidad plena (es el CTA
          // principal, no algo que se revela al pasar el cursor), así que
          // no debe desplazarse: con `overflow-hidden` en el contenedor,
          // ese corrimiento de 3px le recortaba la primera letra en reposo.
          animate={{ opacity: abierto || grande ? 1 : 0.42, x: grande || abierto ? 0 : -3 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          {etiqueta}
        </motion.span>
        {grande && (
          <motion.span
            className="mt-2 block font-mono text-[11px] tracking-[0.14em] text-ink-3"
            animate={{ opacity: abierto ? 1 : 0.55 }}
          >
            {usuario ? "cámara y análisis en vivo" : "necesitas una cuenta · toma 20 segundos"}
          </motion.span>
        )}
      </span>
    </motion.button>
  );
}
