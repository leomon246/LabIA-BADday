"""Presentador: texto -> Gemini -> presentación HTML (sin Markdown ni LaTeX).

Necesita GEMINI_API_KEY (gratis en https://aistudio.google.com/apikey), en el entorno o en el .env de la raíz.
"""

import html
import os
import re
import unicodedata
from pathlib import Path

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

NOMBRE = "presentador"
DESCRIPCION = "Convierte un tema o texto en una presentación HTML con Gemini"

# Se prueban en orden: si uno está saturado (503), pasa al siguiente.
# Cambia aquí (o pon GEMINI_MODELO en .env) si en AI Studio ves un Flash más nuevo.
MODELOS = [os.environ.get("GEMINI_MODELO", "gemini-3.8-flash"), "gemini-3.5-flash", "gemini-flash-latest"]
AQUI = Path(__file__).parent
SALIDAS = AQUI.parent.parent / "salidas" / NOMBRE


# ---------- 1. Forma exacta que debe devolver Gemini ----------

class Diapositiva(BaseModel):
    titulo: str = Field(description="Titulo corto de la diapositiva")
    puntos: list[str] = Field(description="2 a 4 ideas cortas, maximo 15 palabras cada una")
    formula: str = Field(description="Formula en texto plano con simbolos Unicode (a² + b² = c²). Vacio si no hay")
    nota: str = Field(description="Una frase de cierre o dato curioso. Vacio si no hay")


class Presentacion(BaseModel):
    titulo: str
    subtitulo: str
    diapositivas: list[Diapositiva]


INSTRUCCIONES = """Eres un profesor que arma exposiciones claras en espanol.
Tema: {tema}

Arma entre 8 y 12 diapositivas que cuenten la historia completa, en orden logico:
contexto u origen -> idea central -> desarrollo paso a paso -> ejemplo -> cierre.
Si hay matematica, muestra cada paso de la deduccion en una diapositiva distinta.

Reglas de formato:
- Nada de Markdown (sin asteriscos, sin #) y nada de LaTeX (sin $ ni barras invertidas).
- Formulas en texto plano con Unicode: ², ³, √, ·, ×, ≤, π.
- Frases cortas, como se escriben en una diapositiva, no parrafos.
"""


# ---------- 2. Llamada a Gemini ----------

def pedir_contenido(tema: str) -> Presentacion:
    cliente = genai.Client()  # lee GEMINI_API_KEY del entorno (o del .env)
    for i, modelo in enumerate(MODELOS):
        try:
            respuesta = cliente.models.generate_content(
                model=modelo,
                contents=INSTRUCCIONES.format(tema=tema),
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=Presentacion,
                ),
            )
            return respuesta.parsed
        except errors.ServerError:
            if i == len(MODELOS) - 1:
                raise


# ---------- 3. HTML (la plantilla está en plantilla.html) ----------

def armar_html(p: Presentacion) -> str:
    e = html.escape
    bloques = [
        f'<section class="slide"><div class="linea"></div>'
        f'<h1>{e(p.titulo)}</h1><p class="sub">{e(p.subtitulo)}</p></section>'
    ]
    for d in p.diapositivas:
        partes = [f"<h2>{e(d.titulo)}</h2>"]
        if d.puntos:
            items = "".join(f'<li class="frag">{e(x)}</li>' for x in d.puntos)
            partes.append(f"<ul>{items}</ul>")
        if d.formula.strip():
            partes.append(f'<div class="formula frag">{e(d.formula)}</div>')
        if d.nota.strip():
            partes.append(f'<p class="nota frag">{e(d.nota)}</p>')
        bloques.append(f'<section class="slide">{"".join(partes)}</section>')

    plantilla = (AQUI / "plantilla.html").read_text(encoding="utf-8")
    return (plantilla
            .replace("{{TITULO}}", e(p.titulo))
            .replace("{{DIAPOSITIVAS}}", "\n".join(bloques)))


def nombre_archivo(titulo: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", titulo).encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "-", sin_tildes.lower()).strip("-")[:60]
    return (base or "presentacion") + ".html"


# ---------- 4. Punto de entrada del agente ----------

def ejecutar(entrada: str, emitir=None) -> str:
    """Recibe el tema (o un texto largo) y devuelve la ruta del HTML generado."""
    avisar = emitir or (lambda evento: None)
    avisar({"tipo": "estado", "agente": NOMBRE, "texto": "Pidiendo contenido a Gemini", "animo": "work"})
    presentacion = pedir_contenido(entrada)

    SALIDAS.mkdir(parents=True, exist_ok=True)
    salida = SALIDAS / nombre_archivo(presentacion.titulo)
    salida.write_text(armar_html(presentacion), encoding="utf-8")
    avisar({"tipo": "estado", "agente": NOMBRE, "animo": "ok",
            "texto": f"Listo: {len(presentacion.diapositivas) + 1} diapositivas"})
    return str(salida)
