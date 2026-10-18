"""Generación del guion: idea -> PresentationScript validado (con un reintento corregido)."""
from __future__ import annotations

from contratos import ESQUEMA_GUION, PresentationScript, validar_guion
from errores import ErrorValidacion
from llm import ProveedorLLM

SISTEMA = (
    "Eres un guionista de presentaciones educativas. Respondes SOLO con JSON que cumple el esquema dado. "
    "No inventes cifras ni fuentes: si no estás seguro de un dato, dilo en 'advertencias'. "
    "No tienes acceso a internet; deja 'fuentes' vacío salvo referencias generales que conozcas con certeza. "
    "Cada diapositiva: título corto, 2 a 4 viñetas breves, narración natural para leer en voz alta "
    "(30 a 70 palabras), instrucciones visuales concretas (qué imagen, diagrama o gráfico mostrar) y "
    "duración estimada en segundos."
)


def _pedido(idea: str, n: int, idioma: str) -> str:
    return (f"Idea del usuario: {idea}\n"
            f"Crea una presentación de {n} diapositivas en idioma: {idioma}. "
            f"Incluye apertura y cierre. Define título, objetivo, audiencia y estilo narrativo.")


def generar_guion(proveedor: ProveedorLLM, idea: str, n: int = 6, idioma: str = "español") -> PresentationScript:
    idea = (idea or "").strip()
    if not idea:
        raise ErrorValidacion("La idea está vacía")
    if len(idea) > 500:
        raise ErrorValidacion("La idea es demasiado larga (máximo 500 caracteres)")
    if not (2 <= n <= 12):
        raise ErrorValidacion("n debe estar entre 2 y 12")

    pedido = _pedido(idea, n, idioma)
    try:
        return validar_guion(proveedor.generar_json(SISTEMA, pedido, ESQUEMA_GUION), min_diapositivas=2)
    except ErrorValidacion as primero:
        # Un solo reintento controlado, diciéndole al modelo qué falló.
        correccion = f"{pedido}\n\nTu respuesta anterior fue inválida: {primero}. Corrígela y responde solo el JSON."
        return validar_guion(proveedor.generar_json(SISTEMA, correccion, ESQUEMA_GUION), min_diapositivas=2)
