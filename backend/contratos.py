"""Contratos de datos del backend. Solo biblioteca estándar (sin dependencias).

Fuente de verdad del guion: PresentationScript con sus Slide. Cada Slide tiene un `id`
estable ("s1", "s2", ...) que luego enlaza texto, recurso visual, audio y reproducción.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict

from errores import ErrorValidacion

MAX_DIAPOSITIVAS = 20
ID_RE = re.compile(r"^[a-z0-9_-]{1,40}$")


@dataclass
class Slide:
    id: str
    orden: int
    titulo: str
    contenido: list[str]          # viñetas visibles (cortas)
    narracion: str                # texto que leerá la voz
    instrucciones_visuales: str
    duracion_estimada_s: float    # ESTIMACIÓN; la duración real sale del audio


@dataclass
class PresentationScript:
    titulo: str
    objetivo: str
    audiencia: str
    idioma: str
    estilo: str
    diapositivas: list[Slide]
    fuentes: list[str] = field(default_factory=list)
    advertencias: list[str] = field(default_factory=list)

    @property
    def num_diapositivas(self) -> int:
        return len(self.diapositivas)

    def a_dict(self) -> dict:
        d = asdict(self)
        d["num_diapositivas"] = self.num_diapositivas
        return d


# Esquema JSON que se le pide al modelo (subconjunto compatible con Gemini y Ollama).
ESQUEMA_GUION = {
    "type": "object",
    "properties": {
        "titulo": {"type": "string"},
        "objetivo": {"type": "string"},
        "audiencia": {"type": "string"},
        "idioma": {"type": "string"},
        "estilo": {"type": "string"},
        "fuentes": {"type": "array", "items": {"type": "string"}},
        "advertencias": {"type": "array", "items": {"type": "string"}},
        "diapositivas": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "contenido": {"type": "array", "items": {"type": "string"}},
                    "narracion": {"type": "string"},
                    "instrucciones_visuales": {"type": "string"},
                    "duracion_estimada_s": {"type": "number"},
                },
                "required": ["titulo", "contenido", "narracion",
                             "instrucciones_visuales", "duracion_estimada_s"],
            },
        },
    },
    "required": ["titulo", "objetivo", "audiencia", "idioma", "estilo", "diapositivas"],
}


def _texto(d: dict, clave: str, ruta: str, opcional: bool = False) -> str:
    v = d.get(clave)
    if v is None and opcional:
        return ""
    if not isinstance(v, str) or not v.strip():
        raise ErrorValidacion(f"{ruta}.{clave}: se esperaba texto no vacío")
    return v.strip()


def _lista_texto(d: dict, clave: str, ruta: str, opcional: bool = False) -> list[str]:
    v = d.get(clave)
    if v is None and opcional:
        return []
    if not isinstance(v, list) or not all(isinstance(x, str) and x.strip() for x in v):
        raise ErrorValidacion(f"{ruta}.{clave}: se esperaba lista de textos no vacíos")
    return [x.strip() for x in v]


def validar_guion(datos: object, min_diapositivas: int = 1) -> PresentationScript:
    """Valida la salida del modelo y asigna ids/orden estables. Lanza ErrorValidacion."""
    if not isinstance(datos, dict):
        raise ErrorValidacion("la respuesta no es un objeto JSON")
    laminas = datos.get("diapositivas")
    if not isinstance(laminas, list) or not laminas:
        raise ErrorValidacion("diapositivas: se esperaba una lista no vacía")
    if len(laminas) < min_diapositivas:
        raise ErrorValidacion(f"diapositivas: se pidieron al menos {min_diapositivas}, llegaron {len(laminas)}")
    if len(laminas) > MAX_DIAPOSITIVAS:
        raise ErrorValidacion(f"diapositivas: máximo {MAX_DIAPOSITIVAS}, llegaron {len(laminas)}")

    slides = []
    for i, s in enumerate(laminas, start=1):
        ruta = f"diapositivas[{i}]"
        if not isinstance(s, dict):
            raise ErrorValidacion(f"{ruta}: se esperaba un objeto")
        dur = s.get("duracion_estimada_s")
        if isinstance(dur, bool) or not isinstance(dur, (int, float)) or not (1 <= dur <= 600):
            raise ErrorValidacion(f"{ruta}.duracion_estimada_s: número entre 1 y 600")
        contenido = _lista_texto(s, "contenido", ruta)
        if len(contenido) > 6:
            raise ErrorValidacion(f"{ruta}.contenido: máximo 6 viñetas (evitar saturación)")
        slides.append(Slide(
            id=f"s{i}", orden=i,
            titulo=_texto(s, "titulo", ruta), contenido=contenido,
            narracion=_texto(s, "narracion", ruta),
            instrucciones_visuales=_texto(s, "instrucciones_visuales", ruta),
            duracion_estimada_s=float(dur)))

    return PresentationScript(
        titulo=_texto(datos, "titulo", "guion"), objetivo=_texto(datos, "objetivo", "guion"),
        audiencia=_texto(datos, "audiencia", "guion"), idioma=_texto(datos, "idioma", "guion"),
        estilo=_texto(datos, "estilo", "guion"), diapositivas=slides,
        fuentes=_lista_texto(datos, "fuentes", "guion", opcional=True),
        advertencias=_lista_texto(datos, "advertencias", "guion", opcional=True))
