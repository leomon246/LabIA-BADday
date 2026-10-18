// Cliente del backend (backend/servidor.py): crea el proyecto, consulta su estado real
// y lo traduce a eventos del bus. La escena no sabe nada del backend: solo recibe eventos.
import { sleep } from './util.js';

export const API = localStorage.getItem('api') || 'http://127.0.0.1:8001';   // en el Quest: adb reverse tcp:8001 tcp:8001
const SONDEO_MS = 1500, LIMITE_MS = 5 * 60 * 1000;

async function pedir(ruta, opciones) {
  let r;
  try { r = await fetch(API + ruta, opciones); }
  catch { throw new Error(`Sin conexión con el backend (${API}). ¿Está corriendo "python servidor.py"?`); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = datos.error;
    throw new Error(typeof e === 'object' && e ? `[${e.categoria}] ${e.mensaje}` : (e || `HTTP ${r.status}`));
  }
  return datos;
}

// Ejecuta una idea de principio a fin emitiendo eventos reales. Devuelve el guion.
export async function crearPresentacion(bus, idea, n = 6) {
  const E = e => bus.emitir(e);
  const tareas = [
    { nombre: 'Planificar', quien: 'Jefe', estado: 'curso' },
    { nombre: 'Guion', quien: 'Redactor', estado: 'pendiente' },
    { nombre: 'Diapositivas', quien: 'Pendiente', estado: 'pendiente' },
  ];
  const marcar = (i, st) => { tareas[i].estado = st; return E({ tipo: 'pizarra', titulo: idea.slice(0, 40), tareas }); };
  await marcar(0, 'curso');
  await E({ tipo: 'estado', agente: 'jefe', texto: 'Recibí la idea', animo: 'work' });

  let proyecto;
  try { proyecto = await pedir('/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea, n }) }); }
  catch (err) {
    await E({ tipo: 'estado', agente: 'jefe', texto: 'No pude contactar al equipo', animo: 'alert' });
    await marcar(0, 'rechazado'); throw err;
  }
  await E({ tipo: 'entrega', agente: 'jefe', a: 'red', item: 'Encargo' });
  await marcar(0, 'hecho');

  let fase = null; const inicio = Date.now();
  while (true) {
    const { estado, guion } = await pedir(`/proyectos/${proyecto.id}`);
    if (estado.fase !== fase) {
      fase = estado.fase;
      if (fase === 'WRITING_SCRIPT') {
        await marcar(1, 'curso');
        await E({ tipo: 'estado', agente: 'red', texto: 'Escribiendo guion', animo: 'work', titulo: 'Guion' });
        await E({ tipo: 'pantalla', agente: 'red', linea: '> idea: ' + idea });
      }
    }
    if (fase === 'PRODUCING' && guion) {
      await marcar(1, 'hecho');
      await E({ tipo: 'estado', agente: 'red', texto: 'Guion listo', animo: 'ok', titulo: guion.titulo });
      for (const s of guion.diapositivas) { await E({ tipo: 'pantalla', agente: 'red', linea: `${s.orden}. ${s.titulo}` }); await sleep(250); }
      await E({ tipo: 'estado', agente: 'jefe', texto: `Guion de ${guion.num_diapositivas} diapositivas`, animo: 'ok' });
      return guion;
    }
    if (fase === 'FAILED') {
      const err = estado.error || {};
      await marcar(1, 'rechazado');
      await E({ tipo: 'pantalla', agente: 'red', linea: `ERROR [${err.categoria}]`, animo: 'alert' });
      await E({ tipo: 'estado', agente: 'red', texto: 'El guion falló', animo: 'alert' });
      throw new Error(`[${err.categoria}] ${err.mensaje}`);
    }
    if (Date.now() - inicio > LIMITE_MS) {
      await E({ tipo: 'estado', agente: 'red', texto: 'Tiempo agotado', animo: 'alert' });
      throw new Error('Tiempo de espera agotado esperando al backend');
    }
    await sleep(SONDEO_MS);
  }
}
