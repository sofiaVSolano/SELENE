import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import Logo from "../Logo.jsx";

const NAV_ITEMS = [
  { to: "/panel", label: "Panel en vivo" },
  { to: "/asistente", label: "Asistente de voz" },
];

export default function Sidebar() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="flex h-full w-full flex-col justify-between border-r border-white/5 bg-void-900/60 p-5 lg:w-60">
      <div>
        <Logo />
        <nav className="mt-10 space-y-1">
          {NAV_ITEMS.map((item) => {
            const activo = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  activo ? "bg-beam-500/10 text-beam-300" : "text-haze-400 hover:bg-white/5 hover:text-haze-100"
                }`}
              >
                <DotIcon active={activo} /> {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-white/5 pt-4">
        <p className="truncate text-sm font-medium text-haze-100">{usuario?.nombre}</p>
        <p className="truncate font-mono text-[11px] text-haze-500">{usuario?.correo}</p>
        <button
          onClick={() => {
            logout();
            navigate("/");
          }}
          className="mt-3 w-full rounded-lg border border-white/10 py-2 text-xs font-medium text-haze-300 transition hover:border-beam-400/40 hover:text-white"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function DotIcon({ active }) {
  return <span className={`h-2 w-2 rounded-full ${active ? "bg-beam-400" : "bg-haze-600"}`} />;
}
