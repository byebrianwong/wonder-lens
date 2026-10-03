import * as THREE from 'three';
import type { BuiltWorld, WorldContext, WorldDef } from '../../game/types';
import type { Subject } from '../../game/Subject';
import { makeLighting, type LightKey } from '../../game/lighting';
import { Sky } from '../../engine/Sky';
import { Drift } from '../../engine/Particles';
import { Rng, lerp, smoothstep } from '../../engine/math';
import { sphere, toon } from '../../engine/Builders';
import { makeCurve, makeRoad, speedAtZ, SETS } from './layout';
import { Lens, LightPool, cue } from './lens';
import { buildMoped } from './moped';
import { buildStreet } from './sets/street';
import { buildCafe } from './sets/cafe';
import { buildBedroom } from './sets/bedroom';
import { buildRooftops, STEPS } from './sets/rooftops';
import { buildButte } from './sets/butte';
import { buildCanal } from './sets/canal';
import { buildGare } from './sets/gare';
import { buildFinale } from './sets/finale';
import type { BuiltSet } from './common';
import { buildCast } from './cast';

/** A few of the ride's lights, keyed 0..1, for the dev character gallery (morning, café, dusk, blue hour, night, sunrise). */
export const GALLERY_KEYS: LightKey[] = [
  { u: 0, skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0xd8c8a0, fogDensity: 0.0045, sunDir: [-0.55, 0.32, 0.75], sunColor: 0xffd49a, sunIntensity: 1.9, hemiSky: 0xd8dcc0, hemiGround: 0x6a5a3a, hemiIntensity: 1.0, exposure: 1.0, bloom: 0.5, saturation: 1.12, tint: 0xfff0d4, sunGlow: 0.7, sunSize: 0.03 },
  { u: 0.2, skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x5a4020, fogDensity: 0.006, sunDir: [0.75, 0.55, -0.2], sunColor: 0xffd8a0, sunIntensity: 1.5, hemiSky: 0xd8d8a0, hemiGround: 0x6a2a18, hemiIntensity: 0.95, exposure: 0.98, bloom: 0.6, saturation: 1.14, tint: 0xfff4dc },
  { u: 0.4, skyTop: 0x4a6a72, skyMid: 0xf0a878, skyBottom: 0xffc890, fog: 0xe8a880, fogDensity: 0.0026, sunDir: [0.45, 0.1, -0.88], sunColor: 0xffa868, sunIntensity: 2.0, hemiSky: 0xa8b8b0, hemiGround: 0x5a4a3a, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.62, saturation: 1.15, tint: 0xfff0e0, sunGlow: 1.1, sunSize: 0.045 },
  { u: 0.55, skyTop: 0x142838, skyMid: 0x2e5060, skyBottom: 0xc87a58, fog: 0x3a5058, fogDensity: 0.0034, sunDir: [0.3, 0.05, -0.95], sunColor: 0xff8a60, sunIntensity: 0.5, hemiSky: 0x5a8a90, hemiGround: 0x3a2a20, hemiIntensity: 1.05, exposure: 1.04, bloom: 0.66, saturation: 1.12, tint: 0xf4f0e0, stars: 0.4 },
  { u: 0.7, skyTop: 0x0b1f22, skyMid: 0x1e3b3a, skyBottom: 0x2e4c44, fog: 0x1a302c, fogDensity: 0.0055, sunDir: [-0.3, 0.5, -0.8], sunColor: 0x9ab8c8, sunIntensity: 0.4, hemiSky: 0x3d7a74, hemiGround: 0x2a2016, hemiIntensity: 1.0, exposure: 1.08, bloom: 0.7, saturation: 1.18, tint: 0xe8f4e0, stars: 0.9, moon: 0.7, sunGlow: 0, sunSize: 0 },
  { u: 1, skyTop: 0x7ab0b0, skyMid: 0xf6dcc0, skyBottom: 0xffe2b8, fog: 0xf0dcc4, fogDensity: 0.0035, sunDir: [-0.35, 0.18, -0.92], sunColor: 0xffd8a0, sunIntensity: 1.9, hemiSky: 0xd8e4d0, hemiGround: 0x7a6a4a, hemiIntensity: 1.0, exposure: 1.02, bloom: 0.55, saturation: 1.15, tint: 0xfff6e4, sunGlow: 1.0, sunSize: 0.04 },
];

function build(ctx: WorldContext): BuiltWorld {
  const rng = new Rng(20011206);
  const scene = new THREE.Scene();
  const curve = makeCurve();
  const road = makeRoad(curve);
  const lights = new LightPool(scene, 4);
  const sctx = { rng, road, lights, camera: ctx.camera, lowDetail: ctx.lowDetail };

  // ---------- sky, sun, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0xd8c8a0, 0.004);
  const sun = new THREE.DirectionalLight(0xffc070, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xe8d8b0, 0x6a4a30, 1.0);
  scene.add(hemi);

  // ---------- the sets ----------
  const street = buildStreet(sctx);
  const cafe = buildCafe(sctx);
  const bedroom = buildBedroom(sctx);
  const rooftops = buildRooftops(sctx);
  const butte = buildButte(sctx);
  const canal = buildCanal(sctx);
  const gare = buildGare(sctx);
  const finale = buildFinale(sctx);
  const sets: BuiltSet[] = [street, cafe, bedroom, rooftops, butte, canal, gare, finale];
  for (const s of sets) scene.add(s.group);
  const setFor = (z: number) => sets.find((s) => z <= SETS[s.id].z0 && z > SETS[s.id].z1) ?? sets[sets.length - 1];

  // ---------- the moped ----------
  const moped = buildMoped();
  const vehicle = new THREE.Group();
  vehicle.add(moped.group);
  scene.add(vehicle);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.position.set(0, 1.64, -0.42);
  cameraAnchor.rotation.y = Math.PI;
  vehicle.add(cameraAnchor);
  const lens = new Lens();
  cameraAnchor.add(lens.mesh);

  // ---------- particles ----------
  const dust = new Drift({ count: 220, color: 0xffd890, size: 0.16, box: new THREE.Vector3(30, 12, 30), speed: new THREE.Vector3(0.15, 0.05, 0), wobble: 0.35, opacity: 0.7, blending: THREE.AdditiveBlending, seed: 7 });
  scene.add(dust.points);

  const cast = buildCast(scene, road, ctx.camera, { street, cafe, bedroom, rooftops, butte, canal, gare, finale });
  const subjects: Subject[] = [...sets.flatMap((s) => s.subjects), ...cast.subjects];

  // ---------- skipping-stone rings on the canal ----------
  const rings: { m: THREE.Mesh; t: number; life: number }[] = [];
  {
    const geo = new THREE.RingGeometry(0.45, 0.6, 28);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd8f0e0, transparent: true, opacity: 0, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2;
      scene.add(m); rings.push({ m, t: -2, life: 1.3 });
    }
  }
  /** a stone skipping: four rings in a row along `dir`, each a little later and smaller */
  const spawnSkip = (pos: THREE.Vector3, dir: THREE.Vector3, hops = 4, step = 1.9) => {
    let n = 0;
    for (const r of rings) {
      if (r.t > -2) continue;
      r.m.position.set(pos.x + dir.x * n * step, 0.06, pos.z + dir.z * n * step);
      r.t = -n * 0.22; r.life = 1.3 - n * 0.1;
      if (++n >= hops) break;
    }
  };
  const ridePos = new THREE.Vector3();
  const warmLit = new THREE.Color(1.0, 0.86, 0.7), rosyShade = new THREE.Color(0.72, 0.56, 0.62);
  const tan = new THREE.Vector3(), prevTan = new THREE.Vector3(0, 0, -1);
  let bank = 0;
  const occluders = sets.flatMap((s) => s.occluders);

  // ---------- light and colour along the ride ----------
  const K = (z: number) => road.u(z);
  const GRADE = 0xfff0d4;
  const keys: LightKey[] = [
    { u: 0, skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0xd8c8a0, fogDensity: 0.0045, sunDir: [-0.55, 0.32, 0.75], sunColor: 0xffd49a, sunIntensity: 1.9, hemiSky: 0xd8dcc0, hemiGround: 0x6a5a3a, hemiIntensity: 1.0, exposure: 1.0, bloom: 0.5, saturation: 1.12, tint: GRADE, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.12 },
    { u: K(-150), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0xd8c8a0, fogDensity: 0.0045, sunDir: [-0.55, 0.3, 0.78], sunColor: 0xffcc8a, sunIntensity: 1.9, hemiSky: 0xd8dcc0, hemiGround: 0x6a5a3a, hemiIntensity: 1.0, exposure: 1.0, bloom: 0.5, saturation: 1.12, tint: GRADE, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.12 },
    { u: K(-185), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x4a3a20, fogDensity: 0.004, sunDir: [-0.4, 0.3, 0.86], sunColor: 0xffcc8a, sunIntensity: 1.6, hemiSky: 0xffd8a0, hemiGround: 0x5a3a20, hemiIntensity: 1.1, exposure: 1.0, bloom: 0.55, saturation: 1.15, tint: GRADE, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.12 },
    { u: K(-246), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x4a3a20, fogDensity: 0.004, sunDir: [-0.4, 0.3, 0.86], sunColor: 0xffcc8a, sunIntensity: 1.4, hemiSky: 0xffd8a0, hemiGround: 0x5a3a20, hemiIntensity: 1.1, exposure: 1.0, bloom: 0.55, saturation: 1.15, tint: GRADE, sunGlow: 0.7, sunSize: 0.03, horizonHeight: 0.12 },
    // the café: amber light with a green-yellow cast, sun slanting in through the windows on the right
    { u: K(-262), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x5a4020, fogDensity: 0.006, sunDir: [0.75, 0.55, -0.2], sunColor: 0xffd8a0, sunIntensity: 1.5, hemiSky: 0xd8d8a0, hemiGround: 0x6a2a18, hemiIntensity: 0.95, exposure: 0.98, bloom: 0.6, saturation: 1.14, tint: 0xfff4dc, sunGlow: 0.5, sunSize: 0.03, horizonHeight: 0.12 },
    { u: K(-336), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x5a4020, fogDensity: 0.006, sunDir: [0.75, 0.55, -0.2], sunColor: 0xffd8a0, sunIntensity: 1.5, hemiSky: 0xd8d8a0, hemiGround: 0x6a2a18, hemiIntensity: 0.95, exposure: 0.98, bloom: 0.6, saturation: 1.14, tint: 0xfff4dc, sunGlow: 0.5, sunSize: 0.03, horizonHeight: 0.12 },
    // the giant room: hazier, the sun pouring through the giant window
    { u: K(-356), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x7a5a30, fogDensity: 0.006, sunDir: [0.8, 0.45, -0.35], sunColor: 0xffd8a0, sunIntensity: 2.0, hemiSky: 0xd8d0a0, hemiGround: 0x6a2a18, hemiIntensity: 0.9, exposure: 0.98, bloom: 0.6, saturation: 1.12, tint: 0xfff4dc, sunGlow: 0.5, sunSize: 0.03, horizonHeight: 0.12 },
    { u: K(-446), skyTop: 0x6f9a9a, skyMid: 0xd8d4a8, skyBottom: 0xffd49a, fog: 0x7a5a30, fogDensity: 0.006, sunDir: [0.8, 0.45, -0.35], sunColor: 0xffd8a0, sunIntensity: 2.0, hemiSky: 0xd8d0a0, hemiGround: 0x6a2a18, hemiIntensity: 0.9, exposure: 0.98, bloom: 0.6, saturation: 1.12, tint: 0xfff4dc, sunGlow: 0.5, sunSize: 0.03, horizonHeight: 0.12 },
    // Amélie's red bedroom at dusk, the sunset through the open window
    { u: K(-452), skyTop: 0x4a6a6a, skyMid: 0xe89a70, skyBottom: 0xffc080, fog: 0x3a1a14, fogDensity: 0.006, sunDir: [0.05, 0.16, -1], sunColor: 0xff9a60, sunIntensity: 1.5, hemiSky: 0xe8c0a0, hemiGround: 0x7a3a24, hemiIntensity: 1.2, exposure: 1.06, bloom: 0.62, saturation: 1.15, tint: 0xfff0e0, sunGlow: 1.0, sunSize: 0.04, horizonHeight: 0.1 },
    { u: K(-522), skyTop: 0x4a6a6a, skyMid: 0xe89a70, skyBottom: 0xffc080, fog: 0x3a1a14, fogDensity: 0.006, sunDir: [0.05, 0.16, -1], sunColor: 0xff9a60, sunIntensity: 1.5, hemiSky: 0xe8c0a0, hemiGround: 0x7a3a24, hemiIntensity: 1.2, exposure: 1.06, bloom: 0.62, saturation: 1.15, tint: 0xfff0e0, sunGlow: 1.0, sunSize: 0.04, horizonHeight: 0.1 },
    // the flight over the roofs at sunset
    { u: K(-540), skyTop: 0x4a6a72, skyMid: 0xf0a878, skyBottom: 0xffc890, fog: 0xe8a880, fogDensity: 0.0026, sunDir: [0.45, 0.1, -0.88], sunColor: 0xffa868, sunIntensity: 2.0, hemiSky: 0xa8b8b0, hemiGround: 0x5a4a3a, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.62, saturation: 1.15, tint: 0xfff0e0, sunGlow: 1.1, sunSize: 0.045, horizonHeight: 0.1, cloudShadow: 0.2 },
    { u: K(-700), skyTop: 0x3a5a6a, skyMid: 0xe8987a, skyBottom: 0xffb880, fog: 0xd8987a, fogDensity: 0.0026, sunDir: [0.4, 0.06, -0.92], sunColor: 0xff9058, sunIntensity: 1.8, hemiSky: 0x98a8a8, hemiGround: 0x4a3a3a, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.64, saturation: 1.15, tint: 0xfff0e0, sunGlow: 1.2, sunSize: 0.05, horizonHeight: 0.1, cloudShadow: 0.15 },
    // landing at the Sacré-Cœur as the light goes blue
    { u: K(-812), skyTop: 0x1e3a4a, skyMid: 0x4a6a7a, skyBottom: 0xe8906a, fog: 0x5a6a70, fogDensity: 0.0032, sunDir: [0.3, 0.02, -0.95], sunColor: 0xff8a60, sunIntensity: 0.9, hemiSky: 0x7a9aa0, hemiGround: 0x3a2a24, hemiIntensity: 1.0, exposure: 1.02, bloom: 0.66, saturation: 1.12, tint: 0xf4f0e0, stars: 0.15, moon: 0.2, sunGlow: 0.8, sunSize: 0.03, horizonHeight: 0.1 },
    // down the steps at blue hour
    { u: K(-860), skyTop: 0x142838, skyMid: 0x2e5060, skyBottom: 0xc87a58, fog: 0x3a5058, fogDensity: 0.0034, sunDir: [0.3, 0.0, -0.95], sunColor: 0xff8a60, sunIntensity: 0.5, hemiSky: 0x5a8a90, hemiGround: 0x3a2a20, hemiIntensity: 1.05, exposure: 1.04, bloom: 0.66, saturation: 1.12, tint: 0xf4f0e0, stars: 0.4, moon: 0.4, sunGlow: 0.5, sunSize: 0.02, horizonHeight: 0.1 },
    { u: K(-900), skyTop: 0x142838, skyMid: 0x2e5060, skyBottom: 0xa86a50, fog: 0x34484e, fogDensity: 0.0036, sunDir: [0.3, 0.0, -0.95], sunColor: 0xff8a60, sunIntensity: 0.45, hemiSky: 0x5a8a90, hemiGround: 0x3a2a20, hemiIntensity: 1.05, exposure: 1.04, bloom: 0.68, saturation: 1.12, tint: 0xf4f0e0, stars: 0.5, moon: 0.45, sunGlow: 0.4, sunSize: 0.02, horizonHeight: 0.1 },
    // the canal at night: deep greens, the moon, lamps on the water
    { u: K(-914), skyTop: 0x0b1f22, skyMid: 0x1e3b3a, skyBottom: 0x2e4c44, fog: 0x1a302c, fogDensity: 0.0055, sunDir: [-0.3, 0.5, -0.8], sunColor: 0x9ab8c8, sunIntensity: 0.4, hemiSky: 0x3d7a74, hemiGround: 0x2a2016, hemiIntensity: 1.0, exposure: 1.08, bloom: 0.7, saturation: 1.18, tint: 0xe8f4e0, stars: 0.9, moon: 0.7, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    { u: K(-1150), skyTop: 0x0b1f22, skyMid: 0x1e3b3a, skyBottom: 0x2e4c44, fog: 0x1a302c, fogDensity: 0.0055, sunDir: [-0.3, 0.5, -0.8], sunColor: 0x9ab8c8, sunIntensity: 0.4, hemiSky: 0x3d7a74, hemiGround: 0x2a2016, hemiIntensity: 1.0, exposure: 1.08, bloom: 0.7, saturation: 1.18, tint: 0xe8f4e0, stars: 0.9, moon: 0.7, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    // inside the vaulted tunnel
    { u: K(-1170), skyTop: 0x0b1f22, skyMid: 0x1e3b3a, skyBottom: 0x2e4c44, fog: 0x14221e, fogDensity: 0.006, sunDir: [-0.1, 0.9, -0.3], sunColor: 0x9ab8c8, sunIntensity: 0.25, hemiSky: 0x4a7a72, hemiGround: 0x3a2a1a, hemiIntensity: 1.1, exposure: 1.1, bloom: 0.75, saturation: 1.15, tint: 0xe8f4e0, stars: 0.9, moon: 0.7, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    // the station at night, warm under the glass
    { u: K(-1228), skyTop: 0x0b1a26, skyMid: 0x1a3040, skyBottom: 0x2a3a40, fog: 0x2a2418, fogDensity: 0.004, sunDir: [0.2, 0.8, -0.3], sunColor: 0xa8c0d0, sunIntensity: 0.35, hemiSky: 0xd8c8a0, hemiGround: 0x3a2a1a, hemiIntensity: 0.95, exposure: 1.05, bloom: 0.7, saturation: 1.12, tint: 0xfff0dc, stars: 0.8, moon: 0.6, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    { u: K(-1428), skyTop: 0x0b1a26, skyMid: 0x1a3040, skyBottom: 0x2a3a40, fog: 0x2a2418, fogDensity: 0.004, sunDir: [0.2, 0.8, -0.3], sunColor: 0xa8c0d0, sunIntensity: 0.35, hemiSky: 0xd8c8a0, hemiGround: 0x3a2a1a, hemiIntensity: 0.95, exposure: 1.05, bloom: 0.7, saturation: 1.12, tint: 0xfff0dc, stars: 0.8, moon: 0.6, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
    // sunrise over Montmartre, the sun low on the left so the lane is crossed by long light
    { u: K(-1434), skyTop: 0x7ab0b0, skyMid: 0xf2dcc4, skyBottom: 0xffdcb4, fog: 0xead8c4, fogDensity: 0.003, sunDir: [-0.82, 0.24, -0.52], sunColor: 0xffd8a0, sunIntensity: 1.9, hemiSky: 0xd0e0d4, hemiGround: 0x7a6a4a, hemiIntensity: 1.0, exposure: 1.0, bloom: 0.52, saturation: 1.15, tint: 0xfff6e4, sunGlow: 0.6, sunSize: 0.04, horizonHeight: 0.1 },
    { u: K(-1640), skyTop: 0x80b8b8, skyMid: 0xf4e0c8, skyBottom: 0xffe0b8, fog: 0xe8d8c8, fogDensity: 0.0022, sunDir: [-0.8, 0.22, -0.56], sunColor: 0xffdcaa, sunIntensity: 2.0, hemiSky: 0xd0e0d4, hemiGround: 0x7a6a4a, hemiIntensity: 1.0, exposure: 1.0, bloom: 0.52, saturation: 1.15, tint: 0xfff6e4, sunGlow: 0.6, sunSize: 0.045, horizonHeight: 0.1 },
    { u: 1, skyTop: 0x80b8c0, skyMid: 0xf4e2cc, skyBottom: 0xffe4bc, fog: 0xe0d4c8, fogDensity: 0.0009, sunDir: [-0.8, 0.22, -0.56], sunColor: 0xffdcaa, sunIntensity: 2.0, hemiSky: 0xd0e0d4, hemiGround: 0x7a6a4a, hemiIntensity: 1.05, exposure: 1.0, bloom: 0.5, saturation: 1.15, tint: 0xfff6e4, sunGlow: 0.55, sunSize: 0.045, horizonHeight: 0.1 },
  ];
  const lighting = makeLighting(keys);

  const world: BuiltWorld = {
    scene, curve, speed: 9.5, vehicle, cameraAnchor, subjects, occluders, sky, sun, hemi, lighting,
    waterLevel: 0,
    groundHeight: (x, z) => setFor(z).floor(x, z),
    speedAt: (u) => speedAtZ(curve.getPointAt(Math.min(1, Math.max(0, u))).z),
    makeProjectile: () => {
      const g = new THREE.Group();
      const s = sphere(0.15, toon(0x8a8c86), 0, 0, 0, 10, 7);
      s.scale.set(1, 0.42, 0.85);
      g.add(s);
      return g;
    },
    ambience: {
      root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], padWave: 'sawtooth', padLevel: 0.05,
      melody: 'piano', melodyInterval: 0.45, melodyDensity: 0.85, melodyLevel: 0.13, chordSeconds: 5, vehicle: 'moped',
    },
    env(u) {
      const day = 1 - smoothstep(K(-150), K(-180), u);
      const flight = smoothstep(K(-530), K(-545), u) * (1 - smoothstep(K(-800), K(-815), u));
      const water = smoothstep(K(-906), K(-916), u) * (1 - smoothstep(K(-1225), K(-1235), u));
      const night = smoothstep(K(-820), K(-860), u) * (1 - smoothstep(K(-1160), K(-1180), u));
      const morning = smoothstep(K(-1432), K(-1440), u);
      return { wind: 0.12 + 0.4 * flight, sea: 0.22 * water, rain: 0, birds: 0.3 * day + 0.35 * morning, crickets: 0.22 * night };
    },
    captions: [
      [0.004, 'Rue des Trois Frères, one golden morning'],
      [K(-160), 'Au Marché de la Butte'],
      [K(-258), 'The Café des 2 Moulins'],
      [K(-350), 'A crème brûlée, as big as a fountain'],
      [K(-462), "Amélie's room, at dusk"],
      [K(-536), 'Out of the window and over the rooftops'],
      [K(-800), 'The Sacré-Cœur, as the lamps come on'],
      [K(-918), 'The Canal Saint-Martin, by night'],
      [K(-1236), "Gare de l'Est"],
      [K(-1440), 'Montmartre, at sunrise'],
    ],
    update(dt, ride) {
      const t = ride.time, u = ride.u, z = ride.position.z;
      for (const s of sets) {
        const on = u >= s.show[0] && u <= s.show[1];
        s.group.visible = on;
        if (on) s.update(dt, t, ride);
      }
      lights.update(u, t);
      ridePos.copy(ride.position);
      cast.update(dt, t, ride);
      // Amélie's own stones skip out across the canal towards the moped
      if (canal.group.visible && cast.skipThrown()) {
        const from = cast.amelieCanal.group.position.clone();
        const dir = ridePos.clone().sub(from).setY(0).normalize();
        spawnSkip(from.addScaledVector(dir, 3), dir, 6, 2.6);
      }
      for (const r of rings) {
        if (r.t <= -2) continue;
        r.t += dt;
        if (r.t < 0) { r.m.visible = false; continue; }
        const k = r.t / r.life;
        if (k >= 1) { r.t = -2; r.m.visible = false; continue; }
        r.m.visible = true;
        const sc = 0.4 + k * 4.5; r.m.scale.set(sc, sc, 1);
        (r.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k) * (1 - k);
      }
      if (rooftops.group.visible || butte.group.visible) {
        rooftops.clouds.field.update(sky.uniforms, scene.fog as THREE.FogExp2, sun.intensity);
        // sunset clouds glow peach on top and go rosy in their shade
        const cu = rooftops.clouds.field.uniforms;
        cu.uLit.value.lerp(warmLit, 0.35); cu.uShade.value.lerp(rosyShade, 0.3);
      }
      // ---- the moped ----
      moped.bars.rotation.y = Math.sin(t * 1.7) * 0.03 + Math.sin(t * 5.3) * 0.01;
      const spin = (9.5 * ride.speedMult) / 0.32 * dt;
      moped.frontWheel.rotation.x += spin; moped.rearWheel.rotation.x += spin;
      moped.needle.rotation.y = 2.2 - Math.min(1, ride.speedMult / 1.6) * 3.4 + Math.sin(t * 13) * 0.02;
      let bob = Math.sin(t * 38) * 0.004 * ride.speedMult;
      // bumping down the great steps, one jolt a step
      if (z < STEPS.z0 && z > STEPS.z1) {
        const phase = ((STEPS.z0 - z) / ((STEPS.z0 - STEPS.z1) / 52)) * Math.PI;
        bob += Math.abs(Math.sin(phase)) * 0.09;
      }
      // in the air: bank into the turns and float a little
      const flying = (z < SETS.rooftops.z0 - 4 && z > -812) || z < -1652;
      tan.copy(ride.tangent).setY(0).normalize();
      const turn = dt > 0 ? (prevTan.x * tan.z - prevTan.z * tan.x) / dt : 0;
      prevTan.copy(tan);
      bank = THREE.MathUtils.damp(bank, flying ? THREE.MathUtils.clamp(-turn * 3.2, -0.38, 0.38) : 0, 2.5, dt);
      if (flying) bob += Math.sin(t * 1.3) * 0.12;
      vehicle.position.y += bob;
      vehicle.rotateZ(bank);
      // ---- the closing crane shot: the camera rises and pulls back as the moped lifts off over Paris ----
      const crane = smoothstep(-1636, -1704, z);
      cameraAnchor.position.set(0, 1.64 + crane * 12, -0.42 - crane * 16);
      cameraAnchor.rotation.set(-crane * 0.2, Math.PI, 0, 'YXZ');
      // ---- the lens: an iris into the bedroom, a white flash off the carousel, the booth's four flashes and its last bright one ----
      const iris = 1 - cue(u, K(-438), K(-449), K(-455), K(-466));
      const carouselFlash = cue(u, K(-890), K(-903), K(-906), K(-920));
      const booth = gare.group.visible ? gare.flash(u) : 0;
      const outFlash = cue(u, K(-1420), K(-1428), K(-1432), K(-1446));
      lens.set({ iris, flash: Math.max(carouselFlash, booth * 0.9, outFlash), flashColor: carouselFlash > 0.01 ? 0xfff0d0 : 0xffffff });
      const cam = ctx.camera.position;
      const indoor = cafe.group.visible || bedroom.group.visible || street.group.visible && z < -170;
      dust.intensity = indoor ? 1 : 0.45;
      dust.update(dt, t, new THREE.Vector3(cam.x, cam.y + 2, cam.z - 10));
      void lerp;
    },
    onItemLand(pos) {
      // a stone on the canal skips across the water, and wakes Blubber even while he is under the surface
      if (canal.group.visible && pos.y < 0.6) {
        const dir = new THREE.Vector3(pos.x - ridePos.x, 0, pos.z - ridePos.z);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); else dir.normalize();
        spawnSkip(pos, dir);
        const b = cast.blubber.subject;
        if (b.center().distanceTo(pos) < b.reactRange && ridePos.distanceTo(b.center()) < 90) b.active = true;
      }
    },
    onCall(_pos, ride) { cast.call(ride.u); },
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

export const AmelieWorld: WorldDef = {
  id: 'amelie',
  title: 'Montmartre by Moped',
  subtitle: 'Amélie',
  blurb: "Ride Nino's red moped through a dream of Amélie's Paris: into the giant green grocer, through the Café des 2 Moulins, out of her bedroom window over the rooftops, down the steps of the Sacré-Cœur, along the canal at night and into the photo booth at the Gare de l'Est.",
  vehicleName: 'The red moped',
  itemName: 'skipping stone',
  callName: 'accordion',
  callKind: 'accordion',
  accent: '#e0563c',
  accent2: '#2f5d3f',
  fov: 68,
  build,
};
