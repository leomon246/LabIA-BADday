"""Servidor del laboratorio: sirve la página VR y conecta los agentes con la escena.

    .venv\\Scripts\\python -m agentes.servidor          (luego abrir http://localhost:8000)

Reemplaza a `python -m http.server 8000`: sirve los mismos archivos y además:
    GET  /api/agentes   lista de agentes disponibles
    GET  /api/config    qué claves hay configuradas (sí/no, sin valores)
    POST /api/preguntar {"tema": "..."}   el flujo completo: jefe -> investigador -> presentador -> locutor (voz)
    POST /api/ejecutar  {"agente": "presentador", "entrada": "tema"}  corre un solo agente en segundo plano
    GET  /api/presentaciones          presentaciones precargadas (plan B sin internet, ver agentes/precargadas.py)
    POST /api/precargada {"id": "..."} muestra una precargada en el laboratorio, con su audio
    GET  /api/eventos   flujo en vivo (Server-Sent Events) con los eventos de los agentes;
                        el navegador los pasa tal cual a bus.emitir()
Solo usa la librería estándar de Python.
"""

import json
import os
import queue
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import cargar_agentes, precargadas

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8000   # py -m agentes.servidor 8010
RAIZ = Path(__file__).parent.parent
AGENTES = cargar_agentes()

oyentes: list[queue.Queue] = []      # una cola por navegador conectado
ocupados: set[str] = set()           # agentes trabajando ahora
candado = threading.Lock()
# Librerías que la página pide a internet (three.js y los modelos 3D de los controles del Quest).
# El servidor las baja una vez con el internet de la compu, las guarda en vendor/ y se las pasa
# al navegador: así funciona en el Quest aunque no tenga wifi, y luego incluso sin internet.
REMOTOS = {
    "/vendor/three@0.170.0/": "https://cdn.jsdelivr.net/npm/three@0.170.0/",
    "/vendor/perfiles/": "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/",
}
VENDOR = RAIZ / "vendor"
TIPOS = {".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".wasm": "application/wasm"}
RUTA_SEGURA = re.compile(r"^[A-Za-z0-9_.@/-]+$")
PRIVADO = {".git", ".venv", ".claude", "__pycache__"}


def difundir(evento: dict):
    """Manda un evento a todos los navegadores conectados."""
    texto = json.dumps(evento, ensure_ascii=False)
    with candado:
        for q in oyentes:
            q.put(texto)


def aviso_de(err) -> str:
    """Texto corto para la etiqueta del agente según el tipo de fallo."""
    m = str(err)
    if "401" in m or "API key" in m or "UNAUTHENTICATED" in m:
        return "Clave de API inválida (revisa .env)"
    if "503" in m or "429" in m:
        return "Gemini saturado, intenta otra vez"
    return "Falló, mira la terminal"


def correr_agente(nombre: str, entrada: str):
    try:
        AGENTES[nombre].ejecutar(entrada, emitir=difundir)
    except Exception as err:
        print(f"[{nombre}] falló: {err}")
        aviso = aviso_de(err)
        difundir({"tipo": "estado", "agente": nombre, "texto": aviso, "animo": "alert"})
    finally:
        ocupados.discard(nombre)


def investigar_y_presentar(tema: str):
    """El usuario pregunta; el jefe se lo encarga al investigador, que investiga y le lleva
    sus notas al presentador, que arma las diapositivas. Si la investigación falla,
    el presentador trabaja solo con el tema."""
    try:
        difundir({"tipo": "estado", "agente": "jefe", "texto": f"Pregunta: {tema[:40]}", "animo": "work"})
        difundir({"tipo": "entrega", "agente": "jefe", "a": "investigador", "item": "Pregunta"})
        difundir({"tipo": "estado", "agente": "jefe", "texto": "Esperando al equipo", "animo": "idle"})
        material = tema
        try:
            notas = AGENTES["investigador"].ejecutar(tema, emitir=difundir)
            difundir({"tipo": "entrega", "agente": "investigador", "a": "presentador", "item": "Investigación"})
            material = f"Tema: {tema}\n\nInvestigación del equipo:\n{notas}"
        except Exception as err:
            print(f"[investigador] falló: {err}")
            difundir({"tipo": "estado", "agente": "investigador", "texto": "No pude investigar", "animo": "alert"})
        ruta_html = AGENTES["presentador"].ejecutar(material, emitir=difundir)
        difundir({"tipo": "estado", "agente": "jefe", "texto": "Diapositivas listas", "animo": "ok"})
        if "locutor" in AGENTES:   # la voz es un paso aparte: si falla, la presentación sigue (voz del navegador)
            try:   # en la escena es el Presentador quien "ensaya" (el locutor no tiene personaje)
                AGENTES["locutor"].ejecutar(str(Path(ruta_html).with_suffix(".json")), emitir=difundir)
            except Exception as err:
                print(f"[locutor] falló: {err}")
                difundir({"tipo": "estado", "agente": "presentador", "texto": "Sin voz IA: usaré la del navegador", "animo": "alert", "fase": "voz"})
        difundir({"tipo": "estado", "agente": "jefe", "texto": "Presentación lista", "animo": "ok"})
    except Exception as err:
        print(f"[flujo] falló: {err}")
        aviso = aviso_de(err)
        difundir({"tipo": "estado", "agente": "presentador", "texto": aviso, "animo": "alert"})
    finally:
        ocupados.discard("flujo")


def estado_config() -> dict:
    """Qué claves hay configuradas (solo sí/no: nunca se envía el valor)."""
    env = os.environ
    return {"claves": {"guion": bool(env.get("GEMINI_API_KEY_GUION") or env.get("GEMINI_API_KEY")),
                       "diapositivas": bool(env.get("GEMINI_API_KEY")),
                       "voz": bool(env.get("GEMINI_API_KEY_VOZ") or env.get("GEMINI_API_KEY"))},
            "agentes": sorted(AGENTES)}


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
        if self.path == "/api/config":
            return self.responder_json(200, estado_config())
        if self.path == "/api/eventos":
            return self.flujo_eventos()
        if self.path == "/api/presentaciones":
            return self.responder_json(200, precargadas.listar())
        if self.path in ("/", "/index.html"):
            return self.servir_index()
        if self.path.startswith("/vendor/"):
            return self.servir_vendor()
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
        for local, remoto in REMOTOS.items():   # three.js desde la compu, no desde internet
            html = html.replace(remoto, local)
        html = html.replace('src="./src/main.js"', f'src="{mapa["/src/main.js"]}"')
        html = html.replace('href="./estilo.css"', f'href="./estilo.css?v={version("estilo.css")}"')
        cuerpo = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def servir_vendor(self):
        ruta = self.path.split("?")[0]
        base = next((b for b in REMOTOS if ruta.startswith(b)), None)
        resto = ruta[len(base):] if base else ""
        if not base or not RUTA_SEGURA.match(resto) or ".." in resto:
            return self.send_error(404)
        archivo = VENDOR / ruta[len("/vendor/"):]
        if not archivo.exists():
            try:
                with urllib.request.urlopen(REMOTOS[base] + resto, timeout=20) as r:
                    datos = r.read()
            except Exception as err:
                print(f"[vendor] no pude bajar {resto}: {err}")
                return self.send_error(502, "Sin internet para bajar la librería (y no está guardada)")
            archivo.parent.mkdir(parents=True, exist_ok=True)
            temporal = archivo.with_suffix(archivo.suffix + ".tmp")
            temporal.write_bytes(datos)
            temporal.replace(archivo)
        cuerpo = archivo.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TIPOS.get(archivo.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_POST(self):
        if self.path == "/api/preguntar":
            return self.preguntar()
        if self.path == "/api/precargada":
            return self.precargada()
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

    def preguntar(self):
        try:
            datos = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            tema = str(datos["tema"]).strip()[:500]
        except (ValueError, KeyError):
            return self.responder_json(400, {"error": "Se espera {tema}"})
        faltan = {"investigador", "presentador"} - set(AGENTES)
        if faltan:
            return self.responder_json(400, {"error": f"Faltan agentes: {', '.join(faltan)} (¿arrancaste con .venv\\Scripts\\python?)"})
        if not tema:
            return self.responder_json(400, {"error": "Escribe un tema"})
        if "flujo" in ocupados:
            return self.responder_json(409, {"error": "El equipo ya está trabajando en otra pregunta"})
        ocupados.add("flujo")
        threading.Thread(target=investigar_y_presentar, args=(tema,), daemon=True).start()
        self.responder_json(202, {"ok": True})

    def precargada(self):
        try:
            datos = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            evs = precargadas.eventos(str(datos["id"]))
        except (ValueError, KeyError) as err:
            return self.responder_json(400, {"error": str(err).strip("'\"")})
        for e in evs:
            difundir(e)
        self.responder_json(200, {"ok": True})

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


def vigilar_quest():
    """Mantiene `adb reverse` puesto: se pierde al desconectar el cable, reiniciar el Quest o reiniciar adb."""
    adb = shutil.which("adb")
    if not adb:
        print("(adb no está instalado: en el Quest corre a mano `adb reverse tcp:%d tcp:%d`)" % (PUERTO, PUERTO))
        return
    regla = f"tcp:{PUERTO}"
    conectado = False
    while True:
        try:
            lista = subprocess.run([adb, "reverse", "--list"], capture_output=True, text=True, timeout=10)
            ok = lista.returncode == 0 and regla in lista.stdout
            if lista.returncode == 0 and not ok:   # hay visor pero falta la regla
                ok = subprocess.run([adb, "reverse", regla, regla], capture_output=True, timeout=10).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            ok = False
        if ok != conectado:
            conectado = ok
            print(f"Quest conectado: abre http://localhost:{PUERTO} en su navegador" if ok else "Quest desconectado (adb)")
        time.sleep(5)


def main():
    # Solo en esta compu: el Quest llega por cable con `adb reverse tcp:8000 tcp:8000` (lo pone vigilar_quest).
    try:
        servidor = Servidor(("127.0.0.1", PUERTO), Manejador)
    except OSError:
        print(f"El puerto {PUERTO} ya está ocupado: ¿quedó otro servidor abierto (este, o python -m http.server)?")
        print("Ciérralo con Ctrl+C en su terminal y vuelve a intentar.")
        return
    threading.Thread(target=vigilar_quest, daemon=True).start()
    print(f"Laboratorio en http://localhost:{PUERTO}  (agentes: {', '.join(AGENTES) or 'ninguno'})")
    print("Ctrl+C para salir.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
