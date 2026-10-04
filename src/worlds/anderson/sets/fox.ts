import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Puffs } from '../../../engine/Particles';
import { Rng, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, forwardOf, showRange, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { makeAshAndKristofferson, makeBadger, makeKylie, makeMoles, makeMrFox, makeMrsFox, makeRabbit, makeRat, makeWolf } from '../fox/characters';
import { buildCellar } from '../fox/cellar';
import { buildClimb } from '../fox/climb';
import { makeExcavator } from '../fox/excavator';
import { buildHill } from '../fox/hill';
import { buildHome } from '../fox/home';
import { makeMats } from '../fox/mats';
import { CELLAR, TOWN, Y, Z } from '../fox/plan';
import { buildTown } from '../fox/town';
import { rails } from '../fox/track';

/*
 * Part Four: Underneath the Hill (Fantastic Mr. Fox). The ride comes out of the snowdrift into a burrow and
 * runs straight through the inside of the hill, cut open like the film's cross-section shots: the Fox
 * family's home under the tree (Mr. Fox on the balcony over the round green door), the animals' town open
 * to the dusk where the farmers' excavators gnaw at the rims, Bean's cider cellar and its glowing flood
 * (the Rat on guard), a climb past Boggis's chicken house and Bunce's storehouse, and out onto the hilltop
 * at night where the black wolf stands on the far ridge against the moon. See fox/plan.ts for the layout.
 */

const R = SETS.fox;

type Key = Omit<ZLightKey, 'z'>;
const noSky = { sunGlow: 0, moon: 0 };
const home: Key = { skyTop: 0x4a2e1a, skyMid: 0x8a5a2a, skyBottom: 0xc88a3a, ...noSky, stars: 0, fog: 0x4a2c16, fogDensity: 0.009, sunDir: [0.12, 0.75, 0.65], sunColor: 0xffd8a8, sunIntensity: 1.25, hemiSky: 0xf8d098, hemiGround: 0x6a4424, hemiIntensity: 1.15, exposure: 1.08, bloom: 0.5, saturation: 1.15 };
const tunnel: Key = { ...home, fog: 0x3a2414, fogDensity: 0.013, sunColor: 0xffc890, sunIntensity: 0.9, hemiSky: 0xf0c080, hemiGround: 0x5a3a20, hemiIntensity: 1.0, exposure: 1.05, bloom: 0.45 };
const town: Key = { skyTop: 0x141e48, skyMid: 0x3e3468, skyBottom: 0xb8704a, ...noSky, stars: 0.4, fog: 0x3a2a2c, fogDensity: 0.0075, sunDir: [0.1, 0.85, 0.5], sunColor: 0xc0c8f0, sunIntensity: 0.95, hemiSky: 0x9a98c8, hemiGround: 0x6a4a2a, hemiIntensity: 1.1, exposure: 1.1, bloom: 0.55, saturation: 1.1 };
const cellar: Key = { skyTop: 0x4a2a10, skyMid: 0x8a4a14, skyBottom: 0xc87a2a, ...noSky, stars: 0, fog: 0x4a2a10, fogDensity: 0.011, sunDir: [0.1, 0.8, 0.6], sunColor: 0xffc070, sunIntensity: 1.0, hemiSky: 0xffb860, hemiGround: 0x6a3a10, hemiIntensity: 1.15, exposure: 1.06, bloom: 0.62, saturation: 1.15 };
const night: Key = { skyTop: 0x060a24, skyMid: 0x142250, skyBottom: 0x2a3a6e, ...noSky, stars: 1, fog: 0x18203e, fogDensity: 0.0035, sunDir: [0.05, 0.13, -0.99], sunColor: 0x9fb0f0, sunIntensity: 0.85, hemiSky: 0x4a5a9a, hemiGround: 0x141820, hemiIntensity: 0.8, exposure: 1.1, bloom: 0.65, saturation: 1.05 };

export const LIGHTS: ZLightKey[] = [
  { z: -880, ...tunnel },
  { z: -902, ...home },
  { z: -952, ...home },
  { z: -963, ...tunnel },
  { z: -973, ...town },
  { z: -1014, ...town },
  { z: -1022, ...tunnel },
  { z: -1028, ...cellar },
  { z: -1080, ...cellar },
  { z: -1090, ...tunnel },
  // up the climb the sky seen through the exit is already night; the tunnel keeps a little warmth
  { z: -1100, ...night, fog: 0x2a2028, fogDensity: 0.008, sunDir: [0.1, 0.8, 0.4], sunColor: 0xc0a890, sunIntensity: 0.8, hemiSky: 0x8a7a90, hemiGround: 0x3a2a20, hemiIntensity: 0.95 },
  { z: -1121, ...night },
  { z: -1168, ...night },
];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function build(ctx: SetContext): BuiltSet {
  const { road, lights } = ctx;
  const rng = new Rng(4040);
  const group = new THREE.Group();
  const m = makeMats();
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;

  // ---------------- the sets ----------------
  const tm = <T,>(_name: string, f: () => T) => f();
  tm('mats', () => 0);
  const home = tm('home', () => buildHome(road, rng, m));
  const town = tm('town', () => buildTown(road, rng, m));
  const cel = tm('cellar', () => buildCellar(road, rng, m));
  const climb = tm('climb', () => buildClimb(road, rng, m));
  const hill = tm('hill', () => buildHill(road, rng, m));
  group.add(home.statics, town.statics, cel.statics, cel.live, climb.statics, climb.live, hill.statics);
  group.add(rails(road, Z.start + 2, Z.hill.z1 - 4));
  // the rails run on towards the ridge; a hair lower, in case the next scene's own rails are drawn over them
  group.add(rails(road, Z.hill.z1 - 4, -1236, { yOff: -0.04 }));

  // ---------------- the excavators: two on the town's rims, two on the hilltop ----------------
  const diggers = [...town.spots.diggers.map((d) => ({ ...d, reach: 0.9, tilt: 0.16 })), ...hill.spots.diggers.map((d) => ({ ...d, reach: 0, tilt: 0 }))].map((d, i) => {
    const ex = makeExcavator(m, i);
    ex.group.position.copy(d.pos);
    ex.group.rotation.set(d.tilt, d.yaw, 0, 'YXZ');
    group.add(ex.group);
    return { ex, reach: d.reach, town: i < 2 };
  });
  // clods of earth falling from the town diggers' buckets
  const N = 90;
  const dirtPos = new Float32Array(N * 3), dirtVel = new Float32Array(N);
  const dirt = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(dirtPos, 3)), new THREE.PointsMaterial({ color: 0x3a2414, size: 0.32, sizeAttenuation: true }));
  dirt.frustumCulled = false;
  group.add(dirt);
  const drng = new Rng(77);
  const dropFrom = [V(-8.5, Y.town + TOWN.rim, -989), V(8.5, Y.town + TOWN.rim, -1004)];
  for (let i = 0; i < N; i++) { const s = dropFrom[i % 2]; dirtPos.set([s.x + drng.range(-1.5, 1.5), drng.range(Y.town, s.y), s.z + drng.range(-1.5, 1.5)], i * 3); dirtVel[i] = drng.range(0, 6); }

  // ---------------- the cast ----------------
  const mrFox = makeMrFox();
  mrFox.group.position.copy(home.spots.mrFox);
  const mrsFox = makeMrsFox();
  mrsFox.group.position.copy(home.spots.mrsFox.pos); mrsFox.group.rotation.y = home.spots.mrsFox.yaw;
  const boys = makeAshAndKristofferson();
  boys.group.position.copy(home.spots.boys.pos); boys.group.rotation.y = home.spots.boys.yaw;
  const kylie = makeKylie();
  kylie.group.position.copy(town.spots.kylie.pos); kylie.group.rotation.y = town.spots.kylie.yaw;
  const badger = makeBadger();
  badger.group.position.copy(town.spots.badger.pos); badger.group.rotation.y = town.spots.badger.yaw;
  const rabbit = makeRabbit();
  rabbit.group.position.copy(town.spots.rabbit.pos); rabbit.group.rotation.y = town.spots.rabbit.yaw;
  const moles = makeMoles(town.spots.moles);
  const rat = makeRat();
  rat.group.position.copy(cel.spots.rat.pos); rat.group.rotation.y = cel.spots.rat.yaw;
  const wolf = makeWolf();
  wolf.group.position.copy(hill.spots.wolf.pos); wolf.group.rotation.y = hill.spots.wolf.yaw; wolf.group.scale.setScalar(1.6);
  group.add(mrFox.group, mrsFox.group, boys.group, kylie.group, badger.group, rabbit.group, moles.group, rat.group, wolf.group);

  // ---------------- lights ----------------
  const L = (z0: number, z1: number, pos: THREE.Vector3, color: number, intensity: number, distance: number, flicker?: number) => lights.add({ from: road.u(z0), to: road.u(z1), pos, color, intensity, distance, flicker });
  L(-892, -934, V(0, Y.home + 5, -918), 0xffc078, 26, 30);
  L(-926, -962, V(0, Y.home + 4.2, -947), 0xffc078, 34, 30);
  L(-962, -1008, V(0, Y.town + 8, -988), 0xffb870, 30, 34);
  L(-990, -1024, V(7, Y.town + 6, -1005), 0xffc080, 24, 26);
  L(-1016, -1060, V(0, Y.cider + 1.4, -1040), 0xff9a30, 45, 30, 0.6);
  L(-1050, -1090, V(4, Y.cellar + 5, -1072), 0xffb050, 34, 30);
  L(-1086, -1116, climb.lampAt, 0xffc078, 22, 24);
  L(-1110, -1180, V(0, 8, -1146), 0xdde6ff, 30, 45);

  // ---------------- photo subjects ----------------
  const subjects: Subject[] = [];
  const within = (s: Subject, a: number, b: number) => (_dt: number, ride: { position: THREE.Vector3 }) => { const z = zOf(ride); s.active = z < a && z > b; };
  const anchor = (p: THREE.Vector3) => { const o = new THREE.Object3D(); o.position.copy(p); group.add(o); return o; };

  const treeS: Subject = new Subject({
    id: 'fox-treehome', name: 'The tree home', from: FILMS.fox, group: anchor(home.spots.tree), radius: 6, base: 650,
    hint: "The Fox family's home under the great tree, cut open like a dollhouse: kitchen, studio, study, sitting room, and the round green door at the foot of the tree.",
    maxDistance: 120, update: (dt, r) => within(treeS, -890, -956)(dt, r),
  });
  const mrFoxS: Subject = new Subject({
    id: 'fox-mrfox', name: 'Mr. Fox', from: FILMS.fox, group: mrFox.group, radius: 1.3, base: 1400, rarity: 'legendary',
    hint: 'On the balcony over the round green door, in his corduroy suit. Whistle for his whistle-and-click; throw him a box and he catches it.',
    poses: { click: { label: 'The whistle-and-click', mult: 1.9 }, catch: { label: 'Caught it!', mult: 1.7 } },
    centerOffset: V(0, 1.25, 0), facing: forwardOf(mrFox.group), reactRange: 9, maxDistance: 90, swallows: true,
    onCall: () => { mrFox.whistle(); mrFoxS.setPose('click', 2.6); return true; },
    onItem: () => { mrFox.catchBox(); mrFoxS.setPose('catch', 2.2); return true; },
    update: (dt, r) => within(mrFoxS, -890, -955)(dt, r),
  });
  const mrsFoxS: Subject = new Subject({
    id: 'fox-mrsfox', name: 'Mrs. Fox', from: FILMS.fox, group: mrsFox.group, radius: 1.2, base: 800,
    hint: 'Painting a thunderstorm at her easel, in the studio on the left. Whistle and she turns and lifts her brush.',
    poses: { brush: { label: 'Brush raised', mult: 1.5 } },
    centerOffset: V(0, 1.1, 0), facing: forwardOf(mrsFox.group), maxDistance: 70,
    onCall: () => { mrsFox.greet(); mrsFoxS.setPose('brush', 2.8); return true; },
    update: (dt, r) => within(mrsFoxS, -890, -946)(dt, r),
  });
  const boysS: Subject = new Subject({
    id: 'fox-boys', name: 'Ash & Kristofferson', from: FILMS.fox, group: boys.group, radius: 1.6, base: 950, rarity: 'rare',
    hint: "Up in the boys' bedroom, cut into the earth on the left: Kristofferson at his karate, Ash in his cape. Whistle for a flying kick; throw a box and Kristofferson catches it.",
    poses: { kick: { label: 'Flying kick', mult: 1.8 }, block: { label: 'Karate catch', mult: 1.6 } },
    centerOffset: V(0, 0.9, 0), facing: forwardOf(boys.group), reactRange: 10, maxDistance: 70,
    onCall: () => { boys.kata(); boysS.setPose('kick', 2.4); return true; },
    onItem: () => { boys.catchBox(); boysS.setPose('block', 2.2); return true; },
    update: (dt, r) => within(boysS, -890, -945)(dt, r),
  });
  const kylieS: Subject = new Subject({
    id: 'fox-kylie', name: 'Kylie', from: FILMS.fox, group: kylie.group, radius: 1.1, base: 850,
    hint: 'The opossum in the pale blue cardigan, by the track in the underground town. Whistle and he zones out, eyes spinning.',
    poses: { zoned: { label: 'Zoned out', mult: 1.8 } },
    centerOffset: V(0, 1.0, 0), facing: forwardOf(kylie.group), reactRange: 10, maxDistance: 70,
    onCall: () => { kylie.zoneOut(); kylieS.setPose('zoned', 4.2); return true; },
    onItem: () => { kylie.zoneOut(); kylieS.setPose('zoned', 4.2); return true; },
    update: (dt, r) => within(kylieS, -960, -995)(dt, r),
  });
  const badgerS: Subject = new Subject({
    id: 'fox-badger', name: 'Badger', from: FILMS.fox, group: badger.group, radius: 1.2, base: 750,
    hint: 'At his desk in the office of Badger, Beaver & Beaver, on the right in the underground town. Whistle and he rears up: what the cuss?',
    poses: { cuss: { label: 'What the cuss?', mult: 1.6 } },
    centerOffset: V(0, 1.1, 0), facing: forwardOf(badger.group), maxDistance: 60,
    onCall: () => { badger.cuss(); badgerS.setPose('cuss', 2.4); return true; },
    update: (dt, r) => within(badgerS, -962, -986)(dt, r),
  });
  const digAnchor = anchor(V(0, Y.town + TOWN.rim + 4, -996));
  let roarT = -1;
  const digS: Subject = new Subject({
    id: 'fox-excavators', name: "The farmers' excavators", from: FILMS.fox, group: digAnchor, radius: 12, base: 700,
    hint: 'Giant diggers chewing at the hill to get at the foxes: on the rims above the underground town, and again on the hilltop. Whistle and their engines roar.',
    poses: { roar: { label: 'Engines roaring', mult: 1.5 } }, maxDistance: 140, reactRange: 30,
    onCall: () => { roarT = 0; digS.setPose('roar', 2.5); return true; },
    update: (_dt, ride) => {
      const z = zOf(ride);
      digS.active = (z < -962 && z > -1018) || (z < -1112 && z > -1170);
      digAnchor.position.set(0, z > -1060 ? Y.town + TOWN.rim + 4 : 7, z > -1060 ? -996 : -1149);
    },
  });
  const ratS: Subject = new Subject({
    id: 'fox-rat', name: 'Rat', from: FILMS.fox, group: rat.group, radius: 1.1, base: 1100, rarity: 'rare',
    hint: "Bean's cellar guard, on a stack of barrels by the track. Whistle and he snaps his fingers and struts; throw a box and out comes the switchblade.",
    poses: { snap: { label: 'Snapping his fingers', mult: 1.6 }, blade: { label: 'Switchblade', mult: 1.8 } },
    centerOffset: V(0, 1.0, 0), facing: forwardOf(rat.group), reactRange: 10, maxDistance: 70,
    onCall: () => { rat.snap(); ratS.setPose('snap', 2.8); return true; },
    onItem: () => { rat.blade(); ratS.setPose('blade', 2.4); return true; },
    update: (dt, r) => within(ratS, -1018, -1050)(dt, r),
  });
  let splashT = -1;
  const cellarS: Subject = new Subject({
    id: 'fox-cellar', name: "Bean's cider cellar", from: FILMS.fox, group: anchor(cel.spots.heart), radius: 9, base: 700,
    hint: "Racks of Bean's Alcoholic Cider under a brick vault, and a flood of it, glowing amber, that the train runs through. Throw a box into the cider for a splash.",
    poses: { splash: { label: 'Splash!', mult: 1.4 } }, maxDistance: 100, reactRange: 26,
    onItem: (pos) => { if (pos.y > Y.cider + 1.5) return false; splashT = 0; cellarS.setPose('splash', 1.6); return true; },
    update: (dt, r) => within(cellarS, -1018, -1082)(dt, r),
  });
  const wolfS: Subject = new Subject({
    id: 'fox-wolf', name: 'The wolf', from: FILMS.fox, group: wolf.group, radius: 2.4, base: 1500, rarity: 'legendary',
    hint: 'On the far ridge at the top of the hill, black against the moon. Whistle, and he answers with a raised fist.',
    poses: { salute: { label: 'Raised fist', mult: 2.0 } },
    centerOffset: V(0, 1.4, 0), facing: () => new THREE.Vector3(0, 0, 1), maxDistance: 160, reactRange: 30,
    onCall: () => { wolf.salute(); wolfS.setPose('salute', 4.4); return true; },
    update: (dt, r) => within(wolfS, -1110, -1172)(dt, r),
  });
  subjects.push(treeS, mrFoxS, mrsFoxS, boysS, kylieS, badgerS, digS, ratS, cellarS, wolfS);

  // ---------------- splashes and dust ----------------
  const puffs = new Puffs(0xffd080, 40, 404);
  group.add(puffs.group);

  // ---------------- the floor for thrown items ----------------
  const floor = (x: number, z: number) => {
    const ax = Math.abs(x);
    if (z <= Z.home.z0 && z > Z.home.z1) return ax > 4.6 && ax < 14 ? Y.room : Y.home;
    if (z <= Z.town.z0 && z > Z.town.z1) return ax > TOWN.half - 4.5 ? Y.town + 0.3 : Y.town;
    if (z <= Z.cellar.z0 && z > Z.cellar.z1) return ax < CELLAR.half ? Y.cellar : road.at(z).y;
    if (z <= Z.hill.z0) return hill.ground(x, z);
    return road.at(z).y - 0.1;
  };

  const cam = new THREE.Vector3();
  return {
    id: 'fox', group, show: showRange(road, R, 12, 6), occluders: home.occluders, subjects, floor, water: Y.cider,
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(cam);
      // ---- the home ----
      if (z > -975) {
        mrFox.update(dt, t, cam); mrsFox.update(dt, t, cam); boys.update(dt, t, cam);
        home.fire.color.setRGB(2.0 + Math.sin(t * 7.3) * 0.25 + Math.sin(t * 13.1) * 0.15, 0.9 + Math.sin(t * 5.1) * 0.12, 0.3);
      }
      // ---- the town: the cast, the diggers chewing, earth falling ----
      if (roarT >= 0) { roarT += dt; if (roarT > 2.5) roarT = -1; }
      const roar = roarT >= 0 ? Math.sin(Math.min(1, roarT / 0.3) * Math.PI * 0.5) * (1 - smoothstep(1.8, 2.5, roarT)) : 0;
      for (const d of diggers) {
        if (d.town ? z < -1030 || z > -940 : z > -1100) continue;
        d.ex.pose(t * (1 + roar * 2.5), d.reach);
        for (const l of d.ex.lamps) l.scale.setScalar(1 + roar * 0.25 * Math.sin(t * 40));
      }
      if (z < -950 && z > -1030) {
        kylie.update(dt, t, cam); badger.update(dt, t, cam); rabbit.update(dt, t, cam); moles.update(dt, t, cam);
        for (let i = 0; i < N; i++) {
          dirtVel[i] += 9.8 * dt;
          dirtPos[i * 3 + 1] -= dirtVel[i] * dt;
          if (dirtPos[i * 3 + 1] < Y.town) {
            const s = dropFrom[i % 2];
            dirtPos[i * 3] = s.x + drng.range(-1.6, 1.6); dirtPos[i * 3 + 1] = s.y + drng.range(0, 1.5); dirtPos[i * 3 + 2] = s.z + drng.range(-1.6, 1.6);
            dirtVel[i] = drng.range(0, 2);
          }
        }
        (dirt.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
      dirt.visible = z < -950 && z > -1030;
      // ---- the cellar: the cider flows, the foam churns, apples bob ----
      if (z < -1005 && z > -1100) {
        rat.update(dt, t, cam);
        m.cider.map!.offset.set(Math.sin(t * 0.3) * 0.05, -t * 0.04);
        cel.streams.offset.y = -t * 1.6;
        cel.foam.forEach((f, i) => { const k = 1 + Math.sin(t * 6 + i * 1.7) * 0.15; f.scale.set(k, 1, k); });
        for (const f of cel.floaters) { f.o.position.y = f.y + Math.sin(t * 1.4 + f.ph) * 0.05; f.o.rotation.y += dt * 0.1; }
        if (splashT >= 0) { if (splashT === 0) puffs.burst(cel.spots.heart.clone().setY(Y.cider + 0.2), 14, 0xffc860, 3, 3, 1.2); splashT += dt; if (splashT > 1) splashT = -1; }
      }
      // ---- the climb: the farmers ----
      if (z < -1070 && z > -1125) for (const f of climb.farmers) {
        f.f.tick(dt, t, cam, 0.5);
        if (f.chew) { f.f.shoulder[1].rotation.x = -1.6 - Math.max(0, Math.sin(t * 2.4)) * 0.5; f.f.elbow[1].rotation.x = -1.5; }
      }
      // ---- the hilltop: the wolf ----
      if (z < -1095) wolf.update(dt, t, cam);
      puffs.update(dt);
    },
    onCall() { moles.startle(); },
    onItemLand(pos) {
      if (pos.z < Z.cellar.z0 && pos.z > Z.cellar.z1 && pos.y < Y.cider + 0.6) puffs.burst(pos.clone().setY(Y.cider + 0.1), 10, 0xffc860, 2.4, 2.6, 1);
      else puffs.burst(pos, 6, 0x8a6a4a, 1.6, 1.6, 0.7);
    },
  };
}

export const FOX: SetModule = {
  build, lights: LIGHTS,
  env: (z) => (z > Z.hill.z0 + 4 ? { wind: z < Z.town.z0 && z > Z.town.z1 ? 0.25 : 0.05, birds: 0, crickets: 0 } : { wind: 0.4, crickets: 0.75 }),
};
