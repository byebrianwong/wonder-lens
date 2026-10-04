import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Painter, charToon } from '../../../engine/Paint';
import { Rng, TAU, clamp, damp } from '../../../engine/math';
import { StopMotion } from '../stopmotion';
import { SEA } from './shaders';

/*
 * The crayon ponyfish: little fish striped in crayon colours (Zissou keeps one in a plastic bag). A school of them
 * mills round a coral head, then leads the Deep Search down the reef canyon, weaving just ahead of the bubble.
 * Whistle and they swirl in a ring round the bubble; throw a box and they dart to it. One instanced mesh; the
 * fish hold each pose for two frames, like the film's stop-motion creatures.
 */

/** Crayon bands along the body (x is tail to snout), a pale belly, a big eye near the snout. */
function crayonTexture() {
  const W = 256, H = 128;
  const p = new Painter(W, H, 1201).fill('#fff4e8');
  const g = p.g, rng = p.rng;
  const bands = ['#ff7aa8', '#ffd24a', '#7fe0b8', '#8ab8ff', '#c79cf2', '#ff9a5a', '#ff7aa8'];
  const bw = (W * 0.8) / bands.length;
  bands.forEach((c, i) => {
    const x0 = W * 0.06 + i * bw;
    // waxy crayon strokes, a little ragged at the edges
    for (let k = 0; k < 140; k++) {
      g.strokeStyle = c; g.globalAlpha = rng.range(0.5, 0.95); g.lineWidth = rng.range(1.5, 3.5);
      const x = x0 + rng.range(0, bw - 4), y = rng.range(0, H);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rng.range(-3, 3), y + rng.range(6, 16)); g.stroke();
    }
    g.globalAlpha = 1;
  });
  // white crayon edges between the bands
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
  for (let i = 1; i < bands.length; i++) { const x = W * 0.06 + i * bw; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= H; y += 8) g.lineTo(x + rng.range(-1.5, 1.5), y); g.stroke(); }
  // belly paler
  p.vgrad([[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [1, 'rgba(255,250,240,0.6)']]);
  // the eye (both flanks share the projection), and a little smile
  const ex = W * 0.86, ey = H * 0.42;
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex, ey, 11, 0, TAU); g.fill();
  g.fillStyle = '#1a1420'; g.beginPath(); g.arc(ex + 1.5, ey + 0.5, 7, 0, TAU); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - 1.5, ey - 3, 2.5, 0, TAU); g.fill();
  g.strokeStyle = '#2a1a24'; g.lineWidth = 2; g.beginPath(); g.arc(W * 0.95, H * 0.58, 6, 0.4, 1.9); g.stroke();
  return p.texture({ wrap: false });
}

/** The body, with uvs projected from the side (x along the body, y up), and an attribute for how far back each point is. */
function fishGeometry() {
  // body: a squashed, tapered sphere along z (tail at -z), with a rounded "pony" forehead
  const body = new THREE.SphereGeometry(1, 18, 12);
  const pos = body.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const along = z; // -1 tail .. 1 snout
    const taper = along < 0 ? 1 - 0.72 * along * along : 1 - 0.15 * along * along;
    const brow = along > 0.2 && y > 0 ? 1 + 0.25 * (along - 0.2) : 1;
    pos.setXYZ(i, x * 0.13 * taper, y * 0.2 * taper * brow, z * 0.42);
  }
  body.computeVertexNormals();
  // tail fin and a dorsal fin: flat fans
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.36, 0, 0.2, -0.62, 0, 0.02, -0.52, 0, 0, -0.36, 0, 0.02, -0.52, 0, -0.18, -0.6], 3));
  const dorsal = new THREE.BufferGeometry();
  dorsal.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.17, 0.12, 0, 0.3, -0.06, 0, 0.13, -0.16], 3));
  for (const g of [tail, dorsal]) g.computeVertexNormals();
  const geo = mergeGeometries([body.toNonIndexed(), tail, dorsal].map((g) => { const c = g.clone(); c.deleteAttribute('uv'); c.deleteAttribute('normal'); return c; }), false)!;
  geo.computeVertexNormals();
  const p = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2), back = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    uv[i * 2] = clamp((z + 0.62) / 1.06, 0, 1);
    uv[i * 2 + 1] = clamp((y + 0.22) / 0.52, 0, 1);
    back[i] = clamp((0.25 - z) / 0.87, 0, 1);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aBack', new THREE.BufferAttribute(back, 1));
  return geo;
}

export class PonyfishSchool {
  readonly mesh: THREE.InstancedMesh;
  /** the middle of the school, for the photo subject */
  readonly anchor = new THREE.Object3D();
  private n: number;
  private fish: Array<{ off: THREE.Vector3; p: THREE.Vector3; v: THREE.Vector3; ph: number; s: number }> = [];
  private sm = new StopMotion(12, 1203);
  private centre = new THREE.Vector3();
  private swirlT = 0;
  private dartT = 0;
  private dartAt = new THREE.Vector3();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private look = new THREE.Matrix4();

  constructor(n: number, home: THREE.Vector3) {
    this.n = n;
    const rng = new Rng(1207);
    const mat = charToon({ map: crayonTexture(), rim: 0.45, side: THREE.DoubleSide });
    mat.onBeforeCompile = ((base) => (sh: THREE.WebGLProgramParametersWithUniforms, r: THREE.WebGLRenderer) => {
      base.call(mat, sh, r);
      sh.uniforms.aqStep = SEA.step;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aBack; uniform float aqStep;')
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
          {
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = dot(instanceMatrix[3].xyz, vec3(1.3, 0.7, 1.1));
            #endif
            transformed.x += sin(aqStep * 11.0 + ph - transformed.z * 7.0) * 0.09 * aBack * aBack;
          }`);
    })(mat.onBeforeCompile);
    mat.customProgramCacheKey = () => 'aqPonyfish';
    this.mesh = new THREE.InstancedMesh(fishGeometry(), mat, n);
    this.mesh.frustumCulled = false;
    const tints = [0xffffff, 0xfff0f4, 0xf0fff8, 0xfffae8, 0xf4f0ff];
    for (let i = 0; i < n; i++) {
      const off = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.6, 0.6), rng.range(-1, 1)).multiplyScalar(2.4);
      const s = rng.range(0.85, 1.25);
      this.fish.push({ off, p: home.clone().add(off), v: new THREE.Vector3(0, 0, -1), ph: rng.range(0, TAU), s });
      this.mesh.setColorAt(i, new THREE.Color(tints[i % tints.length]));
    }
    this.centre.copy(home);
    this.anchor.position.copy(home);
    this.write();
  }

  swirl() { this.swirlT = 4.5; }
  dartTo(p: THREE.Vector3) { this.dartAt.copy(p); this.dartT = 4.5; }

  /** `cam`: the camera (the swirl circles the bubble). */
  update(dt: number, t: number, cam: THREE.Vector3) {
    this.swirlT = Math.max(0, this.swirlT - dt);
    this.dartT = Math.max(0, this.dartT - dt);
    this.anchor.position.copy(this.centre);
    const tmp = new THREE.Vector3();
    this.fish.forEach((f, i) => {
      // the school mills round and round its spot, every fish the same way, in layers
      const a = t * (0.75 + 0.3 * (1 - Math.abs(f.off.x) / 2.4)) + f.ph;
      if (this.swirlT > 0) {
        // a ring round the bubble, all swimming the same way round
        const ang = t * 1.6 + (i / this.n) * TAU, r = 2.1 + (i % 3) * 0.45;
        tmp.set(cam.x + Math.cos(ang) * r, cam.y + Math.sin(ang * 2 + i) * 0.5 + (i % 5 - 2) * 0.25, cam.z + Math.sin(ang) * r);
      } else if (this.dartT > 0) {
        const ang = t * 2.4 + f.ph, r = 0.6 + (i % 4) * 0.35;
        tmp.set(this.dartAt.x + Math.cos(ang) * r, this.dartAt.y + 0.4 + (i % 3) * 0.3, this.dartAt.z + Math.sin(ang) * r);
      } else {
        const r = 1.4 + Math.abs(f.off.x) * 0.9;
        tmp.set(this.centre.x + Math.cos(a) * r, this.centre.y + f.off.y * 1.2 + Math.sin(a * 2 + f.ph) * 0.25, this.centre.z + Math.sin(a) * r * 0.85);
      }
      const k = this.swirlT > 0 || this.dartT > 0 ? 3.2 : 2.6;
      const nx = damp(f.p.x, tmp.x, k, dt), ny = damp(f.p.y, tmp.y, k, dt), nz = damp(f.p.z, tmp.z, k, dt);
      const vx = nx - f.p.x, vy = ny - f.p.y, vz = nz - f.p.z;
      const sp = Math.hypot(vx, vy, vz);
      if (sp > 1e-4) { f.v.x = damp(f.v.x, vx / sp, 6, dt); f.v.y = damp(f.v.y, (vy / sp) * 0.5, 6, dt); f.v.z = damp(f.v.z, vz / sp, 6, dt); }
      f.p.set(nx, ny, nz);
    });
    if (this.sm.tick(dt)) this.write();
  }

  private write() {
    const up = new THREE.Vector3(0, 1, 0), o = new THREE.Vector3(), s = new THREE.Vector3();
    this.fish.forEach((f, i) => {
      if (f.v.lengthSq() < 1e-6) f.v.set(0, 0, -1);
      this.look.lookAt(o, tmpV.copy(f.v).negate(), up);
      this.q.setFromRotationMatrix(this.look);
      s.setScalar(f.s);
      this.m4.compose(f.p, this.q, s);
      this.mesh.setMatrixAt(i, this.m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
const tmpV = new THREE.Vector3();
