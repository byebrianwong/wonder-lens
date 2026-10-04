import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Puffs } from '../../../engine/Particles';
import { fluffyTree } from '../../../engine/Foliage';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { easeOutBack, envelope } from '../../../engine/Rig';
import { SETS } from '../layout';
import { FILMS, forwardOf, type BuiltSet, type SetContext } from '../common';
import { BED, HOME_OZ, PADDIES_BACK, PADDIES_FRONT_LEFT, laneX } from '../garden/layout';
import { buildPlace } from '../garden/place';
import { getCast, poseKid, wavePose, type TotoroPose } from '../garden/cast';
import { buildBirds, buildDew, buildMist, buildSprouts } from '../garden/fx';

/*
 * Home, at dawn (My Neighbor Totoro), z -2400 to -2620: the same garden as at the start, at sunrise.
 *
 *  z -2394  under the white cloud cover the Catbus catches you; the garden appears below
 *  z -2414  out of the cloud: a glide down over the rice fields, mist lying on them, birds wheeling in the
 *           sunrise ahead-right, the old house ahead on the left
 *  z -2494  down on the dirt lane: past the house (z -2530), the pump; Totoro, Chu and Chibi watching from
 *           the edge of the camphor wood ahead on the left, waving now and then (Totoro has his umbrella back)
 *  z -2556  Satsuki and Mei, still in their nightclothes, dancing round the seed bed (on the right at
 *           z -2582), now full of fresh green sprouts; as you come they turn and jump for joy, arms up
 *  z -2588  the closing shot (the world runs the Catbus off along a curve up the grassy hill ahead-right,
 *           whose ground this scene shapes to meet that curve, and raises the camera): the girls run after
 *           it along the lane and wave both arms; Totoro and the little ones wave goodbye from the wood
 */

/** The scene appears here, inside the white cloud cover (full from z -2392 to -2414). */
const SHOW_Z0 = -2394;

export function buildHome(ctx: SetContext): BuiltSet {
  const { road, camera } = ctx;
  const U = (z: number) => road.u(z);
  const oz = HOME_OZ;
  const group = new THREE.Group();
  const rng = new Rng(7171);

  // ---------- the hill the Catbus runs over: its ground meets the world's run-off curve exactly ----------
  const p0 = road.at(-2588);
  const P = new THREE.Vector3(p0.x, p0.y, -2588);
  const run = new THREE.CubicBezierCurve3(P.clone(), P.clone().add(new THREE.Vector3(0, 0, -60)), P.clone().add(new THREE.Vector3(26, 10, -120)), P.clone().add(new THREE.Vector3(70, 26, -200)));
  const runPts = run.getSpacedPoints(160);
  // a broad rounded hill whose top is a little beyond where the curve ends
  const H = P.clone().add(new THREE.Vector3(88, 0, -222));
  const bell = (x: number, z: number) => {
    const d = Math.hypot(x - H.x, z - H.z);
    return d > 240 ? 0 : 30 * Math.pow(0.5 + 0.5 * Math.cos((Math.PI * d) / 240), 1.3);
  };
  const shape = (x: number, z: number, h: number) => {
    let out = h + bell(x, z);
    // near the curve the ground is exactly the curve's height, so the Catbus's paws are on it
    if (x > P.x - 30 && x < P.x + 110 && z < P.z + 10 && z > P.z - 225) {
      let best = 1e9, by = 0;
      for (const q of runPts) { const d = (q.x - x) ** 2 + (q.z - z) ** 2; if (d < best) { best = d; by = q.y; } }
      out = lerp(by, out, smoothstep(4, 24, Math.sqrt(best)));
    }
    return out;
  };
  const clear = [{ x: -41, z: -2658, r: 9 }, ...runPts.filter((_, i) => i % 8 === 0).map((q) => ({ x: q.x, z: q.z, r: 10 }))];
  const place = buildPlace({ oz, night: false, lowDetail: ctx.lowDetail, frontRight: false, shape, clear, grass: { x0: -40, x1: 128, z0: -262, z1: 170 } });
  group.add(place.group);
  // a lone tree on the hill's shoulder, left of where the Catbus goes over
  {
    const tp = P.clone().add(new THREE.Vector3(40, 0, -214));
    const tr = fluffyTree([
      { c: new THREE.Vector3(0, 7.5, 0), r: new THREE.Vector3(6, 4.4, 6) }, { c: new THREE.Vector3(3.5, 6.2, 1.5), r: new THREE.Vector3(3.6, 2.8, 3.6) },
      { c: new THREE.Vector3(-3.4, 6.6, -1.2), r: new THREE.Vector3(3.8, 3, 3.8) }, { c: new THREE.Vector3(0.5, 10.4, -0.5), r: new THREE.Vector3(3.4, 2.6, 3.4) },
    ], 0x5a9a44, new Rng(7172), { density: 0.3, cardScale: 0.8 });
    tr.position.set(tp.x, place.height(tp.x, tp.z), tp.z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 6.5, 8), new THREE.MeshToonMaterial({ color: 0x5a4632 }));
    trunk.position.set(0, 3.2, 0);
    trunk.castShadow = true;
    tr.add(trunk);
    group.add(tr);
  }

  // ---------- morning: mist on the fields, dew, birds ----------
  const mistPatches: Array<{ x: number; z: number; w: number; d: number; y: number; opacity: number }> = [];
  for (const b of [...PADDIES_BACK, PADDIES_FRONT_LEFT]) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2 + oz, w = b.x1 - b.x0 + 30, d = b.z1 - b.z0 + 30;
    mistPatches.push({ x: cx, z: cz, w, d, y: 0.7, opacity: 0.42 }, { x: cx + 6, z: cz - 5, w: w * 0.85, d: d * 0.85, y: 1.8, opacity: 0.26 });
  }
  // and far out over the valley and round the foot of the hill
  mistPatches.push({ x: -120, z: -2700, w: 260, d: 300, y: 2.5, opacity: 0.32 }, { x: 160, z: -2560, w: 200, d: 260, y: 1.6, opacity: 0.3 }, { x: 40, z: -2900, w: 420, d: 180, y: 9, opacity: 0.3 });
  const mist = buildMist(mistPatches, 0xfff2e8);
  group.add(mist.group);
  const dewPts: THREE.Vector3[] = [];
  for (let i = 0; i < 700; i++) {
    const lz = rng.range(-110, 50), side = rng.sign();
    const lx = laneX(lz) + side * rng.range(2.6, 26);
    if (Math.hypot(lx - BED.x, lz - BED.z) < 3) continue;
    const x = lx, z = lz + oz;
    dewPts.push(new THREE.Vector3(x, place.height(x, z) + rng.range(0.35, 0.95), z));
  }
  const dew = buildDew(dewPts);
  group.add(dew.points);
  const birds = buildBirds(9, new THREE.Vector3(55, 30, -2690), 45);
  group.add(birds.group);

  // ---------- the seed bed, full of fresh sprouts; more pop up where an acorn lands ----------
  const BASE = 26, EXTRA = 14;
  const sprouts = buildSprouts(BASE + EXTRA);
  group.add(sprouts.mesh);
  const bed = new THREE.Vector3(BED.x, 0, BED.z + oz);
  const sproutAt: Array<{ p: THREE.Vector3; h: number; ph: number; t0: number }> = [];
  for (let i = 0; i < BASE; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng.next());
    const p = new THREE.Vector3(bed.x + Math.cos(a) * r * (BED.w / 2 - 0.3), 0.12, bed.z + Math.sin(a) * r * (BED.d / 2 - 0.3));
    sproutAt.push({ p, h: rng.range(0.9, 1.7), ph: rng.range(0, TAU), t0: -99 });
  }
  for (let i = 0; i < EXTRA; i++) sproutAt.push({ p: new THREE.Vector3(), h: rng.range(1.0, 1.5), ph: rng.range(0, TAU), t0: -1 });
  let nextExtra = 0;
  const puffs = new Puffs(0xeaf4d8, 30, 71);
  group.add(puffs.group);

  // ---------- the cast at dawn ----------
  const cast = getCast(ctx);
  const { totoro, chu, chibi, satsuki, mei } = cast;
  const troupe = new THREE.Group();
  group.add(troupe);
  const adopt = () => { for (const m of [totoro.group, chu.group, chibi.group, satsuki.group, mei.group]) if (m.parent !== troupe) troupe.add(m); };
  // at the edge of the camphor wood, ahead on the left
  const WOOD = new THREE.Vector3(-41, 0, -2658);
  const woodSpot = (dx: number, dz: number) => { const v = WOOD.clone().add(new THREE.Vector3(dx, 0, dz)); v.y = place.height(v.x, v.z); return v; };
  const T_SPOT = woodSpot(0, 0), CHU_SPOT = woodSpot(3.4, 2.2), CHIBI_SPOT = woodSpot(5.6, 0.6);
  // the girls dance round the bed, then run after the Catbus along the lane and stop to wave
  const RUN_TO = [new THREE.Vector3(-0.6, 0, -2626), new THREE.Vector3(1.8, 0, -2622)];

  // ---------- subjects ----------
  const camPos = new THREE.Vector3();
  let waveT = -1, tWaveT = -1;
  const girlsAnchor = new THREE.Object3D(); troupe.add(girlsAnchor);
  const girlsS = new Subject({
    id: 'satsuki-dawn', name: 'Satsuki & Mei at dawn', from: FILMS.totoro, group: girlsAnchor, radius: 1.8, base: 800, rarity: 'rare',
    hint: "Back home at sunrise, still in their nightclothes, jumping for joy by the seed bed: it was a dream, but it wasn't a dream! Play the ocarina and they wave with both arms.",
    poses: { cheer: { label: "It wasn't a dream!", mult: 1.8 }, wave: { label: 'Waving with both arms', mult: 1.6 } },
    onCall: () => { waveT = 0; girlsS.setPose('wave', 2.4); return true; }, maxDistance: 120,
  });
  const totoroS = new Subject({
    id: 'totoro-dawn', name: 'Totoro at dawn', from: FILMS.totoro, group: totoro.group, radius: 3.2, base: 1400, rarity: 'legendary',
    hint: 'Watching from the edge of the camphor wood at sunrise with Chu and Chibi. Play the ocarina and he roars and waves goodbye.',
    poses: { goodbye: { label: 'Waving goodbye', mult: 1.8 } },
    centerOffset: new THREE.Vector3(0, 2.8, 0), facing: forwardOf(totoro.group), maxDistance: 200,
    onCall: () => { totoro.roar(); tWaveT = 0; totoroS.setPose('goodbye', 3.2); return true; },
  });
  const sproutAnchor = new THREE.Object3D(); sproutAnchor.position.copy(bed).add(new THREE.Vector3(0, 0.8, 0)); group.add(sproutAnchor);
  const sproutS = new Subject({
    id: 'sprouts', name: 'The sprouts', from: FILMS.totoro, group: sproutAnchor, radius: 2.4, base: 450,
    hint: 'The acorns the girls planted came up in the night after all. Throw an acorn near the bed and another sprout pops up where it lands.',
    poses: { sprouting: { label: 'Sprouting', mult: 1.5 } },
    onItem: (p) => {
      const s = sproutAt[BASE + nextExtra];
      nextExtra = (nextExtra + 1) % EXTRA;
      s.p.set(p.x, place.height(p.x, p.z) + 0.05, p.z); s.t0 = clock;
      puffs.burst(s.p, 6, 0xeaf4d8, 1.2, 1, 0.6);
      sproutS.setPose('sprouting', 2);
      return true;
    }, reactRange: 22, maxDistance: 90,
  });
  for (const s of [girlsS, totoroS, sproutS]) s.active = false;
  cast.subjects.home = [girlsS, totoroS, sproutS];

  let clock = 0;
  const pose: TotoroPose = {}, poseC: TotoroPose = {}, poseB: TotoroPose = {};
  const tmp = new THREE.Vector3(), mid = new THREE.Vector3();
  const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  const face = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);
  const catbusPos = new THREE.Vector3();

  return {
    id: 'home', group,
    // drawn from inside the white cloud cover (full from z -2392) to the end
    show: [U(SHOW_Z0), 1],
    occluders: [place.terrain, place.proxies],
    subjects: [girlsS, totoroS, sproutS], water: -Infinity,
    floor: (x, z) => place.height(x, z),
    onItemLand(p) { puffs.burst(p, 5, 0xeaf4d8, 1.4, 1, 0.7); },
    update(dt, t, ride) {
      clock = t;
      const z = ride.position.z;
      camera.getWorldPosition(camPos);
      adopt();
      for (const s of cast.subjects.garden) s.active = false;
      for (const s of [girlsS, totoroS, sproutS]) s.active = z < SETS.home.z0 + 6;
      place.update(t, camera);
      mist.update(t); dew.update(t); birds.update(t); puffs.update(dt);
      findCatbus();

      // ---- sprouts swaying in the morning air; new ones pop up with a bounce ----
      sproutAt.forEach((s, i) => {
        let h = s.h;
        if (i >= BASE) h = s.t0 < 0 ? 0 : s.h * easeOutBack(clamp((t - s.t0) / 0.7, 0, 1));
        sprouts.set(i, s.p, h, Math.sin(t * 1.3 + s.ph) * 0.1, s.ph);
      });
      sprouts.commit();

      // ---- Totoro, Chu and Chibi at the wood's edge ----
      for (const tt of [totoro, chu, chibi]) if (tt.umbrella) { tt.umbrella.scale.setScalar(1); tt.umbrella.visible = true; }
      cast.ocarinas.forEach((o) => { o.visible = false; });
      const closing = smoothstep(-2586, -2596, z);
      if (tWaveT >= 0) { tWaveT += dt; if (tWaveT > 3.4) tWaveT = -1; }
      // a wave now and then as you come along the lane; a big goodbye at the end
      const now = smoothstep(0.55, 0.85, 0.5 + 0.5 * Math.sin(t * 0.55));
      const w = Math.max(now * smoothstep(-2470, -2500, z), closing, tWaveT >= 0 ? envelope(tWaveT, 0.6, 1.0, 2.8, 3.4) : 0);
      const look = camPos.clone().lerp(catbusPos, closing * 0.6);
      const place3 = (o: THREE.Object3D, p: THREE.Vector3) => { o.position.copy(p).sub(troupe.position); o.rotation.set(0, face(p, look), 0); };
      place3(totoro.group, T_SPOT); place3(chu.group, CHU_SPOT); place3(chibi.group, CHIBI_SPOT);
      totoro.pose = totoro.roarTime > 0 ? null : wavePose(t, w, pose);
      wavePose(t + 0.7, w, poseC); wavePose(t + 1.3, w, poseB);
      chu.pose = poseC; chibi.pose = poseB;
      totoro.lookTarget = chu.lookTarget = chibi.lookTarget = look;
      if (w > 0.8 && Math.floor(t * 1.4) !== Math.floor((t - dt) * 1.4)) { chibi.hop(); if (Math.floor(t * 1.4) % 2) chu.hop(); }
      totoro.update(dt, t); chu.update(dt, t); chibi.update(dt, t);
      if (closing > 0.5 && totoroS.poseTimer <= 0) totoroS.setPose('goodbye', 0.4);

      // ---- the girls ----
      if (waveT >= 0) { waveT += dt; if (waveT > 2.6) waveT = -1; }
      const wave2 = waveT >= 0 ? envelope(waveT, 0, 0.3, 2.1, 2.6) : 0;
      // dancing round the bed (9 s: round and round, then a jump for joy), turning to cheer as you come
      const cyc = ((t / 9) % 1 + 1) % 1;
      const roundK = smoothstep(0, 0.1, cyc) * (1 - smoothstep(0.62, 0.7, cyc)) * (1 - smoothstep(-2550, -2560, z));
      const cheerK = Math.max(smoothstep(0.66, 0.72, cyc) * (1 - smoothstep(0.95, 1, cyc)), smoothstep(-2550, -2560, z)) * (1 - closing);
      const chase = smoothstep(-2588, -2619, z);
      [satsuki, mei].forEach((k, i) => {
        const a = t * 1.1 + i * Math.PI;
        const ringP = new THREE.Vector3(bed.x + Math.cos(a) * 3.4, 0, bed.z + Math.sin(a) * 2.8);
        const restP = bed.clone().add(new THREE.Vector3(-3.2 + i * 1.1, 0, 1.6 - i * 1.4));
        const at = restP.clone().lerp(ringP, roundK);
        const runP = at.clone().lerp(RUN_TO[i], smoothstep(0, 1, chase));
        runP.y = place.height(runP.x, runP.z);
        const running = Math.sin(Math.PI * clamp(chase * 1.15, 0, 1)) + roundK * 0.8;
        // facing the way they skip round the bed, or you; running, the way they run, then the Catbus
        let yaw = lerpAngle(face(runP, camPos), Math.atan2(-Math.sin(a) * 3.4, Math.cos(a) * 2.8), roundK);
        if (chase > 0.02) yaw = lerpAngle(face(at, RUN_TO[i]), face(runP, catbusPos), smoothstep(0.75, 0.95, chase));
        k.tick(dt, t, chase > 0.8 ? catbusPos : camPos, 1);
        const lift = poseKid(k, { cheer: cheerK * (1 - wave2), run: clamp(running, 0, 1), wave2: Math.max(wave2, smoothstep(0.85, 1, chase)) }, t, i * 2.1);
        k.group.position.copy(runP).sub(troupe.position).add(tmp.set(0, lift, 0));
        k.group.rotation.set(0, yaw, 0);
        mid.add(runP);
      });
      girlsAnchor.position.copy(mid.multiplyScalar(0.5).sub(troupe.position).add(tmp.set(0, 1.3, 0)));
      mid.set(0, 0, 0);
      if (cheerK > 0.5 && girlsS.poseTimer <= 0) girlsS.setPose('cheer', 0.4);
    },
  };

  /** Where the Catbus is (the girls and Totoro look at it as it runs off). */
  function findCatbus() { ctx.mount.catbus.group.getWorldPosition(catbusPos); catbusPos.y += 2.5; }
}
