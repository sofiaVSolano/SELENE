import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista, TrazoGesto, origenDesde } from "../piezas.jsx";

const RECORRIDO = 58; // px que sube la palanca
const UMBRAL = 34; // a partir de aqui el mecanismo "cae" solo

/**
 * VARIANTE 2 · INTERRUPTOR
 * El detalle que lo hace creible: el interruptor tiene punto de no retorno.
 * Antes del umbral vuelve solo con un golpe seco; pasado el umbral, el
 * resorte lo termina de subir aunque sueltes. Como uno real.
 */
export default function Interruptor({ onEncender }) {
  const y = useMotionValue(0);
  const [listo, setListo] = useState(false);
  const ref = useRef(null);

  const progreso = useTransform(y, [-RECORRIDO, 0], [1, 0]);
  const luzPlaca = useTransform(progreso, [0, 1], ["rgba(255,255,255,0.08)", "rgba(255,176,32,0.5)"]);
  const halo = useTransform(progreso, [0.2, 1], [0, 0.85]);
  const escalaHalo = useTransform(progreso, [0, 1], [0.6, 1.5]);

  const soltar = () => {
    if (listo) return;
    if (y.get() <= -UMBRAL) {
      setListo(true);
      animate(y, -RECORRIDO, { type: "spring", stiffness: 700, damping: 24 });
      sonido.click(true);
      window.setTimeout(() => onEncender({ ...origenDesde(ref.current), kelvin: 3000 }), 260);
    } else {
      animate(y, 0, { type: "spring", stiffness: 900, damping: 30 });
      sonido.click(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center">
      <motion.span
        aria-hidden
        style={{ opacity: halo, scale: escalaHalo }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,196,107,0.7)_0%,transparent_68%)] blur-2xl"
      />

      <div ref={ref} className="relative">
        {/* Placa de pared */}
        <motion.div
          style={{ borderColor: luzPlaca }}
          className="relative h-[280px] w-[188px] rounded-[26px] border bg-white/[0.025] backdrop-blur-[1px]"
        >
          {/* Tornillos */}
          {[
            [16, 16],
            [16, 248],
            [156, 16],
            [156, 248],
          ].map(([l, t]) => (
            <span
              key={`${l}-${t}`}
              style={{ left: l, top: t }}
              className="absolute h-3 w-3 rounded-full border border-white/12"
            />
          ))}

          {/* Ranura */}
          <div className="absolute left-1/2 top-1/2 h-[168px] w-[104px] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-white/[0.07] bg-black/40 shadow-[inset_0_2px_14px_rgba(0,0,0,0.9)]">
            {/* Palanca */}
            <motion.button
              drag="y"
              dragConstraints={{ top: -RECORRIDO, bottom: 0 }}
              dragElastic={0.06}
              dragMomentum={false}
              style={{ y }}
              onDragEnd={soltar}
              aria-label="Deslizar el interruptor hacia arriba"
              className="absolute bottom-3 left-1/2 h-[92px] w-[80px] -translate-x-1/2 cursor-grab rounded-[14px] border border-white/15 bg-gradient-to-b from-white/[0.14] to-white/[0.04] shadow-[0_6px_18px_rgba(0,0,0,0.6)] outline-none active:cursor-grabbing"
              whileTap={{ scaleX: 0.97 }}
            >
              <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-[5px]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="block h-[1.5px] w-7 rounded-full bg-white/25" />
                ))}
              </span>
            </motion.button>
          </div>

          {/* Marcas I / O */}
          <span className="absolute left-1/2 top-[38px] -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] text-white/25">
            I
          </span>
          <span className="absolute bottom-[34px] left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.3em] text-white/25">
            O
          </span>
        </motion.div>

        {/* Gesto: flecha hacia arriba dibujandose en bucle */}
        {!listo && (
          <svg className="pointer-events-none absolute -right-14 top-1/2 h-32 w-16 -translate-y-1/2" viewBox="0 0 60 120">
            <TrazoGesto d="M30 96 L30 30" />
            <TrazoGesto d="M18 44 L30 28 L42 44" retraso={2.6} />
          </svg>
        )}
      </div>

      <Pista>desliza hacia arriba</Pista>
    </div>
  );
}
