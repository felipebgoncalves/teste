"""Consulta de chuva para a Vercel Function /api/chuva."""

import json
import os
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen


TOKEN_URL = os.environ.get(
    "SIMET_TOKEN_URL",
    os.environ.get(
        "keycloak_token",
        "https://sistemas.cb.es.gov.br/keycloak/realms/sistemas-cepdec/protocol/openid-connect/token",
    ),
)
BASE_URL = os.environ.get("SIMET_BASE_URL") or os.environ.get("simet_url") or "https://sistemas.cb.es.gov.br/simet-api/"
CLIENT_ID = os.environ.get("SIMET_CLIENT_ID") or os.environ.get("client_id")
CLIENT_SECRET = os.environ.get("SIMET_CLIENT_SECRET") or os.environ.get("client_secret")
API_KEY = os.environ.get("SIMET_API_KEY") or os.environ.get("X_API_Key")
_token = None
_token_expira = 0.0


class UpstreamHTTPError(Exception):
    def __init__(self, origem, codigo, tipo=""):
        super().__init__(f"{origem} HTTP {codigo}")
        self.origem = origem
        self.codigo = codigo
        self.tipo = tipo


def _access_token():
    global _token, _token_expira
    if _token and time.time() < _token_expira:
        return _token
    body = urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }
    ).encode()
    request = Request(
        TOKEN_URL,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            result = json.load(response)
    except HTTPError as error:
        tipo = (error.headers.get("Content-Type") or "").split(";")[0].lower()
        raise UpstreamHTTPError("Keycloak", error.code, tipo) from error
    _token = result["access_token"]
    _token_expira = time.time() + max(30, int(result.get("expires_in", 300)) - 30)
    return _token


def _simet_get(path, params=None):
    global _token, _token_expira
    url = urljoin(BASE_URL.rstrip("/") + "/", path)
    if params:
        url += "?" + urlencode(params)
    for attempt in range(2):
        request = Request(
            url,
            headers={
                "Authorization": "Bearer " + _access_token(),
                "X-API-Key": API_KEY,
                "Accept": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code == 401 and attempt == 0:
                _token, _token_expira = None, 0.0
                continue
            raise UpstreamHTTPError("SIMET", error.code) from error


def _utc_string(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


def chuva():
    fim = datetime.now(timezone.utc)
    inicio = fim - timedelta(hours=24)
    estacoes = _simet_get("v1/estacoes")
    por_codigo = {
        item["codigo"]: {
            "codigo": item["codigo"],
            "nome": item["nome"],
            "municipio": item["municipio"],
            "total24h": 0.0,
            "chuvaRecente": None,
            "ultimaLeitura": None,
            "medicoes": 0,
        }
        for item in estacoes
    }
    vistos = set()
    cursor = None
    paginas = 0
    while True:
        params = {
            "inicio_utc": _utc_string(inicio),
            "fim_utc": _utc_string(fim),
            "variavel": "PRECIPITACAO_MM",
            "intervalo_minutos": 15,
            "limite": 500,
        }
        if cursor:
            params["cursor"] = cursor
        pagina = _simet_get("v1/observacoes", params)
        for item in pagina.get("items", []):
            codigo = item.get("estacao_codigo")
            horario = item.get("data_hora_utc")
            valor = (item.get("dados") or {}).get("PRECIPITACAO_MM")
            estacao = por_codigo.get(codigo)
            chave = (codigo, horario)
            if estacao is None or not isinstance(valor, (int, float)) or isinstance(valor, bool) or chave in vistos:
                continue
            vistos.add(chave)
            estacao["total24h"] += valor
            estacao["medicoes"] += 1
            if estacao["ultimaLeitura"] is None or horario > estacao["ultimaLeitura"]:
                estacao["ultimaLeitura"] = horario
                estacao["chuvaRecente"] = valor
        cursor = pagina.get("next_cursor")
        paginas += 1
        if paginas > 1000:
            raise RuntimeError("Limite de paginação excedido")
        if not cursor:
            break
    for estacao in por_codigo.values():
        estacao["total24h"] = round(estacao["total24h"], 2)
    return {
        "inicioUtc": _utc_string(inicio),
        "fimUtc": _utc_string(fim),
        "estacoes": list(por_codigo.values()),
        "paginas": paginas,
    }


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not all((CLIENT_ID, CLIENT_SECRET, API_KEY)):
            self._json(503, {"erro": "Configure as credenciais da API SIMET na Vercel."})
            return
        try:
            self._json(200, chuva())
        except UpstreamHTTPError as error:
            detalhe = " (resposta HTML)" if error.tipo == "text/html" else ""
            self._json(error.codigo, {"erro": f"{error.origem} respondeu com HTTP {error.codigo}{detalhe}."})
        except Exception:
            self._json(502, {"erro": "Não foi possível consultar a API SIMET."})

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
