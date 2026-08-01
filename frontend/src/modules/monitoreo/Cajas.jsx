import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import Contador from "../../components/ui/Contador.jsx";
import { CURVA, DUR, trans } from "../../lib/movimiento.js";

/**
 * LAS DETECCIONES
 * -----------------------------------------------------------------
 * Nada aparece de golpe. Cada detección se construye en tres tiempos, y
 * ese orden es el que hace que la escena se lea:
 *
 *   1. Se DIBUJAN las cuatro esquinas (pathLength 0 -> 1, 380 ms).
 *   2. Entra la etiqueta con un fade corto.
 *   3. La confianza cuenta desde 0 hasta su valor real.
 *
 * Y cada clase tiene su propia física:
 *   persona   -> un pulso al aparecer (la sala está ocupada AHORA).
 *   ventana   -> un resplandor frío y muy tenue: entra luz por ahí.
 *   luminaria -> un resplandor cálido con rayos: eso está encendido.
 *
 * Se usan esquinas y no rectángulos completos por una razón práctica:
 * cuatro escuadras dejan ver la escena, un marco cerrado la tapa. Es el
 * lenguaje de un visor de cámara, que es exactamente lo que esto es.
 */

/* Tres clases, tres tintas de la misma paleta. La ventana NO se pinta de
   azul aunque sea luz de día: el sistema entero no tiene un solo azul, y
   una excepción aquí rompería la unidad de toda la aplicación. Se
   distingue por temperatura (madera fría vs. ámbar) y por comportamiento
   (la ventana no late, la luminaria sí).                                */
const ESTILO = {
  persona: { color: "#191512", etiqueta: "persona", grosor: 2 },
  Window: { color: "#c2a883", etiqueta: "ventana", grosor: 1.8 },
  Luminaire: { color: "#ffb020", etiqueta: "luminaria", grosor: 1.8 },
};

function estiloDe(clase) {
  if (ESTILO[clase]) return ESTILO[clase];
  const min = String(clase).toLowerCase();
  if (min.includes("person")) return ESTILO.persona;
  if (min.includes("window") || min.includes("ventana")) return ESTILO.Window;
  return ESTILO.Luminaire;
}

/**
 * Dónde queda de verdad la imagen dentro del contenedor.
 *
 * El vídeo/imagen usa `object-contain` (para aprovechar toda la altura
 * disponible del visor, no sólo la que sale de forzar el ancho al 100 %).
 * Eso significa que, salvo que el contenedor tenga EXACTAMENTE la
 * proporción de la cámara, quedan franjas de aire arriba/abajo o a los
 * lados. Las escuadras SVG ya se corrigen solas con
 * `preserveAspectRatio="meet"` (el mismo encaje que hace `object-contain`,
 * nativo del navegador). Las etiquetas HTML no: viven fuera del SVG para
 * poder usar tipografía real y el contador en vivo, así que hay que
 * calcularles a mano el mismo rectángulo, o quedarían corridas hacia la
 * franja de aire en vez de sobre la detección.
 */
function useEncaje(ancho, alto) {
  const ref = useRef(null);
  const [rect, setRect] = useState({ x: 0, y: 0, w: 100, h: 100 });

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo || !ancho || !alto) return undefined;

    const calcular = () => {
      const cw = nodo.clientWidth;
      const ch = nodo.clientHeight;
      if (!cw || !ch) return;

      const escalaContenedor = cw / ch;
      const escalaImagen = ancho / alto;

      if (escalaImagen > escalaContenedor) {
        // La imagen es proporcionalmente más ancha: llena el ancho entero,
        // sobra aire arriba y abajo.
        const altoVisible = cw / escalaImagen;
        setRect({ x: 0, y: ((ch - altoVisible) / 2 / ch) * 100, w: 100, h: (altoVisible / ch) * 100 });
      } else {
        // Más alta: llena el alto entero, sobra aire a los lados.
        const anchoVisible = ch * escalaImagen;
        setRect({ x: ((cw - anchoVisible) / 2 / cw) * 100, y: 0, w: (anchoVisible / cw) * 100, h: 100 });
      }
    };

    calcular();
    const ro = new ResizeObserver(calcular);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [ancho, alto]);

  return [ref, rect];
}

/** Las cuatro escuadras de una caja, como cuatro trazos independientes. */
function Esquinas({ x, y, w, h, color, grosor, retraso }) {
  const l = Math.max(9, Math.min(w, h) * 0.22); // largo de la escuadra
  const trazos = [
    `M${x} ${y + l} L${x} ${y} L${x + l} ${y}`,
    `M${x + w - l} ${y} L${x + w} ${y} L${x + w} ${y + l}`,
    `M${x + w} ${y + h - l} L${x + w} ${y + h} L${x + w - l} ${y + h}`,
    `M${x + l} ${y + h} L${x} ${y + h} L${x} ${y + h - l}`,
  ];

  return (
    <>
      {trazos.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: 0.38,
            delay: retraso + i * 0.035,
            ease: CURVA.luz,
          }}
        />
      ))}
    </>
  );
}

export default function Cajas({ ancho, alto, personas = [], elementos = [], claveCaptura = "" }) {
  const [refEncaje, encaje] = useEncaje(ancho, alto);

  if (!ancho || !alto) return null;

  const items = [
    ...personas.map((d, i) => ({ ...d, clase: "persona", orden: i })),
    ...elementos.map((d, i) => ({ ...d, orden: personas.length + i })),
  ];

  return (
    <div ref={refEncaje} className="pointer-events-none absolute inset-0">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <radialGradient id="resplandorVentana">
            <stop offset="0%" stopColor="#fffaf0" stopOpacity="0.62" />
            <stop offset="55%" stopColor="#ffd98a" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="resplandorLuminaria">
            <stop offset="0%" stopColor="#ffd98a" stopOpacity="0.75" />
            <stop offset="60%" stopColor="#ffb020" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ffb020" stopOpacity="0" />
          </radialGradient>
        </defs>

        <AnimatePresence mode="popLayout">
          {items.map((d) => {
            const { color, grosor } = estiloDe(d.clase);
            const x = d.bbox.x1;
            const y = d.bbox.y1;
            const w = d.bbox.x2 - d.bbox.x1;
            const h = d.bbox.y2 - d.bbox.y1;
            const cx = x + w / 2;
            const cy = y + h / 2;
            const retraso = 0.06 + d.orden * 0.075;
            const esPersona = d.clase === "persona";
            const esVentana = estiloDe(d.clase) === ESTILO.Window;

            return (
              <motion.g
                key={`${claveCaptura}-${d.orden}`}
                exit={{ opacity: 0 }}
                transition={trans(DUR.ui)}
              >
                {/* Resplandor propio de ventanas y luminarias */}
                {!esPersona && (
                  <motion.ellipse
                    cx={cx}
                    cy={cy}
                    rx={w * 0.85}
                    ry={h * 0.85}
                    fill={`url(#${esVentana ? "resplandorVentana" : "resplandorLuminaria"})`}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={
                      esVentana
                        ? { opacity: 1, scale: 1 }
                        : { opacity: [0.75, 1, 0.75], scale: 1 } // la luminaria late
                    }
                    transition={
                      esVentana
                        ? { duration: 0.7, delay: retraso, ease: CURVA.luz }
                        : { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: retraso }
                    }
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                  />
                )}

                {/* Pulso de aparición de una persona */}
                {esPersona && (
                  <motion.ellipse
                    cx={cx}
                    cy={cy}
                    rx={w * 0.6}
                    ry={h * 0.6}
                    fill="none"
                    stroke="#191512"
                    strokeWidth="1.4"
                    initial={{ opacity: 0.5, scale: 0.45 }}
                    animate={{ opacity: 0, scale: 1.25 }}
                    transition={{ duration: 0.85, delay: retraso, ease: CURVA.luz }}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                  />
                )}

                {/* Velo interior: apenas separa la detección del fondo */}
                <motion.rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={Math.min(6, w * 0.06)}
                  fill={color}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.06 }}
                  transition={{ duration: 0.5, delay: retraso, ease: CURVA.luz }}
                />

                <Esquinas x={x} y={y} w={w} h={h} color={color} grosor={grosor} retraso={retraso} />
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>

      {/* Etiquetas en HTML: tipografía y contadores reales, no <text> de SVG.
          Se posicionan dentro del rectángulo que calculó `useEncaje`, no
          del contenedor completo, para no correrse hacia el aire que deja
          el letterboxing de `object-contain`. */}
      <AnimatePresence>
        {items.map((d) => {
          const { color, etiqueta } = estiloDe(d.clase);
          const izq = encaje.x + (d.bbox.x1 / ancho) * encaje.w;
          const arriba = encaje.y + (d.bbox.y1 / alto) * encaje.h;
          const anclaAbajo = arriba < encaje.y + 7; // si la caja toca el borde, la etiqueta baja
          const retraso = 0.06 + d.orden * 0.075 + 0.3;

          return (
            <motion.span
              key={`et-${claveCaptura}-${d.orden}`}
              initial={{ opacity: 0, y: anclaAbajo ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, delay: retraso, ease: CURVA.luz }}
              style={{
                left: `${Math.min(88, izq)}%`,
                top: `${arriba}%`,
                transform: anclaAbajo ? "translateY(2px)" : "translateY(-118%)",
                borderColor: color,
              }}
              className="absolute flex items-center gap-1.5 whitespace-nowrap rounded-md border-l-2 bg-paper/92 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink shadow-raise backdrop-blur-sm"
            >
              {etiqueta}
              <Contador
                valor={d.confianza * 100}
                duracion={0.55}
                sufijo="%"
                className="text-[9.5px] text-ink-2"
              />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
