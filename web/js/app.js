// The tape deck: skip through the library like tracks, press play to load a
// game into the player, eject to come back.
//
// Games run in a full-screen frame over the deck rather than as a separate
// page. They share this origin (<user>.github.io) but sit outside this app's
// scope, and an installed iPhone app opens out-of-scope pages in a Safari
// sheet; a frame keeps them inside the app, needs no change to the games, and
// always shows their latest deploy.

import { Display } from './display.js';
import { sound } from './audio.js';
import { RAMP, hash } from './gfx.js';

const COLS = 30;
const ROWS = 22;
const TAPE = { x: 0, y: 2, w: 30, h: 10 };
const TRACK_KEY = 'mnbglibrary.track';
const EJECT_KEY = 'mnbglibrary.eject';
const DEFAULT_TINT = '#5ff5e6';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (id) => document.getElementById(id);
const canvas = $('screen');
const display = new Display(canvas, COLS, ROWS, TAPE);
const FINE = { x: 0, y: 0, w: TAPE.w * 2, h: TAPE.h * 2 };

// Big text over a tape, in main-grid cells counted from the tape's corner. It
// blanks the fine cells underneath so it stays readable over the picture.
const big = {
  put(x, y, ch, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= TAPE.w || y >= TAPE.h) return;
    for (let k = 0; k < 4; k++) display.fine.put(x * 2 + (k & 1), y * 2 + (k >> 1), ' ');
    display.put(TAPE.x + x, TAPE.y + y, ch, a);
  },
  text(x, y, str, a = 1) {
    [...String(str)].forEach((ch, i) => big.put(x + i, y, ch, a));
  },
  center(y, str, a = 1) {
    const s = [...String(str)];
    big.text(Math.floor((TAPE.w - s.length) / 2), y, str, a);
  },
};

const state = {
  games: [],
  index: 0,
  mode: 'boot', // boot | deck | loading | playing
  since: 0, // when the current mode or track started, in seconds
  staticUntil: 0,
  tape: null,
  tapeFor: null,
  message: null, // { text, until }
  frameLoaded: false,
  installPrompt: null,
  loaded: false, // the catalogue has been read (possibly empty)
};

const modules = new Map();
const now = () => performance.now() / 1000;

// ---- the catalogue ------------------------------------------------------

async function loadGames() {
  try {
    const res = await fetch('games.json', { cache: 'no-cache' });
    const data = await res.json();
    return (data.games || []).filter((g) => g && g.id && g.url && g.title);
  } catch {
    return [];
  }
}

async function tapeFor(game) {
  const name = /^[a-z0-9-]+$/.test(game.tape || '') ? game.tape : 'reels';
  if (!modules.has(name)) {
    modules.set(
      name,
      import(`./tapes/${name}.js`).catch(() => import('./tapes/reels.js')),
    );
  }
  const mod = await modules.get(name);
  return mod.default(game);
}

function select(index, { quiet = false } = {}) {
  const n = state.games.length;
  if (!n) return;
  state.index = ((index % n) + n) % n;
  const game = state.games[state.index];
  state.since = now();
  state.tape = null;
  state.tapeFor = game.id;
  if (!quiet && !reduceMotion) state.staticUntil = now() + 0.28;
  display.setTint(game.tint || DEFAULT_TINT);
  document.documentElement.style.setProperty('--tint', game.tint || DEFAULT_TINT);
  tapeFor(game).then((draw) => {
    if (state.tapeFor === game.id) state.tape = draw;
  });
  try {
    localStorage.setItem(TRACK_KEY, game.id);
  } catch {}
  if (location.hash.slice(1) !== game.id && state.mode !== 'playing') {
    history.replaceState(history.state, '', `#${game.id}`);
  }
  $('sr').textContent =
    `Track ${state.index + 1} of ${n}: ${game.title}. ${players(game)} players, about ${game.minutes || '?'} minutes. ${game.description || ''}`;
}

const players = (g) => String(g.players || '?');

// ---- drawing ------------------------------------------------------------

function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').toUpperCase().split(/\s+/)) {
    if (!word) continue;
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(line);
      line = word.slice(0, width);
    } else {
      line = (line + ' ' + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

const mmss = (s) => `${String(Math.floor(s / 60) % 100).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function statusBar(t) {
  const d = display;
  const n = state.games.length;
  d.put(0, 0, state.mode === 'loading' ? '▶' : '■', 0.9);
  d.text(2, 0, `${String(state.index + 1).padStart(2, '0')}/${String(n).padStart(2, '0')}`, 0.8);
  if (sound.on) d.put(9, 0, '♪', 0.6);
  if (!navigator.onLine) d.text(11, 0, 'NO SIGNAL', Math.floor(t * 2) % 2 ? 0.9 : 0.4);
  const clock = new Date();
  const hh = String(clock.getHours()).padStart(2, '0');
  const mm = String(clock.getMinutes()).padStart(2, '0');
  d.text(COLS - 5, 0, `${hh}${Math.floor(t) % 2 ? ':' : ' '}${mm}`, 0.8);
  d.hline(1);
}

function drawDeck(t, dt) {
  const d = display;
  const game = state.games[state.index];
  const s = t - state.since;
  statusBar(t);

  if (state.tape) {
    try {
      state.tape(d.fine, FINE, s, dt, big);
    } catch (err) {
      console.error(err);
      state.tape = null;
    }
  }
  d.hline(12);

  d.center(13, game.title.toUpperCase(), 1, s);
  d.center(14, `PLAYERS ${players(game)}  ·  ${game.minutes ? `${game.minutes} MIN` : '-- MIN'}`, 0.7);

  // Track time: a running counter against the game's length.
  const total = (game.minutes || 30) * 60;
  const bar = 18;
  const filled = Math.min(bar, Math.floor(((s % total) / total) * bar));
  d.text(0, 15, mmss(s), 0.7);
  for (let i = 0; i < bar; i++) d.put(6 + i, 15, i < filled ? '▬' : i === filled ? '●' : '─', i <= filled ? 0.9 : 0.3);
  d.text(COLS - 5, 15, mmss(total), 0.7);

  // The description, three lines at a time.
  const lines = wrap(game.description, COLS);
  const pages = Math.max(1, Math.ceil(lines.length / 3));
  const page = Math.floor(s / 5) % pages;
  for (let i = 0; i < 3; i++) {
    const line = lines[page * 3 + i];
    if (line) d.text(0, 17 + i, line, 0.55);
  }

  footer(t);
}

function footer(t) {
  const d = display;
  if (state.message && t < state.message.until) {
    d.center(ROWS - 1, state.message.text, Math.floor(t * 4) % 2 ? 1 : 0.6);
    return;
  }
  const hint = installHint();
  if (hint && Math.floor(t / 4) % 2) {
    d.marquee(ROWS - 1, hint, 0.8, t);
    return;
  }
  d.text(0, ROWS - 1, '◀◀ PREV', 0.5);
  d.text(COLS - 7, ROWS - 1, 'NEXT ▶▶', 0.5);
  d.text(11, ROWS - 1, '▶ PLAY', Math.floor(t * 1.6) % 2 ? 1 : 0.45);
}

function installHint() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return null;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'INSTALL: SHARE > ADD TO HOME SCREEN';
  if (state.installPrompt) return 'INSTALL: TAP INSTALL BELOW';
  return null;
}

function drawStatic(t, amount) {
  // Tape hiss between tracks: the picture breaks up into random symbols.
  const d = display;
  const chars = [...RAMP];
  const frame = Math.floor(t * 30);
  for (let y = 2; y < ROWS - 1; y++) {
    for (let x = 0; x < COLS; x++) {
      const h = hash(x * 17 + y * 131 + frame * 7);
      if (h < amount) d.put(x, y, chars[1 + Math.floor(hash(h * 999) * (chars.length - 1))], 0.3 + h * 0.7);
    }
  }
}

function drawBoot(t) {
  const d = display;
  const s = t - state.since;
  const n = state.games.length;
  const lines = [
    [0.1, 'MNBG TAPE LIBRARY', 1],
    [0.45, 'TL-01  ·  SELF TEST ..... OK', 0.6],
    [0.8, 'READING CATALOGUE ....... OK', 0.6],
    [1.15, `${String(n).padStart(2, '0')} TAPES FOUND`, 0.9],
  ];
  lines.forEach(([at, text, a], i) => {
    if (s < at) return;
    const shown = Math.min(text.length, Math.floor((s - at) * 60));
    if (i === 0) d.center(4, text.slice(0, shown), a);
    else d.text(1, 6 + i * 2, text.slice(0, shown), a);
  });
  const bar = 26;
  const done = Math.min(bar, Math.floor((s / 1.6) * bar));
  for (let i = 0; i < bar; i++) d.put(2 + i, 15, i < done ? '█' : '░', i < done ? 0.8 : 0.25);
  d.center(17, 'PRESS ANY KEY', s > 0.6 && Math.floor(s * 3) % 2 ? 0.6 : 0);
  if (s > 1.9 && state.loaded) enterDeck();
}

function drawEmpty(t) {
  const d = display;
  statusBar(t);
  d.center(8, 'NO TAPE', 1);
  d.center(10, 'CATALOGUE COULD NOT BE READ', 0.6);
  d.center(12, 'CHECK THE CONNECTION', 0.6);
}

function drawLoading(t) {
  const d = display;
  const game = state.games[state.index];
  const s = t - state.since;
  statusBar(t);
  const spin = '|/─\\'[Math.floor(s * 10) % 4];
  d.center(5, `${spin}  LOADING  ${spin}`, 1);
  d.center(7, game.title.toUpperCase(), 0.9, s);
  const bar = 24;
  const target = state.frameLoaded ? 1 : Math.min(0.85, s / 2.5);
  const filled = Math.floor(target * bar);
  for (let i = 0; i < bar; i++) d.put(3 + i, 10, i < filled ? '█' : '░', i < filled ? 0.9 : 0.25);
  d.center(12, 'INSERTING TAPE', 0.5);
  d.center(ROWS - 1, 'PLEASE WAIT', 0.5);
  if (state.frameLoaded && s > 1.1) showFrame();
  else if (s > 15) showFrame();
}

// ---- the loop -------------------------------------------------------------

let last = 0;
let raf = 0;

function frame(ms) {
  raf = requestAnimationFrame(frame);
  const t = ms / 1000;
  // Thirty frames a second is plenty for a character display, and kinder on
  // the battery than whatever the screen refresh happens to be.
  if (t - last < 1 / 31) return;
  const dt = Math.min(0.1, t - (last || t));
  last = t;
  display.clear();
  if (state.mode === 'boot') drawBoot(now());
  else if (!state.games.length) drawEmpty(now());
  else if (state.mode === 'loading') drawLoading(now());
  else drawDeck(now(), dt);
  const hiss = state.staticUntil - now();
  if (hiss > 0) drawStatic(now(), Math.min(1, hiss / 0.28) * 0.85);
  display.render(ms);
}

function start() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

// ---- actions --------------------------------------------------------------

function enterDeck() {
  if (state.mode !== 'boot' || !state.loaded) return;
  state.mode = 'deck';
  const fromHash = location.hash.slice(1).split('/')[0];
  let saved = null;
  try {
    saved = localStorage.getItem(TRACK_KEY);
  } catch {}
  const want = fromHash || saved;
  const found = state.games.findIndex((g) => g.id === want);
  select(found >= 0 ? found : 0, { quiet: false });
}

function skip(step) {
  if (state.mode === 'boot') return enterDeck();
  if (state.mode !== 'deck' || !state.games.length) return;
  sound.skip();
  buzz();
  select(state.index + step);
}

function play() {
  if (state.mode === 'boot') return enterDeck();
  if (state.mode !== 'deck' || !state.games.length) return;
  const game = state.games[state.index];
  sound.play();
  buzz();
  state.mode = 'loading';
  state.since = now();
  state.frameLoaded = false;
  $('play').classList.add('latched');

  const iframe = document.createElement('iframe');
  iframe.title = game.title;
  // Games look for this name to know they are in the library, and then offer
  // a way back on their home screen (see "Adding a game" in the README).
  iframe.name = 'mnbglibrary';
  iframe.allow = 'fullscreen; wake-lock; clipboard-read; clipboard-write; web-share; autoplay';
  iframe.addEventListener('load', () => {
    state.frameLoaded = true;
    matchBands();
  });
  iframe.src = new URL(game.url, location.href).href;
  const holder = $('frame');
  holder.replaceChildren(iframe);
  holder.style.background = '#000';
  // Games with their own way back don't need the floating eject tab.
  $('eject').hidden = game.exit === 'game';
  // No history entry: on iPhone a swipe from the edge would go "back" and
  // throw the player out mid-game. Android's back button asks first instead.
  watchBack();
}

// The frame is padded clear of the notch and the home bar (a framed page is
// not told about them). Paint that padding in the game's own background so
// the game still looks edge to edge; games change colour between screens and
// themes, so keep matching while one is open.
let bandTimer = 0;
function matchBands() {
  clearInterval(bandTimer);
  const paint = () => {
    const iframe = $('frame').querySelector('iframe');
    if (!iframe) return clearInterval(bandTimer);
    try {
      const doc = iframe.contentDocument;
      const clear = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
      let colour = getComputedStyle(doc.body).backgroundColor;
      if (clear(colour)) colour = getComputedStyle(doc.documentElement).backgroundColor;
      if (clear(colour)) colour = doc.querySelector('meta[name="theme-color"]')?.content;
      if (!clear(colour)) $('frame').style.background = colour;
    } catch {
      // A game on another site can't be looked into; black it is.
    }
  };
  paint();
  bandTimer = setInterval(paint, 1000);
}

// Android's back button (and Esc on a keyboard) asks before ejecting.
let backWatcher = null;
function watchBack() {
  if (backWatcher || !('CloseWatcher' in window)) return;
  try {
    backWatcher = new CloseWatcher();
    backWatcher.onclose = () => {
      backWatcher = null;
      if (state.mode === 'playing' || state.mode === 'loading') openConfirm();
    };
  } catch {
    backWatcher = null;
  }
}

function unwatchBack() {
  if (backWatcher) backWatcher.destroy();
  backWatcher = null;
}

// A game asking to go back to the library: eject straight away.
window.addEventListener('message', (e) => {
  const iframe = $('frame').querySelector('iframe');
  if (!iframe || e.source !== iframe.contentWindow || e.origin !== location.origin) return;
  if (e.data && e.data.type === 'mnbglibrary:eject') eject();
});

function showFrame() {
  if (state.mode !== 'loading') return;
  state.mode = 'playing';
  const player = $('player');
  player.hidden = false;
  requestAnimationFrame(() => player.classList.add('on'));
  document.body.classList.add('playing');
  const iframe = $('frame').querySelector('iframe');
  if (iframe) iframe.focus();
  stop();
}

function eject() {
  if (state.mode !== 'playing' && state.mode !== 'loading') return;
  const game = state.games[state.index];
  sound.eject();
  closeConfirm();
  unwatchBack();
  clearInterval(bandTimer);
  const player = $('player');
  player.classList.remove('on');
  player.hidden = true;
  $('frame').replaceChildren();
  document.body.classList.remove('playing');
  $('play').classList.remove('latched');
  state.mode = 'deck';
  state.since = now();
  state.staticUntil = reduceMotion ? 0 : now() + 0.35;
  state.message = { text: '⏏ TAPE EJECTED', until: now() + 2.2 };
  history.replaceState(null, '', `#${game.id}`);
  start();
  $('play').focus();
}

function openConfirm() {
  sound.click();
  const game = state.games[state.index];
  $('confirm-title').textContent = `Eject ${game.title}`;
  $('confirm').hidden = false;
  $('confirm-eject').focus();
}

function closeConfirm() {
  $('confirm').hidden = true;
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(8);
}

// ---- input ----------------------------------------------------------------

function press(el, fn) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    fn();
  });
}

press($('prev'), () => skip(-1));
press($('next'), () => skip(1));
press($('play'), play);
press($('sound'), () => {
  const on = sound.toggle();
  $('sound').setAttribute('aria-checked', String(on));
});
$('sound').setAttribute('aria-checked', String(sound.on));
press($('confirm-eject'), () => eject());
press($('confirm-cancel'), () => {
  sound.click();
  closeConfirm();
  watchBack();
});
press($('install'), async () => {
  const prompt = state.installPrompt;
  if (!prompt) return;
  state.installPrompt = null;
  $('install').hidden = true;
  prompt.prompt();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installPrompt = e;
  $('install').hidden = false;
});

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (state.mode === 'playing') {
    // With a CloseWatcher armed, Esc reaches it and it asks instead.
    if (e.key === 'Escape' && !backWatcher) ($('confirm').hidden ? openConfirm : closeConfirm)();
    return;
  }
  if (e.key === 'ArrowLeft') skip(-1);
  else if (e.key === 'ArrowRight') skip(1);
  else if ((e.key === 'Enter' || e.key === ' ') && !(e.target instanceof HTMLButtonElement)) play();
  else if (e.key === 'Escape' && state.mode === 'loading') eject();
  else if (state.mode === 'boot') enterDeck();
  else return;
  e.preventDefault();
});

// Swipe the screen sideways to skip; tap it to skip the boot.
let swipe = null;
canvas.addEventListener('pointerdown', (e) => {
  swipe = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  swipe = null;
  if (state.mode === 'boot') return enterDeck();
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) skip(dx < 0 ? 1 : -1);
});
canvas.addEventListener('pointercancel', () => {
  swipe = null;
});

window.addEventListener('popstate', () => {
  const id = location.hash.slice(1).split('/')[0];
  const i = state.games.findIndex((g) => g.id === id);
  if (state.mode === 'deck' && i >= 0 && i !== state.index) select(i);
});

// ---- the eject tab, for games without their own way back: a slim tab on
// the screen edge, dragged up and down (or across to the other edge) ------

function setupEject() {
  const btn = $('eject');
  let pos = null;
  try {
    pos = JSON.parse(localStorage.getItem(EJECT_KEY) || 'null');
  } catch {}
  const place = (p) => {
    const bw = btn.offsetWidth || 20;
    const bh = btn.offsetHeight || 56;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = p.side === 'left' ? 0 : w - bw;
    const y = Math.max(8, Math.min(h - bh - 8, p.y * h - bh / 2));
    btn.classList.toggle('left', p.side === 'left');
    btn.style.transform = `translate(${x}px, ${y}px)`;
  };
  pos = pos && (pos.side === 'left' || pos.side === 'right') ? pos : { side: 'right', y: 0.62 };
  place(pos);
  window.addEventListener('resize', () => place(pos));

  let drag = null;
  btn.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.moved = true;
    btn.classList.add('dragging');
    place({ side: e.clientX < window.innerWidth / 2 ? 'left' : 'right', y: e.clientY / window.innerHeight });
  });
  btn.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    btn.classList.remove('dragging');
    if (!moved) {
      openConfirm();
      return;
    }
    pos = { side: e.clientX < window.innerWidth / 2 ? 'left' : 'right', y: e.clientY / window.innerHeight };
    place(pos);
    try {
      localStorage.setItem(EJECT_KEY, JSON.stringify(pos));
    } catch {}
  });
  btn.addEventListener('pointercancel', () => {
    drag = null;
    btn.classList.remove('dragging');
    place(pos);
  });
  // Keyboard users get a plain button.
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openConfirm();
    }
  });
}

// ---- start ----------------------------------------------------------------

new ResizeObserver(() => display.resize()).observe(canvas);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else if (state.mode !== 'playing') start();
});

setupEject();
state.since = now();
start();

loadGames().then((games) => {
  state.games = games;
  state.loaded = true;
  if (reduceMotion) enterDeck();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
