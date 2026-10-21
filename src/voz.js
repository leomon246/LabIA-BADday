// Narración: reproduce el audio de cada diapositiva (WAV grabado por el agente 'locutor').
// Si una diapositiva no tiene audio (cuota, sin clave, red), usa la voz del navegador solo para esa.
// Un único reproductor: al empezar otra pista, la anterior se corta (no se solapan).
import { hablando } from './agentes.js';
import { marcarNarrando } from './oficina.js';
import { vigilarAudio } from './util.js';

const pistas = new Map();            // indice -> { url, texto, duracion }
const audio = new Audio();           // un solo elemento reutilizado
audio.preload = 'auto';
let ctxAudio = null, analizador = null, muestras = null, ganancia = null;
let actual = -1, modo = null;        // modo: 'audio' | 'navegador' | null
let enPausa = false, alTerminar = null, temporizador = 0, narrador = 'presentador';

export const configurarVoz = ({ presentador = 'presentador', fin } = {}) => { narrador = presentador; alTerminar = fin; };
export const registrarPista = e => { pistas.set(e.indice, { url: e.url, texto: e.texto, duracion: e.duracion }); };
export const olvidarPistas = () => { detener(); pistas.clear(); };
export const hayVoz = () => modo !== null;
export const pausada = () => enPausa;
export const fuenteDe = i => (pistas.get(i)?.url ? 'ia' : 'navegador');

function prepararAnalizador() {   // se crea con la primera reproducción (los navegadores piden un gesto del usuario)
  if (ctxAudio) return;
  try {
    ctxAudio = new AudioContext();
    analizador = ctxAudio.createAnalyser(); analizador.fftSize = 256;
    muestras = new Uint8Array(analizador.fftSize);
    ganancia = ctxAudio.createGain();   // fundidos: sin ellos cada corte de audio suena como un clic
    ctxAudio.createMediaElementSource(audio).connect(ganancia); ganancia.connect(analizador); analizador.connect(ctxAudio.destination);
    vigilarAudio(ctxAudio);   // en el Quest puede quedar congelado y mudo
  } catch { ctxAudio = analizador = ganancia = null; }
}

function terminar(natural) {
  clearTimeout(temporizador);
  const i = actual; modo = null; actual = -1; enPausa = false;
  hablando(narrador, false); marcarNarrando(false);
  if (natural && alTerminar) alTerminar(i);
}

export function detener() {
  audio.onended = audio.onerror = null; audio.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (modo) terminar(false);
}

function vozNavegador(texto, i) {
  modo = 'navegador'; actual = i;
  if (!('speechSynthesis' in window) || !texto) {            // sin voz: espera lo que tardaría en leerse
    temporizador = setTimeout(() => terminar(true), Math.max(2500, texto.split(' ').length * 400)); return;
  }
  const u = new SpeechSynthesisUtterance(texto);
  const es = speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('es'));
  if (es) u.voice = es; u.lang = es ? es.lang : 'es-ES'; u.rate = 1.02;
  u.onend = () => { if (actual === i && modo === 'navegador') terminar(true); };
  u.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted' && actual === i) terminar(true); };
  speechSynthesis.speak(u);
}

// Habla la diapositiva 'i' (0 = portada). 'textoRespaldo' es lo que se lee con la voz del navegador si no hay audio.
export function hablar(i, textoRespaldo = '') {
  detener();
  const pista = pistas.get(i);
  actual = i; marcarNarrando(true);
  if (pista && pista.url) {
    prepararAnalizador(); ctxAudio && ctxAudio.resume();
    modo = 'audio'; enPausa = false;
    if (ganancia) ganancia.gain.value = 0;                  // arranca en silencio y sube (ver actualizarVoz)
    audio.src = pista.url;
    audio.onended = () => { if (actual === i) terminar(true); };
    audio.onerror = () => {   // archivo ausente o dañado: cae a la voz del navegador sin perder la presentación
      console.warn('Audio no disponible:', pista.url);
      if (actual === i) { modo = null; vozNavegador(pista.texto || textoRespaldo, i); }
    };
    audio.play().catch(() => { if (actual === i) { modo = null; vozNavegador(pista.texto || textoRespaldo, i); } });
  } else {
    vozNavegador((pista && pista.texto) || textoRespaldo, i);
  }
}

export function pausarReanudar() {
  if (!modo) return false;
  enPausa = !enPausa;
  if (modo === 'audio') enPausa ? audio.pause() : audio.play();
  else if ('speechSynthesis' in window) enPausa ? speechSynthesis.pause() : speechSynthesis.resume();
  if (enPausa) hablando(narrador, false);
  return enPausa;
}

// Se llama cada cuadro: el presentador gesticula y su visor pulsa con el volumen real
export function actualizarVoz(t) {
  if (!modo || enPausa) return;
  let nivel = 0.4 + 0.4 * Math.abs(Math.sin(t * 9));         // voz del navegador: no hay señal que medir
  if (modo === 'audio' && ganancia && isFinite(audio.duration)) {   // fundido de entrada (25 ms) y de salida (70 ms) en cada cuadro
    ganancia.gain.value = Math.max(0, Math.min(1, audio.currentTime / 0.025, (audio.duration - audio.currentTime) / 0.07));
  }
  if (modo === 'audio' && analizador) {
    analizador.getByteTimeDomainData(muestras);
    let s = 0; for (const m of muestras) { const v = (m - 128) / 128; s += v * v; }
    nivel = Math.min(1, Math.sqrt(s / muestras.length) * 4);
  }
  hablando(narrador, true, nivel);
}
