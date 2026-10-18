# Auditoría del proyecto — AI Presentation Lab (LabIA-BADday)

Fecha: 2026-10-18 · Rama `main` (= `origin/main`), árbol limpio, 2 commits, un solo autor (leomon246).
Alcance: lectura de todo el código (1030 líneas) y documentación. Solo se ejecutaron comprobaciones de entorno; **la app no se abrió en navegador ni en VR**, así que el estado "funciona" se basa en lectura de código, no en prueba.

## A. Arquitectura actual
- Frontend estático, sin bundler ni npm: three.js 0.170 por importmap (jsDelivr), WebXR, módulos ES. Se sirve con `python -m http.server 8000`.
- Sin backend, sin base de datos, sin pruebas, sin CI, sin `package.json`.
- Todo pasa por `bus.emitir(evento)` ([eventos.js](../src/eventos.js)); hoy lo alimenta `guionDemo()` (simulado). `AGENTS.md` ya prevé un backend Python por WebSocket.
- Contrato actual de eventos (5 tipos): `estado`, `pantalla`, `pizarra`, `entrega`, `presentar`. Agentes: `inv`, `red`, `rev`, `jefe`.

## B. Inventario
| Funcionalidad | Estado | Notas |
|---|---|---|
| Laboratorio 3D (sala, mesas, tanques, racks, pantallas) | Implementado | `oficina.js`; animación solo de brillos |
| 4 agentes con etiqueta, caminar por pasillo, entregas | Implementado | cuerpos primitivos (cilindro + esfera), sin animación de trabajo/gestos |
| Bus de eventos | Implementado | contrato informal, sin validación |
| Pizarra de tareas | Implementado | 3 tareas fijas |
| Jugador (PC + VR), colisiones, látigo | Implementado | lectura de código; no verificado en Quest |
| Botón Enter VR | Implementado | requiere HTTPS/localhost + `adb reverse` |
| Flujo de agentes | **Simulado** | `guionDemo` con texto fijo |
| Idea del usuario (entrada) | Pendiente | no hay campo de texto |
| Ollama / guion estructurado | Pendiente | Ollama **no responde** en :11434 en esta máquina |
| Diapositivas | Pendiente | no existe pantalla de presentación |
| TTS / audio | Pendiente | solo WebAudio del látigo |
| Reproductor sincronizado | Pendiente | |
| Presentador 3D | Parcial | `presentar` solo mueve al "jefe" al centro |
| Estados/animaciones por rol | Parcial | existe `animo` (idle/work/alert/ok) |
| Persistencia, proyectos, IDs | Pendiente | |
| Pruebas | Pendiente | |

## C. Reutilizable
Todo: bus de eventos (base del contrato), `crearEscritorio/dibujarPantalla/dibujarPizarra`, `caminarA/entregar`, jugador, cámara VR, `canvasTex` (útil para renderizar diapositivas como textura), `ANIMOS`.

## D. Problemas y riesgos técnicos
1. Dependencia de CDN (jsDelivr, Google Fonts): sin internet no arranca.
2. El bus asume agente existente (`agentes[e.agente]`): un evento con ID desconocido lanza excepción. Sin validación.
3. `lanzar()` se bloquea tras una ejecución (`corriendo`, botón "Terminado"); reiniciar = `location.reload()`. No hay ejecuciones/IDs.
4. Todo el estado vive en memoria y en canvas; ninguna persistencia.
5. Roles: hay 4 agentes (`jefe/inv/red/rev`); el prompt maestro pide 7 (+ diseñador, técnico de audio, presentador). Es extensión, no conflicto.
6. Los eventos del prompt (`research.started`, …) difieren del contrato actual en español; hay que decidir convención (ver §F).
7. `CLAUDE.md` y `AGENTS.md` casi idénticos (duplicados); `AGENTS.md` ya está algo desactualizado respecto a `CLAUDE.md`.
8. Mixed content: el WebSocket desde el Quest vía `adb reverse` a `localhost` funciona; por IP de LAN requeriría `wss`.
9. Python 3.14 instalado: verificar compatibilidad de librerías (FastAPI/pydantic) antes de fijar dependencias.

## E. Integraciones faltantes
Backend (Python), Ollama, esquemas validados, TTS, renderizado de diapositivas, almacenamiento por proyecto, WebSocket, entrada de usuario en HUD/VR, presentador y escenario.

## F. Arquitectura propuesta (compatible)
```
Navegador/Quest (three.js, sin cambios de stack)
   ▲ WebSocket JSON (eventos validados)      │ HTTP: POST /proyectos {idea}, GET /proyectos/{id}, /media/…
   │                                          ▼
Backend Python (nuevo, carpeta backend/)
   orquestador (máquina de estados) ── adaptadores: LLM(Ollama) · TTS · Imágenes/SVG
   contratos (pydantic) · almacenamiento en data/proyectos/{id}/ (script.json, slides/, audio/, estado.json)
```
- **Conservar el bus** y su regla "la escena no sabe de dónde vienen los eventos". Añadir un `fuenteWS` que llame a `bus.emitir`, dejando `guionDemo` como modo sin backend (no se elimina).
- **Contrato**: evolucionar con sobre común `{v, proyecto, run, seq, ts, tipo, ...}` conservando los 5 tipos actuales y añadiendo tipos nuevos (`guion`, `diapositiva`, `audio`, `fase`, `error`). Nombres en español, coherentes con las convenciones; los nombres del prompt (`script.completed`…) se mapean.
- **Máquina de estados** vive solo en el backend; el cliente la consume (`fase`).
- Diapositivas: SVG/HTML por plantilla generado en backend, mostrado en la escena con `canvasTex` o `<img>`→textura. Sin dependencia de generación de imágenes por LLM.
- TTS: adaptador intercambiable; duración real medida con `ffprobe` (ffmpeg ya está instalado) o `wave`.

## G. Plan priorizado
0. Auditoría (este documento).
1. `backend/`: contratos (Project, PresentationScript, Slide…), adaptador Ollama, endpoint `POST /proyectos` → guion validado con reintento controlado, guardado en `data/`. Pruebas con adaptador falso.
2. WebSocket + `fuenteWS` en el cliente; campo "idea" en HUD; pizarra/pantalla del redactor mostrando el progreso **real**.
3. Diapositivas SVG + pantalla de presentación en escena.
4. TTS + duración real + vinculación por `slide_id`.
5. Reproductor (play/pausa/siguiente/anterior) en escritorio y VR.
6. Nuevos personajes (diseñador, audio, revisor, presentador) y animaciones ligadas a estados.
7. Presentador 3D/escenario; robustez, persistencia, cancelación, README de instalación y pruebas.

## H. Archivos probablemente afectados
Nuevos: `backend/**`, `data/` (en `.gitignore`), `src/red.js` (cliente WS), `src/presentacion.js`, `.env.example`, `docs/CONTRATOS.md`.
Modificados: `src/eventos.js` (validación + nuevos tipos), `src/main.js` (crear nuevos agentes, entrada de idea), `src/agentes.js` (animación de trabajo/gestos), `index.html`/`estilo.css` (campo de idea, controles), `CLAUDE.md`/`AGENTS.md`/`README.md`.

## I. Riesgos de colaboración (2 desarrolladores)
- `main.js` y `eventos.js` son los puntos de choque: congelar el contrato de eventos en `docs/CONTRATOS.md` antes de que ambos lo toquen.
- Propuesta de reparto: **Dev A** backend/IA (carpeta `backend/`), **Dev B** escena/VR (`src/`). Se tocan solo en el contrato.
- Ramas por funcionalidad y PR; hoy solo existe `main` y un único autor. Convención de commits existente: frase en español, imperativa.
- `.env` y `data/` fuera de Git.
