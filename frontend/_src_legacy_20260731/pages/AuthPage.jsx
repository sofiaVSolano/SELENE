import { useSearchParams, Link } from "react-router-dom";
import AuthCard from "../components/auth/AuthCard.jsx";
import RadarPanel from "../components/auth/RadarPanel.jsx";
import Logo from "../components/Logo.jsx";

export default function AuthPage() {
  const [params] = useSearchParams();
  const initialMode = params.get("modo") === "registro" ? "register" : "login";

  return (
    <div className="grid min-h-screen bg-void-950 lg:grid-cols-2">
      <RadarPanel />
      <div className="relative flex flex-col">
        <div className="p-6 lg:hidden">
          <Link to="/">
            <Logo />
          </Link>
        </div>
        <div className="flex flex-1 items-center">
          <AuthCard key={initialMode} initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}
