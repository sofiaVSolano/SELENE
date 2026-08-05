/**
 * ALMACÉN DE EJECUCIONES
 * -----------------------------------------------------------------
 * El backend guarda cada detección, pero su historial no devuelve la
 * imagen (ver `GET /api/deteccion/historial/{id}`: personas y elementos
 * vuelven vacíos). Una galería sin miniatura no es una galería, así que
 * el frontend conserva su propio registro visual en localStorage.
 *
 * Tope FIFO deliberado: como mucho `MAX_EJECUCIONES` capturas. Al llegar
 * una nueva que superaría el tope, se suelta la más vieja — nunca crece
 * sin límite. Se guarda la miniatura de 168 px, no la captura completa
 * (~4 KB por ejecución), así que el tope cabe de sobra en la cuota de
 * localStorage; si aun así el navegador se queja, `escribir()` descarta
 * un tercio adicional de las más viejas y reintenta, en vez de perder el
 * registro entero.
 */

const CLAVE = "selene_ejecuciones";
export const MAX_EJECUCIONES = 60;
const MAX = MAX_EJECUCIONES;

function leerCrudo() {
  try {
    const bruto = localStorage.getItem(CLAVE);
    return bruto ? JSON.parse(bruto) : [];
  } catch {
    return [];
  }
}

function escribir(lista) {
  let intento = [...lista];
  for (let i = 0; i < 4; i += 1) {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(intento));
      return intento;
    } catch {
      intento = intento.slice(Math.ceil(intento.length / 3)); // suelta el tercio más viejo
    }
  }
  return intento;
}

/** Resumen plano de una captura: lo que la galería necesita mostrar. */
export function resumirCaptura(captura) {
  const a = captura.analisis || {};
  return {
    id: captura.id,
    ts: (captura.ts instanceof Date ? captura.ts : new Date(captura.ts)).toISOString(),
    miniatura: captura.miniatura,
    personas: a.personas_detectadas ?? 0,
    ventanas: a.num_ventanas ?? 0,
    luminarias: a.num_luminarias ?? 0,
    // Cuántas de esas luminarias están emitiendo. Es lo que decide "posible
    // derroche" (ver `esDerroche` en modules/historial/VistaCapturas.jsx).
    // Se deja `undefined` si el backend no lo mandó, para poder distinguir
    // "ninguna encendida" de "captura vieja, guardada antes de que existiera
    // este dato" — la galería trata los dos casos distinto.
    luminariasEncendidas: a.num_luminarias_encendidas,
    natural: a.porcentaje_natural ?? 0,
    artificial: a.porcentaje_artificial ?? 0,
    naturalScore: a.natural_score ?? 0,
    artificialScore: a.artificial_score ?? 0,
    consumo: a.consumo_estimado_kwh ?? null,
    ahorro: a.ahorro_estimado_kwh ?? null,
    ocupacion: a.estado_ocupacion ?? "",
    tipoIluminacion: a.tipo_iluminacion ?? "",
    recomendacion: a.recomendacion ?? "",
    confianza: a.confianza_max_persona ?? 0,
  };
}

export function guardarEjecucion(captura) {
  const lista = leerCrudo();
  const siguiente = [resumirCaptura(captura), ...lista].slice(0, MAX);
  escribir(siguiente);
  avisar(siguiente);
  return siguiente;
}

export function listarEjecuciones() {
  return leerCrudo();
}

export function borrarEjecucion(id) {
  const siguiente = leerCrudo().filter((e) => e.id !== id);
  escribir(siguiente);
  avisar(siguiente);
  return siguiente;
}

export function vaciarEjecuciones() {
  localStorage.removeItem(CLAVE);
  avisar([]);
  return [];
}

/* La galería puede estar montada mientras el monitoreo sigue capturando. */
const oyentes = new Set();
function avisar(lista) {
  oyentes.forEach((fn) => fn(lista));
}
export function suscribirEjecuciones(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
