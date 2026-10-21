// Física sencilla de los cubos de compañía (sin librerías: pocas cajas y liviano para el Quest).
//  - Gravedad, rebote y roce con el piso; se acomodan sobre una cara al quedar quietos.
//  - Chocan con las paredes, con los muebles (círculos de obstaculosJugador) y entre ellos como cajas
//    alineadas a los ejes, así que se pueden apilar.
//  - El visitante y los agentes los empujan al caminar contra ellos.
//  - Si un cubo le pega a un personaje con fuerza (lanzado o en la mano), avisa con alGolpear(id, vx, vz, rapidez)
//    y rebota en él.
//  - Agarrar: VR = gatillo o agarre con la mano cerca o apuntando con el rayo; compu = E en primera persona y
//    click para lanzarlo. El cubo viaja hacia la mano en un arco suave (acelera y frena) y queda flotando un poco
//    delante de ella, sin pegarse; después la sigue con un leve amortiguado. Al soltar sale con la velocidad que llevaba.
//  - resaltar(): ilumina en naranja el cubo que se agarraría si aprietas ahora.
import * as THREE from 'three';

const G = 9.8, MEDIO = 0.3, LADO = MEDIO * 2;
const REBOTE = 0.35, ROCE = 3.5, VEL_MAX = 14;
const LIM = { x0: -13 + MEDIO, x1: 13 - MEDIO, z0: -6 + MEDIO, z1: 11 - MEDIO, y1: 5.6 - MEDIO };
const ALCANCE_MANO = 0.5, ALCANCE_RAYO = 9, ALCANCE_VISTA = 4;
const ALTURA_MUEBLE = 1.05;
const RESALTE = 0xFF8A1E;
const RAPIDEZ_GOLPE = 2.4;
const SUAVE = 16;   // qué tan rápido sigue el cubo a la mano ya sostenido (1/s): alto = rígido, bajo = blando
// Dónde flota el cubo sostenido, relativo a lo que lo sostiene (metros hacia adelante y hacia abajo)
const FLOTA_VR = { adelante: 0.7, abajo: 0.08 }, FLOTA_CAMARA = { adelante: 1.5, abajo: 0.3 };
const suave = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);   // arranca lento, acelera y frena   // m/s: más despacio es un roce, no un golpe   // por encima de esto un cubo pasa por arriba de mesas y equipos bajos

export function crearFisica({ cubos, soportes = [], obstaculos = [], empujadores = () => [], alGolpear = null }) {
  const cuerpos = cubos.map(m => {
    m.material = m.material.clone();   // material propio para poder iluminar solo ese cubo
    return { m, v: new THREE.Vector3(), w: new THREE.Vector3(), sujeto: null };
  });
  const rayo = new THREE.Raycaster(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const q = new THREE.Quaternion(), eje = new THREE.Vector3(), mat = new THREE.Matrix4();
  const ARRIBA = new THREE.Vector3(0, 1, 0);
  const EJES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  let reloj = 0, gente = [];   // gente = empujadores() de este cuadro: {x, z, r, id?} (sin id = el visitante)

  const piso = (x, z) => soportes.reduce((h, s) => (Math.hypot(x - s.x, z - s.z) < s.r ? Math.max(h, s.h) : h), 0);

  // --- agarrar / soltar ---
  // sujeto = { mano: clave de quien lo sostiene (grip del control o la cámara), ancla: Object3D al que sigue,
  //            offset: Matrix4 (dónde flota relativo al ancla), viaje: { t, dur, desde, qDesde, alto } mientras
  //            llega, historial: [{p, t}] para la velocidad al soltar }
  function sujetar(c, mano, ancla, flota) {
    for (const otro of cuerpos) if (otro.sujeto?.mano === mano) otro.sujeto = null;   // una cosa por mano
    ancla.updateWorldMatrix(true, false);
    ancla.matrixWorld.decompose(tmp, q, tmp2);
    const giro = q.clone().invert().multiply(c.m.quaternion);   // conserva cómo estaba girado respecto a la mano
    const offset = new THREE.Matrix4().compose(new THREE.Vector3(0, -flota.abajo, -flota.adelante), giro, new THREE.Vector3(1, 1, 1));
    const d = c.m.position.distanceTo(tmp);
    c.sujeto = { mano, ancla, offset, historial: [],
                 viaje: { t: 0, dur: Math.min(0.9, 0.4 + d * 0.06), desde: c.m.position.clone(), qDesde: c.m.quaternion.clone(), alto: Math.min(0.6, d * 0.12) } };
    c.v.set(0, 0, 0); c.w.set(0, 0, 0);
  }
  const libres = () => cuerpos.filter(c => !c.sujeto).map(c => c.m);
  const cuerpoDe = m => cuerpos.find(k => k.m === m);

  // VR: mano = grip del control (posición de la mano), puntero = control (dirección del rayo).
  // Devuelve { c, cerca } con el cubo que se agarraría ahora, o null.
  function buscar(mano, puntero) {
    mano.getWorldPosition(tmp);
    let cerca = null, dMin = ALCANCE_MANO + MEDIO;
    for (const c of cuerpos) { const d = c.m.position.distanceTo(tmp); if (!c.sujeto && d < dMin) { dMin = d; cerca = c; } }
    if (cerca) return { c: cerca, cerca: true };
    puntero.updateWorldMatrix(true, false);
    rayo.ray.origin.setFromMatrixPosition(puntero.matrixWorld);
    rayo.ray.direction.set(0, 0, -1).transformDirection(puntero.matrixWorld);
    rayo.far = ALCANCE_RAYO;
    const [golpe] = rayo.intersectObjects(libres(), false);
    return golpe ? { c: cuerpoDe(golpe.object), cerca: false } : null;
  }
  function agarrar(mano, puntero) {
    const b = buscar(mano, puntero);
    if (!b) return false;
    sujetar(b.c, mano, puntero, FLOTA_VR);   // viaja y queda flotando delante del control, en la línea del rayo
    return true;
  }
  // Compu: lo que está en el centro de la vista, a menos de ALCANCE_VISTA
  function buscarConCamara(camara) {
    rayo.setFromCamera(new THREE.Vector2(0, 0), camara); rayo.far = ALCANCE_VISTA;
    const [golpe] = rayo.intersectObjects(libres(), false);
    return golpe ? cuerpoDe(golpe.object) : null;
  }
  // ...y viaja hasta quedar flotando delante de la vista
  function agarrarConCamara(camara) {
    const c = buscarConCamara(camara);
    if (!c) return false;
    sujetar(c, camara, camara, FLOTA_CAMARA);
    return true;
  }
  function soltar(mano, impulso = null) {
    const c = cuerpos.find(k => k.sujeto?.mano === mano);
    if (!c) return false;
    const h = c.sujeto.historial;
    if (h.length > 1 && h[h.length - 1].t - h[0].t > 0.02) {   // velocidad de la mano en los últimos ~0,1 s
      c.v.subVectors(h[h.length - 1].p, h[0].p).divideScalar(h[h.length - 1].t - h[0].t);
    }
    if (impulso) c.v.add(impulso);
    if (c.v.length() > VEL_MAX) c.v.setLength(VEL_MAX);
    c.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(c.v.length() * 0.8);
    c.sujeto = null;
    return true;
  }
  const sosteniendo = mano => cuerpos.some(c => c.sujeto?.mano === mano);

  // Ilumina los cubos de la lista (los que se agarrarían ahora) y apaga los demás
  function resaltar(lista) {
    for (const c of cuerpos) {
      const on = lista.includes(c);
      c.m.material.emissive.setHex(on ? RESALTE : 0x000000);
      c.m.material.emissiveIntensity = on ? 0.45 : 1;
    }
  }

  // --- simulación ---
  // ¿El cubo (yendo a 'vel') le pega a alguien? Devuelve a quién, o null
  function revisarGolpe(c, vel) {
    const p = c.m.position, rapidez = vel.length();
    if (!alGolpear || rapidez < RAPIDEZ_GOLPE || p.y - MEDIO > 1.8) return null;
    for (const e of gente) {
      if (e.id && Math.hypot(p.x - e.x, p.z - e.z) < e.r + MEDIO) { alGolpear(e.id, vel.x, vel.z, rapidez); return e; }
    }
    return null;
  }
  const velMano = new THREE.Vector3();
  function seguirMano(c, dt) {
    const s = c.sujeto, p = c.m.position;
    s.ancla.updateWorldMatrix(true, false);
    mat.multiplyMatrices(s.ancla.matrixWorld, s.offset).decompose(tmp, q, tmp2);
    // que no atraviese el piso ni las paredes mientras se sostiene
    tmp.y = Math.max(tmp.y, piso(tmp.x, tmp.z) + MEDIO, MEDIO);
    tmp.y = Math.min(tmp.y, LIM.y1);
    tmp.x = Math.min(Math.max(tmp.x, LIM.x0), LIM.x1); tmp.z = Math.min(Math.max(tmp.z, LIM.z0), LIM.z1);
    const v = s.viaje;
    if (v) {   // de camino a la mano: arco suave hacia el punto (que se mueve con la mano)
      v.t += dt;
      const e = suave(Math.min(1, v.t / v.dur));
      p.lerpVectors(v.desde, tmp, e); p.y += v.alto * Math.sin(Math.PI * e);
      c.m.quaternion.slerpQuaternions(v.qDesde, q, e);
      if (v.t >= v.dur) s.viaje = null;
    } else {   // ya en la mano: la sigue amortiguado, sin saltos ni temblores
      const k = 1 - Math.exp(-SUAVE * dt);
      p.lerp(tmp, k); c.m.quaternion.slerp(q, k);
    }
    s.historial.push({ p: p.clone(), t: reloj });
    while (s.historial.length > 2 && reloj - s.historial[0].t > 0.1) s.historial.shift();
    const h = s.historial, dtH = h[h.length - 1].t - h[0].t;   // pegarle a alguien con el cubo en la mano también cuenta
    if (dtH > 0.02) revisarGolpe(c, velMano.subVectors(h[h.length - 1].p, h[0].p).divideScalar(dtH));
  }

  // Al quedar apoyado, gira de a poco hasta tener una cara contra el piso (sin perder su giro en y)
  function acomodar(c, dt) {
    let mejor = null, max = -1;
    for (const e of EJES) {
      const ew = tmp.copy(e).applyQuaternion(c.m.quaternion), a = Math.abs(ew.y);
      if (a > max) { max = a; mejor = ew.clone().multiplyScalar(Math.sign(ew.y) || 1); }
    }
    q.setFromUnitVectors(mejor, ARRIBA).multiply(c.m.quaternion);
    c.m.quaternion.slerp(q, 1 - Math.exp(-7 * dt));
  }

  function paso(c, dt) {
    const p = c.m.position, v = c.v;
    v.y -= G * dt;
    p.addScaledVector(v, dt);
    const ang = c.w.length();
    if (ang > 1e-4) { q.setFromAxisAngle(eje.copy(c.w).divideScalar(ang), ang * dt); c.m.quaternion.premultiply(q); }

    let apoyado = false;
    const suelo = piso(p.x, p.z) + MEDIO;
    if (p.y < suelo) {
      p.y = suelo;
      if (v.y < 0) v.y = -v.y * REBOTE;
      if (v.y < 0.6) v.y = 0;
      apoyado = true;
    }
    if (p.y > LIM.y1) { p.y = LIM.y1; v.y = -Math.abs(v.y) * REBOTE; }
    if (p.x < LIM.x0) { p.x = LIM.x0; v.x = Math.abs(v.x) * REBOTE; }
    if (p.x > LIM.x1) { p.x = LIM.x1; v.x = -Math.abs(v.x) * REBOTE; }
    if (p.z < LIM.z0) { p.z = LIM.z0; v.z = Math.abs(v.z) * REBOTE; }
    if (p.z > LIM.z1) { p.z = LIM.z1; v.z = -Math.abs(v.z) * REBOTE; }

    // Muebles: cilindros que solo cuentan si el cubo va bajo
    if (p.y - MEDIO < ALTURA_MUEBLE) for (const o of obstaculos) {
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), r = o.r;
      if (d < r && d > 1e-4) {
        p.x = o.x + dx / d * r; p.z = o.z + dz / d * r;
        const vn = (v.x * dx + v.z * dz) / d;
        if (vn < 0) { v.x -= (1 + REBOTE) * vn * dx / d; v.z -= (1 + REBOTE) * vn * dz / d; }
      }
    }
    // Golpe a un personaje: rebota en él (perdiendo fuerza)
    const quien = revisarGolpe(c, v);
    if (quien) {
      const dx = p.x - quien.x, dz = p.z - quien.z, d = Math.hypot(dx, dz) || 1, r = quien.r + MEDIO;
      p.x = quien.x + dx / d * r; p.z = quien.z + dz / d * r;
      const vn = (v.x * dx + v.z * dz) / d;
      if (vn < 0) { v.x -= 1.3 * vn * dx / d; v.z -= 1.3 * vn * dz / d; }
      v.multiplyScalar(0.45);
      c.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6);
    }
    // Visitante y agentes empujan los cubos al caminar contra ellos
    if (p.y - MEDIO < 0.5) for (const e of gente) {   // solo los que están en el piso (los de la mesa no)
      const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz), r = e.r + MEDIO;
      if (d < r && d > 1e-4) {
        p.x = e.x + dx / d * r; p.z = e.z + dz / d * r;
        const vn = v.x * dx / d + v.z * dz / d;
        if (vn < 1.6) { v.x += (1.6 - vn) * dx / d; v.z += (1.6 - vn) * dz / d; }
        c.w.x += dz / d * 1.5; c.w.z -= dx / d * 1.5;   // se ladea un poco al empujarlo
      }
    }
    return apoyado;
  }

  // Cubo contra cubo: cajas alineadas a los ejes; se separan por el eje de menor penetración
  function chocarEntreSi(apoyados) {
    for (let i = 0; i < cuerpos.length; i++) for (let j = i + 1; j < cuerpos.length; j++) {
      const a = cuerpos[i], b = cuerpos[j];
      if (a.sujeto && b.sujeto) continue;
      const pa = a.m.position, pb = b.m.position;
      const d = [pb.x - pa.x, pb.y - pa.y, pb.z - pa.z];
      const pen = d.map(x => LADO - Math.abs(x));
      if (pen.some(x => x <= 0)) continue;
      const k = pen.indexOf(Math.min(...pen)), signo = Math.sign(d[k]) || 1;
      const mueveA = a.sujeto ? 0 : b.sujeto ? 1 : 0.5, mueveB = 1 - mueveA;
      const comp = ['x', 'y', 'z'][k];
      pa[comp] -= signo * pen[k] * mueveA; pb[comp] += signo * pen[k] * mueveB;
      const rel = (b.v[comp] - a.v[comp]) * signo;
      if (rel < 0) {   // se acercaban: quedan con la misma velocidad en ese eje (choque blando)
        const comun = a.sujeto || b.sujeto ? 0 : (a.v[comp] + b.v[comp]) / 2;
        if (!a.sujeto) a.v[comp] = comun;
        if (!b.sujeto) b.v[comp] = comun;
      }
      if (k === 1) apoyados.add(signo > 0 ? b : a);   // el de arriba queda apoyado sobre el otro
    }
  }

  function actualizar(dt) {
    reloj += dt;
    gente = empujadores();
    const sub = 3, h = dt / sub, apoyados = new Set();
    for (let n = 0; n < sub; n++) {
      for (const c of cuerpos) {
        if (c.sujeto) { if (n === 0) seguirMano(c, dt); continue; }
        if (paso(c, h)) apoyados.add(c);
      }
      chocarEntreSi(apoyados);
    }
    for (const c of cuerpos) {
      if (c.sujeto) continue;
      if (apoyados.has(c)) {
        const roce = Math.max(0, 1 - ROCE * dt);
        c.v.x *= roce; c.v.z *= roce; c.w.multiplyScalar(Math.exp(-8 * dt));
        acomodar(c, dt);
      } else c.w.multiplyScalar(Math.exp(-0.3 * dt));
    }
  }

  return { actualizar, buscar, agarrar, buscarConCamara, agarrarConCamara, soltar, sosteniendo, resaltar };
}
