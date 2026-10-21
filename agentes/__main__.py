"""Correr un agente desde la terminal.

    py -m agentes                          lista los agentes disponibles
    py -m agentes presentador              pregunta el tema por teclado
    py -m agentes presentador "el teorema de Pitágoras"
    py -m agentes preguntar                pregunta al equipo en el laboratorio (con el servidor corriendo)
    py -m agentes preguntar "por qué el cielo es azul"
"""

import os
import sys
import webbrowser
from pathlib import Path

from . import cargar_agentes


def mostrar_evento(e: dict):
    detalle = e.get("texto") or e.get("linea") or e.get("titulo")
    if detalle:
        print(f"  [{e['agente']}] {detalle}")


def preguntar(temas: list[str]):
    """Le manda preguntas al servidor que ya está corriendo; se ven en todos los navegadores
    conectados (el Quest incluido). Sin tema, queda esperando preguntas una tras otra."""
    import json
    import urllib.error
    import urllib.request
    puerto = os.environ.get("PUERTO", "8000")

    def enviar(tema: str):
        pedido = urllib.request.Request(f"http://localhost:{puerto}/api/preguntar", method="POST",
                                        data=json.dumps({"tema": tema}).encode("utf-8"),
                                        headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(pedido, timeout=10):
                print(f"  Enviada: «{tema}». Mírala en los lentes.")
        except urllib.error.HTTPError as err:
            print("  El servidor dijo:", json.loads(err.read() or b"{}").get("error", err.code))
        except urllib.error.URLError:
            print(f"  No hay servidor en el puerto {puerto}. Arráncalo con: .venv\\Scripts\\python -m agentes.servidor")

    if temas:
        return enviar(" ".join(temas))
    print("Escribe una pregunta y Enter (Ctrl+C para salir).")
    try:
        while True:
            tema = input("pregunta> ").strip()
            if tema:
                enviar(tema)
    except (KeyboardInterrupt, EOFError):
        print()


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "preguntar":
        return preguntar(sys.argv[2:])
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
