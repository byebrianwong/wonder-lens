import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './math';
import type { Placement } from './Builders';

/**
 * Painterly "fluffy" trees.
 *
 * A canopy is a handful of blobs. Each blob is filled with small square cards that always face the camera
 * and carry a leaf-cluster texture. Every card's normal points away from its blob (and the canopy centre),
 * so light falls across the canopy as if it were one soft rounded shape, while the card edges give it a
 * leafy outline. Cards turn towards the light when drawing shadows, so the shadows are solid and leafy too.
 */

export type FluffyShape = 'round' | 'broad' | 'conifer' | 'poplar' | 'bush';

export interface FluffyStyle {
  shape: FluffyShape;
  trunk: THREE.ColorRepresentation;
  leaves: THREE.ColorRepresentation[];
  /** overall size multiplier (default 1) */
  size?: number;
  /** card density multiplier (default 1) */
  density?: number;
}

export interface Blob { c: THREE.Vector3; r: THREE.Vector3 }

let leafTexCache: THREE.Texture | null = null;
/** A cluster of leaves on a transparent canvas, light grey so it tints to any colour. */
export function leafClusterTexture() {
  if (leafTexCache) return leafTexCache;
  const S = 256;
  const rng = new Rng(4242);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const leaf = (x: number, y: number, len: number, wid: number, rot: number, shade: number) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -wid, len / 2, 0);
    g.quadraticCurveTo(0, wid, -len / 2, 0);
    g.closePath();
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.fill();
    g.restore();
  };
  // darker leaves underneath, lighter on top, all inside a soft round silhouette
  for (let pass = 0; pass < 3; pass++) {
    const n = [34, 30, 22][pass];
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * [96, 88, 70][pass];
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.92;
      const len = rng.range(44, 70), wid = len * rng.range(0.34, 0.46);
      const shade = Math.round([178, 210, 240][pass] + rng.range(-10, 10));
      leaf(x, y, len, wid, a + rng.range(-0.6, 0.6), shade);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  leafTexCache = t;
  return t;
}

/** Smooth-ish three-tone ramp: shadowed side stays fairly light, like painted foliage. */
let rampCache: THREE.DataTexture | null = null;
function foliageRamp() {
  if (rampCache) return rampCache;
  const v = [118, 118, 160, 208, 238, 255, 255, 255];
  const data = new Uint8Array(v.length * 4);
  v.forEach((x, i) => data.set([x, x, x, 255], i * 4));
  rampCache = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
  rampCache.minFilter = rampCache.magFilter = THREE.LinearFilter;
  rampCache.needsUpdate = true;
  return rampCache;
}

const CARD_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    float cardScale = length(instanceMatrix[0].xyz);
  #else
    float cardScale = length(modelMatrix[0].xyz);
  #endif
  // expand the card in view space so it always faces whoever is looking (camera or light)
  mvPosition.xy += cardCorner * cardScale;
  gl_Position = projectionMatrix * mvPosition;
`;

function patchCards(material: THREE.Material, key: string) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 cardCorner;')
      .replace('#include <project_vertex>', `#include <project_vertex>\n${CARD_VERTEX}`);
  };
  material.customProgramCacheKey = () => key;
}

/** Material for camera-facing leaf cards. */
export function foliageMaterial() {
  const tex = leafClusterTexture();
  const mat = new THREE.MeshToonMaterial({ map: tex, alphaTest: 0.5, vertexColors: true, gradientMap: foliageRamp(), side: THREE.DoubleSide });
  patchCards(mat, 'foliage-cards-v1');
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  patchCards(depth, 'foliage-cards-depth-v1');
  return { material: mat, depth };
}

/**
 * Cards spread through a set of blobs. Returns a geometry whose vertices sit at card centres and carry
 * cardCorner offsets; the shader expands them. Cards deeper inside a blob are darker.
 */
export function canopyGeometry(blobs: Blob[], rng: Rng, opts: { density?: number; cardScale?: number; center?: THREE.Vector3 } = {}) {
  const center = opts.center ?? blobs.reduce((a, b) => a.add(b.c), new THREE.Vector3()).multiplyScalar(1 / blobs.length);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], uv: number[] = [], corner: number[] = [], idx: number[] = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), n2 = new THREE.Vector3();
  let v = 0;
  for (const b of blobs) {
    const rAvg = (b.r.x + b.r.y + b.r.z) / 3;
    const count = Math.max(6, Math.round(13 * rAvg * rAvg * (opts.density ?? 1)));
    for (let i = 0; i < count; i++) {
      // random direction, biased towards the surface so the silhouette is full
      d.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
      if (d.lengthSq() > 1 || d.lengthSq() < 1e-4) { i--; continue; }
      d.normalize();
      const depth = rng.chance(0.72) ? rng.range(0.72, 1.0) : rng.range(0.25, 0.72);
      p.set(d.x * b.r.x, d.y * b.r.y, d.z * b.r.z).multiplyScalar(depth).add(b.c);
      n.copy(d).multiplyScalar(0.62);
      n2.copy(p).sub(center).normalize().multiplyScalar(0.38);
      n.add(n2).add(new THREE.Vector3(0, 0.12, 0)).normalize();
      const size = (0.36 * rAvg + 0.2) * (opts.cardScale ?? 1) * rng.range(0.8, 1.2);
      const shade = (0.78 + 0.22 * depth) * rng.range(0.94, 1.05);
      const rot = rng.range(0, Math.PI * 2), cs = Math.cos(rot), sn = Math.sin(rot);
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(p.x, p.y, p.z);
        nrm.push(n.x, n.y, n.z);
        col.push(shade, shade, shade);
        uv.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
        corner.push((cx * cs - cy * sn) * size, (cx * sn + cy * cs) * size);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('cardCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setIndex(idx);
  // cards extend past their centres; pad the bounds so culling does not clip them
  g.computeBoundingSphere();
  g.boundingSphere!.radius += 2;
  return g;
}

/** A tapered limb from a to b as a cylinder. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Blob layout, trunk and branches for one tree of a given shape (size ~1 = a garden tree). */
export function treeLayout(shape: FluffyShape, rng: Rng, size = 1) {
  const blobs: Blob[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(size);
  const R = (x: number, y = x, z = x) => new THREE.Vector3(x, y, z).multiplyScalar(size);
  const base = V(0, 0, 0);
  if (shape === 'round' || shape === 'broad') {
    const broad = shape === 'broad';
    const trunkH = (broad ? 2.4 : 2.0) * rng.range(0.9, 1.15);
    const crown = V(0, trunkH + (broad ? 1.9 : 1.7), 0);
    const mainR = broad ? R(2.5, 1.7, 2.5) : R(1.8, 1.6, 1.8);
    blobs.push({ c: crown, r: mainR });
    const n = broad ? rng.int(5, 7) : rng.int(3, 5);
    const top = V(0, trunkH, 0);
    wood.push(limb(base, top, 0.34 * size, 0.24 * size, 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const off = (broad ? rng.range(2.0, 2.8) : rng.range(1.1, 1.6));
      const c = V(Math.cos(a) * off, trunkH + (broad ? rng.range(1.0, 2.2) : rng.range(1.0, 2.4)), Math.sin(a) * off);
      const r = broad ? rng.range(1.2, 1.6) : rng.range(0.95, 1.25);
      blobs.push({ c, r: R(r, r * 0.85, r) });
      wood.push(limb(top, c.clone().lerp(top, 0.25), 0.16 * size, 0.07 * size, 5));
    }
    blobs.push({ c: V(rng.range(-0.3, 0.3), trunkH + (broad ? 3.2 : 3.1), rng.range(-0.3, 0.3)), r: R(broad ? 1.5 : 1.2) });
  } else if (shape === 'conifer') {
    const trunkH = 1.0;
    wood.push(limb(base, V(0, 7.5, 0), 0.26 * size, 0.06 * size, 6));
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = 1.9 * (1 - t) + 0.45;
      blobs.push({ c: V(rng.range(-0.1, 0.1), trunkH + 0.9 + i * 1.15, rng.range(-0.1, 0.1)), r: R(r, 0.75, r) });
    }
  } else if (shape === 'poplar') {
    wood.push(limb(base, V(0, 3, 0), 0.2 * size, 0.14 * size, 6));
    for (let i = 0; i < 5; i++) {
      const r = [0.95, 1.15, 1.1, 0.9, 0.6][i];
      blobs.push({ c: V(rng.range(-0.15, 0.15), 2.4 + i * 1.35, rng.range(-0.15, 0.15)), r: R(r, 1.0, r) });
    }
  } else {
    // bush
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, Math.PI * 2);
      blobs.push({ c: V(Math.cos(a) * 0.5, 0.7 + rng.range(0, 0.3), Math.sin(a) * 0.5), r: R(rng.range(0.7, 0.95)) });
    }
  }
  return { blobs, wood: wood.length ? mergeGeometries(wood, false)! : null };
}

/**
 * Instanced fluffy trees: a few variants of the given style, with placements split between them.
 * Returns a group of instanced trunks and canopies.
 */
export function fluffyForest(style: FluffyStyle, placements: Placement[], rng: Rng, opts: { castShadow?: boolean; variants?: number } = {}) {
  const group = new THREE.Group();
  if (!placements.length) return group;
  const { material, depth } = foliageMaterial();
  const barkMat = new THREE.MeshToonMaterial({ color: style.trunk, gradientMap: foliageRamp() });
  const variants = opts.variants ?? 3;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  // split into 150-unit stretches along z so stretches out of view are culled (the ride runs along z)
  const CHUNK = 150;
  const layouts: Array<{ canopy: THREE.BufferGeometry; wood: THREE.BufferGeometry | null }> = [];
  for (let vi = 0; vi < variants; vi++) {
    const layout = treeLayout(style.shape, rng, style.size ?? 1);
    layouts.push({ canopy: canopyGeometry(layout.blobs, rng, { density: style.density }), wood: layout.wood });
  }
  const chunks = new Map<number, Array<{ pl: Placement; i: number }>>();
  placements.forEach((pl, i) => { const k = Math.floor(pl.z / CHUNK); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push({ pl, i }); });
  for (const list of chunks.values()) {
    for (let vi = 0; vi < variants; vi++) {
      const mine = list.filter((e) => e.i % variants === vi);
      if (!mine.length) continue;
      const { canopy, wood } = layouts[vi];
      const leaves = new THREE.InstancedMesh(canopy, material, mine.length);
      leaves.customDepthMaterial = depth;
      const trunk = wood ? new THREE.InstancedMesh(wood, barkMat, mine.length) : null;
      mine.forEach(({ pl, i: gi }, i) => {
        q.setFromAxisAngle(up, pl.rot);
        p.set(pl.x, pl.y, pl.z); s.setScalar(pl.scale);
        m.compose(p, q, s);
        leaves.setMatrixAt(i, m);
        trunk?.setMatrixAt(i, m);
        c.set(style.leaves[gi % style.leaves.length]);
        if (pl.tint) c.multiply(pl.tint);
        c.offsetHSL(rng.range(-0.015, 0.015), rng.range(-0.04, 0.04), rng.range(-0.04, 0.04));
        leaves.setColorAt(i, c);
      });
      leaves.instanceMatrix.needsUpdate = true;
      leaves.instanceColor!.needsUpdate = true;
      leaves.computeBoundingSphere();
      leaves.castShadow = !!opts.castShadow; leaves.receiveShadow = true;
      group.add(leaves);
      if (trunk) {
        trunk.instanceMatrix.needsUpdate = true;
        trunk.computeBoundingSphere();
        trunk.castShadow = !!opts.castShadow; trunk.receiveShadow = true;
        group.add(trunk);
      }
    }
  }
  return group;
}

/** One large hand-placed tree (a landmark), built from explicit blobs. */
export function fluffyTree(blobs: Blob[], leafColor: THREE.ColorRepresentation, rng: Rng, opts: { density?: number; cardScale?: number } = {}) {
  const { material, depth } = foliageMaterial();
  const geo = canopyGeometry(blobs, rng, opts);
  const col = new THREE.Color(leafColor);
  const colors = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * col.r, colors.getY(i) * col.g, colors.getZ(i) * col.b);
  const mesh = new THREE.Mesh(geo, material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

let flowerTexCache: THREE.Texture | null = null;
/** Four small flower heads in a 2x2 atlas: white daisy, yellow buttercup, pink clover, blue speedwell. */
function flowerTexture() {
  if (flowerTexCache) return flowerTexCache;
  const S = 256, H = S / 2;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const kinds: Array<{ petal: string; center: string; n: number; len: number; wid: number }> = [
    { petal: '#fbf8ee', center: '#f2c230', n: 12, len: 44, wid: 11 },
    { petal: '#f7d43a', center: '#e0a020', n: 5, len: 36, wid: 22 },
    { petal: '#f2a0c0', center: '#d86a98', n: 16, len: 34, wid: 9 },
    { petal: '#8fb4f0', center: '#f4f0e0', n: 5, len: 32, wid: 20 },
  ];
  kinds.forEach((k, i) => {
    const cx = (i % 2) * H + H / 2, cy = Math.floor(i / 2) * H + H / 2;
    for (let p = 0; p < k.n; p++) {
      const a = (p / k.n) * Math.PI * 2;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.fillStyle = k.petal;
      g.beginPath(); g.ellipse(k.len / 2 + 4, 0, k.len / 2, k.wid / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath(); g.ellipse(k.len / 2 + 4, 0, k.len / 2, k.wid / 5, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.fillStyle = k.center; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  flowerTexCache = t;
  return t;
}

/**
 * Meadow flowers as small camera-facing cards that sit among the grass tips.
 * `kinds[i]` picks the flower (0 daisy, 1 buttercup, 2 clover, 3 speedwell) for placement i.
 */
export function flowerField(placements: Placement[], kinds: number[]) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], corner: number[] = [], idx: number[] = [];
  placements.forEach((p, i) => {
    const k = kinds[i % kinds.length];
    const u0 = (k % 2) * 0.5, v0 = k < 2 ? 0.5 : 0;
    const s = 0.16 * p.scale;
    const base = i * 4;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(p.x, p.y, p.z);
      nrm.push(0, 1, 0);
      uv.push(u0 + (cx * 0.5 + 0.5) * 0.5, v0 + (cy * 0.5 + 0.5) * 0.5);
      corner.push(cx * s, cy * s * 0.8);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('cardCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.boundingSphere!.radius += 1;
  const mat = new THREE.MeshLambertMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  patchCards(mat, 'flower-cards-v1');
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
}
