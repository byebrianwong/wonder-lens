import * as THREE from 'three';
import { Rng, clamp } from '../../../engine/math';
import { puffTexture } from './paint';

/*
 * Two cheap effects for Howl's meadow, each one draw call:
 * `Smoke` is a pool of soft camera-facing puffs (chimney smoke, cannon sneezes, spray off the water) that
 * rise, grow and fade; `Ripples` is a pool of rings that spread on the lake where a paw or a foot strikes.
 */

const FOG_GLSL = /* glsl */ `
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
`;

interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; s0: number; s1: number; rot: number; spin: number; r: number; g: number; b: number; a: number }

export class Smoke {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uMap: { value: puffTexture() as THREE.Texture },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.002 },
    /** extra light on every puff, 0..1 (warm sunlight on smoke) */
    uLight: { value: new THREE.Color(1, 0.95, 0.85) },
  };
  private pool: Puff[] = [];
  private next = 0;
  private aPos: THREE.InstancedBufferAttribute;
  private aSize: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute;
  private rng: Rng;
  /** wind that carries every puff, in units per second */
  readonly wind = new THREE.Vector3(1.2, 0, 0.6);

  constructor(count = 160, seed = 5) {
    this.rng = new Rng(seed);
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    for (const a of [this.aPos, this.aSize, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iCol', this.aCol);
    geo.instanceCount = count;
    for (let i = 0; i < count; i++) this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 1, life: 0, s0: 0, s1: 0, rot: 0, spin: 0, r: 1, g: 1, b: 1, a: 0 });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iCol;
        varying vec2 vUv; varying vec4 vCol; varying float vDepth;
        void main() {
          vUv = uv; vCol = iCol;
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          float c = cos(iSize.y), s = sin(iSize.y);
          vec2 q = position.xy * iSize.x;
          mv.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uLight;
        varying vec2 vUv; varying vec4 vCol; varying float vDepth;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * vCol.a * smoothstep(0.6, 3.0, vDepth);
          if (a < 0.004) discard;
          vec3 col = vCol.rgb * mix(vec3(0.72, 0.74, 0.86), uLight, t.r);
          ${FOG_GLSL}
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /**
   * Emit `n` puffs at `p`. `vel` is the mean starting velocity, `spread` its random part; sizes grow from
   * `size` to `size * grow` over `life` seconds.
   */
  emit(p: THREE.Vector3, o: { n?: number; vel?: THREE.Vector3; spread?: number; size?: number; grow?: number; life?: number; color?: THREE.ColorRepresentation; alpha?: number; jitter?: number }) {
    const r = this.rng, c = new THREE.Color(o.color ?? 0xf0ece6);
    const n = o.n ?? 1, sp = o.spread ?? 0.5, j = o.jitter ?? 0.2;
    for (let i = 0; i < n; i++) {
      const q = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      q.x = p.x + r.range(-j, j); q.y = p.y + r.range(-j, j); q.z = p.z + r.range(-j, j);
      q.vx = (o.vel?.x ?? 0) + r.range(-sp, sp); q.vy = (o.vel?.y ?? 1.5) + r.range(-sp, sp) * 0.5; q.vz = (o.vel?.z ?? 0) + r.range(-sp, sp);
      q.age = 0; q.life = (o.life ?? 3) * r.range(0.8, 1.2);
      q.s0 = (o.size ?? 1) * r.range(0.8, 1.2); q.s1 = q.s0 * (o.grow ?? 3);
      q.rot = r.range(0, Math.PI * 2); q.spin = r.range(-0.4, 0.4);
      q.r = c.r; q.g = c.g; q.b = c.b; q.a = o.alpha ?? 0.85;
    }
  }

  update(dt: number, fog: THREE.FogExp2 | null) {
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density; }
    const P = this.aPos.array as Float32Array, S = this.aSize.array as Float32Array, C = this.aCol.array as Float32Array;
    const w = this.wind;
    for (let i = 0; i < this.pool.length; i++) {
      const q = this.pool[i];
      if (q.age >= q.life) { S[i * 2] = 0; C[i * 4 + 3] = 0; continue; }
      q.age += dt;
      const k = clamp(q.age / q.life, 0, 1);
      // puffs slow down as they spread, and the wind takes them
      const drag = Math.exp(-1.2 * dt);
      q.vx = q.vx * drag + w.x * (1 - drag); q.vy = q.vy * drag + w.y * (1 - drag) + 0.25 * dt; q.vz = q.vz * drag + w.z * (1 - drag);
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.spin * dt;
      P[i * 3] = q.x; P[i * 3 + 1] = q.y; P[i * 3 + 2] = q.z;
      S[i * 2] = q.s0 + (q.s1 - q.s0) * (1 - (1 - k) * (1 - k)); S[i * 2 + 1] = q.rot;
      C[i * 4] = q.r; C[i * 4 + 1] = q.g; C[i * 4 + 2] = q.b;
      C[i * 4 + 3] = q.a * Math.min(1, k * 6) * (1 - k) * (1 - k * 0.3);
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aCol.needsUpdate = true;
  }
}

/** Rings that spread out on still water: a pool of flat quads drawn by one shader. */
export class Ripples {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.002 },
    uTint: { value: new THREE.Color(1, 0.97, 0.9) },
  };
  private items: Array<{ x: number; z: number; age: number; life: number; size: number }> = [];
  private next = 0;
  private aRing: THREE.InstancedBufferAttribute;

  /** `y` is the height of the water surface. */
  constructor(count = 64, y = 0.02) {
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    // x, z, radius, strength
    this.aRing = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.aRing.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iRing', this.aRing);
    geo.instanceCount = count;
    for (let i = 0; i < count; i++) this.items.push({ x: 0, z: 0, age: 1, life: 0, size: 1 });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 iRing;
        varying vec2 vP; varying float vStr; varying float vDepth;
        void main() {
          vP = position.xz;
          vStr = iRing.w;
          vec3 wp = vec3(iRing.x + position.x * iRing.z, ${y.toFixed(3)}, iRing.y + position.z * iRing.z);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uTint;
        varying vec2 vP; varying float vStr; varying float vDepth;
        void main() {
          float d = length(vP);
          // a bright crest just inside the edge and a fainter second ring inside it
          float ring = smoothstep(0.78, 0.9, d) * (1.0 - smoothstep(0.9, 1.0, d));
          ring += 0.45 * smoothstep(0.5, 0.58, d) * (1.0 - smoothstep(0.58, 0.66, d));
          float a = ring * vStr;
          if (a < 0.004) discard;
          vec3 col = uTint;
          ${FOG_GLSL}
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** A ring at (x, z) that spreads to `size` units across over `life` seconds. */
  add(x: number, z: number, size = 2.4, life = 1.6) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.x = x; it.z = z; it.age = 0; it.life = life; it.size = size;
  }

  update(dt: number, fog: THREE.FogExp2 | null) {
    if (fog) { this.uniforms.uFogColor.value.copy(fog.color); this.uniforms.uFogDensity.value = fog.density; }
    const A = this.aRing.array as Float32Array;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.age >= it.life) { A[i * 4 + 2] = 0; A[i * 4 + 3] = 0; continue; }
      it.age += dt;
      const k = clamp(it.age / it.life, 0, 1);
      A[i * 4] = it.x; A[i * 4 + 1] = it.z;
      A[i * 4 + 2] = 0.15 + it.size * (1 - (1 - k) * (1 - k));
      A[i * 4 + 3] = 0.55 * (1 - k) * (1 - k);
    }
    this.aRing.needsUpdate = true;
  }
}
