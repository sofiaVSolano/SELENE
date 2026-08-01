import { useCallback, useRef } from "react";

/**
 * El brillo especular que sigue al puntero sobre una superficie.
 *
 * `index.css` ya define `.specular::before` como un degradado radial
 * anclado en `--mx/--my`; lo único que falta es alguien que escriba esas
 * dos variables. Eso hace este hook, y lo hace escribiendo estilo
 * directamente sobre el nodo: mover el ratón no debe re-renderizar React.
 *
 *   const specular = useSpecular();
 *   <div className="surface specular" {...specular} />
 */
export function useSpecular() {
  const raf = useRef(0);

  const onMouseMove = useCallback((e) => {
    const nodo = e.currentTarget;
    const caja = nodo.getBoundingClientRect();
    const x = ((e.clientX - caja.left) / caja.width) * 100;
    const y = ((e.clientY - caja.top) / caja.height) * 100;

    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      nodo.style.setProperty("--mx", `${x}%`);
      nodo.style.setProperty("--my", `${y}%`);
    });
  }, []);

  const onMouseLeave = useCallback((e) => {
    cancelAnimationFrame(raf.current);
    e.currentTarget.style.setProperty("--mx", "50%");
    e.currentTarget.style.setProperty("--my", "50%");
  }, []);

  return { onMouseMove, onMouseLeave };
}
