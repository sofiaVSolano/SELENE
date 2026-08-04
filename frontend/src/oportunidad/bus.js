/**
 * BUS DEL AVISO DE OPORTUNIDAD
 * -----------------------------------------------------------------
 * `useMonitoreo` detecta el derroche, pero no sabe —ni tiene por qué—
 * cómo se ve el aviso. Anuncia el hecho por aquí y la escena la monta
 * `AvisoDeOportunidad`, que vive en el shell.
 *
 * Es un Set de funciones y no un contexto de React por el mismo motivo que
 * `light/pulso.js`: el hook del monitoreo se crea DENTRO de
 * `MonitoreoProvider`, así que no puede consumir un provider que lo
 * envuelva sin invertir el árbol entero del shell.
 */

const oyentes = new Set();

/**
 * @param {object} datos
 * @param {string} datos.id id del evento que devolvió el backend
 * @param {string} datos.ts fecha_hora ISO de la alerta
 * @param {string} datos.zona nombre de la zona
 * @param {string} datos.luminaria nombre de la luminaria
 * @param {string} datos.imagen miniatura del fotograma que la disparó
 * @param {"alta"|"media"} datos.prioridad
 * @param {number} datos.segundos cuánto lleva la sala vacía
 * @param {number} datos.porcentajeArtificial 0..100 de la escena
 * @param {number} datos.luminariasVisibles cuántas detectó el modelo
 * @param {number} datos.potenciaW potencia declarada de la luminaria
 * @param {number} datos.consumoWh consumo estimado del último tramo
 * @param {number} datos.ahorroWh ahorro potencial estimado de ese tramo
 * @param {boolean} datos.aproximado true si las cifras salen de la potencia
 *   declarada y no del modelo energético (ver `useMonitoreo`).
 */
export function emitirOportunidad(datos) {
  oyentes.forEach((fn) => fn(datos));
}

export function suscribirOportunidad(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/**
 * Disparador manual, SOLO en desarrollo (`vite build` no incluye este
 * bloque). La escena real necesita una sala de verdad vacía con la luz de
 * verdad encendida durante diez segundos: eso no se puede reproducir a
 * voluntad ni desde una prueba automatizada ni delante de un jurado. Desde
 * la consola del navegador:
 *
 *     window.selene.derroche()            // cifras de ejemplo
 *     window.selene.derroche({ segundos: 240, ahorroWh: 12.5 })
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  window.selene = window.selene || {};
  window.selene.derroche = (extra = {}) =>
    emitirOportunidad({
      id: `demo-${Date.now()}`,
      ts: new Date().toISOString(),
      zona: "sala de sistemas",
      luminaria: "panel led norte",
      imagen: "",
      prioridad: "media",
      segundos: 42,
      porcentajeArtificial: 78,
      luminariasVisibles: 2,
      potenciaW: 36,
      consumoWh: 0.42,
      ahorroWh: 0.42,
      aproximado: false,
      ...extra,
    });
}
