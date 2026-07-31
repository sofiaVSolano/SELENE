/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        /* --- Paleta SELENE "Papel y Luz" --- */
        paper: {
          DEFAULT: "#fdfcfa",
          2: "#f7f4ef",
          3: "#f1ece4",
        },
        linen: "#e8e2d8",
        wood: {
          DEFAULT: "#d6bf9e",
          2: "#c2a883",
          3: "#a68c66",
        },
        ink: {
          DEFAULT: "#191512",
          2: "#6b6257",
          3: "#9c948a",
          4: "#c3bcb2",
        },
        amber: {
          DEFAULT: "#ffb020",
          soft: "#ffd98a",
          hot: "#ff7a18",
        },
        leaf: "#3e9b6b",
        clay: "#d8503c",

        /* --- Legado: pantallas aun sin rediseñar (se retira al terminar) --- */
        void: { 950: "#08080a", 900: "#0c0c0e", 800: "#141416", 700: "#1c1c1f", 600: "#28282c", 500: "#3a3a40" },
        haze: { 400: "#6f6f78", 300: "#9a9aa2", 200: "#c4c4cb", 100: "#e8e8ec" },
        beam: { 600: "#e85d00", 500: "#ff7a00", 400: "#ff9a2e", 300: "#ffb84d" },
        glow: { 500: "#ffb800", 400: "#ffd000", 300: "#ffe066" },
      },
      fontFamily: {
        display: ["'Instrument Serif'", "ui-serif", "Georgia", "serif"],
        sans: ["'Geist Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'Geist Mono Variable'", "ui-monospace", "monospace"],
        crt: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        light: "cubic-bezier(0.22, 1, 0.36, 1)",
        object: "cubic-bezier(0.34, 1.36, 0.64, 1)",
      },
      boxShadow: {
        raise: "var(--shadow-raise)",
        float: "var(--shadow-float)",
        press: "var(--shadow-press)",
      },
      animation: {
        respirar: "respirar 4.2s ease-in-out infinite",
        deriva: "deriva 9s ease-in-out infinite",
        "titilar-suave": "titilar-suave 5s ease-in-out infinite",
      },
      keyframes: {
        respirar: {
          "0%, 100%": { opacity: 0.55, transform: "scale(1)" },
          "50%": { opacity: 1, transform: "scale(1.015)" },
        },
        deriva: {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(6px,-8px,0)" },
        },
        "titilar-suave": {
          "0%, 92%, 100%": { opacity: 1 },
          "94%": { opacity: 0.72 },
          "96%": { opacity: 0.95 },
        },
      },
    },
  },
  plugins: [],
};
