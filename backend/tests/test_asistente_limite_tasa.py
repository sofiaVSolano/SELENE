"""Limite de tasa del asistente (OWASP LLM10, consumo no acotado).

POR QUE existe esta suite: la autenticacion demuestra QUIEN pide, no CUANTO
puede gastar. Antes de `api/rate_limit.py`, una cuenta valida podia encadenar
peticiones a `/api/asistente/*` tan rapido como aguantara la red; cada una
gasta llamadas a OpenAI que se pagan de verdad, asi que un bucle de unas
lineas vaciaba la cuota de todo el sistema sin explotar ningun fallo.

Ninguna prueba sale a la red y ninguna necesita una clave de OpenAI: el
limite vive en una DEPENDENCIA de FastAPI, o sea que se evalua ANTES del
cuerpo del endpoint. Se prepara el gasto reciente escribiendo directamente en
`consultas`/`reportes` (que es justo lo que el contador lee) y se comprueba
que la peticion muere en el 429 sin llegar al modelo. Cuando lo que se quiere
probar es que SI pasa el limite, la marca es un 503: con `GPT_API_KEY` vacio
(ver conftest.py) el endpoint llega hasta el cliente de OpenAI y se rinde
ahi -- prueba de que atraveso el contador.
"""

from __future__ import annotations

import datetime as dt
import uuid

import pytest

pytestmark = pytest.mark.lento


def _gastar_preguntas(db, id_usuario, cuantas: int, hace_segundos: int = 0) -> None:
    """Simula `cuantas` preguntas ya atendidas para ese usuario."""
    from api import models

    momento = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=hace_segundos)
    for i in range(cuantas):
        db.add(models.Consulta(
            id_usuario=uuid.UUID(id_usuario),
            pregunta=f"pregunta de relleno {i}",
            respuesta="respuesta de relleno",
            fecha_hora=momento,
        ))
    db.commit()


def _gastar_reportes(db, id_usuario, cuantos: int, hace_segundos: int = 0) -> None:
    from api import models

    momento = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=hace_segundos)
    for i in range(cuantos):
        db.add(models.Reporte(
            id_usuario=uuid.UUID(id_usuario),
            fecha_generacion=momento,
            tipo_reporte="general",
            clave_reporte="general",
            periodo="periodo de relleno",
            ruta_archivo=f"reports/asistente/relleno-{i}.pdf",
        ))
    db.commit()


@pytest.fixture
def umbrales_bajos(monkeypatch):
    """Baja los umbrales a 2 preguntas y 1 reporte por minuto.

    Se toca `settings` en caliente en vez de usar los valores de produccion
    por dos razones: las pruebas no dependen de que alguien afine el numero en
    `config.py` (si sube a 50, la prueba seguiria valiendo), y de paso se
    comprueba lo que promete `_limite_por_minuto` -- que lee el umbral en cada
    peticion, no una sola vez al importar el modulo.
    """
    from api.config import settings

    monkeypatch.setattr(settings, "asistente_max_preguntas_por_minuto", 2)
    monkeypatch.setattr(settings, "asistente_max_reportes_por_minuto", 1)
    return settings


def test_la_pregunta_de_mas_recibe_429(client, auth, usuario_nuevo, db, umbrales_bajos):
    """Llegado el umbral, el turno siguiente se corta ANTES de gastar tokens.

    Es el caso que define el control: sin el, esta misma peticion habria
    llamado a OpenAI igual que las dos anteriores.
    """
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 2)

    respuesta = client.post(
        "/api/asistente/preguntar-texto",
        json={"pregunta": "Cuanto consumi hoy?"},
        headers=auth,
    )
    assert respuesta.status_code == 429, respuesta.text


def test_por_debajo_del_umbral_la_pregunta_sigue_su_curso(client, auth, usuario_nuevo, db, umbrales_bajos):
    """Un limite que corta de mas es una caida de servicio, no un control.

    Con una sola pregunta gastada de un cupo de dos, la peticion tiene que
    ATRAVESAR el contador. El 503 es exactamente esa prueba: solo se llega a
    el dentro del cuerpo del endpoint, al encontrar `GPT_API_KEY` vacio.
    """
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 1)

    respuesta = client.post(
        "/api/asistente/preguntar-texto",
        json={"pregunta": "Cuanto consumi hoy?"},
        headers=auth,
    )
    assert respuesta.status_code == 503, respuesta.text


def test_la_respuesta_429_dice_cuanto_esperar(client, auth, usuario_nuevo, db, umbrales_bajos):
    """Sin `Retry-After`, un cliente razonable no tiene mas remedio que
    reintentar a ciegas -- justo el trafico que el limite intenta evitar."""
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 2)

    respuesta = client.post(
        "/api/asistente/preguntar-texto",
        json={"pregunta": "Hola"},
        headers=auth,
    )
    assert respuesta.status_code == 429
    assert respuesta.headers["Retry-After"] == "60"
    assert "2" in respuesta.json()["detail"]  # dice cual es el umbral que se alcanzo


def test_el_cupo_es_de_cada_usuario_y_no_del_sistema(client, auth, usuario_nuevo, db, umbrales_bajos):
    """Un contador global convertiria el control en un ataque de denegacion:
    una cuenta agotando su cupo dejaria sin asistente a todas las demas."""
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 5)  # muy pasado de su cupo

    correo_otro = "otro-" + uuid.uuid4().hex[:12] + "@selene.app"
    otro = client.post(
        "/api/auth/register",
        json={"nombre": "Otra Persona", "correo": correo_otro, "contrasena": "ClaveDePrueba123"},
    )
    assert otro.status_code == 201
    auth_otro = {"Authorization": "Bearer " + otro.json()["access_token"]}

    respuesta = client.post(
        "/api/asistente/preguntar-texto",
        json={"pregunta": "Y yo cuanto consumi?"},
        headers=auth_otro,
    )
    assert respuesta.status_code != 429, respuesta.text


def test_el_gasto_de_hace_mas_de_un_minuto_ya_no_cuenta(client, auth, usuario_nuevo, db, umbrales_bajos):
    """La ventana es deslizante: el cupo se recupera solo.

    Si el contador mirara todo el historial en vez del ultimo minuto, quien
    usara el asistente a diario acabaria bloqueado para siempre.
    """
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 5, hace_segundos=90)

    respuesta = client.post(
        "/api/asistente/preguntar-texto",
        json={"pregunta": "Cuanto consumi hoy?"},
        headers=auth,
    )
    assert respuesta.status_code != 429, respuesta.text


def test_el_reporte_se_corta_al_llegar_a_su_umbral(client, auth, usuario_nuevo, db, umbrales_bajos):
    """Generar un reporte es la peticion mas cara del asistente (una redaccion
    larga del LLM + el renderizado del PDF + su escritura en disco), asi que
    es la que mas importa cortar antes de empezar."""
    _gastar_reportes(db, usuario_nuevo["usuario"]["id_usuario"], 1)

    respuesta = client.post(
        "/api/asistente/reporte",
        json={"clave_reporte": "general"},
        headers=auth,
    )
    assert respuesta.status_code == 429, respuesta.text


def test_preguntar_y_generar_reportes_no_comparten_cupo(client, auth, usuario_nuevo, db, umbrales_bajos):
    """Cada endpoint cuenta su propia tabla (`consultas` vs. `reportes`).

    Deja constancia de la decision: conversar mucho no debe impedir descargar
    un reporte, ni al reves. Son dos presupuestos distintos porque cuestan
    cosas distintas.
    """
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 5)  # cupo de preguntas agotado

    respuesta = client.post(
        "/api/asistente/reporte",
        json={"clave_reporte": "general"},
        headers=auth,
    )
    assert respuesta.status_code != 429, respuesta.text


def test_el_reporte_es_mas_estricto_que_la_pregunta():
    """Los valores por defecto de `config.py`, no los de la fixture.

    El orden entre los dos umbrales es una decision de diseno, no un numero
    afinable: si alguien sube el de reportes por encima del de preguntas, el
    endpoint caro queda mas suelto que el barato y esta prueba lo dice.
    """
    from api.config import Settings

    por_defecto = Settings()
    assert 0 < por_defecto.asistente_max_reportes_por_minuto < por_defecto.asistente_max_preguntas_por_minuto


def test_las_rutas_de_solo_lectura_no_gastan_cupo(client, auth, usuario_nuevo, db, umbrales_bajos):
    """El limite protege las llamadas al LLM, no la lectura de la base.

    `/historial` no gasta tokens: leerlo mientras el cupo de preguntas esta
    agotado tiene que seguir funcionando, o el usuario se queda sin ver ni lo
    que ya pregunto.
    """
    _gastar_preguntas(db, usuario_nuevo["usuario"]["id_usuario"], 5)

    respuesta = client.get("/api/asistente/historial", headers=auth)
    assert respuesta.status_code == 200
    assert len(respuesta.json()) == 5
