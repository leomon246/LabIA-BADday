// Los agentes: su cuerpo, cómo caminan, cómo gesticulan y cómo se pasan documentos.
import * as THREE from 'three';
import { material, crearEtiqueta, crearTag, sleep } from './util.js';
import { rutaLibre } from './navegacion.js';

export const agentes = {};

// Científicos con bata: piel y pelo varían por personaje; la camisa (visible por la bata abierta) y el gafete llevan su color.
const PIELES = [0xF1C9A5, 0xD9A47E, 0xB97A57, 0x8D5A3B, 0xF5D6BC];
const PELOS = [0x2B2420, 0x5A3A22, 0x1A1A1A, 0x8C5A2B, 0xB8B2A8, 0x3B2A1E];
const BATA = { jefe: 0x2E3438 };   // el jefe va de traje oscuro; los demás, bata blanca
const H = 0.78;                    // altura de la cadera
const hashId = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export function crearAgente(scene, id, nombre, color, casa, yaw) {
  const g = new THREE.Group(), h = hashId(id);
  const piel = material(PIELES[h % PIELES.length], 0.6), pelo = material(PELOS[(h >> 3) % PELOS.length], 0.8);
  const bataMat = new THREE.MeshStandardMaterial({ color: BATA[id] ?? 0xF4F6F7, roughness: 0.7, side: THREE.DoubleSide });
  const pantalon = material(0x2A3036, 0.8), zapato = material(0x16191C, 0.5);
  // Torso (camisa del color del agente) = 'cuerpo', el que respira
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.5, 16), material(color, 0.6));
  cuerpo.position.y = H + 0.25; cuerpo.castShadow = true;
  // Bata: cono abierto por delante (theta 0 = +z), del hombro hasta la rodilla
  const bata = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.27, 0.86, 20, 1, true, 0.32, Math.PI * 2 - 0.64), bataMat);
  bata.position.y = H + 0.08; bata.castShadow = true;
  const hombros = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), bataMat);
  hombros.scale.y = 0.35; hombros.position.y = H + 0.5;
  const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 10), piel); cuello.position.y = H + 0.58;
  // gafete en el pecho: brilla con el color del agente (y con el ánimo, ver eventos.js)
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x1F2A2E, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 });
  const gafete = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.012), visorMat); gafete.position.set(0.11, H + 0.38, 0.2); gafete.rotation.y = 0.35;
  // Piernas: pivote en la cadera, pantalón y zapato
  const piernas = [-1, 1].map(lado => {
    const p = new THREE.Group(); p.position.set(lado * 0.085, H, 0);
    const pierna = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.62, 3, 8), pantalon); pierna.position.y = -0.36; pierna.castShadow = true;
    const pie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.2), zapato); pie.position.set(0, -H + 0.035, 0.04);
    p.add(pierna, pie); return p;
  });
  // La cabeza es un grupo propio para poder girarla hacia quien miran sin girar el cuerpo
  const cabezaG = new THREE.Group(); cabezaG.position.y = H + 0.8;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), piel); cabeza.scale.set(0.95, 1.05, 1); cabeza.castShadow = true;
  const cabello = new THREE.Mesh(new THREE.SphereGeometry(0.178, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), pelo);
  cabello.rotation.x = -0.35; cabello.position.y = 0.01;
  const ojoG = new THREE.SphereGeometry(0.02, 8, 6), ojoMat = material(0x15181B, 0.3);
  const ojos = [-1, 1].map(lado => { const o = new THREE.Mesh(ojoG, ojoMat); o.position.set(lado * 0.058, 0.02, 0.152); return o; });
  const boca = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), material(0x6B2E2A, 0.6)); boca.position.set(0, -0.07, 0.15);
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), piel); nariz.position.set(0, -0.015, 0.165);
  cabezaG.add(cabeza, cabello, ...ojos, nariz, boca);
  // Brazos: un pivote en el hombro; la manga cuelga hacia abajo
  const brazos = [-1, 1].map(lado => {
    const p = new THREE.Group(); p.position.set(lado * 0.22, H + 0.44, 0);
    const brazo = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 3, 8), bataMat); brazo.position.y = -0.2; brazo.castShadow = true;
    const mano = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 8), piel); mano.position.y = -0.42;
    p.add(brazo, mano); return p;
  });
  const etiqueta = crearEtiqueta(nombre, color); etiqueta.sprite.position.y = 2.0;
  g.add(cuerpo, bata, hombros, cuello, gafete, ...piernas, cabezaG, ...brazos, etiqueta.sprite);
  g.position.copy(casa); g.rotation.y = yaw; g.rotation.order = 'YXZ';   // YXZ: las inclinaciones (x, z) van en el marco del personaje
  scene.add(g);
  agentes[id] = { id, nombre, color, g, cuerpo, cabezaG, brazos, piernas, boca, ojos, etiqueta, visorMat, casa: casa.clone(), yawCasa: yaw,
                  camino: [], mirarYaw: yaw, velocidad: 1.6, paso: 0, alLlegar: null, susto: 0,
                  // gestos
                  base: 'idle', temp: null, tempHasta: 0, llevando: false, habla: false, nivelVoz: 0,
                  fase: Math.random() * 6.28, miraA: null, miraHasta: 0, proxMirada: 4 + Math.random() * 8,
                  giroHasta: 0, giroPorHabla: false,
                  saludoHasta: -99, insignias: {}, insigniaHasta: 0, insigniaActual: null, cabezaYaw: 0,
                  golpe: null, inmuneHasta: 0, molesto: null };
}

// --- movimiento ---
const lerpAngulo = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
// Camino libre de 'de' a 'a': A* alrededor de mesas, tanques y racks (ver navegacion.js); ya no hay un pasillo fijo
export const ruta = (de, a) => rutaLibre(de, a);
export const yawHacia = (de, a) => Math.atan2(a.x - de.x, a.z - de.z);

// Devuelve una promesa que se resuelve con true al llegar y con false si otro camino lo cancela antes
export function caminarA(ag, puntos, yawFinal) {
  if (ag.alResolver) ag.alResolver(false);                      // un camino nuevo cancela el anterior (su promesa no se queda colgada)
  return new Promise(res => {
    ag.camino = puntos; ag.mirarYaw = null; ag.alResolver = res;
    ag.alLlegar = () => { ag.alResolver = null; ag.mirarYaw = yawFinal; res(true); };
  });
}

// Brinco y temblor (susto)
const SUSTO = 0.6;
export function asustar(id) { if (agentes[id]) agentes[id].susto = SUSTO; }

// ¿Algún punto (en el mundo) toca el cuerpo del agente? Cilindro de radio 'r' y 1.75 m de alto.
export function tocaAgente(id, puntos, r = 0.4) {
  const p = agentes[id]?.g.position;
  return !!p && puntos.some(q => q.y < 1.75 && Math.hypot(q.x - p.x, q.z - p.z) < r);
}

// --- golpe con un cubo: empujón, tambaleo y enojo ---
const QUEJAS_GOLPE = ['¡Oye!', '¡Ay! ¿Quién fue?', '¡Cuidado con eso!', '¡Mi cabeza!', '¿En serio?', '¡Que estoy trabajando!', '¡Auch!'];
const DUR_GOLPE = 0.9, DUR_ENOJO = 2.6;
// (dx, dz) = hacia dónde iba el cubo; rapidez en m/s; mirarA = punto hacia donde se gira enojado (el visitante, si está)
export function golpear(id, dx, dz, rapidez, mirarA = null) {
  const a = agentes[id]; if (!a || reloj < a.inmuneHasta) return false;
  const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
  const f = Math.min(1, rapidez / 8), yaw = a.g.rotation.y, empuje = 0.7 + 1.8 * f;
  a.golpe = {
    t: 0, vx: dx * empuje, vz: dz * empuje, fuerza: 0.14 + 0.22 * f, enojado: false,
    lx: dx * Math.cos(yaw) - dz * Math.sin(yaw),   // dirección del golpe vista desde el personaje (derecha / adelante)
    lz: dx * Math.sin(yaw) + dz * Math.cos(yaw),
    mira: mirarA ? { x: mirarA.x, z: mirarA.z } : { x: a.g.position.x - dx * 3, z: a.g.position.z - dz * 3 },
  };
  a.inmuneHasta = reloj + 1.0;
  return true;
}
const golpeActivo = a => a.golpe && a.golpe.t < DUR_GOLPE;
const molestoActivo = a => a.molesto && reloj < a.molesto.hasta;

function actualizarGolpe(a, dt) {
  const gp = a.golpe, p = a.g.position;
  gp.t += dt;
  const frena = Math.exp(-gp.t * 6);                         // el empujón se frena rápido
  p.x += gp.vx * frena * dt; p.z += gp.vz * frena * dt;
  const sube = Math.min(1, gp.t / 0.1), baja = Math.max(0, 1 - gp.t / DUR_GOLPE);
  const tilt = gp.fuerza * sube * baja * (1 + 0.35 * Math.sin(gp.t * 26));   // se echa hacia atrás y se bambolea
  a.g.rotation.x = gp.lz * tilt; a.g.rotation.z = -gp.lx * tilt;
  if (!gp.enojado && gp.t > 0.32) {                          // se recupera… y se enoja
    gp.enojado = true;
    gesto(a.id, 'enojo', DUR_ENOJO, QUEJAS_GOLPE[Math.floor(Math.random() * QUEJAS_GOLPE.length)]);
    a.molesto = { hasta: reloj + DUR_ENOJO, yaw: Math.atan2(gp.mira.x - p.x, gp.mira.z - p.z) };
  }
  if (gp.t >= DUR_GOLPE) { a.g.rotation.x = 0; a.g.rotation.z = 0; }
}

// --- gestos y reacciones ---
let reloj = 0;                       // segundos de escena (suben con actualizarAgentes)
export const ahora = () => reloj;
let posJugador = null;               // () => THREE.Vector3 con la posición de los ojos del visitante
export const fijarMirada = fn => { posJugador = fn; };

// Pastilla flotante sobre la cabeza ("¡Listo!", "¡Ojo!"…). Una por texto y agente, se reutilizan.
function insignia(a, texto, seg = 1.8) {
  let s = a.insignias[texto];
  if (!s) { s = a.insignias[texto] = crearTag(texto, a.color); s.position.y = 2.34; s.visible = false; a.g.add(s); }
  if (a.insigniaActual && a.insigniaActual !== s) a.insigniaActual.visible = false;
  s.visible = true; a.insigniaActual = s; a.insigniaHasta = reloj + seg;
}

// Pose pasajera (celebrar, alerta, saludo…) que vuelve sola a la pose base
export function gesto(id, pose, seg = 1.6, texto = null) {
  const a = agentes[id]; if (!a) return;
  a.temp = pose; a.tempHasta = reloj + seg;
  if (texto) insignia(a, texto, seg + 0.3);
}

// El estado del sistema (animo del evento 'estado') se vuelve lenguaje corporal
export function reaccionar(id, animo, pose = null) {
  const a = agentes[id]; if (!a) return;
  if (pose && animo === 'work') a.base = pose;                   // p. ej. el presentador ensaya su discurso ('habla')
  else if (animo === 'work') a.base = 'work';
  else if (animo === 'idle') a.base = 'idle';
  else if (animo === 'ok') { a.base = 'idle'; gesto(id, 'ok', 1.8, '¡Listo!'); }
  else if (animo === 'alert') { a.base = 'idle'; gesto(id, 'alert', 2.4, '¡Ojo!'); }
}

// Al cambiar de diapositiva, el presentador se gira un momento hacia la pantalla y la señala
export function senalar(id, seg = 1.5) {
  const a = agentes[id]; if (!a) return;
  a.mirarYaw = Math.atan2(PANTALLA.x - a.g.position.x, PANTALLA.z - a.g.position.z);
  a.giroHasta = reloj + seg;
  gesto(id, 'senalar', seg);
}

// Mientras se reproduce su narración: gesticula y el visor pulsa con el volumen (nivel 0..1)
export function hablando(id, activo, nivel = 0) {
  const a = agentes[id]; if (!a) return;
  a.habla = activo; a.nivelVoz = activo ? nivel : 0;
}

// Poses: ángulos objetivo de los brazos (x = hacia adelante, z = hacia afuera) y de la cabeza
function poseDe(a, nombre, t, lado) {
  const f = a.fase + (lado > 0 ? 1.7 : 0);
  switch (nombre) {
    case 'work':    return { x: -0.95 + Math.sin(t * 13 + f) * 0.13, z: lado * -0.12, hop: 0 };                 // tecleando
    case 'carry':   return { x: -1.15, z: lado * -0.18, hop: 0 };
    case 'recibir': return { x: -1.0, z: lado * -0.1, hop: 0 };
    case 'walk':    return { x: Math.sin(a.paso) * 0.55 * lado, z: lado * 0.07, hop: 0 };
    case 'ok':      return { x: -0.2, z: lado * (2.55 + Math.sin(t * 11 + f) * 0.22), hop: Math.abs(Math.sin(t * 9)) * 0.08 };
    case 'alert':   return { x: lado > 0 ? -1.6 : -0.4, z: lado * 0.45 + Math.sin(t * 15) * 0.05, hop: 0 };
    case 'saludo':  return lado > 0 ? { x: 0, z: 2.45 + Math.sin(t * 9) * 0.35, hop: 0 } : { x: 0, z: -0.08, hop: 0 };
    case 'habla': {   // cambia de gesto cada ~2,6 s: manos abiertas, señala, mano al pecho, énfasis
      const v = Math.floor(t / 2.6 + a.fase) % 4, der = lado > 0;
      if (v === 0) return { x: -0.75 + Math.sin(t * 3.2 + f) * 0.12, z: lado * (0.55 + Math.sin(t * 2.1 + f) * 0.1), hop: 0 };
      if (v === 1) return der ? { x: -1.35, z: 0.75 + Math.sin(t * 2.4) * 0.08, hop: 0 } : { x: -0.2, z: -0.1, hop: 0 };
      if (v === 2) return der ? { x: -1.55, z: -0.55 + Math.sin(t * 3) * 0.05, hop: 0 } : { x: -0.35, z: 0.25, hop: 0 };
      return { x: -0.5 + Math.sin(t * 4.5 + f) * 0.35, z: lado * (0.3 + Math.sin(t * 3 + f) * 0.12), hop: 0 };
    }
    case 'enojo':   return lado > 0 ? { x: -2.55 + Math.sin(t * 17) * 0.2, z: 0.3, hop: Math.abs(Math.sin(t * 7)) * 0.025 }   // agita el puño
                                    : { x: 0.35, z: -0.75, hop: 0 };                                                          // mano en la cintura
    case 'senalar': return lado > 0 ? { x: -1.45, z: 0.5, hop: 0 } : { x: 0, z: -0.08, hop: 0 };           // brazo hacia la pantalla
    default:        return { x: 0, z: lado * 0.08 + Math.sin(t * 1.6 + f) * 0.03, hop: 0 };                       // reposo: respira
  }
}

function elegirPose(a, caminando) {
  if (a.temp && reloj < a.tempHasta) return a.temp;
  if (a.temp) a.temp = null;
  if (caminando) return a.llevando ? 'carry' : 'walk';
  if (a.habla) return 'habla';
  return a.base;
}

const _p = new THREE.Vector3(), PANTALLA = new THREE.Vector3(0, 2.4, -5.9);   // el monitor grande
function actualizarGestos(a, dt, caminando) {
  const pose = elegirPose(a, caminando);
  const k = Math.min(1, dt * 12);
  a.brazos.forEach((br, i) => {
    const o = poseDe(a, pose, reloj, i === 0 ? -1 : 1);
    br.rotation.x += (o.x - br.rotation.x) * k;
    br.rotation.z += (o.z - br.rotation.z) * k;
    if (i === 0 && !caminando && !a.susto) a.g.position.y = o.hop;   // celebrar = brinquitos
  });
  a.piernas.forEach((p, i) => {                                         // al caminar, cada pierna va contraria a su brazo
    const obj = caminando ? Math.sin(a.paso) * 0.5 * (i === 0 ? 1 : -1) : 0;
    p.rotation.x += (obj - p.rotation.x) * k;
  });
  a.cuerpo.scale.y = 1 + Math.sin(reloj * 1.8 + a.fase) * 0.012;      // respiración
  a.boca.scale.y = a.habla ? 1 + a.nivelVoz * 4 : 1;                   // abre la boca con la voz
  const parpado = (reloj + a.fase * 3) % 4.2 < 0.12 ? 0.1 : 1;          // parpadea cada ~4 s
  for (const o of a.ojos) o.scale.y = parpado;

  // --- hacia dónde mira la cabeza ---
  let objetivo = null;
  const j = posJugador && posJugador();
  const hablaAlPublico = (pose === 'habla' || pose === 'senalar') && a.id === 'presentador' && !caminando;
  if (hablaAlPublico && j && Math.sin(reloj * 0.9 + a.fase) > 0.82) objetivo = PANTALLA;                 // de vez en cuando mira la pantalla
  else if (hablaAlPublico && j) objetivo = j;                                                           // y casi siempre al visitante
  else if (j && Math.hypot(j.x - a.g.position.x, j.z - a.g.position.z) < 3.4) objetivo = j;           // al visitante, si está cerca
  else if (a.miraA && reloj < a.miraHasta && agentes[a.miraA]) objetivo = agentes[a.miraA].g.getWorldPosition(_p);   // a un compañero
  else if (pose === 'work') objetivo = null;
  let yaw = 0, pitch = pose === 'work' ? 0.22 + Math.sin(reloj * 0.9 + a.fase) * 0.05 : 0;
  if (pose === 'alert') yaw = Math.sin(reloj * 14) * 0.45;
  else if (pose === 'enojo') { yaw = Math.sin(reloj * 9) * 0.28; pitch = -0.12; }                     // niega, mentón arriba                                                // niega con la cabeza
  else if (objetivo && !caminando) {
    const mundo = Math.atan2(objetivo.x - a.g.position.x, objetivo.z - a.g.position.z);
    yaw = Math.max(-1.1, Math.min(1.1, lerpAngulo(a.g.rotation.y, mundo, 1) - a.g.rotation.y));
  }
  if (pose === 'habla') pitch += Math.sin(reloj * 8) * a.nivelVoz * 0.1;                                 // asiente al compás de la voz
  a.cabezaYaw += (yaw - a.cabezaYaw) * Math.min(1, dt * 6);
  a.cabezaG.rotation.y = a.cabezaYaw;
  a.cabezaG.rotation.x += (pitch - a.cabezaG.rotation.x) * Math.min(1, dt * 5);

  // --- vida propia: saludar al visitante y mirarse entre ellos ---
  const quieto = !caminando && !a.temp && a.base === 'idle' && !a.habla;
  if (quieto && j && Math.hypot(j.x - a.g.position.x, j.z - a.g.position.z) < 2.4 && reloj - a.saludoHasta > 30) {
    a.saludoHasta = reloj; gesto(a.id, 'saludo', 2.2, '¡Hola!');
  }
  if (quieto && reloj > a.proxMirada) {
    const otros = Object.keys(agentes).filter(n => n !== a.id);
    if (otros.length) { a.miraA = otros[Math.floor(Math.random() * otros.length)]; a.miraHasta = reloj + 2.2; }
    a.proxMirada = reloj + 7 + Math.random() * 9;
  }
  if (a.insigniaActual && reloj > a.insigniaHasta) { a.insigniaActual.visible = false; a.insigniaActual = null; }

  // el cuerpo gira hacia el público mientras habla (y hacia la pantalla un instante tras cambiar de diapositiva)
  if (hablaAlPublico && j) {
    if (reloj > a.giroHasta) a.mirarYaw = Math.atan2(j.x - a.g.position.x, j.z - a.g.position.z);
    a.giroPorHabla = true;
  } else if (a.giroPorHabla && !caminando) { a.mirarYaw = a.yawCasa; a.giroPorHabla = false; }
  if (!golpeActivo(a)) a.g.rotation.z = a.susto ? a.g.rotation.z : (pose === 'habla' ? Math.sin(reloj * 1.3 + a.fase) * 0.035 : 0);   // balanceo suave

  // visor: pulsa con la voz
  if (a.habla) a.visorMat.emissiveIntensity = 0.9 + a.nivelVoz * 1.6;
}

export function actualizarAgentes(dt) {
  reloj += dt;
  for (const a of Object.values(agentes)) {
    const p = a.g.position;
    if (a.susto > 0) {
      a.susto = Math.max(0, a.susto - dt);
      const k = a.susto / SUSTO, f = 1 - k;
      p.y = Math.sin(f * Math.PI) * 0.22;
      a.g.rotation.z = Math.sin(f * 40) * 0.18 * k;
      if (!a.susto) { p.y = 0; a.g.rotation.z = 0; }
    }
    if (golpeActivo(a)) actualizarGolpe(a, dt);
    const pausado = golpeActivo(a) || molestoActivo(a);   // tras un golpe se queda quieto y enojado un momento
    if (pausado && molestoActivo(a)) a.g.rotation.y = lerpAngulo(a.g.rotation.y, a.molesto.yaw, Math.min(1, dt * 7));
    if (a.camino.length && !pausado) {
      const t = a.camino[0], dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.06) {
        p.x = t.x; p.z = t.z; a.camino.shift();
        if (!a.camino.length) { p.y = 0; a.alLlegar && a.alLlegar(); }
      } else {
        const s = Math.min(d, a.velocidad * dt); p.x += dx / d * s; p.z += dz / d * s;
        a.g.rotation.y = lerpAngulo(a.g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
        a.paso += dt * 11; p.y = Math.abs(Math.sin(a.paso)) * 0.035;
        // esquivar a los demás al cruzarse (salvo al llegar a la meta, donde dos personajes se juntan a propósito)
        const meta = a.camino[a.camino.length - 1];
        if (Math.hypot(meta.x - p.x, meta.z - p.z) > 0.9) for (const b of Object.values(agentes)) {
          if (b === a) continue;
          const ex = p.x - b.g.position.x, ez = p.z - b.g.position.z, e = Math.hypot(ex, ez);
          if (e < 0.55 && e > 1e-3) { const k = (0.55 - e) * 0.5; p.x += ex / e * k; p.z += ez / e * k; }
        }
      }
    } else if (a.mirarYaw !== null && !pausado) {
      a.g.rotation.y = lerpAngulo(a.g.rotation.y, a.mirarYaw, Math.min(1, dt * 6));
    }
    actualizarGestos(a, dt, a.camino.length > 0 && !pausado);
  }
}

// --- entregas: un agente lleva un documento al escritorio de otro ---
function crearDocumento(texto, color) {
  const g = new THREE.Group();
  const hoja = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.32), material(0xFFFFFF, 0.6));
  const franja = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, 0.06), material(color, 0.6)); franja.position.z = -0.12;
  const tag = crearTag(texto, color); tag.position.y = 0.2;
  g.add(hoja, franja, tag); g.rotation.x = -0.5; return g;
}

export async function entregar(deId, aId, item) {
  const a = agentes[deId], b = agentes[aId];
  const doc = crearDocumento(item, a.color); doc.position.set(0.26, 0.98, 0.34); a.g.add(doc);
  a.llevando = true;
  const encuentro = { x: b.casa.x + (b.casa.x > a.casa.x ? -0.75 : 0.75), z: b.casa.z + 0.35 };
  await caminarA(a, ruta(a.g.position, encuentro), yawHacia(encuentro, b.casa));
  b.mirarYaw = yawHacia(b.casa, encuentro);
  a.miraA = b.id; a.miraHasta = reloj + 2;            // se miran al pasarse el documento
  b.miraA = a.id; b.miraHasta = reloj + 2;
  gesto(b.id, 'recibir', 0.6);
  await sleep(500);
  a.g.remove(doc); b.g.add(doc); doc.position.set(0.26, 0.98, 0.34);
  a.llevando = false;
  await sleep(700);
  b.g.remove(doc); b.mirarYaw = b.yawCasa;
  gesto(b.id, 'saludo', 1.4, '¡Gracias!');
  caminarA(a, ruta(a.g.position, a.casa), a.yawCasa);   // regresa sin bloquear el guion
}
