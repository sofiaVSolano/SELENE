import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, tokenStore } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setCargando(false);
      return;
    }
    api
      .me()
      .then(setUsuario)
      .catch(() => tokenStore.clear())
      .finally(() => setCargando(false));
  }, []);

  const login = useCallback(async (correo, contrasena) => {
    const data = await api.login({ correo, contrasena });
    tokenStore.set(data.access_token);
    setUsuario(data.usuario);
    return data.usuario;
  }, []);

  const register = useCallback(async (nombre, correo, contrasena) => {
    const data = await api.register({ nombre, correo, contrasena });
    tokenStore.set(data.access_token);
    setUsuario(data.usuario);
    return data.usuario;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
