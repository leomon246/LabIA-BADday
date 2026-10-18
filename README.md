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
Abre http://localhost:8000, escribe un tema en el panel (campo "Presentador") y pulsa Crear.
Las diapositivas aparecen en el monitor grande del fondo: flechas ← → en la compu; en VR,
gatillo apuntando al monitor (tercio izquierdo = atrás).

El presentador usa Gemini gratis: saca una clave en https://aistudio.google.com/apikey y
ponla en un archivo `.env` en la raíz (`GEMINI_API_KEY=...`). Ese archivo está en `.gitignore`.
