import { useCallback, useEffect, useRef, useState } from "react";
import { emitirPulso } from "../../light/pulso.js";
import { guardarAlerta } from "../../lib/alertasAlmacen.js";
import { guardarEjecucion } from "../../lib/almacen.js";
import { api } from "../../lib/api.js";
import { sonido } from "../../lib/sound.js";
import { emitirOportunidad } from "../../oportunidad/bus.js";

const ANCHO_INFERENCIA = 960; // se reescala antes de enviar: los modelos son pesados
// 480 y no 168: la misma miniatura se usa tanto para la tarjeta de la
// galería como para el lightbox que la agranda al hacer clic. A 168 px se
// veía nítida en la tarjeta pero pixelada al ampliarla. El costo es unos
// 15-20 KB por captura en vez de 4 KB; con el tope de `MAX_EJECUCIONES` en
// `lib/almacen.js` sigue cabiendo de sobra en la cuota de localStorage.
const ANCHO_MINIATURA = 480;
const MAX_CAPTURAS = 40; // techo de memoria: cada captura guarda dos dataURL

/* Criterio de "derroche": sala vacía con luz artificial dominante. El umbral
   de segundos es el mismo que ya documenta `routers/alertas.py`; el de
   porcentaje artificial es el mismo que usa el historial para marcar
   "posible derroche" (ver `modules/historial/VistaCapturas.jsx`) — un mismo
   criterio en toda la app, no dos reglas distintas que puedan divergir. */
const UMBRAL_SEGUNDOS_VACIA = 10;
const UMBRAL_ARTIFICIAL_PCT = 55;
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
  const [luminarias, setLuminarias] = useState([]);
  const [idLuminaria, setIdLuminaria] = useState("");

  const videoRef = useRef(null);
  const lienzo = useRef(null);
  const streamRef = useRef(null);
  const enVuelo = useRef(false);
  const vacanteDesde = useRef(null); // Date del primer frame vacío de la racha actual
  const ultimaAlertaEn = useRef(0); // epoch ms de la última alerta disparada

  /* La luminaria es opcional: sin ella el backend responde igual, solo que
     sin consumo (no puede saber que lampara esta midiendo). */
  useEffect(() => {
    api
      .listLuminarias()
      .then((lista) => {
        setLuminarias(lista);
        if (lista.length) setIdLuminaria(lista[0].id_luminaria);
      })
      .catch(() => setLuminarias([]));
  }, []);

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
      if (!idLuminaria) return;
      try {
        const r = await api.reportarAlerta({
          id_luminaria: idLuminaria,
          segundos_sin_ocupacion: Math.min(86400, Math.round(segundosVacia)),
          porcentaje_artificial: captura.analisis.porcentaje_artificial ?? 0,
        });

        const luminaria = luminarias.find((l) => l.id_luminaria === idLuminaria);
        const a = captura.analisis;
        const segundos = Math.round(segundosVacia);

        guardarAlerta({
          idEvento: String(r.id_evento),
          ts: r.fecha_hora,
          imagen: captura.miniatura,
          zona: luminaria?.zona?.nombre || "sin zona",
          luminaria: luminaria?.nombre || "",
          mensaje: r.mensaje,
          prioridad: r.prioridad,
          segundosSinOcupacion: segundos,
          porcentajeArtificial: a.porcentaje_artificial ?? 0,
          // Se guarda para que el pie de figura del reporte pueda decir
          // cuántas luminarias había encendidas (ver `lib/figuras.js`).
          luminariasVisibles: a.num_luminarias ?? 0,
        });

        /* Las cifras de la tarjeta salen del módulo energético, las mismas
           que muestra el panel lateral — dos números distintos para el mismo
           hecho en dos sitios de la app serían un error de producto, no un
           detalle. Si el módulo no pudo estimar (devuelve null cuando falla
           el paso de LightGBM), se cae a la potencia declarada de la
           luminaria por el tiempo que la sala lleva vacía: peor estimación,
           pero auditable, y la tarjeta lo dice. */
        const potenciaW = Number(luminaria?.potencia_w) || 0;
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
          zona: luminaria?.zona?.nombre || "sin zona",
          luminaria: luminaria?.nombre || "",
          imagen: captura.miniatura,
          prioridad: r.prioridad,
          segundos,
          porcentajeArtificial: a.porcentaje_artificial ?? 0,
          luminariasVisibles: a.num_luminarias ?? 0,
          potenciaW,
          consumoWh,
          ahorroWh,
          aproximado,
        });
      } catch {
        /* una alerta perdida no debe romper el monitoreo en curso */
      }
    },
    [idLuminaria, luminarias]
  );

  /**
   * Se evalúa con cada inferencia. Cuenta cuánto lleva la sala vacía —desde
   * el primer frame sin personas de la racha actual, no desde que se abrió
   * la cámara— y dispara la alerta al cruzar el umbral, sin repetirla antes
   * de `REPETICION_ALERTA_MS` mientras la sala se mantenga vacía.
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

      const artificialAlto = (a.porcentaje_artificial ?? 0) > UMBRAL_ARTIFICIAL_PCT;
      if (!artificialAlto) return;

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
      if (idLuminaria) form.append("id_luminaria", idLuminaria);

      const analisis = await api.analyzeFrame(form);

      const captura = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ts: new Date(analisis.fecha_hora || Date.now()),
        imagen: marco.canvas.toDataURL("image/jpeg", 0.78),
        miniatura: miniaturaDe(marco.canvas),
        ancho: marco.w,
        alto: marco.h,
        analisis,
      };

      setCapturas((prev) => [...prev, captura].slice(-MAX_CAPTURAS));
      setActiva(null); // volver a "en vivo" al llegar dato nuevo

      /* Fin de inferencia: la app entera se entera. El pulso nace en el
         visor (izquierda de la pantalla), no en el centro, porque de ahí
         viene literalmente el dato. */
      sonido.inferencia(analisis.confianza_max_persona || analisis.natural_score || 0.7);
      emitirPulso({ fuerza: 0.3, tipo: "dato", origen: { x: 0.36, y: 0.44 } });
      guardarEjecucion(captura);
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
  }, [idLuminaria, miniaturaDe, pintarFotograma, evaluarDerroche]);

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
   * borrar una foto en el historial (`lib/almacen.js`, un almacén aparte en
   * localStorage) también la quite de aquí — comparten el mismo id porque
   * `guardarEjecucion` se llama con la misma captura que termina en este
   * array, así que un solo id basta para mantener ambos sincronizados. Si la
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
    luminarias,
    idLuminaria,
    setIdLuminaria,
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
