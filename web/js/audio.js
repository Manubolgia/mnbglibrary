// Button beeps and tape-mechanism noises, synthesised on the spot: no sound
// files to download or cache. Nothing plays until the first button press,
// which is also what browsers require before they allow audio.

const KEY = 'mnbglibrary.sound';

let ctx = null;
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch {}

export const sound = {
  get on() {
    return enabled;
  },
  toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {}
    if (enabled) blip(1400, 0.05);
    return enabled;
  },
  click: () => blip(1800, 0.03),
  skip() {
    noise(0.16, 900, 3200, 0.12);
    blip(1200, 0.025, 0.12);
  },
  play() {
    thunk();
    motor(0.7);
  },
  eject() {
    blip(900, 0.05);
    blip(600, 0.07, 0.06);
    thunk(0.05);
  },
  boot() {
    blip(660, 0.06);
    blip(990, 0.08, 0.08);
  },
};

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function envelope(c, at, peak, length) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  g.connect(c.destination);
  return g;
}

function blip(freq, length, delay = 0) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = 'square';
  o.frequency.setValueAtTime(freq, at);
  o.connect(envelope(c, at, 0.05, length));
  o.start(at);
  o.stop(at + length + 0.02);
}

function noise(length, from, to, peak) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * length), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + length);
  src.connect(f);
  f.connect(envelope(c, at, peak, length));
  src.start(at);
}

function thunk(delay = 0) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + delay;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(140, at);
  o.frequency.exponentialRampToValueAtTime(55, at + 0.12);
  o.connect(envelope(c, at, 0.35, 0.16));
  o.start(at);
  o.stop(at + 0.2);
}

function motor(length) {
  const c = audio();
  if (!c) return;
  const at = c.currentTime + 0.1;
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(90, at);
  o.frequency.exponentialRampToValueAtTime(320, at + length);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  o.connect(f);
  f.connect(envelope(c, at, 0.03, length));
  o.start(at);
  o.stop(at + length + 0.05);
}
