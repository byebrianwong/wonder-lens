import * as THREE from 'three';
import { Rng, TAU } from '../../../engine/math';

/**
 * Paper confetti in the films' colours, falling and fluttering over an area. One instanced mesh; pieces
 * that reach the floor go back to the top. `level` (0..1) is how much of it is falling: at 0 nothing shows.
 */
export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  level = 0;
  private n: number;
  private p: Float32Array;
  private spin: Float32Array;
  private phase: Float32Array;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

  constructor(count: number, box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }, seed = 5) {
    this.n = count;
    this.box = box;
    const rng = new Rng(seed);
    const geo = new THREE.PlaneGeometry(0.16, 0.1);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0x222222 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    const cols = [0xf2a8bc, 0xe8c04a, 0x9ad0cc, 0xc8202a, 0xb8a0d8, 0xf4ecdc, 0x6a9fd8, 0xe8743a];
    this.p = new Float32Array(count * 3);
    this.spin = new Float32Array(count * 3);
    this.phase = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.p[i * 3] = rng.range(box.x0, box.x1);
      this.p[i * 3 + 1] = rng.range(box.y0, box.y1);
      this.p[i * 3 + 2] = rng.range(box.z0, box.z1);
      for (let k = 0; k < 3; k++) this.spin[i * 3 + k] = rng.range(-4, 4);
      this.phase[i] = rng.range(0, TAU);
      this.mesh.setColorAt(i, c.set(rng.pick(cols)));
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.visible = false;
  }

  update(dt: number, t: number) {
    this.mesh.visible = this.level > 0.001;
    if (!this.mesh.visible) return;
    const b = this.box, h = b.y1 - b.y0;
    // only the first `level` share of pieces fall; the rest wait above the top
    const live = Math.floor(this.n * Math.min(1, this.level));
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      if (i < live) {
        this.p[o + 1] -= dt * (1.1 + 0.4 * Math.sin(this.phase[i]));
        this.p[o] += Math.sin(t * 1.7 + this.phase[i]) * dt * 0.6;
        this.p[o + 2] += Math.cos(t * 1.3 + this.phase[i]) * dt * 0.4;
        if (this.p[o + 1] < b.y0) this.p[o + 1] += h;
      }
      const hidden = i >= live;
      this.e.set(t * this.spin[o] + this.phase[i], t * this.spin[o + 1], t * this.spin[o + 2]);
      this.q.setFromEuler(this.e);
      this.s.setScalar(hidden ? 0 : 1);
      this.v.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
