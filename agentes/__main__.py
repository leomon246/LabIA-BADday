"""Correr un agente desde la terminal.

    py -m agentes                          lista los agentes disponibles
    py -m agentes presentador              pregunta el tema por teclado
    py -m agentes presentador "el teorema de Pitágoras"
"""

import sys
import webbrowser
from pathlib import Path

from . import cargar_agentes


def mostrar_evento(e: dict):
    detalle = e.get("texto") or e.get("linea") or e.get("titulo")
    if detalle:
        print(f"  [{e['agente']}] {detalle}")


def main():
    agentes = cargar_agentes()
    if len(sys.argv) < 2 or sys.argv[1] not in agentes:
        print("Agentes disponibles:")
        for nombre, mod in agentes.items():
            print(f"  {nombre:<14} {mod.DESCRIPCION}")
        print("\nUso: py -m agentes <agente> [entrada]")
        return

    agente = agentes[sys.argv[1]]
    entrada = " ".join(sys.argv[2:]).strip() or input("Entrada > ").strip()
    if not entrada:
        print("No escribiste nada.")
        return

    try:
        resultado = agente.ejecutar(entrada, emitir=mostrar_evento)
    except Exception as err:
        print("Falló el agente:", err)
        if "429" in str(err) or "RESOURCE_EXHAUSTED" in str(err):
            print("Llegaste al límite gratis de Gemini: espera un minuto y vuelve a intentar.")
        if "API key" in str(err):
            print("Define GEMINI_API_KEY (gratis en https://aistudio.google.com/apikey).")
        return

    print("Resultado:", resultado)
    ruta = Path(resultado)
    if ruta.suffix == ".html" and ruta.exists():
        webbrowser.open(ruta.resolve().as_uri())


if __name__ == "__main__":
    main()
