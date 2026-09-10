"""Limite de tasa por usuario para los endpoints del asistente que gastan
llamadas a un LLM (OWASP LLM10, consumo no acotado).

Sin esto, una cuenta valida podia encadenar peticiones a `/api/asistente/*`
tan rapido como aguantara la red y agotar la cuota de OpenAI de todo el
sistema -- la autenticacion demuestra QUIEN eres, no CUANTO puedes gastar.

Por que contando filas en la base y no con `slowapi` (o un contador en
memoria del proceso):

- Los datos ya estan. Cada turno de conversacion escribe una fila en
  `consultas` (id_usuario + fecha_hora) y cada reporte una en `reportes`
  (id_usuario + fecha_generacion). No hace falta una dependencia nueva ni una
  tabla nueva para saber cuanto gasto alguien en el ultimo minuto.
- Un contador en memoria se pierde al reiniciar el contenedor y no se
  comparte entre workers de uvicorn: con dos workers el limite real seria el
  doble del configurado. Contar en SQLite da la misma cuenta desde cualquier
  worker y sobrevive a un `docker compose restart`.

Coste: un `SELECT COUNT(*)` por peticion protegida, sobre un indice de
(id_usuario, fecha). A la escala de esta aplicacion es ruido comparado con la
llamada al LLM que esta evitando.
"""

from __future__ import annotations

import datetime as dt
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import get_db
from .deps import get_current_user

# Ventana deslizante, no un cubo por minuto de reloj: con cubos fijos alguien
# gasta el cupo entero al final de un minuto y otro entero al empezar el
# siguiente, o sea el doble del limite en dos segundos.
VENTANA = dt.timedelta(minutes=1)


def _limite_por_minuto(
    modelo,
    columna_usuario,
    columna_fecha,
    ajuste: str,
    descripcion: str,
) -> Callable[..., models.Usuario]:
    """Construye una dependencia de FastAPI que cuenta las filas de `modelo`
    de este usuario en el ultimo minuto y corta con 429 si llegan al umbral.

    `ajuste` es el NOMBRE del campo en `settings`, no su valor: asi se lee en
    cada peticion y un cambio de configuracion (o un `monkeypatch` en las
    pruebas) surte efecto sin reimportar el modulo.

    Devuelve el usuario autenticado para que el endpoint sustituya su
    `Depends(get_current_user)` por esta dependencia en vez de acumular las
    dos. FastAPI cachea `get_current_user` dentro de la misma peticion, asi
    que el token se valida una sola vez de todos modos.
    """

    def dependencia(
        db: Session = Depends(get_db),
        usuario: models.Usuario = Depends(get_current_user),
    ) -> models.Usuario:
        maximo = int(getattr(settings, ajuste))
        # Un maximo de 0 o negativo NO desactiva el control: deja pasar cero
        # peticiones. Es deliberado -- si alguien se equivoca configurandolo,
        # el asistente deja de responder y se nota enseguida, en vez de quedar
        # abierto de par en par sin que nadie lo vea.
        desde = dt.datetime.now(dt.timezone.utc) - VENTANA
        recientes = int(
            db.scalar(
                select(func.count())
                .select_from(modelo)
                .where(columna_usuario == usuario.id_usuario, columna_fecha >= desde)
            )
            or 0
        )
        if recientes >= maximo:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Limite alcanzado: maximo {maximo} {descripcion} por minuto. "
                    "Espera un momento antes de volver a intentarlo."
                ),
                # Segundos, no una fecha HTTP: la ventana es deslizante, asi
                # que 60 s es el peor caso hasta que caduque la fila mas vieja.
                headers={"Retry-After": str(int(VENTANA.total_seconds()))},
            )
        return usuario

    return dependencia


# Preguntas (voz y texto): cada una cuesta una respuesta corta -- y en la via
# de voz, ademas, una transcripcion y una sintesis de audio.
limite_preguntas = _limite_por_minuto(
    models.Consulta,
    models.Consulta.id_usuario,
    models.Consulta.fecha_hora,
    "asistente_max_preguntas_por_minuto",
    "preguntas al asistente",
)

# Reportes: mas estricto porque cada uno cuesta una redaccion larga del LLM
# (hasta `openai_max_tokens_reporte`) mas el renderizado del PDF y su
# escritura en disco.
limite_reportes = _limite_por_minuto(
    models.Reporte,
    models.Reporte.id_usuario,
    models.Reporte.fecha_generacion,
    "asistente_max_reportes_por_minuto",
    "reportes generados",
)
