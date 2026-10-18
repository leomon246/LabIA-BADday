// El espacio físico: el laboratorio, mesas con pantallas, equipos y pizarra.
// Para agregar muebles u objetos nuevos, este es el archivo.
import * as THREE from 'three';
import { material, canvasTex, rr, FONT } from './util.js';

export const VISITANTE = new THREE.Vector3(0, 0, 5.2);   // donde aparece la persona con los lentes
export const pantallas = {};

// Materiales que brillan y se animan en animarSala (líquidos, LEDs)
const brillos = [];
const brillo = (color, base = 0.8) => {
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: base, roughness: 0.3 });
  brillos.push({ m, base, fase: Math.random() * 6.28, vel: 0.8 + Math.random() * 1.6 }); return m;
};
const vidrio = new THREE.MeshStandardMaterial({ color: 0xD6EEF2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false });
const LIQUIDOS = [0x45D6C8, 0x7BE07A, 0xB07CE8, 0xF2B544];

// Textura de canvas que se repite (baldosas del piso, paneles de pared)
function textura(w, h, rx, ry, dibujar) {
  const T = canvasTex(w, h); dibujar(T.ctx, w, h);
  T.t.wrapS = T.t.wrapT = THREE.RepeatWrapping; T.t.repeat.set(rx, ry); T.t.needsUpdate = true;
  return T.t;
}
const baldosa = (x, w, h) => {
  x.fillStyle = '#DCE2E4'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#B9C2C6'; x.lineWidth = 3; x.strokeRect(0, 0, w, h);
};
const panel = (x, w, h) => {
  x.fillStyle = '#EEF2F3'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#C8D1D4'; x.fillRect(0, 0, 3, h); x.fillRect(0, h * 0.62, w, 2);   // juntas entre paneles
};

export function construirSala(scene) {
  scene.add(new THREE.HemisphereLight(0xF4FAFF, 0x6F7A80, 2.4));
  const sol = new THREE.DirectionalLight(0xFFFFFF, 2.6);
  sol.position.set(-6, 9, 4); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  scene.add(sol);

  // Piso de baldosas claras (1 m) y marcas de seguridad
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(16, 14),
    new THREE.MeshStandardMaterial({ map: textura(128, 128, 16, 14, baldosa), roughness: 0.55 }));
  piso.rotation.x = -Math.PI / 2; piso.position.z = 1; piso.receiveShadow = true; scene.add(piso);
  const marca = (w, d, x, z, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: c }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); scene.add(m);
  };
  marca(13, 0.07, 0, 0.45, 0xE2B93B); marca(13, 0.07, 0, 1.75, 0xE2B93B);   // bordes del pasillo de los agentes
  const anillo = (r1, r2, op) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64),
      new THREE.MeshBasicMaterial({ color: 0x45D6C8, transparent: true, opacity: op }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.007, -1.2); scene.add(m);
  };
  anillo(2.5, 2.58, 0.9); anillo(2.25, 2.28, 0.5);

  // Paredes de paneles blancos con zócalo oscuro y una línea de luz arriba
  const zocalo = material(0x3C474C, 0.6), luz = new THREE.MeshBasicMaterial({ color: 0x9FEAE2 });
  const pared = (w, x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 4),
      new THREE.MeshStandardMaterial({ map: textura(128, 256, w / 2, 1, panel), roughness: 0.8 }));
    m.position.y = 2; m.receiveShadow = true;
    const z0 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.18, 0.03), zocalo); z0.position.set(0, 0.09, 0.015);
    const l = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.02), luz); l.position.set(0, 3.7, 0.01);
    g.add(m, z0, l); scene.add(g);
  };
  pared(16, 0, -6, 0);
  pared(14, -8, 1, Math.PI / 2);
  pared(14, 8, 1, -Math.PI / 2);

  // Ventanales de observación (pared izquierda)
  const marcoMat = material(0x55605F, 0.4);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.position.set(-7.97, 2.0, -3.5 + i * 3.2); g.rotation.y = Math.PI / 2;
    const cristal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), new THREE.MeshBasicMaterial({ color: 0xBFD9E2 }));
    const marco = new THREE.Mesh(new THREE.BoxGeometry(2.56, 1.96, 0.04), marcoMat); marco.position.z = -0.025;
    const travesano = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.8, 0.03), marcoMat); travesano.position.z = 0.01;
    g.add(marco, cristal, travesano); scene.add(g);
  }

  // Equipos en las esquinas (mismos lugares que los obstáculos de main.js)
  crearTanque(scene, -7.2, -5.2, LIQUIDOS[0]);
  crearTanque(scene, 7.2, -5.2, LIQUIDOS[2]);
  crearRack(scene, -7.2, 3.5);
  crearRack(scene, 7.2, 3.5);

  // Repisas con frascos en la pared derecha (arriba de la cabeza)
  const repisaMat = material(0xCFD6D9, 0.5);
  [1.95, 2.45].forEach((y, n) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 4), repisaMat);
    r.position.set(7.85, y, -2); r.castShadow = true; scene.add(r);
    for (let k = 0; k < 7; k++) frasco(scene, 7.85, y + 0.015, -3.7 + k * 0.55 + Math.random() * 0.15, LIQUIDOS[(k + n) % 4], k % 2);
  });
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
  const tubo = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 8), metal); tubo.position.y = 2.9;
  base.castShadow = tapa.castShadow = true;
  g.add(base, liq, cas, tapa, tubo); scene.add(g);
}

function crearRack(scene, x, z) {
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
}

// Pulso suave de líquidos y LEDs. Llamar en cada cuadro con el tiempo en segundos.
export function animarSala(t) {
  for (const b of brillos) b.m.emissiveIntensity = b.base * (0.65 + 0.35 * Math.sin(t * b.vel + b.fase));
}

// Mesa de laboratorio con monitor y cristalería. Devuelve dónde se para el agente y hacia dónde mira.
let nMesas = 0;
export function crearEscritorio(scene, id, x, z) {
  const metal = material(0x7D878B, 0.35);
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(VISITANTE.x - x, VISITANTE.z - z);   // la pantalla mira hacia el visitante
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.8), material(0xF1F4F5, 0.35));
  tablero.position.y = 1.0; tablero.castShadow = tablero.receiveShadow = true; g.add(tablero);
  const borde = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0x45D6C8 }));
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
  // cristalería a la izquierda del monitor
  const n = nMesas++, c = LIQUIDOS.length;
  frasco(g, -0.62, 1.025, -0.2, LIQUIDOS[n % c], 1);
  frasco(g, -0.45, 1.025, -0.26, LIQUIDOS[(n + 1) % c], 0);
  frasco(g, -0.68, 1.025, 0.02, LIQUIDOS[(n + 2) % c], 0);
  scene.add(g);

  pantallas[id] = { S, lineas: [], animo: 'idle', titulo: '' };
  dibujarPantalla(id);
  return { puesto: g.localToWorld(new THREE.Vector3(-0.4, 0, 0.72)), yaw: g.rotation.y + Math.PI };
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
// o, si llega una presentación, sus diapositivas.
let P;
export let pizarra;   // la malla, para apuntarle con el rayo del control
export function crearPizarra(scene) {
  P = canvasTex(1024, 560);
  const tablero = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.3), new THREE.MeshBasicMaterial({ map: P.t }));
  tablero.position.set(0, 2.15, -5.95); scene.add(tablero); pizarra = tablero;
  const marco = new THREE.Mesh(new THREE.BoxGeometry(4.36, 2.46, 0.05), material(0x2A3335, 0.4));
  marco.position.set(0, 2.15, -5.99); scene.add(marco);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.6), new THREE.MeshBasicMaterial({ color: 0x45D6C8 }));
  halo.position.set(0, 2.15, -5.995); scene.add(halo);
  dibujarPizarra('Sin tareas', []);
}
const ESTADOS = { pendiente: ['#6F7C80', 'Pendiente'], curso: ['#D9A93B', 'En curso'], revision: ['#9A5F8D', 'En revisión'], rechazado: ['#C4523E', 'Corrigiendo'], hecho: ['#3E9E5A', 'Hecho'] };
export function dibujarPizarra(titulo, tareas) {
  if (presentacion) return;   // hay diapositivas en pantalla: la lista de tareas no las tapa
  const x = P.ctx; x.fillStyle = '#0F1B20'; x.fillRect(0, 0, 1024, 560);
  x.fillStyle = '#E6F4F2'; x.font = `600 46px ${FONT}`; x.fillText(titulo, 48, 82);
  x.fillStyle = '#2C4A50'; x.fillRect(48, 108, 928, 3);
  tareas.forEach((t, i) => {
    const y = 180 + i * 92, [col, etiqueta] = ESTADOS[t.estado];
    x.fillStyle = col; x.beginPath(); x.arc(70, y - 12, 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#E6F4F2'; x.font = `600 38px ${FONT}`; x.fillText(t.nombre, 104, y);
    x.fillStyle = '#8FB3B0'; x.font = `400 32px ${FONT}`; x.fillText(t.quien, 470, y);
    x.fillStyle = col; rr(x, 742, y - 44, 232, 56, 28); x.fill();
    x.fillStyle = '#fff'; x.font = `600 28px ${FONT}`; x.textAlign = 'center'; x.fillText(etiqueta, 858, y - 6); x.textAlign = 'left';
  });
  P.t.needsUpdate = true;
}

// --- Diapositivas en la pizarra ---
let presentacion = null, actual = 0;

// Corta un texto en líneas que quepan en 'ancho' px con la fuente actual del contexto
function envolver(x, texto, ancho) {
  const lineas = []; let linea = '';
  for (const palabra of texto.split(' ')) {
    const prueba = linea ? linea + ' ' + palabra : palabra;
    if (x.measureText(prueba).width > ancho && linea) { lineas.push(linea); linea = palabra; } else linea = prueba;
  }
  if (linea) lineas.push(linea);
  return lineas;
}

// p = { titulo, subtitulo, diapositivas:[{titulo, puntos, formula, nota}] }
export function mostrarDiapositivas(p) { presentacion = p; actual = 0; dibujarDiapositiva(); }
export const hayDiapositivas = () => presentacion !== null;
export function cambiarDiapositiva(paso) {
  if (!presentacion) return;
  actual = Math.max(0, Math.min(presentacion.diapositivas.length, actual + paso));   // 0 = portada
  dibujarDiapositiva();
}

function dibujarDiapositiva() {
  const x = P.ctx, total = presentacion.diapositivas.length + 1, ACENTO = '#45D6C8';
  x.fillStyle = '#0F1B20'; x.fillRect(0, 0, 1024, 560);
  if (actual === 0) {   // portada
    x.fillStyle = ACENTO; x.fillRect(64, 170, 90, 6);
    x.fillStyle = '#E6F4F2'; x.font = `600 64px ${FONT}`;
    let y = 260; for (const l of envolver(x, presentacion.titulo, 880).slice(0, 2)) { x.fillText(l, 64, y); y += 74; }
    x.fillStyle = '#8FB3B0'; x.font = `400 32px ${FONT}`;
    for (const l of envolver(x, presentacion.subtitulo, 880).slice(0, 2)) { x.fillText(l, 64, y + 6); y += 42; }
  } else {
    const d = presentacion.diapositivas[actual - 1];
    x.fillStyle = '#E6F4F2'; x.font = `600 46px ${FONT}`; x.fillText(envolver(x, d.titulo, 900)[0], 56, 84);
    x.fillStyle = '#2C4A50'; x.fillRect(56, 108, 912, 3);
    let y = 166; x.font = `400 31px ${FONT}`;
    for (const punto of d.puntos) {
      const lineas = envolver(x, punto, 860);
      x.fillStyle = ACENTO; x.beginPath(); x.arc(70, y - 10, 7, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#E6F4F2'; lineas.forEach((l, i) => x.fillText(l, 96, y + i * 38));
      y += lineas.length * 38 + 16;
    }
    // la nota va abajo; la fórmula, entre los puntos y la nota
    x.font = `400 24px ${FONT}`;
    const nota = d.nota && d.nota.trim() ? envolver(x, d.nota, 860).slice(0, 2) : [];
    const yNota = 530 - nota.length * 30;
    if (d.formula && d.formula.trim()) {
      x.fillStyle = ACENTO; x.font = `italic 500 44px Georgia, serif`; x.textAlign = 'center';
      x.fillText(d.formula, 512, Math.min(y + 40, yNota - (nota.length ? 44 : 16)), 900); x.textAlign = 'left';
    }
    if (nota.length) {
      x.font = `400 24px ${FONT}`;
      x.fillStyle = ACENTO; x.fillRect(56, yNota - 24, 4, nota.length * 30);
      x.fillStyle = '#8FB3B0'; nota.forEach((l, i) => x.fillText(l, 74, yNota + i * 30));
    }
  }
  // barra de progreso y número
  x.fillStyle = '#2C4A50'; x.fillRect(0, 552, 1024, 8);
  x.fillStyle = ACENTO; x.fillRect(0, 552, 1024 * (actual + 1) / total, 8);
  x.fillStyle = '#8FB3B0'; x.font = `400 22px ${FONT}`; x.textAlign = 'right';
  x.fillText(`${actual + 1} / ${total}`, 990, 536); x.textAlign = 'left';
  P.t.needsUpdate = true;
}
