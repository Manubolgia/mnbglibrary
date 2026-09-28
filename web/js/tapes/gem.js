// Gem Duel: a cut gem turning in the light, with tokens orbiting it and
// the two players racing to twenty.
//
// The gem is actual 3D: every character cell is a pixel, shaded from the
// facet under it, and the brightness picks the symbol from the ramp.

import { Pixels, blit, hash } from '../gfx.js';

const W = 36;
const H = 20;
const FACETS = 8;
const TABLE_Y = -40;
const GIRDLE_Y = -16;
const CULET_Y = 40;
const TABLE_R = 26;
const GIRDLE_R = 52;
const CROWN = (40 * Math.PI) / 180;
const PAVILION = (42 * Math.PI) / 180;
const LIGHT = norm([-0.45, 0.65, 0.62]);
const TOKENS = ['◆', '●', '◇', '○', '■'];

function norm(v) {
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
}

function radius(Y) {
  if (Y < TABLE_Y || Y > CULET_Y) return 0;
  if (Y < GIRDLE_Y) return TABLE_R + ((Y - TABLE_Y) / (GIRDLE_Y - TABLE_Y)) * (GIRDLE_R - TABLE_R);
  return GIRDLE_R * (1 - (Y - GIRDLE_Y) / (CULET_Y - GIRDLE_Y));
}

export default function create() {
  const px = new Pixels(W, H);
  const score = [0, 0];
  let tick = 0;

  function shade(rot) {
    px.clear();
    const step = (Math.PI * 2) / FACETS;
    for (let j = 0; j < H; j++) {
      // Sample in dot units: fine cells are 3 dots wide and 4 tall.
      const Y = (j - H / 2 + 0.5) * 4;
      const r = radius(Y);
      if (!r) continue;
      const upper = Y < (TABLE_Y + GIRDLE_Y) / 2;
      for (let i = 0; i < W; i++) {
        const X = (i - W / 2 + 0.5) * 3;
        if (Math.abs(X) > r) continue;
        const theta = Math.asin(X / r);
        // Upper crown facets sit half a facet round from the lower ones.
        const off = upper ? step / 2 : 0;
        const phi = theta + rot + off;
        const k = Math.round(phi / step);
        const edge = Math.abs(phi / step - k) > 0.4;
        const facing = k * step - rot - off;
        const tilt = Y < GIRDLE_Y ? CROWN : -PAVILION;
        // The pavilion is lit from inside, by light the crown let in and the
        // lower facets bounce back up: shade it as if its normals faced up.
        const up = Math.abs(Math.sin(tilt));
        const n = [Math.sin(facing) * Math.cos(tilt), up, Math.cos(facing) * Math.cos(tilt)];
        const dot = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
        const diffuse = Math.max(0, dot);
        // Reflection of the light straight back at the viewer.
        const rz = 2 * dot * n[2] - LIGHT[2];
        const spec = Math.pow(Math.max(0, rz), 12);
        // Fire: neighbouring facets flash in turn as the stone turns.
        const fire = 0.35 * Math.pow(0.5 + 0.5 * Math.sin(k * 2.3 + (upper ? 1 : 0) + rot * 2.5), 3);
        let v = 0.08 + 0.7 * Math.pow(diffuse, 1.5) + 0.8 * spec + fire;
        if (edge) v *= 0.3;
        px.set(i, j, Math.min(1, v));
      }
    }
  }

  return (d, box, t, dt, big) => {
    const { x, y } = box;
    const cx = x + 30;
    const cy = y + 10;
    const rot = t * 0.9;

    const orbit = TOKENS.map((ch, i) => {
      const a = t * 1.1 + (i * Math.PI * 2) / TOKENS.length;
      return { ch, x: cx + Math.cos(a) * 26, y: cy + Math.sin(a) * 6.5, z: Math.sin(a) };
    });
    for (const o of orbit) if (o.z < 0) d.put(o.x, o.y, o.ch, 0.35);

    shade(rot);
    blit(d, px, cx - W / 2, y);
    // Glints where the light catches.
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        if (px.get(i, j) > 0.92 && hash(i * 13 + j * 7 + Math.floor(t * 8)) > 0.6) d.put(cx - W / 2 + i, y + j, '*', 1);
      }
    }

    for (const o of orbit) if (o.z >= 0) d.put(o.x, o.y, o.ch, 0.9);

    // The race to twenty prestige.
    tick += dt;
    if (tick > 1.3) {
      tick = 0;
      const who = hash(Math.floor(t * 10)) > 0.5 ? 1 : 0;
      score[who] += 1 + Math.floor(hash(t) * 4);
      if (score[who] >= 20) score[0] = score[1] = 0;
    }
    big.text(0, 0, 'P1', 0.5);
    big.text(0, 1, String(score[0]).padStart(2, '0'), 1);
    big.text(28, 0, 'P2', 0.5);
    big.text(28, 1, String(score[1]).padStart(2, '0'), 1);
    big.text(0, 9, '★', 0.6);
    big.text(29, 9, '★', 0.6);
  };
}
