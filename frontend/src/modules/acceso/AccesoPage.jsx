import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import BotonSonido from "../../components/BotonSonido.jsx";
import Marca from "../../components/Marca.jsx";
import Boton from "../../components/ui/Boton.jsx";
import Campo from "../../components/ui/Campo.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useLight } from "../../light/LightContext.jsx";
import { emitirPulso } from "../../light/pulso.js";
import { DUR, RESORTE, trans } from "../../lib/movimiento.js";
import { ApiError } from "../../lib/api.js";
import { sonido } from "../../lib/sound.js";
import Bombillo from "./Bombillo.jsx";
import TarjetaDemo from "./TarjetaDemo.jsx";
import { medirFuerza } from "./fuerza.js";

/**
 * ACCESO
 * -----------------------------------------------------------------
 * Ni "Login" ni formulario: una hoja de vidrio flotando sobre papel, y a
 * su derecha un bombillo que responde a lo que se escribe.
 *
 * Lo que hace que esta pantalla no se sienta un formulario:
 *   · El bombillo no es un adorno al lado del campo — mueve la fuente de
 *     luz GLOBAL. Al escribir una contraseña fuerte, la sombra de la
 *     tarjeta se acorta y el papel se calienta. La pantalla entera
 *     responde a la contraseña.
 *   · Cuando todos los campos son válidos, la tarjeta emite su propio
 *     resplandor cálido: el formulario dice que está listo sin texto.
 *   · Un error no es un toast rojo: la sala parpadea.
 */

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Cuenta real (ver `sembrar_usuario_demo` en backend/api/db_init.py, mismos
// valores) para quien quiera entrar sin registrarse.
const DEMO_CORREO = "invitado@selene.app";
const DEMO_CLAVE = "SeleneInvitado26";

export default function AccesoPage() {
  const [modo, setModo] = useState("entrar"); // entrar | crear
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [escribiendo, setEscribiendo] = useState(false);
  const [claveTerminada, setClaveTerminada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const { login, register, usuario } = useAuth();
  const { iluminar } = useLight();
  const navegar = useNavigate();
  const { state } = useLocation();
  const temporizador = useRef(null);

  const fuerza = useMemo(() => medirFuerza(clave), [clave]);
  const crear = modo === "crear";

  const correoOk = RE_CORREO.test(correo);
  const nombreOk = nombre.trim().length >= 2;
  const claveOk = clave.length >= 8;
  const repetidaOk = repetida.length > 0 && repetida === clave;

  const todoListo = crear
    ? nombreOk && correoOk && claveOk && repetidaOk && fuerza.nivel >= 2
    : correoOk && clave.length > 0;

  /* Si ya hay sesión, esta pantalla no tiene nada que hacer. */
  useEffect(() => {
    if (usuario) navegar("/monitoreo", { replace: true });
  }, [usuario, navegar]);

  /* --- El bombillo gobierna la luz de la sala --- */
  useEffect(() => {
    if (fuerza.nivel < 0) {
      iluminar({ x: 0.5, y: 0.14, intensity: 0.55, kelvin: 3000 });
      return;
    }
    // Fuente a la derecha, donde está el bombillo dibujado.
    iluminar({
      x: 0.66,
      y: 0.36,
      intensity: [0.24, 0.4, 0.62, 0.82, 0.98][fuerza.nivel],
      kelvin: [1900, 2100, 2500, 3100, 4200][fuerza.nivel],
    });
  }, [fuerza.nivel, iluminar]);

  const alEscribirClave = (e) => {
    setClave(e.target.value);
    setClaveTerminada(false);
    setEscribiendo(true);
    sonido.tecla();
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      setEscribiendo(false);
      setClaveTerminada(true); // "terminar" = dejar de escribir, no pulsar enviar
    }, 700);
  };

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError("");

    try {
      if (crear) await register(nombre.trim(), correo.trim(), clave);
      else await login(correo.trim(), clave);

      sonido.luz();
      emitirPulso({ fuerza: 0.5, tipo: "exito", origen: { x: 0.5, y: 0.5 } });
      window.setTimeout(() => navegar("/monitoreo", { replace: true }), 420);
    } catch (err) {
      const mensaje =
        err instanceof ApiError
          ? err.message
          : "No se pudo conectar con el servidor de SELENE.";
      setError(mensaje);
      sonido.fallo();
      emitirPulso({ tipo: "fallo" });
      setEnviando(false);
    }
  }

  /** Rellena el formulario con la cuenta de prueba. No dispara una
   * animación propia: al escribir `clave`, el bombillo, el resplandor de la
   * tarjeta y los check de los campos ya reaccionan solos (misma cadena que
   * usa cualquier tecleo real), así que rellenar se ve y se siente igual
   * que escribir. */
  const usarDemo = () => {
    if (crear) cambiarModo("entrar");
    setCorreo(DEMO_CORREO);
    setClave(DEMO_CLAVE);
    setClaveTerminada(true);
    setEscribiendo(false);
    setError("");
    sonido.confirmar();
  };

  const cambiarModo = (nuevo) => {
    if (nuevo === modo) return;
    sonido.click(nuevo === "crear");
    setModo(nuevo);
    setError("");
    setRepetida("");
  };

  return (
    <main className="relative z-[2] flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between px-8 py-6">
        <Link to="/" onClick={() => sonido.roce()} aria-label="Volver al inicio">
          <Marca className="text-ink" />
        </Link>
        <BotonSonido />
      </header>

      <div className="flex flex-1 items-center justify-center px-6 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={trans(0.62)}
          className="relative w-full max-w-[620px]"
        >
          {/* El resplandor de "todo correcto": nace detrás de la tarjeta */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute -inset-8 rounded-[52px] blur-3xl"
            style={{
              background:
                "radial-gradient(circle at 62% 46%, rgba(255,176,32,0.5), rgba(255,122,24,0.16) 45%, transparent 70%)",
            }}
            animate={{ opacity: todoListo ? 1 : 0, scale: todoListo ? 1 : 0.92 }}
            transition={trans(DUR.bloom)}
          />

          <motion.form
            onSubmit={enviar}
            className="vidrio relative overflow-hidden px-8 py-10 sm:px-12"
            animate={{
              borderColor: todoListo ? "rgba(255,214,138,0.95)" : "rgba(255,255,255,0.7)",
            }}
            transition={trans(DUR.bloom)}
          >
            {/* Filo de luz superior */}
            <motion.span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg,transparent,rgb(var(--light-rgb)/0.95) 50%,transparent)",
              }}
              animate={{ opacity: todoListo ? 1 : 0.35 }}
              transition={trans(DUR.ui)}
            />

            <div className="flex gap-8">
              {/* ------------------------- FORMULARIO ------------------------- */}
              <div className="min-w-0 flex-1">
                <p className="annot mb-3">{crear ? "nueva cuenta" : "acceso"}</p>
                <h1 className="serif mb-1 text-[clamp(1.9rem,4vw,2.6rem)] leading-[1.05]">
                  {crear ? (
                    <>
                      Enciende tu <em className="text-ink-2">primera sala.</em>
                    </>
                  ) : (
                    <>
                      La sala te <em className="text-ink-2">estaba esperando.</em>
                    </>
                  )}
                </h1>
                {/* Si el usuario venía de pulsar el obturador, se le explica
                    por qué acabó aquí en vez de en la cámara. */}
                <p className="mb-8 text-[13px] leading-relaxed text-ink-2">
                  {state?.intencion === "monitoreo"
                    ? "El monitoreo abre tu cámara y guarda lo que mide, así que primero necesita saber quién eres."
                    : crear
                      ? "Toma veinte segundos. Después, la cámara hace el resto."
                      : "Entra y sigue midiendo dónde se está yendo la energía."}
                </p>

                <AnimatePresence initial={false}>
                  {!crear && <TarjetaDemo key="demo" onUsar={usarDemo} />}
                </AnimatePresence>

                <div className="flex flex-col gap-1">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {crear && (
                      <motion.div
                        key="nombre"
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={trans(DUR.ui)}
                      >
                        <Campo
                          etiqueta="nombre"
                          valor={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          estado={nombre ? (nombreOk ? "valido" : "invalido") : "neutro"}
                          autoComplete="name"
                          required
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Campo
                    etiqueta="correo"
                    tipo="email"
                    valor={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    estado={correo ? (correoOk ? "valido" : "invalido") : "neutro"}
                    ayuda={correo && !correoOk ? "falta el dominio del correo" : null}
                    autoComplete="email"
                    required
                  />

                  <Campo
                    etiqueta="contraseña"
                    tipo={verClave ? "text" : "password"}
                    valor={clave}
                    onChange={alEscribirClave}
                    estado={
                      !clave ? "neutro" : crear ? (fuerza.nivel >= 2 ? "valido" : "invalido") : "neutro"
                    }
                    ayuda={crear && clave ? fuerza.pistas[0] || fuerza.nota : null}
                    autoComplete={crear ? "new-password" : "current-password"}
                    required
                    sufijo={
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => {
                          setVerClave((v) => !v);
                          sonido.click(!verClave);
                        }}
                        aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-ink-3 outline-none transition-colors duration-300 hover:text-ink"
                      >
                        {verClave ? "ocultar" : "ver"}
                      </button>
                    }
                  />

                  <AnimatePresence mode="popLayout" initial={false}>
                    {crear && (
                      <motion.div
                        key="repetida"
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={trans(DUR.ui)}
                      >
                        <Campo
                          etiqueta="repite la contraseña"
                          tipo={verClave ? "text" : "password"}
                          valor={repetida}
                          onChange={(e) => setRepetida(e.target.value)}
                          estado={repetida ? (repetidaOk ? "valido" : "invalido") : "neutro"}
                          ayuda={repetida && !repetidaOk ? "las dos no coinciden" : null}
                          autoComplete="new-password"
                          required
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Error: papel que entra, no toast */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={trans(DUR.ui)}
                      className="mt-5 border-l-2 border-clay pl-3 font-mono text-[11px] leading-relaxed text-clay"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <Boton
                    tipo="submit"
                    variante="luz"
                    disabled={!todoListo || enviando}
                    className="px-7 py-3"
                  >
                    {enviando ? "encendiendo…" : crear ? "crear cuenta" : "entrar"}
                  </Boton>

                  <button
                    type="button"
                    onClick={() => cambiarModo(crear ? "entrar" : "crear")}
                    className="annot border-b border-transparent pb-0.5 outline-none transition-colors duration-300 hover:border-ink-4 hover:text-ink"
                  >
                    {crear ? "ya tengo cuenta" : "crear una cuenta"}
                  </button>
                </div>
              </div>

              {/* --------------------------- BOMBILLO --------------------------- */}
              <div className="hidden w-[112px] shrink-0 flex-col items-center justify-center sm:flex">
                <Bombillo
                  nivel={crear || clave ? fuerza.nivel : -1}
                  escribiendo={escribiendo}
                  terminado={claveTerminada}
                />

                {/* Escala de la fuerza: cinco marcas, no una barra continua */}
                <div className="mt-4 flex flex-col items-center gap-1.5">
                  {[4, 3, 2, 1, 0].map((n) => (
                    <motion.span
                      key={n}
                      className="block h-[3px] rounded-full"
                      animate={{
                        width: fuerza.nivel >= n ? 26 : 14,
                        backgroundColor:
                          fuerza.nivel >= n ? ["#d8503c", "#d8503c", "#ff7a18", "#ffb020", "#3e9b6b"][n] : "#e8e2d8",
                      }}
                      transition={RESORTE.firme}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.form>

          {/* Bombillo en pantallas estrechas: bajo la tarjeta, más pequeño */}
          <div className="mt-6 flex justify-center sm:hidden">
            <Bombillo
              nivel={crear || clave ? fuerza.nivel : -1}
              escribiendo={escribiendo}
              terminado={claveTerminada}
              tamano={64}
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={trans(DUR.entrada, 0.5)}
            className="annot mt-7 text-center"
          >
            selene · detecta, calcula y avisa · nunca acciona una luminaria
          </motion.p>
        </motion.div>
      </div>
    </main>
  );
}
