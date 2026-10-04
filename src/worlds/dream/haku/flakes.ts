import * as THREE from 'three';
import { Rng } from '../../../engine/math';

/**
 * Haku's scales bursting away: a few thousand glittering flakes in one Points object that follows the camera.
 *
 * Each flake belongs to a spot on the dragon, from the head (0) to the tail tip (1), and comes away when the
 * ride has travelled `release` units past the start of the burst (the tail first, the head last). It bursts
 * off the body, then settles into a slow swirl round the rider and keeps tumbling and glinting in the
 * moonlight while the rider falls. Everything is worked out in the shader from the distance travelled
 * (`rel`) and the clock, so it looks right however fast the ride goes and wherever it is jumped to.
 *
 * `body` holds 8 points along the dragon, relative to the camera: the head, then 7 rings from the neck to
 * the tail tip. Set them each frame while the dragon is there; after that they keep their last values.
 */

/** Body coordinate (0 head .. 1 tail) where the neck begins: below it a flake comes from the head. */
export const HEAD_PART = 0.08;

export class ScaleFlakes {
  readonly points: THREE.Points;
  readonly uniforms = {
    uTime: { value: 0 },
    uRel: { value: -1 },
    uFade: { value: 1 },
    uPx: { value: 650 },
    uBody: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
  };
  /** the earliest release, in travel units (the flakes that peel off before the burst) */
  private first: number;

  /**
   * `span`: travel (units) over which the body comes apart; `release(b)` gives the dissolve amount (0..1) at
   * which the part of the dragon at body coordinate b comes away (it must match the dragon's own dissolve).
   */
  constructor(count: number, seed: number, span: number, release: (b: number) => number) {
    const rng = new Rng(seed);
    const A = new Float32Array(count * 4), B = new Float32Array(count * 4), D = new Float32Array(count * 3);
    const dir = new THREE.Vector3();
    this.first = 0;
    for (let i = 0; i < count; i++) {
      // where on the dragon: a quarter from the head, the rest along the body, thicker parts shedding more
      const r = rng.next();
      let b: number, rel: number;
      if (r < 0.06) {
        // a few peel off the back half before the burst proper
        b = rng.range(0.5, 1); rel = -rng.range(0, 0.6);
      } else if (r < 0.3) {
        b = rng.range(0, HEAD_PART); rel = release(b) + rng.range(-0.03, 0.04);
      } else {
        b = HEAD_PART + (1 - HEAD_PART) * Math.pow(rng.next(), 1.35); rel = release(b) + rng.range(-0.02, 0.04);
      }
      A.set([b, rel * span, rng.range(0.05, 0.13), rng.next()], i * 4);
      this.first = Math.min(this.first, rel * span);
      // the swirl: mostly close round the rider, some far out; heights kept inside the fade band at first
      B.set([1.8 + 26 * Math.pow(rng.next(), 1.7), rng.range(0, Math.PI * 2), rng.range(-12, 12), rng.range(0.05, 0.28) * (rng.chance(0.85) ? 1 : -1)], i * 4);
      dir.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize();
      D.set([dir.x, dir.y, dir.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aA', new THREE.BufferAttribute(A, 4));
    geo.setAttribute('aB', new THREE.BufferAttribute(B, 4));
    geo.setAttribute('aDir', new THREE.BufferAttribute(D, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aA;   // body coordinate, release (travel), size, random
        attribute vec4 aB;   // swirl radius, start angle, height, turn speed
        attribute vec3 aDir; // random unit vector
        uniform float uTime; uniform float uRel; uniform float uFade; uniform float uPx;
        uniform vec3 uBody[8];
        varying float vA; varying float vSpin; varying float vGlint; varying vec3 vColor;
        vec3 bodyAt(float b) {
          if (b < ${HEAD_PART.toFixed(3)}) return mix(uBody[0], uBody[1], b / ${HEAD_PART.toFixed(3)});
          float f = clamp((b - ${HEAD_PART.toFixed(3)}) / ${(1 - HEAD_PART).toFixed(3)}, 0.0, 1.0) * 6.0;
          int i = int(min(floor(f), 5.0));
          return mix(uBody[i + 1], uBody[i + 2], f - float(i));
        }
        void main() {
          float age = uRel - aA.y;
          if (age <= 0.0 || uFade <= 0.001) {
            vA = 0.0; vSpin = 0.0; vGlint = 0.0; vColor = vec3(0.0);
            gl_PointSize = 0.0;
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
          }
          float rnd = aA.w;
          // a spot on the body's surface (the body is thinner towards the tail)
          vec3 origin = bodyAt(aA.x) + aDir * 0.6 * (1.0 - 0.7 * aA.x);
          // a quick burst off the body, then a slow settle into the swirl round the rider
          float e1 = 1.0 - exp(-age / 1.4);
          float e2 = smoothstep(0.0, 16.0, age);
          vec3 burst = origin + aDir * (1.2 + 2.5 * fract(rnd * 7.3)) * e1 + vec3(0.0, 0.8, 0.0) * e1;
          // once settled the flakes drift slowly upwards past the falling rider, and come round again below
          float drift = max(age - 16.0, 0.0) * (0.08 + 0.12 * fract(rnd * 3.1));
          float rise = mod(aB.z + 18.0 + drift, 36.0) - 18.0;
          float th = aB.y + uTime * aB.w;
          vec3 orbit = vec3(cos(th) * aB.x, rise, sin(th) * aB.x);
          vec3 p = mix(burst, orbit, e2);
          float edge = smoothstep(-18.0, -13.0, rise) * (1.0 - smoothstep(13.0, 18.0, rise));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = max(-mv.z, 0.3);
          // tumbling: the flake turns edge-on and back, and flashes when it faces the light
          vSpin = uTime * (1.5 + 3.0 * fract(rnd * 5.7)) + rnd * 30.0;
          vGlint = pow(max(cos(vSpin * 1.3), 0.0), 12.0);
          vec3 silver = vec3(0.86, 0.92, 1.0), teal = vec3(0.55, 0.95, 0.86);
          vColor = mix(silver, teal, step(0.8, fract(rnd * 11.0)) * 0.8) * (0.55 + 2.0 * vGlint);
          vA = uFade * edge * smoothstep(0.0, 0.6, age);
          gl_PointSize = clamp(aA.z * uPx / d * (0.8 + 0.6 * vGlint), 1.0, 24.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vSpin; varying float vGlint; varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float s = sin(vSpin), co = cos(vSpin);
          vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
          r.x /= max(abs(cos(vSpin * 1.3)), 0.2);
          float d = length(r) * 2.0;
          // a rounded scale with a bright middle, and a little star of light when it catches the moon
          float plate = 1.0 - smoothstep(0.6, 1.0, d);
          float core = 1.0 - smoothstep(0.0, 0.45, d);
          float rays = max(1.0 - smoothstep(0.0, 0.06, abs(c.x)), 1.0 - smoothstep(0.0, 0.06, abs(c.y))) * (1.0 - smoothstep(0.1, 1.0, length(c) * 2.0)) * vGlint;
          float a = (plate * 0.45 + core * 0.55 + rays) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, clamp(a, 0.0, 1.0));
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  /**
   * `rel`: travel since the burst began; `anchor`: the camera's world position; `body`: the dragon's 8 points in
   * world space while it is there (null keeps the last ones); `fade`: overall brightness.
   */
  update(t: number, rel: number, anchor: THREE.Vector3, body: THREE.Vector3[] | null, fade: number) {
    const u = this.uniforms;
    u.uTime.value = t; u.uRel.value = rel; u.uFade.value = fade;
    this.points.position.copy(anchor);
    if (body) for (let i = 0; i < 8; i++) u.uBody.value[i].copy(body[i]).sub(anchor);
    this.points.visible = fade > 0.001 && rel > this.first;
  }
}
