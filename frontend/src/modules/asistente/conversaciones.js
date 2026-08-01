import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * CONVERSACIONES
 * -----------------------------------------------------------------
 * El backend guarda cada intercambio en `consultas`, pero no tiene el
 * concepto de "hilo": todas las preguntas de un usuario son una lista
 * plana. El agrupamiento en conversaciones, con título, anclaje y
 * búsqueda, vive aquí, en el cliente.
 *
 * Es una decisión, no un atajo: mantener el hilo en el cliente permite
 * renombrar, anclar y borrar al instante, sin viaje al servidor, que es
 * exactamente lo que hace que una barra lateral de chat se sienta rápida.
 * El historial real (auditable, el que alimenta los reportes) sigue
 * estando en la base de datos.
 */

const CLAVE = "selene_conversaciones";

const nuevoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function leer() {
  try {
    const bruto = localStorage.getItem(CLAVE);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function escribir(lista) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* cuota llena: se prefiere perder el guardado a romper la sesión en curso */
  }
}

export function conversacionVacia() {
  return {
    id: nuevoId(),
    titulo: "Nueva conversación",
    anclada: false,
    creada: Date.now(),
    actualizada: Date.now(),
    mensajes: [],
  };
}

/** Título automático a partir de la primera pregunta, cortado por palabra. */
function tituloDesde(texto) {
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (limpio.length <= 42) return limpio;
  return `${limpio.slice(0, 42).replace(/\s\S*$/, "")}…`;
}

/** Ordena: primero las ancladas, después por actividad más reciente. */
function ordenar(lista) {
  return [...lista].sort((a, b) => {
    if (a.anclada !== b.anclada) return a.anclada ? -1 : 1;
    return b.actualizada - a.actualizada;
  });
}

export function useConversaciones() {
  const [lista, setLista] = useState(() => leer());
  const [activaId, setActivaId] = useState(() => leer()[0]?.id ?? null);
  const [busqueda, setBusqueda] = useState("");

  /**
   * Copia autoritativa y síncrona de la lista.
   *
   * Hace falta porque un turno de chat añade DOS mensajes seguidos —la
   * pregunta y la respuesta— y el segundo necesita saber en qué
   * conversación cayó el primero. Con `useState` a secas, la segunda
   * llamada aún vería el estado viejo y crearía una conversación nueva
   * para la respuesta. Todas las mutaciones pasan por esta referencia y
   * después publican en el estado.
   */
  const ref = useRef(lista);

  const publicar = useCallback((siguiente) => {
    ref.current = siguiente;
    setLista(siguiente);
    return siguiente;
  }, []);

  useEffect(() => escribir(lista), [lista]);

  const activa = useMemo(() => lista.find((c) => c.id === activaId) ?? null, [lista, activaId]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradas = q
      ? lista.filter(
          (c) =>
            c.titulo.toLowerCase().includes(q) ||
            c.mensajes.some((m) => m.texto.toLowerCase().includes(q))
        )
      : lista;
    return ordenar(filtradas);
  }, [lista, busqueda]);

  const crear = useCallback(() => {
    const nueva = conversacionVacia();
    publicar([nueva, ...ref.current]);
    setActivaId(nueva.id);
    return nueva;
  }, [publicar]);

  const eliminar = useCallback(
    (id) => {
      const siguiente = publicar(ref.current.filter((c) => c.id !== id));
      if (id === activaId) setActivaId(ordenar(siguiente)[0]?.id ?? null);
    },
    [activaId, publicar]
  );

  const renombrar = useCallback(
    (id, titulo) => {
      const limpio = titulo.trim();
      if (!limpio) return;
      publicar(ref.current.map((c) => (c.id === id ? { ...c, titulo: limpio } : c)));
    },
    [publicar]
  );

  const anclar = useCallback(
    (id) => {
      publicar(ref.current.map((c) => (c.id === id ? { ...c, anclada: !c.anclada } : c)));
    },
    [publicar]
  );

  /**
   * Añade un mensaje y devuelve el id de la conversación en la que cayó.
   * Si no existía todavía, la crea: escribir es siempre lo primero que hace
   * el usuario y nunca debería tener que pulsar "nueva conversación" antes
   * de poder hablar.
   */
  const agregarMensaje = useCallback(
    (id, mensaje) => {
      let destino = id;
      let base = ref.current;

      if (!destino || !base.some((c) => c.id === destino)) {
        const nueva = conversacionVacia();
        destino = nueva.id;
        base = [nueva, ...base];
      }

      publicar(
        base.map((c) => {
          if (c.id !== destino) return c;
          const mensajes = [...c.mensajes, { id: nuevoId(), ts: Date.now(), ...mensaje }];
          const titulo =
            c.titulo === "Nueva conversación" && mensaje.rol === "usuario"
              ? tituloDesde(mensaje.texto)
              : c.titulo;
          return { ...c, mensajes, titulo, actualizada: Date.now() };
        })
      );
      setActivaId(destino);
      return destino;
    },
    [publicar]
  );

  return {
    lista,
    visibles,
    activa,
    activaId,
    setActivaId,
    busqueda,
    setBusqueda,
    crear,
    eliminar,
    renombrar,
    anclar,
    agregarMensaje,
  };
}
