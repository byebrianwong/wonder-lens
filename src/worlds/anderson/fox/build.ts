import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, clamp } from '../../../engine/math';
import type { Road } from '../layout';

/*
 * Building helpers for "Underneath the Hill". Static pieces are made directly in world space with UVs in
 * world units (so the earth's bands run level from wall to wall), collected per material, and merged.
 */

/**
 * World-unit UVs for geometry already in world space: each vertex is mapped by the axis its normal faces
 * most (walls facing x take (z, y), walls facing z take (x, y), floors take (x, z)), divided by `tile`.
 */
export function worldUV(geo: THREE.BufferGeometry, tile: number, tileV = tile) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position as THREE.BufferAttribute, nrm = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    if (ny >= nx && ny >= nz) { uv[i * 2] = x / tile; uv[i * 2 + 1] = z / tileV; }
    else if (nx >= nz) { uv[i * 2] = -z / tile; uv[i * 2 + 1] = y / tileV; }
    else { uv[i * 2] = x / tile; uv[i * 2 + 1] = y / tileV; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * A collector of static world-space geometry, one list per material, merged into one mesh per material at
 * the end. `castShadow` is decided per material.
 */
export class Batch {
  private lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private shadow = new Set<THREE.Material>();
  /** add geometry in world space; it is given world UVs when `tile` is set */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, tile?: number, tileV?: number) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (tile) g = worldUV(g, tile, tileV);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let l = this.lists.get(mat);
    if (!l) { l = []; this.lists.set(mat, l); }
    l.push(g);
    return g;
  }
  /** add an object's meshes (built anywhere in a little group), baked to world space */
  addObject(o: THREE.Object3D, tile?: number) {
    o.updateMatrixWorld(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
      this.add(g, m.material as THREE.Material, tile);
      if (m.castShadow) this.shadow.add(m.material as THREE.Material);
    });
  }
  /** a box from corner to corner, in world space */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, tile?: number) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return this.add(g, mat, tile);
  }
  castShadow(mat: THREE.Material) { this.shadow.add(mat); }
  /** merge everything into a group, one mesh per material */
  build(receive = true) {
    const g = new THREE.Group();
    for (const [mat, list] of this.lists) {
      const geo = mergeGeometries(list, false);
      if (!geo) { console.warn('[fox] merge failed for', mat.name, list.map((g) => Object.keys(g.attributes).join('+')).join(' ')); continue; }
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = this.shadow.has(mat);
      m.receiveShadow = receive;
      m.userData.keep = true;
      geo.computeBoundingSphere();
      g.add(m);
    }
    this.lists.clear();
    return g;
  }
}

/** Geometry translated, rotated, scaled: a shorthand for placing primitives in world space. */
export function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (rz) geo.rotateZ(rz);
  if (ry) geo.rotateY(ry);
  return geo.translate(x, y, z);
}

/**
 * A wall in the plane x = `x` (facing the track: +x on the left side, -x on the right) from z0 to z1 and
 * y0 to y1, with openings cut through it: rectangles and round-topped arches, given in (z, y).
 */
export interface Opening { z0: number; z1: number; y0: number; y1: number; arch?: boolean; round?: boolean }
export function cutFace(x: number, z0: number, z1: number, y0: number, y1: number, holes: Opening[]) {
  const left = x < 0;
  // shape coordinates: sx runs along z (sx = -z on the left, z on the right), sy = y
  const S = (z: number) => (left ? -z : z);
  const shape = new THREE.Shape();
  const a = Math.min(S(z0), S(z1)), b = Math.max(S(z0), S(z1));
  shape.moveTo(a, y0); shape.lineTo(b, y0); shape.lineTo(b, y1); shape.lineTo(a, y1); shape.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    const ha = Math.min(S(h.z0), S(h.z1)), hb = Math.max(S(h.z0), S(h.z1));
    if (h.round) {
      const cx = (ha + hb) / 2, cy = (h.y0 + h.y1) / 2, r = (hb - ha) / 2;
      p.absellipse(cx, cy, r, (h.y1 - h.y0) / 2, 0, TAU, true, 0);
    } else if (h.arch) {
      const r = (hb - ha) / 2;
      p.moveTo(ha, h.y0); p.lineTo(ha, h.y1 - r);
      p.absarc((ha + hb) / 2, h.y1 - r, r, Math.PI, 0, true); // clockwise from the left, over the top
      p.lineTo(hb, h.y0); p.closePath();
    } else { p.moveTo(ha, h.y0); p.lineTo(ha, h.y1); p.lineTo(hb, h.y1); p.lineTo(hb, h.y0); p.closePath(); }
    shape.holes.push(p);
  }
  const geo = new THREE.ShapeGeometry(shape, 12);
  geo.rotateY(left ? Math.PI / 2 : -Math.PI / 2);
  geo.translate(x, 0, 0);
  return geo;
}

/** A wall across the track in the plane z = `z`, facing `facing` (+1 faces +z), with openings given in (x, y). */
export function crossWall(z: number, x0: number, x1: number, y0: number, y1: number, facing: 1 | -1, holes: Array<{ x: number; y: number; r: number; ry?: number; flatBottom?: number }>) {
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0); shape.lineTo(x1, y0); shape.lineTo(x1, y1); shape.lineTo(x0, y1); shape.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    if (h.flatBottom !== undefined) {
      // a round hole whose bottom is cut flat (a tunnel mouth with a floor)
      const fb = h.flatBottom, a = Math.asin(clamp((fb - h.y) / h.r, -1, 1));
      p.moveTo(h.x - Math.cos(a) * h.r, fb);
      p.absarc(h.x, h.y, h.r, Math.PI - a, a, true);
      p.closePath();
    } else p.absellipse(h.x, h.y, h.r, h.ry ?? h.r, 0, TAU, true, 0);
    shape.holes.push(p);
  }
  const geo = new THREE.ShapeGeometry(shape, 16);
  if (facing < 0) geo.rotateY(Math.PI);
  geo.translate(0, 0, z);
  return geo;
}

/**
 * A bored tunnel swept along the path from z0 to z1: a flat floor just under the path, walls that round
 * over into a vault. `r` is the radius, the vault's centre `rise` above the path. Returns the shell (facing
 * inwards) in world space. `skip(z, side)` leaves a wall out (side -1 left, +1 right) where a window goes.
 */
export function boredTunnel(road: Road, z0: number, z1: number, r: number, rise: number, o: { step?: number; seg?: number; skip?: (z: number, side: number) => boolean } = {}) {
  const step = o.step ?? 1.5, seg = o.seg ?? 18;
  const n = Math.max(2, Math.ceil(Math.abs(z1 - z0) / step));
  // profile around the tunnel, from the left floor edge over the top to the right floor edge
  const prof: Array<[number, number, number]> = [];
  const fy = -0.25;
  const a0 = Math.asin(clamp((fy - rise) / r, -1, 1));
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI - a0 - (i / seg) * (Math.PI - 2 * a0);
    // side of this vertex: -1 left wall, +1 right wall, 0 the top
    prof.push([Math.cos(a) * r, rise + Math.sin(a) * r, Math.cos(a) < -0.86 ? -1 : Math.cos(a) > 0.86 ? 1 : 0]);
  }
  const pos: number[] = [];
  const pt = (z: number, k: number) => { const p = road.at(z); return [p.x + p.rx * prof[k][0], p.y + prof[k][1], z + p.rz * prof[k][0]]; };
  for (let i = 0; i < n; i++) {
    const za = z0 + (z1 - z0) * (i / n), zb = z0 + (z1 - z0) * ((i + 1) / n), zm = (za + zb) / 2;
    for (let k = 0; k < seg; k++) {
      const side = prof[k][2] && prof[k + 1][2] ? prof[k][2] : 0;
      if (o.skip && side !== 0 && o.skip(zm, side)) continue;
      const A = pt(za, k), B = pt(za, k + 1), C = pt(zb, k), D = pt(zb, k + 1);
      // wound to face the inside of the tunnel
      pos.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** A floor strip along the path between two lateral offsets, `yOff` above the path. */
export function pathStrip(road: Road, z0: number, z1: number, lat0: number, lat1: number, yOff: number, step = 2) {
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  const pos: number[] = [];
  const pt = (z: number, l: number) => { const p = road.at(z); return [p.x + p.rx * l, p.y + yOff, z + p.rz * l]; };
  for (let i = 0; i < n; i++) {
    const za = z0 + (z1 - z0) * (i / n), zb = z0 + (z1 - z0) * ((i + 1) / n);
    const A = pt(za, lat0), B = pt(za, lat1), C = pt(zb, lat0), D = pt(zb, lat1);
    pos.push(...A, ...B, ...C, ...B, ...D, ...C);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  if ((geo.attributes.normal as THREE.BufferAttribute).getY(0) < 0) {
    // wound the wrong way: flip
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); }
    geo.computeVertexNormals();
  }
  return geo;
}

/** A root: a tapering tube through the given points (world space). */
export function rootTube(pts: THREE.Vector3[], r0: number, r1: number, segs = 14) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, segs, 1, 6, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    curve.getPointAt(i / segs, c);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= 6; j++) { const k = i * 7 + j; p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, p.x, p.y, p.z); }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Roots hanging from a ceiling at height y over a stretch: a few thick ones looping across, many thin dangling ends. */
export function hangingRoots(rng: Rng, x0: number, x1: number, z0: number, z1: number, y: number, o: { thick?: number; thin?: number; len?: [number, number] } = {}) {
  const geos: THREE.BufferGeometry[] = [];
  const P = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  for (let i = 0; i < (o.thick ?? 3); i++) {
    const z = rng.range(Math.min(z0, z1), Math.max(z0, z1));
    const sag = rng.range(1.2, 2.6);
    geos.push(rootTube([P(x0 - 0.5, y + 0.4, z), P(x0 * 0.5 + x1 * 0.5 - 2, y - sag, z + rng.range(-2, 2)), P(x0 * 0.3 + x1 * 0.7, y - sag * 0.8, z + rng.range(-2, 2)), P(x1 + 0.5, y + 0.4, z + rng.range(-1, 1))], rng.range(0.2, 0.32), rng.range(0.14, 0.24), 16));
  }
  const [l0, l1] = o.len ?? [0.8, 2.6];
  for (let i = 0; i < (o.thin ?? 24); i++) {
    const x = rng.range(x0, x1), z = rng.range(Math.min(z0, z1), Math.max(z0, z1)), len = rng.range(l0, l1);
    geos.push(rootTube([P(x, y + 0.2, z), P(x + rng.range(-0.3, 0.3), y - len * 0.5, z + rng.range(-0.3, 0.3)), P(x + rng.range(-0.5, 0.5), y - len, z + rng.range(-0.4, 0.4))], rng.range(0.05, 0.1), 0.012, 6));
  }
  return mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
}

/** Hanging lanterns: a hook rod, a little cage and a glowing glass; returns metal and glass geometry in world space. */
export function lanterns(spots: THREE.Vector3[], hang = 0.6) {
  const metal: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  for (const s of spots) {
    metal.push(new THREE.CylinderGeometry(0.02, 0.02, hang, 4).translate(s.x, s.y + hang / 2 + 0.28, s.z));
    metal.push(new THREE.ConeGeometry(0.24, 0.2, 6).translate(s.x, s.y + 0.32, s.z));
    metal.push(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 6).translate(s.x, s.y - 0.26, s.z));
    glass.push(new THREE.CylinderGeometry(0.15, 0.15, 0.46, 6).translate(s.x, s.y, s.z));
  }
  const merge = (l: THREE.BufferGeometry[]) => mergeGeometries(l.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }), false)!;
  return { metal: merge(metal), glass: merge(glass) };
}

export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
