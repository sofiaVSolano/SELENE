import { motion } from "framer-motion";
import { CURVA } from "../../lib/movimiento.js";

/**
 * ESTADOS DE CARGA
 * -----------------------------------------------------------------
 * En SELENE no hay ni un spinner. Un spinner dice "espera"; estos dicen
 * QUÉ está pasando, y por eso la espera se siente más corta:
 *
 *   barrido            -> la cámara está mirando la escena.
 *   filamento          -> los modelos se están calentando.
 *   impresora          -> el reporte se está componiendo.
 *   particulas         -> la IA está formando la respuesta.
 *   bombilloComputador -> se abre el historial de capturas.
 *   bombilloPapeles    -> se abre el historial de reportes.
 *
 * Todos comparten el mismo ámbar y las mismas curvas, así que a pesar de
 * ser varios dibujos distintos se leen como un solo sistema.
 */

/** El bombillo mínimo: vidrio + filamento + casquillo. Lo reutilizan los dos
    logos de carga de abajo, cada uno posándolo sobre un objeto distinto. */
function BombilloMini({ cx, cy, r = 11 }) {
  return (
    <g>
      <motion.circle
        cx={cx}
        cy={cy}
        r={r * 1.9}
        fill="var(--amber)"
        animate={{ opacity: [0.12, 0.32, 0.12] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{ filter: `blur(${r * 0.6}px)` }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={r}
        fill="var(--paper)"
        stroke="var(--ink-4)"
        strokeWidth="1.5"
        animate={{ scale: [1, 1.05, 1] }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={r * 0.52}
        fill="var(--amber)"
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <rect
        x={cx - r * 0.32}
        y={cy + r * 0.72}
        width={r * 0.64}
        height={r * 0.4}
        rx={r * 0.1}
        fill="var(--ink-4)"
      />
    </g>
  );
}

export function Barrido({ etiqueta = "analizando la escena" }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-16 w-40 overflow-hidden rounded-lg border border-linen bg-paper-2">
        {/* La rejilla de la escena */}
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(var(--linen)_1px,transparent_1px),linear-gradient(90deg,var(--linen)_1px,transparent_1px)] [background-size:16px_16px]" />
        {/* La luz que la recorre */}
        <motion.div
          className="absolute inset-y-0 w-16 bg-[linear-gradient(90deg,transparent,rgb(var(--light-rgb)/0.85),transparent)]"
          animate={{ x: [-64, 160] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: CURVA.luz }}
        />
      </div>
      <p className="annot">{etiqueta}</p>
    </div>
  );
}

export function Filamento({ etiqueta = "calentando los modelos" }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 60" className="h-14 w-28 overflow-visible">
        {/* Bornes */}
        <path d="M8 46 L34 46" stroke="var(--ink-4)" strokeWidth="2" strokeLinecap="round" />
        <path d="M112 46 L86 46" stroke="var(--ink-4)" strokeWidth="2" strokeLinecap="round" />
        {/* El filamento frío debajo, el caliente encima */}
        <path
          d="M34 46 L40 20 L48 44 L56 18 L64 44 L72 18 L80 44 L86 46"
          fill="none"
          stroke="var(--ink-4)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <motion.path
          d="M34 46 L40 20 L48 44 L56 18 L64 44 L72 18 L80 44 L86 46"
          fill="none"
          stroke="var(--amber)"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          initial={{ pathLength: 0, opacity: 0.2 }}
          animate={{ pathLength: [0, 1, 1], opacity: [0.2, 1, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          style={{ filter: "drop-shadow(0 0 6px rgba(255,176,32,0.9))" }}
        />
      </svg>
      <p className="annot">{etiqueta}</p>
    </div>
  );
}

export function Particulas({ etiqueta = "formando la respuesta", compacto = false }) {
  const puntos = Array.from({ length: 11 });
  return (
    <div className={`flex items-center gap-3 ${compacto ? "" : "flex-col"}`}>
      <div className="flex h-6 items-end gap-[3px]">
        {puntos.map((_, i) => (
          <motion.span
            key={i}
            className="block w-[3px] rounded-full bg-amber"
            animate={{
              height: [3, 3 + Math.abs(Math.sin(i * 1.7)) * 17 + 4, 3],
              opacity: [0.25, 1, 0.25],
            }}
            transition={{
              duration: 1.25,
              repeat: Infinity,
              delay: i * 0.07,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      {!compacto && <p className="annot">{etiqueta}</p>}
    </div>
  );
}

export function ImpresoraPreparandose({ etiqueta = "preparando la impresora" }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 70" className="h-16 w-32">
        <rect x="18" y="28" width="84" height="32" rx="6" fill="var(--paper-2)" stroke="var(--ink-4)" strokeWidth="1.6" />
        <rect x="34" y="14" width="52" height="16" rx="2" fill="var(--paper)" stroke="var(--linen)" strokeWidth="1.4" />
        <motion.rect
          x="30"
          y="52"
          width="60"
          height="3"
          rx="1.5"
          fill="var(--amber)"
          animate={{ opacity: [0.3, 1, 0.3], width: [20, 60, 20], x: [30, 30, 30] }}
          transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
        />
        <circle cx="93" cy="36" r="2.6" fill="var(--leaf)" />
      </svg>
      <p className="annot">{etiqueta}</p>
    </div>
  );
}

/** Se abre el historial de capturas: el bombillo se posa sobre un monitor. */
export function BombilloComputador({ etiqueta = "abriendo tus capturas" }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 92" className="h-16 w-24 overflow-visible">
        <rect x="26" y="10" width="68" height="46" rx="6" fill="var(--paper-2)" stroke="var(--ink-4)" strokeWidth="1.6" />
        <rect x="32" y="15" width="56" height="36" rx="3" fill="var(--paper)" />
        <rect x="54" y="58" width="12" height="10" fill="var(--ink-4)" />
        <rect x="38" y="68" width="44" height="5" rx="2.5" fill="var(--ink-4)" />
        <BombilloMini cx={60} cy={33} r={11} />
      </svg>
      <p className="annot">{etiqueta}</p>
    </div>
  );
}

/** Se abre el historial de reportes: el bombillo alumbra unas hojas. */
export function BombilloPapeles({ etiqueta = "reuniendo tus reportes" }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 92" className="h-16 w-24 overflow-visible">
        <g transform="rotate(-7 60 66)">
          <rect x="34" y="48" width="52" height="34" rx="3" fill="var(--paper-2)" stroke="var(--linen)" strokeWidth="1.4" />
        </g>
        <g transform="rotate(5 60 64)">
          <rect x="35" y="46" width="52" height="34" rx="3" fill="var(--paper)" stroke="var(--linen)" strokeWidth="1.4" />
        </g>
        <rect x="34" y="44" width="52" height="34" rx="3" fill="var(--paper)" stroke="var(--ink-4)" strokeWidth="1.6" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x="41" y={54 + i * 7} width={34 - i * 6} height="2.4" rx="1.2" fill="var(--linen)" />
        ))}
        <BombilloMini cx={60} cy={22} r={10} />
      </svg>
      <p className="annot">{etiqueta}</p>
    </div>
  );
}

/** Esqueleto de papel: para listas que aún no llegaron. */
export function Papel({ lineas = 3 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lineas }).map((_, i) => (
        <motion.span
          key={i}
          className="block h-2.5 rounded-full bg-linen"
          style={{ width: `${92 - i * 14}%` }}
          animate={{ opacity: [0.45, 0.85, 0.45] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
