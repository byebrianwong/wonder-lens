import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Drift } from '../../../engine/Particles';
import { envelope } from '../../../engine/Rig';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, forwardOf, optimize, showRange, type BuiltSet, type SetContext } from '../common';
import { Birds, circlePose, circlers } from '../laputa/birds';
import { buildCastle, crystalFog } from '../laputa/castle';
import { cloudTop, eyeClouds } from '../laputa/clouds';
import { Foxsquirrels } from '../laputa/foxsquirrel';
import { buildGarden } from '../laputa/garden';
import { Bins, CRYSTAL, CX, CZ, KEEP1, KEEP2, RIM, Y_K1, Y_K2, radiusOf } from '../laputa/parts';
import { makePlan } from '../laputa/plan';
import { acornMesh, makeRobot } from '../laputa/robot';

/*
 * Laputa, in the calm eye of the Dragon's Nest (Castle in the Sky), z -1230 to -1510.
 *
 * Out of the storm wall the whole island hangs ahead in clear morning air: stone tiers and towers, waterfalls
 * pouring off its edges into mist, a sea of cloud far below, birds wheeling round the great tree on top. The
 * Catbus glides across the eye with a few doves flying out to meet it, lands on the garden terrace, runs
 * through a gateway into the inner gardens, under an arching root and the edge of the tree's crown, past the
 * fallen robot and the robot gardener at its memorial stone (foxsquirrels on its shoulders and racing along
 * the walls), out through the second gateway and off the far edge beside a waterfall. Falling, the rider sees
 * the island's underside: the bowl of rock, hanging spires and roots, and the levitation crystal glowing blue.
 */

export function buildLaputa(ctx: SetContext): BuiltSet {
  const { road, lights, camera, lowDetail, fx } = ctx;
  const rng = new Rng(1986);
  const group = new THREE.Group();
  const plan = makePlan(road);

  // ---------- the island: structure, gardens, then merge every bin ----------
  const bins = new Bins((x, z) => plan.dist(x, z));
  const castle = buildCastle(road, plan, bins, rng, lowDetail);
  const garden = buildGarden(road, plan, bins, rng, lowDetail);
  for (const b of bins.groups()) optimize(b);
  group.add(bins.root, castle.crystal);
  const proxies = new THREE.Group();
  for (const p of [...castle.proxies, ...garden.proxies]) proxies.add(p);
  group.add(proxies);
  const clouds = eyeClouds(new Rng(1987), lowDetail);
  group.add(clouds.group);

  /** solid ground for thrown items: the keep's tops, the terraces (the pools' water), else the cloud far below */
  const floor = (x: number, z: number) => {
    const r = radiusOf(x, z);
    if (r < KEEP2) return Y_K2;
    if (r < KEEP1) return Y_K1;
    if (r < RIM) {
      let y = plan.height(x, z);
      for (const pl of plan.pools) if (Math.hypot(x - pl.c.x, z - pl.c.z) < Math.max(pl.hx, pl.hz)) y = Math.max(y, pl.y);
      return y;
    }
    return cloudTop(x, z);
  };

  // ---------- the robot gardener at the memorial stone ----------
  const robot = makeRobot();
  robot.group.position.set(plan.robot.pos.x, plan.height(plan.robot.pos.x, plan.robot.pos.z) - 0.05, plan.robot.pos.z);
  robot.group.rotation.y = plan.robot.yaw;
  robot.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !m.userData.outline) { m.castShadow = true; m.receiveShadow = true; } });
  group.add(robot.group);
  // the acorn the robot or a foxsquirrel picks up (its own copy of the one that was thrown)
  const acorn = acornMesh();
  acorn.visible = false;
  group.add(acorn);
  let roll = { t: -1, from: new THREE.Vector3(), to: new THREE.Vector3() };

  // ---------- foxsquirrels: two on the robot, the rest on the low walls ----------
  const herd = new Foxsquirrels(robot.perches, garden.runs, lowDetail ? 1 : 2, floor);
  group.add(herd.group);

  // ---------- birds: a flock round the tree, a wide ring below the rim, an escort, and the fallen robot's nesters ----------
  const br = new Rng(1990);
  const ringTree = circlers(lowDetail ? 12 : 18, br, { cx: CX, cz: CZ, r: [34, 58], y: [92, 124], speed: [0.12, 0.2] });
  const ringLow = circlers(lowDetail ? 8 : 14, br, { cx: CX, cz: CZ, r: [96, 124], y: [12, 40], speed: [0.05, 0.09] });
  const ringEscort = circlers(8, br, { cx: CX, cz: CZ, r: [30, 40], y: [70, 82], speed: [0.16, 0.2] });
  const NEST = garden.fallenPerches.length;
  const birds = new Birds(ringTree.length + ringLow.length + ringEscort.length + NEST, 1.5);
  group.add(birds.group);
  const escortOff = ringEscort.map((_, i) => new THREE.Vector3((i % 2 ? 1 : -1) * (4.5 + i * 0.9), 2.5 + (i % 3) * 1.4, -5 - i * 1.6));
  const lastPos = Array.from({ length: birds.count }, () => new THREE.Vector3(0, -500, 0));
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const heads = lastPos.map((_, i) => i * 1.7);
  /** place bird i, facing the way it moved since last frame (or keeping its last heading when it sits still) */
  const placeBird = (i: number, p: THREE.Vector3, flap: number, bank: number, scale = 1) => {
    const lp = lastPos[i];
    const dx = p.x - lp.x, dz = p.z - lp.z;
    if (dx * dx + dz * dz > 1e-5) heads[i] = Math.atan2(dx, dz);
    const heading = heads[i];
    birds.set(i, p, heading, bank, flap, scale);
    lp.copy(p);
  };
  let flockT = -1, nestT = -1, rustleT = -1, flareT = -1;

  // ---------- drifting petals over the gardens, leaves falling from the crown ----------
  const petals = new Drift({ count: lowDetail ? 90 : 170, color: 0xfbe0ea, size: 0.22, box: new THREE.Vector3(50, 18, 50), speed: new THREE.Vector3(0.7, -0.45, -0.3), wobble: 1.3, opacity: 0.9, seed: 1991 });
  const leaves = new Drift({ count: lowDetail ? 70 : 130, color: 0x9ac25a, size: 0.3, box: new THREE.Vector3(44, 26, 44), speed: new THREE.Vector3(0.4, -1.1, 0.2), wobble: 1.5, opacity: 0.95, seed: 1992 });
  group.add(petals.points, leaves.points);

  // ---------- light: the crystal lights the underside of the bowl blue ----------
  lights.add({ from: road.u(SETS.laputa.z0 + 8), to: road.u(SETS.laputa.z1 - 6), pos: CRYSTAL.clone().add(new THREE.Vector3(0, -10, 0)), color: 0x5ab8ff, intensity: 520, distance: 130 });

  // ---------- photo subjects ----------
  const eye = new THREE.Vector3();
  const robotS = new Subject({
    id: 'robot', name: 'The robot gardener', from: FILMS.laputa, group: robot.group, radius: 2.2, base: 1450, rarity: 'legendary',
    hint: 'It tends the flowers at a memorial stone beside the path across Laputa, with foxsquirrels on its shoulders. Play the ocarina and it holds out a flower to you; toss an acorn near it and it picks it up to look at it.',
    poses: { flower: { label: 'A flower for you', mult: 2.0 }, curious: { label: 'What is this?', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 2.9, 0.3), facing: forwardOf(robot.head), maxDistance: 120, reactRange: 12,
    onCall: () => { if (robot.busy) return false; robot.offerFlower(eye); robotS.setPose('flower', 4.4); return true; },
    onItem: (pos) => {
      if (robot.busy) return false;
      // its own copy of the acorn rolls to its feet, and it bends to pick it up
      acorn.parent?.remove(acorn); group.add(acorn); acorn.scale.setScalar(1); acorn.rotation.set(0, 0, 0);
      acorn.userData.owner = 'robot';
      roll = { t: 0, from: pos.clone().setY(floor(pos.x, pos.z) + 0.13), to: robot.pickSpot(new THREE.Vector3()) };
      roll.to.y = floor(roll.to.x, roll.to.z) + 0.13;
      acorn.position.copy(roll.from); acorn.visible = true;
      robot.pickUp(acorn);
      robotS.setPose('curious', 5.2);
      return true;
    },
  });
  const herdS = new Subject({
    id: 'foxsquirrels', name: 'Foxsquirrels', from: FILMS.laputa, group: herd.anchor, radius: 5, base: 900, rarity: 'rare', crowd: true,
    hint: 'Big-eared, bushy-tailed little animals: two ride on the robot gardener and more scamper along the low walls beside the path, racing the Catbus. An acorn sends them dashing for it; the ocarina makes them sit up and listen.',
    poses: { scamper: { label: 'Acorn rush!', mult: 1.6 }, listen: { label: 'All ears', mult: 1.4 } },
    centerOffset: new THREE.Vector3(0, 0.6, 0), maxDistance: 70, reactRange: 20,
    onItem: (pos) => {
      // if the robot has already taken this acorn, they run to its feet to look up at it instead
      const robotHasIt = robot.busy && roll.t >= 0 && roll.t < 0.2;
      const spot = robotHasIt ? roll.to.clone() : pos.clone().setY(floor(pos.x, pos.z) + 0.1);
      if (!herd.dashTo(spot, robotHasIt ? null : acorn)) return false;
      if (!robotHasIt && !robot.busy) {
        acorn.parent?.remove(acorn); group.add(acorn); acorn.position.copy(spot); acorn.rotation.set(0, 0, 0); acorn.visible = true;
        acorn.userData.owner = 'herd';
      }
      herdS.setPose('scamper', 3.5);
      return true;
    },
    onCall: () => { herd.alert(2.8); herdS.setPose('listen', 2.6); return true; },
  });
  const fallenS = new Subject({
    id: 'fallen', name: 'The fallen robot', from: FILMS.laputa, group: garden.fallen, radius: 3.4, base: 500,
    hint: 'A robot that fell long ago, lying in the grass of the inner garden left of the path, covered in moss and flowers, with birds nesting in its arms. The ocarina or an acorn sends the birds up.',
    poses: { birds: { label: 'Birds take wing', mult: 1.5 } }, centerOffset: new THREE.Vector3(1.4, 0.9, 0), maxDistance: 110, reactRange: 12,
    onCall: () => { if (nestT >= 0) return false; nestT = 0; fallenS.setPose('birds', 4); return true; },
    onItem: () => { if (nestT >= 0) return false; nestT = 0; fallenS.setPose('birds', 4); return true; },
  });
  const treeAnchor = new THREE.Object3D(); treeAnchor.position.copy(castle.treeTop); group.add(treeAnchor);
  const treeS = new Subject({
    id: 'greattree', name: 'The great tree of Laputa', from: FILMS.laputa, group: treeAnchor, radius: 30, base: 800, rarity: 'rare',
    hint: 'The giant tree on top of the castle, its roots pouring over every wall and hanging under the island. The path runs under the edge of its crown. Play the ocarina beneath it and the wind shakes down its leaves.',
    poses: { rustle: { label: 'Leaves on the wind', mult: 1.5 } }, maxDistance: 320,
    onCall: () => { rustleT = 0; treeS.setPose('rustle', 3.5); return true; },
  });
  const islandAnchor = new THREE.Object3D(); islandAnchor.position.set(CX, 40, CZ); group.add(islandAnchor);
  const laputaS = new Subject({
    id: 'laputa', name: 'Laputa', from: FILMS.laputa, group: islandAnchor, radius: 70, base: 1100, rarity: 'legendary',
    hint: "The castle in the sky, floating in the calm eye of the Dragon's Nest. It is best seen whole as the storm clears, and from below as you fall off its edge. Play the ocarina and its crystal flares and its birds rise.",
    poses: { flock: { label: 'Laputa awakes', mult: 1.6 } }, maxDistance: 420,
    onCall: () => { flockT = 0; flareT = 0; laputaS.setPose('flock', 4.5); return true; },
  });
  const subjects = [robotS, herdS, fallenS, treeS, laputaS];

  const crownPivot = castle.crown.parent!;
  const timed = [castle.falls.uniforms, castle.mist.uniforms, ...garden.water.map((w) => w.uniforms)];
  const zOf = (z: number, a: number, b: number) => z <= a && z > b;

  return {
    id: 'laputa', group, show: showRange(road, SETS.laputa, 8, 6), occluders: [proxies], subjects, floor, water: -Infinity,
    bump(z) { const d = (z - plan.humpZ) / 1.5; return Math.abs(d) < 1 ? 0.28 * (1 - d * d) : 0; },
    update(dt, t, ride) {
      const z = ride.position.z;
      // the rider's eye, on the Catbus's back
      eye.copy(ride.position).add(tmp.set(0, ctx.mount.seat.y, 0));
      const fog = ctx.scene.fog as THREE.FogExp2;

      // ---- subjects on and off by stretch ----
      laputaS.active = zOf(z, -1236, -1505);
      treeS.active = zOf(z, -1245, -1470);
      robotS.active = zOf(z, -1258, -1458);
      herdS.active = zOf(z, -1330, -1458);
      fallenS.active = zOf(z, -1258, -1395);

      // ---- shaders: time and the scene's fog ----
      for (const u of timed) {
        u.time.value = t; u.fogColor.value.copy(fog.color); u.fogDensity.value = fog.density;
      }
      crystalFog(castle, fog);
      clouds.update(fog);
      garden.grass.update(t, camera);

      // ---- the crystal: brighter as you fall past the island, flaring at the ocarina ----
      if (flareT >= 0) { flareT += dt; if (flareT > 4) flareT = -1; }
      const flare = flareT >= 0 ? envelope(flareT, 0, 0.4, 2.2, 4) : 0;
      castle.glow(1 + 1.0 * smoothstep(-1446, -1466, z) + 1.2 * flare, t);

      // ---- the robot watches the rider go by; its own acorn rolls to its feet ----
      robot.watch = z < -1360 && z > -1440 ? eye : null;
      if (roll.t >= 0) {
        roll.t += dt;
        const k = clamp(roll.t / 0.8, 0, 1), e = 1 - (1 - k) * (1 - k);
        if (acorn.parent === group) { acorn.position.lerpVectors(roll.from, roll.to, e); acorn.rotation.x = e * 9; }
        if (k >= 1) roll.t = -1;
      }
      robot.update(dt, t);
      herd.update(dt, t, eye);

      // ---- birds ----
      let i = 0;
      if (flockT >= 0) { flockT += dt; if (flockT > 7) flockT = -1; }
      const spread = flockT >= 0 ? envelope(flockT, 0, 1.2, 3.5, 7) : 0;
      for (const c of ringTree) { const p = circlePose(c, t, spread); placeBird(i++, p.pos, p.flap, p.bank); }
      for (const c of ringLow) { const p = circlePose(c, t); placeBird(i++, p.pos, p.flap, p.bank); }
      // the escort: out from the tree to meet the Catbus as it leaves the storm, alongside over the landing, then home
      const kIn = smoothstep(-1238, -1272, z), kOut = smoothstep(-1300, -1345, z);
      ringEscort.forEach((c, j) => {
        const home = circlePose(c, t);
        const h = tmp2.copy(home.pos);
        const along = road.at(z + escortOff[j].z);
        tmp.set(along.x + along.rx * escortOff[j].x, along.y + ctx.mount.seat.y + escortOff[j].y + Math.sin(t * 1.3 + j) * 0.6, z + escortOff[j].z);
        const w = kIn * (1 - kOut);
        h.lerp(tmp, w * w * (3 - 2 * w));
        placeBird(i++, h, w > 0.05 ? Math.sin(t * 9 + j) * 0.75 : home.flap, home.bank * (1 - w));
      });
      // the fallen robot's birds: sit and peck; startled, they circle up over it and settle again
      if (nestT >= 0) { nestT += dt; if (nestT > 7) nestT = -1; }
      const up = nestT >= 0 ? envelope(nestT, 0, 0.5, 5, 7) : 0;
      garden.fallenPerches.forEach((p, j) => {
        const a = t * 1.4 + j * (TAU / NEST);
        tmp.set(p.x + Math.cos(a) * (3 + j), p.y + 4 + j * 0.8 + Math.sin(t * 2 + j), p.z + Math.sin(a) * (3 + j));
        const peck = Math.max(0, Math.sin(t * 3 + j * 2)) ** 8 * 0.08;
        tmp2.copy(tmp).sub(p).multiplyScalar(up).add(p);
        tmp2.y -= peck * (1 - up);
        placeBird(i++, tmp2, up > 0.1 ? Math.sin(t * 11 + j) * 0.8 : -1.15, 0, lerp(0.55, 0.7, up));
      });
      birds.commit();

      // ---- petals over the gardens, leaves under the crown (a shower when the ocarina shakes the tree) ----
      if (rustleT >= 0) { rustleT += dt; if (rustleT > 5) rustleT = -1; }
      const shake = rustleT >= 0 ? envelope(rustleT, 0, 0.5, 2.5, 5) : 0;
      const onTop = smoothstep(-1286, -1300, z) * (1 - smoothstep(-1448, -1460, z));
      petals.intensity = onTop;
      petals.update(dt, t, eye);
      const under = smoothstep(-1335, -1360, z) * (1 - smoothstep(-1400, -1425, z));
      leaves.intensity = Math.min(1, under * 0.7 + shake * onTop);
      leaves.update(dt, t, eye);
      crownPivot.rotation.set(Math.sin(t * 0.31) * 0.004 + shake * Math.sin(t * 5) * 0.012, 0, Math.sin(t * 0.27 + 1) * 0.004 + shake * Math.sin(t * 4.3) * 0.012);

      // ---- falling into the cloud: a light white wash from z -1474, kept faint until the world's own white cover
      // takes over at -1478, so the underside and the crystal stay in view while the rider falls past them ----
      const mistK = smoothstep(-1473, -1480, z);
      if (mistK > 0.01) fx.wash(mistK * 0.12, 0xf2f6fa);
    },
  };
}
