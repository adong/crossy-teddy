/* HoppiTTy Hop: the art. Everything is built from boxes with vertex colours, so each row of the world (ground,
   trees, rocks, rails, lily pads) is a single mesh. Cars, ice-cream trucks, buses, logs and trains share one
   geometry per kind and colour. Also the dog, the swim ring, coins, particles and cartoon text bursts. */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, W = window.CrossyWorld;
  const { makeCanvas, toTexture, std, mesh, FONT } = Kit.gfx;
  const { COLS, EDGE } = W;

  const Art = {};

  // ---------------------------------------------------------------- the voxel builder

  // Face shading on top of the lighting, for a crisp blocky look: +x, -x, top, bottom, +z, -z.
  const FACE = [0.88, 0.88, 1, 0.6, 0.96, 0.96];
  const tmpC = new T.Color();

  function Vox() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }
  // A box from y to y + h, centred on x and z.
  Vox.prototype.box = function (x, y, z, w, h, d, color, noBottom = true) {
    tmpC.set(color);
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const faces = [
      [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    for (let f = 0; f < 6; f++) {
      if (f === 3 && noBottom) continue;
      const [n, ...v] = faces[f];
      const base = this.pos.length / 3;
      const k = FACE[f];
      for (const p of v) {
        this.pos.push(p[0], p[1], p[2]);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(tmpC.r * k, tmpC.g * k, tmpC.b * k);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  };
  Vox.prototype.geometry = function () {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  };
  Art.Vox = Vox;
  const voxMat = new T.MeshLambertMaterial({ vertexColors: true });
  Art.voxMat = voxMat;

  function voxMesh(v, shadow = true) {
    const m = new T.Mesh(v.geometry(), voxMat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    return m;
  }

  // ---------------------------------------------------------------- colours and little helpers

  // Like Kit.gfx.shade, but returns #rrggbb so it can be shaded again (out-of-bounds trees are darkened twice).
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16), to = amt < 0 ? 0 : 255, k = Math.abs(amt);
    const ch = (v) => Math.round(v + (to - v) * k);
    return '#' + ((ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, '0');
  }
  const C = {
    grassA: '#97d65a', grassB: '#8ccd50', road: '#4d5260', roadB: '#474b58', line: '#f4f4ee', rail: '#8f8476',
    sleeper: '#6b4a2f', steel: '#c9ced6', trunk: '#8b5a2b', leafA: '#3fae4a', leafB: '#2e9b3e', leafC: '#5cc34f',
    rock: '#a3acb6', rockTop: '#bcc4cc', water: '#55c6f2', log: '#9b6a3c', logTop: '#a8764a', logEnd: '#e2b583',
    lily: '#3fae4a', lilyB: '#2f9a3d', glass: '#bfe8ff', tyre: '#22222a', light: '#fff3b0', tail: '#ff4b4b',
  };
  const CAR_COLORS = ['#e53935', '#2d7bf0', '#2fb36a', '#8d5bd8', '#ff8a1f', '#16b3a8'];
  const TRUCK_COLORS = ['#ff8fc2', '#7fe0c4', '#c9a4ff', '#ffd45e', '#8fd3ff', '#ffb38a'];
  const BUS_COLORS = ['#ffc62e', '#ffb02e', '#ffd84d', '#ff9f1c', '#ffc62e', '#4aa3ff'];
  const OOB = -0.3; // out of bounds is darker

  function hash(n) {
    // tiny deterministic random from an integer seed
    let s = n | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function tree(v, x, z, r, dark) {
    const h = 0.35 + Math.floor(r() * 3) * 0.32;
    const tint = (c) => (dark ? shade(c, OOB) : c);
    v.box(x, 0, z, 0.26, 0.32, 0.26, tint(C.trunk));
    const leaf = r() < 0.5 ? C.leafA : r() < 0.5 ? C.leafB : C.leafC;
    v.box(x, 0.32, z, 0.78, h, 0.78, tint(leaf));
    if (r() < 0.4) v.box(x, 0.32 + h, z, 0.5, 0.2, 0.5, tint(shade(leaf, 0.12)));
    return 0.32 + h;
  }
  function rock(v, x, z, r, dark) {
    const tint = (c) => (dark ? shade(c, OOB) : c);
    const w = 0.62 + r() * 0.14;
    v.box(x, 0, z, w, 0.34, w * 0.9, tint(C.rock));
    v.box(x + 0.04, 0.34, z - 0.02, w * 0.62, 0.12, w * 0.56, tint(C.rockTop));
    return 0.46;
  }
  Art.obstacleHeight = (kind) => (kind === 2 ? 0.46 : 1);

  function ground(v, top, colPlay, colOob, depth = 1.4) {
    const inner = COLS + 0.5;
    const outer = EDGE + 0.5;
    v.box(0, top - depth, 0, inner * 2, depth, 1, colPlay);
    v.box(-(inner + outer) / 2, top - depth, 0, outer - inner, depth, 1, colOob);
    v.box((inner + outer) / 2, top - depth, 0, outer - inner, depth, 1, colOob);
  }

  // ---------------------------------------------------------------- water

  function waterTexture() {
    const [c, g] = makeCanvas(128, 128);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,0)';
    g.strokeStyle = '#d8f4ff';
    g.lineWidth = 6;
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const y = 16 + k * 32;
      g.beginPath();
      g.moveTo(10 + (k % 2) * 50, y);
      g.lineTo(40 + (k % 2) * 50, y);
      g.stroke();
    }
    const tex = toTexture(c, true);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set((EDGE * 2 + 1) / 2.5, 1 / 2.5);
    return tex;
  }
  // one texture per flow direction (-1, 0, +1), so each can scroll its own way
  const waterTex = { '-1': waterTexture(), 0: waterTexture(), 1: waterTexture() };
  const waterMat = {};
  for (const d of ['-1', '0', '1']) {
    waterMat[d] = new T.MeshLambertMaterial({ color: C.water, map: waterTex[d] });
    waterMat[d + 'd'] = new T.MeshLambertMaterial({ color: shade(C.water, OOB), map: waterTex[d] });
  }
  Art.flowWater = function (t, speeds) {
    for (const d of [-1, 1]) waterTex[d].offset.x = -(d * t * (speeds[d] || 1)) / 2.5;
    waterTex[0].offset.y = Math.sin(t * 0.8) * 0.02;
  };
  const waterGeo = { play: new T.BoxGeometry((COLS + 0.5) * 2, 0.9, 1), side: new T.BoxGeometry(EDGE - COLS, 0.9, 1) };
  const WATER_TOP = -0.32;
  Art.WATER_TOP = WATER_TOP;
  Art.LOG_TOP = -0.06;
  Art.LILY_TOP = -0.27;

  // ---------------------------------------------------------------- rows

  // Build everything for one row that doesn't move. Returns { group, lamps, glows, coins }.
  Art.buildRow = function (row, prev) {
    const group = new T.Group();
    group.position.z = -row.i;
    const v = new Vox();
    const r = hash(row.seed || row.i * 7919);
    const out = { group, lamps: null, coins: [], own: [] }; // own: things only this row uses (disposed with it)
    if (row.type === 'grass') {
      const g = row.i % 2 ? C.grassA : C.grassB;
      ground(v, 0, g, shade(g, OOB));
      for (let c = -COLS; c <= COLS; c++) {
        const b = row.block[c + COLS];
        if (b === 1) tree(v, c, 0, r, false);
        else if (b === 2) rock(v, c, 0, r, false);
        else if (r() < 0.22) {
          // flowers and tufts (just for looks)
          const fx = c + (r() - 0.5) * 0.6, fz = (r() - 0.5) * 0.6;
          if (r() < 0.5) v.box(fx, 0, fz, 0.1, 0.1, 0.1, r() < 0.5 ? '#ff7ab8' : '#ffe14d');
          else v.box(fx, 0, fz, 0.14, 0.08, 0.06, shade(g, -0.15));
        }
      }
      for (let c = COLS + 1; c <= EDGE; c++) {
        for (const s of [-1, 1]) {
          const k = r();
          if (k < 0.72) tree(v, s * c, (r() - 0.5) * 0.1, r, true);
          else if (k < 0.85) rock(v, s * c, 0, r, true);
        }
      }
      if (row.milestone) {
        // party flags at the edges
        for (const s of [-1, 1]) {
          const x = s * (COLS + 0.7);
          v.box(x, 0, 0, 0.08, 1.7, 0.08, '#f4f4ee');
          const cols = ['#ff3d7f', '#ffd400', '#18d4ff'];
          for (let k = 0; k < 3; k++) v.box(x + s * 0.2, 1.25 - k * 0.12, 0, 0.32 - k * 0.08, 0.12, 0.04, cols[k]);
        }
      }
    } else if (row.type === 'road') {
      ground(v, -0.02, row.i % 2 ? C.road : C.roadB, shade(C.road, OOB));
      if (prev && prev.type === 'road') {
        for (let x = -EDGE; x <= EDGE; x += 1) v.box(x, -0.02, 0.5, 0.46, 0.012, 0.07, Math.abs(x) > COLS ? shade(C.line, OOB) : C.line);
      }
    } else if (row.type === 'rail') {
      ground(v, 0, C.rail, shade(C.rail, OOB));
      for (let x = -EDGE; x <= EDGE; x += 0.5) v.box(x, 0, 0, 0.16, 0.05, 0.82, Math.abs(x) > COLS + 0.5 ? shade(C.sleeper, OOB) : C.sleeper);
      for (const z of [-0.22, 0.22]) v.box(0, 0.05, z, (EDGE + 0.5) * 2, 0.06, 0.06, C.steel);
      // signal posts on both sides, facing you
      out.lamps = [];
      for (const s of [-1, 1]) {
        const x = s * (COLS + 0.85);
        v.box(x, 0, 0.38, 0.1, 1.25, 0.1, '#8c939c');
        v.box(x, 1.12, 0.38, 0.46, 0.24, 0.12, '#22222a');
        v.box(x, 0, 0.38, 0.3, 0.06, 0.3, '#5d636b');
      }
    } else if (row.type === 'river') {
      const d = row.lily ? '0' : String(row.dir);
      const play = new T.Mesh(waterGeo.play, waterMat[d]);
      play.position.y = WATER_TOP - 0.45;
      play.receiveShadow = true;
      group.add(play);
      for (const s of [-1, 1]) {
        const side = new T.Mesh(waterGeo.side, waterMat[d + 'd']);
        side.position.set(s * (COLS + 0.5 + (EDGE - COLS) / 2), WATER_TOP - 0.45, 0);
        side.receiveShadow = true;
        group.add(side);
      }
      if (row.lily) {
        for (let c = -COLS; c <= COLS; c++) {
          if (!row.block[c + COLS]) continue;
          v.box(c, WATER_TOP - 0.01, 0, 0.8, 0.06, 0.8, C.lily);
          v.box(c + 0.18, WATER_TOP + 0.05, 0.18, 0.3, 0.012, 0.3, C.lilyB);
          if (r() < 0.35) {
            v.box(c - 0.2, WATER_TOP + 0.05, -0.15, 0.14, 0.1, 0.14, '#ff9fd0');
            v.box(c - 0.2, WATER_TOP + 0.15, -0.15, 0.06, 0.04, 0.06, '#ffe14d');
          }
        }
      }
    }
    if (v.pos.length) {
      const m = voxMesh(v, row.type === 'grass');
      group.add(m);
      out.own.push(m.geometry);
    }
    if (row.type === 'rail') {
      // the warning lights: two red lamps per post that flash in turn
      out.lamps = [];
      for (const s of [-1, 1]) {
        for (const k of [-1, 1]) {
          const lamp = new T.Mesh(lampGeo, lampOff);
          lamp.position.set(s * (COLS + 0.85) + k * 0.12, 1.24, 0.45);
          group.add(lamp);
          const glow = new T.Sprite(glowMat);
          glow.scale.setScalar(0.9);
          glow.position.copy(lamp.position);
          glow.position.z += 0.05;
          glow.visible = false;
          group.add(glow);
          out.lamps.push({ lamp, glow, k });
        }
      }
    }
    if (row.milestone) {
      const deco = new T.Mesh(new T.PlaneGeometry(3.2, 0.95), new T.MeshLambertMaterial({ map: milestoneTexture(row.milestone), transparent: true, depthWrite: false }));
      out.own.push(deco.geometry, deco.material, deco.material.map);
      deco.rotation.x = -Math.PI / 2;
      deco.position.y = 0.012;
      deco.receiveShadow = true;
      group.add(deco);
    }
    for (const c of row.coins || []) {
      const coin = Art.buildCoin();
      coin.position.set(c, row.type === 'road' ? 0.36 : 0.38, 0);
      group.add(coin);
      out.coins.push({ c, mesh: coin, taken: false });
    }
    return out;
  };

  const lampGeo = new T.BoxGeometry(0.15, 0.15, 0.04);
  const lampOff = new T.MeshBasicMaterial({ color: '#4a1414' });
  const lampOn = new T.MeshBasicMaterial({ color: '#ff3030' });
  const glowMat = new T.SpriteMaterial({ map: Kit.gfx.glowTexture(), color: '#ff3a2a', blending: T.AdditiveBlending, depthWrite: false, transparent: true });
  Art.setLamps = function (lamps, on, t) {
    const flip = Math.floor(t * 3.2) % 2 ? 1 : -1;
    for (const L of lamps) {
      const lit = on && L.k === flip;
      L.lamp.material = lit ? lampOn : lampOff;
      L.glow.visible = lit;
    }
  };

  function milestoneTexture(n) {
    const [c, g] = makeCanvas(512, 152);
    g.font = `112px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 18;
    g.strokeStyle = 'rgba(20,18,31,0.55)';
    const s = `★ ${n} ★`;
    g.strokeText(s, 256, 82);
    g.fillStyle = '#fff8d0';
    g.fillText(s, 256, 82);
    return toTexture(c);
  }

  // ---------------------------------------------------------------- vehicles, logs, trains (built facing +x)

  const geoCache = {};
  function cached(key, make) {
    return geoCache[key] || (geoCache[key] = make());
  }
  function wheels(v, len, z) {
    for (const x of [-len / 2 + 0.32, len / 2 - 0.32]) for (const s of [-1, 1]) v.box(x, 0, s * z, 0.3, 0.28, 0.1, C.tyre);
  }

  function carGeo(color) {
    const v = new Vox();
    wheels(v, 1.4, 0.38);
    v.box(0, 0.1, 0, 1.4, 0.34, 0.78, color);
    v.box(-0.08, 0.44, 0, 0.78, 0.25, 0.7, C.glass);
    v.box(-0.08, 0.69, 0, 0.84, 0.07, 0.74, color);
    v.box(-0.08, 0.44, 0, 0.14, 0.25, 0.71, color); // pillar between the windows
    for (const s of [-1, 1]) {
      v.box(0.7, 0.26, s * 0.25, 0.04, 0.1, 0.14, C.light);
      v.box(-0.7, 0.26, s * 0.27, 0.04, 0.08, 0.12, C.tail);
    }
    v.box(0.7, 0.1, 0, 0.06, 0.08, 0.8, '#3a3a44');
    v.box(-0.7, 0.1, 0, 0.06, 0.08, 0.8, '#3a3a44');
    return v.geometry();
  }

  // the ice-cream truck: a cab at the front, a pink box at the back with a big cone on the roof
  function truckGeo(color) {
    const v = new Vox();
    wheels(v, 2.0, 0.4);
    v.box(0.65, 0.1, 0, 0.66, 0.62, 0.82, '#ffffff');
    v.box(0.82, 0.42, 0, 0.32, 0.24, 0.84, C.glass);
    v.box(-0.32, 0.1, 0, 1.32, 0.92, 0.86, color);
    v.box(-0.32, 0.36, 0, 1.34, 0.1, 0.88, '#ffffff');
    v.box(-0.25, 0.55, 0.0, 0.7, 0.3, 0.88, '#6b4a8f'); // serving windows
    v.box(-0.25, 0.5, 0, 0.8, 0.05, 0.92, '#ffffff');
    // the cone
    v.box(-0.32, 1.02, 0, 0.22, 0.3, 0.22, '#d9a05b');
    v.box(-0.32, 1.32, 0, 0.4, 0.3, 0.4, '#ffb3d6');
    v.box(-0.32, 1.62, 0, 0.26, 0.16, 0.26, '#fff4e0');
    v.box(-0.32, 1.78, 0, 0.08, 0.08, 0.08, '#e53935');
    v.box(0.99, 0.2, 0, 0.04, 0.1, 0.6, C.light);
    return v.geometry();
  }

  function busGeo(color) {
    const v = new Vox();
    wheels(v, 2.8, 0.42);
    v.box(0, 0.1, 0, 2.8, 0.92, 0.86, color);
    v.box(-0.1, 0.52, 0, 2.4, 0.3, 0.88, C.glass);
    for (let x = -1.1; x <= 1.0; x += 0.5) v.box(x, 0.52, 0, 0.07, 0.3, 0.89, color);
    v.box(1.38, 0.45, 0, 0.06, 0.4, 0.74, C.glass);
    v.box(0, 1.02, 0, 2.6, 0.06, 0.8, shade(color, 0.15));
    v.box(0, 0.24, 0, 2.82, 0.08, 0.88, '#2b2b33');
    for (const s of [-1, 1]) {
      v.box(1.41, 0.22, s * 0.3, 0.04, 0.1, 0.12, C.light);
      v.box(-1.41, 0.22, s * 0.3, 0.04, 0.1, 0.12, C.tail);
    }
    return v.geometry();
  }

  Art.buildVehicle = function (kind, colorIdx) {
    const key = kind + colorIdx;
    const geo = cached(key, () => (kind === 'bus' ? busGeo(BUS_COLORS[colorIdx]) : kind === 'truck' ? truckGeo(TRUCK_COLORS[colorIdx]) : carGeo(CAR_COLORS[colorIdx])));
    const m = new T.Mesh(geo, voxMat);
    m.castShadow = true;
    return m;
  };

  Art.buildLog = function (len) {
    const geo = cached('log' + len, () => {
      const v = new Vox();
      v.box(0, -0.4, 0, len - 0.04, 0.34, 0.74, C.log);
      v.box(0, -0.06, -0.12, len - 0.3, 0.02, 0.16, C.logTop);
      for (const s of [-1, 1]) v.box(s * (len / 2 - 0.02), -0.39, 0, 0.04, 0.32, 0.66, C.logEnd);
      v.box(len * 0.18, -0.06, 0.16, 0.24, 0.05, 0.12, '#7a5130');
      return v.geometry();
    });
    const m = new T.Mesh(geo, voxMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const TRAIN_STRIPES = ['#ff3d7f', '#18b4ff', '#2fb36a', '#ff8a1f'];
  Art.buildTrain = function (cars, stripe) {
    const geo = cached(`train${cars}_${stripe}`, () => {
      const v = new Vox();
      const col = TRAIN_STRIPES[stripe % TRAIN_STRIPES.length];
      const len = cars * 4;
      for (let k = 0; k < cars; k++) {
        const cx = len / 2 - 2 - k * 4; // car 0 is the front (at +x)
        v.box(cx, 0.08, 0, 3.86, 1.2, 0.9, '#e3e7ec');
        v.box(cx, 0.48, 0, 3.88, 0.14, 0.92, col);
        v.box(cx, 0.72, 0, 3.4, 0.32, 0.92, '#2a3550');
        for (let x = -1.2; x <= 1.21; x += 0.8) v.box(cx + x, 0.72, 0, 0.08, 0.32, 0.93, '#e3e7ec');
        v.box(cx, 1.28, 0, 3.6, 0.08, 0.7, '#b8bec7');
        for (const x of [-1.3, 1.3]) v.box(cx + x, 0, 0, 0.9, 0.12, 0.7, '#2b2b33');
      }
      // the front: windscreen, headlights and a nose stripe
      const fx = len / 2;
      v.box(fx - 0.02, 0.62, 0, 0.06, 0.46, 0.78, C.glass);
      for (const s of [-1, 1]) v.box(fx, 0.3, s * 0.28, 0.05, 0.12, 0.16, C.light);
      v.box(fx, 0.48, 0, 0.05, 0.14, 0.9, col);
      return v.geometry();
    });
    const m = new T.Mesh(geo, voxMat);
    m.castShadow = true;
    return m;
  };

  // ---------------------------------------------------------------- coins

  const coinGeo = new T.CylinderGeometry(0.2, 0.2, 0.06, 18).rotateX(Math.PI / 2);
  const coinMat = new T.MeshStandardMaterial({ color: '#ffc928', metalness: 0.35, roughness: 0.35, emissive: '#8a5a00', emissiveIntensity: 0.35 });
  const coinRimGeo = new T.TorusGeometry(0.2, 0.025, 6, 18);
  const coinRimMat = new T.MeshStandardMaterial({ color: '#ffe680', metalness: 0.4, roughness: 0.3 });
  Art.buildCoin = function () {
    const g = new T.Group();
    const face = new T.Mesh(coinGeo, coinMat);
    face.castShadow = true;
    g.add(face);
    g.add(new T.Mesh(coinRimGeo, coinRimMat));
    return g;
  };

  // ---------------------------------------------------------------- the inspector's dog (my own: a spotty pup)

  Art.buildDog = function () {
    const root = new T.Group();
    const white = std('#f6f1e7'), brown = std('#9a5b2e'), black = std('#151418'), red = std('#e53935'), gold = std('#ffc928', { metalness: 0.4, roughness: 0.4 });
    const body = new T.Group();
    body.position.y = 0.3;
    root.add(body);
    mesh(new T.BoxGeometry(0.26, 0.22, 0.48), white, 0, 0, 0, body);
    mesh(new T.BoxGeometry(0.2, 0.06, 0.18), brown, 0.04, 0.12, 0.06, body); // a patch on his back
    const head = new T.Group();
    head.position.set(0, 0.16, -0.27);
    body.add(head);
    mesh(new T.BoxGeometry(0.26, 0.24, 0.24), white, 0, 0, 0, head);
    mesh(new T.BoxGeometry(0.1, 0.12, 0.02), brown, 0.07, 0.03, -0.12, head); // patch over one eye
    mesh(new T.BoxGeometry(0.14, 0.11, 0.12), white, 0, -0.05, -0.16, head);
    mesh(new T.BoxGeometry(0.07, 0.05, 0.04), black, 0, -0.01, -0.23, head);
    for (const s of [-1, 1]) {
      mesh(new T.BoxGeometry(0.04, 0.04, 0.02), black, s * 0.06, 0.05, -0.125, head);
      const ear = mesh(new T.BoxGeometry(0.06, 0.16, 0.12), brown, s * 0.15, -0.01, 0.02, head);
      ear.rotation.z = s * 0.25;
    }
    const tongue = mesh(new T.BoxGeometry(0.05, 0.02, 0.06), std('#ff7aa5'), 0, -0.11, -0.2, head);
    mesh(new T.BoxGeometry(0.28, 0.05, 0.08), red, 0, -0.12, 0.08, head);
    mesh(new T.BoxGeometry(0.05, 0.05, 0.02), gold, 0, -0.16, 0.0, head);
    const tail = new T.Group();
    tail.position.set(0, 0.08, 0.24);
    body.add(tail);
    mesh(new T.BoxGeometry(0.05, 0.05, 0.2), brown, 0, 0, 0.09, tail);
    const legGeo = new T.BoxGeometry(0.07, 0.2, 0.07).translate(0, -0.1, 0);
    const legs = [[-0.08, -0.16], [0.08, -0.16], [-0.08, 0.16], [0.08, 0.16]].map(([x, z]) => {
      const l = new T.Group();
      l.position.set(x, 0.2, z);
      root.add(l);
      mesh(legGeo, white, 0, 0, 0, l);
      return l;
    });
    return { root, body, head, legs, tail, tongue };
  };

  Art.poseDog = function (d, ph, mode) {
    const s = Math.sin(ph);
    const run = mode !== 'sit';
    d.legs[0].rotation.x = run ? s * 0.9 : 0;
    d.legs[1].rotation.x = run ? -s * 0.9 : 0;
    d.legs[2].rotation.x = run ? -s * 0.9 : 0;
    d.legs[3].rotation.x = run ? s * 0.9 : 0;
    d.body.position.y = 0.3 + (run ? Math.abs(Math.cos(ph)) * 0.04 : 0);
    d.tail.rotation.y = Math.sin(ph * 2.5) * 0.7; // always wagging: he's a friendly dog
    d.tail.rotation.x = -0.5;
    d.head.rotation.x = mode === 'bark' ? -0.25 + Math.abs(Math.sin(ph * 3)) * 0.2 : 0;
  };

  // ---------------------------------------------------------------- swim ring (for a splash, and the buddy on water)

  Art.buildRing = function () {
    const g = new T.Group();
    const orange = std('#ff6a2a'), white = std('#ffffff');
    for (let k = 0; k < 8; k++) {
      const seg = new T.Mesh(new T.TorusGeometry(0.36, 0.11, 8, 6, Math.PI / 4), k % 2 ? white : orange);
      seg.rotation.z = (k * Math.PI) / 4;
      seg.castShadow = true;
      g.add(seg);
    }
    g.rotation.x = -Math.PI / 2;
    return g;
  };

  // ---------------------------------------------------------------- effects: voxel particles, text bursts, stars

  Art.makeParticles = function (scene, n) {
    const geo = new T.BoxGeometry(1, 1, 1);
    const mat = new T.MeshLambertMaterial({ color: '#ffffff' });
    const im = new T.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.frustumCulled = false;
    scene.add(im);
    const ps = [];
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), sc = new T.Vector3(), p = new T.Vector3();
    const col = new T.Color();
    for (let k = 0; k < n; k++) {
      ps.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 0.1, spin: 0, g: 9 });
      im.setColorAt(k, col.set('#ffffff'));
      im.setMatrixAt(k, m4.makeScale(0, 0, 0));
    }
    let next = 0;
    return {
      emit(x, y, z, count, o = {}) {
        for (let i = 0; i < count; i++) {
          const P = ps[next];
          const k = next;
          next = (next + 1) % n;
          const a = Math.random() * Math.PI * 2, sp = (o.speed || 2) * (0.4 + Math.random() * 0.8);
          Object.assign(P, {
            life: (o.life || 0.8) * (0.7 + Math.random() * 0.5), x: x + (Math.random() - 0.5) * (o.spread || 0.2), y, z: z + (Math.random() - 0.5) * (o.spread || 0.2),
            vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (o.up || 3) * (0.6 + Math.random() * 0.7), s: (o.size || 0.1) * (0.7 + Math.random() * 0.6),
            spin: Math.random() * 6, g: o.gravity ?? 9,
          });
          P.max = P.life;
          const cs = o.colors || [o.color || '#ffffff'];
          im.setColorAt(k, col.set(cs[Math.floor(Math.random() * cs.length)]));
        }
        im.instanceColor.needsUpdate = true;
      },
      update(dt) {
        for (let k = 0; k < n; k++) {
          const P = ps[k];
          if (P.life <= 0) continue;
          P.life -= dt;
          P.vy -= P.g * dt;
          P.x += P.vx * dt;
          P.y += P.vy * dt;
          P.z += P.vz * dt;
          P.spin += dt * 5;
          const f = Math.max(0, P.life / P.max);
          const s = P.life > 0 ? P.s * Math.min(1, f * 2.5) : 0;
          e.set(P.spin, P.spin * 0.7, 0);
          im.setMatrixAt(k, m4.compose(p.set(P.x, P.y, P.z), q.setFromEuler(e), sc.set(s, s, s)));
        }
        im.instanceMatrix.needsUpdate = true;
      },
    };
  };

  // A comic starburst with a word in it: POW!, SPLASH!, SAVED!
  const burstCache = {};
  Art.burstTexture = function (word, fill = '#ffd400', edge = '#ff3d7f') {
    const key = word + fill + edge;
    if (burstCache[key]) return burstCache[key];
    const [c, g] = makeCanvas(256, 256);
    g.translate(128, 128);
    g.beginPath();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const r = k % 2 ? 78 : 120;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = edge;
    g.lineJoin = 'round';
    g.stroke();
    g.rotate(-0.12);
    const size = word.length > 5 ? 46 : 60;
    g.font = `${size}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#14121f';
    g.strokeText(word, 0, 4);
    g.fillStyle = '#ffffff';
    g.fillText(word, 0, 4);
    return (burstCache[key] = toTexture(c));
  };

  let starTex = null;
  Art.starTexture = function () {
    if (starTex) return starTex;
    const [c, g] = makeCanvas(64, 64);
    g.translate(32, 33);
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k / 10) * Math.PI * 2;
      const r = k % 2 ? 12 : 28;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = '#ffe14d';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = '#14121f';
    g.lineJoin = 'round';
    g.stroke();
    return (starTex = toTexture(c));
  };

  window.CrossyArt = Art;
})();
