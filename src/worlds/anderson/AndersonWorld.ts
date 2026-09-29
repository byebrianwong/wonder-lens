import * as THREE from 'three';
import type { BuiltWorld, WorldContext, WorldDef, RideState } from '../../game/types';
import { Subject } from '../../game/Subject';
import { makeLighting, type LightKey } from '../../game/lighting';
import { Sky } from '../../engine/Sky';
import { Drift, Puffs } from '../../engine/Particles';
import { Rng, clamp, damp, fbm, lerp, smoothstep } from '../../engine/math';
import { PathField, buildTerrain, buildDetailedTrack, mergeStatic, cyl, toon, type Placement } from '../../engine/Builders';
import { HeightGrid } from '../../engine/HeightGrid';
import { SeaMaterial } from '../../engine/Water';
import { CumulusField } from '../../engine/Clouds';
import { GrassField } from '../../engine/Grass';
import { ExclusionMask, addGroundDetail, paintedDetailTexture } from '../../engine/Ground';
import { FogCuller } from '../../engine/Culling';
import { SPOTS, buildAlpine, buildForest, buildDesert, buildSea, buildTrees, buildZubrowkaExpress } from './environment';
import { buildGrandBudapest } from './hotel';
import { makeGustaveZero, makeAgatha, makeMrFox, makeKylie, makeSamSuzy, makeScouts, makeAlien, makeUfo, makeBelafonte, makeTeamZissou, makePele, makeJaguarShark, makeDeepSearch, makeFunicular, makeCableCar, makeMendlsVan, makeGulls, makeBirdFlock, makeMendlsBox, makeRoadrunner, makeCarChase, makeSugarCrabs, makeJellyfish } from './characters';

// A dead-straight line: every subject can be framed head-on from the track.
const TRACK_PTS: [number, number, number][] = [
  [0, 8, 60], [0, 8, 0], [0, 7.6, -200], [0, 6.6, -400], [0, 5.6, -600], [0, 4.6, -800], [0, 4.0, -1000], [0, 3.5, -1150],
  [0, 3.0, -1400], [0, 2.4, -1650], [0, 1.6, -1720], [0, 1.4, -1900], [0, 1.4, -2100], [0, 1.6, -2200], [0, 1.6, -2262],
];
const Z0 = 60, LEN = 2322;
/** Ride progress for a z position (the track is monotonic in z). */
const uAt = (z: number) => clamp((Z0 - z) / LEN, 0, 1);
const s01 = (v: number, a: number, b: number) => smoothstep(a, b, v);

/**
 * Lighting along the ride (also used by the dev character gallery). A pink-and-powder-blue alpine morning,
 * the golden afternoon of the autumn wood, Asteroid City's turquoise noon, a soft blue sea, and sundown at
 * the end of the line.
 */
export const LIGHT_KEYS: LightKey[] = [
  { u: 0.0, skyTop: 0x88b2e4, skyMid: 0xf0d0de, skyBottom: 0xfae8ee, fog: 0xefdce6, fogDensity: 0.0024, sunDir: [0.4, 0.72, -0.5], sunColor: 0xfff0e2, sunIntensity: 2.0, hemiSky: 0xd6e2f8, hemiGround: 0xe6d6e2, hemiIntensity: 0.9, exposure: 0.92, bloom: 0.24, saturation: 1.12, sunGlow: 0.35, sunSize: 0.02, cloudShadow: 0.22 },
  { u: 0.22, skyTop: 0x88b2e4, skyMid: 0xf0d0de, skyBottom: 0xfae8ee, fog: 0xefdce6, fogDensity: 0.0024, sunDir: [0.4, 0.72, -0.5], sunColor: 0xfff0e2, sunIntensity: 2.0, hemiSky: 0xd6e2f8, hemiGround: 0xe6d6e2, hemiIntensity: 0.9, exposure: 0.92, bloom: 0.24, saturation: 1.12, sunGlow: 0.35, sunSize: 0.02, cloudShadow: 0.22 },
  { u: 0.31, skyTop: 0x8cb8dc, skyMid: 0xf6d8a4, skyBottom: 0xfbe4bc, fog: 0xf0d6ac, fogDensity: 0.0026, sunDir: [0.6, 0.5, -0.35], sunColor: 0xffdcaa, sunIntensity: 2.1, hemiSky: 0xd6dcec, hemiGround: 0xc8984e, hemiIntensity: 0.85, exposure: 0.95, bloom: 0.28, saturation: 1.18, sunGlow: 0.45, sunSize: 0.024, cloudShadow: 0.3 },
  { u: 0.48, skyTop: 0x8cb8dc, skyMid: 0xf6d8a4, skyBottom: 0xfbe4bc, fog: 0xf0d6ac, fogDensity: 0.0026, sunDir: [0.6, 0.5, -0.35], sunColor: 0xffdcaa, sunIntensity: 2.1, hemiSky: 0xd6dcec, hemiGround: 0xc8984e, hemiIntensity: 0.85, exposure: 0.95, bloom: 0.28, saturation: 1.18, sunGlow: 0.45, sunSize: 0.024, cloudShadow: 0.3 },
  { u: 0.56, skyTop: 0x3ea4c8, skyMid: 0x94d4dc, skyBottom: 0xf8e0c8, fog: 0xf2dac8, fogDensity: 0.0019, sunDir: [0.25, 0.88, -0.3], sunColor: 0xfff4e2, sunIntensity: 2.4, hemiSky: 0xbde4ee, hemiGround: 0xe8c6a8, hemiIntensity: 0.9, exposure: 0.93, bloom: 0.24, saturation: 1.2, sunGlow: 0.3, sunSize: 0.022, cloudShadow: 0.34 },
  { u: 0.72, skyTop: 0x3ea4c8, skyMid: 0x94d4dc, skyBottom: 0xf8e0c8, fog: 0xf2dac8, fogDensity: 0.0019, sunDir: [0.25, 0.88, -0.3], sunColor: 0xfff4e2, sunIntensity: 2.4, hemiSky: 0xbde4ee, hemiGround: 0xe8c6a8, hemiIntensity: 0.9, exposure: 0.93, bloom: 0.24, saturation: 1.2, sunGlow: 0.3, sunSize: 0.022, cloudShadow: 0.34 },
  { u: 0.8, skyTop: 0x6aa6d8, skyMid: 0xc4e0ee, skyBottom: 0xecf2f2, fog: 0xd8e6ec, fogDensity: 0.0022, sunDir: [0.35, 0.66, -0.55], sunColor: 0xfff6ea, sunIntensity: 2.1, hemiSky: 0xc8e2f6, hemiGround: 0x8ab4c8, hemiIntensity: 0.9, exposure: 0.93, bloom: 0.24, saturation: 1.12, sunGlow: 0.35, sunSize: 0.02, cloudShadow: 0.24 },
  { u: 0.88, skyTop: 0x6aa6d8, skyMid: 0xc4e0ee, skyBottom: 0xecf2f2, fog: 0xd8e6ec, fogDensity: 0.0022, sunDir: [0.35, 0.66, -0.55], sunColor: 0xfff6ea, sunIntensity: 2.1, hemiSky: 0xc8e2f6, hemiGround: 0x8ab4c8, hemiIntensity: 0.9, exposure: 0.93, bloom: 0.24, saturation: 1.12, sunGlow: 0.35, sunSize: 0.02, cloudShadow: 0.24 },
  { u: 0.97, skyTop: 0x5a78b8, skyMid: 0xeeb0a0, skyBottom: 0xffd4a0, fog: 0xecc4ac, fogDensity: 0.0024, sunDir: [0.5, 0.16, -0.85], sunColor: 0xffae6a, sunIntensity: 1.7, hemiSky: 0xc4b0d4, hemiGround: 0x9a8ea8, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.42, saturation: 1.15, sunGlow: 0.75, sunSize: 0.03, cloudShadow: 0.1 },
  { u: 1.0, skyTop: 0x5a78b8, skyMid: 0xeeb0a0, skyBottom: 0xffd4a0, fog: 0xecc4ac, fogDensity: 0.0024, sunDir: [0.5, 0.16, -0.85], sunColor: 0xffae6a, sunIntensity: 1.7, hemiSky: 0xc4b0d4, hemiGround: 0x9a8ea8, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.42, saturation: 1.15, sunGlow: 0.75, sunSize: 0.03, cloudShadow: 0.1 },
];

function build(ctx: WorldContext): BuiltWorld {
  const dens = ctx.lowDetail ? 0.55 : 1;
  const scene = new THREE.Scene();
  const curve = new THREE.CatmullRomCurve3(TRACK_PTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal', 0.5);
  curve.arcLengthDivisions = 4000;
  const field = new PathField(curve, 2);
  const near = { dist: 0, y: 0, u: 0, x: 0, z: 0 };
  // the line runs straight down x = 0, so the distance to it is just |x|
  const trackDist = (x: number, _z: number) => Math.abs(x);
  const trackPoint = (z: number) => {
    const u = uAt(z);
    let best = curve.getPointAt(u), bestD = Math.abs(best.z - z);
    for (const du of [-0.01, -0.005, 0.005, 0.01]) { const p = curve.getPointAt(clamp(u + du, 0, 1)); const d = Math.abs(p.z - z); if (d < bestD) { best = p; bestD = d; } }
    return { x: best.x, y: best.y };
  };
  const culler = new FogCuller();

  // ---------- terrain ----------
  const WATER = 0;
  // region blends along z (z decreases along the ride, so smoothstep(a, b, z) with a > b rises as we travel)
  const toForest = (z: number) => smoothstep(-560, -640, z);
  const toDesert = (z: number) => smoothstep(-1110, -1190, z);
  const toSea = (z: number) => smoothstep(-1660, -1720, z);
  // sharp alpine crests: ridged noise, only far out beyond the valley walls
  const ridge = (x: number, z: number) => { const r = 1 - Math.abs(fbm(x * 0.0085 + 11, z * 0.0085 - 4, 4) * 2 - 1); return r * r; };
  const rawHeight = (x: number, z: number) => {
    const f = toForest(z), d = toDesert(z), s = toSea(z);
    const wA = 1 - f, wF = f * (1 - d), wD = d * (1 - s), wS = s;
    const ax = Math.abs(x);
    let h = 0;
    if (wA > 0) {
      // symmetrical mountains on both sides, with a flat shelf carved for the hotel on the left
      let ha = 7.5 + smoothstep(20, 64, ax) * 22 + Math.max(0, ax - 64) * 0.45 + (fbm(x * 0.02, z * 0.02, 3) - 0.45) * 7 * smoothstep(14, 40, ax);
      ha += ridge(x, z) * 90 * smoothstep(110, 240, ax);
      // Gabelmeister's Peak: a summit on the right, levelled on top for the observatory
      const dp = Math.hypot(x - SPOTS.peak.x, z - SPOTS.peak.z);
      ha += 75 * Math.exp(-(dp * dp) / (2 * 34 * 34));
      ha = lerp(ha, SPOTS.peak.y, 1 - smoothstep(9, 15, dp));
      const shelf = (1 - smoothstep(24, 30, Math.abs(x - SPOTS.hotel.x))) * (1 - smoothstep(30, 38, Math.abs(z - SPOTS.hotel.z)));
      ha = lerp(ha, SPOTS.hotel.y, shelf);
      h += wA * ha;
    }
    if (wF > 0) {
      let hf = 4.6 + (fbm(x * 0.012, z * 0.012, 3) - 0.45) * 9 + Math.max(0, ax - 140) * 0.22;
      const dl = Math.hypot(x - SPOTS.lake.x, z - SPOTS.lake.z);
      hf = lerp(SPOTS.lake.bottom, hf, smoothstep(14, 30, dl));
      h += wF * hf;
    }
    if (wD > 0) {
      let hd = 2.8 + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 2.4;
      for (const [mx, mz, r, mh] of SPOTS.mesas) { const dm = Math.hypot(x - mx, z - mz); hd += mh * (1 - smoothstep(r * 0.55, r, dm)); }
      const dc = Math.hypot(x - SPOTS.crater.x, z - SPOTS.crater.z);
      hd += -3.2 * (1 - smoothstep(4, SPOTS.crater.r, dc)) + 1.3 * Math.exp(-Math.pow((dc - SPOTS.crater.r) / 3.5, 2));
      hd += 4 * (1 - smoothstep(10, 24, Math.hypot(x - SPOTS.observatory.x, z - SPOTS.observatory.z)));
      hd += Math.max(0, ax - 240) * 0.12;
      h += wD * hd;
    }
    if (wS > 0) {
      let hs = -6 + (fbm(x * 0.03, z * 0.03, 2) - 0.5) * 1.5;
      const di = Math.hypot(x - SPOTS.island.x, z - SPOTS.island.z);
      hs += 9 * (1 - smoothstep(SPOTS.island.r * 0.5, SPOTS.island.r, di));
      hs += 8.5 * smoothstep(-2150, -2195, z);
      hs += Math.max(0, ax - 260) * 0.2;
      h += wS * hs;
    }
    return h;
  };
  const heightFn = (x: number, z: number) => {
    const n = field.nearest(x, z, near);
    const raw = rawHeight(x, z);
    const s = toSea(z);
    // flatten a corridor under the track; in the sea it is narrower and becomes the causeway
    const corridor = 1 - smoothstep(lerp(5, 4.5, s), lerp(18, 9, s), n.dist);
    return lerp(raw, n.y - 0.45, corridor);
  };
  // sampled once on the terrain's own grid, so everything placed with heightAt sits exactly on the mesh
  const heights = new HeightGrid(-420, 420, -2420, 140, 4, heightFn);
  const heightAt = (x: number, z: number) => heights.sample(x, z);

  // bare earth where people walk: the lane beside the wood, the scouts' trail, the camp and the harbour quay
  const roadMask = new ExclusionMask(-180, 180, -2420, 140, 1);
  const grassMask = new ExclusionMask(-180, 180, -2420, 140, 1);
  const shortMask = new ExclusionMask(-180, 180, -2420, 140, 1);
  {
    roadMask.path([{ x: 9, z: -600 }, { x: 9, z: -1150 }], 4.0);
    roadMask.path([{ x: -9.5, z: -940 }, { x: -9.5, z: -1130 }], 1.8);
    roadMask.path([{ x: -9.5, z: -940 }, { x: -12, z: -915 }, { x: -15, z: -900 }], 1.8);
    roadMask.circle(SPOTS.camp.x, SPOTS.camp.z, 5.5);
    roadMask.circle(SPOTS.foxTree.x - 3.2, SPOTS.foxTree.z, 2.4);
    roadMask.path([{ x: SPOTS.foxTree.x - 3.2, z: SPOTS.foxTree.z }, { x: 11, z: SPOTS.foxTree.z }], 1.6);
    roadMask.path([{ x: SPOTS.tower.x - 2.5, z: SPOTS.tower.z }, { x: 11, z: SPOTS.tower.z }], 1.4);
    roadMask.build(1.2);
    shortMask.circle(SPOTS.camp.x, SPOTS.camp.z, 11);
    // Sam and Suzy's spot at the mile marker, mown so they can be seen from the train
    shortMask.circle(-14, -908, 6);
    shortMask.circle(SPOTS.foxTree.x, SPOTS.foxTree.z, 12);
    shortMask.rect(11, -875, 5, 550, 0, 0);
    shortMask.build(2.5);
  }

  const snow = new THREE.Color(0xfbf6f8), snowShade = new THREE.Color(0xdcd4e8), rockA = new THREE.Color(0xa99aae);
  const ochre = new THREE.Color(0xa88a45), ochre2 = new THREE.Color(0x8a6a36), rockF = new THREE.Color(0x8f7f6a), lakebed = new THREE.Color(0x6f7a58);
  const sand = new THREE.Color(0xf0cdb0), sand2 = new THREE.Color(0xf6dcc8), mesaRock = new THREE.Color(0xd98a70), mesaTop = new THREE.Color(0xe8ae90);
  const seabed = new THREE.Color(0x4f93b0), shoal = new THREE.Color(0xeee0c4), stone = new THREE.Color(0xe0d6c6), harbourLand = new THREE.Color(0xd8cfae), harbourGrass = new THREE.Color(0x8fa860);
  const cA = new THREE.Color(), cF = new THREE.Color(), cD = new THREE.Color(), cS = new THREE.Color();
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(terrainMat, paintedDetailTexture(19320214), { scaleA: 34, scaleB: 9, strength: 0.5, roads: roadMask, roadColor: 0xb89868 });
  const terrain = buildTerrain({
    xMin: -420, xMax: 420, zMin: -2420, zMax: 140, res: 4, chunk: 280,
    height: heightAt,
    material: terrainMat,
    color: (x, z, y, slope, out) => {
      const n = fbm(x * 0.05, z * 0.05, 3);
      const f = toForest(z), d = toDesert(z), s = toSea(z);
      // snow: lilac in the hollows, grey-violet rock where the crests are too steep to hold it
      cA.copy(snow).lerp(snowShade, n * 0.55 + smoothstep(0.2, 0.42, slope) * 0.3).lerp(rockA, smoothstep(0.45, 0.72, slope));
      if (f > 0) {
        // under the golden grass the ground reads as the shadowed base of the blades
        cF.copy(ochre).lerp(ochre2, n).lerp(rockF, smoothstep(0.5, 0.8, slope));
        if (y < SPOTS.lake.level + 0.3 && Math.hypot(x - SPOTS.lake.x, z - SPOTS.lake.z) < 32) cF.copy(lakebed);
      }
      if (d > 0) cD.copy(sand).lerp(sand2, n).lerp(mesaRock, smoothstep(0.3, 0.6, slope)).lerp(mesaTop, smoothstep(14, 20, y) * (1 - smoothstep(0.2, 0.4, slope)));
      if (s > 0) {
        if (y < WATER + 0.4) cS.copy(seabed).lerp(shoal, smoothstep(-5, 0.4, y));
        else cS.copy(harbourLand).lerp(harbourGrass, smoothstep(1.4, 2.4, y) * 0.8).lerp(stone, 1 - smoothstep(4.5, 7, Math.abs(x)));
      }
      out.copy(cA);
      if (f > 0) out.lerp(cF, f);
      if (d > 0) out.lerp(cD, d);
      if (s > 0) out.lerp(cS, s);
    },
  });
  scene.add(terrain);
  culler.addChildren(terrain);

  // water: the sea at the end and the small lake in the wood, both reading the ground for shallows and foam
  const sea = new SeaMaterial(heights, { deep: 0x2d7aa6, shallow: 0x6cc8cc, sand: 0xeee0c4, nightDeep: 0x2a4a78, nightShallow: 0x5a88a8 });
  const seaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1000, 140, 100), sea.material);
  seaMesh.rotation.x = -Math.PI / 2; seaMesh.position.set(0, WATER, -2100); seaMesh.renderOrder = 1;
  scene.add(seaMesh);
  culler.add(seaMesh);
  const lake = new SeaMaterial(heights, { deep: 0x356f7a, shallow: 0x7fb8a6, sand: 0x8a8058, waterY: SPOTS.lake.level });
  lake.uniforms.uFoam.value = 0.5;
  const lakeMesh = new THREE.Mesh(new THREE.CircleGeometry(31, 48), lake.material);
  lakeMesh.rotation.x = -Math.PI / 2; lakeMesh.position.set(SPOTS.lake.x, SPOTS.lake.level, SPOTS.lake.z); lakeMesh.renderOrder = 1;
  scene.add(lakeMesh);
  culler.add(lakeMesh);

  // track: a gravel bed, textured sleepers and shaped rails
  scene.add(buildDetailedTrack(curve, { gauge: 1.5 }));

  // ---------- sky, lights, fog ----------
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  scene.fog = new THREE.FogExp2(0xf1e3ea, 0.0024);
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20; sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xd8e8f8, 0xe8d8dc, 1.0);
  scene.add(hemi);
  // tidy clouds, set out in mirrored pairs either side of the line
  const cloudPl: Placement[] = [];
  {
    const crng = new Rng(1932);
    for (let i = 0; i < 22; i++) {
      const far = crng.chance(0.7);
      const x = far ? crng.range(220, 560) : crng.range(60, 200), y = far ? crng.range(60, 120) : crng.range(120, 170);
      const z = -2500 + (i + crng.range(0.2, 0.8)) * (2700 / 22), sc = far ? crng.range(2.6, 4.8) : crng.range(1.4, 2.4), rot = crng.range(-0.3, 0.3);
      cloudPl.push({ x, y, z, scale: sc, rot }, { x: -x, y, z, scale: sc, rot: Math.PI - rot });
    }
  }
  const clouds = new CumulusField(new Rng(1933), cloudPl);
  scene.add(clouds.group);

  // ---------- places ----------
  const alps = buildAlpine(heightAt, trackPoint, grassMask);
  scene.add(alps.group);
  const hotel = buildGrandBudapest();
  hotel.position.set(SPOTS.hotel.x, SPOTS.hotel.y + 1.0, SPOTS.hotel.z);
  hotel.rotation.y = Math.PI / 2;
  scene.add(hotel);
  culler.add(hotel);
  const forest = buildForest(heightAt, grassMask);
  scene.add(forest.group);
  const desert = buildDesert(heightAt, grassMask);
  scene.add(desert.group);
  const shore = buildSea(heightAt, trackPoint, grassMask);
  scene.add(shore.group);
  for (const r of [alps.group, forest.group, desert.group, shore.group]) culler.addChildren(r);
  const trees = buildTrees(heightAt, trackDist, dens, (x, z) => grassMask.at(x, z) < 0.5);
  scene.add(trees);
  for (const f of trees.children) culler.addChildren(f, 4);
  // warm light spilling from the hotel lobby
  {
    const pl = new THREE.PointLight(0xffe0b0, 30, 50, 1.5);
    pl.position.set(SPOTS.hotel.x + 11, SPOTS.hotel.y + 4, SPOTS.hotel.z);
    scene.add(pl);
  }

  // ---------- grass: a golden meadow through the wood, short green turf on the harbour front ----------
  const gold = new THREE.Color(0xc9a24a), amber = new THREE.Color(0xb8843a), sage = new THREE.Color(0x9a9a4a), rust = new THREE.Color(0xb86a3a);
  const turf = new THREE.Color(0x86a852), turfDark = new THREE.Color(0x5f8a44);
  const grassCol = (x: number, z: number, out: THREE.Color) => {
    if (z < -1900) {
      out.copy(turf).lerp(turfDark, smoothstep(0.35, 0.7, fbm(x * 0.05, z * 0.05, 2)));
      return out;
    }
    out.copy(gold).lerp(amber, smoothstep(0.3, 0.75, fbm(x * 0.018, z * 0.018, 3)));
    out.lerp(sage, smoothstep(0.5, 0.8, fbm(x * 0.05 + 31, z * 0.05 - 12, 2)) * 0.5);
    out.lerp(rust, smoothstep(0.62, 0.85, fbm(x * 0.03 - 7, z * 0.03, 2)) * 0.35);
    return out;
  };
  const grassDensity = (x: number, z: number, y: number, slope: number) => {
    let d: number;
    if (z < -1900) d = s01(y, 1.3, 2.2) * smoothstep(6.5, 8.5, Math.abs(x)) * (z < -2150 ? 1 : 0);
    else d = toForest(z) * (1 - toDesert(z)) * smoothstep(3.0, 4.2, Math.abs(x));
    if (d <= 0) return 0;
    if (Math.hypot(x - SPOTS.lake.x, z - SPOTS.lake.z) < 34 && y < SPOTS.lake.level + 0.35) return 0;
    d *= 1 - smoothstep(0.25, 0.45, slope);
    d *= 0.6 + 0.4 * smoothstep(0.3, 0.55, fbm(x * 0.05 - 3, z * 0.05 + 9, 2));
    return d * grassMask.at(x, z) * roadMask.at(x, z);
  };
  const tmpCol = new THREE.Color();
  const grassRows = (z: number): [number, number] | null => (z > -1180 && z < -580) || z < -2130 ? [-150, 150] : null;
  const grass = new GrassField({
    heights, xMin: -180, xMax: 180, zMin: -2420, zMax: -560, res: 1,
    bladesPerM2: ctx.lowDetail ? 14 : 28, radius: ctx.lowDetail ? 70 : 100,
    rowRange: grassRows,
    sample: (x, z, out) => {
      const y = heightAt(x, z);
      const d = grassDensity(x, z, y, heights.slope(x, z));
      out.density = d;
      if (d <= 0) return;
      grassCol(x, z, tmpCol);
      out.r = tmpCol.r; out.g = tmpCol.g; out.b = tmpCol.b;
      const tall = z < -1900 ? 0.55 : lerp(0.95, 1.45, smoothstep(0.35, 0.7, fbm(x * 0.03 + 50, z * 0.03, 2)));
      // a mown verge along the line, so people by the track are not lost in the meadow
      out.height = tall * lerp(0.4, 1, shortMask.at(x, z)) * lerp(0.42, 1, smoothstep(5, 15, Math.abs(x)));
    },
  });
  scene.add(grass.group);

  // ---------- vehicle ----------
  const train = buildZubrowkaExpress();
  const vehicle = train.group;
  scene.add(vehicle);
  const cameraAnchor = new THREE.Object3D();
  cameraAnchor.position.set(0, 2.35, 1.9);
  cameraAnchor.rotation.y = Math.PI; // camera looks down its -z; the vehicle's front is +z
  vehicle.add(cameraAnchor);

  // ---------- characters & subjects ----------
  const tmpV = new THREE.Vector3();
  const subjects: Subject[] = [];
  const updaters: Array<(dt: number, t: number, ride: RideState) => void> = [];
  const fwd = (g: THREE.Object3D) => () => new THREE.Vector3(0, 0, 1).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()));
  const anchor = (x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x, y, z); scene.add(o); return o; };
  const span = (subject: Subject, group: THREE.Object3D | null, z0: number, z1: number) => {
    const u0 = uAt(z0), u1 = uAt(z1);
    return (ride: RideState) => { const a = ride.u >= u0 && ride.u <= u1; subject.active = a; if (group) group.visible = a; return a; };
  };

  // --- alps ---
  subjects.push(new Subject({ id: 'hotel', name: 'The Grand Budapest Hotel', from: 'The Grand Budapest Hotel', group: anchor(SPOTS.hotel.x, SPOTS.hotel.y + 20, SPOTS.hotel.z), radius: 26, base: 900, hint: 'Pink, tiered and perfectly symmetrical, on the cliff to the left after Nebelsbad.', maxDistance: 520 }));

  const funicular = makeFunicular(alps.funicularBottom, alps.funicularTop);
  scene.add(funicular.group);
  culler.add(funicular.group, 3);
  {
    // trestle posts where the rail leaves the ground, merged
    const posts = new THREE.Group();
    const postMat = toon(0x8a7a6a);
    const dir = alps.funicularTop.clone().sub(alps.funicularBottom);
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    for (let k = 1; k < 10; k++) {
      const p = alps.funicularBottom.clone().lerp(alps.funicularTop, k / 10);
      for (const s of [-1.4, 1.4]) {
        const x = p.x + side.x * s, z = p.z + side.z * s;
        const gy = heightAt(x, z), h = p.y - 0.3 - gy;
        if (h < 0.6) continue;
        posts.add(cyl(0.12, 0.16, h, postMat, x, gy + h / 2, z, 6));
      }
    }
    posts.traverse((c) => { c.castShadow = true; });
    scene.add(mergeStatic(posts));
    culler.add(posts);
  }
  const funicularSubject = new Subject({
    id: 'funicular', name: 'The funicular', from: 'The Grand Budapest Hotel', group: funicular.carA, radius: 1.8, base: 500,
    hint: 'Two little cars counterbalanced on a slanted rail up to the hotel. Whistle and the bell rings.',
    poses: { ring: { label: 'Bell rung', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), maxDistance: 160,
    onCall: () => { funicular.ring(); funicularSubject.setPose('ring', 2.5); return true; },
  });
  subjects.push(funicularSubject);
  const funWin = span(funicularSubject, null, 60, -520);
  updaters.push((dt, t, ride) => { if (funWin(ride)) funicular.update(dt, t); });

  const gustave = makeGustaveZero();
  gustave.group.position.copy(alps.gustaveSpot);
  gustave.group.rotation.y = Math.PI / 2;
  scene.add(gustave.group);
  const gustaveSubject = new Subject({
    id: 'gustave', name: 'M. Gustave & Zero', from: 'The Grand Budapest Hotel', group: gustave.group, radius: 1.6, base: 1400, rarity: 'legendary',
    hint: 'Concierge and lobby boy on the red steps of the funicular pavilion, left of the track. Whistle for a bow; throw a box and he will take it.',
    poses: { bow: { label: 'A perfect bow', mult: 1.9 }, finger: { label: 'Take the box', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(gustave.group),
    onCall: () => { gustave.bow(); gustaveSubject.setPose('bow', 2.6); return true; },
    onItem: () => { gustave.finger(); gustaveSubject.setPose('finger', 2.8); return true; }, reactRange: 16, maxDistance: 120,
  });
  subjects.push(gustaveSubject);
  const gusWin = span(gustaveSubject, gustave.group, 60, -560);
  updaters.push((dt, t, ride) => { if (!gusWin(ride)) return; gustave.setLook(Math.abs(ride.position.z - SPOTS.pavilion.z) < 60 ? ride.position : null); gustave.update(dt, t); });

  // "Boy with Apple" on its easel beside them
  subjects.push(new Subject({
    id: 'boywithapple', name: 'Boy with Apple', from: 'The Grand Budapest Hotel', group: alps.painting, radius: 0.8, base: 650, rarity: 'rare',
    hint: 'The priceless painting, propped on an easel at the top of the pavilion steps.', centerOffset: new THREE.Vector3(0, 1.35, 0), facing: fwd(alps.painting), maxDistance: 70,
  }));

  const agatha = makeAgatha();
  agatha.group.position.copy(alps.agathaSpot);
  agatha.group.rotation.y = -Math.PI / 2;
  scene.add(agatha.group);
  const agathaSubject = new Subject({
    id: 'agatha', name: 'Agatha', from: 'The Grand Budapest Hotel', group: agatha.group, radius: 1.2, base: 800, rarity: 'rare',
    hint: "On the right platform at Nebelsbad with a Mendl's box. Throw her one and she catches it.",
    poses: { catch: { label: 'Courtesan au chocolat', mult: 1.8 }, present: { label: "Mendl's, of course", mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 1.0, 0), facing: fwd(agatha.group),
    onItem: () => { agatha.catchBox(); agathaSubject.setPose('catch', 2.4); return true; },
    onCall: () => { agatha.lift(); agathaSubject.setPose('present', 2.2); return true; }, reactRange: 14, maxDistance: 110,
  });
  subjects.push(agathaSubject);
  const agWin = span(agathaSubject, agatha.group, 60, -260);
  updaters.push((dt, t, ride) => { if (agWin(ride)) agatha.update(dt, t); });

  subjects.push(new Subject({
    id: 'luggage', name: 'The Whitman luggage', from: 'The Darjeeling Limited', group: alps.luggage, radius: 1.2, base: 450,
    hint: 'Eleven pieces with animals painted on brown leather, monogrammed JLW, stacked on a trolley on the left platform at Nebelsbad.', centerOffset: new THREE.Vector3(0, 1.1, 0), maxDistance: 70,
  }));

  const vans = alps.vanSpots.map((s) => { const v = makeMendlsVan(); v.group.position.set(s.x, heightAt(s.x, s.z), s.z); v.group.rotation.y = s.rot; scene.add(v.group); culler.add(v.group, 1); return v; });
  const vanSubject = new Subject({
    id: 'van', name: "Mendl's delivery van", from: 'The Grand Budapest Hotel', group: vans[0].group, radius: 2.6, base: 350,
    hint: 'A pink van, one parked on each side of the station forecourt. Whistle and the lights flash.',
    poses: { flash: { label: 'Headlights', mult: 1.3 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), maxDistance: 100,
    onCall: () => { for (const v of vans) v.flash(); vanSubject.setPose('flash', 1.6); return true; },
  });
  subjects.push(vanSubject);
  const vanWin = span(vanSubject, null, 60, -300);
  updaters.push((dt, t, ride) => { if (vanWin(ride)) for (const v of vans) v.update(dt, t); });

  // Gabelmeister's Peak: the summit observatory and the cable car up to it
  subjects.push(new Subject({ id: 'peak', name: "Gabelmeister's Peak", from: 'The Grand Budapest Hotel', group: anchor(SPOTS.peak.x, SPOTS.peak.y + 7, SPOTS.peak.z), radius: 10, base: 500, hint: 'The observatory on the summit to the right, at the top of the cable car.', maxDistance: 520 }));
  const cable = makeCableCar(alps.cableBottom, alps.cableTop);
  scene.add(cable.group);
  const cableSubject = new Subject({
    id: 'cablecar', name: 'The cable car', from: 'The Grand Budapest Hotel', group: cable.carA, radius: 2.4, base: 600, rarity: 'rare',
    hint: "Two red gondolas on the ropes up to Gabelmeister's Peak, right of the line. Whistle while one is near the valley station and both stop mid-route.",
    poses: { stop: { label: 'Stopped mid-route', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, -3.2, 0), maxDistance: 260,
    onCall: () => { cable.stop(); cableSubject.setPose('stop', 4); return true; },
  });
  subjects.push(cableSubject);
  const cableWin = span(cableSubject, cable.group, 60, -660);
  updaters.push((dt, t, ride) => { if (cableWin(ride)) cable.update(dt, t); });

  // --- forest ---
  subjects.push(new Subject({ id: 'foxtree', name: 'The tree with a door', from: 'Fantastic Mr. Fox', group: anchor(SPOTS.foxTree.x, heightAt(SPOTS.foxTree.x, SPOTS.foxTree.z) + 9, SPOTS.foxTree.z), radius: 10, base: 450, hint: 'A big autumn tree on the right with a little red door and a mailbox at its foot.', maxDistance: 260 }));
  const fox = makeMrFox();
  fox.group.position.copy(forest.foxSpot);
  fox.group.rotation.y = -Math.PI / 2;
  scene.add(fox.group);
  const foxSubject = new Subject({
    id: 'fox', name: 'Mr. Fox', from: 'Fantastic Mr. Fox', group: fox.group, radius: 1.4, base: 1000, rarity: 'rare',
    hint: 'In his corduroy suit on the road with his bicycle, right of the track. Whistle for his trademark whistle-and-click.',
    poses: { whistle: { label: 'Whistle and click', mult: 1.9 }, catch: { label: 'Caught it', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.1, 0), facing: fwd(fox.group),
    onCall: () => { fox.whistleClick(); foxSubject.setPose('whistle', 3.2); return true; },
    onItem: () => { fox.catchBox(); foxSubject.setPose('catch', 2.0); return true; }, reactRange: 16, maxDistance: 120,
  });
  subjects.push(foxSubject);
  const foxWin = span(foxSubject, fox.group, -600, -930);
  updaters.push((dt, t, ride) => { if (foxWin(ride)) fox.update(dt, t); });

  const kylie = makeKylie();
  kylie.group.position.copy(forest.kylieSpot);
  kylie.group.rotation.y = -Math.PI / 2 - 0.3;
  scene.add(kylie.group);
  const kylieSubject = new Subject({
    id: 'kylie', name: 'Kylie', from: 'Fantastic Mr. Fox', group: kylie.group, radius: 0.9, base: 750, rarity: 'rare',
    hint: "The opossum a little way up the road from Mr. Fox, in his fishing hat. Whistle and his eyes glaze over.",
    poses: { zone: { label: 'Zoning out', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 0.8, 0), facing: fwd(kylie.group), maxDistance: 100,
    onCall: () => { kylie.zoneOut(); kylieSubject.setPose('zone', 4); return true; },
  });
  subjects.push(kylieSubject);
  const kylieWin = span(kylieSubject, kylie.group, -600, -930);
  updaters.push((dt, t, ride) => { if (kylieWin(ride)) kylie.update(dt, t); });

  const samSuzy = makeSamSuzy();
  const samRoot = new THREE.Group();
  samRoot.position.copy(forest.samSuzySpot);
  samRoot.rotation.y = Math.PI / 2; // facing the track from the left; their idle yaw of PI looks out over the lake
  samRoot.add(samSuzy.group);
  scene.add(samRoot);
  const samSubject = new Subject({
    id: 'samsuzy', name: 'Sam & Suzy', from: 'Moonrise Kingdom', group: samSuzy.group, radius: 1.3, base: 950, rarity: 'rare',
    hint: 'Camped by the lake on the left, at the mile marker, looking out over the water. Whistle and they turn to face you, holding hands.',
    poses: { moonrise: { label: 'Moonrise', mult: 1.8 }, binoc: { label: 'Through the binoculars', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 0.9, 0), facing: fwd(samSuzy.group),
    onCall: () => { samSuzy.moonrise(); samSubject.setPose('moonrise', 4.5); return true; },
    onItem: () => { samSuzy.binoculars(); samSubject.setPose('binoc', 2.8); return true; }, reactRange: 18, maxDistance: 120,
  });
  subjects.push(samSubject);
  const samWin = span(samSubject, samRoot, -700, -1060);
  updaters.push((dt, t, ride) => { if (samWin(ride)) samSuzy.update(dt, t); });

  const scouts = makeScouts(7, new Rng(31));
  scene.add(scouts.group);
  const trail = forest.scoutsPath;
  const scoutState = { z: trail.z0 - 10, dir: -1 };
  const scoutsSubject = new Subject({
    id: 'scouts', name: 'The Khaki Scouts', from: 'Moonrise Kingdom', group: scouts.group, radius: 3.5, base: 600,
    hint: 'Troop 55 marching in perfect file along the trail on the left. Whistle and they salute as one.',
    poses: { salute: { label: 'Salute in unison', mult: 1.7 }, halt: { label: 'Halt!', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 0.8, -3.5),
    onCall: () => { scouts.salute(); scoutsSubject.setPose('salute', 2.8); return true; },
    onItem: () => { scouts.halt(); scoutsSubject.setPose('halt', 2.4); return true; }, reactRange: 18, maxDistance: 130, crowd: true,
  });
  subjects.push(scoutsSubject);
  const scoutWin = span(scoutsSubject, scouts.group, -780, -1170);
  updaters.push((dt, t, ride) => {
    if (!scoutWin(ride)) return;
    if (scouts.marching) scoutState.z += scoutState.dir * dt * 1.35;
    if (scoutState.z < trail.z1) scoutState.dir = 1;
    if (scoutState.z > trail.z0 - 10) scoutState.dir = -1;
    scouts.group.position.set(trail.x, heightAt(trail.x, scoutState.z) + 0.05, scoutState.z);
    const target = scoutState.dir < 0 ? Math.PI : 0;
    scouts.group.rotation.y = damp(scouts.group.rotation.y, target, 2.5, dt);
    scouts.update(dt, t);
  });
  subjects.push(new Subject({ id: 'treehouse', name: 'The treehouse', from: 'Moonrise Kingdom', group: anchor(forest.treehouseTop.x, forest.treehouseTop.y, forest.treehouseTop.z), radius: 3.5, base: 450, hint: 'Sixty feet up a single tall tree, left of the line past the camp. Not a safe altitude.', maxDistance: 220 }));
  subjects.push(new Subject({ id: 'lookout', name: 'The lookout tower', from: 'Moonrise Kingdom', group: anchor(SPOTS.tower.x, heightAt(SPOTS.tower.x, SPOTS.tower.z) + 11, SPOTS.tower.z), radius: 5, base: 400, hint: 'A wooden fire tower with a red roof, right of the track near the end of the wood.', maxDistance: 220 }));

  const flock = makeBirdFlock(9);
  flock.group.position.set(-40, 34, -1150);
  scene.add(flock.group);
  const flockSubject = new Subject({ id: 'flock', name: 'A skein of geese', from: 'Moonrise Kingdom', group: flock.group, radius: 6, base: 250, hint: 'Look up over the autumn wood.', maxDistance: 240 });
  subjects.push(flockSubject);
  const flockRng = new Rng(57);
  updaters.push((dt, t, ride) => {
    const a = ride.u > uAt(-560) && ride.u < uAt(-1200);
    flock.group.visible = a; flockSubject.active = a;
    if (!a) return;
    flock.update(dt, t);
    if (flock.group.position.z > -600) { flock.group.position.set(flockRng.range(-60, 60), flockRng.range(28, 40), -1170); }
  });

  // --- desert ---
  subjects.push(new Subject({ id: 'citysign', name: 'Asteroid City, pop. 87', from: 'Asteroid City', group: anchor(SPOTS.citySign.x, heightAt(SPOTS.citySign.x, SPOTS.citySign.z) + 6, SPOTS.citySign.z), radius: 5.5, base: 350, hint: 'The town sign with its covered wagon, right of the track as the desert begins.', maxDistance: 200 }));
  subjects.push(new Subject({ id: 'diner', name: 'The diner', from: 'Asteroid City', group: anchor(SPOTS.diner.x, heightAt(SPOTS.diner.x, SPOTS.diner.z) + 3, SPOTS.diner.z), radius: 8, base: 400, hint: 'Cream and turquoise, checkered tile and chrome, with a station wagon out front.', maxDistance: 200 }));
  subjects.push(new Subject({ id: 'observatory', name: 'The observatory', from: 'Asteroid City', group: anchor(SPOTS.observatory.x, heightAt(SPOTS.observatory.x, SPOTS.observatory.z) + 6, SPOTS.observatory.z), radius: 7, base: 450, hint: 'A white dome and two radio dishes on a rise to the left, past the motel.', maxDistance: 260 }));
  subjects.push(new Subject({ id: 'ramp', name: 'The unfinished overpass', from: 'Asteroid City', group: anchor(desert.rampEnd.x, desert.rampEnd.y, desert.rampEnd.z), radius: 7, base: 450, hint: 'An elevated ramp on the left that stops in mid-air. Ramp closed indefinitely.', maxDistance: 240 }));

  // the roadrunner, dashing about beside the line
  const rr = makeRoadrunner();
  scene.add(rr.group);
  const rrRng = new Rng(77);
  const rrTarget = new THREE.Vector3();
  let rrWait = 0, rrPlaced = false;
  const rrSubject = new Subject({
    id: 'roadrunner', name: 'The roadrunner', from: 'Asteroid City', group: rr.group, radius: 0.7, base: 1000, rarity: 'rare',
    hint: 'Dashes about in the desert on the left, stopping to look round. Whistle and it does a little dance.',
    poses: { dance: { label: 'A little dance', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 0.7, 0), facing: fwd(rr.group), maxDistance: 70,
    onCall: () => { rr.dance(); rrSubject.setPose('dance', 3.5); return true; },
  });
  subjects.push(rrSubject);
  const rrWin = span(rrSubject, rr.group, -1170, -1660);
  updaters.push((dt, t, ride) => {
    if (!rrWin(ride)) { rrPlaced = false; return; }
    const p = rr.group.position, rp = ride.position;
    if (!rrPlaced) { p.set(rp.x - 12, 0, rp.z - 30); rrTarget.copy(p); rrPlaced = true; }
    if (rr.dancing()) {
      rr.running = 0;
      tmpV.set(ctx.camera.position.x, p.y, ctx.camera.position.z);
      rr.group.lookAt(tmpV);
    } else {
      const dx = rrTarget.x - p.x, dz = rrTarget.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.4) {
        rr.running = damp(rr.running, 0, 10, dt);
        rrWait -= dt;
        // off again, somewhere ahead and to the left of the train
        if (rrWait <= 0 || rp.z - p.z < 6) { rrTarget.set(rp.x - rrRng.range(6, 19), 0, rp.z - rrRng.range(14, 36)); rrWait = rrRng.range(0.8, 2.4); }
      } else {
        const step = Math.min(d, 15 * dt);
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        rr.running = damp(rr.running, 1, 10, dt);
        rr.group.rotation.y = Math.atan2(dx, dz);
      }
    }
    p.y = heightAt(p.x, p.z);
    rr.update(dt, t);
  });

  // the car chase down the desert road, every half minute or so
  const chase = makeCarChase();
  scene.add(chase.group);
  const chaseSubject = new Subject({
    id: 'chase', name: 'The car chase', from: 'Asteroid City', group: chase.lead, radius: 3, base: 750, rarity: 'rare',
    hint: 'A black sedan with two state troopers on its tail, tearing down the desert road on the left. It comes round again.',
    centerOffset: new THREE.Vector3(0, 1, 0), maxDistance: 140,
  });
  subjects.push(chaseSubject);
  let chaseWait = 3;
  const chaseU0 = uAt(-1165), chaseU1 = uAt(-1640);
  updaters.push((dt, t, ride) => {
    const inDesert = ride.u > chaseU0 && ride.u < chaseU1;
    if (inDesert && !chase.active()) { chaseWait -= dt; if (chaseWait <= 0) { chase.run(-11, Math.min(-1162, ride.position.z + 70), -1705); chaseWait = 30; } }
    chase.update(dt, t);
    chaseSubject.active = chase.active();
    if (chase.active()) for (const c of chase.group.children) c.position.y += heightAt(c.position.x, c.position.z) + 0.06;
  });

  const ufo = makeUfo();
  ufo.group.position.set(SPOTS.crater.x, 0, SPOTS.crater.z);
  ufo.hover = desert.craterY + 24;
  scene.add(ufo.group);
  const alien = makeAlien();
  const alienRoot = new THREE.Group();
  alienRoot.position.set(SPOTS.crater.x, 0, SPOTS.crater.z);
  alienRoot.rotation.y = -Math.PI / 2; // faces the track once it stops turning
  alienRoot.add(alien.group);
  scene.add(alienRoot);
  const beamLen = ufo.hover - desert.craterY + 0.6;
  let alienCooldown = 0;
  const startAlien = () => {
    if (alien.state.phase !== 0 || alienCooldown > 0) return false;
    alien.start(ufo.hover - 2.0, desert.craterY + 0.15);
    ufo.setBeam(true, beamLen);
    ufoSubject.setPose('beam', 5);
    alienCooldown = 30;
    return true;
  };
  const ufoSubject = new Subject({
    id: 'ufo', name: 'The flying saucer', from: 'Asteroid City', group: ufo.group, radius: 5, base: 700, rarity: 'rare',
    hint: 'Hovers over the meteorite crater, right of the track. Whistle within range and something comes down on a beam of light.',
    poses: { beam: { label: 'Beam of light', mult: 1.6 } }, maxDistance: 220,
    onCall: () => startAlien(),
  });
  subjects.push(ufoSubject);
  const alienSubject = new Subject({
    id: 'alien', name: 'The alien', from: 'Asteroid City', group: alien.group, radius: 2.4, base: 1500, rarity: 'legendary',
    hint: 'Invisible until you whistle near the crater. It descends, freezes in an awkward pose with the meteorite, and leaves after a few seconds.',
    poses: { descend: { label: 'Descending', mult: 1.5 }, pose: { label: 'The alien', mult: 2.0 }, leave: { label: 'Leaving with the meteorite', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 1.9, 0), facing: fwd(alien.group), maxDistance: 160,
  });
  subjects.push(alienSubject);
  let alienPhase = 0;
  const ufoWin = span(ufoSubject, ufo.group, -1200, -1690);
  updaters.push((dt, t, ride) => {
    alienCooldown = Math.max(0, alienCooldown - dt);
    if (!ufoWin(ride)) { alienSubject.active = false; return; }
    ufo.update(dt, t);
    alien.update(dt, t);
    alienSubject.active = alien.visible;
    if (alien.state.phase !== alienPhase) {
      alienPhase = alien.state.phase;
      if (alienPhase === 1) alienSubject.setPose('descend', 4.6);
      else if (alienPhase === 2) alienSubject.setPose('pose', 8.2);
      else if (alienPhase === 3) { alienSubject.setPose('leave', 3.3); ufo.setBeam(false, beamLen); }
    }
  });

  // --- sea ---
  const belafonte = makeBelafonte();
  belafonte.group.position.set(SPOTS.belafonte.x, 0, SPOTS.belafonte.z);
  scene.add(belafonte.group);
  const belafonteSubject = new Subject({
    id: 'belafonte', name: 'The Belafonte', from: 'The Life Aquatic', group: belafonte.group, radius: 22, base: 900,
    hint: "Steve Zissou's research vessel, moored beside the causeway on the right and cut open like the film's set so you can see the rooms. Whistle and the helicopter's rotor starts.",
    poses: { horn: { label: 'Helicopter warming up', mult: 1.4 } }, centerOffset: new THREE.Vector3(0, 5, 0), maxDistance: 320,
    onCall: () => { belafonte.horn(); belafonteSubject.setPose('horn', 4); return true; },
  });
  subjects.push(belafonteSubject);
  const crew = makeTeamZissou(5, new Rng(37));
  crew.group.position.set(-2.6, belafonte.deckY, 1);
  crew.group.rotation.y = -Math.PI / 2; // the row faces the track side of the ship
  belafonte.group.add(crew.group);
  const crewSubject = new Subject({
    id: 'zissou', name: 'Team Zissou', from: 'The Life Aquatic', group: crew.group, radius: 3.6, base: 1000, rarity: 'rare',
    hint: 'Five in light blue with red beanies, in a row on the deck. Whistle and they all point at the sea together.',
    poses: { point: { label: 'Team Zissou', mult: 1.8 }, salute: { label: 'Salute', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: fwd(crew.group),
    onCall: () => { crew.point(); crewSubject.setPose('point', 3.6); return true; },
    onItem: () => { crew.salute(); crewSubject.setPose('salute', 2.4); return true; }, reactRange: 26, maxDistance: 150, crowd: true,
  });
  subjects.push(crewSubject);
  const pele = makePele();
  pele.group.position.set(-3.1, belafonte.deckY, -8.5);
  pele.group.rotation.y = -Math.PI / 2;
  belafonte.group.add(pele.group);
  const peleSubject = new Subject({
    id: 'pele', name: 'Pelé dos Santos', from: 'The Life Aquatic', group: pele.group, radius: 1.0, base: 850, rarity: 'rare',
    hint: "The Belafonte's safety expert, sitting on a crate on the aft deck with his guitar. Whistle for a song.",
    poses: { song: { label: 'David Bowie, in Portuguese', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 0.9, 0), facing: fwd(pele.group), maxDistance: 140,
    onCall: () => { pele.play(); peleSubject.setPose('song', 5); return true; },
  });
  subjects.push(peleSubject);
  culler.add(belafonte.group, 6);
  const belWin = span(belafonteSubject, null, -1650, -2262);
  const crewWin = span(crewSubject, null, -1700, -2000);
  const peleWin = span(peleSubject, null, -1700, -2000);
  updaters.push((dt, t, ride) => { crewWin(ride); peleWin(ride); if (belWin(ride)) { belafonte.update(dt, t); crew.update(dt, t); pele.update(dt, t); } });

  const shark = makeJaguarShark();
  shark.group.position.set(-16, -10, -1960);
  scene.add(shark.group);
  const sharkSubject = new Subject({
    id: 'shark', name: 'The jaguar shark', from: 'The Life Aquatic', group: shark.group, radius: 7, base: 1400, rarity: 'legendary',
    hint: 'Somewhere under the causeway. Whistle out on the sea and it surfaces slowly on the left, spots glowing, then goes down again.',
    poses: { rising: { label: 'Surfacing', mult: 1.6 }, cruise: { label: 'The jaguar shark', mult: 2.0 } }, centerOffset: new THREE.Vector3(0, 0.6, 0), maxDistance: 170,
  });
  subjects.push(sharkSubject);
  let sharkPhase = 0, sharkCooldown = 0;
  const startShark = (ride: RideState) => {
    if (shark.state.phase !== 0 || sharkCooldown > 0) return;
    shark.group.position.set(ride.position.x - 15, shark.state.hidden, ride.position.z - 58);
    shark.group.rotation.y = Math.PI; // nose pointing down the line
    shark.surface();
    sharkCooldown = 40;
  };
  updaters.push((dt, t) => {
    sharkCooldown = Math.max(0, sharkCooldown - dt);
    shark.update(dt, t);
    sharkSubject.active = shark.visible;
    if (shark.state.phase === 2) shark.group.position.z -= dt * 4.5;
    if (shark.state.phase !== sharkPhase) {
      sharkPhase = shark.state.phase;
      if (sharkPhase === 1) sharkSubject.setPose('rising', 5);
      else if (sharkPhase === 2) sharkSubject.setPose('cruise', 7);
    }
  });

  const sub = makeDeepSearch();
  sub.group.position.set(SPOTS.sub.x, 0, SPOTS.sub.z);
  scene.add(sub.group);
  const subSubject = new Subject({
    id: 'deepsearch', name: 'Deep Search', from: 'The Life Aquatic', group: sub.group, radius: 3, base: 600,
    hint: 'The yellow submarine (her old name painted out), half under at the little jetty on the left. Whistle and it surfaces properly.',
    poses: { surface: { label: 'Surfacing', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 0.8, 0), maxDistance: 120,
    onCall: () => { sub.surface(); subSubject.setPose('surface', 5); return true; },
  });
  subjects.push(subSubject);
  const subWin = span(subSubject, sub.group, -1650, -1960);
  updaters.push((dt, t, ride) => { if (subWin(ride)) sub.update(dt, t); });

  // sugar crabs on the submarine's jetty
  const crabs = makeSugarCrabs(6, new Rng(83), 0.6);
  crabs.group.position.set(-8.5, trackPoint(SPOTS.sub.z).y - 0.95 + 1.0, SPOTS.sub.z + 2);
  crabs.group.scale.setScalar(1.3);
  scene.add(crabs.group);
  const crabSubject = new Subject({
    id: 'sugarcrabs', name: 'Sugar crabs', from: 'The Life Aquatic', group: crabs.group, radius: 1.6, base: 600, rarity: 'rare',
    hint: "Crabs that happen to look like candy, scuttling on the submarine's jetty to the left. Throw something and they rush to it.",
    poses: { swarm: { label: 'Scuttling to it', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 0.3, 0), maxDistance: 60, reactRange: 12, crowd: true,
    onItem: (pos) => { crabs.swarmTo(pos); crabSubject.setPose('swarm', 4); return true; },
  });
  subjects.push(crabSubject);
  const crabWin = span(crabSubject, crabs.group, -1650, -1960);
  updaters.push((dt, t, ride) => { if (crabWin(ride)) crabs.update(dt, t); });

  subjects.push(new Subject({ id: 'lighthouse', name: 'The striped lighthouse', from: 'The Life Aquatic', group: anchor(SPOTS.island.x, shore.islandY + 9, SPOTS.island.z), radius: 8, base: 400, hint: 'Red and white, on a little island right of the harbour. Its beam comes on at sundown.', maxDistance: 420 }));
  const gulls = makeGulls(8, new Rng(43));
  gulls.group.position.set(SPOTS.island.x, shore.islandY + 12, SPOTS.island.z);
  scene.add(gulls.group);
  const gullSubject = new Subject({
    id: 'gulls', name: 'Harbour gulls', from: 'The Life Aquatic', group: gulls.group, radius: 12, base: 300,
    hint: 'Circling the lighthouse. Whistle and they scatter.',
    poses: { scatter: { label: 'Scattering', mult: 1.3 } }, maxDistance: 170,
    onCall: () => { gulls.scatter(); gullSubject.setPose('scatter', 3); return true; },
  });
  subjects.push(gullSubject);
  const gullWin = span(gullSubject, gulls.group, -1800, -2262);
  updaters.push((dt, t, ride) => { if (gullWin(ride)) gulls.update(dt, t); });

  // electric jellyfish rising in the harbour as the sun goes down
  const jellyR = makeJellyfish(5, new Rng(89), { x: 14, z: -2158, w: 6, d: 9 });
  const jellyL = makeJellyfish(5, new Rng(97), { x: -14, z: -2158, w: 6, d: 9 });
  scene.add(jellyR.group, jellyL.group);
  const jellySubject = new Subject({
    id: 'jellyfish', name: 'Electric jellyfish', from: 'The Life Aquatic', group: jellyR.group, radius: 7, base: 700, rarity: 'rare',
    hint: 'They rise in the harbour either side of the line as the sun goes down. Whistle and they glow brighter.',
    poses: { glow: { label: 'Moonlight on their membranes', mult: 1.6 } }, centerOffset: new THREE.Vector3(14, 0, -2158), maxDistance: 120,
    onCall: () => { jellyR.glow(); jellyL.glow(); jellySubject.setPose('glow', 3); return true; },
  });
  subjects.push(jellySubject);
  const jellyU = uAt(-2080);
  updaters.push((dt, t, ride) => {
    const level = smoothstep(jellyU, jellyU + 0.02, ride.u);
    jellyR.level = level; jellyL.level = level;
    jellySubject.active = level > 0.3;
    if (level > 0) { jellyR.update(dt, t); jellyL.update(dt, t); } else { jellyR.group.visible = false; jellyL.group.visible = false; }
  });

  subjects.push(new Subject({ id: 'dispatch', name: 'The French Dispatch', from: 'The French Dispatch', group: anchor(-6.4, shore.station.platY + 1.6, SPOTS.harbour.z + 5), radius: 1.4, base: 300, hint: 'A green news kiosk on the left platform at Port-au-Patois, papered with the magazine\'s covers.', maxDistance: 60 }));

  // ---------- particles ----------
  const snowfall = new Drift({ count: Math.round(520 * dens), color: 0xffffff, size: 0.3, box: new THREE.Vector3(90, 34, 90), speed: new THREE.Vector3(0.3, -1.6, 0), wobble: 0.8, opacity: 0.85 });
  scene.add(snowfall.points);
  const leaves = new Drift({ count: Math.round(200 * dens), color: 0xe8973a, size: 0.34, box: new THREE.Vector3(80, 26, 80), speed: new THREE.Vector3(1.2, -0.9, 0.3), wobble: 1.4, opacity: 0.85 });
  leaves.intensity = 0;
  scene.add(leaves.points);
  const dust = new Drift({ count: Math.round(120 * dens), color: 0xf2dcc0, size: 0.4, box: new THREE.Vector3(90, 14, 90), speed: new THREE.Vector3(2.2, 0.1, 0.4), wobble: 0.9, opacity: 0.35 });
  dust.intensity = 0;
  scene.add(dust.points);
  const puffs = new Puffs(0xf2b8c6, 32);
  scene.add(puffs.group);

  // ---------- lighting: one calm day, each film with its own palette, ending at sundown by the sea ----------
  const lighting = makeLighting(LIGHT_KEYS.map((k) => ({ ...k })));

  const world: BuiltWorld = {
    scene, curve, speed: 10.5, vehicle, cameraAnchor, subjects, sky, sun, hemi, lighting,
    occluders: [terrain, hotel],
    waterLevel: WATER,
    groundHeight: heightAt,
    makeProjectile: () => makeMendlsBox(0.7),
    ambience: {
      root: 62, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [2, 5, 9]], padWave: 'triangle', padLevel: 0.07,
      melody: 'pluck', melodyInterval: 0.75, melodyDensity: 0.8, melodyLevel: 0.15, chordSeconds: 6, vehicle: 'train',
    },
    env(u) {
      const forestU = smoothstep(0.26, 0.3, u) * (1 - smoothstep(0.5, 0.54, u));
      const seaU = smoothstep(0.74, 0.78, u);
      const dusk = smoothstep(0.92, 0.98, u);
      return { wind: 0.3, birds: 0.5 * forestU + 0.15 * seaU * (1 - dusk), sea: 0.5 * seaU, rain: 0, crickets: 0.35 * dusk };
    },
    captions: [
      [0.005, 'Nebelsbad, Republic of Zubrowka'],
      [0.1, 'The Grand Budapest Hotel'],
      [0.17, "Gabelmeister's Peak"],
      [0.29, 'The autumn wood'],
      [0.37, 'Camp Ivanhoe, New Penzance'],
      [0.53, 'Asteroid City, pop. 87'],
      [0.63, 'The crater'],
      [0.77, 'The causeway'],
      [0.84, 'The Belafonte'],
      [0.95, 'Port-au-Patois, end of the line'],
    ],
    update(dt, ride) {
      const t = ride.time;
      for (const up of updaters) up(dt, t, ride);
      const fog = scene.fog as THREE.FogExp2;
      const cam = ctx.camera;
      culler.update(cam, fog);
      const dusk = smoothstep(0.9, 0.97, ride.u);
      sea.update(t, sky.uniforms, fog, dusk * 0.25);
      lake.update(t, sky.uniforms, fog, 0);
      grass.update(t, cam);
      clouds.update(sky.uniforms, fog, sun.intensity);
      clouds.group.position.x = t * 0.5;
      const cp = cam.position;
      snowfall.intensity = 1 - smoothstep(0.24, 0.29, ride.u);
      snowfall.update(dt, t, tmpV.set(cp.x, cp.y + 8, cp.z - 20));
      leaves.intensity = smoothstep(0.27, 0.31, ride.u) * (1 - smoothstep(0.49, 0.53, ride.u));
      leaves.update(dt, t, tmpV.set(cp.x, cp.y + 6, cp.z - 18));
      dust.intensity = smoothstep(0.52, 0.56, ride.u) * (1 - smoothstep(0.74, 0.77, ride.u));
      dust.update(dt, t, tmpV.set(cp.x, cp.y + 2, cp.z - 24));
      puffs.update(dt);
      // the lanterns flicker, and everything lights up a little more as the sun goes down
      const flick = (1.05 + Math.sin(t * 7.3) * 0.04) * (1 + dusk * 0.3);
      for (const m of train.lampMats) m.color.setHex(0xffe6b0).multiplyScalar(flick);
      train.light.intensity = 1.6 + dusk * 5;
      // the lighthouse beam sweeps round once the light goes
      const beam = shore.beam;
      beam.visible = dusk > 0.01;
      if (beam.visible) {
        beam.rotation.y = t * 0.6;
        (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 * dusk;
      }
    },
    onItemLand(pos) { puffs.burst(pos, 7, 0xf2b8c6, 1.6, 1.4, 0.6); },
    onCall(pos, ride) {
      // the two hidden legends only answer the whistle from within range
      if (Math.hypot(pos.x - SPOTS.crater.x, pos.z - SPOTS.crater.z) < 90) startAlien();
      if (ride.u > uAt(-1730) && ride.u < uAt(-2150)) startShark(ride);
    },
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

export const AndersonWorld: WorldDef = {
  id: 'anderson',
  title: 'The Zubrowka Express',
  subtitle: 'Wes Anderson',
  blurb: 'Leave a snowy pink alp beneath the Grand Budapest, cross an autumn wood and a pastel desert, and roll out along a causeway to where the Belafonte is moored as the sun goes down.',
  vehicleName: 'The Zubrowka Express',
  itemName: "Mendl's box",
  callName: 'whistle',
  callKind: 'whistle',
  accent: '#f2a8bc',
  accent2: '#b93a4c',
  fov: 58,
  build,
};
