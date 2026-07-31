const ITEMS = [
  "ZONA A · OCUPADO · 82% LUZ NATURAL",
  "ZONA B · VACÍO · APAGADO AUTOMÁTICO",
  "ZONA C · 3 PERSONAS · CONFIANZA 0.94",
  "PASILLO 2 · ENCENDIDO PROGRAMADO 07:00",
  "SALA REUNIONES · OCUPADO · 61% ARTIFICIAL",
  "DEPÓSITO · SIN MOVIMIENTO 40MIN · ALERTA",
];

export default function StatusTicker() {
  const loop = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-white/5 bg-void-900/60 py-3">
      <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-mono text-xs text-haze-400">
        {loop.map((item, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-beam-500 animate-pulse-slow" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
