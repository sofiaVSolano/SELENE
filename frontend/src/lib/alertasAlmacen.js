/**
 * ALMACÉN DE ALERTAS
 * -----------------------------------------------------------------
 * El backend ya persiste la anomalía (`POST /api/alertas/ocupacion-luz`
 * crea un Evento + una Recomendacion), pero esa tabla no guarda imagen ni
 * el nombre de la sala tal como los necesita una galería. Igual que
 * `lib/almacen.js` con las ejecuciones, el frontend guarda su propio
 * registro visual en localStorage — la miniatura (168 px) y el nombre de
 * zona/luminaria en el momento exacto de la alerta — mientras el backend
 * sigue siendo la fuente de verdad para el mensaje y la prioridad.
 */

const CLAVE = "selene_alertas";
const MAX = 40;

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
      intento = intento.slice(Math.ceil(intento.length / 3));
    }
  }
  return intento;
}

/**
 * @param {object} datos
 * @param {string} datos.idEvento
 * @param {string} datos.ts fecha_hora ISO que devolvió el backend
 * @param {string} datos.imagen miniatura de la captura que disparó la alerta
 * @param {string} datos.zona nombre de la zona
 * @param {string} datos.luminaria nombre de la luminaria
 * @param {string} datos.mensaje el mensaje que ya compuso el backend
 * @param {"alta"|"media"} datos.prioridad
 * @param {number} datos.segundosSinOcupacion
 * @param {number} datos.porcentajeArtificial
 * @param {number} [datos.luminariasVisibles] cuántas detectó el modelo
 */
export function guardarAlerta(datos) {
  const lista = leerCrudo();
  const alerta = { id: datos.idEvento ?? `${Date.now()}`, ...datos };
  const siguiente = [alerta, ...lista].slice(0, MAX);
  escribir(siguiente);
  avisar(siguiente);
  return siguiente;
}

export function listarAlertas() {
  return leerCrudo();
}

export function borrarAlerta(id) {
  const siguiente = leerCrudo().filter((a) => a.id !== id);
  escribir(siguiente);
  avisar(siguiente);
  return siguiente;
}

export function vaciarAlertas() {
  localStorage.removeItem(CLAVE);
  avisar([]);
  return [];
}

const oyentes = new Set();
function avisar(lista) {
  oyentes.forEach((fn) => fn(lista));
}
export function suscribirAlertas(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
