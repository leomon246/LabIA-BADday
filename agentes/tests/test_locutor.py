"""Pruebas del locutor sin red ni claves.  Desde la raíz:  python -m unittest discover -s agentes/tests"""
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

RAIZ = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RAIZ))

from agentes.locutor import agente as loc          # noqa: E402
from errores import ErrorConfiguracion, ErrorProveedor  # noqa: E402

PRESENTACION = {"titulo": "Agujeros negros", "subtitulo": "Gravedad extrema", "diapositivas": [
    {"titulo": "A", "puntos": ["uno", "dos"], "formula": "", "nota": "", "narracion": "Primera narración."},
    {"titulo": "B", "puntos": ["tres"], "formula": "", "nota": "", "narracion": ""},
]}


MUESTRA_1000 = (1000).to_bytes(2, "little")   # una muestra PCM de 16 bits
MUESTRA_1 = (1).to_bytes(2, "little")


class Falsa(loc.ProveedorVoz):
    def __init__(self, fallar_en=None, error=None):
        self.llamadas, self.fallar_en, self.error = [], fallar_en, error

    def sintetizar(self, texto):
        self.llamadas.append(texto)
        if self.fallar_en is not None and len(self.llamadas) - 1 == self.fallar_en:
            raise self.error
        return b"\x01\x00" * loc.TASA * 2            # 2 s exactos


class Locutor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        loc.SALIDAS = base / "locutor"
        self.json = base / "tema.json"
        self.json.write_text(json.dumps(PRESENTACION), encoding="utf-8")
        self.eventos = []

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self, prov):
        ruta = loc.ejecutar(str(self.json), emitir=self.eventos.append, proveedor=prov)
        return json.loads(Path(ruta).read_text(encoding="utf-8"))

    def test_narraciones_portada_y_respaldo(self):
        t = loc.narraciones(PRESENTACION)
        self.assertEqual(t[0], "Agujeros negros. Gravedad extrema.")
        self.assertEqual(t[1], "Primera narración.")
        self.assertEqual(t[2], "tres")                 # sin narración: usa las viñetas

    def test_graba_y_mide_duracion_real(self):
        m = self.correr(Falsa())
        self.assertEqual([p["indice"] for p in m["pistas"]], [0, 1, 2])
        self.assertTrue(all(p["duracion"] == 2.15 and p["url"] for p in m["pistas"]))
        with wave.open(str(loc.SALIDAS / "tema" / "s1.wav")) as w:
            self.assertEqual(w.getnframes() / w.getframerate(), 2.15)   # 2 s de voz + 150 ms de silencio final
        audios = [e for e in self.eventos if e["tipo"] == "audio"]
        self.assertEqual([e["indice"] for e in audios], [0, 1, 2])
        self.assertEqual(self.eventos[-1]["animo"], "ok")

    def test_no_repite_llamadas_si_el_texto_no_cambio(self):
        self.correr(Falsa())
        segunda = Falsa()
        self.correr(segunda)
        self.assertEqual(segunda.llamadas, [])

    def test_fallo_conserva_lo_grabado_y_el_resto_usa_voz_del_navegador(self):
        m = self.correr(Falsa(fallar_en=1, error=ErrorProveedor("cuota")))
        self.assertTrue(m["pistas"][0]["url"])
        self.assertIsNone(m["pistas"][1]["url"])
        self.assertEqual(m["pistas"][1]["error"]["categoria"], "proveedor")
        self.assertIsNone(m["pistas"][2]["url"])        # no insiste tras agotar la cuota
        self.assertEqual(self.eventos[-1]["animo"], "alert")

    def test_sin_clave_no_rompe(self):
        with self.assertRaises(ErrorConfiguracion):
            loc.proveedor_por_defecto({})
        with mock.patch.object(loc, "proveedor_por_defecto", side_effect=ErrorConfiguracion("sin clave")):
            m = self.correr(None)                      # sin proveedor: todas las pistas quedan para la voz del navegador
        self.assertTrue(all(p["url"] is None and p["error"]["categoria"] == "configuracion" for p in m["pistas"]))

    def test_audio_demasiado_corto(self):
        with self.assertRaises(ErrorProveedor):
            loc.guardar_wav(b"\x00\x00", Path(self.tmp.name) / "x.wav")


class Fuente(loc.ProveedorVoz):
    def __init__(self, resultado):
        self.resultado, self.llamadas = resultado, 0

    def sintetizar(self, texto):
        self.llamadas += 1
        if isinstance(self.resultado, Exception):
            raise self.resultado
        return self.resultado


def err(clase, codigo):
    e = clase("x"); e.codigo = codigo
    return e


class Reloj:
    def __init__(self): self.t = 0.0
    def __call__(self): return self.t
    def dormir(self, s): self.t += s


class Suavizado(unittest.TestCase):
    def test_empieza_y_termina_en_silencio_y_agrega_pausa(self):
        pcm = MUESTRA_1000 * loc.TASA                  # 1 s a amplitud 1000
        out = loc.suavizar(pcm)
        import array
        m = array.array("h"); m.frombytes(out)
        self.assertEqual(m[0], 0)
        self.assertEqual(m[-1], 0)
        self.assertEqual(len(m), loc.TASA + loc.TASA * 150 // 1000)
        self.assertEqual(m[loc.TASA // 2], 1000)         # el centro no se toca


class Pool(unittest.TestCase):
    def test_esquiva_la_fuente_sin_cuota(self):
        a, b = Fuente(err(ErrorProveedor, 429)), Fuente(b"ok")
        r = Reloj(); pool = loc.PoolVoz([a, b], reloj=r, dormir=r.dormir)
        self.assertEqual(pool.sintetizar("x"), b"ok")
        self.assertEqual(pool.sintetizar("y"), b"ok")
        self.assertEqual(a.llamadas, 1)                  # tras el 429 no se le vuelve a pedir
        self.assertEqual(b.llamadas, 2)

    def test_si_todas_estan_agotadas_espera_y_reintenta(self):
        a = Fuente(err(ErrorProveedor, 429)); r = Reloj()
        pool = loc.PoolVoz([a], reloj=r, dormir=r.dormir)
        with self.assertRaises(ErrorProveedor):
            pool.sintetizar("x")                         # espera_max_s se agota sin dormir de más
        a.resultado = b"ya"
        r.t += 100                                       # pasa más de un minuto
        self.assertEqual(pool.sintetizar("x"), b"ya")

    def test_clave_mala_descarta_solo_esa_fuente(self):
        mala, buena = Fuente(err(ErrorConfiguracion, 401)), Fuente(b"ok")
        pool = loc.PoolVoz([mala, buena])
        pool.sintetizar("x"); pool.sintetizar("y")
        self.assertEqual(mala.llamadas, 1)

    def test_modelo_inexistente_se_descarta(self):
        sin_modelo, buena = Fuente(err(ErrorProveedor, 404)), Fuente(b"ok")
        pool = loc.PoolVoz([sin_modelo, buena])
        pool.sintetizar("x"); pool.sintetizar("y")
        self.assertEqual(sin_modelo.llamadas, 1)

    def test_todas_muertas_da_error_de_configuracion(self):
        pool = loc.PoolVoz([Fuente(err(ErrorConfiguracion, 401))])
        with self.assertRaises(ErrorConfiguracion):
            pool.sintetizar("x")

    def test_fuentes_por_defecto_cruzan_claves_y_modelos_sin_repetir(self):
        env = {"GEMINI_API_KEY": "A", "GEMINI_API_KEY_GUION": "A", "GEMINI_API_KEY_VOZ2": "B", "GEMINI_TTS_MODELOS": "m1,m2,m3"}
        fs = loc.fuentes_por_defecto(env)
        self.assertEqual(len(fs), 6)                     # 2 claves distintas x 3 modelos
        self.assertEqual({f.api_key for f in fs}, {"A", "B"})


class Paralelo(unittest.TestCase):
    def test_graba_todas_las_diapositivas_en_paralelo_con_un_pool(self):
        with tempfile.TemporaryDirectory() as tmp:
            loc.SALIDAS = Path(tmp) / "locutor"
            ruta = Path(tmp) / "tema.json"; ruta.write_text(json.dumps(PRESENTACION), encoding="utf-8")
            pool = loc.PoolVoz([Fuente(MUESTRA_1 * loc.TASA), Fuente(MUESTRA_1 * loc.TASA)])
            eventos = []
            m = json.loads(Path(loc.ejecutar(str(ruta), emitir=eventos.append, proveedor=pool)).read_text(encoding="utf-8"))
            self.assertEqual([p["indice"] for p in m["pistas"]], [0, 1, 2])
            self.assertTrue(all(p["url"] for p in m["pistas"]))
            self.assertTrue(all(e["agente"] == "presentador" for e in eventos))   # en escena habla el presentador


if __name__ == "__main__":
    unittest.main()
