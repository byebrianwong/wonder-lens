import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canopyGeometry, type Blob } from '../../../engine/Foliage';
import { Rng, TAU, clamp, easeOutCubic, lerp, smoothstep } from '../../../engine/math';
import type { Road } from '../layout';
import { BED } from './layout';
import { camphorBark, soilTexture } from './textures';
import { barkMaterials, branchGeometry, growUniforms, leafMaterials, ringsAlong, type Ring } from './grow';

/*
 * The tree that grows in one night from the acorns in the seed bed (garden scene, world coordinates).
 *
 *  - The trunk: a massive twisting bole (radius 8 at the foot, flaring roots) rising from the bed beside
 *    the lane and bending forward, to a crown point at about y 47 from which great limbs fan out like the
 *    ribs of an umbrella. Warm brown camphor bark with moss on the upper sides and lichen.
 *  - The crown: a vast dome of leaf cards (a shell, open underneath) from y 41 to 78, about 130 wide and
 *    190 long, held up by those limbs. The path climbs inside it and comes out on top.
 *  - The great limb the Catbus runs up: it bursts out of the lane at z -42 as a root and winds up to the
 *    top of the crown, its top exactly under the path. Side branches fork off it to carry more leaves.
 *  - The top branch: a level bough on the left of the path at z -195 where Totoro sits.
 *
 * Growth follows the rider's z (see grow.ts). The eruption starts as the rider comes up to the bed
 * (z -21, the bed 9 ahead on the right): a green shoot bursts up and twists, browning into bark behind its tip, with tufts of young
 * leaves opening along it and the earth heaving up round its foot; the trunk, its limbs and the back of
 * the crown swell from a third of their size to full size by z -50. The great limb and its leaves unfold
 * 16 to 46 units ahead of the rider all the way up.
 */

/** Middle and radii of the crown's dome. */
export const CROWN = { c: new THREE.Vector3(6, 46, -112), r: new THREE.Vector3(64, 32, 96) };
/** Totoro's perch on top: where his feet go, the way he faces (yaw), and the bough's direction. */
export const PERCH = { pos: new THREE.Vector3(-10, 72.5, -195), yaw: 0.55 };
/** The great limb runs from where it leaves the lane to its tip, where the Catbus leaps off. */
export const LIMB = { z0: -42, z1: -207 };
/** Where the eruption starts and when the trunk is full grown. */
export const ERUPT = { z0: -21, z1: -50 };

export interface GiantTree {
  group: THREE.Group;
  /** the trunk, its limbs and the back of the crown: swells about the bed as it erupts */
  base: THREE.Group;
  /** call every frame with the rider's z */
  update(z: number): void;
  /** current size of the trunk system (0.32 .. 1) */
  readonly size: number;
  /** a point on the trunk's centre line at a height, at full size */
  axisAt(y: number, out?: THREE.Vector3): THREE.Vector3;
  /** height of the top of the crown at a world point, or -Infinity outside it */
  crownTop(x: number, z: number): number;
  /** where the trunk's growing tip is now (world), or null when the trunk is not growing */
  tip(z: number, out: THREE.Vector3): THREE.Vector3 | null;
  /** invisible boxes round the trunk, for line-of-sight checks */
  proxies: THREE.Group;
}

/** The lead of the great limb's growing tip over the rider, by z along the limb. */
export const limbKey = (z: number) => z + lerp(16, 46, smoothstep(-42, -100, z));

export function buildGiantTree(road: Road): GiantTree {
  const rng = new Rng(4848);
  const group = new THREE.Group();
  // the trunk system grows fast and short-tipped (a shoot, not a spike); the great limb a little slower
  const uTrunk = growUniforms(3.5, 1.1, 4), uLimb = growUniforms(6, 0.7, 8), uLeaf = growUniforms(6, 0, 1);
  const barkMap = camphorBark();
  const bark = barkMaterials(barkMap, uTrunk, 0x1c1008);
  const limbMat = barkMaterials(barkMap, uLimb, 0x1c1008);
  const leaves = leafMaterials(uLeaf, 0x0c1a10);
  const bed = new THREE.Vector3(BED.x, 0, BED.z);

  // the trunk system swells about the bed, so it is built relative to it
  const base = new THREE.Group();
  base.position.copy(bed);
  group.add(base);

  // ---------- path helpers ----------
  const pathP = (z: number) => { const a = road.at(z); return new THREE.Vector3(a.x, a.y, z); };
  /** distance from a point to the space the Catbus and the rider pass through (0 inside it) */
  const corridor = (p: THREE.Vector3) => {
    if (p.z > LIMB.z0 + 10 || p.z < LIMB.z1 - 24) return 99;
    const a = road.at(p.z);
    const lat = Math.abs((p.x - a.x) * a.rx + (p.z - a.z) * a.rz);
    const up = p.y - a.y;
    const dy = up < -0.5 ? -0.5 - up : up > 7 ? up - 7 : 0;
    return Math.hypot(Math.max(0, lat - 3.5), dy);
  };

  // ---------- the trunk ----------
  // straight up out of the bed, then bending forward over the field to the crown point
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(BED.x, -1.5, BED.z), new THREE.Vector3(BED.x + 0.2, 12, BED.z - 2), new THREE.Vector3(BED.x, 24, BED.z - 8), new THREE.Vector3(9.6, 34, BED.z - 20),
    new THREE.Vector3(8.4, 42, BED.z - 36), new THREE.Vector3(7, 47, BED.z - 54),
  ], false, 'centripetal');
  const S = new THREE.Vector3(7, 47, BED.z - 54);
  const trunkKey = (f: number) => lerp(ERUPT.z0, ERUPT.z0 - 19, f);
  const trunkR = (f: number) => lerp(7.8, 4.0, Math.pow(f, 0.7)) + 1.0 * (1 - smoothstep(0, 0.1, f));
  /** tufts of young leaves along the trunk and limbs, opening just behind the growing tip */
  const tufts: Array<Blob & { key: number }> = [], limbTufts: Array<Blob & { key: number }> = [];
  const barkParts: THREE.BufferGeometry[] = [];
  {
    // radius 8 at the foot (a little more where it flares into the roots), 4 at the crown point
    const rings = ringsAlong(trunkCurve, 44, trunkR, trunkKey);
    for (const r of rings) r.c.sub(bed);
    barkParts.push(branchGeometry(rings, 22, { gnarl: 0.1, spiral: 0.35, tip: false, moss: 0.55 }));
    for (let f = 0.16; f < 0.97; f += 0.07) {
      for (let k = 0; k < 2; k++) {
        const a = rng.range(0, TAU), d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        const c = trunkCurve.getPointAt(f).addScaledVector(d, trunkR(f) * 0.95 + 1.2).add(new THREE.Vector3(0, 0.8, 0));
        const r = lerp(2.0, 3.0, f) * rng.range(0.85, 1.15);
        tufts.push({ c, r: new THREE.Vector3(r, r * 0.75, r), key: trunkKey(f) - 1.2 });
      }
    }
  }
  // flaring roots, all round except towards the lane where the great limb comes out
  for (const a of [-0.3, 0.45, 1.1, 1.72, 4.3, 4.95, 5.6]) {
    const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const len = rng.range(13, 17);
    const c = new THREE.CatmullRomCurve3([
      bed.clone().addScaledVector(d, 3).setY(7), bed.clone().addScaledVector(d, 8.5).setY(3.2), bed.clone().addScaledVector(d, len * 0.8).setY(0.2), bed.clone().addScaledVector(d, len).setY(-1.6),
    ]);
    const rings = ringsAlong(c, 12, (f) => lerp(3.4, 0.7, f), (f) => lerp(ERUPT.z0 - 0.5, ERUPT.z0 - 7, f));
    for (const r of rings) r.c.sub(bed);
    barkParts.push(branchGeometry(rings, 10, { gnarl: 0.1, moss: 0.7 }));
  }

  // ---------- the crown's dome: leaf clumps on a shell, and the limbs that hold them ----------
  const C = CROWN.c, R = CROWN.r;
  const shellBlobs: Array<Blob & { key: number }> = [];
  const crownKey = (z: number) => Math.min(ERUPT.z0 - 15, z + 50) - rng.range(0, 3);
  for (const e of [-8, 7, 21, 35, 49, 62, 75]) {
    const er = THREE.MathUtils.degToRad(e);
    const n = Math.max(5, Math.round(36 * Math.cos(er)));
    for (let i = 0; i < n; i++) {
      const az = (i / n) * TAU + rng.range(-0.08, 0.08) + e * 0.05;
      const k = rng.range(0.93, 1.03);
      const p = new THREE.Vector3(C.x + R.x * Math.cos(er) * Math.cos(az) * k, C.y + R.y * Math.sin(er) * k, C.z + R.z * Math.cos(er) * Math.sin(az) * k);
      const r = rng.range(8.5, 11);
      shellBlobs.push({ c: p, r: new THREE.Vector3(r, r * 0.68, r), key: crownKey(p.z) });
    }
  }
  // great limbs from the crown point out to the dome, like the ribs of an umbrella
  const ribEnds: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const az = (i / 16) * TAU + rng.range(-0.12, 0.12);
    const er = THREE.MathUtils.degToRad(rng.range(6, 24));
    const end = new THREE.Vector3(C.x + R.x * 0.9 * Math.cos(er) * Math.cos(az), C.y + R.y * 0.9 * Math.sin(er), C.z + R.z * 0.9 * Math.cos(er) * Math.sin(az));
    const mid = S.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 6, 0));
    const curve = new THREE.CatmullRomCurve3([S.clone().add(new THREE.Vector3(0, -2, 0)), mid, end]);
    // keep them clear of the path
    let ok = true;
    for (let k = 0; k <= 20 && ok; k++) if (corridor(curve.getPointAt(k / 20)) < 3.2) ok = false;
    if (!ok) continue;
    ribEnds.push(end);
    const len = curve.getLength();
    const rk = (f: number) => lerp(ERUPT.z0 - 15, crownKey(end.z) + 4, f);
    const rings = ringsAlong(curve, Math.max(10, Math.round(len / 4)), (f) => lerp(3.2, 0.9, f), rk);
    for (const r of rings) r.c.sub(bed);
    barkParts.push(branchGeometry(rings, 10, { gnarl: 0.1, moss: 0.6 }));
    for (const f of [0.3, 0.55, 0.8]) tufts.push({ c: curve.getPointAt(f).add(new THREE.Vector3(0, 1.6, 0)), r: new THREE.Vector3(2.4, 1.8, 2.4), key: rk(f) - 1.5 });
    // clumps along the rib, so the crown has body when seen from below
    const m = curve.getPointAt(0.62);
    const r = rng.range(5.5, 7.5);
    shellBlobs.push({ c: m.add(new THREE.Vector3(0, 3, 0)), r: new THREE.Vector3(r, r * 0.6, r), key: crownKey(m.z) - 2 });
  }
  const baseBark = new THREE.Mesh(mergeGeometries(barkParts)!, bark.material);
  baseBark.customDepthMaterial = bark.depth;
  baseBark.castShadow = true; baseBark.receiveShadow = true;
  base.add(baseBark);

  // ---------- the great limb along the path, its side branches, the top bough ----------
  const limbParts: THREE.BufferGeometry[] = [];
  const limbBlobs: Array<Blob & { key: number }> = [];
  const limbAxis: Array<{ z: number; c: THREE.Vector3; r: number }> = [];
  {
    const rings: Ring[] = [];
    for (let z = LIMB.z0; z >= LIMB.z1; z -= 1.5) {
      const a = pathP(z + 0.75), b = pathP(z - 0.75);
      const slope = Math.atan2(a.y - b.y, Math.hypot(a.x - b.x, 1.5));
      const r = lerp(4.0, 2.1, smoothstep(-52, -205, z)) + 2.8 * (1 - smoothstep(LIMB.z0, LIMB.z0 - 18, z));
      const p = pathP(z);
      // the limb's top is exactly the path
      const c = new THREE.Vector3(p.x, p.y - r / Math.cos(slope), z);
      rings.push({ c, r, key: limbKey(z) });
      limbAxis.push({ z, c, r });
    }
    limbParts.push(branchGeometry(rings, 18, { gnarl: 0.1, smoothTop: true, moss: 0.4 }));
    // tufts of leaves along its sides, below the path
    for (let k = 0; k < rings.length; k += 7) {
      const z = rings[k].c.z, at = road.at(z), side = (k / 7) % 2 ? -1 : 1;
      const c = rings[k].c.clone().add(new THREE.Vector3(at.rx * side * (rings[k].r + 1.4), -rings[k].r * 0.3, at.rz * side * (rings[k].r + 1.4)));
      limbTufts.push({ c, r: new THREE.Vector3(2.2, 1.6, 2.2), key: rings[k].key - 2 });
    }
  }
  const axisAtZ = (z: number) => {
    const i = clamp(Math.round((LIMB.z0 - z) / 1.5), 0, limbAxis.length - 1);
    return limbAxis[i];
  };
  // where the great limb meets the trunk's foot: a buttress joining the two, below the path
  {
    const end = axisAtZ(LIMB.z0 - 14).c.clone().add(new THREE.Vector3(1.2, -1.8, 0));
    const web = new THREE.CatmullRomCurve3([new THREE.Vector3(BED.x - 3, 2.2, BED.z - 4), new THREE.Vector3(BED.x - 9, 0, LIMB.z0 - 6), end]);
    limbParts.push(branchGeometry(ringsAlong(web, 10, (f) => lerp(4.0, 2.8, f), () => ERUPT.z0 - 4), 12, { gnarl: 0.1, moss: 0.6 }));
  }
  // side branches off the great limb, alternately right and left, reaching out and up to the dome
  {
    const forks = [-62, -78, -95, -112, -128, -144, -160, -176, -190];
    forks.forEach((fz, i) => {
      const side = i % 2 ? -1 : 1;
      const ax = axisAtZ(fz), at = road.at(fz);
      const right = new THREE.Vector3(at.rx, 0, at.rz), fwd = new THREE.Vector3(-at.rz, 0, at.rx);
      if (fwd.z > 0) fwd.negate();
      const top = fz < -170;
      const L = top ? rng.range(12, 16) : rng.range(18, 26);
      const p0 = ax.c.clone();
      const p1 = p0.clone().addScaledVector(right, side * 7).add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(fwd, 2);
      const p2 = p0.clone().addScaledVector(right, side * L).add(new THREE.Vector3(0, top ? 1.5 : L * 0.55, 0)).addScaledVector(fwd, top ? 3 : 6);
      const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
      const k0 = limbKey(fz) - 2;
      limbParts.push(branchGeometry(ringsAlong(curve, 12, (f) => lerp(Math.min(1.8, ax.r * 0.55), 0.45, f), (f) => k0 - f * 7), 8, { gnarl: 0.12, moss: 0.5 }));
      const r = top ? rng.range(5, 6.5) : rng.range(6, 8);
      limbBlobs.push({ c: p2.clone().add(new THREE.Vector3(0, top ? -1 : 1.5, 0)), r: new THREE.Vector3(r, r * 0.7, r), key: k0 - 6 });
      if (!top) limbBlobs.push({ c: curve.getPointAt(0.6).add(new THREE.Vector3(0, 2.5, 0)), r: new THREE.Vector3(4.5, 3.4, 4.5), key: k0 - 4 });
    });
  }
  // the top bough where Totoro sits: a level branch on a rising support, among leaves
  const perchAlong = new THREE.Vector3(Math.cos(PERCH.yaw), 0, -Math.sin(PERCH.yaw));
  {
    const P = PERCH.pos, rr = 1.25;
    const kp = limbKey(-188) - 6;
    const support = new THREE.CatmullRomCurve3([new THREE.Vector3(P.x - 4, 56, P.z + 10), new THREE.Vector3(P.x - 2, 64, P.z + 5), new THREE.Vector3(P.x - 0.5, P.y - rr - 0.4, P.z + 0.5)]);
    limbParts.push(branchGeometry(ringsAlong(support, 12, (f) => lerp(2.6, 1.7, f), (f) => kp + 8 - f * 6), 10, { gnarl: 0.12, moss: 0.5 }));
    const bar = new THREE.CatmullRomCurve3([
      P.clone().addScaledVector(perchAlong, -6.2).setY(P.y - rr - 0.5), P.clone().addScaledVector(perchAlong, -3).setY(P.y - rr),
      P.clone().setY(P.y - rr), P.clone().addScaledVector(perchAlong, 3.5).setY(P.y - rr), P.clone().addScaledVector(perchAlong, 6.2).setY(P.y - rr - 0.6),
    ]);
    limbParts.push(branchGeometry(ringsAlong(bar, 18, (f) => rr * (1 - 0.35 * Math.abs(f - 0.45)), () => kp), 10, { gnarl: 0.06, smoothTop: true, moss: 0.6 }));
    for (const [a, y, b, r] of [[-5, -3.5, -2, 4.5], [0, -4.5, -3.5, 5], [5, -3.8, -2.2, 4.5], [-2, -5.5, 2.5, 4], [7, -5, 1.5, 3.6], [-7.5, -5, 1, 3.6]] as const) {
      const c = P.clone().addScaledVector(perchAlong, a).add(new THREE.Vector3(0, y, 0)).add(new THREE.Vector3(Math.sin(PERCH.yaw), 0, Math.cos(PERCH.yaw)).multiplyScalar(b));
      limbBlobs.push({ c, r: new THREE.Vector3(r, r * 0.7, r), key: kp - 3 });
    }
  }
  const limbBark = new THREE.Mesh(mergeGeometries(limbParts)!, limbMat.material);
  limbBark.customDepthMaterial = limbMat.depth;
  limbBark.castShadow = true; limbBark.receiveShadow = true;
  group.add(limbBark);

  // ---------- leaves ----------
  /** Cards for a set of clumps, each card keyed to its clump, minus any that would sit in the path. */
  const leafMesh = (blobs: Array<Blob & { key: number }>, origin: THREE.Vector3, seed: number, density: number, cardScale: number, tint: [number, number] = [0x3f7a3a, 0x6aa04a]) => {
    const parts: THREE.BufferGeometry[] = [];
    const lr = new Rng(seed);
    for (const b of blobs) {
      const g = canopyGeometry([b], lr, { density, cardScale, center: C });
      const pos = g.attributes.position as THREE.BufferAttribute;
      const n = pos.count;
      const keep: number[] = [];
      const p = new THREE.Vector3();
      for (let i = 0; i < n; i += 4) {
        p.fromBufferAttribute(pos, i);
        if (corridor(p) < 0.6) continue;
        keep.push(i);
      }
      if (!keep.length) continue;
      const cen: number[] = [], key: number[] = [];
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'color', 'uv', 'cardCorner'] as const) {
        const a = g.attributes[name] as THREE.BufferAttribute, sz = a.itemSize;
        const arr = new Float32Array(keep.length * 4 * sz);
        keep.forEach((i, k) => { for (let v = 0; v < 4; v++) for (let c = 0; c < sz; c++) arr[(k * 4 + v) * sz + c] = a.array[(i + v) * sz + c]; });
        out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
      }
      keep.forEach(() => { for (let v = 0; v < 4; v++) { cen.push(b.c.x, b.c.y, b.c.z); key.push(b.key - lr.range(0, 2.5)); } });
      out.setAttribute('aCentre', new THREE.Float32BufferAttribute(cen, 3));
      // the four corners of one card share a key, so a card opens as one
      for (let k = 0; k < keep.length; k++) { const v = key[k * 4]; key[k * 4 + 1] = key[k * 4 + 2] = key[k * 4 + 3] = v; }
      out.setAttribute('aKey', new THREE.Float32BufferAttribute(key, 1));
      const idx: number[] = [];
      for (let k = 0; k < keep.length; k++) { const v = k * 4; idx.push(v, v + 1, v + 2, v, v + 2, v + 3); }
      out.setIndex(idx);
      parts.push(out);
    }
    const geo = mergeGeometries(parts)!;
    geo.translate(-origin.x, -origin.y, -origin.z);
    // aCentre must follow the same shift
    const cen = geo.attributes.aCentre as THREE.BufferAttribute;
    for (let i = 0; i < cen.count; i++) cen.setXYZ(i, cen.getX(i) - origin.x, cen.getY(i) - origin.y, cen.getZ(i) - origin.z);
    geo.computeBoundingSphere();
    geo.boundingSphere!.radius += 4;
    const m = new THREE.Mesh(geo, leaves.material);
    m.customDepthMaterial = leaves.depth;
    m.castShadow = true; m.receiveShadow = true;
    // tint: deep camphor green with lighter young growth on top
    const col = geo.attributes.color as THREE.BufferAttribute, a = new THREE.Color(tint[0]), b = new THREE.Color(tint[1]);
    for (let i = 0; i < col.count; i++) {
      const t = clamp((geo.attributes.position.getY(i) + origin.y - 40) / 40, 0, 1);
      const c = a.clone().lerp(b, t * 0.8);
      col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    }
    return m;
  };
  base.add(leafMesh(shellBlobs, bed, 4901, 0.085, 0.8));
  group.add(leafMesh(limbBlobs, new THREE.Vector3(), 4902, 0.12, 0.7));
  // young leaves along the trunk and limbs: a fresher green
  base.add(leafMesh(tufts, bed, 4903, 0.4, 0.75, [0x5a9a3a, 0x8ac850]));
  group.add(leafMesh(limbTufts, new THREE.Vector3(), 4904, 0.4, 0.7, [0x5a9a3a, 0x8ac850]));

  // ---------- the earth heaving up round the foot of the trunk ----------
  const mound = (() => {
    const prof = [[5, -0.6], [6.5, 0.6], [8.5, 1.5], [10.5, 1.1], [12, 0.4], [13, -0.2], [13.5, -0.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(prof, 40);
    // break up the ring so it reads as heaped, torn earth
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const a = Math.atan2(z, x);
      if (y > 0) pos.setY(i, y * (0.7 + 0.5 * Math.abs(Math.sin(a * 5 + 1.3)) + 0.2 * Math.sin(a * 13)));
    }
    geo.computeVertexNormals();
    const tex = soilTexture().clone(); tex.needsUpdate = true; tex.repeat.set(6, 1);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, color: 0xb89a80 }));
    m.position.set(BED.x, 0, BED.z);
    m.receiveShadow = true;
    return m;
  })();
  group.add(mound);

  // ---------- line-of-sight stand-ins: the trunk and the great limb ----------
  const proxies = new THREE.Group();
  group.add(proxies);
  {
    const mat = new THREE.MeshBasicMaterial();
    const add = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, len, r * 1.6), mat);
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.visible = false;
      proxies.add(m);
    };
    for (let k = 0; k < 4; k++) add(trunkCurve.getPointAt(k / 4), trunkCurve.getPointAt((k + 1) / 4), 6.5);
    for (let k = 0; k + 12 < limbAxis.length; k += 12) add(limbAxis[k].c, limbAxis[k + 12].c, limbAxis[k].r);
  }

  let size = 0.32;
  const tmp = new THREE.Vector3();
  const axisSamples = trunkCurve.getSpacedPoints(60);
  return {
    group, base, proxies,
    get size() { return size; },
    update(z) {
      uTrunk.uRideZ.value = uLimb.uRideZ.value = uLeaf.uRideZ.value = z;
      size = 0.32 + 0.68 * easeOutCubic(smoothstep(ERUPT.z0, ERUPT.z1, z));
      base.scale.setScalar(size);
      // the trunk turns as it rises, and settles as it reaches full size
      base.rotation.y = (1 - smoothstep(ERUPT.z0, ERUPT.z1, z)) * 0.35;
      // the ground heaves up round its foot
      mound.scale.set(lerp(0.5, 1, smoothstep(ERUPT.z0, ERUPT.z0 - 8, z)), Math.max(0.001, smoothstep(ERUPT.z0 + 0.5, ERUPT.z0 - 6, z)), lerp(0.5, 1, smoothstep(ERUPT.z0, ERUPT.z0 - 8, z)));
      group.visible = z < ERUPT.z0 + 1;
    },
    axisAt(y, out = tmp) {
      // the samples rise steadily, so find the pair that brackets the height
      const k = axisSamples.findIndex((p) => p.y >= y);
      if (k <= 0) return out.copy(axisSamples[k < 0 ? axisSamples.length - 1 : 0]);
      const a = axisSamples[k - 1], b = axisSamples[k];
      return out.copy(a).lerp(b, (y - a.y) / Math.max(1e-6, b.y - a.y));
    },
    tip(z, out) {
      const f = (ERUPT.z0 - z) / 19;
      if (f <= 0 || f >= 1.05) return null;
      base.updateMatrixWorld(true);
      return out.copy(trunkCurve.getPointAt(Math.min(1, f))).sub(bed).applyMatrix4(base.matrixWorld);
    },
    crownTop(x, z) {
      const dx = (x - C.x) / R.x, dz = (z - C.z) / R.z;
      const k = 1 - dx * dx - dz * dz;
      return k > 0 ? C.y + R.y * Math.sqrt(k) + 3 : -Infinity;
    },
  };
}
