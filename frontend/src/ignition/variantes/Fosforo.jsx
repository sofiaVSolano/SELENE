import { AnimatePresence, motion, useMotionValue } from "framer-motion";
import { useRef, useState } from "react";
import { sonido } from "../../lib/sound.js";
import { Pista, TrazoGesto, origenDesde } from "../piezas.jsx";

const FRICCION_NECESARIA = 620; // px acumulados de raspado
const INICIO = 16; // borde interior izquierdo de la caja
const RECORRIDO = 118; // hasta el extremo derecho de la lija

/**
 * VARIANTE 3 · FOSFORO
 * No basta con tocar: hay que raspar. La friccion se acumula, las chispas
 * salen proporcionales a la velocidad del arrastre y la cabeza del fosforo
 * se va calentando antes de prender. El esfuerzo fisico es el punto.
 */
export default function Fosforo({ onEncender }) {
  const x = useMotionValue(0);
  const [friccion, setFriccion] = useState(0);
  const [chispas, setChispas] = useState([]);
  const [prendido, setPrendido] = useState(false);
  const ref = useRef(null);
  const idChispa = useRef(0);
  const ultimoSonido = useRef(0);

  const cargar = (delta) => {
    if (prendido) return;
    const fuerza = Math.abs(delta);
    if (fuerza < 1.5) return;

    setFriccion((prev) => {
      const total = prev + fuerza;
      if (total >= FRICCION_NECESARIA) prender();
      return Math.min(total, FRICCION_NECESARIA);
    });

    // Sonido de raspado limitado en frecuencia (si no, es un zumbido feo)
    const ahora = performance.now();
    if (ahora - ultimoSonido.current > 90) {
      ultimoSonido.current = ahora;
      sonido.raspar();
    }

    // Chispas proporcionales a la velocidad del gesto
    const cuantas = Math.min(4, Math.round(fuerza / 4));
    if (!cuantas) return;
    // Las chispas nacen en la cabeza, alla donde este: se calcula su
    // posicion al vuelo en vez de anclarlas al centro de la caja.
    const izquierdaCabeza = INICIO + 9.5 + x.get();
    const nuevas = Array.from({ length: cuantas }, () => ({
      id: (idChispa.current += 1),
      izquierda: izquierdaCabeza,
      dx: (Math.random() - 0.5) * 130 - delta * 2.2,
      dy: -Math.random() * 110 - 18,
      escala: 0.35 + Math.random() * 0.8,
      vida: 0.5 + Math.random() * 0.55,
    }));
    setChispas((prev) => [...prev.slice(-38), ...nuevas]);
  };

  const prender = () => {
    if (prendido) return;
    setPrendido(true);
    sonido.llama();
    window.setTimeout(() => onEncender({ ...origenDesde(ref.current), kelvin: 1900 }), 900);
  };

  const calorCabeza = Math.min(1, friccion / FRICCION_NECESARIA);

  return (
    <div className="relative flex flex-col items-center">
      <div ref={ref} className="relative">
        {/* Caja de fosforos */}
        <div className="relative h-[190px] w-[300px] rounded-[14px] border border-white/12 bg-white/[0.03] p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,1)]">
          <p className="font-mono text-[9px] uppercase tracking-[0.4em] text-white/30">selene</p>

          {/* Lija */}
          <div
            className="absolute inset-x-4 bottom-4 h-[104px] rounded-[8px] border border-white/[0.08]"
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.13) 0.6px, transparent 0.7px), radial-gradient(rgba(255,255,255,0.07) 0.6px, transparent 0.7px)",
              backgroundSize: "5px 5px, 8px 8px",
              backgroundPosition: "0 0, 3px 4px",
            }}
          >
            {/* Barra de friccion: el progreso vive en la lija, no en un widget aparte */}
            <motion.span
              className="absolute bottom-0 left-0 h-[2px] rounded-full bg-gradient-to-r from-[#ff7a18] to-[#ffd98a]"
              animate={{ width: `${calorCabeza * 100}%`, opacity: prendido ? 0 : 0.75 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>

          {/* Fosforo arrastrable */}
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: RECORRIDO }}
            dragElastic={0.12}
            dragMomentum={false}
            style={{ x, left: INICIO }}
            onDrag={(_, info) => cargar(info.delta.x)}
            className="absolute bottom-[52px] z-10 flex cursor-grab items-center active:cursor-grabbing"
            whileTap={{ scale: 0.99 }}
          >
            {/* Cabeza */}
            <div className="relative">
              <motion.span
                className="block h-[19px] w-[19px] rounded-full"
                animate={{
                  backgroundColor: prendido
                    ? "#fff0cf"
                    : `rgb(${120 + calorCabeza * 135}, ${40 + calorCabeza * 90}, ${34 + calorCabeza * 30})`,
                  boxShadow: prendido
                    ? "0 0 40px 12px rgba(255,150,40,0.8)"
                    : `0 0 ${calorCabeza * 22}px ${calorCabeza * 5}px rgba(255,120,24,${calorCabeza * 0.8})`,
                }}
                transition={{ duration: 0.25 }}
              />

              {/* Llama */}
              <AnimatePresence>
                {prendido && (
                  <motion.span
                    className="pointer-events-none absolute -top-[54px] left-1/2 -translate-x-1/2"
                    initial={{ opacity: 0, scaleY: 0.2 }}
                    animate={{ opacity: 1, scaleY: [0.85, 1.1, 0.95, 1.15], scaleX: [1, 0.92, 1.05, 0.96] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <svg width="46" height="66" viewBox="0 0 46 66">
                      <defs>
                        <radialGradient id="llama" cx="50%" cy="72%" r="60%">
                          <stop offset="0%" stopColor="#fff6de" />
                          <stop offset="42%" stopColor="#ffb020" />
                          <stop offset="100%" stopColor="rgba(255,122,24,0)" />
                        </radialGradient>
                      </defs>
                      <path d="M23 4 C34 24, 40 36, 33 50 C28 60, 18 60, 13 50 C6 36, 12 24, 23 4 Z" fill="url(#llama)" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Palo */}
            <span className="ml-[-2px] block h-[7px] w-[128px] rounded-r-[3px] bg-gradient-to-r from-[#c9ae86] to-[#8d795c]" />
          </motion.div>

          {/* Chispas */}
          <div className="pointer-events-none absolute inset-0 overflow-visible">
            <AnimatePresence>
              {chispas.map((c) => (
                <motion.span
                  key={c.id}
                  className="absolute bottom-[60px] block h-[2.5px] w-[2.5px] rounded-full bg-[#ffcf80]"
                  initial={{ opacity: 1, x: 0, y: 0, scale: c.escala }}
                  animate={{ opacity: 0, x: c.dx, y: [0, c.dy, c.dy + 90], scale: 0.2 }}
                  transition={{ duration: c.vida, ease: "easeOut" }}
                  onAnimationComplete={() => setChispas((prev) => prev.filter((s) => s.id !== c.id))}
                  style={{ left: c.izquierda, boxShadow: "0 0 6px 1px rgba(255,180,80,0.9)" }}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {!prendido && (
          <svg className="pointer-events-none absolute -bottom-8 left-1/2 h-10 w-40 -translate-x-1/2" viewBox="0 0 160 40">
            <TrazoGesto d="M20 20 L140 20" />
            <TrazoGesto d="M128 10 L142 20 L128 30" retraso={2.6} />
          </svg>
        )}
      </div>

      <Pista>raspa el fósforo</Pista>
    </div>
  );
}
