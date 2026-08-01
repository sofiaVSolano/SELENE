const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const TOKEN_KEY = "selene_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, isForm = false, auth = true } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(detail, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function requestBlob(path) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) {
    // Igual que `request()`: el body de error trae el motivo real (por
    // ejemplo "El archivo del reporte ya no existe en disco"). Quedarse con
    // `res.statusText` ("Not Found") convierte cualquier fallo en un mensaje
    // genérico que no ayuda a diagnosticar nada.
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || detail;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(detail, res.status);
  }
  return res.blob();
}

export const api = {
  register: (payload) => request("/api/auth/register", { method: "POST", body: payload, auth: false }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload, auth: false }),
  me: () => request("/api/auth/me"),

  listLuminarias: () => request("/api/luminarias"),
  createLuminaria: (payload) => request("/api/luminarias", { method: "POST", body: payload }),

  analyzeFrame: (formData) => request("/api/deteccion/frame", { method: "POST", body: formData, isForm: true }),
  historial: (idLuminaria, limite = 20) =>
    request(`/api/deteccion/historial/${idLuminaria}?limite=${limite}`),

  // --- Modulo energetico: prediccion, simulaciones e historico -------------
  // El backend ya exponia todo esto; el frontend anterior no lo consumia.
  analizarEnergia: (payload) => request("/api/energia/analizar", { method: "POST", body: payload }),
  catalogoSimulaciones: () => request("/api/energia/simulaciones/catalogo"),
  simularEscenario: (tipo, payload) =>
    request(`/api/energia/simulaciones/${tipo}`, { method: "POST", body: payload }),
  historicoComparacion: (limite = 30) => request(`/api/energia/historico/comparacion?limite=${limite}`),
  historicoPorOcupacion: () => request("/api/energia/historico/por-ocupacion"),
  historicoPorSimulacion: () => request("/api/energia/historico/por-simulacion"),

  reportarAlerta: (payload) => request("/api/alertas/ocupacion-luz", { method: "POST", body: payload }),
  historialAlertas: (idLuminaria, limite = 10) =>
    request(`/api/alertas/${idLuminaria}?limite=${limite}`),

  preguntarAsistente: (formData) => request("/api/asistente/preguntar", { method: "POST", body: formData, isForm: true }),
  preguntarAsistenteTexto: (pregunta, conVoz = false) =>
    request("/api/asistente/preguntar-texto", { method: "POST", body: { pregunta, con_voz: conVoz } }),
  historialAsistente: (limite = 30) => request(`/api/asistente/historial?limite=${limite}`),
  generarReporteAsistente: (payload) => request("/api/asistente/reporte", { method: "POST", body: payload }),
  sugerirTiposReporte: (limiteConsultas = 20) =>
    request(`/api/asistente/reportes/sugerencias?limite_consultas=${limiteConsultas}`),
  listarReportesAsistente: (limite = 20) => request(`/api/asistente/reportes?limite=${limite}`),
  descargarReporteAsistente: (idReporte) => requestBlob(`/api/asistente/reporte/${idReporte}/descargar`),
  eliminarReporteAsistente: (idReporte) =>
    request(`/api/asistente/reporte/${idReporte}`, { method: "DELETE" }),
};

export { ApiError };
