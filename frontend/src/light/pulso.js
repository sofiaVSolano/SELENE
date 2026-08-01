/**
 * PULSO DE LUZ
 * -----------------------------------------------------------------
 * Cuando entra un dato nuevo al sistema (una inferencia termina, un
 * reporte queda listo, la IA responde), toda la interfaz tiene que
 * enterarse. No con un toast: con luz.
 *
 * Este bus es deliberadamente tonto — un Set de funciones — porque el
 * pulso debe poder emitirse desde cualquier capa (un hook de datos, una
 * página, un módulo) sin arrastrar contexto de React hasta allí.
 */

const oyentes = new Set();

/**
 * @param {object} detalle
 * @param {number} [detalle.fuerza]  0..1, cuánto sube la luz ambiente.
 * @param {"dato"|"exito"|"fallo"} [detalle.tipo]
 * @param {{x:number,y:number}} [detalle.origen] Punto 0..1 del que nace la onda.
 */
export function emitirPulso(detalle = {}) {
  const evento = { fuerza: 0.3, tipo: "dato", origen: { x: 0.5, y: 0.42 }, ...detalle };
  oyentes.forEach((fn) => fn(evento));
}

export function suscribirPulso(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
