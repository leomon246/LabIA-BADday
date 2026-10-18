// El bus de eventos: TODO lo que pasa en la oficina entra por bus.emitir(evento).
// Hoy los eventos los genera guionDemo(); después los mandará el backend de agentes por WebSocket.
//
// Tipos de evento:
//   { tipo:'estado',   agente, texto, animo?, titulo? }   animo: idle | work | alert | ok
//   { tipo:'pantalla', agente, linea, animo? }
//   { tipo:'pizarra',  titulo, tareas:[{nombre, quien, estado}] }
//   { tipo:'entrega',  agente, a, item }
//   { tipo:'presentar',agente, texto }
import { agentes, entregar, caminarA, ruta } from './agentes.js';
import { pantallas, dibujarPantalla, dibujarPizarra } from './oficina.js';
import { sleep } from './util.js';

export function crearBus(log) {
  return {
    async emitir(e) {
      const a = agentes[e.agente];
      switch (e.tipo) {
        case 'estado':
          a.etiqueta.dibujar(e.texto); log(a.nombre, e.texto);
          a.visorMat.emissiveIntensity = e.animo === 'idle' ? 0.4 : 1.1;
          if (pantallas[e.agente]) {
            const s = pantallas[e.agente];
            if (e.animo) s.animo = e.animo; if (e.titulo) s.titulo = e.titulo; dibujarPantalla(e.agente);
          }
          break;
        case 'pantalla': {
          const s = pantallas[e.agente]; s.lineas.push(e.linea); if (e.animo) s.animo = e.animo; dibujarPantalla(e.agente);
          break;
        }
        case 'pizarra': dibujarPizarra(e.titulo, e.tareas); break;
        case 'entrega':
          log(a.nombre, `lleva "${e.item}" a ${agentes[e.a].nombre}`);
          await entregar(e.agente, e.a, e.item);
          break;
        case 'presentar':
          a.etiqueta.dibujar(e.texto); log(a.nombre, e.texto);
          await caminarA(a, ruta(a.g.position, { x: 0, z: 2.6 }), 0);
          break;
      }
    }
  };
}

// Guion simulado de una tarea completa (con un rechazo en el medio)
export async function guionDemo(bus) {
  const T = 'Informe: calidad del aire en Quito';
  const tareas = [
    { nombre: 'Investigar', quien: 'Investigador', estado: 'pendiente' },
    { nombre: 'Redactar', quien: 'Redactor', estado: 'pendiente' },
    { nombre: 'Revisar', quien: 'Revisor', estado: 'pendiente' },
  ];
  const E = e => bus.emitir(e);
  const marcar = (i, st) => { tareas[i].estado = st; return E({ tipo: 'pizarra', titulo: T, tareas }); };

  await E({ tipo: 'pizarra', titulo: T, tareas });
  await E({ tipo: 'estado', agente: 'jefe', texto: 'Recibí la tarea', animo: 'work' }); await sleep(900);
  await E({ tipo: 'estado', agente: 'jefe', texto: 'Repartiendo trabajo', animo: 'work' });
  await E({ tipo: 'entrega', agente: 'jefe', a: 'inv', item: 'Encargo' });

  await marcar(0, 'curso');
  await E({ tipo: 'estado', agente: 'inv', texto: 'Buscando fuentes', animo: 'work', titulo: 'Investigación' });
  for (const ln of ['> buscar "PM2.5 Quito"', '3 fuentes encontradas', 'leyendo informe municipal', 'extrayendo datos 2025', 'comparando estaciones']) {
    await E({ tipo: 'pantalla', agente: 'inv', linea: ln }); await sleep(700);
  }
  await E({ tipo: 'estado', agente: 'inv', texto: 'Notas listas', animo: 'ok' });
  await marcar(0, 'hecho'); await marcar(1, 'curso');
  await E({ tipo: 'entrega', agente: 'inv', a: 'red', item: 'Notas' });

  await E({ tipo: 'estado', agente: 'red', texto: 'Escribiendo borrador', animo: 'work', titulo: 'Borrador v1' });
  for (const ln of ['## Introducción', '## Datos por estación', '## Comparación regional', '## Conclusión']) {
    await E({ tipo: 'pantalla', agente: 'red', linea: ln }); await sleep(750);
  }
  await E({ tipo: 'estado', agente: 'red', texto: 'Borrador listo', animo: 'ok' });
  await marcar(1, 'revision'); await marcar(2, 'curso');
  await E({ tipo: 'entrega', agente: 'red', a: 'rev', item: 'Borrador' });

  await E({ tipo: 'estado', agente: 'rev', texto: 'Verificando cifras', animo: 'work', titulo: 'Revisión' });
  for (const ln of ['cifra 1: ok', 'cifra 2: sin fuente', 'cifra 3: ok']) {
    await E({ tipo: 'pantalla', agente: 'rev', linea: ln }); await sleep(800);
  }
  await E({ tipo: 'pantalla', agente: 'rev', linea: 'RECHAZADO: falta cita', animo: 'alert' });
  await E({ tipo: 'estado', agente: 'rev', texto: 'Falta una cita', animo: 'alert' });
  await marcar(1, 'rechazado');
  await E({ tipo: 'entrega', agente: 'rev', a: 'red', item: 'Correcciones' });

  await E({ tipo: 'estado', agente: 'red', texto: 'Corrigiendo', animo: 'work', titulo: 'Borrador v2' });
  await E({ tipo: 'pantalla', agente: 'red', linea: '+ cita: informe municipal' }); await sleep(900);
  await E({ tipo: 'entrega', agente: 'red', a: 'rev', item: 'Borrador v2' });
  await E({ tipo: 'pantalla', agente: 'rev', linea: 'cifra 2: ok', animo: 'ok' });
  await E({ tipo: 'estado', agente: 'rev', texto: 'Aprobado', animo: 'ok' });
  await marcar(1, 'hecho'); await marcar(2, 'hecho');
  await E({ tipo: 'entrega', agente: 'rev', a: 'jefe', item: 'Informe' });
  await E({ tipo: 'presentar', agente: 'jefe', texto: 'Informe listo para ti' });
}
