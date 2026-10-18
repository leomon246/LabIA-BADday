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
