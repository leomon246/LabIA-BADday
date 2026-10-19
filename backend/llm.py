"""Adaptadores de LLM intercambiables: Gemini (API) y Ollama (local).

Interfaz: ProveedorLLM.generar_json(sistema, usuario, esquema) -> objeto Python (dict).
El proveedor se elige por variable de entorno (ver .env.example); nada de claves en el código.
"""
from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request

from errores import ErrorConectividad, ErrorConfiguracion, ErrorProveedor, ErrorValidacion


class ProveedorLLM:
    nombre = "base"

    def generar_json(self, sistema: str, usuario: str, esquema: dict) -> dict:
        raise NotImplementedError


def _post_json(url: str, cuerpo: dict, cabeceras: dict, timeout: float, quien: str) -> dict:
    req = urllib.request.Request(url, data=json.dumps(cuerpo).encode("utf-8"),
                                 headers={"Content-Type": "application/json", **cabeceras}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalle = e.read().decode("utf-8", "replace")[:300]   # la clave va en cabecera, no en la URL
        if e.code in (401, 403):
            raise ErrorConfiguracion(f"{quien}: credenciales rechazadas (HTTP {e.code}). {detalle}") from e
        if e.code == 429:
            err = ErrorProveedor(f"{quien}: cuota o límite de peticiones agotado (HTTP 429). {detalle}"); err.codigo = 429
            raise err from e
        err = ErrorProveedor(f"{quien}: HTTP {e.code}. {detalle}"); err.codigo = e.code
        raise err from e
    except (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError) as e:
        raise ErrorConectividad(f"{quien}: no se pudo conectar ({e})") from e
    except json.JSONDecodeError as e:
        raise ErrorProveedor(f"{quien}: respuesta no es JSON válido") from e


def _parsear_json(texto: str, quien: str) -> dict:
    t = texto.strip()
    if t.startswith("```"):                       # algunos modelos envuelven en ```json
        t = t.strip("`")
        t = t[4:] if t.lower().startswith("json") else t
    try:
        return json.loads(t)
    except json.JSONDecodeError as e:
        raise ErrorValidacion(f"{quien}: el modelo no devolvió JSON válido ({e.msg})") from e


class Gemini(ProveedorLLM):
    nombre = "gemini"

    def __init__(self, api_key: str, modelo: str, timeout: float = 75, respaldos: tuple = ()):
        if not api_key:
            raise ErrorConfiguracion("Falta GEMINI_API_KEY (ver .env.example)")
        self.api_key, self.modelo, self.timeout, self.respaldos = api_key, modelo, timeout, tuple(respaldos)

    def generar_json(self, sistema, usuario, esquema):
        """Si el modelo está saturado (503) o sin cuota (429), prueba los de respaldo en orden."""
        ultimo = None
        for modelo in (self.modelo, *self.respaldos):
            try:
                return self._generar(modelo, sistema, usuario, esquema)
            except (ErrorProveedor, ErrorConectividad) as e:
                if isinstance(e, ErrorProveedor) and getattr(e, "codigo", None) not in (429, 500, 503, 404):
                    raise
                ultimo = e          # saturado, sin cuota, sin modelo o timeout: siguiente modelo
        raise ultimo

    def _generar(self, modelo, sistema, usuario, esquema):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"
        cuerpo = {
            "systemInstruction": {"parts": [{"text": sistema}]},
            "contents": [{"role": "user", "parts": [{"text": usuario}]}],
            "generationConfig": {"responseMimeType": "application/json",
                                 "responseSchema": esquema, "temperature": 0.6},
        }
        r = _post_json(url, cuerpo, {"x-goog-api-key": self.api_key}, self.timeout, "Gemini")
        try:
            cand = r["candidates"][0]
            texto = "".join(p.get("text", "") for p in cand["content"]["parts"])
        except (KeyError, IndexError, TypeError) as e:
            motivo = (r.get("promptFeedback") or {}).get("blockReason", "respuesta sin candidatos")
            raise ErrorProveedor(f"Gemini: sin contenido utilizable ({motivo})") from e
        if not texto.strip():
            raise ErrorProveedor(f"Gemini: texto vacío (finishReason={cand.get('finishReason')})")
        return _parsear_json(texto, "Gemini")


class Ollama(ProveedorLLM):
    nombre = "ollama"

    def __init__(self, host: str, modelo: str, timeout: float = 300):
        if not modelo:
            raise ErrorConfiguracion("Falta OLLAMA_MODEL (ver .env.example)")
        self.host, self.modelo, self.timeout = host.rstrip("/"), modelo, timeout

    def generar_json(self, sistema, usuario, esquema):
        cuerpo = {"model": self.modelo, "stream": False, "format": esquema,
                  "options": {"temperature": 0.4},
                  "messages": [{"role": "system", "content": sistema},
                               {"role": "user", "content": usuario}]}
        r = _post_json(f"{self.host}/api/chat", cuerpo, {}, self.timeout, "Ollama")
        texto = (r.get("message") or {}).get("content", "")
        if not texto.strip():
            raise ErrorProveedor("Ollama: respuesta vacía (¿modelo descargado? `ollama pull <modelo>`)")
        return _parsear_json(texto, "Ollama")


def crear_proveedor(nombre: str, env=os.environ) -> ProveedorLLM:
    if nombre == "gemini":
        respaldos = tuple(m.strip() for m in env.get("GEMINI_MODEL_RESPALDO", "gemini-3-flash-preview,gemini-3.1-flash-lite").split(",") if m.strip())
        return Gemini(env.get("GEMINI_API_KEY", ""), env.get("GEMINI_MODEL", "gemini-2.5-flash").strip(), timeout=float(env.get("GEMINI_TIMEOUT_S", "50")), respaldos=respaldos)
    if nombre == "ollama":
        return Ollama(env.get("OLLAMA_HOST", "http://localhost:11434"), env.get("OLLAMA_MODEL", ""))
    raise ErrorConfiguracion(f"Proveedor LLM desconocido: '{nombre}' (usa gemini u ollama)")
