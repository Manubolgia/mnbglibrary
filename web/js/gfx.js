// Helpers for the per-game animations ("tapes").
//
// Two ways to draw: straight characters with `art` (hand-made ASCII sprites),
// or a small greyscale pixel buffer rendered through `blit`, where every pixel
// becomes one character picked by brightness from a ramp of symbols.

export const RAMP = ' .:-=+*#%@';
export const BLOCKS = ' ░▒▓█';

export class Pixels {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.v = new Float32Array(w * h);
  }

  clear(value = 0) {
    this.v.fill(value);
  }

  get(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.v[y * this.w + x];
  }

  set(x, y, value) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.v[y * this.w + x] = value;
  }

  add(x, y, value) {
    this.set(x, y, Math.min(1, this.get(x, y) + value));
  }

  // Multiply everything down: leaves trails behind moving pixels.
  fade(keep) {
    for (let i = 0; i < this.v.length; i++) this.v[i] *= keep;
  }
}

// Render a pixel buffer at (x0, y0), one character per pixel.
export function blit(d, px, x0, y0, ramp = RAMP, floor = 0.02) {
  const last = [...ramp].length - 1;
  const chars = [...ramp];
  for (let y = 0; y < px.h; y++) {
    for (let x = 0; x < px.w; x++) {
      const v = Math.max(0, Math.min(1, px.v[y * px.w + x]));
      if (v <= floor) continue;
      const ch = chars[Math.max(1, Math.round(v * last))];
      d.put(x0 + x, y0 + y, ch, 0.3 + 0.7 * v);
    }
  }
}

// Draw a multi-line ASCII sprite. Spaces are transparent; `keep` lists other
// characters to leave out (so a sprite can use them as explicit holes).
export function art(d, x0, y0, lines, a = 1, keep = '') {
  lines.forEach((line, y) => {
    [...line].forEach((ch, x) => {
      if (ch === ' ' || keep.includes(ch)) return;
      d.put(x0 + x, y0 + y, ch, a);
    });
  });
}

// Deterministic noise, so an animation looks the same every time it loops.
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
