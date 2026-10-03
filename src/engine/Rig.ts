import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './math';

/**
 * Tools for building and animating characters.
 *
 * - `sculpt` makes a smooth closed shape from a function that moves each point of a unit sphere. The shape
 *   keeps the sphere's UV layout, so the painters in Paint.ts (`Painter.at`) still place marks by direction.
 * - `Rig` builds a skeleton from named joints and turns geometry into skinned meshes that bend smoothly
 *   at those joints (a head that tilts back without leaving a crease, a body that sways).
 * - `Spring`, `AngleSpring` and `envelope` give eased, frame-rate independent motion: reactions that wind
 *   up, overshoot a little and settle, and turns that never snap.
 * - `outline` adds a thin ink line around a mesh, like the line work on an animated character.
 */

const tmpV = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpP = new THREE.Vector3();

// ---------------- shapes ----------------
/**
 * A closed shape made by moving every point of a unit sphere. `shape(dir, out)` receives a unit direction
 * and writes the surface point for it. Normals come from the shape itself (not from the triangles), so the
 * surface is smooth and has no seam where the sphere's UVs wrap round.
 */
export function sculpt(shape: (dir: THREE.Vector3, out: THREE.Vector3) => void, ws = 48, hs = 32) {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  const d = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    shape(d, tmpP);
    surfaceNormal(shape, d, n);
    pos.setXYZ(i, tmpP.x, tmpP.y, tmpP.z);
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  pos.needsUpdate = true; nrm.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

/** Outward normal of a sculpted shape at a unit direction, by finite differences. */
export function surfaceNormal(shape: (dir: THREE.Vector3, out: THREE.Vector3) => void, d: THREE.Vector3, out: THREE.Vector3) {
  // two directions across the surface at d
  tmpA.set(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize();
  tmpB.crossVectors(d, tmpA);
  const e = 0.004;
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
  shape(d, p0);
  shape(tmpV.copy(d).addScaledVector(tmpA, e).normalize(), p1);
  shape(tmpV.copy(d).addScaledVector(tmpB, e).normalize(), p2);
  out.subVectors(p1, p0).cross(p2.sub(p0));
  if (out.lengthSq() < 1e-14) return out.copy(d);
  out.normalize();
  if (out.dot(d) < 0) out.negate();
  return out;
}

/** Unit direction for an angle around the y axis (0 = +z, the front; positive turns towards +x) and a polar angle from the top. */
export function dirAt(around: number, polar: number, out = new THREE.Vector3()) {
  return out.set(Math.sin(polar) * Math.sin(around), Math.cos(polar), Math.sin(polar) * Math.cos(around));
}

/**
 * A smooth round shape whose outline is a profile of [height, radius] keys from top to bottom, like a lathe,
 * but closed and with sphere UVs. `depth` scales the front-to-back size, `bulge(dir)` adds extra radius.
 * The polar angle of the unit sphere is mapped evenly onto the profile.
 */
export function profileShape(keys: Array<[number, number]>, o: { depth?: number; bulge?: (dir: THREE.Vector3) => number; front?: (dir: THREE.Vector3) => number } = {}) {
  const curve = new THREE.SplineCurve(keys.map(([y, r]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(256);
  const depth = o.depth ?? 1;
  return (d: THREE.Vector3, out: THREE.Vector3) => {
    // the polar angle of the unit sphere runs evenly along the profile, so the top and bottom close over a point
    const polar = Math.acos(clamp(d.y, -1, 1));
    const t = (polar / Math.PI) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(t)), k = t - i;
    let r = Math.max(0, lerp(pts[i].x, pts[i + 1].x, k));
    const y = lerp(pts[i].y, pts[i + 1].y, k);
    if (o.bulge) r += o.bulge(d);
    const h = Math.hypot(d.x, d.z) || 1;
    const z = (d.z / h) * r;
    out.set((d.x / h) * r, y, z * (z > 0 && o.front ? o.front(d) : depth));
    return out;
  };
}

/** A tapered limb along -y from the origin (the joint): radius r0 at the top, r1 at the bottom, rounded ends. */
export function limbGeometry(r0: number, r1: number, len: number, radial = 14, rings = 10) {
  const pts: THREE.Vector2[] = [];
  // bottom cap, side, top cap (lathe profile goes from bottom to top)
  for (let i = 0; i <= 4; i++) { const a = (-Math.PI / 2) + (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r1, -len + Math.sin(a) * r1)); }
  for (let i = 1; i < rings; i++) { const t = i / rings; pts.push(new THREE.Vector2(lerp(r1, r0, t), lerp(-len, 0, t))); }
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0)); }
  const geo = new THREE.LatheGeometry(pts, radial);
  // lathe starts at -z... turn so u = 0 is at the front like the other primitives
  geo.rotateY(Math.PI);
  geo.computeVertexNormals();
  return geo;
}

// ---------------- skeleton ----------------
export interface JointSpec { name: string; parent?: string; at: [number, number, number] }

/**
 * A skeleton made of named joints placed in the character's own space. Meshes made with `skin` bend with it.
 * Build the rig and all its meshes before moving or scaling the character's group.
 */
export class Rig {
  readonly bones: Record<string, THREE.Bone> = {};
  readonly list: THREE.Bone[] = [];
  readonly root: THREE.Bone;
  readonly skeleton: THREE.Skeleton;
  private rest = new Map<THREE.Bone, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();

  constructor(parent: THREE.Object3D, joints: JointSpec[]) {
    const abs = new Map<string, THREE.Vector3>();
    for (const j of joints) {
      const b = new THREE.Bone();
      b.name = j.name;
      const at = new THREE.Vector3(...j.at);
      abs.set(j.name, at);
      if (j.parent) {
        const p = this.bones[j.parent];
        b.position.copy(at).sub(abs.get(j.parent)!);
        p.add(b);
      } else b.position.copy(at);
      this.bones[j.name] = b;
      this.list.push(b);
    }
    this.root = this.list[0];
    parent.add(this.root);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.list);
    for (const b of this.list) this.rest.set(b, { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() });
  }

  /**
   * A skinned mesh on this skeleton. `weights(p)` gives each joint's share of the rest-pose point p
   * (shares are normalised; only the four largest are kept).
   */
  skin(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], weights: (p: THREE.Vector3) => Record<string, number>) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const idx = new Uint16Array(pos.count * 4), wts = new Float32Array(pos.count * 4);
    const names = this.list.map((b) => b.name);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const w = weights(p);
      const pairs = Object.entries(w).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = pairs.reduce((s, [, v]) => s + v, 0) || 1;
      pairs.forEach(([n, v], k) => { idx[i * 4 + k] = Math.max(0, names.indexOf(n)); wts[i * 4 + k] = v / sum; });
      if (!pairs.length) { idx[i * 4] = 0; wts[i * 4] = 1; }
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
    const m = new THREE.SkinnedMesh(geo, mat);
    this.root.parent!.add(m);
    m.updateMatrixWorld(true);
    m.bind(this.skeleton, m.matrixWorld.clone());
    // the bounds follow the pose; leave room for bending
    m.computeBoundingSphere();
    if (m.boundingSphere) m.boundingSphere.radius *= 1.35;
    return m;
  }

  /** Put every joint back to how it was built. */
  reset() {
    for (const [b, r] of this.rest) { b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
  }
  restPos(name: string) { return this.rest.get(this.bones[name])!.p; }
}

/** Blend weight that is 0 below `a` and 1 above `b` along a coordinate, for skin weights. */
export const band = (v: number, a: number, b: number) => smoothstep(a, b, v);

// ---------------- motion ----------------
/**
 * A spring towards a target value. With damping below 1 it overshoots a little and settles, which reads as
 * weight and life; with damping 1 it arrives as fast as possible without overshooting.
 */
export class Spring {
  v = 0;
  x: number; freq: number; damping: number;
  constructor(x = 0, freq = 4, damping = 0.7) { this.x = x; this.freq = freq; this.damping = damping; }
  update(target: number, dt: number) {
    // semi-implicit Euler in small steps, so big frames stay stable
    const w = this.freq * Math.PI * 2;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 120);
      this.v += (-2 * this.damping * w * this.v - w * w * (this.x - target)) * h;
      this.x += this.v * h;
      left -= h;
    }
    return this.x;
  }
  set(x: number) { this.x = x; this.v = 0; return this; }
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A spring for an angle (radians) that always turns the short way round. */
export class AngleSpring extends Spring {
  update(target: number, dt: number) {
    const t = this.x + wrapAngle(target - this.x);
    return super.update(t, dt);
  }
}

/**
 * 0 before `a`, eases up to 1 at `b`, holds, eases down to 0 between `c` and `d`. For timed reactions:
 * `envelope(t, 0, 0.3, 1.6, 2.2)` is "open over 0.3 s, hold, close by 2.2 s".
 */
export function envelope(t: number, a: number, b: number, c: number, d: number) {
  if (t <= a || t >= d) return 0;
  if (t < b) return easeInOut((t - a) / (b - a));
  if (t <= c) return 1;
  return 1 - easeInOut((t - c) / (d - c));
}
export const easeInOut = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
/** Overshoots past 1 and settles back, for a pop. */
export const easeOutBack = (t: number, k = 1.70158) => { t = clamp(t, 0, 1) - 1; return 1 + (k + 1) * t * t * t + k * t * t; };

/** Smoothly turn a Y rotation towards a target heading with a spring (no snapping, short way round). */
export class Heading {
  private s: AngleSpring;
  constructor(initial = 0, freq = 1.2, damping = 0.85) { this.s = new AngleSpring(initial, freq, damping); }
  get value() { return this.s.x; }
  set(a: number) { this.s.set(a); }
  /** heading that faces from `from` towards `to` (ignores height) */
  static towards(from: THREE.Vector3, to: THREE.Vector3) { return Math.atan2(to.x - from.x, to.z - from.z); }
  update(target: number, dt: number) { return this.s.update(target, dt); }
}

/**
 * Turn an object's head (or any part) to look at a world point, within limits, with a spring.
 * The part's rest orientation looks along its parent's +z.
 */
export class LookAt {
  yaw = new Spring(0, 1.6, 0.8);
  pitch = new Spring(0, 1.6, 0.8);
  maxYaw: number; maxPitch: number;
  constructor(maxYaw = 0.8, maxPitch = 0.35) { this.maxYaw = maxYaw; this.maxPitch = maxPitch; }
  /** returns [yaw, pitch] to apply on top of the rest pose; target null eases back to the front */
  update(part: THREE.Object3D, target: THREE.Vector3 | null, dt: number, weight = 1) {
    let ty = 0, tp = 0;
    if (target && part.parent) {
      part.parent.updateWorldMatrix(true, false);
      tmpV.copy(target);
      part.parent.worldToLocal(tmpV).sub(part.position);
      const yaw = Math.atan2(tmpV.x, tmpV.z);
      // only look at things in front; things behind are ignored rather than snapping round
      if (Math.abs(yaw) < 2.2) {
        ty = clamp(yaw, -this.maxYaw, this.maxYaw) * weight;
        tp = clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -this.maxPitch, this.maxPitch) * weight;
      }
    }
    return [this.yaw.update(ty, dt), this.pitch.update(tp, dt)] as const;
  }
}

// ---------------- ink outline ----------------
const outlineCache = new Map<string, THREE.MeshBasicMaterial>();
/**
 * Material for an ink outline: the back faces of a mesh pushed out along their normals. The line keeps
 * about `px` pixels wide up close and gets thinner with distance (never wider than `max` world units).
 */
export function outlineMaterial(color: THREE.ColorRepresentation = 0x1c1a24, px = 1.6, max = 0.035) {
  const key = `${new THREE.Color(color).getHexString()}:${px}:${max}`;
  let m = outlineCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const u = { outlineWidth: { value: px * 0.0011 }, outlineMax: { value: max } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;\nuniform float outlineMax;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec3 olN = normal;
        #ifdef USE_SKINNING
          olN = objectNormal;
        #endif
        vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
        vec3 olVN = normalize( normalMatrix * olN );
        mvPosition.xyz += olVN * min( outlineWidth * -mvPosition.z, outlineMax );
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'inkOutline1';
  outlineCache.set(key, m);
  return m;
}

/**
 * Add an ink outline to a mesh (a skinned mesh gets a skinned outline on the same skeleton).
 * The outline is a child of the mesh, so it moves, hides and scales with it.
 */
export function outline(m: THREE.Mesh, color: THREE.ColorRepresentation = 0x1c1a24, px = 1.6, max = 0.035) {
  const mat = outlineMaterial(color, px, max);
  let o: THREE.Mesh;
  if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
    const sm = m as THREE.SkinnedMesh;
    const so = new THREE.SkinnedMesh(sm.geometry, mat);
    // a sibling, not a child: skinned meshes are posed in their parent's space
    sm.parent?.add(so);
    so.position.copy(sm.position); so.quaternion.copy(sm.quaternion); so.scale.copy(sm.scale);
    so.bind(sm.skeleton, sm.bindMatrix);
    so.boundingSphere = sm.boundingSphere;
    o = so;
  } else {
    o = new THREE.Mesh(m.geometry, mat);
    m.add(o);
  }
  o.castShadow = false; o.receiveShadow = false;
  o.userData.outline = true;
  o.renderOrder = m.renderOrder;
  return o;
}

// ---------------- tubes ----------------
/**
 * A tube whose centre line is set every frame (a dragon's body, a whisker, a lock of hair, a tail).
 * Fill `pts` (from the root to the tip) and call `update()`. Rings stay upright relative to `up` where
 * they can, so a texture or a ridge along the top stays on top. `T`, `N` and `B` hold each ring's
 * direction along the tube, its up and its side after `update`.
 */
export class FlexTube {
  readonly mesh: THREE.Mesh;
  readonly pts: THREE.Vector3[];
  readonly T: THREE.Vector3[];
  readonly N: THREE.Vector3[];
  readonly B: THREE.Vector3[];
  readonly radii: number[];
  private pos: Float32Array;
  private nrm: Float32Array;
  private radial: number;
  constructor(n: number, radial: number, radius: (k: number) => number, mat: THREE.Material, o: { uvAlong?: number; uvAround?: number } = {}) {
    this.radial = radial;
    this.pts = Array.from({ length: n }, () => new THREE.Vector3());
    this.T = Array.from({ length: n }, () => new THREE.Vector3(0, 0, 1));
    this.N = Array.from({ length: n }, () => new THREE.Vector3(0, 1, 0));
    this.B = Array.from({ length: n }, () => new THREE.Vector3(1, 0, 0));
    this.radii = Array.from({ length: n }, (_, i) => radius(i / (n - 1)));
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * (radial + 1) * 3);
    this.nrm = new Float32Array(n * (radial + 1) * 3);
    const uv = new Float32Array(n * (radial + 1) * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j <= radial; j++) {
      uv[(i * (radial + 1) + j) * 2] = (j / radial) * (o.uvAround ?? 1);
      uv[(i * (radial + 1) + j) * 2 + 1] = (i / (n - 1)) * (o.uvAlong ?? 1);
      if (i < n - 1 && j < radial) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }
  update(up = new THREE.Vector3(0, 1, 0)) {
    const { pts, T, N, B, radii, radial, pos, nrm } = this;
    const n = pts.length, d = tmpV;
    for (let i = 0; i < n; i++) {
      T[i].subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]);
      if (T[i].lengthSq() < 1e-10) T[i].copy(i > 0 ? T[i - 1] : tmpA.set(0, 0, 1)); else T[i].normalize();
      N[i].copy(up).addScaledVector(T[i], -up.dot(T[i]));
      if (N[i].lengthSq() < 1e-4) N[i].copy(i > 0 ? N[i - 1] : tmpA.set(0, 1, 0)); else N[i].normalize();
      B[i].crossVectors(N[i], T[i]);
      const r = radii[i];
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        d.copy(B[i]).multiplyScalar(Math.cos(a)).addScaledVector(N[i], Math.sin(a));
        const o = (i * (radial + 1) + j) * 3;
        pos[o] = pts[i].x + d.x * r; pos[o + 1] = pts[i].y + d.y * r; pos[o + 2] = pts[i].z + d.z * r;
        nrm[o] = d.x; nrm[o + 1] = d.y; nrm[o + 2] = d.z;
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }
}

/** A static tapered tube along a curve (horns, whiskers, claws): radius r0 at the start, r1 at the end. */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs = 12, radial = 8) {
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, c);
    const r = lerp(r0, r1, t);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
