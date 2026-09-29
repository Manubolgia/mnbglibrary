# MNBG Tape Library

Every Manubolgia game on one pocket tape deck. The screen is an old
dot-matrix display. Skip between games the way you'd skip tracks, read the
player count, the play time and a short description, then press play to load
the game. The eject button brings you back.

It installs to the home screen as its own app and works offline. There's no
build step: `web/` is served as it is.

---

## How it works

- **The screen** is a 30 × 22 grid of characters. Each character is drawn
  from a hand-made 5 × 7 dot-matrix font as glowing dots, with the unlit dots
  faintly visible behind. Lit dots fade out over a few frames, like a real
  vacuum-fluorescent display. The animation window is a finer 60 × 20 grid of
  the same font at half size, so pictures get four times the detail while the
  text stays big.
- **The animations ("tapes")** are real 3D scenes rendered into characters.
  A small ray marcher ([`web/js/sdf.js`](web/js/sdf.js)) renders each scene,
  and every cell's brightness picks a symbol (` .:-=+*#%@`). Each game has
  one:
  - a bull watching cards land until the sixth takes the row;
  - a torch-lit stepped temple with an explorer and rockfalls;
  - a model railway with a flyover and thrown dice;
  - a cut gem turning in the light;
  - a derelict ship venting air as its cabin lights die, all but two;
  - a pencil finishing a puzzle on squared paper before a fresh sheet,
    and a new puzzle number, slides in.

  Games without their own get a turning cassette with their name on the
  label.
- **Launching a game** loads it in a full-screen frame over the deck. The
  games live next to the library on the same site
  (`manubolgia.github.io/6nimmt/`, `/MnbGold/`, …) but outside this app's
  own path. An installed iPhone app opens outside pages in a Safari sheet, so
  the frame is what keeps them inside the app. It also means:
  - the games need no changes;
  - they always run their latest deploy;
  - they keep their own saved names, seats and offline caches.
- **Getting back**: each game has a "Back to the library" button on its
  home screen, shown only when it runs inside the library. Android's back
  button (and Esc) asks "Eject?" first. On iPhone, the edge swipe does
  nothing, so nobody gets thrown out mid-game by accident.
- **Edge to edge**: a framed page isn't told where the notch and home bar
  are. The library measures them and passes them in as CSS variables, so a
  game fills the screen exactly as it does on its own.
- **Always current**: before loading a game, the library has the game's
  service worker fetch any update (the loading screen covers the wait), so
  the frame never opens a stale copy.

| Control | Does |
| --- | --- |
| REW / FF keys, swipe the screen, ← / → | previous / next game |
| PLAY key, Enter, Space | play the selected game |
| the game's "Back to the library", Esc / Android back (asks first) | eject and return to the deck |
| BEEP switch | beeps and tape noises on or off |

## Adding a game

Add an entry to [`web/games.json`](web/games.json):

```json
{
  "id": "deep-temple",
  "title": "Deep Temple",
  "short": "DEEP TEMPLE",
  "url": "../MnbGold/",
  "players": "2-10",
  "minutes": 30,
  "tape": "temple",
  "tint": "#ffb347",
  "description": "Push deeper into the temple or run home with your gems..."
}
```

| Field | Meaning |
| --- | --- |
| `id` | lowercase, digits and dashes. Used in the link: `…/mnbglibrary/#deep-temple` |
| `title` | shown on the screen, scrolling if it is longer than 30 characters. Use your own name for the game, not the published one |
| `short` | optional: label on the fallback cassette |
| `url` | where the game lives, relative to the library. Games on this GitHub account are siblings: `../<repo>/` |
| `players` | text, e.g. `2-10` or `2` |
| `minutes` | typical play time |
| `tape` | the animation, a file in `web/js/tapes/`. Leave it out and the game gets a cassette with its name on the label and turning reels |
| `tint` | the screen colour while this game is selected |
| `description` | a sentence or three. It is shown three lines at a time |

A new game works immediately with the fallback cassette, and a slim ⏏ tab
on the screen edge to get back. Drawing it a proper tape, and giving it its
own way back, are optional.

### A way back inside the game

The library loads games in a frame named `mnbglibrary`. A game can check
for that and show a button, ideally on its home screen so nobody leaves
mid-round by accident. The button tells the library to eject. Saying hello on
load hides the library's ⏏ tab. Until a game says hello, even a stale cached
copy, the tab stays, so there's always a way out.

```js
const inLibrary = window.parent !== window && window.name === 'mnbglibrary';
if (inLibrary) window.parent.postMessage({ type: 'mnbglibrary:hello', exit: true }, location.origin);
// on the button:
window.parent.postMessage({ type: 'mnbglibrary:eject' }, location.origin);
```

A game on this site can also call the deck directly, which doesn't depend on
the message getting through:

```js
try { window.parent.mnbglibrary.eject(); } catch { /* fall back to the message */ }
```

For the notch and home bar, use `var(--mnbg-safe-top, env(safe-area-inset-top))`
(and `-right`, `-bottom`, `-left`) wherever the game would use
`env(safe-area-inset-*)`. On its own it behaves the same; in the library it
gets the real values.

Games from anywhere else can be listed too, but `url` then points to another
site. Browsers keep separate storage per site, and some sites refuse to be
framed, so a game on this account is the smooth path.

### Drawing a tape

A tape is a module in `web/js/tapes/` whose default export takes the game and
returns a draw function. That function is called every frame:

```js
import { Pixels, blit } from '../gfx.js';
import { paint, camera, sphere } from '../sdf.js';

export default function create(game) {
  const px = new Pixels(60, 20);
  const scene = {
    bound: { x: 0, y: 0, z: 0, r: 1.2 },   // everything fits in here
    map: (x, y, z) => sphere(x, y, z, 1), // distance to the surface
  };
  return (f, box, t, dt, big) => {
    // f: the fine 60 x 20 grid; big: 30 x 10 big-text cells over it
    // t: seconds since this game was selected; dt: seconds since last frame
    const cam = camera(Math.sin(t) * 3, 0.5, Math.cos(t) * 3, 0, 0, 0);
    paint(scene, cam, px); // ray-march the scene
    blit(f, px, box.x, box.y); // brightness -> symbols
    big.text(0, 0, 'HELLO', 0.7); // readable text on top
  };
}
```

[`sdf.js`](web/js/sdf.js) has the shapes: `sphere`, `ellipsoid`, `box`,
`cylinder`, `torus`, `cone`, with `smin`/`smax` for smooth joins and cuts.
Scenes can also define:
- `material()`, for brightness, shine and glow;
- `lights`, for point lights such as torches;
- `project()`, which places text or particles on a 3D point.

`paint` drops to fewer rays per cell, or skips frames, on a slow phone.

The characters the font draws are in [`web/js/font.js`](web/js/font.js). They
cover A–Z, 0–9 and punctuation, plus blocks (`█▓▒░▀▄▌▐▬`), box drawing
(`─│┌┐└┘├┤┬┴┼═║╔╗╚╝╪╫`) and symbols (`▶◀▲▼■□●○◆◇♥★♪°·`).

`node tools/check.mjs` plays every tape for two minutes and fails if one
throws or draws outside its box. CI runs it before every deploy.

## Layout

```
web/                  the app, served as is
  index.html          the deck
  styles.css          the case, the display window, the piano keys
  games.json          the catalogue
  sw.js               offline shell (only ever clears its own caches)
  manifest.webmanifest
  icons/              generated by tools/make-icons.mjs
  js/
    app.js            modes, controls, the game frame, eject
    display.js        the dot-matrix renderer (main grid + fine grid)
    font.js           the 5×7 font
    sdf.js            the 3D ray marcher the tapes render with
    gfx.js            pixel buffer -> symbols
    audio.js          synthesised beeps and tape noises
    tapes/            one animation per game, plus reels.js (the fallback)
tools/
  check.mjs           catalogue + tape + offline-shell checks
  make-icons.mjs      draws the icons with the app's own font
```

## Deploy

1. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
2. Push to `main`. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
   runs the checks and publishes `web/` to
   `https://manubolgia.github.io/mnbglibrary/`.

Open that on the phone and add it to the home screen: on iPhone, **Share →
Add to Home Screen**; on Android, the **Install** button on the deck.

## Running locally

The library expects the games to be its siblings, the way Pages serves them.
Put the checkouts side by side under one folder, the way Pages lays them out,
and serve that folder:

```
site/
  mnbglibrary/      -> mnbglibrary/web
  6nimmt/           -> 6nimmt/web
  Mnbg-road/        -> Mnbg-road/web
  manubolgia-duel/  -> manubolgia-duel
  MnbGold/          -> MnbGold/dist   (after npm run build with BASE_PATH=/MnbGold/)
  mnbg-papergames/  -> mnbg-papergames/web
```

```sh
npx http-server site -c-1
# open http://localhost:8080/mnbglibrary/
```
