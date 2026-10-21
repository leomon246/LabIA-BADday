// Utilidades compartidas: materiales, texto dibujado en canvas, pausas.
import * as THREE from 'three';

export const FONT = '"Familjen Grotesk", system-ui, sans-serif';
export const hex = n => '#' + n.toString(16).padStart(6, '0');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

// Rectángulo con esquinas redondeadas en un canvas 2D
export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Canvas + textura de three.js enlazados (dibujas en ctx, luego t.needsUpdate = true)
export function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, ctx: c.getContext('2d'), t };
}

// Etiqueta flotante de un agente: nombre + estado actual
export function crearEtiqueta(nombre, color) {
  const L = canvasTex(512, 168);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: L.t, depthTest: false, transparent: true }));
  sprite.scale.set(1.3, 0.426, 1); sprite.renderOrder = 10;
  const dibujar = (estado) => {
    const x = L.ctx; x.clearRect(0, 0, 512, 168);
    x.fillStyle = 'rgba(250,252,251,.94)'; rr(x, 6, 6, 500, 150, 26); x.fill();
    x.fillStyle = hex(color); rr(x, 6, 6, 18, 150, 9); x.fill(); x.fillRect(15, 6, 9, 150);
    x.fillStyle = '#1F2A2E'; x.font = `600 50px ${FONT}`; x.fillText(nombre, 44, 64);
    x.fillStyle = '#4C5B5E'; x.font = `400 34px ${FONT}`;
    x.fillText(estado.length > 26 ? estado.slice(0, 25) + '…' : estado, 44, 122);
    L.t.needsUpdate = true;
  };
  dibujar('Esperando');
  return { sprite, dibujar };
}

// Pastilla de texto (para los documentos que se pasan entre agentes)
export function crearTag(texto, color) {
  const T = canvasTex(320, 96); const x = T.ctx;
  x.fillStyle = hex(color); rr(x, 4, 4, 312, 88, 44); x.fill();
  x.fillStyle = '#fff'; x.font = `600 44px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(texto, 160, 50); T.t.needsUpdate = true;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.t, depthTest: false, transparent: true }));
  s.scale.set(0.6, 0.18, 1); s.renderOrder = 11;
  return s;
}

// En el Quest, un AudioContext puede quedar "running" pero congelado (su reloj no avanza y no suena nada),
// p. ej. al entrar o salir de VR. Este vigilante lo nota y lo despierta (suspender + reanudar). Devuelve despertar().
export function vigilarAudio(ctx) {
  const despertar = () => ctx.suspend().then(() => ctx.resume()).catch(() => {});
  let t = performance.now(), reloj = ctx.currentTime;
  setInterval(() => {
    const ahora = performance.now(), real = (ahora - t) / 1000, avance = ctx.currentTime - reloj;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    else if (ctx.state === 'running' && real > 1 && avance < real * 0.3) despertar();
    t = ahora; reloj = ctx.currentTime;
  }, 1500);
  return despertar;
}
