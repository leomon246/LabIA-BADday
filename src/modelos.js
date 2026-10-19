// Modelos 3D de la presentación: un holograma que flota sobre un pedestal junto a la pantalla grande y cambia
// según la diapositiva. Los dibuja el código (formas simples, pocas luces: pensado para el Quest), así que no
// hay archivos que descargar ni cuota de imágenes que gastar.
// La IA solo elige el NOMBRE (campo `visual` de cada diapositiva); si el nombre no existe, no se muestra nada.
import * as THREE from 'three';
import { canvasTex } from './util.js';

export const NOMBRES = ['planeta', 'atomo', 'agujero_negro', 'estrella', 'adn', 'onda', 'engranaje', 'grafico_barras', 'molecula', 'cristal'];

const mate = (color, rugosidad = 0.5) => new THREE.MeshStandardMaterial({ color, roughness: rugosidad });
const brilla = (color, i = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.3 });
const esfera = (r, material, seg = 20) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), material);

// resplandor suave (para estrellas y discos)
let texBrillo = null;
function brillo(color, tam) {
  if (!texBrillo) {
    const T = canvasTex(64, 64), g = T.ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    T.ctx.fillStyle = g; T.ctx.fillRect(0, 0, 64, 64); T.t.needsUpdate = true; texBrillo = T.t;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrillo, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(tam); return s;
}

// Cada constructor devuelve { grupo, animar(t) } y cabe en una esfera de ~0.6 m de radio.
const CONSTRUCTORES = {
  planeta() {
    const g = new THREE.Group();
    const p = esfera(0.36, mate(0x3A8FD9, 0.6), 28);
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 8, 48), mate(0xD9B36A, 0.5));
    anillo.rotation.x = Math.PI / 2.3; anillo.scale.z = 0.4;
    const luna = esfera(0.07, mate(0xDDDDDD, 0.8), 12), orbita = new THREE.Group(); luna.position.x = 0.75; orbita.add(luna);
    g.add(p, anillo, orbita);
    return { grupo: g, animar: t => { p.rotation.y = t * 0.5; orbita.rotation.y = t * 1.1; } };
  },
  atomo() {
    const g = new THREE.Group(), nucleo = new THREE.Group();
    [[0.06, 0, 0], [-0.05, 0.05, 0.03], [0, -0.06, -0.04], [0.02, 0.03, -0.07]].forEach(([x, y, z], i) => {
      const n = esfera(0.075, brilla(i % 2 ? 0x4C7DFF : 0xFF5A4C, 0.6), 12); n.position.set(x, y, z); nucleo.add(n);
    });
    g.add(nucleo);
    const electrones = [];
    [0, Math.PI / 3, -Math.PI / 3].forEach((rot, i) => {
      const orb = new THREE.Group(); orb.rotation.z = rot; orb.rotation.x = Math.PI / 2.5;
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.008, 6, 64), brilla(0x45D6C8, 0.5)); orb.add(aro);
      const e = esfera(0.045, brilla(0xFFFFFF, 1), 10); orb.add(e); electrones.push({ e, fase: i * 2.1 });
      g.add(orb);
    });
    return { grupo: g, animar: t => electrones.forEach(({ e, fase }, i) => { const a = t * (2.2 + i * 0.4) + fase; e.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0); }) };
  },
  agujero_negro() {
    const g = new THREE.Group();
    const centro = esfera(0.2, new THREE.MeshBasicMaterial({ color: 0x000000 }), 24);
    const discoMat = new THREE.MeshBasicMaterial({ color: 0xFFB04A, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const disco = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.72, 64, 1), discoMat); disco.rotation.x = Math.PI / 2.2;
    const disco2 = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.4, 64, 1), new THREE.MeshBasicMaterial({ color: 0xFFEBC0, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })); disco2.rotation.x = Math.PI / 2.2;
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: 0xFFD79A })); halo.rotation.x = Math.PI / 2.2;
    const resplandor = brillo(0xFF8A3A, 1.8);
    g.add(resplandor, disco, disco2, halo, centro);
    return { grupo: g, animar: t => { disco.rotation.z = t * 0.8; disco2.rotation.z = -t * 1.4; discoMat.opacity = 0.8 + 0.1 * Math.sin(t * 3); } };
  },
  estrella() {
    const g = new THREE.Group();
    const nucleo = esfera(0.3, brilla(0xFFD24A, 1.4), 24);
    const corona = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: 0xFFA43A, wireframe: true, transparent: true, opacity: 0.55 }));
    g.add(brillo(0xFFC34A, 1.6), nucleo, corona);
    return { grupo: g, animar: t => { corona.rotation.set(t * 0.4, t * 0.6, 0); nucleo.scale.setScalar(1 + 0.04 * Math.sin(t * 4)); } };
  },
  adn() {
    const g = new THREE.Group(), N = 22, H = 1.2, R = 0.22;
    const cA = brilla(0x45D6C8, 0.6), cB = brilla(0xFF6AA8, 0.6), barra = mate(0xCFE3E0, 0.4);
    for (let i = 0; i < N; i++) {
      const y = -H / 2 + (i / (N - 1)) * H, a = i * 0.5;
      const A = esfera(0.045, cA, 8), B = esfera(0.045, cB, 8);
      A.position.set(Math.cos(a) * R, y, Math.sin(a) * R); B.position.set(-Math.cos(a) * R, y, -Math.sin(a) * R);
      g.add(A, B);
      if (i % 2 === 0) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, R * 2, 5), barra);
        b.position.y = y; b.rotation.z = Math.PI / 2; b.rotation.y = -a; g.add(b);
      }
    }
    return { grupo: g, animar: t => { g.rotation.y = t * 0.9; } };
  },
  onda() {
    const g = new THREE.Group(), N = 30, esferas = [];
    for (let i = 0; i < N; i++) {
      const e = esfera(0.04, brilla(new THREE.Color().setHSL(0.45 + i / N * 0.25, 0.8, 0.6), 0.7), 8);
      e.position.x = (i / (N - 1) - 0.5) * 1.3; g.add(e); esferas.push(e);
    }
    return { grupo: g, animar: t => esferas.forEach((e, i) => { e.position.y = Math.sin(i * 0.5 - t * 3) * 0.28 * (0.6 + 0.4 * Math.sin(t * 0.7)); e.position.z = Math.cos(i * 0.5 - t * 3) * 0.06; }) };
  },
  engranaje() {
    const g = new THREE.Group(), cuerpo = new THREE.Group();
    const m = mate(0x9AA7AC, 0.35);
    const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 32), m); disco.rotation.x = Math.PI / 2; cuerpo.add(disco);
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.14), m), a = i / 10 * Math.PI * 2;
      d.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0); d.rotation.z = a; cuerpo.add(d);
    }
    const eje = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 16), mate(0x2A3335, 0.5)); eje.rotation.x = Math.PI / 2; cuerpo.add(eje);
    const chico = cuerpo.clone(); chico.scale.setScalar(0.55); chico.position.set(0.62, -0.28, 0);
    g.add(cuerpo, chico);
    return { grupo: g, animar: t => { cuerpo.rotation.z = t * 0.6; chico.rotation.z = -t * 1.1 + 0.2; } };
  },
  grafico_barras() {
    const g = new THREE.Group(), barras = [], alturas = [0.35, 0.6, 0.45, 0.85, 1.05];
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.35), mate(0x2A3335, 0.5)); base.position.y = -0.52; g.add(base);
    alturas.forEach((h, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), brilla(new THREE.Color().setHSL(0.45 + i * 0.05, 0.7, 0.55), 0.35));
      b.position.x = (i - 2) * 0.24; g.add(b); barras.push({ b, h });
    });
    return { grupo: g, animar: t => barras.forEach(({ b, h }, i) => { const k = 0.82 + 0.18 * Math.sin(t * 1.6 + i); b.scale.y = h * k; b.position.y = -0.5 + (h * k) / 2; }) };
  },
  molecula() {
    const g = new THREE.Group(), O = esfera(0.2, mate(0xFF4C4C, 0.4), 20);
    const H1 = esfera(0.12, mate(0xF2F4F4, 0.4), 16), H2 = esfera(0.12, mate(0xF2F4F4, 0.4), 16);
    H1.position.set(0.36, -0.27, 0); H2.position.set(-0.36, -0.27, 0);
    const enlace = (b) => { const l = b.position.length(), c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, l, 8), mate(0xCFD6D8, 0.4));
      c.position.copy(b.position).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.position.clone().normalize()); return c; };
    g.add(O, H1, H2, enlace(H1), enlace(H2));
    return { grupo: g, animar: t => { g.rotation.y = t * 0.8; g.rotation.z = Math.sin(t * 0.7) * 0.15; } };
  },
  cristal() {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(0.42, 0);
    const c = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7FE0FF, roughness: 0.1, metalness: 0.3, flatShading: true, transparent: true, opacity: 0.8 }));
    const aristas = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xFFFFFF }));
    g.add(c, aristas, brillo(0x7FE0FF, 1.2));
    return { grupo: g, animar: t => { g.rotation.set(t * 0.3, t * 0.7, t * 0.1); } };
  },
};

export const crearModelo = nombre => CONSTRUCTORES[nombre]?.() ?? null;   // un modelo suelto (pruebas, miniaturas)

// --- el holograma: pedestal + modelo actual, con una entrada/salida animada ---
export function crearHolograma(scene, posicion = new THREE.Vector3(-3.9, 0, -5.0)) {
  const raiz = new THREE.Group(); raiz.position.copy(posicion); scene.add(raiz);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.52, 0.1, 32), mate(0x2A3335, 0.4)); base.position.y = 0.05;
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: 0x45D6C8 })); aro.rotation.x = Math.PI / 2; aro.position.y = 0.11;
  const haz = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 1.7, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x45D6C8, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
  haz.position.y = 0.95;
  const pedestal = new THREE.Group(); pedestal.add(base, aro, haz); pedestal.visible = false; raiz.add(pedestal);

  const ALTURA = 1.65, ESCALA = 1.45;   // se ve de lejos desde donde está el visitante
  let actual = null, nombreActual = null, pendiente = undefined, t0 = 0, fase = 'quieto', tFase = 0, ahora = 0;

  function poner(nombre) {
    if (actual) { raiz.remove(actual.grupo); actual = null; }
    nombreActual = nombre;
    if (nombre && CONSTRUCTORES[nombre]) { actual = CONSTRUCTORES[nombre](); actual.grupo.position.y = ALTURA; actual.grupo.scale.setScalar(0.001); raiz.add(actual.grupo); }
    fase = actual ? 'entra' : 'quieto'; tFase = ahora;
  }

  return {
    // pide mostrar 'nombre' (o nada); si ya hay otro, sale primero
    mostrar(nombre) {
      const valido = CONSTRUCTORES[nombre] ? nombre : null;
      pedestal.visible = pedestal.visible || !!valido;
      if (valido === nombreActual) return;
      if (actual) { pendiente = valido; fase = 'sale'; tFase = ahora; } else poner(valido);
    },
    nombreActual: () => nombreActual,
    actualizar(t) {
      ahora = t;
      aro.rotation.z = t * 0.5; haz.material.opacity = 0.06 + 0.02 * Math.sin(t * 2);
      if (!actual) return;
      const k = Math.min(1, (t - tFase) / 0.35);
      if (fase === 'entra') {           // aparece con un pequeño rebote
        const e = 1 - Math.pow(1 - k, 3), rebote = 1 + 0.12 * Math.sin(k * Math.PI);
        actual.grupo.scale.setScalar(Math.max(0.001, ESCALA * e * rebote)); if (k >= 1) fase = 'quieto';
      } else if (fase === 'sale') {
        actual.grupo.scale.setScalar(Math.max(0.001, ESCALA * (1 - k))); if (k >= 1) { const sig = pendiente; pendiente = undefined; poner(sig); }
      }
      actual.grupo.position.y = ALTURA + Math.sin(t * 1.4) * 0.04;     // flota
      actual.animar(t);
    },
  };
}
