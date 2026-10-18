"""Proyectos en disco: data/proyectos/<id>/{estado.json, guion.json}. Nada vive solo en memoria."""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from pathlib import Path

from errores import ErrorLab, ErrorValidacion
from guion import generar_guion

ID_RE = re.compile(r"^[0-9a-f]{12}$")
_cerrojo = threading.Lock()


def _escribir(ruta: Path, datos: dict) -> None:
    tmp = ruta.with_suffix(ruta.suffix + ".tmp")
    tmp.write_text(json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, ruta)          # escritura atómica: nunca queda un JSON a medias


class Almacen:
    def __init__(self, raiz: Path):
        self.raiz = Path(raiz)
        self.raiz.mkdir(parents=True, exist_ok=True)

    def _dir(self, pid: str) -> Path:
        if not ID_RE.match(pid):
            raise ErrorValidacion("identificador de proyecto inválido")
        return self.raiz / pid

    def crear(self, idea: str, n: int, idioma: str) -> dict:
        pid = uuid.uuid4().hex[:12]
        d = self._dir(pid); d.mkdir()
        estado = {"id": pid, "idea": idea, "n": n, "idioma": idioma, "fase": "PLANNING",
                  "creado": time.time(), "error": None}
        _escribir(d / "estado.json", estado)
        return estado

    def actualizar(self, pid: str, **cambios) -> dict:
        with _cerrojo:
            estado = self.leer(pid)
            estado.update(cambios)
            _escribir(self._dir(pid) / "estado.json", estado)
            return estado

    def leer(self, pid: str) -> dict:
        ruta = self._dir(pid) / "estado.json"
        if not ruta.is_file():
            raise FileNotFoundError(pid)
        return json.loads(ruta.read_text(encoding="utf-8"))

    def leer_guion(self, pid: str) -> dict | None:
        ruta = self._dir(pid) / "guion.json"
        return json.loads(ruta.read_text(encoding="utf-8")) if ruta.is_file() else None

    def guardar_guion(self, pid: str, guion: dict) -> None:
        _escribir(self._dir(pid) / "guion.json", guion)


def ejecutar_guion(almacen: Almacen, proveedor, pid: str) -> None:
    """Corre en un hilo. Las fases reflejan trabajo real; un fallo no borra lo ya guardado."""
    try:
        e = almacen.actualizar(pid, fase="WRITING_SCRIPT")
        guion = generar_guion(proveedor, e["idea"], e["n"], e["idioma"])
        almacen.guardar_guion(pid, guion.a_dict())
        almacen.actualizar(pid, fase="PRODUCING", proveedor_llm=proveedor.nombre)
    except ErrorLab as err:
        almacen.actualizar(pid, fase="FAILED", error={"categoria": err.categoria, "mensaje": str(err)})
    except Exception as err:                       # error inesperado: se registra, no se oculta
        almacen.actualizar(pid, fase="FAILED", error={"categoria": "interno", "mensaje": repr(err)})
