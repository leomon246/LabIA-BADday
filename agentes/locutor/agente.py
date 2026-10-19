"""Locutor (voz del Presentador): narración de cada diapositiva -> audio WAV real + su duración medida.

En la escena NO hay un "locutor": para el visitante es el Presentador quien ensaya y luego habla, así que
los eventos salen con agente='presentador' (AGENTE_ESCENA). Este módulo solo es el taller de audio.

Entrada: ruta del JSON que deja el presentador (salidas/presentador/<tema>.json).
Salida: salidas/locutor/<tema>/s0.wav (portada), s1.wav ... y manifest.json. Devuelve la ruta del manifest.

Voz con Gemini TTS. La cuota gratuita de TTS es pequeña (unas pocas peticiones por minuto POR MODELO Y POR
PROYECTO), así que se reparte la carga: un "pool" de fuentes = claves x modelos. Cada diapositiva va a la
siguiente fuente libre; si una da 429 se aparta 60 s y se usa otra; las diapositivas se graban en paralelo.
  Claves (las que existan, sin repetir): GEMINI_API_KEY_VOZ, GEMINI_API_KEY_VOZ2, GEMINI_API_KEY, GEMINI_API_KEY_GUION
  Modelos: GEMINI_TTS_MODELOS (lista separada por comas). Voz: GEMINI_VOZ.
Si una diapositiva no se puede grabar se emite url=None y la escena usa la voz del navegador SOLO para esa
diapositiva: nunca se pierde lo ya grabado. Se reutiliza el audio ya grabado si el texto no cambió.
"""

import array
import hashlib
import json
import os
import sys
import threading
import time
import wave
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BACKEND = Path(__file__).parent.parent.parent / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))   # imports planos del backend

from errores import ErrorConectividad, ErrorConfiguracion, ErrorLab, ErrorProveedor  # noqa: E402

NOMBRE = "locutor"
AGENTE_ESCENA = "presentador"     # quien "habla" en la escena
DESCRIPCION = "Graba la narración de cada diapositiva (Gemini TTS repartido entre varias claves y modelos)"
SALIDAS = Path(__file__).parent.parent.parent / "salidas" / NOMBRE
TASA = 24000                      # Gemini TTS devuelve PCM 16 bits, mono, 24 kHz
MAX_CARACTERES = 1500
MODELOS_TTS = "gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts"
PAUSA_CUOTA_S = 60.0              # cuánto se aparta una fuente tras un 429


class ProveedorVoz:
    nombre = "base"

    def sintetizar(self, texto: str) -> bytes:
        """Devuelve PCM s16le mono a TASA Hz."""
        raise NotImplementedError


def _error(clase, mensaje, codigo=None):
    e = clase(mensaje); e.codigo = codigo
    return e


class GeminiVoz(ProveedorVoz):
    nombre = "gemini-tts"

    def __init__(self, api_key: str, modelo: str, voz: str):
        if not api_key:
            raise ErrorConfiguracion("Falta una clave de Gemini para la voz")
        self.api_key, self.modelo, self.voz = api_key, modelo, voz

    def _llamar(self, texto: str) -> bytes:
        from google import genai            # import tardío: las pruebas no lo necesitan
        from google.genai import types
        cliente = genai.Client(api_key=self.api_key)
        r = cliente.models.generate_content(
            model=self.modelo, contents=texto,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=self.voz)))))
        try:
            return r.candidates[0].content.parts[0].inline_data.data
        except (AttributeError, IndexError, TypeError) as e:
            raise _error(ErrorProveedor, f"{self.modelo}: la respuesta no trae audio", 0) from e

    def sintetizar(self, texto: str) -> bytes:
        try:
            return self._llamar(texto)
        except ErrorLab:
            raise
        except Exception as e:
            msg, codigo = str(e), getattr(e, "code", None)
            if codigo == 429 or "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                raise _error(ErrorProveedor, f"{self.modelo}: cuota agotada (429)", 429) from e
            if codigo in (401, 403) or "API key" in msg:
                raise _error(ErrorConfiguracion, f"{self.modelo}: clave rechazada", 401) from e
            if codigo == 404 or "NOT_FOUND" in msg:
                raise _error(ErrorProveedor, f"{self.modelo}: modelo no disponible para esta clave", 404) from e
            if codigo in (500, 503) or "503" in msg or "UNAVAILABLE" in msg:
                raise _error(ErrorProveedor, f"{self.modelo}: saturado (503)", 503) from e
            if any(x in msg for x in ("Connect", "timed out", "getaddrinfo")):
                raise ErrorConectividad(f"{self.modelo}: sin conexión") from e
            raise _error(ErrorProveedor, f"{self.modelo}: {msg[:160]}", codigo) from e


class _Fuente:
    def __init__(self, voz: ProveedorVoz, etiqueta: str):
        self.voz, self.etiqueta, self.libre_desde, self.muerta = voz, etiqueta, 0.0, False


class PoolVoz(ProveedorVoz):
    """Reparte las peticiones entre varias fuentes (clave x modelo) y esquiva las que están sin cuota."""
    nombre = "pool"

    def __init__(self, fuentes: list[ProveedorVoz], espera_max_s: float = 90.0, reloj=time.monotonic, dormir=time.sleep):
        if not fuentes:
            raise ErrorConfiguracion("No hay ninguna clave de Gemini para la voz")
        self.fuentes = [_Fuente(f, getattr(f, "modelo", f.nombre)) for f in fuentes]
        self.espera_max_s, self.reloj, self.dormir = espera_max_s, reloj, dormir
        self._sig, self._cerrojo = 0, threading.Lock()

    def sintetizar(self, texto: str) -> bytes:
        inicio, ultimo = self.reloj(), None
        while True:
            with self._cerrojo:
                ahora = self.reloj()
                vivas = [f for f in self.fuentes if not f.muerta]
                if not vivas:
                    raise ultimo or ErrorConfiguracion("Ninguna fuente de voz es utilizable")
                libres = [f for f in vivas if f.libre_desde <= ahora]
                if libres:
                    fuente = libres[self._sig % len(libres)]
                    self._sig += 1
                    espera = 0.0
                else:
                    fuente, espera = None, min(f.libre_desde for f in vivas) - ahora
            if fuente is None:
                if self.reloj() - inicio + espera > self.espera_max_s:
                    raise ultimo or _error(ErrorProveedor, "Todas las fuentes de voz están sin cuota", 429)
                self.dormir(max(0.5, espera))
                continue
            try:
                return fuente.voz.sintetizar(texto)
            except ErrorConectividad:
                raise
            except ErrorConfiguracion as e:                    # clave mala: esa fuente no sirve
                fuente.muerta, ultimo = True, e
            except ErrorProveedor as e:
                ultimo = e
                codigo = getattr(e, "codigo", None)
                if codigo == 404:
                    fuente.muerta = True                       # el modelo no existe para esa clave
                elif codigo in (429, 503, 500):
                    fuente.libre_desde = self.reloj() + (PAUSA_CUOTA_S if codigo == 429 else 8.0)
                else:
                    raise


def fuentes_por_defecto(env=os.environ) -> list[ProveedorVoz]:
    claves = []
    for var in ("GEMINI_API_KEY_VOZ", "GEMINI_API_KEY_VOZ2", "GEMINI_API_KEY", "GEMINI_API_KEY_GUION"):
        v = (env.get(var) or "").strip()
        if v and v not in claves:
            claves.append(v)
    modelos = [m.strip() for m in env.get("GEMINI_TTS_MODELOS", MODELOS_TTS).split(",") if m.strip()]
    voz = env.get("GEMINI_VOZ", "Kore")
    return [GeminiVoz(k, m, voz) for m in modelos for k in claves]      # intercala claves dentro de cada modelo


def proveedor_por_defecto(env=os.environ) -> ProveedorVoz:
    return PoolVoz(fuentes_por_defecto(env))


def suavizar(pcm: bytes, entrada_ms: int = 15, salida_ms: int = 60, silencio_ms: int = 150) -> bytes:
    """Fundido de entrada y de salida + un poco de silencio al final: sin esto, cada audio empieza y termina
    con un salto brusco de amplitud y se oye un 'clic' entre diapositivas."""
    m = array.array("h"); m.frombytes(pcm[: len(pcm) // 2 * 2])
    if sys.byteorder == "big":
        m.byteswap()
    n = len(m)
    n_in, n_out = min(n, TASA * entrada_ms // 1000), min(n, TASA * salida_ms // 1000)
    for i in range(n_in):
        m[i] = int(m[i] * i / n_in)
    for i in range(n_out):
        m[n - 1 - i] = int(m[n - 1 - i] * i / n_out)
    m.extend([0] * (TASA * silencio_ms // 1000))
    if sys.byteorder == "big":
        m.byteswap()
    return m.tobytes()


def guardar_wav(pcm: bytes, ruta: Path) -> float:
    """Escribe el WAV (con fundidos) y devuelve la duración REAL en segundos (sacada del audio, no estimada)."""
    if len(pcm) < TASA // 2:   # menos de 0,25 s: algo salió mal
        raise ErrorProveedor("El audio devuelto es demasiado corto")
    pcm = suavizar(pcm)
    tmp = ruta.with_suffix(".tmp")
    with wave.open(str(tmp), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(TASA); w.writeframes(pcm)
    os.replace(tmp, ruta)
    return len(pcm) / (2 * TASA)


def narraciones(p: dict) -> list[str]:
    """Texto hablado por índice: 0 = portada, 1..n = diapositivas."""
    textos = [f"{p.get('titulo', '')}. {p.get('subtitulo', '')}".strip(" .") + "."]
    for d in p.get("diapositivas", []):
        t = (d.get("narracion") or "").strip() or ". ".join(d.get("puntos", []))
        textos.append(t or d.get("titulo", ""))
    return [" ".join(t.split())[:MAX_CARACTERES] for t in textos]


def ejecutar(entrada: str, emitir=None, proveedor: ProveedorVoz | None = None, trabajadores: int | None = None) -> str:
    avisar = emitir or (lambda evento: None)

    def estado(texto, animo="work"):   # el visitante ve al Presentador "ensayando su discurso"
        avisar({"tipo": "estado", "agente": AGENTE_ESCENA, "texto": texto, "animo": animo, "pose": "habla", "fase": "voz"})

    origen = Path(entrada)
    datos = json.loads(origen.read_text(encoding="utf-8"))
    textos = narraciones(datos)
    carpeta = SALIDAS / origen.stem
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta_manifest = carpeta / "manifest.json"
    previo = json.loads(ruta_manifest.read_text(encoding="utf-8")) if ruta_manifest.exists() else {}
    pistas_previas = {p["indice"]: p for p in previo.get("pistas", [])}

    estado("Ensayando mi discurso")

    error_voz = None
    try:
        voz = proveedor or proveedor_por_defecto()
    except ErrorLab as e:
        voz, error_voz = None, e
    if trabajadores is None:
        trabajadores = min(len(voz.fuentes), 4) if isinstance(voz, PoolVoz) else 1

    cerrojo = threading.Lock()
    pistas = {}
    hechas = [0]

    def grabar(i, texto):
        nonlocal error_voz
        huella = hashlib.sha1(texto.encode("utf-8")).hexdigest()[:12]
        archivo = carpeta / f"s{i}.wav"
        url = duracion = error = None
        previa = pistas_previas.get(i)
        if previa and previa.get("huella") == huella and previa.get("url") and archivo.exists():
            url, duracion = previa["url"], previa["duracion"]            # ya grabada: no se vuelve a pedir
        elif voz is not None and error_voz is None:
            try:
                duracion = round(guardar_wav(voz.sintetizar(texto), archivo), 2)
                url = f"/salidas/locutor/{origen.stem}/s{i}.wav"
            except ErrorLab as e:
                error = {"categoria": e.categoria, "mensaje": str(e)}
                if e.categoria in ("configuracion", "proveedor"):
                    error_voz = e                                          # no insistir con el resto
        else:
            error = {"categoria": getattr(error_voz, "categoria", "configuracion"), "mensaje": str(error_voz)}
        with cerrojo:
            hechas[0] += 1
            pistas[i] = {"indice": i, "huella": huella, "texto": texto, "url": url, "duracion": duracion, "error": error}
            avisar({"tipo": "audio", "agente": AGENTE_ESCENA, "titulo": datos.get("titulo", ""), "indice": i, "url": url,
                    "duracion": duracion, "texto": texto})
            estado(f"Ensayando {hechas[0]}/{len(textos)}")
            ruta_manifest.write_text(json.dumps({"titulo": datos.get("titulo", ""), "pistas": [pistas[k] for k in sorted(pistas)]},
                                                ensure_ascii=False, indent=2), encoding="utf-8")   # se guarda pista a pista

    with ThreadPoolExecutor(max_workers=max(1, trabajadores)) as pool:
        futuros = [pool.submit(grabar, i, t) for i, t in enumerate(textos)]
    for i, f in enumerate(futuros):       # un fallo inesperado en un hilo no debe perder la diapositiva
        if f.exception() is not None and i not in pistas:
            pistas[i] = {"indice": i, "huella": None, "texto": textos[i], "url": None, "duracion": None,
                         "error": {"categoria": "interno", "mensaje": repr(f.exception())}}
            avisar({"tipo": "audio", "agente": AGENTE_ESCENA, "titulo": datos.get("titulo", ""), "indice": i,
                    "url": None, "duracion": None, "texto": textos[i]})

    con_voz = sum(1 for p in pistas.values() if p["url"])
    if con_voz == len(textos):
        estado("Discurso listo", "ok")
    else:
        estado(f"{con_voz}/{len(textos)} con voz IA; el resto con voz del navegador", "alert")
    return str(ruta_manifest)
