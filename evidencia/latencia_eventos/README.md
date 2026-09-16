# Latencia de generación de eventos (producción)

Evidencia de la Sección 4.1 de la tesis y del requisito RNF-0X
(p95 de la latencia de generación de eventos < 5 s).

## Archivos

| Archivo | Contenido |
|---|---|
| `eventos.csv` | Los 105 eventos medibles de producción: `id_evento`, `tipo_evento`, `fecha_hora_origen_utc` (marca de la detección), `fecha_hora_utc` (registro del evento) y `latencia_s`. |
| `resumen.txt` | Salida del script: conteos por tipo y n, media, mediana, p95, mínimo y máximo. |

Consulta: [`backend/scripts/latencia_eventos.py`](../../backend/scripts/latencia_eventos.py).

## Resultado

| Población | n | Media (s) | Mediana (s) | p95 (s) | Mín. (s) | Máx. (s) |
|---|---:|---:|---:|---:|---:|---:|
| Total | 105 | 0.064 | 0.037 | 0.205 | 0.009 | 0.774 |
| Encendido | 55 | 0.052 | 0.030 | 0.188 | 0.009 | 0.189 |
| Apagado | 50 | 0.078 | 0.039 | 0.206 | 0.016 | 0.774 |

p95 con interpolación lineal (`statistics.quantiles(..., method="inclusive")`,
igual que `numpy.percentile` por defecto). Las cifras se recalcularon a partir
del CSV con numpy y coinciden.

## Cómo se obtuvo

- **Fuente:** base SQLite de producción (`/app/data/selene.db`, contenedor
  `selene-backend-1`), abierta en modo solo lectura. Extracción del 2026-09-16.
- **Métrica:** latencia = `eventos.fecha_hora` − `eventos.fecha_hora_origen`.
- **Periodo:** eventos con `fecha_hora >= 2026-08-02` (UTC); en la práctica
  van del 2026-08-04 20:03 al 2026-09-10 22:20 UTC.
- **Exclusión de datos de desarrollo:** la base de producción se inicializó
  copiando la de desarrollo. Los 12 eventos heredados terminan el
  2026-08-01 22:45 UTC, así que el corte del 2026-08-02 los deja fuera.
- **Eventos no medibles:** de los 120 eventos del periodo, las 15
  `alerta_ocupacion` no guardan `fecha_hora_origen`. Se emiten a propósito tras
  10 s sin ocupación, así que su tiempo total es esa espera más la latencia
  medida aquí.

## Reproducir

En el servidor, con el script copiado a `/tmp`:

```bash
docker exec -i selene-backend-1 python - --db /app/data/selene.db \
    < /tmp/latencia_eventos.py > eventos.csv 2> resumen.txt
```

Si se ejecuta después del 2026-09-16, incluirá eventos nuevos. Para repetir
exactamente esta población, conserve solo las filas con
`fecha_hora_utc <= 2026-09-10 22:20:11.047460`.

## Integridad (SHA-256)

```
ea6f9026941ddd234497200e8fcd3268b1189f057fb9e69eb6341bfcf3520b12  eventos.csv
99541b73a8367bdcbfd19b97edf30da80cf9b6c168f1fb5a8cb78f999b2b19f4  resumen.txt
```
