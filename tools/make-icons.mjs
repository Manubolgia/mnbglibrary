#!/usr/bin/env node
// Draw the app icon: a little dot-matrix screen reading MNBG over a play
// arrow, lit in the deck's default colour. Uses the app's own font, writes
// PNGs with nothing but node's zlib, plus an SVG of the same design.
//
//   node tools/make-icons.mjs

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { glyph, CELL_W, CELL_H } from '../web/js/font.js';

const OUT = fileURLToPath(new URL('../web/icons/', import.meta.url));
const GRID = 27;
const TINT = [0x5f, 0xf5, 0xe6];
const CORE = TINT.map((c) => Math.round(c + (255 - c) * 0.6));

// Which dots are lit, on a GRID x GRID matrix.
function pattern() {
  const lit = new Set();
  const on = (x, y) => lit.add(`${x},${y}`);
  const word = 'MNBG';
  const width = word.length * CELL_W - 1;
  const x0 = Math.floor((GRID - width) / 2);
  [...word].forEach((ch, i) => {
    const bits = glyph(ch);
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) if (bits[y * CELL_W + x]) on(x0 + i * CELL_W + x, 3 + y);
    }
  });
  // The play arrow.
  for (let r = 0; r <= 10; r++) {
    const w = (r <= 5 ? r : 10 - r) * 2 + 1;
    for (let c = 0; c < w; c++) on(9 + c, 13 + r);
  }
  return lit;
}

function render(size, { maskable = false } = {}) {
  const lit = pattern();
  const px = new Float32Array(size * size * 3);
  const inset = size * (maskable ? 0.2 : 0.12);
  const screen = { x: inset, y: inset, w: size - inset * 2, h: size - inset * 2, r: size * 0.07 };
  const pad = screen.w * 0.06;
  const pitch = (screen.w - pad * 2) / GRID;
  const ox = screen.x + pad;
  const oy = screen.y + pad;
  const dot = pitch * 0.74;
  const sigma = pitch * 0.9;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      // The plastic body.
      const shade = 1 - (y / size) * 0.45;
      let col = [29 * shade, 30 * shade, 33 * shade];
      const inScreen = roundRect(x + 0.5, y + 0.5, screen);
      if (inScreen > 0) {
        col = mixc(col, [5, 7, 8], inScreen);
        const gx = (x + 0.5 - ox) / pitch;
        const gy = (y + 0.5 - oy) / pitch;
        const ci = Math.floor(gx);
        const cj = Math.floor(gy);
        let glow = 0;
        for (let dj = -3; dj <= 3; dj++) {
          for (let di = -3; di <= 3; di++) {
            const a = ci + di;
            const b = cj + dj;
            if (a < 0 || b < 0 || a >= GRID || b >= GRID || !lit.has(`${a},${b}`)) continue;
            const dx = x + 0.5 - (ox + (a + 0.5) * pitch);
            const dy = y + 0.5 - (oy + (b + 0.5) * pitch);
            glow += Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          }
        }
        if (ci >= 0 && cj >= 0 && ci < GRID && cj < GRID) {
          const dx = Math.abs(x + 0.5 - (ox + (ci + 0.5) * pitch));
          const dy = Math.abs(y + 0.5 - (oy + (cj + 0.5) * pitch));
          const edge = Math.min(1, Math.max(0, dot / 2 - Math.max(dx, dy) + 0.5));
          if (lit.has(`${ci},${cj}`)) col = mixc(col, CORE, edge);
          else col = mixc(col, TINT, edge * 0.1 * inScreen);
        }
        col = col.map((c, k) => c + TINT[k] * Math.min(0.6, glow * 0.22) * inScreen);
      }
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
    }
  }
  return png(size, px);
}

function roundRect(x, y, { x: rx, y: ry, w, h, r }) {
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  const d = Math.hypot(x - cx, y - cy) - r;
  return Math.max(0, Math.min(1, 0.5 - d));
}

function mixc(a, b, t) {
  return a.map((c, k) => c + (b[k] - c) * t);
}

function png(size, px) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size * 3; x++) {
      raw[y * (size * 3 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(px[y * size * 3 + x])));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let c = 0xffffffff;
  for (const b of body) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function svg() {
  const lit = pattern();
  const size = 512;
  const inset = size * 0.12;
  const sw = size - inset * 2;
  const pad = sw * 0.06;
  const pitch = (sw - pad * 2) / GRID;
  const dot = pitch * 0.74;
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const rects = [];
  for (let b = 0; b < GRID; b++) {
    for (let a = 0; a < GRID; a++) {
      if (!lit.has(`${a},${b}`)) continue;
      const x = inset + pad + a * pitch + (pitch - dot) / 2;
      const y = inset + pad + b * pitch + (pitch - dot) / 2;
      rects.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dot.toFixed(1)}" height="${dot.toFixed(1)}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1e21"/><stop offset="1" stop-color="#101113"/></linearGradient>
<filter id="g" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${(pitch * 0.8).toFixed(1)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#b)"/>
<rect x="${inset}" y="${inset}" width="${sw}" height="${sw}" rx="${size * 0.07}" fill="#050708"/>
<g fill="${hex(CORE)}" filter="url(#g)">${rects.join('')}</g>
</svg>
`;
}

writeFileSync(OUT + 'icon.svg', svg());
for (const size of [32, 180, 192, 512]) writeFileSync(`${OUT}icon-${size}.png`, render(size));
writeFileSync(OUT + 'icon-maskable-512.png', render(512, { maskable: true }));
console.log('icons written to web/icons/');
