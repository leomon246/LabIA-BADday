"""Pruebas (sin red ni claves): proveedor falso + respuestas HTTP simuladas.  cd backend && python -m unittest discover -s tests"""
import io
import json
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import llm
from contratos import validar_guion
from errores import ErrorConectividad, ErrorConfiguracion, ErrorProveedor, ErrorValidacion
from guion import generar_guion
from proyectos import Almacen
from servidor import crear_servidor


def lamina(i=1):
    return {"titulo": f"T{i}", "contenido": ["a", "b"], "narracion": "texto " * 20,
            "instrucciones_visuales": "diagrama", "duracion_estimada_s": 20}


def guion_ok(n=3):
    return {"titulo": "Agujeros negros", "objetivo": "Entender", "audiencia": "general",
            "idioma": "español", "estilo": "claro", "diapositivas": [lamina(i) for i in range(1, n + 1)]}


class Falso(llm.ProveedorLLM):
    nombre = "falso"

    def __init__(self, *respuestas):
        self.respuestas, self.llamadas = list(respuestas), []

    def generar_json(self, sistema, usuario, esquema):
        self.llamadas.append(usuario)
        r = self.respuestas.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


class Contratos(unittest.TestCase):
    def test_ids_estables_y_orden(self):
        g = validar_guion(guion_ok(3))
        self.assertEqual([s.id for s in g.diapositivas], ["s1", "s2", "s3"])
        self.assertEqual([s.orden for s in g.diapositivas], [1, 2, 3])

    def test_rechaza_invalidos(self):
        malo = guion_ok(); malo["diapositivas"][1]["narracion"] = ""
        with self.assertRaises(ErrorValidacion): validar_guion(malo)
        malo = guion_ok(); malo["diapositivas"][0]["duracion_estimada_s"] = "x"
        with self.assertRaises(ErrorValidacion): validar_guion(malo)
        malo = guion_ok(); malo["diapositivas"][0]["contenido"] = ["x"] * 7
        with self.assertRaises(ErrorValidacion): validar_guion(malo)
        with self.assertRaises(ErrorValidacion): validar_guion([])
        with self.assertRaises(ErrorValidacion): validar_guion({"diapositivas": []})


class Guion(unittest.TestCase):
    def test_camino_feliz(self):
        p = Falso(guion_ok(4))
        self.assertEqual(generar_guion(p, "agujeros negros", 4).num_diapositivas, 4)

    def test_reintento_corregido(self):
        malo = guion_ok(); del malo["objetivo"]
        p = Falso(malo, guion_ok())
        self.assertEqual(generar_guion(p, "x", 3).num_diapositivas, 3)
        self.assertIn("inválida", p.llamadas[1])

    def test_dos_fallos_dan_error(self):
        malo = guion_ok(); del malo["objetivo"]
        with self.assertRaises(ErrorValidacion): generar_guion(Falso(malo, malo), "x", 3)

    def test_idea_vacia_no_llama_al_modelo(self):
        p = Falso()
        with self.assertRaises(ErrorValidacion): generar_guion(p, "  ")
        self.assertEqual(p.llamadas, [])


def respuesta_http(obj):
    r = mock.MagicMock(); r.read.return_value = json.dumps(obj).encode()
    r.__enter__.return_value = r
    return r


class Adaptadores(unittest.TestCase):
    def test_gemini_parsea_y_manda_clave_en_cabecera(self):
        cuerpo = {"candidates": [{"content": {"parts": [{"text": json.dumps(guion_ok())}]}}]}
        with mock.patch.object(urllib.request, "urlopen", return_value=respuesta_http(cuerpo)) as u:
            out = llm.Gemini("CLAVE-SECRETA", "m").generar_json("s", "u", {})
        req = u.call_args[0][0]
        self.assertEqual(out["titulo"], "Agujeros negros")
        self.assertNotIn("CLAVE-SECRETA", req.full_url)
        self.assertEqual(req.get_header("X-goog-api-key"), "CLAVE-SECRETA")

    def test_gemini_sin_clave(self):
        with self.assertRaises(ErrorConfiguracion): llm.Gemini("", "m")

    def test_gemini_bloqueado(self):
        with mock.patch.object(urllib.request, "urlopen", return_value=respuesta_http({"promptFeedback": {"blockReason": "SAFETY"}})):
            with self.assertRaises(ErrorProveedor): llm.Gemini("k", "m").generar_json("s", "u", {})

    def test_http_429_y_403_y_red(self):
        def err(c): return urllib.error.HTTPError("u", c, "x", {}, io.BytesIO(b"detalle"))
        with mock.patch.object(urllib.request, "urlopen", side_effect=err(429)):
            with self.assertRaises(ErrorProveedor): llm.Gemini("k", "m").generar_json("s", "u", {})
        with mock.patch.object(urllib.request, "urlopen", side_effect=err(403)):
            with self.assertRaises(ErrorConfiguracion): llm.Gemini("k", "m").generar_json("s", "u", {})
        with mock.patch.object(urllib.request, "urlopen", side_effect=urllib.error.URLError("sin red")):
            with self.assertRaises(ErrorConectividad): llm.Ollama("http://x", "m").generar_json("s", "u", {})

    def test_ollama_parsea(self):
        cuerpo = {"message": {"content": json.dumps(guion_ok())}}
        with mock.patch.object(urllib.request, "urlopen", return_value=respuesta_http(cuerpo)):
            self.assertEqual(llm.Ollama("http://x", "m").generar_json("s", "u", {})["estilo"], "claro")

    def test_json_invalido_es_error_de_validacion(self):
        with mock.patch.object(urllib.request, "urlopen", return_value=respuesta_http({"message": {"content": "hola"}})):
            with self.assertRaises(ErrorValidacion): llm.Ollama("http://x", "m").generar_json("s", "u", {})

    def test_fabrica(self):
        with self.assertRaises(ErrorConfiguracion): llm.crear_proveedor("nada", {})
        with self.assertRaises(ErrorConfiguracion): llm.crear_proveedor("gemini", {})
        self.assertEqual(llm.crear_proveedor("ollama", {"OLLAMA_MODEL": "qwen3:4b"}).nombre, "ollama")


class Servidor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.almacen = Almacen(Path(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def _llamar(self, proveedor, metodo, ruta, cuerpo=None):
        import threading
        srv = crear_servidor("127.0.0.1", 0, self.almacen, lambda: proveedor)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{srv.server_port}{ruta}", method=metodo,
                                         data=json.dumps(cuerpo).encode() if cuerpo is not None else None)
            try:
                with urllib.request.urlopen(req) as r:
                    return r.status, json.loads(r.read())
            except urllib.error.HTTPError as e:
                return e.code, json.loads(e.read())
        finally:
            srv.shutdown(); srv.server_close()

    def _esperar(self, pid):
        for _ in range(100):
            e = self.almacen.leer(pid)
            if e["fase"] in ("PRODUCING", "FAILED"): return e
            time.sleep(0.05)
        self.fail("no terminó")

    def test_flujo_completo_y_persistencia(self):
        st, est = self._llamar(Falso(guion_ok(3)), "POST", "/proyectos", {"idea": "agujeros negros", "n": 3})
        self.assertEqual(st, 202)
        self.assertEqual(self._esperar(est["id"])["fase"], "PRODUCING")
        st, datos = self._llamar(Falso(), "GET", f"/proyectos/{est['id']}")
        self.assertEqual(datos["guion"]["num_diapositivas"], 3)
        self.assertEqual(Almacen(Path(self.tmp.name)).leer_guion(est["id"])["diapositivas"][0]["id"], "s1")   # sobrevive a reinicio

    def test_fallo_de_proveedor_queda_registrado(self):
        _, est = self._llamar(Falso(ErrorProveedor("cuota")), "POST", "/proyectos", {"idea": "x", "n": 3})
        e = self._esperar(est["id"])
        self.assertEqual((e["fase"], e["error"]["categoria"]), ("FAILED", "proveedor"))

    def test_entradas_invalidas_y_ruta_peligrosa(self):
        self.assertEqual(self._llamar(Falso(), "POST", "/proyectos", {"idea": "", "n": 3})[0], 400)
        self.assertEqual(self._llamar(Falso(), "POST", "/proyectos", {"idea": "x", "n": 99})[0], 400)
        self.assertEqual(self._llamar(Falso(), "GET", "/proyectos/..%2F..%2Fx")[0], 404)
        self.assertEqual(self._llamar(Falso(), "GET", "/proyectos/aaaaaaaaaaaa")[0], 404)


if __name__ == "__main__":
    unittest.main()
