import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { sonido } from "../../lib/sound.js";

/**
 * LAS SALAS Y SUS LUMINARIAS
 * -----------------------------------------------------------------
 * Un único origen de verdad para la pantalla: `GET /api/zonas` ya devuelve
 * cada sala con sus luminarias dentro, así que no hay dos listas que
 * mantener sincronizadas ni un estado local que pueda quedar desfasado.
 *
 * Después de cada escritura se vuelve a leer la lista completa en vez de
 * parchear el array en memoria. Es una petición más, pero la pantalla nunca
 * puede mostrar algo distinto de lo que hay en la base — y aquí eso importa
 * más que el ahorro: lo que se ve es lo que el monitoreo va a poder elegir.
 */
export function useSalas() {
  const [salas, setSalas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const recargar = useCallback(async () => {
    try {
      setSalas(await api.listZonas());
      setError(null);
    } catch (e) {
      setError(e.message || "No se pudieron cargar las salas.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /**
   * Envuelve toda escritura: sonido de confirmación o de fallo, recarga y
   * devuelve el mensaje de error en vez de lanzarlo. Los formularios lo
   * necesitan así porque un 409 ("esa sala ya tiene una luminaria con ese
   * nombre", "todavía tiene 2 luminarias") no es una excepción a registrar
   * en consola: es texto que el usuario tiene que leer para decidir.
   */
  const ejecutar = useCallback(
    async (accion) => {
      try {
        await accion();
        sonido.confirmar();
        await recargar();
        return null;
      } catch (e) {
        sonido.fallo();
        return e.message || "No se pudo completar la operación.";
      }
    },
    [recargar]
  );

  return {
    salas,
    cargando,
    error,
    recargar,
    crearSala: (datos) => ejecutar(() => api.createZona(datos)),
    editarSala: (id, datos) => ejecutar(() => api.updateZona(id, datos)),
    eliminarSala: (id) => ejecutar(() => api.deleteZona(id)),
    impactoBorrado: (id) => api.impactoBorradoZona(id).catch(() => null),
    crearLuminaria: (datos) => ejecutar(() => api.createLuminaria(datos)),
    editarLuminaria: (id, datos) => ejecutar(() => api.updateLuminaria(id, datos)),
    eliminarLuminaria: (id) => ejecutar(() => api.deleteLuminaria(id)),
  };
}

/** Los mismos valores que acepta `schemas.TipoEspacio`. */
export const TIPOS_ESPACIO = ["oficina", "salon", "laboratorio", "comedor", "auditorio"];
