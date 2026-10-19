// El equipo "de fondo" del laboratorio: científica, redactor, diseñador, animador y editor (cada uno con su estación y su accesorio).
// Tres modos:
//  - normal:     pasean libremente, trabajan en su mesa, visitan a un compañero, miran los equipos o conversan.
//  - producción: la "pantalla de carga". Mientras los dos agentes reales trabajan (investigador y presentador, con IA), todos
//                se pasan la presentación de mano en mano corriendo de un lado a otro. Es teatro: no influye en el resultado,
//                pero se ajusta a los eventos reales (empieza con la pregunta, acelera si la IA ya terminó, y no hace esperar de más).
//  - público:    al presentar se juntan a los lados de la pantalla y al final aplauden.
// Usan el mismo cuerpo y gestos que los agentes reales (crearAgente) y navegan libremente (navegacion.js).
import * as THREE from 'three';
import { material } from './util.js';
import { agentes, caminarA, ruta, gesto, hablando, reaccionar, ahora, entregar } from './agentes.js';
import { puntoLibreAleatorio } from './navegacion.js';

// --- accesorios para distinguir los oficios (formas simples, van en la cabeza) ---
const oscuro = () => material(0x20282B, 0.5);
const ACCESORIOS = {
  auriculares(c) {
    const arco = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 8, 20, Math.PI), oscuro()); c.add(arco);
    for (const lado of [-1, 1]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12), oscuro()); o.rotation.z = Math.PI / 2; o.position.set(lado * 0.18, 0, 0); c.add(o); }
  },
  lapiz(c) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 6), material(0xF2C230, 0.5)); l.position.set(0.16, 0.06, 0.02); l.rotation.z = 0.7; c.add(l);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 6), material(0x333333, 0.5)); punta.position.set(0.225, 0.0, 0.02); punta.rotation.z = -0.87; c.add(punta);
  },
  boina(c) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xD2478F, 0.7)); b.scale.set(1.05, 0.55, 1.05); b.position.set(0.02, 0.12, 0); b.rotation.z = -0.15; c.add(b);
    const rabito = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), material(0xD2478F, 0.7)); rabito.position.set(0.02, 0.2, 0); c.add(rabito);
  },
  gafas(c) {
    const m = material(0x9FD8E8, 0.2);
    for (const lado of [-1, 1]) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 16), m); a.position.set(lado * 0.07, 0.03, 0.15); c.add(a); }
    const banda = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.01, 6, 24), material(0x2F3A3E, 0.6)); banda.rotation.x = Math.PI / 2; banda.position.y = 0.03; c.add(banda);
  },
  visera(c) {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.16), material(0x2E8B57, 0.6)); v.position.set(0, 0.1, 0.18); c.add(v);
    const banda = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.014, 6, 24), material(0x2E8B57, 0.6)); banda.rotation.x = Math.PI / 2; banda.position.y = 0.1; c.add(banda);
  },
};

const PERFIL = {
  cientifica: { acc: 'gafas',       frases: ['Verificando datos', 'Midiendo una muestra', 'Anotando resultados', 'Esto cuadra con la teoría'] },
  redactor:   { acc: 'lapiz',       frases: ['Puliendo el texto', 'Buscando la palabra justa', 'Revisando comas', 'Releyendo el guion'] },
  disenador:  { acc: 'boina',       frases: ['Ajustando colores', 'Alineando márgenes', 'Probando tipografías', 'Cuadrando la paleta'] },
  animador:   { acc: 'auriculares', frases: ['Animando transiciones', 'Ajustando keyframes', 'Probando una animación', '¿Más rebote aquí?'] },
  editor:     { acc: 'visera',      frases: ['Cortando lo que sobra', 'Revisando el ritmo', 'Ordenando las escenas', 'Marcando cambios'] },
};
const PRISA = ['¡Rápido, rápido!', '¡Voy tarde!', '¡Esto es urgente!', '¡Ya casi!', '¿Quién tiene el borrador?', '¡Falta una revisión!', '¡Por aquí!', '¡Cuidado, paso!'];
const CHARLA = ['¿Ya revisaste esto?', '¡Mira cómo quedó!', 'Falta un detalle…', 'Esto va aquí, ¿no?', '¡Perfecto, sigue!', '¿Y si cambiamos el título?'];

// Estaciones donde "revisan un equipo" y asientos del público (a los lados de la pantalla, sin tapar la vista del visitante)
const EQUIPOS = [{ x: -11.1, z: -4.5, mira: { x: -12, z: -5.2 } }, { x: 11.1, z: -4.5, mira: { x: 12, z: -5.2 } },
                 { x: -11.2, z: 9.3, mira: { x: -12.2, z: 9.8 } }, { x: 11.2, z: 9.3, mira: { x: 12.2, z: 9.8 } }];
const PUBLICO = [{ x: -3.4, z: -2.4 }, { x: -4.6, z: -1.0 }, { x: -3.1, z: -0.1 }, { x: 4.2, z: -2.4 }, { x: 5.3, z: -1.0 }, { x: 4.0, z: -0.1 }, { x: -5.4, z: -2.4 }, { x: 6.3, z: -2.4 }];

const azar = (a, b) => a + Math.random() * (b - a);
const elegir = lista => lista[Math.floor(Math.random() * lista.length)];
const yawA = (de, a) => Math.atan2(a.x - de.x, a.z - de.z);
const dormir = s => new Promise(r => setTimeout(r, s * 1000));

const figurantes = [];
let modo = 'normal';          // 'normal' | 'produccion' | 'publico'

export function crearFigurantes(scene, ids) {
  ids.forEach((id, i) => {
    const a = agentes[id], perfil = PERFIL[id];
    if (!a || !perfil) return;
    ACCESORIOS[perfil.acc](a.cabezaG);
    a.etiqueta.dibujar(perfil.frases[0]);
    const f = { id, nombre: a.nombre, a, frases: perfil.frases, casa: { x: a.casa.x, z: a.casa.z }, yawCasa: a.yawCasa, vel: azar(1.05, 1.4),
                fase: 'espera', hasta: ahora() + 1.5 + i * 1.7, plan: 0, destino: null };
    a.velocidad = f.vel; figurantes.push(f);
  });
}

function decir(f, texto) { f.a.etiqueta.dibujar(texto); }

// Elige un punto libre de la sala que no esté cerca del destino de otro figurante (no se amontonan)
function sitioLibre(f) {
  for (let n = 0; n < 10; n++) {
    const p = puntoLibreAleatorio(1.2);
    if (figurantes.every(g => g === f || !g.destino || Math.hypot(g.destino.x - p.x, g.destino.z - p.z) > 1.8)) { f.destino = p; return p; }
  }
  return (f.destino = puntoLibreAleatorio(1.2));
}

// ---------------------------------------------------------------- modo normal
function ir(f, destino, yawFinal, luego) {
  const plan = ++f.plan;
  f.fase = 'camina';
  caminarA(f.a, ruta(f.a.g.position, destino), yawFinal).then(llego => { if (llego && plan === f.plan) luego(); });
}
function haz(f, seg, pose, texto) {
  f.fase = 'haz'; f.hasta = ahora() + seg;
  if (texto) decir(f, texto);
  reaccionar(f.id, pose === 'work' ? 'work' : 'idle');
}
const frenteDe = (g, dx = 0.95, dz = 0.7) => ({ x: g.casa.x + dx, z: g.casa.z + dz });

function pasear(f) { decir(f, 'Estirando las piernas'); ir(f, sitioLibre(f), null, () => { f.a.mirarYaw = azar(-3, 3); haz(f, azar(2, 5), 'idle'); if (Math.random() < 0.4) gesto(f.id, 'saludo', 1.6); }); }
function trabajar(f) { decir(f, 'A mi mesa'); f.destino = f.casa; ir(f, f.casa, f.yawCasa, () => haz(f, azar(7, 14), 'work', elegir(f.frases))); }
function revisarEquipo(f) {
  const est = elegir(EQUIPOS); decir(f, 'Voy a revisar un equipo'); f.destino = est;
  ir(f, est, yawA(est, est.mira), () => haz(f, azar(6, 11), 'work', elegir(f.frases)));
}
function visitar(f) {   // va a la estación de un compañero a comentarle algo
  const otro = elegir(figurantes.filter(g => g !== f)); if (!otro) return pasear(f);
  const p = frenteDe(otro, azar(0.9, 1.3) * (Math.random() < 0.5 ? 1 : -1)); f.destino = p;
  decir(f, 'Voy donde ' + otro.nombre);
  ir(f, p, yawA(p, otro.casa), () => { hablando(f.id, true, 0.35); haz(f, azar(3, 6), 'idle', elegir(CHARLA)); setTimeout(() => hablando(f.id, false), 4000); });
}
function conversar(f) {
  const otro = figurantes.find(g => g !== f && g.fase === 'espera');
  if (!otro) return pasear(f);
  const sitio = sitioLibre(f), A = { x: sitio.x - 0.42, z: sitio.z }, B = { x: sitio.x + 0.42, z: sitio.z };
  otro.destino = sitio;
  let llegados = 0;
  const alLlegar = () => {
    if (++llegados < 2) return;
    const dur = azar(6, 10); let quien = f;
    for (const g of [f, otro]) { g.fase = 'haz'; g.hasta = ahora() + dur; reaccionar(g.id, 'idle'); decir(g, 'Charlando…'); }
    const turno = () => {   // se turnan para hablar: gesticula el que tiene la palabra
      if (f.fase !== 'haz' || otro.fase !== 'haz' || ahora() > f.hasta) { hablando(f.id, false); hablando(otro.id, false); return; }
      hablando(quien.id, false); quien = quien === f ? otro : f; hablando(quien.id, true, 0.35);
      setTimeout(turno, azar(1400, 2600));
    };
    turno();
  };
  f.fase = otro.fase = 'camina';
  const pf = ++f.plan, po = ++otro.plan;
  decir(f, 'Voy a hablar con ' + otro.nombre); decir(otro, 'Me llaman…');
  caminarA(f.a, ruta(f.a.g.position, A), yawA(A, B)).then(ok => { if (ok && pf === f.plan) alLlegar(); });
  caminarA(otro.a, ruta(otro.a.g.position, B), yawA(B, A)).then(ok => { if (ok && po === otro.plan) alLlegar(); });
}
function siguiente(f) {
  const r = Math.random();
  if (r < 0.28) trabajar(f); else if (r < 0.52) pasear(f); else if (r < 0.74) visitar(f); else if (r < 0.9) conversar(f); else revisarEquipo(f);
}

export function actualizarFigurantes() {
  if (modo !== 'normal') return;
  const t = ahora();
  for (const f of figurantes) {
    if (f.fase === 'haz' && t > f.hasta) { hablando(f.id, false); f.fase = 'espera'; f.hasta = t + azar(0.4, 2); }
    if (f.fase === 'espera' && t > f.hasta) siguiente(f);
  }
}

// ---------------------------------------------------------------- modo público
export function publico(activo) {
  if (activo === (modo === 'publico')) return;
  if (modo === 'produccion') return;                       // la producción manda hasta que termina
  modo = activo ? 'publico' : 'normal';
  figurantes.forEach((f, i) => {
    f.plan++; hablando(f.id, false); f.a.llevando = false;
    if (activo) {
      const sitio = PUBLICO[i % PUBLICO.length]; f.destino = sitio;
      decir(f, 'Atento a la presentación'); f.fase = 'publico';
      setTimeout(() => {   // salen con un pequeño desfase, como gente de verdad
        if (modo !== 'publico') return;
        caminarA(f.a, ruta(f.a.g.position, sitio), yawA(sitio, { x: 0, z: -6 })).then(ok => { if (ok && modo === 'publico') { reaccionar(f.id, 'idle'); f.a.miraA = 'presentador'; f.a.miraHasta = ahora() + 9999; } });
      }, i * 350);
    } else { f.a.miraHasta = 0; f.fase = 'espera'; f.hasta = ahora() + 1 + i * 0.6; }
  });
}
// Aplauso del público (se llama al final de la presentación, antes de publico(false))
export function aplaudir() { figurantes.forEach((f, i) => setTimeout(() => gesto(f.id, 'ok', 2.6, '¡Bravo!'), i * 220)); }

// ---------------------------------------------------------------- modo producción ("pantalla de carga")
// Cadena de manos por la que "pasa" la presentación (el primer y el último destinatario son reales; el resto es el teatro):
//   jefe -> investigador (real) -> científica -> redactor -> diseñador -> animador -> editor -> presentador (real)
let prod = null, tokenGlobal = 0;
const vigente = token => prod && prod.activa && prod.token === token;
const REAL = new Set(['jefe', 'investigador', 'presentador']);   // los mueven los eventos reales: no corren por su cuenta

export function produccionIniciar() {
  if (prod && prod.activa) return;
  modo = 'produccion';
  const token = ++tokenGlobal;
  let resolverFin; const fin = new Promise(r => { resolverFin = r; });
  prod = { activa: true, token, ocupados: new Set(), libreDesde: {}, realListo: false, relevoIniciado: false, relevoFin: false, fin, resolverFin };
  for (const f of figurantes) { f.plan++; hablando(f.id, false); f.fase = 'produccion'; f.a.velocidad = 2.7; f.a.miraHasta = 0; }
  figurantes.forEach((f, i) => setTimeout(() => ajetreo(f, token), 400 + i * 450));
  setTimeout(() => { if (vigente(token)) produccionAbortar(); }, 5 * 60 * 1000);   // seguro: nunca se queda activa
}

// Una mano de la cadena: 'de' lleva el documento 'item' corriendo hasta 'a'
async function mano(de, a, item, token) {
  if (!vigente(token)) return;
  prod.ocupados.add(de); prod.ocupados.add(a);
  const A = agentes[de], v = A.velocidad; A.velocidad = Math.max(v, prod.realListo ? 3.6 : 2.7);
  if (Math.random() < 0.3) setTimeout(() => gesto(de, 'alert', 1.1, elegir(['¡Ups!', '¡Casi se me cae!', '¡Perdón, perdón!'])), azar(1200, 2600));
  A.etiqueta.dibujar(elegir(PRISA));
  await entregar(de, a, item);
  A.velocidad = v;
  prod.ocupados.delete(de); prod.ocupados.delete(a);
  prod.libreDesde[de] = ahora() + 3; prod.libreDesde[a] = ahora() + 0.5;      // 'de' vuelve caminando a su mesa antes de otro encargo
  if (agentes[a] && !REAL.has(a)) { reaccionar(a, 'work'); agentes[a].etiqueta.dibujar('Recibido, a trabajar'); }
}

// El primer paso reemplaza a la entrega "investigador -> presentador": ahora la investigación pasa por la científica
export async function produccionPrimerRelevo() {
  if (!prod || !prod.activa) return;
  const token = prod.token;
  await mano('investigador', 'cientifica', 'Investigación', token);
  if (!vigente(token) || prod.relevoIniciado) return;
  prod.relevoIniciado = true;
  relevo(token);   // el resto sigue por su cuenta, sin bloquear los eventos reales
}

async function relevo(token) {
  const base = [['cientifica', 'redactor', 'Datos verificados'], ['redactor', 'disenador', 'Guion'], ['disenador', 'animador', 'Diseño'], ['animador', 'editor', 'Animaciones']];
  for (const [de, a, item] of base) { if (!vigente(token)) return; await mano(de, a, item, token); if (prod.realListo) await dormir(0.2); }
  // si la IA todavía no terminó: rondas de correcciones (todos corren, "falta algo")
  const rondas = [['editor', 'disenador', 'Retoques'], ['disenador', 'redactor', 'Cambios'], ['redactor', 'cientifica', 'Dato nuevo'], ['cientifica', 'editor', 'Verificado']];
  for (let i = 0; vigente(token) && !prod.realListo; i++) { const [de, a, item] = rondas[i % rondas.length]; await mano(de, a, item, token); }
  if (!vigente(token)) return;
  await mano('editor', 'presentador', 'Versión final', token);   // la entrega final al presentador
  if (!vigente(token)) return;
  prod.relevoFin = true; prod.resolverFin();
  celebrar(token);
}

function celebrar(token) {
  [...figurantes.map(f => f.id), 'jefe', 'investigador', 'presentador'].forEach((id, i) => setTimeout(() => gesto(id, 'ok', 2.4, '¡Listo!'), i * 160));
  setTimeout(() => { if (vigente(token)) produccionTerminar(); }, 4200);
}

// El presentador recibe las diapositivas reales: se espera (máx. 14 s) a que el relevo llegue a su final para mostrarlas
export async function produccionRevelar() {
  if (!prod || !prod.activa) return;
  prod.realListo = true;
  if (!prod.relevoIniciado) { prod.relevoIniciado = true; relevo(prod.token); }   // la IA fue más rápida que el teatro: se comprime
  await Promise.race([prod.fin, dormir(14)]);
}

function limpiar() {
  prod.activa = false; prod.resolverFin();
  figurantes.forEach((f, i) => { f.a.velocidad = f.vel; f.a.llevando = false; f.fase = 'espera'; f.hasta = ahora() + 2 + i * 0.9; f.plan++; hablando(f.id, false); reaccionar(f.id, 'idle'); });
  for (const id of REAL) if (agentes[id]) agentes[id].llevando = false;
  modo = 'normal';
}
export function produccionTerminar() { if (prod && prod.activa) limpiar(); }
export function produccionAbortar() {
  if (!prod || !prod.activa) return;
  figurantes.forEach(f => f.a.etiqueta.dibujar('Hubo un problema…'));
  limpiar();
}
export const produccionActiva = () => !!(prod && prod.activa);

// Cada personaje de fondo sigue en su "ajetreo" mientras dura la producción
async function irA(f, destino, token, yaw = null) {
  const ok = await Promise.race([caminarA(f.a, ruta(f.a.g.position, destino), yaw), dormir(30).then(() => false)]);
  return ok && vigente(token) && !prod.ocupados.has(f.id);
}
async function ajetreo(f, token) {
  const otros = () => figurantes.filter(g => g !== f);
  while (vigente(token)) {
    if (prod.ocupados.has(f.id) || ahora() < (prod.libreDesde[f.id] || 0)) { await dormir(0.4); continue; }
    const r = Math.random();
    try {
      if (r < 0.3) {   // trabaja a toda prisa en su mesa
        if (!(await irA(f, f.casa, token, f.yawCasa))) continue;
        reaccionar(f.id, 'work'); decir(f, elegir(['¡Casi listo!', ...f.frases])); await dormir(azar(2.5, 5));
      } else if (r < 0.7) {   // mensajero: corre con papeles a la estación de otro
        const t = elegir(otros()); decir(f, elegir(PRISA)); f.a.llevando = true; reaccionar(f.id, 'idle');
        const p = frenteDe(t, azar(0.9, 1.3) * (Math.random() < 0.5 ? 1 : -1));
        if (!(await irA(f, p, token, yawA(p, t.casa)))) { f.a.llevando = false; continue; }
        f.a.llevando = false; hablando(f.id, true, 0.4); decir(f, elegir(CHARLA)); await dormir(azar(1.4, 2.6)); hablando(f.id, false);
        if (vigente(token) && !prod.ocupados.has(f.id)) await irA(f, f.casa, token, f.yawCasa);
      } else if (r < 0.85) {   // consulta rápida con el jefe o con otro
        const dest = elegir(['jefe', ...otros().map(g => g.id)]), g = agentes[dest];
        const p = { x: g.casa.x + 1.0, z: g.casa.z + 0.7 }; decir(f, '¿Tiene un minuto?');
        if (!(await irA(f, p, token, yawA(p, g.casa)))) continue;
        hablando(f.id, true, 0.4); await dormir(azar(1.6, 3)); hablando(f.id, false);
      } else {   // contratiempo: se le cae un papel
        if (!(await irA(f, puntoLibreAleatorio(1.2), token))) continue;
        gesto(f.id, 'alert', 1.8, '¡Se cayeron los papeles!'); decir(f, 'Recogiendo papeles…'); await dormir(2.2);
      }
    } catch (e) { console.warn('ajetreo', e); await dormir(1); }
  }
}
