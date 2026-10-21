"""Presentaciones precargadas: el plan B por si ese día fallan internet o Gemini.

    .venv\\Scripts\\python -m agentes.precargadas                    lista las que hay
    .venv\\Scripts\\python -m agentes.precargadas grabar mac-usfq    graba (o completa) su narración con Gemini TTS
    .venv\\Scripts\\python -m agentes.precargadas mostrar mac-usfq   la manda al laboratorio (con el servidor corriendo)

Cada una vive en presentaciones/<id>/:
    presentacion.json   mismo formato que deja el presentador, más `imagen` en cada diapositiva,
                        `imagen_portada` y `narracion_portada` (opcionales; imágenes relativas a su carpeta)
    img/                imágenes (SVG o PNG) que se dibujan junto al texto de la diapositiva
    audio/              s0.wav (portada), s1.wav... y manifest.json, grabados una vez con `grabar`
En el laboratorio salen en el panel («Presentaciones listas») o escribiendo /<id> en el campo del tema.
No necesitan internet ni claves: solo leen archivos.
"""

import json
import os
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).parent.parent
CARPETA = RAIZ / "presentaciones"
ID_VALIDO = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")


def _carpeta(id_: str) -> Path:
    if not ID_VALIDO.match(id_ or "") or not (CARPETA / id_ / "presentacion.json").exists():
        raise KeyError(f"No hay una presentación precargada '{id_}'")
    return CARPETA / id_


def _manifest(id_: str) -> dict:
    ruta = CARPETA / id_ / "audio" / "manifest.json"
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}


def _con_audio(pista: dict) -> bool:
    return bool(pista.get("url")) and (RAIZ / pista["url"].lstrip("/")).exists()


def listar() -> list[dict]:
    salida = []
    for json_ in sorted(CARPETA.glob("*/presentacion.json")):
        id_ = json_.parent.name
        if not ID_VALIDO.match(id_):
            continue
        p = json.loads(json_.read_text(encoding="utf-8"))
        salida.append({"id": id_, "titulo": p.get("titulo", id_), "subtitulo": p.get("subtitulo", ""),
                       "diapositivas": len(p.get("diapositivas", [])) + 1,
                       "con_voz": sum(1 for x in _manifest(id_).get("pistas", []) if _con_audio(x))})
    return salida


def eventos(id_: str) -> list[dict]:
    """Los mismos eventos que manda el flujo real (diapositivas + audio por diapositiva), listos para el bus."""
    carpeta = _carpeta(id_)
    p = json.loads((carpeta / "presentacion.json").read_text(encoding="utf-8"))
    base = f"/presentaciones/{id_}/"
    absoluta = lambda r: r if not r or r.startswith("/") else base + r
    p["imagen_portada"] = absoluta(p.get("imagen_portada", ""))
    for d in p.get("diapositivas", []):
        d["imagen"] = absoluta(d.get("imagen", ""))
    evs = [{"tipo": "estado", "agente": "jefe", "texto": "Presentación de respaldo", "animo": "work"},
           {"tipo": "diapositivas", "agente": "presentador", **p}]
    for pista in _manifest(id_).get("pistas", []):   # sin audio grabado, la escena usa la voz del navegador
        evs.append({"tipo": "audio", "agente": "presentador", "titulo": p.get("titulo", ""), "indice": pista["indice"],
                    "url": pista["url"] if _con_audio(pista) else None, "duracion": pista.get("duracion"),
                    "texto": pista.get("texto", "")})
    evs += [{"tipo": "estado", "agente": "presentador", "texto": "Discurso listo", "animo": "ok", "fase": "voz"},
            {"tipo": "estado", "agente": "jefe", "texto": "Presentación lista", "animo": "ok"}]
    return evs


def grabar(id_: str) -> str:
    from .locutor import agente as locutor   # import tardío: listar/mostrar no necesitan Gemini
    carpeta = _carpeta(id_)
    mostrar = lambda e: print(f"  {e.get('texto') or ('audio %s: %s' % (e.get('indice'), 'ok' if e.get('url') else 'SIN VOZ'))}")
    return locutor.ejecutar(str(carpeta / "presentacion.json"), emitir=mostrar, carpeta=carpeta / "audio")


def mostrar_en_laboratorio(id_: str):
    import urllib.error
    import urllib.request
    puerto = os.environ.get("PUERTO", "8000")
    pedido = urllib.request.Request(f"http://localhost:{puerto}/api/precargada", method="POST",
                                    data=json.dumps({"id": id_}).encode("utf-8"),
                                    headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(pedido, timeout=10):
            print(f"  Enviada «{id_}». Mírala en los lentes.")
    except urllib.error.HTTPError as err:
        print("  El servidor dijo:", json.loads(err.read() or b"{}").get("error", err.code))
    except urllib.error.URLError:
        print(f"  No hay servidor en el puerto {puerto}. Arráncalo con: .venv\\Scripts\\python -m agentes.servidor")


def main():
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "grabar":
        print("Manifest:", grabar(args[1]))
    elif len(args) == 2 and args[0] == "mostrar":
        mostrar_en_laboratorio(args[1])
    else:
        print("Presentaciones precargadas (presentaciones/):")
        for p in listar():
            print(f"  {p['id']:<16} {p['titulo']}  ({p['diapositivas']} diapositivas, {p['con_voz']} con voz IA)")
        print("\nUso: python -m agentes.precargadas [grabar|mostrar] <id>")


if __name__ == "__main__":
    main()
