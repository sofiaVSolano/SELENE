import { createContext, useContext } from "react";
import { useMonitoreo } from "./useMonitoreo.js";

/**
 * El estado del monitoreo vive en el shell, no en la pantalla.
 *
 * Motivo concreto: si el hook viviera dentro del Centro de Monitoreo, ir al
 * asistente a preguntar algo y volver borraría la línea de tiempo entera y
 * cerraría la cámara. Aquí sobrevive a la navegación, que es lo que hace que
 * la aplicación se sienta un solo producto y no cuatro pantallas sueltas.
 */

const Ctx = createContext(null);

export function MonitoreoProvider({ children }) {
  const valor = useMonitoreo();
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useMonitoreoCompartido() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMonitoreoCompartido debe usarse dentro de <MonitoreoProvider>");
  return ctx;
}
