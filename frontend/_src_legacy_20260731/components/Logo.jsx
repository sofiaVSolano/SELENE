export default function Logo({ className = "", withLabel = true }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width="30" height="30" viewBox="0 0 32 32" className="shrink-0">
        <defs>
          <linearGradient id="selene-g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ff7a00" />
            <stop offset="1" stopColor="#ffd000" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="15" className="fill-void-800" stroke="rgba(255,154,46,0.35)" />
        <path d="M20 6a11 11 0 1 0 0 20 9 9 0 0 1 0-20z" fill="url(#selene-g)" />
      </svg>
      {withLabel && (
        <span className="font-display text-lg font-semibold tracking-tight text-haze-100">
          SELENE
        </span>
      )}
    </div>
  );
}
