import * as THREE from 'three';
import { HeightGrid } from '../../../engine/HeightGrid';
import { buildTerrain } from '../../../engine/Builders';
import { addGroundDetail, paintedDetailTexture } from '../../../engine/Ground';
import { Painter } from '../../../engine/Paint';
import { Rng, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import type { Road } from '../layout';
import { ribbon } from '../common';
import { paddyWater, type PaddyWater } from './paddyWater';

/*
 * The ground of the fields scene: a wide valley of flooded rice paddies with wooded hills on both sides.
 *
 * The valley floor is at y 0. Paddies are rectangles in an uneven grid; most hold water at y 0, and on the
 * foot of the hills they step up in terraces. Each paddy has a low bank of earth and grass round it (a bund).
 * A dirt lane on a raised bank runs along the left of the power line, with farm houses beside it. The great
 * camphor tree stands on a mound on the right; the Inari-mae bus stop and its little shrine are on the left.
 * At the far end the paddies give way to a meadow and a grassy bank at the edge of the wood, where the
 * Catbus lands when it jumps off the last pole.
 *
 * Ground behind z -290 is kept in its own group (`back`): the garden scene's own ground reaches that far, so
 * this part is only shown once the garden has gone (while the screen is washed out in the cloud).
 */

export const LANE = { y: 0.55, half: 2.3, off: -3.6 };
/** Everything on the ground behind this z goes in the `back` group (see above). */
export const BACK_Z = -290;

/** Places that shape the ground (world x, z). */
export const SPOTS = {
  camphor: { x: 58, z: -472, r: 30, top: 4.4 },
  inari: { x: -17, z: -517, r: 10, y: 0.7 },
  busStop: { x: -8.4, z: -521 },
  owlPole: { x: 7.5, z: -446 },
};

export interface HouseSpot { x: number; z: number; yaw: number; kind: 'thatch' | 'tile' | 'small'; yard: [number, number] }
/** Farm houses: four beside the lane, more on the far sides of the valley. Their fronts face the lane. */
export const HOUSES: HouseSpot[] = [
  { x: -36, z: -322, yaw: Math.PI / 2, kind: 'thatch', yard: [13, 11] },
  { x: 35, z: -402, yaw: -Math.PI / 2, kind: 'tile', yard: [14, 12] },
  { x: -34, z: -440, yaw: Math.PI / 2, kind: 'thatch', yard: [13, 12] },
  { x: 41, z: -556, yaw: -Math.PI / 2, kind: 'tile', yard: [13, 11] },
  { x: -116, z: -374, yaw: Math.PI / 2 - 0.3, kind: 'small', yard: [9, 8] },
  { x: 110, z: -320, yaw: -Math.PI / 2 + 0.2, kind: 'small', yard: [9, 8] },
  { x: 122, z: -512, yaw: -Math.PI / 2 - 0.2, kind: 'small', yard: [9, 8] },
  { x: -106, z: -558, yaw: Math.PI / 2 + 0.2, kind: 'small', yard: [9, 8] },
  { x: -140, z: -468, yaw: Math.PI / 2, kind: 'small', yard: [9, 8] },
];

/** One rice paddy: x0 < x1, z0 > z1 (z0 is the end nearer the start of the ride). */
export interface Cell { x0: number; x1: number; z0: number; z1: number; level: number; angle: number; rice: number; tint: number; seed: number }

export interface Land {
  /** terrain, paddies, bunds and the lane from z -290 on */
  group: THREE.Group;
  /** ground behind z -290 (where the garden scene's ground is); show it only once the garden is hidden */
  back: THREE.Group;
  /** ground height: the solid ground, or the mud under a paddy's water */
  heightAt(x: number, z: number): number;
  /** where a thrown acorn comes down: a paddy's water surface or the ground */
  floor(x: number, z: number): number;
  paddyAt(x: number, z: number): Cell | null;
  laneX(z: number): number;
  /** the height of the lane's surface at a z */
  laneY(z: number): number;
  water: PaddyWater;
  cells: Cell[];
  /** the ground heights sampled on a 2-unit grid over the valley floor (x -172..172, z -644..-236) */
  grid: HeightGrid;
}

/** Where the valley's floor meets the hills on one side (distance from x 0). */
const valleyEdge = (z: number, side: number) => 92 + 48 * fbm(z * 0.004 + (side > 0 ? 17.3 : 3.1), side * 0.5 + 0.5, 3);

/** How far a point is beyond the edge of the valley floor, into the hills (negative on the floor). */
export const hillDistance = (x: number, z: number) => Math.abs(x) - valleyEdge(z, x >= 0 ? 1 : -1);

/** The valley without anything built on it: flat floor, rising wooded hills on both sides. */
export function baseHeight(x: number, z: number) {
  const e = valleyEdge(z, x >= 0 ? 1 : -1);
  const d = Math.abs(x) - e;
  let h = (fbm(x * 0.02 + 40, z * 0.02, 3) - 0.5) * 0.8;
  if (d > -20) {
    const k = clamp((d + 20) / 220, 0, 1);
    h += 58 * Math.pow(k, 1.6) + 16 * (fbm(x * 0.012 + 5, z * 0.012, 4) - 0.3) * smoothstep(-20, 80, d);
  }
  return h;
}

export function buildLand(road: Road, rng: Rng): Land {
  const group = new THREE.Group(), back = new THREE.Group();

  // ---------- the lane: left of the power line, straight on behind the dive ----------
  const laneCache = new Map<number, number>();
  const laneX = (z: number) => {
    const k = Math.round(z * 2);
    let v = laneCache.get(k);
    if (v === undefined) { v = road.at(clamp(k / 2, -640, -240)).x + LANE.off; laneCache.set(k, v); }
    return v;
  };
  // the lane rises gently with the meadow at the far end
  const laneY = (z: number) => LANE.y + 0.7 * smoothstep(-570, -596, z);

  // ---------- flat pads: house yards, drives to the lane, the shrine clearing ----------
  type Pad = { x: number; z: number; hx: number; hz: number; y: number };
  const pads: Pad[] = [];
  for (const h of HOUSES) {
    const y = Math.max(0.6, baseHeight(h.x, h.z) + 0.6);
    pads.push({ x: h.x, z: h.z, hx: h.yard[0], hz: h.yard[1], y });
    // a drive from the lane to the yard for the houses beside it
    if (Math.abs(h.x) < 60) {
      const lx = laneX(h.z), edge = h.x < 0 ? h.x + h.yard[0] : h.x - h.yard[0];
      pads.push({ x: (lx + edge) / 2, z: h.z + 3, hx: Math.abs(edge - lx) / 2, hz: 1.6, y: 0.55 });
    }
  }
  const C = SPOTS.camphor, I = SPOTS.inari;
  // the path from the lane to the camphor shrine
  pads.push({ x: (laneX(C.z + 2) + C.x - 18) / 2, z: C.z + 2, hx: Math.abs(C.x - 18 - laneX(C.z + 2)) / 2, hz: 1.5, y: 0.55 });

  const padBlend = (x: number, z: number, p: Pad) => 1 - smoothstep(0, 3, Math.max(Math.abs(x - p.x) - p.hx, Math.abs(z - p.z) - p.hz, 0));

  /** true where no paddy may go */
  const blocked = (x: number, z: number) => {
    if (Math.hypot(x - C.x, z - C.z) < C.r) return true;
    if (Math.hypot(x - I.x, z - I.z) < I.r + 2) return true;
    for (const p of pads) if (Math.abs(x - p.x) < p.hx + 2 && Math.abs(z - p.z) < p.hz + 2) return true;
    return baseHeight(x, z) > 4.2;
  };

  // ---------- the paddies: columns of uneven width, each cut into fields of uneven length ----------
  const cells: Cell[] = [];
  const cols: Array<{ x0: number; x1: number; cells: Cell[] }> = [];
  const Z0 = -238, Z1 = -578;
  const tryCell = (col: { cells: Cell[] }, x0: number, x1: number, z0: number, z1: number) => {
    // trim the field back from the lane and its banks
    let laneL = Infinity, laneR = -Infinity;
    for (let k = 0; k <= 4; k++) { const lx = laneX(lerp(z0, z1, k / 4)); laneL = Math.min(laneL, lx - 5.0); laneR = Math.max(laneR, lx + 6.2); }
    if (x1 > laneL && x0 < laneR) {
      if ((x0 + x1) / 2 < (laneL + laneR) / 2) x1 = Math.min(x1, laneL); else x0 = Math.max(x0, laneR);
    }
    if (x1 - x0 < 7) return;
    let hb = Infinity;
    for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
      const x = lerp(x0, x1, i / 2), z = lerp(z0, z1, j / 2);
      if (blocked(x, z)) return;
      hb = Math.min(hb, baseHeight(x, z));
    }
    // terraces step up the foot of the hills: each field is dug into the slope at the level of its lowest
    // corner, so the ground above it on the uphill side shows as an earth bank
    const level = hb < 0.6 ? 0 : Math.floor(hb / 0.6) * 0.6;
    const alongZ = z0 - z1 > x1 - x0;
    const c: Cell = {
      x0, x1, z0, z1, level,
      angle: (alongZ ? Math.PI / 2 : 0) + rng.range(-0.03, 0.03),
      rice: rng.chance(0.12) ? 0.04 : rng.range(0.75, 1),
      tint: rng.range(-1, 1), seed: rng.next(),
    };
    col.cells.push(c);
    cells.push(c);
  };
  for (let x = -168; x < 168;) {
    // out towards the hills the fields are narrow strips, so they can step up the slope as terraces
    const x1 = Math.min(168, x + (Math.abs(x) > 72 ? rng.range(7, 10) : rng.range(13, 24)));
    const col = { x0: x, x1, cells: [] as Cell[] };
    for (let z = Z0 - rng.range(0, 6); z > Z1 + 6;) {
      let z1 = Math.max(Z1, z - rng.range(10, 21));
      // no field straddles the edge of the back group
      if (z > BACK_Z && z1 < BACK_Z) z1 = BACK_Z;
      if (z - z1 > 6) tryCell(col, x, x1, z, z1);
      z = z1;
    }
    cols.push(col);
    x = x1;
  }
  const paddyAt = (x: number, z: number): Cell | null => {
    let lo = 0, hi = cols.length - 1;
    if (x < cols[0].x0 || x > cols[hi].x1) return null;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cols[mid].x0 <= x) lo = mid; else hi = mid - 1; }
    for (const c of cols[lo].cells) if (x >= c.x0 && x <= c.x1 && z <= c.z0 && z >= c.z1) return c;
    return null;
  };
  const lowestNear = (x: number, z: number, r: number) => {
    let best = Infinity;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const c = paddyAt(x + dx, z + dz);
      if (c && c.level < best) best = c.level;
    }
    return best;
  };

  // ---------- the bank at the edge of the wood, under the path where the Catbus lands ----------
  const pathY = (z: number) => road.at(z).y;
  const bank = (x: number, z: number, h: number) => {
    if (z > -593 || z < -650) return h;
    const p = road.at(clamp(z, -640, -593));
    let top: number;
    if (z > -607) top = lerp(1.3, pathY(-607) - 0.08, smoothstep(-594, -607, z));
    else if (z > -621) top = pathY(z) - 0.08;
    else top = pathY(-621) - 0.08 - (-621 - z) * 0.3;
    const fall = smoothstep(7, 30, Math.abs(x - p.x));
    return Math.max(h, lerp(top, h, fall));
  };

  // ---------- the height of the ground everywhere ----------
  const heightAt = (x: number, z: number) => {
    let h = baseHeight(x, z);
    // the meadow at the far end rises a little towards the wood
    h += 0.9 * smoothstep(-570, -596, z) * (1 - smoothstep(70, 150, Math.abs(x)));
    // the camphor tree's mound
    h += C.top * smoothstep(C.r, 9, Math.hypot(x - C.x, z - C.z));
    // flat yards, drives and the shrine clearing
    for (const p of pads) { const k = padBlend(x, z, p); if (k > 0) h = lerp(h, p.y, k); }
    h = lerp(h, I.y, 1 - smoothstep(I.r - 3, I.r + 2, Math.hypot(x - I.x, z - I.z)));
    // the lane on its raised bank, with a grass verge on the right where the poles stand
    if (z < -96) {
      const dl = x - laneX(z);
      const out = Math.max(-3.4 - dl, dl - 4.6, 0);
      h = lerp(h, laneY(z), 1 - smoothstep(0, 2.2, out));
    }
    // the paddies are dug down below their water
    const lvl = lowestNear(x, z, 1.4);
    if (lvl < Infinity) h = Math.min(h, lvl - 0.45);
    return bank(x, z, h);
  };

  // ---------- terrain meshes ----------
  const grid = new HeightGrid(-172, 172, -644, -236, 2, heightAt);
  const detail = paintedDetailTexture(907, 512, 2400);
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(terrainMat, detail, { scaleA: 30, scaleB: 7, strength: 0.65 });
  const tc = new THREE.Color();
  const colour = (x: number, z: number, y: number, slope: number, out: THREE.Color) => {
    const n = fbm(x * 0.05 + 3, z * 0.05, 3);
    const cell = paddyAt(x, z);
    if (cell && y < cell.level - 0.2) { out.set(0x2a2a1e); return; }
    const dl = Math.abs(x - laneX(z) - 0.6);
    const b = baseHeight(x, z);
    if (b > 3) out.set(0x223c2a).lerp(tc.set(0x2c4a30), clamp((b - 3) / 40, 0, 1)); // wooded hills
    else if (z < -578) out.set(0x48693a);   // the meadow
    else out.set(0x3c5a33);                  // grass on the valley floor
    if (dl < 6 && z < -96) out.lerp(tc.set(0x45603a), 0.4);
    for (const p of pads) if (Math.abs(x - p.x) < p.hx - 1 && Math.abs(z - p.z) < p.hz - 1) { out.lerp(tc.set(0x5a5040), 0.55); break; }
    out.lerp(tc.set(0x3a3428), clamp(slope * 2.2, 0, 0.6));
    out.multiplyScalar(0.86 + n * 0.28);
    // moonlit haze over the far hills, so their tops stand out from the night sky instead of going black
    out.lerp(tc.set(0x56657e), clamp(smoothstep(130, 400, Math.abs(x)) * 0.45 + smoothstep(12, 60, y) * 0.2, 0, 0.55));
  };
  const terrain = (o: { xMin: number; xMax: number; zMin: number; zMax: number; res: number; chunk: number; drop?: number; sample?: boolean }, into: THREE.Group) => {
    const t = buildTerrain({
      ...o, material: terrainMat, color: colour,
      height: o.sample ? (x, z) => grid.sample(x, z) : (x, z) => heightAt(x, z) - (o.drop ?? 0),
    });
    t.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.receiveShadow = true; });
    // each chunk is hidden on its own once the fog has swallowed it (see FogCuller)
    t.userData.chunked = true;
    into.add(t);
    return t;
  };
  // fine ground over the valley floor, coarse on the hills (tucked a little under the fine ground where they overlap);
  // the front and back pieces meet edge to edge on the same grid, so there is no crack and no overlap
  terrain({ xMin: -172, xMax: 172, zMin: -644, zMax: -290, res: 2, chunk: 86, sample: true }, group);
  terrain({ xMin: -468, xMax: -164, zMin: -684, zMax: -292, res: 8, chunk: 152, drop: 0.25 }, group);
  terrain({ xMin: 164, xMax: 468, zMin: -684, zMax: -292, res: 8, chunk: 152, drop: 0.25 }, group);
  // behind z -290, under the dive, where the garden scene's ground reaches
  terrain({ xMin: -172, xMax: 172, zMin: -290, zMax: -236, res: 2, chunk: 86, sample: true }, back);
  terrain({ xMin: -172, xMax: 172, zMin: -240, zMax: -64, res: 4, chunk: 88, drop: 0.2 }, back);
  terrain({ xMin: -468, xMax: -164, zMin: -292, zMax: -60, res: 8, chunk: 120, drop: 0.25 }, back);
  terrain({ xMin: 164, xMax: 468, zMin: -292, zMax: -60, res: 8, chunk: 120, drop: 0.25 }, back);

  // ---------- paddy water and bunds, in stretches along z ----------
  const water = paddyWater();
  const STRETCH = 96;
  const stretches = new Map<number, Cell[]>();
  // fields behind z -300 go with the back ground (key 1, which no stretch in front can have)
  for (const c of cells) { const zc = (c.z0 + c.z1) / 2; const k = zc > BACK_Z ? 1 : Math.floor(zc / STRETCH); if (!stretches.has(k)) stretches.set(k, []); stretches.get(k)!.push(c); }
  const bundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  addGroundDetail(bundMat, detail, { scaleA: 9, scaleB: 2.5, strength: 0.8 });
  const grassTop = new THREE.Color(0x3a5a2c), grassSide = new THREE.Color(0x2f3d25), wetSide = new THREE.Color(0x29341f);
  for (const [key, list] of stretches) {
    const into = key === 1 ? back : group;
    // water: one flat quad per paddy
    const wp: number[] = [], wc: number[] = [];
    for (const c of list) {
      const y = c.level;
      const quad = [[c.x0, c.z0], [c.x1, c.z0], [c.x1, c.z1], [c.x0, c.z0], [c.x1, c.z1], [c.x0, c.z1]];
      for (const [x, z] of quad) { wp.push(x, y, z); wc.push(c.angle, c.rice, c.tint, c.seed); }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('aCell', new THREE.Float32BufferAttribute(wc, 4));
    wg.computeBoundingSphere();
    const wm = new THREE.Mesh(wg, water.material);
    wm.userData.keep = true;
    into.add(wm);

    // bunds: a low bank inside each edge of each paddy, steep outside and sloping into the water
    const bp: number[] = [], bn: number[] = [], bc: number[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c2: THREE.Vector3, d: THREE.Vector3, col: THREE.Color) => {
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a)).normalize();
      for (const v of [a, b, c2, a, c2, d]) { bp.push(v.x, v.y, v.z); bn.push(n.x, n.y, n.z); bc.push(col.r, col.g, col.b); }
    };
    const jit = new THREE.Color();
    const bund = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number, L: number) => {
      const yT = L + 0.3, yB = L - 1.2, yS = L - 0.08, top = 0.42, slope = 0.8;
      const A = (dx: number, y: number) => new THREE.Vector3(ax + nx * dx, y, az + nz * dx);
      const B = (dx: number, y: number) => new THREE.Vector3(bx + nx * dx, y, bz + nz * dx);
      const k = rng.range(0.9, 1.1);
      // wind each face so its normal points out of the bank
      const outward = new THREE.Vector3(-nx, 0, -nz);
      const face = (p: THREE.Vector3[], col: THREE.Color, want: THREE.Vector3) => {
        const n = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[3], p[0]));
        if (n.dot(want) < 0) quad(p[3], p[2], p[1], p[0], col); else quad(p[0], p[1], p[2], p[3], col);
      };
      face([A(0, yB), B(0, yB), B(0, yT), A(0, yT)], jit.copy(grassSide).multiplyScalar(k), outward);
      face([A(0, yT), B(0, yT), B(top, yT), A(top, yT)], jit.copy(grassTop).multiplyScalar(k), new THREE.Vector3(0, 1, 0));
      face([A(top, yT), B(top, yT), B(slope, yS), A(slope, yS)], jit.copy(wetSide).multiplyScalar(k), new THREE.Vector3(nx, 1, nz));
    };
    for (const c of list) {
      const L = c.level, s = 0.8;
      bund(c.x0, c.z0, c.x1, c.z0, 0, -1, L);       // near edge
      bund(c.x0, c.z1, c.x1, c.z1, 0, 1, L);        // far edge
      bund(c.x0, c.z0 - s, c.x0, c.z1 + s, 1, 0, L); // left edge, between the other two
      bund(c.x1, c.z0 - s, c.x1, c.z1 + s, -1, 0, L);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
    bg.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    bg.computeBoundingSphere();
    const bm = new THREE.Mesh(bg, bundMat);
    bm.receiveShadow = true;
    bm.userData.keep = true;
    into.add(bm);
  }

  // ---------- the lane: two wheel ruts and a strip of grass up the middle ----------
  const laneTex = (() => {
    // the lane's centre is at u = 0 (the canvas edges), its sides at u = 0.5 (the middle of the canvas)
    const W = 256, H = 512;
    const p = new Painter(W, H, 911).fill('#857257');
    const g = p.g;
    p.dabs({ n: 260, colors: ['#9a8666', '#6e5c44', '#7c6a50', '#a39070'], r: [3, 14], alpha: [0.15, 0.4], squash: 0.6 });
    // the ruts: worn darker and smoother
    for (const u of [0.19, 0.81]) {
      const gr = g.createLinearGradient((u - 0.08) * W, 0, (u + 0.08) * W, 0);
      gr.addColorStop(0, 'rgba(70,56,40,0)'); gr.addColorStop(0.5, 'rgba(70,56,40,0.55)'); gr.addColorStop(1, 'rgba(70,56,40,0)');
      g.fillStyle = gr; g.fillRect((u - 0.08) * W, 0, 0.16 * W, H);
    }
    // grass: up the middle and along both edges
    const grass = (u0: number, u1: number, n: number) => p.fur({ n, colors: ['#4a6a34', '#3c5a2c', '#5a7a3e', '#34502a'], len: [6, 16], width: [2, 4], alpha: [0.5, 0.9], angle: () => -Math.PI / 2, jitter: 0.6, x: [u0, u1] });
    grass(0, 0.07, 500); grass(0.93, 1, 500); grass(0.42, 0.58, 900);
    p.dabs({ n: 60, colors: ['#b8a888', '#5a4a36'], r: [1, 2.5], alpha: [0.4, 0.8] });
    const t = p.texture({ repeat: [1, 0.5] });
    return t;
  })();
  const ground = (x: number, z: number) => (z < -236 && z > -644 && Math.abs(x) < 172 ? grid.sample(x, z) : heightAt(x, z) - 0.2);
  const laneMat = new THREE.MeshLambertMaterial({ map: laneTex });
  // the lane in two pieces: the part behind z -290 belongs with the back ground
  const lanePiece = (z0: number, z1: number, segs: number, into: THREE.Group) => {
    const pts: THREE.Vector3[] = [];
    const n = Math.ceil((z0 - z1) / 6);
    for (let i = 0; i <= n; i++) { const z = lerp(z0, z1, i / n); pts.push(new THREE.Vector3(laneX(z), ground(laneX(z), z) + 0.04, z)); }
    const geo = ribbon(new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5), -LANE.half, LANE.half, segs, 0, LANE.half * 2);
    // drape the strip over the ground across its width too
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)) + 0.05);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, laneMat);
    m.receiveShadow = true;
    m.userData.keep = true;
    into.add(m);
  };
  lanePiece(BACK_Z, -618, 220, group);
  lanePiece(-100, BACK_Z, 130, back);

  const floor = (x: number, z: number) => {
    const c = paddyAt(x, z);
    // in a paddy at the valley's level the water (y 0) catches it; on a terrace, its own water does
    if (c) return c.level > 0 ? c.level : -0.4;
    return z < -236 && Math.abs(x) < 172 ? grid.sample(x, z) : heightAt(x, z);
  };

  return { group, back, heightAt: (x, z) => (z < -236 && z > -644 && Math.abs(x) < 172 ? grid.sample(x, z) : heightAt(x, z)), floor, paddyAt, laneX, laneY, water, cells, grid };
}
