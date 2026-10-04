import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, fbm } from '../../../engine/math';
import { repeatUV } from '../../../engine/Paint';
import { Acc } from '../../ghibli/koriko';
import { roofTileTexture } from '../../ghibli/korikoAtlas';
import { stoneWall } from '../../ghibli/characterTextures';
import { CELL, cliffRock, signAtlas, townAtlas } from './textures';
import { LANTERN, waveLit, type LanternField } from './wave';
import { BRIDGE, DECK, GATE, PODIUM, RAVINE, WATER } from './plan';
import type { PlumeSource } from './steam';

/*
 * The town round the bathhouse: the lantern street of food stalls along the near rim of the ravine on both
 * sides of the gate house, taller houses behind it, a second town on the far rim to the left, little houses
 * clinging to the cliffs, the ravine's rock walls, the flooded railway at the bottom, and a far shore of
 * lights across the open water to the right.
 *
 * Every house is added to a few accumulators (painted walls, roof tiles, plain trim, signs), so a whole
 * stretch of town is four meshes. The walls use one emissive material whose glow follows the lantern wave.
 */

export interface Accs { wall: Acc; roof: Acc; trim: Acc; sign: Acc }
export const newAccs = (): Accs => ({ wall: new Acc(), roof: new Acc(), trim: new Acc(), sign: new Acc() });

let mats: { wall: THREE.Material; roof: THREE.Material; trim: THREE.Material; sign: THREE.Material } | null = null;
/** The four shared town materials. */
export function townMaterials() {
  if (mats) return mats;
  const atlas = townAtlas(), signs = signAtlas();
  mats = {
    wall: waveLit(new THREE.MeshLambertMaterial({ map: atlas.map, emissive: 0xffffff, emissiveMap: atlas.glow, emissiveIntensity: 1.45, vertexColors: true }), 'bath-town-wall-1', { dim: 0.5 }),
    roof: new THREE.MeshLambertMaterial({ map: roofTileTexture(23), vertexColors: true, side: THREE.DoubleSide }),
    trim: new THREE.MeshLambertMaterial({ vertexColors: true }),
    sign: waveLit(new THREE.MeshLambertMaterial({ map: signs.map, emissive: 0xffe0a0, emissiveMap: signs.map, emissiveIntensity: 0.5, side: THREE.DoubleSide }), 'bath-town-sign-1', { dim: 0.75 }),
  };
  return mats;
}

/** Turn accumulators into meshes (one per material that has anything in it). */
export function accMeshes(A: Accs, o: { cast?: boolean; receive?: boolean } = {}) {
  const m = townMaterials();
  const g = new THREE.Group();
  for (const [acc, mat] of [[A.wall, m.wall], [A.roof, m.roof], [A.trim, m.trim], [A.sign, m.sign]] as const) {
    if (acc.empty) continue;
    const mesh = new THREE.Mesh(acc.build(), mat);
    mesh.castShadow = !!o.cast; mesh.receiveShadow = o.receive ?? true;
    mesh.userData.keep = true;
    g.add(mesh);
  }
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const WHITE = new THREE.Color(1, 1, 1);
export const COLORS = {
  wood: new THREE.Color(0x4a2c1c), darkWood: new THREE.Color(0x2a1a12), red: new THREE.Color(0xa83224), plaster: new THREE.Color(0xe6dac2),
  stone: new THREE.Color(0x7a746a), roofGreen: new THREE.Color(0x5e8a74), roofSlate: new THREE.Color(0x58606a), roofBrown: new THREE.Color(0x8a5a44),
  gold: new THREE.Color(0xd8b050), black: new THREE.Color(0x1a1616),
};

export interface HouseSpec {
  /** world position of the middle of the front wall at its foot; the front faces local +z */
  x: number; y: number; z: number; yaw: number;
  w: number; d: number;
  /** storey heights from the ground up */
  floors: number[];
  /** the atlas cell for a bay */
  cell: (floor: number, bay: number, side: 'front' | 'back' | 'side') => number;
  roof: 'gable' | 'hip';
  rise?: number; overhang?: number;
  roofColor: THREE.Color;
  /** plain wall continuing below the foot (stilts and foundations on slopes) */
  sink?: number;
  tint?: THREE.Color;
  /** lanterns along the front eave: spacing, and the colour */
  lanterns?: { field: LanternField; every: number; color?: THREE.Color; size?: number };
  balcony?: boolean;
  /** a little tiled roof over the ground floor's front */
  awning?: boolean;
  /** a sign (an index into SIGN_TEXTS) hanging out from the right corner of the upper storey */
  sign?: number;
}

/** Add one house to the accumulators. Returns the world positions of its lit windows' middle (for water reflections). */
export function addHouse(A: Accs, h: HouseSpec) {
  const m = new THREE.Matrix4().makeRotationY(h.yaw).setPosition(h.x, h.y, h.z);
  A.wall.setMatrix(m); A.roof.setMatrix(m); A.trim.setMatrix(m); A.sign.setMatrix(m);
  const cells = townAtlas().cells;
  const tint = h.tint ?? WHITE;
  const W = h.w, D = h.d, hw = W / 2;
  const H = h.floors.reduce((s, f) => s + f, 0);
  const bays = Math.max(1, Math.round(W / 3)), bw = W / bays;
  const sbays = Math.max(1, Math.round(D / 3)), sbw = D / sbays;
  // walls, storey by storey
  let y0 = 0;
  h.floors.forEach((fh, f) => {
    const y1 = y0 + fh;
    for (let b = 0; b < bays; b++) {
      const a = -hw + b * bw;
      A.wall.quad(V(a, y0, 0), V(a + bw, y0, 0), V(a + bw, y1, 0), V(a, y1, 0), cells[h.cell(f, b, 'front')], tint);
      const xa = hw - b * bw;
      A.wall.quad(V(xa, y0, -D), V(xa - bw, y0, -D), V(xa - bw, y1, -D), V(xa, y1, -D), cells[h.cell(f, b, 'back')], tint);
    }
    for (let b = 0; b < sbays; b++) {
      A.wall.quad(V(hw, y0, -b * sbw), V(hw, y0, -(b + 1) * sbw), V(hw, y1, -(b + 1) * sbw), V(hw, y1, -b * sbw), cells[h.cell(f, b, 'side')], tint);
      A.wall.quad(V(-hw, y0, -D + b * sbw), V(-hw, y0, -D + (b + 1) * sbw), V(-hw, y1, -D + (b + 1) * sbw), V(-hw, y1, -D + b * sbw), cells[h.cell(f, b + 3, 'side')], tint);
    }
    // a beam at each floor line
    if (f > 0) A.trim.box(-hw - 0.08, hw + 0.08, y0 - 0.12, y0 + 0.12, -D - 0.08, 0.08, COLORS.darkWood);
    y0 = y1;
  });
  if (h.sink) {
    const st = cells[CELL.stone];
    for (let b = 0; b < bays; b++) { const a = -hw + b * bw; A.wall.quad(V(a, -h.sink, 0), V(a + bw, -h.sink, 0), V(a + bw, 0, 0), V(a, 0, 0), st, tint); }
    for (let b = 0; b < sbays; b++) {
      A.wall.quad(V(hw, -h.sink, -b * sbw), V(hw, -h.sink, -(b + 1) * sbw), V(hw, 0, -(b + 1) * sbw), V(hw, 0, -b * sbw), st, tint);
      A.wall.quad(V(-hw, -h.sink, -D + b * sbw), V(-hw, -h.sink, -D + (b + 1) * sbw), V(-hw, 0, -D + (b + 1) * sbw), V(-hw, 0, -D + b * sbw), st, tint);
    }
  }
  // corner posts
  for (const [x, z] of [[-hw, 0], [hw, 0], [-hw, -D], [hw, -D]]) A.trim.box(x - 0.16, x + 0.16, h.sink ? -h.sink : 0, H, z - 0.16, z + 0.16, COLORS.darkWood);
  // balcony on the front at the first floor line
  if (h.balcony && h.floors.length > 1) {
    const yb = h.floors[0];
    A.trim.box(-hw - 0.2, hw + 0.2, yb - 0.14, yb + 0.08, 0, 1.1, COLORS.wood);
    A.trim.box(-hw - 0.2, hw + 0.2, yb + 0.86, yb + 0.98, 1.0, 1.12, COLORS.red);
    for (let x = -hw; x <= hw + 0.01; x += 0.9) A.trim.box(x - 0.04, x + 0.04, yb + 0.08, yb + 0.86, 1.02, 1.1, COLORS.red);
  }
  // awning: a short tiled roof over the ground floor's front
  if (h.awning) {
    const ya = h.floors[0] - 0.05, out = 1.7, drop = 0.7;
    const L = Math.hypot(out, drop) * 0.45;
    A.roof.quad(V(-hw - 0.3, ya - drop, out), V(hw + 0.3, ya - drop, out), V(hw + 0.3, ya, 0), V(-hw - 0.3, ya, 0), [0, 0, (W + 0.6) * 0.45, 0, (W + 0.6) * 0.45, L, 0, L], h.roofColor);
    A.trim.box(-hw - 0.3, hw + 0.3, ya - drop - 0.18, ya - drop, out - 0.1, out + 0.02, COLORS.darkWood);
  }
  // the roof
  const ov = h.overhang ?? 1.1, rise = h.rise ?? Math.min(D * 0.42, 3.2), t = 0.45;
  const ye = H - 0.3, yr = H + rise;
  const slope = Math.hypot(D / 2 + ov, rise + 0.3);
  const W2 = W + ov * 2;
  if (h.roof === 'gable') {
    A.roof.quad(V(-hw - ov, ye, ov), V(hw + ov, ye, ov), V(hw + ov, yr, -D / 2), V(-hw - ov, yr, -D / 2), [0, 0, W2 * t, 0, W2 * t, slope * t, 0, slope * t], h.roofColor);
    A.roof.quad(V(hw + ov, ye, -D - ov), V(-hw - ov, ye, -D - ov), V(-hw - ov, yr, -D / 2), V(hw + ov, yr, -D / 2), [0, 0, W2 * t, 0, W2 * t, slope * t, 0, slope * t], h.roofColor);
    A.trim.tri(V(hw, H, 0), V(hw, H, -D), V(hw, yr - 0.15, -D / 2), [0, 0], [1, 0], [0.5, 1], COLORS.plaster);
    A.trim.tri(V(-hw, H, -D), V(-hw, H, 0), V(-hw, yr - 0.15, -D / 2), [0, 0], [1, 0], [0.5, 1], COLORS.plaster);
    A.trim.box(-hw - ov - 0.1, hw + ov + 0.1, yr - 0.12, yr + 0.3, -D / 2 - 0.28, -D / 2 + 0.28, COLORS.black);
  } else {
    const R = Math.max(0.05, hw + ov - (D / 2 + ov));
    const D2 = D + ov * 2;
    A.roof.quad(V(-hw - ov, ye, ov), V(hw + ov, ye, ov), V(R, yr, -D / 2), V(-R, yr, -D / 2), [0, 0, W2 * t, 0, (W2 / 2 + R) * t, slope * t, (W2 / 2 - R) * t, slope * t], h.roofColor);
    A.roof.quad(V(hw + ov, ye, -D - ov), V(-hw - ov, ye, -D - ov), V(-R, yr, -D / 2), V(R, yr, -D / 2), [0, 0, W2 * t, 0, (W2 / 2 + R) * t, slope * t, (W2 / 2 - R) * t, slope * t], h.roofColor);
    const sl = Math.hypot(hw + ov - R, rise + 0.3);
    A.roof.tri(V(hw + ov, ye, ov), V(hw + ov, ye, -D - ov), V(R, yr, -D / 2), [0, 0], [D2 * t, 0], [D2 * t * 0.5, sl * t], h.roofColor);
    A.roof.tri(V(-hw - ov, ye, -D - ov), V(-hw - ov, ye, ov), V(-R, yr, -D / 2), [0, 0], [D2 * t, 0], [D2 * t * 0.5, sl * t], h.roofColor);
    if (R > 0.3) A.trim.box(-R - 0.2, R + 0.2, yr - 0.12, yr + 0.28, -D / 2 - 0.26, -D / 2 + 0.26, COLORS.black);
  }
  // dark soffit under the eaves and a fascia board along the front
  A.trim.quad(V(-hw - ov, ye - 0.02, -D - ov), V(hw + ov, ye - 0.02, -D - ov), V(hw + ov, ye - 0.02, ov), V(-hw - ov, ye - 0.02, ov), [0, 0, 1, 0, 1, 1, 0, 1], COLORS.darkWood);
  A.trim.box(-hw - ov, hw + ov, ye - 0.4, ye, ov - 0.16, ov, COLORS.darkWood);
  // a sign hanging out from the corner at right angles to the street, readable from both sides
  if (h.sign !== undefined && h.floors.length > 1) {
    const cell = signAtlas().cells[h.sign % 16];
    const x = hw - 0.45, yb = h.floors[0] + 1.1, sh = Math.min(2.4, h.floors[1] - 1.45), sw = sh / 3;
    A.sign.quad(V(x, yb, 0.15), V(x, yb, 0.15 + sw), V(x, yb + sh, 0.15 + sw), V(x, yb + sh, 0.15), cell, WHITE);
    A.trim.box(x - 0.05, x + 0.05, yb + sh, yb + sh + 0.1, 0, 0.2 + sw, COLORS.darkWood);
  }
  // lanterns under the front eave
  if (h.lanterns) {
    const L = h.lanterns;
    const n = Math.max(1, Math.floor((W + ov) / L.every));
    for (let i = 0; i < n; i++) {
      const x = -((n - 1) * L.every) / 2 + i * L.every;
      const p = V(x, ye - 0.95, ov - 0.4).applyMatrix4(m);
      L.field.add(p, L.size ?? 0.85, L.color ?? LANTERN.red, h.yaw);
    }
  }
  return H + rise;
}

/** Cells for a food stall: open stalls on the ground floor, paper screens above. */
export function stallCells(rng: Rng) {
  const up = [CELL.shoji, CELL.shojiFigure, CELL.lattice, CELL.redRail, CELL.shoji];
  const pick = rng.int(0, 1);
  const top = rng.pick(up);
  return (f: number, b: number, side: 'front' | 'back' | 'side') => {
    if (side === 'front') return f === 0 ? ((b + pick) % 3 === 2 ? CELL.door : (b + pick) % 2 ? CELL.stall2 : CELL.stall) : (b % 3 === 1 ? CELL.shojiFigure : top);
    if (side === 'back') return f === 0 ? CELL.boards : CELL.woodWindow;
    return f === 0 ? CELL.plaster : (b % 2 ? CELL.shojiDim : CELL.plaster);
  };
}

/** Cells for a tall house: lit screens and lattices on every storey. */
export function houseCells(rng: Rng) {
  const kinds = [CELL.shoji, CELL.lattice, CELL.green, CELL.redRail, CELL.roundWindow, CELL.shojiFigure];
  const a = rng.pick(kinds), b2 = rng.pick(kinds);
  return (f: number, b: number, side: 'front' | 'back' | 'side') => {
    if (side === 'side') return (b + f) % 3 === 0 ? CELL.shojiDim : (b + f) % 3 === 1 ? CELL.plaster : a;
    if (side === 'back') return (b + f) % 2 ? CELL.woodWindow : CELL.boards;
    if (f === 0) return b % 2 ? CELL.door : CELL.lattice;
    return (b + f) % 4 === 0 ? CELL.shojiDim : f % 2 ? a : b2;
  };
}

/**
 * A rock wall along x at `z`, from y0 to y1, facing +z (face = 1) or -z (face = -1), with a rough surface.
 * `bulge` false keeps every bump behind the plane (for a wall with stairs along it).
 */
function rockWall(x0: number, x1: number, z: number, y0: number, y1: number, face: number, seed: number, bulge = true) {
  const nx = Math.ceil((x1 - x0) / 6), ny = 8;
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + (x0 + x1) / 2, y = p.getY(i) + (y0 + y1) / 2;
    const top = y > y1 - 0.01;
    // bulges and hollows, flat along the top edge so the terrace meets it cleanly
    let off = top ? 0 : (fbm(x * 0.05 + seed, y * 0.08, 3) - 0.5) * 7 * Math.min(1, (y1 - y) / 4);
    if (!bulge) off = -Math.abs(off) - 0.3 * Math.min(1, (y1 - y) / 2);
    p.setXYZ(i, x, y, z + off * face);
    uv.setXY(i, x / 9, y / 9);
  }
  // the plane faces +z; flip the winding for a wall that faces -z
  if (face < 0) { const idx = geo.index!; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); } }
  geo.computeVertexNormals();
  return geo;
}

export interface TownResult {
  group: THREE.Group;
  /** steam over the food stalls */
  plumes: PlumeSource[];
  /** points that light the water once the wave reaches them */
  waterLamps: THREE.Vector3[];
}

export function buildTown(lanterns: LanternField, lowDetail: boolean): TownResult {
  const rng = new Rng(17711);
  const group = new THREE.Group();
  const plumes: PlumeSource[] = [];
  const waterLamps: THREE.Vector3[] = [];
  const reach = lowDetail ? 150 : 230;

  // ---------- the near rim: the lantern street on both sides of the gate house ----------
  for (const side of [-1, 1]) {
    const A = newAccs();
    // front row: food stalls facing the ravine, fronts at z -1792.6, open to a walkway along the cliff edge
    let x = GATE.x1 + 1.2;
    while (x < reach) {
      const w = rng.pick([6.2, 7.5, 9, 9, 12]);
      const cx = side * (x + w / 2);
      addHouse(A, {
        x: cx, y: DECK, z: -1792.6, yaw: Math.PI, w, d: rng.range(7, 9), floors: [4.4, rng.chance(0.3) ? 3.8 : 3.3],
        cell: stallCells(rng), roof: rng.chance(0.6) ? 'gable' : 'hip', roofColor: rng.pick([COLORS.roofSlate, COLORS.roofBrown, COLORS.roofGreen]),
        lanterns: { field: lanterns, every: 2.2, color: rng.chance(0.75) ? LANTERN.red : LANTERN.white }, balcony: rng.chance(0.5), awning: true,
        sign: rng.int(0, 15), tint: new THREE.Color().setHSL(0.08, 0.2, rng.range(0.85, 1)),
      });
      // steam from the cooking pots, and a counter with stools in front of the stall
      if (x < 110) {
        plumes.push({ p: V(cx + rng.range(-1.5, 1.5), DECK + 1.4, -1793.4), n: 7, rise: 5, spread: 1, size: 1.4, speed: 0.7, alpha: 0.32, color: 0xf0e4d8 });
        A.trim.setMatrix(new THREE.Matrix4());
        A.trim.box(cx - w / 2 + 0.6, cx + w / 2 - 0.6, DECK, DECK + 1.05, -1794.1, -1793.2, COLORS.wood);
        A.trim.box(cx - w / 2 + 0.5, cx + w / 2 - 0.5, DECK + 1.05, DECK + 1.15, -1794.2, -1793.1, new THREE.Color(0x7a4a2a));
        for (let s = cx - w / 2 + 1.2; s < cx + w / 2 - 0.8; s += 1.4) A.trim.box(s - 0.22, s + 0.22, DECK, DECK + 0.7, -1795, -1794.56, COLORS.darkWood);
      }
      waterLamps.push(V(cx, DECK + 3, -1795));
      x += w + (rng.chance(0.2) ? rng.range(2, 4) : 0.05);
    }
    // second row behind: taller houses whose upper storeys show over the stalls (kept clear of the
    // castle's front door, which looks back along x = 0)
    x = 24;
    while (x < reach + 20) {
      const w = rng.range(9, 15);
      addHouse(A, {
        x: side * (x + w / 2), y: DECK, z: -1768 - rng.range(0, 6), yaw: Math.PI, w, d: rng.range(9, 12), floors: [4, 3.4, 3.4, ...(rng.chance(0.35) ? [3.4] : [])],
        cell: houseCells(rng), roof: rng.chance(0.5) ? 'hip' : 'gable', roofColor: rng.pick([COLORS.roofGreen, COLORS.roofSlate, COLORS.roofBrown]),
        lanterns: rng.chance(0.5) ? { field: lanterns, every: 3, color: LANTERN.white } : undefined, balcony: true,
      });
      x += w + rng.range(1, 6);
    }
    // a few towers further back for a skyline when you look back from the bridge
    for (const tx of [44, 78, 122, 170]) {
      if (tx > reach) continue;
      const w = rng.range(8, 11);
      addHouse(A, {
        x: side * tx, y: DECK, z: -1738 - rng.range(0, 10), yaw: Math.PI, w, d: w, floors: [4, 3.4, 3.4, 3.4, 3.4, ...(rng.chance(0.5) ? [3.4] : [])],
        cell: houseCells(rng), roof: 'hip', rise: 3.6, overhang: 1.6, roofColor: COLORS.roofGreen,
        lanterns: { field: lanterns, every: 2.6, color: LANTERN.red }, balcony: true,
      });
    }
    // houses hanging on the cliff below the street, on stilts down to the water
    for (let cx = 16; cx < reach - 10; cx += rng.range(14, 26)) {
      const w = rng.range(6, 9), y = rng.range(-20, -6);
      addHouse(A, {
        x: side * cx, y, z: RAVINE.near - 0.6 - rng.range(2.5, 4), yaw: Math.PI, w, d: 4, floors: [3, ...(rng.chance(0.5) ? [2.8] : [])],
        cell: (f, b, s) => (s === 'front' ? ((b + f) % 2 ? CELL.woodWindow : CELL.shoji) : CELL.boards), roof: 'gable', rise: 1.4, overhang: 0.6, roofColor: COLORS.roofSlate,
        lanterns: rng.chance(0.6) ? { field: lanterns, every: 3, color: LANTERN.yellow, size: 0.7 } : undefined, sink: y - WATER + 0.5,
      });
      waterLamps.push(V(side * cx, y + 2, RAVINE.near - 6));
    }
    const g = accMeshes(A, { receive: true });
    group.add(g);
  }

  // ---------- the far rim to the left of the bathhouse: a second street facing the bridge ----------
  {
    const A = newAccs();
    let x = -PODIUM.front.x0 + 4;
    while (x < reach) {
      const w = rng.pick([7, 8.5, 10, 12]);
      addHouse(A, {
        x: -(x + w / 2), y: DECK, z: RAVINE.far - 2.5, yaw: 0, w, d: rng.range(8, 10), floors: [4.2, 3.4, ...(rng.chance(0.45) ? [3.4] : [])],
        cell: rng.chance(0.5) ? stallCells(rng) : houseCells(rng), roof: rng.chance(0.5) ? 'gable' : 'hip', roofColor: rng.pick([COLORS.roofSlate, COLORS.roofGreen, COLORS.roofBrown]),
        lanterns: { field: lanterns, every: 2.4, color: rng.chance(0.7) ? LANTERN.red : LANTERN.yellow }, balcony: rng.chance(0.6), awning: rng.chance(0.5),
        sign: rng.chance(0.6) ? rng.int(0, 15) : undefined,
      });
      waterLamps.push(V(-(x + w / 2), DECK + 3, RAVINE.far));
      x += w + (rng.chance(0.25) ? rng.range(2, 5) : 0.05);
    }
    x = -PODIUM.front.x0 + 8;
    while (x < reach + 20) {
      const w = rng.range(10, 16);
      addHouse(A, {
        x: -(x + w / 2), y: DECK, z: RAVINE.far - 18 - rng.range(0, 8), yaw: 0, w, d: rng.range(9, 12), floors: [4, 3.4, 3.4, 3.4, ...(rng.chance(0.4) ? [3.4] : [])],
        cell: houseCells(rng), roof: 'hip', rise: 3, roofColor: rng.pick([COLORS.roofGreen, COLORS.roofSlate]),
        lanterns: rng.chance(0.6) ? { field: lanterns, every: 2.8, color: LANTERN.red } : undefined, balcony: true,
      });
      x += w + rng.range(2, 8);
    }
    for (let cx = 116; cx < reach - 10; cx += rng.range(14, 24)) {
      const w = rng.range(6, 9), y = rng.range(-20, -6);
      addHouse(A, {
        x: -cx, y, z: RAVINE.far + 0.6 + rng.range(2.5, 4) + 4, yaw: 0, w, d: 4, floors: [3, ...(rng.chance(0.5) ? [2.8] : [])],
        cell: (f, b, s) => (s === 'front' ? ((b + f) % 2 ? CELL.shoji : CELL.woodWindow) : CELL.boards), roof: 'gable', rise: 1.4, overhang: 0.6, roofColor: COLORS.roofBrown,
        lanterns: rng.chance(0.6) ? { field: lanterns, every: 3, color: LANTERN.yellow, size: 0.7 } : undefined, sink: y - WATER + 0.5,
      });
      waterLamps.push(V(-cx, y + 2, RAVINE.far + 8));
    }
    group.add(accMeshes(A, { receive: true }));
  }

  // ---------- the far shore across the open water to the right ----------
  {
    const A = newAccs();
    for (let z = -1800; z > -2010; z -= rng.range(9, 16)) {
      const x = 150 + Math.sin(z * 0.03) * 10 + rng.range(-4, 4), w = rng.range(7, 13);
      const y = WATER + 1.2;
      addHouse(A, {
        x, y, z, yaw: -Math.PI / 2 + rng.range(-0.15, 0.15), w, d: rng.range(6, 9), floors: [3.4, ...(rng.chance(0.6) ? [3.2] : []), ...(rng.chance(0.3) ? [3.2] : [])],
        cell: houseCells(rng), roof: rng.chance(0.5) ? 'hip' : 'gable', roofColor: rng.pick([COLORS.roofSlate, COLORS.roofBrown]),
        lanterns: rng.chance(0.5) ? { field: lanterns, every: 3, color: LANTERN.yellow, size: 0.9 } : undefined, sink: 1.5,
      });
      waterLamps.push(V(x - 6, y + 3, z));
    }
    group.add(accMeshes(A));
    // dark wooded hills behind the far shore
    const hill = new THREE.PlaneGeometry(160, 260, 24, 30).rotateX(-Math.PI / 2);
    const hp = hill.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i) + 240, z = hp.getZ(i) - 1905;
      const k = Math.max(0, Math.min(1, (x - 160) / 50));
      hp.setY(i, WATER - 1 + k * (26 + fbm(x * 0.02, z * 0.02, 3) * 40));
      hp.setX(i, x); hp.setZ(i, z);
    }
    hill.computeVertexNormals();
    const hm = new THREE.Mesh(hill, new THREE.MeshLambertMaterial({ color: 0x1c2a2a }));
    hm.userData.keep = true;
    group.add(hm);
  }

  // ---------- the ravine: rock walls under both rims, the terraces on top ----------
  {
    const rock = new THREE.MeshLambertMaterial({ map: cliffRock() });
    const walls: THREE.BufferGeometry[] = [
      rockWall(-420, -BRIDGE.half, RAVINE.near, WATER - 3, DECK, -1, 1),
      rockWall(BRIDGE.half, 420, RAVINE.near, WATER - 3, DECK, -1, 2),
      rockWall(-420, PODIUM.front.x0, RAVINE.far, WATER - 3, DECK, 1, 3, false),
      // under the bridge's near end
      rockWall(-BRIDGE.half - 0.5, BRIDGE.half + 0.5, RAVINE.near + 0.6, WATER - 3, DECK - 0.7, -1, 4),
    ];
    const wm = new THREE.Mesh(mergeGeometries(walls)!, rock);
    wm.receiveShadow = true; wm.userData.keep = true;
    group.add(wm);
    // the terraces: paving on the near rim (with a hole for the gate house) and on the far left rim
    const pave = new THREE.MeshLambertMaterial({ map: stoneWall(0x6a6258, { seed: 177 }) });
    const slab = (x0: number, x1: number, z0: number, z1: number) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z0 - z1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, DECK - 0.02, (z0 + z1) / 2);
      repeatUV(g, (x1 - x0) / 6, (z0 - z1) / 6);
      return g;
    };
    const slabs = [
      // (nothing directly behind the gate house: the castle's tongue comes down there)
      slab(-420, GATE.x0, -1700, RAVINE.near), slab(GATE.x1, 420, -1700, RAVINE.near),
      slab(-420, PODIUM.front.x0, RAVINE.far, -1990),
    ];
    const pm = new THREE.Mesh(mergeGeometries(slabs)!, pave);
    pm.receiveShadow = true; pm.userData.keep = true;
    group.add(pm);
    // railings along both cliff edges, with a lantern post now and then
    const A = newAccs();
    A.trim.setMatrix(new THREE.Matrix4());
    for (const [x0, x1, z, dir] of [[-reach, -BRIDGE.half - 0.4, RAVINE.near - 0.25, -1], [BRIDGE.half + 0.4, reach, RAVINE.near - 0.25, -1], [-reach, PODIUM.front.x0, RAVINE.far + 0.25, 1]] as const) {
      A.trim.box(x0, x1, DECK + 0.95, DECK + 1.1, z - 0.08, z + 0.08, COLORS.red);
      A.trim.box(x0, x1, DECK + 0.45, DECK + 0.55, z - 0.06, z + 0.06, COLORS.red);
      for (let x = x0; x <= x1; x += 1.8) A.trim.box(x - 0.07, x + 0.07, DECK, DECK + 1.1, z - 0.07, z + 0.07, COLORS.darkWood);
      for (let x = x0 + 6; x < x1 - 2; x += 12) {
        A.trim.box(x - 0.09, x + 0.09, DECK, DECK + 3.1, z - 0.09, z + 0.09, COLORS.darkWood);
        A.trim.box(x - 0.09, x + 0.09, DECK + 3.0, DECK + 3.12, z - 0.09, z + dir * 0.9, COLORS.darkWood);
        lanterns.add(V(x, DECK + 2.45, z + dir * 0.75), 0.75, LANTERN.red);
      }
    }
    group.add(accMeshes(A));
  }

  // ---------- the flooded railway at the bottom of the ravine, and signal posts in the water ----------
  {
    const parts: THREE.BufferGeometry[] = [];
    const zc = (RAVINE.near + RAVINE.far) / 2 + 6;
    for (const dz of [-0.75, 0.75]) parts.push(new THREE.BoxGeometry(840, 0.12, 0.12).translate(0, WATER + 0.03, zc + dz));
    const rail = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ color: 0x6a6460, emissive: 0x1a1410 }));
    rail.userData.keep = true;
    group.add(rail);
    const A = newAccs();
    A.trim.setMatrix(new THREE.Matrix4());
    for (let x = -300; x < 300; x += rng.range(50, 80)) {
      const sx = x + rng.range(-10, 10), sz = zc + rng.sign() * 3.2;
      A.trim.box(sx - 0.1, sx + 0.1, WATER - 0.5, WATER + 4.5, sz - 0.1, sz + 0.1, new THREE.Color(0x3a3e44));
      A.trim.box(sx - 0.3, sx + 0.3, WATER + 4.3, WATER + 5.1, sz - 0.3, sz + 0.3, new THREE.Color(0x2a2e34));
      lanterns.add(V(sx, WATER + 4.7, sz), 0.45, rng.chance(0.5) ? new THREE.Color(0.3, 1, 0.5) : new THREE.Color(1, 0.35, 0.25));
      waterLamps.push(V(sx, WATER + 4.7, sz));
    }
    group.add(accMeshes(A));
  }

  return { group, plumes, waterLamps };
}
