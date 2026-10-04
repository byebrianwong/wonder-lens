import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../../../engine/math';

/**
 * Small helpers for building the stage: slabs cut from a 2D shape with a different material on the front,
 * the back and the edges (flats, the proscenium), stage jacks and sandbags to brace a flat from behind,
 * and a few geometry utilities.
 */

export const merge = (parts: THREE.BufferGeometry[]) => {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  // every part must carry the same attributes to merge
  for (const g of flat) if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return mergeGeometries(flat, false)!;
};

/** Scale a geometry's UVs (a shared tiling texture then covers `1 / s` units per tile). */
export function scaleUV(geo: THREE.BufferGeometry, su: number, sv = su) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}

/**
 * A slab cut from a shape in the xy plane and extruded `depth` along +z. Material slots: 0 the back (z = 0),
 * 1 the edges, 2 the front (z = depth). The shape's own units are the UVs of both faces.
 */
export function slabGeometry(shape: THREE.Shape, depth: number, curveSegments = 12) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments });
  const lid = geo.groups.find((gr) => gr.materialIndex === 0)!;
  const half = lid.count / 2;
  const side = geo.groups.find((gr) => gr.materialIndex === 1)!;
  geo.clearGroups();
  geo.addGroup(lid.start, half, 0);
  geo.addGroup(lid.start + half, half, 2);
  geo.addGroup(side.start, side.count, 1);
  return geo;
}

export function slab(shape: THREE.Shape, depth: number, back: THREE.Material, edge: THREE.Material, front: THREE.Material, uvScale = 1, curveSegments = 12) {
  const geo = slabGeometry(shape, depth, curveSegments);
  if (uvScale !== 1) scaleUV(geo, uvScale);
  return new THREE.Mesh(geo, [back, edge, front]);
}

/** A shape from a list of [x, y] points. */
export function poly(pts: Array<[number, number]>) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/**
 * The outline of a mesa, butte or range for a flat: from (0, 0) to (w, 0) along the floor, its top at about h.
 * `kind` picks the silhouette; ledges and steps come from the seed.
 */
export function mesaOutline(kind: 'mesa' | 'butte' | 'range' | 'cliff', w: number, h: number, seed: number): Array<[number, number]> {
  const rng = new Rng(seed);
  const pts: Array<[number, number]> = [[0, 0]];
  if (kind === 'range') {
    // rolling distant mountains: several peaks of different heights
    const n = 3 + rng.int(0, 2);
    for (let i = 0; i < n; i++) {
      const x0 = (i / n) * w, x1 = ((i + 1) / n) * w;
      const peak = h * rng.range(0.55, 1);
      pts.push([x0 + (x1 - x0) * 0.15, h * rng.range(0.25, 0.45)], [x0 + (x1 - x0) * rng.range(0.4, 0.6), peak], [x0 + (x1 - x0) * 0.85, h * rng.range(0.3, 0.5)]);
    }
  } else if (kind === 'cliff') {
    // a tall cliff that steps down towards the far edge
    pts.push([w * 0.02, h * 0.6], [w * 0.06, h * 0.62], [w * 0.1, h * 0.96], [w * 0.5, h], [w * 0.55, h * 0.8], [w * 0.62, h * 0.78], [w * 0.68, h * 0.55], [w * 0.85, h * 0.5], [w * 0.92, h * 0.22]);
  } else {
    const topW = kind === 'butte' ? rng.range(0.25, 0.35) : rng.range(0.45, 0.6);
    const x0 = (1 - topW) / 2 + rng.range(-0.06, 0.06);
    // left flank with a ledge, the flat top with a step, right flank with a ledge
    pts.push([w * (x0 * 0.35), h * 0.28], [w * (x0 * 0.55), h * 0.32], [w * (x0 * 0.8), h * 0.82], [w * x0, h * 0.97]);
    pts.push([w * (x0 + topW * 0.45), h], [w * (x0 + topW * 0.5), h * 0.95], [w * (x0 + topW), h * 0.94]);
    const x1 = x0 + topW;
    pts.push([w * (x1 + (1 - x1) * 0.25), h * 0.7], [w * (x1 + (1 - x1) * 0.45), h * 0.66], [w * (x1 + (1 - x1) * 0.75), h * 0.24]);
  }
  pts.push([w, 0]);
  return pts;
}

/**
 * Parts for a stage jack (the triangular brace behind a flat) standing at x, its back to the flat at z = 0:
 * an upright, a foot and a diagonal. Returned as wood geometries plus one sandbag geometry for its foot.
 */
export function jackParts(x: number, h: number, wood: THREE.BufferGeometry[], bags: THREE.BufferGeometry[]) {
  const up = new THREE.BoxGeometry(0.22, h, 0.12); up.translate(x, h / 2, -0.08); wood.push(up);
  const foot = h * 0.5;
  const base = new THREE.BoxGeometry(0.22, 0.12, foot); base.translate(x, 0.06, -foot / 2); wood.push(base);
  const len = Math.hypot(foot, h * 0.85);
  const diag = new THREE.BoxGeometry(0.18, len, 0.1);
  diag.rotateX(-Math.atan2(foot, h * 0.85));
  diag.translate(x, h * 0.85 / 2, -foot / 2);
  wood.push(diag);
  // a cross piece half way up
  const mid = new THREE.BoxGeometry(0.16, 0.1, foot * 0.5); mid.translate(x, h * 0.42, -foot * 0.25 - 0.05); wood.push(mid);
  bags.push(sandbagGeometry(x, -foot * 0.75, 0));
  if (h > 12) bags.push(sandbagGeometry(x, -foot * 0.75, 0.32));
}

/** A canvas sandbag lying on the floor at (x, z), stacked `y` up. */
export function sandbagGeometry(x: number, z: number, y: number) {
  const g = new THREE.SphereGeometry(0.5, 10, 6);
  g.scale(0.7, 0.36, 1.0);
  g.translate(x, 0.17 + y, z);
  return g;
}

/** A thin cylinder between two points (wires, ropes, pipes) as geometry. */
export function rodGeometry(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 5) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyQuaternion(q);
  g.translate(a.x + d.x / 2, a.y + d.y / 2, a.z + d.z / 2);
  return g;
}

/** A box geometry placed at (x, y, z), optionally turned about y. */
export function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** A cylinder geometry placed at (x, y, z). */
export function cylAt(rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 12) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

/** Tag every mesh under an object to cast (and receive) shadows. */
export function castAll(o: THREE.Object3D, cast = true, receive = true) {
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } });
  return o;
}
