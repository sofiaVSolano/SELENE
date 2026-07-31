import { motion } from "framer-motion";

/**
 * Marca SELENE: un punto de luz con rayos.
 * Los rayos se separan al pasar el cursor — la marca tambien "se enciende".
 */
export default function Marca({ tamano = 26, conTexto = true, className = "" }) {
  return (
    <motion.div className={`group flex items-center gap-3 ${className}`} initial="reposo" whileHover="viva">
      <svg width={tamano} height={tamano} viewBox="0 0 40 40" className="shrink-0">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
          <motion.line
            key={a}
            x1="20"
            y1="11"
            x2="20"
            y2="3"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            transform={`rotate(${a} 20 20)`}
            variants={{ reposo: { opacity: 0.5, pathLength: 1 }, viva: { opacity: 1, pathLength: 1 } }}
            transition={{ delay: i * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
        <motion.circle
          cx="20"
          cy="20"
          r="6"
          fill="currentColor"
          variants={{ reposo: { scale: 1 }, viva: { scale: 1.18 } }}
          style={{ transformOrigin: "20px 20px" }}
          transition={{ type: "spring", stiffness: 340, damping: 18 }}
        />
      </svg>
      {conTexto && (
        <span className="font-mono text-[12px] uppercase tracking-[0.42em]">selene</span>
      )}
    </motion.div>
  );
}
