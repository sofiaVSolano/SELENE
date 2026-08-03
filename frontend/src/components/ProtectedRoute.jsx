import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { trans } from "../lib/movimiento.js";
import { Filamento } from "./ui/Cargando.jsx";

/**
 * La verificación de sesión es el primer instante de la aplicación interna,
 * así que tampoco puede ser un spinner sobre fondo gris: es el filamento
 * calentándose. Dura lo que dure `GET /auth/me`, normalmente menos de lo que
 * tarda la animación en dar una vuelta entera.
 */
export default function ProtectedRoute({ children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={trans(0.3)}
        className="relative z-[2] flex min-h-[100svh] items-center justify-center bg-paper"
      >
        <Filamento etiqueta="reconociendo tu sesión" />
      </motion.div>
    );
  }

  if (!usuario) return <Navigate to="/acceso" replace />;
  return children;
}
