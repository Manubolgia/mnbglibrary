// Final Player: a cabin in the woods at night, one window still lit. A
// masked figure steps out of the pines and walks to the door. Lightning,
// the window goes dark, and then a single torch beam bobs away into the
// trees: she's running. Next loop, another night.

import { Pixels, blit, hash, clamp } from '../gfx.js';
import { paint, camera, project, box, cone, sphere, ellipsoid, norm, smin } from '../sdf.js';

const CYCLE = 13;
const DOOR = [0.06, -0.5, 0.33];
const START = [-1.05, -0.5, 0.75];
const ARRIVE = 7.4;
const PINES = [
  [-0.82, -0.45, 0.62],
  [-0.5, -0.75, 0.5],
  [-1.15, -0.2, 0.55],
  [0.82, -0.42, 0.66],
  [1.1, -0.05, 0.5],
  [0.55, -0.8, 0.55],
];
const STARS = Array.from({ length: 26 }, (_, i) => [hash(i) * 60, Math.floor(hash(i + 40) * 6), hash(i + 80)]);
const RAIN = 18;

export default function create() {
  const px = new Pixels(60, 20);
  const who = { x: START[0], z: START[2], step: 0, show: 1 };
  let windowLit = 1;
  let flash = 0;

  function cabin(x, y, z) {
    // Walls, and a pitched roof cut from a turned box.
    let d = box(x - 0.1, y + 0.3, z, 0.36, 0.2, 0.3, 0.01);
    const rx = (x - 0.1) * 0.7071 - (y + 0.02) * 0.7071;
    const ry = (x - 0.1) * 0.7071 + (y + 0.02) * 0.7071;
    const roof = Math.max(box(rx, ry, z, 0.3, 0.3, 0.34), -(y + 0.1));
    d = Math.min(d, roof);
    // The chimney.
    d = Math.min(d, box(x - 0.28, y - 0.05, z + 0.08, 0.04, 0.12, 0.04));
    return d;
  }

  function pine(x, y, z, px0, pz0, h) {
    let d = cone(x, y, z, px0, -0.5, pz0, px0, -0.5 + h, pz0, 0.17, 0.0);
    d = Math.min(d, cone(x, y, z, px0, -0.5 + h * 0.35, pz0, px0, -0.5 + h * 0.9, pz0, 0.13, 0.0));
    return d;
  }

  function figure(x, y, z) {
    if (!who.show) return 9;
    const bob = Math.abs(Math.sin(who.step)) * 0.012;
    const lx = x - who.x;
    const lz = z - who.z;
    // Legs swinging, a long coat, shoulders, the masked head and a blade.
    const swing = Math.sin(who.step) * 0.035;
    let d = cone(lx, y, lz, swing, -0.5, 0.02, 0, -0.33 + bob, 0, 0.022, 0.03);
    d = Math.min(d, cone(lx, y, lz, -swing, -0.5, -0.02, 0, -0.33 + bob, 0, 0.022, 0.03));
    d = smin(d, cone(lx, y, lz, 0, -0.36 + bob, 0, 0, -0.18 + bob, 0, 0.055, 0.045), 0.02);
    d = Math.min(d, ellipsoid(lx, y + 0.12 - bob, lz, 0.036, 0.046, 0.036));
    d = Math.min(d, cone(lx, y, lz, 0.05, -0.2 + bob, 0, 0.09, -0.33 + bob, 0.02, 0.012, 0.01));
    return d;
  }

  const scene = {
    bound: { x: 0, y: -0.1, z: 0, r: 1.5 },
    light: norm(-0.4, 0.8, 0.45),
    lightI: 0.6,
    ambient: 0.04,
    lights: [{ x: 0.1, y: -0.32, z: 0.5, i: 0.5 }],
    map(x, y, z) {
      let d = y + 0.5;
      d = Math.min(d, cabin(x, y, z));
      for (const [tx, tz, h] of PINES) d = Math.min(d, pine(x, y, z, tx, tz, h + 0.45));
      return Math.min(d, figure(x, y, z));
    },
    material(x, y, z) {
      if (y < -0.495) return { c: 0.015, s: 0 };
      // The lit window and the door on the cabin's front.
      if (z > 0.28 && z < 0.32 && Math.abs(y + 0.28) < 0.07) {
        if (Math.abs(x - 0.28) < 0.07) return { c: 0.1, s: 0, e: 0.95 * windowLit };
        if (Math.abs(x - DOOR[0]) < 0.05 && y < -0.24) return { c: 0.15, s: 0 };
      }
      if (who.show && Math.hypot(x - who.x, z - who.z) < 0.06 && y > -0.17) return { c: 1, s: 0.8, e: 0.6 };
      if (who.show && Math.hypot(x - who.x, z - who.z) < 0.15 && y < -0.1) return { c: 0.35, s: 0.2 };
      // Pines are darker than the cabin's boards.
      if (Math.abs(x - 0.1) > 0.4 || Math.abs(z) > 0.34) return { c: 0.38, s: 0 };
      return { c: 0.7, s: 0.1 };
    },
  };

  return (f, bx, t, dt, big) => {
    const night = Math.floor(t / CYCLE);
    const s = t % CYCLE;

    // The walk to the door, then nothing where he stood.
    const k = clamp(s / ARRIVE);
    who.x = START[0] + (DOOR[0] - START[0]) * k;
    who.z = START[2] + (DOOR[2] - START[2] + 0.1) * k;
    who.step = s < ARRIVE ? s * 5 : 0;
    who.show = s < 9.2 ? 1 : 0;
    flash = (s > 7.6 && s < 7.8) || (s > 8.0 && s < 8.08) ? 1 : 0;
    windowLit = s < 7.7 ? 0.85 + hash(Math.floor(t * 8)) * 0.15 : 0;
    scene.ambient = flash ? 0.7 : 0.04;
    scene.lights[0].i = windowLit * 0.5;

    // Stars, then the moon, behind it all.
    STARS.forEach(([sx, sy, b], i) => f.put(bx.x + sx, bx.y + sy, b > 0.8 ? '*' : '.', 0.15 + b * 0.4 * (0.7 + 0.3 * Math.sin(t * 2 + i))));
    f.put(bx.x + 45, bx.y + 4, '●', 0.9);
    f.put(bx.x + 44, bx.y + 4, '(', 0.35);
    f.put(bx.x + 46, bx.y + 4, ')', 0.35);

    const sway = Math.sin(t * 0.25) * 0.3;
    const cam = camera(sway * 0.8, 0.02, 1.75, 0.05, -0.24, 0, 44);
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // Rain once the storm breaks.
    if (s > 6.5) {
      for (let i = 0; i < RAIN; i++) {
        const x = Math.floor(hash(i) * 60 + night * 7) % 60;
        const y = (hash(i + 9) * 20 + t * 26) % 20;
        f.put(bx.x + x, bx.y + Math.floor(y), '/', 0.25);
      }
    }
    // The bolt.
    if (flash) {
      let x = 12 + Math.floor(hash(night) * 6);
      for (let y = 0; y < 9; y++) {
        f.put(bx.x + x, bx.y + y, y % 3 === 2 ? '\\' : '/', 1);
        x += y % 3 === 2 ? 1 : -1;
      }
    }
    // A torch beam running off into the trees.
    if (s > 9.4 && s < 12.6) {
      const a = (s - 9.4) / 3.2;
      const p = project(cam, px.w, px.h, DOOR[0] + 0.9 * a, -0.42, DOOR[2] + 0.2 - 0.6 * a);
      if (p) {
        const wob = Math.sin(s * 14) * 0.6;
        f.put(bx.x + p.x, bx.y + p.y + wob, '●', 1);
        for (let r = 1; r < 4; r++) f.put(bx.x + p.x + r, bx.y + p.y + wob, r < 3 ? '-' : '·', 0.7 - r * 0.15);
      }
    }

    big.text(0, 0, `NIGHT ${(night % 9) + 1}`, 0.8);
    const time = Math.max(0, 6 - Math.floor(s / 1.3));
    big.text(23, 0, `TIME ${time}`, time ? 0.8 : 1);
    if (s > 7.7 && s < 9.2 && Math.floor(s * 4) % 2 === 0) big.center(4, 'RUN', 1);
    const line = 'SURVIVE THE NIGHT';
    if (s > 9.6) big.center(9, line.slice(0, Math.floor((s - 9.6) * 10)).padEnd(line.length, ' '), 0.9);
  };
}
