# Presentaciones precargadas

Plan B por si el día de la demo fallan internet o Gemini: se muestran sin claves ni red, con imágenes y voz ya grabada.

- **Mostrar**: en el panel, «Presentaciones listas», o escribir `/<id>` en el campo del tema (p. ej. `/mac-usfq`).
  Desde la consola: `.venv\Scripts\python -m agentes.precargadas mostrar mac-usfq` (con el servidor corriendo).
- **Listar**: `.venv\Scripts\python -m agentes.precargadas`

## Agregar una nueva

1. Crea `presentaciones/<id>/presentacion.json` (copia `mac-usfq/`). Mismo formato que deja el presentador
   (`titulo`, `subtitulo`, `tema_visual`, `visual_portada`, `diapositivas:[{titulo, puntos, formula, nota, visual, narracion}]`)
   más, opcionales: `imagen` en cada diapositiva, `imagen_portada` y `narracion_portada`.
2. Pon las imágenes en `presentaciones/<id>/img/` (SVG o PNG; rutas relativas a la carpeta, p. ej. `img/foo.svg`).
   En una diapositiva con imagen el texto va a la izquierda: usa 3–4 puntos cortos.
3. Graba la voz (necesita internet y las claves del `.env`, solo esta vez):
   `.venv\Scripts\python -m agentes.precargadas grabar <id>` → `presentaciones/<id>/audio/`.
   Si cambias una narración, vuelve a correrlo: solo regraba las diapositivas cuyo texto cambió.
   Si alguna queda sin audio, en la escena se lee con la voz del navegador.

## Hoy

- `mac-usfq`: ¿Por qué estudiar MAC en la USFQ? (12 diapositivas + portada, basada en la malla 2026 de
  Ingeniería en Matemáticas Aplicadas y Computación).
