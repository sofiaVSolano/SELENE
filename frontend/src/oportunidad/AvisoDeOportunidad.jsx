import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { emitirPulso } from "../light/pulso.js";
import { CURVA, menosMovimiento, trans } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";
import Bombillo from "../lum/Bombillo.jsx";
import { crearNarrador } from "../lum/narracion.js";
import Particulas from "../lum/Particulas.jsx";
import { useRecorrido } from "../onboarding/RecorridoContext.jsx";
import { suscribirOportunidad } from "./bus.js";
import Fuga, { focosDeLuz } from "./Fuga.jsx";
import TarjetaOportunidad from "./TarjetaOportunidad.jsx";

/**
 * EL AVISO DE OPORTUNIDAD
 * -----------------------------------------------------------------
 * Lo que antes era una voz del navegador leyendo una frase del backend.
 * Ahora es una escena, y está construida sobre una idea: SELENE no ha
 * encontrado un error, ha encontrado energía que se está escapando. De ahí
 * sale todo lo demás — el ámbar y no el rojo, el zumbido y no el pitido, y
 * una tarjeta que espera en vez de un modal que interrumpe.
 *
 * Dos tiempos, y el corte entre ellos es deliberado:
 *
 *   FASE 1 · los primeros cuatro segundos. La sala entera se entibia
 *     (`html[data-derroche]`, ver `index.css`), los bombillos de la pantalla
 *     brillan más y empiezan a soltar partículas hacia arriba, suena un
 *     zumbido eléctrico bajo el umbral de molestia, y Lum se forma con la
 *     misma física con la que se forma en el recorrido. Mira la escena,
 *     duda, y lo dice con su voz.
 *   FASE 2 · a los cuatro segundos el ambiente se apaga solo. La alerta ya
 *     se hizo notar; a partir de ahí distraería. Queda la tarjeta, fija y
 *     sin bloquear nada, hasta que el usuario decida.
 *
 * El único desfase con el guion es a propósito: Lum NO se deshace a los
 * cuatro segundos si todavía está hablando, se deshace al terminar la
 * frase. Cortarle la voz a media frase deja la alerta sin su contenido, que
 * es justamente lo que la escena existe para entregar. El ambiente —lo que
 * de verdad distrae— sí se apaga puntual.
 */

/* La copy es fija y no la elige un modelo: el aviso tiene que decir siempre
   lo mismo y no puede inventarse capacidades que SELENE no tiene (no apaga
   luces, avisa). Misma decisión que en `onboarding/guion.js`. */
const FRASE_AVISO =
  "Creo que olvidamos apagar las luces de esta sala. No detecto personas, pero la iluminación continúa consumiendo energía.";
const FRASE_GRACIAS = "¡Excelente! Esa decisión es la más adecuada, resuélvelo pronto.";

const MS_AMBIENTE = 4000;
/* Techo de la celebración: si la voz tardara más (fallback del navegador,
   red lenta), Lum se va igual. Dos o tres segundos de mascota son un premio;
   seis son una interrupción. */
const MS_CELEBRACION = 3600;

/** El derroche nace donde vive la cámara: sobre el visor, no en el centro. */
const ORIGEN_PULSO = { x: 0.36, y: 0.44 };

/** El velo ámbar de la fase 1. Dos capas, y cada una hace una cosa. */
function VeloAmbar() {
  /* La salida es más rápida que la entrada, y a propósito: la sala se
     enciende con calma y se calma de golpe, como cuando dejas de mirar algo
     que ya entendiste. Va dentro de `exit` porque una duración global haría
     que el velo tardara sus 2,6 s en irse. */
  const salida = { transition: { duration: 0.9, ease: CURVA.luz } };

  return (
    <>
      {/* `multiply` tiñe: el papel se vuelve ámbar sin que el texto pierda
          contraste, que es lo que pasaría con una capa opaca encima.
          Las alfas están calibradas a ojo contra pantalla real y son bajas a
          propósito: el guion pide que la interfaz vire "ligeramente", y con
          el doble de estos valores la tipografía de la aplicación empieza a
          leerse desvaída — el aviso no puede costarle legibilidad al resto
          de la pantalla. */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-[62]"
        style={{
          mixBlendMode: "multiply",
          background:
            "linear-gradient(168deg, rgb(255 176 32 / 0.13) 0%, rgb(255 122 24 / 0.085) 58%, rgb(255 217 138 / 0.12) 100%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 1.1, ease: CURVA.luz } }}
        exit={{ opacity: 0, ...salida }}
        aria-hidden
      />
      {/* `plus-lighter` sube la intensidad desde la fuente de luz global: es
          la mitad "los elementos luminosos brillan más" del guion. */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-[63]"
        style={{
          mixBlendMode: "plus-lighter",
          background:
            "radial-gradient(96vmax 62vmax at calc(var(--light-x) * 100%) calc(var(--light-y) * 100%), rgb(255 214 138 / 0.13) 0%, rgb(255 176 32 / 0.045) 42%, transparent 66%)",
        }}
        initial={{ opacity: 0 }}
        // Late: la luz que se escapa no es constante.
        animate={{ opacity: [0, 1, 0.78, 1], transition: { duration: 2.6, ease: "easeInOut" } }}
        exit={{ opacity: 0, ...salida }}
        aria-hidden
      />
    </>
  );
}

export default function AvisoDeOportunidad() {
  const { abierto: recorridoAbierto } = useRecorrido();

  const [datos, setDatos] = useState(null);
  /* Tres ejes independientes a propósito. Si "la tarjeta está visible" fuera
     un valor más de una sola máquina de estados, apagar el ambiente a los
     4 s tendría que cambiar de fase y eso cancelaría la frase de Lum a
     medias (fue exactamente el primer bug de esta escena). */
  const [fase, setFase] = useState("reposo"); // reposo | avisando | celebrando
  const [ambiente, setAmbiente] = useState(false);
  const [tarjeta, setTarjeta] = useState(false);

  /* Estado de Lum. `dice === null` significa "Lum no está en pantalla". */
  const [dice, setDice] = useState(null);
  const [animo, setAnimo] = useState("atento");
  const [formacion, setFormacion] = useState(0);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [saltando, setSaltando] = useState(false);
  const [mirandoA, setMirandoA] = useState(null);

  const narrador = useRef(null);
  const pararZumbido = useRef(null);
  /* Se consulta desde la suscripción, que es una clausura creada una sola
     vez y no puede leer el estado de React. */
  const ocupado = useRef(false);
  const tourAbierto = useRef(false);

  useEffect(() => {
    tourAbierto.current = recorridoAbierto;
  }, [recorridoAbierto]);

  useEffect(() => {
    ocupado.current = fase !== "reposo" || tarjeta;
  }, [fase, tarjeta]);

  /* ------------------------------ LA VOZ ------------------------------ */
  useEffect(() => {
    narrador.current = crearNarrador();
    /* La frase se sintetiza ANTES de hacer falta. Cuando el derroche salta,
       Lum tiene que hablar dentro del primer segundo y medio; esperar a la
       red justo ahí se vería como un bombillo mudo. Se retrasa para no
       competir con la carga de la pantalla, y el servidor la cachea por
       hash, así que a partir de la primera vez es gratis. */
    const id = window.setTimeout(() => narrador.current?.precargar(FRASE_AVISO), 5000);
    return () => {
      window.clearTimeout(id);
      narrador.current?.destruir();
    };
  }, []);

  const apagarAmbiente = useCallback(() => {
    delete document.documentElement.dataset.derroche;
    pararZumbido.current?.();
    pararZumbido.current = null;
    setAmbiente(false);
  }, []);

  /* --------------------------- LA SUSCRIPCIÓN --------------------------- */
  useEffect(
    () =>
      suscribirOportunidad((nueva) => {
        setDatos(nueva);
        /* Si ya hay un aviso vivo, la alerta nueva sólo refresca las cifras
           de la tarjeta. Montar la escena por segunda vez encima de sí
           misma haría aparecer dos Lum y duplicar el zumbido. */
        if (ocupado.current) return;
        ocupado.current = true;
        /* Lum no puede estar guiando el recorrido y avisando a la vez: si el
           recorrido está abierto se salta la escena y queda la tarjeta, que
           es la parte que no caduca. */
        if (tourAbierto.current) {
          setTarjeta(true);
          return;
        }
        setFase("avisando");
      }),
    []
  );

  /* ----------------------------- FASE 1 + 2 ----------------------------- */
  useEffect(() => {
    if (fase !== "avisando") return undefined;

    let vivo = true;
    const relojes = [];
    const esperar = (ms) =>
      new Promise((resolver) => {
        relojes.push(window.setTimeout(resolver, ms));
      });
    const reducido = menosMovimiento();

    // La sala entera reacciona antes de que nadie hable.
    document.documentElement.dataset.derroche = "si";
    setAmbiente(true);
    pararZumbido.current = sonido.zumbido();
    sonido.aviso();
    /* `dato` y no `fallo`: el pulso de fallo hace parpadear la luz global
       como cuando algo se rompe, y esto no está roto. */
    emitirPulso({ fuerza: 0.42, tipo: "dato", origen: ORIGEN_PULSO });

    // El ambiente se apaga a los 4 s exactos, pase lo que pase con la voz.
    relojes.push(
      window.setTimeout(
        () => {
          if (!vivo) return;
          apagarAmbiente();
          setTarjeta(true);
          // Ya hay tiempo de sobra: se adelanta la voz de la celebración.
          narrador.current?.precargar(FRASE_GRACIAS);
        },
        reducido ? 700 : MS_AMBIENTE
      )
    );

    (async () => {
      setDeshaciendo(false);
      setSaltando(false);
      setAnimo("atento");
      setFormacion(0.001);
      setDice(FRASE_AVISO);
      // Mira los bombillos por los que se está escapando la luz.
      const focos = focosDeLuz();
      setMirandoA(focos[0] ? { x: focos[0].x, y: focos[0].y } : null);
      sonido.chispa();

      await esperar(reducido ? 120 : 760); // se forma
      if (!vivo) return;
      setFormacion(1);

      await esperar(reducido ? 100 : 640); // observa la escena
      if (!vivo) return;
      setAnimo("pensativo");

      await esperar(reducido ? 60 : 300); // duda, y entonces habla
      if (!vivo) return;
      await (narrador.current?.hablar(FRASE_AVISO) ?? esperar(2000));
      if (!vivo) return;

      // Dicho lo suyo, se deshace en partículas.
      setDeshaciendo(true);
      setAnimo("neutral");
      sonido.vuelo();
      setFormacion(0);
      await esperar(reducido ? 120 : 760);
      if (!vivo) return;
      setDice(null);
      setFase("reposo");
    })();

    return () => {
      vivo = false;
      relojes.forEach((id) => window.clearTimeout(id));
      apagarAmbiente();
    };
  }, [fase, apagarAmbiente]);

  /* --------------------------- LA CELEBRACIÓN --------------------------- */
  useEffect(() => {
    if (fase !== "celebrando") return undefined;

    let vivo = true;
    const relojes = [];
    const esperar = (ms) =>
      new Promise((resolver) => {
        relojes.push(window.setTimeout(resolver, ms));
      });
    const reducido = menosMovimiento();

    sonido.confirmar();
    emitirPulso({ fuerza: 0.3, tipo: "exito", origen: ORIGEN_PULSO });

    (async () => {
      setDeshaciendo(false);
      setSaltando(false);
      setMirandoA(null); // ahora mira al frente: te está hablando a ti
      setAnimo("contento");
      setFormacion(0.001);
      setDice(FRASE_GRACIAS);
      sonido.chispa();

      await esperar(reducido ? 100 : 560);
      if (!vivo) return;
      setFormacion(1);
      setAnimo("celebrando");

      await Promise.race([
        narrador.current?.hablar(FRASE_GRACIAS) ?? esperar(1800),
        esperar(MS_CELEBRACION),
      ]);
      if (!vivo) return;

      // El saltito, y sólo entonces las partículas.
      if (!reducido) {
        setSaltando(true);
        sonido.despedida();
        await esperar(620);
        if (!vivo) return;
      }
      setDeshaciendo(true);
      setFormacion(0);
      await esperar(reducido ? 120 : 780);
      if (!vivo) return;
      setDice(null);
      setDatos(null);
      setFase("reposo");
    })();

    return () => {
      vivo = false;
      relojes.forEach((id) => window.clearTimeout(id));
      narrador.current?.detener();
    };
  }, [fase]);

  /* ---------------------------- INTERACCIÓN ---------------------------- */
  const entendido = useCallback(() => {
    setTarjeta(false);
    setFase("celebrando");
  }, []);

  const descartar = useCallback(() => {
    setTarjeta(false);
    setDatos(null);
    setFase("reposo");
  }, []);

  /* Escape descarta la tarjeta. No hay atajo para "entendido": confirmar una
     acción con una tecla que el usuario pulsa para cerrar cosas sería
     ponerle palabras en la boca. */
  useEffect(() => {
    if (!tarjeta) return undefined;
    const alTeclear = (e) => {
      if (e.key === "Escape") descartar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [tarjeta, descartar]);

  // Última red: si el shell se desmonta a media escena, el ámbar y el
  // zumbido no pueden quedarse puestos.
  useEffect(() => () => apagarAmbiente(), [apagarAmbiente]);

  const compacto = typeof window !== "undefined" && window.innerWidth < 640;
  const reducido = menosMovimiento();
  const hablando = dice !== null && formacion === 1 && !deshaciendo && !saltando;

  return (
    <>
      <AnimatePresence>{ambiente && <VeloAmbar key="velo" />}</AnimatePresence>
      <AnimatePresence>{ambiente && <Fuga key="fuga" />}</AnimatePresence>

      {/* Lum y la tarjeta comparten una sola columna anclada abajo a la
          derecha: así, cuando la tarjeta entra mientras Lum todavía habla,
          se coloca debajo de él en vez de encima. `bottom-24` en móvil deja
          libre la barra de navegación inferior del shell. */}
      <div className="pointer-events-none fixed bottom-24 right-3 z-[72] flex w-[min(94vw,384px)] flex-col items-end gap-3 sm:bottom-8 sm:right-8">
        <AnimatePresence>
          {dice !== null && (
            <motion.div
              key="lum"
              className="flex w-full items-end gap-2.5"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={trans(0.4)}
            >
              <motion.div
                className="relative shrink-0"
                animate={
                  saltando
                    ? { y: [0, -26, 0, -10, 0], rotate: [0, -8, 8, -4, 0], scale: [1, 1.16, 1, 1.06, 1] }
                    : { y: 0, rotate: 0, scale: 1 }
                }
                transition={saltando ? { duration: 0.62, ease: CURVA.objeto } : trans(0.3)}
              >
                <AnimatePresence>
                  {formacion < 1 && !reducido && (
                    <Particulas
                      key={deshaciendo ? "salida" : "entrada"}
                      modo={deshaciendo ? "salida" : "entrada"}
                      cantidad={deshaciendo ? 24 : 20}
                    />
                  )}
                </AnimatePresence>

                <Bombillo
                  tamano={compacto ? 54 : 66}
                  animo={animo}
                  hablando={hablando}
                  mirandoA={mirandoA}
                  formacion={formacion}
                />
              </motion.div>

              {/* Lo que dice. Aparece cuando el cuerpo ya está formado: leer
                  un bocadillo que sale de un puñado de partículas es raro. */}
              <AnimatePresence>
                {formacion === 1 && !deshaciendo && (
                  <motion.div
                    className="vidrio mb-1 min-w-0 flex-1 px-3.5 py-2.5"
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }}
                    transition={trans(0.36)}
                    aria-live="polite"
                  >
                    <p className="text-[12.5px] leading-relaxed text-ink sm:text-[13px]">{dice}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {tarjeta && datos && (
            <TarjetaOportunidad
              key={datos.id}
              datos={datos}
              dejarSitioALum={dice !== null}
              onEntendido={entendido}
              onDescartar={descartar}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
