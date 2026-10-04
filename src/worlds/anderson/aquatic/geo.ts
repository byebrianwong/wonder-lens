import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Small geometry helpers for the Life Aquatic scene: tubes between two points, vertex-colour gradients, merging
 * parts into one geometry, and instanced meshes with full transforms split into stretches along z.
 */

const UP = new THREE.Vector3(0, 1, 0);

/** An open or closed cylinder from a to b, radius r0 at a and r1 at b. */
export function tubeAB(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial = 6, open = true, segs = 1) {
  const d = b.clone().sub(a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, segs, open);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Give a geometry a vertex colour attribute from a function of its position (an RGB triple or a grey). */
export function colorize(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => number | [number, number, number]) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const c = fn(p);
    if (typeof c === 'number') { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; } else { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Merge geometries after making them share one attribute layout (position, normal, uv, color). */
export function mergeParts(parts: THREE.BufferGeometry[], withColor = true) {
  const norm = parts.map((g) => {
    let x = g.index ? g.toNonIndexed() : g;
    if (!x.attributes.normal) x.computeVertexNormals();
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    if (withColor && !x.attributes.color) colorize(x, () => 1);
    if (!withColor && x.attributes.color) { x = x.clone(); x.deleteAttribute('color'); }
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k);
    return x;
  });
  const m = mergeGeometries(norm, false)!;
  m.computeBoundingSphere();
  return m;
}

export interface Inst { p: THREE.Vector3; q?: THREE.Quaternion; s?: THREE.Vector3 | number; c?: THREE.Color }

/**
 * Instanced meshes for a list of transforms, one per stretch of `chunk` units along z, so the stretches behind
 * the camera are culled. Returns a group (marked chunked, for a fog culler).
 */
export function instances(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], o: { chunk?: number; castShadow?: boolean; receiveShadow?: boolean } = {}) {
  const g = new THREE.Group();
  g.userData.chunked = true;
  if (!items.length) return g;
  const chunk = o.chunk ?? 40;
  const by = new Map<number, Inst[]>();
  for (const it of items) { const k = Math.floor(it.p.z / chunk); if (!by.has(k)) by.set(k, []); by.get(k)!.push(it); }
  const m = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const list of by.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      if (typeof it.s === 'number' || it.s === undefined) s.setScalar(it.s ?? 1); else s.copy(it.s);
      m.compose(it.p, it.q ?? q.identity(), s);
      im.setMatrixAt(i, m);
      if (it.c) im.setColorAt(i, it.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = !!o.castShadow; im.receiveShadow = o.receiveShadow ?? true;
    im.computeBoundingSphere();
    g.add(im);
  }
  return g;
}

/** A rotation about y, then a tilt towards a surface normal (things growing out of a slope). */
export function growQuat(yaw: number, normal?: THREE.Vector3, tilt = 0.6) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  if (normal) {
    const n = UP.clone().lerp(normal, tilt).normalize();
    q.premultiply(new THREE.Quaternion().setFromUnitVectors(UP, n));
  }
  return q;
}
