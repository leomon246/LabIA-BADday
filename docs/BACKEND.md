# Backend (guion con IA)

Solo biblioteca estándar de Python (probado con 3.14). Sin `pip install`.

## Configurar
1. Copia `.env.example` a `.env` (ignorado por Git). Cada dev pone su propia `GEMINI_API_KEY` (gratis en aistudio.google.com/apikey).
2. Probar la clave: `cd backend && python generar.py "Explícame cómo funcionan los agujeros negros" 4`
3. Servidor: `cd backend && python servidor.py` → http://127.0.0.1:8001

## API
- `POST /proyectos` `{"idea","n"(2-12),"idioma"}` → 202 con `estado` (fase `PLANNING`). Corre en un hilo.
- `GET /proyectos/<id>` → `{estado, guion}`. Fases: `PLANNING → WRITING_SCRIPT → PRODUCING` o `FAILED` (con `error.categoria`: configuracion | conectividad | proveedor | validacion | interno).
- Persistencia: `data/proyectos/<id>/estado.json` y `guion.json` (escritura atómica).

## Proveedores LLM (`backend/llm.py`)
Interfaz `ProveedorLLM.generar_json(sistema, usuario, esquema)`. Hay `Gemini` y `Ollama`; se elige con `LLM_GUION`. Ollama es **opcional** (no se necesita para el flujo principal): solo se usará para tareas secundarias si el equipo lo instala. La clave viaja en la cabecera `x-goog-api-key`, nunca en la URL ni en el frontend.

## Contrato del guion (`backend/contratos.py`)
`PresentationScript` { titulo, objetivo, audiencia, idioma, estilo, diapositivas[], fuentes[], advertencias[] }.
`Slide` { id ("s1"…, estable), orden, titulo, contenido[≤6], narracion, instrucciones_visuales, duracion_estimada_s }.
La duración es una estimación; la real saldrá del audio. Un guion inválido se corrige con un reintento; si falla de nuevo, `FAILED/validacion`.

## Interfaz (escritorio)
Con el backend corriendo (`python servidor.py`) y la web (`python -m http.server 8000`), escribe una idea en el panel y pulsa «Crear presentación». `src/red.js` hace POST, consulta el estado cada 1.5 s y emite eventos al bus (Jefe → Redactor → pizarra y pantalla con los títulos). En el Quest hay que añadir `adb reverse tcp:8001 tcp:8001`. La API se puede cambiar con `localStorage.setItem('api', 'http://...')`. En VR aún no hay entrada de texto.

## Pruebas
`cd backend && python -m unittest discover -s tests` (16 pruebas, sin red ni claves).

## Pendiente / no verificado
- **No se ha probado contra Gemini ni Ollama reales** (no hay clave ni Ollama activo): solo con respuestas simuladas. Falta confirmar el nombre de modelo gratuito vigente y que acepte `responseSchema`.
- Gemini real: guion generado y validado (verificado por el equipo con `generar.py`). Cada dev define su `GEMINI_MODEL` en `.env`.
- Interfaz: la lógica de `red.js` se probó en navegador con un backend de proveedor falso (camino feliz y backend caído). La animación 3D completa no se vio terminar: el panel de prueba renderiza ~1 fps por software.
- Siguiente: diapositivas (SVG/plantillas), TTS, reproductor; WebSocket si el sondeo se queda corto.
