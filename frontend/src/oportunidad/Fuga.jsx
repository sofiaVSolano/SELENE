import { motion } from "framer-motion";
import { useMemo } from "react";
import { CURVA, menosMovimiento } from "../lib/movimiento.js";

/**
 * LA FUGA DE LUZ
 * -----------------------------------------------------------------
 * Las partículas que suben desde cada bombillo de la pantalla mientras la
 * sala está vacía con la luz encendida. No son decoración: son la única
 * parte de la interfaz que dice "esto se está yendo" sin una sola palabra.
 *
 * Los orígenes NO están escritos aquí. Se leen del DOM real —los elementos
 * marcados con `data-luz`— igual que el recorrido busca sus `data-tour`.
 * Consecuencia práctica: la fuga sale del bombillo del riel, de la marca y
 * de CADA luminaria que el modelo acaba de detectar en el vídeo, porque
 * esas cajas también llevan la marca. Si mañana hay más bombillos en
 * pantalla, habrá más fugas sin tocar este archivo.
 */

const POR_FOCO = 4;

/**
 * Dónde hay luz encendida ahora mismo, en píxeles de viewport.
 *
 * Si no hay ningún `data-luz` a la vista (el usuario está en una pantalla
 * sin bombillos), se cae a la fuente de luz global: es la luz de la que
 * cuelga todo el sistema, así que la fuga sigue naciendo de algo real.
 */
export function focosDeLuz() {
  if (typeof document === "undefined") return [];

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const encontrados = Array.from(document.querySelectorAll("[data-luz]"))
    .map((nodo) => {
      const r = nodo.getBoundingClientRect();
      if (!r.width && !r.height) return null;
      return {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        tamano: Math.min(88, Math.max(22, Math.max(r.width, r.height))),
      };
    })
    // Fuera de pantalla no se ve, y una partícula invisible sigue costando.
    .filter((f) => f && f.x > -20 && f.x < vw + 20 && f.y > -20 && f.y < vh + 20);

  if (encontrados.length) return encontrados;

  const raiz = getComputedStyle(document.documentElement);
  const lx = parseFloat(raiz.getPropertyValue("--light-x")) || 0.5;
  const ly = parseFloat(raiz.getPropertyValue("--light-y")) || 0.15;
  return [{ x: lx * vw, y: ly * vh, tamano: 64 }];
}

export default function Fuga() {
  const reducido = menosMovimiento();

  /* Los focos se leen UNA vez, al montar: la escena dura cuatro segundos y
     remedirlos en cada fotograma provocaría un reflow por partícula. */
  const focos = useMemo(() => focosDeLuz(), []);
  const semillas = useMemo(
    () =>
      focos.flatMap((foco, i) =>
        Array.from({ length: POR_FOCO }, (_, j) => ({
          id: `${i}-${j}`,
          foco,
          // Cada partícula sale de un punto distinto del bombillo, sube una
          // altura distinta y se demora distinto: un chorro simétrico se lee
          // como un efecto, uno irregular como una fuga.
          desvio: (Math.random() - 0.5) * foco.tamano * 0.7,
          alto: 54 + Math.random() * 62,
          deriva: (Math.random() - 0.5) * 26,
          duracion: 1.9 + Math.random() * 1.1,
          retraso: (j / POR_FOCO) * 1.4 + Math.random() * 0.5,
        }))
      ),
    [focos]
  );

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[64] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: CURVA.luz }}
      aria-hidden
    >
      {/* Cada bombillo se pone un poco más intenso: la fuga nace de algo que
          de verdad está brillando más de lo normal. */}
      {focos.map((foco, i) => (
        <motion.span
          key={`halo-${i}`}
          className="absolute block rounded-full"
          style={{
            left: foco.x,
            top: foco.y,
            width: foco.tamano * 2.4,
            height: foco.tamano * 2.4,
            x: "-50%",
            y: "-50%",
            background:
              "radial-gradient(circle, rgb(255 176 32 / 0.42) 0%, rgb(255 176 32 / 0.14) 40%, transparent 70%)",
            mixBlendMode: "plus-lighter",
          }}
          animate={reducido ? { opacity: 0.8 } : { opacity: [0.55, 1, 0.55] }}
          transition={reducido ? { duration: 0.4 } : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}

      {/* Con movimiento reducido queda el resplandor y se va el chorro: la
          información (esto está encendido) se conserva, el movimiento no. */}
      {!reducido &&
        semillas.map((s) => (
          <motion.span
            key={s.id}
            className="absolute block h-[3px] w-[3px] rounded-full"
            style={{
              left: s.foco.x + s.desvio,
              top: s.foco.y,
              background: "rgb(255 217 138)",
              boxShadow: "0 0 7px 2px rgb(255 176 32 / 0.85)",
            }}
            initial={{ opacity: 0, y: 0, scale: 0.3 }}
            animate={{
              opacity: [0, 0.95, 0],
              y: [0, -s.alto],
              x: [0, s.deriva],
              scale: [0.35, 1, 0.2],
            }}
            transition={{
              duration: s.duracion,
              delay: s.retraso,
              repeat: Infinity,
              ease: CURVA.luz,
            }}
          />
        ))}
    </motion.div>
  );
}
