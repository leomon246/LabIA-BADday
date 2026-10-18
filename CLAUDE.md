# Oficina de agentes VR

Proyecto para el Be a Dragon (USFQ): una oficina en realidad virtual donde el visitante
ve trabajar a agentes de IA (investigador, redactor, revisor, jefe) y puede caminar entre ellos.
Idea central: la VR como interfaz para *supervisar* agentes, no un juego.

Responde siempre en español.

## Stack
- WebXR + three.js 0.170 (módulos ES vía importmap desde jsDelivr, sin bundler, sin npm).
- Se prueba con `python -m http.server 8000` y se abre `http://localhost:8000`.
- Visor: Meta Quest. En los lentes: `adb reverse tcp:8000 tcp:8000` y abrir localhost:8000 en su navegador.
- Sin lentes: extensión de Chrome "Immersive Web Emulator".
- No usar Unity ni frameworks pesados; mantenerlo simple.

## Estructura
- `index.html` / `estilo.css`: página y panel HTML (solo visible fuera de VR).
- `src/main.js`: escena, render, botón VR, controles del Quest, bucle principal.
- `src/oficina.js`: el laboratorio (baldosas, paredes de paneles, tanques, racks, repisas con frascos), mesas de laboratorio con pantallas, pizarra-monitor. `animarSala(t)` hace pulsar líquidos y LEDs. Aquí van los objetos nuevos.
- `src/agentes.js`: cuerpos de agentes, caminar (`caminarA`, `ruta` por el pasillo z=1.1), entregas de documentos.
- `src/eventos.js`: bus de eventos + `guionDemo()` (tarea simulada con un rechazo del revisor).
- `src/jugador.js`: el visitante. Compu: primera persona con PointerLock (WASD, Shift, T, Esc). VR: stick izq. camina, der. gira 30°. Colisiones con círculos + límites de la sala.
- `src/latigo.js`: látigo del visitante. Compu: click izquierdo en primera persona. VR: botón de agarre (squeeze). Cuerda = tubo de N segmentos que siguen el ángulo del mango con retraso; chasquido con WebAudio + destello.
- `src/util.js`: materiales, texto dibujado en canvas (etiquetas, pastillas), `sleep`.
- `agentes/`: backend de agentes en Python, **una carpeta por agente** (agregar = nueva carpeta, quitar = borrarla; `cargar_agentes()` los encuentra solo). Cada uno expone `NOMBRE`, `DESCRIPCION` y `ejecutar(entrada, emitir=None)`; `emitir` recibe eventos con el formato del bus. Correr: `py -m agentes [agente] [entrada]` (usa `.venv`, deps en `agentes/requirements.txt`). Hoy solo `presentador/` (texto -> diapositivas HTML con Gemini gratis, necesita `GEMINI_API_KEY`; salen en `salidas/`, ignorada por git).

## Regla de arquitectura (importante)
Todo lo que pasa en la oficina entra por `bus.emitir(evento)`. La escena no sabe de dónde vienen
los eventos. Hoy los genera `guionDemo()`; después los mandará un backend de agentes en Python por WebSocket.
No romper este contrato:
- `{ tipo:'estado', agente, texto, animo?, titulo? }`  animo: idle | work | alert | ok
- `{ tipo:'pantalla', agente, linea, animo? }`
- `{ tipo:'pizarra', titulo, tareas:[{nombre, quien, estado}] }`  estado: pendiente | curso | revision | rechazado | hecho
- `{ tipo:'entrega', agente, a, item }`
- `{ tipo:'presentar', agente, texto }`
IDs de agentes: `inv`, `red`, `rev`, `jefe`.

## Convenciones
- Nombres de funciones y variables en español.
- Coordenadas: el visitante empieza en (0, 0, 5.2) mirando hacia -z; la pizarra está en la pared z=-6.
- Pensar en rendimiento del Quest (standalone): geometrías simples, pocas luces, texturas de canvas pequeñas.

## Ideas pendientes
- Que los agentes volteen a ver al jugador cuando se acerca, y poder hablarles.
- Ver el razonamiento de un agente flotando sobre él al acercarse.
- Backend real de agentes (Python) conectado por WebSocket al bus.
