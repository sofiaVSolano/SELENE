import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLight } from "../light/LightContext.jsx";
import { CURVA, menosMovimiento, RESORTE, trans } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";
import Bombillo from "../lum/Bombillo.jsx";
import { crearNarrador } from "../lum/narracion.js";
import Particulas from "../lum/Particulas.jsx";
import Controles from "./Controles.jsx";
import { PASOS, variante } from "./guion.js";

/**
 * EL RECORRIDO
 * -----------------------------------------------------------------
 * Orquesta a Lum: lo mueve por la interfaz, lo hace hablar y coordina la luz,
 * el sonido y los subtítulos. No sabe nada del contenido — eso vive en
 * `guion.js` — solo ejecuta la secuencia.
 *
 * Tres decisiones que sostienen todo lo demás:
 *
 *   · **La escena se atenúa, no se tapa.** El foco es un `box-shadow` gigante
 *     alrededor del elemento señalado, así que la sección de la que Lum habla
 *     sigue viéndose nítida y a todo color mientras el resto se hunde. No es
 *     una modal encima de la app: es la app con la luz dirigida.
 *   · **Lum vuela con la fuente de luz global.** Cada parada mueve
 *     `iluminar()`, así que las sombras de TODA la interfaz se reorientan
 *     hacia donde está él. Es lo que hace que no se sienta un componente
 *     pegado encima, sino algo que de verdad está dentro de la sala.
 *   · **Nada bloquea.** Si un elemento no existe, si el audio no llega o si
 *     el usuario navega por su cuenta, el recorrido sigue. Un tour que se
 *     atasca es peor que no tener tour.
 */

const MARGEN = 16;

/**
 * Posición de la cápsula (Lum + subtítulo) respecto al elemento señalado.
 *
 * `suelo` es la línea por debajo de la cual no se puede colocar nada: ahí vive
 * la barra de controles. Sin ese límite la cápsula se metía debajo de la barra
 * y la tarjeta salía cortada — y pasaba justo con los textos largos, porque el
 * alto ya no se estima a ojo sino que se mide del nodo real (ver `altoReal`).
 */
function colocar(rect, ancho, alto, vw, vh, suelo) {
  const techo = MARGEN;
  const maxY = Math.max(techo, suelo - alto);

  if (!rect) {
    return { x: (vw - ancho) / 2, y: maxY, lado: "centro" };
  }

  const debajo = rect.bottom + MARGEN;
  const encima = rect.top - alto - MARGEN;
  // Debajo si cabe entero por encima del suelo; si no, encima; si tampoco,
  // se apoya justo sobre la barra.
  let y = debajo;
  let lado = "debajo";
  if (debajo + alto > suelo) {
    if (encima >= techo) {
      y = encima;
      lado = "encima";
    } else {
      y = maxY;
      lado = "flotando";
    }
  }

  // Centrada sobre el elemento, pero sin salirse nunca de la pantalla.
  const x = Math.min(
    Math.max(MARGEN, rect.left + rect.width / 2 - ancho / 2),
    vw - ancho - MARGEN
  );
  return { x, y: Math.min(Math.max(techo, y), maxY), lado };
}

/** Resalta en el subtítulo las palabras que el guion marca como importantes. */
function Subtitulo({ texto, destacar = [] }) {
  const partes = useMemo(() => {
    if (!destacar.length) return [{ t: texto, fuerte: false }];
    // Se ordenan por longitud para que "no toca" gane a "no" y no se parta mal.
    const patron = new RegExp(
      `(${[...destacar]
        .sort((a, b) => b.length - a.length)
        .map((d) => d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")})`,
      "gi"
    );
    return texto
      .split(patron)
      .filter(Boolean)
      .map((t) => ({ t, fuerte: destacar.some((d) => d.toLowerCase() === t.toLowerCase()) }));
  }, [texto, destacar]);

  return (
    <p className="text-[13.5px] leading-relaxed text-ink sm:text-[14.5px]">
      {partes.map((p, i) =>
        p.fuerte ? (
          <motion.strong
            key={i}
            initial={{ backgroundSize: "0% 100%" }}
            animate={{ backgroundSize: "100% 100%" }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.04, ease: CURVA.luz }}
            className="font-medium text-ink"
            style={{
              backgroundImage:
                "linear-gradient(transparent 62%, rgb(var(--light-rgb) / 0.55) 62%)",
              backgroundRepeat: "no-repeat",
            }}
          >
            {p.t}
          </motion.strong>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </p>
  );
}

export default function Recorrido({ onCerrar, onCompletado }) {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const { iluminar, destello } = useLight();

  const [indice, setIndice] = useState(0);
  const [fase, setFase] = useState("formando"); // formando | hablando | pausado | despidiendo
  const [rect, setRect] = useState(null);
  const [orbitando, setOrbitando] = useState(false);
  const [subtitulosVisibles, setSubtitulosVisibles] = useState(true);
  // El panel de ajustes vive aquí y no dentro de `Controles` porque cambia
  // cuánto espacio ocupa la barra, y de eso depende dónde cabe la cápsula.
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [volumen, setVolumen] = useState(0.9);
  const [velocidad, setVelocidad] = useState(1);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });

  const narrador = useRef(null);
  const paso = PASOS[indice];
  const esUltimo = indice === PASOS.length - 1;
  const reducido = useRef(menosMovimiento());

  /* El texto se congela por paso: si se re-renderiza, la variante elegida no
     puede cambiar a media frase (y el audio ya cacheado dejaría de servir). */
  const [textos, setTextos] = useState(() => PASOS.map((p) => variante(p.textos)));
  const texto = textos[indice];

  /* ------------------------------ NARRADOR ------------------------------ */
  useEffect(() => {
    narrador.current = crearNarrador();
    return () => narrador.current?.destruir();
  }, []);

  useEffect(() => narrador.current?.setMudo(mudo), [mudo]);
  useEffect(() => narrador.current?.setVolumen(volumen), [volumen]);
  useEffect(() => narrador.current?.setVelocidad(velocidad), [velocidad]);

  /* --------------------------- VIEWPORT / ANCLA --------------------------- */
  useEffect(() => {
    const alCambiar = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", alCambiar);
    return () => window.removeEventListener("resize", alCambiar);
  }, []);

  /** Busca el elemento señalado. Reintenta: la pantalla puede estar montándose. */
  useEffect(() => {
    let vivo = true;
    let intentos = 0;

    const buscar = () => {
      if (!vivo) return;
      if (!paso.anclaje) {
        setRect(null);
        return;
      }
      const el = document.querySelector(paso.anclaje);
      if (el) {
        el.scrollIntoView({ behavior: reducido.current ? "auto" : "smooth", block: "center" });
        // Tras el scroll suave el rect cambia; se relee un instante después.
        window.setTimeout(() => vivo && setRect(el.getBoundingClientRect()), reducido.current ? 0 : 420);
        return;
      }
      // Hasta ~2 s esperando a que la ruta termine de montar.
      if (intentos++ < 20) window.setTimeout(buscar, 100);
      else setRect(null); // no está: la parada se cuenta centrada, sin foco
    };

    buscar();
    return () => {
      vivo = false;
    };
  }, [paso, pathname]);

  /* ------------------------- LUZ Y RUTA POR PARADA ------------------------- */
  useEffect(() => {
    if (paso.ruta && paso.ruta !== pathname) navegar(paso.ruta);
  }, [paso, pathname, navegar]);

  useEffect(() => {
    if (paso.luz) iluminar(paso.luz);
  }, [paso, iluminar]);

  /* ------------------------------ SECUENCIA ------------------------------ */
  const avanzar = useCallback(() => {
    setIndice((i) => Math.min(PASOS.length - 1, i + 1));
  }, []);

  const terminar = useCallback(
    (completado) => {
      narrador.current?.detener();
      setFase("despidiendo");
      if (completado) {
        sonido.despedida();
        destello(0.5, 900);
      }
      window.setTimeout(() => (completado ? onCompletado?.() : onCerrar?.()), completado ? 1400 : 420);
    },
    [onCompletado, onCerrar, destello]
  );

  /* Entrada: partículas -> bombillo -> abre los ojos -> saluda. */
  useEffect(() => {
    sonido.chispa();
    const id = window.setTimeout(() => setFase("hablando"), reducido.current ? 200 : 1250);
    return () => window.clearTimeout(id);
  }, []);

  /* El habla de cada parada. Al terminar, encadena la siguiente. */
  useEffect(() => {
    if (fase !== "hablando") return undefined;
    let vivo = true;

    (async () => {
      // Órbita alrededor del elemento antes de explicarlo.
      if (paso.orbitar && !reducido.current) {
        setOrbitando(true);
        sonido.destelloSuave();
        window.setTimeout(() => vivo && setOrbitando(false), 900);
      }

      // Se adelanta la síntesis de la siguiente frase mientras suena esta.
      const siguiente = textos[indice + 1];
      if (siguiente) window.setTimeout(() => narrador.current?.precargar(siguiente), 600);

      const motivo = await narrador.current?.hablar(texto);
      if (!vivo || motivo === "cancelado") return;

      // Pausa de respiración entre paradas: sin esto se atropellan.
      window.setTimeout(() => {
        if (!vivo) return;
        if (esUltimo) terminar(true);
        else {
          sonido.transicion();
          avanzar();
        }
      }, 550);
    })();

    return () => {
      vivo = false;
    };
  }, [fase, indice, texto, textos, paso, esUltimo, avanzar, terminar]);

  /* Vuelo entre paradas: un roce de aire cada vez que Lum se mueve. */
  useEffect(() => {
    if (indice > 0) sonido.vuelo();
  }, [indice]);

  /* ----------------------------- INTERACCIÓN ----------------------------- */
  const pausar = () => {
    setFase("pausado");
    narrador.current?.pausar();
  };
  const reanudar = () => {
    setFase("hablando");
    narrador.current?.reanudar();
  };
  const repetir = () => {
    narrador.current?.detener();
    // Re-elige la redacción: repetir con otras palabras explica mejor que
    // repetir la misma frase más alto.
    setTextos((prev) => {
      const copia = [...prev];
      const otras = paso.textos.filter((t) => t !== prev[indice]);
      copia[indice] = otras.length ? variante(otras) : prev[indice];
      return copia;
    });
    setFase("hablando");
  };
  const atras = () => {
    if (indice === 0) return;
    narrador.current?.detener();
    sonido.vuelo();
    setIndice((i) => i - 1);
    setFase("hablando");
  };
  const saltar = () => {
    narrador.current?.detener();
    if (esUltimo) return terminar(true);
    sonido.transicion();
    avanzar();
    setFase("hablando");
  };

  /* Escape cierra; barra espaciadora pausa. */
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        terminar(true); // salir es una decisión: no se vuelve a lanzar solo
      }
      if (e.key === " ") {
        e.preventDefault();
        fase === "pausado" ? reanudar() : pausar();
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [fase, terminar]);

  /* ------------------------------ GEOMETRÍA ------------------------------ */
  const compacto = vp.w < 640;
  const anchoCapsula = compacto ? Math.min(vp.w - 2 * MARGEN, 420) : 460;

  /* El alto de la cápsula NO se estima: se mide. Depende del texto, y una
     parada de cuatro líneas es bastante más alta que una de dos — que es
     exactamente cuando la tarjeta se metía debajo de la barra. Se arranca con
     una estimación razonable para el primer fotograma y a partir de ahí manda
     el nodo real. */
  const capsula = useRef(null);
  const [altoReal, setAltoReal] = useState(compacto ? 190 : 168);

  useLayoutEffect(() => {
    const nodo = capsula.current;
    if (!nodo) return undefined;
    const medir = () => setAltoReal(nodo.getBoundingClientRect().height);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [compacto]);

  /* Franja inferior intocable: ahí vive la barra de controles. Con los ajustes
     desplegados ocupa bastante más, así que la cápsula sube en consecuencia en
     vez de quedarse debajo. */
  const altoControles = (compacto ? 78 : 86) + (ajustesAbiertos ? (compacto ? 150 : 128) : 0);
  const suelo = vp.h - altoControles;

  const pos = useMemo(
    () => colocar(rect, anchoCapsula, altoReal, vp.w, vp.h, suelo),
    [rect, anchoCapsula, altoReal, vp, suelo]
  );

  // Lum mira al elemento que está explicando.
  const mirandoA = rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: vp.w / 2, y: vp.h * 0.32 };

  const despidiendo = fase === "despidiendo";
  const tamanoLum = compacto ? 56 : 68;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label="Recorrido de bienvenida">
      {/* --- La escena se hunde; lo señalado se queda nítido --- */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: despidiendo ? 0 : 1 }}
        transition={trans(0.6)}
        onClick={(e) => e.stopPropagation()}
      >
        {rect ? (
          <motion.div
            className="absolute rounded-[var(--r-lg)]"
            animate={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
            }}
            transition={RESORTE.objeto}
            style={{
              // El "agujero" del foco: una sombra enorme que oscurece todo
              // menos este rectángulo, más un filo de luz en el borde.
              boxShadow:
                "0 0 0 9999px rgb(25 21 18 / 0.42), 0 0 0 1.5px rgb(var(--light-rgb) / 0.7), 0 0 34px 4px rgb(var(--light-rgb) / 0.28)",
            }}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: "rgb(25 21 18 / 0.42)" }} />
        )}
      </motion.div>

      {/* ------------------------- LA CÁPSULA: LUM + VOZ ------------------------- */}
      <motion.div
        className="absolute"
        style={{ width: anchoCapsula }}
        animate={{
          x: pos.x,
          y: pos.y,
          opacity: despidiendo ? 0 : 1,
          scale: despidiendo ? 0.86 : 1,
        }}
        transition={{ type: "spring", stiffness: 120, damping: 20, mass: 0.9 }}
      >
        <div ref={capsula} className="flex items-start gap-3">
          {/* --- Lum --- */}
          <motion.div
            className="relative shrink-0"
            animate={
              orbitando
                ? { x: [0, 14, 0, -14, 0], y: [0, -12, -18, -12, 0], rotate: [0, 8, 0, -8, 0] }
                : despidiendo
                  ? { y: [0, -22, 0], scale: [1, 1.14, 0.9] } // el saltito de despedida
                  : { x: 0, y: 0, rotate: 0 }
            }
            transition={
              orbitando
                ? { duration: 0.9, ease: CURVA.luz }
                : { duration: 0.7, ease: CURVA.objeto }
            }
          >
            {/* Partículas: se forma al entrar, se deshace al salir */}
            <AnimatePresence>
              {fase === "formando" && !reducido.current && <Particulas modo="entrada" />}
              {despidiendo && !reducido.current && <Particulas modo="salida" cantidad={24} />}
            </AnimatePresence>

            <Bombillo
              tamano={tamanoLum}
              animo={
                despidiendo
                  ? "despidiendo"
                  : fase === "formando"
                    ? "durmiendo"
                    : fase === "pausado"
                      ? "neutral"
                      : paso.animo
              }
              hablando={fase === "hablando"}
              mirandoA={mirandoA}
              formacion={fase === "formando" ? 0.001 : 1}
            />
          </motion.div>

          {/* --- Lo que dice --- */}
          <motion.div
            className="vidrio min-w-0 flex-1 px-4 py-3.5 sm:px-5 sm:py-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: fase === "formando" ? 0 : 1, y: fase === "formando" ? 8 : 0 }}
            transition={trans(0.4)}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <p className="annot truncate">{paso.seccion}</p>
              <p className="mono shrink-0 text-[9.5px] tabular-nums text-ink-3">
                {indice + 1} / {PASOS.length}
              </p>
            </div>

            {subtitulosVisibles ? (
              <Subtitulo texto={texto} destacar={paso.destacar} />
            ) : (
              <p className="text-[12.5px] italic leading-relaxed text-ink-3">
                Subtítulos ocultos · Lum sigue narrando
              </p>
            )}

            {/* Progreso: una línea de luz que avanza por parada */}
            <div className="mt-3 h-px w-full bg-linen">
              <motion.div
                className="h-full"
                style={{ background: "linear-gradient(90deg, var(--amber-hot, #ff7a18), var(--sun))" }}
                animate={{ width: `${((indice + 1) / PASOS.length) * 100}%` }}
                transition={trans(0.5)}
              />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* ------------------------------ CONTROLES ------------------------------ */}
      <AnimatePresence>
        {!despidiendo && fase !== "formando" && (
          <Controles
            pausado={fase === "pausado"}
            primero={indice === 0}
            ultimo={esUltimo}
            mudo={mudo}
            volumen={volumen}
            velocidad={velocidad}
            subtitulos={subtitulosVisibles}
            ajustes={ajustesAbiertos}
            onAjustes={() => setAjustesAbiertos((a) => !a)}
            onPausar={pausar}
            onReanudar={reanudar}
            onAtras={atras}
            onSaltar={saltar}
            onRepetir={repetir}
            onTerminar={() => terminar(true)}
            onMudo={() => setMudo((m) => !m)}
            onVolumen={setVolumen}
            onVelocidad={setVelocidad}
            onSubtitulos={() => setSubtitulosVisibles((v) => !v)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
