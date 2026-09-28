// MAINLINE: a model railway on a turntable. A train runs the loop, a car
// crosses over it on the flyover, and every few seconds the dice are thrown.

import { Pixels, blit, hash } from '../gfx.js';
import { paint, camera, box, cylinder, sphere, rot, norm } from '../sdf.js';

const LH = 1.1; // half length of the straights
const RAD = 0.7; // radius of the bends
const LOOP = 4 * LH + 2 * Math.PI * RAD;
const ROLL = 4;

// Position and heading at distance s along the loop.
function along(s) {
  s = ((s % LOOP) + LOOP) % LOOP;
  const arc = Math.PI * RAD;
  if (s < 2 * LH) return [-LH + s, -RAD, 0];
  s -= 2 * LH;
  if (s < arc) {
    const a = -Math.PI / 2 + s / RAD;
    return [LH + Math.cos(a) * RAD, Math.sin(a) * RAD, a + Math.PI / 2];
  }
  s -= arc;
  if (s < 2 * LH) return [LH - s, RAD, Math.PI];
  s -= 2 * LH;
  const a = Math.PI / 2 + s / RAD;
  return [-LH + Math.cos(a) * RAD, Math.sin(a) * RAD, a + Math.PI / 2];
}

// Height of the road deck: up and over both straights of the loop.
function deck(z) {
  const a = Math.abs(z);
  if (a < 1.0) return 0.32;
  if (a < 1.6) return 0.32 * (1 - (a - 1.0) / 0.6);
  return 0;
}

export default function create() {
  const px = new Pixels(60, 20);
  const cars = Array.from({ length: 3 }, () => ({ x: 0, z: 0, c: 1, s: 0 }));
  const auto = { z: 0 };
  const dice = [
    { x: 0.75, z: 1.45, y: 0.12, ax: 0, ay: 0 },
    { x: 1.2, z: 1.25, y: 0.12, ax: 0, ay: 0 },
  ];

  function track(x, z, y) {
    const qx = Math.max(Math.abs(x) - LH, 0);
    const dc = Math.abs(Math.hypot(qx, z) - RAD);
    // Rails on a bed: a flat strip with two ridges.
    const bed = Math.hypot(Math.max(dc - 0.09, 0), Math.max(Math.abs(y - 0.015) - 0.015, 0));
    const rail = Math.hypot(Math.abs(dc - 0.045) - 0.012, Math.max(Math.abs(y - 0.04) - 0.012, 0)) - 0.004;
    return Math.min(bed, rail);
  }

  function train(x, y, z) {
    let d = Infinity;
    cars.forEach((c, k) => {
      let dx = x - c.x;
      let dz = z - c.z;
      if (dx * dx + dz * dz > 0.2) {
        d = Math.min(d, Math.hypot(dx, dz) - 0.3);
        return;
      }
      const r = rot(dx, dz, c.c, c.s);
      const lx = r[0];
      const lz = r[1];
      if (k === 0) {
        d = Math.min(d, box(lx, y - 0.08, lz, 0.17, 0.035, 0.07, 0.01));
        d = Math.min(d, cylinder(y - 0.15, lx - 0.03, lz, 0.055, 0.12, 0.01));
        d = Math.min(d, box(lx + 0.12, y - 0.17, lz, 0.05, 0.075, 0.07, 0.01));
        d = Math.min(d, cylinder(lx - 0.11, y - 0.23, lz, 0.022, 0.04));
      } else {
        d = Math.min(d, box(lx, y - 0.11, lz, 0.14, 0.06, 0.07, 0.015));
      }
      // Wheels.
      d = Math.min(d, cylinder(lz, lx - 0.08, y - 0.05, 0.035, 0.08) - 0.002);
    });
    return d;
  }

  function road(x, y, z) {
    const h = deck(z);
    const slab = Math.max(Math.abs(x) - 0.13, (Math.abs(y - h - 0.02) - 0.02) / 1.15, Math.abs(z) - 2.1);
    let d = slab;
    for (const pz of [-0.95, 0, 0.95]) d = Math.min(d, cylinder(x, y - 0.15, z - pz, 0.035, 0.15));
    // The car on the road.
    const ah = deck(auto.z);
    d = Math.min(d, box(x, y - ah - 0.08, z - auto.z, 0.06, 0.035, 0.1, 0.02));
    d = Math.min(d, box(x, y - ah - 0.12, z - auto.z + 0.01, 0.05, 0.03, 0.05, 0.02));
    return d;
  }

  function die(x, y, z, dd) {
    let dx = x - dd.x;
    let dy = y - dd.y;
    let dz = z - dd.z;
    const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.2;
    if (far > 0.1) return far;
    let r = rot(dx, dz, Math.cos(dd.ay), Math.sin(dd.ay));
    dx = r[0];
    dz = r[1];
    r = rot(dy, dz, Math.cos(dd.ax), Math.sin(dd.ax));
    dy = r[0];
    dz = r[1];
    let d = box(dx, dy, dz, 0.1, 0.1, 0.1, 0.025);
    // Pips: the same five on every face, which reads fine at this size.
    for (const [a, b] of [[0, 0], [0.05, 0.05], [-0.05, -0.05], [0.05, -0.05], [-0.05, 0.05]]) {
      d = Math.max(d, -sphere(dx - a, dy - b, Math.abs(dz) - 0.11, 0.025));
      d = Math.max(d, -sphere(Math.abs(dx) - 0.11, dy - a, dz - b, 0.025));
      d = Math.max(d, -sphere(dx - a, Math.abs(dy) - 0.11, dz - b, 0.025));
    }
    return d;
  }

  const parts = {};
  const scene = {
    bound: { x: 0, y: 0.1, z: 0.2, r: 2.35 },
    light: norm(-0.4, 0.8, 0.45),
    map(x, y, z) {
      parts.track = track(x, z, y);
      parts.train = train(x, y, z);
      parts.road = road(x, y, z);
      parts.dice = Math.min(die(x, y, z, dice[0]), die(x, y, z, dice[1]));
      return Math.min(parts.track, parts.train, parts.road, parts.dice);
    },
    material(x, y, z) {
      scene.map(x, y, z);
      const m = Math.min(parts.track, parts.train, parts.road, parts.dice);
      if (m === parts.train) return { c: 1, s: 0.7 };
      if (m === parts.dice) return { c: 1, s: 0.5 };
      if (m === parts.road) return { c: 0.65, s: 0.1 };
      return { c: 0.55, s: 0.3 };
    },
  };

  return (f, bx, t, dt, big) => {
    const head = t * 0.55;
    cars.forEach((c, k) => {
      const [x, z, a] = along(head - k * 0.4);
      c.x = x;
      c.z = z;
      c.c = Math.cos(a);
      c.s = Math.sin(a);
    });
    auto.z = 2.0 - ((t * 0.5) % 4);

    const round = Math.floor(t / ROLL);
    const s = t % ROLL;
    dice.forEach((dd, i) => {
      const k = Math.min(1, s / 0.9);
      const seed = round * 7 + i * 3;
      const restX = Math.floor(hash(seed) * 4) * (Math.PI / 2);
      const restY = hash(seed + 1) * Math.PI;
      dd.y = 0.12 + Math.sin(k * Math.PI) * 0.45 * (1 - k * 0.4) + (k < 1 ? Math.abs(Math.sin(k * Math.PI * 3)) * 0.05 : 0);
      dd.ax = restX + (1 - k) * 9;
      dd.ay = restY + (1 - k) * 5;
    });

    const orbit = t * 0.12;
    const cam = camera(Math.sin(orbit) * 3.1, 1.6, Math.cos(orbit) * 3.1, 0, 0.12, 0.35, 40);
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    big.text(0, 0, `RND ${(round % 7) + 1}/7`, 0.8);
    if (s < 0.9 && Math.floor(s * 6) % 2 === 0) big.text(24, 0, 'ROLL!', 1);
  };
}
