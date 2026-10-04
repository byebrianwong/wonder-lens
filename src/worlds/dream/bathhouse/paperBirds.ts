import * as THREE from 'three';
import { Rng, TAU, clamp, smoothstep } from '../../../engine/math';
import { washi } from './textures';

/*
 * The paper birds (shikigami): small white paper cut-outs of a figure with its arms spread, flapping like
 * birds. A storm of them bursts in through the boiler room's high window, streams up to the rider and swirls
 * round the camera, close enough to fill the view, while the screen goes to paper; as the cover lifts they
 * scatter away into the night.
 *
 * One instanced mesh. The flapping is done in the vertex shader (each bird has its own rate and phase); the
 * flight is computed on the CPU from two progress values the set takes from the rider's z.
 */

/** A paper figure lying flat, head towards +z, arms out along x: about 0.5 long and 0.55 across. */
function birdGeometry() {
  const s = new THREE.Shape();
  // drawn in (x, y) with the head at +y; turned flat afterwards
  s.moveTo(0, 0.27);
  s.quadraticCurveTo(0.07, 0.27, 0.065, 0.2);
  s.lineTo(0.05, 0.16);
  s.lineTo(0.27, 0.13);
  s.lineTo(0.26, 0.08);
  s.lineTo(0.06, 0.06);
  s.lineTo(0.08, -0.16);
  s.lineTo(0.1, -0.26);
  s.lineTo(0.025, -0.17);
  s.lineTo(0, -0.2);
  s.lineTo(-0.025, -0.17);
  s.lineTo(-0.1, -0.26);
  s.lineTo(-0.08, -0.16);
  s.lineTo(-0.06, 0.06);
  s.lineTo(-0.26, 0.08);
  s.lineTo(-0.27, 0.13);
  s.lineTo(-0.05, 0.16);
  s.lineTo(-0.065, 0.2);
  s.quadraticCurveTo(-0.07, 0.27, 0, 0.27);
  const geo = new THREE.ShapeGeometry(s, 4);
  const uv = geo.attributes.uv as THREE.BufferAttribute, p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.6 + 0.5, p.getY(i) / 0.6 + 0.5);
  // lay it flat: the shape's +y (the head) becomes +z
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

export class PaperBirds {
  readonly mesh: THREE.InstancedMesh;
  private time = { value: 0 };
  private birds: Array<{
    start: THREE.Vector3; d: number; d2: number; r: number; w: number; h: number; th0: number; tilt: number; s: number;
    exit: THREE.Vector3; pos: THREE.Vector3; vel: THREE.Vector3;
  }> = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private sc = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private zero = new THREE.Vector3();
  private swirl = new THREE.Vector3();

  /** `window`: the middle of the opening they come in by; `w`, `h`: its size. */
  constructor(count: number, window: THREE.Vector3, w: number, h: number, seed = 1) {
    const rng = new Rng(seed);
    const geo = birdGeometry();
    const rate = new Float32Array(count), phase = new Float32Array(count);
    for (let i = 0; i < count; i++) { rate[i] = rng.range(9, 15); phase[i] = rng.range(0, TAU); }
    geo.setAttribute('aRate', new THREE.InstancedBufferAttribute(rate, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const mat = new THREE.MeshLambertMaterial({ map: washi(), side: THREE.DoubleSide, emissive: 0x8a8478, emissiveIntensity: 0.6 });
    const time = this.time;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.paperTime = time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aRate;\nattribute float aPhase;\nuniform float paperTime;')
        .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
          {
            // the two halves fold up and down about the body's line, like wings
            float f = 0.85 * sin(paperTime * aRate + aPhase);
            float ax = abs(transformed.x);
            transformed.y += ax * sin(f);
            transformed.x *= cos(f);
          }`);
    };
    mat.customProgramCacheKey = () => 'bath-paper-birds-1';
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    for (let i = 0; i < count; i++) {
      const near = rng.chance(0.6);
      this.birds.push({
        start: window.clone().add(new THREE.Vector3(rng.range(-0.45, 0.45) * w, rng.range(-0.45, 0.45) * h, -rng.range(1, 14))),
        d: rng.next(), d2: rng.next(),
        r: near ? rng.range(1.1, 3.2) : rng.range(3.2, 8), w: rng.range(0.9, 2.2) * rng.sign(), h: rng.range(-2.2, 2.6), th0: rng.range(0, TAU), tilt: rng.range(-0.5, 0.5),
        s: rng.range(0.75, 1.3),
        exit: new THREE.Vector3(rng.range(-1, 1), rng.range(0.4, 1.4), rng.range(-1, 0.6)).normalize(),
        pos: new THREE.Vector3(), vel: new THREE.Vector3(0, 0, 1),
      });
    }
  }

  /**
   * `inK`: 0 before they burst in, 1 when all of them are swirling round the camera. `outK`: 0 while they
   * swirl, 1 once all of them have flown away.
   */
  update(dt: number, t: number, cam: THREE.Vector3, inK: number, outK: number) {
    this.time.value = t;
    const on = inK > 0 && outK < 1;
    this.mesh.visible = on;
    if (!on) return;
    const p = this.tmp;
    this.birds.forEach((b, i) => {
      const e = smoothstep(0, 1, clamp((inK * 1.5 - b.d * 0.5), 0, 1));
      const o = smoothstep(0, 1, clamp((outK * 1.4 - b.d2 * 0.4), 0, 1));
      // where it would be in the swirl round the camera
      const th = b.th0 + b.w * t;
      const sx = Math.cos(th) * b.r, sz = Math.sin(th) * b.r;
      const swirl = this.swirl.set(cam.x + sx, cam.y + b.h + Math.sin(th * 0.7 + b.th0) * 0.7 + sx * b.tilt * 0.3, cam.z + sz);
      // in: from outside the window, an arc up to the swirl; out: away and up into the night
      p.copy(b.start).lerp(swirl, e);
      p.y += Math.sin(e * Math.PI) * 2.5;
      if (o > 0) p.lerp(this.zero.copy(swirl).addScaledVector(b.exit, 60), o * o);
      if (dt > 0) b.vel.lerp(this.zero.copy(p).sub(b.pos).divideScalar(dt), 1 - Math.exp(-10 * dt));
      b.pos.copy(p);
      // face along the flight
      const dir = this.zero.copy(b.vel);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      this.m.lookAt(dir, this.sc.set(0, 0, 0), this.up);
      this.q.setFromRotationMatrix(this.m);
      const s = b.s * (e > 0.001 ? 1 : 0) * (1 - smoothstep(0.8, 1, o));
      this.m.compose(p, this.q, this.sc.setScalar(Math.max(s, 1e-4)));
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
