import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Boton from "../../components/ui/Boton.jsx";
import { Papel } from "../../components/ui/Cargando.jsx";
import { escena } from "../../lib/movimiento.js";
import FormularioSala from "./FormularioSala.jsx";
import TarjetaSala from "./TarjetaSala.jsx";
import { useSalas } from "./useSalas.js";

/**
 * SALAS
 * -----------------------------------------------------------------
 * El inventario de lo que SELENE vigila. Antes no existía: las salas nacían
 * solas al crear una luminaria por la API, así que en una instalación nueva
 * no había ninguna — y sin luminaria elegida el monitoreo no puede reportar
 * alertas ni estimar consumo. Esta pantalla es la que cierra ese hueco.
 *
 * Todo se edita en el sitio, dentro de la tarjeta de cada sala. No hay
 * diálogos modales: una sala son cuatro datos y sus luminarias, no un
 * formulario que merezca tapar la pantalla.
 */
export default function SalasPage() {
  const { salas, cargando, error, ...acciones } = useSalas();
  const [creando, setCreando] = useState(false);

  return (
    <motion.div {...escena} className="flex h-full flex-col px-4 py-5 sm:px-8 sm:py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="annot mb-1">salas</p>
          <h1 className="serif text-[clamp(1.6rem,2.8vw,2.2rem)] leading-none">
            Los espacios que SELENE vigila.
          </h1>
        </div>

        {!creando && (
          <Boton variante="luz" onClick={() => setCreando(true)}>
            nueva sala
          </Boton>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {/* La `key` va en el hijo DIRECTO de AnimatePresence. Envolverlo en un
            <div> sin key deja a AnimatePresence sin poder identificarlo, y
            entonces no lo desmonta nunca: el formulario se quedaba en pantalla
            con lo ya tecleado después de crear la sala. */}
        <AnimatePresence>
          {creando && (
            <FormularioSala
              key="nueva"
              className="mb-4"
              onCancelar={() => setCreando(false)}
              onGuardar={async (datos) => {
                const fallo = await acciones.crearSala(datos);
                if (!fallo) setCreando(false);
                return fallo;
              }}
            />
          )}
        </AnimatePresence>

        {cargando && <Papel lineas={4} />}

        {error && !cargando && (
          <p className="font-mono text-[11px] leading-relaxed text-clay">{error}</p>
        )}

        {!cargando && !error && salas.length === 0 && !creando && (
          <div className="rounded-2xl border border-dashed border-linen px-5 py-8 text-center">
            <p className="serif text-[1.15rem] text-ink-2">Todavía no hay ninguna sala.</p>
            <p className="mx-auto mt-2 max-w-md font-mono text-[10.5px] leading-relaxed text-ink-4">
              Crea la primera y monitoréala: SELENE registrará sola las luminarias que vea en
              ella. No hay que escribirlas.
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {salas.map((sala, i) => (
              <TarjetaSala
                key={sala.id_zona}
                sala={sala}
                indice={i}
                acciones={acciones}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
