import { api } from "./api.js";
import { TODAS } from "./salaFiltro.js";

/**
 * LAS FIGURAS DEL REPORTE
 * -----------------------------------------------------------------
 * Los fotogramas que se adjuntan al PDF para la sección de evidencia visual.
 *
 * Antes salían de `localStorage` (ver `historial-por-sala-selene`) porque el
 * backend no guardaba imágenes de cámara. Ahora sí las guarda (`GET
 * /api/deteccion/historial` y `GET /api/alertas/historial`), así que estas
 * figuras se piden al servidor — con la sala como filtro, igual que antes.
 *
 * El PDF se compone en el servidor (`assistant/reports.py`) y ese endpoint
 * sigue esperando la imagen como texto (data URL) dentro del JSON, no una
 * referencia a un archivo: por eso cada imagen se descarga aquí (autenticada,
 * ver `useImagenSegura.js`) y se convierte a base64 antes de mandarla.
 *
 * Las alertas van primero a propósito: una sala vacía con la luz encendida es
 * la figura que de verdad demuestra algo. Las capturas normales rellenan
 * después, para que el reporte no se quede sin evidencia cuando todavía no ha
 * salido ninguna alerta.
 */

const MAX_ALERTAS = 2;
const MAX_CAPTURAS = 2;

function blobADataUrl(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = reject;
    lector.readAsDataURL(blob);
  });
}

/** Descarga la imagen de `imagenUrl` (autenticada) y la vuelve data URL.
 * `null` si no hay imagen o si la descarga falla — nunca lanza, para que una
 * sola figura rota no tumbe el reporte entero. */
async function imagenComoDataUrl(rutaImagen) {
  if (!rutaImagen) return null;
  try {
    const blob = await api.imagenPorRuta(rutaImagen);
    return await blobADataUrl(blob);
  } catch {
    return null;
  }
}

/** Convierte una alerta de la API en una figura para el reporte. */
function deAlerta(a, imagen) {
  return {
    imagen,
    ts: a.fecha_hora,
    zona: a.zona || null,
    luminaria: a.luminaria || null,
    // Una alerta de derroche es, por definición, una sala sin nadie.
    personas: 0,
    // El pie de figura dice "N luminarias activas" (ver `describir_figura` en
    // `assistant/report_data.py`), así que aquí van las ENCENDIDAS y no las
    // detectadas: el modelo también dibuja las apagadas. Las alertas viejas
    // no traen el dato y caen a las visibles, que es lo que se guardó.
    luminarias: a.luminarias_encendidas ?? a.luminarias_visibles ?? null,
    ventanas: null,
    porcentaje_artificial: a.porcentaje_artificial ?? null,
    origen: "alerta",
  };
}

/** Convierte una captura de la API en una figura para el reporte. */
function deCaptura(c, imagen) {
  return {
    imagen,
    ts: c.fecha_hora,
    // La captura no guarda a qué luminaria estaba asociada: el pie de figura
    // lo resuelve solo diciendo "zona monitoreada" (ver `describir_figura`).
    zona: null,
    luminaria: null,
    personas: c.personas_detectadas ?? null,
    luminarias: c.num_luminarias_encendidas ?? c.num_luminarias ?? null,
    ventanas: c.num_ventanas ?? null,
    porcentaje_artificial: c.porcentaje_artificial ?? null,
    origen: "captura",
  };
}

/**
 * Hasta cuatro figuras, las más recientes, con imagen de verdad.
 * Nunca lanza: si el servidor no responde, el reporte simplemente sale sin
 * evidencia visual.
 *
 * `sala` restringe la evidencia a esa sala. Tiene que ir de la mano del
 * `id_zona` que se manda al backend: un reporte cuyas cifras son de una sala
 * y cuyas fotos son de otra es peor que uno sin fotos, porque parece correcto.
 */
export async function figurasParaReporte(sala = TODAS) {
  const idZona = sala !== TODAS ? sala : undefined;
  try {
    const [alertas, capturas] = await Promise.all([
      api.historialAlertasSala(idZona, { limite: MAX_ALERTAS }).catch(() => []),
      api.historialCapturas(idZona, { limite: MAX_CAPTURAS }).catch(() => []),
    ]);

    const figurasAlertas = await Promise.all(
      alertas
        .filter((a) => a.imagen_url)
        .slice(0, MAX_ALERTAS)
        .map(async (a) => deAlerta(a, await imagenComoDataUrl(a.imagen_url)))
    );
    const figurasCapturas = await Promise.all(
      capturas
        .filter((c) => c.imagen_url)
        .slice(0, MAX_CAPTURAS)
        .map(async (c) => deCaptura(c, await imagenComoDataUrl(c.imagen_url)))
    );

    // Una descarga individual pudo fallar y devolver `imagen: null`: esas no
    // sirven de evidencia, se descartan aquí y no antes (para no gastar el
    // cupo de MAX_ALERTAS/MAX_CAPTURAS en filas que iban a quedar vacías).
    return [...figurasAlertas, ...figurasCapturas].filter((f) => f.imagen);
  } catch {
    return [];
  }
}
