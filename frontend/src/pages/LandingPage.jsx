import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import BotonSonido from "../components/BotonSonido.jsx";
import Cifra from "../components/Cifra.jsx";
import Marca from "../components/Marca.jsx";
import PuntoMonitoreo from "../components/PuntoMonitoreo.jsx";
import Habitacion from "../components/landing/Habitacion.jsx";
import { useLight } from "../light/LightContext.jsx";
import { sonido } from "../lib/sound.js";

/* Consumo real de la sala a lo largo del dia (W). Las mesetas son
   deliberadas: el sistema no atenua en rampa, decide y actua.        */
const CONSUMO_T = [0, 0.42, 0.5, 0.66, 0.74, 0.9, 1];
const CONSUMO_W = [318, 318, 206, 206, 84, 84, 128];
const PICO = 318;

/* Anotaciones sobre el plano. Cuatro frases en toda la landing.
   SELENE no acciona interruptores: observa, calcula y avisa. El texto
   dice exactamente eso, porque prometer control de hardware seria
   vender algo que la herramienta no hace.                            */
const NOTAS = [
  { desde: 0.16, hasta: 0.36, x: "56%", y: "8%", texto: "Encuentra las ventanas y mide la luz que ya entra." },
  { desde: 0.4, hasta: 0.58, x: "8%", y: "16%", texto: "Calcula qué luminarias sobran mientras entra el sol." },
  { desde: 0.62, hasta: 0.8, x: "14%", y: "62%", texto: "Sala vacía con luces encendidas: alerta al instante." },
  { desde: 0.84, hasta: 1, x: "48%", y: "26%", texto: "74 % menos de energía atendiendo sus alertas de control." },
];

function Nota({ t, nota }) {
  const opacidad = useTransform(
    t,
    [nota.desde, nota.desde + 0.05, nota.hasta - 0.05, nota.hasta],
    [0, 1, 1, 0]
  );
  const y = useTransform(t, [nota.desde, nota.desde + 0.08], [14, 0]);

  return (
    <motion.p
      style={{ opacity: opacidad, y, left: nota.x, top: nota.y }}
      className="serif pointer-events-none absolute max-w-[16ch] text-[clamp(1.1rem,1.9vw,1.8rem)] italic leading-[1.16] text-ink"
    >
      {nota.texto}
    </motion.p>
  );
}

/** Particula de CO2: se desvanece cuando la sala deja de gastar. */
function Particula({ t, indice, total }) {
  const umbral = 0.44 + (indice / total) * 0.42;
  const opacidad = useTransform(t, [umbral, umbral + 0.04], [0.8, 0]);
  const subida = useTransform(t, [umbral, umbral + 0.06], [0, -26]);

  return (
    <motion.span
      style={{
        opacity: opacidad,
        y: subida,
        left: `${(indice % 9) * 11}%`,
        top: `${Math.floor(indice / 9) * 30}%`,
      }}
      className="absolute block h-[5px] w-[5px] rounded-full bg-ink-3"
    />
  );
}

/**
 * La alerta de control: el producto real. No apaga la luz, emite el aviso
 * y la recomendacion. Entra como una hoja de papel, con su sonido.
 */
function Alerta({ t }) {
  const opacidad = useTransform(t, [0.6, 0.65, 0.82, 0.88], [0, 1, 1, 0]);
  const x = useTransform(t, [0.6, 0.68], [28, 0]);
  const yaSono = useRef(false);

  useMotionValueEvent(t, "change", (v) => {
    if (v > 0.63 && !yaSono.current) {
      yaSono.current = true;
      sonido.aviso();
      sonido.papel();
    }
    if (v < 0.5) yaSono.current = false; // rearma para el siguiente ciclo
  });

  return (
    <motion.aside
      style={{ opacity: opacidad, x }}
      className="surface pointer-events-none absolute right-8 top-24 z-20 w-[302px] overflow-hidden p-5"
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-amber-hot to-amber-soft" />
      <div className="flex items-center justify-between">
        <p className="annot text-amber-hot">alerta de control</p>
        <p className="mono text-[10px] tabular-nums text-ink-3">12:47</p>
      </div>
      <p className="serif mt-3 text-[1.32rem] leading-tight">
        Sala vacía con <em>3 luminarias</em> encendidas.
      </p>
      <p className="mono mt-3 text-[11px] text-ink-2">42 W desperdiciados · 0 personas detectadas</p>
      <p className="mt-4 border-t border-linen pt-3 font-mono text-[11px] leading-relaxed text-ink-2">
        <span className="text-leaf">recomendación</span> · apagar zona escritorio hasta que se
        registre ocupación
      </p>
    </motion.aside>
  );
}

/** Reloj de la escena: el scroll es tiempo, y hay que decirlo. */
function Reloj({ t }) {
  const ref = useRef(null);
  useMotionValueEvent(t, "change", (v) => {
    const minutos = 6 * 60 + v * (19.5 * 60 - 6 * 60);
    const h = Math.floor(minutos / 60);
    const m = Math.floor(minutos % 60);
    if (ref.current) ref.current.textContent = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  return <span ref={ref} className="mono tabular-nums">06:00</span>;
}

export default function LandingPage({ encendida = true }) {
  const contenedor = useRef(null);
  const navegar = useNavigate();
  const { iluminar } = useLight();

  const { scrollYProgress } = useScroll({
    target: contenedor,
    offset: ["start start", "end end"],
  });

  // `t` es la unica verdad de la escena. Puede venir del scroll del
  // usuario o de la reproduccion automatica.
  const t = useMotionValue(0);
  const usuarioTomoElControl = useRef(false);
  const auto = useRef(null);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v > 0.002 && !usuarioTomoElControl.current) {
      usuarioTomoElControl.current = true;
      auto.current?.stop();
    }
    if (usuarioTomoElControl.current) t.set(v);
  });

  /* Si nadie hace scroll, la escena se cuenta sola. Sin esto, en una
     sustentacion con proyector la landing seria una imagen fija.      */
  useEffect(() => {
    if (!encendida) return undefined;
    const id = window.setTimeout(() => {
      if (usuarioTomoElControl.current) return;
      auto.current = animate(t, [0, 1, 1, 0.02], {
        duration: 34,
        times: [0, 0.62, 0.76, 1],
        ease: "linear",
        repeat: Infinity,
      });
    }, 3200);
    return () => {
      window.clearTimeout(id);
      auto.current?.stop();
    };
  }, [encendida, t]);

  /* La luz de la escena ES la luz de la interfaz: al avanzar el dia, el
     papel, las sombras y los halos de toda la pagina cambian con ella. */
  const ultimoPaso = useRef(-1);
  useMotionValueEvent(t, "change", (v) => {
    const paso = Math.round(v * 40);
    if (paso === ultimoPaso.current) return;
    ultimoPaso.current = paso;
    const p = paso / 40;
    const kelvin = p < 0.5 ? 2200 + p * 2 * 3400 : 5600 - (p - 0.5) * 2 * 3300;
    iluminar({
      x: 0.86 - p * 0.34,
      y: 0.5 - Math.sin(p * Math.PI) * 0.42,
      intensity: 0.4 + Math.sin(p * Math.PI) * 0.55,
      kelvin,
    });
  });

  const consumo = useTransform(t, CONSUMO_T, CONSUMO_W);
  const ahorro = useTransform(consumo, (w) => ((PICO - w) / PICO) * 100);
  const anchoBarra = useTransform(consumo, (w) => `${(w / PICO) * 100}%`);
  const ocupacion = useTransform(t, [0.62, 0.7], [1, 0]);
  const vacia = useTransform(ocupacion, [0, 1], [1, 0]);
  const pistaScroll = useTransform(t, [0, 0.04], [1, 0]);

  const entrar = () => {
    sonido.pulso();
    navegar("/acceso");
  };

  return (
    <main className="relative z-[2] min-h-screen bg-paper text-ink">
      {/* Cabecera: dos objetos. Ni menu, ni CTA, ni ruido. */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: encendida ? 1 : 0, y: encendida ? 0 : -12 }}
        transition={{ delay: 0.5, duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-8 py-6"
      >
        <Marca className="text-ink" />
        {/* La cámara vive siempre en pantalla: se puede entrar a la
            herramienta en cualquier momento de la narracion. */}
        <div className="flex items-center gap-5">
          <PuntoMonitoreo tamano={40} etiqueta="iniciar monitoreo" />
          <BotonSonido />
        </div>
      </motion.header>

      {/* ------------------ ACTO ÚNICO: LA HABITACIÓN ------------------ */}
      <section ref={contenedor} className="relative h-[460vh]">
        <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
          <div className="relative h-[min(74vh,700px)] w-[min(92vw,1180px)]">
            <Habitacion t={t} />

            {NOTAS.map((n) => (
              <Nota key={n.texto} t={t} nota={n} />
            ))}
          </div>

          <Alerta t={t} />

          {/* ---------- Instrumentos: viven en el margen, en tinta ---------- */}
          <div className="pointer-events-none absolute bottom-8 left-8 flex flex-col gap-6">
            <div>
              <p className="annot mb-1 text-ink-4">simulación · escenario recomendado</p>
              <p className="annot mb-2">consumo de la sala</p>
              <p className="flex items-baseline gap-2">
                <Cifra valor={consumo} className="text-[clamp(2.2rem,4.4vw,3.4rem)] leading-none tracking-tight" />
                <span className="mono text-sm text-ink-3">W</span>
              </p>
              <div className="mt-3 h-[3px] w-56 overflow-hidden rounded-full bg-linen">
                <motion.div
                  style={{ width: anchoBarra }}
                  className="h-full rounded-full bg-gradient-to-r from-amber-hot to-amber-soft"
                />
              </div>
            </div>

            <div className="flex gap-10">
              <div>
                <p className="annot mb-1">ahorro</p>
                <p className="flex items-baseline gap-1">
                  <Cifra valor={ahorro} className="text-2xl text-leaf" />
                  <span className="mono text-xs text-leaf/70">%</span>
                </p>
              </div>
              <div>
                <p className="annot mb-1">ocupación</p>
                <div className="flex h-6 items-center gap-1.5">
                  <motion.span style={{ opacity: ocupacion }} className="block h-2.5 w-2.5 rounded-full bg-leaf" />
                  <motion.span style={{ opacity: vacia }} className="mono text-xs text-ink-3">
                    sala vacía
                  </motion.span>
                </div>
              </div>
            </div>
          </div>

          {/* CO2 y hora, al otro margen */}
          <div className="pointer-events-none absolute bottom-8 right-8 text-right">
            <p className="annot mb-2">co₂ evitado</p>
            <div className="relative mb-4 ml-auto h-16 w-40">
              {Array.from({ length: 27 }).map((_, i) => (
                <Particula key={i} t={t} indice={i} total={27} />
              ))}
            </div>
            <p className="annot mb-1">hora</p>
            <p className="text-2xl">
              <Reloj t={t} />
            </p>
          </div>

          {/* Pista de scroll: desaparece al primer movimiento */}
          <motion.div
            style={{ opacity: pistaScroll }}
            className="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3"
          >
            <span className="annot">desliza · mueve el sol</span>
            <motion.span
              animate={{ scaleY: [0.2, 1, 0.2] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              className="block h-10 w-px origin-top bg-gradient-to-b from-ink-4 to-transparent"
            />
          </motion.div>
        </div>
      </section>

      {/* ------------------ CIERRE: EL PUNTO DE ACCESO ------------------ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center gap-16 px-8">
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-20%" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="serif max-w-[20ch] text-center text-[clamp(2rem,5vw,3.4rem)] leading-[1.06]"
        >
          Esa sala era una simulación.
          <em className="block text-ink-2"> La tuya entra por la cámara.</em>
        </motion.p>

        {/* El cierre no es un boton: es el objetivo de la camara abriendose. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-15%" }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-9"
        >
          <PuntoMonitoreo tamano={116} etiqueta="empezar el monitoreo" grande />

          <button
            onClick={() => {
              sonido.roce();
              navegar("/acceso");
            }}
            className="annot border-b border-transparent pb-1 transition-colors duration-300 hover:border-ink-4 hover:text-ink"
          >
            ya tengo cuenta · acceder
          </button>
        </motion.div>

        <footer className="absolute bottom-8 flex w-full max-w-5xl items-center justify-between px-2">
          <p className="annot">tesis · ingeniería de sistemas</p>
          <p className="annot">visión artificial · eficiencia energética</p>
        </footer>
      </section>
    </main>
  );
}
