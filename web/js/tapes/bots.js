// Kilowatt: a cartoon robot fight. A disc spinner and a wedge flipper square
// up in the arena. Three, two, one, fight: they charge, meet in a burst of
// sparks, and one of them goes flying, tumbles, lands on its back and is
// counted out. Next bout, the other one gets its revenge.

import { art, hash } from '../gfx.js';

const LOOP = 8;
const FLOOR = 16; // the arena floor, as a row of the fine grid
const HIT = 2.2; // when they meet
const LAND = 3.25; // when the loser comes down

// Both robots drawn facing each other: the spinner looks right, the flipper
// left. Bodies are solid and dim; eyes, wheels and weapons are lit.
const SPINNER = {
  body: [
    '      ●       ',
    '      │       ',
    '▄████████████▄',
    '██████████████',
    '██████████████═══',
    '▀████████████▀',
  ],
  eyes: [[3, 3], [10, 3]],
  wheels: [[2, 6], [11, 6]],
  disc: [19, 4],
  w: 14,
};
const FLIPPER = {
  body: [
    '              ●     ',
    '              │     ',
    '         ▄█████████▄',
    '     ▄▄█████████████',
    '  ▄▄████████████████',
    '▄██████████████████▀',
  ],
  eyes: [[9, 3], [14, 3]],
  wheels: [[5, 6], [16, 6]],
  w: 20,
};

// Upside down: rows reversed, half blocks and slopes mirrored, no antenna.
const TURN = { '▀': '▄', '▄': '▀', '/': '\\', '\\': '/' };
const upside = (rows) => rows.slice(2).reverse().map((r) => [...r].map((c) => TURN[c] ?? c).join(''));

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (s, a, b) => ease((s - a) / (b - a));

// One robot at (x, y): y is the row its wheels sit on. Upside down it lies
// on its top with the wheels in the air, spinning.
function robot(f, bx, def, x, y, flipped, spin, lit) {
  const rows = flipped ? upside(def.body) : def.body;
  const top = flipped ? y - 3 : y - 6;
  art(f, bx.x + x, bx.y + top, rows, 0.45 * lit);
  for (const [ex, ey] of def.eyes) f.put(bx.x + x + ex, bx.y + top + (flipped ? 5 - ey : ey), flipped ? 'X' : '■', lit);
  const wheel = Math.floor(spin * 2) % 2 ? '○' : '●';
  for (const [wx] of def.wheels) f.put(bx.x + x + wx, bx.y + (flipped ? y - 4 : y), wheel, lit);
  if (!flipped) f.put(bx.x + x + def.body[0].indexOf('●'), bx.y + top, '●', Math.floor(spin * 0.4) % 2 ? lit : 0.35 * lit);
}

// The spinner's disc, seen side on: a hub and four teeth that alternate
// between + and x as it turns. Stopped, it is just a ring.
function disc(f, bx, cx, cy, turn, running) {
  f.put(bx.x + cx, bx.y + cy, 'O', 1);
  if (!running) {
    for (const [dx, dy] of [[-2, -1], [2, -1], [-2, 1], [2, 1], [0, -2], [0, 2]]) f.put(bx.x + cx + dx, bx.y + cy + dy, '·', 0.7);
    return;
  }
  const plus = Math.floor(turn) % 2 === 0;
  const teeth = plus
    ? [[0, -1, '│'], [0, -2, '│'], [0, 1, '│'], [0, 2, '│'], [-1, 0, '─'], [-2, 0, '─'], [-3, 0, '─'], [1, 0, '─'], [2, 0, '─'], [3, 0, '─']]
    : [[-1, -1, '\\'], [-2, -2, '\\'], [1, 1, '\\'], [2, 2, '\\'], [1, -1, '/'], [2, -2, '/'], [-1, 1, '/'], [-2, 2, '/']];
  for (const [dx, dy, ch] of teeth) f.put(bx.x + cx + dx, bx.y + cy + dy, ch, 0.95);
}

export default function create() {
  let spinTurn = 0;
  let wheelTurn = 0;

  return (f, bx, t, dt, big) => {
    const n = Math.floor(t / LOOP);
    const s = t % LOOP;
    // even bouts the spinner wins, odd bouts the flipper
    const spinnerWins = n % 2 === 0;

    // a little shake when they meet
    const shake = s > HIT && s < HIT + 0.3 ? (Math.floor(s * 40) % 2 ? 1 : -1) : 0;
    const ox = bx.x + shake;
    const box = { x: ox, y: bx.y };

    // the arena: walls, floor, and hazard stripes along the edge
    for (let y = 8; y <= FLOOR; y++) {
      f.put(bx.x, bx.y + y, '█', 0.35);
      f.put(bx.x + 59, bx.y + y, '█', 0.35);
    }
    for (let x = 1; x < 59; x++) {
      f.put(bx.x + x, bx.y + FLOOR, '▀', 0.5);
      if (x < 9 || x > 50) f.put(bx.x + x, bx.y + FLOOR + 1, (x + Math.floor(t * 4)) % 3 ? ' ' : '/', 0.35);
    }

    // the spinner spins up during the count, and stops when it is thrown
    const spinning = spinnerWins || s < HIT + 0.15;
    const rate = spinning ? 3 + 30 * seg(s, 0.3, 1.6) : 0;
    spinTurn += dt * rate;
    wheelTurn += dt * 10;

    // the charge
    const go = seg(s, 1.6, HIT);
    let sx = 3 + 9 * go;
    let fx = 36 - 5 * go;
    let sy = FLOOR - 1;
    let fy = FLOOR - 1;
    let sFlip = false;
    let fFlip = false;
    const air = s - HIT - 0.12;
    const tumble = (k) => Math.floor(k * 9) % 2 === 1;
    if (spinnerWins) {
      // the disc bites: the flipper goes up and over
      sx -= 4 * seg(s, HIT, HIT + 0.4);
      if (air > 0) {
        const k = Math.min(1, air / (LAND - HIT - 0.12));
        fx += 7 * k;
        fy -= Math.round(Math.sin(k * Math.PI) * 6);
        fFlip = k < 1 ? tumble(k) : true;
      }
    } else {
      // the flipper gets under and fires
      fx -= 2 * seg(s, HIT + 0.1, HIT + 0.5);
      if (air > 0) {
        const k = Math.min(1, air / (LAND - HIT - 0.12));
        sx -= 9 * k;
        sy -= Math.round(Math.sin(k * Math.PI) * 6);
        sFlip = k < 1 ? tumble(k) : true;
      }
    }
    sx = Math.round(sx);
    fx = Math.round(fx);

    // speed lines behind them as they charge
    if (s > 1.6 && s < HIT) {
      for (let i = 2; i < 7; i++) {
        f.put(ox + sx - i, bx.y + FLOOR - 3, '─', 0.6 - i * 0.08);
        f.put(ox + fx + FLIPPER.w + i - 1, bx.y + FLOOR - 3, '─', 0.6 - i * 0.08);
      }
    }

    // the hit: a starburst and a shower of sparks
    const cx = spinnerWins ? 12 + SPINNER.disc[0] + 2 : 31 + 2;
    const cy = FLOOR - 3;
    const age = s - HIT;
    if (age > 0 && age < 1) {
      for (let i = 0; i < (spinnerWins ? 14 : 6); i++) {
        const a = hash(i + n * 17) * Math.PI - Math.PI;
        const v = 8 + hash(i * 3 + 1) * 16;
        const x = cx + Math.cos(a) * v * age * 1.6;
        const y = cy + Math.sin(a) * v * age * 0.7 + age * age * 14;
        if (y > FLOOR - 1) continue;
        f.put(ox + Math.round(x), bx.y + Math.round(y), age < 0.3 ? '*' : i % 2 ? '+' : '·', 1 - age);
      }
    }

    const winnerHop = s > 5.4 && Math.floor(s * 3.3) % 2 === 0 ? -1 : 0;
    robot(f, box, SPINNER, sx, sy + (spinnerWins ? winnerHop : 0), sFlip, wheelTurn, spinnerWins || s < LAND ? 1 : 0.6);
    robot(f, box, FLIPPER, fx, fy + (spinnerWins ? 0 : winnerHop), fFlip, wheelTurn, !spinnerWins || s < LAND ? 1 : 0.6);
    if (!sFlip) disc(f, box, sx + SPINNER.disc[0], sy + (spinnerWins ? winnerHop : 0) - 6 + SPINNER.disc[1], spinTurn, spinning);

    // streaks under whoever is going up
    if (air > 0 && air < 0.45) {
      const [lx, ly, def] = spinnerWins ? [fx, fy, FLIPPER] : [sx, sy, SPINNER];
      for (const [wx] of def.wheels) {
        for (let k = 1; k < 4 && ly + k < FLOOR; k++) f.put(ox + lx + wx, bx.y + ly + k, '│', 0.7 - k * 0.15);
      }
    }

    // the flipper's arm kicks up as it fires
    if (!spinnerWins && s > HIT && s < HIT + 0.5) {
      for (let i = 0; i < 6; i++) f.put(ox + fx + 6 - i, bx.y + fy - 3 - i, '\\', 1);
    }

    // the disc's bite flashes a starburst over everything
    if (spinnerWins && age > 0 && age < 0.25) {
      const burst = [[0, 0, '*'], [-1, -1, '\\'], [1, 1, '\\'], [1, -1, '/'], [-1, 1, '/'], [0, -1, '│'], [0, 1, '│'], [-2, 0, '─'], [-1, 0, '─'], [1, 0, '─'], [2, 0, '─'], [-2, -2, '\\'], [2, 2, '\\'], [2, -2, '/'], [-2, 2, '/'], [0, -2, '│'], [0, 2, '│'], [-3, 0, '─'], [3, 0, '─']];
      for (const [dx, dy, ch] of burst) f.put(ox + cx + dx, bx.y + cy + dy, ch, 1);
    }

    // dust where the loser lands
    const dust = s - LAND;
    if (dust > 0 && dust < 0.8) {
      const lx = spinnerWins ? fx + 10 : sx + 7;
      for (let i = 1; i < 6; i++) {
        f.put(ox + lx - 4 - i - Math.round(dust * 6), bx.y + FLOOR - 1, i % 2 ? '·' : '.', 0.9 - dust);
        f.put(ox + lx + 4 + i + Math.round(dust * 6), bx.y + FLOOR - 1, i % 2 ? '·' : '.', 0.9 - dust);
      }
    }

    // health: the loser's bar drops at the hit and empties on the knockout
    let lose = 8;
    if (s > HIT) lose = spinnerWins ? 3 : 5;
    if (s > 5.3) lose = 0;
    const hp = spinnerWins ? [8, lose] : [lose, 8];
    const bar = (v) => '█'.repeat(v) + '░'.repeat(8 - v);
    big.text(1, 0, bar(hp[0]), 0.9);
    big.text(13, 0, 'VS', 0.6);
    big.text(21, 0, [...bar(hp[1])].reverse().join(''), 0.9);

    // the call
    let cap = '';
    if (s < 0.5) cap = '3';
    else if (s < 1.0) cap = '2';
    else if (s < 1.5) cap = '1';
    else if (s < 2.1) cap = 'FIGHT!';
    else if (s < 3.2) cap = spinnerWins ? 'BIG HIT!' : 'FLIPPED!';
    else if (s < 3.6) cap = 'ON ITS BACK!';
    else if (s < 5.3) cap = `COUNT ${3 - Math.min(2, Math.floor((s - 3.6) / 0.57))}`;
    else if (s < 6.5) cap = Math.floor(s * 4) % 4 ? 'KNOCKOUT!' : '';
    else if (s < 7.9) cap = spinnerWins ? 'SPINNER WINS' : 'FLIPPER WINS';
    if (cap) big.center(9, cap, 1);
  };
}
