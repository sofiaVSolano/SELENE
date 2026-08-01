"""
analyzer.py
-----------
Orquestador principal del modulo `lightingAnalyzer`.

Expone la clase `LightingAnalyzer`, punto de entrada unico del modulo: recibe
una imagen RGB/BGR y las detecciones del detector FasterRCNN_ADE20K (clases
Window / Luminaire, ya entrenado - este modulo NO entrena ni ejecuta ninguna
red neuronal) y devuelve un analisis completo de la iluminacion de la escena,
generando ademas todas las graficas y reportes (JSON/CSV/MD/HTML) en disco.

Pipeline (cada etapa vive en su propio submodulo, con responsabilidad unica):

    1. brightness.py    -> analisis global de brillo de la escena
    2. windows.py        -> analisis por ROI de clase "Window"
    3. luminaires.py      -> analisis por ROI de clase "Luminaire" (+ hotspots)
    4. indicators.py      -> Natural Score / Artificial Score
    5. classifier.py      -> clasificacion Natural / Artificial / Mixta
    6. recommender.py     -> recomendacion textual basada en reglas
    7. visualization.py   -> imagen anotada + histogramas + heatmap + graficas
    8. (este archivo)      -> reportes JSON / CSV / Markdown / HTML

IMPORTANTE (ver README.md): natural_score/artificial_score son una
ESTIMACION RELATIVA basada en vision por computador sobre imagenes RGB, no
una medicion fisica de iluminancia (lux/lumen). No sustituyen un luxometro.
"""

from __future__ import annotations

import datetime as dt
import logging
from pathlib import Path

import numpy as np

from . import utils
from .brightness import SceneBrightnessAnalyzer
from .classifier import LightingClassifier
from .indicators import IndicatorCalculator
from .luminaires import LuminaireAnalyzer
from .recommender import RecommendationEngine
from .windows import WindowAnalyzer
from . import visualization

logger = logging.getLogger("lightingAnalyzer.analyzer")


class LightingAnalyzer:
    """Punto de entrada del modulo de analisis de iluminacion.

    Parameters
    ----------
    weights_config_path, thresholds_config_path, recommendations_config_path,
    analysis_config_path:
        Rutas a los YAML de configuracion. Por defecto apuntan a
        `configs/lighting_*.yaml` en la raiz del proyecto (ver utils.py).
    """

    def __init__(
        self,
        weights_config_path: str | Path = utils.WEIGHTS_CONFIG_PATH,
        thresholds_config_path: str | Path = utils.THRESHOLDS_CONFIG_PATH,
        recommendations_config_path: str | Path = utils.RECOMMENDATIONS_CONFIG_PATH,
        analysis_config_path: str | Path = utils.ANALYSIS_CONFIG_PATH,
    ):
        analysis_config = utils.load_yaml_config(analysis_config_path)
        weights_config = utils.load_yaml_config(weights_config_path)
        thresholds_config = utils.load_yaml_config(thresholds_config_path)
        recommendations_config = utils.load_yaml_config(recommendations_config_path)

        self.analysis_config = analysis_config
        self.brightness_analyzer = SceneBrightnessAnalyzer(analysis_config)
        self.window_analyzer = WindowAnalyzer(analysis_config)
        self.luminaire_analyzer = LuminaireAnalyzer(analysis_config)
        self.indicator_calculator = IndicatorCalculator(
            weights_config, analysis_config.get("normalization", {})
        )
        self.classifier = LightingClassifier(thresholds_config)
        self.recommender = RecommendationEngine(recommendations_config)

    def analyze(
        self,
        image,
        detections: list[dict],
        output_dir: str | Path | None = None,
        image_name: str = "scene",
        generate_report: bool = True,
    ) -> dict:
        """Ejecuta el pipeline completo de analisis de iluminacion.

        Parameters
        ----------
        image: imagen BGR (numpy.ndarray, formato OpenCV) o RGB - ver Notas.
        detections: lista de dicts `{"class": "Window"|"Luminaire",
            "confidence": float, "bbox": [x1, y1, x2, y2]}`, tal como los
            devuelve el detector FasterRCNN_ADE20K ya entrenado.
        output_dir: directorio donde guardar graficas y reportes. Si es None
            se crea automaticamente en
            `reports/lighting_analysis/<image_name>_<timestamp>/`.
        image_name: nombre logico de la imagen (para nombrar el directorio de
            salida y los reportes).
        generate_report: si es False, omite la generacion de graficas
            (matplotlib) y la escritura de reportes JSON/CSV/MD/HTML en
            disco, devolviendo unicamente los resultados numericos. Pensado
            para uso en tiempo real (p. ej. un frame de video), donde el
            costo de I/O y render por frame es inaceptable. `artifacts`
            queda en `None` en ese caso. Por defecto `True`, que preserva el
            comportamiento original del modulo.

        Notas
        -----
        Todas las conversiones de color internas (HSV, LAB) asumen el orden
        de canales BGR de OpenCV. Si `image` viene en RGB (p. ej. leida con
        PIL), conviertala antes con `cv2.cvtColor(image, cv2.COLOR_RGB2BGR)`.

        Returns
        -------
        dict con, como minimo, las claves: scene_brightness, windows,
        luminaires, natural_score, artificial_score, natural_percentage,
        artificial_percentage, lighting_type, recommendation. Ademas incluye
        `details` (resultados numericos completos por ROI) y `artifacts`
        (rutas de las graficas/reportes guardados en disco, o `None` si
        `generate_report=False`).
        """
        utils.validate_image(image)
        image_shape = (image.shape[0], image.shape[1])

        parsed_detections = utils.parse_detections(detections, image_shape)

        # --- Etapa 1: brillo global de la escena ---------------------------
        scene_result = self.brightness_analyzer.analyze(image)

        # --- Etapa 2 y 3: analisis por ROI ----------------------------------
        window_results = self.window_analyzer.analyze(image, parsed_detections)
        luminaire_results = self.luminaire_analyzer.analyze(image, parsed_detections)

        # --- Indicadores + clasificacion + recomendacion --------------------
        indicators_result = self.indicator_calculator.compute(
            scene_result, window_results, luminaire_results, image_shape
        )
        lighting_type = self.classifier.classify(
            indicators_result["natural_percentage"], indicators_result["artificial_percentage"]
        )
        recommendation = self.recommender.recommend(
            indicators_result["natural_percentage"], indicators_result["artificial_percentage"]
        )

        # --- Visualizacion + reportes (JSON/CSV/Markdown/HTML) --------------
        # Se omiten por completo si generate_report=False (uso en tiempo
        # real): son las dos operaciones costosas del pipeline (render
        # matplotlib + I/O a disco), y el resto del analisis (arriba) ya es
        # barato de por si al ser CV clasico.
        artifacts = None
        if generate_report:
            if output_dir is None:
                timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
                output_dir = utils.PROJECT_ROOT / "reports" / "lighting_analysis" / f"{image_name}_{timestamp}"
            output_dir = utils.ensure_dir(output_dir)

            graph_paths = visualization.generate_all(
                output_dir=output_dir,
                image_bgr=image,
                scene_result=scene_result,
                window_results=window_results,
                luminaire_results=luminaire_results,
                indicators_result=indicators_result,
                lighting_type=lighting_type,
                plots_config=self.analysis_config.get("plots", {}),
                heatmap_config=self.analysis_config.get("heatmap", {}),
            )

            report_paths = self._write_reports(
                output_dir=output_dir,
                image_name=image_name,
                scene_result=scene_result,
                window_results=window_results,
                luminaire_results=luminaire_results,
                indicators_result=indicators_result,
                lighting_type=lighting_type,
                recommendation=recommendation,
                graph_paths=graph_paths,
            )

            artifacts = {
                "output_dir": str(output_dir),
                "graphs": {k: str(v) for k, v in graph_paths.items()},
                "reports": {k: str(v) for k, v in report_paths.items()},
            }

        summary = {
            "scene_brightness": round(scene_result["mean"], 4),
            "windows": len(window_results),
            "luminaires": len(luminaire_results),
            "natural_score": round(indicators_result["natural_score"], 4),
            "artificial_score": round(indicators_result["artificial_score"], 4),
            "natural_percentage": indicators_result["natural_percentage"],
            "artificial_percentage": indicators_result["artificial_percentage"],
            "lighting_type": lighting_type,
            "recommendation": recommendation,
            "details": {
                "scene": _clean_scene_for_report(scene_result),
                "windows": [_clean_window_for_report(w) for w in window_results],
                "luminaires": [_clean_luminaire_for_report(l) for l in luminaire_results],
                "indicators": indicators_result,
            },
            "artifacts": artifacts,
        }

        logger.info(
            "Analisis de iluminacion completo: %s (natural=%.1f%%, artificial=%.1f%%) -> %s",
            image_name, indicators_result["natural_percentage"], indicators_result["artificial_percentage"],
            artifacts["output_dir"] if artifacts else "(sin reporte, generate_report=False)",
        )
        return summary

    # ------------------------------------------------------------------
    # Reportes
    # ------------------------------------------------------------------

    def _write_reports(
        self,
        output_dir: Path,
        image_name: str,
        scene_result: dict,
        window_results: list[dict],
        luminaire_results: list[dict],
        indicators_result: dict,
        lighting_type: str,
        recommendation: str,
        graph_paths: dict[str, Path],
    ) -> dict[str, Path]:
        data_dir = utils.ensure_dir(output_dir / "data")

        clean_scene = _clean_scene_for_report(scene_result)
        clean_windows = [_clean_window_for_report(w) for w in window_results]
        clean_luminaires = [_clean_luminaire_for_report(l) for l in luminaire_results]

        json_data = {
            "image_name": image_name,
            "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
            "scene": clean_scene,
            "windows": clean_windows,
            "luminaires": clean_luminaires,
            "indicators": indicators_result,
            "lighting_type": lighting_type,
            "recommendation": recommendation,
        }

        paths: dict[str, Path] = {}
        paths["json"] = utils.write_json(json_data, data_dir / "report.json")
        paths["csv"] = utils.write_csv(
            _build_csv_rows(clean_scene, clean_windows, clean_luminaires), data_dir / "report.csv"
        )

        markdown = self._render_markdown(
            image_name, clean_scene, clean_windows, clean_luminaires, indicators_result,
            lighting_type, recommendation, graph_paths,
        )
        md_path = output_dir / "report.md"
        md_path.write_text(markdown, encoding="utf-8")
        paths["markdown"] = md_path
        logger.info("Reporte Markdown guardado en %s", md_path)

        html = self._render_html(
            image_name, clean_scene, clean_windows, clean_luminaires, indicators_result,
            lighting_type, recommendation, graph_paths,
        )
        html_path = output_dir / "report.html"
        html_path.write_text(html, encoding="utf-8")
        paths["html"] = html_path
        logger.info("Reporte HTML guardado en %s", html_path)

        return paths

    @staticmethod
    def _render_markdown(
        image_name, scene, windows, luminaires, indicators, lighting_type, recommendation, graph_paths,
    ) -> str:
        now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
        lines: list[str] = []
        lines.append(f"# Analisis de iluminacion - {image_name}")
        lines.append("")
        lines.append(f"Generado automaticamente por `lightingAnalyzer` el {now}.")
        lines.append("")
        lines.append(
            "> **Nota:** Natural Score / Artificial Score son una estimacion relativa "
            "basada en vision por computador sobre esta imagen RGB, no una medicion "
            "fisica de iluminancia (lux). Ver `lightingAnalyzer/README.md` para la "
            "metodologia completa."
        )
        lines.append("")

        lines.append("## 1. Resumen")
        lines.append("")
        lines.append(f"- **Tipo de iluminacion:** {lighting_type}")
        lines.append(f"- **Natural:** {indicators['natural_percentage']:.1f}%")
        lines.append(f"- **Artificial:** {indicators['artificial_percentage']:.1f}%")
        lines.append(f"- **Brillo promedio de la escena (canal V):** {scene['mean']:.2f} / 255")
        lines.append(f"- **Ventanas detectadas:** {len(windows)}")
        lines.append(f"- **Luminarias detectadas:** {len(luminaires)}")
        lines.append(f"- **Recomendacion:** {recommendation}")
        lines.append("")

        lines.append("## 2. Brillo global de la escena")
        lines.append("")
        lines.append("| Metrica | Valor |")
        lines.append("|---|---|")
        lines.append(f"| Media | {scene['mean']:.2f} |")
        lines.append(f"| Maximo | {scene['max']:.2f} |")
        lines.append(f"| Minimo | {scene['min']:.2f} |")
        lines.append(f"| Desviacion estandar | {scene['std']:.2f} |")
        for band, pct in scene["intensity_distribution"].items():
            lines.append(f"| % pixeles banda '{band}' | {pct:.2f}% |")
        lines.append("")
        if "brightness_heatmap" in graph_paths:
            lines.append(f"![Mapa de calor de brillo](graphs/{Path(graph_paths['brightness_heatmap']).name})")
            lines.append("")
        if "scene_histograms" in graph_paths:
            lines.append(f"![Histogramas de la escena](graphs/{Path(graph_paths['scene_histograms']).name})")
            lines.append("")
        if "intensity_distribution" in graph_paths:
            lines.append(f"![Distribucion de intensidad](graphs/{Path(graph_paths['intensity_distribution']).name})")
            lines.append("")

        lines.append("## 3. Ventanas")
        lines.append("")
        if windows:
            lines.append("| # | Confianza | Area (px²) | Area relativa | Brillo medio | Contraste | Centroide |")
            lines.append("|---|---|---|---|---|---|---|")
            for w in windows:
                lines.append(
                    f"| {w['window_id']} | {w['confidence']:.2f} | {w['area_px']} | "
                    f"{w['relative_area']:.2%} | {w['brightness_mean']:.1f} | {w['contrast']:.3f} | "
                    f"({w['centroid_x']:.0f}, {w['centroid_y']:.0f}) |"
                )
        else:
            lines.append("_No se detectaron ventanas._")
        lines.append("")
        if "windows_histograms" in graph_paths:
            lines.append(f"![Histogramas de ventanas](graphs/{Path(graph_paths['windows_histograms']).name})")
            lines.append("")

        lines.append("## 4. Luminarias")
        lines.append("")
        if luminaires:
            lines.append(
                "| # | Confianza | Area (px²) | Area relativa | Brillo medio | Contraste | "
                "Hotspots | % Area hotspot | % Pixeles muy brillantes | Centroide |"
            )
            lines.append("|---|---|---|---|---|---|---|---|---|---|")
            for l in luminaires:
                lines.append(
                    f"| {l['luminaire_id']} | {l['confidence']:.2f} | {l['area_px']} | "
                    f"{l['relative_area']:.2%} | {l['brightness_mean']:.1f} | {l['contrast']:.3f} | "
                    f"{l['hotspot_count']} | {l['hotspot_area_pct_of_roi']:.2f}% | "
                    f"{l['bright_pixel_pct']:.2f}% | ({l['centroid_x']:.0f}, {l['centroid_y']:.0f}) |"
                )
        else:
            lines.append("_No se detectaron luminarias._")
        lines.append("")
        if "luminaires_histograms" in graph_paths:
            lines.append(f"![Histogramas de luminarias](graphs/{Path(graph_paths['luminaires_histograms']).name})")
            lines.append("")

        lines.append("## 5. Indicadores")
        lines.append("")
        lines.append("**Componentes Natural Score** (normalizados 0-1):")
        lines.append("")
        for k, v in indicators["natural_components"].items():
            lines.append(f"- {k}: {v:.3f}")
        lines.append("")
        lines.append("**Componentes Artificial Score** (normalizados 0-1):")
        lines.append("")
        for k, v in indicators["artificial_components"].items():
            lines.append(f"- {k}: {v:.3f}")
        lines.append("")
        if indicators.get("fallback_used"):
            lines.append(
                "_Nota: no se detectaron ventanas ni luminarias con evidencia suficiente; "
                "el indicador se calculo usando el brillo global de la escena como "
                "referencia neutral (ver `indicators.py`)._"
            )
            lines.append("")

        lines.append("## 6. Imagen anotada")
        lines.append("")
        if "annotated_image" in graph_paths:
            lines.append(f"![Imagen anotada](graphs/{Path(graph_paths['annotated_image']).name})")
            lines.append("")

        lines.append("---")
        lines.append(
            "_Analisis generado mediante procesamiento clasico de imagenes (OpenCV/NumPy) "
            "sobre las detecciones del modelo FasterRCNN_ADE20K (Window, Luminaire). No se "
            "entreno ninguna red neuronal para producir este reporte._"
        )
        return "\n".join(lines)

    @staticmethod
    def _render_html(
        image_name, scene, windows, luminaires, indicators, lighting_type, recommendation, graph_paths,
    ) -> str:
        now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")

        def _img(key: str, alt: str) -> str:
            if key not in graph_paths:
                return ""
            return f"<img src='graphs/{Path(graph_paths[key]).name}' alt='{alt}'>"

        window_rows = "".join(
            f"<tr><td>{w['window_id']}</td><td>{w['confidence']:.2f}</td><td>{w['area_px']}</td>"
            f"<td>{w['relative_area']:.2%}</td><td>{w['brightness_mean']:.1f}</td>"
            f"<td>{w['contrast']:.3f}</td><td>({w['centroid_x']:.0f}, {w['centroid_y']:.0f})</td></tr>"
            for w in windows
        ) or "<tr><td colspan='7'><em>No se detectaron ventanas.</em></td></tr>"

        luminaire_rows = "".join(
            f"<tr><td>{l['luminaire_id']}</td><td>{l['confidence']:.2f}</td><td>{l['area_px']}</td>"
            f"<td>{l['relative_area']:.2%}</td><td>{l['brightness_mean']:.1f}</td>"
            f"<td>{l['contrast']:.3f}</td><td>{l['hotspot_count']}</td>"
            f"<td>{l['hotspot_area_pct_of_roi']:.2f}%</td><td>{l['bright_pixel_pct']:.2f}%</td>"
            f"<td>({l['centroid_x']:.0f}, {l['centroid_y']:.0f})</td></tr>"
            for l in luminaires
        ) or "<tr><td colspan='10'><em>No se detectaron luminarias.</em></td></tr>"

        natural_components = "".join(f"<li>{k}: {v:.3f}</li>" for k, v in indicators["natural_components"].items())
        artificial_components = "".join(f"<li>{k}: {v:.3f}</li>" for k, v in indicators["artificial_components"].items())

        intensity_rows = "".join(
            f"<tr><td>{band}</td><td>{pct:.2f}%</td></tr>" for band, pct in scene["intensity_distribution"].items()
        )

        return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Analisis de iluminacion - {image_name}</title>
<style>
  :root {{
    color-scheme: light;
    --surface: #fcfcfb; --page: #f9f9f7; --ink-primary: #0b0b0b;
    --ink-secondary: #52514e; --ink-muted: #898781; --grid: #e1e0d9;
    --baseline: #c3c2b7; --blue: #2a78d6; --green: #008300; --orange: #eb6834;
  }}
  body {{ background: var(--page); color: var(--ink-primary); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 0 0 4rem 0; }}
  .wrap {{ max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }}
  h1 {{ font-size: 1.8rem; margin-bottom: 0.2rem; }}
  h2 {{ font-size: 1.3rem; margin-top: 2.5rem; border-bottom: 1px solid var(--grid); padding-bottom: 0.4rem; }}
  .meta {{ color: var(--ink-secondary); font-size: 0.9rem; }}
  table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.85rem; background: var(--surface); }}
  th, td {{ border: 1px solid var(--grid); padding: 0.4rem 0.6rem; text-align: left; }}
  th {{ background: var(--page); color: var(--ink-secondary); font-weight: 600; }}
  .table-scroll {{ overflow-x: auto; }}
  img {{ max-width: 100%; height: auto; border: 1px solid var(--grid); border-radius: 4px; background: var(--surface); margin: 0.5rem 0; }}
  .card {{ background: var(--surface); border: 1px solid var(--grid); border-radius: 8px; padding: 1.2rem 1.4rem; margin: 1rem 0; }}
  .badge {{ display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.9rem; font-weight: 600; }}
  .badge-natural {{ background: rgba(42,120,214,0.12); color: var(--blue); }}
  .badge-artificial {{ background: rgba(235,104,52,0.14); color: var(--orange); }}
  .note {{ color: var(--ink-secondary); font-size: 0.85rem; }}
  footer {{ margin-top: 3rem; color: var(--ink-muted); font-size: 0.8rem; }}
  @media (prefers-color-scheme: dark) {{
    :root:where(:not([data-theme="light"])) {{
      color-scheme: dark; --surface: #1a1a19; --page: #0d0d0d; --ink-primary: #fff;
      --ink-secondary: #c3c2b7; --ink-muted: #898781; --grid: #2c2c2a; --baseline: #383835;
      --blue: #3987e5; --green: #008300; --orange: #d95926;
    }}
  }}
  :root[data-theme="dark"] {{
    color-scheme: dark; --surface: #1a1a19; --page: #0d0d0d; --ink-primary: #fff;
    --ink-secondary: #c3c2b7; --ink-muted: #898781; --grid: #2c2c2a; --baseline: #383835;
    --blue: #3987e5; --green: #008300; --orange: #d95926;
  }}
</style>
</head>
<body>
<div class="wrap">
<h1>Analisis de iluminacion - {image_name}</h1>
<p class="meta">Generado automaticamente por <code>lightingAnalyzer</code> el {now}.</p>
<p class="note">Natural Score / Artificial Score son una estimacion relativa basada en vision
por computador sobre esta imagen RGB, no una medicion fisica de iluminancia (lux). Ver
<code>lightingAnalyzer/README.md</code> para la metodologia completa.</p>

<h2>1. Resumen</h2>
<div class="card">
<p><span class="badge badge-natural">Natural {indicators['natural_percentage']:.1f}%</span>
   <span class="badge badge-artificial">Artificial {indicators['artificial_percentage']:.1f}%</span></p>
<p><b>Tipo de iluminacion:</b> {lighting_type}</p>
<p><b>Brillo promedio de la escena (canal V):</b> {scene['mean']:.2f} / 255</p>
<p><b>Ventanas detectadas:</b> {len(windows)} &nbsp;|&nbsp; <b>Luminarias detectadas:</b> {len(luminaires)}</p>
<p><b>Recomendacion:</b> {recommendation}</p>
</div>

<h2>2. Brillo global de la escena</h2>
<div class="table-scroll"><table>
<tr><th>Metrica</th><th>Valor</th></tr>
<tr><td>Media</td><td>{scene['mean']:.2f}</td></tr>
<tr><td>Maximo</td><td>{scene['max']:.2f}</td></tr>
<tr><td>Minimo</td><td>{scene['min']:.2f}</td></tr>
<tr><td>Desviacion estandar</td><td>{scene['std']:.2f}</td></tr>
{intensity_rows}
</table></div>
{_img('brightness_heatmap', 'Mapa de calor de brillo')}
{_img('scene_histograms', 'Histogramas de la escena')}
{_img('intensity_distribution', 'Distribucion de intensidad')}

<h2>3. Ventanas</h2>
<div class="table-scroll"><table>
<tr><th>#</th><th>Confianza</th><th>Area (px²)</th><th>Area relativa</th><th>Brillo medio</th><th>Contraste</th><th>Centroide</th></tr>
{window_rows}
</table></div>
{_img('windows_histograms', 'Histogramas de ventanas')}

<h2>4. Luminarias</h2>
<div class="table-scroll"><table>
<tr><th>#</th><th>Confianza</th><th>Area (px²)</th><th>Area relativa</th><th>Brillo medio</th><th>Contraste</th>
<th>Hotspots</th><th>% Area hotspot</th><th>% Pixeles muy brillantes</th><th>Centroide</th></tr>
{luminaire_rows}
</table></div>
{_img('luminaires_histograms', 'Histogramas de luminarias')}

<h2>5. Indicadores</h2>
<div class="card">
<p><b>Componentes Natural Score</b> (normalizados 0-1):</p>
<ul>{natural_components}</ul>
<p><b>Componentes Artificial Score</b> (normalizados 0-1):</p>
<ul>{artificial_components}</ul>
</div>

<h2>6. Imagen anotada</h2>
{_img('annotated_image', 'Imagen anotada')}

<footer>
Analisis generado mediante procesamiento clasico de imagenes (OpenCV/NumPy) sobre las
detecciones del modelo FasterRCNN_ADE20K (Window, Luminaire). No se entreno ninguna red
neuronal para producir este reporte.
</footer>
</div>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Helpers de limpieza para reportes (arrays pesados -> listas o se descartan)
# ---------------------------------------------------------------------------

def _clean_scene_for_report(scene_result: dict) -> dict:
    return {
        "mean": scene_result["mean"],
        "max": scene_result["max"],
        "min": scene_result["min"],
        "std": scene_result["std"],
        "image_shape": scene_result["image_shape"],
        "v_histogram": np.asarray(scene_result["v_histogram"]).tolist(),
        "l_histogram": np.asarray(scene_result["l_histogram"]).tolist(),
        "intensity_distribution": scene_result["intensity_distribution"],
    }


def _clean_window_for_report(w: dict) -> dict:
    clean = {k: v for k, v in w.items() if k != "histogram"}
    clean["histogram"] = np.asarray(w["histogram"]).tolist()
    return clean


def _clean_luminaire_for_report(l: dict) -> dict:
    clean = {k: v for k, v in l.items() if k not in ("histogram", "hotspot_mask")}
    clean["histogram"] = np.asarray(l["histogram"]).tolist()
    return clean


def _build_csv_rows(scene: dict, windows: list[dict], luminaires: list[dict]) -> list[dict]:
    rows: list[dict] = []

    scene_row = {"type": "scene", "id": 0, "mean": scene["mean"], "max": scene["max"],
                 "min": scene["min"], "std": scene["std"]}
    for band, pct in scene["intensity_distribution"].items():
        scene_row[f"pct_{band}"] = pct
    rows.append(scene_row)

    for w in windows:
        rows.append({
            "type": "Window", "id": w["window_id"], "confidence": w["confidence"],
            "bbox": w["bbox"], "area_px": w["area_px"], "relative_area": w["relative_area"],
            "brightness_mean": w["brightness_mean"], "brightness_max": w["brightness_max"],
            "brightness_min": w["brightness_min"], "brightness_std": w["brightness_std"],
            "contrast": w["contrast"], "centroid_x": w["centroid_x"], "centroid_y": w["centroid_y"],
        })

    for l in luminaires:
        rows.append({
            "type": "Luminaire", "id": l["luminaire_id"], "confidence": l["confidence"],
            "bbox": l["bbox"], "area_px": l["area_px"], "relative_area": l["relative_area"],
            "brightness_mean": l["brightness_mean"], "brightness_max": l["brightness_max"],
            "brightness_min": l["brightness_min"], "brightness_std": l["brightness_std"],
            "contrast": l["contrast"], "hotspot_count": l["hotspot_count"],
            "hotspot_area_px": l["hotspot_area_px"], "hotspot_area_pct_of_roi": l["hotspot_area_pct_of_roi"],
            "bright_pixel_pct": l["bright_pixel_pct"], "centroid_x": l["centroid_x"], "centroid_y": l["centroid_y"],
        })

    return rows
