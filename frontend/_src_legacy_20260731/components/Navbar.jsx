import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Logo from "./Logo.jsx";

export default function Navbar() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-void-950/70 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/">
          <Logo />
        </Link>

        <div className="hidden items-center gap-8 text-sm text-haze-300 md:flex">
          <a href="#producto" className="transition hover:text-haze-100">
            Producto
          </a>
          <a href="#como-funciona" className="transition hover:text-haze-100">
            Cómo funciona
          </a>
        </div>

        {usuario ? (
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/panel")}
              className="rounded-full bg-beam-gradient px-5 py-2 text-sm font-semibold text-void-950 transition hover:brightness-110"
            >
              Ir al panel
            </button>
            <button
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="text-sm text-haze-400 transition hover:text-haze-100"
            >
              Salir
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/acceso"
              className="text-sm font-medium text-haze-300 transition hover:text-haze-100"
            >
              Ingresar
            </Link>
            <Link
              to="/acceso?modo=registro"
              className="rounded-full bg-beam-gradient px-5 py-2 text-sm font-semibold text-void-950 transition hover:brightness-110"
            >
              Empezar ahora
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
