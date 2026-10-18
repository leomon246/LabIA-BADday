# Oficina de agentes VR

Proyecto para el Be a Dragon (USFQ): una oficina en realidad virtual donde el visitante
ve trabajar a agentes de IA (investigador, redactor, revisor, jefe) y puede caminar entre ellos.
Idea central: la VR como interfaz para *supervisar* agentes, no un juego.

Responde siempre en español.

## Stack
- WebXR + three.js 0.170 (módulos ES vía importmap desde jsDelivr, sin bundler, sin npm).
- Se prueba con `.venv\Scripts\python -m agentes.servidor` (sirve la página + agentes) y se abre `http://localhost:8000`.
  No usar `python -m http.server`: deja los .js en caché del navegador y luego se ven versiones viejas
  El servidor de agentes evita eso: manda `Cache-Control: no-store` y sirve index.html con `?v=<fecha>` en cada .js
  (importmap generado en `servir_index`), así un archivo cambiado siempre tiene URL nueva.
- Visor: Meta Quest. En los lentes: `adb reverse tcp:8000 tcp:8000` y abrir localhost:8000 en su navegador.
- Sin lentes: extensión de Chrome "Immersive Web Emulator".
- No usar Unity ni frameworks pesados; mantenerlo simple.

## Estructura
- `index.html` / `estilo.css`: página y panel HTML (solo visible fuera de VR).
- `src/main.js`: escena, render, botón VR, controles del Quest, bucle principal. `EQUIPO_DEMO` (hoy `false`) prende/apaga investigador, redactor y revisor con sus mesas y la demo `guionDemo()`; ahora en la escena solo están `jefe` y `presentador`.
- `src/oficina.js`: el laboratorio (baldosas, paredes de paneles, tanques, racks, repisas con frascos), mesas de laboratorio con pantallas, pizarra-monitor. `animarSala(t)` hace pulsar líquidos y LEDs. Aquí van los objetos nuevos.
- `src/agentes.js`: cuerpos de agentes, caminar (`caminarA`, `ruta` por el pasillo z=1.1), entregas de documentos.
- `src/eventos.js`: bus de eventos + `guionDemo()` (tarea simulada con un rechazo del revisor).
- `src/red.js`: cliente del backend (`backend/`, ver `docs/BACKEND.md`): manda la idea, consulta el estado y emite eventos al bus.
- `src/jugador.js`: el visitante. Compu: primera persona con PointerLock (WASD, Shift, T, Esc). VR: stick izq. camina, der. gira 30°. Colisiones con círculos + límites de la sala.
- `src/latigo.js`: látigo del visitante. Compu: click izquierdo en primera persona. VR: botón de agarre (squeeze). Cuerda = tubo de N segmentos que siguen el ángulo del mango con retraso; chasquido con WebAudio + destello. `alReventar(puntos)` da la cuerda en el mundo al reventar: si toca al presentador (`tocaAgente`), pasa a la siguiente diapositiva y el agente brinca (`asustar`) y se queja.
- `src/util.js`: materiales, texto dibujado en canvas (etiquetas, pastillas), `sleep`.
- `agentes/`: backend de agentes en Python, **una carpeta por agente** (agregar = nueva carpeta, quitar = borrarla; `cargar_agentes()` los encuentra solo). Cada uno expone `NOMBRE`, `DESCRIPCION` y `ejecutar(entrada, emitir=None)`; `emitir` recibe eventos con el formato del bus. `agentes/servidor.py` (solo librería estándar) sirve la web, recibe `POST /api/ejecutar {agente, entrada}` y manda los eventos al navegador por `GET /api/eventos` (Server-Sent Events) → `bus.emitir()`. En terminal: `py -m agentes [agente] [entrada]` (usa `.venv`, deps en `agentes/requirements.txt`). Hoy solo `presentador/` (texto -> diapositivas HTML con Gemini gratis, necesita `GEMINI_API_KEY` en `.env` de la raíz, ignorado por git; prueba varios modelos Flash si uno da 503; salen en `salidas/`, ignorada por git).

## Regla de arquitectura (importante)
Todo lo que pasa en la oficina entra por `bus.emitir(evento)`. La escena no sabe de dónde vienen
los eventos. Los genera `guionDemo()` (simulado) o el servidor de agentes en Python (`agentes/servidor.py`, por Server-Sent Events).
No romper este contrato:
- `{ tipo:'estado', agente, texto, animo?, titulo? }`  animo: idle | work | alert | ok
- `{ tipo:'pantalla', agente, linea, animo? }`
- `{ tipo:'pizarra', titulo, tareas:[{nombre, quien, estado}] }`  estado: pendiente | curso | revision | rechazado | hecho
- `{ tipo:'entrega', agente, a, item }`
- `{ tipo:'presentar', agente, texto }`
- `{ tipo:'diapositivas', agente, titulo, subtitulo, diapositivas:[{titulo, puntos, formula, nota}] }`  se ven en la pizarra-monitor; las pasan las flechas, el gatillo apuntando al monitor o un latigazo al presentador
IDs de agentes: `inv`, `red`, `rev`, `jefe`, `presentador` (el id de la escena = `NOMBRE` del agente Python).

## Convenciones
- Nombres de funciones y variables en español.
- Coordenadas: el visitante empieza en (0, 0, 5.2) mirando hacia -z; la pizarra está en la pared z=-6.
- Pensar en rendimiento del Quest (standalone): geometrías simples, pocas luces, texturas de canvas pequeñas.

## Ideas pendientes
- Que los agentes volteen a ver al jugador cuando se acerca, y poder hablarles.
- Ver el razonamiento de un agente flotando sobre él al acercarse.
- **Unificar los dos backends**: `agentes/` (presentador, puerto 8000, eventos en vivo, campo «Presentador») y `backend/` (guion con contratos y pruebas, puerto 8001, sondeo desde `src/red.js`, formulario «Crear presentación», usa al Redactor que hoy está apagado por `EQUIPO_DEMO`).
- Conectar más agentes reales (investigador, redactor, revisor) al servidor.
- Escribir el tema dentro de la VR (teclado virtual o voz); hoy se escribe en el panel HTML.
