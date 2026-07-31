import Logo from "./Logo.jsx";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-void-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
        <Logo />
        <p className="font-mono text-xs text-haze-400">
          © {new Date().getFullYear()} SELENE — visión por computador aplicada a gestión de luminarias.
        </p>
        <div className="flex gap-6 text-xs text-haze-400">
          <span className="hover:text-haze-100 transition cursor-default">Privacidad</span>
          <span className="hover:text-haze-100 transition cursor-default">Términos</span>
          <span className="hover:text-haze-100 transition cursor-default">Contacto</span>
        </div>
      </div>
    </footer>
  );
}
