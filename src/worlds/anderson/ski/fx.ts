import * as THREE from 'three';
import { Rng } from '../../../engine/math';
import { softDot } from '../../../engine/Particles';

/*
 * Snow in the air: flakes hanging in the cold air that the toboggan rushes through (they stay put in the
 * world, so at speed they stream past), and puffs of powder thrown up by runners and skis. Each is one draw
 * call; the work is done in the vertex shader or on a small ring of particles.
 */

/** Flakes in a box that wraps round the camera, fixed in the world and falling slowly. */
export class SnowAir {
  readonly points: THREE.Points;
  private u: { time: { value: number }; cam: { value: THREE.Vector3 }; box: { value: THREE.Vector3 }; intensity: { value: number } };
  constructor(count = 900, box = new THREE.Vector3(46, 26, 60), seed = 1001) {
    const rng = new Rng(seed);
    const pos = new Float32Array(count * 3), seedA = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = rng.next() * box.x; pos[i * 3 + 1] = rng.next() * box.y; pos[i * 3 + 2] = rng.next() * box.z; seedA[i] = rng.next(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seedA, 1));
    this.u = { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: box.clone() }, intensity: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.u, map: { value: softDot() } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        uniform float time; uniform vec3 cam; uniform vec3 box;
        attribute float seed; varying float vA;
        void main() {
          // the flake falls and drifts; its place wraps inside a box centred on the camera
          vec3 p = position + vec3(sin(time * 0.6 + seed * 30.0) * 0.8 + time * 0.4, -time * (0.7 + seed * 0.6), cos(time * 0.5 + seed * 20.0) * 0.8);
          p = mod(p - cam + box * 0.5, box) - box * 0.5 + cam;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = smoothstep(0.6, 3.0, d) * (1.0 - smoothstep(box.z * 0.3, box.z * 0.5, d));
          gl_PointSize = clamp((0.06 + seed * 0.06) * 600.0 / max(d, 0.4), 1.0, 14.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform float intensity; varying float vA;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vA * intensity * 0.85;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vec3(1.0, 0.98, 1.0), a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  set intensity(k: number) { this.u.intensity.value = k; this.points.visible = k > 0.01; }
  update(t: number, cam: THREE.Vector3) { this.u.time.value = t; this.u.cam.value.copy(cam); }
}

/** Puffs of powder snow: a ring of particles thrown out with a velocity, slowing, growing and fading. */
export class Spray {
  readonly points: THREE.Points;
  private pos: Float32Array; private vel: Float32Array; private age: Float32Array; private life: Float32Array; private size: Float32Array;
  private next = 0;
  private rng: Rng;
  private n: number;
  constructor(n = 220, seed = 1002) {
    this.n = n;
    this.rng = new Rng(seed);
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(9); this.life = new Float32Array(n).fill(1); this.size = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('age', new THREE.BufferAttribute(this.age, 1));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot() } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float age; attribute float size; varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float k = clamp(age, 0.0, 1.0);
          vA = (1.0 - k) * (1.0 - k) * smoothstep(0.4, 2.0, -mv.z);
          gl_PointSize = clamp(size * (0.5 + k * 1.5) * 500.0 / max(-mv.z, 0.4), 1.0, 90.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying float vA;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vA * 0.8;
          if (a < 0.02) discard;
          gl_FragColor = vec4(0.97, 0.96, 1.0, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
  /** throw `count` puffs from p, with a base velocity v and some scatter */
  emit(p: THREE.Vector3, v: THREE.Vector3, count: number, scatter = 1.2, size = 0.35, life = 0.9) {
    const r = this.rng;
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = p.x + r.range(-0.2, 0.2); this.pos[i * 3 + 1] = p.y + r.range(0, 0.15); this.pos[i * 3 + 2] = p.z + r.range(-0.2, 0.2);
      this.vel[i * 3] = v.x + r.range(-1, 1) * scatter; this.vel[i * 3 + 1] = v.y + r.range(0.3, 1) * scatter; this.vel[i * 3 + 2] = v.z + r.range(-1, 1) * scatter;
      this.age[i] = 0; this.life[i] = life * r.range(0.7, 1.2); this.size[i] = size * r.range(0.7, 1.3);
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.age[i] >= 1) continue;
      this.age[i] = Math.min(1, this.age[i] + dt / this.life[i]);
      const drag = Math.exp(-3 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - 2.5 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.age as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }
}
