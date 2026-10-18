"""Prueba rápida desde consola (usa tu .env):  python generar.py "Explícame cómo funcionan los agujeros negros" [n]"""
import json
import sys
from pathlib import Path

from errores import ErrorLab
from guion import generar_guion
from llm import crear_proveedor
from servidor import RAIZ, cargar_env
import os

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cargar_env(RAIZ / ".env")
    nombre = os.environ.get("LLM_GUION", "gemini")
    try:
        g = generar_guion(crear_proveedor(nombre), sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4)
    except ErrorLab as e:
        sys.exit(f"[{e.categoria}] {e}")
    print(json.dumps(g.a_dict(), ensure_ascii=False, indent=2))
