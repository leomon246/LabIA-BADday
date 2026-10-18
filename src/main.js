// Punto de entrada: escena, render, VR, controles y bucle principal.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VISITANTE, construirSala, animarSala, crearEscritorio, crearPizarra, pantallas, dibujarPantalla, dibujarPizarra,
         pizarra, hayDiapositivas, cambiarDiapositiva } from './oficina.js';
import { agentes, crearAgente, actualizarAgentes, asustar, tocaAgente } from './agentes.js';
import { crearBus, guionDemo } from './eventos.js';
import { crearJugador } from './jugador.js';
import { crearLatigo } from './latigo.js';

const app = document.getElementById('app');

// Investigador, redactor y revisor (con sus mesas) y la demo que los usa.
// Apagados de momento: cambia a true para volver a tenerlos.
const EQUIPO_DEMO = false;

// --- escena y render ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xE4EAEC);
scene.fog = new THREE.Fog(0xE4EAEC, 16, 32);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
app.prepend(renderer.domElement);

// El "rig" es la posición del visitante. En VR, la cámara y los controles se mueven relativos a él.
const rig = new THREE.Group(); rig.position.copy(VISITANTE); scene.add(rig);
const camera = new THREE.PerspectiveCamera(58, app.clientWidth / app.clientHeight, 0.05, 100);
camera.position.set(0, 3.4, 3.2); rig.add(camera);

// Vista de escritorio (mouse)
const orbita = new OrbitControls(camera, renderer.domElement);
orbita.target.set(0, 1.1, -VISITANTE.z - 0.8);
orbita.enableDamping = true; orbita.maxPolarAngle = Math.PI * 0.49;
orbita.minDistance = 3; orbita.maxDistance = 14;

// Botón "Enter VR" (solo aparece si el navegador soporta VR)
if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => {
  if (!ok) return;
  const b = VRButton.createButton(renderer); b.style.position = 'static'; b.style.transform = 'none';
  document.getElementById('vrslot').appendChild(b);
}).catch(() => {});

// --- el látigo (click en primera persona, botón de agarre en VR) ---
// Latigazo al presentador = siguiente diapositiva (y se queja).
const QUEJAS = ['¡Ay! Ya voy, ya voy', '¡Auch! Siguiente…', '¡Oye! Que sí avanzo', '¡Ay! Bueno, bueno'];
const latigo = crearLatigo({ renderer, camera, alReventar: puntos => {
  if (!tocaAgente('presentador', puntos)) return;
  asustar('presentador');
  const queja = hayDiapositivas() ? QUEJAS[Math.floor(Math.random() * QUEJAS.length)] : '¡Ay! Aún no hay diapositivas';
  agentes.presentador.etiqueta.dibujar(queja);
  cambiarDiapositiva(1);
} });

// --- controles del Quest: modelo 3D + rayo ---
const fabrica = new XRControllerModelFactory();
for (let i = 0; i < 2; i++) {
  const control = renderer.xr.getController(i);
  control.addEventListener('select', () => gatillo(control));   // gatillo: pasa diapositivas o lanza la tarea
  control.addEventListener('squeezestart', () => latigo.chasquear(control));   // agarre = latigazo
  control.addEventListener('connected', e => { if (e.data.handedness === 'right') latigo.usarControl(control); });
  const rayo = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  rayo.scale.z = 3; control.add(rayo);
  rig.add(control);
  const agarre = renderer.xr.getControllerGrip(i);
  agarre.add(fabrica.createControllerModel(agarre));
  rig.add(agarre);
}

// Gatillo en VR: si apuntas al monitor grande con una presentación, pasa de diapositiva
// (tercio izquierdo = atrás, resto = adelante). Si no, lanza la tarea de prueba (si está activa).
const rayoPizarra = new THREE.Raycaster(), rotControl = new THREE.Matrix4();
function gatillo(control) {
  if (hayDiapositivas()) {
    rotControl.identity().extractRotation(control.matrixWorld);
    rayoPizarra.ray.origin.setFromMatrixPosition(control.matrixWorld);
    rayoPizarra.ray.direction.set(0, 0, -1).applyMatrix4(rotControl);
    const [golpe] = rayoPizarra.intersectObject(pizarra);
    if (golpe) return cambiarDiapositiva(golpe.uv.x < 0.33 ? -1 : 1);
  }
  lanzar();
}

// --- construir el laboratorio ---
construirSala(scene);
crearPizarra(scene);
if (EQUIPO_DEMO) {
  const dInv = crearEscritorio(scene, 'inv', -4, -1.0);
  const dRed = crearEscritorio(scene, 'red', 0, -2.4);
  const dRev = crearEscritorio(scene, 'rev', 4, -1.0);
  crearAgente(scene, 'inv', 'Investigador', 0x3A6EA5, dInv.puesto, dInv.yaw);
  crearAgente(scene, 'red', 'Redactor', 0xD9A93B, dRed.puesto, dRed.yaw);
  crearAgente(scene, 'rev', 'Revisor', 0x8A4F7D, dRev.puesto, dRev.yaw);
}
crearAgente(scene, 'jefe', 'Jefe', 0x2F8F83, new THREE.Vector3(-2.6, 0, -4.6), 0);
crearAgente(scene, 'presentador', 'Presentador', 0xD9663B, new THREE.Vector3(2.6, 0, -4.6), 0);   // junto al monitor grande

// --- el jugador (tú) ---
const jugador = crearJugador({
  renderer, camera, rig, orbita,
  origen: VISITANTE.clone(),
  poseOrbita: new THREE.Vector3(0, 3.4, 3.2),
  obstaculos: [                                   // círculos en el piso que no se pueden atravesar
    ...(EQUIPO_DEMO ? [{ x: -4, z: -1.0, r: 1.05 }, { x: 0, z: -2.4, r: 1.05 }, { x: 4, z: -1.0, r: 1.05 }] : []),   // escritorios
    { x: -7.2, z: -5.2, r: 0.5 }, { x: 7.2, z: -5.2, r: 0.5 }, { x: -7.2, z: 3.5, r: 0.5 }, { x: 7.2, z: 3.5, r: 0.5 },  // tanques y racks
  ],
});
document.getElementById('caminar').addEventListener('click', () => jugador.caminar());

// --- panel HTML y bus ---
const logEl = document.getElementById('log');
function log(quien, texto) {
  const li = document.createElement('li'); li.innerHTML = `<b>${quien}:</b> ${texto}`;
  logEl.prepend(li); while (logEl.children.length > 7) logEl.lastChild.remove();
}
const bus = crearBus(log);
const btn = document.getElementById('go');
let corriendo = false;
btn.hidden = !EQUIPO_DEMO;
async function lanzar() {
  if (!EQUIPO_DEMO || corriendo) return; corriendo = true; btn.disabled = true;
  await guionDemo(bus);
  btn.textContent = 'Terminado'; corriendo = false;
}
btn.addEventListener('click', lanzar);
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;                    // escribiendo el tema
  if (e.code === 'KeyT') lanzar();                             // T lanza la tarea (útil caminando)
  if (e.code === 'ArrowRight' || e.code === 'PageDown') cambiarDiapositiva(1);
  if (e.code === 'ArrowLeft' || e.code === 'PageUp') cambiarDiapositiva(-1);
});

// --- servidor de agentes (agentes/servidor.py) ---
// Sus eventos llegan en vivo y entran por el mismo bus que la demo. Sin servidor, la escena funciona igual.
const temaEl = document.getElementById('tema'), crearBtn = document.getElementById('crear'), servEl = document.getElementById('servidor');
let cola = Promise.resolve();   // los eventos se aplican en orden, uno tras otro
const fuente = new EventSource('/api/eventos');
fuente.onopen = async () => {
  const lista = await fetch('/api/agentes').then(r => r.json()).catch(() => []);
  const listo = lista.some(a => a.nombre === 'presentador');
  servEl.textContent = listo ? 'Conectado al servidor de agentes'
                             : 'El servidor no tiene el presentador: arráncalo con .venv\\Scripts\\python -m agentes.servidor';
  crearBtn.disabled = !listo;
};
fuente.onmessage = m => { const e = JSON.parse(m.data); cola = cola.then(() => bus.emitir(e)).catch(console.error); };
fuente.onerror = () => { servEl.textContent = 'Sin servidor de agentes: corre .venv\\Scripts\\python -m agentes.servidor'; crearBtn.disabled = true; };

async function pedirPresentacion() {
  const entrada = temaEl.value.trim();
  if (!entrada) return temaEl.focus();
  crearBtn.disabled = true;
  try {
    const r = await fetch('/api/ejecutar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                             body: JSON.stringify({ agente: 'presentador', entrada }) });
    if (!r.ok) log('Servidor', (await r.json()).error);
  } catch { log('Servidor', 'no responde'); }
  crearBtn.disabled = false;
}
crearBtn.addEventListener('click', pedirPresentacion);
temaEl.addEventListener('keydown', e => { if (e.key === 'Enter') pedirPresentacion(); });
document.getElementById('reset').addEventListener('click', () => location.reload());

// --- bucle principal ---
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(reloj.getDelta(), 0.05);
  actualizarAgentes(dt);
  animarSala(reloj.elapsedTime);
  jugador.actualizar(dt);
  latigo.actualizar(dt);
  renderer.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = app.clientWidth / app.clientHeight; camera.updateProjectionMatrix();
  renderer.setSize(app.clientWidth, app.clientHeight);
});
// Redibujar textos cuando cargue la fuente
document.fonts?.ready.then(() => {
  Object.values(agentes).forEach(a => a.etiqueta.dibujar('Esperando'));
  Object.keys(pantallas).forEach(dibujarPantalla);
  dibujarPizarra('Sin tareas', []);
});
