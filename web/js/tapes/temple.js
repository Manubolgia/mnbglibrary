// Deep Temple: a stepped pyramid at night, lit by two torches, turning
// slowly. An explorer walks in; some trips they come back out with a gem,
// some trips the ceiling comes down and they run for it.

import { Pixels, blit, hash } from '../gfx.js';
import { paint, camera, project, box, sphere, cone, norm } from '../sdf.js';

const TIERS = 5;
const TRIP = 9;
const STARS = Array.from({ length: 26 }, (_, i) => [Math.floor(hash(i) * 60), Math.floor(hash(i + 40) * 8)]);

export default function create() {
  const px = new Pixels(60, 20);
  let cam = null;
  const walker = { on: false, x: 0, z: 0, gem: false };
  const rocks = Array.from({ length: 7 }, () => ({ on: false, x: 0, y: 0, z: 0 }));
  const torches = [
    { x: -0.45, y: -0.4, z: 1.5, i: 0.6 },
    { x: 0.45, y: -0.4, z: 1.5, i: 0.6 },
  ];

  function pyramid(x, y, z) {
    let d = Infinity;
    for (let i = 0; i < TIERS; i++) {
      const half = 1.45 - i * 0.26;
      d = Math.min(d, box(x, y - (-0.88 + i * 0.3), z, half, 0.15, half, 0.01));
    }
    // The shrine on top, with its own little door.
    d = Math.min(d, box(x, y - 0.72, z, 0.3, 0.2, 0.28, 0.01));
    d = Math.max(d, -box(x, y - 0.66, z - 0.3, 0.09, 0.14, 0.12));
    // The stairway up the front.
    for (let i = 0; i < TIERS; i++) {
      d = Math.min(d, box(x, y - (-0.95 + i * 0.3), z - (1.52 - i * 0.26), 0.2, 0.08, 0.1, 0.005));
    }
    // The doorway, cut into the bottom tiers.
    d = Math.max(d, -box(x, y + 0.72, z - 1.3, 0.2, 0.3, 0.5));
    return d;
  }

  function extras(x, y, z) {
    let d = Infinity;
    for (const t of torches) d = Math.min(d, cone(x, y, z, t.x, t.y - 0.25, t.z, t.x, t.y, t.z, 0.02, 0.03));
    if (walker.on) {
      d = Math.min(d, cone(x, y, z, walker.x, -1.03, walker.z, walker.x, -0.86, walker.z, 0.05, 0.035));
      d = Math.min(d, sphere(x - walker.x, y + 0.8, z - walker.z, 0.04));
      if (walker.gem) d = Math.min(d, sphere(x - walker.x - 0.06, y + 0.72, z - walker.z, 0.035));
    }
    for (const r of rocks) if (r.on) d = Math.min(d, sphere(x - r.x, y - r.y, z - r.z, 0.08));
    return d;
  }

  const scene = {
    bound: { x: 0, y: -0.25, z: 0.15, r: 2.3 },
    light: norm(-0.55, 0.65, 0.55),
    lightI: 0.75,
    ambient: 0.06,
    lights: torches,
    map: (x, y, z) => Math.min(pyramid(x, y, z), extras(x, y, z)),
    material(x, y, z) {
      // The dark inside of the doorway glows faintly with the treasure.
      if (Math.abs(x) < 0.2 && y < -0.42 && z < 1.0 && z > 0.7) return { c: 0.2, s: 0, e: 0.25 + hash(Math.floor(z * 50)) * 0.1 };
      if (walker.gem && Math.hypot(x - walker.x - 0.06, y + 0.72, z - walker.z) < 0.05) return { c: 1, s: 2, e: 0.8 };
      return { c: 0.75, s: 0.05 };
    },
  };

  let gems = 0;
  let banked = -1;

  return (f, bx, t, dt, big) => {
    const trip = Math.floor(t / TRIP);
    const s = t % TRIP;
    const hazard = trip % 3 === 2;

    // Torchlight flickers.
    torches.forEach((tc, i) => (tc.i = 0.45 + hash(Math.floor(t * 12) + i * 17) * 0.35));

    // The explorer: in to the door, a pause inside, back out.
    walker.gem = false;
    if (s < 3) {
      walker.on = true;
      walker.x = 0;
      walker.z = 2.6 - (s / 3) * 1.4;
    } else if (s < 4.5) {
      walker.on = false;
    } else {
      const out = s - 4.5;
      const speed = hazard ? 1.6 : 0.6;
      walker.on = out * speed < 2;
      walker.x = out * speed * 0.6;
      walker.z = 1.2 + out * speed;
      walker.gem = !hazard;
      if (!hazard && out > 2.5 && banked !== trip) {
        banked = trip;
        gems = (gems + 3 + Math.floor(hash(trip) * 12)) % 100;
      }
    }
    // Rockfall on the unlucky trips.
    rocks.forEach((r, i) => {
      const fall = s - 4.3 - hash(i + trip * 9) * 0.8;
      r.on = hazard && fall > 0 && fall < 1.6;
      if (!r.on) return;
      r.x = (hash(i * 3.1 + trip) - 0.5) * 1.6;
      r.z = 1.2 + hash(i * 5.7 + trip) * 0.6;
      r.y = Math.max(-0.98, 1.3 - fall * fall * 4.5);
    });

    const orbit = Math.sin(t * 0.22) * 0.6;
    cam = camera(Math.sin(orbit) * 4.4, 1.2, Math.cos(orbit) * 4.4, 0, -0.2, 0.2, 40);

    // Stars behind everything.
    STARS.forEach(([sx, sy], i) => {
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + hash(i) * 2) + i * 3);
      f.put(bx.x + sx, bx.y + sy, tw > 0.8 ? '*' : '.', 0.15 + tw * 0.4);
    });
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // Flames above the torches.
    for (const tc of torches) {
      const p = project(cam, px.w, px.h, tc.x, tc.y + 0.06, tc.z);
      if (!p) continue;
      const k = hash(Math.floor(t * 14) + tc.x * 10);
      f.put(bx.x + p.x, bx.y + p.y, '^*\'"'[Math.floor(k * 4)], 1);
      if (k > 0.6) f.put(bx.x + p.x + (k > 0.8 ? 1 : -1), bx.y + p.y - 1, '.', 0.7);
    }

    if (hazard && s > 4.3 && s < 6.5 && Math.floor(s * 4) % 2 === 0) big.center(0, 'ROCKFALL!', 1);
    big.text(25, 0, `◆${String(gems).padStart(3, ' ')}`, 0.8);
  };
}
