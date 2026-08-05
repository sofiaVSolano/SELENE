import { useEffect, useState } from "react";
import { TODAS } from "./salaFiltro.js";

/**
 * LA SALA QUE SE ESTÁ MIRANDO
 * -----------------------------------------------------------------
 * Una sola elección compartida por toda la app, no una por pantalla. El
 * historial se mira por sala y el reporte se imprime desde el asistente: si
 * cada uno guardara su propia selección, se podría estar viendo el historial
 * de una sala y llevarse un PDF de otra sin que nada lo delatara. Un reporte
 * equivocado no se ve equivocado.
 *
 * Se persiste en localStorage por comodidad —volver al historial y reencontrar
 * la sala que se estaba mirando— y porque el asistente puede abrirse en otra
 * pestaña del navegador.
 */

const CLAVE = "selene_sala_seleccionada";
const oyentes = new Set();

let actual = (() => {
  try {
    return localStorage.getItem(CLAVE) || TODAS;
  } catch {
    return TODAS; // modo privado
  }
})();

export function obtenerSala() {
  return actual;
}

export function elegirSala(idZona) {
  actual = idZona || TODAS;
  try {
    localStorage.setItem(CLAVE, actual);
  } catch {
    /* modo privado: la elección vive solo en memoria */
  }
  oyentes.forEach((fn) => fn(actual));
}

/** La sala elegida, reactiva. Devuelve `[sala, elegir]` como `useState`. */
export function useSalaSeleccionada() {
  const [sala, setSala] = useState(actual);
  useEffect(() => {
    oyentes.add(setSala);
    setSala(actual); // por si cambió entre el render y el efecto
    return () => oyentes.delete(setSala);
  }, []);
  return [sala, elegirSala];
}
