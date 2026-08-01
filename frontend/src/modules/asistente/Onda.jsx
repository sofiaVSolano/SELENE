import { useEffect, useRef } from "react";

/**
 * LA ONDA
 * -----------------------------------------------------------------
 * Barras simétricas alrededor del eje, dibujadas en canvas y alimentadas
 * por un AnalyserNode real. No es una animación que "parece" audio: es el
 * espectro del micrófono o de la voz de SELENE.
 *
 * Tres estados, tres comportamientos, y la diferencia entre ellos es lo
 * que hace que se entienda de un vistazo quién tiene el turno:
 *
 *   escuchando -> barras finas y nerviosas en tinta. Responden al
 *                 micrófono con muy poco suavizado: reacción inmediata.
 *   pensando   -> sin audio que analizar, así que la onda respira sola en
 *                 una senoide lenta y muy baja. No es "cargando": es
 *                 alguien callado pensando.
 *   hablando   -> barras más anchas, más redondeadas y en ámbar, con
 *                 suavizado alto. La misma onda, con otro cuerpo.
 *
 * El dibujo se escala por devicePixelRatio, si no en pantallas retina las
 * barras se ven borrosas y todo el efecto se cae.
 */

const BARRAS = 56;

const PALETA = {
  escuchando: { color: "#191512", ancho: 2.5, radio: 1.2, suavizado: 0.55, ganancia: 1 },
  pensando: { color: "#c3bcb2", ancho: 2.5, radio: 1.2, suavizado: 0.85, ganancia: 0.24 },
  hablando: { color: "#ffb020", ancho: 4, radio: 2, suavizado: 0.82, ganancia: 0.92 },
};

export default function Onda({ analyser = null, estado = "pensando", alto = 62 }) {
  const canvas = useRef(null);
  const raf = useRef(0);
  const niveles = useRef(new Array(BARRAS).fill(0));

  useEffect(() => {
    const nodo = canvas.current;
    if (!nodo) return undefined;
    const ctx = nodo.getContext("2d");
    const datos = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let t = 0;

    const redimensionar = () => {
      const dpr = window.devicePixelRatio || 1;
      const caja = nodo.getBoundingClientRect();
      nodo.width = Math.max(1, Math.round(caja.width * dpr));
      nodo.height = Math.max(1, Math.round(caja.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    redimensionar();
    window.addEventListener("resize", redimensionar);

    const pintar = () => {
      const estilo = PALETA[estado] || PALETA.pensando;
      const ancho = nodo.width / (window.devicePixelRatio || 1);
      const altura = nodo.height / (window.devicePixelRatio || 1);
      const centro = altura / 2;
      const paso = ancho / BARRAS;

      ctx.clearRect(0, 0, ancho, altura);
      ctx.fillStyle = estilo.color;
      t += 0.045;

      if (analyser && datos) analyser.getByteFrequencyData(datos);

      for (let i = 0; i < BARRAS; i += 1) {
        let objetivo;

        if (analyser && datos) {
          // Se toma el tercio bajo del espectro (donde vive la voz) y se
          // reparte en espejo desde el centro hacia los extremos.
          const desdeCentro = Math.abs(i - BARRAS / 2) / (BARRAS / 2);
          const bin = Math.floor((1 - desdeCentro) * (datos.length * 0.34));
          objetivo = (datos[bin] / 255) * estilo.ganancia;
          objetivo *= 1 - desdeCentro * 0.55; // las puntas siempre más bajas
        } else {
          objetivo =
            (Math.sin(t + i * 0.32) * 0.5 + 0.5) *
            (Math.sin(t * 0.6 + i * 0.11) * 0.35 + 0.65) *
            estilo.ganancia;
        }

        // Suavizado exponencial: sin esto la onda tiembla y parece un error.
        niveles.current[i] += (objetivo - niveles.current[i]) * (1 - estilo.suavizado);

        const alto = Math.max(estilo.ancho, niveles.current[i] * (centro * 1.75));
        const x = i * paso + (paso - estilo.ancho) / 2;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, centro - alto / 2, estilo.ancho, alto, estilo.radio);
        else ctx.rect(x, centro - alto / 2, estilo.ancho, alto); // navegadores sin roundRect
        ctx.fill();
      }

      raf.current = requestAnimationFrame(pintar);
    };

    raf.current = requestAnimationFrame(pintar);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", redimensionar);
    };
  }, [analyser, estado]);

  return <canvas ref={canvas} style={{ height: alto }} className="block w-full" aria-hidden />;
}
