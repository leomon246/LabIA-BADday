"""API HTTP mínima (stdlib).  Uso:  cd backend && python servidor.py

  POST /proyectos        {"idea": "...", "n": 6, "idioma": "español"} -> 202 {estado}
  GET  /proyectos/<id>   -> {estado, guion|null}
"""
from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from errores import ErrorLab
from llm import crear_proveedor
from proyectos import Almacen, ejecutar_guion

RAIZ = Path(__file__).resolve().parent.parent
ORIGENES = {"http://localhost:8000", "http://127.0.0.1:8000"}


def cargar_env(ruta: Path) -> None:
    """Lector mínimo de .env (KEY=valor). No pisa variables ya definidas en el entorno."""
    if not ruta.is_file():
        return
    for ln in ruta.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln and not ln.startswith("#") and "=" in ln:
            k, v = ln.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def crear_servidor(host, puerto, almacen: Almacen, proveedor_fn) -> ThreadingHTTPServer:
    """proveedor_fn() devuelve el ProveedorLLM (se crea por petición para reportar errores de configuración)."""

    class H(BaseHTTPRequestHandler):
        def _enviar(self, codigo, datos):
            cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(cuerpo)))
            origen = self.headers.get("Origin")
            if origen in ORIGENES:
                self.send_header("Access-Control-Allow-Origin", origen)
            self.end_headers(); self.wfile.write(cuerpo)

        def do_OPTIONS(self):
            self.send_response(204)
            origen = self.headers.get("Origin")
            if origen in ORIGENES:
                self.send_header("Access-Control-Allow-Origin", origen)
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()

        def do_POST(self):
            if self.path != "/proyectos":
                return self._enviar(404, {"error": "no existe"})
            try:
                largo = int(self.headers.get("Content-Length", "0"))
                if largo > 10_000:
                    return self._enviar(413, {"error": "cuerpo demasiado grande"})
                datos = json.loads(self.rfile.read(largo) or b"{}")
                idea = str(datos.get("idea", "")).strip()
                n = int(datos.get("n", 6)); idioma = str(datos.get("idioma", "español"))[:30]
                if not idea or len(idea) > 500 or not (2 <= n <= 12):
                    return self._enviar(400, {"error": "idea (1-500 caracteres) y n (2-12) requeridos"})
                proveedor = proveedor_fn()
            except (ValueError, TypeError, json.JSONDecodeError):
                return self._enviar(400, {"error": "JSON inválido"})
            except ErrorLab as e:
                return self._enviar(500, {"error": {"categoria": e.categoria, "mensaje": str(e)}})
            estado = almacen.crear(idea, n, idioma)
            threading.Thread(target=ejecutar_guion, args=(almacen, proveedor, estado["id"]), daemon=True).start()
            self._enviar(202, estado)

        def do_GET(self):
            partes = self.path.strip("/").split("/")
            if len(partes) != 2 or partes[0] != "proyectos":
                return self._enviar(404, {"error": "no existe"})
            try:
                self._enviar(200, {"estado": almacen.leer(partes[1]), "guion": almacen.leer_guion(partes[1])})
            except (FileNotFoundError, ErrorLab):
                self._enviar(404, {"error": "proyecto no encontrado"})

        def log_message(self, fmt, *a):          # no registrar cuerpos ni cabeceras
            print("[api]", fmt % a)

    return ThreadingHTTPServer((host, puerto), H)


if __name__ == "__main__":
    cargar_env(RAIZ / ".env")
    nombre = os.environ.get("LLM_GUION", "gemini")
    almacen = Almacen(RAIZ / "data" / "proyectos")
    srv = crear_servidor("127.0.0.1", int(os.environ.get("API_PORT", "8001")), almacen,
                         lambda: crear_proveedor(nombre))
    print(f"API en http://127.0.0.1:{srv.server_port}  (LLM del guion: {nombre})")
    srv.serve_forever()
