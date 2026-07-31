import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api.js";
import { pedirPermisoNotificaciones } from "../lib/alerts.js";
import AlertBanner from "../components/dashboard/AlertBanner.jsx";
import CameraPanel from "../components/dashboard/CameraPanel.jsx";
import Sidebar from "../components/dashboard/Sidebar.jsx";
import StatsSidebar from "../components/dashboard/StatsSidebar.jsx";
import SceneBackground from "../components/SceneBackground.jsx";

const MAX_LOG = 8;
const MAX_ALERTAS = 10;
const ALERTA_TOAST_MS = 9000;

export default function DashboardPage() {
  const [luminarias, setLuminarias] = useState([]);
  const [luminariaId, setLuminariaId] = useState("");
  const [loadingLuminarias, setLoadingLuminarias] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [log, setLog] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [alertas, setAlertas] = useState([]);
  const [alertaActiva, setAlertaActiva] = useState(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    refreshLuminarias();
    pedirPermisoNotificaciones();
  }, []);

  useEffect(() => {
    if (!luminariaId) return;
    api
      .historialAlertas(luminariaId, MAX_ALERTAS)
      .then(setAlertas)
      .catch(() => setAlertas([]));
  }, [luminariaId]);

  async function refreshLuminarias() {
    setLoadingLuminarias(true);
    try {
      const data = await api.listLuminarias();
      setLuminarias(data);
      if (data.length > 0) setLuminariaId((prev) => prev || data[0].id_luminaria);
      else setCreateOpen(true);
    } catch {
      /* el usuario ya esta autenticado si llego al panel; error silencioso aqui es aceptable */
    } finally {
      setLoadingLuminarias(false);
    }
  }

  function handleResult(nuevo) {
    setResultado(nuevo);
    setLog((prev) => [nuevo, ...prev].slice(0, MAX_LOG));
  }

  function handleAlerta(nueva) {
    setAlertas((prev) => [nueva, ...prev].slice(0, MAX_ALERTAS));
    setAlertaActiva(nueva);
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setAlertaActiva(null), ALERTA_TOAST_MS);
  }

  return (
    <SceneBackground className="min-h-screen">
      <div className="flex min-h-screen">
        <Sidebar />

        <main className="flex-1 p-6 lg:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-semibold text-haze-100">Panel de escaneo</h1>
              <p className="text-sm text-haze-400">Ocupación e iluminación en tiempo real.</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={luminariaId}
                onChange={(e) => setLuminariaId(e.target.value)}
                disabled={loadingLuminarias || luminarias.length === 0}
                className="rounded-lg border border-white/10 bg-void-800 px-3 py-2 font-mono text-xs text-haze-200 focus:border-beam-400 focus:outline-none"
              >
                {luminarias.length === 0 && <option>Sin luminarias</option>}
                {luminarias.map((l) => (
                  <option key={l.id_luminaria} value={l.id_luminaria}>
                    {l.nombre} · {l.zona.nombre}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setCreateOpen((v) => !v)}
                className="rounded-lg border border-white/10 px-3 py-2 font-mono text-xs text-haze-300 transition hover:border-beam-400/40 hover:text-white"
              >
                + Luminaria
              </button>
            </div>
          </div>

          {createOpen && (
            <CrearLuminariaForm
              onCreated={(nueva) => {
                setLuminarias((prev) => [nueva, ...prev]);
                setLuminariaId(nueva.id_luminaria);
                setCreateOpen(false);
              }}
              onClose={() => setCreateOpen(false)}
            />
          )}

          <AlertBanner alerta={alertaActiva} onClose={() => setAlertaActiva(null)} />

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <CameraPanel
              luminariaId={luminariaId}
              scanning={scanning}
              setScanning={setScanning}
              onResult={handleResult}
              onAlerta={handleAlerta}
            />
            <StatsSidebar resultado={resultado} log={log} scanning={scanning} alertas={alertas} />
          </div>
        </main>
      </div>
    </SceneBackground>
  );
}

function CrearLuminariaForm({ onCreated, onClose }) {
  const [nombre, setNombre] = useState("");
  const [zona, setZona] = useState("");
  const [tipoEspacio, setTipoEspacio] = useState("oficina");
  const [tipo, setTipo] = useState("LED");
  const [potencia, setPotencia] = useState(18);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const nueva = await api.createLuminaria({
        nombre,
        zona,
        tipo_espacio: tipoEspacio,
        tipo,
        potencia_w: Number(potencia),
      });
      onCreated(nueva);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la luminaria.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 grid gap-3 rounded-2xl border border-beam-400/20 bg-void-800/60 p-5 sm:grid-cols-6"
    >
      <input
        required
        placeholder="Nombre (ej. Luminaria pasillo 2)"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        className="rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-sm text-haze-100 placeholder:text-haze-500 focus:border-beam-400 focus:outline-none sm:col-span-2"
      />
      <input
        required
        placeholder="Zona (ej. Piso 2)"
        value={zona}
        onChange={(e) => setZona(e.target.value)}
        className="rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-sm text-haze-100 placeholder:text-haze-500 focus:border-beam-400 focus:outline-none"
      />
      <select
        value={tipoEspacio}
        onChange={(e) => setTipoEspacio(e.target.value)}
        title="Tipo de espacio (solo se usa si la zona es nueva; alimenta el modelo de prediccion energetica)"
        className="rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-sm text-haze-100 focus:border-beam-400 focus:outline-none"
      >
        {["oficina", "salon", "laboratorio", "auditorio", "comedor"].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={tipo}
        onChange={(e) => setTipo(e.target.value)}
        className="rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-sm text-haze-100 focus:border-beam-400 focus:outline-none"
      >
        {["LED", "fluorescente", "sodio", "halogena", "induccion", "otro"].map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        required
        type="number"
        min="1"
        step="0.5"
        placeholder="Watts"
        value={potencia}
        onChange={(e) => setPotencia(e.target.value)}
        className="rounded-lg border border-white/10 bg-void-900 px-3 py-2 text-sm text-haze-100 placeholder:text-haze-500 focus:border-beam-400 focus:outline-none"
      />

      <div className="flex gap-2 sm:col-span-6">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-beam-gradient px-4 py-2 text-xs font-semibold text-void-950 transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? "Creando…" : "Crear luminaria"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-4 py-2 text-xs text-haze-300 hover:text-white"
        >
          Cancelar
        </button>
        {error && <p className="self-center font-mono text-xs text-red-300">{error}</p>}
      </div>
    </form>
  );
}
