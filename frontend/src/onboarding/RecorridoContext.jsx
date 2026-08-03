import { AnimatePresence } from "framer-motion";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { desbloquearAudio } from "../lib/sound.js";
import Recorrido from "./Recorrido.jsx";
import SaludoDeVuelta from "./SaludoDeVuelta.jsx";

/**
 * ¿CUÁNDO APARECE LUM?
 * -----------------------------------------------------------------
 * Tres caminos, y solo uno es automático:
 *
 *   1. **Primer ingreso de ese correo** -> recorrido completo. La marca vive
 *      en la base de datos (`usuarios.onboarding_completado`), no en el
 *      navegador: la regla que pidió la usuaria es "un correo que nunca ha
 *      entrado a la plataforma", y con `localStorage` el mismo correo en otro
 *      equipo volvería a verlo entero.
 *   2. **Ya lo hizo** -> saludo de dos segundos en una esquina, una vez por
 *      sesión de pestaña (`sessionStorage`). Navegar entre módulos no lo
 *      repite; volver a entrar mañana, sí.
 *   3. **Lo pide** (botón de ayuda del riel) -> recorrido completo otra vez,
 *      sin tocar la base. "Ya lo vi" es un hecho que no se revierte porque
 *      alguien quiera repasar.
 *
 * Terminar y saltar marcan igual: saltar es una decisión del usuario, y
 * relanzárselo en el siguiente login sería no haberle hecho caso.
 */

const Ctx = createContext(null);

const CLAVE_SALUDO = "selene_saludo_sesion";

/** Marca el saludo como ya gastado en esta pestaña. */
function gastarSaludo() {
  try {
    sessionStorage.setItem(CLAVE_SALUDO, "1");
    return false; // no estaba gastado
  } catch {
    return false; // modo privado: se saluda igual, no es crítico
  }
}

function saludoYaGastado() {
  try {
    return Boolean(sessionStorage.getItem(CLAVE_SALUDO));
  } catch {
    return false;
  }
}

export function RecorridoProvider({ children }) {
  const { usuario } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [saludando, setSaludando] = useState(false);
  // Copia local: el backend ya no lo dirá hasta el próximo /me, y no queremos
  // que el recorrido se relance al re-renderizar.
  const [yaVisto, setYaVisto] = useState(null);

  useEffect(() => {
    if (!usuario) {
      setYaVisto(null);
      return;
    }
    if (yaVisto !== null) return; // decisión ya tomada en esta sesión
    setYaVisto(Boolean(usuario.onboarding_completado));
  }, [usuario, yaVisto]);

  /* Decide qué mostrar la primera vez que se conoce al usuario. */
  useEffect(() => {
    if (!usuario || yaVisto === null) return;

    if (!yaVisto) {
      setAbierto(true);
      return;
    }

    // Ya lo hizo: saludo breve, una vez por sesión de pestaña.
    if (saludoYaGastado()) return;
    gastarSaludo();
    setSaludando(true);
  }, [usuario, yaVisto]);

  const marcarVisto = useCallback(async () => {
    // Se gasta el saludo de esta pestaña ANTES de marcar nada: si no, acabar
    // el recorrido pone `yaVisto` a true, el efecto de arriba se dispara y
    // Lum reaparecería a los dos segundos de despedirse diciendo "¡qué bueno
    // verte de nuevo!". El saludo es para la PRÓXIMA vez que entres.
    gastarSaludo();
    setYaVisto(true);
    try {
      await api.marcarRecorridoVisto();
    } catch {
      // Si la petición falla, el recorrido no se repite en esta sesión pero
      // sí en la siguiente. Preferible a bloquear al usuario dentro del tour.
    }
  }, []);

  const lanzar = useCallback(() => {
    // El recorrido tiene voz y sonidos: si el navegador aún no ha desbloqueado
    // el audio, este clic es el gesto que lo autoriza.
    desbloquearAudio();
    gastarSaludo(); // mismo motivo que en `marcarVisto`
    setSaludando(false);
    setAbierto(true);
  }, []);

  const valor = useMemo(
    () => ({ lanzar, abierto, yaVisto: Boolean(yaVisto) }),
    [lanzar, abierto, yaVisto]
  );

  return (
    <Ctx.Provider value={valor}>
      {children}

      <AnimatePresence>
        {abierto && (
          <Recorrido
            key="recorrido"
            onCerrar={() => setAbierto(false)}
            onCompletado={() => {
              setAbierto(false);
              marcarVisto();
            }}
          />
        )}
      </AnimatePresence>

      {saludando && !abierto && (
        <SaludoDeVuelta nombre={usuario?.nombre} onFin={() => setSaludando(false)} />
      )}
    </Ctx.Provider>
  );
}

export function useRecorrido() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRecorrido debe usarse dentro de <RecorridoProvider>");
  return ctx;
}
