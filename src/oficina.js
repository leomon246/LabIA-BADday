// El espacio físico: sala, escritorios con pantallas y pizarra.
// Para agregar muebles u objetos nuevos, este es el archivo.
import * as THREE from 'three';
import { material, canvasTex, rr, FONT } from './util.js';

export const VISITANTE = new THREE.Vector3(0, 0, 5.2);   // donde aparece la persona con los lentes
export const pantallas = {};

export function construirSala(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8676, 2.6));
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.8);
  sol.position.set(-6, 9, 4); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  scene.add(sol);

  const piso = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), material(0xB9B2A6, 0.95));
  piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; scene.add(piso);
  const alfombra = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), material(0x8FA39C, 1));
  alfombra.rotation.x = -Math.PI / 2; alfombra.position.set(0, 0.005, -1.2); alfombra.receiveShadow = true; scene.add(alfombra);

  const pared = (w, h, x, z, ry, c = 0xA8B8A8) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material(c, 1));
    m.position.set(x, h / 2, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
  };
  pared(16, 4, 0, -6, 0);
  pared(14, 4, -8, 1, Math.PI / 2);
  pared(14, 4, 8, 1, -Math.PI / 2, 0x9FB0A0);

  for (let i = 0; i < 3; i++) {
    const ventana = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2), new THREE.MeshBasicMaterial({ color: 0xF3F6F0 }));
    ventana.position.set(-7.98, 2.1, -3.5 + i * 3.2); ventana.rotation.y = Math.PI / 2; scene.add(ventana);
  }
  for (let i = 0; i < 4; i++) {
    const planta = new THREE.Group();
    const maceta = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.4, 16), material(0xC97E5A)); maceta.position.y = 0.2;
    const hojas = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), material(0x5E8A5A, 1)); hojas.position.y = 0.75; hojas.castShadow = true;
    planta.add(maceta, hojas); planta.position.set(i % 2 ? 7.2 : -7.2, 0, i < 2 ? -5.2 : 3.5); scene.add(planta);
  }
}

// Escritorio de pie con monitor. Devuelve dónde se para el agente y hacia dónde mira.
export function crearEscritorio(scene, id, x, z) {
  const madera = material(0xD8C7A6, 0.7), metal = material(0x55605F, 0.5);
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.rotation.y = Math.atan2(VISITANTE.x - x, VISITANTE.z - z);   // la pantalla mira hacia el visitante
  const tablero = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.8), madera);
  tablero.position.y = 1.0; tablero.castShadow = tablero.receiveShadow = true; g.add(tablero);
  for (const [lx, lz] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]]) {
    const pata = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1, 0.05), metal); pata.position.set(lx, 0.5, lz); pata.castShadow = true; g.add(pata);
  }
  const marco = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.54, 0.04), material(0x2A3335, 0.4));
  marco.position.set(0.18, 1.42, -0.22); marco.castShadow = true; g.add(marco);
  const S = canvasTex(512, 300);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.47), new THREE.MeshBasicMaterial({ map: S.t }));
  pantalla.position.set(0.18, 1.42, -0.199); g.add(pantalla);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.06), metal); base.position.set(0.18, 1.12, -0.24); g.add(base);
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

let P;
export function crearPizarra(scene) {
  P = canvasTex(1024, 560);
  const tablero = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.3), new THREE.MeshBasicMaterial({ map: P.t }));
  tablero.position.set(0, 2.15, -5.95); scene.add(tablero);
  const marco = new THREE.Mesh(new THREE.BoxGeometry(4.36, 2.46, 0.05), material(0x55605F, 0.5));
  marco.position.set(0, 2.15, -5.99); scene.add(marco);
  dibujarPizarra('Sin tareas', []);
}
const ESTADOS = { pendiente: ['#9AA5A2', 'Pendiente'], curso: ['#D9A93B', 'En curso'], revision: ['#8A4F7D', 'En revisión'], rechazado: ['#C4523E', 'Corrigiendo'], hecho: ['#3E8E4F', 'Hecho'] };
export function dibujarPizarra(titulo, tareas) {
  const x = P.ctx; x.fillStyle = '#F6F7F3'; x.fillRect(0, 0, 1024, 560);
  x.fillStyle = '#1F2A2E'; x.font = `600 46px ${FONT}`; x.fillText(titulo, 48, 82);
  x.fillStyle = '#C9D0CC'; x.fillRect(48, 108, 928, 3);
  tareas.forEach((t, i) => {
    const y = 180 + i * 92, [col, etiqueta] = ESTADOS[t.estado];
    x.fillStyle = col; x.beginPath(); x.arc(70, y - 12, 16, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1F2A2E'; x.font = `600 38px ${FONT}`; x.fillText(t.nombre, 104, y);
    x.fillStyle = '#4C5B5E'; x.font = `400 32px ${FONT}`; x.fillText(t.quien, 470, y);
    x.fillStyle = col; rr(x, 742, y - 44, 232, 56, 28); x.fill();
    x.fillStyle = '#fff'; x.font = `600 28px ${FONT}`; x.textAlign = 'center'; x.fillText(etiqueta, 858, y - 6); x.textAlign = 'left';
  });
  P.t.needsUpdate = true;
}
