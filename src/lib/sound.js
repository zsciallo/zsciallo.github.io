// Arcade sound, synthesised with Web Audio: no files to download, nothing
// plays until the visitor has pressed something (browser autoplay rules),
// and the whole thing can be switched off from the nav.
//
// Loudness is capped on purpose. Every voice runs through one master gain and
// a limiter, so a click lands around -35 dBFS and the loudest fanfare stays
// under about -18 dBFS - noticeable, never startling, even at full system
// volume on a desktop.

const KEY = 'chromabit:sound';
const MASTER = 0.18;

let enabled = readSetting();
const listeners = new Set();

let ctx = null;
let out = null;
let noiseBuffer = null;
let crackle = null;

function readSetting() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    // No storage (server render, private mode): default on.
    return true;
  }
}

export function soundEnabled() {
  return enabled;
}

export function setSoundEnabled(on) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Not persisted, but the choice still holds for this page.
  }
  if (!on) stopFire();
  listeners.forEach((fn) => fn(on));
}

export function subscribeSound(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// A toggle in another tab applies here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    enabled = e.newValue !== 'off';
    if (!enabled) stopFire();
    listeners.forEach((fn) => fn(enabled));
  });
}

/** The audio graph, built on first use. Null when muted or unsupported, which
 *  turns every voice below into a no-op. */
function audio() {
  if (!enabled || typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -24;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    out = ctx.createGain();
    out.gain.value = MASTER;
    out.connect(limiter);
    limiter.connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Fast attack, exponential tail: every sound is a blip, nothing drones. */
function envelope(gain, t, peak, attack, dur) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(ac, freq, { at = 0, dur = 0.1, peak = 0.15, type = 'square', attack = 0.004, to = null, detune = 0 }) {
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  osc.detune.value = detune;
  envelope(gain, t, peak, attack, dur);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(ac, { at = 0, dur = 0.03, peak = 0.2, filter = 'bandpass', freq = 1800, q = 0.8, to = null }) {
  const t = ac.currentTime + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const biquad = ac.createBiquadFilter();
  biquad.type = filter;
  biquad.frequency.setValueAtTime(freq, t);
  if (to) biquad.frequency.exponentialRampToValueAtTime(to, t + dur);
  biquad.Q.value = q;
  const gain = ac.createGain();
  envelope(gain, t, peak, 0.002, dur);
  src.connect(biquad).connect(gain).connect(out);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.02);
}

const wobble = (amount) => 1 + (Math.random() * 2 - 1) * amount;

// The click picks a note from a bright pentatonic set each time, so a run of
// presses sounds like a little melody rather than one sample on repeat.
const CLICK_NOTES = [1046.5, 1174.7, 1318.5, 1568, 1760];

/** The button press: a crisp tick plus a tiny upward "pop", quiet on purpose -
 *  it plays on every press across the site. `soft` is the tick alone, for
 *  controls that play their own pitched sound on top (the stepper's combo
 *  notes would clash with the pop). */
export function click({ soft = false } = {}) {
  const ac = audio();
  if (!ac) return;
  noise(ac, { dur: 0.012, peak: soft ? 0.05 : 0.07, filter: 'highpass', freq: 4500, q: 0.7 });
  if (soft) return;
  const f = CLICK_NOTES[Math.floor(Math.random() * CLICK_NOTES.length)];
  tone(ac, f * 0.75, { dur: 0.07, peak: 0.09, type: 'triangle', to: f, attack: 0.003 });
  tone(ac, f * 1.5, { at: 0.012, dur: 0.05, peak: 0.025, type: 'sine' });
}

// Major pentatonic from C5: each combo step climbs one note, Balatro-style.
const PENTA = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
function pentaNote(step) {
  const i = Math.max(0, Math.min(step, 11));
  return 523.25 * PENTA[i % 5] * 2 ** Math.floor(i / 5);
}

/** The combo chip: a bright blip that climbs in pitch with every step. */
export function tick(step = 0) {
  const ac = audio();
  if (!ac) return;
  const f = pentaNote(step);
  tone(ac, f, { dur: 0.09, peak: 0.12, type: 'square' });
  tone(ac, f * 2, { dur: 0.13, peak: 0.06, type: 'triangle', at: 0.012 });
}

/** − : a soft drop. */
export function deflate() {
  const ac = audio();
  if (!ac) return;
  tone(ac, 392, { dur: 0.11, peak: 0.1, type: 'triangle', to: 250 });
}

/** A quick rising arpeggio, rooted higher at every tier, with a shimmer. */
export function levelUp(tier = 2) {
  const ac = audio();
  if (!ac) return;
  const root = 523.25 * 2 ** ((Math.max(tier, 2) - 2) * 2 / 12);
  [1, 5 / 4, 3 / 2, 2].forEach((r, i) => {
    tone(ac, root * r, { at: i * 0.06, dur: 0.14, peak: 0.1, type: 'square' });
  });
  tone(ac, root * 2, { at: 0.18, dur: 0.45, peak: 0.05, type: 'triangle', detune: 7 });
  tone(ac, root * 2, { at: 0.18, dur: 0.45, peak: 0.05, type: 'triangle', detune: -7 });
}

/** FREE KEY: a two-note pickup jingle with a sparkle on top - the "you got
 *  loot" sound, distinct from the level-up arpeggio. */
let lastFreeKey = 0;

export function freeKey() {
  // The stepper and the cart can both announce the same key a moment apart;
  // one jingle is the celebration, two is a glitch.
  const now = Date.now();
  if (now - lastFreeKey < 1500) return;
  lastFreeKey = now;
  const ac = audio();
  if (!ac) return;
  tone(ac, 987.77, { dur: 0.08, peak: 0.11, type: 'square' });
  tone(ac, 1318.51, { at: 0.08, dur: 0.22, peak: 0.11, type: 'square' });
  [1567.98, 1975.53, 2637.02].forEach((f, i) => {
    tone(ac, f, { at: 0.16 + i * 0.045, dur: 0.18, peak: 0.045, type: 'triangle' });
  });
}

/** 99: a two-octave fanfare that lands on a held chord. */
export function maxOut() {
  const ac = audio();
  if (!ac) return;
  const root = 523.25;
  [1, 5 / 4, 3 / 2, 2, 5 / 2, 3, 4].forEach((r, i) => {
    tone(ac, root * r, { at: i * 0.05, dur: 0.12, peak: 0.09, type: 'square' });
  });
  [2, 5 / 2, 3].forEach((r) => {
    tone(ac, root * r, { at: 0.36, dur: 0.6, peak: 0.06, type: 'triangle' });
  });
}

/** Combo 10: a whoosh and a thump, then a quiet crackle for as long as the
 *  fire stays lit. stopFire() puts it out. */
export function ignite() {
  const ac = audio();
  if (!ac) return;
  noise(ac, { dur: 0.38, peak: 0.25, freq: 300, to: 3200, q: 1.2 });
  tone(ac, 120, { dur: 0.22, peak: 0.3, type: 'sine', to: 48 });
  stopFire();
  const pop = () => {
    const live = audio();
    if (!live) return stopFire();
    noise(live, { dur: 0.018, peak: 0.04 + Math.random() * 0.05, filter: 'highpass', freq: 1400 + Math.random() * 2400, q: 0.7 });
    crackle = setTimeout(pop, 60 + Math.random() * 110);
  };
  crackle = setTimeout(pop, 200);
}

export function stopFire() {
  clearTimeout(crackle);
  crackle = null;
}
