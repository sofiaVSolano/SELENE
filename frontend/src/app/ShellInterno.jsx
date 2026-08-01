import { AnimatePresence, motion } from "framer-motion";
import { NavLink, useLocation } from "react-router-dom";
import BotonSonido from "../components/BotonSonido.jsx";
import Marca from "../components/Marca.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import PulsoDeLuz from "../light/PulsoDeLuz.jsx";
import { RESORTE } from "../lib/movimiento.js";
import { sonido } from "../lib/sound.js";
import { MonitoreoProvider } from "../modules/monitoreo/MonitoreoContext.jsx";

/**
 * SHELL INTERNO
 * -----------------------------------------------------------------
 * Un riel estrecho y nada mas. Sin barra superior, sin migas de pan, sin
 * titulo de pagina: todo el ancho es para el modulo. La navegacion se
 * comporta como el resto del sistema — la seleccion no es un fondo de
 * color, es una luz que se desliza por detras del icono.
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

      {/* Etiqueta al pasar: nunca ocupa espacio permanente */}
      <span className="pointer-events-none absolute left-[58px] z-30 whitespace-nowrap rounded-lg border border-linen bg-paper px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-ink-2 opacity-0 shadow-raise transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 -translate-x-1">
        {ruta.nombre}
      </span>
    </NavLink>
  );
}

export default function ShellInterno({ children }) {
  const { pathname } = useLocation();
  const { usuario, logout } = useAuth();

  return (
    <MonitoreoProvider>
      <PulsoDeLuz />

      <div className="relative z-[2] flex h-screen overflow-hidden bg-paper">
        <nav className="relative z-30 flex w-[76px] shrink-0 flex-col items-center justify-between border-r border-linen py-6">
          <NavLink to="/" aria-label="Inicio" className="outline-none">
            <Marca tamano={24} conTexto={false} className="text-ink" />
          </NavLink>

          <div className="flex flex-col items-center gap-2">
            {RUTAS.map((r) => (
              <Item key={r.a} ruta={r} activa={pathname.startsWith(r.a)} />
            ))}
          </div>

          <div className="flex flex-col items-center gap-4">
            {/* El riel mide 76px: el interruptor de sonido entra a escala */}
            <div className="scale-[0.72]">
              <BotonSonido />
            </div>
            <button
              onClick={() => {
                sonido.click(false);
                logout();
              }}
              title={usuario?.nombre}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-linen font-mono text-[11px] uppercase text-ink-2 outline-none transition-colors duration-300 hover:border-ink-4 hover:text-ink"
            >
              {(usuario?.nombre || "?").slice(0, 1)}
            </button>
          </div>
        </nav>

        <main className="relative flex-1 overflow-hidden">
          {/* La pantalla que entra funde con la que sale: nunca hay corte */}
          <AnimatePresence mode="wait">
            <div key={pathname} className="h-full">
              {children}
            </div>
          </AnimatePresence>
        </main>
      </div>
    </MonitoreoProvider>
  );
}
