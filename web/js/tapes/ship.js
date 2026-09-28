// Coldwake: a ship adrift among the stars, its habitat ring still turning.
// The hull breaches and vents, the cabin lights die one by one down the
// hull until only one is left: you. Then another light comes on at the far
// end, and starts moving towards yours.

import { Pixels, blit, hash } from '../gfx.js';
import { paint, camera, project, box, cone, torus, cylinder, ellipsoid, rot, norm } from '../sdf.js';

const CYCLE = 12;
const WINDOWS = [-0.62, -0.46, -0.3, -0.14, 0.02, 0.18, 0.34, 0.5];
const YOU = 6;
const BREACH = [0.12, 0.2, 0.12];
const DEBRIS = 36;
const STARS = Array.from({ length: 34 }, (_, i) => [hash(i) * 60, Math.floor(hash(i + 50) * 18), hash(i + 90)]);

export default function create() {
  const px = new Pixels(60, 20);
  const pose = { yc: 1, ys: 0, rc: 1, rs: 0, spin: 0, engine: 0 };
  const lit = new Array(WINDOWS.length).fill(true);
  const L = [0, 0, 0];

  // World to the ship's own frame: yaw about y, then roll about the hull.
  function local(x, y, z) {
    let r = rot(x, z, pose.yc, pose.ys);
    x = r[0];
    z = r[1];
    r = rot(y, z, pose.rc, pose.rs);
    L[0] = x;
    L[1] = r[0];
    L[2] = r[1];
    return L;
  }

  // And back again, for things drawn over the render (lights, debris).
  function world(x, y, z) {
    let r = rot(y, z, pose.rc, -pose.rs);
    y = r[0];
    z = r[1];
    r = rot(x, z, pose.yc, -pose.ys);
    return [r[0], y, r[1]];
  }

  function ship(wx, wy, wz) {
    const [x, y, z] = local(wx, wy, wz);
    // The hull: a long tapering spine with the bridge up front.
    let d = cone(x, y, z, -0.95, 0, 0, 0.7, 0, 0, 0.2, 0.15);
    d = Math.min(d, ellipsoid(x - 0.82, y - 0.02, z, 0.32, 0.16, 0.17));
    // Engine block and nozzles at the back.
    d = Math.min(d, box(x + 1.04, y, z, 0.1, 0.13, 0.15, 0.03));
    for (const ny of [-0.09, 0.09]) d = Math.min(d, cone(x, y, z, -1.18, ny, 0, -1.34, ny, 0, 0.06, 0.1));
    // The habitat ring on its spokes, turning about the spine.
    const ax = x + 0.3;
    d = Math.min(d, torus(y, ax, z, 0.5, 0.045));
    const sr = rot(y, z, Math.cos(pose.spin), Math.sin(pose.spin));
    const sy = sr[0];
    const sz = sr[1];
    d = Math.min(d, cylinder(ax, sy, sz, 0.025, 0.5), cylinder(ax, sz, sy, 0.025, 0.5));
    // Solar wings off the tail.
    d = Math.min(d, box(x + 0.72, y, Math.abs(z) - 0.55, 0.16, 0.012, 0.3, 0.005));
    d = Math.min(d, cylinder(x + 0.72, z, y, 0.018, 0.3));
    return d;
  }

  const scene = {
    bound: { x: 0, y: 0, z: 0, r: 1.45 },
    light: norm(0.6, 0.55, 0.6),
    lightI: 0.9,
    ambient: 0.05,
    map: ship,
    material(wx, wy, wz) {
      const [x, y, z] = local(wx, wy, wz);
      // Cabin windows along the spine.
      if (Math.abs(y) < 0.05 && Math.abs(z) > 0.12 && x > -0.7 && x < 0.56) {
        for (let i = 0; i < WINDOWS.length; i++) {
          if (Math.abs(x - WINDOWS[i]) < 0.045) return lit[i] ? { c: 0.2, s: 0, e: 0.95 } : { c: 0.1, s: 0 };
        }
      }
      if (x < -1.2) return { c: 0.3, s: 0.3, e: pose.engine };
      if (x < -0.92) return { c: 0.45, s: 0.3 };
      // Wings are dark glass that catches the sun.
      if (Math.abs(z) > 0.24 && Math.abs(y) < 0.02) return { c: 0.35, s: 1.8 };
      return { c: 0.75, s: 0.5 };
    },
  };

  // The heart monitor along the bottom, swept like a real one.
  function trace(f, bx, t, period) {
    const speed = 22;
    const head = (t * speed) % 60;
    for (let back = 0; back < 44; back++) {
      const x = Math.floor(head - back + 60) % 60;
      const k = Math.floor(((((t - back / speed) % period) + period) % period) * speed);
      const a = 1 - back / 44;
      if (k === 0) f.put(bx.x + x, bx.y + 18, '/', a);
      else if (k === 1) f.put(bx.x + x, bx.y + 18, '\\', a);
      else if (k === 2) f.put(bx.x + x, bx.y + 19, 'v', a * 0.8);
      else f.put(bx.x + x, bx.y + 19, '_', a * 0.6);
    }
  }

  return (f, bx, t, dt, big) => {
    const loop = Math.floor(t / CYCLE);
    const s = t % CYCLE;

    const yaw = -0.5 + Math.sin(t * 0.21) * 0.3;
    const roll = Math.sin(t * 0.17) * 0.3;
    pose.yc = Math.cos(yaw);
    pose.ys = Math.sin(yaw);
    pose.rc = Math.cos(roll);
    pose.rs = Math.sin(roll);
    pose.spin = t * 0.5;
    pose.engine = s < 3.5 ? 0.35 + hash(Math.floor(t * 10)) * 0.5 : hash(Math.floor(t * 10)) > 0.9 ? 0.4 : 0;

    // The lights go out from the tail forward after the breach, all but yours.
    // Then something else's light comes on and moves up the hull towards it.
    const it = s > 7.2 ? Math.min(YOU - 1, Math.floor((s - 7.2) / 0.7)) : -1;
    WINDOWS.forEach((_, i) => {
      lit[i] = i === YOU || i === it || s < 4 + i * 0.3;
    });

    // Stars sliding past behind the ship.
    STARS.forEach(([sx, sy, k], i) => {
      const x = (((sx - t * (0.6 + k)) % 60) + 60) % 60;
      f.put(bx.x + x, bx.y + sy, k > 0.8 ? '*' : '.', 0.2 + k * 0.5 * (0.7 + 0.3 * Math.sin(t * 3 + i)));
    });

    const cam = camera(0.2, 0.7, 1.95, 0, -0.03, 0, 42);
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // Air and debris venting from the breach, tumbling away.
    if (s > 3.6 && s < 10) {
      for (let k = 0; k < DEBRIS; k++) {
        const age = (s - 3.6 - hash(k) * 2.5) * (0.6 + hash(k + 3) * 0.6);
        if (age < 0 || age > 2.6) continue;
        const lx = BREACH[0] + (hash(k + 0.4) - 0.5) * 0.9 * age;
        const ly = BREACH[1] + (0.3 + hash(k + 0.6)) * 0.45 * age;
        const lz = BREACH[2] + (0.2 + hash(k + 0.8)) * 0.4 * age;
        const [x, y, z] = world(lx, ly, lz);
        const p = project(cam, px.w, px.h, x, y, z);
        if (!p) continue;
        const a = 1 - age / 2.6;
        f.put(bx.x + p.x, bx.y + p.y, hash(k + 7) > 0.8 ? '*' : a > 0.5 ? ':' : '.', 0.3 + a * 0.6);
      }
    }

    // Running lights on the wingtips, blinking out of step.
    for (const side of [-1, 1]) {
      if (Math.floor(t * 1.4 + (side > 0 ? 0.5 : 0)) % 2) continue;
      const [x, y, z] = world(-0.72, 0, side * 0.86);
      const p = project(cam, px.w, px.h, x, y, z);
      if (p) f.put(bx.x + p.x, bx.y + p.y, '●', 1);
    }

    big.text(0, 0, `DECK ${(loop % 6) + 1}`, 0.8);
    const o2 = 41 - Math.floor(s * 1.5);
    big.text(24, 0, `O2 ${String(o2).padStart(2, ' ')}%`, o2 < 30 ? 1 : 0.8);
    if (s > 3.6 && s < 6.5 && Math.floor(s * 3) % 2 === 0) big.center(0, 'BREACH', 1);
    const cry = 'SOMETHING ELSE IS AWAKE';
    if (s > 8 && s < 11.6) big.center(9, cry.slice(0, Math.floor((s - 8) * 12)).padEnd(cry.length, ' '), 1);
    else trace(f, bx, t, s > 3.6 ? 0.55 : 1.5);
  };
}
