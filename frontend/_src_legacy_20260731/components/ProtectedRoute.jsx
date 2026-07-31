import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-void-950 font-mono text-xs text-haze-400">
        Verificando sesión…
      </div>
    );
  }

  if (!usuario) return <Navigate to="/acceso" replace />;
  return children;
}
