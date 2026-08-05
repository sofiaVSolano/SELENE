import { AnimatePresence, motion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";
import BotonSonido from "../components/BotonSonido.jsx";
import Marca from "../components/Marca.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import PulsoDeLuz from "../light/PulsoDeLuz.jsx";
import { RESORTE } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";
import { MonitoreoProvider } from "../modules/monitoreo/MonitoreoContext.jsx";
import { RecorridoProvider, useRecorrido } from "../onboarding/RecorridoContext.jsx";
import AvisoDeOportunidad from "../oportunidad/AvisoDeOportunidad.jsx";

/**
 * SHELL INTERNO
 * -----------------------------------------------------------------
 * Un riel estrecho y nada mas. Sin barra superior, sin migas de pan, sin
 * titulo de pagina: todo el ancho es para el modulo. La navegacion se
 * comporta como el resto del sistema — la seleccion no es un fondo de
 * color, es una luz que se desliza por detras del icono.
 *
 * En movil ese riel no cabe: 76 px de un telefono de 360 son un quinto de
 * la pantalla robado al modulo, que es justo lo que el riel existe para
 * evitar. Por debajo de `lg` gira a barra inferior — misma pieza, mismos
 * iconos, misma luz deslizante (el `layoutId` funciona igual en fila que
 * en columna), al alcance del pulgar.
 *
 * Aqui viven las dos cosas que tienen que sobrevivir a la navegacion:
 * el pulso de luz global (para que una inferencia se sienta este donde
 * este el usuario) y el estado del monitoreo (para que ir al asistente y
 * volver no borre la linea de tiempo ni cierre la camara).
 */

const RUTAS = [
  {
    a: "/monitoreo",
    nombre: "monitoreo",
    // Cámara: el mismo simbolo con el que se entra desde la landing (ver PuntoMonitoreo.jsx)
    icono: (
      <>
        <rect x="3" y="7" width="13" height="10" rx="2" />
        <path d="M16 10.6 L21 7.6 V16.4 L16 13.4 Z" />
      </>
    ),
  },
  {
    a: "/salas",
    nombre: "salas",
    // Planta: el espacio visto desde arriba, con su puerta.
    icono: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 12.5h5M15.5 19.5v-7h5" />
      </>
    ),
  },
  {
    a: "/asistente",
    nombre: "asistente",
    icono: (
      <>
        <rect x="3" y="5" width="18" height="13" rx="3" />
        <path d="M8 21h8M12 18v3M7.5 11.5h3M14 9.5v4" />
      </>
    ),
  },
  {
    a: "/historial",
    nombre: "historial",
    icono: (
      <>
        <rect x="3.5" y="4.5" width="7" height="7" rx="1.6" />
        <rect x="13.5" y="4.5" width="7" height="7" rx="1.6" />
        <rect x="3.5" y="13.5" width="7" height="6" rx="1.6" />
        <rect x="13.5" y="13.5" width="7" height="6" rx="1.6" />
      </>
    ),
  },
];

function Item({ ruta, activa }) {
  return (
    <NavLink
      to={ruta.a}
      onClick={() => sonido.pulso()}
      onMouseEnter={() => sonido.roce()}
      className="group relative flex h-12 w-12 items-center justify-center outline-none"
      aria-label={ruta.nombre}
    >
      {/* La luz de seleccion se desliza entre items, no aparece de golpe */}
      {activa && (
        <motion.span
          layoutId="luz-navegacion"
          transition={RESORTE.firme}
          className="absolute inset-0 rounded-[15px] border border-linen bg-paper shadow-raise"
        />
      )}
      {activa && (
        <motion.span
          layoutId="halo-navegacion"
          transition={RESORTE.firme}
          className="pointer-events-none absolute -inset-2 rounded-[20px] bg-[radial-gradient(circle,rgba(255,176,32,0.3)_0%,transparent_70%)]"
        />
      )}

      <svg
        viewBox="0 0 24 24"
        className={`relative z-10 h-[19px] w-[19px] transition-colors duration-300 ${
          activa ? "text-ink" : "text-ink-3 group-hover:text-ink-2"
        }`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ruta.icono}
      </svg>

      {/* Etiqueta al pasar: nunca ocupa espacio permanente. Solo desde `lg`:
          en la barra inferior saldria fuera de pantalla, y en tactil no hay
          hover que la dispare. */}
      <span className="pointer-events-none absolute left-[58px] z-30 hidden whitespace-nowrap rounded-lg border border-linen bg-paper px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-2 opacity-0 shadow-raise transition-all duration-200 -translate-x-1 group-hover:translate-x-0 group-hover:opacity-100 lg:block">
        {ruta.nombre}
      </span>
    </NavLink>
  );
}

/**
 * El timbre de Lum. Es el punto por el que se vuelve a llamar al recorrido de
 * bienvenida — lo que la usuaria pidió como "botón de ayuda". Vive junto al
 * interruptor de sonido porque son de la misma familia: no navegan a ningún
 * sitio, cambian cómo te acompaña la aplicación.
 */
function BotonAyuda() {
  const { lanzar, abierto } = useRecorrido();

  return (
    <motion.button
      whileHover={{ y: -1.5 }}
      whileTap={{ scale: 0.94 }}
      transition={RESORTE.firme}
      onClick={() => {
        sonido.pulso();
        lanzar();
      }}
      onMouseEnter={() => sonido.roce()}
      disabled={abierto}
      title="Volver a ver el recorrido"
      aria-label="Volver a ver el recorrido de bienvenida"
      data-tour="ayuda"
      data-luz
      className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-linen text-ink-3 outline-none transition-colors duration-300 hover:border-ink-4 hover:text-ink disabled:opacity-40"
    >
      {/* Un bombillo diminuto: el mismo objeto que va a aparecer al pulsarlo */}
      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M9.6 17.6h4.8M10.3 20.2h3.4" />
        <path d="M12 3.6a5.2 5.2 0 0 1 3 9.5c-.5.35-.8.85-.8 1.45v.3H9.8v-.3c0-.6-.3-1.1-.8-1.45A5.2 5.2 0 0 1 12 3.6Z" />
      </svg>
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(var(--light-rgb)/0.35)_0%,transparent_70%)] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
    </motion.button>
  );
}

function Interior({ children }) {
  const { pathname } = useLocation();
  const { usuario, logout } = useAuth();

  return (
    <>
      <PulsoDeLuz />
      {/* El aviso de derroche vive aquí por lo mismo que el pulso: la alerta
          puede saltar mientras el usuario está en el asistente o en el
          historial, y la escena tiene que encontrarlo donde esté. */}
      <AvisoDeOportunidad />

      {/* `dvh` y no `vh`: en moviles la barra de direcciones entra y sale, y
          con `100vh` la barra inferior de navegacion queda debajo del borde
          visible justo cuando el navegador esta expandido. */}
      <div className="relative z-[2] flex h-[100dvh] flex-col overflow-hidden bg-paper lg:flex-row">
        {/* La nav va primero en el DOM (orden de tabulacion), pero en movil se
            dibuja abajo: `order` la baja sin tocar el orden de lectura. */}
        <nav className="relative z-30 order-2 flex w-full shrink-0 items-center justify-between gap-2 border-t border-linen px-3 py-2 lg:order-1 lg:w-[76px] lg:flex-col lg:border-r lg:border-t-0 lg:px-0 lg:py-6">
          {/* `data-luz` marca los objetos luminosos de la interfaz. Cuando se
              detecta derroche, de cada uno de ellos empiezan a salir
              partículas hacia arriba (ver `oportunidad/Fuga.jsx`): la marca
              es un punto de luz con rayos, así que también se fuga. */}
          <NavLink to="/" aria-label="Inicio" data-luz className="shrink-0 outline-none">
            <Marca tamano={24} conTexto={false} className="text-ink" />
          </NavLink>

          <div className="flex items-center gap-1 sm:gap-2 lg:flex-col">
            {RUTAS.map((r) => (
              <Item key={r.a} ruta={r} activa={pathname.startsWith(r.a)} />
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3 lg:flex-col lg:gap-4">
            <BotonAyuda />
            {/* Sin etiqueta: en el riel y en la barra inferior el espacio se
                mide en píxeles reales, y la píldora con texto no cabe. */}
            <BotonSonido compacto />
            <button
              onClick={() => {
                sonido.click(false);
                logout();
              }}
              title={usuario?.nombre}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-linen font-mono text-[11px] uppercase text-ink-2 outline-none transition-colors duration-300 hover:border-ink-4 hover:text-ink"
            >
              {(usuario?.nombre || "?").slice(0, 1)}
            </button>
          </div>
        </nav>

        <main className="relative order-1 min-h-0 flex-1 overflow-hidden lg:order-2">
          {/* La pantalla que entra funde con la que sale: nunca hay corte */}
          <AnimatePresence mode="wait">
            <div key={pathname} className="h-full">
              {children}
            </div>
          </AnimatePresence>
        </main>
      </div>
    </>
  );
}

export default function ShellInterno({ children }) {
  return (
    <MonitoreoProvider>
      {/* El recorrido va DENTRO del shell y no en `App`: necesita el riel y
          los módulos montados para poder señalarlos, y sobrevive a la
          navegación igual que el monitoreo, porque él mismo navega entre
          secciones mientras explica. */}
      <RecorridoProvider>
        <Interior>{children}</Interior>
      </RecorridoProvider>
    </MonitoreoProvider>
  );
}
