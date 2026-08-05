import { motion } from "framer-motion";
import Boton from "../components/ui/Boton.jsx";
import Contador from "../components/ui/Contador.jsx";
import { Renglon } from "../components/ui/Modulo.jsx";
import { RESORTE, trans } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";

/**
 * LA TARJETA DE OPORTUNIDAD
 * -----------------------------------------------------------------
 * Lo que queda cuando la escena termina. Deliberadamente NO es un modal:
 * no hay velo detrás, no atrapa el foco y no bloquea nada — el usuario
 * puede seguir monitoreando con ella en pantalla. Se queda hasta que él
 * decida, porque una oportunidad de ahorro no caduca a los cinco segundos
 * como un toast.
 *
 * El encuadre que la disparó va dentro. Es la diferencia entre "confía en
 * mí" y "mira": es la prueba de lo que la cámara vio, y es la misma
 * miniatura que después aparece en el historial de alertas.
 */

/** "18 s" / "2 min 12 s": en segundos sueltos por debajo del minuto. */
function duracion(segundos) {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s < 60) return { valor: s, unidad: "s" };
  return { valor: Math.floor(s / 60), unidad: s % 60 ? `min ${s % 60} s` : "min" };
}

/** Wh mientras la cifra sea legible; kWh cuando deja de serlo. */
function energia(wh) {
  const v = Math.max(0, wh || 0);
  if (v >= 1000) return { valor: v / 1000, unidad: "kWh", decimales: 2 };
  return { valor: v, unidad: "Wh", decimales: v < 10 ? 2 : 1 };
}

export default function TarjetaOportunidad({ datos, onEntendido, onDescartar, dejarSitioALum = false }) {
  const vacia = duracion(datos.segundos);
  const consumo = energia(datos.consumoWh);
  const ahorro = energia(datos.ahorroWh);
  const hora = new Date(datos.ts);

  return (
    <motion.section
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97, transition: trans(0.34) }}
      transition={RESORTE.objeto}
      /* El alto tiene techo y el contenido desplaza por dentro. En un
         teléfono apaisado (360 px de alto) la tarjeta entera no cabe, y sin
         este límite se salía por arriba de la pantalla — recortada, con el
         título cortado. Cuando Lum está encima hablando se le reserva su
         sitio, porque él va primero en la misma columna. */
      style={{ maxHeight: dejarSitioALum ? "calc(100dvh - 14rem)" : "calc(100dvh - 8rem)" }}
      className="vidrio pointer-events-auto relative flex w-full flex-col overflow-hidden"
    >
      {/* Filo de luz: la misma señal que usan los módulos del panel para
          decir "esto acaba de pasar". Aquí no se apaga. */}
      <motion.span
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--amber) 22%, var(--ember) 50%, var(--amber) 78%, transparent)",
        }}
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <motion.span
              className="block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--amber)" }}
              animate={{ opacity: [1, 0.35, 1], scale: [1, 1.35, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <p className="annot">oportunidad de ahorro</p>
          </div>

          {/* Descartar sin más: no toda alerta merece una respuesta. */}
          <button
            onClick={() => {
              sonido.papel();
              onDescartar();
            }}
            onMouseEnter={() => sonido.roce()}
            aria-label="Descartar el aviso"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-4 outline-none transition-colors duration-300 hover:text-ink-2"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <h2 className="serif text-[1.32rem] leading-[1.08] text-ink sm:text-[1.45rem]">
          Oportunidad de optimización detectada
        </h2>

        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
          {datos.zona || "sala"}
          {datos.luminaria && <span className="text-ink-3"> · {datos.luminaria}</span>}
          <span className="text-ink-3">
            {" · "}
            {hora.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </p>

        {/* La prueba: el fotograma exacto, con el velo ámbar del sistema. Se
            retira en pantallas muy bajas (teléfono apaisado): ahí el espacio
            se lo quedan las cifras, que son lo que hay que decidir. */}
        {datos.imagen && (
          <div className="relative mt-3 h-16 overflow-hidden rounded-[var(--r-md)] border border-linen bg-paper-3 [@media(max-height:560px)]:hidden sm:h-20">
            <img src={datos.imagen} alt="" className="h-full w-full object-cover" />
            <span
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(0deg, rgb(255 176 32 / 0.28) 0%, rgb(255 176 32 / 0.06) 60%, transparent 100%)",
              }}
            />
          </div>
        )}

        <div className="mt-3">
          <Renglon etiqueta="sala sin ocupación">
            <Contador valor={vacia.valor} decimales={0} duracion={0.5} sufijo={` ${vacia.unidad}`} />
          </Renglon>

          <Renglon etiqueta="luminarias encendidas">
            {/* Las ENCENDIDAS, no las detectadas: el modelo dibuja también las
                apagadas, y en un techo de tres lámparas con una prendida el
                renglón decía "3" bajo una etiqueta que promete otra cosa. */}
            {datos.luminariasEncendidas > 0 ? (
              <>
                <Contador valor={datos.luminariasEncendidas} decimales={0} duracion={0.5} />
                <span className="ml-1.5 text-[11px] text-ink-3">
                  {datos.luminariasVisibles > datos.luminariasEncendidas
                    ? `de ${datos.luminariasVisibles} en el encuadre`
                    : "en el encuadre"}
                </span>
              </>
            ) : (
              /* Alertas guardadas antes de que el backend contara luminarias
                 encendidas: entonces el dato que disparaba el aviso era el
                 porcentaje artificial de la escena, así que es lo que se
                 muestra para que la tarjeta vieja siga cuadrando con su
                 propio motivo. Las alertas nuevas no caen por aquí. */
              <>
                <Contador
                  valor={datos.porcentajeArtificial ?? 0}
                  decimales={0}
                  duracion={0.5}
                  sufijo=" %"
                />
                <span className="ml-1.5 text-[11px] text-ink-3">de luz artificial</span>
              </>
            )}
          </Renglon>

          <Renglon etiqueta="consumo estimado actual">
            <Contador
              valor={consumo.valor}
              decimales={consumo.decimales}
              duracion={0.6}
              sufijo={` ${consumo.unidad}`}
            />
          </Renglon>

          <Renglon etiqueta="ahorro potencial estimado" acento>
            <span style={{ color: "var(--leaf)" }}>
              <Contador
                valor={ahorro.valor}
                decimales={ahorro.decimales}
                duracion={0.7}
                sufijo={` ${ahorro.unidad}`}
              />
            </span>
          </Renglon>
        </div>

        <p className="mt-2 font-mono text-[9px] leading-relaxed text-ink-4">
          {datos.aproximado
            ? `estimado con la potencia declarada de la luminaria (${Math.round(datos.potenciaW || 0)} w) por el tiempo sin ocupación`
            : `tramo desde la captura anterior · luminaria de ${Math.round(datos.potenciaW || 0)} w`}
        </p>
      </div>

      {/* El botón vive FUERA del área que desplaza: la decisión tiene que
          estar siempre a la vista, incluso si las cifras quedaron arriba. */}
      <div className="relative shrink-0 px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {/* El papel se desvanece justo encima del botón. Cuando la tarjeta
            desplaza (pantallas bajas), es lo que impide que una fila quede
            cortada por la mitad detrás de la acción. */}
        <span className="pointer-events-none absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-paper/80 to-transparent" />
        <Boton variante="luz" onClick={onEntendido} className="w-full">
          entendido, actuaremos pronto
        </Boton>
      </div>
    </motion.section>
  );
}
