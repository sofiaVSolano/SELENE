/**
 * FILTRO POR SALA
 * -----------------------------------------------------------------
 * El historial y los reportes se miran "de una sala": elegir una debe dejar
 * ver TODO lo de esa sala y nada de las demás. Capturas y alertas viven en
 * dos almacenes distintos de localStorage pero se filtran con el mismo
 * criterio, y por eso vive aquí y no duplicado en cada vista.
 *
 * Se filtra por `idZona` y no por el nombre: la pantalla de salas deja
 * renombrarlas, y un filtro por nombre desconectaría el historial de una sala
 * en cuanto alguien le corrigiera una tilde.
 */

/** Valor del selector que significa "no filtres". */
export const TODAS = "todas";

/**
 * Registros anteriores a que se guardara la sala en cada captura. No se les
 * puede atribuir una: aparecen en "todas las salas" —donde son ciertos— y no
 * en ninguna sala concreta, que sería inventarles una procedencia.
 */
export function esHuerfano(registro) {
  return !registro.idZona;
}

export function filtrarPorSala(registros, idZona) {
  if (!idZona || idZona === TODAS) return registros;
  return registros.filter((r) => r.idZona === idZona);
}

/** Cuántos registros quedarían fuera de cualquier sala concreta. */
export function contarHuerfanos(registros) {
  return registros.filter(esHuerfano).length;
}
