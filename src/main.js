// Punto de entrada: escena, render, VR, controles y bucle principal.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { VISITANTE, obstaculosJugador, crearEscenario, construirSala, animarSala, crearEscritorio, crearPizarra, pantallas, dibujarPantalla, dibujarPizarra,
         pizarra, hayDiapositivas, cambiarDiapositiva, irADiapositiva, indiceActual, totalDiapositivas, textoNarracion,
         alCambiarDiapositiva, visualDe } from './oficina.js';
import { agentes, crearAgente, actualizarAgentes, asustar, tocaAgente, fijarMirada, gesto, senalar } from './agentes.js';
import { crearFigurantes, actualizarFigurantes, publico, aplaudir, produccionIniciar, produccionPrimerRelevo, produccionRevelar, produccionAbortar, produccionActiva } from './figurantes.js';
import { crearHolograma } from './modelos.js';
import { configurarVoz, hablar, detener as detenerVoz, pausarReanudar, actualizarVoz, hayVoz, fuenteDe } from './voz.js';
import { crearBus, guionDemo } from './eventos.js';
import { crearJugador } from './jugador.js';
import { crearLatigo } from './latigo.js';

const app = document.getElementById('app');

// Investigador, redactor y revisor (con sus mesas) y la demo que los usa.
// Apagados de momento: cambia a true para volver a tenerlos.
const EQUIPO_DEMO = false;

// --- escena y render ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1B1F23);
scene.fog = new THREE.Fog(0x1B1F23, 30, 60);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
app.prepend(renderer.domElement);

// El "rig" es la posición del visitante. En VR, la cámara y los controles se mueven relativos a él.
const rig = new THREE.Group(); rig.position.copy(VISITANTE); scene.add(rig);
const camera = new THREE.PerspectiveCamera(62, app.clientWidth / app.clientHeight, 0.05, 100);
const POSE_ORBITA = new THREE.Vector3(0, 3.5, 3.0);   // vista general: dentro del lab, bajo el techo
camera.position.copy(POSE_ORBITA); rig.add(camera);

// Vista de escritorio (mouse)
const orbita = new OrbitControls(camera, renderer.domElement);
orbita.target.set(0, 1.3, -9.5);
orbita.enableDamping = true; orbita.maxPolarAngle = Math.PI * 0.49;
orbita.minDistance = 3; orbita.maxDistance = 24;// Botón "Enter VR" (solo aparece si el navegador soporta VR)
if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then(ok => {
  if (!ok) return;
  const b = VRButton.createButton(renderer); b.style.position = 'static'; b.style.transform = 'none';
  document.getElementById('vrslot').appendChild(b);
}).catch(() => {});

// --- el látigo: EASTER EGG, apagado por defecto. Se activa/desactiva escribiendo /latigo en el campo de la pregunta. ---
// (click en primera persona, botón de agarre en VR). Si toca al presentador, pasa a la siguiente diapositiva.
const REACCIONES = ['¡Uy! Siguiente…', '¡Sorpresa! Sigo', '¡Eh! Ya avanzo'];
const latigo = crearLatigo({ renderer, camera, alReventar: puntos => {
  if (!tocaAgente('presentador', puntos)) return;
  asustar('presentador');
  agentes.presentador.etiqueta.dibujar(hayDiapositivas() ? REACCIONES[Math.floor(Math.random() * REACCIONES.length)] : 'Aún no hay diapositivas');
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
// Una estación (mesa con objetos de su oficio) y un personaje por cada miembro del equipo. Rodean el lab en forma de U:
// jefe y presentador al fondo, el trabajo baja por la izquierda, cruza por el frente y sube por la derecha hasta el escenario.
// Solo el investigador y el presentador trabajan de verdad (con IA); los demás son el equipo de fondo (figurantes.js, produccion.js).
const EQUIPO = [
  { id: 'jefe',         nombre: 'Jefe',         color: 0x2F8F83, tipo: 'direccion',     x: -6.2, z: -4.2 },
  { id: 'investigador', nombre: 'Investigador', color: 0x3A6EA5, tipo: 'investigacion', x: -9.4, z: -2.2 },
  { id: 'cientifica',   nombre: 'Científica',   color: 0xEDEFF0, tipo: 'verificacion',  x: -9.8, z: 2.4 },
  { id: 'redactor',     nombre: 'Redactor',     color: 0xD9A93B, tipo: 'redaccion',     x: -8.4, z: 6.8 },
  { id: 'disenador',    nombre: 'Diseñador',    color: 0xA866D8, tipo: 'diseno',        x: 8.4,  z: 6.8 },
  { id: 'animador',     nombre: 'Animador',     color: 0xE08A2E, tipo: 'animacion',     x: 9.8,  z: 2.4 },
  { id: 'editor',       nombre: 'Editor',       color: 0x4FA36B, tipo: 'edicion',       x: 9.4,  z: -2.2 },
];
for (const e of EQUIPO) {
  const d = crearEscritorio(scene, e.id, e.x, e.z, e.tipo, e.color);
  crearAgente(scene, e.id, e.nombre, e.color, d.puesto, d.yaw);
}
const ESCENARIO = { x: 2.9, z: -4.6 };   // junto a la pantalla grande
crearEscenario(scene, ESCENARIO.x, ESCENARIO.z);
crearAgente(scene, 'presentador', 'Presentador', 0xD9663B, new THREE.Vector3(ESCENARIO.x, 0, ESCENARIO.z), 0);
// Ambiente: el equipo "de fondo" pasea, trabaja y conversa; el holograma 3D muestra un modelo por diapositiva.
// No hay personaje "locutor": quien habla, y quien ensaya antes de hablar, es el Presentador.
crearFigurantes(scene, ['cientifica', 'redactor', 'disenador', 'animador', 'editor']);
const holograma = crearHolograma(scene, new THREE.Vector3(-3.4, 0, -4.9));

// --- el jugador (tú) ---
const jugador = crearJugador({
  renderer, camera, rig, orbita,
  origen: VISITANTE.clone(),
  poseOrbita: POSE_ORBITA.clone(),
  obstaculos: obstaculosJugador,                   // círculos en el piso que no se pueden atravesar (mesas, tanques, racks…)
});
document.getElementById('caminar').addEventListener('click', () => jugador.caminar());

// --- panel HTML y bus ---
const logEl = document.getElementById('log');
function log(quien, texto) {
  const li = document.createElement('li'), b = document.createElement('b');
  b.textContent = quien + ': '; li.append(b, texto);   // textContent: los mensajes del backend no se interpretan como HTML
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

// --- progreso del flujo (pregunta -> investiga -> diapositivas -> voz -> listo), sacado de los eventos reales ---
const pasos = [...document.querySelectorAll('#pasos li')];
function paso(i, clase) {
  pasos.forEach((li, k) => { if (k < i && li.className !== 'error') li.className = 'hecho'; });
  pasos[i].className = clase;
}
const PASO_DE = { investigador: 1, presentador: 2 };   // los eventos con fase:'voz' (el presentador ensayando) cuentan como el paso 3
const emitirBase = bus.emitir;
bus.emitir = async e => {
  // "Pantalla de carga": mientras trabajan los dos agentes reales, todo el equipo se pasa la presentación (ver figurantes.js)
  if (e.tipo === 'estado' && e.agente === 'jefe' && String(e.texto).startsWith('Pregunta')) produccionIniciar();
  if (e.tipo === 'entrega' && e.agente === 'investigador' && e.a === 'presentador' && produccionActiva()) { log('Investigador', 'pasa la investigación a verificación'); return produccionPrimerRelevo(); }
  if (e.tipo === 'estado' && e.agente === 'presentador' && e.animo === 'alert' && e.fase !== 'voz') produccionAbortar();
  if (e.tipo === 'diapositivas') await produccionRevelar();   // las diapositivas reales esperan (máx. 14 s) a que el relevo llegue a su final
  if (e.tipo === 'estado') {
    const clase = { work: 'activo', ok: 'hecho', alert: 'error' }[e.animo];
    const idx = e.fase === 'voz' ? 3 : PASO_DE[e.agente];
    if (idx !== undefined && clase) paso(idx, clase);
    if (e.agente === 'jefe' && e.texto === 'Presentación lista') paso(4, 'hecho');
  }
  return emitirBase(e);
};

// --- presentar: narración sincronizada con las diapositivas ---
const ctl = { caja: document.getElementById('controles'), presentar: document.getElementById('presentar'), pausa: document.getElementById('pausa'),
              anterior: document.getElementById('anterior'), siguiente: document.getElementById('siguiente'),
              progreso: document.getElementById('progreso'), narrar: document.getElementById('narrar') };
let automatico = false;   // "Presentar": al terminar el audio de una diapositiva pasa sola a la siguiente
function refrescarControles() {
  const n = totalDiapositivas();
  ctl.caja.hidden = n === 0;
  ctl.progreso.textContent = n ? `Diapositiva ${indiceActual() + 1}/${n}` + (hayVoz() ? ` · voz ${fuenteDe(indiceActual()) === 'ia' ? 'IA' : 'del navegador'}` : '') : '—';
  ctl.pausa.disabled = !hayVoz();
  ctl.presentar.textContent = automatico ? '■ Detener' : '▶ Presentar';
}
const narrar = i => { hablar(i, textoNarracion(i)); refrescarControles(); };
function terminarPresentacion(aplauso) {   // el público aplaude si llegó al final y luego vuelve a lo suyo
  if (aplauso) { aplaudir(); setTimeout(() => publico(false), 3500); } else publico(false);
}
alCambiarDiapositiva((i, origen) => {
  holograma.mostrar(visualDe(i));                                  // el modelo 3D de esta diapositiva
  if (origen === 'nueva') { automatico = false; detenerVoz(); publico(false); }
  else {
    if (i > 0) senalar('presentador');                             // se gira un momento a señalar la pantalla
    if (automatico || ctl.narrar.checked) narrar(i);
  }
  refrescarControles();
});
configurarVoz({ fin: i => {
  if (automatico && i < totalDiapositivas() - 1) setTimeout(() => { if (automatico) irADiapositiva(i + 1); }, 450);   // respira entre diapositivas
  else { if (automatico) { gesto('presentador', 'ok', 2.2, '¡Gracias!'); terminarPresentacion(true); } automatico = false; refrescarControles(); }
} });
function alternarPresentar() {
  if (automatico) { automatico = false; detenerVoz(); terminarPresentacion(false); }
  else if (hayDiapositivas()) { automatico = true; publico(true); narrar(indiceActual()); }
  refrescarControles();
}
ctl.presentar.addEventListener('click', alternarPresentar);
ctl.pausa.addEventListener('click', () => { ctl.pausa.textContent = pausarReanudar() ? '▶' : '⏸'; });
ctl.anterior.addEventListener('click', () => cambiarDiapositiva(-1));
ctl.siguiente.addEventListener('click', () => cambiarDiapositiva(1));
ctl.narrar.addEventListener('change', () => { if (!ctl.narrar.checked && !automatico) detenerVoz(); refrescarControles(); });

const hud = document.getElementById('hud'), plegar = document.getElementById('plegar');
const alternarHud = () => { plegar.textContent = hud.classList.toggle('plegado') ? '+' : '–'; };
plegar.addEventListener('click', alternarHud);
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;                    // escribiendo el tema
  if (e.code === 'KeyH') alternarHud();                        // H oculta/muestra el panel
  if (e.code === 'KeyT') lanzar();                             // T lanza la tarea (útil caminando)
  if (e.code === 'ArrowRight' || e.code === 'PageDown') cambiarDiapositiva(1);
  if (e.code === 'ArrowLeft' || e.code === 'PageUp') cambiarDiapositiva(-1);
  if (e.code === 'Space' && hayDiapositivas()) { e.preventDefault(); if (hayVoz()) ctl.pausa.click(); else alternarPresentar(); }
});

// Los agentes miran a quien se acerca (en VR, la cabeza; en primera persona, los ojos)
const _ojos = new THREE.Vector3();
fijarMirada(() => camera.getWorldPosition(_ojos));

// --- servidor de agentes (agentes/servidor.py) ---
// Sus eventos llegan en vivo y entran por el mismo bus que la demo. Sin servidor, la escena funciona igual.
// Un solo campo: el usuario pregunta y el equipo (jefe -> investigador -> presentador) responde con diapositivas.
const formEl = document.getElementById('pregunta'), temaEl = document.getElementById('tema'),
      preguntarBtn = document.getElementById('preguntar'), servEl = document.getElementById('servidor');
let cola = Promise.resolve();   // los eventos se aplican en orden, uno tras otro
const fuente = new EventSource('/api/eventos');
fuente.onopen = async () => {
  const lista = await fetch('/api/agentes').then(r => r.json()).catch(() => []);
  const faltan = ['investigador', 'presentador'].filter(n => !lista.some(a => a.nombre === n));
  servEl.textContent = !faltan.length ? 'Conectado al equipo de agentes'
    : `Al servidor le faltan: ${faltan.join(', ')}. Arráncalo con .venv\\Scripts\\python -m agentes.servidor`;
  preguntarBtn.disabled = faltan.length > 0;
  // Qué claves tiene configuradas el servidor (solo sí/no, nunca el valor): guion, diapositivas y voz
  const cfg = await fetch('/api/config').then(r => r.json()).catch(() => null);
  const claves = document.getElementById('claves'); claves.replaceChildren();
  if (cfg) for (const [nombre, etiqueta] of [['guion', 'Clave del guion'], ['diapositivas', 'Clave de diapositivas'], ['voz', 'Voz']]) {
    const c = document.createElement('span'), ok = cfg.claves[nombre];
    c.className = 'chip ' + (ok ? 'ok' : 'no'); c.textContent = etiqueta + (ok ? ' ✓' : ' ✗'); claves.append(c);
  }
};
fuente.onmessage = m => { const e = JSON.parse(m.data); cola = cola.then(() => bus.emitir(e)).catch(console.error); };
fuente.onerror = () => { servEl.textContent = 'Sin servidor de agentes: corre .venv\\Scripts\\python -m agentes.servidor'; preguntarBtn.disabled = true; };

formEl.addEventListener('submit', async ev => {
  ev.preventDefault();
  const tema = temaEl.value.trim();
  if (!tema) return temaEl.focus();
  if (tema.startsWith('/')) {   // comandos ocultos (no se mandan al servidor)
    const cmd = tema.slice(1).trim().toLowerCase();
    if (cmd === 'latigo' || cmd === 'látigo') {
      log('Sistema', latigo.activar(!latigo.activo()) ? 'Easter egg: látigo activado (click en primera persona, agarre en VR). /latigo lo guarda' : 'Látigo guardado');
    } else log('Sistema', `Comando desconocido: /${cmd}`);
    temaEl.value = ''; return;
  }
  pasos.forEach(li => { li.className = ''; }); paso(0, 'activo');
  preguntarBtn.disabled = true;
  try {
    const r = await fetch('/api/preguntar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ tema }) });
    if (!r.ok) log('Servidor', (await r.json()).error);
  } catch { log('Servidor', 'no responde'); }
  preguntarBtn.disabled = false;
});
document.getElementById('reset').addEventListener('click', () => location.reload());

// --- bucle principal ---
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(reloj.getDelta(), 0.05);
  actualizarAgentes(dt);
  animarSala(reloj.elapsedTime);
  jugador.actualizar(dt);
  latigo.actualizar(dt);
  holograma.actualizar(reloj.elapsedTime);
  actualizarFigurantes();
  actualizarVoz(reloj.elapsedTime);
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
