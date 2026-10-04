import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, forwardOf, showRange, type BuiltSet, type LightSpot, type SetContext, type SetEnv, type SetModule, type ZLightKey } from '../common';
import { buildLand } from '../moonrise/land';
import { buildSummersEnd } from '../moonrise/house';
import { buildCamp } from '../moonrise/camp';
import { buildCove } from '../moonrise/cove';
import { buildStorm } from '../moonrise/storm';
import { CAMP, COVE, HOUSE, LIGHTHOUSE, PY, STORM } from '../moonrise/plan';
import type { Adult } from '../moonrise/figures';

/*
 * Part Five: New Penzance (Moonrise Kingdom), September 1965. The whip pan clears on Summer's End, which
 * parts like a dollhouse for the train; round the lighthouse where Suzy keeps watch; through Camp Ivanhoe;
 * along the cove at Mile 3.25 where Sam and Suzy dance; into the storm, with the flood up to the rails, and on
 * towards St. Jack's until the lightning strikes its steeple. See ../moonrise/plan.ts for the layout.
 */

const R = SETS.moonrise;
const FROM = FILMS.moonrise;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const SUMMER: Omit<ZLightKey, 'z'> = {
  skyTop: 0x5f98c4, skyMid: 0xbcd6dc, skyBottom: 0xf2e0ae, fog: 0xe6dab4, fogDensity: 0.0042,
  sunDir: [0.55, 0.5, 0.3], sunColor: 0xffe4b0, sunIntensity: 2.2, hemiSky: 0xd8e2e0, hemiGround: 0x9a8c4a, hemiIntensity: 0.95,
  exposure: 1.02, bloom: 0.3, saturation: 1.12, sunGlow: 0.6, cloudShadow: 0.35,
};
const GOLDEN: Omit<ZLightKey, 'z'> = {
  ...SUMMER, skyTop: 0x6a92bc, skyMid: 0xd8d0b8, skyBottom: 0xf6d098, fog: 0xecd2a4, sunDir: [0.6, 0.32, 0.25], sunColor: 0xffd090, sunIntensity: 2.1,
  hemiGround: 0xa08a48, saturation: 1.15,
};
const STORMY: Omit<ZLightKey, 'z'> = {
  skyTop: 0x2e3a3a, skyMid: 0x5c6a64, skyBottom: 0x7c8a80, fog: 0x66746c, fogDensity: 0.0105,
  sunDir: [0.3, 0.7, 0.2], sunColor: 0xc4d4c0, sunIntensity: 0.55, hemiSky: 0x8a9a94, hemiGround: 0x34443c, hemiIntensity: 0.8,
  exposure: 0.95, bloom: 0.35, saturation: 0.72, sunGlow: 0, cloudShadow: 0, tint: 0xdce8e0,
};

export const LIGHTS: ZLightKey[] = [
  { z: -1180, ...SUMMER },
  { z: -1300, ...SUMMER },
  { z: -1380, ...GOLDEN },
  { z: -1400, ...GOLDEN },
  { z: -1438, ...STORMY },
  { z: -1500, ...STORMY, fogDensity: 0.012, exposure: 0.9 },
];

const ENV: SetEnv = (z) => {
  const storm = smoothstep(-1400, -1436, z);
  const cove = smoothstep(-1350, -1370, z);
  return {
    wind: 0.2 + 0.75 * storm, sea: 0.25 + 0.35 * cove, rain: storm, birds: 0.6 * (1 - storm), crickets: 0.35 * smoothstep(-1300, -1320, z) * (1 - storm),
  };
};

type SkyU = { topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color }; horizonColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color } };

function build(ctx: SetContext): BuiltSet {
  const { road, lights } = ctx;
  const group = new THREE.Group();

  // ---------- the scenes ----------
  const land = buildLand(road, ctx.lowDetail);
  group.add(land.group);
  const house = buildSummersEnd();
  group.add(...house.halves, house.lighthouse, house.anchor);
  const camp = buildCamp(land.ground);
  group.add(camp.group);
  const cove = buildCove(land.ground);
  group.add(cove.group);
  const storm = buildStorm(land.ground);
  group.add(storm.group);

  // the world's sky and sun, read (never changed) for the sea and the storm clouds
  let sky: SkyU | null = null;
  let sun: THREE.DirectionalLight | null = null;
  ctx.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (!sky && m && m.uniforms?.horizonColor && m.uniforms.topColor) sky = m.uniforms as unknown as SkyU;
    if (!sun && (o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
  });

  // ---------- lights: the two halves' rooms, Suzy's gallery, the campfire on the beach, the lightning ----------
  lights.add({ from: road.u(-1188), to: road.u(-1262), pos: V(-HOUSE.gap - 2.2, PY + 3.0, -1231), color: 0xffd6a0, intensity: 24, distance: 16 });
  lights.add({ from: road.u(-1188), to: road.u(-1262), pos: V(HOUSE.gap + 2.2, PY + 3.0, -1231), color: 0xffd6a0, intensity: 24, distance: 16 });
  lights.add({ from: road.u(-1236), to: road.u(-1306), pos: V(LIGHTHOUSE.x - 3, LIGHTHOUSE.gallery + 2.5, LIGHTHOUSE.z + 3), color: 0xfff0d0, intensity: 16, distance: 12 });
  lights.add({ from: road.u(-1350), to: road.u(-1420), pos: V(COVE.tent.x + 2.6, PY + 0.2, COVE.tent.z + 2.2), color: 0xffa050, intensity: 8, distance: 9, flicker: 1.5 });
  const boltSpot: LightSpot = { from: road.u(-1404), to: road.u(-1510), pos: V(6, 40, -1500), color: 0xdde6ff, intensity: 2400, distance: 220 };
  lights.add(boltSpot);
  lights.boost.set(boltSpot, 0);

  // ---------- subjects ----------
  const subjects: Subject[] = [];
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;
  const S = (spec: ConstructorParameters<typeof Subject>[0]) => { const s = new Subject(spec); subjects.push(s); return s; };
  const sideways = (o: THREE.Object3D, local: THREE.Vector3) => () => local.clone().applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));

  const houseS = S({
    id: 'summers-end', name: "Summer's End", from: FROM, group: house.anchor, radius: 9, base: 650,
    hint: "The Bishops' red house on the point. It parts down the middle like a dollhouse to let the train through: take it while it opens.",
    poses: { opening: { label: 'The dollhouse opens', mult: 1.6 } }, maxDistance: 160,
    update: (_dt, ride) => { const z = zOf(ride); houseS.active = z > -1258; if (house.open > 0.04 && house.open < 0.97) houseS.setPose('opening', 0.3); },
  });
  const suzyS = S({
    id: 'suzy-binoculars', name: 'Suzy with her binoculars', from: FROM, group: house.suzy.group, radius: 1.3, base: 1100, rarity: 'rare',
    hint: 'On the lighthouse gallery at the end of the point, watching the train through her binoculars. Blow the whistle and she lowers them and looks straight at you.',
    poses: { look: { label: 'Suzy looks at you', mult: 1.8 } }, centerOffset: V(0, 1.25, 0), facing: forwardOf(house.suzy.head), maxDistance: 140, reactRange: 60,
    onCall: () => { house.suzy.call(); suzyS.setPose('look', 4.2); return true; },
    update: (_dt, ride) => { suzyS.active = zOf(ride) > -1300; },
  });
  const brosS = S({
    id: 'bishop-boys', name: 'The Bishop boys and the record player', from: FROM, group: house.brothers.group, radius: 1.9, base: 700,
    hint: "Lying on the living-room rug listening to Britten's Young Person's Guide to the Orchestra. Whistle and all three look round; drop a box near them and the record skips.",
    poses: { look: { label: 'All three look round', mult: 1.5 }, skip: { label: 'The record skips', mult: 1.4 } }, centerOffset: V(3.4, 0.45, 0),
    facing: sideways(house.brothers.group, V(1, 0, 0)), maxDistance: 60, reactRange: 10,
    onCall: () => { house.brothers.call(); brosS.setPose('look', 3.4); return true; },
    onItem: () => { house.brothers.skip(); brosS.setPose('skip', 1.6); return true; },
    update: (_dt, ride) => { brosS.active = zOf(ride) > -1262 && house.open > 0.3; },
  });
  const momS = S({
    id: 'mrs-bishop', name: 'Mrs. Bishop and her megaphone', from: FROM, group: house.mother.group, radius: 1.1, base: 800,
    hint: 'On the stairs in the hall, megaphone in hand, as she calls the family to dinner. Blow the whistle and she answers you through it.',
    poses: { megaphone: { label: 'Through the megaphone', mult: 1.7 } }, centerOffset: V(0, 1.55, 0), facing: forwardOf(house.mother.group), maxDistance: 60, reactRange: 30,
    onCall: () => { house.mother.call(); momS.setPose('megaphone', 3.2); return true; },
    update: (_dt, ride) => { momS.active = zOf(ride) > -1262 && house.open > 0.3; },
  });
  const scoutsS = S({
    id: 'khaki-scouts', name: 'The Khaki Scouts of Troop 55', from: FROM, group: camp.troopAnchor, radius: 6, base: 850, crowd: true,
    hint: 'Marching round the flagpole at Camp Ivanhoe while Scout Master Ward looks on. Whistle and they salute you in unison; throw a box among them and Ward calls "Halt!"',
    poses: { salute: { label: 'Salute in unison', mult: 1.8 }, halt: { label: 'Halt!', mult: 1.6 } }, maxDistance: 90, reactRange: 16,
    onCall: () => { camp.salute(); scoutsS.setPose('salute', 3.4); return true; },
    onItem: (pos) => { camp.halt(pos); scoutsS.setPose('halt', 2.6); return true; },
    update: (_dt, ride) => { const z = zOf(ride); scoutsS.active = z < -1240 && z > -1368; },
  });
  const treeAnchor = new THREE.Object3D();
  treeAnchor.position.set(CAMP.treehouse.x, land.ground(CAMP.treehouse.x, CAMP.treehouse.z) + CAMP.treehouse.h + 1.2, CAMP.treehouse.z);
  group.add(treeAnchor);
  const treeS = S({
    id: 'treehouse', name: 'The treehouse', from: FROM, group: treeAnchor, radius: 3.5, base: 700,
    hint: "Camp Ivanhoe's lookout, at an alarming height up one tall pine, with a scout waving the troop's pennant from it.",
    maxDistance: 170,
    update: (_dt, ride) => { const z = zOf(ride); treeS.active = z < -1196 && z > -1372; },
  });
  const danceS = S({
    id: 'sam-suzy', name: 'Sam and Suzy dancing', from: FROM, group: cove.dancers, radius: 1.7, base: 1500, rarity: 'legendary',
    hint: 'On the dune at Mile 3.25 Tidal Inlet, dancing to Françoise Hardy on her battery record player. Blow the whistle for the kiss; throw a box and they stop to look.',
    poses: { dance: { label: 'Le temps de l’amour', mult: 1.3 }, kiss: { label: 'The kiss at Moonrise Kingdom', mult: 2.0 }, caught: { label: 'Caught dancing', mult: 1.5 } },
    centerOffset: V(0, 1.05, 0), facing: () => new THREE.Vector3(1, 0, 0), maxDistance: 90, reactRange: 12,
    onCall: () => { cove.kiss(); danceS.setPose('kiss', 4.4); return true; },
    onItem: (pos) => { cove.look(pos); danceS.setPose('caught', 2.6); return true; },
    update: (_dt, ride) => { const z = zOf(ride); danceS.active = z < -1300 && z > -1440; if (danceS.pose === 'idle') danceS.setPose('dance', 0.2); },
  });
  const steepleS = S({
    id: 'st-jacks', name: "St. Jack's steeple in the storm", from: FROM, group: storm.steeple, radius: 7, base: 800, rarity: 'rare',
    hint: 'The white church at the end of the line, with Sam, Suzy and Captain Sharp out on its belfry in the storm. Catch it as the lightning strikes.',
    poses: { struck: { label: 'Struck by lightning', mult: 2.0 } }, centerOffset: V(0, -9, 0), maxDistance: 220,
    update: (_dt, ride) => { steepleS.active = zOf(ride) < -1396; const b = storm.live(); if (b?.big && b.mesh.visible) steepleS.setPose('struck', 0.4); },
  });
  const boltAnchor = new THREE.Object3D();
  group.add(boltAnchor);
  const boltS = S({
    id: 'lightning', name: 'Lightning over New Penzance', from: FROM, group: boltAnchor, radius: 12, base: 900, rarity: 'rare',
    hint: 'The storm walks in from the sea. Be quick: a bolt lasts a blink.', poses: { strike: { label: 'Caught the bolt', mult: 1.6 } }, maxDistance: 320,
    update: () => { const b = storm.live(); boltS.active = !!b && b.mesh.visible; if (b) { boltAnchor.position.copy(b.at).add(V(0, 18, 0)); boltS.setPose('strike', 0.2); } },
  });
  const ss = storm.social.userData.fig as Adult;
  const socialS = S({
    id: 'social-services', name: 'Social Services', from: FROM, group: storm.social, radius: 1.1, base: 600,
    hint: 'In her navy cape on the jetty, under her umbrella, with the seaplane she came in. Blow the whistle and she gives you the look.',
    poses: { look: { label: 'The look', mult: 1.4 } }, centerOffset: V(0, 1.6, 0), facing: forwardOf(storm.social), maxDistance: 80, reactRange: 40,
    onCall: () => { socialLook = 3.5; socialS.setPose('look', 3.5); return true; },
    update: (_dt, ride) => { const z = zOf(ride); socialS.active = z < -1404 && z > -1490; },
  });
  let socialLook = 0;

  // ---------- per frame ----------
  const camPos = new THREE.Vector3();
  let level = COVE.sea;
  const sections = { houseChars: [house.brothers.group, house.mother.group, house.father.group], camp: [camp.group], cove: [cove.dancers], storm: [storm.trio, storm.social, storm.ark] };
  return {
    id: 'moonrise', group, show: showRange(road, R, -8, 8), occluders: [], subjects,
    floor: (x, z) => {
      // the halves' floors, the camp's platforms and the jetty are close enough to the ground for a box
      if (Math.abs(x) < HOUSE.gap + HOUSE.depth && z < HOUSE.front && z > HOUSE.back) return HOUSE.floors[0];
      return land.grid.sample(x, z);
    },
    get water() { return level; },
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      const fog = ctx.scene.fog as THREE.FogExp2;
      // the flood rises with the storm
      level = COVE.sea + (STORM.flood - COVE.sea) * smoothstep(STORM.z0, STORM.z1, z);
      land.seaMesh.position.y = level;
      land.sea.uniforms.uWaterY.value = level;
      const stormK = smoothstep(-1396, -1436, z);
      if (sky) land.sea.update(t, sky, fog, stormK);
      land.grass.uniforms.uWind.value.set(0.35 + 1.3 * stormK, -0.12 - 0.5 * stormK);
      land.grass.update(t, ctx.camera);

      // sections far behind or far ahead are switched off (each is small, deep in the fog, or out of sight)
      for (const o of sections.houseChars) o.visible = z > -1320;
      camp.group.visible = z < -1222 && z > -1430;
      cove.dancers.visible = z < -1262;
      for (const o of sections.storm) o.visible = z < -1330;

      if (z > -1320) house.update(dt, t, z, camPos);
      if (camp.group.visible) camp.update(dt, t, camPos);
      if (z < -1262) cove.update(dt, t, camPos);
      storm.update(dt, t, z, camPos, level, fog, sky, sun ? (sun as THREE.DirectionalLight).intensity : 1);
      if (z < -1330) {
        socialLook = Math.max(0, socialLook - dt);
        ss.tick(dt, t, socialLook > 0 ? camPos : null, 1);
      }

      // the lightning: a flash on the screen, and the sky's light on everything
      const f = storm.flash;
      if (f > 0) ctx.fx.flash(f >= 1 ? 1.1 : f * 0.55, 0xeef0ff);
      lights.boost.set(boltSpot, f);
      const live = storm.live();
      if (live) boltSpot.pos.copy(live.at).add(V(0, 30, 6));
      // a slow tilt up towards the steeple as the train nears St. Jack's
      ctx.shot.pitch += 0.13 * smoothstep(-1436, -1482, z);
      void clamp;
    },
    onItemLand(pos) {
      // a box anywhere on the parade ground stops the troop
      if (pos.z < CAMP.parade.z0 + 4 && pos.z > CAMP.parade.z1 - 4 && pos.x > CAMP.parade.x0 - 4 && pos.x < CAMP.parade.x1 + 4) camp.halt(pos);
    },
  };
}

export const MOONRISE: SetModule = { build, lights: LIGHTS, env: ENV };
