import { motion } from "framer-motion";
import { useState } from "react";
import Boton from "../../components/ui/Boton.jsx";
import Campo from "../../components/ui/Campo.jsx";
import { DUR, trans } from "../../lib/movimiento.js";
import Opciones from "./Opciones.jsx";
import { TIPOS_ESPACIO } from "./useSalas.js";

/**
 * Alta y edición de una sala. Es el mismo formulario para las dos cosas: si
 * recibe `sala` edita, si no crea. Separarlos duplicaría la validación y el
 * tipo de espacio, que es lo único con criterio real aquí.
 */
export default function FormularioSala({ sala = null, onGuardar, onCancelar, className = "" }) {
  const [nombre, setNombre] = useState(sala?.nombre ?? "");
  const [tipoEspacio, setTipoEspacio] = useState(sala?.tipo_espacio ?? "oficina");
  const [potencia, setPotencia] = useState(String(sala?.potencia_luminaria_w ?? 18));
  const [edificio, setEdificio] = useState(sala?.edificio ?? "");
  const [piso, setPiso] = useState(sala?.piso ?? "");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const nombreValido = nombre.trim().length >= 2;
  const w = Number(potencia);
  const potenciaValida = Number.isFinite(w) && w > 0;

  const guardar = async () => {
    if (!nombreValido || !potenciaValida || guardando) return;
    setGuardando(true);
    // Los opcionales viajan como null y no como "": la base distingue
    // "sin edificio" de "un edificio llamado cadena vacía".
    const fallo = await onGuardar({
      nombre: nombre.trim(),
      tipo_espacio: tipoEspacio,
      potencia_luminaria_w: w,
      edificio: edificio.trim() || null,
      piso: piso.trim() || null,
    });
    setGuardando(false);
    if (fallo) setError(fallo);
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={trans(DUR.ui)}
      className={`overflow-hidden ${className}`}
    >
      <div className="surface mt-3 rounded-2xl p-4">
        <p className="annot mb-3">{sala ? "editar sala" : "nueva sala"}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="nombre"
            valor={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setError(null);
            }}
            estado={nombre.length === 0 ? "neutro" : nombreValido ? "valido" : "invalido"}
            ayuda={
              nombre.length > 0 && !nombreValido ? "Al menos dos caracteres." : null
            }
          />
          {/* Los vatios no se detectan con una cámara: es el único dato del
              consumo que declara el usuario, y se declara una vez por sala en
              vez de una vez por luminaria. */}
          <Campo
            etiqueta="potencia por luminaria"
            tipo="number"
            valor={potencia}
            onChange={(e) => setPotencia(e.target.value)}
            estado={potenciaValida ? "valido" : "invalido"}
            sufijo={<span className="font-mono text-[10px] text-ink-3">W</span>}
            ayuda={
              potenciaValida
                ? "La cámara detecta cuántas hay, pero no cuánto consumen."
                : "Un número mayor que cero."
            }
            min="1"
            step="1"
          />
          <Campo etiqueta="edificio (opcional)" valor={edificio} onChange={(e) => setEdificio(e.target.value)} />
          <Campo etiqueta="piso (opcional)" valor={piso} onChange={(e) => setPiso(e.target.value)} />
        </div>

        <div className="mt-5">
          <Opciones
            etiqueta="tipo de espacio"
            valor={tipoEspacio}
            opciones={TIPOS_ESPACIO}
            onChange={setTipoEspacio}
          />
          {/* No es un adorno del formulario: el modelo energético usa el tipo
              de espacio para estimar consumo (ver configs/energy_context.yaml). */}
          <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-ink-4">
            Con esto SELENE estima el consumo esperado de la sala.
          </p>
        </div>

        {error && <p className="mt-4 font-mono text-[10px] leading-relaxed text-clay">{error}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <Boton variante="luz" onClick={guardar} disabled={!nombreValido || !potenciaValida || guardando}>
            {guardando ? "guardando" : sala ? "guardar cambios" : "crear sala"}
          </Boton>
          <Boton variante="linea" onClick={onCancelar}>
            cancelar
          </Boton>
        </div>
      </div>
    </motion.div>
  );
}
