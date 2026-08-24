import { useCallback, useEffect, useRef, useState } from "react";
import { emitirPulso } from "../../light/pulso.js";
import { api } from "../../lib/api.js";
import { sonido } from "../../lib/sound.js";
import { emitirOportunidad } from "../../oportunidad/bus.js";

const ANCHO_INFERENCIA = 960; // se reescala antes de enviar: los modelos son pesados
// 480 y no 168: la misma miniatura se usa tanto para la tarjeta de la
// galería en vivo (línea de tiempo del Centro de Monitoreo, que vive solo en
// memoria de esta sesión) como para el lightbox que la agranda al hacer
// clic. A 168 px se veía nítida en la tarjeta pero pixelada al ampliarla.
// El historial DURABLE (pestaña Historial) ya no usa esta miniatura: pide su
// propia imagen guardada en el servidor (ver `lib/useImagenSegura.js`).
const ANCHO_MINIATURA = 480;
const MAX_CAPTURAS = 40; // techo de memoria: cada captura guarda dos dataURL

/* Criterio de "derroche": sala vacía con al menos una luminaria encendida. El
   umbral de segundos es el mismo que ya documenta `routers/alertas.py`; el de
   luminarias encendidas es el mismo que usa el historial para marcar "posible
   derroche" (ver `esDerroche` en `modules/historial/VistaCapturas.jsx`) — un
   mismo criterio en toda la app, no dos reglas distintas que puedan divergir. */
const UMBRAL_SEGUNDOS_VACIA = 10;
const REPETICION_ALERTA_MS = 3 * 60 * 1000; // no fastidiar: un recordatorio cada 3 min como mucho

/**
 * MOTOR DEL CENTRO DE MONITOREO
 * -----------------------------------------------------------------
 * SELENE solo mira lo que la cámara ve en vivo: no hay modo "subir archivo".
 * Un único gesto —`iniciarMonitoreo`— abre la cámara y arranca el análisis
 * continuo a la vez; no son dos pasos.
 *
 * Toda inferencia produce una CAPTURA: imagen + miniatura + analisis +
 * marca de tiempo. La linea de tiempo, el comparador y el historial no son
 * tres funciones distintas: los tres leen la misma lista de capturas, que se
 * llena sola mientras el monitoreo corre. Por eso hacer clic en una
 * miniatura reconstruye la pantalla completa sin volver a llamar al backend.
 */
export function useMonitoreo() {
  const [fuente, setFuente] = useState({ tipo: null });
  const [capturas, setCapturas] = useState([]);
  const [activa, setActiva] = useState(null); // id de captura; null = ultima
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState(null);
  const [auto, setAuto] = useState(false);
  const [intervalo, setIntervalo] = useState(5000);
  const [salas, setSalas] = useState([]);
  const [idZona, setIdZona] = useState("");

  const videoRef = useRef(null);
  const lienzo = useRef(null);
  const streamRef = useRef(null);
  const enVuelo = useRef(false);
  const vacanteDesde = useRef(null); // Date del primer frame vacío de la racha actual
  const ultimaAlertaEn = useRef(0); // epoch ms de la última alerta disparada

  /* Se monitorea una SALA, no una luminaria: las luminarias las detecta y
     registra SELENE sola en cuanto la cámara las ve (ver
     `backend/api/luminarias_auto.py`), así que aquí no hay nada que elegir
     salvo el espacio.

     `recargarSalas` es una función y no solo un efecto de montaje porque el
     shell interno NO se desmonta al navegar: sin esto, crear una sala en
     `/salas` y volver al monitoreo dejaba el selector con la lista vieja, sin
     la sala recién creada. */
  const recargarSalas = useCallback(async () => {
    try {
      const lista = await api.listZonas();
      setSalas(lista);
      setIdZona((actual) => {
        if (actual && lista.some((s) => s.id_zona === actual)) return actual;
        return lista.length ? lista[0].id_zona : "";
      });
    } catch {
      setSalas([]);
    }
  }, []);

  useEffect(() => {
    recargarSalas();
  }, [recargarSalas]);

  const detenerCamara = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  /**
   * Un solo gesto: abre la cámara Y arranca el análisis continuo. No hay
   * paso intermedio de "ahora dale a analizar" — pedirle eso al usuario es
   * pedirle que opere un instrumento, y SELENE tiene que sentirse como que
   * simplemente empieza a mirar.
   */
  const iniciarMonitoreo = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      detenerCamara();
      streamRef.current = stream;
      setFuente({ tipo: "camara" });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      vacanteDesde.current = null;
      ultimaAlertaEn.current = 0;
      setAuto(true);
    } catch {
      setError("No se pudo abrir la cámara. Revisa los permisos del navegador.");
    }
  }, [detenerCamara]);

  /** Apaga la cámara y vuelve a la pantalla de inicio del monitoreo. */
  const detenerMonitoreo = useCallback(() => {
    setAuto(false);
    detenerCamara();
    setFuente({ tipo: null });
    vacanteDesde.current = null;
  }, [detenerCamara]);

  /**
   * Vuelve a colgar el stream de la cámara del <video>.
   * Hace falta porque el estado del monitoreo vive en el shell y sobrevive a
   * la navegación, pero el elemento <video> se destruye al salir de la
   * pantalla: al volver hay un nodo nuevo, vacío, con el stream aún abierto.
   */
  const reengancharCamara = useCallback(() => {
    if (!streamRef.current || !videoRef.current || videoRef.current.srcObject) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, []);

  /** Vuelca el fotograma actual de la cámara a un canvas. */
  const pintarFotograma = useCallback(() => {
    const origen = videoRef.current;
    if (!origen) return null;

    const anchoNatural = origen.videoWidth || origen.naturalWidth;
    const altoNatural = origen.videoHeight || origen.naturalHeight;
    if (!anchoNatural || !altoNatural) return null;

    if (!lienzo.current) lienzo.current = document.createElement("canvas");
    const escala = Math.min(1, ANCHO_INFERENCIA / anchoNatural);
    const w = Math.round(anchoNatural * escala);
    const h = Math.round(altoNatural * escala);
    lienzo.current.width = w;
    lienzo.current.height = h;
    lienzo.current.getContext("2d").drawImage(origen, 0, 0, w, h);
    return { canvas: lienzo.current, w, h, anchoNatural, altoNatural };
  }, []);

  const miniaturaDe = useCallback((canvas) => {
    const mini = document.createElement("canvas");
    const escala = ANCHO_MINIATURA / canvas.width;
    mini.width = ANCHO_MINIATURA;
    mini.height = Math.round(canvas.height * escala);
    mini.getContext("2d").drawImage(canvas, 0, 0, mini.width, mini.height);
    return mini.toDataURL("image/jpeg", 0.6);
  }, []);

  /**
   * Reporta la anomalía al backend (que arma el mensaje y la persiste como
   * Evento + Recomendacion), la guarda en la galería local de alertas con su
   * imagen, y anuncia el hecho para que la interfaz monte la escena del
   * aviso (`oportunidad/AvisoDeOportunidad.jsx`). Si no hay luminaria
   * elegida no hay a quién reportarle ni qué zona anunciar, así que no se
   * dispara nada — igual que con el consumo estimado.
   *
   * Aquí NO se decide nada visual ni sonoro: este hook mide, y quien avisa
   * es la escena. Antes se disparaba el sonido y una voz del navegador desde
   * estas mismas líneas, y esa mezcla de responsabilidades era la razón por
   * la que la alerta no podía ser más que un pitido.
   */
  const dispararAlerta = useCallback(
    async (captura, segundosVacia) => {
      if (!idZona) return;
      try {
        const r = await api.reportarAlerta({
          id_zona: idZona,
          segundos_sin_ocupacion: Math.min(86400, Math.round(segundosVacia)),
          porcentaje_artificial: captura.analisis.porcentaje_artificial ?? 0,
          luminarias_encendidas: Math.max(1, captura.analisis.num_luminarias_encendidas ?? 1),
          // El backend ancla la alerta a esta detección: así reutiliza SU
          // imagen ya guardada (`Recomendacion.id_deteccion_origen`) en vez
          // de que el navegador suba una copia aparte. Ver `routers/alertas.py`.
          id_deteccion: captura.analisis.id_deteccion ?? null,
        });

        const sala = salas.find((s) => s.id_zona === idZona);
        const a = captura.analisis;
        const segundos = Math.round(segundosVacia);

        // Ya no se guarda en `localStorage` (ese módulo, `alertasAlmacen.js`,
        // se retiró): el registro durable de esta alerta lo hizo el backend
        // en `POST /api/alertas/ocupacion-luz`, y `VistaAlertas` lo lee de
        // `GET /api/alertas/historial`. Aquí solo queda emitir la escena en
        // vivo (`AvisoDeOportunidad`), que es memoria de sesión.

        /* Las cifras de la tarjeta salen del módulo energético, las mismas
           que muestra el panel lateral — dos números distintos para el mismo
           hecho en dos sitios de la app serían un error de producto, no un
           detalle. Si el módulo no pudo estimar (devuelve null cuando falla
           el paso de LightGBM), se cae a la potencia declarada de la SALA
           por las luminarias que se ven encendidas y el tiempo que lleva
           vacía: peor estimación, pero auditable, y la tarjeta lo dice.
           Los vatios los declara la sala porque una cámara no los ve. */
        const potenciaW =
          (Number(sala?.potencia_luminaria_w) || 0) * Math.max(1, a.num_luminarias_encendidas ?? 1);
        const aproximado = a.consumo_estimado_kwh === null || a.consumo_estimado_kwh === undefined;
        const consumoWh = aproximado
          ? potenciaW * (segundos / 3600)
          : a.consumo_estimado_kwh * 1000;
        const ahorroWh =
          a.ahorro_estimado_kwh === null || a.ahorro_estimado_kwh === undefined
            ? // Sala vacía: no hay nada que iluminar, así que todo lo que se
              // está gastando es ahorrable.
              consumoWh
            : a.ahorro_estimado_kwh * 1000;

        emitirOportunidad({
          id: String(r.id_evento),
          ts: r.fecha_hora,
          zona: sala?.nombre || "sin sala",
          luminaria: "",
          imagen: captura.miniatura,
          prioridad: r.prioridad,
          segundos,
          porcentajeArtificial: a.porcentaje_artificial ?? 0,
          luminariasVisibles: a.num_luminarias ?? 0,
          luminariasEncendidas: a.num_luminarias_encendidas ?? 0,
          potenciaW,
          consumoWh,
          ahorroWh,
          aproximado,
        });
      } catch {
        /* una alerta perdida no debe romper el monitoreo en curso */
      }
    },
    [idZona, salas]
  );

  /**
   * Se evalúa con cada inferencia. Cuenta cuánto lleva la sala vacía —desde
   * el primer frame sin personas de la racha actual, no desde que se abrió
   * la cámara— y dispara la alerta al cruzar el umbral, sin repetirla antes
   * de `REPETICION_ALERTA_MS` mientras la sala se mantenga vacía.
   *
   * Lo que hace saltar la alerta es que haya una luminaria ENCENDIDA, no que
   * la luz artificial domine la escena. Son cosas distintas y confundirlas
   * era el motivo de que de día no avisara nunca: `porcentaje_artificial`
   * reparte 100 puntos entre natural y artificial, así que basta con que
   * entre sol por una ventana para que caiga por debajo de cualquier umbral
   * con la lámpara igual de encendida.
   */
  const evaluarDerroche = useCallback(
    (captura) => {
      const a = captura.analisis;
      const vacia = (a.personas_detectadas ?? 0) === 0;

      if (!vacia) {
        vacanteDesde.current = null;
        return;
      }
      if (!vacanteDesde.current) vacanteDesde.current = captura.ts;

      if ((a.num_luminarias_encendidas ?? 0) < 1) return;

      const segundos = (captura.ts.getTime() - vacanteDesde.current.getTime()) / 1000;
      if (segundos < UMBRAL_SEGUNDOS_VACIA) return;

      const ahora = Date.now();
      if (ahora - ultimaAlertaEn.current < REPETICION_ALERTA_MS) return;
      ultimaAlertaEn.current = ahora;

      dispararAlerta(captura, segundos);
    },
    [dispararAlerta]
  );

  /** Una inferencia completa. Es la unica funcion que habla con el backend. */
  const capturar = useCallback(async () => {
    if (enVuelo.current) return null;
    const marco = pintarFotograma();
    if (!marco) return null;

    enVuelo.current = true;
    setAnalizando(true);
    setError(null);

    try {
      const blob = await new Promise((res) => marco.canvas.toBlob(res, "image/jpeg", 0.82));
      const form = new FormData();
      form.append("imagen", blob, "frame.jpg");
      /* Se manda la SALA: el backend registra solo las luminarias que la
         cámara vaya viendo en ella (ver `api/luminarias_auto.py`). */
      if (idZona) form.append("id_zona", idZona);

      const analisis = await api.analyzeFrame(form);

      /* La sala se sella EN la captura, con la que estaba elegida al tomarla.
         Si se dedujera después, cambiar de sala reescribiría la procedencia
         de todo el historial ya tomado. */
      const salaActiva = salas.find((s) => s.id_zona === idZona);
      const captura = {
        // El id de la detección en el servidor, cuando lo hay (ancló a una
        // sala/luminaria): es el mismo que usa el historial durable, así
        // que borrar una foto ahí (`VistaCapturas`) la borra también de
        // aquí sin depender de que coincidan dos ids generados aparte. Sin
        // sala elegida el backend no persiste nada y no hay id que reusar;
        // se genera uno solo para esta sesión.
        id: analisis.id_deteccion ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date(analisis.fecha_hora || Date.now()),
        imagen: marco.canvas.toDataURL("image/jpeg", 0.78),
        miniatura: miniaturaDe(marco.canvas),
        ancho: marco.w,
        alto: marco.h,
        idZona: idZona || undefined,
        zona: salaActiva?.nombre,
        analisis,
      };

      setCapturas((prev) => [...prev, captura].slice(-MAX_CAPTURAS));
      setActiva(null); // volver a "en vivo" al llegar dato nuevo

      /* Fin de inferencia: la app entera se entera. El pulso nace en el
         visor (izquierda de la pantalla), no en el centro, porque de ahí
         viene literalmente el dato. */
      sonido.inferencia(analisis.confianza_max_persona || analisis.natural_score || 0.7);
      emitirPulso({ fuerza: 0.3, tipo: "dato", origen: { x: 0.36, y: 0.44 } });
      // Ya no se escribe en `localStorage` (ese módulo, `almacen.js`, se
      // retiró): `POST /api/deteccion/frame` ya persistió esta captura
      // completa (imagen incluida) del lado del servidor.
      evaluarDerroche(captura);
      return captura;
    } catch (e) {
      setError(e.message || "No se pudo analizar el fotograma.");
      sonido.fallo();
      emitirPulso({ tipo: "fallo" });
      return null;
    } finally {
      enVuelo.current = false;
      setAnalizando(false);
    }
  }, [idZona, salas, miniaturaDe, pintarFotograma, evaluarDerroche]);

  /* Modo automatico / reproduccion: mismo mecanismo. Se re-lanza tras cada
     respuesta en vez de con un intervalo fijo, para no encolar peticiones
     cuando el modelo tarda mas que el periodo elegido.                   */
  useEffect(() => {
    if (!auto || !fuente.tipo) return undefined;
    let vivo = true;
    let temporizador;

    const ciclo = async () => {
      if (!vivo) return;
      await capturar();
      if (!vivo) return;
      temporizador = window.setTimeout(ciclo, intervalo);
    };
    temporizador = window.setTimeout(ciclo, 400);

    return () => {
      vivo = false;
      window.clearTimeout(temporizador);
    };
  }, [auto, capturar, fuente.tipo, intervalo]);

  useEffect(() => () => detenerCamara(), [detenerCamara]);

  /**
   * Borra una captura de la línea de tiempo en vivo por id. Existe para que
   * borrar una foto en el historial durable (`VistaCapturas`, que ahora vive
   * en el servidor) también la quite de aquí — comparten el mismo id porque
   * `captura.id` se toma directamente de `analisis.id_deteccion` cuando lo
   * hay, así que un solo id basta para mantener ambos sincronizados. Si la
   * captura activa era esa, se vuelve a seguir la más reciente.
   */
  const eliminarCaptura = useCallback((id) => {
    setCapturas((prev) => prev.filter((c) => c.id !== id));
    setActiva((prev) => (prev === id ? null : prev));
  }, []);

  const capturaActiva = activa
    ? capturas.find((c) => c.id === activa) || null
    : capturas[capturas.length - 1] || null;
  const indiceActivo = capturaActiva ? capturas.findIndex((c) => c.id === capturaActiva.id) : -1;
  const anterior = indiceActivo > 0 ? capturas[indiceActivo - 1] : null;

  return {
    fuente,
    capturas,
    capturaActiva,
    anterior,
    activa,
    setActiva,
    analizando,
    error,
    auto,
    setAuto,
    intervalo,
    setIntervalo,
    salas,
    idZona,
    setIdZona,
    // La lista se recarga al volver al monitoreo: crear una sala en /salas
    // tiene que verse aquí sin recargar la página.
    recargarSalas,
    videoRef,
    iniciarMonitoreo,
    detenerMonitoreo,
    reengancharCamara,
    eliminarCaptura,
    limpiar: () => {
      setCapturas([]);
      setActiva(null);
    },
  };
}
