import * as THREE from 'three';
import { Rng } from '../../../engine/math';
import { softDot } from '../../../engine/Particles';

/*
 * Fireflies, drawn as additive glowing points that pulse on and off, each at its own pace.
 *
 * A swarm stays still in the world while the rider passes: each firefly wanders slowly, and one that drifts
 * out of the box round the rider comes back in on the far side (like `Drift`, but in world space, so they do
 * not travel along with the ride). The swarm fades out towards the edge of its box so the edge never shows.
 * `burst` sends a cloud of extra fireflies spiralling up from a point, fading as they rise.
 */

const vert = /* glsl */ `
  attribute float aSeed; attribute float aAlpha;
  uniform float uTime; uniform float uSize; uniform vec3 uAnchor; uniform vec2 uHalf; uniform float uFogDensity;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    // each one glows for a moment, then goes dark, at its own pace
    float rate = 0.9 + fract(aSeed * 7.31) * 1.4;
    float pulse = pow(clamp(sin(uTime * rate + aSeed * 40.0) * 0.5 + 0.5, 0.0, 1.0), 5.0);
    float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(position.x - uAnchor.x) / uHalf.x, abs(position.z - uAnchor.z) / uHalf.y));
    float fog = exp(-uFogDensity * uFogDensity * dist * dist);
    vA = aAlpha * (0.08 + 0.92 * pulse) * edge * fog * smoothstep(0.6, 2.5, dist);
    gl_PointSize = clamp(uSize * 700.0 / max(dist, 0.5), 1.5, 28.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uColor; uniform sampler2D uMap; uniform float uIntensity;
  varying float vA;
  void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vA * uIntensity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export class Fireflies {
  readonly group = new THREE.Group();
  readonly uniforms = {
    uTime: { value: 0 }, uSize: { value: 0.16 }, uAnchor: { value: new THREE.Vector3() }, uHalf: { value: new THREE.Vector2(1, 1) },
    uFogDensity: { value: 0.004 }, uColor: { value: new THREE.Color(0xc8ff70).multiplyScalar(2.2) }, uMap: { value: softDot() }, uIntensity: { value: 1 },
  };
  private swarms: Array<{ pos: Float32Array; seed: Float32Array; box: THREE.Vector3; yMid: number; points: THREE.Points; follow: 'ground' | 'rider' }> = [];
  private burstPos: Float32Array;
  private burstAlpha: Float32Array;
  private burstVel: Float32Array;
  private burstLife: Float32Array;
  private burstPts: THREE.Points;
  private rng: Rng;
  private next = 0;

  constructor(seed = 7070) {
    this.rng = new Rng(seed);
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    // a wide low swarm over the fields, and a few higher up round the rider so some drift right past
    this.addSwarm(mat, 1300, new THREE.Vector3(260, 3.4, 260), 1.9, 'ground');
    this.addSwarm(mat, 160, new THREE.Vector3(46, 14, 46), 0, 'rider');
    // the burst pool
    const N = 90;
    this.burstPos = new Float32Array(N * 3);
    this.burstAlpha = new Float32Array(N);
    this.burstVel = new Float32Array(N * 3);
    this.burstLife = new Float32Array(N);
    const seeds = new Float32Array(N).map(() => this.rng.next());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.burstPos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.burstAlpha, 1));
    this.burstPts = new THREE.Points(geo, mat);
    this.burstPts.frustumCulled = false;
    this.group.add(this.burstPts);
  }

  private addSwarm(mat: THREE.ShaderMaterial, n: number, box: THREE.Vector3, yMid: number, follow: 'ground' | 'rider') {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), alpha = new Float32Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (this.rng.next() - 0.5) * box.x;
      pos[i * 3 + 1] = yMid + (this.rng.next() - 0.5) * box.y;
      pos[i * 3 + 2] = (this.rng.next() - 0.5) * box.z;
      seed[i] = this.rng.next();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.group.add(points);
    this.swarms.push({ pos, seed, box, yMid, points, follow });
  }

  /** A cloud of fireflies rising from a point. */
  burst(at: THREE.Vector3, n = 36) {
    const N = this.burstLife.length, r = this.rng;
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % N;
      this.burstPos.set([at.x + r.range(-1.2, 1.2), at.y + r.range(0, 0.8), at.z + r.range(-1.2, 1.2)], i * 3);
      const a = r.range(0, Math.PI * 2), s = r.range(0.4, 1.6);
      this.burstVel.set([Math.cos(a) * s, r.range(1.2, 3.2), Math.sin(a) * s], i * 3);
      this.burstLife[i] = r.range(4, 7);
    }
  }

  /**
   * `rider` is the rider's position; the low swarm is kept round the ground below and ahead of it, at
   * `groundY`. `intensity` fades every firefly (0 hides them).
   */
  update(dt: number, t: number, rider: THREE.Vector3, ahead: THREE.Vector3, groundY: number, fog: THREE.FogExp2 | null, intensity: number) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uIntensity.value = intensity;
    u.uFogDensity.value = fog ? fog.density : 0.004;
    this.group.visible = intensity > 0.01;
    if (!this.group.visible) return;
    for (const s of this.swarms) {
      const ax = s.follow === 'ground' ? rider.x + ahead.x * 40 : rider.x, az = s.follow === 'ground' ? rider.z + ahead.z * 40 : rider.z;
      const ay = s.follow === 'ground' ? groundY + s.yMid : rider.y + 2;
      const hx = s.box.x / 2, hy = s.box.y / 2, hz = s.box.z / 2;
      const p = s.pos;
      for (let i = 0; i < s.seed.length; i++) {
        const sd = s.seed[i] * 100;
        p[i * 3] += Math.sin(t * 0.4 + sd) * 0.5 * dt;
        p[i * 3 + 1] += Math.cos(t * 0.6 + sd * 1.3) * 0.25 * dt;
        p[i * 3 + 2] += Math.sin(t * 0.35 + sd * 0.7) * 0.5 * dt;
        // keep each one inside the box round its anchor: leaving one side, it comes in on the other
        if (p[i * 3] < ax - hx) p[i * 3] += s.box.x; else if (p[i * 3] > ax + hx) p[i * 3] -= s.box.x;
        if (p[i * 3 + 1] < ay - hy) p[i * 3 + 1] += s.box.y; else if (p[i * 3 + 1] > ay + hy) p[i * 3 + 1] -= s.box.y;
        if (p[i * 3 + 2] < az - hz) p[i * 3 + 2] += s.box.z; else if (p[i * 3 + 2] > az + hz) p[i * 3 + 2] -= s.box.z;
      }
      (s.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      // the fade towards the box's edge is measured in the shader from the anchor of the wide swarm
      if (s.follow === 'ground') { u.uAnchor.value.set(ax, ay, az); u.uHalf.value.set(hx, hz); }
    }
    // the rising burst: spiralling up and out, fading
    const bp = this.burstPos, bv = this.burstVel;
    for (let i = 0; i < this.burstLife.length; i++) {
      if (this.burstLife[i] <= 0) { this.burstAlpha[i] = 0; continue; }
      this.burstLife[i] -= dt;
      const swirl = Math.sin(t * 2 + i) * 0.8;
      bp[i * 3] += (bv[i * 3] + swirl * bv[i * 3 + 2]) * dt;
      bp[i * 3 + 1] += bv[i * 3 + 1] * dt;
      bp[i * 3 + 2] += (bv[i * 3 + 2] - swirl * bv[i * 3]) * dt;
      bv[i * 3 + 1] *= 1 - 0.25 * dt;
      this.burstAlpha[i] = Math.min(1, this.burstLife[i] / 2) * 1.6;
    }
    (this.burstPts.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.burstPts.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}
