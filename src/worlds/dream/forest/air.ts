import * as THREE from 'three';
import { Rng, TAU } from '../../../engine/math';
import { beamTexture, mistTexture } from './textures';

/*
 * Things in the air of the wood: banks of mist, beams of moonlight and first light, and the spray thrown
 * up by the Catbus's paws in the shallows. Each is one draw call.
 */

// ---------------- mist ----------------
export interface MistPuff { p: THREE.Vector3; w: number; h: number; a: number }

/**
 * Soft cards of mist that turn round the vertical axis to face the camera. They fade out when the camera
 * comes close (so a card's flat edge never shows) and towards the fog colour with distance.
 */
export class MistLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = {
    uMap: { value: mistTexture() as THREE.Texture },
    uColor: { value: new THREE.Color(0xc8e0dc) },
    uOpacity: { value: 1 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.01 },
    uTime: { value: 0 },
  };

  constructor(puffs: MistPuff[]) {
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const alpha = new Float32Array(puffs.map((p) => p.a));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(alpha, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        attribute float aAlpha;
        varying vec2 vUv; varying float vAlpha; varying float vDist; varying float vFogDepth;
        void main() {
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float w = length(instanceMatrix[0].xyz), h = length(instanceMatrix[1].xyz);
          // a card fades away as the camera comes within about its own width, so it never sweeps across the view
          float near = smoothstep(w * 0.25, w * 0.75, length(cameraPosition - c));
          vec3 toCam = cameraPosition - c; toCam.y = 0.0;
          float l = length(toCam);
          vec3 f = l > 0.001 ? toCam / l : vec3(0.0, 0.0, 1.0);
          vec3 right = vec3(f.z, 0.0, -f.x);
          vec3 wp = c + right * position.x * w + vec3(0.0, position.y * h, 0.0);
          // a slow drift, different for every card
          wp += right * sin(uTime * 0.07 + c.z * 0.13 + c.x * 0.05) * w * 0.08;
          vUv = uv; vAlpha = aAlpha * near;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vDist = length(cameraPosition - wp); vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec2 vUv; varying float vAlpha; varying float vDist; varying float vFogDepth;
        void main() {
          float a = texture2D(uMap, vUv).a * vAlpha * uOpacity;
          a *= smoothstep(3.0, 16.0, vDist);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          a *= 1.0 - fog * 0.75;
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(uColor, uFogColor, clamp(fog * 0.6, 0.0, 1.0)), a);
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, puffs.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    puffs.forEach((p, i) => this.mesh.setMatrixAt(i, m.compose(p.p, q, s.set(p.w, p.h, 1))));
    this.mesh.count = puffs.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData.keep = true;
  }

  update(t: number, fog: THREE.FogExp2, color: THREE.Color, opacity: number) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uFogColor.value.copy(fog.color);
    u.uFogDensity.value = fog.density;
    u.uColor.value.copy(color);
    u.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0.01;
  }
}

// ---------------- beams of light ----------------
export interface Beam { from: THREE.Vector3; to: THREE.Vector3; width: number; color: THREE.ColorRepresentation; a: number }

/**
 * Many soft beams of light merged into one mesh: each is three crossed planes along its axis, narrower at
 * the top. They add light, fade with the fog and fade out when the camera passes through them.
 */
export class Beams {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uMap: { value: beamTexture() as THREE.Texture }, uOpacity: { value: 1 }, uFogDensity: { value: 0.01 } };

  constructor(beams: Beam[]) {
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), c = new THREE.Color();
    for (const b of beams) {
      const len = b.from.distanceTo(b.to);
      q.setFromUnitVectors(down, b.to.clone().sub(b.from).normalize());
      c.set(b.color).multiplyScalar(b.a);
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang);
        const base = pos.length / 3;
        for (const [x, y] of [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]]) {
          // y 0 is the top (the light's source), y 1 the far end
          const w = x * b.width * (y === 0 ? 0.6 : 1);
          v.set(w * ca, -y * len, w * sa).applyQuaternion(q).add(b.from);
          pos.push(v.x, v.y, v.z);
          uv.push(x + 0.5, 1 - y);
          col.push(c.r, c.g, c.b);
        }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol; varying float vDist; varying float vFogDepth;
        void main() {
          vUv = uv; vCol = color;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDist = length(cameraPosition - wp.xyz);
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uOpacity; uniform float uFogDensity;
        varying vec2 vUv; varying vec3 vCol; varying float vDist; varying float vFogDepth;
        void main() {
          float a = texture2D(uMap, vUv).a;
          float f = uFogDensity * vFogDepth * 0.7;
          float keep = exp(-f * f);
          gl_FragColor = vec4(vCol * a * uOpacity * keep * smoothstep(1.5, 9.0, vDist), 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 4;
    this.mesh.userData.keep = true;
  }

  update(fog: THREE.FogExp2, opacity: number) {
    this.uniforms.uFogDensity.value = fog.density;
    this.uniforms.uOpacity.value = opacity;
    this.mesh.visible = opacity > 0.01;
  }
}

// ---------------- spray ----------------
/** Droplets thrown up where something strikes the water: a pool of points that fly up and fall back. */
export class Spray {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private rng = new Rng(611);
  private n: number;

  constructor(count = 220, color: THREE.ColorRepresentation = 0xdff4f0) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aLife; varying float vLife;
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aLife > 0.0 ? min(140.0 / max(-mv.z, 0.5), 18.0) : 0.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vLife;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = (1.0 - smoothstep(0.2, 0.5, length(d))) * clamp(vLife * 2.0, 0.0, 1.0) * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** Throw `n` droplets up from a point. */
  burst(p: THREE.Vector3, n = 6, up = 3, spread = 1.4) {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = p.x + r.range(-0.2, 0.2); this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z + r.range(-0.2, 0.2);
      const a = r.range(0, TAU), s = r.range(0.3, 1) * spread;
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = r.range(0.5, 1) * up; this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = r.range(0.5, 0.9);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt);
      this.vel[i * 3 + 1] -= 11 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // a droplet that falls back into the water is gone
      if (this.pos[i * 3 + 1] < 0) this.life[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
  }
}
