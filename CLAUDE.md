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
- **Un solo campo** en el panel («¿Sobre qué quieres aprender?») → `POST /api/preguntar {tema}` → flujo en el servidor:
  Jefe le entrega la pregunta al Investigador → el Investigador investiga con el código de `backend/` (`generar_guion`,
  clave `GEMINI_API_KEY_GUION` + `GEMINI_MODEL` del `.env`) → le entrega sus notas al Presentador → diapositivas (clave `GEMINI_API_KEY`).
  Si la investigación falla, el Presentador sigue solo con el tema.
- Visor: Meta Quest. En los lentes: `adb reverse tcp:8000 tcp:8000` y abrir localhost:8000 en su navegador.
- Sin lentes: extensión de Chrome "Immersive Web Emulator".
- No usar Unity ni frameworks pesados; mantenerlo simple.

## Estructura
- `index.html` / `estilo.css`: página y panel HTML (solo visible fuera de VR).
- `src/main.js`: escena, render, botón VR, controles del Quest, bucle principal. `EQUIPO_DEMO` (hoy `false`) prende/apaga investigador, redactor y revisor con sus mesas y la demo `guionDemo()`; ahora en la escena están `jefe`, `investigador` (con su mesa al fondo a la izquierda) y `presentador`.
- `src/oficina.js`: el laboratorio (26 x 17 m, cuatro paredes, techo con paneles de luz, ventanales, letrero, tanques, racks, mesas largas, plantas, repisas), una **estación por personaje** (`crearEscritorio(scene,id,x,z,tipo,color)`: mesa con objetos de su oficio, zona de color en el piso y rótulo flotante; tipos en `ADORNOS`), el escenario del presentador (`crearEscenario`) y la pantalla grande (6,2 x 3,4 m) con las diapositivas. Las diapositivas usan **temas** (`TEMAS`: cosmos, naturaleza, cálido, neón, papel, océano; la IA elige con `tema_visual`, o sale del título) con motivos de fondo propios y tres composiciones (lista, tarjetas, destacado). `obstaculosJugador` = lo que no puede atravesar el visitante. `animarSala(t)` hace pulsar líquidos y LEDs. Aquí van los objetos nuevos.
- `src/agentes.js`: cuerpos de agentes (cabeza que gira + brazos), caminar (`caminarA` devuelve una promesa que da true al llegar o false si otro camino la cancela; `ruta` = camino libre de `navegacion.js`; se esquivan entre ellos), entregas de documentos y lenguaje corporal: poses (reposo que respira, teclear, caminar, cargar, celebrar, alerta, saludar, hablar) elegidas desde los eventos `estado` (`reaccionar`), miran al visitante si se acerca y lo saludan, se miran entre ellos al pasarse documentos y de vez en cuando. `gesto(id, pose, seg, texto)` para gestos puntuales.
- `src/eventos.js`: bus de eventos + `guionDemo()` (tarea simulada con un rechazo del revisor).
- `src/red.js`: cliente HTTP de la API de `backend/` (puerto 8001). Hoy no se usa: el panel va por `/api/preguntar`. `backend/` se puede seguir corriendo solo (`docs/BACKEND.md`).
- `src/jugador.js`: el visitante. Compu: primera persona con PointerLock (WASD, Shift, T, Esc). VR: stick izq. camina, der. gira 30°. Colisiones con círculos + límites de la sala.
- `src/navegacion.js`: navegación libre de los personajes: A* sobre una cuadrícula de 0,4 m con obstáculos circulares (`registrarObstaculo`, lo llama `oficina.js`) y suavizado; `SALA` = límites caminables (también del visitante). Los personajes cruzan el lab en diagonal y rodean mesas, tanques y racks.
- `src/figurantes.js`: el equipo "de fondo" (científica, redactor, diseñador, animador, editor; cada uno con su estación y su accesorio). Tres modos: **normal** (pasean libremente, trabajan en su mesa, visitan a un compañero, miran equipos, conversan por turnos), **producción** = la "pantalla de carga" (mientras trabajan los dos agentes reales, los 8 personajes se pasan la presentación de mano en mano corriendo: jefe → investigador → científica → redactor → diseñador → animador → editor → presentador; es teatro decorativo que se ajusta a los eventos reales: empieza con la pregunta, hace rondas de correcciones si la IA tarda, se comprime si la IA ya terminó y las diapositivas reales esperan como máximo 14 s a que llegue al final) y **público** (al presentar se juntan a los lados de la pantalla y aplauden). La producción se engancha en `main.js` (envoltura de `bus.emitir`) y no cambia el contrato de eventos.
- `src/modelos.js`: modelos 3D procedurales (planeta, átomo, agujero negro, estrella, ADN, onda, engranaje, gráfico de barras, molécula, cristal) en un holograma junto a la pantalla; la IA solo elige el nombre en el campo `visual` de cada diapositiva (`visual_portada` para la portada). Agregar uno = una función en `CONSTRUCTORES` + su nombre en el `Literal` de `agentes/presentador/agente.py`.
- `src/voz.js`: narración. Reproduce el WAV de cada diapositiva (un solo reproductor, no se solapan); si falta usa la voz del navegador solo para esa. Pausa/reanuda, avisa al terminar (`fin`) y hace que el presentador gesticule (gestos que cambian cada ~2,6 s, mira al visitante, señala la pantalla al cambiar de diapositiva) y su visor pulse con el volumen (AnalyserNode). Fundidos de entrada/salida con GainNode y 450 ms de pausa entre diapositivas (sin clics). El HUD tiene ▶ Presentar (avanza sola al acabar cada audio), ⏸, ◀ ▶ y Espacio.
- `src/latigo.js`: **easter egg, apagado por defecto**; se activa escribiendo `/latigo` en el campo de la pregunta (otra vez lo guarda). Látigo del visitante. Compu: click izquierdo en primera persona. VR: botón de agarre (squeeze). Cuerda = tubo de N segmentos que siguen el ángulo del mango con retraso; chasquido con WebAudio + destello. `alReventar(puntos)` da la cuerda en el mundo al reventar: si toca al presentador (`tocaAgente`), pasa a la siguiente diapositiva y el agente brinca (`asustar`) y se queja.
- `src/util.js`: materiales, texto dibujado en canvas (etiquetas, pastillas), `sleep`.
- `agentes/`: backend de agentes en Python, **una carpeta por agente** (agregar = nueva carpeta, quitar = borrarla; `cargar_agentes()` los encuentra solo). Cada uno expone `NOMBRE`, `DESCRIPCION` y `ejecutar(entrada, emitir=None)`; `emitir` recibe eventos con el formato del bus. `agentes/servidor.py` (solo librería estándar) sirve la web, recibe `POST /api/ejecutar {agente, entrada}` y manda los eventos al navegador por `GET /api/eventos` (Server-Sent Events) → `bus.emitir()`. En terminal: `py -m agentes [agente] [entrada]` (usa `.venv`, deps en `agentes/requirements.txt`). Hoy: `investigador/` (tema -> notas, reutiliza `backend/`) y `presentador/` (texto -> diapositivas HTML con Gemini gratis, necesita `GEMINI_API_KEY` en `.env` de la raíz, ignorado por git; prueba varios modelos Flash si uno da 503; salen en `salidas/`, ignorada por git).

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
- `{ tipo:'audio', agente, indice, url|null, duracion|null, texto }`  narración de la diapositiva `indice` (0 = portada); `url` null = usar la voz del navegador. Lo emite el agente `locutor`, pero con `agente:'presentador'`: en escena no hay locutor, es el Presentador quien "ensaya" (los `estado` de esa fase llevan `fase:'voz'` y `pose:'habla'`).
IDs de agentes: `inv`, `red`, `rev`, `jefe`, `investigador`, `presentador`, y los figurantes `animador`, `redactor`, `disenador`, `cientifica`, `editor` (el id de la escena = `NOMBRE` del agente Python).

## Convenciones
- Nombres de funciones y variables en español.
- Coordenadas: el visitante empieza en (0, 0, 5.2) mirando hacia -z; la pantalla grande está en la pared z=-6. El lab va de x=-13 a 13 y de z=-6 a 11 (pared del frente detrás del visitante). Estaciones en U: jefe y presentador al fondo; el trabajo baja por la izquierda (investigador, científica, redactor), cruza el frente y sube por la derecha (diseñador, animador, editor).
- Pensar en rendimiento del Quest (standalone): geometrías simples, pocas luces, texturas de canvas pequeñas.

## Ideas pendientes
- Que los agentes volteen a ver al jugador cuando se acerca, y poder hablarles.
- Ver el razonamiento de un agente flotando sobre él al acercarse.
- Que el Investigador busque en fuentes reales (hoy Gemini sin internet; las dudas van en «Advertencias»).
- Conectar más agentes reales (investigador, redactor, revisor) al servidor.
- Escribir el tema dentro de la VR (teclado virtual o voz); hoy se escribe en el panel HTML.
