/* HoppiTTy Hop: a hopping kid. Wraps a Kit person (Kit.people.build) with what this game needs: a squashy hop,
   facing the way you hop, a cartoon squish with circling stars, a splash that ends up bobbing in a swim ring,
   and the celebrations (Tommy's Y peace pose; Teddy's Mike Tyson-style boxing or his basketball jump shot with a
   🏀; a wave for everyone else).

   Hierarchy: root (feet, in the world) > turn (yaw) > squash (scale) > fit (size) > person.root */
(function () {
  'use strict';
  const T = THREE, Kit = window.Kit, people = Kit.people, A = window.CrossyArt;

  const SIZE = 0.55; // a 2.2-unit kit person stands about 1.2 cells tall (chunky and easy to see on a phone)
  const FACE_CAM = Math.PI + 0.3; // turned toward the camera (which sits behind and a little to the right)
  const damp = (k, dt) => 1 - Math.exp(-k * dt);
  const angleTo = (a, b) => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  // facing for each hop direction: forward (-z), right (+x), back (+z), left (-x)
  const YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

  // Kit poses like 'wave' and 'peace' stride while they pose (they were made for running buddies). Standing
  // still, the legs settle. (Same idea as FlaTTy Birds' standPose.)
  const STRIDING = { wave: 1, peace: 1, give: 1, run: 1, walk: 1 };
  function standPose(p, ph, mode, k) {
    people.pose(p, ph, mode, k);
    if (STRIDING[mode]) {
      p.legL.rotation.x *= 1 - Math.min(1, k * 2);
      p.legR.rotation.x *= 1 - Math.min(1, k * 2);
      p.hips.position.y = p.hipY;
    }
  }

  function build(entry, opts = {}) {
    const size = opts.size || SIZE;
    const root = new T.Group();
    const turn = new T.Group();
    const squash = new T.Group();
    const fit = new T.Group();
    root.add(turn);
    turn.add(squash);
    squash.add(fit);
    fit.scale.setScalar(size);
    const p = people.build(entry.look);
    fit.add(p.root);
    p.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });

    // circling stars after a squish
    const stars = new T.Group();
    const starMat = new T.SpriteMaterial({ map: A.starTexture(), depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const s = new T.Sprite(starMat);
      s.scale.setScalar(0.24);
      stars.add(s);
    }
    stars.visible = false;
    root.add(stars);

    const ring = A.buildRing();
    ring.scale.setScalar(size / 0.5);
    ring.visible = false;
    root.add(ring);

    // the basketball for Teddy's jump shot
    let ball = null;
    const ballV = new T.Vector3(), hA = new T.Vector3(), hB = new T.Vector3();
    if ((entry.signature || []).includes('jumpshot')) {
      ball = new T.Sprite(new T.SpriteMaterial({ map: Kit.gfx.emojiTexture('🏀'), depthWrite: false }));
      ball.scale.setScalar(0.3);
      ball.visible = false;
      root.add(ball);
    }

    const st = { mode: 'stand', t: 0, yaw: 0, wantYaw: 0, ph: 0, land: 0, hopP: -1, bump: 0, move: 'wave', shot: false, sink: 0 };

    const kid = {
      entry, root, person: p, size, ring, stars,
      get mode() { return st.mode; },
      get move() { return st.mode === 'celebrate' ? st.move : null; },
      set(mode, move) {
        if (mode !== st.mode || move !== st.move) {
          st.mode = mode;
          st.t = 0;
          st.shot = false;
          if (move) st.move = move;
        }
      },
      face(dir) { st.wantYaw = YAW[dir]; },
      faceYaw(y) { st.wantYaw = y; },
      faceCamera() { st.wantYaw = FACE_CAM; },
      snapFace() { st.yaw = st.wantYaw; turn.rotation.y = st.yaw; },
      hop(p01) { st.hopP = p01; }, // hop progress (0..1), or -1 when not hopping
      landed() { st.land = 1; },
      bump() { st.bump = 1; },
      update(dt) {
        st.t += dt;
        st.ph += dt * 6;
        st.yaw += angleTo(st.yaw, st.wantYaw) * damp(st.mode === 'stand' ? 22 : 10, dt);
        turn.rotation.y = st.yaw;
        st.land = Math.max(0, st.land - dt * 6);
        st.bump = Math.max(0, st.bump - dt * 5);
        let sx = 1, sy = 1, lift = 0;
        const m = st.mode;
        if (m === 'squish') {
          const k = Math.min(1, st.t / 0.08);
          sx = 1 + 0.5 * k;
          sy = 1 - 0.86 * k;
          standPose(p, 0, 'stand', 1);
          p.armL.rotation.z = -1.3;
          p.armR.rotation.z = 1.3;
        } else if (m === 'splash') {
          // down with a splash, then up again in a swim ring, waving
          const waist = 0.88 * size;
          st.sink = st.t < 0.35 ? -st.t * 2.4 : -2 * waist + Math.min(1, (st.t - 0.35) / 0.6) * (waist - 0.02) + Math.sin(st.t * 3) * 0.04;
          lift = st.sink;
          ring.visible = st.t > 0.45;
          ring.position.y = st.sink + waist; // at the water line, bobbing with the kid
          standPose(p, st.t * 6, st.t > 0.5 ? 'wave' : 'fall', damp(10, dt));
        } else if (m === 'celebrate') {
          celebrate(dt);
          return finish();
        } else if (m === 'caught') {
          standPose(p, st.ph, 'stand', damp(10, dt));
          p.head.rotation.x = 0.25;
          p.armL.rotation.z = -0.25;
          p.armR.rotation.z = 0.25;
        } else if (m === 'swim') {
          // the buddy crossing water on his ring
          ring.visible = true;
          ring.position.y = 0.32;
          lift = 0;
          standPose(p, st.ph, 'stand', damp(10, dt));
          p.armL.rotation.z = -0.9;
          p.armR.rotation.z = 0.9;
        } else if (st.hopP >= 0) {
          // a hop: stretch on the way up, arms up
          const u = st.hopP;
          sy = 1 + Math.sin(u * Math.PI) * 0.14;
          sx = 1 - Math.sin(u * Math.PI) * 0.06;
          people.pose(p, 0, 'jump', 0.55);
          p.legL.rotation.x *= 0.5;
          p.legR.rotation.x *= 0.5;
        } else {
          // standing: a little breathing bounce, a squash on landing or a bonk
          standPose(p, st.ph, m === 'stand' ? 'stand' : m, damp(16, dt));
          sy = 1 - st.land * 0.2 + Math.sin(st.t * 3.2) * 0.012 - st.bump * 0.12;
          sx = 1 + st.land * 0.12 + st.bump * 0.06;
        }
        if (m !== 'splash' && m !== 'swim') ring.visible = false;
        if (ball && m !== 'celebrate') ball.visible = false;
        squash.scale.set(sx, sy, sx);
        squash.position.y = lift;
        return finish();
      },
    };

    function finish() {
      // stars over a squished (or caught) kid
      stars.visible = st.mode === 'squish' || st.mode === 'caught';
      if (stars.visible) {
        const a = st.t * 4.5;
        const y = st.mode === 'squish' ? 0.32 : size * 2.3;
        stars.children.forEach((s, i) => {
          const b = a + (i * Math.PI * 2) / stars.children.length;
          s.position.set(Math.cos(b) * 0.38, y + Math.sin(b * 2) * 0.04, Math.sin(b) * 0.38);
        });
      }
      return kid;
    }

    // Celebration moves: boxing (light on his feet), the jump shot (a leap, the 🏀 flies up and away),
    // peace (Tommy's Y with happy hops), anything else waves.
    function celebrate(dt) {
      const mv = st.move, t = st.t;
      let hop = 0;
      if (mv === 'jumpshot') {
        standPose(p, t * 6, 'jumpshot', damp(14, dt));
        hop = t > 0.2 && t < 0.95 ? Math.sin((Math.PI * (t - 0.2)) / 0.75) * 0.5 : 0;
        updateBall(t, dt);
      } else if (mv === 'boxing') {
        standPose(p, t * 6, 'boxing', damp(14, dt));
        hop = Math.abs(Math.sin(t * 7)) * 0.03;
      } else {
        standPose(p, t * 6, mv, damp(12, dt));
        hop = Math.abs(Math.sin(t * 5.5)) * 0.16;
      }
      squash.scale.set(1, 1, 1);
      squash.position.y = hop;
    }

    function updateBall(t, dt) {
      const REL = 0.62;
      if (t > REL + 1.1) {
        ball.visible = false;
        return;
      }
      ball.visible = true;
      if (t < REL) {
        root.updateMatrixWorld(true);
        people.handWorld(p, -1, hA);
        people.handWorld(p, 1, hB);
        ball.position.copy(hA).add(hB).multiplyScalar(0.5);
        root.worldToLocal(ball.position);
        ball.position.y += 0.1;
        return;
      }
      if (!st.shot) {
        st.shot = true;
        // up and away toward the top of the screen
        ballV.set(0.4, 3.6, -2.4);
        try { Kit.sound.swish(); } catch (e) { /* sound is optional */ }
      }
      ballV.y -= 6 * dt;
      ball.position.addScaledVector(ballV, dt);
      ball.material.rotation -= dt * 8;
    }

    return kid;
  }

  window.CrossyHero = { build, SIZE, YAW, FACE_CAM, standPose };
})();
