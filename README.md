# HoppiTTy Hop

An endless hopper in the spirit of Crossy Road, starring Teddy and Tommy, built with Claude Code from plain JavaScript and Three.js.
Hop across a chunky voxel world of meadows, busy roads, rivers with logs and lily pads, and subway tracks with fast trains.
There are no image, model or audio files: every block is a coloured box, the kids come from the shared kit, and every sound is synthesised.

The name is a working title and lives in one constant, `window.CROSSY_TITLE` in `js/title.js` (the logo and the page title come from it).

## Play

- **Double-click `index.html`.** It works offline because Three.js and the kit are copied into `kit/`.
- **Send one file:** `dist/crossy-teddy.html` is the whole game in one page (about 760 KB). AirDrop or email it, then open it in a browser.
- Rebuild that file after any edit: `python3 kit/tools/bundle.py . --name crossy-teddy`
- The two fonts load from Google Fonts when online. Offline, the game falls back to Arial Black and the system font.

| Keys | Touch / mouse | |
|---|---|---|
| ↑ W or Space | tap anywhere, or swipe up | hop forward |
| ← → or A D | swipe left / right | hop sideways (on the title screen: pick a hopper) |
| ↓ S | swipe down | hop back (up to 4 rows behind your best) |
| T | buddy button (bottom right) or his card on the title | call your buddy, the other brother: any time, as often as you like |
| E | 🐣 button | easy mode on or off (title screen) |
| P or Esc | ❚❚ button | pause |
| M | 🔊 button | sound on or off |
| Enter or Space | PLAY / HOP AGAIN | start a run |

A swipe hops as soon as it's clear which way it goes, without waiting for the finger to lift. A hop pressed while you're still in the air is remembered and happens when you land.

## How it works

- **Pick a hopper** on the title screen: TEDDY and TOMMY (modelled on their photos, from the kit roster), then ZOOM, LUNA, BOLT the robot, BRUNO the bear and the ZOMBIE.
  Behind the menu the picked kid hops across the world on autopilot.
- **The rows:**
  - **grass** with blocky trees and rocks (you can't hop into them);
  - **roads** with cars, ice-cream trucks and buses (each lane has one kind, all going the same way);
  - **rivers** with floating logs that carry you along (don't ride off the edge) and lily pads that stay put;
  - **subway tracks**: the red lights flash and a bell rings before a fast train comes through.
- **Score** is the furthest row you've reached. Coins sit on some grass and road cells. Each hopper keeps their own best score (normal and easy are kept apart),
  and the title screen shows all the coins you've collected so far.
- **Every 25 rows is a party:** a safe grass row with "★ 25 ★" painted on it and flags at the edges. Landing there sets off confetti, "25 ROWS! 🎉"
  and a signature move. Tommy does his Y pose with peace fingers. Teddy boxes Mike Tyson-style at 25, 75, … and does his basketball jump shot (🏀, SWISH) at 50, 100, ….
  Everyone else waves. Any hop carries straight on.
- **Getting hit is cartoon style.** A car, truck, bus or train flattens you with a "POW!" and circling stars. Falling in the river is a "SPLASH!", and you bob back up in a swim ring, waving.
  Then the card says BUSTED! or SPLASH! and what got you ("🍦 THE ICE-CREAM TRUCK!").
- **The inspector and his dog** (the friendly inspector from Metro Surfer, with a spotty pup of our own): if you don't hop forward for 5 s (8 s in easy),
  a whistle blows, "KEEP HOPPING!" shows, and they come walking in along your row from the side. Hop forward and they head off again.
  If they reach you (9 s, or 13 s in easy), the dog bounds up and you're BUSTED. No eagles, nothing scary.
- **Your buddy is the other brother**, like in the other games: Tommy hops along with everyone, and Teddy comes when Tommy is the one playing.
  Tap the big button with his face (bottom right), his dashed card on the title screen, or press T. He hops in from behind and, for about 10 s,
  hops along right beside you a beat after you, wearing a name tag. He stands on top of trees and rocks, jumps over cars and trains, and floats across water in his swim ring.
  He says hi with his signature move (Tommy's Y, Teddy's boxing), hands over a treat (🍦 💧 🧃 🍪 🍉 🍌, "🍦 ICE CREAM FROM TOMMY!") that flies into your hand,
  says bye (Tommy's Y again, or Teddy's jump shot) and hops off. Tap again after his treat and he says hi again and brings another one.
  **He has your back:** while he's with you (until he says bye, about 9.6 s; his bar shows the time left and his button glows), getting hit or falling in
  doesn't end the run. "TOMMY SAVED YOU!" pops up and you bounce back to safe grass behind you (usually just one row), blinking safe for a moment.
  If the inspector arrives while your buddy's there, he waves him off ("NOT TODAY, INSPECTOR!").
- **Easy mode (🐣)** has slower cars with wider gaps, longer slower logs, more lily pads, trains 8.5 to 11.5 s apart instead of 4.6 to 8.5 s with a longer warning,
  fewer lanes at a time, and a more patient inspector. It's on by default for Tommy and remembered per hopper.
- **Difficulty** grows gently over the first 200 rows: faster cars, shorter logs, more lanes and tracks in a row. To change the feel, edit `MODES` at the top of `js/world.js`.

## Fairness check

Every stretch of the world is made by one generator (`js/world.js`) and checked before it's used. A **crossing search** steps through time in 0.05 s
steps from a few random moments, and checks that a kid can always get from one grass row across the next road, river or set of tracks to the next grass row
before the inspector's patience runs out. It follows the game's own rules: hops take 0.15 s, logs carry you, lily pads stay still, there's no hopping into trees,
cars count as a little longer and logs a little shorter than they are, and trains need a clear 0.3 s either side. A stretch that fails is thrown away and made again.
Every 25th row is always grass.

Run the check headless, with no browser:

```bash
node tools/check.js
```

```bash
node tools/check.js --worlds 40
```

```bash
node tools/check.js --broken
```

For each world it measures the shortest gap between trains and the shortest gap between cars, then walks the whole course zone by zone with the crossing search
from 10 fresh random moments per zone (independently of the generator's own check). The last runs:

- **Normal and easy, 20 worlds of 300 rows each:** every zone crossable. The shortest clear gap between trains was 4.0 s (normal) and 7.9 s (easy).
- **`--broken`** (cars bumper to bumper, tiny logs, trains every 2 s): reports zones that can't be crossed. This proves the check can fail.

In the browser console there are two more checks:

- `game.check()` runs the same fairness check.
- `game.soak(240, { mode: 'easy', seed: 7 })` plays 4 minutes headless with the autopilot, using the real game code, and logs every way a run ended.
  The autopilot plans with the same crossing search, so any crash means the game and the search disagree. Last run: 0 crashes, 0 splashes and 0 catches over
  about 4,000 rows (normal and easy, three seeds each). `game.soak(30, { auto: false })` stands still and gets caught every 9 s, which proves the soak can fail.

Other test hooks: `game.step(seconds, { auto })` advances the game and draws synchronously (the Browser pane throttles animation when hidden),
`game.hold()` (stop real-time ticking), `game.keepAwake()` (don't auto-pause when hidden), `game.start(id)`, `game.hop('up' | 'left' | 'right' | 'down')`,
`game.buddy()`, `game.state()`, `game.rows()` (the rows ahead as letters), `game.teleport(row)`, `game.crash(kind)` and `game.peek(zoom)` for close-ups.

## Files

```
index.html       page, HUD and screens (CSS inline)
js/title.js      the game's name (one constant)
js/content.js    the inspector's look (same as Metro Surfer's), the treats and the game-over lines
js/world.js      rows, cars, logs, trains, the zone generator, the crossing search, the autopilot's planner and the fairness check (no Three.js; runs in Node too)
js/art.js        the voxel builder (each row is one mesh), cars, ice-cream trucks, buses, logs, trains, signal lights, coins, the dog, the swim ring, particles, POW! bursts
js/hero.js       a hopping kid: Kit person + hop squash, squish, splash and swim ring, celebrations with the 🏀
js/game.js       hopping and landing, the inspector, the buddy, milestones, camera, HUD and screens, input, autopilot, test hooks
tools/check.js   the headless fairness check (node tools/check.js)
kit/             copy of ~/claude-games/kit (python3 ../kit/tools/sync.py .); don't edit it here
dist/crossy-teddy.html   the single-page build
```

## Kit candidates

These are written here first. They're worth moving into `~/claude-games/kit` if another game wants them:

- **Voxel builder** (`Vox` in `js/art.js`): boxes with per-face shaded vertex colours merged into one geometry. A whole row with trees costs one draw call.
- **A hex-returning `shade`** (`js/art.js`): `Kit.gfx.shade` returns `rgb(...)`, which can't be shaded again (it silently turns black). Worth fixing in the kit.
- **Voxel particles** (`makeParticles` in `js/art.js`): an `InstancedMesh` of little cubes with per-cube colour, gravity and spin.
- **Comic bursts** (`burstTexture` in `js/art.js`): a starburst with a word (POW!, SPLASH!, SAVED!, BUSTED!). KOF Teddy has a similar one.
- **The swim ring** (`buildRing`) and **a second dog** (`buildDog`, a spotty pup with a wagging tail) in `js/art.js`.
- **Standing celebrations** (`standPose` in `js/hero.js`), the same idea as FlaTTy Birds': `wave` and `peace` stride while posing, and this settles the legs.
- **The crossing search** (`search` in `js/world.js`): a breadth-first search through time over a grid with moving hazards. It's generic enough for any lane-crossing game.

## Not verified

- **Sound:** the effects (hop, plop, squish, splash, bell, train horn, whistle, woof, boing) and the music are wired to the kit, but nobody listened in this build.
- **Real touch devices:** taps and swipes were tested with synthetic pointer events at phone size (375×812) in the Browser pane, not on a real iPhone or iPad.
- **Performance on older iPads:** shadows are on (2048 map) and each row is one mesh. It ran smoothly on a Mac, but it hasn't been measured on a tablet.
