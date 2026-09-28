// A character-cell display drawn as glowing dots on a canvas.
//
// Callers write characters into a grid (`put`, `text`, `center`) and call
// `render` once a frame. Each character is drawn through the 5x7 font as lit
// dots over a field of faintly visible unlit ones, like a vacuum-fluorescent
// panel. Lit dots fade out over a few frames instead of switching off at once,
// which gives moving things the slight smear of the real hardware.
//
// Part of the panel can be a finer grid (`fine`): the same font at half the
// dot pitch, so twice the characters each way. The tapes' animations draw
// there; text stays on the main grid, where it is easy to read.

import { CELL_W, CELL_H, glyph, normalise } from './font.js';

export class Grid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.chars = new Array(cols * rows).fill(' ');
    this.alpha = new Float32Array(cols * rows);
  }

  clear() {
    this.chars.fill(' ');
    this.alpha.fill(0);
  }

  put(x, y, ch, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows || !ch) return;
    const i = y * this.cols + x;
    if (ch === ' ') {
      this.chars[i] = ' ';
      this.alpha[i] = 0;
      return;
    }
    this.chars[i] = ch;
    this.alpha[i] = Math.max(0, Math.min(1, a));
  }

  text(x, y, str, a = 1) {
    const s = [...String(str)];
    for (let i = 0; i < s.length; i++) this.put(x + i, y, s[i], a);
  }

  // Draw text centred on row `y`. Text wider than the grid scrolls through
  // as a marquee, driven by `t` in seconds.
  center(y, str, a = 1, t = 0) {
    const s = [...String(str)];
    if (s.length <= this.cols) {
      this.text(Math.floor((this.cols - s.length) / 2), y, str, a);
      return;
    }
    this.marquee(y, str, a, t);
  }

  marquee(y, str, a = 1, t = 0, speed = 6) {
    const s = [...(String(str) + '   ·   ')];
    const off = Math.floor(t * speed) % s.length;
    for (let x = 0; x < this.cols; x++) this.put(x, y, s[(off + x) % s.length], a);
  }

  hline(y, ch = '─', a = 0.35, x0 = 0, x1 = this.cols - 1) {
    for (let x = x0; x <= x1; x++) this.put(x, y, ch, a);
  }
}

export class Display extends Grid {
  // `region` is where the fine grid sits, in main-grid cells.
  constructor(canvas, cols, rows, region) {
    super(cols, rows);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.region = region;
    this.fine = region ? new Grid(region.w * 2, region.h * 2) : null;
    this.tint = '#5ff5e6';
    this.bright = 1;
    this.fg = document.createElement('canvas');
    this.fgx = this.fg.getContext('2d');
    this.bg = document.createElement('canvas');
    this.sprites = new Map();
    this.lastRender = 0;
  }

  clear() {
    super.clear();
    if (this.fine) this.fine.clear();
  }

  setTint(hex) {
    if (hex === this.tint) return;
    this.tint = hex;
    this.sprites.clear();
    this.paintBackground();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.canvas.width && h === this.canvas.height && this.pitch) return;
    this.canvas.width = this.fg.width = this.bg.width = w;
    this.canvas.height = this.fg.height = this.bg.height = h;
    let pitch = Math.min(w / (this.cols * CELL_W), h / (this.rows * CELL_H));
    // Whole device pixels per dot keep the matrix crisp once there is room.
    if (pitch >= 3) pitch = Math.floor(pitch);
    this.pitch = pitch;
    this.ox = Math.round((w - pitch * this.cols * CELL_W) / 2);
    this.oy = Math.round((h - pitch * this.rows * CELL_H) / 2);
    this.sprites.clear();
    this.paintBackground();
  }

  inRegion(x, y) {
    const r = this.region;
    return r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }

  paintBackground() {
    if (!this.pitch) return;
    const c = this.bg.getContext('2d');
    const { width: w, height: h } = this.bg;
    c.clearRect(0, 0, w, h);
    const [r, g, b] = rgb(this.tint);
    const base = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    base.addColorStop(0, `rgb(${mix(r, 12, 0.94)}, ${mix(g, 16, 0.94)}, ${mix(b, 18, 0.94)})`);
    base.addColorStop(1, 'rgb(4, 6, 7)');
    c.fillStyle = base;
    c.fillRect(0, 0, w, h);
    // Every dot position, unlit: coarse on the main grid, fine in the region.
    c.fillStyle = `rgba(${r}, ${g}, ${b}, 0.075)`;
    const field = (x0, y0, cols, rows, p) => {
      const s = p * 0.74;
      for (let y = 0; y < rows * CELL_H; y++) {
        for (let x = 0; x < cols * CELL_W; x++) c.fillRect(x0 + x * p + (p - s) / 2, y0 + y * p + (p - s) / 2, s, s);
      }
    };
    const p = this.pitch;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (!this.inRegion(x, y)) field(this.ox + x * CELL_W * p, this.oy + y * CELL_H * p, 1, 1, p);
      }
    }
    if (this.fine) {
      const rg = this.region;
      field(this.ox + rg.x * CELL_W * p, this.oy + rg.y * CELL_H * p, this.fine.cols, this.fine.rows, p / 2);
    }
  }

  sprite(ch, p) {
    const key = `${p}|${ch}`;
    let sp = this.sprites.get(key);
    if (sp) return sp;
    const pad = Math.ceil(p * 2);
    sp = document.createElement('canvas');
    sp.width = Math.ceil(CELL_W * p + pad * 2);
    sp.height = Math.ceil(CELL_H * p + pad * 2);
    const c = sp.getContext('2d');
    const bits = glyph(ch);
    const [r, g, b] = rgb(this.tint);
    const s = p * 0.78;
    // Halo first, then the hot core of each dot on top.
    c.shadowColor = `rgba(${r}, ${g}, ${b}, 0.9)`;
    c.shadowBlur = p * 3;
    c.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;
    for (let i = 0; i < bits.length; i++) {
      if (!bits[i]) continue;
      c.fillRect(pad + (i % CELL_W) * p + (p - s) / 2, pad + ((i / CELL_W) | 0) * p + (p - s) / 2, s, s);
    }
    c.shadowBlur = 0;
    c.fillStyle = `rgb(${mix(r, 255, 0.35)}, ${mix(g, 255, 0.35)}, ${mix(b, 255, 0.35)})`;
    for (let i = 0; i < bits.length; i++) {
      if (!bits[i]) continue;
      c.fillRect(pad + (i % CELL_W) * p + (p - s) / 2, pad + ((i / CELL_W) | 0) * p + (p - s) / 2, s, s);
    }
    sp.pad = pad;
    this.sprites.set(key, sp);
    return sp;
  }

  drawGrid(grid, x0, y0, p) {
    const f = this.fgx;
    const cw = CELL_W * p;
    const chh = CELL_H * p;
    for (let y = 0; y < grid.rows; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const i = y * grid.cols + x;
        const a = grid.alpha[i];
        if (a <= 0.01) continue;
        const c = normalise(grid.chars[i]);
        if (c === ' ') continue;
        const sp = this.sprite(c, p);
        f.globalAlpha = a;
        f.drawImage(sp, x0 + x * cw - sp.pad, y0 + y * chh - sp.pad);
      }
    }
  }

  render(now = performance.now()) {
    if (!this.pitch) this.resize();
    const dt = Math.min(200, now - (this.lastRender || now));
    this.lastRender = now;
    const f = this.fgx;
    const { width: w, height: h } = this.fg;
    // Afterglow: what was lit last frame fades rather than vanishing.
    f.globalCompositeOperation = 'destination-out';
    f.globalAlpha = 1;
    f.fillStyle = `rgba(0, 0, 0, ${1 - Math.pow(0.3, dt / 33)})`;
    f.fillRect(0, 0, w, h);
    f.globalCompositeOperation = 'source-over';
    const p = this.pitch;
    if (this.fine) {
      const rg = this.region;
      this.drawGrid(this.fine, this.ox + rg.x * CELL_W * p, this.oy + rg.y * CELL_H * p, p / 2);
    }
    this.drawGrid(this, this.ox, this.oy, p);
    f.globalAlpha = 1;

    const m = this.ctx;
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
    m.drawImage(this.bg, 0, 0);
    m.globalCompositeOperation = 'lighter';
    // A barely-there flicker, as the filament supply wobbles.
    m.globalAlpha = this.bright * (0.965 + Math.random() * 0.035);
    m.drawImage(this.fg, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = 1;
  }
}

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}
