import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista, origenDesde, respira } from "../piezas.jsx";

/**
 * VARIANTE 1 · BOMBILLO
 * El filamento se calienta por etapas: primero rojo sordo, luego naranja,
 * luego blanco. Es el orden real de la incandescencia y por eso se siente
 * fisico. El vidrio recoge el calor con un halo que crece por detras.
 */
export default function Bombillo({ onEncender }) {
  const calor = useMotionValue(0);
  const [encendiendo, setEncendiendo] = useState(false);
  const ref = useRef(null);

  const colorFilamento = useTransform(
    calor,
    [0, 0.18, 0.42, 0.72, 1],
    ["#2a2018", "#7e2d0c", "#ff7a18", "#ffc46b", "#fff6e2"]
  );
  const brilloFilamento = useTransform(calor, [0, 0.3, 1], [0, 6, 30]);
  const filtro = useTransform(brilloFilamento, (v) => `drop-shadow(0 0 ${v}px rgba(255,176,32,0.95))`);
  const opacidadHalo = useTransform(calor, [0, 0.35, 1], [0, 0.12, 0.9]);
  const escalaHalo = useTransform(calor, [0, 1], [0.55, 1.9]);
  const grosor = useTransform(calor, [0, 1], [1.6, 2.6]);
  const vidrio = useTransform(calor, [0, 1], ["rgba(255,255,255,0.16)", "rgba(255,224,178,0.55)"]);
  const opacidadSoportes = useTransform(calor, [0, 1], [0.35, 1]);

  const encender = () => {
    if (encendiendo) return;
    setEncendiendo(true);
    sonido.filamento(2.1);
    animate(calor, 1, { duration: 2.1, ease: [0.42, 0, 0.35, 1] });
    // La luz de la app arranca antes de que el filamento termine: el
    // encendido y la transicion se solapan, no se encadenan.
    window.setTimeout(() => onEncender({ ...origenDesde(ref.current), kelvin: 2700 }), 1450);
  };

  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        ref={ref}
        onClick={encender}
        onMouseEnter={() => !encendiendo && sonido.roce()}
        aria-label="Encender el bombillo"
        className="relative cursor-pointer rounded-full bg-transparent p-6 outline-none"
        whileHover={encendiendo ? {} : { scale: 1.03 }}
        whileTap={encendiendo ? {} : { scale: 0.97 }}
        transition={{ type: "spring", stiffness: 320, damping: 22 }}
      >
        {/* Halo: vive detras del vidrio, no encima */}
        <motion.span
          aria-hidden
          style={{ opacity: opacidadHalo, scale: escalaHalo }}
          className="pointer-events-none absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full"
        >
          <span className="block h-full w-full rounded-full bg-[radial-gradient(circle,rgba(255,196,107,0.85)_0%,rgba(255,150,40,0.28)_38%,transparent_70%)] blur-xl" />
        </motion.span>

        <motion.svg
          width="200"
          height="320"
          viewBox="0 0 200 320"
          className="relative"
          {...(encendiendo ? {} : respira)}
        >
          {/* Vidrio */}
          <motion.circle cx="100" cy="118" r="62" fill="none" stroke={vidrio} strokeWidth="1.4" />
          <motion.path
            d="M70 168 Q100 186 130 168"
            fill="none"
            stroke={vidrio}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path d="M78 172 L78 190 M122 172 L122 190" stroke="rgba(255,255,255,0.16)" strokeWidth="1.4" />

          {/* Rosca */}
          <rect x="78" y="190" width="44" height="52" rx="6" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.4" />
          {[202, 214, 226].map((y) => (
            <path key={y} d={`M78 ${y} Q100 ${y + 6} 122 ${y}`} stroke="rgba(255,255,255,0.14)" strokeWidth="1.2" fill="none" />
          ))}
          <path d="M88 242 L112 242 L106 254 L94 254 Z" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.3" />

          {/* Soportes del filamento */}
          <motion.path
            d="M89 190 L89 134 M111 190 L111 134"
            stroke={colorFilamento}
            style={{ strokeWidth: grosor, opacity: opacidadSoportes }}
            strokeLinecap="round"
            fill="none"
          />

          {/* Filamento: la pieza que se calienta */}
          <motion.path
            d="M89 134 L94 112 L100 134 L106 112 L111 134"
            fill="none"
            stroke={colorFilamento}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ strokeWidth: grosor, filter: filtro }}
          />
        </motion.svg>
      </motion.button>

      <Pista>toca el bombillo</Pista>
    </div>
  );
}
