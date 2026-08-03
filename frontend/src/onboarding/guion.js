/**
 * GUION DEL RECORRIDO
 * -----------------------------------------------------------------
 * Cada parada declara qué dice Lum, dónde se posa, a qué elemento de la
 * interfaz señala y cómo queda iluminada la escena. El orquestador
 * (`Recorrido.jsx`) no sabe nada del contenido: solo ejecuta esto.
 *
 * **Variantes.** Casi cada parada trae varias redacciones y se elige una al
 * azar por ejecución. Es la forma barata y fiable de que el recorrido no
 * suene a grabación: no hace falta llamar al modelo (que tardaría, costaría
 * y podría inventarse capacidades que SELENE no tiene). El texto lo escribe
 * una persona; lo que varía es cuál toca hoy.
 *
 * **Regla de copy, no negociable:** SELENE detecta, calcula, avisa y
 * recomienda. NUNCA apaga, atenúa ni controla una luminaria. Cualquier frase
 * nueva aquí tiene que usar verbos de observación y aviso.
 *
 * `anclaje` es un selector `[data-tour="..."]`. Si el elemento no está en
 * pantalla, la parada se muestra igual, centrada: el recorrido nunca se
 * rompe porque falte un nodo.
 */

/** Elige una variante al azar. */
export function variante(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

export const PASOS = [
  /* ------------------------------ BIENVENIDA ------------------------------ */
  {
    id: "saludo",
    seccion: "Bienvenida",
    ruta: "/monitoreo",
    anclaje: null,
    animo: "contento",
    luz: { x: 0.5, y: 0.42, intensity: 0.85, kelvin: 2800 },
    textos: [
      "¡Hola! Soy Lum, el pequeño asistente de SELENE. Bienvenida. En menos de dos minutos te muestro cómo sacarle partido a la plataforma.",
      "¡Hola! Me llamo Lum y soy el asistente de SELENE. Qué gusto tenerte aquí. Dame menos de dos minutos y te enseño todo lo que puedes hacer.",
      "¡Hola! Soy Lum. Vivo dentro de SELENE y te voy a acompañar. En un par de minutos vas a saber usar cada rincón de la plataforma.",
    ],
    destacar: ["Lum", "SELENE"],
  },

  /* -------------------------------- INICIO -------------------------------- */
  {
    id: "que-es",
    seccion: "Qué es SELENE",
    ruta: "/monitoreo",
    anclaje: null,
    animo: "explicando",
    luz: { x: 0.42, y: 0.3, intensity: 0.8, kelvin: 3200 },
    textos: [
      "SELENE mira una sala por la cámara y entiende lo que ve: cuánta gente hay, cuánta luz natural entra y cuánta energía se está gastando de más. Con eso te avisa y te recomienda qué hacer.",
      "Lo que hace SELENE es sencillo de contar: observa una sala con visión artificial, calcula cuánta energía se está yendo y te avisa cuando algo no cuadra. Detecta y recomienda; la decisión siempre es tuya.",
      "SELENE es un par de ojos sobre tus espacios. Mide la ocupación y la luz que ya entra por las ventanas, estima el consumo y te dice dónde estás gastando de más.",
    ],
    destacar: ["avisa", "recomienda", "visión artificial", "detecta"],
  },
  {
    id: "no-acciona",
    seccion: "Qué es SELENE",
    ruta: "/monitoreo",
    anclaje: null,
    animo: "atento",
    luz: { x: 0.5, y: 0.26, intensity: 0.72, kelvin: 3000 },
    textos: [
      "Una cosa importante: SELENE no toca tus interruptores. No enciende ni apaga nada. Observa, calcula y te avisa. Quien decide y actúa eres tú.",
      "Y algo que conviene tener claro desde el principio: SELENE nunca acciona una luminaria. No se conecta a tus interruptores. Su trabajo es medir y avisarte; el tuyo, decidir.",
    ],
    destacar: ["no toca", "nunca acciona", "avisa", "decides"],
  },

  /* ------------------------------ MONITOREO ------------------------------ */
  {
    id: "monitoreo-visor",
    seccion: "Monitoreo inteligente",
    ruta: "/monitoreo",
    anclaje: '[data-tour="visor"]',
    animo: "explicando",
    orbitar: true,
    luz: { x: 0.36, y: 0.34, intensity: 0.9, kelvin: 3600 },
    textos: [
      "Este es el visor, el corazón de SELENE. Al iniciar el monitoreo se abre tu cámara y el análisis arranca solo: no hay que pulsar nada más.",
      "Aquí vive el visor. Un solo gesto abre la cámara y empieza a analizar en vivo, fotograma tras fotograma, sin que tengas que pedírselo cada vez.",
      "Esto es el visor. Le muestras una sala y SELENE empieza a mirarla en vivo. Todo lo que verás alrededor son anotaciones sobre esta imagen.",
    ],
    destacar: ["visor", "cámara", "en vivo"],
  },
  {
    id: "monitoreo-detecta",
    seccion: "Monitoreo inteligente",
    ruta: "/monitoreo",
    anclaje: '[data-tour="visor"]',
    animo: "explicando",
    luz: { x: 0.36, y: 0.3, intensity: 0.95, kelvin: 4200 },
    textos: [
      "Sobre la imagen, SELENE marca tres cosas: las personas que hay, las ventanas por donde entra luz natural y las luminarias encendidas. Cada caja que veas es una detección con su nivel de confianza.",
      "Mientras mira, va dibujando lo que reconoce: personas, ventanas y luminarias. Son tres detecciones distintas, y cada una lleva su confianza asociada para que sepas cuánto fiarte.",
    ],
    destacar: ["personas", "ventanas", "luminarias", "confianza"],
  },
  {
    id: "monitoreo-panel",
    seccion: "Monitoreo inteligente",
    ruta: "/monitoreo",
    anclaje: '[data-tour="panel"]',
    animo: "explicando",
    orbitar: true,
    luz: { x: 0.76, y: 0.34, intensity: 0.85, kelvin: 3400 },
    textos: [
      "En este panel se traduce todo a números: cuánta luz es natural y cuánta artificial, cuánta energía se espera gastar y cuánta podrías ahorrar. Cada cifra se mueve desde su valor anterior, así que el movimiento te cuenta qué cambió.",
      "Aquí están las cuentas. La balanza te dice si la sala se está iluminando con el sol o con el techo, y abajo verás el consumo estimado frente al optimizado. Los números arrancan en el dato anterior: lo que se mueve es la diferencia.",
      "Este es el panel de análisis. Reparte la iluminación entre natural y artificial, estima el consumo del tramo y calcula el ahorro posible, con su equivalente en CO dos evitado.",
    ],
    destacar: ["natural", "artificial", "consumo", "ahorro"],
  },
  {
    id: "monitoreo-recomendacion",
    seccion: "Monitoreo inteligente",
    ruta: "/monitoreo",
    anclaje: '[data-tour="panel"]',
    animo: "atento",
    luz: { x: 0.74, y: 0.5, intensity: 0.88, kelvin: 3000 },
    textos: [
      "Y al final del panel aparece lo más importante: la recomendación. Es la salida real del sistema, escrita en una frase que puedes accionar tú.",
      "Abajo del todo verás la recomendación. Ahí es donde SELENE resume, en una frase, qué haría con lo que acaba de medir. Es un consejo, no una orden a la instalación.",
    ],
    destacar: ["recomendación"],
  },
  {
    id: "monitoreo-linea",
    seccion: "Monitoreo inteligente",
    ruta: "/monitoreo",
    anclaje: '[data-tour="linea-tiempo"]',
    animo: "explicando",
    luz: { x: 0.4, y: 0.72, intensity: 0.8, kelvin: 3200 },
    textos: [
      "Cada análisis se guarda en esta línea de tiempo. Puedes volver a cualquier captura, y si eliges dos, SELENE te marca sola qué cambió entre ellas.",
      "Aquí abajo se va construyendo la línea de tiempo. Toca cualquier miniatura para revisarla, o compara dos y verás señalado lo que apareció y lo que dejó de estar.",
    ],
    destacar: ["línea de tiempo", "comparar"],
  },

  /* ------------------------------- HISTORIAL ------------------------------- */
  {
    id: "historial",
    seccion: "Historial",
    ruta: "/historial",
    anclaje: '[data-tour="pestanas-historial"]',
    animo: "explicando",
    orbitar: true,
    luz: { x: 0.6, y: 0.24, intensity: 0.82, kelvin: 3400 },
    textos: [
      "En el historial queda todo lo que SELENE ha hecho, repartido en tres registros: lo que ha visto, lo que ha avisado y lo que ha escrito. Nada se pierde entre sesiones.",
      "Este es el historial. Tiene tres pestañas: las capturas que ha visto, las alertas que ha emitido y los reportes que ha impreso. Puedes volver sobre cualquiera cuando quieras.",
      "Aquí se archiva cada ejecución. Capturas, alertas y reportes, cada uno en su registro, listos para consultarlos o compararlos más tarde.",
    ],
    destacar: ["visto", "avisado", "escrito"],
  },

  /* ------------------------- REPORTES Y ASISTENTE ------------------------- */
  {
    id: "asistente",
    seccion: "Reportes y asistente",
    ruta: "/asistente",
    anclaje: '[data-tour="compositor"]',
    animo: "explicando",
    orbitar: true,
    luz: { x: 0.5, y: 0.72, intensity: 0.85, kelvin: 3200 },
    textos: [
      "Aquí puedes preguntarle a la sala. El asistente conoce cada detección y cada consumo estimado, así que responde con lo que de verdad se ha medido, no con generalidades.",
      "Este es el asistente. Escríbele o háblale: sabe todo lo que SELENE ha registrado, y contesta apoyándose en esos datos y no en suposiciones.",
      "Desde aquí conversas con SELENE. Puedes preguntarle dónde se está yendo la energía o cuánto podrías ahorrar, y te responderá con sus propias mediciones.",
    ],
    destacar: ["preguntarle", "medido", "asistente"],
  },
  {
    id: "reportes",
    seccion: "Reportes y asistente",
    ruta: "/asistente",
    anclaje: '[data-tour="boton-reporte"]',
    animo: "contento",
    orbitar: true,
    luz: { x: 0.62, y: 0.68, intensity: 0.95, kelvin: 3800 },
    textos: [
      "Y este botón enciende la impresora. Pídele un reporte, elige si lo quieres general o a tu medida, y verás cómo se imprime de verdad antes de descargarlo en PDF.",
      "Con esto abres la impresora de reportes. Puedes pedir uno general, de consumo diario o mensual, o describir con tus palabras exactamente qué quieres que redacte. Sale en PDF, listo para compartir.",
    ],
    destacar: ["impresora", "reporte", "PDF"],
  },

  /* --------------------------------- CIERRE --------------------------------- */
  {
    id: "ayuda",
    seccion: "Si te pierdes",
    ruta: "/asistente",
    anclaje: '[data-tour="ayuda"]',
    animo: "atento",
    orbitar: true,
    luz: { x: 0.16, y: 0.6, intensity: 0.9, kelvin: 3000 },
    textos: [
      "Si alguna vez quieres repasar todo esto, llámame desde aquí. Este botón me trae de vuelta cuando lo necesites.",
      "¿Ves este botón? Es mi timbre. Púlsalo cuando quieras y vuelvo a hacerte el recorrido entero, las veces que haga falta.",
    ],
    destacar: ["llámame", "vuelvo"],
  },
  {
    id: "despedida",
    seccion: "Listo",
    ruta: "/monitoreo",
    anclaje: null,
    animo: "despidiendo",
    luz: { x: 0.5, y: 0.4, intensity: 1, kelvin: 3400 },
    textos: [
      "¡Listo! Ya conoces SELENE. Si necesitas ayuda, ya sabes dónde encontrarme. Ahora disfruta la experiencia.",
      "¡Y eso es todo! Ya sabes moverte por SELENE. Estaré por aquí si me necesitas. Que lo disfrutes.",
      "¡Hemos terminado! Ya conoces cada rincón. Llámame cuando quieras. Ahora te dejo con tu sala.",
    ],
    destacar: ["Listo", "disfruta"],
  },
];

/** Saludo corto para quien ya hizo el recorrido. Aparece 2 s y se va. */
export const SALUDOS_DE_VUELTA = [
  "¡Qué bueno verte de nuevo!",
  "Todo está listo para comenzar.",
  "Bienvenida de vuelta.",
  "Aquí estamos otra vez. ¿Empezamos?",
];

/** Agrupa los pasos por sección, para el indicador de progreso. */
export const SECCIONES = PASOS.reduce((acc, p) => {
  if (!acc.includes(p.seccion)) acc.push(p.seccion);
  return acc;
}, []);
