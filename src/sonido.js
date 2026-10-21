// Sonido del laboratorio, generado en vivo con WebAudio (sin archivos: sin derechos de autor y sin internet).
//  - Ambiente: zumbido de la sala y ventilación (en todo el lab) + sonido 3D que sale de cada lugar:
//    racks (zumbido eléctrico y ventiladores), tanques (burbujas) y estaciones (pitidos de computadora).
//  - Música: fondo ambiental lento (acordes de sintetizador que cambian cada ~9 s y notas sueltas con eco);
//    baja sola mientras habla el presentador.
// Los navegadores solo dejan sonar audio tras un gesto del usuario: iniciar() se llama con el primer click/tecla.
import * as THREE from 'three';
import { vigilarAudio } from './util.js';

// Pensado para los parlantes del Quest: casi no dan graves (< 250 Hz), así que todo va más agudo y fuerte
const VOL_AMBIENTE = 1.0, VOL_MUSICA = 0.9;
// Acordes (Hz, registro medio): La m9 → Fa maj7 → Do maj7 → Mi m7
const ACORDES = [[220.0, 261.63, 329.63, 493.88], [174.61, 261.63, 329.63, 440.0], [261.63, 329.63, 392.0, 493.88], [164.81, 293.66, 392.0, 493.88]];
const azar = (a, b) => a + Math.random() * (b - a);

export function crearSonido({ camera, scene, racks = [], tanques = [], estaciones = [], hablando = () => false }) {
  let ctx = null, listener = null, ruido = null, ambiente = null, musica = null, iniciado = false, despertar = () => {};
  const estado = { ambiente: leer('sonido.ambiente', true), musica: leer('sonido.musica', true) };
  const temporizadores = [];

  function leer(clave, porDefecto) {
    try { const v = localStorage.getItem(clave); return v === null ? porDefecto : v === '1'; } catch { return porDefecto; }
  }
  function guardar(clave, v) { try { localStorage.setItem(clave, v ? '1' : '0'); } catch { /* sin almacenamiento */ } }

  // 4 s de ruido blanco en bucle: la materia prima de ventilación, ventiladores y sala
  function crearRuido() {
    const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let marron = 0;
    const blanco = ctx.createBuffer(1, n, ctx.sampleRate), w = blanco.getChannelData(0);
    for (let i = 0; i < n; i++) {
      w[i] = Math.random() * 2 - 1;
      marron = (marron + 0.02 * w[i]) / 1.02; d[i] = marron * 3.5;   // ruido marrón: grave y suave
    }
    return { blanco, marron: b };
  }
  function fuenteRuido(tipo) {
    const s = ctx.createBufferSource(); s.buffer = ruido[tipo]; s.loop = true;
    s.loopStart = Math.random() * 3; s.start(0, Math.random() * 3);   // cada uno desfasado: no suenan idénticos
    return s;
  }
  function filtro(tipo, f, q = 0.7) { const n = ctx.createBiquadFilter(); n.type = tipo; n.frequency.value = f; n.Q.value = q; return n; }
  function gan(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function osc(tipo, f) { const o = ctx.createOscillator(); o.type = tipo; o.frequency.value = f; o.start(); return o; }
  // Oscilador lento que mueve un parámetro (respiración de la ventilación, barrido del filtro…)
  function lfo(param, f, cuanto) { const o = osc('sine', f), g = gan(cuanto); o.connect(g); g.connect(param); }

  // Un punto del mundo que suena (sonido 3D): devuelve la entrada donde conectar los sonidos de ese lugar
  const emisores = [];
  function emisor(x, y, z, ref = 1.2) {
    const pa = new THREE.PositionalAudio(listener);
    pa.setRefDistance(ref * 2.5); pa.setRolloffFactor(1.0);   // se oye de más lejos pa.setDistanceModel('inverse'); pa.setMaxDistance(30);
    const entrada = gan(1); pa.setNodeSource(entrada);   // entrada → panner 3D → oído del visitante
    pa.position.set(x, y, z); scene.add(pa);
    emisores.push(pa);
    return entrada;
  }

  // --- ambiente ---
  function armarAmbiente() {
    // Sala: zumbido grave y ventilación que "respira"
    const sala = fuenteRuido('marron'); sala.connect(filtro('highpass', 180)).connect(filtro('lowpass', 1100)).connect(gan(0.35)).connect(ambiente);
    const vent = fuenteRuido('blanco'), vg = gan(0.045);
    vent.connect(filtro('bandpass', 1300, 0.5)).connect(vg).connect(ambiente); lfo(vg.gain, 0.06, 0.015);
    for (const [f, v] of [[240, 0.012], [360, 0.008], [480, 0.005]]) osc('sine', f).connect(gan(v)).connect(ambiente);   // zumbido eléctrico (armónicos audibles)

    // Racks: zumbido eléctrico + ventiladores
    for (const r of racks) {
      const e = emisor(r.x, 1.1, r.z, 1.0);
      const z1 = osc('sawtooth', 120), z2 = osc('sine', 240), f = filtro('lowpass', 1400);
      z1.connect(gan(0.07)).connect(f); z2.connect(gan(0.06)).connect(f); f.connect(e);
      const fan = fuenteRuido('blanco'), fg = gan(0.14);
      fan.connect(filtro('bandpass', azar(1700, 2300), 0.9)).connect(fg).connect(e); lfo(fg.gain, azar(0.2, 0.35), 0.02);
    }
    // Tanques: burbujas sueltas y en ráfagas
    for (const t of tanques) {
      const e = emisor(t.x, 1.0, t.z, 1.0), base = azar(420, 700);
      const burbujear = () => {
        const n = Math.random() < 0.25 ? 3 + Math.floor(Math.random() * 4) : 1;
        for (let i = 0; i < n; i++) burbuja(e, base * azar(0.8, 1.5), ctx.currentTime + i * azar(0.05, 0.12));
        temporizadores.push(setTimeout(burbujear, azar(250, 1400)));
      };
      burbujear();
    }
    // Estaciones: de vez en cuando una computadora pita (dos tonos cortos)
    const pitidos = estaciones.map(s => emisor(s.x, 1.2, s.z, 0.8));
    const pitar = () => {
      if (pitidos.length) {
        const e = pitidos[Math.floor(Math.random() * pitidos.length)], t0 = ctx.currentTime, f = azar(900, 1500);
        tono(e, f, t0, 0.07, 0.14); tono(e, f * (Math.random() < 0.5 ? 1.33 : 0.75), t0 + 0.11, 0.07, 0.14);
      }
      temporizadores.push(setTimeout(pitar, azar(4000, 11000)));
    };
    temporizadores.push(setTimeout(pitar, 3000));
  }
  function burbuja(destino, f, t0) {
    const o = ctx.createOscillator(), g = gan(0);
    o.type = 'sine'; o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 2.4, t0 + 0.07);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.35, t0 + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.connect(g).connect(destino); o.start(t0); o.stop(t0 + 0.1);
  }
  function tono(destino, f, t0, dur, vol, tipo = 'sine') {
    const o = ctx.createOscillator(), g = gan(0);
    o.type = tipo; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.setTargetAtTime(0, t0 + dur * 0.6, dur * 0.3);
    o.connect(g).connect(destino); o.start(t0); o.stop(t0 + dur * 3);
  }

  // --- música ---
  function armarMusica() {
    const corte = filtro('lowpass', 1500, 0.8); corte.connect(musica);
    lfo(corte.frequency, 0.045, 600);   // el timbre se abre y se cierra lento
    // 4 voces, cada una con dos osciladores levemente desafinados (suena "ancho")
    const voces = [0, 1, 2, 3].map(() => {
      const a = osc('triangle', 220), b = osc('sawtooth', 220), g = gan(0.06);
      b.detune.value = 7; a.detune.value = -5;
      a.connect(g); b.connect(gan(0.35)).connect(g); g.connect(corte);
      return [a, b];
    });
    let i = 0;
    const acorde = () => {
      const notas = ACORDES[i % ACORDES.length], t = ctx.currentTime;
      voces.forEach(([a, b], k) => { a.frequency.setTargetAtTime(notas[k], t, 0.9); b.frequency.setTargetAtTime(notas[k], t, 0.9); });
      i++;
      temporizadores.push(setTimeout(acorde, 9000));
    };
    acorde();
    // Notas sueltas, una octava (o dos) arriba, con eco
    const eco = ctx.createDelay(1), vuelta = gan(0.38), salidaEco = gan(0.5);
    eco.delayTime.value = 0.42; eco.connect(vuelta).connect(eco); eco.connect(salidaEco).connect(musica);
    const notaSuelta = () => {
      const notas = ACORDES[(i + ACORDES.length - 1) % ACORDES.length];
      const f = notas[Math.floor(Math.random() * notas.length)] * (Math.random() < 0.6 ? 2 : 4), t0 = ctx.currentTime;
      const o = ctx.createOscillator(), g = gan(0);
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.16, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.4);
      o.connect(g); g.connect(musica); g.connect(eco); o.start(t0); o.stop(t0 + 1.5);
      temporizadores.push(setTimeout(notaSuelta, azar(1600, 3800)));
    };
    temporizadores.push(setTimeout(notaSuelta, 2500));
  }

  function aplicar() {
    if (!iniciado) return;
    const t = ctx.currentTime;
    ambiente.gain.setTargetAtTime(estado.ambiente ? VOL_AMBIENTE : 0, t, 0.4);
    for (const pa of emisores) pa.gain.gain.setTargetAtTime(estado.ambiente ? 1 : 0, t, 0.4);
  }

  function iniciar() {
    if (iniciado) { if (ctx.state !== 'running') ctx.resume(); return; }
    try {
      listener = new THREE.AudioListener(); camera.add(listener);
      ctx = listener.context; ruido = crearRuido();
      despertar = vigilarAudio(ctx);   // en el Quest puede congelarse (p. ej. al entrar a VR)
      ambiente = gan(0); musica = gan(0);
      ambiente.connect(listener.getInput()); musica.connect(listener.getInput());
      iniciado = true;
      armarAmbiente(); armarMusica(); aplicar();
      const t0 = ctx.currentTime + 0.05, ding = gan(0.6); ding.connect(listener.getInput());   // "ding" suave: el audio arrancó
      tono(ding, 1046.5, t0, 0.25, 0.35); tono(ding, 1568, t0 + 0.14, 0.4, 0.3);
      if (ctx.state !== 'running') ctx.resume();
    } catch (err) { console.warn('Sin sonido:', err); }
  }

  // Cada cuadro: la música baja mientras habla el presentador
  let duck = null;
  function actualizar() {
    if (!iniciado) return;
    const objetivo = estado.musica ? VOL_MUSICA * (hablando() ? 0.3 : 1) : 0;
    if (objetivo !== duck) { duck = objetivo; musica.gain.setTargetAtTime(objetivo, ctx.currentTime, 0.6); }
  }

  function alternar(cual) {
    estado[cual] = !estado[cual]; guardar('sonido.' + cual, estado[cual]);
    iniciar(); aplicar(); duck = null;
    return estado[cual];
  }

  return { iniciar, actualizar, alternar, activo: cual => estado[cual], despertar: () => despertar() };
}
