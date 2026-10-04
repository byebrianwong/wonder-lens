import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { HeightGrid } from '../../../engine/HeightGrid';
import { buildTerrain, type Placement } from '../../../engine/Builders';
import { GrassField } from '../../../engine/Grass';
import { flowerField, fluffyForest } from '../../../engine/Foliage';
import { CumulusField } from '../../../engine/Clouds';
import { addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { Drift } from '../../../engine/Particles';
import { charToon } from '../../../engine/Paint';
import { Heading } from '../../../engine/Rig';
import { Rng, TAU, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import { CASTLE_ROOM } from '../layout';
import { FILMS, forwardOf, type BuiltSet, type SetContext } from '../common';
import { granite } from '../../ghibli/propTextures';
import { makeHowlCastle } from '../howl/castle';
import { makeTurnipHead } from '../howl/turnipHead';
import { makeCalcifer } from '../howl/calcifer';
import { buildCastleRoom } from '../howl/room';
import { Smoke, Ripples } from '../howl/smoke';
import { buildMountains, buildHut, findSky, MirrorLake } from '../howl/scenery';
import { wakeTexture } from '../howl/paint';

/*
 * Howl's meadow at golden hour (z -1510 to -1792).
 *
 * The Catbus runs down out of a cloud into a valley ringed by snowy peaks and lands in a meadow full of
 * flowers. Turnip Head hops along beside it on the left; Howl's hut and windmill stand by the lake. Ahead and
 * to the right the moving castle strides along on its bird legs, wading through the shallow end of a still
 * mountain lake that mirrors the sky, the peaks and the castle itself. The Catbus runs out across the water,
 * while the castle crosses in front of it, turns round to face it and sits down, and its plank tongue unfolds
 * into a ramp. Up the tongue, in at the door: the cosy room inside, Calcifer in the hearth, the colour dial
 * clicking round to black, and the inner door swinging open onto the next scene.
 *
 * Everything that moves here is keyed to the rider's z, so the ride can be sped up, slowed or jumped anywhere.
 */

/** Where the castle sits once it has settled: the door is on the path at z -1762. */
const HOME = { x: 0, z: -1777 };
/** Once the front doors have shut behind the Catbus, nothing outside is drawn any more. */
const HIDE_Z = -1775.5;
/** The room is drawn from here on (by then the castle has sat down round it). */
const ROOM_Z = -1718;
/** Rider z for castle keyframes: where the castle stands (x, z) when the rider is at that z. */
const CASTLE_KEYS: Array<[number, number, number]> = [
  [-1490, 48, -1592], [-1540, 44, -1634], [-1598, 40, -1683], [-1636, 35, -1715],
  [-1662, 28, -1740], [-1682, 16, -1758], [-1697, 5, -1772], [-1710, HOME.x, HOME.z],
];
/** The lake: ellipses (centre, radii, depth); the path crosses the first between z -1644.5 and -1711.6. */
const LAKES = [
  { x: -40, z: -1678, rx: 110, rz: 34.5, d: 4.5 },
  { x: 36, z: -1694, rx: 40, rz: 23, d: 1.5 },
  { x: -135, z: -1690, rx: 55, rz: 46, d: 3.5 },
];
/** Howl's hut by the near shore, on the left. */
const HUT = { x: -26, z: -1636, yaw: 0.35 };

export function buildMeadow(ctx: SetContext): BuiltSet {
  const { road, lights, camera } = ctx;
  const rng = new Rng(17450);
  const low = ctx.lowDetail;
  const group = new THREE.Group();
  const outside = new THREE.Group();
  group.add(outside);
  const sky = findSky(ctx.scene);
  const sunLight = ctx.scene.children.find((o) => (o as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;
  const fogOf = () => ctx.scene.fog as THREE.FogExp2 | null;

  // ---------------------------------------------------------------- the ground
  const lakeInfo = (x: number, z: number) => {
    let depth = 0, out = Infinity;
    for (const L of LAKES) {
      const q = Math.hypot((x - L.x) / L.rx, (z - L.z) / L.rz), m = Math.min(L.rx, L.rz);
      if (q < 1) depth = Math.max(depth, L.d * smoothstep(0, 10, (1 - q) * m));
      out = Math.min(out, (q - 1) * m);
    }
    return { depth, out };
  };
  /** sideways distance from the path at a point, and the path there */
  const lateral = (x: number, z: number) => { const p = road.at(z); return { p, d: Math.abs((x - p.x) * p.rx + (z - p.z) * p.rz) }; };
  const rawHeight = (x: number, z: number) => {
    // a basin of meadow ringed by forested hills, which rise towards the edges
    const r = Math.hypot(x / 170, (z + 1660) / 200);
    const hills = 42 * smoothstep(0.8, 1.32, r) * (0.6 + 0.8 * fbm(x * 0.011 + 3, z * 0.011, 3));
    let h = 0.55 + 1.6 * (fbm(x * 0.018 + 5, z * 0.018 - 2, 3) - 0.5) + hills;
    // a low rise the path runs over before the lake
    h += 1.2 * Math.exp(-(((x - 14) / 30) ** 2 + ((z + 1600) / 22) ** 2));
    const L = lakeInfo(x, z);
    if (L.out < 0) return -0.05 - L.depth + (fbm(x * 0.1, z * 0.1, 2) - 0.5) * 0.3 * smoothstep(0, 2, L.depth);
    // a gentle bank down to the water's edge
    return lerp(0.12, Math.max(h, 0.15), smoothstep(0, 10, L.out));
  };
  const heightFn = (x: number, z: number) => {
    let h = rawHeight(x, z);
    // the ground under the path is exactly where the Catbus's paws are (in the air at first: only kept below it)
    if (z < -1512 && z > -1737) {
      const { p, d } = lateral(x, z);
      const w = (1 - smoothstep(3.2, 10, d)) * smoothstep(0, 3, lakeInfo(x, z).out);
      if (w > 0) h = lerp(h, z > -1563 ? Math.min(h, p.y - 0.6) : p.y - 0.03, w);
    }
    // a level pad where the castle sits down
    const ox = Math.max(0, Math.abs(x) - 16), oz = Math.max(0, z - -1737, -1798 - z);
    return lerp(h, 0.3, 1 - smoothstep(0, 12, Math.hypot(ox, oz)));
  };
  const grid = new HeightGrid(-240, 240, -1930, -1440, 2.5, heightFn);
  const ground = (x: number, z: number) => grid.sample(x, z);

  const cLush = new THREE.Color(0x4f8f36), cLight = new THREE.Color(0x8cbc4c), cGold = new THREE.Color(0xb8b450), cCool = new THREE.Color(0x3a7a58);
  const cHill = new THREE.Color(0x3a663a), cRock = new THREE.Color(0x8a8070), cShore = new THREE.Color(0xb8aa88), cBed = new THREE.Color(0x5a6a48), cDeep = new THREE.Color(0x24363a);
  const meadowColour = (x: number, z: number, out: THREE.Color) => {
    out.copy(cLush).lerp(cLight, smoothstep(0.3, 0.75, fbm(x * 0.016, z * 0.016, 3)));
    out.lerp(cGold, 0.45 * smoothstep(0.55, 0.85, fbm(x * 0.01 + 7, z * 0.01, 2)));
    out.lerp(cCool, 0.45 * smoothstep(0.5, 0.8, fbm(x * 0.05 + 31, z * 0.05 - 12, 2)));
    return out;
  };
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(terrainMat, paintedDetailTexture(1745), { scaleA: 28, scaleB: 7, strength: 0.7 });
  const terrain = buildTerrain({
    xMin: -240, xMax: 240, zMin: -1930, zMax: -1440, res: 2.5, chunk: 160, height: ground, material: terrainMat,
    color: (x, z, y, slope, out) => {
      if (y < 0.02) { out.copy(cBed).lerp(cDeep, smoothstep(0.3, 3.5, -y)); return; }
      meadowColour(x, z, out);
      out.lerp(cHill, smoothstep(3, 16, y));
      out.lerp(cRock, smoothstep(0.32, 0.6, slope));
      const L = lakeInfo(x, z);
      if (L.out < 3) out.lerp(cShore, 0.75 * (1 - smoothstep(0.4, 3, L.out)));
      out.multiplyScalar(0.88);
    },
  });
  outside.add(terrain);

  // ---------------------------------------------------------------- mountains, clouds, the lake
  const sunDir = new THREE.Vector3(-0.55, 0.28, -0.79).normalize();
  const mountains = buildMountains(sunDir);
  outside.add(mountains.group);
  const cloudPl: Placement[] = [
    // the cloud the Catbus comes down out of
    { x: -4, y: 13, z: -1500, scale: 1.9, rot: 0.2 }, { x: 16, y: 16, z: -1488, scale: 1.7, rot: 2.6 }, { x: -22, y: 18, z: -1508, scale: 1.6, rot: 1.1 },
  ];
  {
    const crng = new Rng(1749);
    for (let i = 0; i < (low ? 12 : 20); i++) {
      const a = crng.range(0, TAU), r = crng.range(170, 400);
      cloudPl.push({ x: Math.sin(a) * r, y: crng.range(70, 140), z: -1680 + Math.cos(a) * r, scale: crng.range(2.4, 4.6), rot: crng.range(0, TAU) });
    }
  }
  const clouds = new CumulusField(new Rng(1751), cloudPl);
  outside.add(clouds.group);
  const lake = new MirrorLake(grid, sky, mountains);
  const lakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(285, 106).rotateX(-Math.PI / 2), lake.material);
  lakeMesh.position.set(-57.5, 0, -1688);
  lakeMesh.renderOrder = 1;
  outside.add(lakeMesh);

  // ---------------------------------------------------------------- grass and flowers
  const tmpC = new THREE.Color();
  const hutDist = (x: number, z: number) => Math.hypot(x - HUT.x, z - HUT.z);
  const grass = new GrassField({
    heights: grid, xMin: -160, xMax: 160, zMin: -1800, zMax: -1505, res: 1,
    bladesPerM2: low ? 14 : 28, radius: low ? 70 : 100,
    rowRange: (z) => { const x = road.at(z).x; return [x - 130, x + 130]; },
    sample: (x, z, out) => {
      const y = ground(x, z), L = lakeInfo(x, z);
      if (L.out < 1.0 || y < 0.1) return;
      let d = smoothstep(1.0, 3.5, L.out) * (1 - smoothstep(0.3, 0.5, grid.slope(x, z)));
      d *= 0.6 + 0.4 * smoothstep(0.3, 0.55, fbm(x * 0.05 - 3, z * 0.05 + 9, 2));
      d *= smoothstep(4.5, 6.5, hutDist(x, z));
      // none under the castle's tongue
      if (Math.abs(x) < 3.4 && z < -1729 && z > -1762) d = 0;
      out.density = d;
      if (d <= 0) return;
      meadowColour(x, z, tmpC);
      out.r = tmpC.r; out.g = tmpC.g; out.b = tmpC.b;
      // tall grass, trampled along the Catbus's way and short at the water's edge
      const lat = lateral(x, z).d;
      out.height = lerp(0.9, 1.6, smoothstep(0.35, 0.7, fbm(x * 0.03 + 50, z * 0.03, 2))) * lerp(0.4, 1, smoothstep(1.2, 3.5, lat)) * lerp(0.5, 1, smoothstep(1, 6, L.out));
    },
  });
  outside.add(grass.group);
  const flowerPl: Placement[] = [], flowerKinds: number[] = [];
  {
    const frng = new Rng(1753);
    const N = low ? 6000 : 13000;
    let tries = 0;
    while (flowerPl.length < N && tries < N * 10) {
      tries++;
      const z = frng.range(-1790, -1525);
      const px = road.at(z).x;
      const x = px + frng.sign() * (1.4 + Math.pow(frng.next(), 1.7) * 105);
      // flowers grow in drifts
      const patch = fbm(x * 0.04 + 13, z * 0.04 - 5, 2);
      if (patch < 0.36 || frng.next() > (patch - 0.36) * 2.6) continue;
      const L = lakeInfo(x, z);
      if (L.out < 1.6 || hutDist(x, z) < 6 || (Math.abs(x) < 3.4 && z < -1729)) continue;
      const y = ground(x, z);
      if (y > 7 || grid.slope(x, z) > 0.3) continue;
      flowerPl.push({ x, y: y + frng.range(0.4, 0.95), z, scale: frng.range(0.9, 1.7), rot: 0 });
      const lean = Math.floor(fbm(x * 0.02 - 40, z * 0.02 + 7, 1) * 4) % 4;
      flowerKinds.push(frng.chance(0.55) ? lean : frng.int(0, 3));
    }
  }
  outside.add(flowerField(flowerPl, flowerKinds));
  // petals drifting on the breeze round the rider
  const petals = new Drift({ count: low ? 90 : 180, color: 0xfff2f4, size: 0.1, box: new THREE.Vector3(70, 16, 70), speed: new THREE.Vector3(1.6, 0.15, 0.9), wobble: 1.4, opacity: 0.9, seed: 1755 });
  outside.add(petals.points);

  // ---------------------------------------------------------------- the castle's walk, worked out once along the ride
  const ckCurve = new THREE.CatmullRomCurve3(CASTLE_KEYS.map(([, x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const rawT = (zr: number) => {
    const n = CASTLE_KEYS.length;
    if (zr >= CASTLE_KEYS[0][0]) return 0;
    for (let i = 0; i < n - 1; i++) {
      const a = CASTLE_KEYS[i][0], b = CASTLE_KEYS[i + 1][0];
      if (zr <= a && zr >= b) return (i + (a - zr) / (a - b)) / (n - 1);
    }
    return 1;
  };
  const TZ0 = -1470, TZ1 = -1740, TSTEP = 0.5, TN = Math.round((TZ0 - TZ1) / TSTEP) + 1;
  const tab = { x: new Float32Array(TN), z: new Float32Array(TN), yaw: new Float32Array(TN), gait: new Float32Array(TN) };
  {
    const raw = Array.from({ length: TN }, (_, i) => rawT(TZ0 - i * TSTEP));
    // smooth the pace, so the castle does not change speed with a jolt at each keyframe
    const R = 12;
    const sm = raw.map((_, i) => { let s = 0, c = 0; for (let k = -R; k <= R; k++) { const j = clamp(i + k, 0, TN - 1); s += raw[j]; c++; } return s / c; });
    const p = new THREE.Vector3(), prev = new THREE.Vector3(), tan = new THREE.Vector3();
    let gait = 0, prevYaw = 0;
    for (let i = 0; i < TN; i++) {
      const zr = TZ0 - i * TSTEP, t = clamp(sm[i], 0, 1);
      ckCurve.getPoint(t, p);
      ckCurve.getTangent(clamp(t, 0.001, 0.999), tan);
      let walkYaw = Math.atan2(tan.x, tan.z);
      if (walkYaw > 0) walkYaw -= TAU;
      const yaw = lerp(walkYaw, 0, smoothstep(-1676, -1712, zr));
      if (i > 0) gait += p.distanceTo(prev) + Math.abs(yaw - prevYaw) * 7;
      tab.x[i] = p.x; tab.z[i] = p.z; tab.yaw[i] = yaw; tab.gait[i] = gait;
      prev.copy(p); prevYaw = yaw;
    }
  }
  const look = (arr: Float32Array, zr: number) => {
    const f = clamp((TZ0 - zr) / TSTEP, 0, TN - 1), i = Math.min(TN - 2, Math.floor(f));
    return lerp(arr[i], arr[i + 1], f - i);
  };

  // ---------------------------------------------------------------- the castle, its smoke and the splashes
  const smoke = new Smoke(260, 1757);
  outside.add(smoke.mesh);
  const ripples = new Ripples(72, 0.03);
  outside.add(ripples.mesh);
  const castle = makeHowlCastle({ profile: (zl) => road.at(HOME.z + zl).y, smoke, rng: new Rng(1759) });
  outside.add(castle.group);
  castle.onStep = (p) => {
    if (ground(p.x, p.z) < -0.05) {
      ripples.add(p.x, p.z, 8, 2.4); ripples.add(p.x, p.z, 4.5, 1.6);
      smoke.emit(new THREE.Vector3(p.x, 0.4, p.z), { n: 10, vel: new THREE.Vector3(0, 4.5, 0), spread: 2.4, size: 0.9, grow: 2.6, life: 1.3, color: 0xf4f8fa, alpha: 0.85, jitter: 1.2 });
    } else {
      smoke.emit(new THREE.Vector3(p.x, p.y + 0.5, p.z), { n: 5, vel: new THREE.Vector3(0, 1.2, 0), spread: 1.8, size: 1.0, grow: 2.6, life: 1.6, color: 0xd8c8a0, alpha: 0.45, jitter: 1.0 });
    }
  };
  const castleDrive = (zr: number) => {
    const d = castle.drive;
    d.x = look(tab.x, zr); d.z = look(tab.z, zr); d.yaw = look(tab.yaw, zr); d.gait = look(tab.gait, zr);
    d.lift = 7 * (1 - smoothstep(-1694, -1714, zr));
    d.walk = 1 - smoothstep(-1702, -1714, zr);
    d.crouch = smoothstep(-1698, -1714, zr);
    d.tongue[0] = smoothstep(-1714, -1719, zr); d.tongue[1] = smoothstep(-1717, -1721.5, zr); d.tongue[2] = smoothstep(-1720, -1724.5, zr);
    // no hops (nor jolts) once the tongue is down and the Catbus is running up it
    d.hopScale = 1 - smoothstep(-1712, -1728, zr);
  };

  // ---------------------------------------------------------------- Howl's hut, trees and rocks
  const hut = buildHut(new Rng(1761));
  hut.group.position.set(HUT.x, ground(HUT.x, HUT.z) - 0.15, HUT.z);
  hut.group.rotation.y = HUT.yaw;
  outside.add(hut.group);
  // keep trees and rocks off the castle's walk, the path and the water
  const trackPts = Array.from({ length: 40 }, (_, i) => ckCurve.getPoint(i / 39));
  const nearTrack = (x: number, z: number) => trackPts.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), Infinity);
  const clear = (x: number, z: number, pathGap: number) => lakeInfo(x, z).out > 3 && lateral(x, z).d > pathGap && nearTrack(x, z) > 24 && hutDist(x, z) > 9 && !(Math.abs(x) < 18 && z < -1735 && z > -1800);
  const trng = new Rng(1763);
  const near: Placement[] = [], broad: Placement[] = [], conifers: Placement[] = [], poplars: Placement[] = [];
  // a big shady tree by the hut, and a few more round the meadow and the far shore
  broad.push({ x: HUT.x - 9, y: ground(HUT.x - 9, HUT.z + 3) - 0.2, z: HUT.z + 3, scale: 2.3, rot: 0.4 });
  for (let i = 0; i < 400 && near.length < (low ? 10 : 18); i++) {
    const x = trng.range(-120, 90), z = trng.range(-1790, -1540);
    if (Math.hypot(x / 170, (z + 1660) / 200) > 0.75 || !clear(x, z, 16)) continue;
    near.push({ x, y: ground(x, z) - 0.2, z, scale: trng.range(1.5, 2.3), rot: trng.range(0, TAU) });
  }
  for (const [x, z] of [[-24, -1728], [-31, -1734], [-38, -1727], [-17, -1745]]) if (clear(x, z, 10)) poplars.push({ x, y: ground(x, z) - 0.2, z, scale: trng.range(1.8, 2.3), rot: trng.range(0, TAU) });
  for (let i = 0; i < 3000 && conifers.length < (low ? 60 : 120); i++) {
    const x = trng.range(-235, 235), z = trng.range(-1925, -1445);
    const r = Math.hypot(x / 170, (z + 1660) / 200);
    if (r < 0.82 || ground(x, z) < 3 || grid.slope(x, z) > 0.55) continue;
    conifers.push({ x, y: ground(x, z) - 0.3, z, scale: trng.range(2.0, 3.4), rot: trng.range(0, TAU) });
  }
  const meadowTrees = { trunk: 0x5a4030, leaves: [0x4f8a3a, 0x5f9a42, 0x3f7a34, 0x6aa04a] };
  outside.add(fluffyForest({ shape: 'round', ...meadowTrees }, near, trng, { castShadow: true, variants: 3 }));
  outside.add(fluffyForest({ shape: 'broad', ...meadowTrees }, broad, trng, { castShadow: true, variants: 1 }));
  outside.add(fluffyForest({ shape: 'poplar', trunk: 0x5a4a38, leaves: [0x5a8a3a, 0x4a7a34] }, poplars, trng, { castShadow: true, variants: 2 }));
  outside.add(fluffyForest({ shape: 'conifer', trunk: 0x4a3426, leaves: [0x2f5a3a, 0x3a6a44, 0x28503a] }, conifers, trng, { castShadow: false, variants: 2 }));
  // rocks: grey boulders along the shore and in the grass, bigger ones on the hills
  {
    const rockMat = charToon({ map: granite(0x9a968a, 1765), rim: 0.25 });
    const geos = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const s = 0.75 + 0.45 * fbm(v.x * 1.3 + k * 7, v.z * 1.3 + v.y * 1.1, 3); v.multiplyScalar(s); v.y *= 0.62; p.setXYZ(i, v.x, v.y, v.z); }
      g.computeVertexNormals();
      return g;
    });
    const pl: Placement[][] = [[], [], []];
    for (let i = 0; i < 4000 && pl.flat().length < (low ? 40 : 70); i++) {
      const x = trng.range(-200, 140), z = trng.range(-1850, -1530);
      const L = lakeInfo(x, z), r = Math.hypot(x / 170, (z + 1660) / 200);
      const shore = L.out > 0.3 && L.out < 6;
      if (!shore && !(r > 0.85 && trng.chance(0.4)) && !trng.chance(0.08)) continue;
      if (lateral(x, z).d < 6 || nearTrack(x, z) < 20 || hutDist(x, z) < 7 || L.out < 0.3) continue;
      const s = r > 0.85 ? trng.range(2.5, 5) : trng.range(0.6, 1.8);
      pl[trng.int(0, 2)].push({ x, y: ground(x, z) - s * 0.15, z, scale: s, rot: trng.range(0, TAU) });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    pl.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geos[k], rockMat, list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot); im.setMatrixAt(i, m.compose(ps.set(p.x, p.y, p.z), q, sc.setScalar(p.scale))); });
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
      im.castShadow = true; im.receiveShadow = true;
      outside.add(im);
    });
  }

  // ---------------------------------------------------------------- Turnip Head
  const th = makeTurnipHead();
  outside.add(th.group);
  const thHeading = new Heading(0, 1.6, 0.8);
  /** He waits at z -1585, hops along nine units ahead of the rider, and stops at the water's edge. */
  const thZ = (zr: number) => clamp(zr - 9, -1640, -1585);
  let thLastZ = thZ(-1500);

  // ---------------------------------------------------------------- the room, Calcifer, and their lights
  const room = buildCastleRoom(new Rng(1767));
  group.add(room.group);
  const cal = makeCalcifer();
  cal.group.position.copy(room.calcifer.pos);
  cal.group.rotation.y = room.calcifer.yaw;
  cal.group.scale.setScalar(1.15);
  room.group.add(cal.group);
  const calSpot = { from: road.u(-1736), to: road.u(-1812), pos: room.calciferLight.clone(), color: 0xff8a3a, intensity: 45, distance: 24, flicker: 2.5 };
  lights.add(calSpot);
  lights.add({ from: road.u(-1748), to: road.u(-1800), pos: room.fillLight.clone(), color: 0xffc888, intensity: 16, distance: 20 });

  // ---------------------------------------------------------------- the Catbus on the water
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 10), new THREE.MeshBasicMaterial({ map: wakeTexture(), transparent: true, depthWrite: false, opacity: 0.6 }));
  wake.rotation.x = -Math.PI / 2; wake.renderOrder = 2; wake.visible = false;
  outside.add(wake);
  const lastPos = new THREE.Vector3();
  let havePos = false, pawDist = 0, pawSide = 1;
  const prng = new Rng(1769);
  const onWater = (z: number) => z < -1645.2 && z > -1711;

  // ---------------------------------------------------------------- subjects
  // each one switches itself on and off by the rider's z (their update runs every frame, wherever the rider is)
  const within = (z: number, z0: number, z1: number) => z <= z0 && z > z1;
  const castleS: Subject = new Subject({
    id: 'castle', name: "Howl's moving castle", from: FILMS.howl, group: castle.body, radius: 17, base: 1450, rarity: 'legendary',
    hint: 'It strides across the meadow on four bird legs, ahead of you on the right, wades through the lake, then turns round and sits down with its door on your path. Play the ocarina and it hops and puffs smoke from every chimney; an acorn makes a cannon sneeze.',
    poses: { hop: { label: 'A happy hop', mult: 1.8 }, sneeze: { label: 'Cannon sneeze', mult: 1.4 } },
    centerOffset: new THREE.Vector3(0, 17, 0), facing: forwardOf(castle.group), maxDistance: 320, reactRange: 26,
    update: (_dt, ride) => { castleS.active = within(ride.position.z, -1505, -1762); },
    onCall: () => { castle.hop(); castleS.setPose('hop', 1.8); return true; },
    onItem: () => { castle.sneeze(); castleS.setPose('sneeze', 1.4); return true; },
  });
  const thS: Subject = new Subject({
    id: 'turniphead', name: 'Turnip Head', from: FILMS.howl, group: th.group, radius: 1.6, base: 900, rarity: 'rare',
    hint: 'The scarecrow hops along on his one leg on the left of the path, from the flowers down to the lake shore. Play the ocarina and he bows and tips his hat; throw an acorn and he spins round on his stick.',
    poses: { bow: { label: 'Turnip Head tips his hat', mult: 1.6 }, spin: { label: 'A spin on one leg', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 2.1, 0), facing: forwardOf(th.group), maxDistance: 110, reactRange: 9,
    update: (_dt, ride) => { thS.active = within(ride.position.z, -1505, -1705); },
    onCall: () => { th.bow(); thS.setPose('bow', 1.6); return true; },
    onItem: () => { th.spin(); thS.setPose('spin', 1.5); return true; },
  });
  const calS: Subject = new Subject({
    id: 'calcifer', name: 'Calcifer', from: FILMS.howl, group: cal.group, radius: 1.1, base: 1300, rarity: 'legendary', swallows: true,
    hint: 'The fire demon in the hearth, on the left as you come in at the castle door. Throw him an acorn and he gulps it down and flares up; play the ocarina and he grins.',
    poses: { flare: { label: 'Calcifer flares up', mult: 2.0 }, grin: { label: "Calcifer's grin", mult: 1.6 } },
    centerOffset: new THREE.Vector3(0, 1.0, 0), facing: forwardOf(cal.group), maxDistance: 50, reactRange: 5,
    update: (_dt, ride) => { calS.active = within(ride.position.z, -1736, -1812); },
    onItem: () => { cal.swallow(); calS.setPose('flare', 2.6); return true; },
    onCall: () => { cal.grin(); calS.setPose('grin', 1.8); return true; },
  });
  const hutAnchor = new THREE.Object3D();
  hutAnchor.position.set(HUT.x + 2.5, ground(HUT.x, HUT.z) + 4, HUT.z);
  outside.add(hutAnchor);
  const hutS: Subject = new Subject({
    id: 'hut', name: "Howl's hut and windmill", from: FILMS.howl, group: hutAnchor, radius: 6, base: 400,
    hint: "Howl's childhood hut on the near shore of the lake, on the left, with a little windmill beside it. Play the ocarina and the windmill whirls.",
    poses: { whirl: { label: 'The windmill whirls', mult: 1.4 } }, maxDistance: 160, reactRange: 20,
    update: (_dt, ride) => { hutS.active = within(ride.position.z, -1505, -1700); },
    onCall: () => { hut.whirl(); hutS.setPose('whirl', 3); return true; },
  });
  const subjects = [castleS, thS, calS, hutS];

  let inside = false, settled = false;
  return {
    id: 'meadow', group, show: [road.u(-1500), road.u(-1815)], occluders: [castle.proxy], subjects,
    water: 0,
    floor: (x, z) => {
      const R = CASTLE_ROOM;
      if (inside && z < R.z0 && z > R.z1 && Math.abs(x) < R.halfW) return R.floorY;
      if (settled && z <= -1732.6 && z > -1759.4 && Math.abs(x) < 2.6) return road.at(z).y;
      if (settled && z <= -1759.4 && z > -1796 && Math.abs(x) < 7.9) return 15.4;
      return ground(x, z);
    },
    onItemLand(pos) {
      if (inside) return;
      if (ground(pos.x, pos.z) < -0.02 && pos.y < 0.5) {
        ripples.add(pos.x, pos.z, 2.2, 1.4);
        smoke.emit(pos.clone().setY(0.2), { n: 4, vel: new THREE.Vector3(0, 2.5, 0), spread: 0.8, size: 0.3, grow: 2, life: 0.8, color: 0xf4f8fa, alpha: 0.8 });
      } else {
        smoke.emit(pos.clone().setY(pos.y + 0.3), { n: 5, vel: new THREE.Vector3(0, 1.4, 0), spread: 1.0, size: 0.18, grow: 1.5, life: 1.2, color: rng.pick([0xf2a0c0, 0xfbf8ee, 0xf7d43a, 0x8fb4f0]), alpha: 0.9 });
      }
    },
    update(dt, t, ride) {
      const zr = ride.position.z;
      const fog = fogOf();
      const out = zr > HIDE_Z;
      inside = zr < -1762;
      settled = zr < ROOM_Z;
      outside.visible = out;
      room.group.visible = settled;
      castle.blocker.visible = !settled;
      // once sitting, only the heap above the door blocks photos (so Calcifer can be seen through the door)
      castle.proxy.position.y = settled ? 30 : 18; castle.proxy.scale.y = settled ? 0.5 : 1;

      if (out) {
        // ---- the castle ----
        castleDrive(zr);
        castle.update(dt, t, ground);
        const d = castle.drive;
        lake.update(t, fog, { x: d.x, z: d.z, yaw: d.yaw, lift: castle.body.position.y });
        // ---- the valley ----
        grass.update(t, camera);
        clouds.update(sky, fog ?? new THREE.FogExp2(0xead8b8, 0.0022), sunLight?.intensity ?? 2.2);
        mountains.update(fog, camera.position);
        hut.update(dt, t);
        petals.update(dt, t, camera.position);
        smoke.update(dt, fog);
        ripples.update(dt, fog);
        // ---- Turnip Head ----
        const tz = thZ(zr);
        const moved = Math.abs(tz - thLastZ);
        th.stride = moved < 3 ? moved : 0;
        thLastZ = tz;
        const tp = road.at(tz);
        th.group.position.set(tp.x - 6.5, ground(tp.x - 6.5, tz), tz);
        const toCam = Math.atan2(camera.position.x - th.group.position.x, camera.position.z - th.group.position.z);
        th.group.rotation.y = thHeading.update(toCam, dt);
        th.update(dt, t);
        // ---- paws on the lake: rings where they strike, spray, and a wake behind ----
        const water = onWater(zr);
        wake.visible = water;
        if (havePos && water) {
          const step = lastPos.distanceTo(ride.position);
          if (step < 5) pawDist += step;
          const tx = ride.tangent.x, tzv = ride.tangent.z, tl = Math.hypot(tx, tzv) || 1;
          const fx = tx / tl, fz = tzv / tl;
          while (pawDist > 0.75) {
            pawDist -= 0.75;
            pawSide = -pawSide;
            const along = prng.range(-2.7, 2.9);
            const px = ride.position.x + fx * along - fz * pawSide * 0.95, pz = ride.position.z + fz * along + fx * pawSide * 0.95;
            ripples.add(px, pz, prng.range(1.8, 2.6), 1.5);
            if (prng.chance(0.3)) smoke.emit(new THREE.Vector3(px, 0.25, pz), { n: 2, vel: new THREE.Vector3(0, 2.2, 0), spread: 0.8, size: 0.25, grow: 2.2, life: 0.7, color: 0xf4f8fa, alpha: 0.7, jitter: 0.2 });
          }
          wake.position.set(ride.position.x - fx * 6, 0.04, ride.position.z - fz * 6);
          wake.rotation.z = Math.atan2(fx, -fz);
        }
        lastPos.copy(ride.position); havePos = true;
      } else {
        havePos = false;
      }

      if (settled) {
        room.update(dt, t, zr);
        cal.update(dt, t, camera.position);
        lights.boost.set(calSpot, cal.glow);
      }
    },
  };
}
