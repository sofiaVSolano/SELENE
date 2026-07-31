import { motion } from "framer-motion";

export default function StatsSidebar({ resultado, log, scanning, alertas }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-white/10 bg-void-800/60 p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-haze-400">Estado actual</p>
        <div className="mt-3 flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs font-semibold ${
              resultado?.estado_ocupacion === "ocupado"
                ? "bg-beam-500/15 text-beam-300"
                : "bg-white/5 text-haze-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                resultado?.estado_ocupacion === "ocupado" ? "bg-beam-400 animate-pulse-slow" : "bg-haze-500"
              }`}
            />
            {resultado ? resultado.estado_ocupacion.toUpperCase() : scanning ? "ANALIZANDO…" : "SIN DATOS"}
          </span>
          <span className="font-display text-3xl font-semibold text-haze-100 tabular-nums">
            {resultado?.personas_detectadas ?? "–"}
          </span>
        </div>
        <p className="mt-1 text-right text-[11px] text-haze-500">personas detectadas</p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-void-800/60 p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-haze-400">Iluminación</p>
        <div className="mt-4 space-y-4">
          <Meter label="Luz natural" value={resultado?.porcentaje_natural ?? 0} color="#ffd000" />
          <Meter label="Luz artificial" value={resultado?.porcentaje_artificial ?? 0} color="#ff7a00" />
          <Meter label="Brillo de escena" value={resultado?.brillo_escena ?? 0} color="#9a9aa2" />
        </div>
        {resultado && (
          <div className="mt-4 space-y-1 border-t border-white/5 pt-3 text-xs text-haze-400">
            <p>
              Tipo: <span className="text-haze-200">{resultado.tipo_iluminacion}</span>
            </p>
            <p className="leading-relaxed">{resultado.recomendacion}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-void-800/60 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-haze-400">
          Alertas y recomendaciones
        </p>
        <div className="space-y-2">
          {(!alertas || alertas.length === 0) && (
            <p className="text-xs text-haze-500">Sin anomalías reportadas en esta zona.</p>
          )}
          {alertas?.map((a, i) => (
            <motion.div
              key={(a.fecha_hora || "") + i}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
            >
              <div className="flex items-center justify-between font-mono text-[10px] text-red-300">
                <span>{a.prioridad ? a.prioridad.toUpperCase() : "ALERTA"}</span>
                <span>{new Date(a.fecha_hora).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-haze-300">{a.mensaje || a.recomendacion}</p>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-void-800/60 p-5">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-haze-400">
          Últimas detecciones
        </p>
        <div className="space-y-2">
          {log.length === 0 && (
            <p className="text-xs text-haze-500">Todavía no hay lecturas en esta sesión.</p>
          )}
          {log.map((entry, i) => (
            <motion.div
              key={entry.fecha_hora + i}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between rounded-lg border border-white/5 bg-void-900/60 px-3 py-2 font-mono text-[11px] text-haze-300"
            >
              <span>{new Date(entry.fecha_hora).toLocaleTimeString()}</span>
              <span className={entry.estado_ocupacion === "ocupado" ? "text-beam-300" : "text-haze-500"}>
                {entry.personas_detectadas} pers.
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, color }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between font-mono text-[11px] text-haze-400">
        <span>{label}</span>
        <span className="text-haze-200">{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-void-900">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value, 100)}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
