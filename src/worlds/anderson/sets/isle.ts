import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Drift, Puffs } from '../../../engine/Particles';
import { clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, boxProxy, forwardOf, optimize, showRange, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { buildTrashLand } from '../isle/terrain';
import { buildStation } from '../isle/station';
import { buildCableLine, buildGondolaMount, gripPoint } from '../isle/gondola';
import { seaTexture } from '../isle/paint';
import { CHIEF, NUTMEG, PACK, PLANE, PYLONS, SEA, SPOTS, TAIKO, ZSNAP, CITY, V } from '../isle/plan';
import { DOGS, DogLife, makeDog, type Dog, type DogPose } from '../isle/dogs';
import { makeAtari, makeChief } from '../isle/cast';
import { makeDrummer } from '../isle/people';
import { buildBarrel, buildBrewery, buildCage, buildLab, buildPark, buildPlane, buildSkyline, buildTaikoStage } from '../isle/landmarks';
import { buildJunk, Gulls } from '../isle/props';
import { mendlsBox } from '../kit';

/*
 * Part Seven: Trash Island (Isle of Dogs). The rider hangs in a rusty trash gondola on the line from the
 * island's transfer station, over the mountains of colour-sorted trash bales, towards Megasaki City across
 * the bay.
 *
 *  z -1792  the theatre curtain is down; behind it, the rider's car waits in Transfer Station No. 7
 *  z -1810  the curtain opens on the station (the bull wheel turning at the back, bales on the platforms)
 *  z -1830  out of the station and up the cable: on the left, the pack (Rex, King, Boss in his baseball
 *           jersey, Duke) sitting in a row in front of Atari's crashed Junior-Turbo Prop, Atari on its wing
 *  z -1893  Chief alone on a pillar of bales beside the cable
 *  z -1934  Spots in his cage on a heap to the right, beyond the return line's loaded cars
 *  z -1972  Nutmeg poised on a sake barrel to the left; the abandoned amusement park in the valley on the
 *           right, the sake brewery on the left, Megasaki's skyline straight ahead across the bay
 *  z -2034  at the island's edge the grip lets go: sparks, a jolt, and the car dives towards the taiko
 *           drummers' stage floating in the bay; the splash at z -2080 is the cover into the next part
 */

const R = SETS.isle;

const AFTERNOON = { skyTop: 0x8a9cae, skyMid: 0xd2c8b4, skyBottom: 0xe8d4b0, fog: 0xcfc2aa, fogDensity: 0.0022, sunDir: [0.55, 0.5, 0.45] as [number, number, number], sunColor: 0xffdcb0, sunIntensity: 2.0, hemiSky: 0xc8d0d8, hemiGround: 0x7a6a56, hemiIntensity: 1.05, exposure: 1.02, bloom: 0.3, saturation: 0.95, tint: 0xfff4e6, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.1, cloudShadow: 0.35 };
export const LIGHTS: ZLightKey[] = [
  // under the curtain: the station's dusty light
  { z: -1794, ...AFTERNOON, fogDensity: 0.0035, exposure: 0.98 },
  { z: -1826, ...AFTERNOON },
  { z: -1960, ...AFTERNOON, sunColor: 0xffd4a0 },
  // over the bay the haze warms
  { z: -2060, ...AFTERNOON, sunColor: 0xffcc98, fog: 0xd6c4a6, skyBottom: 0xecd2a8 },
  { z: -2092, ...AFTERNOON, sunColor: 0xffcc98, fog: 0xd6c4a6, skyBottom: 0xecd2a8 },
];

function build(ctx: SetContext): BuiltSet {
  const { road, lights } = ctx;
  const group = new THREE.Group();
  const statics = new THREE.Group(), live = new THREE.Group();
  group.add(statics, live);
  const subjects: Subject[] = [];
  const camPos = new THREE.Vector3();
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;
  const tmp = new THREE.Vector3();

  // ---------- the land, the station, the cable line, the sea ----------
  const land = buildTrashLand(road, ctx.lowDetail);
  group.add(land.group);
  const ground = (x: number, z: number) => Math.max(SEA, land.top(x, z));
  const station = buildStation(road, land.material);
  statics.add(station.group);
  live.add(station.wheel, ...station.shafts);
  lights.add({ from: road.u(-1786), to: road.u(-1846), pos: V(2, 9.5, -1814), color: 0xffd6a0, intensity: 60, distance: 30 });
  const cables = buildCableLine(road, ground, ctx.lowDetail);
  live.add(cables.group);
  const gondola = buildGondolaMount(ctx, R.z0, R.z1);

  const seaTex = seaTexture().clone();
  seaTex.needsUpdate = true;
  seaTex.repeat.set(1400 / 24, 1000 / 24);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1000), new THREE.MeshLambertMaterial({ map: seaTex }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA, -2150);
  sea.receiveShadow = true;
  live.add(sea);

  // ---------- Atari's crashed plane, Atari on its wing ----------
  const plane = buildPlane(land.material);
  plane.group.position.set(PLANE.x, ground(PLANE.x, PLANE.z), PLANE.z);
  statics.add(plane.group);
  const atari = makeAtari();
  atari.group.position.copy(plane.group.position).add(plane.stand);
  atari.group.rotation.y = 0.75;
  live.add(atari.group);
  const smokeAt = plane.group.position.clone().add(plane.smoke);
  const smoke = new Drift({ count: 36, color: 0x5a5650, size: 1.3, box: new THREE.Vector3(2.5, 12, 2.5), speed: new THREE.Vector3(0.5, 1.4, 0.2), wobble: 0.4, opacity: 0.45, seed: 7101 });
  live.add(smoke.points);
  const puffs = new Puffs(0x6a6660, 20, 7103);
  live.add(puffs.group);

  // ---------- the pack, sitting in a row in front of the plane ----------
  const packDogs: Array<{ dog: Dog; life: DogLife }> = [];
  const packSpec: Array<[ReturnType<typeof DOGS.rex>, number, Partial<DogPose>]> = [
    [DOGS.rex(), 4.6, {}], [DOGS.king(), 1.6, { sit: 1 }], [DOGS.boss(), -1.5, {}], [DOGS.duke(), -4.6, { sit: 1 }],
  ];
  for (const [o, dx, base] of packSpec) {
    const dog = makeDog(o);
    const x = PACK.x + dx, z = PACK.z + Math.abs(dx) * 0.25;
    dog.group.position.set(x, ground(x, z), z);
    dog.group.rotation.y = 0.35 + dx * 0.03;
    live.add(dog.group);
    const life = new DogLife(dog, o.seed);
    life.base = base;
    life.attention = 0.12;
    packDogs.push({ dog, life });
  }
  const packAnchor = new THREE.Object3D();
  packAnchor.position.set(PACK.x, ground(PACK.x, PACK.z), PACK.z);
  live.add(packAnchor);
  let packCallT = 99, packItemT = 99;
  const packItem = new THREE.Vector3();
  const packS = new Subject({
    id: 'isle-pack', name: 'The pack', from: FILMS.isle, group: packAnchor, radius: 6, base: 1000, rarity: 'rare',
    hint: 'Rex, King, Boss (in his baseball jersey) and Duke, in a row in front of a crashed plane on the left as the gondola leaves the station. Blow the whistle and every head turns at once; throw a box and they all want it.',
    poses: { look: { label: 'All heads turn at once', mult: 1.8 }, dinner: { label: 'Dinner!', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 1.4, 0), crowd: true, maxDistance: 90, reactRange: 12,
    facing: () => forwardOf(packDogs[1].dog.head)(),
    onCall: () => { packCallT = 0; packS.setPose('look', 3.4); return true; },
    onItem: (pos) => { packItemT = 0; packItem.copy(pos); packS.setPose('dinner', 3); return true; },
    update: (_dt, ride) => { const z = zOf(ride); packS.active = z < -1822 && z > -1882; },
  });
  subjects.push(packS);

  // ---------- Atari ----------
  const atariS = new Subject({
    id: 'isle-atari', name: 'Atari Kobayashi', from: FILMS.isle, group: atari.group, radius: 1.6, base: 1100, rarity: 'rare',
    hint: 'The boy pilot in his silver flight suit, standing on the wing of his crashed plane on the left, just out of the station. Blow the whistle and he answers with his own; throw him a box and he catches it.',
    poses: { whistle: { label: 'Answering whistle', mult: 1.7 }, catch: { label: 'Caught it!', mult: 1.6 } },
    centerOffset: new THREE.Vector3(0, 1.6, 0), facing: forwardOf(atari.group), maxDistance: 80, reactRange: 8,
    onCall: () => { atari.whistle(); atariS.setPose('whistle', 4.5); return true; },
    onItem: () => { atari.catchBox(); atariS.setPose('catch', 2.4); return true; },
    update: (_dt, ride) => { const z = zOf(ride); atariS.active = z < -1822 && z > -1886; },
  });
  subjects.push(atariS);
  const planeAnchor = new THREE.Object3D();
  planeAnchor.position.copy(plane.group.position).add(V(2.5, 3, 0));
  live.add(planeAnchor);
  const planeS = new Subject({
    id: 'isle-plane', name: 'The Junior-Turbo Prop', from: FILMS.isle, group: planeAnchor, radius: 5, base: 500,
    hint: "Atari's little plane, nose-down in a heap of bales where it came down, its tail in the air. Throw a box at the engine and it coughs out smoke.",
    poses: { cough: { label: 'The engine coughs', mult: 1.4 } }, maxDistance: 110, reactRange: 7,
    onItem: () => { puffs.burst(smokeAt, 12, 0x4a4640, 2.5, 3, 2.2); planeS.setPose('cough', 2); return true; },
    update: (_dt, ride) => { const z = zOf(ride); planeS.active = z < -1822 && z > -1892; },
  });
  subjects.push(planeS);

  // ---------- Chief on his pillar ----------
  const chief = makeChief();
  chief.group.position.set(CHIEF.x, ground(CHIEF.x, CHIEF.z), CHIEF.z);
  chief.group.rotation.y = 0.55;
  live.add(chief.group);
  const chiefS = new Subject({
    id: 'isle-chief', name: 'Chief', from: FILMS.isle, group: chief.group, radius: 1.7, base: 1450, rarity: 'legendary',
    hint: 'The black stray, alone on a pillar of bales just left of the cable as it climbs. Blow the whistle and he turns and barks; throw him a box and he leaps and catches it in his jaws.',
    poses: { bark: { label: 'Bark!', mult: 1.8 }, catch: { label: 'Caught it in his jaws', mult: 2.0 } },
    centerOffset: new THREE.Vector3(0, 0.65, 0.1), facing: forwardOf(chief.dog.head), maxDistance: 80, reactRange: 9, swallows: true,
    onCall: () => { chief.bark(); chiefS.setPose('bark', 2.6); return true; },
    onItem: () => { chief.catchBox(); chiefS.setPose('catch', 4.5); return true; },
    update: (_dt, ride) => { const z = zOf(ride); chiefS.active = z < -1846 && z > -1940; },
  });
  subjects.push(chiefS);

  // ---------- Spots in his cage ----------
  const cage = buildCage();
  cage.position.set(SPOTS.x, ground(SPOTS.x, SPOTS.z), SPOTS.z);
  cage.rotation.y = -0.45;
  statics.add(cage);
  const spots = makeDog(DOGS.spots());
  spots.group.position.copy(cage.position).add(V(0, 0.2, 0));
  spots.group.rotation.y = -0.45;
  live.add(spots.group);
  const spotsLife = new DogLife(spots, 7201);
  spotsLife.base = { sit: 1 };
  spotsLife.attention = 0.5;
  let spotsT = 99;
  const spotsS = new Subject({
    id: 'isle-spots', name: 'Spots', from: FILMS.isle, group: spots.group, radius: 1.8, base: 1150, rarity: 'rare',
    hint: "Atari's lost guard dog, sitting in his cage on a heap to the right, past the return line. Blow the whistle: he knows it, and he stands up against the bars and howls.",
    poses: { howl: { label: 'He knows that whistle', mult: 1.9 } },
    centerOffset: new THREE.Vector3(0, 0.7, 0), facing: forwardOf(spots.head), maxDistance: 80,
    onCall: () => { spotsT = 0; spotsS.setPose('howl', 3.6); return true; },
    update: (_dt, ride) => { const z = zOf(ride); spotsS.active = z < -1890 && z > -1985; },
  });
  subjects.push(spotsS);
  spotsLife.react = (P) => {
    const k = Math.min(1, Math.max(0, 1 - Math.abs(spotsT - 1.8) / 1.8)) > 0 ? Math.min(1, spotsT / 0.4, (3.8 - spotsT) / 0.6) : 0;
    if (k > 0) { P.sit = 1 - k; P.rear = k * 0.85; P.headPitch -= 0.9 * k; P.wag = Math.sin(spotsT * 16) * 0.5 * k; P.tailUp = k; }
  };

  // ---------- Nutmeg on the sake barrel ----------
  const barrel = buildBarrel();
  barrel.group.position.set(NUTMEG.x, ground(NUTMEG.x, NUTMEG.z), NUTMEG.z);
  statics.add(barrel.group);
  const nutmeg = makeDog(DOGS.nutmeg());
  const nutmegSpin = new THREE.Group();
  nutmegSpin.position.copy(barrel.group.position).add(V(0, barrel.top, 0));
  nutmegSpin.rotation.y = 0.75;
  nutmegSpin.add(nutmeg.group);
  live.add(nutmegSpin);
  const nutmegLife = new DogLife(nutmeg, 7301);
  nutmegLife.base = { sit: 1 };
  nutmegLife.attention = 0.7;
  const nutBox = makeBoxOnNose(nutmeg);
  let nutCallT = 99, nutItemT = 99;
  const nutmegS = new Subject({
    id: 'isle-nutmeg', name: 'Nutmeg', from: FILMS.isle, group: nutmeg.group, radius: 1.7, base: 1200, rarity: 'rare',
    hint: 'The show dog, cream and poised, sitting on an old sake barrel to the left. Blow the whistle for a trick; throw her a box and she balances it on her nose.',
    poses: { trick: { label: 'A pirouette', mult: 1.8 }, balance: { label: 'Balanced on her nose', mult: 1.9 } },
    centerOffset: new THREE.Vector3(0, 0.75, 0.1), facing: forwardOf(nutmeg.head), maxDistance: 80, reactRange: 9,
    onCall: () => { nutCallT = 0; nutmegS.setPose('trick', 2.4); return true; },
    onItem: () => { nutItemT = 0; nutmegS.setPose('balance', 4.5); return true; },
    update: (_dt, ride) => { const z = zOf(ride); nutmegS.active = z < -1925 && z > -2020; },
  });
  subjects.push(nutmegS);
  nutmegLife.react = (P) => {
    // the trick: up on her hind legs for a pirouette, then a neat sit
    const tr = nutCallT < 2.2 ? Math.min(1, nutCallT / 0.3, (2.2 - nutCallT) / 0.4) : 0;
    if (tr > 0) { P.sit = 1 - tr; P.rear = tr; P.headPitch -= 0.3 * tr; P.wag = Math.sin(nutCallT * 14) * 0.3 * tr; }
    // the balance: head up, perfectly still
    const bl = nutItemT < 4.6 ? Math.min(1, nutItemT / 0.4, (4.6 - nutItemT) / 0.5) : 0;
    if (bl > 0) { P.headPitch = -0.75 * bl; P.headYaw *= 1 - bl; P.headRoll *= 1 - bl; }
    nutBox.visible = nutItemT > 0.3 && nutItemT < 4.4;
  };

  // ---------- the amusement park, the brewery, the lab, the skyline ----------
  const park = buildPark(ground);
  const wheelGroup = park.wheel;
  park.group.remove(wheelGroup);
  for (const c of park.cabins) park.group.remove(c);
  statics.add(park.group);
  live.add(wheelGroup, ...park.cabins);
  for (const c of [wheelGroup, ...park.cabins]) optimize(c);
  const hubAnchor = new THREE.Object3D();
  hubAnchor.position.copy(park.hub);
  live.add(hubAnchor);
  let parkT = 99;
  const parkS = new Subject({
    id: 'isle-park', name: 'Dreamland', from: FILMS.isle, group: hubAnchor, radius: 26, base: 700,
    hint: "The abandoned amusement park in the valley on the right: a rusting Ferris wheel and a broken roller coaster. Blow the whistle and its lights come on.",
    poses: { lights: { label: 'The lights come on', mult: 1.6 } }, maxDistance: 220,
    onCall: () => { parkT = 0; parkS.setPose('lights', 8); return true; },
    update: (_dt, ride) => { const z = zOf(ride); parkS.active = z < -1915 && z > -2070; },
  });
  subjects.push(parkS);
  const brewery = buildBrewery(ground);
  statics.add(brewery);
  const lab = buildLab();
  statics.add(lab);
  const skyline = buildSkyline();
  live.add(skyline);
  const cityAnchor = new THREE.Object3D();
  cityAnchor.position.set(CITY.x, 60, CITY.z);
  live.add(cityAnchor);
  const cityS = new Subject({
    id: 'isle-city', name: 'Megasaki City', from: FILMS.isle, group: cityAnchor, radius: 160, base: 600,
    hint: "Across the bay, straight down the cable: Megasaki's skyline, its towers stepping up to the dome of City Hall either side, the mountains behind.",
    maxDistance: 900,
    update: (_dt, ride) => { const z = zOf(ride); cityS.active = z < -1900 && z > -2080; },
  });
  subjects.push(cityS);

  // ---------- the taiko drummers on their floating stage ----------
  const stage = buildTaikoStage();
  statics.add(stage.group);
  const drummers = [-10, -5, 0, 5, 10].map((x, i) => {
    const d = makeDrummer(7401 + i, i === 2 ? 0.85 : 0.62);
    d.group.scale.setScalar(i === 2 ? 1.9 : 1.7);
    d.group.position.set(TAIKO.x + x, stage.deckY, TAIKO.z + 1.2 - Math.abs(x) * 0.08);
    live.add(d.group);
    return d;
  });
  const taikoAnchor = new THREE.Object3D();
  taikoAnchor.position.set(TAIKO.x, stage.deckY + 2.5, TAIKO.z + 1);
  live.add(taikoAnchor);
  const taikoS = new Subject({
    id: 'isle-taiko', name: 'The taiko drummers', from: FILMS.isle, group: taikoAnchor, radius: 14, base: 800, rarity: 'rare',
    hint: 'On a floating stage in the bay, straight ahead as the gondola falls: five drummers before a golden screen. Blow the whistle and they strike together.',
    poses: { unison: { label: 'In unison', mult: 1.7 } }, maxDistance: 160, facing: () => new THREE.Vector3(0, 0, 1),
    onCall: () => { for (const d of drummers) d.unison(); taikoS.setPose('unison', 1.8); unisonFlash = 1.6; return true; },
    update: (_dt, ride) => { const z = zOf(ride); taikoS.active = z < -1990 && z > -2084; },
  });
  subjects.push(taikoS);
  let unisonFlash = 99;
  lights.add({ from: road.u(-2026), to: road.u(-2098), pos: V(TAIKO.x, stage.deckY + 7, TAIKO.z + 6), color: 0xffc88a, intensity: 80, distance: 46 });

  // ---------- rubbish, gulls, blowing paper ----------
  const avoid = (x: number, z: number) => {
    if (z > -1834) return true;
    if (Math.abs(x) < 3 || Math.abs(x - 9) < 3) return true;
    for (const p of [PACK, PLANE, CHIEF, SPOTS, NUTMEG]) if (Math.abs(x - p.x) < 7 && Math.abs(z - p.z) < 7) return true;
    return false;
  };
  statics.add(buildJunk(ctx.rng, (x, z) => land.top(x, z), avoid, ctx.lowDetail));
  const gulls = new Gulls([V(-30, 46, -1880), V(40, 52, -1960), V(0, 40, -2080), V(-50, 44, -2010)], ctx.lowDetail ? 3 : 5, 7501);
  live.add(gulls.mesh);
  const paper = new Drift({ count: ctx.lowDetail ? 30 : 60, color: 0xf0e8d8, size: 0.22, box: new THREE.Vector3(70, 30, 70), speed: new THREE.Vector3(2.4, 0.2, 1.2), wobble: 1.4, opacity: 0.9, seed: 7601 });
  live.add(paper.points);
  const sparks = new Puffs(0xffc860, 24, 7701);
  live.add(sparks.group);

  statics.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.receiveShadow === false) m.receiveShadow = true; });
  statics.updateMatrixWorld(true);
  const occluders = [boxProxy(station.group), boxProxy(brewery), boxProxy(lab)];
  optimize(statics);

  // ---------- the ride's floor for thrown items ----------
  const floor = (x: number, z: number) => {
    if (Math.abs(x - TAIKO.x) < 15 && Math.abs(z - TAIKO.z) < 6) return stage.deckY;
    const t = land.top(x, z);
    return t > -1e6 ? t : SEA - 2;
  };

  let prevZ = 1e9;
  const grip = gripPoint(road, ZSNAP);
  return {
    id: 'isle', group, show: showRange(road, R, 8, 8), occluders, subjects, water: SEA, floor,
    mounts: [gondola.def],
    bump(z) {
      // the carriage rattles over each pylon's sheaves; a lurch when the grip lets go
      let b = 0;
      for (const pz of PYLONS) b -= 0.07 * Math.exp(-(((z - pz) / 0.9) ** 2));
      b -= 0.25 * Math.exp(-(((z - ZSNAP + 1.2) / 1.0) ** 2));
      return b;
    },
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      cables.update(dt, t, ride);
      station.wheel.rotation.y = t * 0.25;
      seaTex.offset.set(Math.sin(t * 0.05) * 0.02, t * 0.004);

      // jolts at the pylons and the snap
      if (prevZ < 1e8) {
        for (const pz of PYLONS) if (prevZ > pz && z <= pz) gondola.kick(-0.5, 0.15);
        if (prevZ > ZSNAP && z <= ZSNAP) { gondola.kick(1.2, 0.4); sparks.burst(grip, 22, 0xffd070, 5, 4, 0.6); }
      }
      prevZ = z;
      const snapK = smoothstep(ZSNAP + 1, ZSNAP - 1, z) * (1 - smoothstep(ZSNAP - 3, ZSNAP - 8, z));
      if (snapK > 0) ctx.fx.flash(0.35 * snapK, 0xffe0a0);
      // the dive: a shiver as it falls
      const fall = smoothstep(ZSNAP, ZSNAP - 10, z);
      if (fall > 0) { ctx.shot.roll += Math.sin(t * 23) * 0.012 * fall; ctx.shot.offset.y += Math.sin(t * 31) * 0.03 * fall; }
      sparks.update(dt);

      // the first stretch: the pack, Atari, the plane's smoke
      if (z > -1915) {
        atari.target = camPos;
        atari.update(dt, t);
        smoke.update(dt, t, tmp.copy(smokeAt).add(V(0, 5, 0)));
        puffs.update(dt);
        packCallT += dt; packItemT += dt;
        for (const { life } of packDogs) {
          const calling = packCallT < 3.4, item = packItemT < 3;
          life.attention = calling ? 1 : item ? 1 : 0.12;
          life.look.yaw.freq = calling ? 5 : 1.6; life.look.pitch.freq = calling ? 5 : 1.6;
          life.react = (P) => {
            if (item) { P.sit = 0; P.wag = Math.sin(t * 15) * 0.5; P.tailUp = 1; }
            if (calling) P.tailUp = 0.6;
          };
          life.update(dt, item ? packItem : camPos);
        }
      }
      if (z < -1840 && z > -1960) { chief.target = camPos; chief.update(dt, t); }
      if (z < -1880 && z > -2000) { spotsT += dt; spotsLife.update(dt, camPos); }
      if (z < -1920 && z > -2040) {
        nutCallT += dt; nutItemT += dt;
        nutmegLife.update(dt, camPos);
        // the pirouette turns her whole body on the barrel top
        const spin = nutCallT < 2.2 ? smoothstep(0.35, 1.7, nutCallT) * Math.PI * 2 : 0;
        nutmegSpin.rotation.y = 0.75 + spin;
      }
      // the park: the wheel turns slowly; the whistle lights it and speeds it up
      if (z < -1900) {
        parkT += dt;
        const lit = clamp(Math.min(parkT / 0.5, (8 - parkT) / 1.5), 0, 1);
        park.bulbs.color.setRGB(0.55 + lit * 1.0, 0.48 + lit * 0.82, 0.38 + lit * 0.4);
        const a = t * (0.04 + lit * 0.12);
        wheelGroup.rotation.x = a;
        for (const c of park.cabins) {
          const ang = (c.userData.angle as number) - a;
          c.position.set(park.hub.x, park.hub.y + Math.sin(ang) * 23, park.hub.z + Math.cos(ang) * 23);
          c.rotation.z = Math.sin(t * 0.8 + (c.userData.angle as number) * 3) * 0.04;
        }
      }
      // the drummers, and their unison strike
      if (z < -1980) {
        for (const d of drummers) d.update(dt, t, camPos);
        unisonFlash += dt;
        if (unisonFlash > 0.9 && unisonFlash < 1.2) ctx.fx.flash(0.18 * (1 - (unisonFlash - 0.9) / 0.3), 0xffe8c0);
      }
      gulls.update(t);
      paper.update(dt, t, camPos);
    },
    onCall() { /* each subject answers the whistle itself */ },
  };
}

/** A Mendl's box that appears balanced on Nutmeg's nose (in the head's space, scaled back to world size). */
function makeBoxOnNose(dog: Dog) {
  const b = mendlsBox(1.5);
  b.scale.setScalar(1 / dog.opts.scale);
  b.position.set(0, 0.075, -0.02);
  b.rotation.y = 0.3;
  b.visible = false;
  dog.mouth.add(b);
  return b;
}

export const ISLE: SetModule = {
  build, lights: LIGHTS,
  env: (z) => {
    const dive = smoothstep(ZSNAP, -2080, z);
    return { wind: 0.4 + 0.2 * smoothstep(-1830, -1940, z) + 0.3 * dive, sea: 0.15 + 0.5 * smoothstep(-1990, -2070, z), birds: 0.25, rain: 0, crickets: 0 };
  },
};
