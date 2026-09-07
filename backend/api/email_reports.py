"""Resumen diario de actividad de una cuenta, enviado por correo via SMTP.

Dos piezas separadas a proposito:
  - `construir_resumen()` solo LEE la base de datos y arma un dict simple,
    sin nada de HTML ni de red -- asi se puede probar/depurar sin mandar un
    correo de verdad.
  - `enviar_resumen_diario()` arma el HTML a partir de ese resumen y lo manda
    por `smtplib` (SMTP puro, sin ningun proveedor transaccional por API, tal
    como lo pidio el profesor).

Quien llama decide si el envio "cuenta" para `ultima_fecha_enviada` (ver
`main.py::_reportes_email_periodico`, el envio automatico de cada minuto) o
no (ver `routers/configuracion.py::probar_configuracion`, el boton "probar
ahora" del frontend, que manda el mismo correo sin marcar el dia como ya
enviado).
"""

from __future__ import annotations

import datetime as dt
import logging
import smtplib
from dataclasses import dataclass, field
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .config import settings

logger = logging.getLogger("api.email_reports")


@dataclass
class ResumenActividad:
    fecha_local: dt.date
    correo_cuenta: str
    nombre_cuenta: str
    consultas: list[models.Consulta] = field(default_factory=list)
    reportes: list[models.Reporte] = field(default_factory=list)
    hallazgos: list[tuple[models.Recomendacion, str | None]] = field(default_factory=list)  # (recomendacion, nombre_zona)
    total_detecciones: int = 0
    detecciones_ocupado: int = 0


def zona_horaria() -> ZoneInfo:
    try:
        return ZoneInfo(settings.app_timezone)
    except Exception:  # noqa: BLE001 - un nombre de zona invalido en .env no debe tumbar el hilo de fondo.
        logger.warning("APP_TIMEZONE=%r no es una zona horaria valida; se usa UTC.", settings.app_timezone)
        return ZoneInfo("UTC")


def _rango_utc_del_dia_local(fecha_local: dt.date, tz: ZoneInfo) -> tuple[dt.datetime, dt.datetime]:
    inicio_local = dt.datetime.combine(fecha_local, dt.time.min, tzinfo=tz)
    fin_local = inicio_local + dt.timedelta(days=1)
    return inicio_local.astimezone(dt.timezone.utc), fin_local.astimezone(dt.timezone.utc)


def construir_resumen(db: Session, usuario: models.Usuario, fecha_local: dt.date, tz: ZoneInfo) -> ResumenActividad:
    """Lo que hizo ESTA cuenta ese dia (consultas al asistente, reportes que
    generó) mas lo que SELENE encontró en el sistema ese mismo dia (alertas de
    derroche y cuantas detecciones registró) -- las detecciones no se pueden
    atribuir a una cuenta porque `detecciones_ocupacion` no guarda quien
    monitoreaba (ver `luminarias-las-detecta-selene`: se monitorea una sala,
    no una sesion de un usuario)."""
    inicio_utc, fin_utc = _rango_utc_del_dia_local(fecha_local, tz)

    consultas = db.scalars(
        select(models.Consulta)
        .where(
            models.Consulta.id_usuario == usuario.id_usuario,
            models.Consulta.fecha_hora >= inicio_utc,
            models.Consulta.fecha_hora < fin_utc,
        )
        .order_by(models.Consulta.fecha_hora)
    ).all()

    reportes = db.scalars(
        select(models.Reporte)
        .where(
            models.Reporte.id_usuario == usuario.id_usuario,
            models.Reporte.fecha_generacion >= inicio_utc,
            models.Reporte.fecha_generacion < fin_utc,
        )
        .order_by(models.Reporte.fecha_generacion)
    ).all()

    recomendaciones = db.scalars(
        select(models.Recomendacion)
        .where(
            models.Recomendacion.fecha_hora >= inicio_utc,
            models.Recomendacion.fecha_hora < fin_utc,
        )
        .order_by(models.Recomendacion.fecha_hora)
    ).all()
    zonas_por_id = {z.id_zona: z.nombre for z in db.scalars(select(models.Zona)).all()}
    hallazgos = [(r, zonas_por_id.get(r.id_zona) if r.id_zona else None) for r in recomendaciones]

    total_detecciones = db.scalar(
        select(func.count())
        .select_from(models.DeteccionOcupacion)
        .where(
            models.DeteccionOcupacion.fecha_hora >= inicio_utc,
            models.DeteccionOcupacion.fecha_hora < fin_utc,
        )
    ) or 0
    detecciones_ocupado = db.scalar(
        select(func.count())
        .select_from(models.DeteccionOcupacion)
        .where(
            models.DeteccionOcupacion.fecha_hora >= inicio_utc,
            models.DeteccionOcupacion.fecha_hora < fin_utc,
            models.DeteccionOcupacion.estado_ocupacion == "ocupado",
        )
    ) or 0

    return ResumenActividad(
        fecha_local=fecha_local,
        correo_cuenta=usuario.correo,
        nombre_cuenta=usuario.nombre,
        consultas=list(consultas),
        reportes=list(reportes),
        hallazgos=hallazgos,
        total_detecciones=total_detecciones,
        detecciones_ocupado=detecciones_ocupado,
    )


def _hora_local(momento: dt.datetime, tz: ZoneInfo) -> str:
    return momento.astimezone(tz).strftime("%H:%M")


def _fila(*celdas: str) -> str:
    tds = "".join(f'<td style="padding:6px 10px;border-bottom:1px solid #e8e2d8;font-size:13px;">{c}</td>' for c in celdas)
    return f"<tr>{tds}</tr>"


def _tabla(encabezados: list[str], filas: list[str]) -> str:
    ths = "".join(
        f'<th style="text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;'
        f'letter-spacing:.08em;color:#8a8272;border-bottom:1px solid #d8d2c4;">{h}</th>'
        for h in encabezados
    )
    return (
        '<table style="width:100%;border-collapse:collapse;margin:8px 0 20px;">'
        f"<thead><tr>{ths}</tr></thead><tbody>{''.join(filas)}</tbody></table>"
    )


def _titulo_html(texto: str) -> str:
    return (
        '<h3 style="margin:0 0 4px;font-size:13px;text-transform:uppercase;'
        f'letter-spacing:.1em;color:#5a5445;">{texto}</h3>'
    )


def _vacio_html(texto: str) -> str:
    return f'<p style="font-size:13px;color:#8a8272;margin:0 0 20px;">{texto}</p>'


def construir_html(resumen: ResumenActividad, tz: ZoneInfo) -> str:
    """Cuatro secciones, SIEMPRE las cuatro: consultas y reportes son de ESTA
    cuenta (si no hizo ninguno, la seccion lo dice), hallazgos y monitoreo son
    del sistema entero (`detecciones_ocupacion`/`recomendaciones` no guardan
    que cuenta monitoreaba, ver el docstring de `construir_resumen`) y por eso
    van aparte, con su propio "no hubo nada" -- nunca un solo mensaje
    combinado que mezclaria "esta cuenta no hizo nada" con "el sistema
    tampoco encontró nada", que son dos hechos distintos."""
    fecha_str = resumen.fecha_local.strftime("%d/%m/%Y")
    secciones = ""

    secciones += _titulo_html("Consultas al asistente")
    if resumen.consultas:
        filas = [_fila(_hora_local(c.fecha_hora, tz), (c.pregunta or "")[:140]) for c in resumen.consultas]
        secciones += _tabla(["Hora", "Pregunta"], filas)
    else:
        secciones += _vacio_html(f"Esta cuenta no hizo consultas al asistente el {fecha_str}.")

    secciones += _titulo_html("Reportes generados")
    if resumen.reportes:
        filas = [_fila(_hora_local(r.fecha_generacion, tz), r.tipo_reporte, r.periodo) for r in resumen.reportes]
        secciones += _tabla(["Hora", "Tipo", "Periodo"], filas)
    else:
        secciones += _vacio_html(f"Esta cuenta no generó reportes el {fecha_str}.")

    secciones += _titulo_html("Hallazgos del sistema")
    if resumen.hallazgos:
        filas = [
            _fila(_hora_local(r.fecha_hora, tz), zona or "sin sala", r.recomendacion, r.prioridad)
            for r, zona in resumen.hallazgos
        ]
        secciones += _tabla(["Hora", "Sala", "Hallazgo", "Prioridad"], filas)
    else:
        secciones += _vacio_html(f"SELENE no encontró hallazgos (alertas de derroche) el {fecha_str}.")

    secciones += _titulo_html("Monitoreo")
    if resumen.total_detecciones:
        secciones += _vacio_html(
            f"SELENE registró {resumen.total_detecciones} detección(es) el {fecha_str}, "
            f"{resumen.detecciones_ocupado} con ocupación."
        )
    else:
        secciones += _vacio_html(f"SELENE no registró monitoreos el {fecha_str}.")

    return f"""
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:640px;margin:0 auto;padding:24px;color:#221f1a;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:.18em;color:#a08a4a;margin:0 0 6px;">selene · resumen diario</p>
      <h1 style="font-size:22px;font-weight:normal;margin:0 0 18px;">Actividad del {fecha_str}</h1>
      <p style="font-size:12px;color:#8a8272;margin:0 0 24px;">Cuenta: {resumen.nombre_cuenta} &lt;{resumen.correo_cuenta}&gt;</p>
      {secciones}
      <p style="margin-top:28px;font-size:11px;color:#a29c8c;">
        selene · detecta, calcula y avisa · nunca acciona una luminaria.<br>
        Puedes cambiar la hora o el correo de este resumen, o desactivarlo, desde la aplicación.
      </p>
    </div>
    """


def construir_texto_plano(resumen: ResumenActividad, tz: ZoneInfo) -> str:
    """Mismo criterio que `construir_html`: cuatro secciones siempre
    presentes, cada una con su propio "no hubo nada" cuando aplica."""
    fecha_str = resumen.fecha_local.strftime("%d/%m/%Y")
    lineas = [f"SELENE · resumen del {fecha_str}", f"Cuenta: {resumen.correo_cuenta}", ""]

    lineas.append("Consultas al asistente:")
    if resumen.consultas:
        lineas += [f"  {_hora_local(c.fecha_hora, tz)} - {(c.pregunta or '')[:140]}" for c in resumen.consultas]
    else:
        lineas.append(f"  Esta cuenta no hizo consultas al asistente el {fecha_str}.")
    lineas.append("")

    lineas.append("Reportes generados:")
    if resumen.reportes:
        lineas += [f"  {_hora_local(r.fecha_generacion, tz)} - {r.tipo_reporte} ({r.periodo})" for r in resumen.reportes]
    else:
        lineas.append(f"  Esta cuenta no generó reportes el {fecha_str}.")
    lineas.append("")

    lineas.append("Hallazgos del sistema:")
    if resumen.hallazgos:
        lineas += [
            f"  {_hora_local(r.fecha_hora, tz)} - [{r.prioridad}] {zona or 'sin sala'}: {r.recomendacion}"
            for r, zona in resumen.hallazgos
        ]
    else:
        lineas.append(f"  SELENE no encontró hallazgos (alertas de derroche) el {fecha_str}.")
    lineas.append("")

    if resumen.total_detecciones:
        lineas.append(
            f"Monitoreo: {resumen.total_detecciones} detección(es), "
            f"{resumen.detecciones_ocupado} con ocupación."
        )
    else:
        lineas.append(f"Monitoreo: SELENE no registró monitoreos el {fecha_str}.")

    return "\n".join(lineas)


def enviar_correo_smtp(destinatario: str, asunto: str, html: str, texto: str) -> None:
    if not settings.smtp_configurado:
        raise RuntimeError(
            "El envío de correo no está configurado en el servidor (faltan SMTP_HOST/SMTP_USER/SMTP_PASSWORD)."
        )

    mensaje = EmailMessage()
    mensaje["Subject"] = asunto
    mensaje["From"] = settings.smtp_from_effective
    mensaje["To"] = destinatario
    mensaje.set_content(texto)
    mensaje.add_alternative(html, subtype="html")

    if settings.smtp_use_tls:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.starttls()
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(mensaje)
    else:
        with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(mensaje)


def enviar_resumen_diario(
    db: Session, usuario: models.Usuario, correo_destino: str, fecha_local: dt.date | None = None,
) -> None:
    """Arma y manda el resumen del dia indicado (por defecto, hoy en
    `settings.app_timezone`). No toca `ConfiguracionReporteEmail` -- eso lo
    decide quien llama (ver el docstring del modulo)."""
    tz = zona_horaria()
    fecha_local = fecha_local or dt.datetime.now(tz).date()

    resumen = construir_resumen(db, usuario, fecha_local, tz)
    html = construir_html(resumen, tz)
    texto = construir_texto_plano(resumen, tz)
    asunto = f"SELENE · resumen del {fecha_local.strftime('%d/%m/%Y')}"

    enviar_correo_smtp(correo_destino, asunto, html, texto)
