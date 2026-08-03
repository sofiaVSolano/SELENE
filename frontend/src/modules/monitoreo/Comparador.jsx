import { motion } from "framer-motion";
import { useMemo } from "react";
import Contador from "../../components/ui/Contador.jsx";
import { CURVA, DUR, trans } from "../../lib/movimiento.js";

/**
 * COMPARADOR
 * -----------------------------------------------------------------
 * Dos capturas lado a lado. Lo importante no son las dos imágenes: es lo
 * que cambió entre ellas, y eso lo calcula el propio comparador.
 *
 * Cómo se emparejan las detecciones: por clase y por solapamiento de
 * cajas (IoU > 0.35). Lo que queda sin pareja en la captura B *apareció*;
 * lo que queda sin pareja en la A *desapareció*. Es el mismo criterio que
 * usa un tracker sencillo, y basta porque las dos capturas son del mismo
 * encuadre.
 *
 * Las diferencias no se listan: se dibujan encima de la imagen donde
 * ocurrieron, y sólo después se resumen en cifras.
 */

const clases = (analisis) => [
  ...(analisis.personas || []).map((d) => ({ ...d, clase: "persona" })),
  ...(analisis.elementos_iluminacion || []),
];

function iou(a, b) {
  const x1 = Math.max(a.bbox.x1, b.bbox.x1);
  const y1 = Math.max(a.bbox.y1, b.bbox.y1);
  const x2 = Math.min(a.bbox.x2, b.bbox.x2);
  const y2 = Math.min(a.bbox.y2, b.bbox.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (!inter) return 0;
  const areaA = (a.bbox.x2 - a.bbox.x1) * (a.bbox.y2 - a.bbox.y1);
  const areaB = (b.bbox.x2 - b.bbox.x1) * (b.bbox.y2 - b.bbox.y1);
  return inter / (areaA + areaB - inter);
}

function emparejar(desde, hasta) {
  const usados = new Set();
  const nuevos = [];

  hasta.forEach((d) => {
    let mejor = -1;
    let mejorIou = 0.35;
    desde.forEach((o, i) => {
      if (usados.has(i) || o.clase !== d.clase) return;
      const v = iou(o, d);
      if (v > mejorIou) {
        mejorIou = v;
        mejor = i;
      }
    });
    if (mejor >= 0) usados.add(mejor);
    else nuevos.push(d);
  });

  const perdidos = desde.filter((_, i) => !usados.has(i));
  return { nuevos, perdidos };
}

/** Una captura con las diferencias marcadas encima. */
function Lado({ captura, marcas, color, titulo, etiquetaMarca, indice }) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={trans(0.5, indice * 0.09)}
      className="flex flex-col lg:min-h-0 lg:flex-1"
    >
      <figcaption className="mb-2 flex items-baseline justify-between">
        <span className="annot">{titulo}</span>
        <span className="mono text-[10px] tabular-nums text-ink-3">
          {new Date(captura.ts).toLocaleTimeString("es", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </figcaption>

      <div className="surface relative aspect-video overflow-hidden rounded-[var(--r-lg)] bg-paper-3 lg:aspect-auto lg:min-h-0 lg:flex-1">
        <div className="flex h-full w-full items-center justify-center">
          <div
            className="relative"
            style={{
              aspectRatio: `${captura.ancho} / ${captura.alto}`,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
          >
            <img src={captura.imagen} alt="" className="h-full w-full object-contain" />

            <svg
              viewBox={`0 0 ${captura.ancho} ${captura.alto}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {marcas.map((d, i) => {
                const w = d.bbox.x2 - d.bbox.x1;
                const h = d.bbox.y2 - d.bbox.y1;
                return (
                  <g key={`${d.clase}-${i}`}>
                    <motion.rect
                      x={d.bbox.x1}
                      y={d.bbox.y1}
                      width={w}
                      height={h}
                      rx={5}
                      fill={color}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.22, 0.1] }}
                      transition={{
                        duration: 1.6,
                        delay: 0.35 + i * 0.1,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                      }}
                    />
                    <motion.rect
                      x={d.bbox.x1}
                      y={d.bbox.y1}
                      width={w}
                      height={h}
                      rx={5}
                      fill="none"
                      stroke={color}
                      strokeWidth="2.4"
                      strokeDasharray="7 5"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.35 + i * 0.1, ease: CURVA.luz }}
                    />
                  </g>
                );
              })}
            </svg>

            {marcas.length > 0 && (
              <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={trans(DUR.ui, 0.5)}
                className="absolute left-2 top-2 rounded-md px-2 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-paper"
                style={{ background: color }}
              >
                {marcas.length} {etiquetaMarca}
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </motion.figure>
  );
}

/** Una diferencia numérica. Sube desde el valor A hasta el valor B. */
function Diferencia({ etiqueta, a, b, decimales = 0, sufijo = "", invertido = false, indice }) {
  const delta = (b ?? 0) - (a ?? 0);
  const nulo = Math.abs(delta) < 0.005;
  const bueno = invertido ? delta < 0 : delta > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={trans(0.4, 0.25 + indice * 0.05)}
      className="modulo px-3 py-2.5"
    >
      <p className="annot mb-1 text-[9px]">{etiqueta}</p>
      <p className="flex items-baseline gap-1.5">
        <Contador
          valor={b ?? 0}
          desde={a ?? 0}
          decimales={decimales}
          duracion={0.9}
          sufijo={sufijo}
          className="text-[17px]"
        />
      </p>
      <p
        className="mono mt-0.5 text-[10px] tabular-nums"
        style={{ color: nulo ? "var(--ink-4)" : bueno ? "var(--leaf)" : "var(--clay)" }}
      >
        {nulo ? "igual" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(decimales)}${sufijo}`}
      </p>
    </motion.div>
  );
}

export default function Comparador({ a, b }) {
  const { nuevos, perdidos } = useMemo(
    () => emparejar(clases(a.analisis), clases(b.analisis)),
    [a, b]
  );

  const A = a.analisis;
  const B = b.analisis;
  const segundos = Math.round((new Date(b.ts) - new Date(a.ts)) / 1000);

  return (
    <section className="flex flex-col lg:min-h-0 lg:flex-1">
      <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row">
        <Lado
          captura={a}
          marcas={perdidos}
          color="var(--clay)"
          titulo="antes"
          etiquetaMarca={perdidos.length === 1 ? "ya no está" : "ya no están"}
          indice={0}
        />
        <Lado
          captura={b}
          marcas={nuevos}
          color="var(--leaf)"
          titulo="después"
          etiquetaMarca={nuevos.length === 1 ? "apareció" : "aparecieron"}
          indice={1}
        />
      </div>

      <div className="mt-4">
        <p className="annot mb-2">
          diferencias · {segundos >= 60 ? `${Math.round(segundos / 60)} min` : `${segundos} s`} entre
          capturas
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Diferencia etiqueta="personas" a={A.personas_detectadas} b={B.personas_detectadas} indice={0} />
          <Diferencia etiqueta="ventanas" a={A.num_ventanas} b={B.num_ventanas} indice={1} />
          <Diferencia
            etiqueta="luminarias"
            a={A.num_luminarias}
            b={B.num_luminarias}
            invertido
            indice={2}
          />
          <Diferencia
            etiqueta="natural"
            a={A.porcentaje_natural}
            b={B.porcentaje_natural}
            decimales={1}
            sufijo=" %"
            indice={3}
          />
          <Diferencia
            etiqueta="artificial"
            a={A.porcentaje_artificial}
            b={B.porcentaje_artificial}
            decimales={1}
            sufijo=" %"
            invertido
            indice={4}
          />
          <Diferencia
            etiqueta="consumo"
            a={(A.consumo_estimado_kwh ?? 0) * 1000}
            b={(B.consumo_estimado_kwh ?? 0) * 1000}
            decimales={1}
            sufijo=" Wh"
            invertido
            indice={5}
          />
        </div>
      </div>
    </section>
  );
}
