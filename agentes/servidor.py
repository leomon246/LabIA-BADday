"""Servidor del laboratorio: sirve la página VR y conecta los agentes con la escena.

    .venv\\Scripts\\python -m agentes.servidor          (luego abrir http://localhost:8000)

Reemplaza a `python -m http.server 8000`: sirve los mismos archivos y además:
    GET  /api/agentes   lista de agentes disponibles
    POST /api/ejecutar  {"agente": "presentador", "entrada": "tema"}  corre el agente en segundo plano
    GET  /api/eventos   flujo en vivo (Server-Sent Events) con los eventos de los agentes;
                        el navegador los pasa tal cual a bus.emitir()
Solo usa la librería estándar de Python.
"""

import json
import os
import queue
import re
import socket
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import cargar_agentes

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8000   # py -m agentes.servidor 8010
RAIZ = Path(__file__).parent.parent
AGENTES = cargar_agentes()

oyentes: list[queue.Queue] = []      # una cola por navegador conectado
ocupados: set[str] = set()           # agentes trabajando ahora
candado = threading.Lock()
PRIVADO = {".git", ".venv", ".claude", "__pycache__"}


def difundir(evento: dict):
    """Manda un evento a todos los navegadores conectados."""
    texto = json.dumps(evento, ensure_ascii=False)
    with candado:
        for q in oyentes:
            q.put(texto)


def correr_agente(nombre: str, entrada: str):
    try:
        AGENTES[nombre].ejecutar(entrada, emitir=difundir)
    except Exception as err:
        print(f"[{nombre}] falló: {err}")
        aviso = "Gemini saturado, intenta otra vez" if "503" in str(err) or "429" in str(err) else "Falló, mira la terminal"
        difundir({"tipo": "estado", "agente": nombre, "texto": aviso, "animo": "alert"})
    finally:
        ocupados.discard(nombre)


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(RAIZ), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")   # que el Quest no se quede con JS viejo
        super().end_headers()

    def responder_json(self, codigo: int, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path == "/api/agentes":
            return self.responder_json(200, [{"nombre": n, "descripcion": m.DESCRIPCION} for n, m in AGENTES.items()])
        if self.path == "/api/eventos":
            return self.flujo_eventos()
        if self.path in ("/", "/index.html"):
            return self.servir_index()
        archivo = Path(self.translate_path(self.path))
        if PRIVADO & set(archivo.parts) or archivo.name == ".env":
            return self.send_error(404)   # nunca servir la clave ni el entorno
        return super().do_GET()

    def servir_index(self):
        """index.html con un número de versión (fecha de modificación) en cada .js y .css.
        Así el navegador nunca usa una copia vieja de su caché: si el archivo cambia, cambia la URL."""
        html = (RAIZ / "index.html").read_text(encoding="utf-8")
        version = lambda ruta: int((RAIZ / ruta).stat().st_mtime)
        # el importmap redirige cada import de src/ (p. ej. './eventos.js') a su URL con versión
        mapa = {f"/src/{f.name}": f"/src/{f.name}?v={version(f'src/{f.name}')}" for f in (RAIZ / "src").glob("*.js")}
        def agregar(m):
            importmap = json.loads(m.group(2))
            importmap["imports"].update(mapa)
            return m.group(1) + json.dumps(importmap, indent=2) + m.group(3)
        html = re.sub(r'(<script type="importmap">)(.*?)(</script>)', agregar, html, flags=re.S)
        html = html.replace('src="./src/main.js"', f'src="{mapa["/src/main.js"]}"')
        html = html.replace('href="./estilo.css"', f'href="./estilo.css?v={version("estilo.css")}"')
        cuerpo = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_POST(self):
        if self.path != "/api/ejecutar":
            return self.send_error(404)
        try:
            datos = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            nombre, entrada = datos["agente"], datos["entrada"].strip()
        except (ValueError, KeyError, AttributeError):
            return self.responder_json(400, {"error": "Se espera {agente, entrada}"})
        if nombre not in AGENTES:
            return self.responder_json(400, {"error": f"El servidor no tiene el agente '{nombre}' (¿lo arrancaste con .venv\\Scripts\\python?)"})
        if not entrada:
            return self.responder_json(400, {"error": "Escribe un tema"})
        if nombre in ocupados:
            return self.responder_json(409, {"error": f"{nombre} ya está trabajando"})
        ocupados.add(nombre)
        threading.Thread(target=correr_agente, args=(nombre, entrada), daemon=True).start()
        self.responder_json(202, {"ok": True})

    def flujo_eventos(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.end_headers()
        q = queue.Queue()
        with candado:
            oyentes.append(q)
        try:
            while True:
                try:
                    texto = q.get(timeout=15)
                    self.wfile.write(f"data: {texto}\n\n".encode("utf-8"))
                except queue.Empty:
                    self.wfile.write(b": sigo aqui\n\n")   # latido para que no se corte la conexión
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            with candado:
                oyentes.remove(q)

    def log_message(self, formato, *args):
        if "/api/" in self.path and "/api/eventos" not in self.path:
            super().log_message(formato, *args)


class Servidor(ThreadingHTTPServer):
    daemon_threads = True
    # En Windows, SO_REUSEADDR deja arrancar dos servidores en el mismo puerto sin error
    # y el navegador termina hablando con el viejo. Ahí pedimos el puerto en exclusiva.
    allow_reuse_address = os.name != "nt"

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    # Solo en esta compu: el Quest llega por cable con `adb reverse tcp:8000 tcp:8000`.
    try:
        servidor = Servidor(("127.0.0.1", PUERTO), Manejador)
    except OSError:
        print(f"El puerto {PUERTO} ya está ocupado: ¿quedó otro servidor abierto (este, o python -m http.server)?")
        print("Ciérralo con Ctrl+C en su terminal y vuelve a intentar.")
        return
    print(f"Laboratorio en http://localhost:{PUERTO}  (agentes: {', '.join(AGENTES) or 'ninguno'})")
    print("Ctrl+C para salir.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
