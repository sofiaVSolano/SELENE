import { AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Route, Routes } from "react-router-dom";
import IgnitionGate from "./ignition/IgnitionGate.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AssistantPage from "./pages/AssistantPage.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import LandingPage from "./pages/LandingPage.jsx";

export default function App() {
  // La ignicion es por apertura de la app, no por sesion guardada:
  // cada vez que alguien abre SELENE, tiene que encender la luz.
  const [encendida, setEncendida] = useState(false);

  return (
    <>
      <div aria-hidden={!encendida} className={encendida ? "" : "pointer-events-none select-none"}>
        <Routes>
          <Route path="/" element={<LandingPage encendida={encendida} />} />
          <Route path="/acceso" element={<AuthPage />} />
          <Route
            path="/panel"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/asistente"
            element={
              <ProtectedRoute>
                <AssistantPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>

      <AnimatePresence>
        {!encendida && <IgnitionGate onCompleto={() => setEncendida(true)} />}
      </AnimatePresence>
    </>
  );
}
