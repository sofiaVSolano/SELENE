import { useEffect, useState } from "react";
import { api } from "./api.js";

/**
 * IMAGEN AUTENTICADA
 * -----------------------------------------------------------------
 * Las imágenes del historial ya no viajan como data URL en el propio
 * objeto (antes salían de `localStorage`, ver `historial-por-sala-selene`):
 * ahora son un archivo en el servidor detrás de `GET /api/deteccion/
 * {id}/imagen`, que exige el mismo Bearer token que el resto de la API.
 * Un `<img src="...">` plano no puede mandar esa cabecera, así que este hook
 * pide el blob a mano (`api.imagenPorRuta`) y expone un object URL local.
 *
 * `ruta` es el campo `imagen_url` que ya trae cada fila del historial
 * (relativo, p. ej. "/api/deteccion/42/imagen") — `null`/`undefined` cuando
 * esa captura no tiene imagen guardada, y el hook simplemente no pide nada.
 */
export function useImagenSegura(ruta) {
  const [url, setUrl] = useState(null);
  const [cargando, setCargando] = useState(Boolean(ruta));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ruta) {
      setUrl(null);
      setCargando(false);
      setError(false);
      return undefined;
    }

    let vivo = true;
    let objectUrl = null;
    setCargando(true);
    setError(false);

    api
      .imagenPorRuta(ruta)
      .then((blob) => {
        if (!vivo) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (vivo) setError(true);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ruta]);

  return { url, cargando, error };
}
