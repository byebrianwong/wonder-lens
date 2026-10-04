import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { HeightGrid } from '../../../engine/HeightGrid';
import { buildTerrain, type Placement } from '../../../engine/Builders';
import { fluffyForest } from '../../../engine/Foliage';
import { addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { Drift } from '../../../engine/Particles';
import { Heading } from '../../../engine/Rig';
import { Rng, TAU, clamp, fbm, lerp, noise2, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, optimize, showRange, subCurve, type BuiltSet, type LightSpot, type SetContext } from '../common';
import {
  barkMaterial, woodMaterial, cedarTrunk, logAlong, rootAlong, branchGeometry, cedarCrownBlobs, heroCrown, cedarStand, instancedStretches,
  fernGeometry, fernMaterial, boulderGeometry, hangingMossGeometry, hangingMossMaterial, shelfGeometry, type CedarSpot,
} from '../forest/trees';
import { KodamaCrowd, type KodamaSpot } from '../forest/kodama';
import { PoolWater } from '../forest/pool';
import { MistLayer, Beams, Spray, type MistPuff, type Beam } from '../forest/air';
import { makeNightWalker } from '../forest/nightWalker';
import { makeForestSpirit, Blooms } from '../forest/forestSpirit';

/*
 * The Forest Spirit's wood before dawn (Princess Mononoke).
 *
 * In order along the ride:
 *  -595  the edge of the wood faces the fields: a wall of old cedars, two great ones framing the way in.
 *        The Catbus drops off the last pole onto a mossy root mound between them (y 5.5 at z -610).
 *  -615  the forest floor: moss, ferns, boulders, moonbeams through the mist, Kodama everywhere.
 *  -656  up onto a fallen giant cedar; along its mossy back (rising to y 7.5) and off its broken end.
 *  -750  down the bank to the spirit pool. The Night-Walker rises out of the far side of the pool.
 *  -770  along the shallows (paws at y 0.4, water at y 0), splashing; the Night-Walker walks across in
 *        front, close enough to look up at, then sinks back into the pool as first light comes.
 *  -830  the Forest Spirit steps out from behind the bushes on an islet to the right; flowers bloom under
 *        its hooves.
 *  -832  up the great root of the tallest cedar into the mist (y 40 at z -920; the screen is white by -910).
 *
 * Everything is keyed to the rider's z. Scenery is split into five stretches of z, each hidden when it is
 * far away. The set is drawn from z -160 (the edge of the wood can be seen from the tree top and all the
 * way over the fields) until z -926, while the screen is still fully white.
 */

const F = SETS.forest;
/** The spirit pool: an ellipse of still water at y 0 round this centre. */
const POOL = { x: 4, z: -834, ax: 112, az: 68 };
/** The tallest cedar, whose great root the path climbs. */
const GREAT = { x: -14, z: -930 };
/** Islets in the pool: centre, radius, height of the top. The first is the Forest Spirit's. */
const ISLETS = [
  { x: 27, z: -849, r: 17, h: 1.5 }, { x: -38, z: -800, r: 7, h: 1.1 }, { x: 54, z: -800, r: 6, h: 1.0 }, { x: 82, z: -850, r: 9, h: 1.3 },
  { x: -72, z: -826, r: 8, h: 1.2 }, { x: 34, z: -902, r: 6, h: 1.1 }, { x: -88, z: -868, r: 7, h: 1.0 },
];
/** The fallen cedar lies along the path between these z (its top is the path). */
const LOG = { z0: -656, z1: -731 };
/** The great root runs along the path from the water up to the trunk of the tallest cedar. */
const ROOT = { z0: -826, z1: -921 };
/** Stretches of z; each one's scenery is hidden on its own when far away. The first is the edge of the wood. */
const ST: Array<[number, number]> = [[-586, -626], [-626, -700], [-700, -776], [-776, -850], [-850, -962]];
/** The Night-Walker's walk across the far side of the pool: rises at the first point, sinks at the last. */
const WALK = [[-34, -856], [-12, -850], [4, -853], [26, -870], [44, -882]];
/** The Forest Spirit's walk on its islet: out from behind the thicket, round to the shore facing the path, then slowly along it. */
const DEER_A = [[31.5, -857], [27, -860], [21.5, -856], [20, -847]];
const DEER_B = [[20, -847], [19.5, -851], [21, -855]];
/** The thicket on the Forest Spirit's islet that hides it until it steps out. */
const THICKET = { x0: 24.5, x1: 30, z0: -840, z1: -856 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildForest(ctx: SetContext): BuiltSet {
  const { road, lights, lowDetail } = ctx;
  const rng = new Rng(7310);
  const D = lowDetail ? 0.6 : 1;
  const group = new THREE.Group();
  const live = new THREE.Group();
  group.add(live);
  const stretch = ST.map(() => new THREE.Group());
  const heroes = ST.map(() => new THREE.Group());
  stretch.forEach((s, i) => { s.add(heroes[i]); group.add(s); });
  const stretchOf = (z: number) => { for (let i = 0; i < ST.length; i++) if (z <= ST[i][0] && z > ST[i][1]) return i; return z > ST[0][0] ? 0 : ST.length - 1; };
  const at = (z: number) => road.at(z);
  const latOf = (x: number, z: number) => Math.abs(x - at(z).x);

  // =========================================================================================
  // the ground
  // =========================================================================================
  const logR = (z: number) => lerp(1.3, 3.3, Math.pow(clamp((LOG.z0 - z) / (LOG.z0 - LOG.z1), 0, 1), 0.75));
  const lakeE = (x: number, z: number) => Math.hypot((x - POOL.x) / POOL.ax, (z - POOL.z) / POOL.az) + (noise2(x * 0.045 + 3, z * 0.045) - 0.5) * 0.16;
  const natural = (x: number, z: number) => {
    let h = 1.3 + (fbm(x * 0.025 + 11, z * 0.025, 4) - 0.5) * 3.2 + (fbm(x * 0.11, z * 0.11 + 5, 2) - 0.5) * 0.9;
    // the wood rises gently away from the path on both sides, so the trees stand in tiers into the mist
    h += Math.min(22, Math.max(0, latOf(x, z) - 40) * 0.14);
    // a little higher at the edge of the wood, falling to the fields in front of it
    h += 1.2 * (1 - smoothstep(-606, -640, z));
    return lerp(-1.6, h, smoothstep(-589, -603, z));
  };
  const shape = (x: number, z: number) => {
    let h = natural(x, z);
    // the spirit pool: a shallow basin, deepest in the middle
    const e = lakeE(x, z);
    const bed = -1.1 - 1.5 * smoothstep(0.8, 0.3, e) + (noise2(x * 0.08, z * 0.08) - 0.5) * 0.5;
    h = lerp(h, bed, 1 - smoothstep(0.86, 1.0, e));
    for (const s of ISLETS) {
      const d = Math.hypot(x - s.x, z - s.z) + (noise2(x * 0.3, z * 0.3 + s.r) - 0.5) * 2;
      h = lerp(h, s.h + (noise2(x * 0.2, z * 0.2) - 0.5) * 0.6, 1 - smoothstep(s.r * 0.45, s.r, d));
    }
    // the mound the tallest cedar stands on, rising out of the far shore
    const md = Math.hypot(x - GREAT.x, z - GREAT.z);
    h = lerp(h, 2.5 + 6 * Math.max(0, 1 - md / 50) + (noise2(x * 0.1, z * 0.1) - 0.5), 1 - smoothstep(26, 50, md));
    // the path: the ground is exactly under the paws where they run on it
    const p = at(z), lat = Math.abs(x - p.x);
    const wA = smoothstep(-597, -608, z) * (1 - smoothstep(-656, -660, z));
    const wB = smoothstep(-743, -747, z) * (1 - smoothstep(-764, -768, z));
    const wS = smoothstep(-766, -771, z) * (1 - smoothstep(-830, -836, z));
    h = lerp(h, p.y - 0.03, Math.max(wA, wB) * (1 - smoothstep(3.2, 9, lat)));
    h = lerp(h, -0.45, wS * (1 - smoothstep(4, 14, lat)));
    // under the fallen cedar: a slight hollow, so the log lies in the moss rather than on top of it
    const wL = smoothstep(-658, -664, z) * (1 - smoothstep(-729, -734, z));
    if (wL > 0) { const R = logR(z); h = lerp(h, Math.min(h, p.y - 2 * R + 0.6), wL * (1 - smoothstep(R, R + 5, lat))); }
    // where the paws run on the ground or the water, nothing rises above them
    if ((z < -607 && z > -658) || (z < -746 && z > -840)) h = Math.min(h, p.y - 0.03 + smoothstep(3, 8, lat) * 100);
    // where the fields' own ground (the meadow and the bank they built) reaches in, tuck under it
    // (under the path their bank only carries the paws as far as z -621; from there on this ground does)
    if (z > -650) h -= 0.35 * smoothstep(-650, -640, z) * (1 - smoothstep(168, 174, Math.abs(x))) * lerp(1, smoothstep(-624, -619, z), 1 - smoothstep(9, 14, lat));
    if (z > -690) h -= 3 * smoothstep(-690, -680, z) * smoothstep(160, 168, Math.abs(x));
    return h;
  };
  const grid = new HeightGrid(-240, 240, -962, -594, 2, shape);
  const ground = (x: number, z: number) => grid.sample(x, z);
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(terrainMat, paintedDetailTexture(927, 512, 2400), { scaleA: 24, scaleB: 6, strength: 0.75 });
  const tc = new THREE.Color();
  const colour = (x: number, z: number, y: number, slope: number, out: THREE.Color) => {
    const n = fbm(x * 0.06 + 7, z * 0.06, 3), n2 = noise2(x * 0.2, z * 0.2);
    if (y < -0.15) {
      // the bed of the pool: pale moss and sand in the shallows, dark olive in the deep
      out.set(0x6a6e4a).lerp(tc.set(0x2a3a2c), smoothstep(-0.2, -2.2, y));
    } else {
      out.set(0x2c522e).lerp(tc.set(0x4c7a38), n);
      out.lerp(tc.set(0x4a3a2a), smoothstep(0.62, 0.8, fbm(x * 0.03, z * 0.03 + 9, 2)) * 0.6);
      if (y < 0.5) out.lerp(tc.set(0x4a4632), (1 - smoothstep(-0.15, 0.5, y)) * 0.7);
    }
    out.lerp(tc.set(0x3a3024), clamp(slope * 2.5, 0, 0.6));
    out.multiplyScalar(0.88 + n2 * 0.24);
  };
  ST.forEach(([z0, z1], i) => {
    const t = buildTerrain({ xMin: -240, xMax: 240, zMin: Math.max(z1, -962), zMax: Math.min(z0, -594), res: 2, chunk: 480, height: (x, z) => grid.sample(x, z), color: colour, material: terrainMat });
    t.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.receiveShadow = true; });
    stretch[i].add(t);
  });

  /** Is a point clear of the path (and of the log and the great root along it) by `m`? */
  const clearOfPath = (x: number, z: number, m: number) => {
    const p = at(z), lat = Math.abs(x - p.x);
    let need = m;
    if (z <= LOG.z0 + 2 && z >= LOG.z1 - 2) need = Math.max(need, logR(z) + m * 0.6);
    if (z <= ROOT.z0 && z >= -935) need = Math.max(need, 6.5 + Math.max(0, p.y + 3) * 0.62 + m * 0.5);
    return lat > need;
  };
  const dry = (x: number, z: number, above = 0.25) => ground(x, z) > above;
  /** Solid ground for thrown items: the terrain, the fallen cedar's back and the great root's crest. */
  const floorAt = (x: number, z: number) => {
    let h = grid.sample(x, z);
    const p = at(z), lat = Math.abs(x - p.x);
    if (z <= LOG.z0 && z >= LOG.z1) { const R = logR(z); if (lat < R) h = Math.max(h, p.y - R + Math.sqrt(R * R - lat * lat)); }
    if (z <= ROOT.z0 - 8 && z >= ROOT.z1 && lat < 3) h = Math.max(h, p.y - lat * lat * 0.12);
    return h;
  };

  // =========================================================================================
  // great trees by the path (each one built on its own)
  // =========================================================================================
  const bark = barkMaterial(), wood = woodMaterial();
  const taken: Array<{ x: number; z: number; r: number }> = [];
  const occl = new THREE.Group();
  occl.visible = false;
  group.add(occl);
  const proxyMat = new THREE.MeshBasicMaterial();
  /** an invisible stand-in for a trunk, so a photo through a trunk counts as hidden */
  const trunkProxy = (x: number, y: number, z: number, r: number, h: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.2, h, 8), proxyMat);
    m.position.set(x, y + h / 2, z);
    m.updateMatrixWorld(true);
    occl.add(m);
  };
  const kspots: KodamaSpot[] = [];
  const hang: Array<{ m: THREE.Matrix4; z: number }> = [];
  const shelves: Array<{ m: THREE.Matrix4; z: number }> = [];
  const up = V(0, 1, 0);
  /** The way a Kodama at `p` should face: towards the path a little behind it, where the rider comes from. */
  const faceRider = (p: THREE.Vector3) => { const q = at(p.z + 10); return Math.atan2(q.x - p.x, p.z + 10 - p.z) + rng.range(-0.4, 0.4); };
  const kod = (p: THREE.Vector3, s = rng.range(0.75, 1.2), tilt = 0, yaw?: number) => {
    // never in the Catbus's way
    const q = at(p.z);
    if (Math.abs(p.x - q.x) < 2.3 && p.y > q.y - 1.3) return;
    kspots.push({ p: p.clone(), yaw: yaw ?? faceRider(p), s, tilt });
  };
  const strand = (top: THREE.Vector3, len: number) => {
    hang.push({ m: new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromAxisAngle(up, rng.range(0, TAU)), V(rng.range(0.8, 1.3), len, rng.range(0.8, 1.3))), z: top.z });
  };
  /** The angle round a trunk (0 faces +z, growing towards -x) that faces a direction over the ground. */
  const thToward = (dx: number, dz: number) => Math.atan2(-dx, dz);

  const heroCedar = (o: { x: number; z: number; r: number; height: number; seed: number; lobes?: number; leaf?: number; branches?: number; kodama?: number; shelves?: number; crown?: boolean }) => {
    const si = stretchOf(o.z);
    const hr = new Rng(o.seed);
    const y0 = Math.min(ground(o.x, o.z), ground(o.x + o.r, o.z), ground(o.x - o.r, o.z), ground(o.x, o.z + o.r), ground(o.x, o.z - o.r)) - 0.4;
    // a snapped trunk (no crown) keeps its girth to the top
    const tr = cedarTrunk({ height: o.height, r0: o.r, rTop: o.r * (o.crown === false ? 0.85 : 0.42), flare: o.r * 1.1, flareH: o.r * 1.2, lobes: o.lobes ?? 6, seed: o.seed, radial: 36, rings: 46, sink: 4, bend: o.r * 0.5, mossH: o.r * 4 });
    const trunk = new THREE.Mesh(tr.geometry, bark);
    trunk.position.set(o.x, y0, o.z);
    trunk.castShadow = true; trunk.receiveShadow = true;
    heroes[si].add(trunk);
    const base = V(o.x, y0, o.z);
    const surf = (y: number, th: number) => tr.surfaceAt(y - y0, th).add(base);
    taken.push({ x: o.x, z: o.z, r: o.r * 1.6 });
    trunkProxy(o.x, y0, o.z, o.r * 1.15, o.height * 0.7);
    if (o.crown !== false) {
      const blobs = cedarCrownBlobs(o.height / o.r, hr, 0.42).map((b) => ({ c: b.c.multiplyScalar(o.r).add(base), r: b.r.multiplyScalar(o.r) }));
      stretch[si].add(heroCrown(blobs, o.leaf ?? 0x2a4a34, hr, { density: 0.1, cardScale: 1.6 }));
    }
    // which way the path is from this tree
    const q = at(o.z);
    const thPath = thToward(q.x - o.x, q.z + 8 - o.z);
    // dead lower branches with lichen hanging from them, pointing away from the path, some with a Kodama on
    for (let b = 0; b < (o.branches ?? 2); b++) {
      const y = y0 + o.r * hr.range(3.2, 5.5);
      const th = thPath + Math.PI * hr.range(0.45, 1.55) * (b % 2 ? 1 : -1);
      const s0 = surf(y, th);
      const out = V(-Math.sin(th), 0, Math.cos(th));
      const a = s0.clone().addScaledVector(out, -0.6);
      const len = o.r * hr.range(1.8, 2.8);
      const dir = out.clone().add(V(0, hr.range(0.15, 0.35), 0)).normalize();
      const end = a.clone().addScaledVector(dir, len);
      const g = new THREE.Mesh(branchGeometry(a, end, o.r * 0.16, o.r * 0.05), bark);
      g.castShadow = true; g.receiveShadow = true;
      heroes[si].add(g);
      for (let k = 1; k <= 4; k++) strand(a.clone().lerp(end, 0.2 + k * 0.18).add(V(0, -o.r * 0.1, 0)), hr.range(3, 7));
      if (b < (o.kodama ?? 1)) kod(a.clone().lerp(end, 0.5).add(V(0, o.r * 0.12, 0)), hr.range(0.8, 1.0));
    }
    // shelf fungi up the side that faces the path, most with a Kodama sitting on them
    for (let k = 0; k < (o.shelves ?? 3); k++) {
      const y = y0 + 2.2 + k * hr.range(2.2, 3.4);
      const th = thPath + hr.range(-0.9, 0.9);
      const p = surf(y, th).addScaledVector(V(-Math.sin(th), 0, Math.cos(th)), -0.15);
      const sz = hr.range(1.4, 2.2);
      // the shelf sticks out along its +z; turning it by -th points that outwards from the bark
      shelves.push({ m: new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(up, -th), V(sz, sz, sz)), z: p.z });
      if (hr.chance(0.8)) kod(p.clone().add(V(-Math.sin(th) * sz * 0.22, sz * 0.15, Math.cos(th) * sz * 0.22)), hr.range(0.7, 0.9));
    }
    // Kodama on the buttress roots at the foot of the trunk, some peeking round the sides
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 1 : -1;
      const th = thPath + side * hr.range(0.3, 1.5);
      const y = y0 + 0.4 + hr.range(0.2, 1.6);
      const p = surf(y, th).addScaledVector(V(-Math.sin(th), 0, Math.cos(th)), 0.2);
      p.y = Math.max(p.y, ground(p.x, p.z));
      kod(p, hr.range(0.8, 1.15), Math.abs(th - thPath) > 1.1 ? side * 0.45 : 0);
    }
    return { base, surf, y0 };
  };

  // the two great cedars that frame the way in at the edge of the wood
  heroCedar({ x: -17, z: -606, r: 4.6, height: 92, seed: 31, lobes: 7, branches: 3, kodama: 2, shelves: 3 });
  heroCedar({ x: 11, z: -609, r: 4.2, height: 86, seed: 32, lobes: 6, branches: 3, kodama: 2, shelves: 3 });
  // great cedars along the floor of the wood
  heroCedar({ x: 15, z: -632, r: 3.8, height: 78, seed: 33 });
  heroCedar({ x: -18, z: -664, r: 4.4, height: 88, seed: 34, shelves: 4 });
  heroCedar({ x: 19, z: -690, r: 3.6, height: 74, seed: 35 });
  heroCedar({ x: -17, z: -716, r: 3.4, height: 70, seed: 36, kodama: 2 });
  heroCedar({ x: 21, z: -748, r: 3.8, height: 80, seed: 37 });
  heroCedar({ x: -19, z: -756, r: 3.2, height: 68, seed: 38 });
  // a snapped cedar: a tall stump with a jagged top, Kodama on its rim
  {
    const sn = heroCedar({ x: -11, z: -741, r: 3.0, height: 24, seed: 39, crown: false, branches: 1, kodama: 1, shelves: 2 });
    const top = sn.y0 + 24;
    for (let k = 0; k < 14; k++) {
      const th = (k / 14) * TAU;
      const p = sn.surf(top - 0.3, th).lerp(V(-11, top - 0.3, -741), 0.12);
      const h = rng.range(0.8, 4.2);
      const c = new THREE.Mesh(new THREE.ConeGeometry(rng.range(0.35, 0.7), h, 5), wood);
      c.position.copy(p).add(V(0, h / 2 - 0.2, 0));
      c.rotation.set(rng.range(-0.25, 0.25), rng.range(0, TAU), rng.range(-0.25, 0.25));
      heroes[2].add(c);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.45, 18).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6a4c34 }));
    disc.position.set(-11, top - 0.6, -741);
    heroes[2].add(disc);
    for (const th of [0.4, 2.2, 4.0]) kod(sn.surf(top - 0.4, th).lerp(V(-11, top, -741), 0.35).setY(top - 0.2), 0.85);
  }

  // =========================================================================================
  // the fallen giant cedar, its top exactly under the path
  // =========================================================================================
  {
    const curve = subCurve(road, LOG.z0, LOG.z1, 50);
    const radius = (t: number) => logR(lerp(LOG.z0, LOG.z1, t));
    const log = new THREE.Mesh(logAlong(curve, radius, { segs: 90, radial: 30, seed: 41 }), bark);
    log.castShadow = true; log.receiveShadow = true;
    heroes[1].add(log);
    const frame = (t: number) => {
      const p = curve.getPointAt(t), T = curve.getTangentAt(t);
      const side = V().crossVectors(T, up).normalize();
      const upv = V().crossVectors(side, T).normalize();
      const r = radius(t);
      return { p, T, side, upv, r, c: p.clone().addScaledVector(upv, -r) };
    };
    // the old crown end, worn and dark, and the broken end, pale and splintered
    const f0 = frame(0), f1 = frame(1);
    const endDisc = (f: ReturnType<typeof frame>, mat: THREE.Material, back: boolean) => {
      const d = new THREE.Mesh(new THREE.CircleGeometry(f.r * 0.97, 24), mat);
      d.position.copy(f.c);
      d.quaternion.setFromUnitVectors(V(0, 0, 1), f.T.clone().multiplyScalar(back ? -1 : 1));
      heroes[1].add(d);
    };
    endDisc(f0, new THREE.MeshLambertMaterial({ color: 0x5a4632 }), true);
    endDisc(f1, wood, false);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const rim = f1.c.clone().addScaledVector(f1.side, Math.cos(a) * f1.r * 0.85).addScaledVector(f1.upv, Math.sin(a) * f1.r * 0.85);
      const h = rng.range(0.8, 3.2) * (Math.sin(a) > 0.5 ? 0.5 : 1);
      const c = new THREE.Mesh(new THREE.ConeGeometry(rng.range(0.3, 0.6), h, 5), wood);
      c.quaternion.setFromUnitVectors(up, f1.T.clone().add(V(rng.range(-0.3, 0.3), rng.range(-0.2, 0.3), rng.range(-0.3, 0.3))).normalize());
      c.position.copy(rim).addScaledVector(f1.T, h / 2 - 0.3);
      heroes[1].add(c);
    }
    // snapped branch stubs on its flanks, pointing out and a little up, clear of the path; Kodama sit on some
    for (const [t, s] of [[0.22, 1], [0.38, -1], [0.55, 1], [0.7, -1], [0.86, 1], [0.93, -1]] as Array<[number, number]>) {
      const f = frame(t);
      const a = f.c.clone().addScaledVector(f.side, s * f.r * 0.7).addScaledVector(f.upv, f.r * 0.3);
      const dir = f.side.clone().multiplyScalar(s).addScaledVector(up, 0.35).normalize();
      const end = a.clone().addScaledVector(dir, f.r + 2.4);
      const b = new THREE.Mesh(branchGeometry(a, end, f.r * 0.22, 0.18), bark);
      b.castShadow = true;
      heroes[1].add(b);
      if (s > 0 || t > 0.6) kod(a.clone().lerp(end, 0.78).add(V(0, f.r * 0.12, 0)), 0.8);
      strand(a.clone().lerp(end, 0.6), rng.range(1.5, 3));
    }
    // Kodama on the moss beside the log, both sides, looking up as the Catbus runs past
    for (let z = LOG.z0 - 6; z > LOG.z1 + 2; z -= rng.range(3.5, 6)) {
      const s = rng.sign(), p = at(z), R = logR(z);
      const x = p.x + s * (R + rng.range(0.7, 2.2));
      kod(V(x, ground(x, z), z), rng.range(0.8, 1.2), 0, Math.atan2(p.x - x, 6) + rng.range(-0.3, 0.3));
    }
  }

  // two roots across the forest floor, half sunk in the moss; the Catbus hops over them
  for (const rz of [-627, -639]) {
    const p = at(rz);
    const pts = [V(p.x - 11, ground(p.x - 11, rz + 2) - 0.2, rz + 2), V(p.x - 3, p.y + 0.1, rz + 0.4), V(p.x + 3, p.y + 0.1, rz - 0.4), V(p.x + 11, ground(p.x + 11, rz - 2) - 0.2, rz - 2)];
    const root = new THREE.Mesh(logAlong(new THREE.CatmullRomCurve3(pts), () => 0.38, { segs: 30, radial: 10, seed: rz }), bark);
    root.receiveShadow = true;
    heroes[stretchOf(rz)].add(root);
  }

  // smaller fallen trunks lying about the wood
  for (let i = 0, n = 0; i < 80 && n < 10; i++) {
    const z = rng.range(-618, -770), s = rng.sign(), x = at(z).x + s * rng.range(12, 60);
    const len = rng.range(10, 22), ang = rng.range(-1, 1), r = rng.range(0.8, 1.5);
    const dx = Math.sin(ang) * len / 2, dz = Math.cos(ang) * len / 2;
    if (!clearOfPath(x - dx, z - dz, 6) || !clearOfPath(x + dx, z + dz, 6) || !dry(x, z, 0.5)) continue;
    const a = V(x - dx, ground(x - dx, z - dz) + r * 1.3, z - dz), b = V(x + dx, ground(x + dx, z + dz) + r * 1.3, z + dz);
    const m = new THREE.Mesh(logAlong(new THREE.LineCurve3(a, b), (t) => r * (1 - t * 0.35), { segs: 12, radial: 14, seed: i }), bark);
    m.receiveShadow = true;
    heroes[stretchOf(z)].add(m);
    for (let k = 0; k < 2; k++) kod(a.clone().lerp(b, rng.range(0.2, 0.8)), rng.range(0.7, 1));
    n++;
  }

  // =========================================================================================
  // the tallest cedar, its great root (the path climbs it) and its spreading roots
  // =========================================================================================
  const greatY0 = ground(GREAT.x, GREAT.z) - 1;
  {
    const gt = cedarTrunk({ height: 175, r0: 10, rTop: 8.5, flare: 14, flareH: 10, lobes: 7, seed: 51, radial: 56, rings: 64, sink: 8, bend: 4, mossH: 30 });
    const trunk = new THREE.Mesh(gt.geometry, bark);
    trunk.position.set(GREAT.x, greatY0, GREAT.z);
    trunk.castShadow = true; trunk.receiveShadow = true;
    heroes[4].add(trunk);
    trunkProxy(GREAT.x, greatY0, GREAT.z, 11, 170);
    taken.push({ x: GREAT.x, z: GREAT.z, r: 18 });
    const base = V(GREAT.x, greatY0, GREAT.z);
    const hr = new Rng(52);
    // the crown, high in the mist: a great column and clumps on huge limbs
    const blobs: Array<{ c: THREE.Vector3; r: THREE.Vector3 }> = [];
    for (let i = 0; i < 7; i++) {
      const y = 92 + i * 14, r = lerp(20, 9, i / 6);
      blobs.push({ c: V(GREAT.x + hr.range(-3, 3), y, GREAT.z + hr.range(-3, 3)), r: V(r, r * 0.7, r) });
    }
    // huge limbs, none of them over the path or the way on into the sky
    for (const [th, y, len] of [[1.3, 74, 38], [2.4, 88, 42], [3.4, 70, 36], [-2.3, 82, 40], [-1.2, 96, 34], [0.6, 104, 30]] as Array<[number, number, number]>) {
      const out = V(-Math.sin(th), 0, Math.cos(th));
      const a = gt.surfaceAt(y - greatY0, th).add(base).addScaledVector(out, -2);
      const end = a.clone().addScaledVector(out.clone().add(V(0, 0.35, 0)).normalize(), len);
      const limb = new THREE.Mesh(branchGeometry(a, end, 2.6, 0.7), bark);
      heroes[4].add(limb);
      blobs.push({ c: end.clone().add(V(0, 3, 0)), r: V(11, 6, 11) });
      blobs.push({ c: a.clone().lerp(end, 0.6).add(V(0, 4, 0)), r: V(8, 5, 8) });
      for (let k = 0; k < 4; k++) strand(a.clone().lerp(end, 0.25 + k * 0.18), hr.range(6, 12));
    }
    stretch[4].add(heroCrown(blobs, 0x24402e, hr, { density: 0.06, cardScale: 2.0 }));

    // the great root: a broad buttress from under the water up to the trunk, its sides flaring wide down to
    // the pool and the moss, so it reads as the foot of the tree; its crest is the path
    const rc = subCurve(road, ROOT.z0, ROOT.z1, 70);
    const ridge = new THREE.Mesh(rootAlong(rc, {
      width: (t) => [lerp(5, 6.5, smoothstep(0, 0.6, t)) + 6 * smoothstep(0.72, 1, t), lerp(5, 6, smoothstep(0, 0.6, t)) + 1.2 * smoothstep(0.8, 1, t)],
      drop: (t) => 0.7 * (1 - smoothstep(0, 0.12, t)),
      bottom: () => -3,
      flare: 0.6,
      segs: 100, seed: 53,
    }), bark);
    ridge.castShadow = true; ridge.receiveShadow = true;
    heroes[4].add(ridge);
    // Kodama on the ground beside the great root, outside its flaring sides
    for (let k = 0; k < 12; k++) {
      const t = 0.1 + k * 0.07, p = rc.getPointAt(t), s = k % 2 ? 1 : -1;
      const x = p.x + s * (6.8 + Math.max(0, p.y + 3) * 0.62 + rng.range(0.3, 2));
      const gy = ground(x, p.z);
      if (gy > -0.05) kod(V(x, gy, p.z), rng.range(0.8, 1.1));
    }

    // spreading roots: long ridges running down from the trunk into the moss and the pool
    const kTh = Math.atan2(-14, 70);
    for (const [ang, reach, y1] of [[kTh + 0.75, 62, 26], [kTh - 0.7, 58, 24], [kTh + 1.6, 52, 22], [kTh - 1.6, 50, 22], [kTh + 2.5, 46, 20], [kTh - 2.5, 46, 20], [Math.PI + kTh, 44, 18]] as Array<[number, number, number]>) {
      const out = V(-Math.sin(ang), 0, Math.cos(ang));
      const start = gt.surfaceAt(y1, ang).add(base).addScaledVector(out, -3);
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        const d = lerp(start.distanceTo(V(GREAT.x, start.y, GREAT.z)), reach, f);
        const side = V(out.z, 0, -out.x).multiplyScalar(Math.sin(f * 3 + ang) * 2.5 * f);
        const q = V(GREAT.x, 0, GREAT.z).addScaledVector(out, d).add(side);
        const gy = ground(q.x, q.z);
        q.y = lerp(start.y, Math.min(gy, 0.2) - 0.6, Math.pow(f, 0.6));
        q.y = Math.max(q.y, gy - 1.2 + (1 - f) * 3);
        pts.push(q);
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const root = new THREE.Mesh(rootAlong(curve, { width: (t) => { const w = lerp(4.2, 1.2, t); return [w, w]; }, bottom: () => -3, segs: 40, seed: Math.round(ang * 10) }), bark);
      root.receiveShadow = true;
      heroes[4].add(root);
      for (let k = 0; k < 5; k++) {
        const p = curve.getPointAt(0.3 + k * 0.13);
        if (p.y > 0.1) kod(p.clone().add(V(0, 0.05, 0)), rng.range(0.75, 1.1));
      }
    }
    // Kodama round the foot of the trunk
    for (let k = 0; k < 14; k++) {
      // either side of the great root, not on it
      const th = kTh + rng.sign() * rng.range(0.4, 1.5), y = greatY0 + rng.range(2, 6);
      const p = gt.surfaceAt(y - greatY0, th).add(base).addScaledVector(V(-Math.sin(th), 0, Math.cos(th)), 0.3);
      p.y = Math.max(p.y, ground(p.x, p.z));
      kod(p, rng.range(0.8, 1.2), rng.range(-0.3, 0.3));
    }
  }

  // =========================================================================================
  // the wood: cedars in tiers fading into the mist
  // =========================================================================================
  const cedars: CedarSpot[] = [];
  const free = (x: number, z: number, r: number, k = 2.4) => taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > ((t.r + r) * k) ** 2);
  const addCedar = (x: number, z: number, s: number) => {
    cedars.push({ x, y: ground(x, z) - 0.25, z, s, rot: rng.range(0, TAU) });
    taken.push({ x, z, r: s });
  };
  // the edge: two staggered rows of big old cedars facing the fields, a gap between the gate trees
  for (let row = 0; row < 2; row++) for (let x = -158; x <= 158; x += rng.range(12, 18)) {
    const z = -600 - row * 11 + rng.range(-3, 3), s = rng.range(3.0, 4.6);
    if (Math.abs(x - at(z).x) < 24 || !free(x, z, s, 2.0)) continue;
    addCedar(x, z, s);
  }
  // further in: denser near the path, thinning out to the sides
  const want = Math.round(230 * D);
  for (let i = 0; i < 9000 && cedars.length < want; i++) {
    const z = rng.range(-616, -958), side = rng.sign();
    const lat = 9 + Math.pow(rng.next(), 1.5) * 190;
    const x = at(z).x + side * lat;
    if (Math.abs(x) > 236) continue;
    const s = rng.range(1.6, 4.4);
    if (!clearOfPath(x, z, 3 + s * 2.4) || !dry(x, z, 0.6) || Math.hypot(x - GREAT.x, z - GREAT.z) < 52 || !free(x, z, s)) continue;
    addCedar(x, z, s);
  }
  // a few small cedars on the islets
  for (const s of ISLETS) for (let k = 0; k < Math.round(s.r / 4); k++) {
    const a = rng.range(0, TAU), d = rng.range(0, s.r * 0.35);
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    // on the Forest Spirit's islet, only behind it, as a backdrop
    if (s === ISLETS[0] && x < s.x + 4) continue;
    if (dry(x, z, 0.5)) addCedar(x, z, rng.range(0.8, 1.3));
  }
  const leafCols = [0x22402e, 0x284832, 0x1e3a2a, 0x2c4c36];
  cedarStand(cedars, rng, { stretches: ST, castShadow: true, leaves: leafCols }).forEach((g, i) => stretch[i].add(g));
  for (const c of cedars) if (latOf(c.x, c.z) < 60 && c.s > 1.5) trunkProxy(c.x, c.y, c.z, c.s * 1.1, c.s * 14);
  // lichen hanging from the lowest boughs of the cedars near the path, and Kodama at their feet
  for (const c of cedars) {
    const lat = latOf(c.x, c.z);
    if (lat < 40 && c.s > 1.4) for (let k = 0; k < 3; k++) {
      const a = rng.range(0, TAU), d = c.s * rng.range(2.4, 3.6);
      strand(V(c.x + Math.cos(a) * d, c.y + c.s * 20 * 0.44, c.z + Math.sin(a) * d), rng.range(4, 9));
    }
    if (lat < 70 && rng.chance(0.35 * D)) {
      const q = at(c.z), dx = q.x - c.x, dz = 10, l = Math.hypot(dx, dz);
      const r = c.s * 1.9;
      const x = c.x + (dx / l) * r + rng.range(-1, 1), z = c.z + (dz / l) * r;
      kod(V(x, ground(x, z), z), rng.range(0.75, 1.2), rng.chance(0.3) ? rng.range(-0.5, 0.5) : 0);
    }
  }

  // =========================================================================================
  // undergrowth: bushes, young broadleaf trees, ferns, boulders, moss hanging, shelf fungi
  // =========================================================================================
  const bushes: Placement[] = [], young: Placement[] = [], skirt: Placement[] = [];
  for (let i = 0; i < 4000 && bushes.length < 300 * D; i++) {
    const z = rng.range(-604, -955), lat = 4.5 + Math.pow(rng.next(), 1.4) * 70, x = at(z).x + rng.sign() * lat;
    if (!clearOfPath(x, z, 4.8) || !dry(x, z, 0.4) || !free(x, z, 1.2, 1.3)) continue;
    bushes.push({ x, y: ground(x, z) - 0.2, z, scale: rng.range(1.6, 2.8), rot: rng.range(0, TAU) });
  }
  // the thicket on the Forest Spirit's islet, between it and the path until it steps out
  for (let k = 0; k < 10; k++) {
    const x = rng.range(THICKET.x0, THICKET.x1), z = lerp(THICKET.z0, THICKET.z1, (k + rng.range(0, 1)) / 10);
    bushes.push({ x, y: ground(x, z) - 0.2, z, scale: rng.range(2.6, 3.4), rot: rng.range(0, TAU) });
  }
  for (const [x, z] of [[27.5, -843], [26.5, -848], [28, -853]]) young.push({ x, y: ground(x, z) - 0.2, z, scale: 3.0, rot: rng.range(0, TAU) });
  for (let i = 0; i < 3000 && young.length < 90 * D; i++) {
    const z = rng.range(-612, -950), lat = 10 + Math.pow(rng.next(), 1.3) * 80, x = at(z).x + rng.sign() * lat;
    if (!clearOfPath(x, z, 9) || !dry(x, z, 0.5) || !free(x, z, 2, 1.6)) continue;
    young.push({ x, y: ground(x, z) - 0.2, z, scale: rng.range(1.6, 2.6), rot: rng.range(0, TAU) });
  }
  // the low leafy skirt along the edge of the wood, facing the fields
  for (let x = -160; x <= 160; x += rng.range(4, 7)) {
    const z = -595 + rng.range(-3, 2);
    if (Math.abs(x - at(z).x) < 8) continue;
    skirt.push({ x, y: ground(x, z) - 0.3, z, scale: rng.range(1.6, 2.6), rot: rng.range(0, TAU) });
  }
  ST.forEach(([z0, z1], i) => {
    const inS = (p: Placement) => p.z <= z0 && p.z > z1;
    const b = bushes.filter(inS), y = young.filter(inS), s = skirt.filter(inS);
    if (b.length) stretch[i].add(fluffyForest({ shape: 'bush', trunk: 0x3a2a20, leaves: [0x2a4a30, 0x325636, 0x284430, 0x3a5e3a], size: 1.4 }, b, rng, { variants: 3 }));
    if (y.length) stretch[i].add(fluffyForest({ shape: 'round', trunk: 0x4a3a2c, leaves: [0x2e5034, 0x365c3a, 0x2a4a32] }, y, rng, { castShadow: true, variants: 3 }));
    if (s.length) stretch[i].add(fluffyForest({ shape: 'broad', trunk: 0x3a2e24, leaves: [0x2a4a30, 0x34583a, 0x2f5034] }, s, rng, { variants: 2 }));
  });

  // ferns
  const ferns: Array<{ m: THREE.Matrix4; z: number; color: THREE.Color }> = [];
  const fernCols = [0x5a9a44, 0x4e8c3c, 0x68a44c, 0x467e38];
  for (let i = 0; i < 9000 && ferns.length < 760 * D; i++) {
    const z = rng.range(-596, -955), lat = 2.9 + Math.pow(rng.next(), 1.8) * 60, x = at(z).x + rng.sign() * lat;
    if (!clearOfPath(x, z, 2.9) || !dry(x, z, 0.15)) continue;
    const s = rng.range(0.9, 2.0);
    ferns.push({ m: new THREE.Matrix4().compose(V(x, ground(x, z) - 0.1, z), new THREE.Quaternion().setFromAxisAngle(up, rng.range(0, TAU)), V(s, s * rng.range(0.85, 1.15), s)), z, color: new THREE.Color(rng.pick(fernCols)).multiplyScalar(rng.range(0.85, 1.1)) });
  }
  instancedStretches(fernGeometry(new Rng(61)), fernMaterial(), ferns, ST).forEach((g, i) => stretch[i].add(g));

  // mossy boulders, some standing in the shallows
  const rocks: Array<Array<{ m: THREE.Matrix4; z: number }>> = [[], []];
  for (let i = 0; i < 3000 && rocks[0].length + rocks[1].length < 110 * D; i++) {
    const z = rng.range(-600, -950), lat = 4.5 + Math.pow(rng.next(), 1.5) * 60, x = at(z).x + rng.sign() * lat;
    if (!clearOfPath(x, z, 4.5) || !free(x, z, 1.5, 1.2)) continue;
    const gy = ground(x, z), s = rng.range(1.0, 3.8) * (gy < 0 ? 0.8 : 1);
    if (gy < -1.4) continue;
    const m = new THREE.Matrix4().compose(V(x, gy + s * 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.2, 0.2), rng.range(0, TAU), rng.range(-0.2, 0.2))), V(s * rng.range(1, 1.4), s, s * rng.range(1, 1.4)));
    rocks[i % 2].push({ m, z });
    if (rng.chance(0.3) && gy + s * 0.75 > 0.2) kod(V(x, gy + s * 0.15 + s * 0.68, z), rng.range(0.75, 1.0));
  }
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(rockMat, paintedDetailTexture(931, 256, 900), { scaleA: 3, scaleB: 1.2, strength: 0.6 });
  rocks.forEach((list, v) => instancedStretches(boulderGeometry(70 + v), rockMat, list, ST, { castShadow: true }).forEach((g, i) => stretch[i].add(g)));
  instancedStretches(hangingMossGeometry(), hangingMossMaterial(), hang, ST).forEach((g, i) => stretch[i].add(g));
  instancedStretches(shelfGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), shelves, ST).forEach((g, i) => stretch[i].add(g));

  // more Kodama: on the bank down to the pool, along the shores and round the islets
  for (let i = 0, n = 0; i < 600 && n < 16; i++) {
    const z = rng.range(-734, -768), x = at(z).x + rng.sign() * rng.range(3.5, 15);
    if (!dry(x, z, 0.3)) continue;
    kod(V(x, ground(x, z), z)); n++;
  }
  for (let i = 0, n = 0; i < 2000 && n < 26; i++) {
    const a = rng.range(0, TAU), e = rng.range(1.0, 1.12);
    const x = POOL.x + Math.cos(a) * POOL.ax * e, z = POOL.z + Math.sin(a) * POOL.az * e;
    if (z > -700 || Math.abs(x - at(z).x) < 6) continue;
    const gy = ground(x, z);
    if (gy < 0.1 || gy > 3) continue;
    kod(V(x, gy, z)); n++;
  }
  for (const s of ISLETS) for (let k = 0; k < (s === ISLETS[0] ? 7 : 4); k++) {
    const a = s === ISLETS[0] ? rng.range(2.0, 4.4) : rng.range(0, TAU), d = s.r * rng.range(0.4, 0.62);
    const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
    const gy = ground(x, z);
    if (gy > 0.1) kod(V(x, gy, z), rng.range(0.75, 1.1));
  }

  // =========================================================================================
  // the spirit pool: water, lily pads, rings and spray
  // =========================================================================================
  const water = new PoolWater(grid, { x0: -120, x1: 128, z0: -760, z1: -910 });
  stretch[3].add(water.mesh);
  const pads: Array<{ m: THREE.Matrix4; z: number; color: THREE.Color }> = [], lilies: Array<{ m: THREE.Matrix4; z: number }> = [];
  for (let i = 0; i < 5000 && pads.length < 190 * D; i++) {
    const x = rng.range(-100, 110), z = rng.range(-770, -905), gy = ground(x, z);
    if (gy > -0.2 || gy < -1.7 || !clearOfPath(x, z, 3.8) || noise2(x * 0.06, z * 0.06) < 0.42) continue;
    const s = rng.range(0.7, 1.5);
    pads.push({ m: new THREE.Matrix4().compose(V(x, 0.03, z), new THREE.Quaternion().setFromAxisAngle(up, rng.range(0, TAU)), V(s, 1, s)), z, color: new THREE.Color(rng.pick([0x3e7a34, 0x4a8a3a, 0x356a2e, 0x5a8a3a])) });
    if (rng.chance(0.14)) lilies.push({ m: new THREE.Matrix4().compose(V(x + 0.2, 0.08, z + 0.1), new THREE.Quaternion(), V(1, 1, 1)), z });
  }
  {
    const padGeo = new THREE.CircleGeometry(0.55, 18, 0.25, TAU - 0.5).rotateX(-Math.PI / 2);
    instancedStretches(padGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), pads, ST).forEach((g, i) => stretch[i].add(g));
    const lilyGeo = new THREE.ConeGeometry(0.22, 0.26, 7, 1, true).rotateX(Math.PI).translate(0, 0.13, 0);
    instancedStretches(lilyGeo, new THREE.MeshLambertMaterial({ color: 0xf0b8c8, emissive: 0x3a1a24, side: THREE.DoubleSide }), lilies, ST).forEach((g, i) => stretch[i].add(g));
  }
  const spray = new Spray(240);
  live.add(spray.points);

  // =========================================================================================
  // the Kodama
  // =========================================================================================
  const crowd = new KodamaCrowd(kspots, ST);
  crowd.stretches.forEach((g, i) => stretch[i].add(g));
  // groups of Kodama near the path, for the photo subject: it follows the group just ahead of the rider
  const clusters: THREE.Vector3[] = [];
  {
    const buckets = new Map<number, THREE.Vector3[]>();
    for (const k of kspots) {
      if (latOf(k.p.x, k.p.z) > 24) continue;
      const key = Math.floor((-k.p.z - 590) / 22);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(k.p);
    }
    for (const list of buckets.values()) {
      if (list.length < 4) continue;
      // the middle of the group, on the ground (a thrown acorn comes down there)
      const c = list.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / list.length);
      clusters.push(c.setY(Math.max(floorAt(c.x, c.z), 0)));
    }
    clusters.sort((a, b) => b.z - a.z);
  }

  // =========================================================================================
  // mist, moonbeams and first light, drifting motes
  // =========================================================================================
  const puffs: MistPuff[] = [];
  const puff = (x: number, y: number, z: number, w: number, h: number, a: number) => puffs.push({ p: V(x, y, z), w, h, a });
  // inside the edge of the wood, so it looks deep and misty from the fields
  for (let k = 0; k < 16; k++) { const x = rng.range(-150, 150); if (Math.abs(x - at(-620).x) > 8) puff(x, ground(x, -622) + 0.5, rng.range(-614, -640), rng.range(40, 60), rng.range(10, 16), 0.5); }
  // between the tiers of trees along the floor of the wood
  for (let k = 0; k < 46 * D; k++) {
    const z = rng.range(-630, -930), x = at(z).x + rng.sign() * rng.range(16, 110);
    puff(x, ground(x, z) - 0.5, z, rng.range(30, 55), rng.range(6, 13), rng.range(0.35, 0.55));
  }
  // lying low on the water
  for (let k = 0; k < 44 * D; k++) {
    const a = rng.range(0, TAU), d = Math.sqrt(rng.next()) * 0.95;
    const x = POOL.x + Math.cos(a) * POOL.ax * d, z = POOL.z + Math.sin(a) * POOL.az * d;
    if (latOf(x, z) < 7) continue;
    puff(x, 0.1, z, rng.range(28, 50), rng.range(3.5, 6.5), rng.range(0.4, 0.6));
  }
  // behind and beside the tallest cedar (not in front of it, so its trunk and root read from the pool)
  for (let k = 0; k < 14; k++) { const a = rng.range(Math.PI * 1.05, Math.PI * 1.95), d = rng.range(30, 64); puff(GREAT.x + Math.cos(a) * d, greatY0 + rng.range(0, 14), GREAT.z + Math.sin(a) * d * 0.7, rng.range(40, 60), rng.range(12, 20), 0.4); }
  const mist = new MistLayer(puffs);
  live.add(mist.mesh);

  const moonDir = V(-0.2, 0.5, -0.84).normalize(), sunDir = V(0.45, 0.2, -0.87).normalize();
  const moonBeams: Beam[] = [], dawnBeams: Beam[] = [];
  for (let k = 0; k < 14; k++) {
    const z = rng.range(-610, -760), x = at(z).x + rng.sign() * rng.range(3, 30);
    const to = V(x, ground(x, z), z);
    moonBeams.push({ from: to.clone().addScaledVector(moonDir, rng.range(60, 80)), to, width: rng.range(4, 8), color: 0x9fd8e0, a: rng.range(0.22, 0.32) });
  }
  for (let k = 0; k < 11; k++) {
    const x = rng.range(-50, 70), z = rng.range(-836, -935);
    const to = V(x, Math.max(0, ground(x, z)), z);
    dawnBeams.push({ from: to.clone().addScaledVector(sunDir, rng.range(80, 110)), to, width: rng.range(7, 14), color: 0xffc8a0, a: rng.range(0.2, 0.3) });
  }
  const moonLight = new Beams(moonBeams), dawnLight = new Beams(dawnBeams);
  live.add(moonLight.mesh, dawnLight.mesh);

  const motes = new Drift({ count: Math.round(260 * D), color: 0xc8ffe0, size: 0.22, box: V(90, 28, 90), speed: V(0.1, 0.25, 0), wobble: 0.45, opacity: 0.85, blending: THREE.AdditiveBlending, seed: 61 });
  const dust = new Drift({ count: Math.round(160 * D), color: 0xffd8b0, size: 0.2, box: V(80, 24, 80), speed: V(0.35, 0.12, -0.1), wobble: 0.3, opacity: 0.7, blending: THREE.AdditiveBlending, seed: 62 });
  live.add(motes.points, dust.points);

  // =========================================================================================
  // the Night-Walker and the Forest Spirit
  // =========================================================================================
  const walker = makeNightWalker();
  live.add(walker.group);
  const walkCurve = new THREE.CatmullRomCurve3(WALK.map(([x, z]) => V(x, 0, z)));
  const walkLen = walkCurve.getLength();

  const deer = makeForestSpirit();
  live.add(deer.group);
  const deerA = new THREE.CatmullRomCurve3(DEER_A.map(([x, z]) => V(x, 0, z)));
  const deerB = new THREE.CatmullRomCurve3(DEER_B.map(([x, z]) => V(x, 0, z)));
  const deerHeading = new Heading(-Math.PI / 2, 0.6, 0.9);
  const blooms = new Blooms(Math.round(200 * D) + 40);
  live.add(blooms.mesh);
  let nowT = 0;
  deer.onHoof = (p) => blooms.spawn(V(p.x, ground(p.x, p.z) + 0.02, p.z), nowT, 3, 0.5);

  // =========================================================================================
  // lights: at most two at once
  // =========================================================================================
  const U = (z: number) => road.u(z);
  lights.add({ from: U(-560), to: U(-664), pos: V(-4, 9, -613), color: 0xa8e8d8, intensity: 60, distance: 40 });
  lights.add({ from: U(-672), to: U(-742), pos: V(2, 13, -700), color: 0xb8f0e0, intensity: 60, distance: 42 });
  const walkerSpot: LightSpot = { from: U(-750), to: U(-876), pos: V(-34, 30, -856), color: 0x6a9cff, intensity: 320, distance: 120 };
  lights.add(walkerSpot);
  lights.add({ from: U(-828), to: U(-918), pos: V(19, 9, -842), color: 0xffc8a0, intensity: 70, distance: 46 });

  // =========================================================================================
  // photo subjects
  // =========================================================================================
  const kodMarker = new THREE.Object3D();
  group.add(kodMarker);
  const kodS = new Subject({
    id: 'kodama', name: 'Kodama', from: FILMS.mononoke, group: kodMarker, radius: 4.5, base: 700, rarity: 'rare', crowd: true,
    hint: 'Hundreds of little tree spirits all through the wood: on the roots, on the fallen cedar, on shelves of fungus up the trunks. Play the ocarina and their heads rattle in a wave; an acorn makes the ones nearby turn and rattle.',
    poses: { rattle: { label: 'Rattling heads', mult: 1.6 } }, centerOffset: V(0, 0.8, 0), maxDistance: 90, reactRange: 16,
    onCall: () => { kodS.setPose('rattle', 3); return true; },
    onItem: () => { kodS.setPose('rattle', 2.5); return true; },
  });
  const walkerS = new Subject({
    id: 'night-walker', name: 'The Night-Walker', from: FILMS.mononoke, group: walker.group, radius: 30, base: 1500, rarity: 'legendary',
    hint: 'The Forest Spirit by night: a see-through giant full of stars that rises out of the spirit pool and walks across it before dawn. Play the ocarina and it turns its head and looks down at you.',
    poses: { gaze: { label: 'The Night-Walker looks down', mult: 2.0 } }, centerOffset: V(0, 55, 0), maxDistance: 230,
    facing: () => V(0, 0, 1).applyQuaternion(walker.head.getWorldQuaternion(new THREE.Quaternion())),
    onCall: () => { walker.gaze(); walkerS.setPose('gaze', 4); return true; },
  });
  const deerS = new Subject({
    id: 'forest-spirit', name: 'The Forest Spirit', from: FILMS.mononoke, group: deer.group, radius: 5, base: 1400, rarity: 'legendary',
    hint: 'At first light it steps out on an islet in the spirit pool, a great deer with an almost human face; flowers bloom where it walks. An acorn near it makes flowers burst open all round; the ocarina makes it raise its head and look at you.',
    poses: { bloom: { label: 'Flowers bloom', mult: 1.8 }, gaze: { label: 'The Forest Spirit looks at you', mult: 1.8 } },
    centerOffset: V(0, 4.6, 0.8), maxDistance: 130, reactRange: 16,
    facing: () => V(0, 0, 1).applyQuaternion(deer.head.getWorldQuaternion(new THREE.Quaternion())),
    onCall: () => { deer.gaze(); deerS.setPose('gaze', 3.5); return true; },
    onItem: () => {
      const p = deer.group.position;
      blooms.spawn(V(p.x, p.y + 0.02, p.z), nowT, 44, 6, 4, 1.0);
      deerS.setPose('bloom', 3);
      return true;
    },
  });
  const cedarAnchor = new THREE.Object3D();
  cedarAnchor.position.set(GREAT.x, 58, GREAT.z);
  group.add(cedarAnchor);
  let awakeT = 0;
  const cedarS = new Subject({
    id: 'great-cedar', name: 'The tallest cedar', from: FILMS.mononoke, group: cedarAnchor, radius: 24, base: 600,
    hint: 'The oldest tree in the wood, on the far shore of the spirit pool; the Catbus runs up its great root into the mist. Play the ocarina near it and every Kodama on its roots wakes and rattles.',
    poses: { awake: { label: 'The Kodama wake the cedar', mult: 1.5 } }, maxDistance: 260,
    onCall: () => {
      crowd.wave(V(GREAT.x, greatY0 + 4, GREAT.z), nowT, 18);
      awakeT = 3.5;
      cedarS.setPose('awake', 3.5);
      return true;
    },
  });
  const subjects = [kodS, walkerS, deerS, cedarS];
  for (const s of subjects) s.active = false;

  // =========================================================================================
  // make the static scenery cheap to draw
  // =========================================================================================
  for (const h of heroes) optimize(h);

  // =========================================================================================
  // every frame
  // =========================================================================================
  const camPos = V(), wp = V(), tmp = V(), lastPos = V();
  const mistCol = new THREE.Color(), dawnMist = new THREE.Color(1.0, 0.86, 0.8);
  const skyTop = new THREE.Color(), skyLow = new THREE.Color(), treeC = new THREE.Color(), deepC = new THREE.Color(), shallowC = new THREE.Color();
  const pink = new THREE.Color(0xe8b0a8), nightTree = new THREE.Color(0x0c1a16), dawnTree = new THREE.Color(0x2a3a3a);
  const nightDeep = new THREE.Color(0x0a2628), dawnDeep = new THREE.Color(0x1a3a40), nightShallow = new THREE.Color(0x285444), dawnShallow = new THREE.Color(0x4a7a6a);
  const deerPrev = V();
  let havePos = false, travelled = 0, strikes = 0, lastZ = 0, deerHave = false, islandWave = false;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  const strike = (ride: { position: THREE.Vector3; tangent: THREE.Vector3 }, t: number) => {
    // paws strike the water in a wave down the Catbus's body, alternating sides
    const k = strikes % 6, side = strikes % 2 ? 1 : -1;
    strikes++;
    const T = tmp.set(ride.tangent.x, 0, ride.tangent.z).normalize();
    const along = 2.75 - k * 1.1;
    const x = ride.position.x + T.x * along - T.z * side * 1.0, z = ride.position.z + T.z * along + T.x * side * 1.0;
    water.ring(x, z, t, 0.8);
    spray.burst(V(x, 0.05, z), 4, 2.6, 1.0);
  };

  return {
    id: 'forest', group, show: showRange(road, F, 450, 6), occluders: [occl], subjects,
    water: 0,
    floor: floorAt,
    bump: (z) => {
      const b = (c: number, w: number, a: number) => a * Math.exp(-(((z - c) / w) ** 2));
      return b(-609.5, 1.4, -0.22) + b(-627, 0.9, 0.12) + b(-639, 0.9, 0.12) + b(-657, 1.0, 0.1) + b(-749, 1.3, -0.2) + b(-769.5, 1.2, -0.1);
    },
    update(dt, t, ride) {
      nowT = t;
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      const fog = ctx.scene.fog as THREE.FogExp2;

      // ---- scenery: each stretch is drawn only when near enough to be seen through the mist ----
      const reach = 2.05 / Math.max(fog.density, 1e-4);
      ST.forEach(([z0, z1], i) => {
        const ahead = camPos.z - z0, behind = z1 - camPos.z;
        // the edge of the wood can be seen from far over the fields
        stretch[i].visible = ahead < (i === 0 ? 2000 : Math.min(260, reach)) && behind < Math.min(160, reach);
      });

      // ---- the Night-Walker: rises out of the pool, walks across it, sinks back at first light ----
      walker.rise = smoothstep(-752, -790, z) * (1 - smoothstep(-848, -874, z));
      const s = smoothstep(-788, -848, z);
      walkCurve.getPointAt(s, wp);
      walker.group.position.set(wp.x, 0, wp.z);
      walker.walked = s * walkLen;
      walker.walk = s > 0.002 && s < 0.998 ? 1 : 0;
      const tan = walkCurve.getTangentAt(clamp(s, 0.001, 0.999), tmp);
      const walkYaw = Math.atan2(tan.x, tan.z), faceYaw = Math.atan2(camPos.x - wp.x, camPos.z - wp.z);
      const k = smoothstep(-776, -794, z) * (1 - smoothstep(-844, -858, z));
      walker.group.rotation.y = faceYaw + wrap(walkYaw - faceYaw) * k;
      walker.lookTarget = camPos;
      if (walker.rise > 0.001) walker.update(dt, t, fog); else walker.group.visible = false;
      walker.chest(walkerSpot.pos);
      walkerSpot.pos.y = Math.max(walkerSpot.pos.y, 14);
      lights.boost.set(walkerSpot, walker.rise);

      // ---- the Forest Spirit: steps out at first light and walks slowly along its islet ----
      const kA = smoothstep(-818, -848, z), kB = smoothstep(-858, -905, z);
      if (kB > 0) deerB.getPointAt(kB, wp); else deerA.getPointAt(kA, wp);
      wp.y = ground(wp.x, wp.z);
      const moving = (kA > 0 && kA < 1) || (kB > 0 && kB < 1);
      const step = deerHave ? Math.min(1, wp.distanceTo(deerPrev)) : 0;
      deerPrev.copy(wp); deerHave = true;
      deer.group.position.copy(wp);
      deer.walk = moving ? 1 : 0;
      deer.stride = step;
      const dTan = (kB > 0 ? deerB : deerA).getTangentAt(clamp(kB > 0 ? kB : kA, 0.001, 0.999), tmp);
      deer.group.rotation.y = deerHeading.update(moving ? Math.atan2(dTan.x, dTan.z) : Math.atan2(camPos.x - wp.x, camPos.z - wp.z), dt);
      deer.lookTarget = camPos;
      deer.update(dt, t);
      // the Kodama on its islet rattle as it steps out
      if (z < -832 && !islandWave) { islandWave = true; crowd.wave(V(ISLETS[0].x, 1.5, ISLETS[0].z), t, 14); }
      if (z > -820) islandWave = false;
      blooms.update(t);

      // ---- splashes: the paws strike the shallows ----
      const moved = havePos && lastPos.distanceTo(ride.position) < 5 ? lastPos.distanceTo(ride.position) : 0;
      lastPos.copy(ride.position); havePos = true;
      if (z < -768 && z > -837 && ride.position.y < 0.9) {
        if (lastZ >= -769) { for (let i = 0; i < 3; i++) strike(ride, t); spray.burst(V(ride.position.x, 0.05, ride.position.z), 16, 3.5, 2.2); }
        travelled += moved;
        while (travelled > 0.7) { travelled -= 0.7; strike(ride, t); }
      }
      lastZ = z;
      spray.update(dt);

      // ---- light, mist and water through the night to first light ----
      const dawn = smoothstep(-805, -865, z);
      mistCol.copy(fog.color).multiplyScalar(1.35).lerp(dawnMist, dawn * 0.45);
      mist.update(t, fog, mistCol, 1 - smoothstep(-905, -925, z) * 0.5);
      // the beams and the motes belong inside the wood: they fade in as the rider reaches its edge
      const inside = smoothstep(-570, -606, z);
      moonLight.update(fog, inside * (1 - smoothstep(-760, -820, z)));
      dawnLight.update(fog, smoothstep(-812, -852, z));
      skyTop.copy(fog.color).multiplyScalar(1.2);
      skyLow.copy(fog.color).lerp(pink, dawn * 0.7);
      treeC.copy(nightTree).lerp(dawnTree, dawn);
      deepC.copy(nightDeep).lerp(dawnDeep, dawn);
      shallowC.copy(nightShallow).lerp(dawnShallow, dawn);
      water.update(t, fog, { dawn, skyTop, skyLow, tree: treeC, deep: deepC, shallow: shallowC });
      water.uniforms.uWalker.value.set(walker.group.position.x, walker.group.position.z, 104 * walker.rise, 0.9 * walker.rise);

      awakeT = Math.max(0, awakeT - dt);
      motes.intensity = inside * (1 - dawn * 0.6) * (1 + 1.5 * Math.min(1, awakeT));
      motes.update(dt, t, camPos);
      dust.intensity = dawn;
      dust.update(dt, t, camPos);

      // ---- the Kodama ----
      crowd.update(dt, t, camPos);
      let best = clusters[0], bd = Infinity;
      for (const c of clusters) { const d = Math.abs(c.z - (z - 22)) + (c.z > z + 4 ? 40 : 0); if (d < bd) { bd = d; best = c; } }
      if (best) kodMarker.position.copy(best);

      // ---- which subjects can be photographed now ----
      kodS.active = z < -560 && z > -915 && !!best;
      walkerS.active = walker.rise > 0.55;
      deerS.active = z < -824 && z > -910;
      cedarS.active = z < -770 && z > -912;
    },
    onCall(ride) {
      // the Kodama's heads rattle in a wave that spreads out from the rider
      ctx.camera.getWorldPosition(camPos);
      crowd.wave(camPos, ride.time);
    },
    onItemLand(pos) {
      crowd.startle(pos, nowT);
      // an acorn that falls in the pool
      if (pos.y < 0.4 && grid.sample(pos.x, pos.z) < -0.05 && pos.z < -760 && pos.z > -910) {
        water.ring(pos.x, pos.z, nowT, 1.3);
        spray.burst(V(pos.x, 0.05, pos.z), 10, 3, 1.4);
      }
    },
  };
}
