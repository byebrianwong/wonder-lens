import * as THREE from 'three';
import { Rng, TAU } from '../../../engine/math';
import { bubbleSprite } from './textures';
import { SEA } from './shaders';

/*
 * The water itself: the sea's surface (seen from below it shimmers, with Snell's window of bright sky straight
 * overhead; seen from above it is the sea at sundown with a path of glitter towards the sun), soft shafts of
 * light from the surface, rising bubbles, and drifting specks of marine snow.
 */

const FOG_GLSL = /* glsl */ `
  float aqFog(float depth, float density) { return clamp(1.0 - exp(-density * density * depth * depth), 0.0, 1.0); }
`;

/**
 * The sea surface: a disc of rings that follows the camera (fine near it, coarse far off), with a gentle swell.
 */
export class SeaSurface {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: SEA.time,
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.004 },
    // from above, at sundown
    uDeep: { value: new THREE.Color(0x1e2a5a) },
    uShallow: { value: new THREE.Color(0x2a6a86) },
    uSkyTop: { value: new THREE.Color(0x6a5aa8) },
    uSkyHorizon: { value: new THREE.Color(0xffb890) },
    uSunDir: { value: new THREE.Vector3(-0.45, 0.07, -0.89).normalize() },
    uSunColor: { value: new THREE.Color(0xffc070) },
    // from below
    uWindow: { value: new THREE.Color(0xe8fff8) },
    uUnder: { value: new THREE.Color(0x2a8aa4) },
    uUnderLight: { value: 1 },
  };

  constructor() {
    // rings from just under the camera out to the horizon, closer together near the middle
    const rings: number[] = [];
    for (let r = 0.6; r < 1700; r *= 1.11) rings.push(r);
    const seg = 72;
    const pos: number[] = [0, 0, 0], idx: number[] = [];
    for (let i = 0; i < rings.length; i++) for (let j = 0; j < seg; j++) {
      const a = (j / seg) * TAU;
      pos.push(Math.cos(a) * rings[i], 0, Math.sin(a) * rings[i]);
    }
    for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j, b = 1 + i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorld; varying float vFogDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float a = wp.x * 0.13 + wp.z * 0.07 + uTime * 0.8;
          float b = wp.z * 0.19 - wp.x * 0.05 - uTime * 0.6;
          float fade = 1.0 - smoothstep(30.0, 120.0, length(wp.xz - cameraPosition.xz));
          wp.y += (sin(a) * 0.09 + sin(b) * 0.06) * fade;
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyTop; uniform vec3 uSkyHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
        uniform vec3 uWindow; uniform vec3 uUnder; uniform float uUnderLight;
        varying vec3 vWorld; varying float vFogDepth;
        ${FOG_GLSL}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float ripples(vec2 p) {
          return noise(p * 0.7 + vec2(uTime * 0.31, uTime * 0.17)) * 0.6 + noise(p * 1.9 - vec2(uTime * 0.42, -uTime * 0.27)) * 0.4;
        }
        void main() {
          float dist = length(cameraPosition - vWorld);
          float e = 0.12;
          float r0 = ripples(vWorld.xz), rx = ripples(vWorld.xz + vec2(e, 0.0)), rz = ripples(vWorld.xz + vec2(0.0, e));
          float amp = 0.7 * (1.0 - smoothstep(15.0, 140.0, dist));
          vec3 n = normalize(vec3(-(rx - r0) / e * amp * 0.3, 1.0, -(rz - r0) / e * amp * 0.3));
          vec3 col; float alpha;
          if (cameraPosition.y < vWorld.y) {
            // from below: Snell's window straight overhead, mirror-dark water beyond it
            vec3 D = normalize(vWorld - cameraPosition);
            float c = dot(D, n);
            float win = smoothstep(0.6, 0.74, c);
            float edge = exp(-pow((c - 0.66) * 14.0, 2.0));
            // the shimmer: bright wobbling lines in the window
            float sh = smoothstep(0.55, 0.9, r0 + 0.25 * noise(vWorld.xz * 3.1 + uTime));
            col = mix(uUnder * 0.75, uWindow, win) + uWindow * (edge * 0.45 + sh * 0.35 * win);
            col *= uUnderLight;
            alpha = 1.0;
          } else {
            // from above: sea at sundown, the sky in it, a road of glitter to the sun
            vec3 V = normalize(cameraPosition - vWorld);
            vec3 R = reflect(-V, n);
            float fres = 0.04 + 0.96 * pow(clamp(1.0 - dot(V, n), 0.0, 1.0), 5.0);
            vec3 body = mix(uDeep, uShallow, clamp(0.35 + 0.4 * (r0 - 0.5), 0.0, 1.0));
            vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.5, R.y));
            col = mix(body, sky, clamp(fres * 0.95 + 0.18, 0.0, 1.0));
            float sd = clamp(dot(R, uSunDir), 0.0, 1.0);
            float glit = pow(sd, 260.0) * 3.0 + pow(sd, 40.0) * 0.5 * smoothstep(0.55, 0.85, r0);
            col += uSunColor * glit * (1.0 - smoothstep(350.0, 900.0, dist) * 0.5);
            col += uSunColor * pow(sd, 6.0) * 0.12;
            alpha = 0.93;
          }
          col = mix(col, uFogColor, aqFog(vFogDepth, uFogDensity));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  update(cam: THREE.Vector3, fog: THREE.FogExp2 | null) {
    this.mesh.position.set(cam.x, 0, cam.z);
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density; }
  }
}

/**
 * Soft shafts of light falling from the surface: each is one quad that turns about its own axis to face the
 * camera, so it reads as a glowing column from every side. All the shafts are one mesh.
 */
export class LightShafts {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: SEA.time,
    uColor: { value: new THREE.Color(0xe8fff4) },
    uOpacity: { value: 0.3 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.02 },
  };

  /** `shafts`: top point, bottom point, width at the top and at the bottom */
  constructor(shafts: Array<{ a: THREE.Vector3; b: THREE.Vector3; w0: number; w1: number }>) {
    const pos: number[] = [], A: number[] = [], B: number[] = [], side: number[] = [], seed: number[] = [], idx: number[] = [];
    shafts.forEach((s, i) => {
      for (let k = 0; k < 4; k++) {
        const top = k < 2, sd = k % 2 ? 1 : -1;
        pos.push(top ? s.a.x : s.b.x, top ? s.a.y : s.b.y, top ? s.a.z : s.b.z);
        A.push(s.a.x, s.a.y, s.a.z); B.push(s.b.x, s.b.y, s.b.z);
        side.push(sd * (top ? s.w0 : s.w1), top ? 0 : 1);
        seed.push(i * 1.37);
      }
      const o = i * 4;
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aA', new THREE.Float32BufferAttribute(A, 3));
    geo.setAttribute('aB', new THREE.Float32BufferAttribute(B, 3));
    geo.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 2));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aA; attribute vec3 aB; attribute vec2 aSide; attribute float aSeed;
        varying vec2 vUv; varying float vSeed; varying float vFogDepth; varying float vNear;
        void main() {
          vec3 axis = normalize(aB - aA);
          vec3 mid = mix(aA, aB, aSide.y);
          vec3 toCam = normalize(cameraPosition - mid);
          vec3 across = normalize(cross(axis, toCam));
          vec3 p = position + across * aSide.x;
          vUv = vec2(sign(aSide.x) * 0.5 + 0.5, aSide.y);
          vSeed = aSeed;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFogDepth = -mv.z;
          // how close the camera is to the shaft's axis: fade a shaft the camera is inside
          vec3 ap = cameraPosition - aA;
          float along = clamp(dot(ap, axis), 0.0, length(aB - aA));
          vNear = length(ap - axis * along);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec2 vUv; varying float vSeed; varying float vFogDepth; varying float vNear;
        ${FOG_GLSL}
        void main() {
          float across = sin(vUv.x * 3.14159);
          across = across * across;
          float along = smoothstep(0.0, 0.08, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.3);
          float shimmer = 0.65 + 0.35 * sin(uTime * 0.9 + vSeed * 3.0) * sin(uTime * 0.37 + vSeed);
          float streak = 0.75 + 0.25 * sin(vUv.x * 19.0 + vSeed * 5.0 + uTime * 0.3);
          float a = across * along * shimmer * streak * uOpacity;
          a *= smoothstep(1.0, 5.0, vNear) * smoothstep(1.5, 6.0, vFogDepth);
          a *= 1.0 - aqFog(vFogDepth, uFogDensity) * 0.85;
          gl_FragColor = vec4(uColor * a, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 3;
  }

  update(fog: THREE.FogExp2 | null) {
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density; }
  }
}

/**
 * Bubbles: a pool of point sprites that rise, wobble and pop at the surface. Emitters call `emit`; the sub's
 * wake, vents in the reef and the splash at the start use it.
 */
export class Bubbles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private rng = new Rng(7311);
  private n: number;

  constructor(n = 360) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: bubbleSprite() }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSize; varying float vFog; varying float vA;
        uniform float uFogDensity;
        ${FOG_GLSL}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_PointSize = clamp(aSize * 520.0 / max(d, 0.3), 1.5, 90.0);
          vFog = aqFog(d, uFogDensity);
          vA = smoothstep(0.25, 1.2, d) * step(0.001, aSize);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 uFogColor; varying float vFog; varying float vA;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          float a = t.a * vA * (1.0 - vFog * 0.9);
          if (a < 0.02) discard;
          gl_FragColor = vec4(mix(vec3(0.92, 1.0, 1.0), uFogColor, vFog * 0.6), a * 0.85);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  emit(p: THREE.Vector3, count: number, spread = 0.3, size: [number, number] = [0.04, 0.12], up = 1.6) {
    const r = this.rng;
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = p.x + r.range(-spread, spread); this.pos[i * 3 + 1] = p.y + r.range(-spread, spread); this.pos[i * 3 + 2] = p.z + r.range(-spread, spread);
      const s = r.range(size[0], size[1]);
      this.size[i] = s;
      this.vel[i * 3] = r.range(-0.3, 0.3); this.vel[i * 3 + 1] = up * r.range(0.7, 1.3) * (0.6 + s * 4); this.vel[i * 3 + 2] = r.range(-0.3, 0.3);
      this.life[i] = r.range(5, 9);
    }
  }

  update(dt: number, t: number, fog: THREE.FogExp2 | null) {
    const { pos, vel, size, life } = this;
    for (let i = 0; i < this.n; i++) {
      if (size[i] <= 0) continue;
      life[i] -= dt;
      pos[i * 3] += (vel[i * 3] + Math.sin(t * 5 + i) * 0.25) * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += (vel[i * 3 + 2] + Math.cos(t * 4.3 + i * 1.7) * 0.25) * dt;
      vel[i * 3 + 1] = Math.min(vel[i * 3 + 1] + dt * 0.6, 3.2);
      // pop at the surface, or when spent
      if (pos[i * 3 + 1] > -0.05 || life[i] <= 0) { size[i] = 0; pos[i * 3 + 1] = -9999; }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    const m = this.points.material as THREE.ShaderMaterial;
    if (fog) { m.uniforms.uFogColor.value.copy(fog.color); m.uniforms.uFogDensity.value = fog.density; }
  }
}

/**
 * Specks drifting in the water round the camera: marine snow (pale, slowly sinking) or, in the deep,
 * plankton that twinkles (additive). One Points object in a box that wraps round the anchor.
 */
export class Specks {
  readonly points: THREE.Points;
  readonly uniforms = { uColor: { value: new THREE.Color(0xffffff) }, uAmount: { value: 1 }, uTime: SEA.time, uSize: { value: 0.05 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 } };
  private base: Float32Array;
  private box: THREE.Vector3;

  constructor(count: number, box: THREE.Vector3, o: { additive?: boolean; size?: number; seed?: number; twinkle?: boolean } = {}) {
    const rng = new Rng(o.seed ?? 77);
    this.box = box;
    this.base = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.base[i * 3] = rng.range(-0.5, 0.5) * box.x; this.base[i * 3 + 1] = rng.range(-0.5, 0.5) * box.y; this.base[i * 3 + 2] = rng.range(-0.5, 0.5) * box.z;
      seeds[i] = rng.range(0, 100);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.base.slice(), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    if (o.size) this.uniforms.uSize.value = o.size;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uSize; uniform float uTime; uniform float uFogDensity;
        varying float vA; varying float vFog;
        ${FOG_GLSL}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = -mv.z;
          gl_PointSize = clamp(uSize * 600.0 / max(d, 0.5), 1.0, 7.0);
          vA = smoothstep(0.6, 2.5, d) ${o.twinkle ? '* (0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.5 + fract(aSeed) * 3.0) + aSeed * 7.0), 3.0))' : ''};
          vFog = aqFog(d, uFogDensity);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAmount; uniform vec3 uFogColor; varying float vA; varying float vFog;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float r = length(c);
          float a = smoothstep(0.5, 0.15, r) * vA * uAmount * (1.0 - vFog);
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uColor, uFogColor, vFog * 0.5), a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  /** Keep the specks in a box round `anchor`, drifting by `drift` (units per second). */
  update(t: number, anchor: THREE.Vector3, drift: THREE.Vector3, fog: THREE.FogExp2 | null) {
    const p = (this.points.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const { base, box } = this;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const size = k === 0 ? box.x : k === 1 ? box.y : box.z;
        const a = k === 0 ? anchor.x : k === 1 ? anchor.y : anchor.z;
        const d = k === 0 ? drift.x : k === 1 ? drift.y : drift.z;
        // a fixed lattice in the world that wraps round the anchor, so the specks stay put as the camera moves
        let v = base[i + k] + d * t + Math.sin(t * 0.3 + i) * 0.3 - a;
        v = ((v % size) + size * 1.5) % size - size / 2;
        p[i + k] = v + a;
      }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density; }
    this.points.visible = this.uniforms.uAmount.value > 0.01;
  }
}

