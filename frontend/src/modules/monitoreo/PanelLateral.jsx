import { motion } from "framer-motion";
import Contador from "../../components/ui/Contador.jsx";
import Modulo, { Barra, Renglon } from "../../components/ui/Modulo.jsx";
import { CURVA, RESORTE, trans } from "../../lib/movimiento.js";

/**
 * PANEL LATERAL
 * -----------------------------------------------------------------
 * Cinco módulos flotantes, no una lista de tarjetas. Cada uno tiene su
 * propio icono, su propia unidad y su propia forma de dibujar el dato —
 * el de iluminación es una balanza, el de energía son tres barras
 * comparadas. Un número suelto no dice nada; un número al lado de su
 * forma, sí.
 *
 * Todos los contadores arrancan en el valor ANTERIOR, no en cero: así el
 * movimiento del número ES la variación entre capturas.
 */

/* Factor de emisión de la red eléctrica colombiana (kg CO₂ por kWh).
   Fuente: factor de emisión del SIN publicado por la UPME. Se declara
   aquí y se muestra en la interfaz para que la cifra sea auditable. */
const KG_CO2_POR_KWH = 0.164;

const Icono = {
  personas: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" />
    </svg>
  ),
  ventanas: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="4.5" y="3.5" width="15" height="17" rx="1.6" />
      <path d="M12 3.5v17M4.5 12h15" />
    </svg>
  ),
  luminarias: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M9.4 17.5h5.2M10.2 20.3h3.6" />
      <path d="M12 3.4a5.4 5.4 0 0 1 3.1 9.8c-.5.35-.8.9-.8 1.5v.3H9.7v-.3c0-.6-.3-1.15-.8-1.5A5.4 5.4 0 0 1 12 3.4Z" />
    </svg>
  ),
  iluminacion: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
    </svg>
  ),
  energia: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M13.4 2.5 5.2 13.4h5.6l-.4 8.1 8.4-11.1h-5.8z" />
    </svg>
  ),
};

/** Flecha de variación. En verde sólo cuando la variación es buena. */
function Delta({ valor, decimales = 0, invertido = false, sufijo = "" }) {
  if (valor === null || valor === undefined || Math.abs(valor) < 0.005) {
    return <span className="mono text-[10px] text-ink-4">sin cambio</span>;
  }
  const sube = valor > 0;
  const bueno = invertido ? !sube : sube;
  return (
    <motion.span
      initial={{ opacity: 0, y: sube ? 5 : -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={trans(0.3)}
      className="mono flex items-center gap-1 text-[10px] tabular-nums"
      style={{ color: bueno ? "var(--leaf)" : "var(--clay)" }}
    >
      <span>{sube ? "▲" : "▼"}</span>
      {Math.abs(valor).toFixed(decimales)}
      {sufijo}
    </motion.span>
  );
}

/** La balanza de luz: dónde está el peso, si en el sol o en el techo. */
function Balanza({ natural, artificial }) {
  const total = Math.max(1, natural + artificial);
  const pNat = natural / total;
  const angulo = (pNat - 0.5) * 62; // -31° todo artificial · +31° todo natural

  return (
    <div className="my-2">
      <svg viewBox="0 0 160 74" className="h-[74px] w-full overflow-visible">
        {/* Arco de fondo */}
        <path d="M16 60 A64 64 0 0 1 144 60" fill="none" stroke="var(--linen)" strokeWidth="7" strokeLinecap="round" />
        {/* Arco natural: crece desde la izquierda */}
        <motion.path
          d="M16 60 A64 64 0 0 1 144 60"
          fill="none"
          stroke="var(--sun)"
          strokeWidth="7"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pNat }}
          transition={{ duration: 0.7, ease: CURVA.luz }}
        />
        {/* Aguja */}
        <motion.g
          animate={{ rotate: angulo }}
          transition={RESORTE.objeto}
          style={{ transformOrigin: "80px 60px" }}
        >
          <line x1="80" y1="60" x2="80" y2="12" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="80" cy="12" r="3.4" fill="var(--amber)" />
        </motion.g>
        <circle cx="80" cy="60" r="3.6" fill="var(--ink)" />
      </svg>

      <div className="-mt-1 flex justify-between">
        <span className="annot text-[9px]">natural</span>
        <span className="annot text-[9px]">artificial</span>
      </div>
    </div>
  );
}

export default function PanelLateral({ analisis, anterior, hayDatos }) {
  const a = analisis || {};
  const p = anterior || {};

  const confianzaMedia = (lista) =>
    lista?.length ? (lista.reduce((s, d) => s + d.confianza, 0) / lista.length) * 100 : 0;

  const confActual = confianzaMedia(a.personas);
  const confPrevia = confianzaMedia(p.personas);

  const consumo = a.consumo_estimado_kwh;
  const ahorro = a.ahorro_estimado_kwh;
  const optimizado = consumo !== null && consumo !== undefined && ahorro ? Math.max(0, consumo - ahorro) : consumo;
  const co2 = ahorro ? ahorro * KG_CO2_POR_KWH : 0;

  if (!hayDatos) {
    return (
      <aside className="flex w-full flex-col gap-3">
        <div className="modulo p-6">
          <p className="annot mb-3">panel de análisis</p>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Todavía no hay ninguna inferencia. Cuando analices el primer fotograma, estos módulos se
            encienden uno a uno con lo que la cámara vio.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex w-full flex-col gap-3">
      {/* ------------------------------ PERSONAS ------------------------------ */}
      <Modulo
        icono={Icono.personas}
        titulo="personas"
        anotacion={a.estado_ocupacion === "ocupado" ? "sala ocupada" : "sala vacía"}
        dato={a.personas_detectadas}
        indice={0}
      >
        <div className="flex items-end justify-between">
          <p className="flex items-baseline gap-1.5">
            <Contador
              valor={a.personas_detectadas ?? 0}
              desde={p.personas_detectadas ?? 0}
              className="text-[2rem] leading-none tracking-tight"
            />
            <span className="mono text-[11px] text-ink-3">detectadas</span>
          </p>
          <Delta valor={(a.personas_detectadas ?? 0) - (p.personas_detectadas ?? 0)} />
        </div>

        <div className="mt-3">
          <Renglon etiqueta="confianza media">
            <Contador valor={confActual} desde={confPrevia} decimales={1} sufijo=" %" />
          </Renglon>
          <div className="mt-1.5">
            <Barra valor={confActual / 100} color="var(--ink-2)" />
          </div>
        </div>
      </Modulo>

      {/* ------------------------------ VENTANAS ------------------------------ */}
      <Modulo
        icono={Icono.ventanas}
        titulo="ventanas"
        anotacion="aporte de luz natural"
        dato={a.num_ventanas}
        indice={1}
      >
        <div className="flex items-end justify-between">
          <p className="flex items-baseline gap-1.5">
            <Contador
              valor={a.num_ventanas ?? 0}
              desde={p.num_ventanas ?? 0}
              className="text-[2rem] leading-none tracking-tight"
            />
            <span className="mono text-[11px] text-ink-3">en el encuadre</span>
          </p>
          <Delta valor={(a.num_ventanas ?? 0) - (p.num_ventanas ?? 0)} />
        </div>

        <div className="mt-3">
          <Renglon etiqueta="área del encuadre">
            <Contador
              valor={(a.area_ventanas_relativa ?? 0) * 100}
              desde={(p.area_ventanas_relativa ?? 0) * 100}
              decimales={1}
              sufijo=" %"
            />
          </Renglon>
          <div className="mt-1.5">
            <Barra valor={a.area_ventanas_relativa ?? 0} color="var(--sun)" />
          </div>
          <Renglon etiqueta="luz natural de la escena">
            <Contador
              valor={a.porcentaje_natural ?? 0}
              desde={p.porcentaje_natural ?? 0}
              decimales={1}
              sufijo=" %"
            />
          </Renglon>
        </div>
      </Modulo>

      {/* ----------------------------- LUMINARIAS ----------------------------- */}
      <Modulo
        icono={Icono.luminarias}
        titulo="luminarias"
        anotacion={a.tipo_iluminacion || "sin clasificar"}
        dato={a.num_luminarias}
        indice={2}
      >
        <div className="flex items-end justify-between">
          <p className="flex items-baseline gap-1.5">
            <Contador
              valor={a.num_luminarias ?? 0}
              desde={p.num_luminarias ?? 0}
              className="text-[2rem] leading-none tracking-tight"
            />
            <span className="mono text-[11px] text-ink-3">visibles</span>
          </p>
          <Delta valor={(a.num_luminarias ?? 0) - (p.num_luminarias ?? 0)} invertido />
        </div>

        <div className="mt-3">
          <Renglon etiqueta="área del encuadre">
            <Contador
              valor={(a.area_luminarias_relativa ?? 0) * 100}
              desde={(p.area_luminarias_relativa ?? 0) * 100}
              decimales={1}
              sufijo=" %"
            />
          </Renglon>
          <div className="mt-1.5">
            <Barra valor={a.area_luminarias_relativa ?? 0} color="var(--amber)" />
          </div>
          <Renglon etiqueta="brillo medio" acento>
            <Contador valor={a.brillo_luminarias ?? 0} desde={p.brillo_luminarias ?? 0} decimales={0} />
          </Renglon>
        </div>
      </Modulo>

      {/* ---------------------------- ILUMINACIÓN ---------------------------- */}
      <Modulo
        icono={Icono.iluminacion}
        titulo="iluminación"
        anotacion={a.tipo_iluminacion || "—"}
        dato={a.porcentaje_natural}
        indice={3}
      >
        <Balanza natural={a.porcentaje_natural ?? 0} artificial={a.porcentaje_artificial ?? 0} />

        <div className="grid grid-cols-2 gap-x-4">
          <div>
            <p className="annot text-[9px]">natural</p>
            <Contador
              valor={a.porcentaje_natural ?? 0}
              desde={p.porcentaje_natural ?? 0}
              decimales={1}
              sufijo=" %"
              className="text-[15px]"
            />
          </div>
          <div className="text-right">
            <p className="annot text-[9px]">artificial</p>
            <Contador
              valor={a.porcentaje_artificial ?? 0}
              desde={p.porcentaje_artificial ?? 0}
              decimales={1}
              sufijo=" %"
              className="text-[15px]"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div>
            <div className="mb-1 flex justify-between">
              <span className="annot text-[9px]">natural score</span>
              <Contador valor={a.natural_score ?? 0} desde={p.natural_score ?? 0} decimales={2} className="text-[10px]" />
            </div>
            <Barra valor={a.natural_score ?? 0} color="var(--sun)" />
          </div>
          <div>
            <div className="mb-1 flex justify-between">
              <span className="annot text-[9px]">artificial score</span>
              <Contador valor={a.artificial_score ?? 0} desde={p.artificial_score ?? 0} decimales={2} className="text-[10px]" />
            </div>
            <Barra valor={a.artificial_score ?? 0} color="var(--ember)" />
          </div>
        </div>
      </Modulo>

      {/* ------------------------------- ENERGÍA ------------------------------- */}
      <Modulo
        icono={Icono.energia}
        titulo="energía"
        anotacion={consumo === null || consumo === undefined ? "elige una luminaria" : "tramo desde la captura anterior"}
        dato={consumo}
        indice={4}
      >
        {consumo === null || consumo === undefined ? (
          <p className="text-[12px] leading-relaxed text-ink-3">
            Sin luminaria asociada, SELENE no sabe qué lámpara está midiendo y no puede estimar
            consumo. Elige una arriba y vuelve a analizar.
          </p>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <p className="flex items-baseline gap-1.5">
                <Contador
                  valor={consumo * 1000}
                  desde={(p.consumo_estimado_kwh ?? consumo) * 1000}
                  decimales={1}
                  className="text-[2rem] leading-none tracking-tight"
                />
                <span className="mono text-[11px] text-ink-3">Wh esperados</span>
              </p>
            </div>

            {/* Dos barras comparadas: esperado contra optimizado */}
            <div className="mt-3 flex flex-col gap-2">
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="annot text-[9px]">esperado</span>
                  <span className="mono text-[10px] text-ink-2">{(consumo * 1000).toFixed(1)} Wh</span>
                </div>
                <Barra valor={1} color="var(--ember)" alto={5} />
              </div>
              <div>
                <div className="mb-1 flex justify-between">
                  <span className="annot text-[9px]">optimizado</span>
                  <span className="mono text-[10px] text-ink-2">{(optimizado * 1000).toFixed(1)} Wh</span>
                </div>
                <Barra valor={consumo > 0 ? optimizado / consumo : 0} color="var(--leaf)" alto={5} />
              </div>
            </div>

            <div className="mt-3">
              <Renglon etiqueta="ahorro potencial" acento>
                <Contador
                  valor={(ahorro ?? 0) * 1000}
                  desde={(p.ahorro_estimado_kwh ?? 0) * 1000}
                  decimales={1}
                  sufijo=" Wh"
                />
              </Renglon>
              <Renglon etiqueta="co₂ evitado">
                <Contador valor={co2 * 1000} decimales={1} sufijo=" g" />
              </Renglon>
            </div>

            <p className="mt-2 font-mono text-[9px] leading-relaxed text-ink-4">
              co₂ estimado con {KG_CO2_POR_KWH} kg/kWh · factor de la red nacional
            </p>
          </>
        )}
      </Modulo>

      {/* Recomendación: la salida real del sistema. SELENE avisa, no acciona. */}
      {a.recomendacion && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={trans(0.42, 0.3)}
          className="modulo overflow-hidden p-4"
        >
          <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-amber-hot to-amber-soft" />
          <p className="annot mb-2 text-amber-hot">recomendación</p>
          <p className="text-[13px] leading-relaxed text-ink">{a.recomendacion}</p>
        </motion.div>
      )}
    </aside>
  );
}
