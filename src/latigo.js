// El látigo del visitante.
//  - Compu (primera persona): aparece en la mano derecha; click izquierdo = chasquido.
//  - VR: va en el control; botón de agarre (squeeze) = chasquido. El gatillo sigue lanzando la tarea.
// La animación es una cadena de segmentos: cada uno copia el ángulo del mango con un pequeño
// retraso, así la onda viaja del mango a la punta y "revienta" al final (sonido + destello).
import * as THREE from 'three';
import { canvasTex } from './util.js';

const N = 22;                    // segmentos de la cuerda
const LARGO = 1.7, SEG = LARGO / N, MANGO = 0.24;
const LADOS = 5;                 // lados del tubo (poco, por el Quest)
const RETRASO = 0.011;           // s de retraso entre segmentos → la onda tarda N*RETRASO en llegar a la punta
// Ángulos (rad) medidos desde "adelante" (-z) hacia arriba (+y)
const REPOSO = -1.0, ATRAS = 2.5, ADELANTE = 0.05;
const T1 = 0.16, T2 = 0.27, T3 = 0.9;   // fin del impulso hacia atrás, del latigazo, y de volver al reposo
const FIN = T3 + N * RETRASO;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const suave = x => x * x * (3 - 2 * x);
const mezcla = (a, b, k) => a + (b - a) * k;

// Ángulo que "dicta" el mango en el instante t desde que empezó el chasquido
function guia(t) {
  if (t <= 0) return REPOSO;
  if (t < T1) return mezcla(REPOSO, ATRAS, suave(t / T1));
  if (t < T2) return mezcla(ATRAS, ADELANTE, suave((t - T1) / (T2 - T1)));
  if (t < T3) return mezcla(ADELANTE, REPOSO, suave((t - T2) / (T3 - T2)));
  return REPOSO;
}

export function crearLatigo({ renderer, camera }) {
  const grupo = new THREE.Group();
  grupo.visible = false;

  // --- mango ---
  const geoMango = new THREE.CylinderGeometry(0.018, 0.024, MANGO, 8);
  geoMango.rotateX(-Math.PI / 2); geoMango.translate(0, 0, -MANGO / 2);   // apunta hacia -z desde la mano
  const mango = new THREE.Mesh(geoMango, new THREE.MeshStandardMaterial({ color: 0x5A3A22, roughness: 0.7 }));
  grupo.add(mango);

  // --- cuerda: un tubo cuyos vértices se recalculan cada cuadro ---
  const nVert = (N + 1) * LADOS;
  const pos = new Float32Array(nVert * 3), nor = new Float32Array(nVert * 3);
  const indices = [];
  for (let i = 0; i < N; i++) for (let k = 0; k < LADOS; k++) {
    const a = i * LADOS + k, b = i * LADOS + (k + 1) % LADOS, c = a + LADOS, d = b + LADOS;
    indices.push(a, c, b, b, c, d);
  }
  const geoCuerda = new THREE.BufferGeometry();
  geoCuerda.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geoCuerda.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geoCuerda.setIndex(indices);
  const cuerda = new THREE.Mesh(geoCuerda, new THREE.MeshStandardMaterial({ color: 0x3B2A1E, roughness: 0.8 }));
  cuerda.frustumCulled = false;
  grupo.add(cuerda);

  // --- destello en la punta al reventar ---
  const D = canvasTex(64, 64);
  const grad = D.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,240,200,.8)'); grad.addColorStop(1, 'rgba(255,240,200,0)');
  D.ctx.fillStyle = grad; D.ctx.fillRect(0, 0, 64, 64); D.t.needsUpdate = true;
  const destello = new THREE.Sprite(new THREE.SpriteMaterial({ map: D.t, transparent: true, depthWrite: false, opacity: 0 }));
  grupo.add(destello);
  let vidaDestello = 0;

  // --- sonido: ruido corto filtrado (se crea con el primer click, como piden los navegadores) ---
  let audio = null, bufChasquido = null;
  function prepararAudio() {
    if (!audio) {
      audio = new AudioContext();
      const n = Math.floor(audio.sampleRate * 0.08);
      bufChasquido = audio.createBuffer(1, n, audio.sampleRate);
      const d = bufChasquido.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
    }
    audio.resume();
  }
  function sonar() {
    if (!audio) return;
    const src = audio.createBufferSource(); src.buffer = bufChasquido;
    const filtro = audio.createBiquadFilter(); filtro.type = 'highpass'; filtro.frequency.value = 1200;
    const g = audio.createGain(); g.gain.value = 0.9;
    src.connect(filtro).connect(g).connect(audio.destination); src.start();
  }

  // --- estado ---
  let t = FIN;                 // tiempo desde el último chasquido (FIN = en reposo)
  let reventado = true;
  let controlVR = null;        // el control que sostiene el látigo en VR

  function chasquear(control) {
    if (control) controlVR = control;
    if (t < T2 + N * RETRASO) return;   // no interrumpir un latigazo a medio camino
    prepararAudio();
    t = 0; reventado = false;
  }

  // Click izquierdo en primera persona
  addEventListener('mousedown', e => {
    if (e.button === 0 && document.pointerLockElement === renderer.domElement) chasquear();
  });

  // Coloca el grupo en la mano según el modo actual
  function ubicar() {
    let padre = null;
    if (renderer.xr.isPresenting) padre = controlVR;
    else if (document.pointerLockElement === renderer.domElement) padre = camera;
    if (padre !== grupo.parent) {
      if (grupo.parent) grupo.parent.remove(grupo);
      if (padre) padre.add(grupo);
      // En primera persona: abajo a la derecha, dentro de la vista
      if (padre === camera) { grupo.position.set(0.2, -0.16, -0.38); grupo.rotation.set(0, -0.15, 0); }
      else { grupo.position.set(0, 0, 0); grupo.rotation.set(0, 0, 0); }
    }
    grupo.visible = !!padre;
    return !!padre;
  }

  // Puntos de la cuerda en coordenadas del grupo
  const puntos = Array.from({ length: N + 1 }, () => new THREE.Vector3());
  const mundo = new THREE.Matrix4(), inversa = new THREE.Matrix4(), v = new THREE.Vector3();
  const tan = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
  const EJE_X = new THREE.Vector3(1, 0, 0);

  function calcularCuerda() {
    const m = clamp(0.45 * guia(t), -0.5, 1.2);           // el mango se inclina menos que la cuerda
    mango.rotation.x = m;
    puntos[0].set(0, Math.sin(m) * MANGO, -Math.cos(m) * MANGO);
    for (let i = 1; i <= N; i++) {
      const phi = guia(t - i * RETRASO) - i * 0.012;     // un poco de "peso" hacia la punta
      const lado = 0.25 * (phi - REPOSO) / (ATRAS - REPOSO) * (i / N);   // se abre un poco de lado: lazo en 3D
      v.set(lado, Math.sin(phi), -Math.cos(phi)).normalize().multiplyScalar(SEG);
      puntos[i].copy(puntos[i - 1]).add(v);
    }
    // Que la cuerda no atraviese el piso (y >= 0 en el mundo)
    grupo.updateMatrixWorld(true);
    mundo.copy(grupo.matrixWorld); inversa.copy(mundo).invert();
    for (const p of puntos) {
      p.applyMatrix4(mundo); if (p.y < 0.01) p.y = 0.01; p.applyMatrix4(inversa);
    }
    // Armar el tubo alrededor de los puntos
    for (let i = 0; i <= N; i++) {
      if (i < N) tan.subVectors(puntos[i + 1], puntos[i]); else tan.subVectors(puntos[i], puntos[i - 1]);
      tan.normalize();
      n1.crossVectors(tan, EJE_X); if (n1.lengthSq() < 1e-6) n1.set(0, 1, 0); n1.normalize();
      n2.crossVectors(tan, n1);
      const radio = mezcla(0.011, 0.003, i / N);
      for (let k = 0; k < LADOS; k++) {
        const a = k / LADOS * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const j = (i * LADOS + k) * 3;
        const nx = n1.x * c + n2.x * s, ny = n1.y * c + n2.y * s, nz = n1.z * c + n2.z * s;
        nor[j] = nx; nor[j + 1] = ny; nor[j + 2] = nz;
        pos[j] = puntos[i].x + nx * radio; pos[j + 1] = puntos[i].y + ny * radio; pos[j + 2] = puntos[i].z + nz * radio;
      }
    }
    geoCuerda.attributes.position.needsUpdate = true;
    geoCuerda.attributes.normal.needsUpdate = true;
  }

  function actualizar(dt) {
    if (!ubicar()) return;
    if (t < FIN) t += dt;

    // La punta revienta cuando la onda del latigazo llega hasta ella
    if (!reventado && t - N * RETRASO >= T2) {
      reventado = true; sonar(); vidaDestello = 0.14;
    }
    if (vidaDestello > 0) {
      vidaDestello -= dt;
      const k = Math.max(vidaDestello, 0) / 0.14;
      destello.position.copy(puntos[N]);
      destello.material.opacity = k;
      destello.scale.setScalar(0.1 + (1 - k) * 0.35);
    } else destello.material.opacity = 0;

    calcularCuerda();   // siempre: aunque esté quieta, la mano se mueve y el piso la dobla distinto
  }

  return { actualizar, chasquear, usarControl: c => { controlVR = c; } };
}
