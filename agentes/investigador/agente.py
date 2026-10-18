"""Investigador: tema -> notas de investigación estructuradas.

Usa el backend de guiones del equipo (carpeta backend/, `generar_guion`) con su propia clave:
GEMINI_API_KEY_GUION y GEMINI_MODEL del .env (si no hay, usa GEMINI_API_KEY).
Devuelve las notas como texto, listas para pasárselas al presentador.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).parent.parent.parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))   # el backend usa imports planos (from llm import ...)

from guion import generar_guion  # noqa: E402
from llm import crear_proveedor  # noqa: E402

NOMBRE = "investigador"
DESCRIPCION = "Investiga un tema con el backend del equipo y deja notas para el presentador"
SECCIONES = 6


def proveedor():
    config = dict(os.environ)
    if config.get("GEMINI_API_KEY_GUION"):
        config["GEMINI_API_KEY"] = config["GEMINI_API_KEY_GUION"]   # cada agente con su propia clave
    return crear_proveedor(config.get("LLM_GUION", "gemini"), config)


def como_notas(g) -> str:
    """El guion del backend, escrito como notas de investigación."""
    lineas = [f"Título: {g.titulo}", f"Objetivo: {g.objetivo}", f"Audiencia: {g.audiencia}", ""]
    for s in g.diapositivas:
        lineas.append(f"{s.orden}. {s.titulo}")
        lineas += [f"   - {c}" for c in s.contenido]
        lineas.append(f"   Explicación: {s.narracion}")
    if g.advertencias:
        lineas += ["", "Advertencias (datos no confirmados):"] + [f"   - {a}" for a in g.advertencias]
    if g.fuentes:
        lineas += ["", "Fuentes:"] + [f"   - {f}" for f in g.fuentes]
    return "\n".join(lineas)


def ejecutar(entrada: str, emitir=None) -> str:
    avisar = emitir or (lambda evento: None)
    avisar({"tipo": "estado", "agente": NOMBRE, "texto": "Investigando", "animo": "work", "titulo": "Investigación"})
    avisar({"tipo": "pantalla", "agente": NOMBRE, "linea": "> " + entrada[:60]})
    guion = generar_guion(proveedor(), entrada[:500], n=SECCIONES)
    for s in guion.diapositivas:
        avisar({"tipo": "pantalla", "agente": NOMBRE, "linea": f"{s.orden}. {s.titulo}"})
    if guion.advertencias:
        avisar({"tipo": "pantalla", "agente": NOMBRE, "linea": f"! {len(guion.advertencias)} datos por confirmar"})
    avisar({"tipo": "estado", "agente": NOMBRE, "texto": "Investigación lista", "animo": "ok"})
    return como_notas(guion)
