import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Drift, Puffs } from '../../../engine/Particles';
import { Rng, clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, forwardOf, optimize, showRange, subCurve, zWindow, type BuiltSet, type MountDef, type SetContext, type SetEnv, type SetModule, type ZLightKey } from '../common';
import { buildPastryBox } from '../mendls/box';
import { buildConveyor } from '../mendls/conveyor';
import { buildRooms } from '../mendls/rooms';
import { buildBags, buildFolder, buildMixers, buildOvens, buildRacks, buildSideLines, buildTower } from '../mendls/machines';
import { buildShop } from '../mendls/shop';
import { buildBakers, inkForScale, makeAgatha, makeMendl, makeZero } from '../mendls/cast';
import { GIANT, HALL, MENDL, OVENS, PACK, ROT, SHOP, SIDE, WINDOW, Y, ZERO } from '../mendls/plan';
import { MC } from '../mendls/textures';

/*
 * Part Two: Mendl's. The rider rides in an open pink Mendl's box along a bakery conveyor through the
 * patisserie at giant scale (people are eight times life size; the belt runs at counter height):
 *
 *  z -313  the whip pan clears in the icing hall: twin stand mixers flank the belt and spill cream into two
 *          rivers; piping bags as big as buses ice the Courtesans riding the side lines; bakers in white roll
 *          pastry in unison along the walls; looking back, the machine that folded the rider's box
 *  z -398  the banks of ovens, their round windows glowing; Herr Mendl with his peel
 *  z -445  through the great arch into the octagonal rotunda: the tower of Courtesans turning on its cake
 *          stand under the oculus; the belt bends round it
 *  z -501  through the hatch into the shop: the wall of pink boxes, the cakes iced like buildings, the
 *          ribbon-tying machine, Zero waiting with flowers, and Agatha at her packing table under the
 *          storefront window, its gold lettering backwards from inside
 *  z -538  Agatha leans over and the box's lid swings shut over the rider (black from -552)
 */

const R = SETS.mendls;

const L = { skyTop: 0xa8d0f0, skyMid: 0xf8dce4, skyBottom: 0xfff0f0, sunGlow: 0, sunSize: 0 };
export const LIGHTS: ZLightKey[] = [
  { z: -297, ...L, fog: 0xf0d4da, fogDensity: 0.0042, sunDir: [-0.55, 0.75, 0.3], sunColor: 0xfff0e0, sunIntensity: 1.55, hemiSky: 0xfbeef0, hemiGround: 0xe0c0c6, hemiIntensity: 1.15, exposure: 1.0, bloom: 0.38, saturation: 1.14, tint: 0xfff6f4 },
  { z: -395, ...L, fog: 0xf0d4cc, fogDensity: 0.0045, sunDir: [-0.5, 0.78, 0.25], sunColor: 0xffe8d0, sunIntensity: 1.45, hemiSky: 0xfbeee8, hemiGround: 0xe0bcb4, hemiIntensity: 1.1, exposure: 1.0, bloom: 0.44, saturation: 1.14, tint: 0xfff2ec },
  { z: -468, ...L, fog: 0xe8dae6, fogDensity: 0.0042, sunDir: [-0.15, 0.95, 0.1], sunColor: 0xfff4ec, sunIntensity: 1.55, hemiSky: 0xeef2fb, hemiGround: 0xd8c4d0, hemiIntensity: 1.15, exposure: 1.0, bloom: 0.42, saturation: 1.14, tint: 0xfaf6ff },
  { z: -525, ...L, fog: 0xf0d6de, fogDensity: 0.0045, sunDir: [0.15, 0.55, -0.82], sunColor: 0xfff2e8, sunIntensity: 1.45, hemiSky: 0xfbeef4, hemiGround: 0xe0c0cc, hemiIntensity: 1.15, exposure: 1.0, bloom: 0.44, saturation: 1.14, tint: 0xfff4f6 },
  { z: -548, ...L, fog: 0xe8c8d0, fogDensity: 0.005, sunDir: [0.15, 0.55, -0.82], sunColor: 0xffe8e0, sunIntensity: 1.2, hemiSky: 0xf0dce4, hemiGround: 0xc8a8b4, hemiIntensity: 1.0, exposure: 0.96, bloom: 0.44, saturation: 1.12, tint: 0xfff0f2 },
  { z: -557, ...L, fog: 0x2a1820, fogDensity: 0.008, sunDir: [0.15, 0.55, -0.82], sunColor: 0xc0a0a8, sunIntensity: 0.6, hemiSky: 0x907880, hemiGround: 0x403038, hemiIntensity: 0.7, exposure: 0.95, bloom: 0.4, saturation: 1.05, tint: 0xfff0f0 },
];

export const ENV: SetEnv = (z) => ({ wind: z < -500 ? 0.02 : 0.05, sea: 0, rain: 0, birds: 0, crickets: 0 });

function build(ctx: SetContext): BuiltSet {
  const { road, lights } = ctx;
  const rng = new Rng(18680);
  const group = new THREE.Group();
  const statics = new THREE.Group(), live = new THREE.Group();
  group.add(statics, live);
  const F = Y.floor;

  // ---------- the rooms ----------
  const tick = (_n: string) => { /* build stages, for timing while developing */ };
  const rooms = buildRooms(ctx.lowDetail);
  tick('rooms');
  statics.add(rooms.statics);
  live.add(rooms.shafts);

  // ---------- the conveyors ----------
  const main = buildConveyor(subCurve(road, R.z0 + 3, PACK.z + 0.2, 180), { width: 5, floorY: F, frame: 0xa8d8c8 });
  main.group.remove(main.belt); live.add(main.belt);
  statics.add(main.group);
  const sides = [-1, 1].map((s) => {
    const c = new THREE.LineCurve3(new THREE.Vector3(s * SIDE.x, Y.belt, SIDE.z0), new THREE.Vector3(s * SIDE.x, Y.belt, SIDE.z1));
    const cv = buildConveyor(c, { width: 4, floorY: F, frame: 0xf2c4d0, segs: 40 });
    cv.group.remove(cv.belt); live.add(cv.belt);
    statics.add(cv.group);
    return cv;
  });
  const sideLines = buildSideLines(live);
  tick('conveyors');

  // ---------- machines ----------
  const mixers = buildMixers(statics, live);
  const bags = buildBags(statics, live, rng);
  const ovens = buildOvens(statics, live);
  buildRacks(statics, [[-23, -404], [-23, -436], [23, -404], [23, -436]], rng);
  const folder = buildFolder(statics, live);
  const tower = buildTower(statics, live);
  const shop = buildShop(statics, live, rng);
  tick('machines+shop');

  // ---------- the bakers' tables along the walls ----------
  const bakerSpots: Array<{ pos: THREE.Vector3; yaw: number }> = [];
  {
    const tableM = new THREE.MeshLambertMaterial({ color: 0xf6f0e6 });
    const legM = new THREE.MeshLambertMaterial({ color: 0xc8a070 });
    const doughM = new THREE.MeshLambertMaterial({ color: 0xf2dcb0, emissive: 0x2a2010 });
    for (const s of [-1, 1]) {
      const x = s * 20.2, z0 = -326, z1 = -384;
      const t = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.6, z0 - z1), tableM); t.position.set(x, F + 7.3, (z0 + z1) / 2); statics.add(t);
      for (const z of [z0 - 1, (z0 + z1) / 2, z1 + 1]) for (const dx of [-2.3, 2.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), legM); l.position.set(x + dx, F + 3.5, z); statics.add(l); }
      for (const z of [-335, -355, -375]) {
        bakerSpots.push({ pos: new THREE.Vector3(s * 24.6, F, z), yaw: -s * Math.PI / 2 });
        const d = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 5.2), doughM); d.position.set(s * 19.6, F + 7.78, z); d.rotation.y = rng.range(-0.1, 0.1); statics.add(d);
      }
    }
  }
  const bakers = buildBakers(bakerSpots, GIANT);
  live.add(bakers.group);

  // ---------- the people ----------
  const agatha = makeAgatha();
  agatha.group.scale.setScalar(GIANT); agatha.group.position.set(0, F, PACK.agathaZ);
  inkForScale(agatha.group, GIANT);
  live.add(agatha.group);
  const mendl = makeMendl();
  mendl.group.scale.setScalar(GIANT); mendl.group.position.set(MENDL.x, F, MENDL.z); mendl.group.rotation.y = -Math.PI / 2 - 0.25;
  inkForScale(mendl.group, GIANT);
  live.add(mendl.group);
  const zero = makeZero();
  zero.group.scale.setScalar(GIANT * 0.94); zero.group.position.set(ZERO.x, F, ZERO.z); zero.group.rotation.y = ZERO.yaw;
  inkForScale(zero.group, GIANT);
  live.add(zero.group);
  tick('cast');

  // ---------- the mount: the pastry box ----------
  const box = buildPastryBox(true);
  const mount: MountDef = {
    kind: 'box', group: box.group, seat: box.seat, z0: R.z0, z1: R.z1, tilt: 0.6, bank: 0.05,
    update(dt, t, ride) {
      const z = ride.position.z;
      box.setLid(smoothstep(-537, -550.5, z));
      box.update(dt, t, clamp(ride.speedMult, 0, 1));
    },
  };

  // ---------- flour in the air, steam and icing puffs ----------
  const flour = new Drift({ count: ctx.lowDetail ? 260 : 520, color: 0xfff8f0, size: 0.16, box: new THREE.Vector3(70, 34, 90), speed: new THREE.Vector3(0.2, -0.25, 0.1), wobble: 0.6, opacity: 0.55, seed: 2101 });
  live.add(flour.points);
  const snow = new Drift({ count: 160, color: 0xffffff, size: 0.3, box: new THREE.Vector3(70, 36, 7), speed: new THREE.Vector3(0.3, -2.2, 0), wobble: 0.8, opacity: 0.9, seed: 2103 });
  live.add(snow.points);
  const snowAt = new THREE.Vector3(0, F + 18, SHOP.front - 4.5);
  const puffs = new Puffs(0xfffaf4, 40, 2105);
  live.add(puffs.group);

  // ---------- lights ----------
  lights.add({ from: road.u(-298), to: road.u(-398), pos: new THREE.Vector3(0, Y.belt + 22, -350), color: 0xffe2c8, intensity: 110, distance: 90 });
  lights.add({ from: road.u(-386), to: road.u(-446), pos: new THREE.Vector3(OVENS.x - 5, Y.belt + 2, -419), color: 0xff9a50, intensity: 60, distance: 34, flicker: 0.6 });
  lights.add({ from: road.u(-438), to: road.u(-506), pos: new THREE.Vector3(0, Y.belt + 40, ROT.z), color: 0xf4f0ff, intensity: 130, distance: 90 });
  lights.add({ from: road.u(-498), to: road.u(-572), pos: new THREE.Vector3(0, Y.belt + 14, -536), color: 0xffe8e0, intensity: 110, distance: 70 });

  statics.updateMatrixWorld(true);
  tick('before optimize');
  optimize(statics);
  tick('optimize');

  // ---------- occluders: the walls round the arch and the hatch ----------
  const occluders: THREE.Object3D[] = [];
  const proxy = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial()); m.position.set(x, y, z); m.visible = false; m.updateMatrixWorld(true);
    group.add(m); occluders.push(m);
  };
  for (const s of [-1, 1]) {
    proxy(23, Y.hallTop - F, 1.2, s * 23, (Y.hallTop + F) / 2, HALL.front);
    proxy(21, SHOP.top - F, 1.2, s * 20, (SHOP.top + F) / 2, SHOP.back);
  }
  proxy(24, Y.hallTop - F - 37, 1.2, 0, F + 37 + (Y.hallTop - F - 37) / 2, HALL.front);
  proxy(18, SHOP.top - F - 23, 1.2, 0, F + 23 + (SHOP.top - F - 23) / 2, SHOP.back);

  // ---------- subjects ----------
  const camPos = new THREE.Vector3();
  let rideZ = R.z0;
  const between = (a: number, b: number) => rideZ <= a && rideZ >= b;
  const anchor = (p: THREE.Vector3) => { const o = new THREE.Object3D(); o.position.copy(p); live.add(o); return o; };
  const subjects: Subject[] = [];

  const agathaS = new Subject({
    id: 'agatha', name: 'Agatha', from: FILMS.gbh, group: agatha.group, radius: 5, base: 1450, rarity: 'legendary',
    hint: "Mendl's best pastry girl, at the packing table under the shop window at the end of the line. Look for the birthmark shaped like Mexico. Blow the whistle and she offers you a Courtesan; throw her a Mendl's box and she catches it.",
    poses: { present: { label: 'A Courtesan, for you', mult: 1.9 }, catch: { label: 'Caught it!', mult: 1.7 }, lid: { label: 'Closing the lid', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 1.45, 0), facing: forwardOf(agatha.group), maxDistance: 140, reactRange: 16,
    onCall: () => { agatha.present(); agathaS.setPose('present', 3.2); return true; },
    onItem: () => { agatha.catchBox(); agathaS.setPose('catch', 2.6); return true; },
    update: () => { agathaS.active = between(-484, -553); if (agatha.reach > 0.3 && agathaS.pose === 'idle') agathaS.setPose('lid', 0.3); },
  });
  const mendlS = new Subject({
    id: 'herr-mendl', name: 'Herr Mendl', from: FILMS.gbh, group: mendl.group, radius: 5, base: 1050, rarity: 'rare',
    hint: 'The master baker himself, by the right-hand ovens with his long peel. Whistle and he lifts a tray of Courtesans fresh from the oven; throw him a box and he catches it on the peel.',
    poses: { serve: { label: 'Fresh from the oven', mult: 1.7 }, catch: { label: 'Caught on the peel', mult: 1.6 } },
    centerOffset: new THREE.Vector3(0, 1.4, 0), facing: forwardOf(mendl.group), maxDistance: 120, reactRange: 16,
    onCall: () => { mendl.serve(); mendlS.setPose('serve', 3.2); return true; },
    onItem: () => { mendl.catchBox(); mendlS.setPose('catch', 2.2); return true; },
    update: () => { mendlS.active = between(-330, -445); },
  });
  const zeroS = new Subject({
    id: 'zero-flowers', name: 'Zero, with flowers', from: FILMS.gbh, group: zero.group, radius: 4, base: 900, rarity: 'rare',
    hint: 'The lobby boy, by the shop door on the left, waiting to see Agatha with a bouquet behind his back. Whistle and he gives her the flowers; throw a box and he salutes.',
    poses: { offer: { label: 'Flowers for Agatha', mult: 1.7 }, salute: { label: 'Lobby boy salute', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(zero.group), maxDistance: 110, reactRange: 14,
    onCall: () => { zero.offer(); zeroS.setPose('offer', 3.2); return true; },
    onItem: () => { zero.bow(); zeroS.setPose('salute', 2.2); return true; },
    update: () => { zeroS.active = between(-498, -553); },
  });
  const towerAnchor = anchor(tower.centre);
  const towerS = new Subject({
    id: 'courtesan-tower', name: 'The tower of Courtesans', from: FILMS.gbh, group: towerAnchor, radius: 15, base: 850,
    hint: 'A tower of Courtesans au chocolat, ten rings high, turning on a silver cake stand under the dome of the rotunda. Whistle and it spins, and the cocoa bean on top pops up.',
    poses: { spin: { label: 'The bean pops', mult: 1.6 } }, maxDistance: 230, reactRange: 40,
    onCall: () => { tower.react(); towerS.setPose('spin', 3.4); return true; },
    update: () => { towerS.active = between(-313, -504); },
  });
  const ribbonS = new Subject({
    id: 'ribbon-machine', name: 'The ribbon-tying machine', from: FILMS.gbh, group: anchor(shop.ribbon.anchor), radius: 6, base: 620,
    hint: 'On the right side of the shop, a machine wraps stacks of pink boxes in pale blue ribbon. Whistle and it ties a bow.',
    poses: { bow: { label: 'Tied with a bow', mult: 1.5 } }, maxDistance: 100,
    onCall: () => { shop.ribbon.react(); ribbonS.setPose('bow', 3); return true; },
    update: () => { ribbonS.active = between(-498, -553); },
  });
  const ovensS = new Subject({
    id: 'ovens', name: "Mendl's ovens", from: FILMS.gbh, group: anchor(ovens.anchor), radius: 12, base: 560,
    hint: 'Two banks of ovens with glowing round windows, either side of the belt past the icing hall. Whistle and every door drops open in turn with a puff of steam.',
    poses: { open: { label: 'All the doors open', mult: 1.5 } }, maxDistance: 140, reactRange: 50,
    onCall: () => { ovens.react(); ovensS.setPose('open', 3); return true; },
    update: () => { ovensS.active = between(-345, -445); },
  });
  const bagsS = new Subject({
    id: 'piping-bags', name: 'The piping bags', from: FILMS.gbh, group: anchor(bags.anchor), radius: 9, base: 480,
    hint: 'Piping bags as big as buses hang from gantries over the side lines, icing the Courtesans in lavender, pistachio and pink. Whistle and they all squeeze at once.',
    poses: { squeeze: { label: 'All squeeze together', mult: 1.4 } }, maxDistance: 120, reactRange: 50,
    onCall: () => { bags.react(); bagsS.setPose('squeeze', 2.4); return true; },
    update: () => { bagsS.active = between(-313, -400); },
  });
  const windowS = new Subject({
    id: 'shop-window', name: "The shop window", from: FILMS.gbh, group: anchor(shop.windowAnchor), radius: 12, base: 600,
    hint: "The storefront seen from inside the shop: the gold lettering reads backwards, and the snowy street of Nebelsbad is outside. Whistle and Mendl's delivery van drives past.",
    poses: { van: { label: "The delivery van", mult: 1.6 } }, maxDistance: 150, reactRange: 60,
    onCall: () => { shop.van.drive(); windowS.setPose('van', 4.6); return true; },
    update: () => { windowS.active = between(-498, -553); },
  });
  const bakerAnchor = anchor(new THREE.Vector3(24, F + 10, -355));
  const bakersS = new Subject({
    id: 'bakers', name: 'The bakers', from: FILMS.gbh, group: bakerAnchor, radius: 10, base: 500, crowd: true,
    hint: 'Bakers in white rolling pastry along both walls of the icing hall, all in time. Whistle and they lift their rolling pins together.',
    poses: { pins: { label: 'Rolling pins up', mult: 1.5 } }, maxDistance: 110, reactRange: 50,
    onCall: () => { bakers.react(); bakersS.setPose('pins', 2.8); return true; },
    update: () => { bakersS.active = between(-313, -392); bakerAnchor.position.x = camPos.x > 0 ? 24 : -24; },
  });
  const mixersS = new Subject({
    id: 'mixers', name: 'The stand mixers', from: FILMS.gbh, group: anchor(new THREE.Vector3(7.5, Y.belt + 4, -333)), radius: 6, base: 420,
    hint: 'Twin stand mixers at the start of the line, whisking cream that spills into two rivers along the belt. Whistle and the whisks go flat out.',
    poses: { whisk: { label: 'Full speed', mult: 1.4 } }, maxDistance: 80, reactRange: 30,
    onCall: () => { mixers.react(); mixersS.setPose('whisk', 2.6); return true; },
    update: () => { mixersS.active = between(-313, -342); },
  });
  subjects.push(agathaS, mendlS, zeroS, towerS, ribbonS, ovensS, bagsS, windowS, bakersS, mixersS);

  // ---------- the floor for thrown items ----------
  const floor = (x: number, z: number) => {
    const p = road.at(z);
    if (Math.abs(x - p.x) < 2.6 && z <= R.z0 && z >= PACK.z) return p.y;
    if (z <= SIDE.z0 && z >= SIDE.z1 && Math.abs(Math.abs(x) - SIDE.x) < 2.1) return Y.belt;
    if (z <= PACK.z && z >= PACK.z - PACK.depth && Math.abs(x) < 9) return Y.belt;
    return F;
  };

  void OVENS; void WINDOW; void MC;
  return {
    id: 'mendls', group, show: showRange(road, R, 5, 12), occluders, subjects, floor, water: -Infinity,
    mounts: [mount],
    update(dt, t, ride) {
      const z = ride.position.z;
      rideZ = z;
      ctx.camera.getWorldPosition(camPos);
      main.run(ride.s);
      const sideDist = t * 3.2;
      for (const s of sides) s.run(sideDist);
      sideLines.update(sideDist);
      flour.update(dt, t, camPos);
      puffs.update(dt);
      if (z < -470) snow.update(dt, t, snowAt);
      snow.points.visible = z < -470;
      // the machines
      if (z > -410) { mixers.update(dt, t); bags.update(dt, t); bakers.update(dt, t); folder.update(dt, t); }
      if (z < -360 && z > -450) {
        ovens.update(dt, t);
        const o = ovens.opened();
        if (o) ovens.puffAt.forEach((p, i) => { if (o & (1 << i)) puffs.burst(p, 6, 0xfff4ea, 3, 2.5, 2.2); });
        mendl.lookTarget = camPos; mendl.update(dt, t);
      }
      if (z < -313 && z > -510) tower.update(dt, t);
      if (z < -480) {
        shop.ribbon.update(dt, t);
        shop.van.update(dt);
        agatha.reach = smoothstep(-537, -549, z);
        agatha.lookTarget = camPos; agatha.update(dt, t);
        zero.lookTarget = camPos; zero.update(dt, t);
      }
      // as the lid comes down the rider ducks into the box
      const duck = zWindow(z, -538, -549, -600, -601);
      ctx.shot.offset.y -= 0.85 * duck;
      ctx.shot.pitch += 0.1 * duck;
    },
    onItemLand(pos) { puffs.burst(pos, 8, 0xfffaf2, 2.5, 2, 1.6); },
  };
}

export const MENDLS: SetModule = { build, lights: LIGHTS, env: ENV };
