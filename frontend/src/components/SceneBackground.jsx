import { useEffect, useRef } from "react";

/**
 * Fondo compartido de las paginas publicas: grilla tecnica + halo que sigue
 * el cursor (via CSS custom properties, sin re-render por frame) + linea de
 * escaneo vertical. Es lo que le da a SELENE su identidad "HUD de vision
 * por computador" en vez de un fondo generico.
 */
export default function SceneBackground({ children, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      el.style.setProperty("--my", `${e.clientY - rect.top}px`);
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, []);

  return (
    <div ref={ref} className={`relative overflow-hidden bg-void-950 ${className}`}>
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(420px circle at var(--mx, 50%) var(--my, 20%), rgba(255,122,0,0.10), transparent 70%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-beam-500/40 to-transparent" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
