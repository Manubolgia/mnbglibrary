// Paper Games: a sheet of squared paper and a pencil. The pencil works the
// last few cells of a puzzle, the sheet is whisked away, and a fresh one
// slides in with a new puzzle number: Tectonic, then Binairo, then Sudoku.
// Every grid on the tape is a real, solved puzzle.

import { Pixels, blit, hash } from '../gfx.js';
import { paint, camera, project, box, cone, norm } from '../sdf.js';

const CYCLE = 9;
const N = 6;
const HALF = 0.6; // half the grid
const CELL = (2 * HALF) / N;
const FILLS = 12; // cells the pencil writes each loop
const FIRST = 1.1; // when it writes the first one
const EVERY = 0.46;
const SOLVED = FIRST + FILLS * EVERY;
const AXIS = norm(0.5, 1, 0.3); // the pencil leans back and to the right
const REST = [1.05, 0.35, 0.1];

// A Tectonic made by Paper Games: regions, answer, and the numbers it gives.
const T_REGION = [7, 6, 6, 0, 0, 0, 7, 6, 6, 3, 3, 0, 4, 6, 1, 3, 2, 8, 4, 4, 1, 3, 2, 8, 4, 4, 1, 3, 2, 8, 5, 5, 1, 1, 2, 2];
const T_VALUE = [2, 3, 2, 3, 2, 1, 1, 4, 1, 4, 5, 4, 3, 5, 2, 3, 2, 3, 2, 1, 4, 1, 5, 1, 4, 5, 3, 2, 4, 2, 1, 2, 1, 5, 1, 3];
const T_GIVEN = [3, 5, 6, 12, 23, 24, 27, 28, 34];
// A Binairo (1 is a full square) and the cells it gives.
const B_VALUE = [0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0];
const B_GIVEN = [0, 3, 14, 15, 20, 27, 29, 30, 34];
// A six by six Sudoku in boxes of two rows by three columns; its digits are
// relabelled every time it comes round.
const S_VALUE = [1, 2, 3, 4, 5, 6, 4, 5, 6, 1, 2, 3, 2, 3, 1, 5, 6, 4, 5, 6, 4, 2, 3, 1, 3, 1, 2, 6, 4, 5, 6, 4, 5, 3, 1, 2];
const S_GIVEN = [1, 4, 6, 11, 14, 16, 19, 21, 24, 29, 31, 34];

const GAMES = [
  { name: 'TECTONIC', group: (i) => T_REGION[i], symbol: (i) => String(T_VALUE[i]), given: T_GIVEN },
  { name: 'BINAIRO', group: () => 0, symbol: (i) => (B_VALUE[i] ? '■' : '□'), given: B_GIVEN },
  {
    name: 'SUDOKU',
    group: (i) => Math.floor(Math.floor(i / N) / 2) * 2 + Math.floor((i % N) / 3),
    symbol: (i, loop) => String(relabel(loop)[S_VALUE[i] - 1]),
    given: S_GIVEN,
  },
];

function relabel(loop) {
  const d = [1, 2, 3, 4, 5, 6];
  for (let i = 5; i > 0; i--) {
    const j = Math.floor(hash(loop * 11 + i) * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// The order the cells get filled in this loop: everything but the givens,
// shuffled, of which all but the last FILLS are already written.
function order(game, loop) {
  const open = [];
  for (let i = 0; i < N * N; i++) if (!game.given.includes(i)) open.push(i);
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(hash(loop * 7 + i * 0.37) * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  return open;
}

const centre = (i, ox) => [ox - HALF + ((i % N) + 0.5) * CELL, 0.001, -HALF + (Math.floor(i / N) + 0.5) * CELL];

export default function create() {
  const px = new Pixels(60, 20);
  const tip = [0, 0, 0];
  const sheet = { ox: 0, game: GAMES[0] };
  let lastLoop = -1;
  let fill = [];

  // Grid lines, thick where regions (or boxes) meet and round the edge.
  function line(u, v, across) {
    const k = Math.round(u);
    const dist = Math.abs(u - k) * CELL;
    if (dist > 0.03 || k < 0 || k > N || v < 0 || v > N) return 0;
    const r = Math.min(N - 1, Math.floor(v));
    const a = across ? r * N + k - 1 : (k - 1) * N + r;
    const b = across ? r * N + k : k * N + r;
    const thick = k === 0 || k === N || sheet.game.group(a) !== sheet.game.group(b);
    if (dist < (thick ? 0.026 : 0.009)) return thick ? 1 : 0.55;
    return 0;
  }

  const pencil = (x, y, z) => {
    const cone0 = cone(x, y, z, tip[0], tip[1], tip[2], tip[0] + AXIS[0] * 0.1, tip[1] + AXIS[1] * 0.1, tip[2] + AXIS[2] * 0.1, 0.004, 0.038);
    const body = cone(
      x,
      y,
      z,
      tip[0] + AXIS[0] * 0.1,
      tip[1] + AXIS[1] * 0.1,
      tip[2] + AXIS[2] * 0.1,
      tip[0] + AXIS[0] * 1.05,
      tip[1] + AXIS[1] * 1.05,
      tip[2] + AXIS[2] * 1.05,
      0.038,
      0.038,
    );
    return Math.min(cone0, body);
  };
  const paper = (x, y, z) => box(x - sheet.ox, y + 0.02, z, HALF + 0.08, 0.02, HALF + 0.08, 0.005);

  const scene = {
    bound: { x: 0, y: 0.35, z: 0, r: 1.6 },
    light: norm(-0.4, 1, 0.5),
    ambient: 0.06,
    map: (x, y, z) => Math.min(paper(x, y, z), pencil(x, y, z)),
    id: (x, y, z) => (pencil(x, y, z) < paper(x, y, z) ? 1 : 0),
    material(x, y, z) {
      if (pencil(x, y, z) < paper(x, y, z)) {
        // Graphite, the shaved wood, the painted body, the eraser.
        const along = (x - tip[0]) * AXIS[0] + (y - tip[1]) * AXIS[1] + (z - tip[2]) * AXIS[2];
        if (along < 0.035) return { c: 0.2, s: 1.2 };
        if (along < 0.1) return { c: 0.55, s: 0.1 };
        if (along > 0.95) return { c: 0.4, s: 0 };
        return { c: 0.85, s: 0.6 };
      }
      if (y < -0.004) return { c: 0.25, s: 0 };
      const u = (x - sheet.ox + HALF) / CELL;
      const v = (z + HALF) / CELL;
      const ink = Math.max(line(u, v, true), line(v, u, false));
      return ink ? { c: 0.2, s: 0, e: 0.45 * ink } : { c: 0.22, s: 0.05 };
    },
  };

  return (f, bx, t, dt, big) => {
    const loop = Math.floor(t / CYCLE);
    const s = t % CYCLE;
    const game = GAMES[loop % GAMES.length];
    if (loop !== lastLoop) {
      lastLoop = loop;
      fill = order(game, loop);
    }
    sheet.game = game;

    // In from the right, out to the left.
    sheet.ox = s < 0.6 ? Math.pow(1 - s / 0.6, 2) * 3 : s > CYCLE - 0.6 ? -Math.pow((s - CYCLE + 0.6) / 0.6, 2) * 3 : 0;

    // The pencil: hop to the next cell, write, hop on.
    const pre = fill.length - FILLS;
    const k = Math.floor((s - FIRST) / EVERY) + 1; // cells written so far, of FILLS
    const at = (n) => (n < 0 || n >= FILLS ? REST : centre(fill[pre + n], sheet.ox));
    const next = Math.max(0, Math.min(FILLS, k));
    const from = at(next - 1);
    const to = at(next < FILLS ? next : FILLS);
    const phase = s < FIRST - EVERY ? 0 : ((s - FIRST) / EVERY + 1) % 1; // 0..1 towards the next write
    const hop = Math.min(1, phase / 0.65);
    const ease = hop * hop * (3 - 2 * hop);
    for (let a = 0; a < 3; a++) tip[a] = from[a] + (to[a] - from[a]) * ease;
    const writing = next < FILLS && phase > 0.65;
    tip[1] += writing ? 0.004 : 0.02 + Math.sin(hop * Math.PI) * 0.14;
    if (writing) {
      const w = (phase - 0.65) * 40;
      tip[0] += Math.cos(w) * 0.02;
      tip[2] += Math.sin(w) * 0.015;
    }
    if (s < FIRST - EVERY || s > SOLVED) for (let a = 0; a < 3; a++) tip[a] = REST[a];

    const sway = Math.sin(t * 0.23) * 0.12;
    const cam = camera(Math.sin(sway) * 1.55, 1.05, Math.cos(sway) * 1.55 + 0.05, 0, -0.02, 0.05, 40);
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // The numbers on the sheet, except where the pencil is in the way.
    const shown = [...game.given.map((i) => [i, 1]), ...fill.slice(0, pre + Math.max(0, Math.min(FILLS, k))).map((i) => [i, 0.7])];
    for (const [i, a] of shown) {
      const [x, y, z] = centre(i, sheet.ox);
      const p = project(cam, px.w, px.h, x, y, z);
      if (!p) continue;
      const cx = Math.round(p.x);
      const cy = Math.round(p.y);
      if (cx < 0 || cy < 0 || cx >= px.w || cy >= px.h) continue;
      if (px.id && px.id[cy * px.w + cx] === 1) continue;
      f.put(bx.x + cx, bx.y + cy, game.symbol(i, loop), a);
    }

    big.text(0, 0, game.name, 0.8);
    const no = `NO ${String(100000 + Math.floor(hash(loop * 3.7 + 1) * 899999))}`;
    big.text(30 - no.length, 0, no, 0.6);
    const secs = Math.floor(Math.min(s, SOLVED) * 7 + hash(loop) * 40);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (s > SOLVED && s < CYCLE - 0.6) {
      if (Math.floor((s - SOLVED) * 3) % 2 === 0) big.text(0, 9, 'SOLVED', 1);
      big.text(30 - time.length, 9, time, 0.8);
    } else if (s < 0.9) {
      big.text(0, 9, 'NEW PUZZLE', 0.8);
    } else {
      big.text(30 - time.length, 9, time, 0.6);
    }
  };
}
