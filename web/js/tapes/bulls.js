// Sixth Card: a 3D bull watches cards land in a row, one by one. The sixth
// card takes the row: the cards scatter and the bull charges the screen.

import { Pixels, blit, hash } from '../gfx.js';
import { paint, camera, project, ellipsoid, sphere, cone, torus, box, smin, smax, rot } from '../sdf.js';

const CYCLE = 8;
const LAND = (k) => 0.8 + k * 0.75; // when card k lands
const EVENT = LAND(5) + 0.25;
const SLOT = (k) => [0.25 + k * 0.4, -0.3, 0];
const heads = (n) => (n === 55 ? 7 : n % 11 === 0 ? 5 : n % 10 === 0 ? 3 : n % 5 === 0 ? 2 : 1);

export default function create() {
  const px = new Pixels(60, 20);
  const cam = camera(0.3, 0.2, 2.6, 0.3, 0.05, 0, 40);

  // Per-frame state, set before rendering and read by map().
  const head = { x: -0.95, y: 0.05, z: 0, c: 1, s: 0, pc: 1, ps: 0 };
  const cards = Array.from({ length: 6 }, () => ({ on: false, x: 0, y: 0, z: 0, c: 1, s: 0, tc: 1, ts: 0 }));
  // The head-space point of the last bull() call, for material().
  const local = { x: 0, y: 0, z: 0 };

  function bull(x, y, z) {
    x -= head.x;
    y -= head.y;
    z -= head.z;
    // Cheap early out: far from the head, the distance to its bounds will do.
    const far = Math.sqrt(x * x + y * y + z * z) - 1.35;
    if (far > 0.2) return far;
    let r = rot(x, z, head.c, head.s);
    x = r[0];
    z = r[1];
    r = rot(y, z, head.pc, head.ps);
    y = r[0];
    z = r[1];
    local.x = x;
    local.y = y;
    local.z = z;
    const ax = Math.abs(x);
    let d = ellipsoid(x, y - 0.12, z, 0.5, 0.48, 0.46);
    d = smin(d, ellipsoid(x, y + 0.36, z - 0.3, 0.34, 0.26, 0.3), 0.25);
    // Brow ridge between the horns.
    d = smin(d, ellipsoid(x, y - 0.46, z - 0.08, 0.26, 0.12, 0.2), 0.12);
    // Nostrils.
    d = smax(d, -sphere(ax - 0.12, y + 0.4, z - 0.58, 0.065), 0.03);
    // Ears.
    d = smin(d, ellipsoid(ax - 0.6, y - 0.1, z + 0.02, 0.24, 0.07, 0.13), 0.08);
    const horn = smin(
      cone(ax, y, z, 0.34, 0.38, 0, 0.76, 0.48, 0.04, 0.13, 0.08),
      cone(ax, y, z, 0.76, 0.48, 0.04, 0.84, 0.86, 0.18, 0.08, 0.02),
      0.06,
    );
    const eye = sphere(ax - 0.29, y - 0.07, z - 0.34, 0.08);
    const ring = torus(x, z - 0.52, y + 0.56, 0.11, 0.022);
    return Math.min(smin(d, horn, 0.05), eye, ring);
  }

  function card(x, y, z, k) {
    const c = cards[k];
    x -= c.x;
    y -= c.y;
    z -= c.z;
    const b = Math.sqrt(x * x + y * y + z * z);
    if (b > 0.5) return b - 0.35;
    let r = rot(x, z, c.c, c.s);
    x = r[0];
    z = r[1];
    r = rot(y, z, c.tc, c.ts);
    y = r[0];
    z = r[1];
    return box(x, y, z, 0.17, 0.24, 0.012, 0.01);
  }

  function cardsDist(x, y, z) {
    let d = Infinity;
    for (let k = 0; k < 6; k++) if (cards[k].on) d = Math.min(d, card(x, y, z, k));
    return d;
  }

  const scene = {
    bound: { x: 0.2, y: 0.2, z: 0.4, r: 3.1 },
    light: [-0.35, 0.6, 0.72],
    map: (x, y, z) => Math.min(bull(x, y, z), cardsDist(x, y, z)),
    material(x, y, z) {
      if (cardsDist(x, y, z) < bull(x, y, z)) return { c: 1, s: 0.3 };
      const { x: lx, y: ly, z: lz } = local;
      const ax = Math.abs(lx);
      if (ly > 0.3 && ax > 0.33) return { c: 1, s: 0.8 }; // horns
      if (Math.abs(ly + 0.07) < 0.1 && Math.abs(ax - 0.29) < 0.1 && lz > 0.25) return { c: 0.04, s: 1.6 }; // eyes
      if (ly < -0.47 && lz > 0.4) return { c: 0.8, s: 1.4 }; // nose ring
      return { c: 0.6, s: 0.12 };
    },
  };

  return (f, bx, t, dt, big) => {
    const cycle = Math.floor(t / CYCLE);
    const s = t % CYCLE;
    const numbers = [];
    let n = 3 + Math.floor(hash(cycle * 7.1) * 20);
    for (let k = 0; k < 6; k++) {
      numbers.push(n);
      n += 1 + Math.floor(hash(cycle * 13.7 + k) * 12);
    }

    // The bull: looks about, breathes, and charges when the row is taken.
    const since = s - EVENT;
    const charge = since > 0 ? (since < 0.3 ? since / 0.3 : Math.max(0, 1 - (since - 0.3) / 1.2)) : 0;
    const shake = since > 0 && since < 0.6 ? Math.sin(since * 70) * 0.08 : 0;
    const yaw = 0.18 + Math.sin(t * 0.7) * 0.22 * (1 - charge) - charge * 0.18 + shake;
    const nod = Math.sin(t * 2.1) * 0.04 + charge * 0.25;
    head.x = -0.95 + charge * 1.0;
    head.y = 0.05 + Math.sin(t * 2.1) * 0.02;
    head.z = charge * 1.1;
    head.c = Math.cos(yaw);
    head.s = Math.sin(yaw);
    head.pc = Math.cos(nod);
    head.ps = Math.sin(nod);

    // The cards: fly in spinning, land in their slot, scatter on the sixth.
    cards.forEach((c, k) => {
      const land = LAND(k);
      c.on = s > land - 0.6;
      if (!c.on) return;
      const [sx, sy, sz] = SLOT(k);
      if (since > 0) {
        const f = since;
        const dir = k - 2.5;
        c.x = sx + dir * f * 1.2;
        c.y = sy + f * 2.2 - f * f * 3.5;
        c.z = sz + f * 1.5;
        c.c = Math.cos(f * 9 + k);
        c.s = Math.sin(f * 9 + k);
        c.tc = Math.cos(f * 7);
        c.ts = Math.sin(f * 7);
        if (f > 1.6) c.on = false;
        return;
      }
      const f = Math.min(1, (s - (land - 0.6)) / 0.6);
      const e = 1 - Math.pow(1 - f, 3);
      c.x = 2.9 + (sx - 2.9) * e;
      c.y = 1.5 + (sy - 1.5) * e;
      c.z = 0.9 + (sz - 0.9) * e;
      const spin = (1 - e) * Math.PI * 3;
      c.c = Math.cos(spin);
      c.s = Math.sin(spin);
      c.tc = Math.cos((1 - e) * 1.2);
      c.ts = Math.sin((1 - e) * 1.2);
    });

    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // Numbers on the cards that have landed.
    if (since <= 0) {
      cards.forEach((c, k) => {
        if (!c.on || s < LAND(k)) return;
        const p = project(cam, px.w, px.h, c.x, c.y + 0.04, c.z + 0.02);
        const label = String(numbers[k]);
        if (p) big.text(Math.round(p.x / 2 - (label.length - 1) / 2), Math.round(p.y / 2), label, 1);
      });
    }

    // Steam from the nostrils: a snort every couple of seconds, a blast on the charge.
    const snort = (t % 2.4) / 0.8;
    const blast = since > 0 && since < 1.2;
    if (snort < 1 || blast) {
      const age = blast ? (since * 1.5) % 1 : snort;
      for (const side of [-1, 1]) {
        const lx = side * 0.12;
        const wx = head.x + lx * head.c + 0.6 * head.s;
        const wz = head.z - lx * head.s + 0.6 * head.c;
        const p = project(cam, px.w, px.h, wx, head.y - 0.42, wz);
        if (!p) continue;
        for (let i = 0; i < (blast ? 3 : 2); i++) {
          const a = Math.min(1, age + i * 0.15);
          f.put(bx.x + p.x + side * (2 + a * 6), bx.y + p.y + 2 + a * 3, a < 0.5 ? '°' : '.', 1 - a);
        }
      }
    }

    if (since > 0 && since < 2.2) {
      const points = numbers.slice(0, 5).reduce((sum, v) => sum + heads(v), 0);
      if (Math.floor(since * 5) % 2 === 0 || since > 0.8) {
        big.center(0, 'ROW TAKEN!', 1);
        big.center(9, `+${points} ▼`, 1);
      }
    } else {
      const filled = cards.filter((c, k) => s >= LAND(k)).length;
      big.text(24, 0, '▮'.repeat(filled) + '▯'.repeat(6 - filled), 0.6);
    }
  };
}
