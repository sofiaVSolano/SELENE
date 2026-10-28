"""Latencia de registro de eventos: exporta los eventos medibles a CSV e
imprime n, media, mediana y p95 (evidencia de RNF-09, Seccion 4.1 de la tesis).

La latencia de un evento es `eventos.fecha_hora` (instante en que se registro)
menos `eventos.fecha_hora_origen` (instante en que se guardo la deteccion que
lo origino, ya con la inferencia hecha: ver `routers/deteccion.py`). Mide solo
el tramo del backend entre ambos registros, no el envio de la imagen ni la
inferencia. Solo `encendido`/`apagado` guardan esa marca; `alerta_ocupacion`
la emite el frontend por `/api/alertas` y no la almacena.

La base de produccion se inicializo copiando la de desarrollo: los eventos
heredados terminan el 2026-08-01 y los propios de produccion empiezan el
2026-08-04. `--desde` (por defecto 2026-08-02, UTC) deja fuera los heredados.

Solo usa la biblioteca estandar y abre la base en modo solo lectura, asi que
puede ejecutarse dentro del contenedor sin reconstruir la imagen:

    docker exec -i selene-backend-1 python - --db /app/data/selene.db \\
        < backend/scripts/latencia_eventos.py \\
        > eventos.csv 2> resumen.txt

El CSV sale por stdout y el resumen por stderr. Con `--csv RUTA` el CSV se
escribe en ese archivo y el resumen sale por stdout.
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
import statistics as st
import sys

CONSULTA = """
SELECT id_evento,
       tipo_evento,
       fecha_hora_origen,
       fecha_hora,
       (julianday(fecha_hora) - julianday(fecha_hora_origen)) * 86400 AS latencia_s
FROM eventos
WHERE fecha_hora >= :desde
ORDER BY fecha_hora
"""


def resumir(nombre: str, latencias: list[float]) -> str:
    lat = sorted(latencias)
    n = len(lat)
    if not n:
        return f"{nombre}: n=0"
    # Interpolacion lineal (equivale a PERCENTIL.INC de Excel y al metodo
    # por defecto de numpy.percentile).
    p95 = st.quantiles(lat, n=20, method="inclusive")[-1] if n > 1 else lat[0]
    return (
        f"{nombre}: n={n} media={st.mean(lat):.3f} mediana={st.median(lat):.3f} "
        f"p95={p95:.3f} min={lat[0]:.3f} max={lat[-1]:.3f}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", default="/app/data/selene.db")
    parser.add_argument("--desde", default="2026-08-02", help="fecha_hora minima (UTC)")
    parser.add_argument("--csv", help="archivo de salida; por defecto stdout")
    args = parser.parse_args()

    conexion = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    filas = conexion.execute(CONSULTA, {"desde": args.desde}).fetchall()
    medibles = [f for f in filas if f[4] is not None]

    salida = open(args.csv, "w", newline="", encoding="utf-8") if args.csv else sys.stdout
    escritor = csv.writer(salida)
    escritor.writerow(["id_evento", "tipo_evento", "fecha_hora_origen_utc", "fecha_hora_utc", "latencia_s"])
    for id_evento, tipo, origen, registro, latencia in medibles:
        escritor.writerow([id_evento, tipo, origen, registro, f"{latencia:.6f}"])
    if args.csv:
        salida.close()

    log = sys.stdout if args.csv else sys.stderr
    print(f"base: {args.db} | desde: {args.desde} (UTC)", file=log)
    if filas:
        print(f"eventos en el periodo: {len(filas)} | primero: {filas[0][3]} | ultimo: {filas[-1][3]}", file=log)
    for tipo in sorted({f[1] for f in filas}):
        total = sum(f[1] == tipo for f in filas)
        con_origen = sum(f[1] == tipo and f[4] is not None for f in filas)
        print(f"  {tipo}: {total} eventos, {con_origen} con origen", file=log)
    print("== latencia (s) ==", file=log)
    print(resumir("TODOS", [f[4] for f in medibles]), file=log)
    for tipo in sorted({f[1] for f in medibles}):
        print(resumir(tipo, [f[4] for f in medibles if f[1] == tipo]), file=log)


if __name__ == "__main__":
    main()
