import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { clamp } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, forwardOf, showRange, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { makeAshAndKristofferson, makeMrFox, makeMrsFox } from '../fox/characters';
import { buildHome } from '../fox/home';
import { makeMats } from '../fox/mats';
import { Y, Z } from '../fox/plan';
import { rails } from '../fox/track';

/*
 * Part Four: Underneath the Hill (Fantastic Mr. Fox). The ride comes out of the snowdrift into a burrow and
 * runs straight through the inside of the hill, cut open like the film's cross-section shots: the Fox
 * family's home under the tree, the animals' town open to the dusk where the farmers' excavators gnaw at the
 * hill, Bean's cider cellar and its flood, a climb past Boggis's and Bunce's, and out onto the hilltop at
 * night where the black wolf stands on the far ridge. See fox/plan.ts for the layout.
 */

const R = SETS.fox;

const warm = { skyTop: 0x4a2e1a, skyMid: 0x8a5a2a, skyBottom: 0xc88a3a, sunGlow: 0, stars: 0, moon: 0 };
export const LIGHTS: ZLightKey[] = [
  // in the tunnel out of the snowdrift (under the white cover)
  { z: -880, ...warm, fog: 0x3a2414, fogDensity: 0.014, sunDir: [0.15, 0.8, 0.6], sunColor: 0xffd0a0, sunIntensity: 0.9, hemiSky: 0xf0c080, hemiGround: 0x5a3a20, hemiIntensity: 1.0, exposure: 1.05, bloom: 0.45, saturation: 1.12 },
  // the Foxes' home: warm lamplight, the key light from behind the rider so the rooms read like lit stages
  { z: -902, ...warm, fog: 0x4a2c16, fogDensity: 0.009, sunDir: [0.12, 0.75, 0.65], sunColor: 0xffd8a8, sunIntensity: 1.25, hemiSky: 0xf8d098, hemiGround: 0x6a4424, hemiIntensity: 1.15, exposure: 1.08, bloom: 0.5, saturation: 1.15 },
  { z: -952, ...warm, fog: 0x4a2c16, fogDensity: 0.009, sunDir: [0.12, 0.75, 0.65], sunColor: 0xffd8a8, sunIntensity: 1.25, hemiSky: 0xf8d098, hemiGround: 0x6a4424, hemiIntensity: 1.15, exposure: 1.08, bloom: 0.5, saturation: 1.15 },
  { z: -966, ...warm, fog: 0x3a2414, fogDensity: 0.012, sunDir: [0.12, 0.75, 0.65], sunColor: 0xffc890, sunIntensity: 0.9, hemiSky: 0xf0c080, hemiGround: 0x5a3a20, hemiIntensity: 1.0, exposure: 1.05, bloom: 0.45, saturation: 1.12 },
  { z: -1180, ...warm, fog: 0x3a2414, fogDensity: 0.012, sunDir: [0.12, 0.75, 0.65], sunColor: 0xffc890, sunIntensity: 0.9, hemiSky: 0xf0c080, hemiGround: 0x5a3a20, hemiIntensity: 1.0, exposure: 1.05, bloom: 0.45, saturation: 1.12 },
];

function build(ctx: SetContext): BuiltSet {
  const { road, lights, rng } = ctx;
  const t0 = performance.now();
  const group = new THREE.Group();
  const m = makeMats();
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;

  // ---------------- the home ----------------
  const home = buildHome(road, rng, m);
  group.add(home.statics);
  group.add(rails(road, Z.start + 2, Z.hill.z1 - 4));

  // ---------------- the Foxes ----------------
  const mrFox = makeMrFox();
  mrFox.group.position.copy(home.spots.mrFox);
  group.add(mrFox.group);
  const mrsFox = makeMrsFox();
  mrsFox.group.position.copy(home.spots.mrsFox.pos); mrsFox.group.rotation.y = home.spots.mrsFox.yaw;
  group.add(mrsFox.group);
  const boys = makeAshAndKristofferson();
  boys.group.position.copy(home.spots.boys.pos); boys.group.rotation.y = home.spots.boys.yaw;
  group.add(boys.group);

  // ---------------- lights ----------------
  lights.add({ from: road.u(-892), to: road.u(-934), pos: new THREE.Vector3(0, Y.home + 5, -918), color: 0xffc078, intensity: 26, distance: 30 });
  lights.add({ from: road.u(-926), to: road.u(-962), pos: new THREE.Vector3(0, Y.home + 4.2, -947), color: 0xffc078, intensity: 34, distance: 30 });

  // ---------------- photo subjects ----------------
  const subjects: Subject[] = [];
  const treeAnchor = new THREE.Object3D(); treeAnchor.position.copy(home.spots.tree); group.add(treeAnchor);
  const treeS = new Subject({
    id: 'fox-treehome', name: 'The tree home', from: FILMS.fox, group: treeAnchor, radius: 6, base: 650,
    hint: "The Fox family's home under the great tree, cut open like a dollhouse: kitchen, studio, study, sitting room, and the round green door at the foot of the tree.",
    maxDistance: 120,
    update: (_dt, ride) => { const z = zOf(ride); treeS.active = z < -890 && z > -956; },
  });
  subjects.push(treeS);
  const mrFoxS = new Subject({
    id: 'fox-mrfox', name: 'Mr. Fox', from: FILMS.fox, group: mrFox.group, radius: 1.3, base: 1400, rarity: 'legendary',
    hint: 'On the balcony over the round green door, in his corduroy suit. Whistle for his whistle-and-click; throw him a box and he catches it.',
    poses: { click: { label: 'The whistle-and-click', mult: 1.9 }, catch: { label: 'Caught it!', mult: 1.7 } },
    centerOffset: new THREE.Vector3(0, 1.25, 0), facing: forwardOf(mrFox.group), reactRange: 9, maxDistance: 90, swallows: true,
    onCall: () => { mrFox.whistle(); mrFoxS.setPose('click', 2.6); return true; },
    onItem: () => { mrFox.catchBox(); mrFoxS.setPose('catch', 2.2); return true; },
    update: (_dt, ride) => { const z = zOf(ride); mrFoxS.active = z < -890 && z > -955; },
  });
  subjects.push(mrFoxS);
  const mrsFoxS = new Subject({
    id: 'fox-mrsfox', name: 'Mrs. Fox', from: FILMS.fox, group: mrsFox.group, radius: 1.2, base: 800,
    hint: 'Painting a thunderstorm at her easel, in the studio on the left. Whistle and she turns and lifts her brush.',
    poses: { brush: { label: 'Brush raised', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 1.1, 0), facing: forwardOf(mrsFox.group), maxDistance: 70,
    onCall: () => { mrsFox.greet(); mrsFoxS.setPose('brush', 2.8); return true; },
    update: (_dt, ride) => { const z = zOf(ride); mrsFoxS.active = z < -890 && z > -946; },
  });
  subjects.push(mrsFoxS);
  const boysS = new Subject({
    id: 'fox-boys', name: 'Ash & Kristofferson', from: FILMS.fox, group: boys.group, radius: 1.6, base: 950, rarity: 'rare',
    hint: "Up in the boys' bedroom, cut into the earth on the left: Kristofferson at his karate, Ash in his cape. Whistle for a flying kick; throw a box and Kristofferson catches it.",
    poses: { kick: { label: 'Flying kick', mult: 1.8 }, block: { label: 'Karate catch', mult: 1.6 } },
    centerOffset: new THREE.Vector3(0, 0.9, 0), facing: forwardOf(boys.group), reactRange: 10, maxDistance: 70,
    onCall: () => { boys.kata(); boysS.setPose('kick', 2.4); return true; },
    onItem: () => { boys.catchBox(); boysS.setPose('block', 2.2); return true; },
    update: (_dt, ride) => { const z = zOf(ride); boysS.active = z < -890 && z > -945; },
  });
  subjects.push(boysS);

  // ---------------- the floor for thrown items ----------------
  const floor = (x: number, z: number) => {
    const p = road.at(z);
    if (z <= Z.home.z0 && z > Z.home.z1 && Math.abs(x) > 4.6 && Math.abs(x) < 14) return Y.room;
    return p.y - 0.1;
  };

  const cam = new THREE.Vector3();
  console.warn(`[fox] built in ${Math.round(performance.now() - t0)} ms`);
  return {
    id: 'fox', group, show: showRange(road, R, 12, 6), occluders: home.occluders, subjects, floor, water: Y.cider,
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(cam);
      if (z > -975) {
        mrFox.update(dt, t, cam); mrsFox.update(dt, t, cam); boys.update(dt, t, cam);
        home.fire.color.setRGB(2.0 + Math.sin(t * 7.3) * 0.25 + Math.sin(t * 13.1) * 0.15, 0.9 + Math.sin(t * 5.1) * 0.12, 0.3);
      }
      void clamp;
    },
  };
}

export const FOX: SetModule = {
  build, lights: LIGHTS,
  env: (z) => (z > Z.hill.z0 ? { wind: 0.04, birds: 0, crickets: 0 } : { wind: 0.35, crickets: 0.7 }),
};
