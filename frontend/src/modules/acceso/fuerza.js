/**
 * FUERZA DE CONTRASEÑA
 * -----------------------------------------------------------------
 * Sin dependencias. Cinco niveles, y cada uno tiene un estado físico del
 * bombillo asociado — la escala se diseñó junto con el dibujo, no al
 * revés, por eso hay exactamente cinco y no siete.
 *
 * El puntaje mezcla longitud (lo que más importa de verdad) con variedad
 * de alfabetos, y descuenta patrones que un atacante prueba primero:
 * secuencias, repeticiones y palabras obvias del dominio.
 */

const OBVIAS = [
  "password", "contrasena", "contraseña", "123456", "qwerty", "admin",
  "selene", "luz", "bombillo", "iloveyou", "abc123", "usuario",
];

const SECUENCIAS = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl"];

export const NIVELES = [
  { clave: "muy-mala", etiqueta: "muy mala", color: "#d8503c", nota: "esto se rompe en segundos" },
  { clave: "debil", etiqueta: "débil", color: "#d8503c", nota: "aún alumbra muy poco" },
  { clave: "aceptable", etiqueta: "aceptable", color: "#ff7a18", nota: "empieza a iluminar" },
  { clave: "buena", etiqueta: "buena", color: "#ffb020", nota: "buena luz" },
  { clave: "excelente", etiqueta: "excelente", color: "#3e9b6b", nota: "el bombillo está feliz" },
];

function tieneSecuencia(min) {
  return SECUENCIAS.some((s) => {
    for (let i = 0; i <= s.length - 4; i += 1) {
      const trozo = s.slice(i, i + 4);
      if (min.includes(trozo) || min.includes([...trozo].reverse().join(""))) return true;
    }
    return false;
  });
}

/**
 * @returns {{nivel:number, puntos:number, ...NIVELES[number], pistas:string[]}}
 *  nivel 0..4 — el índice que consume <Bombillo/>.
 */
export function medirFuerza(valor = "") {
  const texto = String(valor);
  const min = texto.toLowerCase();

  if (!texto.length) {
    return { nivel: -1, puntos: 0, ...NIVELES[0], etiqueta: "", nota: "", pistas: [] };
  }

  const familias = [
    /[a-z]/.test(texto),
    /[A-Z]/.test(texto),
    /[0-9]/.test(texto),
    /[^A-Za-z0-9]/.test(texto),
  ];
  const variedad = familias.filter(Boolean).length;
  const unicos = new Set(texto).size;

  let puntos = 0;
  puntos += Math.min(38, texto.length * 3.1); // la longitud manda
  puntos += (variedad - 1) * 9;
  puntos += Math.min(14, unicos * 1.1);
  if (texto.length >= 12) puntos += 8;
  if (texto.length >= 16) puntos += 8;

  const pistas = [];
  if (OBVIAS.some((p) => min.includes(p))) {
    puntos -= 30;
    pistas.push("contiene una palabra que se prueba de primera");
  }
  if (/(.)\1{2,}/.test(texto)) {
    puntos -= 12;
    pistas.push("hay caracteres repetidos");
  }
  if (tieneSecuencia(min)) {
    puntos -= 14;
    pistas.push("hay una secuencia del teclado");
  }
  if (texto.length < 8) {
    puntos -= 16;
    pistas.push("menos de 8 caracteres");
  } else if (variedad < 3) {
    pistas.push("mezcla mayúsculas, números o símbolos");
  }

  puntos = Math.max(0, Math.min(100, puntos));

  // Techo duro: sin longitud mínima nunca se llega a "buena", por mucha
  // variedad que tenga. Ocho caracteres es también el mínimo del backend.
  let nivel;
  if (puntos < 22) nivel = 0;
  else if (puntos < 42) nivel = 1;
  else if (puntos < 62) nivel = 2;
  else if (puntos < 82) nivel = 3;
  else nivel = 4;
  if (texto.length < 8) nivel = Math.min(nivel, 1);

  return { nivel, puntos, ...NIVELES[nivel], pistas: pistas.slice(0, 1) };
}
