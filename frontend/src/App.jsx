import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import ShellInterno from "./app/ShellInterno.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import IgnitionGate from "./ignition/IgnitionGate.jsx";
import AccesoPage from "./modules/acceso/AccesoPage.jsx";
import AsistentePage from "./modules/asistente/AsistentePage.jsx";
import HistorialPage from "./modules/historial/HistorialPage.jsx";
import CentroMonitoreo from "./modules/monitoreo/CentroMonitoreo.jsx";
import SalasPage from "./modules/salas/SalasPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";

/**
 * Ruta de layout. Es un layout y no un envoltorio por pantalla a propósito:
 * así ShellInterno —y con él el motor de pulsos y el estado del monitoreo—
 * NO se desmonta al cambiar de módulo. Es la diferencia entre navegar dentro
 * de una aplicación y saltar entre páginas.
 */
function Interno() {
  return (
    <ProtectedRoute>
      <ShellInterno>
        <Outlet />
      </ShellInterno>
    </ProtectedRoute>
  );
}

export default function App() {
  // La ignicion es por apertura de la app, no por sesion guardada:
  // cada vez que alguien abre SELENE, tiene que encender la luz.
  const [encendida, setEncendida] = useState(false);

  return (
    <>
      <div aria-hidden={!encendida} className={encendida ? "" : "pointer-events-none select-none"}>
        <Routes>
          <Route path="/" element={<LandingPage encendida={encendida} />} />
          <Route path="/acceso" element={<AccesoPage />} />

          <Route element={<Interno />}>
            <Route path="/monitoreo" element={<CentroMonitoreo />} />
            <Route path="/salas" element={<SalasPage />} />
            <Route path="/asistente" element={<AsistentePage />} />
            <Route path="/historial" element={<HistorialPage />} />
          </Route>

          {/* Rutas del diseño anterior: se conservan como redirección para no
              romper enlaces guardados ni la memoria muscular de la sustentación. */}
          <Route path="/panel" element={<Navigate to="/monitoreo" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <AnimatePresence>
        {!encendida && <IgnitionGate onCompleto={() => setEncendida(true)} />}
      </AnimatePresence>
    </>
  );
}
