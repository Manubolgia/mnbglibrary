#!/usr/bin/env node
// Sanity checks run before every deploy:
//   - games.json is well formed and every game names a tape that exists,
//   - every tape plays for a couple of minutes without throwing or drawing
//     at impossible positions,
//   - every file the service worker precaches is really there.
//
//   node tools/check.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../web/', import.meta.url));
const problems = [];
const fail = (msg) => problems.push(msg);

// ---- the catalogue --------------------------------------------------------

const { games } = JSON.parse(readFileSync(WEB + 'games.json', 'utf8'));
if (!Array.isArray(games) || !games.length) fail('games.json: "games" must be a non-empty list');
const ids = new Set();
for (const g of games || []) {
  const where = `games.json: ${g.id || '(no id)'}`;
  for (const key of ['id', 'title', 'url', 'players', 'description']) {
    if (!g[key]) fail(`${where}: missing "${key}"`);
  }
  if (g.id && !/^[a-z0-9-]+$/.test(g.id)) fail(`${where}: id must be lowercase letters, digits and dashes`);
  if (ids.has(g.id)) fail(`${where}: duplicate id`);
  ids.add(g.id);
  if (g.minutes !== undefined && !(Number.isInteger(g.minutes) && g.minutes > 0)) fail(`${where}: "minutes" must be a whole number`);
  if (g.tint !== undefined && !/^#[0-9a-f]{6}$/i.test(g.tint)) fail(`${where}: "tint" must look like #5ff5e6`);
  if (g.tape && !existsSync(`${WEB}js/tapes/${g.tape}.js`)) fail(`${where}: no tape web/js/tapes/${g.tape}.js`);
  if (g.exit !== undefined && g.exit !== 'game') fail(`${where}: "exit" is either "game" or left out`);
}

// ---- the tapes ------------------------------------------------------------

// Tapes draw on the fine grid (60 x 20) and may put big text over it, in
// main-grid cells counted from the tape's corner (30 x 10).
const BOX = { x: 0, y: 0, w: 60, h: 20 };
const BIG = { w: 30, h: 10 };
for (const file of readdirSync(WEB + 'js/tapes')) {
  if (!file.endsWith('.js')) continue;
  const name = file.replace(/\.js$/, '');
  try {
    const mod = await import(`${WEB}js/tapes/${file}`);
    const draw = mod.default({ id: 'test', title: 'Test Game', short: 'TEST GAME' });
    let outside = null;
    // Both grids clip, so drawing off the edge is harmless; this catches
    // values that are not numbers at all, which would draw nothing.
    const grid = (w, h, name) => ({
      put(x, y, ch) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) outside = [x, y, ch, name];
      },
      text(x, y, s) {
        [...String(s)].forEach((c, i) => this.put(x + i, y, c));
      },
      center(y, s) {
        const a = [...String(s)];
        this.text(Math.floor((w - a.length) / 2), y, s);
      },
    });
    const fine = grid(BOX.w, BOX.h, 'fine');
    const big = grid(BIG.w, BIG.h, 'big');
    for (let t = 0; t < 120; t += 1 / 30) {
      draw(fine, BOX, t, 1 / 30, big);
      if (outside) {
        fail(`tape ${name}: drew '${outside[2]}' on the ${outside[3]} grid at ${outside[0]},${outside[1]} (t=${t.toFixed(2)})`);
        break;
      }
    }
  } catch (err) {
    fail(`tape ${name}: ${err.stack || err}`);
  }
}

// ---- the service worker's shell -------------------------------------------

const sw = readFileSync(WEB + 'sw.js', 'utf8');
const shell = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shell) fail('sw.js: could not find SHELL');
for (const [, path] of shell ? shell[1].matchAll(/'([^']+)'/g) : []) {
  if (path === './') continue;
  if (!existsSync(WEB + path.replace(/^\.\//, ''))) fail(`sw.js precaches ${path}, which does not exist`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${games.length} games, all tapes play, service worker shell complete`);
