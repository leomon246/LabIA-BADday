"""Comprueba las claves del .env contra Gemini (sin mostrar nunca su valor).

    .venv\\Scripts\\python -m agentes.claves

Dice, para cada clave, si Gemini la acepta y si los modelos que usa cada agente están disponibles para ella.
"""

import json
import os
import urllib.error
import urllib.request

from . import cargar_env

cargar_env()   # (ya se llama al importar el paquete; se deja explícito)

MODELOS = {
    "GEMINI_API_KEY_GUION": ("guion (investigador)", [os.environ.get("GEMINI_MODEL", "gemini-3.8-flash").strip()]),
    "GEMINI_API_KEY": ("diapositivas (presentador)", [os.environ.get("GEMINI_MODELO", "gemini-3.8-flash").strip()]),
    "GEMINI_API_KEY_VOZ": ("voz", ["gemini-3.8-flash-tts"]),
    "GEMINI_API_KEY_VOZ2": ("voz (segunda clave)", ["gemini-3.8-flash-tts"]),
}


def modelos_disponibles(clave: str) -> list[str]:
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=300",
                                 headers={"x-goog-api-key": clave})
    with urllib.request.urlopen(req, timeout=20) as r:
        return [m["name"].split("/")[-1] for m in json.load(r).get("models", [])]


def main():
    for var, (uso, necesarios) in MODELOS.items():
        clave = os.environ.get(var, "")
        if not clave and var.startswith("GEMINI_API_KEY_VOZ"):
            print(f"{var}: no definida (opcional: la voz también usa GEMINI_API_KEY y GEMINI_API_KEY_GUION)")
            continue
        if not clave:
            print(f"{var} [{uso}]: FALTA en .env")
            continue
        forma = f"{len(clave)} caracteres, empieza con {clave[:3]}…"
        try:
            ok = modelos_disponibles(clave)
        except urllib.error.HTTPError as e:
            print(f"{var} [{uso}]: Gemini la RECHAZA (HTTP {e.code}) — {forma}. Crea una nueva en https://aistudio.google.com/apikey")
            continue
        except Exception as e:
            print(f"{var} [{uso}]: no se pudo comprobar ({type(e).__name__}): ¿hay internet?")
            continue
        faltan = [m for m in necesarios if m not in ok]
        print(f"{var} [{uso}]: válida ({forma})" + (f" — pero no ve el modelo {', '.join(faltan)}" if faltan else " — modelos OK"))


if __name__ == "__main__":
    main()
