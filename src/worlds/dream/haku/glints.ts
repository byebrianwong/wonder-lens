import * as THREE from 'three';
import { Rng } from '../../../engine/math';

/*
 * Light on the night sea, all drawn additively over the water with one draw call each:
 *  - star reflections: faint twinkling points scattered on the water
 *  - the moon's path: short-lived glints on the water between the rider and the moon, densest where the
 *    moon's reflection is (they move with the camera, as a reflection does)
 *  - streaks: the long shimmering reflection under a lamp, a lit window or a train, which always points
 *    towards the camera
 * Every material reads the fog colour and density from `fog(...)`, called once a frame.
 */

const FOG_GLSL = /* glsl */ `
  uniform vec3 uFogColor; uniform float uFogDensity;
  float fogAmount(float d) { return clamp(1.0 - exp(-uFogDensity * uFogDensity * d * d), 0.0, 1.0); }
`;

type FogUniforms = { uFogColor: { value: THREE.Color }; uFogDensity: { value: number } };
function setFog(u: FogUniforms, fog: THREE.FogExp2) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = fog.density; }

/** Faint star reflections scattered over the water in a rectangle (x0..x1, z0 > z1), at height y. */
export function starReflections(rng: Rng, n: number, x0: number, x1: number, z0: number, z1: number, y = 0.06) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([rng.range(x0, x1), y, rng.range(z1, z0)], i * 3);
    seed[i] = rng.next();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uAmount: { value: 1 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.003 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; varying float vA;
      ${FOG_GLSL}
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // most are dim, a few bright; each twinkles at its own pace
        float b = 0.25 + 0.75 * pow(fract(aSeed * 13.7), 3.0);
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed * 2.3) + aSeed * 61.0);
        vA = b * tw * (1.0 - fogAmount(-mv.z));
        gl_PointSize = clamp(1.0 + 2.4 * b, 1.0, 3.5);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uAmount; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.3, 1.0, r)) * vA * uAmount;
        if (a < 0.01) discard;
        gl_FragColor = vec4(0.82, 0.88, 1.0, a);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  return { points, update(t: number, fog: THREE.FogExp2) { uniforms.uTime.value = t; setFog(uniforms, fog); } };
}

/**
 * The moon's glittering path on the water. Each glint flashes once and comes back somewhere else on the path,
 * so the path seems to sparkle without any point being seen to slide.
 */
export class MoonGlitter {
  readonly points: THREE.Points;
  readonly uniforms = {
    uTime: { value: 0 }, uAmount: { value: 1 },
    uOrigin: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector2(0, -1) }, uDist: { value: 80 },
    uColor: { value: new THREE.Color(0xe4ecff) },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.003 },
  };

  private waterY: number;

  constructor(n: number, seed: number, waterY = 0) {
    this.waterY = waterY;
    const rng = new Rng(seed);
    const s = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) s[i] = rng.next();
    const geo = new THREE.BufferGeometry();
    // positions are worked out in the shader; this only gives the points a count
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aSeed;
        uniform float uTime; uniform vec3 uOrigin; uniform vec2 uDir; uniform float uDist;
        varying float vA;
        ${FOG_GLSL}
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          // each glint lives one short cycle, then starts again at a new random spot
          float cyc = uTime * (0.7 + aSeed.x * 1.6) + aSeed.y * 10.0;
          float id = floor(cyc), ph = fract(cyc);
          float h1 = hash(id * 12.9898 + aSeed.z * 78.233);
          float h2 = hash(id * 39.346 + aSeed.x * 11.135);
          float h3 = hash(id * 73.156 + aSeed.y * 51.71);
          // spread along the line towards the moon, densest round the reflection itself
          float dist = uDist * exp((h1 - 0.42) * 2.4);
          float across = h2 * 2.0 - 1.0;
          across *= abs(across);
          float halfW = 1.5 + dist * 0.07 + uDist * 0.04;
          vec2 perp = vec2(-uDir.y, uDir.x);
          vec2 xz = uOrigin.xz + uDir * dist + perp * across * halfW;
          vec4 mv = viewMatrix * vec4(xz.x, uOrigin.y, xz.y, 1.0);
          float d = max(-mv.z, 0.5);
          float flash = sin(ph * 3.14159);
          flash = flash * flash * flash;
          float core = exp(-abs(log(max(dist, 1.0) / max(uDist, 1.0))) * 1.6);
          vA = flash * (0.3 + 0.7 * core) * (1.0 - abs(across) * 0.5) * (1.0 - fogAmount(d));
          gl_PointSize = clamp(1.5 + 2.5 * h3 + 140.0 / d, 1.5, 7.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uAmount; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          // a small soft dot with a faint cross, like light caught on a ripple
          float r = length(c) * 2.0;
          float spot = 1.0 - smoothstep(0.0, 0.7, r);
          float rays = max(1.0 - smoothstep(0.0, 0.08, abs(c.x)), 1.0 - smoothstep(0.0, 0.08, abs(c.y))) * (1.0 - smoothstep(0.2, 1.0, r));
          float a = (spot + rays * 0.5) * vA * uAmount;
          if (a < 0.01) discard;
          // kept under the bloom threshold: where many glints overlap they would otherwise fuse into a white blot
          gl_FragColor = vec4(uColor * 0.9, a * 0.8);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  /** Follow the camera: the path runs from below the camera towards the moon. */
  update(t: number, cam: THREE.Vector3, moonDir: THREE.Vector3, fog: THREE.FogExp2) {
    const u = this.uniforms;
    u.uTime.value = t;
    const elev = Math.max(Math.asin(Math.min(1, Math.max(0, moonDir.y / Math.max(moonDir.length(), 1e-6)))), 0.05);
    const h = Math.max(cam.y - this.waterY, 0.5);
    u.uDist.value = h / Math.tan(elev);
    u.uDir.value.set(moonDir.x, moonDir.z);
    if (u.uDir.value.lengthSq() < 1e-6) u.uDir.value.set(0, -1); else u.uDir.value.normalize();
    u.uOrigin.value.set(cam.x, this.waterY + 0.08, cam.z);
    setFog(u, fog);
  }
}

/**
 * Long shimmering reflections on the water under lights. Each streak starts at the light's foot and runs
 * towards the camera, whichever way the camera is; `add` them, then `build()` one mesh. The mesh may be
 * moved (the train carries its own).
 */
export class Streaks {
  readonly uniforms = { uTime: { value: 0 }, uGain: { value: 1 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.003 } };
  private center: number[] = []; private corner: number[] = []; private size: number[] = []; private color: number[] = []; private seed: number[] = [];
  private idx: number[] = [];

  /** a streak at the foot of a light (`c` on the water), `w` wide, up to `len` long */
  add(c: THREE.Vector3, w: number, len: number, color: THREE.ColorRepresentation, seed: number) {
    const k = this.center.length / 3;
    const col = new THREE.Color(color);
    for (const [cx, cy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      this.center.push(c.x, c.y, c.z); this.corner.push(cx, cy); this.size.push(w, len); this.color.push(col.r, col.g, col.b); this.seed.push(seed);
    }
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.center, 3));
    geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(this.corner, 2));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(this.size, 2));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.color, 3));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    geo.setIndex(this.idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec2 aCorner; attribute vec2 aSize; attribute vec3 aColor; attribute float aSeed;
        varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vFog;
        ${FOG_GLSL}
        void main() {
          vec3 c = (modelMatrix * vec4(position, 1.0)).xyz;
          vec2 toCam = cameraPosition.xz - c.xz;
          float L = length(toCam);
          vec2 dir = toCam / max(L, 0.001);
          vec2 perp = vec2(-dir.y, dir.x);
          float len = min(aSize.y, L * 0.7);
          vec2 xz = c.xz + dir * (aCorner.y * len) + perp * (aCorner.x * aSize.x * (1.0 - 0.45 * aCorner.y));
          vec4 mv = viewMatrix * vec4(xz.x, c.y, xz.y, 1.0);
          vUv = aCorner; vColor = aColor; vSeed = aSeed; vFog = fogAmount(-mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uGain;
        varying vec2 vUv; varying vec3 vColor; varying float vSeed; varying float vFog;
        void main() {
          float across = 1.0 - abs(vUv.x);
          across *= across;
          float along = 1.0 - vUv.y;
          // broken bands that shimmer as the water moves
          float bands = 0.5 + 0.5 * sin(vUv.y * 36.0 - uTime * 2.6 + vSeed * 20.0 + sin(vUv.y * 11.0 + uTime * 1.3) * 2.0);
          float a = across * along * (0.35 + 0.65 * bands) * uGain * (1.0 - vFog);
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.userData.keep = true;
    return m;
  }

  update(t: number, fog: THREE.FogExp2) { this.uniforms.uTime.value = t; setFog(this.uniforms, fog); }
}

let haloTex: THREE.Texture | null = null;
/** A soft round glow (white in the middle, fading to nothing), for halos round lights seen from far away. */
export function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}
