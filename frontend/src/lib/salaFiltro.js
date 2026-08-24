/**
 * SENTINELA DE SALA
 * -----------------------------------------------------------------
 * `TODAS` es el valor del selector que significa "no filtres por sala": lo
 * comparten `SelectorSala`, `salaSeleccionada.js` y las vistas del
 * historial. El filtrado en sí ya no vive aquí — antes filtraba arrays
 * enteros de `localStorage` en el cliente (ver `historial-por-sala-selene`);
 * ahora el backend filtra por `id_zona` directamente en la consulta (`GET
 * /api/deteccion/historial`, `GET /api/alertas/historial`), así que las
 * vistas solo necesitan saber si `sala === TODAS` para decidir si mandan
 * ese parámetro o no.
 */
export const TODAS = "todas";
