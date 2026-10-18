"""Agentes del laboratorio: cada uno vive en su propia carpeta dentro de agentes/.

Agregar un agente: crea una carpeta nueva (copia presentador/ como ejemplo).
Quitarlo: borra su carpeta. El registro los encuentra solo.

Lo que cada agente expone en su __init__.py:
    NOMBRE: str                         id corto, igual que el nombre de la carpeta
    DESCRIPCION: str                    una línea, se muestra en `py -m agentes`
    ejecutar(entrada: str, emitir=None) hace el trabajo y devuelve el resultado (texto o ruta)

emitir(evento) es opcional: recibe dicts con el mismo formato que bus.emitir() de la escena VR
({'tipo': 'estado', 'agente', 'texto', 'animo'}, {'tipo': 'pantalla', 'agente', 'linea'}, ...).
Hoy nadie los escucha; después se mandarán por WebSocket a la escena.
"""

import importlib
import os
import pkgutil
from pathlib import Path


def cargar_env():
    """Lee claves del archivo .env de la raíz del proyecto (ignorado por git).
    Una variable de entorno ya definida tiene prioridad sobre el archivo."""
    ruta = Path(__file__).parent.parent / ".env"
    if not ruta.exists():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, valor = linea.split("=", 1)
            os.environ.setdefault(clave.strip(), valor.strip().strip('"\''))


cargar_env()


def cargar_agentes() -> dict:
    """Busca todas las subcarpetas de agentes/ y devuelve {NOMBRE: módulo}."""
    encontrados = {}
    for m in pkgutil.iter_modules(__path__):
        if not m.ispkg:
            continue
        try:
            mod = importlib.import_module(f"{__name__}.{m.name}")
        except ImportError as err:   # p. ej. le falta una librería: no tumba a los demás
            print(f"[aviso] no se pudo cargar el agente '{m.name}': {err}")
            continue
        encontrados[mod.NOMBRE] = mod
    return encontrados
