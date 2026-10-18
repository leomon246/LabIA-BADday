// Los agentes: su cuerpo, cómo caminan y cómo se pasan documentos.
import * as THREE from 'three';
import { material, crearEtiqueta, crearTag, sleep } from './util.js';

export const agentes = {};

export function crearAgente(scene, id, nombre, color, casa, yaw) {
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.95, 24), material(color, 0.6));
  cuerpo.position.y = 0.62; cuerpo.castShadow = true;
  const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), material(0xF2EEE6, 0.5));
  cabeza.position.y = 1.31; cabeza.castShadow = true;
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x1F2A2E, emissive: color, emissiveIntensity: 0.7, roughness: 0.3 });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.06), visorMat); visor.position.set(0, 1.33, 0.14);
  const etiqueta = crearEtiqueta(nombre, color); etiqueta.sprite.position.y = 1.86;
  g.add(cuerpo, cabeza, visor, etiqueta.sprite);
  g.position.copy(casa); g.rotation.y = yaw; scene.add(g);
  agentes[id] = { id, nombre, color, g, etiqueta, visorMat, casa: casa.clone(), yawCasa: yaw,
                  camino: [], mirarYaw: yaw, velocidad: 1.6, paso: 0, alLlegar: null, susto: 0 };
}

// --- movimiento ---
const lerpAngulo = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const PASILLO = 1.1;   // los agentes caminan por este "pasillo" (z) para no atravesar escritorios
export const ruta = (de, a) => [{ x: de.x, z: PASILLO }, { x: a.x, z: PASILLO }, { x: a.x, z: a.z }];
export const yawHacia = (de, a) => Math.atan2(a.x - de.x, a.z - de.z);

export function caminarA(ag, puntos, yawFinal) {
  return new Promise(res => { ag.camino = puntos; ag.mirarYaw = null; ag.alLlegar = () => { ag.mirarYaw = yawFinal; res(); }; });
}

// Brinco y temblor cuando le pegan con el látigo
const SUSTO = 0.6;
export function asustar(id) { if (agentes[id]) agentes[id].susto = SUSTO; }

// ¿Algún punto (en el mundo) toca el cuerpo del agente? Cilindro de radio 'r' y 1.75 m de alto.
export function tocaAgente(id, puntos, r = 0.4) {
  const p = agentes[id]?.g.position;
  return !!p && puntos.some(q => q.y < 1.75 && Math.hypot(q.x - p.x, q.z - p.z) < r);
}

export function actualizarAgentes(dt) {
  for (const a of Object.values(agentes)) {
    const p = a.g.position;
    if (a.susto > 0) {
      a.susto = Math.max(0, a.susto - dt);
      const k = a.susto / SUSTO, f = 1 - k;
      p.y = Math.sin(f * Math.PI) * 0.22;
      a.g.rotation.z = Math.sin(f * 40) * 0.18 * k;
      if (!a.susto) { p.y = 0; a.g.rotation.z = 0; }
    }
    if (a.camino.length) {
      const t = a.camino[0], dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.03) {
        p.x = t.x; p.z = t.z; a.camino.shift();
        if (!a.camino.length) { p.y = 0; a.alLlegar && a.alLlegar(); }
      } else {
        const s = Math.min(d, a.velocidad * dt); p.x += dx / d * s; p.z += dz / d * s;
        a.g.rotation.y = lerpAngulo(a.g.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
        a.paso += dt * 11; p.y = Math.abs(Math.sin(a.paso)) * 0.035;
      }
    } else if (a.mirarYaw !== null) {
      a.g.rotation.y = lerpAngulo(a.g.rotation.y, a.mirarYaw, Math.min(1, dt * 6));
    }
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
  const doc = crearDocumento(item, a.color); doc.position.set(0.26, 0.98, 0.22); a.g.add(doc);
  const encuentro = { x: b.casa.x + (b.casa.x > a.casa.x ? -0.75 : 0.75), z: b.casa.z + 0.35 };
  await caminarA(a, ruta(a.g.position, encuentro), yawHacia(encuentro, b.casa));
  b.mirarYaw = yawHacia(b.casa, encuentro);
  await sleep(500);
  a.g.remove(doc); b.g.add(doc);
  await sleep(700);
  b.g.remove(doc); b.mirarYaw = b.yawCasa;
  caminarA(a, ruta(a.g.position, a.casa), a.yawCasa);   // regresa sin bloquear el guion
}
