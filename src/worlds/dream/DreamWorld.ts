import * as THREE from 'three';
import type { BuiltWorld, RideState, WorldContext, WorldDef } from '../../game/types';
import { Subject } from '../../game/Subject';
import { makeLighting, type LightKey } from '../../game/lighting';
import { Sky } from '../../engine/Sky';
import { Rng, clamp, damp, lerp, smoothstep } from '../../engine/math';
import { sphere, toon } from '../../engine/Builders';
import { COVERS, SETS, SET_ORDER, makeCurve, makeRoad, mountAtZ, speedAtZ, type MountKind, type SetId } from './layout';
import { FILMS, Lens, LightPool, cue, inZ, type BuiltSet, type ScreenFx, type SetContext } from './common';
import { buildCatbusMount } from './mount';
import { buildGarden } from './sets/garden';
import { buildFields } from './sets/fields';
import { buildForest } from './sets/forest';
import { buildSky } from './sets/sky';
import { buildLaputa } from './sets/laputa';
import { buildMeadow } from './sets/meadow';
import { buildBathhouse } from './sets/bathhouse';
import { buildHaku } from './sets/haku';
import { buildHome } from './sets/home';

/** What the destination board on the Catbus says in each scene (the rider reads it from behind). */
const SIGNS: Record<SetId, string> = {
  garden: 'THE TREE TOP', fields: 'OVER THE FIELDS', forest: 'FOREST SPIRIT', sky: 'THE SKY', laputa: 'LAPUTA',
  meadow: "HOWL'S MEADOW", bathhouse: 'THE BATHHOUSE', haku: 'THE BATHHOUSE', home: 'HOME',
};

/** Stretches (in z) where the mount is off the ground: it banks into turns and floats a little. */
const AIR: Array<[number, number]> = [[-196, -334], [-920, -1298], [-1452, -1562], [-2052, -2480]];
const inAir = (z: number) => AIR.some(([a, b]) => z <= a && z > b);

/** The Catbus's arrival at the start, keyed to the rider's z so speeding up never breaks it. */
const ARRIVE = {
  run0: 59.5, run1: 51.5, grin: 50.8, turn0: 48.6, turn1: 46.2, rise0: 47.2, rise1: 43.2, board: 40,
  curve: new THREE.CubicBezierCurve3(new THREE.Vector3(104, 0, -64), new THREE.Vector3(78, 0, 4), new THREE.Vector3(24, 0, 24), new THREE.Vector3(0, 0, 40)),
};

function build(ctx: WorldContext): BuiltWorld {
  const rng = new Rng(19880416);
  const scene = new THREE.Scene();
  const curve = makeCurve();
  const road = makeRoad(curve);
  const lights = new LightPool(scene, 4);
  const K = (z: number) => road.u(z);

  // ---------- sky, sun, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0x1a2a40, 0.006);
  const sun = new THREE.DirectionalLight(0xb8c8ff, 0.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x4a6aa0, 0x1a2418, 0.9);
  scene.add(hemi);

  // ---------- screen effects: sets ask each frame, the strongest request wins ----------
  const fxState = { flash: 0, flashColor: new THREE.Color(1, 1, 1), wash: 0, washColor: new THREE.Color(1, 1, 1) };
  const fx: ScreenFx = {
    flash(a, c) { if (a > fxState.flash) { fxState.flash = a; fxState.flashColor.set(c ?? 0xffffff); } },
    wash(a, c) { if (a > fxState.wash) { fxState.wash = a; fxState.washColor.set(c ?? 0xffffff); } },
  };

  // ---------- the vehicle: an empty group the ride moves; the Catbus rides in it ----------
  const vehicle = new THREE.Group();
  scene.add(vehicle);
  const mount = buildCatbusMount();
  vehicle.add(mount.root);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.rotation.y = Math.PI;
  vehicle.add(cameraAnchor);
  const lens = new Lens();
  cameraAnchor.add(lens.mesh);

  // ---------- the scenes ----------
  const sctx: SetContext = { rng, road, lights, camera: ctx.camera, lowDetail: ctx.lowDetail, scene, mount, fx };
  const sets: Record<SetId, BuiltSet> = {
    garden: buildGarden(sctx), fields: buildFields(sctx), forest: buildForest(sctx), sky: buildSky(sctx), laputa: buildLaputa(sctx),
    meadow: buildMeadow(sctx), bathhouse: buildBathhouse(sctx), haku: buildHaku(sctx), home: buildHome(sctx),
  };
  const list = SET_ORDER.map((id) => sets[id]);
  for (const s of list) scene.add(s.group);
  const setAt = (z: number) => list.find((s) => inZ(z, SETS[s.id])) ?? (z > SETS.garden.z0 ? sets.garden : sets.home);
  let current: BuiltSet = sets.garden;

  // ---------- the Catbus as a photo subject: when it comes for you, and when it runs off at the end ----------
  const catbusForward = () => new THREE.Vector3(0, 0, 1).applyQuaternion(mount.catbus.group.getWorldQuaternion(new THREE.Quaternion()));
  let kind: MountKind = 'foot';
  const catbusSubject = new Subject({
    id: 'catbus', name: 'The Catbus', from: FILMS.totoro, group: mount.catbus.group, radius: 4.5, base: 1300, rarity: 'legendary',
    hint: 'It comes running across the fields to fetch you at the very start, and runs off home at the very end. Play the ocarina while it waits for you and it grins.',
    poses: { grin: { label: 'Grinning at you', mult: 1.8 }, home: { label: 'Running home', mult: 1.4 } },
    centerOffset: new THREE.Vector3(0, 2.3, 1.2), facing: catbusForward, maxDistance: 180,
    onCall: () => { if (kind !== 'foot' && kind !== 'free') return false; mount.catbus.grin(); catbusSubject.setPose('grin', 3); return true; },
  });
  const subjects: Subject[] = [catbusSubject, ...list.flatMap((s) => s.subjects)];
  const occluders = list.flatMap((s) => s.occluders);

  // ---------- light and colour along the ride ----------
  const NIGHT = { skyTop: 0x081430, skyMid: 0x182c56, skyBottom: 0x2c4a6e, fog: 0x1a2c44, hemiSky: 0x5070a8, hemiGround: 0x1c2618, sunColor: 0xc0d0ff };
  const keys: LightKey[] = [
    // Totoro's garden at midnight: blue-green moonlight, the moon ahead and to the left
    { u: 0, ...NIGHT, fogDensity: 0.0062, sunDir: [-0.38, 0.42, -0.82], sunIntensity: 0.95, hemiIntensity: 0.95, stars: 1, moon: 1, exposure: 1.14, bloom: 0.6, saturation: 1.06, tint: 0xe8f0ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    { u: K(-60), ...NIGHT, fogDensity: 0.0048, sunDir: [-0.38, 0.42, -0.82], sunIntensity: 1.0, hemiIntensity: 0.95, stars: 1, moon: 1, exposure: 1.14, bloom: 0.62, saturation: 1.06, tint: 0xe8f0ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    // above the clouds on the treetop: clearer air, so the sea of cloud and the moon read
    { u: K(-170), ...NIGHT, fog: 0x203658, fogDensity: 0.0026, sunDir: [-0.3, 0.36, -0.88], sunIntensity: 1.1, hemiIntensity: 1.0, stars: 1, moon: 1, exposure: 1.16, bloom: 0.66, saturation: 1.08, tint: 0xe8f0ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.08 },
    { u: K(-232), ...NIGHT, fog: 0x203658, fogDensity: 0.003, sunDir: [-0.3, 0.36, -0.88], sunIntensity: 1.05, hemiIntensity: 1.0, stars: 1, moon: 1, exposure: 1.16, bloom: 0.64, saturation: 1.08, tint: 0xe8f0ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.08 },
    // over the rice fields: the moon on the water
    { u: K(-340), ...NIGHT, fogDensity: 0.0042, sunDir: [-0.25, 0.32, -0.92], sunIntensity: 1.0, hemiIntensity: 1.0, stars: 1, moon: 1, exposure: 1.15, bloom: 0.64, saturation: 1.08, tint: 0xe8f0ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    { u: K(-580), ...NIGHT, fog: 0x1c3240, fogDensity: 0.0052, sunDir: [-0.25, 0.32, -0.92], sunIntensity: 0.9, hemiIntensity: 1.0, stars: 0.9, moon: 0.9, exposure: 1.15, bloom: 0.64, saturation: 1.08, tint: 0xe8f4f0, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    // the Forest Spirit's wood: teal mist before dawn
    { u: K(-640), skyTop: 0x0e2230, skyMid: 0x284a54, skyBottom: 0x5a7a78, fog: 0x2a4a4c, fogDensity: 0.011, sunDir: [-0.2, 0.5, -0.84], sunColor: 0xa8d0d0, sunIntensity: 0.7, hemiSky: 0x5a9a90, hemiGround: 0x1a2a1c, hemiIntensity: 1.05, stars: 0.5, moon: 0.5, exposure: 1.14, bloom: 0.66, saturation: 1.1, tint: 0xe8fff4, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    { u: K(-760), skyTop: 0x16283a, skyMid: 0x3a5a66, skyBottom: 0x8a8a90, fog: 0x3a5a5c, fogDensity: 0.0085, sunDir: [0.3, 0.2, -0.93], sunColor: 0xc0c8d8, sunIntensity: 0.8, hemiSky: 0x6aa098, hemiGround: 0x1e2c20, hemiIntensity: 1.05, stars: 0.25, moon: 0.2, exposure: 1.12, bloom: 0.62, saturation: 1.1, tint: 0xf0fff4, sunGlow: 0.2, sunSize: 0.02, horizonHeight: 0.1 },
    // first light at the spirit pool
    { u: K(-860), skyTop: 0x2a4a6a, skyMid: 0x7a8a9a, skyBottom: 0xe0a8a0, fog: 0x7a8c8c, fogDensity: 0.0075, sunDir: [0.45, 0.08, -0.89], sunColor: 0xffc0a0, sunIntensity: 1.2, hemiSky: 0x9ab8b0, hemiGround: 0x2a3424, hemiIntensity: 1.0, stars: 0, moon: 0, exposure: 1.08, bloom: 0.6, saturation: 1.1, tint: 0xfff4ec, sunGlow: 0.6, sunSize: 0.03, horizonHeight: 0.1 },
    // above the clouds at sunrise, the sun low ahead and to the right
    { u: K(-946), skyTop: 0x4a6ab0, skyMid: 0xe8a8a0, skyBottom: 0xffcc98, fog: 0xf0c0a8, fogDensity: 0.0026, sunDir: [0.5, 0.08, -0.86], sunColor: 0xffb878, sunIntensity: 2.0, hemiSky: 0xc0b8d0, hemiGround: 0x8a6a6a, hemiIntensity: 1.0, exposure: 1.04, bloom: 0.58, saturation: 1.14, tint: 0xfff0e4, sunGlow: 1.2, sunSize: 0.05, horizonHeight: 0.06 },
    { u: K(-1120), skyTop: 0x4a72b8, skyMid: 0xd8b0a8, skyBottom: 0xffd0a0, fog: 0xe8c4b0, fogDensity: 0.0026, sunDir: [0.5, 0.14, -0.85], sunColor: 0xffc080, sunIntensity: 2.0, hemiSky: 0xc0c0d8, hemiGround: 0x8a7070, hemiIntensity: 1.0, exposure: 1.04, bloom: 0.56, saturation: 1.12, tint: 0xfff0e4, sunGlow: 1.0, sunSize: 0.05, horizonHeight: 0.06 },
    // the storm wall darkens everything as it looms
    { u: K(-1205), skyTop: 0x3a4a6a, skyMid: 0x6a7080, skyBottom: 0x8a8a90, fog: 0x5a6070, fogDensity: 0.004, sunDir: [0.5, 0.2, -0.84], sunColor: 0xd0c0b0, sunIntensity: 1.0, hemiSky: 0x8a90a0, hemiGround: 0x4a4a50, hemiIntensity: 1.0, exposure: 1.0, bloom: 0.55, saturation: 1.0, tint: 0xf4f4f8, sunGlow: 0.2, sunSize: 0.03, horizonHeight: 0.06 },
    // Laputa in the calm eye: clear morning blue
    { u: K(-1252), skyTop: 0x2a66d0, skyMid: 0x8ec0ee, skyBottom: 0xe4eef0, fog: 0xc8dcea, fogDensity: 0.0026, sunDir: [0.45, 0.62, -0.5], sunColor: 0xfff0d8, sunIntensity: 2.3, hemiSky: 0xbcdcff, hemiGround: 0x6a7a58, hemiIntensity: 0.85, exposure: 1.0, bloom: 0.36, saturation: 1.12, tint: 0xffffff, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.06, cloudShadow: 0.25 },
    { u: K(-1470), skyTop: 0x2a66d0, skyMid: 0x8ec0ee, skyBottom: 0xe4eef0, fog: 0xc8dcea, fogDensity: 0.0026, sunDir: [0.45, 0.62, -0.5], sunColor: 0xfff0d8, sunIntensity: 2.3, hemiSky: 0xbcdcff, hemiGround: 0x6a7a58, hemiIntensity: 0.85, exposure: 1.0, bloom: 0.36, saturation: 1.12, tint: 0xffffff, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.06, cloudShadow: 0.25 },
    // Howl's meadow at golden hour, the sun ahead and to the left
    { u: K(-1530), skyTop: 0x3a78c8, skyMid: 0xa8d0e8, skyBottom: 0xffe2b4, fog: 0xead8b8, fogDensity: 0.0022, sunDir: [-0.55, 0.28, -0.79], sunColor: 0xffd090, sunIntensity: 2.2, hemiSky: 0xc8e0e8, hemiGround: 0x6a7a40, hemiIntensity: 0.9, exposure: 1.0, bloom: 0.44, saturation: 1.14, tint: 0xfff4e0, sunGlow: 0.9, sunSize: 0.04, horizonHeight: 0.08, cloudShadow: 0.3 },
    { u: K(-1740), skyTop: 0x3a70c0, skyMid: 0xb8c8d8, skyBottom: 0xffd09a, fog: 0xe8c8a0, fogDensity: 0.0024, sunDir: [-0.55, 0.2, -0.81], sunColor: 0xffc070, sunIntensity: 2.1, hemiSky: 0xc8d8e0, hemiGround: 0x6a6a40, hemiIntensity: 0.9, exposure: 1.0, bloom: 0.46, saturation: 1.14, tint: 0xfff0dc, sunGlow: 1.0, sunSize: 0.045, horizonHeight: 0.08, cloudShadow: 0.25 },
    // inside the castle the light outside goes to dusk, so the far side of the door opens on evening
    { u: K(-1792), skyTop: 0x1c1c44, skyMid: 0x6a4070, skyBottom: 0xf08850, fog: 0x7a4a5a, fogDensity: 0.0036, sunDir: [0.25, 0.05, -0.97], sunColor: 0xff8848, sunIntensity: 1.2, hemiSky: 0x9a7aa0, hemiGround: 0x3a2420, hemiIntensity: 0.95, exposure: 1.06, bloom: 0.66, saturation: 1.12, tint: 0xfff0e4, sunGlow: 1.1, sunSize: 0.05, horizonHeight: 0.08 },
    // the bathhouse: dusk, then night falls as the lanterns come on
    { u: K(-1880), skyTop: 0x101436, skyMid: 0x3a2c5a, skyBottom: 0xb05a48, fog: 0x4a3446, fogDensity: 0.004, sunDir: [0.25, 0.0, -0.97], sunColor: 0xff7040, sunIntensity: 0.5, hemiSky: 0x6a6aa0, hemiGround: 0x2a1a1a, hemiIntensity: 1.0, stars: 0.5, exposure: 1.1, bloom: 0.72, saturation: 1.12, tint: 0xfff0e4, sunGlow: 0.5, sunSize: 0.03, horizonHeight: 0.08 },
    // the boiler room: deep under the bathhouse, lit by the furnace
    { u: K(-1985), skyTop: 0x080a20, skyMid: 0x141838, skyBottom: 0x2a2a4a, fog: 0x2a1a12, fogDensity: 0.006, sunDir: [-0.2, 0.5, -0.84], sunColor: 0x9aa8d0, sunIntensity: 0.3, hemiSky: 0x8a6a50, hemiGround: 0x2a1810, hemiIntensity: 1.0, stars: 0.8, moon: 0.8, exposure: 1.1, bloom: 0.72, saturation: 1.12, tint: 0xfff0e0, sunGlow: 0, sunSize: 0, horizonHeight: 0.08 },
    // on Haku's back over the night sea, the moon ahead
    { u: K(-2070), skyTop: 0x060a26, skyMid: 0x14204a, skyBottom: 0x2c3c6c, fog: 0x162244, fogDensity: 0.0032, sunDir: [-0.2, 0.34, -0.92], sunColor: 0xb8caf0, sunIntensity: 1.05, hemiSky: 0x4a5c94, hemiGround: 0x141a30, hemiIntensity: 1.0, stars: 1, moon: 1, exposure: 1.14, bloom: 0.66, saturation: 1.06, tint: 0xeef2ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.08 },
    { u: K(-2330), skyTop: 0x060a26, skyMid: 0x182654, skyBottom: 0x3a4a7a, fog: 0x1c2a50, fogDensity: 0.0028, sunDir: [-0.2, 0.34, -0.92], sunColor: 0xb8caf0, sunIntensity: 1.05, hemiSky: 0x4a5c94, hemiGround: 0x141a30, hemiIntensity: 1.0, stars: 1, moon: 1, exposure: 1.16, bloom: 0.7, saturation: 1.06, tint: 0xeef2ff, sunGlow: 0, sunSize: 0, horizonHeight: 0.08 },
    // home at dawn: peach and gold, the sun rising ahead and to the right
    { u: K(-2412), skyTop: 0x6a9ad0, skyMid: 0xf6d0b4, skyBottom: 0xffe0b8, fog: 0xf0d8c4, fogDensity: 0.003, sunDir: [0.55, 0.1, -0.83], sunColor: 0xffc890, sunIntensity: 2.0, hemiSky: 0xd0e0e8, hemiGround: 0x6a7a4a, hemiIntensity: 1.0, exposure: 1.02, bloom: 0.52, saturation: 1.14, tint: 0xfff4e4, sunGlow: 1.1, sunSize: 0.05, horizonHeight: 0.08 },
    { u: 1, skyTop: 0x6aa0d4, skyMid: 0xf6dcc0, skyBottom: 0xffe4c0, fog: 0xf0dcc8, fogDensity: 0.0024, sunDir: [0.55, 0.14, -0.82], sunColor: 0xffd098, sunIntensity: 2.0, hemiSky: 0xd0e0e8, hemiGround: 0x6a7a4a, hemiIntensity: 1.0, exposure: 1.02, bloom: 0.5, saturation: 1.14, tint: 0xfff4e4, sunGlow: 1.0, sunSize: 0.05, horizonHeight: 0.08, cloudShadow: 0.2 },
  ];
  const lighting = makeLighting(keys);

  // ---------- per-frame state ----------
  const ridePos = new THREE.Vector3(), lastPos = new THREE.Vector3();
  let havePos = false;
  const tan = new THREE.Vector3(), prevTan = new THREE.Vector3(0, 0, -1);
  let bank = 0, grinDone = false, freeT = -1;
  const mInv = new THREE.Matrix4(), mW = new THREE.Matrix4(), qW = new THREE.Quaternion(), pW = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0), xAxis = new THREE.Vector3(1, 0, 0);
  const camPos = new THREE.Vector3(), lookPick = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  let lookT = 0, lookHave = false;
  const runOff = new THREE.CubicBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());

  /** Put the Catbus at a world position and heading, whatever the vehicle is doing. */
  const placeCatbusWorld = (p: THREE.Vector3, yaw: number) => {
    vehicle.updateMatrixWorld(true);
    mInv.copy(vehicle.matrixWorld).invert();
    mW.compose(p, qW.setFromAxisAngle(yAxis, yaw), one).premultiply(mInv);
    mW.decompose(mount.root.position, mount.root.quaternion, pW);
  };

  /** The Catbus's head turns towards the most interesting subject nearby, re-picked twice a second. */
  const pickLook = (dt: number) => {
    lookT -= dt;
    if (lookT > 0) return;
    lookT = 0.5;
    ctx.camera.getWorldPosition(camPos);
    let best = 0;
    lookHave = false;
    for (const s of subjects) {
      if (!s.active || s === catbusSubject) continue;
      s.center(lookPick);
      const d = lookPick.distanceTo(camPos);
      if (d > 70 || d < 4) continue;
      const ahead = lookPick.clone().sub(camPos).normalize().dot(tan);
      if (ahead < 0.2) continue;
      const score = (s.base / 1000) * (1 - d / 70) * (s.pose !== 'idle' ? 1.6 : 1);
      if (score > best) { best = score; lookTarget.copy(lookPick); lookHave = true; }
    }
  };

  const world: BuiltWorld = {
    scene, curve, speed: 12, vehicle, cameraAnchor, subjects, occluders, sky, sun, hemi, lighting,
    get waterLevel() { return current.water; },
    groundHeight: (x, z) => current.floor(x, z),
    speedAt: (u) => speedAtZ(curve.getPointAt(clamp(u, 0, 1)).z),
    makeProjectile: () => {
      // an acorn: a nut with a little cap
      const g = new THREE.Group();
      const nut = sphere(0.13, toon(0x9a6a3a), 0, 0, 0, 10, 8);
      nut.scale.set(1, 1.25, 1);
      const cap = sphere(0.14, toon(0x5a4028), 0, 0.12, 0, 10, 6);
      cap.scale.set(1, 0.55, 1);
      g.add(nut, cap);
      return g;
    },
    ambience: {
      root: 60, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], padWave: 'triangle', padLevel: 0.05,
      melody: 'musicbox', melodyInterval: 1.5, melodyDensity: 0.6, melodyLevel: 0.15, chordSeconds: 8, vehicle: 'none',
    },
    env(u) {
      const z = curve.getPointAt(clamp(u, 0, 1)).z;
      const w = (a: number, b: number, c: number, d: number) => (z > a || z < d ? 0 : z > b ? smoothstep(a, b, z) : z > c ? 1 : 1 - smoothstep(c, d, z));
      const night = w(70, 60, -600, -640) + 0.6 * w(-1950, -1990, -2380, -2400);
      const air = w(-200, -230, -330, -350) + w(-930, -950, -1190, -1210) + w(-2090, -2110, -2380, -2400);
      const storm = w(-1180, -1205, -1236, -1252);
      const birds = 0.25 * w(-840, -880, -900, -920) + 0.45 * w(-1250, -1270, -1500, -1510) + 0.5 * w(-1520, -1540, -1745, -1760) + 0.55 * w(-2420, -2450, -2700, -2720);
      return {
        wind: 0.1 + 0.4 * air + 0.9 * storm + 0.15 * w(-1250, -1260, -1460, -1470),
        rain: 0.8 * storm,
        sea: 0.12 * w(-750, -770, -860, -870) + 0.15 * w(-1630, -1645, -1710, -1720) + 0.3 * w(-2100, -2120, -2290, -2300),
        birds,
        crickets: 0.32 * night,
      };
    },
    captions: [
      [0.003, "Totoro's garden, at midnight"],
      [K(-40), 'The tree that grew in one night'],
      [K(-178), 'Above the clouds, on the tree top'],
      [K(-262), 'Over the fields on the power lines'],
      [K(-640), "The Forest Spirit's wood, before dawn"],
      [K(-950), 'Above the clouds at sunrise'],
      [K(-1262), "Laputa, inside the Dragon's Nest"],
      [K(-1545), "Howl's meadow"],
      [K(-1806), 'The bathhouse, as the lanterns come on'],
      [K(-2080), "On Haku's back"],
      [K(-2445), 'Home, at dawn'],
    ],
    update(dt, ride) {
      const t = ride.time, u = ride.u, z = ride.position.z;
      fxState.flash = 0; fxState.wash = 0;
      ridePos.copy(ride.position);
      tan.copy(ride.tangent).setY(0).normalize();
      current = setAt(z);
      kind = mountAtZ(z);

      // ---- scenes ----
      for (const s of list) {
        const on = u >= s.show[0] && u <= s.show[1];
        s.group.visible = on;
        if (on) s.update(dt, t, ride);
      }
      lights.update(u, t);
      if (kind !== 'haku' && kind !== 'fall') mount.setSign(SIGNS[current.id]);

      // ---- the Catbus ----
      const cb = mount.catbus;
      const moved = havePos && lastPos.distanceTo(ridePos) < 30 ? lastPos.distanceTo(ridePos) : 0;
      lastPos.copy(ridePos); havePos = true;
      mount.root.visible = kind === 'foot' || kind === 'catbus' || kind === 'free';
      catbusSubject.active = kind === 'foot' || kind === 'free';
      const seat = mount.seat;
      const anchor = cameraAnchor.position;
      if (kind === 'foot') {
        // it comes running in across the field, stops facing you and grins, turns round, and you climb on
        const to = ARRIVE.curve.v3;
        let yaw = 0, running = false, stride = 0;
        if (z > ARRIVE.run1) {
          const k = smoothstep(ARRIVE.run0, ARRIVE.run1, z);
          const e = 1 - (1 - k) * (1 - k);
          const p = ARRIVE.curve.getPointAt(e);
          const dir = ARRIVE.curve.getTangentAt(Math.min(e, 0.999));
          yaw = lerp(Math.atan2(dir.x, dir.z), 0, smoothstep(0.75, 1, e));
          p.y = current.floor(p.x, p.z);
          stride = mount.root.userData.lastP ? (mount.root.userData.lastP as THREE.Vector3).distanceTo(p) : 0;
          mount.root.userData.lastP = p.clone();
          running = k < 0.97;
          placeCatbusWorld(p, yaw);
        } else {
          yaw = Math.PI * smoothstep(ARRIVE.turn0, ARRIVE.turn1, z);
          placeCatbusWorld(pW.set(to.x, road.at(to.z).y, to.z), yaw);
          if (!grinDone && z < ARRIVE.grin) { grinDone = true; cb.grin(); catbusSubject.setPose('grin', 3); }
        }
        if (z > ARRIVE.run0 + 1) grinDone = false;
        cb.running = running;
        cb.stride = stride;
        ctx.camera.getWorldPosition(camPos);
        cb.lookTarget = z < ARRIVE.run1 + 2 && z > ARRIVE.turn0 ? camPos : null;
        const b = smoothstep(ARRIVE.rise0, ARRIVE.rise1, z);
        anchor.set(0, lerp(1.45, seat.y, b), lerp(0, seat.z, smoothstep(ARRIVE.rise0, ARRIVE.board, z)));
        cameraAnchor.rotation.set(0, Math.PI, 0);
        freeT = -1;
      } else if (kind === 'catbus') {
        // the ride keeps the camera nearly level on slopes; tilt the Catbus's body the rest of the way,
        // so its paws stay on a steep branch or a dive points its nose down
        const flat = Math.hypot(ride.tangent.x, ride.tangent.z);
        const extra = Math.atan2(ride.tangent.y, flat) - Math.atan2(ride.tangent.y * 0.35, flat);
        mount.root.position.set(0, 0, 0);
        mount.root.quaternion.setFromAxisAngle(xAxis, -extra * 0.9);
        mount.root.userData.lastP = null;
        cb.running = true;
        cb.stride = moved;
        pickLook(dt);
        cb.lookTarget = lookHave ? lookTarget : null;
        anchor.set(0, seat.y + cb.lift * 0.3 + (current.bump?.(z) ?? 0), seat.z);
        cameraAnchor.rotation.set(0, Math.PI, 0);
        freeT = -1;
      } else if (kind === 'haku') {
        anchor.set(0, 1.25, 0);
        cameraAnchor.rotation.set(0, Math.PI, 0);
      } else if (kind === 'fall') {
        // falling: the view tips down a little and turns slowly
        anchor.set(0, 0, 0);
        const f = smoothstep(-2302, -2330, z);
        cameraAnchor.rotation.set(-0.18 * f + Math.sin(t * 0.4) * 0.03 * f, Math.PI + Math.sin(t * 0.23) * 0.08 * f, Math.sin(t * 0.31) * 0.06 * f, 'YXZ');
      } else {
        // the closing shot: the Catbus runs on ahead and away over the hill; the camera rises behind it
        if (freeT < 0) {
          freeT = 0;
          const p0 = ridePos.clone();
          runOff.v0.copy(p0); runOff.v1.set(p0.x, p0.y, p0.z - 60); runOff.v2.set(p0.x + 26, p0.y + 10, p0.z - 120); runOff.v3.set(p0.x + 70, p0.y + 26, p0.z - 200);
          mount.root.userData.lastP = p0.clone();
        }
        freeT += dt;
        const k = clamp(freeT / 16, 0, 1);
        const e = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
        const p = runOff.getPointAt(e);
        const dir = runOff.getTangentAt(Math.min(e, 0.999));
        cb.running = true;
        cb.stride = (mount.root.userData.lastP as THREE.Vector3).distanceTo(p);
        (mount.root.userData.lastP as THREE.Vector3).copy(p);
        placeCatbusWorld(p, Math.atan2(dir.x, dir.z));
        if (freeT > 1 && freeT < 1 + dt * 1.5) catbusSubject.setPose('home', 6);
        cb.lookTarget = null;
        const c = smoothstep(0, 7, freeT);
        anchor.set(0, seat.y + c * 9, seat.z - c * 7);
        cameraAnchor.rotation.set(-0.16 * c, Math.PI, 0, 'YXZ');
      }
      cb.update(dt, t);

      // ---- banking into turns, floating a little in the air ----
      const turn = dt > 0 ? (prevTan.x * tan.z - prevTan.z * tan.x) / dt : 0;
      prevTan.copy(tan);
      const air = inAir(z);
      const limit = kind === 'haku' ? 0.42 : air ? 0.3 : 0.08;
      bank = damp(bank, clamp(-turn * (air ? 3.2 : 1.2), -limit, limit), 2.5, dt);
      if (air && kind !== 'fall') vehicle.position.y += Math.sin(t * 1.2) * 0.1;
      vehicle.rotateZ(bank);

      // ---- screen covers between scenes, plus whatever the sets asked for ----
      for (const c of COVERS) {
        const k = cue(u, K(c.a), K(c.b), K(c.c), K(c.d));
        if (k > 0) fx.wash(k, c.color);
      }
      lens.set({ iris: 1, flash: fxState.flash, flashColor: fxState.flashColor, wash: fxState.wash, washColor: fxState.washColor });
    },
    onItemLand(pos) { current.onItemLand?.(pos); },
    onCall(_pos, ride) { current.onCall?.(ride); },
    dispose() {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
      });
    },
  };
  return world;
}

export const DreamWorld: WorldDef = {
  id: 'dream',
  title: 'Catbus to Anywhere',
  subtitle: 'Studio Ghibli',
  blurb: "Ride on the Catbus's back through one night of a dream: up the tree that grows in Totoro's garden, along the power lines, through the Forest Spirit's wood, into the storm to Laputa, through Howl's door to the bathhouse, and on Haku's back home by dawn.",
  vehicleName: 'The Catbus',
  itemName: 'acorn',
  callName: 'ocarina',
  callKind: 'ocarina',
  accent: '#e8a040',
  accent2: '#2a4a7a',
  fov: 70,
  build,
};

export type { RideState };
