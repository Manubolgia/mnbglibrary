// The fallback tape: a 3D cassette turning in the light, its reels spinning,
// with the game's name on the label. Any game without its own animation plays
// this one, so a new entry in games.json works before anybody draws anything.

import { Pixels, blit } from '../gfx.js';
import { paint, camera, project, box, cylinder, sphere, rot, norm } from '../sdf.js';

const REEL_X = 0.42;
const REEL_Y = -0.02;

export default function create(game) {
  const px = new Pixels(60, 20);
  const label = (game.short || game.title || '').toUpperCase().slice(0, 16);
  const pose = { c: 1, s: 0, pc: 1, ps: 0, spin: 0, wound: 0 };
  const local = { x: 0, y: 0, z: 0 };

  function cassette(x, y, z) {
    let r = rot(x, z, pose.c, pose.s);
    x = r[0];
    z = r[1];
    r = rot(y, z, pose.pc, pose.ps);
    y = r[0];
    z = r[1];
    local.x = x;
    local.y = y;
    local.z = z;
    // The shell, with the thicker head end along the bottom.
    let d = box(x, y, z, 1.0, 0.63, 0.08, 0.03);
    d = Math.min(d, box(x, y + 0.5, z, 0.62, 0.13, 0.095, 0.02));
    // The window, and the recess of the label around it.
    d = Math.max(d, -box(x, y - REEL_Y, z - 0.09, 0.3, 0.13, 0.04));
    d = Math.max(d, -box(x, y - 0.32, z - 0.1, 0.85, 0.14, 0.025));
    // Reel holes right through, with the hubs turning inside.
    const ax = Math.abs(x) - REEL_X;
    d = Math.max(d, -cylinder(ax, z, y - REEL_Y, 0.13, 0.2));
    const a = Math.atan2(y - REEL_Y, ax) + pose.spin * Math.sign(x || 1);
    const teeth = 0.095 + 0.018 * Math.max(0, Math.cos(a * 6));
    d = Math.min(d, Math.max(cylinder(ax, z, y - REEL_Y, teeth, 0.06), -cylinder(ax, z, y - REEL_Y, 0.05, 0.1)));
    // Tape wound on each reel, seen through the window.
    const pack = 0.12 + 0.12 * (x < 0 ? 1 - pose.wound : pose.wound);
    d = Math.min(d, Math.max(cylinder(ax, z, y - REEL_Y, pack, 0.03), -cylinder(ax, z, y - REEL_Y, 0.13, 0.1)));
    // Screws in the corners.
    for (const [sx, sy] of [[0.9, 0.53], [-0.9, 0.53], [0.9, -0.53], [-0.9, -0.53], [0, -0.52]]) {
      d = Math.max(d, -sphere(x - sx, y - sy, z - 0.09, 0.028));
    }
    return d;
  }

  const scene = {
    bound: { x: 0, y: 0, z: 0, r: 1.22 },
    light: norm(-0.45, 0.5, 0.74),
    map: cassette,
    material() {
      const { x, y, z } = local;
      // The paper label is brighter than the smoky plastic.
      if (y > 0.18 && y < 0.46 && Math.abs(x) < 0.85 && z > 0.05) return { c: 1, s: 0.05 };
      if (Math.hypot(Math.abs(x) - REEL_X, y - REEL_Y) < 0.26 && Math.abs(z) < 0.07) return { c: 0.9, s: 0.8 };
      return { c: 0.72, s: 0.6 };
    },
  };

  return (f, bx, t, dt, big) => {
    const yaw = Math.sin(t * 0.5) * 0.55;
    const pitch = -0.25 + Math.sin(t * 0.37) * 0.12;
    pose.c = Math.cos(yaw);
    pose.s = Math.sin(yaw);
    pose.pc = Math.cos(pitch);
    pose.ps = Math.sin(pitch);
    pose.spin = t * 3;
    pose.wound = (t / 60) % 1;
    const cam = camera(0, 0, 2.25, 0, 0, 0, 40);
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // The name on the label, following the cassette as it turns.
    const lx = 0;
    const ly = 0.32;
    const lz = 0.08;
    // Label point back into world space (inverse of the rotations above).
    const wy = ly * pose.pc + lz * pose.ps;
    const z1 = -ly * pose.ps + lz * pose.pc;
    const wx = lx * pose.c + z1 * pose.s;
    const wz = -lx * pose.s + z1 * pose.c;
    const p = project(cam, px.w, px.h, wx, wy, wz);
    if (p && label) big.text(Math.round(p.x / 2 - (label.length - 1) / 2), Math.round(p.y / 2), label, 1);
  };
}
