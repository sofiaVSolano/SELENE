const cornerBase = "absolute w-4 h-4 border-beam-400/80";

/** Marco con esquinas tipo visor de camara (bounding-box), reutilizado en el
 * hero, el panel de auth y el panel de camara del dashboard. */
export default function HudFrame({ children, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <span className={`${cornerBase} top-0 left-0 border-t-2 border-l-2 rounded-tl-sm`} />
      <span className={`${cornerBase} top-0 right-0 border-t-2 border-r-2 rounded-tr-sm`} />
      <span className={`${cornerBase} bottom-0 left-0 border-b-2 border-l-2 rounded-bl-sm`} />
      <span className={`${cornerBase} bottom-0 right-0 border-b-2 border-r-2 rounded-br-sm`} />
      {children}
    </div>
  );
}
