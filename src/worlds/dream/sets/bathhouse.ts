import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Rng, clamp, smoothstep } from '../../../engine/math';
import { mergeStatic } from '../../../engine/Builders';
import { makeNoFace, makeRadishSpirit, makeSootSprites } from '../../ghibli/characters';
import { FILMS, forwardOf, optimize, type BuiltSet, type SetContext } from '../common';
import { buildAburaya } from '../bathhouse/aburaya';
import { buildBoilerRoom, BULBS, DRAWERS } from '../bathhouse/boilerRoom';
import { bridgeMaterials, buildBridge, buildGateHouse, buildRoomStandIn } from '../bathhouse/bridge';
import { buildFerry, FERRY_DOOR } from '../bathhouse/ferry';
import { makeKamaji } from '../bathhouse/kamaji';
import { PaperBirds } from '../bathhouse/paperBirds';
import {
  BATH, BOILER, BRIDGE, COAL_HEAP, DAIS, DECK, FERRY, FURNACE, KAMAJI, NOFACE, PODIUM, QUAY, RAMP, RAVINE, SPIRIT_STAIR, STAIRS, WATER,
} from '../bathhouse/plan';
import { KasugaLine } from '../bathhouse/spirits';
import { Plumes } from '../bathhouse/steam';
import { buildTown } from '../bathhouse/town';
import { spiritWater } from '../bathhouse/water';
import { LanternField, WAVE } from '../bathhouse/wave';

/*
 * The bathhouse at dusk, down to the boiler room (Spirited Away).
 *
 *  z -1776  the rider is still in the room inside Howl's castle (its front doors shut); this scene appears round it
 *  z -1793  out of the room's inner door, which is the doorway of the bathhouse town's gate house, onto the
 *           long red bridge over the ravine; the sun has just set behind the bathhouse ahead
 *  z -1800  the lantern wave: every lantern and window lights up, from the bathhouse outwards, past the
 *           rider and over the town behind (done by z -1860)
 *  z -1820  below on the left, the ferry at the quay; masked Kasuga spirits walk in a line along the quay
 *           and up the long stair to the bathhouse's entrance
 *  z -1857  No-Face by the left railing; once the rider is past him and looking ahead, he is sitting on the
 *           Catbus's back behind the rider (he rides along to the boiler room)
 *  z -1885  the forecourt: the grand entrance with its noren, the Radish Spirit waiting by it; right round
 *           the front corner of the bathhouse
 *  z -1912  down the steep outside stairs along the podium's wall (a jolt on every second step)
 *  z -1994  in at the boiler room door: the coal heap, soot sprites carrying coal to the furnace, Kamaji
 *           at work on his platform before the wall of drawers
 *  z -2026  the high window's shutters burst open and a storm of paper birds pours in and swirls round the
 *           rider; the screen goes to paper (the world's cover), Haku takes the rider at z -2052, the cover
 *           lifts as he flies out of the window and the birds scatter
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildBathhouse(ctx: SetContext): BuiltSet {
  const { road, lights, mount } = ctx;
  const group = new THREE.Group();
  const statics = new THREE.Group(), live = new THREE.Group();
  group.add(statics, live);
  const lanterns = new LanternField();
  const m = bridgeMaterials();
  const waterLamps: THREE.Vector3[] = [];

  // ---------- scenery ----------
  const town = buildTown(lanterns, ctx.lowDetail);
  statics.add(town.group);
  waterLamps.push(...town.waterLamps);
  statics.add(buildBridge(m, lanterns));
  for (let z = BRIDGE.z0 - 5; z > BRIDGE.z1 + 2; z -= 8.7) waterLamps.push(V(-5, DECK + 3, z), V(5, DECK + 3, z));
  const gate = buildGateHouse(m, lanterns);
  statics.add(gate, buildRoomStandIn());
  const ab = buildAburaya(road, m, lanterns, waterLamps);
  statics.add(ab.group);
  live.add(ab.noren);
  const ferry = buildFerry(m, lanterns);
  statics.add(ferry.group);
  waterLamps.push(...ferry.lamps);
  const br = buildBoilerRoom(road, m, lanterns);
  statics.add(br.group);
  for (const s of br.shutters) live.add(s);
  waterLamps.push(...br.waterLamps);
  // the lanterns are gathered from everything above, so build them last
  live.add(lanterns.build());
  const water = spiritWater({ x0: -520, x1: 520, z0: -1758, z1: -2075 });
  for (const p of waterLamps) water.addLamp(p, 0.9);
  water.addLamp(V(-20, DECK + 20, PODIUM.front.z0), 1.6);
  water.addLamp(V(20, DECK + 20, PODIUM.front.z0), 1.6);
  live.add(water.mesh);
  const plumes = new Plumes([...town.plumes, ...br.plumes, ferry.smoke], 4411);
  live.add(plumes.points);
  statics.updateMatrixWorld(true);
  optimize(statics);

  // ---------- lights: the entrance, the stairs, the furnace ----------
  lights.add({ from: road.u(-1838), to: road.u(-1926), pos: V(3, DECK + 7, -1897), color: 0xffb070, intensity: 34, distance: 30 });
  lights.add({ from: road.u(-1920), to: road.u(-1976), pos: V(37.5, -3, -1940), color: 0xffa060, intensity: 28, distance: 30, flicker: 0.5 });
  lights.add({ from: road.u(-1988), to: road.u(-2062), pos: V(FURNACE.x + 2.2, -12.6, FURNACE.z), color: 0xff7a30, intensity: 95, distance: 46, flicker: 3 });
  // the bare bulb over the soot sprites' path: a second, steadier working light in the boiler room
  lights.add({ from: road.u(-2010), to: road.u(-2056), pos: V(BULBS[1][0], BULBS[1][1] - 0.8, BULBS[1][2]), color: 0xffc078, intensity: 34, distance: 26 });

  const subjects: Subject[] = [];
  const camPos = new THREE.Vector3(), camDir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;
  /** is a world point roughly inside the camera's view? (wider than the real field of view, to be safe) */
  const inView = (p: THREE.Vector3) => tmp.copy(p).sub(camPos).normalize().dot(camDir) > 0.2;

  // ---------- the bathhouse itself ----------
  const bathAnchor = new THREE.Object3D();
  bathAnchor.position.set(0, DECK + 26, BATH.z + 4);
  live.add(bathAnchor);
  const bathS = new Subject({
    id: 'bathhouse', name: 'The Aburaya', from: FILMS.spirited, group: bathAnchor, radius: 30, base: 900, rarity: 'rare',
    hint: 'The bathhouse of the spirits, across the red bridge at dusk. Take it while its lanterns are lighting up, just after you come out of the door.',
    poses: { lanterns: { label: 'The lanterns lighting up', mult: 1.6 } }, maxDistance: 400,
    update: (_dt, ride) => { const z = zOf(ride); bathS.active = z < -1793 && z > -1990; },
  });
  subjects.push(bathS);

  // ---------- No-Face: by the railing, then riding behind you ----------
  const nfBridge = makeNoFace();
  nfBridge.group.position.copy(NOFACE);
  nfBridge.group.rotation.y = 0.5;
  live.add(nfBridge.group);
  const nfRide = makeNoFace();
  nfRide.group.scale.setScalar(0.55);
  nfRide.group.position.set(0, -0.28, 0);
  nfRide.group.visible = false;
  mount.seats[0].add(nfRide.group);
  /** the photo subject follows whichever No-Face is there */
  const nfAnchor = new THREE.Object3D();
  nfBridge.group.add(nfAnchor);
  let riding = false;
  const current = () => (riding ? nfRide : nfBridge);
  const setRiding = (on: boolean) => {
    if (on === riding) return;
    riding = on;
    nfAnchor.removeFromParent();
    current().group.add(nfAnchor);
  };
  const noFaceS = new Subject({
    id: 'noface', name: 'No-Face', from: FILMS.spirited, group: nfAnchor, radius: 2.0, base: 1350, rarity: 'legendary',
    hint: 'Standing by the left railing halfway across the bridge. Call and he offers gold; throw an acorn and he gulps it. Look behind you after you pass him.',
    poses: { offer: { label: 'Offering gold', mult: 1.9 }, gulp: { label: 'Gulp', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 2.9, 0),
    facing: () => forwardOf(current().group)(),
    onCall: () => { current().offer(); noFaceS.setPose('offer', 4); return true; },
    onItem: () => { current().gulp(); noFaceS.setPose('gulp', 1.6); return true; }, reactRange: 14, maxDistance: 130, swallows: true,
    update: (_dt, ride) => {
      // runs every frame, wherever the ride is: the riding No-Face never shows outside his stretch
      const z = zOf(ride);
      if (z > -1859) setRiding(false);
      if (z < -2060 || !riding) nfRide.group.visible = false;
      noFaceS.active = z < -1793 && z > -2050 && (riding || z > -1900);
    },
  });
  subjects.push(noFaceS);

  // ---------- the Radish Spirit by the entrance ----------
  const radish = makeRadishSpirit();
  radish.group.position.set(8.6, DECK, -1899.6);
  radish.group.rotation.y = 0.55;
  radish.group.scale.setScalar(1.1);
  live.add(radish.group);
  const radishS = new Subject({
    id: 'radish', name: 'The Radish Spirit', from: FILMS.spirited, group: radish.group, radius: 2.4, base: 800, rarity: 'rare',
    hint: 'A very large, very quiet guest waiting by the bathhouse entrance. Play the ocarina and he bows.',
    poses: { bow: { label: 'Polite bow', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 2.6, 0), facing: forwardOf(radish.group),
    onCall: () => { radish.bow(); radishS.setPose('bow', 2.2); return true; }, maxDistance: 120,
    update: (_dt, ride) => { const z = zOf(ride); radishS.active = z < -1793 && z > -1935; },
  });
  subjects.push(radishS);

  // ---------- the Kasuga spirits, from the ferry up to the entrance ----------
  const route = [
    FERRY_DOOR.inside, FERRY_DOOR.door, FERRY_DOOR.edge, FERRY_DOOR.foot,
    V(-101, QUAY.top, -1874.2), V(SPIRIT_STAIR.x0 - 1, QUAY.top + 0.25, SPIRIT_STAIR.z), V(SPIRIT_STAIR.x1, DECK + 0.25, SPIRIT_STAIR.z),
    V(SPIRIT_STAIR.x1 + 1, DECK, RAVINE.far - 2.5), V(-5, DECK, -1903.4), V(-2, DECK + 1.5, -1906.9), V(-1.5, DECK + 1.5, BATH.front + 0.6),
  ];
  const kasuga = new KasugaLine(route, ctx.lowDetail ? 8 : 12, 30, 5151);
  live.add(kasuga.group);
  const kAnchor = new THREE.Object3D();
  live.add(kAnchor);
  let kNearest: THREE.Object3D = kasuga.spirits[0].k.head;
  const kasugaS = new Subject({
    id: 'kasuga', name: 'Kasuga spirits', from: FILMS.spirited, group: kAnchor, radius: 4, base: 700,
    hint: 'Masked guests walking in a slow line from the ferry, along the quay and up the long stair to the bathhouse. Play the ocarina and they all turn to look at you.',
    poses: { look: { label: 'All eyes on you', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 2.4, 0), crowd: true,
    facing: () => forwardOf(kNearest)(),
    onCall: () => { kasuga.look(); kasugaS.setPose('look', 3.2); return true; }, maxDistance: 110,
    update: (_dt, ride) => { const z = zOf(ride); kasugaS.active = z < -1793 && z > -1905; },
  });
  subjects.push(kasugaS);

  // ---------- Kamaji ----------
  const kamaji = makeKamaji(
    { pos: V(KAMAJI.x, DAIS.top + 0.36, KAMAJI.z), yaw: KAMAJI.yaw, scale: KAMAJI.scale },
    { x: DRAWERS.x, z0: DRAWERS.z0, y0: DRAWERS.y0, cell: DRAWERS.cell },
  );
  live.add(kamaji.group, kamaji.drawers, kamaji.holes);
  const kamajiS = new Subject({
    id: 'kamaji', name: 'Kamaji', from: FILMS.spirited, group: kamaji.group, radius: 4, base: 1400, rarity: 'legendary',
    hint: 'The boiler man, at work on his platform in front of a wall of herb drawers, with six long arms. Play the ocarina and he looks up and waves; throw him an acorn and he catches it.',
    poses: { wave: { label: 'Three-armed wave', mult: 1.8 }, catch: { label: 'Caught it!', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.3, 0.2), facing: forwardOf(kamaji.group),
    onCall: () => { kamaji.wave(); kamajiS.setPose('wave', 2.8); return true; },
    onItem: (pos) => { kamaji.catch(pos); kamajiS.setPose('catch', 1.6); return true; }, reactRange: 9, maxDistance: 70, swallows: true,
    update: (_dt, ride) => { const z = zOf(ride); kamajiS.active = z < -1985 && z > -2058; },
  });
  subjects.push(kamajiS);

  // ---------- soot sprites carrying coal from the heap to the furnace ----------
  // each sprite is its own little crowd of one, so it can walk the loop; seeds are picked so they all carry coal
  const sootFrom = V(COAL_HEAP.x - 3.2, BOILER.floor, COAL_HEAP.z - 3.2), sootTo = V(DAIS.x1 + 1.2, BOILER.floor, FURNACE.z + 0.6);
  const sootDir = sootTo.clone().sub(sootFrom), sootLen = sootDir.length();
  sootDir.normalize();
  const sootSide = V(-sootDir.z, 0, sootDir.x);
  const soots: Array<{ wrap: THREE.Group; ch: ReturnType<typeof makeSootSprites>; coal: THREE.Object3D[]; u0: number }> = [];
  {
    const nSoot = ctx.lowDetail ? 6 : 9;
    let seed = 300;
    for (let i = 0; i < nSoot; i++) {
      while (new Rng(seed).next() >= 0.5) seed++;
      const ch = makeSootSprites(1, new Rng(seed++), 0);
      // the sprite's parts never move against each other: merge them (the lump of coal stays apart, it has its own material)
      for (const part of ch.group.children) mergeStatic(part);
      const wrap = new THREE.Group();
      wrap.scale.setScalar(1.5);
      wrap.add(ch.group);
      live.add(wrap);
      const coal: THREE.Object3D[] = [];
      ch.group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && mm.geometry.type === 'DodecahedronGeometry') coal.push(mm); });
      soots.push({ wrap, ch, coal, u0: i / nSoot });
    }
  }
  const sootAnchor = new THREE.Object3D();
  sootAnchor.position.copy(sootFrom).lerp(sootTo, 0.5);
  live.add(sootAnchor);
  let sootLoop = 0, swarmT = 0;
  const sootS = new Subject({
    id: 'soot-coal', name: 'Soot sprites with coal', from: FILMS.spirited, group: sootAnchor, radius: 4.5, base: 720,
    hint: 'A line of soot sprites carrying lumps of coal from the heap to the furnace, in the boiler room. Throw an acorn among them and they swarm it; play the ocarina and they all jump.',
    poses: { swarm: { label: 'Swarming', mult: 1.7 }, jump: { label: 'All jump', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 0.5, 0), crowd: true,
    onItem: (pos) => { for (const s of soots) s.ch.swarmTo(pos); swarmT = 5; sootS.setPose('swarm', 5); return true; },
    onCall: () => { for (const s of soots) s.ch.jump(); sootS.setPose('jump', 1.2); return true; }, reactRange: 16, maxDistance: 80,
    update: (_dt, ride) => { const z = zOf(ride); sootS.active = z < -1985 && z > -2055; },
  });
  subjects.push(sootS);

  // ---------- paper birds ----------
  const W = BOILER.window;
  const birds = new PaperBirds(ctx.lowDetail ? 170 : 320, V((W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, BOILER.z1 - 1), W.x1 - W.x0, W.y1 - W.y0, 6161);
  live.add(birds.mesh);

  // ---------- occluders ----------
  // (none round the gate house: the castle's room inside it belongs to the meadow scene, with its own subjects)
  const occluders: THREE.Object3D[] = [...ab.occluders, ...br.occluders];

  // ---------- the ride's floor for thrown items ----------
  const floor = (x: number, z: number) => {
    if (z < BOILER.z0 && z > BOILER.z1 && x > BOILER.x0 && x < BOILER.x1) {
      if (x < DAIS.x1 && z < DAIS.z0 && z > DAIS.z1) return DAIS.top + 0.2;
      if (z < RAMP.z0) { const r = road.at(Math.max(z, RAMP.z1)); if (Math.abs(x - r.x) < 3 || (z < RAMP.z1 && x > W.x0 && x < W.x1)) return Math.max(BOILER.floor, r.y); }
      return BOILER.floor;
    }
    if (x > STAIRS.x0 && x < 40.6 && z < STAIRS.top + 3 && z > BOILER.z0) return road.at(z).y;
    if (Math.abs(x) < BRIDGE.half && z <= BRIDGE.z0 && z > BRIDGE.z1) return DECK;
    if (z <= PODIUM.front.z0 && z > PODIUM.back.z1 && x > PODIUM.front.x0 && x < (z > STAIRS.top + 3 ? PODIUM.front.x1 : PODIUM.back.x1)) return DECK;
    if (z > RAVINE.near) return DECK;
    if (z < RAVINE.far && x < PODIUM.front.x0 && z > -1990) return DECK;
    if (x > QUAY.x0 && x < QUAY.x1 && z < QUAY.z0 && z > QUAY.z1) return QUAY.top;
    if (Math.abs(x - FERRY.x) < FERRY.len / 2 && Math.abs(z - FERRY.z) < FERRY.beam / 2) return FERRY.deck;
    return WATER - 1;
  };

  const sootP = new THREE.Vector3();
  return {
    // shown once the castle's front doors have shut behind the rider, and until Haku is out of the window
    id: 'bathhouse', group, show: [road.u(-1776), road.u(-2080)], occluders, subjects, floor, water: WATER,
    bump(z) {
      // a jolt each time the Catbus lands, two steps at a time, fading out where the flight eases at its ends
      if (z > STAIRS.top + 3 || z < STAIRS.bottom + 4) return 0;
      const f = (((STAIRS.top + 3 - z) / 1.44) % 1 + 1) % 1;
      const slope = Math.min(1, Math.abs(road.at(z + 0.5).y - road.at(z - 0.5).y) / 0.5);
      return -0.13 * (1 - f) ** 3 * slope;
    },
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      ctx.camera.getWorldDirection(camDir);
      const fog = ctx.scene.fog as THREE.FogExp2 | null;

      // ---- the lantern wave: out from the bathhouse as the rider crosses the first part of the bridge ----
      const k = clamp((-1800 - z) / 60, 0, 1);
      WAVE.radius.value = k <= 0 ? 0 : k >= 1 ? 5000 : 300 * Math.pow(k, 1.6);
      if (z < -1800 && z > -1872) bathS.setPose('lanterns', 0.5);
      water.update(t, camPos, fog, 1 - smoothstep(-1795, -1905, z));
      plumes.update(t, fog);
      ab.noren.rotation.x = Math.sin(t * 0.9) * 0.035 + Math.sin(t * 2.3) * 0.012;

      // ---- No-Face: climbs on behind once you are past him and looking ahead ----
      if (!riding && z < -1861 && z > -2050 && !inView(nfBridge.group.getWorldPosition(tmp).setY(NOFACE.y + 2.5)) && !inView(mount.seats[0].getWorldPosition(new THREE.Vector3()))) setRiding(true);
      nfBridge.group.visible = !riding;
      nfRide.group.visible = riding && z > -2060;
      if (nfBridge.group.visible) nfBridge.update(dt, t);
      if (nfRide.group.visible) nfRide.update(dt, t);

      // ---- the Radish Spirit, the Kasuga line ----
      if (z > -1960) {
        radish.update(dt, t);
        kasuga.update(dt, t, clamp((-1764 - z) / (1905 - 1764), 0, 1), camPos);
        // the photo subject sits among the spirits nearest the camera
        let n = 0, best = 1e9;
        kAnchor.position.set(0, 0, 0);
        const near = kasuga.spirits.filter((s) => s.visible).map((s) => ({ s, d: s.k.group.position.distanceToSquared(camPos) })).sort((a, b) => a.d - b.d).slice(0, 3);
        for (const { s, d } of near) { kAnchor.position.add(s.k.group.position); n++; if (d < best) { best = d; kNearest = s.k.head; } }
        if (n) kAnchor.position.divideScalar(n); else kAnchor.position.copy(route[route.length - 1]);
      }

      // ---- the boiler room ----
      if (z < -1960) {
        kamaji.update(dt, t, camPos);
        const fl = 0.82 + Math.sin(t * 7.3) * 0.08 + Math.sin(t * 13.1 + 1) * 0.06 + Math.sin(t * 2.1) * 0.04;
        br.fire.color.setRGB(2.4 * fl, 1.45 * fl, 0.9 * fl);
        // soot sprites walk the loop (it pauses while they swarm an acorn)
        if (swarmT > 0) swarmT -= dt; else sootLoop += dt * 0.9 / (sootLen * 2 + 2);
        for (const s of soots) {
          const u = (s.u0 + sootLoop) % 1;
          const there = u < 0.5;
          const a = there ? u * 2 : (u - 0.5) * 2;
          sootP.copy(there ? sootFrom : sootTo).lerp(there ? sootTo : sootFrom, a).addScaledVector(sootSide, there ? 0.5 : -0.5);
          s.wrap.position.copy(sootP);
          s.wrap.rotation.y = Math.atan2(there ? sootDir.x : -sootDir.x, there ? sootDir.z : -sootDir.z);
          // the lump goes into the fire at the furnace end and is picked up again at the heap
          for (const c of s.coal) c.visible = there;
          s.ch.update(dt, t);
        }
        // the shutters burst open as the paper birds arrive, and the birds pour in
        const open = smoothstep(-2024.5, -2027, z);
        br.shutters.forEach((h, i) => { h.rotation.y = (i === 0 ? 1 : -1) * open * (1.9 + Math.sin(t * 3 + i) * 0.05 * open); });
        birds.update(dt, t, camPos, smoothstep(-2025, -2046, z), smoothstep(-2058, -2077, z));
      } else birds.update(dt, t, camPos, 0, 0);
    },
  };
}
