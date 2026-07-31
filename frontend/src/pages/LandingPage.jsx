import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import BotonSonido from "../components/BotonSonido.jsx";
import Cifra from "../components/Cifra.jsx";
import Marca from "../components/Marca.jsx";
import Habitacion from "../components/landing/Habitacion.jsx";
import { useLight } from "../light/LightContext.jsx";
import { sonido } from "../lib/sound.js";

/* Consumo real de la sala a lo largo del dia (W). Las mesetas son
   deliberadas: el sistema no atenua en rampa, decide y actua.        */
const CONSUMO_T = [0, 0.42, 0.5, 0.66, 0.74, 0.9, 1];
const CONSUMO_W = [318, 318, 206, 206, 84, 84, 128];
const PICO = 318;

/** Anotaciones sobre el plano. Cuatro frases en toda la landing. */
const NOTAS = [
  { desde: 0.16, hasta: 0.36, x: "56%", y: "8%", texto: "Encuentra las ventanas y mide la luz que ya entra." },
  { desde: 0.4, hasta: 0.58, x: "8%", y: "16%", texto: "Apaga lo que el sol está haciendo gratis." },
  { desde: 0.62, hasta: 0.8, x: "14%", y: "62%", texto: "La sala se vacía. La luz también se va." },
  { desde: 0.84, hasta: 1, x: "48%", y: "26%", texto: "74 % menos de energía. Nadie tocó un interruptor." },
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
  const [hover, setHover] = useState(false);

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
        <BotonSonido />
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

          {/* ---------- Instrumentos: viven en el margen, en tinta ---------- */}
          <div className="pointer-events-none absolute bottom-8 left-8 flex flex-col gap-6">
            <div>
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

        {/* Toda la luz de la pagina se contrae en un solo punto: el acceso. */}
        <motion.button
          onClick={entrar}
          onHoverStart={() => {
            setHover(true);
            sonido.roce();
          }}
          onHoverEnd={() => setHover(false)}
          className="group relative flex h-16 items-center justify-center rounded-full outline-none"
          animate={{ width: hover ? 236 : 64 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        >
          <motion.span
            className="absolute inset-0 rounded-full"
            animate={{
              backgroundColor: hover ? "#191512" : "#ffb020",
              boxShadow: hover
                ? "0 18px 50px -16px rgba(25,21,18,0.5)"
                : "0 0 34px 6px rgba(255,176,32,0.55), 0 0 90px 20px rgba(255,176,32,0.18)",
            }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          />
          <motion.span
            animate={{ opacity: hover ? 1 : 0 }}
            transition={{ duration: 0.25, delay: hover ? 0.12 : 0 }}
            className="relative z-10 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.42em] text-paper"
          >
            entrar a selene
          </motion.span>
        </motion.button>

        <footer className="absolute bottom-8 flex w-full max-w-5xl items-center justify-between px-2">
          <p className="annot">tesis · ingeniería de sistemas</p>
          <p className="annot">visión artificial · eficiencia energética</p>
        </footer>
      </section>
    </main>
  );
}
