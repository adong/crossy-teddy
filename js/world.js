/* HoppiTTy Hop: the world model. Rows of grass, roads, rivers and subway tracks; where every car, log and train is
   at any moment; the generator that lays out the rows; and the crossing search that proves each stretch can be
   crossed. It's pure logic with no Three.js, so the same file runs in the game, in the title-screen autopilot and
   headless in Node (tools/check.js).

   Coordinates: one cell = 1 unit. Row i sits at z = -i (forward is -z, the way the kit people face).
   Columns run from -COLS to COLS; x is continuous so a kid riding a log can be between columns. */
(function (root) {
  'use strict';

  const COLS = 4; // playable columns -4..4
  const EDGE = 16; // the world is drawn, and trains run, out to ±EDGE
  const LOOP = 44; // cars and logs go round a loop this long, wrapping out of sight
  const HOP_T = 0.15; // seconds per hop
  const HALF = 0.28; // half a kid's width, for getting hit
  const DT = 0.05; // the crossing search's time step (a hop is 3 steps)
  const MILESTONE = 25; // every 25th row is a party (always a safe grass row)
  const WIDTH = COLS * 2 + 1;

  // Kid-friendly settings. Ranges are [at the start, at full difficulty] (difficulty grows over the first 200 rows).
  const MODES = {
    normal: {
      carSpeed: [[1.4, 2.2], [2.2, 3.2]], carGap: [[3.4, 7.5], [2.6, 5.5]],
      logSpeed: [[0.8, 1.2], [1.2, 1.8]], logLen: [[3, 4], [2, 3]], logGap: [[1.0, 2.2], [1.4, 3.0]],
      trainPeriod: [[6.5, 8.5], [4.6, 6.6]], trainWarn: 1.5, trainSpeed: 28, trainCars: [3, 4],
      lanes: [2, 4], rivers: [2, 3], rails: [1, 2], trees: [2, 4], lily: 0.25,
      idleWarn: 5, idleCatch: 9,
    },
    easy: {
      carSpeed: [[0.9, 1.3], [1.3, 1.9]], carGap: [[4.6, 9], [3.8, 7.5]],
      logSpeed: [[0.6, 0.85], [0.8, 1.15]], logLen: [[4, 5], [3, 4]], logGap: [[0.8, 1.6], [1.0, 2.0]],
      trainPeriod: [[9.5, 11.5], [8.5, 10.5]], trainWarn: 2.4, trainSpeed: 22, trainCars: [3, 3],
      lanes: [1, 3], rivers: [1, 2], rails: [1, 1], trees: [1, 3], lily: 0.4,
      idleWarn: 8, idleCatch: 13,
    },
  };

  // What the crossing search allows for: cars count as a bit longer than they are, logs a bit shorter, and trains
  // need a clear 0.3 s either side, so every path it finds has room for a kid's timing.
  const SAFE = { pad: HALF + 0.2, trainPad: HALF, trainTime: 0.3, inset: 0.15 };
  // The autopilot looks for roomier paths first.
  const AUTO = { pad: HALF + 0.35, trainPad: HALF + 0.2, trainTime: 0.45, inset: 0.25 };
  // What the game itself uses: a little forgiving.
  const PLAY = { pad: HALF - 0.06, trainPad: HALF - 0.04, trainTime: 0, inset: -0.12 };

  const VEHICLES = {
    car: { len: 1.4, speed: 1 },
    truck: { len: 2.0, speed: 0.85 }, // the ice-cream truck
    bus: { len: 2.8, speed: 0.72 },
  };

  // ------------------------------------------------------------------ small helpers

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (x) => ((((x + LOOP / 2) % LOOP) + LOOP) % LOOP) - LOOP / 2;

  // ------------------------------------------------------------------ where things are

  const isLogs = (row) => row.type === 'river' && !row.lily;
  const objX = (row, o, t) => wrap(o.x0 + row.dir * row.speed * t);

  function vehicleAt(row, x, t, pad) {
    for (const o of row.objs) if (Math.abs(objX(row, o, t) - x) < o.len / 2 + pad) return o;
    return null;
  }

  // The index of the log under x (or -1). inset > 0 means "well inside the log"; < 0 forgives a near miss.
  function logAt(row, x, t, inset) {
    for (let k = 0; k < row.objs.length; k++) {
      const o = row.objs[k];
      if (Math.abs(objX(row, o, t) - x) <= o.len / 2 - inset) return k;
    }
    return -1;
  }

  // A train enters the screen every `period` seconds: train k's front reaches -dir*EDGE at time phase + k*period.
  function trainX(row, t) {
    const k = Math.floor((t - row.phase) / row.period);
    const t0 = row.phase + k * row.period;
    return -row.dir * (EDGE + row.len / 2) + row.dir * row.vt * (t - t0);
  }
  function trainAt(row, x, t, pad, time) {
    if (time) {
      for (const dt of [-time, -time / 2, 0, time / 2, time]) if (Math.abs(trainX(row, t + dt) - x) < row.len / 2 + pad) return true;
      return false;
    }
    return Math.abs(trainX(row, t) - x) < row.len / 2 + pad;
  }
  // The warning light: on from `warn` seconds before a train comes until it has gone by.
  function lightOn(row, t) {
    const k = Math.floor((t - row.phase) / row.period);
    const since = t - (row.phase + k * row.period);
    return since < (2 * EDGE + row.len) / row.vt || since > row.period - row.warn;
  }

  const blocked = (row, c) => row.type === 'grass' && row.block[c + COLS] > 0;
  const padAt = (row, c) => Math.abs(c) <= COLS && row.block[c + COLS] > 0;

  // Is standing (or being mid-hop) at x on this row at time t dangerous? (cars and trains; water is checked on landing)
  function danger(row, x, t, m) {
    if (row.type === 'road') return !!vehicleAt(row, x, t, m.pad);
    if (row.type === 'rail') return trainAt(row, x, t, m.trainPad, m.trainTime);
    return false;
  }

  // ------------------------------------------------------------------ the generator

  function create(seed, modeName, opts = {}) {
    const mode = MODES[modeName] || MODES.normal;
    const rng = mulberry32(seed);
    const R = (a, b) => a + rng() * (b - a);
    const RI = (a, b) => Math.floor(R(a, b + 1));
    const world = {
      seed, modeName, mode, rows: {}, next: 0, lo: -10, zone: 0, last: '', lastLogDir: 1,
      exits: null, // open columns reachable on the last generated row (always grass)
      stats: { zones: 0, retries: 0, fallbacks: 0, rows: { grass: 0, road: 0, river: 0, rail: 0 } },
      broken: !!opts.broken, checkZones: opts.checkZones !== false,
      row: (i) => world.rows[i],
    };
    const diff = (i) => clamp(i / 200, 0, 1);
    const range = (pair, d) => lerp(pair[0], pair[1], d);
    const between = (rr, d) => R(range([rr[0][0], rr[1][0]], d), range([rr[0][1], rr[1][1]], d));

    function grassRow(i, nTrees, opts2 = {}) {
      const block = new Int8Array(WIDTH);
      const keep = opts2.keep; // columns that must stay open
      for (let n = 0; n < nTrees; n++) {
        const c = RI(-COLS, COLS);
        if (keep && keep.includes(c)) continue;
        block[c + COLS] = rng() < 0.72 ? 1 : 2; // 1 tree, 2 rock
      }
      const coins = [];
      if (opts2.coins !== false && i > 2 && rng() < 0.2) {
        const c = RI(-COLS, COLS);
        if (!block[c + COLS]) coins.push(c);
      }
      return { i, type: 'grass', block, coins, seed: (rng() * 1e9) | 0, milestone: i > 0 && i % MILESTONE === 0 ? i : 0 };
    }

    function roadRow(i, d) {
      const kind = rng() < 0.55 ? 'car' : rng() < 0.55 ? 'truck' : 'bus';
      const V = VEHICLES[kind];
      const speed = between(mode.carSpeed, d) * V.speed * (world.broken ? 3 : 1);
      const objs = [];
      const gapR = [range([mode.carGap[0][0], mode.carGap[1][0]], d), range([mode.carGap[0][1], mode.carGap[1][1]], d)];
      let x = R(0, LOOP);
      const start = x;
      for (;;) {
        objs.push({ x0: wrap(x), len: V.len, kind, color: RI(0, 5) });
        const gap = world.broken ? R(0.3, 1.2) : R(gapR[0], gapR[1]);
        x += V.len + gap;
        if (x + V.len + gapR[0] > start + LOOP) break;
      }
      const coins = rng() < 0.1 ? [RI(-COLS, COLS)] : [];
      return { i, type: 'road', dir: rng() < 0.5 ? 1 : -1, speed, objs, kind, coins, seed: (rng() * 1e9) | 0 };
    }

    function riverRow(i, d, lily) {
      if (lily) {
        const block = new Int8Array(WIDTH);
        const n = RI(3, 5);
        for (let k = 0; k < n; k++) block[RI(-COLS, COLS) + COLS] = 1;
        return { i, type: 'river', lily: true, block, objs: [], dir: 1, speed: 0, coins: [], seed: (rng() * 1e9) | 0 };
      }
      const dir = -world.lastLogDir;
      world.lastLogDir = dir;
      const speed = between(mode.logSpeed, d);
      const objs = [];
      const lenR = [Math.round(range([mode.logLen[0][0], mode.logLen[1][0]], d)), Math.round(range([mode.logLen[0][1], mode.logLen[1][1]], d))];
      const gapR = [range([mode.logGap[0][0], mode.logGap[1][0]], d), range([mode.logGap[0][1], mode.logGap[1][1]], d)];
      let x = R(0, LOOP);
      const start = x;
      for (;;) {
        const len = world.broken ? 1 : RI(lenR[0], lenR[1]);
        objs.push({ x0: wrap(x + len / 2), len });
        x += len + (world.broken ? R(3, 6) : R(gapR[0], gapR[1]));
        if (x + lenR[0] + gapR[0] > start + LOOP) break;
      }
      return { i, type: 'river', lily: false, dir, speed, objs, coins: [], seed: (rng() * 1e9) | 0 };
    }

    function railRow(i, d) {
      const cars = RI(mode.trainCars[0], mode.trainCars[1]);
      const period = world.broken ? R(1.5, 2.2) : between(mode.trainPeriod, d);
      return {
        i, type: 'rail', dir: rng() < 0.5 ? 1 : -1, period, phase: R(0, period), len: cars * 4, cars, vt: mode.trainSpeed,
        warn: mode.trainWarn, objs: [], coins: [], seed: (rng() * 1e9) | 0,
      };
    }

    function put(row) {
      world.rows[row.i] = row;
      world.stats.rows[row.type]++;
    }

    // The start: a wood of trees behind you, then a clear meadow.
    for (let i = -10; i <= 2; i++) {
      const row = grassRow(i, 0, { coins: false });
      if (i <= -3) row.block.fill(1);
      else if (i < 0) {
        row.block[0] = row.block[WIDTH - 1] = 1;
        if (rng() < 0.6) row.block[RI(1, WIDTH - 2)] = 2;
      } else if (i > 0) {
        for (let n = 0; n < 2; n++) {
          const c = RI(-COLS, COLS);
          if (Math.abs(c) > 1) row.block[c + COLS] = 1;
        }
      }
      put(row);
    }
    world.next = 3;
    world.exits = flood(world, [0], 0, 2);

    // The next zone: a hazard (a road of 1-4 lanes, a river of logs and lily pads, or subway tracks), then a band
    // of grass. Every zone is checked with the crossing search before it's used; one that can't be crossed in
    // time is thrown away and made again.
    function nextZone() {
      const i0 = world.next;
      const d = diff(i0);
      // stop before the next milestone row: that one is always grass
      const nextMile = Math.ceil(Math.max(1, i0) / MILESTONE) * MILESTONE;
      const room = nextMile - i0;
      for (let attempt = 0; attempt < 14; attempt++) {
        const saved = { lastLogDir: world.lastLogDir };
        const rows = [];
        let type = '';
        if (room > 0) {
          const options = ['road', 'road', 'river', 'river', 'rail'].filter((k) => k !== world.last || rng() < 0.25);
          if (i0 < 8) options.splice(options.indexOf('rail'), options.includes('rail') ? 1 : 0);
          type = options[Math.floor(rng() * options.length)] || 'road';
          let n = 1;
          if (type === 'road') n = RI(1, Math.round(range(mode.lanes, d)));
          else if (type === 'river') n = RI(1, Math.round(range(mode.rivers, d)));
          else n = RI(1, Math.round(range(mode.rails, d)));
          n = Math.min(n, room);
          let lastLily = false;
          for (let k = 0; k < n; k++) {
            const i = i0 + k;
            if (type === 'road') rows.push(roadRow(i, d));
            else if (type === 'rail') rows.push(railRow(i, d));
            else {
              const lily = !world.broken && !lastLily && rng() < mode.lily;
              lastLily = lily;
              rows.push(riverRow(i, d, lily));
            }
          }
        }
        // then 1-3 rows of grass (just the milestone row when we're there)
        const g0 = i0 + rows.length;
        const nGrass = g0 === nextMile ? 1 : rng() < 0.6 ? 1 : rng() < 0.7 ? 2 : 3;
        const grass = [];
        for (let k = 0; k < nGrass; k++) {
          const i = g0 + k;
          const mile = i % MILESTONE === 0;
          grass.push(grassRow(i, mile ? 0 : RI(0, Math.round(range(mode.trees, d))), { coins: !mile }));
          if (i % MILESTONE === 0 && i > g0) break;
        }
        const all = rows.concat(grass);
        all.forEach((r) => (world.rows[r.i] = r));
        // check it
        let exits = null;
        if (!world.checkZones && attempt === 0) exits = flood(world, world.exits, g0 - 1, g0 + grass.length - 1, true);
        else if (rows.length === 0) exits = flood(world, world.exits, g0 - 1, g0 + grass.length - 1, true);
        else {
          const ends = crossZone(world, world.exits, i0 - 1, g0, 4, rng);
          if (ends.length) exits = flood(world, ends, g0, g0 + grass.length - 1);
        }
        if (exits && exits.length) {
          all.forEach((r) => (world.stats.rows[r.type]++));
          world.next = g0 + grass.length;
          world.exits = exits;
          world.last = type;
          world.zone++;
          world.stats.zones++;
          return;
        }
        world.stats.retries++;
        all.forEach((r) => delete world.rows[r.i]);
        world.lastLogDir = saved.lastLogDir;
      }
      // never needed in practice: an open meadow row is always crossable
      world.stats.fallbacks++;
      const row = grassRow(i0, 0);
      put(row);
      world.next = i0 + 1;
      world.exits = flood(world, world.exits, i0 - 1, i0, true);
    }

    world.ensure = function (upTo) {
      while (world.next <= upTo) nextZone();
    };
    world.forget = function (below) {
      for (let i = world.lo; i < below; i++) delete world.rows[i];
      world.lo = Math.max(world.lo, below);
    };
    return world;
  }

  // Columns you can walk to on grass rows a..b (moving between open cells), starting from `from` on row a.
  // With `fromBelow`, `from` are open columns on row a, and the walk starts on row a + 1 from those columns.
  function flood(world, from, a, b, fromBelow) {
    const seen = new Set();
    const q = [];
    const startRow = fromBelow ? a + 1 : a;
    for (const c of from) {
      const row = world.rows[startRow];
      if (row && !blocked(row, c) && Math.abs(c) <= COLS) {
        const k = startRow * 100 + c;
        if (!seen.has(k)) {
          seen.add(k);
          q.push([startRow, c]);
        }
      }
    }
    while (q.length) {
      const [r, c] = q.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 < startRow || r2 > b || Math.abs(c2) > COLS) continue;
        const row = world.rows[r2];
        if (!row || row.type !== 'grass' || blocked(row, c2)) continue;
        const k = r2 * 100 + c2;
        if (!seen.has(k)) {
          seen.add(k);
          q.push([r2, c2]);
        }
      }
    }
    const out = [];
    for (let c = -COLS; c <= COLS; c++) if (seen.has(b * 100 + c)) out.push(c);
    return out;
  }

  // Check a zone: starting on grass row `a` (from the columns in `from`), at several different moments, can a kid
  // always reach grass row `b` within the inspector's patience? Returns the columns of row b that were reached
  // every time (empty = this zone fails).
  function crossZone(world, from, a, b, samples, rng) {
    const horizon = world.mode.idleCatch - 1;
    let common = null;
    for (let s = 0; s < samples; s++) {
      const t0 = rng() * 60;
      const res = search(world, { starts: from.map((c) => ({ r: a, c, log: -1, off: 0 })), t0, lo: a, hi: b, goal: b, horizon, m: SAFE });
      const got = new Set(res.ends);
      common = common ? new Set([...common].filter((c) => got.has(c))) : got;
      if (!common.size) return [];
    }
    return [...common].sort((x, y) => x - y);
  }

  // ------------------------------------------------------------------ the crossing search
  // A breadth-first search through time. A state is where a kid stands: a column on a still row, or a spot on one
  // particular log (which then carries them). Every DT the kid can wait, or start a hop (forward, right, back,
  // left) that lands 3 steps later. The same rules as the game: a hop is in the old row for its first half and the
  // new row for its second; you can't hop into trees or rocks or off the edge; water without a log or a lily pad,
  // a car or a train ends it. With `path`, it returns the first move of the quickest way (for the autopilot).

  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // forward, right, back, left as [row step, column step]
  const OFF = 0.1; // a spot on a log, in steps of 10 cm (index 32 = the log's middle)

  // States are packed into integers: (row - lo) * 4096 + (column + 64), or on a log 1024 + log * 64 + spot.
  // Before searching, every car, log and train position is worked out once for each time step: road and track
  // rows become a grid of "busy" columns per step, log rows a list of log centres per step.
  // o: { starts: [{ r, c, log, off }], t0, lo, hi, goal (row to reach), horizon (s), m (margins), path (bool) }
  function search(world, o) {
    const { lo, hi, goal, m } = o;
    const N = Math.ceil(o.horizon / DT);
    const S = N + 4;
    const info = [];
    for (let r = lo; r <= hi; r++) {
      const row = world.rows[r];
      const it = { row, kind: 0 };
      if (row && (row.type === 'road' || row.type === 'rail')) {
        it.kind = 1;
        it.busy = new Uint8Array(S * WIDTH);
        for (let n = 0; n < S; n++) {
          const t = o.t0 + n * DT;
          for (let c = -COLS; c <= COLS; c++) it.busy[n * WIDTH + c + COLS] = danger(row, c, t, m) ? 1 : 0;
        }
      } else if (row && isLogs(row)) {
        it.kind = 2;
        const L = row.objs.length;
        it.L = L;
        it.half = row.objs.map((ob) => ob.len / 2 - m.inset);
        it.at = new Float64Array(S * L);
        for (let n = 0; n < S; n++) for (let k = 0; k < L; k++) it.at[n * L + k] = objX(row, row.objs[k], o.t0 + n * DT);
      } else if (row && row.type === 'river') it.kind = 3; // lily pads
      info.push(it);
    }
    const xOf = (key, n) => {
      const ri = (key / 4096) | 0, rem = key - ri * 4096;
      if (rem < 1024) return rem - 64;
      const it = info[ri], q = rem - 1024, k = q >> 6;
      return it.at[n * it.L + k] + ((q & 63) - 32) * OFF;
    };
    const busyAt = (ri, x, n) => info[ri].kind === 1 && info[ri].busy[n * WIDTH + x + COLS] === 1;
    // standing in `key` at step n: fine unless a car or train is there, or a log has carried you off the edge
    const standOK = (key, n) => {
      const ri = (key / 4096) | 0, rem = key - ri * 4096;
      if (rem >= 1024) return Math.abs(xOf(key, n)) <= COLS + 0.45;
      return !busyAt(ri, rem - 64, n);
    };
    // a hop from `key` started at step n, in direction dir: the state it lands in at step n + 3, or -1
    const hop = (key, n, dir) => {
      const ri = (key / 4096) | 0, rem = key - ri * 4096;
      const ri2 = ri + DIRS[dir][0];
      if (ri2 < 0 || ri2 > hi - lo) return -1;
      const it2 = info[ri2];
      if (!it2.row) return -1;
      const x0 = rem < 1024 ? rem - 64 : xOf(key, n);
      let x1 = x0 + DIRS[dir][1];
      if (it2.kind !== 2) {
        // off a log you land on the nearest column; a spot on a log is only known to 10 cm, so a hop from too near
        // halfway between two columns could go either way: don't count on it
        if (rem >= 1024 && Math.abs(x1 - Math.floor(x1) - 0.5) < 0.12) return -1;
        x1 = Math.round(x1);
        if (Math.abs(x1) > COLS || blocked(it2.row, x1)) return -1;
        if (it2.kind === 3 && !padAt(it2.row, x1)) return -1; // lily row, no pad: splash
      } else if (Math.abs(x1) > COLS + 0.45) return -1;
      // first half of the hop in the old row, second half in the new one
      if (rem < 1024 && busyAt(ri, x0, n + 1)) return -1;
      if (it2.kind === 1 && (busyAt(ri2, x1, n + 1) || busyAt(ri2, x1, n + 2) || busyAt(ri2, x1, n + 3))) return -1;
      if (it2.kind !== 2) return ri2 * 4096 + x1 + 64;
      const base = (n + 3) * it2.L;
      for (let k = 0; k < it2.L; k++) {
        const d = x1 - it2.at[base + k];
        if (Math.abs(d) <= it2.half[k]) return ri2 * 4096 + 1024 + k * 64 + Math.max(0, Math.min(63, Math.round(d / OFF) + 32));
      }
      return -1;
    };

    // layers[n]: state -> how we got there (parent state * 8 + move + 1; move 0 = waited)
    const layers = [];
    for (let n = 0; n <= N + 3; n++) layers.push(new Map());
    for (const s of o.starts) {
      const key = (s.r - lo) * 4096 + (s.log >= 0 ? 1024 + s.log * 64 + s.off : s.c + 64);
      if (standOK(key, 0)) layers[0].set(key, -1);
    }
    const goalRi = goal - lo;
    const ends = new Set();
    let best = -1, bestN = -1;
    for (let n = 0; n <= N && best < 0; n++) {
      for (const key of layers[n].keys()) {
        const ri = (key / 4096) | 0;
        if (ri >= goalRi) {
          const rem = key - ri * 4096;
          if (rem < 1024) ends.add(rem - 64);
          if (o.path && best < 0) {
            best = key;
            bestN = n;
          }
          continue;
        }
        if (n + 1 <= N && !layers[n + 1].has(key) && standOK(key, n + 1)) layers[n + 1].set(key, key * 8);
        for (let dir = 0; dir < 4; dir++) {
          const k2 = hop(key, n, dir);
          if (k2 >= 0 && !layers[n + 3].has(k2)) layers[n + 3].set(k2, key * 8 + dir + 1);
        }
      }
      if (!o.path) layers[n] = null;
    }
    const res = { ok: ends.size > 0 || best >= 0, ends: [...ends] };
    if (best >= 0) {
      // walk back to the first move
      const moves = [];
      let key = best, n = bestN;
      while (n > 0) {
        const v = layers[n].get(key);
        if (v < 0) break;
        const act = (v % 8) - 1, parent = Math.floor(v / 8);
        n -= act < 0 ? 1 : 3;
        if (act >= 0) moves.push({ t: o.t0 + n * DT, dir: act });
        key = parent;
      }
      res.moves = moves.reverse();
      res.arrive = o.t0 + bestN * DT;
    }
    return res;
  }

  // The autopilot: plan from a kid's exact spot to the next grass row past whatever's ahead.
  function plan(world, kid, t) {
    let goal = kid.r + 1;
    while (world.rows[goal] && world.rows[goal].type !== 'grass') goal++;
    if (!world.rows[goal]) return null;
    let s;
    const row = world.rows[kid.r];
    if (isLogs(row)) {
      const k = logAt(row, kid.x, t, -0.3);
      if (k < 0) return null;
      s = { r: kid.r, c: 0, log: k, off: clamp(Math.round((kid.x - objX(row, row.objs[k], t)) / 0.1) + 32, 0, 63) };
    } else s = { r: kid.r, c: Math.round(kid.x), log: -1, off: 0 };
    const opts = { starts: [s], t0: t, lo: Math.max(world.lo, kid.r - 2), hi: goal, goal, horizon: 9, path: true };
    // roomy margins first; then the ones every zone is guaranteed to have; then (knocked off a plan) the game's own
    for (const [name, m] of [['roomy', AUTO], ['safe', SAFE], ['tight', PLAY]]) {
      const res = search(world, Object.assign(opts, { m }));
      if (res.moves) return Object.assign(res, { margins: name });
    }
    return null;
  }

  // ------------------------------------------------------------------ the fairness check (also run by tools/check.js)

  function check(opts = {}) {
    const report = { modes: {} };
    for (const modeName of opts.modes || ['normal', 'easy']) {
      const r = { worlds: 0, rows: 0, zones: 0, retries: 0, fallbacks: 0, failures: [], minTrainGap: Infinity, minCarWindow: Infinity, types: { grass: 0, road: 0, river: 0, rail: 0 } };
      for (let w = 0; w < (opts.worlds || 10); w++) {
        const seed = (opts.seed || 1234) + w * 7919;
        const world = create(seed, modeName, { broken: opts.broken, checkZones: !opts.broken });
        world.ensure(opts.rows || 300);
        r.worlds++;
        r.zones += world.stats.zones;
        r.retries += world.stats.retries;
        r.fallbacks += world.stats.fallbacks;
        // 1. every train track has a long enough gap between trains
        // 2. every lane has a gap between cars wide enough to wait out
        for (let i = 0; i < world.next; i++) {
          const row = world.rows[i];
          r.types[row.type]++;
          r.rows++;
          if (row.type === 'rail') {
            const busy = (row.len + 2 * HALF) / row.vt;
            r.minTrainGap = Math.min(r.minTrainGap, row.period - busy);
          }
          if (row.type === 'road') {
            const xs = row.objs.map((o) => o.x0).sort((a, b) => a - b);
            for (let k = 0; k < xs.length; k++) {
              const a = xs[k], b = k + 1 < xs.length ? xs[k + 1] : xs[0] + LOOP;
              const gap = b - a - row.objs[0].len - 2 * HALF;
              r.minCarWindow = Math.min(r.minCarWindow, gap / row.speed);
            }
          }
        }
        // 3. walk the whole course with the crossing search, zone by zone, from fresh random moments
        //    (independently of the generator's own check, with more samples)
        const rng = mulberry32(seed ^ 0x5bd1e995);
        let exits = [0];
        let a = 0;
        while (a < world.next - 1) {
          // a is a grass row; find the next hazard
          let i = a + 1;
          if (world.rows[i].type === 'grass') {
            const ex = flood(world, exits, a, i, true);
            if (!ex.length) {
              r.failures.push({ seed, row: i, why: 'trees block the way' });
              break;
            }
            exits = ex;
            a = i;
            continue;
          }
          let b = i;
          while (world.rows[b] && world.rows[b].type !== 'grass') b++;
          if (!world.rows[b]) break;
          const ends = crossZone(world, exits, a, b, opts.samples || 10, rng);
          if (!ends.length) {
            r.failures.push({ seed, row: i, why: `can't cross ${world.rows[i].type} rows ${i}-${b - 1}` });
            break;
          }
          exits = flood(world, ends, b, b);
          a = b;
        }
      }
      report.modes[modeName] = r;
      r.minTrainGap = +r.minTrainGap.toFixed(2);
      r.minCarWindow = +r.minCarWindow.toFixed(2);
      r.ok = r.failures.length === 0 && (opts.broken || r.minTrainGap >= (modeName === 'easy' ? 7 : 4));
    }
    return report;
  }

  root.CrossyWorld = {
    COLS, EDGE, LOOP, HOP_T, HALF, DT, MILESTONE, MODES, SAFE, PLAY, VEHICLES,
    create, objX, vehicleAt, logAt, trainX, trainAt, lightOn, blocked, padAt, isLogs, danger, flood, search, plan, check, mulberry32,
  };
})(typeof window !== 'undefined' ? window : globalThis);
