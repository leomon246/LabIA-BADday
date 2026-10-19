# Oficina de agentes VR

Prototipo WebXR (three.js) para el Be a Dragon.

## Estructura

```
index.html        página + panel de control
estilo.css        estilos del panel (fuera de VR)
src/main.js       escena, render, botón VR, controles del Quest, bucle
src/oficina.js    sala, escritorios, pantallas, pizarra  ← aquí agregas objetos
src/agentes.js    cuerpo de los agentes, caminar, entregas
src/eventos.js    bus de eventos + guion de la demo
src/util.js       materiales y texto en canvas
agentes/          agentes en Python, uno por carpeta (hoy: presentador/)
```

## Correr en la compu

```
python -m http.server 8000
```
Abrir http://localhost:8000 (sin lentes: usar la extensión de Chrome "Immersive Web Emulator").

## Correr en el Quest (cable USB-C, modo desarrollador activo)

```
adb devices                      # deben aparecer los lentes
adb reverse tcp:8000 tcp:8000    # repetir cada vez que reconectes el cable
```
En el navegador del Quest: http://localhost:8000 → "Enter VR".
Para ver la consola: chrome://inspect en la compu.

Ciclo de trabajo: editas un archivo, guardas, recargas en los lentes.

## Agentes (Python)

Cada agente vive en su carpeta dentro de `agentes/`. Para agregar uno, crea una carpeta nueva
(copia `presentador/`); para quitarlo, bórrala.

```
py -m venv .venv
.venv\Scripts\pip install -r agentes/requirements.txt
.venv\Scripts\python -m agentes                       # lista los agentes
.venv\Scripts\python -m agentes presentador "tema"    # genera salidas/presentador/<tema>.html
```
Para verlo en el laboratorio VR, en vez de `python -m http.server` corre (no los mezcles: el
`http.server` deja archivos viejos en la caché del navegador):

```
.venv\Scripts\python -m agentes.servidor
```
Abre http://localhost:8000, escribe qué quieres aprender y pulsa Preguntar: el Jefe se lo pasa al
Investigador, que investiga (con el código de `backend/`) y le lleva sus notas al Presentador.
Las diapositivas aparecen en el monitor grande del fondo: flechas ← → en la compu; en VR,
gatillo apuntando al monitor (tercio izquierdo = atrás).

El presentador usa Gemini gratis: saca una clave en https://aistudio.google.com/apikey y
ponla en un archivo `.env` en la raíz (`GEMINI_API_KEY=...` para el Presentador; para el Investigador,
`GEMINI_API_KEY_GUION=...` y `GEMINI_MODEL=...`, o usa la misma clave). Ese archivo está en `.gitignore`.

## Claves (Gemini gratis) y voz

Hacen falta **dos claves** en el `.env` de la raíz (copia `.env.example`): `GEMINI_API_KEY_GUION` (investigador, guion)
y `GEMINI_API_KEY` (diapositivas). La voz usa un *pool*: todas las claves distintas que existan (`GEMINI_API_KEY_VOZ`, `GEMINI_API_KEY_VOZ2`, `GEMINI_API_KEY`, `GEMINI_API_KEY_GUION`) por todos los modelos de `GEMINI_TTS_MODELOS`, en paralelo; si una combinación da 429 se aparta un minuto y se usa otra.
El panel muestra con ✓/✗ qué claves encontró el servidor (nunca muestra los valores).
La narración la graba el agente `locutor` (en escena habla el Presentador, no hay personaje locutor) (WAV en `salidas/locutor/`, con la duración real). Si Gemini TTS falla,
esa diapositiva se narra con la voz del navegador. Se reutiliza el audio ya grabado si el texto no cambió.

Pruebas (sin red ni claves):

```
.venv\Scripts\python -m unittest discover -s agentes/tests
.venv\Scripts\python -m unittest discover -s backend/tests
```

Para comprobar tus claves sin mostrarlas: `.venv\Scripts\python -m agentes.claves` (dice cuáles acepta Gemini y si ven sus modelos).
