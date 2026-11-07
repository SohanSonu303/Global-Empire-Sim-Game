/**
 * Tiny sound effects made with the Web Audio API (no audio files). Off when the player turns
 * sound off in Settings, and silent until the first tap (browsers block audio before that).
 */
import { loadSettings } from '../persistence/saves';

let ctx: AudioContext | null = null;
let lastPlay = 0;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || loadSettings().sound === false) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.08): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

export type Sfx = 'coin' | 'record' | 'level' | 'bad' | 'tap';

export function play(s: Sfx): void {
  const now = Date.now();
  if (s === 'coin' && now - lastPlay < 350) return; // don't machine-gun coins at 5x speed
  const a = audio();
  if (!a) return;
  lastPlay = now;
  switch (s) {
    case 'coin':
      tone(a, 988, 0, 0.08, 'square', 0.035);
      tone(a, 1319, 0.07, 0.18, 'square', 0.035);
      break;
    case 'record':
      [784, 988, 1175, 1568].forEach((f, i) => tone(a, f, i * 0.08, 0.22, 'triangle', 0.07));
      break;
    case 'level':
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(a, f, i * 0.1, 0.35, 'triangle', 0.08));
      tone(a, 262, 0, 0.6, 'sine', 0.05);
      break;
    case 'bad':
      tone(a, 330, 0, 0.18, 'sawtooth', 0.04);
      tone(a, 247, 0.15, 0.3, 'sawtooth', 0.04);
      break;
    case 'tap':
      tone(a, 660, 0, 0.05, 'sine', 0.04);
      break;
  }
}

/** Unlock audio on the first user gesture. */
if (typeof window !== 'undefined') {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock);
}
