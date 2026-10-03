import * as THREE from 'three';
import type { RideState } from '../../game/types';
import type { Subject } from '../../game/Subject';
import { Rng } from '../../engine/math';
import { mergeStatic } from '../../engine/Builders';
import type { Road, SetId } from './layout';
import type { LightPool } from './lens';

export const FROM = 'Amélie';

/** What every set builder receives. */
export interface SetContext {
  rng: Rng;
  road: Road;
  lights: LightPool;
  camera: THREE.Camera;
  lowDetail: boolean;
}

/** One scene of the ride. */
export interface BuiltSet {
  id: SetId;
  group: THREE.Group;
  /** the set is drawn while the ride's progress is inside this range */
  show: [number, number];
  occluders: THREE.Object3D[];
  subjects: Subject[];
  /** ground height for thrown items inside this set */
  floor(x: number, z: number): number;
  update(dt: number, t: number, ride: RideState): void;
}

/** The part of the ride's curve between two z values, resampled into its own curve. */
export function subCurve(road: Road, z0: number, z1: number, n = 60) {
  const u0 = road.u(z0), u1 = road.u(z1);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) pts.push(road.curve.getPointAt(u0 + (u1 - u0) * (i / n)));
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  c.arcLengthDivisions = n * 8;
  return c;
}

/**
 * A strip along a curve between two lateral offsets (positive = right of travel), with UVs in world units
 * (`tile` units per texture repeat), raised by yOff.
 */
export function ribbon(curve: THREE.Curve<THREE.Vector3>, lat0: number, lat1: number, segs: number, yOff = 0, tile = 4) {
  const up = new THREE.Vector3(0, 1, 0);
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  let dist = 0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    if (prev) dist += p.distanceTo(prev);
    prev = p;
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const a = p.clone().addScaledVector(side, lat0), b = p.clone().addScaledVector(side, lat1);
    verts.push(a.x, a.y + yOff, a.z, b.x, b.y + yOff, b.z);
    uvs.push(lat0 / tile, dist / tile, lat1 / tile, dist / tile);
    if (i < segs) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the strip faces up
  const n = g.attributes.normal as THREE.BufferAttribute;
  if (n.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** A vertical strip along a curve at a lateral offset, from yBottom to yTop above the curve (kerbs, quay walls). */
export function wallStrip(curve: THREE.Curve<THREE.Vector3>, lat: number, yBottom: number, yTop: number, segs: number, faceRight: boolean, tile = 4) {
  const up = new THREE.Vector3(0, 1, 0);
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  let dist = 0;
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u), t = curve.getTangentAt(u);
    if (prev) dist += p.distanceTo(prev);
    prev = p;
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const a = p.clone().addScaledVector(side, lat);
    verts.push(a.x, a.y + yBottom, a.z, a.x, a.y + yTop, a.z);
    uvs.push(dist / tile, yBottom / tile, dist / tile, yTop / tile);
    if (i < segs) { const k = i * 2; if (faceRight) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Turn a subject (and its group) on or off together. */
export function setActive(s: Subject, on: boolean) { s.active = on; s.group.visible = on; }

/** World-space forward (+z) of an object, for a subject's facing bonus. */
export const forwardOf = (o: THREE.Object3D) => () => new THREE.Vector3(0, 0, 1).applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()));

/** Set castShadow on every mesh under an object. */
export function shadows(o: THREE.Object3D, cast = true, receive = false) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
}

/** Place an object at a world position with a yaw. */
export function place<T extends THREE.Object3D>(o: T, p: THREE.Vector3, yaw = 0) { o.position.copy(p); o.rotation.y = yaw; return o; }

/**
 * Split every mesh that has one material per face group (a box with a facade on one side) into one mesh per
 * material, so `mergeStatic` can merge them; it skips meshes with material arrays.
 */
export function explodeGroups(root: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && Array.isArray(m.material) && !(m as THREE.InstancedMesh).isInstancedMesh && !m.userData.keep) list.push(m); });
  for (const m of list) {
    const mats = m.material as THREE.Material[];
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const groups = m.geometry.groups.length ? m.geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }];
    // with a non-indexed copy, group ranges index vertices directly
    const byMat = new Map<number, Array<{ start: number; count: number }>>();
    for (const gr of groups) { const k = gr.materialIndex ?? 0; if (!byMat.has(k)) byMat.set(k, []); byMat.get(k)!.push({ start: gr.start, count: gr.count }); }
    for (const [mi, ranges] of byMat) {
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(src.attributes)) {
        const a = src.attributes[name] as THREE.BufferAttribute;
        const parts: number[] = [];
        for (const r of ranges) { const end = Math.min(a.count, r.start + r.count); for (let i = r.start; i < end; i++) for (let k = 0; k < a.itemSize; k++) parts.push(a.array[i * a.itemSize + k]); }
        g.setAttribute(name, new THREE.Float32BufferAttribute(parts, a.itemSize));
      }
      const part = new THREE.Mesh(g, mats[mi]);
      part.position.copy(m.position); part.quaternion.copy(m.quaternion); part.scale.copy(m.scale);
      part.castShadow = m.castShadow; part.receiveShadow = m.receiveShadow; part.renderOrder = m.renderOrder;
      m.parent!.add(part);
    }
    m.parent!.remove(m);
  }
  return root;
}

/** Pool instanced meshes that share a geometry and a material (every stand's apples) into one per pair, in root space. */
export function gatherInstances(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, THREE.InstancedMesh[]>();
  root.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (!im.isInstancedMesh || im.userData.keep || Array.isArray(im.material)) return;
    let hidden = false;
    for (let p: THREE.Object3D | null = im; p && p !== root; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    const k = `${im.geometry.uuid}|${(im.material as THREE.Material).uuid}|${im.castShadow ? 1 : 0}|${im.instanceColor ? 1 : 0}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(im);
  });
  const m = new THREE.Matrix4(), w = new THREE.Matrix4(), c = new THREE.Color();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const total = list.reduce((s, im) => s + im.count, 0);
    const out = new THREE.InstancedMesh(list[0].geometry, list[0].material, total);
    let i = 0;
    for (const im of list) {
      w.multiplyMatrices(inv, im.matrixWorld);
      for (let k = 0; k < im.count; k++) {
        im.getMatrixAt(k, m);
        out.setMatrixAt(i, m.premultiply(w));
        if (im.instanceColor) { im.getColorAt(k, c); out.setColorAt(i, c); }
        i++;
      }
      im.parent?.remove(im);
    }
    out.castShadow = list[0].castShadow; out.receiveShadow = list[0].receiveShadow;
    out.instanceMatrix.needsUpdate = true;
    if (out.instanceColor) out.instanceColor.needsUpdate = true;
    out.computeBoundingSphere();
    root.add(out);
  }
  return root;
}

/** Make a static group cheap to draw: split per-face materials, pool instances, merge meshes by material. */
export function optimize(root: THREE.Object3D) {
  explodeGroups(root);
  gatherInstances(root);
  mergeStatic(root);
  return root;
}

const proxyMat = new THREE.MeshBasicMaterial();
/**
 * An invisible box fitted round an object, in its own frame, for raycasts. Line-of-sight checks against
 * a whole merged city test every triangle; a box per building is far cheaper and close enough.
 */
export function boxProxy(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const box = new THREE.Box3(), part = new THREE.Box3(), m4 = new THREE.Matrix4();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    part.copy(m.geometry.boundingBox!).applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    box.union(part);
  });
  const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01)), proxyMat);
  proxy.position.copy(centre.applyMatrix4(obj.matrixWorld));
  proxy.quaternion.copy(obj.getWorldQuaternion(new THREE.Quaternion()));
  proxy.visible = false;
  proxy.updateMatrixWorld(true);
  return proxy;
}
