import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { haloTexture, mistTexture, noteTexture, softEdgeTexture, sproutTexture } from './textures';

/*
 * Small effects for the garden scenes: sprouts in the seed bed, the notes of the ocarinas, dew glinting in
 * the grass at dawn, a flock of birds, and morning mist lying on the fields.
 */

// ---------------- sprouts ----------------
export interface Sprouts {
  mesh: THREE.InstancedMesh;
  /** set every sprout's height (0 = not yet up) and how much they sway */
  set(i: number, pos: THREE.Vector3, height: number, lean: number, yaw: number): void;
  commit(): void;
  count: number;
}

/** Up to `n` seedlings on crossed cards, one instanced mesh. Each is placed every frame by `set`. */
export function buildSprouts(n: number): Sprouts {
  const card = new THREE.PlaneGeometry(0.5, 1).translate(0, 0.5, 0);
  const geo = mergeGeometries([card, card.clone().rotateY(Math.PI / 2)])!;
  const mat = new THREE.MeshLambertMaterial({ map: sproutTexture(), alphaTest: 0.45, side: THREE.DoubleSide, emissive: 0x0a1a06 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  return {
    mesh, count: n,
    set(i, pos, h, lean, yaw) {
      e.set(lean, yaw, lean * 0.5, 'YXZ');
      q.setFromEuler(e);
      s.set(Math.max(0.001, h * 0.9), Math.max(0.001, h), Math.max(0.001, h * 0.9));
      m.compose(pos, q, s);
      mesh.setMatrixAt(i, m);
    },
    commit() { mesh.instanceMatrix.needsUpdate = true; },
  };
}

// ---------------- notes ----------------
/** Glowing musical notes that float up from a point and fade (additive points). */
export class NoteStream {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private life: Float32Array;
  private vel: Float32Array;
  private n: number;
  private next = 0;
  private rng = new Rng(808);
  private mat: THREE.ShaderMaterial;

  constructor(n = 40, color = 0xffe6a0, size = 0.9) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: noteTexture() }, color: { value: new THREE.Color(color) }, size: { value: size } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aLife; uniform float size; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vA = sin(clamp(aLife, 0.0, 1.0) * 3.14159);
          gl_PointSize = min(size * 320.0 / max(-mv.z, 0.5), 48.0) * (0.6 + 0.4 * vA);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 color; varying float vA;
        void main() { vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(color * t.rgb * 1.4, a); }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  emit(p: THREE.Vector3) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const r = this.rng;
    this.pos.set([p.x + r.range(-0.3, 0.3), p.y + r.range(0, 0.4), p.z + r.range(-0.3, 0.3)], i * 3);
    this.vel.set([r.range(-0.5, 0.5), r.range(1.2, 2.0), r.range(-0.5, 0.5)], i * 3);
    this.life[i] = 1;
  }
  update(dt: number, t: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt / 3.2);
      this.pos[i * 3] += (this.vel[i * 3] + Math.sin(t * 2 + i) * 0.6) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ---------------- dew ----------------
/** Dew on the grass: fixed points that twinkle now and then as the low sun catches them. */
export function buildDew(points: THREE.Vector3[]) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const seeds = new Float32Array(points.length);
  const rng = new Rng(909);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rng.range(0, 100);
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, map: { value: haloTexture() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float time; varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float d = -mv.z;
        float tw = pow(max(0.0, sin(time * (1.3 + fract(aSeed) * 2.0) + aSeed * 7.0)), 12.0);
        vA = tw * smoothstep(2.0, 6.0, d) * (1.0 - smoothstep(40.0, 70.0, d));
        gl_PointSize = min(9.0 * 30.0 / max(d, 0.5), 14.0) + 2.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; varying float vA;
      void main() { float a = texture2D(map, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.0, 0.97, 0.88) * 1.6, a); }`,
  });
  const pts = new THREE.Points(g, mat);
  return { points: pts, update(t: number) { mat.uniforms.time.value = t; } };
}

// ---------------- birds ----------------
/** A small flock wheeling over the fields: bodies and flapping wings, three instanced meshes. */
export function buildBirds(n: number, centre: THREE.Vector3, spread: number, seed = 31) {
  const rng = new Rng(seed);
  const mat = charToon({ color: 0x3a3238, rim: 0.5 });
  const bodyGeo = new THREE.SphereGeometry(1, 8, 6).scale(0.12, 0.1, 0.32);
  const wingGeo = new THREE.PlaneGeometry(0.7, 0.26).translate(0.35, 0, 0).rotateX(-Math.PI / 2);
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, n);
  const wings = new THREE.InstancedMesh(wingGeo, new THREE.MeshLambertMaterial({ color: 0x3a3238, side: THREE.DoubleSide }), n * 2);
  const group = new THREE.Group();
  for (const im of [bodies, wings]) { im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(im); }
  const birds = Array.from({ length: n }, () => ({ r: rng.range(spread * 0.4, spread), h: rng.range(-4, 6), sp: rng.range(0.12, 0.2) * (rng.chance(0.85) ? 1 : -1), ph: rng.range(0, TAU), flap: rng.range(8, 11) }));
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), qw = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), m = new THREE.Matrix4(), e = new THREE.Euler(), off = new THREE.Vector3();
  return {
    group,
    update(t: number) {
      birds.forEach((b, i) => {
        const a = t * b.sp + b.ph;
        p.set(centre.x + Math.cos(a) * b.r, centre.y + b.h + Math.sin(t * 0.5 + b.ph) * 2, centre.z + Math.sin(a) * b.r * 0.6);
        const yaw = Math.atan2(-Math.sin(a) * b.sp, Math.cos(a) * b.sp * 0.6);
        e.set(0, yaw, -Math.sign(b.sp) * 0.3, 'YXZ');
        q.setFromEuler(e);
        m.compose(p, q, s); bodies.setMatrixAt(i, m);
        // flap in bursts, then glide
        const flap = Math.sin(t * b.flap + b.ph) * (Math.sin(t * 0.7 + b.ph) > -0.2 ? 0.7 : 0.08);
        for (let k = 0; k < 2; k++) {
          const sd = k === 0 ? 1 : -1;
          qw.setFromEuler(e.set(0, 0, sd * flap)).premultiply(q);
          off.set(sd * 0.08, 0.02, 0).applyQuaternion(q).add(p);
          s.set(sd, 1, 1);
          m.compose(off, qw, s); wings.setMatrixAt(i * 2 + k, m);
          s.set(1, 1, 1);
        }
      });
      bodies.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------- mist ----------------
/**
 * Morning mist: soft-edged patches lying over the fields that drift slowly. Each patch is a flat layer at
 * its own height; a patch can be stacked (several heights) to give the mist some depth.
 */
export function buildMist(patches: Array<{ x: number; z: number; w: number; d: number; y: number; opacity: number }>, color: THREE.ColorRepresentation) {
  const group = new THREE.Group();
  const mats: THREE.MeshBasicMaterial[] = [];
  patches.forEach((l, i) => {
    const tex = mistTexture().clone();
    tex.needsUpdate = true;
    tex.repeat.set(l.w / 110, l.d / 110);
    const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: softEdgeTexture(), color, transparent: true, opacity: l.opacity, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l.w, l.d).rotateX(-Math.PI / 2), mat);
    m.position.set(l.x, l.y, l.z);
    m.renderOrder = 2 + (i % 4);
    group.add(m);
    mats.push(mat);
  });
  return {
    group,
    update(t: number) { mats.forEach((m, i) => { m.map!.offset.set(t * 0.0012 * ((i % 3) + 1), t * 0.0007 * (i % 2 ? -1 : 1)); }); },
  };
}
