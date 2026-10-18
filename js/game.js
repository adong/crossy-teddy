/* HoppiTTy Hop: the game. Hopping and what happens where you land, the inspector and his dog, the buddy (the
   other brother), milestones, the camera, the HUD and screens, input, the title-screen autopilot and test hooks.
   The world itself (rows, traffic, logs, trains, the generator) is js/world.js; the art is js/art.js. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, W = window.CrossyWorld, A = window.CrossyArt, H = window.CrossyHero;
  const S = Kit.sound, People = Kit.people;
  const { COLS, HOP_T, MILESTONE, EDGE } = W;
  const TITLE = window.CROSSY_TITLE;
  const TREATS = window.CrossyTreats;
  const ENDINGS = window.CrossyEndings;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const lerp = (a, b, k) => a + (b - a) * k;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const $ = (id) => document.getElementById(id);

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('crossyTeddy.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try { localStorage.setItem('crossyTeddy.' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ }
    },
  };

  // ---------------------------------------------------------------- state

  const ROSTER = Kit.roster.list;
  const G = {
    state: 'loading', // title, playing, paused, dying, over
    attract: true, // the title screen: the kid plays himself behind the menu
    auto: false, soak: false, silent: false, hold: false, autoPause: true,
    wt: 0, // world time (cars, logs and trains are a function of it)
    world: null, mode: 'normal', score: 0, coins: 0, streak: 0, coinT: 0, newBest: false,
    deathT: 0, cause: '', overAt: 0, shake: 0, started: false,
    taken: new Set(), // coins picked up this run ("row:col")
  };
  const P = {
    r: 0, x: 0, fromR: 0, fromX: 0, toR: 0, toX: 0, hopT: -1, hopStart: 0, hopDur: HOP_T, arc: 0.42, bounce: false, queued: -1,
    log: -1, logOff: 0, maxR: 0, idle: 0, shieldT: 0, celebT: 0, alive: true, vx: 0, vy: 0, vz: 0, dir: 0,
  };
  let HERO = ROSTER[0]; // who's playing
  let BUDDY = null;
  let kid = null; // the player's model (CrossyHero)

  let renderer, scene, camera, sun, particles;
  const thumbs = {};
  const view = { w: 1, h: 1, vw: 10, vh: 16, ahead: 2, cx: 0, cz: 0 };
  const CAM = new T.Vector3(2.0, 8.5, 6.0).normalize().multiplyScalar(30);

  function sfx(name, ...a) {
    if (G.silent || G.soak || (G.attract && name !== 'click')) return;
    if (OWN[name]) return OWN[name](...a);
    if (S[name]) S[name](...a);
  }
  // sounds of our own, built on Kit.sound.tone / hiss
  const OWN = {
    hop() { S.tone({ type: 'square', f: 480, to: 760, dur: 0.07, vol: 0.045, lp: 2400 }); },
    plop() { S.tone({ f: 300, to: 170, dur: 0.09, vol: 0.14 }); },
    squish() {
      S.punch();
      S.tone({ type: 'sawtooth', f: 320, to: 70, dur: 0.3, vol: 0.1, lp: 900, at: 0.03 });
      S.tone({ type: 'triangle', f: 1400, to: 1900, dur: 0.12, vol: 0.06, at: 0.25 });
      S.tone({ type: 'triangle', f: 1700, to: 2300, dur: 0.12, vol: 0.06, at: 0.4 });
    },
    splash() {
      S.hiss({ filter: 'lowpass', f: 3200, to: 260, dur: 0.7, vol: 0.32 });
      S.tone({ f: 520, to: 140, dur: 0.22, vol: 0.12 });
      S.tone({ type: 'sine', f: 380, to: 900, dur: 0.12, vol: 0.08, at: 0.55 });
    },
    bell() {
      for (let k = 0; k < 3; k++) S.tone({ type: 'triangle', f: 1568, dur: 0.22, vol: 0.09, at: k * 0.32 });
    },
    train() {
      S.horn(1.2);
      S.hiss({ filter: 'lowpass', f: 900, to: 300, dur: 1.4, vol: 0.18, attack: 0.15 });
    },
    whistle() {
      for (let k = 0; k < 4; k++) S.tone({ type: 'sine', f: k % 2 ? 2300 : 2050, dur: 0.09, vol: 0.07, at: k * 0.09 });
      S.tone({ type: 'sine', f: 2200, to: 2400, dur: 0.35, vol: 0.07, at: 0.38 });
    },
    woof() {
      S.tone({ type: 'square', f: 330, to: 190, dur: 0.11, vol: 0.08, lp: 900 });
      S.tone({ type: 'square', f: 330, to: 190, dur: 0.11, vol: 0.08, lp: 900, at: 0.18 });
    },
    boing() { S.tone({ type: 'sine', f: 180, to: 640, dur: 0.32, vol: 0.2 }); },
    blocked() { S.tone({ f: 150, to: 110, dur: 0.07, vol: 0.12 }); },
  };

  // ---------------------------------------------------------------- the world and its rows

  const views = {}; // row index -> what's drawn for it
  const rowZ = (r) => -r;

  function groundY(r) {
    const row = G.world.rows[r];
    if (!row) return 0;
    if (W.isLogs(row)) return A.LOG_TOP;
    if (row.type === 'river') return A.LILY_TOP;
    return row.type === 'road' ? -0.02 : 0;
  }

  function buildView(i) {
    const w = G.world, row = w.rows[i];
    const v = A.buildRow(row, w.rows[i - 1]);
    v.row = row;
    v.dyn = [];
    if (row.type === 'road') {
      for (const o of row.objs) {
        const m = A.buildVehicle(o.kind, o.color);
        m.rotation.y = row.dir < 0 ? Math.PI : 0;
        m.position.y = -0.02;
        v.group.add(m);
        v.dyn.push({ m, o });
      }
    } else if (W.isLogs(row)) {
      for (const o of row.objs) {
        const m = A.buildLog(o.len);
        v.group.add(m);
        v.dyn.push({ m, o });
      }
    } else if (row.type === 'rail') {
      v.train = A.buildTrain(row.cars, row.seed & 3);
      v.train.rotation.y = row.dir < 0 ? Math.PI : 0;
      v.train.visible = false;
      v.group.add(v.train);
      v.light = false;
      v.trainK = null;
    }
    for (const cn of v.coins) if (G.taken.has(i + ':' + cn.c)) cn.mesh.visible = false;
    scene.add(v.group);
    views[i] = v;
    return v;
  }

  function dropView(i) {
    const v = views[i];
    scene.remove(v.group);
    for (const thing of v.own) thing.dispose(); // the row's own mesh and decals (cars, logs and trains are shared)
    delete views[i];
  }

  function syncViews() {
    const lo = Math.min(P.r, P.maxR - 4) - 12, hi = Math.max(P.r, P.maxR) + 30;
    for (const k of Object.keys(views)) {
      const i = +k;
      if (i < lo - 2 || i > hi + 2 || !G.world.rows[i] || views[i].row !== G.world.rows[i]) dropView(i);
    }
    for (let i = lo; i <= hi; i++) if (!views[i] && G.world.rows[i]) buildView(i);
  }

  function updateViews(dt) {
    const t = G.wt;
    for (const k in views) {
      const v = views[k], row = v.row;
      for (const d of v.dyn) {
        const x = W.objX(row, d.o, t);
        d.m.position.x = x;
        d.m.visible = Math.abs(x) < EDGE + d.o.len / 2;
      }
      if (v.train) {
        const x = W.trainX(row, t);
        const on = Math.abs(x) < EDGE + row.len / 2 + 1;
        v.train.visible = on;
        v.train.position.x = x;
        const lit = W.lightOn(row, t);
        A.setLamps(v.lamps, lit, t);
        const near = Math.abs(row.i - P.r) <= 4 && P.alive;
        if (lit && !v.light && near) sfx('bell');
        v.light = lit;
        const k = Math.floor((t - row.phase) / row.period);
        if (on && v.trainK !== k) {
          v.trainK = k;
          if (near) sfx('train');
        }
      }
      for (const cn of v.coins) {
        if (!cn.mesh.visible) continue;
        cn.mesh.rotation.y += dt * 3;
        cn.mesh.position.y = (row.type === 'road' ? 0.36 : 0.38) + Math.sin(t * 3 + cn.c) * 0.05;
      }
    }
    A.flowWater(t, { '-1': 1, 1: 1 });
  }

  // ---------------------------------------------------------------- a run

  function newWorld(seed) {
    for (const k of Object.keys(views)) dropView(+k);
    G.world = W.create(seed >>> 0, G.mode);
    G.world.ensure(40);
    G.wt = 0;
    G.taken.clear();
    Object.assign(P, { r: 0, x: 0, fromR: 0, fromX: 0, toR: 0, toX: 0, hopT: -1, bounce: false, queued: -1, log: -1, maxR: 0, idle: 0, shieldT: 0, celebT: 0, alive: true });
    G.score = 0;
    G.coins = 0;
    G.streak = 0;
    G.started = false;
    G.newBest = false;
    G.cause = '';
    insp.state = 'off';
    ap.plan = null;
    if (kid) {
      kid.set('stand');
      kid.face(0);
      kid.snapFace();
    }
    dropTreat();
    if (!G.soak) syncViews();
    placeKid();
    snapCamera();
  }

  function startRun() {
    S.init();
    G.attract = false;
    G.auto = false;
    G.mode = easyFor(HERO.id) ? 'easy' : 'normal';
    newWorld((Math.random() * 1e9) | 0);
    if (buddy.on) dismissBuddy();
    G.state = 'playing';
    S.music('play');
    show('title', false);
    show('over', false);
    show('pause', false);
    show('hud', true);
    $('hint').classList.add('on');
    updateHud(true);
  }

  function toTitle() {
    G.attract = true;
    G.state = 'title';
    G.mode = easyFor(HERO.id) ? 'easy' : 'normal';
    newWorld((Math.random() * 1e9) | 0);
    show('title', true);
    show('over', false);
    show('pause', false);
    show('hud', false);
    S.music('title');
    renderPicker();
  }

  // ---------------------------------------------------------------- hopping

  const DR = [1, 0, -1, 0], DC = [0, 1, 0, -1]; // forward, right, back, left

  // `at`: when the hop starts (the autopilot plans its hops to the hundredth of a second; a key press starts now)
  function tryHop(dir, at) {
    if (!P.alive || !(G.state === 'playing' || G.state === 'title')) return false;
    if (P.hopT >= 0) {
      if (!P.bounce && P.hopT / P.hopDur > 0.25) P.queued = dir; // buffer one hop
      return false;
    }
    if (P.celebT > 0) {
      P.celebT = 0;
      kid.set('stand');
    }
    const w = G.world;
    const r2 = P.r + DR[dir];
    const row2 = w.rows[r2];
    kid.face(dir);
    if (!row2 || r2 < P.maxR - 4 || r2 < w.lo + 2) return blockedHop();
    const t0 = at !== undefined ? Math.min(at, G.wt) : G.wt;
    let x0 = P.x;
    if (P.log >= 0) {
      const row = w.rows[P.r];
      x0 = W.objX(row, row.objs[P.log], t0) + P.logOff; // where the log had carried you at t0
    }
    let x1 = x0 + DC[dir];
    if (!W.isLogs(row2)) {
      x1 = Math.round(x1);
      if (Math.abs(x1) > COLS || W.blocked(row2, x1)) return blockedHop();
    } else if (Math.abs(x1) > COLS + 0.45) return blockedHop();
    Object.assign(P, { fromR: P.r, fromX: x0, toR: r2, toX: x1, hopStart: t0, hopT: G.wt - t0, hopDur: HOP_T, arc: 0.42, log: -1, bounce: false });
    if (dir === 0) P.idle = 0;
    P.dir = dir;
    G.started = true;
    $('hint').classList.remove('on');
    sfx('hop');
    return true;
  }

  function blockedHop() {
    kid.bump();
    sfx('blocked');
    return false;
  }

  function hitCheck(r, x) {
    const row = G.world.rows[r];
    if (!row) return false;
    if (row.type === 'road') {
      const o = W.vehicleAt(row, x, G.wt, W.PLAY.pad);
      if (o) return hit(o.kind);
    } else if (row.type === 'rail') {
      if (W.trainAt(row, x, G.wt, W.PLAY.trainPad)) return hit('train');
    }
    return false;
  }

  function hit(kind) {
    if (P.shieldT > 0) return false;
    if (buddyGuarding()) {
      save(kind);
      return true;
    }
    die(kind);
    return true;
  }

  function land() {
    const w = G.world, t = G.wt;
    P.hopT = -1;
    P.r = P.toR;
    P.x = P.toX;
    kid.hop(-1);
    kid.landed();
    const wasBounce = P.bounce;
    P.bounce = false;
    const row = w.rows[P.r];
    if (W.isLogs(row)) {
      const tl = P.hopStart + P.hopDur; // the moment of landing (this frame may be a little after it)
      const k = W.logAt(row, P.x, tl, W.PLAY.inset);
      if (k < 0) return fall('splash');
      P.log = k;
      P.logOff = P.x - W.objX(row, row.objs[k], tl);
      P.x = W.objX(row, row.objs[k], t) + P.logOff;
      sfx('plop');
    } else {
      P.log = -1;
      if (row.type === 'river') {
        if (!W.padAt(row, Math.round(P.x))) return fall('splash');
        sfx('plop');
      }
    }
    // coins
    const key = P.r + ':' + Math.round(P.x);
    if ((row.coins || []).includes(Math.round(P.x)) && !G.taken.has(key)) takeCoin(key);
    // a new furthest row
    if (P.r > P.maxR) {
      P.maxR = P.r;
      if (!G.attract) {
        G.score = P.maxR;
        bumpScore();
        if (row.milestone) celebrate(row.milestone);
      }
    }
    if (wasBounce) kid.face(0);
    if (P.queued >= 0) {
      const d = P.queued;
      P.queued = -1;
      tryHop(d);
    }
  }

  function fall(kind) {
    if (buddyGuarding()) return save(kind);
    die(kind);
  }

  function takeCoin(key) {
    G.taken.add(key);
    const [r, c] = key.split(':').map(Number);
    const v = views[r];
    if (v) for (const cn of v.coins) if (cn.c === c) cn.mesh.visible = false;
    G.streak = G.coinT > 0 ? G.streak + 1 : 0;
    G.coinT = 2.5;
    if (G.attract) return;
    G.coins++;
    sfx('coin', G.streak);
    if (particles && !G.soak) particles.emit(c, P.vy + 0.5, rowZ(r), 14, { colors: ['#ffd400', '#fff3a0'], speed: 1.6, up: 3, size: 0.07, life: 0.5 });
    updateHud();
  }

  // Squished, splashed or caught: cartoon style, then the card.
  function die(kind) {
    P.alive = false;
    P.hopT = -1;
    kid.hop(-1);
    G.cause = kind;
    G.deathT = 0;
    if (G.state === 'playing') G.state = 'dying';
    if (G.soak) return;
    kid.root.visible = true;
    const x = P.vx, y = P.vy, z = P.vz;
    if (kind === 'splash' || kind === 'swept') {
      P.vy = A.WATER_TOP;
      kid.set('splash');
      sfx('splash');
      particles.emit(x, A.WATER_TOP + 0.1, z, 40, { colors: ['#ffffff', '#bfeaff', '#55c6f2'], speed: 1.8, up: 5, size: 0.09, life: 0.9 });
      burst('SPLASH!', x, 2.0, z, '#7fe0ff', '#1b6fd6');
    } else if (kind === 'caught') {
      kid.set('caught');
      kid.faceCamera();
      sfx('whistle');
      burst('BUSTED!', x, 2.2, z, '#ffd400', '#27428c');
    } else {
      kid.set('squish');
      sfx('squish');
      G.shake = 0.35;
      particles.emit(x, y + 0.3, z, 26, { colors: ['#ffd400', '#ffffff', '#ff7ab8'], speed: 2.4, up: 4, size: 0.08, life: 0.7 });
      burst('POW!', x, 1.7, z);
    }
  }

  // Your buddy has your back: bounced back to safe ground behind you.
  function save(kind) {
    const w = G.world;
    if (!G.attract) toast(`${BUDDY.name} SAVED YOU!`, 'saved');
    buddy.cheerT = 1.4;
    sfx('boing');
    burst('SAVED!', P.vx, 2.0, P.vz, '#7cffb5', '#14121f');
    if (particles) particles.emit(P.vx, P.vy + 0.4, P.vz, 18, { colors: ['#ffd400', '#ffffff', '#7cffb5'], speed: 2, up: 4, size: 0.08, life: 0.6 });
    P.idle = 0;
    if (kind === 'caught') return;
    const from = P.hopT >= 0 ? (P.hopT / P.hopDur < 0.5 ? P.fromR : P.toR) : P.r;
    const cx = clamp(Math.round(P.vx), -COLS, COLS);
    let target = null;
    for (let r = from - 1; r >= Math.max(w.lo + 1, from - 10) && !target; r--) {
      const row = w.rows[r];
      if (!row) break;
      if (row.type === 'grass') {
        for (let d = 0; d <= COLS * 2 && !target; d++) {
          for (const c of d ? [cx - d, cx + d] : [cx]) {
            if (Math.abs(c) <= COLS && !W.blocked(row, c)) {
              target = { r, c };
              break;
            }
          }
        }
      } else if (row.type === 'river' && row.lily && W.padAt(row, cx)) target = { r, c: cx };
    }
    if (!target) {
      // nowhere to go: stay put with a shield for a moment
      P.shieldT = 2;
      P.log = -1;
      return;
    }
    Object.assign(P, { fromR: from, fromX: P.vx, toR: target.r, toX: target.c, hopStart: G.wt, hopT: 0, hopDur: 0.55, arc: 1.7, bounce: true, queued: -1, log: -1, alive: true });
    P.shieldT = 0.55 + 1.0;
    if (kid.mode !== 'stand') kid.set('stand');
  }

  function celebrate(n) {
    const sig = HERO.signature && HERO.signature.length ? HERO.signature : ['wave'];
    const move = sig[(n / MILESTONE - 1) % sig.length]; // Teddy: boxing at 25, his jump shot at 50, ...
    kid.set('celebrate', move);
    kid.faceCamera();
    P.celebT = move === 'jumpshot' ? 1.9 : 2.1;
    toast(`${n} ROWS! 🎉`, 'big');
    sfx('powerup');
    if (!G.soak) {
      for (const color of ['#ffd400', '#ff3d7f', '#18d4ff', '#7cff4f']) {
        particles.emit(P.vx, P.vy + 1.2, P.vz, 18, { color, speed: 2.6, up: 6, size: 0.09, life: 1.2, gravity: 7 });
      }
    }
  }

  function placeKid() {
    if (!kid) return;
    kid.root.position.set(P.vx, P.vy, P.vz);
  }

  function updatePlayer(dt) {
    const w = G.world, t = G.wt;
    P.shieldT = Math.max(0, P.shieldT - dt);
    G.coinT = Math.max(0, G.coinT - dt);
    if (!P.alive) {
      G.deathT += dt;
      if (G.soak) return;
      kid.update(dt);
      placeKid();
      if (G.state === 'dying' && G.deathT > (G.cause === 'splash' || G.cause === 'swept' || G.cause === 'caught' ? 1.7 : 1.3)) gameOver();
      if (G.attract && G.deathT > 1.6) newWorld((Math.random() * 1e9) | 0);
      return;
    }
    if (P.hopT >= 0) {
      P.hopT = G.wt - P.hopStart;
      const u = Math.min(1, P.hopT / P.hopDur);
      P.vx = lerp(P.fromX, P.toX, u);
      P.vz = lerp(rowZ(P.fromR), rowZ(P.toR), u);
      P.vy = lerp(groundY(P.fromR), groundY(P.toR), u) + Math.sin(u * Math.PI) * P.arc;
      kid.hop(u);
      // first half of a hop in the old row, second half in the new one (the same rule the crossing search uses)
      if (!P.bounce && hitCheck(u < 0.5 ? P.fromR : P.toR, u < 0.5 ? P.fromX : P.toX)) {
        placeKid();
        return;
      }
      if (u >= 1) land();
    } else {
      const row = w.rows[P.r];
      if (P.log >= 0) {
        P.x = W.objX(row, row.objs[P.log], t) + P.logOff;
        if (Math.abs(P.x) > COLS + 0.6) {
          P.vx = P.x;
          fall('swept');
          placeKid();
          return;
        }
      }
      P.vx = P.x;
      P.vz = rowZ(P.r);
      P.vy = groundY(P.r);
      if (hitCheck(P.r, P.x)) {
        placeKid();
        return;
      }
      if (P.celebT > 0) {
        P.celebT -= dt;
        if (P.celebT <= 0) {
          kid.set('stand');
          kid.face(0);
        }
      } else if (G.state === 'playing' && G.started) P.idle += dt;
    }
    if (!G.soak) {
      kid.update(dt);
      // blink while shielded
      kid.root.visible = P.shieldT <= 0 || P.bounce || Math.floor(P.shieldT * 12) % 2 === 0;
    }
    placeKid();
  }

  // ---------------------------------------------------------------- the inspector and his dog
  // Stand still too long (no hop forward for idleWarn seconds) and they come walking in along your row, whistling.
  // Hop forward and they head off again. If they reach you, you're BUSTED (unless your buddy is with you).

  const insp = { state: 'off', x: 0, z: 0, start: 0, side: 1, ph: 0, dogX: 0, dogY: 0, dogZ: 0, dogT: 0, m: null, dog: null, wrap: null };

  function buildInspector() {
    insp.wrap = new T.Group();
    insp.m = People.build(window.CrossyInspector);
    insp.m.root.scale.setScalar(H.SIZE * 1.22); // a grown-up
    insp.m.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    insp.wrap.add(insp.m.root);
    insp.dog = A.buildDog();
    insp.dog.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    insp.wrap.visible = insp.dog.root.visible = false;
    scene.add(insp.wrap, insp.dog.root);
  }

  // the grass row the inspector walks along: yours, or the nearest one behind you
  function inspectorRow() {
    for (let r = P.r; r > P.r - 8; r--) {
      const row = G.world.rows[r];
      if (row && row.type === 'grass') return r;
    }
    return P.r;
  }

  function updateInspector(dt) {
    const md = G.world.mode;
    const active = !G.attract && (G.state === 'playing' || G.state === 'dying' || (G.state === 'over' && insp.state === 'catch'));
    if (!active) {
      insp.state = 'off';
      if (insp.wrap) insp.wrap.visible = insp.dog.root.visible = false;
      return;
    }
    insp.ph += dt * 7;
    const coming = P.alive && P.idle > md.idleWarn;
    if (insp.state === 'off' && coming) {
      insp.state = 'coming';
      insp.side = P.x > 0 ? -1 : 1;
      insp.start = insp.side * (COLS + 4.5);
      insp.x = insp.start;
      insp.dogX = insp.start + insp.side * -0.6;
      insp.z = rowZ(inspectorRow()) + 0.12;
      insp.dogZ = insp.z;
      sfx('whistle');
      toast('KEEP HOPPING!', 'warn');
    }
    if (insp.state === 'off') {
      if (insp.wrap) insp.wrap.visible = insp.dog.root.visible = false;
      return;
    }
    let mode = 'walk', dogMode = 'run';
    const zWant = rowZ(inspectorRow()) + 0.12;
    if (insp.state === 'coming') {
      if (!coming) insp.state = 'leaving';
      else {
        const u = clamp((P.idle - md.idleWarn) / (md.idleCatch - md.idleWarn), 0, 1);
        const e = 1 - Math.pow(1 - u, 1.6);
        insp.x = lerp(insp.start, P.x + insp.side * 1.05, e);
        insp.dogX = lerp(insp.start - insp.side * 0.6, P.x + insp.side * 0.5, Math.min(1, e * 1.08));
        insp.z += (zWant - insp.z) * damp(6, dt);
        insp.dogZ = insp.z;
        if (u >= 1) catchKid();
      }
    }
    if (insp.state === 'leaving') {
      insp.x += Math.sign(insp.start - insp.x) * dt * 3.2;
      insp.dogX += Math.sign(insp.start - insp.dogX) * dt * 3.6;
      if (Math.abs(insp.x - insp.start) < 0.2) insp.state = 'off';
    }
    if (insp.state === 'catch') {
      mode = 'grab';
      dogMode = 'bark';
      insp.dogT += dt;
      // the dog bounds over to you (even across a road or onto a lily pad)
      const k = Math.min(1, insp.dogT / 0.45);
      insp.dogX = lerp(insp.dogX, P.vx + insp.side * 0.45, k);
      insp.dogZ = lerp(insp.dogZ, P.vz + 0.05, k);
      insp.dogY = Math.sin(k * Math.PI) * 0.5 + (k >= 1 ? P.vy : 0);
      if (insp.dogT > 0.5 && insp.dogT < 0.6) sfx('woof');
    }
    insp.wrap.visible = insp.dog.root.visible = true;
    // walking toward you (or away)
    const toward = insp.state === 'leaving' ? insp.side : -insp.side;
    const yaw = toward > 0 ? -Math.PI / 2 : Math.PI / 2;
    insp.wrap.position.set(insp.x, 0, insp.z);
    insp.wrap.rotation.y = insp.state === 'catch' ? yaw * 0.6 : yaw;
    People.pose(insp.m, insp.ph * 0.8, mode, damp(14, dt));
    insp.dog.root.position.set(insp.dogX, insp.dogY, insp.dogZ);
    insp.dog.root.rotation.y = yaw;
    A.poseDog(insp.dog, insp.ph * 1.6, dogMode);
  }

  function catchKid() {
    if (buddyGuarding()) {
      // the buddy waves them off
      save('caught');
      insp.state = 'leaving';
      toast('NOT TODAY, INSPECTOR!');
      return;
    }
    insp.state = 'catch';
    insp.dogT = 0;
    die('caught');
  }

  // ---------------------------------------------------------------- the buddy (Tommy, or Teddy when Tommy plays)
  // Tap his button, his card or T and he hops in beside you for about 10 s: he copies your hops a beat later,
  // stands on top of trees and rocks, jumps over cars and trains and floats across water in his swim ring. He says
  // hi with his signature move, hands over a treat, says bye and hops off. While he's with you (until 9.6 s, his
  // bar shows the time left) getting hit or falling in just bounces you back to safe ground behind you.

  const GUARD_UNTIL = 9.6;
  const buddy = { kid: null, tag: null, on: false, t: 0, x: 0, y: 0, z: 0, side: 1, cheerT: 0, given: false, hopT: -1, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, cell: null, arc: 0.4, dur: 0.2, leaving: false };
  const treat = { sprite: null, flyT: -1, holdT: 0, from: new T.Vector3() };
  const buddyGuarding = () => buddy.on && buddy.t < GUARD_UNTIL;

  function setBuddy(id) {
    if (BUDDY && BUDDY.id === id && buddy.kid) return;
    if (buddy.kid) {
      if (buddy.on) dismissBuddy();
      scene.remove(buddy.kid.root);
    }
    BUDDY = Kit.roster.get(id);
    buddy.kid = H.build(BUDDY, { size: H.SIZE * ((BUDDY.buddyScale || 0.8) / 0.9) });
    buddy.tag = Kit.gfx.nameTag(BUDDY.name, BUDDY.tag || '#ffb02e');
    buddy.tag.scale.multiplyScalar(0.5);
    buddy.tag.position.y = buddy.kid.size * 2.2 + 0.32;
    buddy.kid.root.add(buddy.tag);
    buddy.kid.root.visible = false;
    scene.add(buddy.kid.root);
    const nice = BUDDY.name[0] + BUDDY.name.slice(1).toLowerCase();
    const card = $('buddyCard');
    if (card) {
      card.querySelector('img').src = thumbs[BUDDY.id];
      card.querySelector('.nm').textContent = BUDDY.name;
    }
    $('buddyFace').src = $('pwBuddyFace').src = thumbs[BUDDY.id];
    $('buddyName').textContent = BUDDY.name;
    $('buddyKeyName').textContent = nice;
    $('buddyBtn').title = `Call ${nice} (T)`;
  }

  function callBuddy() {
    if (G.state !== 'playing' && G.state !== 'title') return;
    if (!buddy.on) return summonBuddy();
    if (buddy.t > GUARD_UNTIL) return summonBuddy(true);
    if (buddy.t > 4.8) {
      // he says hi again and hands over another treat
      buddy.t = 1.0;
      buddy.given = false;
    }
  }

  function summonBuddy(again) {
    const fromBehind = !again || !buddy.on;
    Object.assign(buddy, { on: true, t: 0, given: false, cheerT: 0, leaving: false });
    buddy.side = P.x > 0 ? -1 : 1;
    if (fromBehind) {
      buddy.x = P.vx + buddy.side * 0.9;
      buddy.z = P.vz + 5;
      buddy.y = 0;
      buddy.cell = null;
    }
    buddyHop(0.6, 1.2);
    buddy.kid.root.visible = true;
    buddy.kid.set('stand');
    if (!G.attract) toast(`${BUDDY.name}'S HERE!`);
    sfx('boing');
  }

  function dismissBuddy() {
    buddy.on = false;
    buddy.kid.root.visible = false;
  }

  // where the buddy wants to stand: beside you, a little behind, on whatever's there
  function buddySpot() {
    const w = G.world;
    if (Math.abs(P.vx + buddy.side * 0.9) > COLS + 0.6) buddy.side = -buddy.side;
    const x = P.vx + buddy.side * 0.9;
    const r = P.hopT >= 0 ? P.toR : P.r;
    const row = w.rows[r];
    const z = rowZ(r) + 0.1;
    let y = 0, swim = false;
    if (row) {
      const c = Math.round(x);
      if (row.type === 'grass' && Math.abs(c) <= COLS && row.block[c + COLS]) y = row.block[c + COLS] === 2 ? 0.46 : 0.95;
      else if (row.type === 'road') {
        const o = W.vehicleAt(row, x, G.wt + 0.12, 0.45);
        y = o ? (o.kind === 'car' ? 0.9 : o.kind === 'bus' ? 1.25 : 2.0) : 0;
      } else if (row.type === 'rail') y = W.trainAt(row, x, G.wt + 0.12, 0.6) ? 1.6 : 0;
      else if (W.isLogs(row)) {
        if (W.logAt(row, x, G.wt, -0.1) >= 0) y = A.LOG_TOP;
        else swim = true;
      } else if (row.type === 'river') {
        if (W.padAt(row, c)) y = A.LILY_TOP;
        else swim = true;
      }
    }
    if (swim) y = A.WATER_TOP - 0.3;
    return { x, y, z, r, swim };
  }

  function buddyHop(dur, arc) {
    buddy.hopT = 0;
    buddy.dur = dur;
    buddy.arc = arc;
    buddy.fx = buddy.x;
    buddy.fy = buddy.y;
    buddy.fz = buddy.z;
  }

  function updateBuddy(dt) {
    updateTreat(dt);
    if (!buddy.on) return;
    buddy.t += dt;
    const t = buddy.t;
    buddy.cheerT = Math.max(0, buddy.cheerT - dt);
    const spot = buddySpot();
    if (t > GUARD_UNTIL && !buddy.leaving) {
      // bye: hop away behind
      buddy.leaving = true;
      buddy.cell = 'gone';
      buddyHop(0.7, 1.4);
    }
    if (buddy.leaving) {
      spot.z = P.vz + 6;
      spot.y = 0;
      spot.swim = false;
    } else if (buddy.hopT < 0 && buddy.cell !== spot.r) {
      // you hopped to a new row: he follows a beat later
      if (buddy.cell === null || P.hopT < 0 || P.hopT > 0.06) {
        buddy.cell = spot.r;
        buddyHop(0.2, 0.45);
      }
    } else if (buddy.hopT < 0 && P.log < 0 && Math.abs(spot.x - buddy.x) > 0.7) buddyHop(0.2, 0.4); // a hop sideways
    if (buddy.hopT >= 0) {
      buddy.hopT += dt;
      const u = Math.min(1, buddy.hopT / buddy.dur);
      buddy.x = lerp(buddy.fx, spot.x, u);
      buddy.z = lerp(buddy.fz, spot.z, u);
      buddy.y = lerp(buddy.fy, spot.y, u) + Math.sin(u * Math.PI) * buddy.arc;
      buddy.kid.hop(u);
      if (u >= 1) {
        buddy.hopT = -1;
        buddy.kid.hop(-1);
        buddy.kid.landed();
        if (buddy.cell === null) buddy.cell = spot.r;
      }
    } else {
      buddy.x += (spot.x - buddy.x) * damp(14, dt);
      buddy.z += (spot.z - buddy.z) * damp(14, dt);
      buddy.y += (spot.y - buddy.y) * damp(spot.y > buddy.y ? 22 : 12, dt);
    }
    // what he's doing
    const giving = t > 3.6 && t < 4.4;
    const hello = (t > 1.0 && t < 2.6) || buddy.cheerT > 0;
    const bye = t > 8.0 && t < GUARD_UNTIL;
    const k = buddy.kid;
    const air = buddy.hopT >= 0;
    if (!air && spot.swim && !hello && !bye && !giving) k.set('swim');
    else if (giving) k.set('celebrate', 'give');
    else if (hello) k.set('celebrate', Kit.roster.signature(BUDDY, 'hello'));
    else if (bye) k.set('celebrate', Kit.roster.signature(BUDDY, 'goodbye'));
    else k.set('stand');
    if (giving || hello || bye) k.faceCamera();
    else k.face(P.dir || 0);
    k.update(dt);
    k.root.position.set(buddy.x, buddy.y, buddy.z);
    if (!buddy.given && t > 4.0) {
      buddy.given = true;
      giveTreat();
    }
    if (t > GUARD_UNTIL + 1.2) dismissBuddy();
  }

  function giveTreat() {
    const [emoji, label] = pick(TREATS);
    if (!treat.sprite) {
      treat.sprite = new T.Sprite(new T.SpriteMaterial({ depthWrite: false }));
      scene.add(treat.sprite);
    }
    treat.sprite.material.map = Kit.gfx.emojiTexture(emoji);
    treat.sprite.material.needsUpdate = true;
    buddy.kid.root.updateMatrixWorld(true);
    People.handWorld(buddy.kid.person, 1, treat.from);
    scene.add(treat.sprite);
    treat.sprite.position.copy(treat.from);
    treat.sprite.scale.setScalar(0.34);
    treat.sprite.visible = true;
    treat.flyT = 0;
    if (!G.attract) toast(`${emoji} ${label} FROM ${BUDDY.name}!`);
    sfx('powerup');
  }

  const handPos = new T.Vector3();
  function updateTreat(dt) {
    if (!treat.sprite) return;
    if (treat.flyT >= 0) {
      treat.flyT += dt / 0.55;
      kid.root.updateMatrixWorld(true);
      People.handWorld(kid.person, 1, handPos);
      const k = Math.min(1, treat.flyT);
      treat.sprite.position.lerpVectors(treat.from, handPos, k);
      treat.sprite.position.y += Math.sin(k * Math.PI) * 0.8;
      if (k >= 1) {
        treat.flyT = -1;
        treat.holdT = 9;
        kid.person.armR.add(treat.sprite);
        treat.sprite.position.set(0.1, -0.8, -0.15);
        treat.sprite.scale.setScalar(0.62);
        if (particles) particles.emit(handPos.x, handPos.y, handPos.z, 10, { color: '#ffffff', speed: 1.2, up: 2, size: 0.05, life: 0.4 });
      }
    } else if (treat.holdT > 0) {
      treat.holdT -= dt;
      if (treat.holdT <= 0 || !P.alive) dropTreat();
    }
  }
  function dropTreat() {
    if (!treat.sprite) return;
    treat.flyT = -1;
    treat.holdT = 0;
    treat.sprite.visible = false;
    scene.add(treat.sprite);
  }

  // ---------------------------------------------------------------- the autopilot (title screen, soak test)

  const ap = { plan: null, i: 0, wait: 0 };
  function autopilot(dt) {
    if (!P.alive || P.hopT >= 0 || P.celebT > 0) return;
    ap.wait -= dt;
    if (!ap.plan || ap.i >= ap.plan.moves.length) {
      if (ap.wait > 0) return;
      let x = P.x;
      if (P.log >= 0) {
        const row = G.world.rows[P.r];
        x = W.objX(row, row.objs[P.log], G.wt) + P.logOff; // exactly where the log is now
      }
      ap.plan = W.plan(G.world, { r: P.r, x }, G.wt);
      ap.i = 0;
      if (ap.plan) ap.last = { at: +G.wt.toFixed(2), from: [P.r, +P.x.toFixed(2)], margins: ap.plan.margins, moves: ap.plan.moves.map((m) => `${'URDL'[m.dir]}@${m.t.toFixed(2)}`).join(' ') };
      if (!ap.plan || !ap.plan.moves.length) {
        ap.plan = null;
        ap.wait = 0.2;
        return;
      }
    }
    const mv = ap.plan.moves[ap.i];
    if (G.wt >= mv.t - 1e-6) {
      ap.i++;
      if (!tryHop(mv.dir, mv.t)) ap.plan = null;
    }
  }

  // ---------------------------------------------------------------- camera

  function computeView() {
    const w = Math.max(1, window.innerWidth || 1), h = Math.max(1, window.innerHeight || 1);
    // pixels per cell: about 8.6 cells across a phone in portrait, 9.5 cells of screen height on wider screens
    let px = Math.min(w / 8.6, h / 9.5);
    if (px < 42) px = Math.min(w / 8.6, Math.max(px, Math.min(42, h / 7.5)));
    view.w = w;
    view.h = h;
    view.vw = w / px;
    view.vh = h / px;
    view.ahead = 0.12 * view.vh * 1.25;
    renderer.setSize(w, h, false);
    camera.left = -view.vw / 2;
    camera.right = view.vw / 2;
    camera.top = view.vh / 2;
    camera.bottom = -view.vh / 2;
    camera.updateProjectionMatrix();
  }

  function camTarget() {
    return { x: clamp(P.vx * (view.vw < 13 ? 0.5 : 0.2), -1.6, 1.6), z: P.vz - view.ahead };
  }
  function snapCamera() {
    const c = camTarget();
    view.cx = c.x;
    view.cz = c.z;
    placeCamera();
  }
  function updateCamera(dt) {
    const c = camTarget();
    view.cx += (c.x - view.cx) * damp(3, dt);
    view.cz += (c.z - view.cz) * damp(4.5, dt);
    G.shake = Math.max(0, G.shake - dt);
    placeCamera();
  }
  function placeCamera() {
    const s = G.shake > 0 ? Math.sin(G.shake * 80) * G.shake * 0.25 : 0;
    camera.position.set(view.cx + CAM.x + s, CAM.y, view.cz + CAM.z);
    camera.lookAt(view.cx + s, 0, view.cz);
    camera.updateMatrixWorld();
    sun.position.set(view.cx - 6, 14, view.cz + 5);
    sun.target.position.set(view.cx, 0, view.cz);
    sun.target.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- bursts (POW!, SPLASH!, SAVED!) and toasts

  const bursts = [];
  function burst(word, x, y, z, fill, edge) {
    if (G.soak || G.attract) return;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: A.burstTexture(Kit.lang ? Kit.lang.t(word) : word, fill, edge), depthWrite: false, depthTest: false, transparent: true }));
    sp.position.set(x, y, z);
    sp.renderOrder = 10;
    scene.add(sp);
    bursts.push({ sp, t: 0 });
  }
  function updateBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.t += dt;
      const k = b.t < 0.15 ? b.t / 0.15 : 1;
      const s = (b.t < 0.15 ? k * 1.5 : 1.5 - Math.min(0.25, (b.t - 0.15) * 1.2)) * 1.1;
      b.sp.scale.setScalar(s);
      b.sp.material.opacity = b.t > 1.0 ? Math.max(0, 1 - (b.t - 1.0) / 0.3) : 1;
      b.sp.position.y += dt * 0.3;
      if (b.t > 1.3) {
        scene.remove(b.sp);
        b.sp.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  function toast(text, cls) {
    if (G.attract || G.soak) return;
    const el = document.createElement('div');
    el.className = 'toast' + (cls ? ' ' + cls : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 1500);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  }

  // ---------------------------------------------------------------- HUD and screens

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const bestKey = (id, mode) => `best.${id}.${mode}`;
  const easyFor = (id) => store.get('easy.' + id, id === 'tommy');
  let lastHud = {};

  function bumpScore() {
    const el = $('score');
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    updateHud();
  }

  function updateHud(force) {
    if (G.soak) return;
    const best = Math.max(store.get(bestKey(HERO.id, G.mode), 0), G.score);
    const vals = { score: String(G.score), coins: String(G.coins), best: `BEST ${best}` };
    for (const k in vals) {
      if (force || lastHud[k] !== vals[k]) {
        $(k).textContent = vals[k];
        lastHud[k] = vals[k];
      }
    }
    const guarding = buddyGuarding() && !G.attract;
    $('pwBuddy').classList.toggle('on', guarding);
    $('buddyBtn').classList.toggle('guarding', guarding);
    if (guarding) $('pwFill').style.transform = `scaleX(${clamp(1 - buddy.t / GUARD_UNTIL, 0, 1)})`;
    const md = G.world && G.world.mode;
    $('inspWarn').classList.toggle('on', !!md && G.state === 'playing' && insp.state === 'coming');
  }

  function gameOver() {
    G.state = 'over';
    G.overAt = performance.now();
    const key = bestKey(HERO.id, G.mode);
    const best = store.get(key, 0);
    G.newBest = G.score > best;
    if (G.newBest) store.set(key, G.score);
    store.set('coins', store.get('coins', 0) + G.coins);
    const [title, line] = ENDINGS[G.cause] || ENDINGS.car;
    $('ovTitle').textContent = title;
    $('ovTitle').className = 'bonk' + (title === 'SPLASH!' ? ' splash' : '');
    $('ovLine').textContent = line;
    $('ovScore').textContent = G.score;
    $('ovCoins').textContent = G.coins;
    $('ovBest').textContent = Math.max(best, G.score);
    $('ovBestLabel').textContent = `${HERO.name}'S BEST${G.mode === 'easy' ? ' 🐣' : ''}`;
    $('newBest').classList.toggle('on', G.newBest);
    show('over', true);
    show('hud', false);
    S.music('over');
    if (G.newBest) {
      sfx('powerup');
      setTimeout(() => toast('★ NEW BEST! ★', 'big'), 200);
    }
  }

  function pause(on) {
    if (on && G.state === 'playing') {
      G.state = 'paused';
      show('pause', true);
      S.music('pause');
    } else if (!on && G.state === 'paused') {
      G.state = 'playing';
      show('pause', false);
      S.music('play');
    }
  }

  function setHero(id, user) {
    HERO = Kit.roster.get(id) || ROSTER[0];
    store.set('pick', HERO.id);
    dropTreat();
    if (kid) scene.remove(kid.root);
    kid = H.build(HERO);
    scene.add(kid.root);
    kid.face(0);
    kid.snapFace();
    setBuddy(Kit.roster.buddyFor(HERO.id));
    if (user) {
      S.init();
      sfx('click');
    }
    if (G.state === 'title') {
      const easy = easyFor(HERO.id) ? 'easy' : 'normal';
      if (easy !== G.mode) {
        G.mode = easy;
        newWorld((Math.random() * 1e9) | 0);
      }
      placeKid();
    }
    renderPicker();
  }

  function setEasy(on) {
    store.set('easy.' + HERO.id, !!on);
    if (G.state === 'title') {
      G.mode = on ? 'easy' : 'normal';
      newWorld((Math.random() * 1e9) | 0);
    }
    renderPicker();
  }

  function renderPicker() {
    for (const b of document.querySelectorAll('#picker .avatar[data-id]')) {
      const id = b.dataset.id;
      b.setAttribute('aria-checked', id === HERO.id ? 'true' : 'false');
      const e = easyFor(id);
      b.querySelector('.bs').textContent = `BEST ${store.get(bestKey(id, e ? 'easy' : 'normal'), 0)}${e ? ' 🐣' : ''}`;
    }
    const easy = easyFor(HERO.id);
    $('easyBtn').setAttribute('aria-pressed', easy ? 'true' : 'false');
    $('easyBtn').querySelector('b').textContent = easy ? 'EASY ON' : 'EASY OFF';
    $('bestName').textContent = HERO.name;
    $('bestTitle').textContent = store.get(bestKey(HERO.id, easy ? 'easy' : 'normal'), 0);
    $('bestMode').textContent = easy ? ' 🐣' : '';
    $('wallet').textContent = store.get('coins', 0);
  }

  function buildPicker() {
    const row = $('picker');
    for (const av of ROSTER) {
      const b = document.createElement('button');
      b.className = 'avatar';
      b.dataset.id = av.id;
      b.setAttribute('role', 'radio');
      b.innerHTML = `<img alt="" src="${thumbs[av.id]}"><span class="nm">${av.name}</span><span class="bs">BEST 0</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setHero(av.id, true);
        b.blur();
      });
      row.appendChild(b);
    }
    const b = document.createElement('button');
    b.className = 'avatar buddy';
    b.id = 'buddyCard';
    b.title = 'Call your buddy (T)';
    b.innerHTML = `<img alt=""><span class="nm"></span><span class="bs">TAP ME!</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      S.init();
      sfx('click');
      callBuddy();
      b.blur();
    });
    row.appendChild(b);
  }

  function logo() {
    const [first, ...rest] = TITLE.split(' ');
    const em = (s) => s.replace(/TT/g, '<em>TT</em>');
    $('logo').innerHTML = `<span class="l1">${em(first)}</span>${rest.length ? `<span class="l2">${em(rest.join(' '))}</span>` : ''}`;
    $('logo').setAttribute('aria-label', TITLE);
    document.title = `${TITLE} · Teddy & Tommy`;
  }

  // ---------------------------------------------------------------- input

  function bindInput() {
    const KEYS = { ArrowUp: 0, KeyW: 0, Space: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      S.init();
      if (e.code === 'KeyM') return toggleMute();
      if (G.state === 'title') {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') {
          const i = ROSTER.findIndex((r) => r.id === HERO.id);
          const d = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1;
          setHero(ROSTER[(i + d + ROSTER.length) % ROSTER.length].id, true);
          e.preventDefault();
          return;
        }
        if (e.code === 'KeyT') return callBuddy();
        if (e.code === 'KeyE') return setEasy(!easyFor(HERO.id));
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          return startRun();
        }
        return;
      }
      if (G.state === 'over') {
        if ((e.code === 'Enter' || e.code === 'Space') && performance.now() - G.overAt > 700) {
          e.preventDefault();
          startRun();
        }
        return;
      }
      if (e.code === 'KeyP' || e.code === 'Escape') return pause(G.state === 'playing');
      if (G.state === 'paused') {
        if (e.code === 'Space' || e.code === 'Enter') pause(false);
        return;
      }
      if (e.code === 'KeyT') return callBuddy();
      if (e.code in KEYS && !e.repeat) {
        e.preventDefault();
        userHop(KEYS[e.code]);
      }
    });

    // touch and mouse: tap to hop forward, swipe to hop that way (it hops as soon as the swipe is clear)
    const cv = renderer.domElement;
    let start = null;
    cv.addEventListener('pointerdown', (e) => {
      S.init();
      start = { x: e.clientX, y: e.clientY, used: false, id: e.pointerId };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!start || start.used || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < 28) return;
      start.used = true;
      if (G.state !== 'playing') return;
      userHop(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy < 0 ? 0 : 2);
    });
    cv.addEventListener('pointerup', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const s = start;
      start = null;
      if (s.used) return;
      if (G.state === 'playing') userHop(0);
      else if (G.state === 'paused') pause(false);
    });
    cv.addEventListener('pointercancel', () => (start = null));
  }

  function userHop(dir) {
    if (G.state !== 'playing') return;
    if (G.auto) G.auto = false; // any arrow takes the wheel back
    tryHop(dir);
  }

  function toggleMute() {
    S.init();
    const m = S.toggleMute();
    for (const id of ['muteBtn', 'muteTitle']) $(id).textContent = m ? '🔇' : '🔊';
  }

  function bindButtons() {
    const tap = (id, fn) => {
      $(id).addEventListener('click', (e) => {
        e.stopPropagation();
        S.init();
        fn();
        $(id).blur();
      });
    };
    tap('playBtn', () => {
      sfx('click');
      startRun();
    });
    tap('againBtn', startRun);
    tap('changeBtn', toTitle);
    tap('pauseBtn', () => pause(true));
    tap('resumeBtn', () => pause(false));
    tap('muteBtn', toggleMute);
    tap('muteTitle', toggleMute);
    tap('buddyBtn', callBuddy);
    tap('easyBtn', () => {
      sfx('click');
      setEasy(!easyFor(HERO.id));
    });
    for (const id of ['muteBtn', 'muteTitle']) $(id).textContent = S.isMuted() ? '🔇' : '🔊';
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (G.autoPause) pause(true);
        S.suspend();
      } else S.resume();
    });
  }

  // ---------------------------------------------------------------- main loop

  function tick(dt) {
    if (!G.soak && (window.innerWidth !== view.w || window.innerHeight !== view.h) && window.innerWidth > 0) computeView(); // the pane may start hidden at 0×0
    if (G.state === 'paused' || G.state === 'loading') return;
    G.wt += dt;
    const w = G.world;
    if (w.next <= Math.max(P.r, P.maxR) + 34) w.ensure(w.next); // one zone at a time
    if (w.lo < P.maxR - 24) w.forget(P.maxR - 24);
    if ((G.attract || G.auto) && P.alive) autopilot(dt);
    updatePlayer(dt);
    if (G.soak) {
      updateInspectorTimer();
      return;
    }
    updateInspector(dt);
    updateBuddy(dt);
    syncViews();
    updateViews(dt);
    particles.update(dt);
    updateBursts(dt);
    updateCamera(dt);
    updateHud();
  }

  // soak runs skip the drawing: just the inspector's patience
  function updateInspectorTimer() {
    const md = G.world.mode;
    if (P.alive && P.idle >= md.idleCatch) {
      if (buddyGuarding()) P.idle = 0;
      else die('caught');
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (G.hold) return;
    tick(dt);
    render();
  }

  // ---------------------------------------------------------------- boot

  function boot() {
    renderer = new T.WebGLRenderer({ canvas: $('game'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.setClearColor('#7cc6f0');
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-5, 5, 8, -8, 0.1, 120);
    scene.add(new T.HemisphereLight('#ffffff', '#7a8fa6', 0.62));
    sun = new T.DirectionalLight('#fff6e6', 0.95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -16;
    sc.right = 16;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 60;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    particles = A.makeParticles(scene, 360);
    computeView();
    window.addEventListener('resize', () => {
      computeView();
      placeCamera();
    });

    Object.assign(thumbs, Kit.portraits(ROSTER, { size: 128 }));
    logo();
    buildPicker();
    buildInspector();
    setHero(store.get('pick', 'teddy'));
    bindInput();
    bindButtons();
    toTitle();
    $('loading').remove();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- test hooks (browser console)

  window.game = {
    // advance the game by `sec` seconds in 1/60 s steps and draw (the Browser pane throttles animation when hidden)
    step(sec = 0.5, o = {}) {
      if (o.auto !== undefined) G.auto = o.auto;
      const n = Math.max(1, Math.round(sec * 60));
      for (let i = 0; i < n; i++) tick(1 / 60);
      render();
      return this.state();
    },
    hold(on = true) { G.hold = on; },
    keepAwake(on = true) { G.autoPause = !on; },
    start(id) {
      if (id) setHero(id);
      startRun();
      return this.state();
    },
    title: () => toTitle(),
    pick: (id) => setHero(id, false),
    easy: (on) => setEasy(on),
    hop(dir = 0) {
      const d = typeof dir === 'string' ? { up: 0, right: 1, down: 2, left: 3 }[dir] : dir;
      userHop(d);
      return this.state();
    },
    buddy() {
      callBuddy();
      return { on: buddy.on, t: +buddy.t.toFixed(2), guarding: buddyGuarding(), x: +buddy.x.toFixed(2), z: +buddy.z.toFixed(2) };
    },
    auto(on = true) { G.auto = on; },
    // jump the kid to a row (for screenshots): the nearest grass cell at or before it
    teleport(r, c = 0) {
      const w = G.world;
      w.ensure(r + 40);
      for (let i = r; i > 0; i--) {
        const row = w.rows[i];
        if (row && row.type === 'grass' && !W.blocked(row, c)) {
          Object.assign(P, { r: i, x: c, toR: i, toX: c, maxR: Math.max(P.maxR, i), hopT: -1, log: -1, idle: 0 });
          G.score = P.maxR;
          syncViews();
          tick(0);
          snapCamera();
          return this.state();
        }
      }
      return null;
    },
    crash(kind = 'car') {
      if (P.alive) die(kind);
    },
    peek(k = 1) {
      // zoom in on the kid (k < 1 closer)
      camera.zoom = 1 / k;
      camera.updateProjectionMatrix();
    },
    state() {
      return {
        state: G.state, mode: G.mode, hero: HERO.id, buddy: BUDDY && BUDDY.id, score: G.score, coins: G.coins,
        row: P.r, x: +P.x.toFixed(2), hopping: P.hopT >= 0, alive: P.alive, cause: G.cause, idle: +P.idle.toFixed(2),
        inspector: insp.state, buddyOn: buddy.on, guarding: buddyGuarding(), t: +G.wt.toFixed(2),
        rowType: G.world && G.world.rows[P.r] && G.world.rows[P.r].type, kid: kid && kid.mode, celebrate: kid && kid.move,
      };
    },
    row: (i) => G.world.rows[i],
    rows(a = P.r - 2, b = P.r + 20) {
      let s = '';
      for (let i = a; i <= b; i++) {
        const r = G.world.rows[i];
        s += !r ? '?' : r.type === 'grass' ? (r.milestone ? 'M' : 'g') : r.type === 'road' ? 'R' : r.type === 'rail' ? 'T' : r.lily ? 'L' : '~';
      }
      return s;
    },
    // The generator's fairness check (also: node tools/check.js)
    check: (o) => W.check(o || { worlds: 3, rows: 200 }),
    // Play `seconds` of game time headless with the autopilot (nothing drawn) and log every way a run ended.
    // { auto: false } stands still: the inspector must catch you (proves the soak can fail).
    soak(seconds = 120, o = {}) {
      const keep = { state: G.state, attract: G.attract, mode: G.mode };
      const t0 = performance.now();
      G.soak = true;
      G.attract = false;
      G.mode = o.mode || 'normal';
      const ends = [];
      let rows = 0, runs = 0;
      const begin = () => {
        newWorld((o.seed || 99) + runs * 101);
        G.state = 'playing';
        G.auto = o.auto !== false;
        G.started = true;
        runs++;
      };
      begin();
      const dt = 1 / 30;
      for (let s = 0; s < seconds; s += dt) {
        tick(dt);
        if (!P.alive) {
          ends.push({ cause: G.cause, row: P.r, type: G.world.rows[P.r] && G.world.rows[P.r].type, t: +G.wt.toFixed(1), plan: ap.last });
          rows += P.maxR;
          begin();
        }
      }
      rows += P.maxR;
      G.soak = false;
      const res = { seconds, mode: G.mode, runs, rowsHopped: rows, ends, ms: Math.round(performance.now() - t0) };
      Object.assign(G, keep);
      G.auto = false;
      if (keep.state === 'title') toTitle();
      return res;
    },
    get G() { return G; },
    get P() { return P; },
  };

  window.addEventListener('load', boot);
})();
