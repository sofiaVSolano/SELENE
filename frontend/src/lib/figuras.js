import { listarAlertas } from "./alertasAlmacen.js";
import { listarEjecuciones } from "./almacen.js";

/**
 * LAS FIGURAS DEL REPORTE
 * -----------------------------------------------------------------
 * Los fotogramas que se adjuntan al PDF para la sección de evidencia visual.
 *
 * Salen de localStorage y no del backend porque el backend **no guarda
 * imágenes de cámara** (ver `lib/almacen.js` y `lib/alertasAlmacen.js`: el
 * registro visual siempre ha vivido en el navegador). El PDF se compone en el
 * servidor, así que las imágenes tienen que viajar con la petición.
 *
 * Las alertas van primero a propósito: una sala vacía con la luz encendida es
 * la figura que de verdad demuestra algo. Las capturas normales rellenan
 * después, para que el reporte no se quede sin evidencia cuando todavía no ha
 * salido ninguna alerta.
 */

const MAX_ALERTAS = 2;
const MAX_CAPTURAS = 2;

/** Convierte una alerta guardada en una figura para el reporte. */
function deAlerta(a) {
  return {
    imagen: a.imagen,
    ts: a.ts,
    zona: a.zona || null,
    luminaria: a.luminaria || null,
    // Una alerta de derroche es, por definición, una sala sin nadie.
    personas: 0,
    luminarias: a.luminariasVisibles ?? null,
    ventanas: null,
    porcentaje_artificial: a.porcentajeArtificial ?? null,
    origen: "alerta",
  };
}

/** Convierte una captura de la línea de tiempo en una figura. */
function deCaptura(c) {
  return {
    imagen: c.miniatura,
    ts: c.ts,
    // La captura no guarda a qué luminaria estaba asociada: el pie de figura
    // lo resuelve solo diciendo "zona monitoreada" (ver `describir_figura`).
    zona: null,
    luminaria: null,
    personas: c.personas ?? null,
    luminarias: c.luminarias ?? null,
    ventanas: c.ventanas ?? null,
    porcentaje_artificial: c.artificial ?? null,
    origen: "captura",
  };
}

/**
 * Hasta cuatro figuras, las más recientes, con imagen de verdad.
 * Nunca lanza: si localStorage está inaccesible, el reporte simplemente sale
 * sin evidencia visual.
 */
export function figurasParaReporte() {
  try {
    const alertas = listarAlertas().filter((a) => a.imagen).slice(0, MAX_ALERTAS).map(deAlerta);
    const capturas = listarEjecuciones().filter((c) => c.miniatura).slice(0, MAX_CAPTURAS).map(deCaptura);
    return [...alertas, ...capturas];
  } catch {
    return [];
  }
}
