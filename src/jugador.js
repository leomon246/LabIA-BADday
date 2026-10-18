// El jugador: tú dentro de la oficina.
//  - Compu: vista general (mouse) o primera persona (WASD + mouse, Shift corre, Esc sale).
//  - VR:    stick izquierdo camina hacia donde miras, stick derecho gira de a 30°.
// Con colisiones simples: no atraviesas paredes, escritorios ni agentes.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { agentes } from './agentes.js';

const ARRIBA = new THREE.Vector3(0, 1, 0);
const LIMITES = { xMin: -7.5, xMax: 7.5, zMin: -5.5, zMax: 7.5 };   // dentro de las paredes
const ALTURA_OJOS = 1.6;
const VEL_CAMINAR = 2.2, VEL_CORRER = 4.0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function crearJugador({ renderer, camera, rig, orbita, origen, poseOrbita, obstaculos }) {
  const plc = new PointerLockControls(camera, renderer.domElement);
  const teclas = new Set();
  let modo = 'orbita';          // 'orbita' | 'fp' | 'vr'
  let giroListo = true;
  const dir = new THREE.Vector3(), der = new THREE.Vector3(), mov = new THREE.Vector3();
  const cabeza = new THREE.Vector3(), cabeza2 = new THREE.Vector3();

  addEventListener('keydown', e => teclas.add(e.code));
  addEventListener('keyup', e => teclas.delete(e.code));
  addEventListener('blur', () => teclas.clear());

  function volverAOrbita() {
    modo = 'orbita';
    rig.position.copy(origen); rig.rotation.set(0, 0, 0);
    camera.position.copy(poseOrbita);
    orbita.enabled = true; orbita.update();
  }

  plc.addEventListener('lock', () => {
    modo = 'fp'; orbita.enabled = false;
    camera.position.set(0, ALTURA_OJOS, 0);   // los ojos, encima del punto donde estás parado
    camera.quaternion.identity();              // mirando hacia la oficina
  });
  plc.addEventListener('unlock', () => { if (!renderer.xr.isPresenting) volverAOrbita(); });

  renderer.xr.addEventListener('sessionstart', () => {
    if (plc.isLocked) plc.unlock();
    modo = 'vr'; orbita.enabled = false;
    rig.position.copy(origen); rig.rotation.set(0, 0, 0);
  });
  renderer.xr.addEventListener('sessionend', volverAOrbita);

  // Dirección "adelante" y "derecha" de la mirada, aplanadas al piso
  function ejes() {
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    der.crossVectors(dir, ARRIBA).normalize();
  }

  // Mueve el rig de modo que la CABEZA se desplace 'delta', respetando colisiones
  function mover(delta) {
    camera.getWorldPosition(cabeza);
    let x = cabeza.x + delta.x, z = cabeza.z + delta.z;
    const todos = obstaculos.concat(Object.values(agentes).map(a => ({ x: a.g.position.x, z: a.g.position.z, r: 0.45 })));
    for (const o of todos) {
      const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
      if (d < o.r && d > 1e-4) { x = o.x + dx / d * o.r; z = o.z + dz / d * o.r; }   // empujar al borde del círculo
    }
    x = clamp(x, LIMITES.xMin, LIMITES.xMax); z = clamp(z, LIMITES.zMin, LIMITES.zMax);
    rig.position.x += x - cabeza.x; rig.position.z += z - cabeza.z;
  }

  // Gira el rig alrededor de tu cabeza (no alrededor del centro del rig)
  function girar(angulo) {
    camera.getWorldPosition(cabeza);
    rig.rotation.y += angulo; rig.updateMatrixWorld(true);
    camera.getWorldPosition(cabeza2);
    rig.position.x += cabeza.x - cabeza2.x; rig.position.z += cabeza.z - cabeza2.z;
  }

  function actualizar(dt) {
    if (modo === 'orbita') { orbita.update(); return; }

    if (modo === 'fp') {
      const t = c => teclas.has(c);
      const f = (t('KeyW') || t('ArrowUp') ? 1 : 0) - (t('KeyS') || t('ArrowDown') ? 1 : 0);
      const s = (t('KeyD') || t('ArrowRight') ? 1 : 0) - (t('KeyA') || t('ArrowLeft') ? 1 : 0);
      if (!f && !s) return;
      const vel = (t('ShiftLeft') || t('ShiftRight') ? VEL_CORRER : VEL_CAMINAR) * dt;
      ejes();
      mov.set(0, 0, 0).addScaledVector(dir, f).addScaledVector(der, s).normalize().multiplyScalar(vel);
      mover(mov);
      return;
    }

    // modo VR: leer los sticks de los controles del Quest
    const sesion = renderer.xr.getSession(); if (!sesion) return;
    for (const fuente of sesion.inputSources) {
      const gp = fuente.gamepad; if (!gp || gp.axes.length < 4) continue;
      const ax = gp.axes[2], ay = gp.axes[3];          // en el Quest, el stick está en los ejes 2 y 3
      if (fuente.handedness === 'left') {
        if (Math.hypot(ax, ay) < 0.15) continue;        // zona muerta
        ejes();
        mov.set(0, 0, 0).addScaledVector(dir, -ay).addScaledVector(der, ax).multiplyScalar(VEL_CAMINAR * dt);
        mover(mov);
      } else if (fuente.handedness === 'right') {
        if (Math.abs(ax) > 0.7 && giroListo) { girar(-Math.sign(ax) * Math.PI / 6); giroListo = false; }
        else if (Math.abs(ax) < 0.3) giroListo = true;  // soltar el stick para volver a girar
      }
    }
  }

  return { actualizar, caminar: () => plc.lock() };
}
