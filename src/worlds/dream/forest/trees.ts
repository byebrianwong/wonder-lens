import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { canopyGeometry, foliageMaterial, type Blob } from '../../../engine/Foliage';
import { Rng, TAU, clamp, lerp, noise2, smoothstep } from '../../../engine/math';
import { cedarBark, mossTexture, fernTexture, hangingMossTexture } from './textures';

/*
 * The trees and ground cover of the Forest Spirit's wood.
 *
 * - `barkMaterial` is cedar bark with moss painted over it where a vertex's `moss` value is high.
 * - `cedarTrunk` builds one trunk with buttress roots at its foot; `logAlong` and `rootAlong` build a fallen
 *   trunk and a long root whose tops follow a curve exactly (the path runs on them).
 * - `CedarStand` places many cedars as instanced trunks and crowns, a few shapes shared by all of them,
 *   split into stretches of z so each stretch can be hidden on its own.
 * - Ferns, mossy boulders, hanging moss and shelf fungi are instanced too.
 */

// ---------------- materials ----------------
let barkMat: THREE.MeshLambertMaterial | null = null;
/** Cedar bark with moss over it where the geometry's `moss` attribute is high (0..1). Shared by every trunk, root and log. */
export function barkMaterial() {
  if (barkMat) return barkMat;
  const mat = new THREE.MeshLambertMaterial({ map: cedarBark() });
  const u = { uMoss: { value: mossTexture() } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float moss;\nvarying float vMoss;\nvarying vec2 vBarkUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMoss = moss;\nvBarkUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMoss;\nvarying float vMoss;\nvarying vec2 vBarkUv;')
      .replace('#include <map_fragment>', /* glsl */ `#include <map_fragment>
        vec3 mossC = texture2D(uMoss, vBarkUv * vec2(2.0, 1.0)).rgb;
        float mossN = dot(mossC, vec3(0.3, 0.6, 0.1));
        // the moss edge is broken up by the moss texture itself, so it reads as clumps rather than a line
        float mk = smoothstep(0.42, 0.6, vMoss + (mossN - 0.3) * 1.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, mossC * 1.15, mk);`);
  };
  mat.customProgramCacheKey = () => 'dream-forest-bark-v1';
  barkMat = mat;
  return mat;
}

let woodMat: THREE.MeshLambertMaterial | null = null;
/** Pale broken wood, for the splintered end of the fallen cedar and snapped branches. */
export function woodMaterial() {
  return woodMat ??= new THREE.MeshLambertMaterial({ color: 0xb08a62 });
}

/** Average the normals of the duplicated seam column of a lathe-like grid, so no lighting seam shows. */
function weldSeam(geo: THREE.BufferGeometry, cols: number, rows: number) {
  const n = geo.attributes.normal as THREE.BufferAttribute;
  for (let j = 0; j <= rows; j++) {
    const a = j * (cols + 1), b = a + cols;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
}

/** Index a grid of (cols + 1) x (rows + 1) vertices; `flip` reverses the winding so the faces point the other way. */
function gridGeometry(pos: number[], uv: number[], moss: number[], cols: number, rows: number, seam: boolean, flip = false) {
  const idx: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b);
    else idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('moss', new THREE.Float32BufferAttribute(moss, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (seam) weldSeam(g, cols, rows);
  g.computeBoundingSphere();
  return g;
}

// ---------------- one trunk ----------------
export interface TrunkOpts {
  height: number;
  /** radius just above the root flare, and at the top */
  r0: number; rTop: number;
  /** extra radius at the foot, and the height over which it fades */
  flare: number; flareH: number;
  /** number of buttress roots */
  lobes: number;
  seed: number;
  radial?: number; rings?: number;
  /** how far the foot goes below y 0 (so it sits into sloping ground) */
  sink?: number;
  /** sideways drift of the top, in units */
  bend?: number;
  /** height below which the bark is mossy */
  mossH?: number;
  /** world units per bark tile across (scales the texture for instanced trunks that are scaled up later) */
  texScale?: number;
}

/** Radius of a trunk at a height and an angle round it. */
export function trunkRadius(o: TrunkOpts, lobes: Array<{ a: number; k: number }>, y: number, th: number) {
  const base = lerp(o.r0, o.rTop, Math.pow(clamp(y / o.height, 0, 1), 0.9));
  const fl = o.flare * Math.exp(-Math.max(y, 0) / o.flareH);
  let lobe = 0;
  for (const l of lobes) lobe += l.k * Math.pow(Math.max(0, Math.cos(th - l.a)), 6);
  // the noise is read round a circle, so it joins up where the angle wraps round
  const cx = Math.cos(th), sx = Math.sin(th);
  const gnarl = 1 + 0.07 * (noise2(cx * 1.5 + y * 0.07, sx * 1.5 + o.seed) - 0.5) * 2 + 0.025 * Math.sin(th * 13 + noise2(cx + y * 0.1, sx) * 3);
  return (base + fl * (0.3 + lobe)) * gnarl;
}

/** A cedar trunk: tall, slightly tapering, gnarled, with buttress roots spreading at the foot and moss low down. */
export function cedarTrunk(o: TrunkOpts) {
  const rng = new Rng(o.seed);
  const radial = o.radial ?? 20, rings = o.rings ?? 30, sink = o.sink ?? 2, ts = o.texScale ?? 1;
  const lobes = Array.from({ length: o.lobes }, (_, i) => ({ a: (i / o.lobes) * TAU + rng.range(-0.35, 0.35), k: rng.range(0.6, 1.25) }));
  const bendA = rng.range(0, TAU), bend = o.bend ?? 0, north = rng.range(0, TAU);
  const mossH = o.mossH ?? o.height * 0.25;
  const uRep = Math.max(1, Math.round((TAU * o.r0 * ts) / 6));
  const pos: number[] = [], uv: number[] = [], moss: number[] = [];
  for (let j = 0; j <= rings; j++) {
    const y = -sink + (o.height + sink) * Math.pow(j / rings, 1.5);
    const k = clamp(y / o.height, 0, 1);
    const cx = Math.cos(bendA) * bend * k * k, cz = Math.sin(bendA) * bend * k * k;
    for (let i = 0; i <= radial; i++) {
      const th = (i / radial) * TAU;
      const r = trunkRadius(o, lobes, y, th);
      // angle 0 faces +z and the angle grows towards -x, which keeps the faces pointing outwards
      pos.push(cx - Math.sin(th) * r, y, cz + Math.cos(th) * r);
      uv.push((i / radial) * uRep, (y * ts) / 12);
      const fl = Math.exp(-Math.max(y, 0) / o.flareH);
      moss.push(clamp((1 - smoothstep(mossH * 0.3, mossH, y)) * 0.85 + 0.25 * Math.cos(th - north) + fl * 0.3, 0, 1));
    }
  }
  /** A point on the bark at a height and an angle (0 faces +z, growing towards -x), and the outward direction there. */
  const surfaceAt = (y: number, th: number, out = new THREE.Vector3()) => {
    const k = clamp(y / o.height, 0, 1), r = trunkRadius(o, lobes, y, th);
    return out.set(Math.cos(bendA) * bend * k * k - Math.sin(th) * r, y, Math.sin(bendA) * bend * k * k + Math.cos(th) * r);
  };
  return { geometry: gridGeometry(pos, uv, moss, radial, rings, true), surfaceAt };
}

// ---------------- a log or root whose top follows a curve ----------------
/**
 * A fallen trunk lying along a curve, its top exactly on the curve (the path runs along it). `radius(t)`
 * gives the radius along the curve (t 0..1). The moss lies thickest along the top.
 */
export function logAlong(curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, o: { segs?: number; radial?: number; seed?: number } = {}) {
  const segs = o.segs ?? 80, radial = o.radial ?? 28;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), upv = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
  const pos: number[] = [], uv: number[] = [], moss: number[] = [];
  let dist = 0, prev: THREE.Vector3 | null = null;
  const seed = o.seed ?? 3;
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    const p = curve.getPointAt(t), T = curve.getTangentAt(t);
    if (prev) dist += p.distanceTo(prev);
    prev = p;
    side.crossVectors(T, up).normalize();
    upv.crossVectors(side, T).normalize();
    const r = radius(t);
    c.copy(p).addScaledVector(upv, -r);
    const uRep = Math.max(1, Math.round((TAU * r) / 6));
    for (let i = 0; i <= radial; i++) {
      // the first and last columns are underneath, so the texture's seam is out of sight
      const a = (i / radial) * TAU - Math.PI / 2;
      d.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(upv, Math.sin(a));
      const top = Math.sin(a);
      // the top stays smooth where the paws run; the flanks are knobbly
      const rr = r * (1 + (1 - Math.max(0, top)) * 0.06 * (noise2(Math.cos(a) * 2 + seed, Math.sin(a) * 2 + dist * 0.2) - 0.5) * 2);
      pos.push(c.x + d.x * rr, c.y + d.y * rr, c.z + d.z * rr);
      uv.push((i / radial) * uRep, dist / 12);
      moss.push(clamp(smoothstep(-0.2, 0.55, top) * 0.95 + 0.25 * noise2(Math.cos(a) * 1.5, Math.sin(a) * 1.5 + dist * 0.15 + seed), 0, 1));
    }
  }
  return gridGeometry(pos, uv, moss, radial, segs, true);
}

/**
 * A great root (or a buttress) whose top edge follows a curve: a rounded crest and steep sides that flare
 * out as they go down to `bottom(t)` (a world height, below the ground). `width(t)` gives the half widths
 * [left, right] of the crest; `drop(t)` lowers the crest below the curve.
 */
export function rootAlong(curve: THREE.Curve<THREE.Vector3>, o: { width: (t: number) => [number, number]; bottom: (t: number, p: THREE.Vector3) => number; drop?: (t: number) => number; segs?: number; seed?: number; flare?: number }) {
  const segs = o.segs ?? 60, flare = o.flare ?? 0.35;
  const right = new THREE.Vector3(), p = new THREE.Vector3(), T = new THREE.Vector3();
  const pos: number[] = [], uv: number[] = [], moss: number[] = [];
  // the cross-section: up the left wall, over the crest, down the right wall
  const ARC = 12, WALL = 5;
  const prof: Array<{ s: number; f: number; arc: boolean }> = [];
  for (let k = WALL; k >= 1; k--) prof.push({ s: -1, f: k / WALL, arc: false });
  for (let k = 0; k <= ARC; k++) prof.push({ s: k < ARC / 2 ? -1 : 1, f: (k / ARC) * 2 - 1, arc: true });
  for (let k = 1; k <= WALL; k++) prof.push({ s: 1, f: k / WALL, arc: false });
  const cols = prof.length - 1;
  let dist = 0, prev: THREE.Vector3 | null = null;
  const seed = o.seed ?? 5;
  for (let j = 0; j <= segs; j++) {
    const t = j / segs;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, T);
    if (prev) dist += p.distanceTo(prev);
    prev = p.clone();
    // sections stand upright, square to the curve's direction over the ground
    right.set(-T.z, 0, T.x);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const [wl, wr] = o.width(t);
    const drop = o.drop ? o.drop(t) : 0;
    const crestDrop = 1.2 + 0.3 * Math.max(wl, wr);
    const bottom = o.bottom(t, p);
    let around = 0, lastX = 0, lastY = 0;
    prof.forEach((q, k) => {
      let lat: number, dy: number;
      if (q.arc) {
        const phi = q.f * Math.PI / 2;
        lat = (q.f < 0 ? wl : wr) * Math.sin(phi);
        dy = -crestDrop * (1 - Math.cos(phi)) - drop;
      } else {
        const w = q.s < 0 ? wl : wr;
        const top = -crestDrop - drop, low = bottom - p.y;
        const f = q.f;
        dy = lerp(top, low, f);
        // the walls flare out towards the ground like a buttress, with knobbly bark
        lat = q.s * (w + Math.max(0, top - dy) * flare * f + 0.25 * (noise2(dist * 0.25 + seed, f * 3 + q.s) - 0.5));
      }
      const x = p.x + right.x * lat, y = p.y + dy, z = p.z + right.z * lat;
      if (k > 0) around += Math.hypot(lat - lastX, dy - lastY);
      lastX = lat; lastY = dy;
      pos.push(x, y, z);
      uv.push(around / 6, dist / 12);
      const crest = q.arc ? 1 - Math.abs(q.f) * 0.6 : 0;
      const nearGround = q.arc ? 0 : smoothstep(0.55, 1, q.f);
      moss.push(clamp(crest * 0.95 + nearGround * 0.8 + 0.2 * noise2(k * 0.5 + seed, dist * 0.2), 0, 1));
    });
  }
  return gridGeometry(pos, uv, moss, cols, segs, false, true);
}

/** A dead branch from `a` to `b`: a tapering cylinder with moss along its top. */
export function branchGeometry(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r0, len, 10, 4, false);
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  geo.translate(a.x, a.y, a.z);
  const n = geo.attributes.normal as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  const moss: number[] = [];
  for (let i = 0; i < n.count; i++) {
    moss.push(clamp(smoothstep(0.05, 0.7, n.getY(i)) * 0.95, 0, 1));
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round((TAU * r0) / 3)), uv.getY(i) * len / 12);
  }
  geo.setAttribute('moss', new THREE.Float32BufferAttribute(moss, 1));
  return geo;
}

// ---------------- crowns ----------------
/** Blobs for a tall cedar crown on a trunk of radius 1 and the given height: a narrow column with clumps on short branches. */
export function cedarCrownBlobs(height: number, rng: Rng, start = 0.45) {
  const blobs: Blob[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = height * lerp(start + 0.06, 1.0, t);
    const r = lerp(3.4, 1.3, t) * rng.range(0.9, 1.1);
    blobs.push({ c: new THREE.Vector3(rng.range(-0.3, 0.3), y, rng.range(-0.3, 0.3)), r: new THREE.Vector3(r, r * 0.75, r) });
  }
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, TAU), y = height * rng.range(start, 0.88), off = rng.range(2.6, 4.2) * (1 - (y / height - start) * 0.6);
    const r = rng.range(1.5, 2.2);
    blobs.push({ c: new THREE.Vector3(Math.cos(a) * off, y, Math.sin(a) * off), r: new THREE.Vector3(r, r * 0.6, r) });
  }
  return blobs;
}

let foliage: ReturnType<typeof foliageMaterial> | null = null;
/** The camera-facing leaf-card material, shared by every cedar crown. */
export function crownMaterial() { return foliage ??= foliageMaterial(); }

/** A crown mesh for one hero tree (cards tinted by `color`). */
export function heroCrown(blobs: Blob[], color: THREE.ColorRepresentation, rng: Rng, opts: { density?: number; cardScale?: number } = {}) {
  const { material, depth } = crownMaterial();
  const geo = canopyGeometry(blobs, rng, { density: opts.density ?? 0.3, cardScale: opts.cardScale ?? 1.5 });
  const col = new THREE.Color(color);
  const colors = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * col.r, colors.getY(i) * col.g, colors.getZ(i) * col.b);
  const m = new THREE.Mesh(geo, material);
  m.customDepthMaterial = depth;
  m.receiveShadow = true;
  return m;
}

// ---------------- many cedars ----------------
export interface CedarSpot { x: number; y: number; z: number; s: number; rot: number }

interface CedarVariant { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry; height: number }
let variants: CedarVariant[] | null = null;
/** Four cedar shapes on a trunk of radius 1, shared by every stand. */
function cedarVariants() {
  if (variants) return variants;
  const rng = new Rng(9011);
  const specs: Array<Partial<TrunkOpts> & { height: number }> = [
    { height: 20, flare: 1.0, flareH: 1.6, lobes: 5, bend: 0.6 },
    { height: 24, flare: 1.3, flareH: 2.0, lobes: 6, bend: 1.0 },
    { height: 17, flare: 0.8, flareH: 1.4, lobes: 4, bend: 1.4 },
    { height: 22, flare: 1.1, flareH: 1.8, lobes: 5, bend: 0.4 },
  ];
  variants = specs.map((s, i) => {
    const trunk = cedarTrunk({ r0: 1, rTop: 0.45, flare: 1, flareH: 1.6, lobes: 5, seed: 900 + i, radial: 14, rings: 18, sink: 1.2, texScale: 3, mossH: 4, ...s }).geometry;
    const crown = canopyGeometry(cedarCrownBlobs(s.height, rng), rng, { density: 0.28, cardScale: 1.5 });
    return { trunk, crown, height: s.height };
  });
  return variants;
}

/**
 * Cedars as instanced trunks and crowns, split into stretches of z (one group per stretch, each with one
 * trunk and one crown mesh per shape). `s` is the trunk radius; heights come from the shapes (17 to 24 radii).
 */
export function cedarStand(spots: CedarSpot[], rng: Rng, o: { stretches: Array<[number, number]>; castShadow?: boolean; leaves: number[] }) {
  const vs = cedarVariants();
  const bark = barkMaterial();
  const { material, depth } = crownMaterial();
  const groups = o.stretches.map(() => new THREE.Group());
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  o.stretches.forEach(([z0, z1], si) => {
    const mine = spots.filter((s) => s.z <= z0 && s.z > z1);
    vs.forEach((v, vi) => {
      const list = mine.filter((_, i) => (i + Math.round(Math.abs(mine[i].x))) % vs.length === vi);
      if (!list.length) return;
      const trunks = new THREE.InstancedMesh(v.trunk, bark, list.length);
      const crowns = new THREE.InstancedMesh(v.crown, material, list.length);
      crowns.customDepthMaterial = depth;
      list.forEach((s, i) => {
        q.setFromAxisAngle(up, s.rot); p.set(s.x, s.y, s.z); sc.setScalar(s.s);
        m.compose(p, q, sc);
        trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
        c.set(o.leaves[i % o.leaves.length]).offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.05, 0.05), rng.range(-0.04, 0.03));
        crowns.setColorAt(i, c);
      });
      for (const im of [trunks, crowns]) {
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        im.userData.keep = true;
        im.receiveShadow = true;
      }
      crowns.instanceColor!.needsUpdate = true;
      trunks.castShadow = !!o.castShadow;
      groups[si].add(trunks, crowns);
    });
  });
  return groups;
}


// ---------------- ground cover ----------------
/** One instanced mesh per stretch of z from a list of matrices. */
export function instancedStretches(geo: THREE.BufferGeometry, mat: THREE.Material, items: Array<{ m: THREE.Matrix4; z: number; color?: THREE.Color }>, stretches: Array<[number, number]>, o: { castShadow?: boolean; receiveShadow?: boolean } = {}) {
  return stretches.map(([z0, z1]) => {
    const g = new THREE.Group();
    const mine = items.filter((it) => it.z <= z0 && it.z > z1);
    if (!mine.length) return g;
    const im = new THREE.InstancedMesh(geo, mat, mine.length);
    mine.forEach((it, i) => { im.setMatrixAt(i, it.m); if (it.color) im.setColorAt(i, it.color); });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = !!o.castShadow; im.receiveShadow = o.receiveShadow ?? true;
    im.userData.keep = true;
    g.add(im);
    return g;
  });
}

/** A clump of fern fronds arching out from the middle (about 1 unit tall and 3 across). */
export function fernGeometry(rng: Rng, fronds = 7) {
  const parts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * TAU + rng.range(-0.3, 0.3);
    const len = rng.range(1.2, 1.7), wid = rng.range(0.42, 0.55), rise = rng.range(0.85, 1.15);
    const segs = 6;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= segs; j++) {
      const t = j / segs, s = t * len;
      // up and out, then drooping at the tip
      const out = s * 0.85, y = s * rise - s * s * 0.55;
      const w = wid * (1 - t * 0.6);
      for (const k of [-1, 1]) {
        // the frond is a little V-shaped across, so it catches light on both halves
        const lx = k * w * 0.5;
        pos.push(Math.cos(a) * out - Math.sin(a) * lx, y + Math.abs(lx) * 0.25, Math.sin(a) * out + Math.cos(a) * lx);
        uv.push(k < 0 ? 0 : 1, t);
      }
      if (j < segs) { const b = j * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    parts.push(g);
  }
  const geo = mergeGeometries(parts, false)!;
  geo.computeVertexNormals();
  // light the clump as a soft dome rather than as flat fronds
  const n = geo.attributes.normal as THREE.BufferAttribute, p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i) + 0.6, p.getZ(i)).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return geo;
}

export function fernMaterial() {
  return new THREE.MeshLambertMaterial({ map: fernTexture(), alphaTest: 0.45, side: THREE.DoubleSide });
}

/** A rounded boulder with moss over its top (vertex colours), about 1 unit across. */
export function boulderGeometry(seed: number) {
  const ico = new THREE.IcosahedronGeometry(1, 2);
  ico.deleteAttribute('uv'); ico.deleteAttribute('normal');
  // shared corners, so the bumps stay closed and the shading is smooth
  const geo = mergeVertices(ico);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const v = new THREE.Vector3();
  const rock = new THREE.Color(0x6a6c62), moss = new THREE.Color(0x4a7a34), mossL = new THREE.Color(0x6a9a40), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise2(v.x * 1.7 + seed, v.z * 1.7 + v.y);
    const r = 1 + (n - 0.5) * 0.35 + 0.08 * noise2(v.x * 5 + seed, v.y * 5);
    v.multiplyScalar(r);
    v.y = v.y > 0 ? v.y * 0.72 : v.y * 0.5;
    pos.setXYZ(i, v.x, v.y, v.z);
    const top = smoothstep(-0.05, 0.45, v.y + (noise2(v.x * 3 + seed, v.z * 3) - 0.5) * 0.4);
    c.copy(rock).lerp(moss, top).lerp(mossL, top * noise2(v.x * 4, v.z * 4 + seed) * 0.6);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Long strands of lichen hanging from a point: two crossed cards, 1 unit long, hanging down from y 0. */
export function hangingMossGeometry() {
  const a = new THREE.PlaneGeometry(0.9, 1, 1, 4).translate(0, -0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const geo = mergeGeometries([a, b], false)!;
  // a slight curl, so the strands are not flat sheets
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.sin(y * 2.2) * 0.12); }
  geo.computeVertexNormals();
  return geo;
}

export function hangingMossMaterial() {
  return new THREE.MeshLambertMaterial({ map: hangingMossTexture(), alphaTest: 0.4, side: THREE.DoubleSide, color: 0xd8e0c8 });
}

/** A shelf fungus: a flat half disc that sticks out from a trunk along +z, about 1 unit across. */
export function shelfGeometry() {
  // the half of a dome on the +z side, flattened
  const geo = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI, 0, Math.PI / 2);
  geo.scale(1, 0.35, 1);
  const col: number[] = [];
  const p = geo.attributes.position as THREE.BufferAttribute;
  const a = new THREE.Color(0xd8c8a0), b = new THREE.Color(0x8a6a44), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { c.copy(b).lerp(a, smoothstep(0.1, 0.5, Math.hypot(p.getX(i), p.getZ(i)))); col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}
