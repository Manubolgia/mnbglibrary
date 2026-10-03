// Frame Feud: two stick fighters on a dojo floor. Both pick in secret, lock
// in, and the exchange plays out: a dash, a kick, a freeze-frame hit, a
// knockdown. They take turns winning the read, health bars and all.

import { Pixels, blit, hash } from '../gfx.js';
import { paint, camera, project, cone, sphere, box, norm } from '../sdf.js';

const LOOP = 7;
const FLOOR = -1;

// Joint positions for one fighter, rebuilt every frame from a few pose numbers.
function makeFighter() {
  return { x: 0, f: 1, crouch: 0, kick: 0, lean: 0, fly: 0, lie: 0, guard: 0, j: {}, hp: 10 };
}

function pose(b) {
  const j = b.j;
  const f = b.f;
  const lie = b.lie;
  const hipY = FLOOR + 0.78 - b.crouch * 0.18 - lie * 0.6 + b.fly;
  const hx = b.x;
  // torso tips back as the fighter falls; lying flat at lie = 1
  const tilt = b.lean * f - lie * f * 1.45;
  const ux = Math.sin(tilt);
  const uy = Math.cos(tilt);
  j.hip = [hx, hipY, 0];
  j.neck = [hx + ux * 0.55, hipY + uy * 0.55, 0];
  j.head = [hx + ux * 0.74, hipY + uy * 0.74, 0];
  // arms: guard up in front of the face
  const g = b.guard;
  j.elbowF = [j.neck[0] + f * (0.2 + g * 0.1), j.neck[1] - 0.22 + g * 0.08, 0.06];
  j.handF = [j.neck[0] + f * (0.42 + g * 0.04), j.neck[1] - 0.04 + g * 0.1, 0.06];
  j.elbowB = [j.neck[0] - f * 0.16, j.neck[1] - 0.26, -0.06];
  j.handB = [j.neck[0] + f * 0.08, j.neck[1] - 0.16, -0.06];
  // legs: the front leg kicks
  const k = b.kick;
  j.kneeF = [hx + f * (0.24 + k * 0.24), hipY - 0.34 + k * 0.32 - lie * 0.1, 0.06];
  j.footF = [hx + f * (0.34 + k * 0.56), hipY - 0.76 + k * 0.74 - lie * 0.1, 0.06];
  j.kneeB = [hx - f * (0.2 + k * 0.05), hipY - 0.36, -0.06];
  j.footB = [hx - f * (0.4 + k * 0.08), FLOOR + 0.02 + Math.max(0, hipY - FLOOR - 0.78) * 0.9, -0.06];
  if (lie > 0.5) {
    j.kneeF = [hx - f * 0.35, FLOOR + 0.12, 0.06];
    j.footF = [hx - f * 0.72, FLOOR + 0.05, 0.06];
    j.kneeB = [hx - f * 0.38, FLOOR + 0.2, -0.06];
    j.footB = [hx - f * 0.7, FLOOR + 0.08, -0.06];
  }
}

function limb(x, y, z, a, b, r) {
  return cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r, r * 0.85);
}

function body(b, x, y, z) {
  const j = b.j;
  // cheap early out: far from this fighter's bounding sphere
  const cx = j.hip[0];
  const cy = j.hip[1] + 0.05;
  const far = sphere(x - cx, y - cy, z, 1.05);
  if (far > 0.3) return far;
  let d = sphere(x - j.head[0], y - j.head[1], z - j.head[2], 0.17);
  d = Math.min(d, limb(x, y, z, j.hip, j.neck, 0.15));
  d = Math.min(d, limb(x, y, z, j.neck, j.elbowF, 0.08));
  d = Math.min(d, limb(x, y, z, j.elbowF, j.handF, 0.075));
  d = Math.min(d, limb(x, y, z, j.neck, j.elbowB, 0.08));
  d = Math.min(d, limb(x, y, z, j.elbowB, j.handB, 0.075));
  d = Math.min(d, limb(x, y, z, j.hip, j.kneeF, 0.095));
  d = Math.min(d, limb(x, y, z, j.kneeF, j.footF, 0.085));
  d = Math.min(d, limb(x, y, z, j.hip, j.kneeB, 0.095));
  d = Math.min(d, limb(x, y, z, j.kneeB, j.footB, 0.085));
  return d;
}

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const seg = (s, a, b) => ease((s - a) / (b - a));

export default function create() {
  const px = new Pixels(60, 20);
  const A = makeFighter();
  const B = makeFighter();
  let hit = null;
  let hp = [10, 10];
  let lastLoop = -1;

  const scene = {
    bound: { x: 0, y: -0.35, z: 0, r: 2.9 },
    light: norm(-0.4, 0.75, 0.55),
    ambient: 0.12,
    map(x, y, z) {
      const floor = box(x, y - (FLOOR - 0.05), z, 2.6, 0.05, 0.5, 0.01);
      return Math.min(floor, body(A, x, y, z), body(B, x, y, z));
    },
    material(x, y, z) {
      if (y < FLOOR + 0.005) {
        // floorboards
        const plank = Math.abs(((x * 2.5) % 1) + 1) % 1 < 0.06;
        return { c: plank ? 0.12 : 0.32, s: 0.05 };
      }
      return x < (A.x + B.x) / 2 === A.x < B.x ? { c: 1, s: 0.6, e: 0.08 } : { c: 0.8, s: 0.4 };
    },
  };

  return (f, bx, t, dt, big) => {
    const n = Math.floor(t / LOOP);
    const s = t % LOOP;
    // who wins this exchange alternates
    const win = n % 2 === 0 ? A : B;
    const lose = win === A ? B : A;
    if (n !== lastLoop) {
      lastLoop = n;
      if (hp[0] <= 2 || hp[1] <= 2) hp = [10, 10];
    }

    // stance positions
    A.f = 1;
    B.f = -1;
    for (const b of [A, B]) {
      b.crouch = 0.25 + Math.sin(t * 3 + (b === A ? 0 : 1)) * 0.06;
      b.kick = 0;
      b.lean = 0;
      b.fly = 0;
      b.lie = 0;
      b.guard = 1;
    }
    A.x = -0.85;
    B.x = 0.85;

    // the exchange
    const dash = seg(s, 1.6, 2.1);
    win.x = (win === A ? -0.85 : 0.85) + win.f * dash * 0.85;
    win.lean = dash * 0.25;
    const kick = seg(s, 2.1, 2.3) * (1 - seg(s, 2.9, 3.3));
    win.kick = kick;
    win.guard = 1 - kick * 0.6;
    lose.crouch += seg(s, 1.7, 2.2) * 0.25; // the slow windup that loses
    // impact + flight
    const flight = s - 2.45;
    if (flight > 0) {
      const ft = Math.min(flight, 1.1);
      lose.x = (lose === A ? -0.85 : 0.85) + lose.f * -1 * ft * 0.9;
      lose.fly = Math.max(0, ft * 1.8 - ft * ft * 1.8);
      lose.lie = seg(s, 3.2, 3.5) * (1 - seg(s, 5.2, 5.8));
      lose.guard = 0;
      lose.lean = -0.4 * (1 - lose.lie);
    }
    pose(A);
    pose(B);

    if (s > 2.3 && s < 2.36 && (!hit || hit.n !== n)) {
      hit = { n, at: s, p: win.j.footF.slice() };
      const k = lose === A ? 0 : 1;
      hp[k] = Math.max(1, hp[k] - 3);
    }

    const yaw = Math.sin(t * 0.25) * 0.3;
    const cam = camera(Math.sin(yaw) * 3.4, -0.15, Math.cos(yaw) * 3.4, 0, -0.38, 0, 36);
    paint(scene, cam, px);
    blit(f, px, bx.x, bx.y);

    // hit spark: a burst of symbols flying out from the contact point
    if (hit && hit.n === n) {
      const age = s - hit.at;
      if (age >= 0 && age < 0.7) {
        const c = project(cam, px.w, px.h, hit.p[0], hit.p[1], hit.p[2]);
        if (c) {
          const rays = 8;
          for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2 + hash(n) * 3;
            const r = 1 + age * 14;
            const ch = age < 0.15 ? '*' : i % 2 ? '+' : '.';
            f.put(bx.x + Math.round(c.x + Math.cos(a) * r * 1.6), bx.y + Math.round(c.y + Math.sin(a) * r * 0.6), ch, 1 - age);
          }
          if (age < 0.2) f.put(bx.x + Math.round(c.x), bx.y + Math.round(c.y), '@', 1);
        }
      }
    }

    // health bars, YOMI style
    const bar = (v) => '█'.repeat(v) + '░'.repeat(10 - v);
    big.text(0, 0, 'P1', 0.6);
    big.text(3, 0, bar(hp[0]), 0.9);
    big.text(14, 0, 'VS', 0.5);
    big.text(17, 0, [...bar(hp[1])].reverse().join(''), 0.9);
    big.text(28, 0, 'P2', 0.6);

    // captions
    let cap = '';
    if (s < 1.2) cap = 'PICK YOUR MOVE';
    else if (s < 1.6) cap = Math.floor(s * 8) % 2 ? 'LOCK IN' : '';
    else if (s > 2.35 && s < 3.4) cap = 'HIT  +14 FRAMES';
    else if (s > 3.6 && s < 5.4) cap = win === A ? 'P1 READ IT' : 'P2 READ IT';
    if (cap) big.center(9, cap, 1);
  };
}
