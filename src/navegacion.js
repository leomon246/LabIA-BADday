// Navegación libre de los personajes: A* sobre una cuadrícula con obstáculos circulares + suavizado del camino.
// Los personajes ya no siguen una línea fija: van en diagonal, rodean mesas y tanques y se cruzan por donde haya espacio.
// oficina.js registra los obstáculos (mesas, tanques, racks…) con registrarObstaculo(x, z, r).

// Zona caminable (dentro de las paredes; el visitante usa los mismos límites)
export const SALA = { x0: -12.4, x1: 12.4, z0: -5.4, z1: 10.4 };

const obstaculos = [];                 // círculos en el piso { x, z, r }
let sucio = true;
export function registrarObstaculo(x, z, r) { obstaculos.push({ x, z, r }); sucio = true; }

const CELDA = 0.4, RADIO = 0.28;       // tamaño de celda y "grosor" de un personaje
let W = 0, H = 0, bloqueada = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function libre(x, z, r = RADIO) {
  if (x < SALA.x0 + r || x > SALA.x1 - r || z < SALA.z0 + r || z > SALA.z1 - r) return false;
  for (const o of obstaculos) if (Math.hypot(x - o.x, z - o.z) < o.r + r) return false;
  return true;
}

function construir() {
  W = Math.floor((SALA.x1 - SALA.x0) / CELDA) + 1; H = Math.floor((SALA.z1 - SALA.z0) / CELDA) + 1;
  bloqueada = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) bloqueada[j * W + i] = libre(SALA.x0 + i * CELDA, SALA.z0 + j * CELDA) ? 0 : 1;
  sucio = false;
}
const aCelda = p => ({ i: clamp(Math.round((p.x - SALA.x0) / CELDA), 0, W - 1), j: clamp(Math.round((p.z - SALA.z0) / CELDA), 0, H - 1) });
const aPunto = (i, j) => ({ x: SALA.x0 + i * CELDA, z: SALA.z0 + j * CELDA });

// Celda libre más cercana (búsqueda en anillos): para salidas o destinos que caen dentro de una mesa
function cercanaLibre(c) {
  if (!bloqueada[c.j * W + c.i]) return c;
  for (let r = 1; r < 14; r++) {
    let mejor = null, d2 = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = c.i + di, j = c.j + dj;
      if (i < 0 || j < 0 || i >= W || j >= H || bloqueada[j * W + i]) continue;
      const d = di * di + dj * dj; if (d < d2) { d2 = d; mejor = { i, j }; }
    }
    if (mejor) return mejor;
  }
  return c;
}

// ¿Se puede ir en línea recta de a a b? (se ignoran los últimos/primeros 0,6 m: salir de una mesa o llegar a ella es válido)
function lineaLibre(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.12));
  for (let k = 1; k < n; k++) {
    const t = k / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    if (t * d < 0.6 || (1 - t) * d < 0.6) continue;
    if (!libre(x, z)) return false;
  }
  return true;
}

// montículo binario mínimo para el A*
class Monton {
  constructor() { this.a = []; }
  get n() { return this.a.length; }
  push(f, id) { const a = this.a; a.push([f, id]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
      if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r;
      if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
}

const VECINOS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

// Camino de 'de' a 'a' como lista de puntos {x, z} (sin incluir 'de'). Siempre devuelve algo.
export function rutaLibre(de, a) {
  if (sucio) construir();
  const meta = { x: clamp(a.x, SALA.x0, SALA.x1), z: clamp(a.z, SALA.z0, SALA.z1) };
  if (lineaLibre(de, meta)) return [meta];
  const ini = cercanaLibre(aCelda(de)), fin = cercanaLibre(aCelda(meta));
  const id = (i, j) => j * W + i, hasta = id(fin.i, fin.j);
  const g = new Float32Array(W * H).fill(Infinity), desde = new Int32Array(W * H).fill(-1);
  const abierto = new Monton(), h = (i, j) => { const dx = Math.abs(i - fin.i), dj = Math.abs(j - fin.j); return Math.max(dx, dj) + 0.4142 * Math.min(dx, dj); };
  g[id(ini.i, ini.j)] = 0; abierto.push(h(ini.i, ini.j), id(ini.i, ini.j));
  let hallado = false;
  while (abierto.n) {
    const u = abierto.pop(); if (u === hasta) { hallado = true; break; }
    const ui = u % W, uj = (u / W) | 0;
    for (const [di, dj, c] of VECINOS) {
      const i = ui + di, j = uj + dj; if (i < 0 || j < 0 || i >= W || j >= H || bloqueada[id(i, j)]) continue;
      if (di && dj && (bloqueada[id(ui + di, uj)] || bloqueada[id(ui, uj + dj)])) continue;   // no cortar esquinas
      const nuevo = g[u] + c; if (nuevo < g[id(i, j)]) { g[id(i, j)] = nuevo; desde[id(i, j)] = u; abierto.push(nuevo + h(i, j), id(i, j)); }
    }
  }
  if (!hallado) return [meta];
  const celdas = []; for (let u = hasta; u !== -1; u = desde[u]) celdas.push(aPunto(u % W, (u / W) | 0));
  celdas.reverse();
  const pts = [de, ...celdas, meta];
  // suavizado: saltar a la punta más lejana visible desde cada punto
  const salida = []; let k = 0;
  while (k < pts.length - 1) {
    let m = pts.length - 1; while (m > k + 1 && !lineaLibre(pts[k], pts[m])) m--;
    salida.push(pts[m]); k = m;
  }
  return salida.map(p => ({ x: p.x, z: p.z }));
}

// Un punto libre al azar dentro de la sala (para pasear sin rutas fijas)
export function puntoLibreAleatorio(margen = 0.8, intentos = 40) {
  for (let n = 0; n < intentos; n++) {
    const x = SALA.x0 + margen + Math.random() * (SALA.x1 - SALA.x0 - 2 * margen), z = SALA.z0 + margen + Math.random() * (SALA.z1 - SALA.z0 - 2 * margen);
    if (libre(x, z, 0.5)) return { x, z };
  }
  return { x: 0, z: 2 };
}
