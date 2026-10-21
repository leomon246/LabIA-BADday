// El espacio físico: el laboratorio (26 x 17 m, cuatro paredes y techo), una estación por personaje, equipos y pizarra.
// Para agregar muebles u objetos nuevos, este es el archivo.
import * as THREE from 'three';
import { material, canvasTex, rr, FONT, crearTag } from './util.js';
import { registrarObstaculo } from './navegacion.js';

export const VISITANTE = new THREE.Vector3(0, 0, 5.2);   // donde aparece la persona con los lentes
export const pantallas = {};
// Círculos en el piso que el VISITANTE no puede atravesar (los personajes usan navegacion.js)
export const obstaculosJugador = [];
// Para la física (fisica.js): los cubos que se mueven y las superficies elevadas donde se apoyan {x, z, r, h}
export const cubos = [], soportes = [];
// Para el sonido 3D (sonido.js): de dónde sale el zumbido de los racks y las burbujas de los tanques
export const fuentesSonido = { racks: [], tanques: [] };
const bloquear = (x, z, rJugador, rNav = rJugador) => { obstaculosJugador.push({ x, z, r: rJugador }); registrarObstaculo(x, z, rNav); };

// Dimensiones del lab: paredes en x = ±13, z = -6 (fondo, con la pantalla grande) y z = 11 (frente, detrás del visitante)
const AN = 13, ZF = -6, ZT = 11, ALTO = 5.6, CZ = (ZF + ZT) / 2, LARGO = ZT - ZF;
// Estética de cámara de pruebas (estilo Portal): paneles blancos hasta BANDA, metal oscuro arriba, acentos azul y naranja
const BANDA = 3;
const AZUL = 0x3FA9F5, NARANJA = 0xFF8A1E;

// Materiales que brillan y se animan en animarSala (líquidos, LEDs)
const brillos = [];
const brillo = (color, base = 0.8) => {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.3 });
  brillos.push({ m, base, fase: Math.random() * 6.28, vel: 0.8 + Math.random() * 1.6 }); return m;
};
const animados = [];   // funciones (t) => {} de la rejilla, etc.
const vidrio = new THREE.MeshStandardMaterial({ color: 0xD6EEF2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
const LIQUIDOS = [0x45D6C8, 0x7BE07A, 0xB07CE8, 0xF2B544];

// Textura de canvas que se repite. Se dibuja una vez; cada superficie usa un clon (comparte la imagen en la GPU).
function textura(w, h, dibujar) {
  const T = canvasTex(w, h); dibujar(T.ctx, w, h);
  T.t.wrapS = T.t.wrapT = THREE.RepeatWrapping; T.t.needsUpdate = true;
  return (rx, ry) => { const t = T.t.clone(); t.repeat.set(rx, ry); t.needsUpdate = true; return t; };
}
// Placas en cuadrícula (n x n por textura), cada una con un tono un poco distinto, bisel de luz y juntas oscuras
const placas = (n, base, variacion, junta, bisel) => (x, w, h) => {
  const p = w / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = Math.round(base + (Math.random() - 0.5) * variacion);
    x.fillStyle = `rgb(${v},${v + 2},${v + 4})`; x.fillRect(i * p, j * p, p, p);
    x.fillStyle = bisel; x.fillRect(i * p + 3, j * p + 3, p - 6, 3); x.fillRect(i * p + 3, j * p + 3, 3, p - 6);
  }
  x.fillStyle = junta;
  for (let k = 0; k <= n; k++) { x.fillRect(k * p - 2, 0, 4, h); x.fillRect(0, k * p - 2, w, 4); }
};
// Metal oscuro de la parte alta: costillas verticales cada 0,5 m y remaches
const metalOscuro = (x, w, h) => {
  x.fillStyle = '#3A3F44'; x.fillRect(0, 0, w, h);
  for (let k = 0; k < 4; k++) {
    const px = k * w / 4;
    x.fillStyle = '#24282C'; x.fillRect(px, 0, 4, h);
    x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(px + 4, 0, 3, h);
    x.fillStyle = '#2C3034'; for (const py of [14, h / 2, h - 14]) { x.beginPath(); x.arc(px + 20, py, 3, 0, 6.3); x.fill(); }
  }
  x.fillStyle = '#24282C'; x.fillRect(0, h / 2 - 2, w, 4);
};

export function construirSala(scene) {
  scene.add(new THREE.HemisphereLight(0xF2F6FA, 0x3A4046, 1.7));
  const sol = new THREE.DirectionalLight(0xFFFFFF, 2.0);
  sol.position.set(-8, 14, 6); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -17, right: 17, top: 14, bottom: -14, far: 50 });
  sol.target.position.set(0, 0, CZ); scene.add(sol.target);
  scene.add(sol);

  // Piso de placas grises de 1 m
  const texPiso = textura(512, 512, placas(4, 92, 16, '#2A2E32', 'rgba(255,255,255,.07)'));
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(2 * AN, LARGO), new THREE.MeshStandardMaterial({ map: texPiso(2 * AN / 4, LARGO / 4), roughness: 0.6, metalness: 0.1 }));
  piso.rotation.x = -Math.PI / 2; piso.position.z = CZ; piso.receiveShadow = true; scene.add(piso);
  const anillo = (r1, r2, op) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64), new THREE.MeshBasicMaterial({ color: AZUL, transparent: true, opacity: op }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.007, -1.2); scene.add(m);
  };
  anillo(2.5, 2.58, 0.9); anillo(2.25, 2.28, 0.5);

  // Paredes: paneles blancos abajo, una línea de luz y metal oscuro arriba (las cuatro)
  const texBlanca = textura(512, 512, placas(4, 228, 18, '#8E959A', 'rgba(255,255,255,.75)'));
  const texMetal = textura(256, 256, metalOscuro);
  const zocalo = material(0x2A2E32, 0.6), luz = new THREE.MeshBasicMaterial({ color: 0xF4FAFF });
  const pared = (w, x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const blanca = new THREE.Mesh(new THREE.PlaneGeometry(w, BANDA), new THREE.MeshStandardMaterial({ map: texBlanca(w / 4, BANDA / 4), roughness: 0.75 }));
    blanca.position.y = BANDA / 2; blanca.receiveShadow = true;
    const alta = new THREE.Mesh(new THREE.PlaneGeometry(w, ALTO - BANDA), new THREE.MeshStandardMaterial({ map: texMetal(w / 2, 1), roughness: 0.55, metalness: 0.3 }));
    alta.position.y = BANDA + (ALTO - BANDA) / 2;
    const z0 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.04), zocalo); z0.position.set(0, 0.07, 0.02);
    const repisa = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.14), zocalo); repisa.position.set(0, BANDA + 0.06, 0.07);
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.02), luz); l.position.set(0, BANDA - 0.02, 0.15);
    g.add(blanca, alta, z0, repisa, l); scene.add(g);
  };
  pared(2 * AN, 0, ZF, 0);                 // fondo (la pantalla grande)
  pared(2 * AN, 0, ZT, Math.PI);           // frente (detrás de quien llega)
  pared(LARGO, -AN, CZ, Math.PI / 2);      // izquierda
  pared(LARGO, AN, CZ, -Math.PI / 2);      // derecha

  // Techo oscuro con tiras de luz (visto desde arriba no se dibuja: se ve el lab por encima)
  const texTecho = textura(256, 256, placas(4, 50, 8, '#1C1F22', 'rgba(255,255,255,.04)'));
  const techo = new THREE.Mesh(new THREE.PlaneGeometry(2 * AN, LARGO), new THREE.MeshBasicMaterial({ map: texTecho(2 * AN / 4, LARGO / 4) }));
  techo.rotation.x = Math.PI / 2; techo.position.set(0, ALTO, CZ); scene.add(techo);
  const panelLuz = new THREE.MeshBasicMaterial({ color: 0xFFFFFF }), carcasa = material(0x1E2226, 0.5);
  const tiraG = new THREE.BoxGeometry(4.2, 0.05, 0.28), carcasaG = new THREE.BoxGeometry(4.4, 0.1, 0.42);
  for (let i = -2; i <= 2; i++) for (let j = 0; j < 4; j++) {
    const c = new THREE.Mesh(carcasaG, carcasa); c.position.set(i * 5, ALTO - 0.05, ZF + 2 + j * 4.3);
    const p = new THREE.Mesh(tiraG, panelLuz); p.position.set(i * 5, ALTO - 0.1, ZF + 2 + j * 4.3); scene.add(c, p);
  }

  // Ventanas de observación en lo alto de las paredes laterales (la sala de control "vigila" el lab)
  const texVentana = ventanaObservacion();
  const marcoMat = material(0x1E2226, 0.4);
  for (const lado of [-1, 1]) for (const vz of [-2.6, 3.6, 8.4]) {
    const g = new THREE.Group(); g.position.set(lado * (AN - 0.03), 4.15, vz); g.rotation.y = -lado * Math.PI / 2;
    const cristal = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: texVentana }));
    const marco = new THREE.Mesh(new THREE.BoxGeometry(3.44, 1.24, 0.08), marcoMat); marco.position.z = -0.03;
    g.add(marco, cristal);
    for (const tx of [-0.8, 0.8]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.03), marcoMat); t.position.set(tx, 0, 0.015); g.add(t); }
    scene.add(g);
  }

  // Tubos neumáticos de vidrio que recorren lo alto de las paredes laterales
  const soporteG = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 14);
  for (const lado of [-1, 1]) {
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, LARGO - 0.4, 14, 1, true), vidrio);
    tubo.rotation.x = Math.PI / 2; tubo.position.set(lado * (AN - 0.35), 5.05, CZ); scene.add(tubo);
    for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(soporteG, carcasa); s.rotation.x = Math.PI / 2; s.position.set(lado * (AN - 0.35), 5.05, ZF + 0.8 + k * 3.1); scene.add(s); }
  }

  // Letrero en la pared del frente, salida con rejilla de emancipación y el botón con su cubo
  letreroFrente(scene);
  crearSalida(scene, 9.2);
  crearBoton(scene, 0, 9.7, 9.2 - 1.15);
  crearCubo(scene, -6.5, 10.1, 0.4);
  crearCubo(scene, -11.6, 7.4, -0.2);
  crearCubo(scene, 1.45, 3.6, 0.15);   // dos cubos en el piso cerca de donde aparece el visitante
  crearCubo(scene, 2.15, 3.8, -0.2);
  letreroCamara(scene, 7.0, ZF + 0.02);

  // Equipos: tanques en las esquinas del fondo y racks en las del frente
  crearTanque(scene, -AN + 1, ZF + 0.8, LIQUIDOS[0]);
  crearTanque(scene, AN - 1, ZF + 0.8, LIQUIDOS[2]);
  crearRack(scene, -AN + 0.8, ZT - 1.2);
  crearRack(scene, AN - 0.8, ZT - 1.2);
  // Mesas de trabajo largas, para que el lab no sea un salón vacío
  crearIsla(scene, -4.8, 8.4); crearIsla(scene, 4.8, 8.4);

  // Repisas con frascos en las paredes laterales (arriba de la cabeza)
  const repisaMat = material(0x3A3F44, 0.45);
  for (const lado of [-1, 1]) [1.95, 2.45].forEach((y, n) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 4), repisaMat);
    r.position.set(lado * (AN - 0.15), y, 6.6); r.castShadow = true; scene.add(r);
    for (let k = 0; k < 7; k++) frasco(scene, lado * (AN - 0.15), y + 0.015, 4.9 + k * 0.55 + Math.random() * 0.15, LIQUIDOS[(k + n) % 4], k % 2);
  });
}

// Vidrio oscuro de la sala de observación: luz cálida adentro, siluetas de monitores y un reflejo
function ventanaObservacion() {
  const T = canvasTex(256, 80), c = T.ctx;
  const g = c.createLinearGradient(0, 0, 0, 80); g.addColorStop(0, '#8FB0C2'); g.addColorStop(0.5, '#4E6878'); g.addColorStop(1, '#22313B');
  c.fillStyle = g; c.fillRect(0, 0, 256, 80);
  c.fillStyle = '#FFE2B0'; c.fillRect(0, 3, 256, 5);
  c.fillStyle = '#0D1418'; for (let i = 0; i < 5; i++) c.fillRect(14 + i * 50, 46, 30, 20);
  c.fillStyle = '#7FD3FF'; for (let i = 0; i < 5; i++) c.fillRect(17 + i * 50, 49, 24, 13);
  c.fillStyle = 'rgba(255,255,255,.10)'; c.beginPath(); c.moveTo(60, 0); c.lineTo(110, 0); c.lineTo(60, 80); c.lineTo(10, 80); c.fill();
  T.t.needsUpdate = true; return T.t;
}

// Logo de diafragma (8 hojas): un círculo con un hueco octagonal y cortes en espiral
function diafragma(r, color) {
  const T = document.createElement('canvas'); T.width = T.height = r * 2 + 4;
  const c = T.getContext('2d'); c.translate(r + 2, r + 2);
  c.fillStyle = color; c.beginPath(); c.arc(0, 0, r, 0, 6.3); c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); } c.fill();
  c.lineWidth = r * 0.07;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, px = Math.cos(a) * r * 0.36, py = Math.sin(a) * r * 0.36, d = a + 1.15;
    c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(d) * r * 1.3, py + Math.sin(d) * r * 1.3); c.stroke();
  }
  return T;
}

// Letrero del laboratorio en la pared del frente (estilo señalética de cámara de pruebas)
function letreroFrente(scene) {
  const L = canvasTex(1024, 320), x = L.ctx;
  const LOGO = 200, X = 40 + LOGO + 26, ANCHO = 1024 - X - 40;   // logo de 200 px a la izquierda; el texto, a su derecha
  // Tamaño que cabe en ANCHO con la fuente que haya (en el Quest sin internet no carga la de Google y la otra es más ancha)
  const ajustar = (texto, peso, max) => {
    x.font = `${peso} ${max}px ${FONT}`;
    return Math.min(max, Math.floor(max * ANCHO / x.measureText(texto).width));
  };
  const dibujar = () => {
    x.fillStyle = '#ECEDE8'; x.fillRect(0, 0, 1024, 320);
    x.drawImage(diafragma(120, '#1E2226'), 40, (320 - LOGO) / 2, LOGO, LOGO);   // diafragma(r) mide 2r: se escala al tamaño del logo
    x.fillStyle = '#1E2226'; x.font = `600 ${ajustar('Laboratorio de agentes IA', 600, 84)}px ${FONT}`;
    x.fillText('Laboratorio de agentes IA', X, 146);
    x.fillStyle = '#5A6166'; x.font = `400 ${ajustar('Be a Dragon · USFQ', 400, 44)}px ${FONT}`;
    x.fillText('Be a Dragon · USFQ', X + 2, 208);
    x.fillStyle = '#' + new THREE.Color(NARANJA).getHexString(); x.fillRect(X + 2, 234, 220, 10);
    x.fillStyle = '#' + new THREE.Color(AZUL).getHexString(); x.fillRect(X + 230, 234, 220, 10);
    L.t.needsUpdate = true;
  };
  dibujar();
  document.fonts?.ready.then(dibujar);   // redibujar cuando cargue la fuente
  const letrero = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.625), new THREE.MeshBasicMaterial({ map: L.t }));
  letrero.position.set(0, 3.95, ZT - 0.04); letrero.rotation.y = Math.PI; scene.add(letrero);
}

// Letrero vertical de "cámara de pruebas": número grande, barra de progreso y pictogramas
function letreroCamara(scene, x, z) {
  const T = canvasTex(256, 512), c = T.ctx;
  c.fillStyle = '#ECEDE8'; c.fillRect(0, 0, 256, 512);
  c.fillStyle = '#1E2226'; c.font = `300 170px ${FONT}`; c.fillText('01', 18, 160);
  c.fillRect(20, 184, 216, 3);
  c.font = `600 22px ${FONT}`; c.fillText('Sala de agentes', 20, 222);
  for (let i = 0; i < 10; i++) { c.fillStyle = i < 6 ? '#1E2226' : '#C3C6C2'; c.fillRect(20 + i * 22, 240, 16, 8); }
  const glifos = [
    k => { k.fillRect(-10, -10, 20, 20); },                                                           // cubo
    k => { k.beginPath(); k.arc(0, -10, 5, 0, 6.3); k.fill(); k.fillRect(-4, -4, 8, 16); },              // persona
    k => { k.beginPath(); k.arc(0, 0, 11, 0, 6.3); k.fill(); },                                         // esfera
    k => { k.beginPath(); k.moveTo(-10, 8); k.lineTo(0, -10); k.lineTo(10, 8); k.fill(); },             // peligro
    k => { k.fillRect(-11, -2, 16, 4); k.beginPath(); k.moveTo(3, -8); k.lineTo(12, 0); k.lineTo(3, 8); k.fill(); },   // avance
    k => { k.fillRect(-8, -11, 16, 22); },                                                            // documento
  ];
  for (let i = 0; i < 6; i++) {
    const px = 20 + (i % 3) * 76, py = 280 + Math.floor(i / 3) * 76, on = i !== 3;
    c.fillStyle = on ? '#1E2226' : '#C3C6C2'; c.fillRect(px, py, 64, 64);
    c.save(); c.translate(px + 32, py + 32); c.fillStyle = on ? '#ECEDE8' : '#8E9290'; glifos[i](c); c.restore();
  }
  T.t.needsUpdate = true;
  const marco = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.7, 0.06), material(0x1E2226, 0.5)); marco.position.set(x, 1.6, z + 0.03);
  const cara = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshBasicMaterial({ map: T.t })); cara.position.set(x, 1.6, z + 0.065);
  scene.add(marco, cara);
}

// Puerta de salida en la pared del frente con su rejilla de emancipación (cortina azul que titila)
function crearSalida(scene, x) {
  const z = ZT - 0.03, W = 2.2, H = 3.0, oscuro = material(0x1E2226, 0.5);
  const hueco = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x0C0F12 }));
  hueco.position.set(x, H / 2, z); hueco.rotation.y = Math.PI;
  const dintel = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.25, 0.3), oscuro); dintel.position.set(x, H + 0.12, z - 0.12);
  scene.add(hueco, dintel);
  const tiraLuz = new THREE.MeshBasicMaterial({ color: AZUL });
  for (const s of [-1, 1]) {
    const poste = new THREE.Mesh(new THREE.BoxGeometry(0.25, H, 0.3), oscuro); poste.position.set(x + s * (W / 2 + 0.12), H / 2, z - 0.12);
    const tira = new THREE.Mesh(new THREE.BoxGeometry(0.04, H - 0.3, 0.02), tiraLuz); tira.position.set(x + s * (W / 2 - 0.005), H / 2, z - 0.28);
    scene.add(poste, tira);
  }
  const T = canvasTex(64, 256), c = T.ctx;
  for (let i = 0; i < 64; i += 2) { c.fillStyle = `rgba(120,200,255,${(0.15 + Math.random() * 0.5).toFixed(2)})`; c.fillRect(i, 0, 1 + Math.random() * 2, 256); }
  T.t.wrapS = T.t.wrapT = THREE.RepeatWrapping; T.t.repeat.set(3, 1); T.t.needsUpdate = true;
  const rejilla = new THREE.Mesh(new THREE.PlaneGeometry(W, H - 0.1), new THREE.MeshBasicMaterial({ map: T.t, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  rejilla.position.set(x, H / 2, z - 0.2); scene.add(rejilla);
  animados.push(t => { T.t.offset.x = t * 0.08; T.t.offset.y = t * 0.3; rejilla.material.opacity = 0.5 + 0.12 * Math.sin(t * 9) * Math.sin(t * 2.1); });
}

// Cubo de compañía: gris con esquinas reforzadas y un corazón rosa en cada cara
let texCubo = null;
function crearCubo(scene, x, z, ry = 0, y = 0) {
  if (!texCubo) {
    const T = canvasTex(256, 256), c = T.ctx;
    c.fillStyle = '#8C9398'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#5C6368'; c.lineWidth = 20; c.strokeRect(10, 10, 236, 236);
    c.fillStyle = '#C8CDD0';
    for (const [px, py] of [[0, 0], [176, 0], [0, 176], [176, 176]]) c.fillRect(px, py, 80, 80);
    c.fillStyle = '#5C6368'; for (const [px, py] of [[24, 24], [192, 24], [24, 192], [192, 192]]) c.fillRect(px, py, 40, 40);
    c.fillStyle = '#C8CDD0'; c.beginPath(); c.arc(128, 128, 56, 0, 6.3); c.fill();
    c.fillStyle = '#5C6368'; c.beginPath(); c.arc(128, 128, 44, 0, 6.3); c.fill();
    c.fillStyle = '#F07AB4'; c.beginPath(); c.moveTo(128, 154);
    c.bezierCurveTo(96, 132, 100, 102, 120, 106); c.bezierCurveTo(126, 107, 128, 114, 128, 116);
    c.bezierCurveTo(128, 114, 130, 107, 136, 106); c.bezierCurveTo(156, 102, 160, 132, 128, 154); c.fill();
    T.t.needsUpdate = true; texCubo = new THREE.MeshStandardMaterial({ map: T.t, roughness: 0.5, metalness: 0.2 });
  }
  const cubo = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), texCubo);
  cubo.position.set(x, y + 0.3, z); cubo.rotation.y = ry; cubo.castShadow = cubo.receiveShadow = true; scene.add(cubo);
  cubos.push(cubo);   // ya no es obstáculo fijo: lo mueve fisica.js
  return cubo;
}

// Botón grande de piso con un cubo encima y la fila de puntos que lo conecta con la salida (encendidos = naranja)
function crearBoton(scene, x, z, xFin) {
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.1, 32), material(0x3A3F44, 0.5)); base.position.set(x, 0.05, z);
  const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 32), material(0xD9DCDD, 0.4)); aro.position.set(x, 0.11, z);
  const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.06, 32), brillo(0xE0442C, 0.35)); disco.position.set(x, 0.13, z);
  base.receiveShadow = aro.receiveShadow = true; scene.add(base, aro, disco);
  crearCubo(scene, x, z, 0.25, 0.16);
  soportes.push({ x, z, r: 0.62, h: 0.16 });   // el cubo se apoya sobre el disco
  bloquear(x, z, 0.85, 0.8);
  const n = Math.floor((xFin - x - 0.9) / 0.35), punto = new THREE.CircleGeometry(0.06, 12), mat = brillo(NARANJA, 1.0);
  const fila = new THREE.InstancedMesh(punto, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), uno = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) fila.setMatrixAt(i, m.compose(new THREE.Vector3(x + 0.9 + i * 0.35, 0.008, ZT - 0.35), q, uno));
  scene.add(fila);
}

// Geometrías compartidas de la cristalería
const G = {
  matraz: new THREE.CylinderGeometry(0.02, 0.075, 0.16, 16),
  matrazLiq: new THREE.CylinderGeometry(0.04, 0.068, 0.08, 16),
  vaso: new THREE.CylinderGeometry(0.05, 0.05, 0.14, 16),
  vasoLiq: new THREE.CylinderGeometry(0.044, 0.044, 0.08, 16),
};
// Un matraz (tipo=1) o un vaso de precipitados (tipo=0) con líquido brillante
function frasco(padre, x, y, z, color, tipo) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const liq = new THREE.Mesh(tipo ? G.matrazLiq : G.vasoLiq, brillo(color, 0.6)); liq.position.y = 0.04;
  const cas = new THREE.Mesh(tipo ? G.matraz : G.vaso, vidrio); cas.position.y = tipo ? 0.08 : 0.07;
  g.add(liq, cas); padre.add(g); return g;
}

function crearTanque(scene, x, z, color) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const metal = material(0x7D878B, 0.35);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.16, 24), metal); base.position.y = 0.08;
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.15, 24), brillo(color, 0.9)); liq.position.y = 0.74;
  const cas = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.5, 24, 1, true), vidrio); cas.position.y = 0.91;
  const tapa = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 24), metal); tapa.position.y = 1.72;
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, ALTO - 1.79, 8), metal); tubo.position.y = (ALTO + 1.79) / 2;   // sube hasta el techo
  base.castShadow = tapa.castShadow = true;
  g.add(base, liq, cas, tapa, tubo); scene.add(g);
  bloquear(x, z, 0.5);
  fuentesSonido.tanques.push({ x, z });
}

function crearRack(scene, x, z) {
  fuentesSonido.racks.push({ x, z });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;   // el frente mira al centro
  const caja = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.0, 0.6), material(0x2B3236, 0.5));
  caja.position.y = 1.0; caja.castShadow = true; g.add(caja);
  const ranura = new THREE.BoxGeometry(0.66, 0.012, 0.01), led = new THREE.BoxGeometry(0.04, 0.04, 0.01);
  const ranuraMat = material(0x46525A, 0.5);
  for (let i = 0; i < 9; i++) {
    const y = 0.35 + i * 0.18;
    const r = new THREE.Mesh(ranura, ranuraMat); r.position.set(0, y - 0.06, 0.305); g.add(r);
    for (let k = 0; k < 3; k++) {
      const l = new THREE.Mesh(led, brillo(LIQUIDOS[(i + k) % 3 ? 0 : 1], 1.2)); l.position.set(-0.28 + k * 0.07, y, 0.305); g.add(l);
    }
  }
  scene.add(g);
  bloquear(x, z, 0.55);
}

// Mesa de trabajo larga con cristalería (en el centro-frente del lab)
function crearIsla(scene, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 1.0), material(0xF1F4F5, 0.35)); tablero.position.y = 0.95; tablero.castShadow = tablero.receiveShadow = true;
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 0.85), material(0x3C474C, 0.55)); cuerpo.position.y = 0.45; cuerpo.castShadow = true;
  const borde = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: NARANJA })); borde.position.set(0, 0.92, 0.5);
  g.add(tablero, cuerpo, borde);
  for (let k = 0; k < 5; k++) frasco(g, -1.3 + k * 0.65 + Math.random() * 0.1, 0.98, (k % 2 ? 0.12 : -0.12), LIQUIDOS[k % 4], k % 2);
  scene.add(g);
  for (const dx of [-1.2, 0, 1.2]) bloquear(x + dx, z, 0.75, 0.62);
}

// Pulso suave de líquidos y LEDs y rejilla. Llamar en cada cuadro con el tiempo en segundos.
export function animarSala(t) {
  for (const b of brillos) b.m.emissiveIntensity = b.base * (0.65 + 0.35 * Math.sin(t * b.vel + b.fase));
  for (const f of animados) f(t);
}

// --- estaciones de trabajo: una mesa por personaje, con objetos propios de su oficio ---
const caja = (g, w, h, d, color, x, y, z, rug = 0.5) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, rug)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
const cil = (g, rs, ri, h, color, x, y, z, rug = 0.5) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rs, ri, h, 14), material(color, rug)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
function lienzo(texto, fondo, tinta, ancho = 256, alto = 128) {   // pantallita con texto o líneas
  const T = canvasTex(ancho, alto), c = T.ctx; c.fillStyle = fondo; c.fillRect(0, 0, ancho, alto);
  c.fillStyle = tinta; c.font = `600 ${Math.round(alto * 0.26)}px ${FONT}`; c.fillText(texto, 14, alto * 0.4); T.t.needsUpdate = true; return { T, c };
}
const ADORNOS = {
  direccion(g) {   // jefe: reloj, carpetas y un letrero de nombre
    cil(g, 0.11, 0.11, 0.03, 0xF5F5F0, 0.62, 1.1, 0.1).rotation.x = Math.PI / 2;
    cil(g, 0.025, 0.025, 0.05, 0x20282B, 0.62, 1.1, 0.12).rotation.x = Math.PI / 2;
    caja(g, 0.26, 0.04, 0.34, 0x2F8F83, -0.6, 1.04, 0.1); caja(g, 0.26, 0.04, 0.34, 0xE08A2E, -0.6, 1.08, 0.1); caja(g, 0.26, 0.04, 0.34, 0x3A6EA5, -0.6, 1.12, 0.1);
  },
  investigacion(g) {   // libros y un globo terráqueo
    [0x3A6EA5, 0xC4523E, 0x3E9E5A].forEach((c, i) => caja(g, 0.28 - i * 0.03, 0.05, 0.2, c, -0.62, 1.05 + i * 0.05, 0.12));
    const globo = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), material(0x3A8FD9, 0.5)); globo.position.set(0.66, 1.2, 0.05); g.add(globo);
    cil(g, 0.01, 0.01, 0.1, 0x7D878B, 0.66, 1.07, 0.05); cil(g, 0.07, 0.07, 0.015, 0x7D878B, 0.66, 1.03, 0.05);
  },
  verificacion(g) {   // microscopio y cajas de Petri
    caja(g, 0.2, 0.03, 0.26, 0x2A3335, 0.62, 1.04, 0.1);
    cil(g, 0.025, 0.025, 0.3, 0xCFD6D8, 0.62, 1.2, 0.04); const tubo = cil(g, 0.03, 0.03, 0.22, 0x2A3335, 0.62, 1.3, 0.1); tubo.rotation.x = 0.5;
    for (let i = 0; i < 3; i++) cil(g, 0.05, 0.05, 0.015, 0xBFE8E4, -0.62 + i * 0.13, 1.03, 0.18, 0.1);
  },
  redaccion(g) {   // pila de hojas, lámpara y tintero
    for (let i = 0; i < 4; i++) caja(g, 0.24, 0.012, 0.32, 0xFFFFFF, -0.6, 1.03 + i * 0.012, 0.12).rotation.y = (i - 1.5) * 0.12;
    cil(g, 0.09, 0.11, 0.03, 0x2A3335, 0.64, 1.03, 0.0);
    const brazo = cil(g, 0.01, 0.01, 0.34, 0x7D878B, 0.64, 1.2, 0.0); brazo.rotation.z = 0.35;
    const pantalla = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.1, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xD9A93B, side: THREE.DoubleSide, emissive: 0xD9A93B, emissiveIntensity: 0.5 })); pantalla.position.set(0.74, 1.36, 0.0); pantalla.rotation.z = 0.5; g.add(pantalla);
    cil(g, 0.025, 0.03, 0.05, 0x1F2A2E, -0.3, 1.05, 0.28);
  },
  diseno(g) {   // tableta gráfica, paleta de colores y muestras
    const t = caja(g, 0.34, 0.015, 0.24, 0x2A3335, -0.58, 1.04, 0.14); t.rotation.x = -0.15;
    const dibujo = lienzo('', '#1F2A2E', '#fff', 128, 96), c = dibujo.c;
    ['#E8505B', '#F2B544', '#45D6C8', '#7C5CFF'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(28 + i * 24, 48, 9, 0, 6.3); c.fill(); }); dibujo.T.t.needsUpdate = true;
    const pantallita = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ map: dibujo.T.t })); pantallita.position.set(-0.58, 1.05, 0.14); pantallita.rotation.x = -Math.PI / 2 - 0.15; g.add(pantallita);
    [0xE8505B, 0xF2B544, 0x45D6C8, 0x7C5CFF].forEach((col, i) => caja(g, 0.08, 0.012, 0.12, col, 0.52 + i * 0.09, 1.03, 0.12));
  },
  animacion(g) {   // segundo monitor con línea de tiempo y una claqueta
    caja(g, 0.5, 0.34, 0.03, 0x2A3335, 0.78, 1.28, -0.12); cil(g, 0.03, 0.03, 0.16, 0x7D878B, 0.78, 1.1, -0.14);
    const { T, c } = lienzo('Timeline', '#10252B', '#7FE0CF', 256, 160);
    ['#E8505B', '#F2B544', '#45D6C8'].forEach((col, i) => { c.fillStyle = col; c.fillRect(20 + i * 50, 70 + i * 22, 90, 14); }); T.t.needsUpdate = true;
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), new THREE.MeshBasicMaterial({ map: T.t })); pan.position.set(0.78, 1.28, -0.1); g.add(pan);
    caja(g, 0.22, 0.12, 0.02, 0x20282B, -0.6, 1.1, 0.2).rotation.x = -0.3; caja(g, 0.22, 0.04, 0.02, 0xFFFFFF, -0.6, 1.18, 0.21).rotation.x = -0.1;
  },
  edicion(g) {   // pantalla ancha de edición y una mesa de mezcla
    caja(g, 0.9, 0.3, 0.03, 0x2A3335, 0.72, 1.3, -0.14);
    const { T, c } = lienzo('Edición', '#10252B', '#7FE0CF', 512, 160);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) { c.fillStyle = ['#E8505B', '#F2B544', '#45D6C8', '#7C5CFF'][(i + k) % 4]; c.fillRect(20 + k * 120 + i * 14, 60 + i * 30, 100, 18); } T.t.needsUpdate = true;
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.27), new THREE.MeshBasicMaterial({ map: T.t })); pan.position.set(0.72, 1.3, -0.12); g.add(pan);
    caja(g, 0.4, 0.04, 0.2, 0x20282B, -0.55, 1.04, 0.15); for (let i = 0; i < 5; i++) caja(g, 0.015, 0.03, 0.05, 0x45D6C8, -0.7 + i * 0.07, 1.07, 0.15 + (i % 2) * 0.03);
  },
};
export const ROTULOS = { direccion: 'Dirección', investigacion: 'Investigación', verificacion: 'Verificación', redaccion: 'Redacción', diseno: 'Diseño', animacion: 'Animación', edicion: 'Edición' };

// Mesa de laboratorio con monitor, cristalería y los objetos de su oficio (tipo). Devuelve dónde se para el agente y hacia dónde mira.
let nMesas = 0;
export function crearEscritorio(scene, id, x, z, tipo = null, colorZona = 0x45D6C8) {
  const metal = material(0x7D878B, 0.35);
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(VISITANTE.x - x, VISITANTE.z - z);   // la pantalla mira hacia el visitante
  // zona de color en el piso: así se ve de lejos de quién es cada estación
  const zona = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 2.7), new THREE.MeshBasicMaterial({ color: colorZona, transparent: true, opacity: 0.16 }));
  zona.rotation.x = -Math.PI / 2; zona.position.set(0, 0.005, 0.5); g.add(zona);
  const orilla = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.05), new THREE.MeshBasicMaterial({ color: colorZona })); orilla.rotation.x = -Math.PI / 2; orilla.position.set(0, 0.006, 1.85); g.add(orilla);
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.8), material(0xF1F4F5, 0.35));
  tablero.position.y = 1.0; tablero.castShadow = tablero.receiveShadow = true; g.add(tablero);
  const borde = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: AZUL }));
  borde.position.set(0, 0.97, 0.4); g.add(borde);
  // gabinete a la derecha, patas a la izquierda (espacio para las piernas)
  const gabinete = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 0.72), material(0x3C474C, 0.55));
  gabinete.position.set(0.42, 0.475, 0); gabinete.castShadow = true; g.add(gabinete);
  for (const y of [0.3, 0.68]) {
    const asa = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.02), metal); asa.position.set(0.42, y, 0.37); g.add(asa);
  }
  for (const lz of [-0.33, 0.33]) {
    const pata = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), metal); pata.position.set(-0.78, 0.5, lz); pata.castShadow = true; g.add(pata);
  }
  const marco = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.54, 0.04), material(0x2A3335, 0.4));
  marco.position.set(0.18, 1.42, -0.22); marco.castShadow = true; g.add(marco);
  const S = canvasTex(512, 300);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.47), new THREE.MeshBasicMaterial({ map: S.t }));
  pantalla.position.set(0.18, 1.42, -0.199); g.add(pantalla);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), metal); base.position.set(0.18, 1.12, -0.24); g.add(base);
  // cristalería (solo en las mesas "científicas")
  if (!tipo || tipo === 'verificacion' || tipo === 'investigacion') {
    const n = nMesas++, c = LIQUIDOS.length;
    frasco(g, -0.62, 1.025, -0.2, LIQUIDOS[n % c], 1);
    frasco(g, -0.45, 1.025, -0.26, LIQUIDOS[(n + 1) % c], 0);
    frasco(g, -0.68, 1.025, -0.02, LIQUIDOS[(n + 2) % c], 0);
  }
  if (tipo && ADORNOS[tipo]) ADORNOS[tipo](g);
  // rótulo flotante con el oficio de la estación
  if (tipo && ROTULOS[tipo]) { const r = crearTag(ROTULOS[tipo], colorZona); r.scale.set(0.95, 0.285, 1); r.position.set(0.1, 2.2, -0.2); g.add(r); }
  scene.add(g);

  // obstáculos: el jugador, un círculo grande; los personajes, tres chicos a lo largo de la mesa
  g.updateMatrixWorld(true);
  const c0 = g.localToWorld(new THREE.Vector3(0, 0, 0));
  obstaculosJugador.push({ x: c0.x, z: c0.z, r: 1.05 });
  for (const lx of [-0.6, 0, 0.6]) { const p = g.localToWorld(new THREE.Vector3(lx, 0, 0)); registrarObstaculo(p.x, p.z, 0.4); }

  pantallas[id] = { S, lineas: [], animo: 'idle', titulo: '' };
  dibujarPantalla(id);
  return { puesto: g.localToWorld(new THREE.Vector3(-0.4, 0, 0.72)), yaw: g.rotation.y + Math.PI, grupo: g };
}

// Escenario del presentador: una marca en el piso y un atril
export function crearEscenario(scene, x, z) {
  const T = canvasTex(256, 192), c = T.ctx;
  c.fillStyle = '#17262B'; rr(c, 0, 0, 256, 192, 24); c.fill(); c.strokeStyle = '#45D6C8'; c.lineWidth = 6; rr(c, 6, 6, 244, 180, 20); c.stroke(); T.t.needsUpdate = true;
  const marca = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.95), new THREE.MeshBasicMaterial({ map: T.t })); marca.rotation.x = -Math.PI / 2; marca.position.set(x, 0.008, z); scene.add(marca);
  const atril = new THREE.Group(); atril.position.set(x + 1.05, 0, z - 0.35);
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.4), material(0x2A3335, 0.5)); cuerpo.position.y = 0.475; cuerpo.castShadow = true;
  const tapa = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.48), material(AZUL, 0.4)); tapa.position.y = 0.97; tapa.rotation.x = 0.25;
  atril.add(cuerpo, tapa); scene.add(atril); bloquear(x + 1.05, z - 0.35, 0.55, 0.45);
}

const ANIMOS = { idle: ['#25302F', '#8FA39C'], work: ['#10343A', '#7FE0CF'], alert: ['#4A1F1F', '#FFB4A8'], ok: ['#1D3B22', '#A8E39A'] };
export function dibujarPantalla(id) {
  const s = pantallas[id], x = s.S.ctx, [fondo, tinta] = ANIMOS[s.animo];
  x.fillStyle = fondo; x.fillRect(0, 0, 512, 300);
  x.fillStyle = tinta; x.font = `600 30px ${FONT}`; x.fillText(s.titulo || 'En espera', 22, 46);
  x.globalAlpha = 0.35; x.fillRect(22, 62, 468, 2); x.globalAlpha = 1;
  x.font = '400 26px ui-monospace, Menlo, monospace';
  s.lineas.slice(-6).forEach((ln, i) => x.fillText(ln.length > 32 ? ln.slice(0, 31) + '…' : ln, 22, 104 + i * 34));
  s.S.t.needsUpdate = true;
}

// Pizarra: un monitor grande en la pared del fondo. Muestra la lista de tareas
// o, si llega una presentación, sus diapositivas. Se dibuja en un lienzo lógico de 1024x560 (sale al doble de nítido).
let P;
const PW = 6.2, PH = 3.4, PY = 2.4;   // tamaño y altura de la pantalla grande (el lab es grande: se ve desde lejos)
export let pizarra;   // la malla, para apuntarle con el rayo del control
const ACENTO = '#45D6C8', TINTA = '#E6F4F2', SUAVE = '#8FB3B0';
export function crearPizarra(scene) {
  P = canvasTex(2048, 1120); P.ctx.scale(2, 2);
  const tablero = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: P.t }));
  tablero.position.set(0, PY, -5.78); scene.add(tablero); pizarra = tablero;
  const marco = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.16, PH + 0.16, 0.05), material(0x2A3335, 0.4));
  marco.position.set(0, PY, -5.82); scene.add(marco);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.3, PH + 0.3), new THREE.MeshBasicMaterial({ color: AZUL }));
  halo.position.set(0, PY, -5.825); scene.add(halo);
  dibujarPizarra('Sin tareas', []);
}

// --- Temas visuales: cada presentación elige uno (la IA según el tema, o por el título si no lo dice) ---
const SERIF = 'Georgia, "Times New Roman", serif';
export const TEMAS = {
  cosmos:     { fondo: ['#0E1C22', '#0A1316'], brillo: 'rgba(69,214,200,.22)',  acento: '#45D6C8', acento2: '#7C9CFF', tinta: '#E6F4F2', suave: '#8FB3B0', rejilla: 'rgba(143,179,176,.10)', linea: '#2C4A50', serif: false, claro: false, motivo: 'orbitas' },
  naturaleza: { fondo: ['#0F2218', '#0A160F'], brillo: 'rgba(126,217,87,.20)',  acento: '#7ED957', acento2: '#E8D26A', tinta: '#EAF6E4', suave: '#9DBF94', rejilla: 'rgba(157,191,148,.10)', linea: '#2F4A33', serif: true,  claro: false, motivo: 'hojas' },
  calido:     { fondo: ['#2A1710', '#180D09'], brillo: 'rgba(255,170,80,.22)',  acento: '#FFB04A', acento2: '#FF6B5B', tinta: '#FFF1E2', suave: '#C9A68A', rejilla: 'rgba(201,166,138,.10)', linea: '#5A3A2A', serif: true,  claro: false, motivo: 'sol' },
  neon:       { fondo: ['#150B24', '#0A0614'], brillo: 'rgba(255,60,200,.22)',  acento: '#3CF0FF', acento2: '#FF4FD8', tinta: '#F3EBFF', suave: '#A99BC9', rejilla: 'rgba(169,155,201,.10)', linea: '#3B2A5E', serif: false, claro: false, motivo: 'rejilla' },
  papel:      { fondo: ['#F4EEE2', '#E9E0CF'], brillo: 'rgba(210,120,80,.14)',  acento: '#C4573A', acento2: '#2F6F73', tinta: '#2A2420', suave: '#6E6258', rejilla: 'rgba(110,98,88,.13)',   linea: '#CFC2AB', serif: true,  claro: true,  motivo: 'puntos' },
  oceano:     { fondo: ['#07243A', '#041622'], brillo: 'rgba(80,190,255,.22)',  acento: '#4FC3F7', acento2: '#80F0D0', tinta: '#E3F4FF', suave: '#8DB4CC', rejilla: 'rgba(141,180,204,.10)', linea: '#1F4764', serif: false, claro: false, motivo: 'olas' },
};
const hash = t => { let h = 7; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const temaDe = p => TEMAS[p && p.tema_visual] || Object.values(TEMAS)[hash(p ? p.titulo : '') % 6];
const fuente = (T, peso, tam, titulo = false) => titulo && T.serif ? `${peso === 600 ? 'bold' : 'normal'} ${tam}px ${SERIF}` : `${peso} ${tam}px ${FONT}`;

// Motivos decorativos de fondo (en la portada grandes; en el contenido, discretos en una esquina)
function motivo(x, T, grande) {
  x.save();
  const a = grande ? 1 : 0.45;
  if (T.motivo === 'orbitas') {
    x.translate(grande ? 800 : 930, grande ? 290 : 480); x.lineWidth = 2;
    (grande ? [70, 120, 170, 225] : [50, 90, 130]).forEach((r, i) => { x.strokeStyle = rgba(T.acento, (0.55 - i * 0.11) * a); x.beginPath(); x.ellipse(0, 0, r, r * 0.42, -0.35, 0, Math.PI * 2); x.stroke(); });
    x.fillStyle = rgba(T.acento, a); x.beginPath(); x.arc(0, 0, grande ? 26 : 12, 0, Math.PI * 2); x.fill();
    x.fillStyle = rgba(T.tinta, a); x.beginPath(); x.arc(grande ? -92 : -48, grande ? -26 : -14, grande ? 8 : 5, 0, Math.PI * 2); x.fill();
  } else if (T.motivo === 'hojas') {
    const hoja = (px, py, r, rot, col) => { x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = col; x.beginPath(); x.ellipse(0, 0, r, r * 0.38, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = rgba(T.tinta, 0.25 * a); x.lineWidth = 2; x.beginPath(); x.moveTo(-r, 0); x.lineTo(r, 0); x.stroke(); x.restore(); };
    const base = grande ? [[820, 300, 190, -0.9], [900, 180, 140, -0.3], [760, 430, 150, -1.5], [930, 400, 120, 0.2]] : [[980, 520, 120, -0.9], [900, 560, 100, -0.4], [1010, 430, 90, -1.4]];
    base.forEach(([px, py, r, rot], i) => hoja(px, py, r, rot, rgba(i % 2 ? T.acento2 : T.acento, (grande ? 0.2 : 0.12))));
  } else if (T.motivo === 'sol') {
    x.translate(grande ? 830 : 960, grande ? 420 : 560);
    for (let i = 0; i < (grande ? 5 : 3); i++) { x.fillStyle = rgba(i % 2 ? T.acento2 : T.acento, (0.28 - i * 0.04) * a); x.beginPath(); x.arc(0, 0, (grande ? 220 : 120) - i * (grande ? 36 : 28), Math.PI, 0); x.fill(); }
    x.strokeStyle = rgba(T.acento, 0.3 * a); x.lineWidth = 3;
    for (let k = 0; k < 9; k++) { const t = Math.PI + (k + 0.5) / 9 * Math.PI; x.beginPath(); x.moveTo(Math.cos(t) * (grande ? 240 : 140), Math.sin(t) * (grande ? 240 : 140)); x.lineTo(Math.cos(t) * (grande ? 300 : 170), Math.sin(t) * (grande ? 300 : 170)); x.stroke(); }
  } else if (T.motivo === 'rejilla') {
    x.strokeStyle = rgba(T.acento2, 0.45 * a); x.lineWidth = 1.5;
    const y0 = grande ? 360 : 450;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(512 + (i - 4) * 28, y0); x.lineTo(512 + (i - 4) * (grande ? 240 : 190), 560); x.stroke(); }
    for (let j = 1; j <= 5; j++) { const y = y0 + (560 - y0) * (j / 5) ** 1.8; x.beginPath(); x.moveTo(0, y); x.lineTo(1024, y); x.stroke(); }
    x.fillStyle = rgba(T.acento2, 0.28 * a); x.beginPath(); x.arc(512, y0 - 10, grande ? 120 : 70, Math.PI, 0); x.fill();
    x.fillStyle = rgba(T.acento, 0.5 * a); for (let i = 0; i < 4; i++) x.fillRect(512 - (grande ? 120 : 70), y0 - 10 - i * (grande ? 22 : 14), (grande ? 240 : 140), 4);
  } else if (T.motivo === 'puntos') {
    for (let i = 0; i < 14; i++) for (let j = 0; j < 9; j++) { const r = Math.max(0, 7 - (i + j) * 0.38) * (grande ? 1.3 : 0.9); if (r < 0.5) continue; x.fillStyle = rgba(T.acento, 0.55 * a); x.beginPath(); x.arc(1024 - 36 - i * 24, 36 + j * 24, r, 0, Math.PI * 2); x.fill(); }
    if (grande) { x.strokeStyle = rgba(T.acento2, 0.5); x.lineWidth = 3; x.strokeRect(700, 250, 260, 200); x.fillStyle = rgba(T.acento2, 0.15); x.fillRect(716, 266, 260, 200); }
  } else if (T.motivo === 'olas') {
    for (let k = 0; k < (grande ? 5 : 3); k++) {
      x.strokeStyle = rgba(k % 2 ? T.acento2 : T.acento, (0.5 - k * 0.07) * a); x.lineWidth = 3; x.beginPath();
      for (let px = 0; px <= 1024; px += 8) { const y = (grande ? 380 : 480) + k * (grande ? 34 : 24) + Math.sin(px / 70 + k * 0.9) * (grande ? 26 : 14); px === 0 ? x.moveTo(px, y) : x.lineTo(px, y); } x.stroke();
    }
  }
  x.restore();
}
// '#RRGGBB' + alfa -> 'rgba(...)'
function rgba(hex, alfa) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alfa})`; }

// Fondo común: degradado del tema, resplandor arriba a la derecha y una malla de puntos
function fondoPizarra(x, T = TEMAS.cosmos) {
  const g = x.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, T.fondo[0]); g.addColorStop(1, T.fondo[1]);
  x.fillStyle = g; x.fillRect(0, 0, 1024, 560);
  const r = x.createRadialGradient(900, 40, 10, 900, 40, 440); r.addColorStop(0, T.brillo); r.addColorStop(1, T.brillo.replace(/[\d.]+\)$/, '0)'));
  x.fillStyle = r; x.fillRect(0, 0, 1024, 560);
  x.fillStyle = T.rejilla;
  for (let i = 16; i < 1024; i += 32) for (let j = 16; j < 560; j += 32) x.fillRect(i, j, 2, 2);
}

const ESTADOS = { pendiente: ['#6F7C80', 'Pendiente'], curso: ['#D9A93B', 'En curso'], revision: ['#9A5F8D', 'En revisión'], rechazado: ['#C4523E', 'Corrigiendo'], hecho: ['#3E9E5A', 'Hecho'] };
export function dibujarPizarra(titulo, tareas) {
  if (presentacion) return;   // hay diapositivas en pantalla: la lista de tareas no las tapa
  const x = P.ctx; fondoPizarra(x);
  x.fillStyle = TINTA; x.font = `600 46px ${FONT}`; x.fillText(titulo, 48, 82);
  x.fillStyle = ACENTO; x.fillRect(48, 106, 90, 5); x.fillStyle = '#2C4A50'; x.fillRect(138, 108, 838, 2);
  tareas.forEach((t, i) => {
    const y = 180 + i * 92, [col, etiqueta] = ESTADOS[t.estado];
    x.fillStyle = col; x.beginPath(); x.arc(70, y - 12, 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = TINTA; x.font = `600 38px ${FONT}`; x.fillText(t.nombre, 104, y);
    x.fillStyle = SUAVE; x.font = `400 32px ${FONT}`; x.fillText(t.quien, 470, y);
    x.fillStyle = col; rr(x, 742, y - 44, 232, 56, 28); x.fill();
    x.fillStyle = '#fff'; x.font = `600 28px ${FONT}`; x.textAlign = 'center'; x.fillText(etiqueta, 858, y - 6); x.textAlign = 'left';
  });
  P.t.needsUpdate = true;
}

// --- Diapositivas en la pizarra ---
let presentacion = null, actual = 0, narrando = false, alCambiar = null;

export const hayDiapositivas = () => presentacion !== null;
export const indiceActual = () => actual;
export const totalDiapositivas = () => presentacion ? presentacion.diapositivas.length + 1 : 0;
// Nombre del modelo 3D de la diapositiva i (0 = portada); lo elige la IA entre los de modelos.js
export const visualDe = i => !presentacion ? 'ninguno' : i === 0 ? presentacion.visual_portada : presentacion.diapositivas[i - 1]?.visual;
// Lo que se dice en voz alta en cada diapositiva (0 = portada); respaldo si no hay audio grabado
export function textoNarracion(i) {
  if (!presentacion) return '';
  if (i === 0) return presentacion.narracion_portada || `${presentacion.titulo}. ${presentacion.subtitulo}`;
  const d = presentacion.diapositivas[i - 1];
  return d ? ((d.narracion || '').trim() || d.puntos.join('. ')) : '';
}
// f(indice, origen) se llama cuando aparece una presentación ('nueva') o se cambia de diapositiva ('cambio')
export const alCambiarDiapositiva = f => { alCambiar = f; };
export function marcarNarrando(v) { if (narrando !== v) { narrando = v; if (presentacion) dibujarDiapositiva(); } }

// p = { titulo, subtitulo, imagen_portada?, diapositivas:[{titulo, puntos, formula, nota, narracion, imagen?}] }
export function mostrarDiapositivas(p) {
  presentacion = p; actual = 0;
  [p.imagen_portada, ...p.diapositivas.map(d => d.imagen)].forEach(imagen);   // se precargan todas
  dibujarDiapositiva(); alCambiar && alCambiar(0, 'nueva');
}

// Imágenes de las diapositivas (las traen las presentaciones precargadas): se cargan una vez y se redibuja al llegar
const imagenes = new Map();
function imagen(url) {
  if (!url) return null;
  let img = imagenes.get(url);
  if (!img) { img = new Image(); img.onload = () => { if (presentacion) dibujarDiapositiva(); }; img.src = url; imagenes.set(url, img); }
  return img.complete && img.naturalWidth ? img : null;
}
// La imagen ajustada (sin deformar) dentro de la caja, con esquinas redondeadas y borde del tema
function cuadroImagen(x, T, url, bx, by, bw, bh) {
  const img = imagen(url); if (!img) return;
  const k = Math.min(bw / img.naturalWidth, bh / img.naturalHeight), w = img.naturalWidth * k, h = img.naturalHeight * k;
  const ix = bx + (bw - w) / 2, iy = by + (bh - h) / 2;
  x.save(); rr(x, ix, iy, w, h, 18); x.clip(); x.drawImage(img, ix, iy, w, h); x.restore();
  x.strokeStyle = rgba(T.acento, 0.55); x.lineWidth = 2; rr(x, ix, iy, w, h, 18); x.stroke();
}
export function cambiarDiapositiva(paso) { return irADiapositiva(actual + paso); }
export function irADiapositiva(i) {
  if (!presentacion) return false;
  const n = Math.max(0, Math.min(presentacion.diapositivas.length, i));   // 0 = portada
  if (n === actual) return false;
  actual = n; dibujarDiapositiva(); alCambiar && alCambiar(actual, 'cambio');
  return true;
}

// Corta un texto en líneas que quepan en 'ancho' px con la fuente actual del contexto
function envolver(x, texto, ancho) {
  const lineas = []; let linea = '';
  for (const palabra of String(texto).split(' ')) {
    const prueba = linea ? linea + ' ' + palabra : palabra;
    if (x.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = palabra; } else linea = prueba;
  }
  if (linea) lineas.push(linea);
  return lineas;
}

function dibujarDiapositiva() {
  const x = P.ctx, total = presentacion.diapositivas.length + 1, T = temaDe(presentacion);
  fondoPizarra(x, T);
  if (actual === 0) portada(x, T); else contenido(x, T, presentacion.diapositivas[actual - 1]);
  // progreso: una pastilla por diapositiva (barra continua si son muchas)
  const ancho = 1024 - 112, gap = total > 14 ? 0 : 6, w = (ancho - gap * (total - 1)) / total;
  for (let i = 0; i < total; i++) {
    x.fillStyle = i === actual ? T.acento : i < actual ? rgba(T.acento, 0.45) : T.linea;
    rr(x, 56 + i * (w + gap), 544, Math.max(w, 2), 6, 3); x.fill();
  }
  x.fillStyle = T.suave; x.font = `400 20px ${FONT}`; x.textAlign = 'right'; x.fillText(`${actual + 1} / ${total}`, 968, 532); x.textAlign = 'left';
  if (narrando) {   // altavoz + "Narrando"
    x.fillStyle = T.acento; x.fillRect(56, 518, 8, 12);
    x.beginPath(); x.moveTo(64, 518); x.lineTo(76, 510); x.lineTo(76, 538); x.lineTo(64, 530); x.fill();
    x.strokeStyle = T.acento; x.lineWidth = 2;
    for (const r of [6, 12]) { x.beginPath(); x.arc(76, 524, r, -0.9, 0.9); x.stroke(); }
    x.font = `600 20px ${FONT}`; x.fillText('Narrando', 102, 531);
  }
  P.t.needsUpdate = true;
}

function portada(x, T) {
  const img = presentacion.imagen_portada, ancho = img ? 560 : 640;
  if (img) cuadroImagen(x, T, img, 650, 120, 330, 360); else motivo(x, T, true);
  x.font = `600 18px ${FONT}`; const etiqueta = 'LABORATORIO DE AGENTES';
  x.strokeStyle = rgba(T.acento, 0.6); x.lineWidth = 1.5; rr(x, 56, 64, x.measureText(etiqueta).width + 36, 36, 18); x.stroke();
  x.fillStyle = T.acento; x.fillText(etiqueta, 74, 88);
  x.font = fuente(T, 600, 62, true);
  const titulo = envolver(x, presentacion.titulo, ancho).slice(0, 3);
  let y = 230 - (titulo.length - 1) * 30;
  x.fillStyle = T.acento; x.fillRect(56, y - 70, 90, 6);
  x.fillStyle = T.tinta;
  for (const l of titulo) { x.fillText(l, 56, y); y += 70; }
  x.fillStyle = T.suave; x.font = `400 30px ${FONT}`;
  for (const l of envolver(x, presentacion.subtitulo, ancho).slice(0, 3)) { x.fillText(l, 56, y + 6); y += 40; }
}

// Tres composiciones para las diapositivas de contenido, así no todas se ven igual:
//  lista (viñetas numeradas), tarjetas (cuadrícula) y destacado (la idea principal en grande)
function contenido(x, T, d) {
  const tieneFormula = !!(d.formula && d.formula.trim()), nota = d.nota && d.nota.trim() ? d.nota.trim() : '';
  const variante = tieneFormula || nota || d.imagen || d.puntos.length < 2 ? 0 : (hash(presentacion.titulo) + actual) % 3;
  if (!d.imagen) motivo(x, T, false);
  // franja lateral y número de diapositiva
  const g = x.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, T.acento); g.addColorStop(1, rgba(T.acento, 0.15));
  x.fillStyle = g; x.fillRect(0, 0, 10, 560);
  x.strokeStyle = T.acento; x.lineWidth = 2.5; x.beginPath(); x.arc(962, 66, 30, 0, Math.PI * 2); x.stroke();
  x.fillStyle = T.acento; x.font = `600 28px ${FONT}`; x.textAlign = 'center'; x.fillText(String(actual).padStart(2, '0'), 962, 76); x.textAlign = 'left';
  // título
  x.fillStyle = T.tinta; x.font = fuente(T, 600, 50, true);
  const titulo = envolver(x, d.titulo, 820).slice(0, 2);
  let y = 84; for (const l of titulo) { x.fillText(l, 56, y); y += 56; }
  const gl = x.createLinearGradient(56, 0, 520, 0); gl.addColorStop(0, T.acento); gl.addColorStop(1, rgba(T.acento, 0));
  x.fillStyle = gl; x.fillRect(56, y - 30, 464, 4);
  const yIni = y + 22;
  if (variante === 1) return tarjetas(x, T, d, yIni);
  if (variante === 2) return destacado(x, T, d, yIni);
  if (d.imagen) cuadroImagen(x, T, d.imagen, 584, yIni - 4, 384, 500 - yIni);   // con imagen: texto a la izquierda, imagen a la derecha
  lista(x, T, d, yIni, tieneFormula, nota, d.imagen ? 440 : 790);
}

function lista(x, T, d, yIni, tieneFormula, nota, ancho = 790) {
  // espacio disponible para viñetas (la fórmula y la nota van aparte)
  const yTope = 500 - (nota ? 76 : 0) - (tieneFormula ? 96 : 0);
  let tam = 34, bloques = [];
  for (; tam >= 24; tam -= 2) {
    x.font = `400 ${tam}px ${FONT}`;
    bloques = d.puntos.map(p => envolver(x, p, ancho));
    if (bloques.reduce((s, l) => s + l.length * (tam + 8) + 18, 0) <= yTope - yIni) break;
  }
  let yp = yIni + tam;
  bloques.forEach((lineas, i) => {
    x.fillStyle = rgba(T.acento, 0.16); x.strokeStyle = T.acento; x.lineWidth = 2;
    x.beginPath(); x.arc(76, yp - tam * 0.32, 17, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = T.acento; x.font = `600 ${Math.round(tam * 0.55)}px ${FONT}`; x.textAlign = 'center'; x.fillText(String(i + 1), 76, yp - tam * 0.32 + tam * 0.2); x.textAlign = 'left';
    x.fillStyle = T.tinta; x.font = `400 ${tam}px ${FONT}`;
    lineas.forEach((l, k) => x.fillText(l, 112, yp + k * (tam + 8)));
    yp += lineas.length * (tam + 8) + 18;
  });
  // fórmula en un recuadro; nota como cita abajo
  const yBase = 500 - (nota ? 76 : 0);
  if (tieneFormula) {
    x.fillStyle = rgba(T.acento, 0.08); x.strokeStyle = rgba(T.acento, 0.55); x.lineWidth = 2;
    rr(x, 112, yBase - 82, ancho + 10, 72, 16); x.fill(); x.stroke();
    x.fillStyle = T.acento; x.font = 'italic 500 40px Georgia, serif'; x.textAlign = 'center';
    x.fillText(d.formula, 117 + ancho / 2, yBase - 32, ancho - 30); x.textAlign = 'left';
  }
  if (nota) {
    x.font = `400 24px ${FONT}`;
    const ls = envolver(x, nota, ancho + 50).slice(0, 2), y0 = 500 - ls.length * 30 + 10;
    x.fillStyle = T.acento; x.fillRect(56, y0 - 22, 4, ls.length * 30);
    x.fillStyle = T.suave; ls.forEach((l, i) => x.fillText(l, 74, y0 + i * 30));
  }
}

function tarjetas(x, T, d, yIni) {   // cuadrícula de tarjetas numeradas (2 columnas)
  const n = Math.min(d.puntos.length, 4), filas = Math.ceil(n / 2), alto = Math.min(170, (490 - yIni - (filas - 1) * 18) / filas), ancho = 430;
  d.puntos.slice(0, n).forEach((p, i) => {
    const cx = 56 + (i % 2) * (ancho + 22), cy = yIni + Math.floor(i / 2) * (alto + 18);
    x.fillStyle = rgba(T.acento, T.claro ? 0.12 : 0.09); x.strokeStyle = rgba(T.acento, 0.5); x.lineWidth = 2; rr(x, cx, cy, ancho, alto, 18); x.fill(); x.stroke();
    x.fillStyle = rgba(T.acento, 0.9); x.font = fuente(T, 600, 58, true); x.fillText(String(i + 1), cx + 22, cy + 66);
    let tam = 30; x.font = `400 ${tam}px ${FONT}`; let ls = envolver(x, p, ancho - 120);
    while (ls.length * (tam + 6) > alto - 28 && tam > 20) { tam -= 2; x.font = `400 ${tam}px ${FONT}`; ls = envolver(x, p, ancho - 120); }
    x.fillStyle = T.tinta; ls.slice(0, 4).forEach((l, k) => x.fillText(l, cx + 92, cy + 40 + k * (tam + 6)));
  });
}

function destacado(x, T, d, yIni) {   // la idea principal en grande, las demás como etiquetas abajo
  x.fillStyle = rgba(T.acento, 0.35); x.font = fuente(T, 600, 150, true); x.fillText('“', 50, yIni + 90);
  let tam = 46; x.font = fuente(T, 400, tam, true);
  let ls = envolver(x, d.puntos[0], 800);
  while (ls.length * (tam + 12) > 230 && tam > 28) { tam -= 3; x.font = fuente(T, 400, tam, true); ls = envolver(x, d.puntos[0], 800); }
  x.fillStyle = T.tinta; ls.slice(0, 4).forEach((l, k) => x.fillText(l, 120, yIni + 56 + k * (tam + 12)));
  const resto = d.puntos.slice(1, 4); let cx = 56;
  resto.forEach((p, i) => {
    x.font = `400 24px ${FONT}`; const ls2 = envolver(x, p, 260).slice(0, 2), w = Math.min(300, Math.max(...ls2.map(l => x.measureText(l).width)) + 64), h = 28 + ls2.length * 30;
    x.fillStyle = rgba(T.acento, 0.12); x.strokeStyle = rgba(T.acento, 0.5); x.lineWidth = 2; rr(x, cx, 440 - h + 40, w, h, 16); x.fill(); x.stroke();
    x.fillStyle = T.acento; x.font = `600 22px ${FONT}`; x.fillText(String(i + 2), cx + 16, 440 - h + 40 + 32);
    x.fillStyle = T.tinta; x.font = `400 24px ${FONT}`; ls2.forEach((l, k) => x.fillText(l, cx + 46, 440 - h + 40 + 32 + k * 28));
    cx += w + 18;
  });
}
