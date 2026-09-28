// A tiny 3D renderer for the tapes: scenes are signed distance fields, drawn
// by ray marching, a few rays per character cell, and the resulting
// brightness becomes a symbol on the display.
//
// A scene is an object with:
//   map(x, y, z)          distance from the point to the nearest surface
//   material(x, y, z)     optional: { c: albedo 0..1, s: shine, e: glow }
//   bound                 { x, y, z, r }: a sphere holding everything, so
//                         rays that miss it are skipped entirely
//   light                 optional: normalised direction towards the light
//   lightI, ambient       optional: its strength (1) and the ambient level (0.08)
//   lights                optional: point lights [{ x, y, z, i }] (e.g. torches)
//
// Everything works on plain numbers (no vector objects) to keep the inner
// loops free of allocation: a frame is a few thousand rays on a phone.

import { CELL_W, CELL_H } from './font.js';

// ---- primitives -----------------------------------------------------------

export const length3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

export const sphere = (x, y, z, r) => length3(x, y, z) - r;

export function ellipsoid(x, y, z, a, b, c) {
  const k0 = length3(x / a, y / b, z / c);
  const k1 = length3(x / (a * a), y / (b * b), z / (c * c));
  return k1 === 0 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
}

export function box(x, y, z, bx, by, bz, r = 0) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  const out = length3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  return out + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// Cylinder standing on the y axis: radius r, half height h, rounded edge e.
export function cylinder(x, y, z, r, h, e = 0) {
  const dx = Math.hypot(x, z) - r + e;
  const dy = Math.abs(y) - h + e;
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - e;
}

// Ring lying flat (axis y): big radius R, tube radius r.
export const torus = (x, y, z, R, r) => Math.hypot(Math.hypot(x, z) - R, y) - r;

// A capsule from a to b whose radius goes from ra to rb: horns, legs, arms.
export function cone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const px = x - ax;
  const py = y - ay;
  const pz = z - az;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const h = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)));
  return length3(px - dx * h, py - dy * h, pz - dz * h) - (ra + (rb - ra) * h);
}

export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a, b, k) {
  return -smin(-a, -b, k);
}

// Rotation helpers: rotate (a, b) by angle given as cos/sin, returning into R.
export const R = [0, 0];
export function rot(a, b, c, s) {
  R[0] = a * c - b * s;
  R[1] = a * s + b * c;
  return R;
}

// ---- camera ---------------------------------------------------------------

export function camera(ex, ey, ez, tx, ty, tz, fov = 40) {
  let fx = tx - ex;
  let fy = ty - ey;
  let fz = tz - ez;
  const fl = length3(fx, fy, fz);
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0,1,0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // up = right x forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  return { ex, ey, ez, fx, fy, fz, rx, ry: 0, rz, ux, uy, uz, tan: Math.tan((fov * Math.PI) / 360) };
}

// Where a world point lands on the grid of `w` x `h` cells (for overlaying
// text or particles on a 3D object). Returns null when behind the camera.
export function project(cam, w, h, x, y, z) {
  const px = x - cam.ex;
  const py = y - cam.ey;
  const pz = z - cam.ez;
  const depth = px * cam.fx + py * cam.fy + pz * cam.fz;
  if (depth <= 0.01) return null;
  const sx = (px * cam.rx + pz * cam.rz) / depth / cam.tan;
  const sy = (px * cam.ux + py * cam.uy + pz * cam.uz) / depth / cam.tan;
  const aspect = (w * CELL_W) / (h * CELL_H);
  return { x: ((sx / aspect + 1) / 2) * w - 0.5, y: ((1 - sy) / 2) * h - 0.5, depth };
}

// ---- rendering ------------------------------------------------------------

const DEFAULT_LIGHT = norm(-0.5, 0.7, 0.55);
const DEFAULT_MAT = { c: 0.85, s: 0.4, e: 0 };

export function norm(x, y, z) {
  const l = length3(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// Render `scene` into the Pixels buffer `px` (one pixel per character cell),
// firing ss x ss rays per cell. Also fills px.id with scene.id(x, y, z) of the
// centre hit, when the scene provides one, so tapes can pick special symbols
// per object.
export function render(scene, cam, px, { ss = 2, steps = 64, far = 20 } = {}) {
  const W = px.w;
  const H = px.h;
  const aspect = (W * CELL_W) / (H * CELL_H);
  const L = scene.light || DEFAULT_LIGHT;
  const amb = scene.ambient ?? 0.08;
  const LI = scene.lightI ?? 1;
  const b = scene.bound;
  const map = scene.map;
  const ids = scene.id ? (px.id ||= new Int8Array(W * H)) : null;
  if (ids) ids.fill(-1);

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let sum = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const u = (((i + (si + 0.5) / ss) / W) * 2 - 1) * aspect * cam.tan;
          const v = (1 - ((j + (sj + 0.5) / ss) / H) * 2) * cam.tan;
          let dx = cam.fx + cam.rx * u + cam.ux * v;
          let dy = cam.fy + cam.uy * v;
          let dz = cam.fz + cam.rz * u + cam.uz * v;
          const dl = length3(dx, dy, dz);
          dx /= dl;
          dy /= dl;
          dz /= dl;

          // Clip the ray to the bounding sphere.
          let t = 0;
          let tEnd = far;
          if (b) {
            const ox = cam.ex - b.x;
            const oy = cam.ey - b.y;
            const oz = cam.ez - b.z;
            const bb = ox * dx + oy * dy + oz * dz;
            const cc = ox * ox + oy * oy + oz * oz - b.r * b.r;
            const disc = bb * bb - cc;
            if (disc < 0) {
              sum += scene.background ? scene.background(dx, dy, dz) : 0;
              continue;
            }
            const sq = Math.sqrt(disc);
            t = Math.max(0, -bb - sq);
            tEnd = -bb + sq;
          }

          let hit = false;
          let x = 0;
          let y = 0;
          let z = 0;
          for (let k = 0; k < steps && t < tEnd; k++) {
            x = cam.ex + dx * t;
            y = cam.ey + dy * t;
            z = cam.ez + dz * t;
            const d = map(x, y, z);
            if (d < 0.0015 * (1 + t)) {
              hit = true;
              break;
            }
            t += d * 0.9;
          }
          if (!hit) {
            sum += scene.background ? scene.background(dx, dy, dz) : 0;
            continue;
          }

          // Normal from the field's gradient (tetrahedron sampling).
          const e = 0.002;
          const a1 = map(x + e, y - e, z - e);
          const a2 = map(x - e, y - e, z + e);
          const a3 = map(x - e, y + e, z - e);
          const a4 = map(x + e, y + e, z + e);
          let nx = a1 - a2 - a3 + a4;
          let ny = -a1 - a2 + a3 + a4;
          let nz = -a1 + a2 - a3 + a4;
          const nl = length3(nx, ny, nz) || 1;
          nx /= nl;
          ny /= nl;
          nz /= nl;

          const m = scene.material ? scene.material(x, y, z) : DEFAULT_MAT;
          let diff = LI * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
          // Blinn highlight.
          let hx = L[0] - dx;
          let hy = L[1] - dy;
          let hz = L[2] - dz;
          const hl = length3(hx, hy, hz) || 1;
          let spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 28) * (m.s ?? 0.4);
          if (scene.lights) {
            for (const pl of scene.lights) {
              let lx = pl.x - x;
              let ly = pl.y - y;
              let lz = pl.z - z;
              const ll = length3(lx, ly, lz);
              const fall = pl.i / (1 + ll * ll * 3);
              diff += Math.max(0, (nx * lx + ny * ly + nz * lz) / ll) * fall;
            }
          }
          // A little rim light keeps silhouettes readable in symbols.
          const rim = Math.pow(1 - Math.max(0, -(nx * dx + ny * dy + nz * dz)), 3) * 0.25;
          const c = m.c ?? 0.85;
          sum += (m.e || 0) + c * (amb + diff * (1 - amb)) + spec + rim * c;

          if (ids && sj === (ss >> 1) && si === (ss >> 1)) ids[j * W + i] = scene.id(x, y, z);
        }
      }
      px.v[j * W + i] = Math.min(1, sum / (ss * ss));
    }
  }
}

// Render, but adapt to the device: drop to one ray per cell, and then to
// every other frame, if rendering is eating the frame budget.
export function paint(scene, cam, px, opts = {}) {
  if (px.wait > 0) {
    px.wait--;
    return;
  }
  const t0 = performance.now();
  render(scene, cam, px, { ss: px.ss || 2, ...opts });
  const ms = performance.now() - t0;
  if (ms > 12 && (px.ss || 2) > 1) px.ss = 1;
  px.wait = ms > 26 ? 2 : ms > 15 ? 1 : 0;
}
