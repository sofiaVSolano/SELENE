import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Boton from "../../components/ui/Boton.jsx";
import { RESORTE, trans } from "../../lib/movimiento.js";
import { sonido } from "../../lib/sound.js";

/**
 * AUTORIZACIÓN DE GRABACIÓN
 * -----------------------------------------------------------------
 * La puerta que se cruza antes de que la cámara se abra. Monitorear una
 * sala es grabar a quien esté dentro, así que el gesto de "iniciar
 * monitoreo" ya no enciende nada por sí solo: primero avisa, y sólo
 * arranca si quien opera declara dos cosas —que las personas presentes
 * lo saben y lo autorizaron, y que acepta los términos—.
 *
 * Las dos casillas son deliberadamente distintas y ninguna viene marcada:
 * una es un hecho sobre la sala (¿avisaste?), la otra es un acto jurídico
 * (¿aceptas?). Fundirlas en una sola convertiría el consentimiento de las
 * personas grabadas en letra pequeña de un contrato.
 *
 * Lo que dice el texto tiene que ser verdad: cada captura viaja al
 * servidor de SELENE y se guarda con su imagen en el historial de la sala
 * (`POST /api/deteccion/frame`, ver `useMonitoreo.js`), y SELENE no
 * acciona nada — mira y avisa.
 */

function Casilla({ marcada, onCambiar, autoFoco = false, children }) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-[var(--r-md)] border border-linen bg-paper/70 p-3.5 transition-colors duration-300 hover:border-ink-4">
      <input
        type="checkbox"
        checked={marcada}
        autoFocus={autoFoco}
        onChange={(e) => {
          sonido.click(e.target.checked);
          onCambiar(e.target.checked);
        }}
        className="peer sr-only"
      />
      {/* La casilla dibujada: cuando se marca se enciende con el ámbar de la
          luz global y levanta su sombra, como cualquier otra superficie viva
          del sistema. La caja de verdad sigue siendo el <input> de arriba. */}
      <span
        aria-hidden
        className="relative mt-px flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-amber/70 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper"
        style={{
          borderColor: marcada ? "var(--amber)" : "var(--ink-4)",
          background: marcada
            ? "linear-gradient(100deg, var(--sun) 0%, var(--amber) 100%)"
            : "var(--paper)",
          boxShadow: marcada ? "var(--shadow-raise)" : "none",
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M5 12.5 L10 17.5 L19 7"
            initial={false}
            animate={{ pathLength: marcada ? 1 : 0, opacity: marcada ? 1 : 0 }}
            transition={trans(0.34)}
          />
        </svg>
      </span>
      <span className="text-[12px] leading-relaxed text-ink-2 transition-colors duration-300 group-hover:text-ink">
        {children}
      </span>
    </label>
  );
}

export default function AutorizacionGrabacion({ sala, onCancelar, onAutorizar }) {
  const [avisadas, setAvisadas] = useState(false);
  const [terminos, setTerminos] = useState(false);
  const [leyendo, setLeyendo] = useState(false);

  const autorizado = avisadas && terminos;

  /* Escape equivale a cancelar: si no se autoriza, no se monitorea. */
  useEffect(() => {
    const alTeclear = (e) => e.key === "Escape" && onCancelar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCancelar]);

  const aceptar = () => {
    /* El botón ya viene deshabilitado, pero el gesto que enciende una cámara
       no puede depender sólo de un atributo del DOM. */
    if (!autorizado) return;
    sonido.confirmar();
    onAutorizar();
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={trans(0.3)}
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-paper/80 px-4 py-4 backdrop-blur-md sm:px-6 sm:py-6"
      onClick={(e) => e.target === e.currentTarget && onCancelar()}
    >
      {/* El aviso, los términos desplegados y las dos casillas no caben en la
          altura de un teléfono: el diálogo se limita al viewport y desplaza
          por dentro, igual que la impresora de reportes.
          NO es una columna flex, a propósito: en un contenedor flex con
          altura tope los hijos se ENCOGEN antes que desbordar, así que al
          desplegar los términos el texto de arriba se aplastaba y el par de
          botones se salía de la caja recortada en vez de quedar detrás del
          scroll. Como bloque normal, `overflow-y-auto` hace lo que dice. */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-autorizacion"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={RESORTE.objeto}
        className="vidrio relative max-h-[92dvh] w-full max-w-[520px] overflow-y-auto px-5 py-6 sm:px-8 sm:py-7"
      >
        {/* ------------------------------ EL AVISO ------------------------------ */}
        <div className="mb-4 flex items-start gap-3">
          {/* El punto de grabación, latiendo. */}
          <motion.span
            aria-hidden
            className="mt-2 block h-2.5 w-2.5 shrink-0 rounded-full bg-clay"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.45, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="min-w-0">
            <p className="annot mb-1">autorización de grabación</p>
            <h2
              id="titulo-autorizacion"
              className="serif text-[1.5rem] leading-tight text-ink sm:text-[1.7rem]"
            >
              Esta sesión <em>será grabada</em>.
            </h2>
          </div>
        </div>

        <p className="mb-4 text-[12.5px] leading-relaxed text-ink-2">
          Al iniciar el monitoreo
          {sala ? (
            <>
              {" "}
              de <span className="text-ink">{sala}</span>
            </>
          ) : null}
          , SELENE abre la cámara de este equipo y toma capturas de forma continua mientras el
          monitoreo esté activo. Cada captura se analiza para detectar{" "}
          <span className="text-ink">personas</span> y{" "}
          <span className="text-ink">luminarias encendidas</span>.
        </p>

        {/* Los tres hechos, sin adornos: qué se guarda, dónde, y qué NO hace.
            Sin sala elegida el backend no persiste la captura, así que la
            frase sobre el historial dejaría de ser cierta y se cambia. */}
        <ul className="mb-5 flex flex-col gap-2 border-l border-linen pl-4">
          {[
            sala
              ? "Las imágenes se envían al servidor de SELENE y quedan guardadas en el historial de esta sala, con su fecha y su hora."
              : "Sin una sala elegida las capturas no se guardan: se analizan y se pierden al cerrar la sesión.",
            "Puedes revisarlas y borrarlas cuando quieras desde Historial.",
            "SELENE no controla las luces ni ningún otro equipo: sólo observa y avisa.",
          ].map((linea) => (
            <li key={linea} className="text-[11.5px] leading-relaxed text-ink-3">
              {linea}
            </li>
          ))}
        </ul>

        {/* --------------------------- LAS DOS CASILLAS --------------------------- */}
        <div className="flex flex-col gap-2.5">
          <Casilla marcada={avisadas} onCambiar={setAvisadas} autoFoco>
            Confirmo que <span className="text-ink">todas las personas presentes</span> en la sala
            son conscientes de que esta sesión será grabada y han autorizado la grabación.
          </Casilla>

          <Casilla marcada={terminos} onCambiar={setTerminos}>
            He leído y acepto los{" "}
            <button
              type="button"
              onClick={(e) => {
                /* Este botón vive dentro del <label>: sin frenar el evento,
                   abrir los términos marcaría la casilla que dice haberlos
                   leído. */
                e.preventDefault();
                e.stopPropagation();
                sonido.papel();
                setLeyendo((v) => !v);
              }}
              className="underline decoration-ink-4 underline-offset-2 outline-none transition-colors duration-300 hover:text-ink hover:decoration-amber"
            >
              términos y condiciones
            </button>{" "}
            de uso de SELENE.
          </Casilla>
        </div>

        <AnimatePresence initial={false}>
          {leyendo && (
            <motion.div
              key="terminos"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={trans(0.32)}
              className="overflow-hidden"
            >
              {/* Sin scroll propio: el que desplaza es el diálogo. Dos
                  superficies desplazables anidadas en un teléfono de 360px
                  son una trampa, y aquí el texto que hay que poder leer
                  entero es justo el de dentro. */}
              <div className="mt-2.5 rounded-[var(--r-md)] border border-linen bg-paper-2/60 p-4">
                <p className="annot mb-2">términos y condiciones</p>
                <ol className="flex list-decimal flex-col gap-2 pl-4 text-[11px] leading-relaxed text-ink-2 marker:text-ink-4">
                  <li>
                    Quien inicia el monitoreo declara estar autorizado para grabar el espacio y
                    responde por haber informado a las personas que se encuentren en él.
                  </li>
                  <li>
                    Las capturas se usan únicamente para detectar ocupación y luminarias encendidas,
                    estimar consumo y generar las alertas y los reportes de la sala monitoreada.
                  </li>
                  <li>
                    Las imágenes quedan asociadas a la cuenta que las tomó y a la sala elegida.
                    Puedes consultarlas y eliminarlas en cualquier momento desde Historial; al
                    borrar una sala se borra también todo su historial.
                  </li>
                  <li>
                    SELENE no identifica a las personas detectadas: cuenta cuántas hay y en qué
                    parte del encuadre están. No hace reconocimiento facial ni graba audio.
                  </li>
                  <li>
                    SELENE es un sistema de detección y aviso: no acciona interruptores ni controla
                    equipos. Cualquier acción sobre las luces la decide y la ejecuta una persona.
                  </li>
                  <li>
                    El monitoreo se detiene en cualquier momento con «detener monitoreo», lo que
                    apaga la cámara y cierra la grabación.
                  </li>
                </ol>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Por qué el botón está apagado. Se dice desde el principio en vez de
            esperar a que alguien lo pulse: el botón deshabilitado no recibe
            el clic, así que un reproche reactivo no llegaría nunca. */}
        <AnimatePresence initial={false}>
          {!autorizado && (
            <motion.p
              key="falta"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={trans(0.3)}
              className="annot overflow-hidden pt-4 text-ink-3"
            >
              sin autorización, el monitoreo no puede iniciarse
            </motion.p>
          )}
        </AnimatePresence>

        {/* ------------------------------ EL GESTO ------------------------------ */}
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
          <Boton variante="linea" onClick={onCancelar}>
            cancelar
          </Boton>
          <Boton
            variante="luz"
            onClick={aceptar}
            disabled={!autorizado}
            icono={
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <rect x="3" y="7" width="13" height="10" rx="2" />
                <path d="M16 10.6 L21 7.6 V16.4 L16 13.4 Z" />
              </svg>
            }
          >
            autorizar e iniciar
          </Boton>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
