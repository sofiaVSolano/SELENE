import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // 0.0.0.0: accesible desde fuera del contenedor Docker
    watch: {
      usePolling: true, // los bind mounts de Docker Desktop en Windows no emiten inotify
    },
  },
});
