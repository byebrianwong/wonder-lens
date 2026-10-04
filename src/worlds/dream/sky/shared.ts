import * as THREE from 'three';
import type { CumulusField } from '../../../engine/Clouds';

/*
 * Small things the sky scene's pieces share: GLSL noise, a CPU 3D noise, and `SkyLight`, which reads the
 * world's current sky colours, sun and fog so the scene's own cloud shaders follow the lighting.
 */

/** GLSL value noise in 2D and 3D. The hashes avoid sin(), which loses precision at world-sized inputs. */
export const GLSL_NOISE = /* glsl */ `
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float noise2(vec2 p) {
    vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
  }
`;

/**
 * Keeps a colour's brightness under `top`, easing in from `knee`, so sunlit cloud stays peach-gold and
 * never reaches the bloom threshold (0.97) and turns into a glowing white ball.
 */
export const GLSL_CAP = /* glsl */ `
  vec3 capLum(vec3 c, float knee, float top) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    if (l <= knee) return c;
    return c * ((knee + (top - knee) * (1.0 - exp(-(l - knee) / (top - knee)))) / l);
  }
`;

/** The same cap on the CPU, for colours handed to plain materials. */
export function capColor(c: THREE.Color, top: number) {
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l > top) c.multiplyScalar(top / l);
  return c;
}

/**
 * Adjusts one of this scene's own CumulusField materials (before it is first compiled):
 *  - the shade side is lifted towards `uLift` by `uLiftAmt`, so at sunrise it reads rose-lilac, not smoke
 *  - clouds seen close to the sun direction keep a dimmer body, so only their edge glows
 *  - the result is capped below the bloom threshold
 */
export function softenCumulus(field: CumulusField) {
  const m = field.material;
  m.uniforms.uLift = { value: new THREE.Color(0.84, 0.7, 0.82) };
  m.uniforms.uLiftAmt = { value: 0 };
  const decl = 'uniform vec3 uFogColor; uniform float uFogDensity;';
  const fogLine = 'float fog = 1.0 - exp(';
  if (!m.fragmentShader.includes(decl) || !m.fragmentShader.includes(fogLine)) {
    console.warn('[dream/sky] CumulusField shader changed; sky clouds are not softened');
    return field;
  }
  m.fragmentShader = m.fragmentShader
    .replace(decl, `${decl}\nuniform vec3 uLift; uniform float uLiftAmt;\n${GLSL_CAP}`)
    .replace(fogLine, /* glsl */ `
      col = mix(col, uLift, (1.0 - lit) * uLiftAmt);
      float nearSun = smoothstep(0.8, 0.97, clamp(dot(-V, uSunDir), 0.0, 1.0));
      col *= 1.0 - 0.25 * nearSun * (1.0 - rim);
      col = capLum(col, 0.6, 0.82);
      ${fogLine}`);
  return field;
}

function hash3(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}
/** Smooth 3D value noise in [0, 1] (for shaping geometry at build time). */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

/** The uniforms of the world's sky dome that the cloud shaders read. */
export interface SkyColours {
  topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color };
  sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color };
}

/**
 * The world's current light, read from the scene: the sky dome's uniforms (found by their names), the sun
 * (the scene's DirectionalLight) and the fog. The world writes these after the sets update, so a set sees
 * last frame's values, which is close enough.
 */
export class SkyLight {
  readonly sky: SkyColours;
  readonly fog: THREE.FogExp2;
  private sun: THREE.DirectionalLight | null = null;
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = (scene.fog as THREE.FogExp2 | null) ?? new THREE.FogExp2(0xf0c0a8, 0.0026);
    // a stand-in until the real sky is found (only used if the scene has none)
    this.sky = {
      topColor: { value: new THREE.Color(0x4a6ab0) }, midColor: { value: new THREE.Color(0xe8a8a0) }, bottomColor: { value: new THREE.Color(0xffcc98) },
      sunDir: { value: new THREE.Vector3(0.5, 0.08, -0.86).normalize() }, sunColor: { value: new THREE.Color(0xffb878) },
    };
    this.find();
  }

  private find() {
    const hit: { sky: SkyColours | null } = { sky: null };
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!hit.sky && m.isMesh && (m.material as THREE.ShaderMaterial).isShaderMaterial) {
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        if (u.midColor && u.topColor && u.bottomColor && u.sunDir && u.sunColor && u.horizonColor) hit.sky = u as unknown as SkyColours;
      }
      if (!this.sun && (o as THREE.DirectionalLight).isDirectionalLight) this.sun = o as THREE.DirectionalLight;
    });
    if (hit.sky) Object.assign(this.sky, hit.sky);
  }

  get sunIntensity() { return this.sun ? this.sun.intensity : 2; }
  get sunDir() { return this.sky.sunDir.value; }
  get sunColor() { return this.sky.sunColor.value; }
}
