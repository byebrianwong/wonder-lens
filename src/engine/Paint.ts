import * as THREE from 'three';
import { Rng } from './math';

/**
 * Tools for painted characters and props.
 *
 * `charToon` is a cel-shaded material for characters: a soft two-tone light ramp whose shadow side is a
 * cool blue-violet rather than grey, plus a thin rim of light on the silhouette that is strongest when
 * the sun is behind the character. `Painter` paints canvas textures (fur, fabric, faces) onto the UV
 * layouts of three.js spheres, capsules and cylinders, and can place marks by 3D direction.
 *
 * UV layouts (three.js):
 * - Sphere and capsule: u goes around from -x (u = 0) through +z (u = 0.25, the front of a character),
 *   +x (0.5) and -z (0.75). The top of the shape is the top of the canvas.
 * - Cylinder and cone: u goes from +z (u = 0) through +x (0.25), -z (0.5) and -x (0.75). Top at the top.
 */

// ---------- material ----------
const rampCache = new Map<string, THREE.DataTexture>();
/** Colour ramp for the toon light: shadow tone, a soft terminator, then full light. */
function charRamp(shadow: THREE.Color, mid: number) {
  const key = shadow.getHexString() + mid;
  let t = rampCache.get(key);
  if (t) return t;
  const N = 64;
  const data = new Uint8Array(N * 4);
  const c = new THREE.Color();
  const lit = new THREE.Color(1, 1, 1);
  const midC = new THREE.Color(mid, mid, mid).lerp(shadow, 0.15);
  for (let i = 0; i < N; i++) {
    const x = i / (N - 1);
    // terminator slightly on the shadow side of the equator, then a gentle rise to full light
    const a = THREE.MathUtils.smoothstep(x, 0.44, 0.52);
    const b = THREE.MathUtils.smoothstep(x, 0.56, 0.8);
    c.copy(shadow).lerp(midC, a).lerp(lit, b);
    data.set([c.r * 255, c.g * 255, c.b * 255, 255], i * 4);
  }
  t = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  rampCache.set(key, t);
  return t;
}

export interface CharToonOpts extends Partial<THREE.MeshToonMaterialParameters> {
  /** strength of the silhouette rim light (default 0.35; 0 turns it off) */
  rim?: number;
  /** light multiplier on the shadow side, as a hex colour read as plain 0..1 values (default a cool violet) */
  shade?: number;
  /** brightness just past the terminator (default 0.86) */
  mid?: number;
}

/** Cel-shaded character material with a coloured shadow tone and a rim light. */
export function charToon(o: CharToonOpts = {}) {
  const { rim = 0.35, shade = 0x8c94c0, mid = 0.9, ...rest } = o;
  // the ramp multiplies the light, so the shade's hex digits are used as plain (linear) multipliers
  const m = new THREE.MeshToonMaterial({ gradientMap: charRamp(new THREE.Color().setHex(shade, THREE.LinearSRGBColorSpace), mid), ...rest });
  const rimU = { value: rim };
  m.userData.rim = rimU;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.rimStrength = rimU;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <gradientmap_pars_fragment>', /* glsl */ `
        uniform sampler2D gradientMap;
        vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
          return texture2D( gradientMap, vec2( dot( normal, lightDirection ) * 0.5 + 0.5, 0.5 ) ).rgb;
        }`)
      .replace('#include <common>', '#include <common>\nuniform float rimStrength;')
      .replace('#include <opaque_fragment>', /* glsl */ `
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 rimV = normalize( vViewPosition );
          float rimF = pow( 1.0 - saturate( dot( normal, rimV ) ), 3.0 );
          float rimBack = 0.3 + 0.7 * saturate( dot( directionalLights[ 0 ].direction, -rimV ) );
          outgoingLight += rimStrength * rimF * rimBack * directionalLights[ 0 ].color * mix( diffuseColor.rgb, vec3( 1.0 ), 0.5 ) * 0.5;
        }
        #endif
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'charToon1';
  return m;
}

// ---------- painting ----------
/** Canvas position (0..1) of a unit direction on a sphere's UV layout. */
export function sphereUV(x: number, y: number, z: number): [number, number] {
  const len = Math.hypot(x, y, z) || 1;
  x /= len; y /= len; z /= len;
  let u = Math.atan2(z, -x) / (Math.PI * 2);
  if (u < 0) u += 1;
  return [u, Math.acos(THREE.MathUtils.clamp(y, -1, 1)) / Math.PI];
}

type Stops = Array<[number, string]>;

export class Painter {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  readonly rng: Rng;
  constructor(w: number, h: number, seed = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext('2d')!;
    this.w = w; this.h = h;
    this.rng = new Rng(seed);
  }

  fill(color: string) { this.g.fillStyle = color; this.g.fillRect(0, 0, this.w, this.h); return this; }

  /** Vertical gradient over the whole canvas (0 = top). */
  vgrad(stops: Stops, alpha = 1) {
    const gr = this.g.createLinearGradient(0, 0, 0, this.h);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    this.g.globalAlpha = alpha; this.g.fillStyle = gr; this.g.fillRect(0, 0, this.w, this.h); this.g.globalAlpha = 1;
    return this;
  }

  /** Horizontal gradient over the whole canvas (0 = left). */
  hgrad(stops: Stops, alpha = 1) {
    const gr = this.g.createLinearGradient(0, 0, this.w, 0);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    this.g.globalAlpha = alpha; this.g.fillStyle = gr; this.g.fillRect(0, 0, this.w, this.h); this.g.globalAlpha = 1;
    return this;
  }

  /** Soft round blotches of colour, for painterly unevenness. Wraps across the left and right edges. */
  dabs(o: { n: number; colors: string[]; r: [number, number]; alpha: [number, number]; squash?: number; y?: [number, number] }) {
    const { g, rng } = this;
    for (let i = 0; i < o.n; i++) {
      const x = rng.range(0, this.w), y = o.y ? rng.range(o.y[0] * this.h, o.y[1] * this.h) : rng.range(0, this.h);
      const r = rng.range(o.r[0], o.r[1]);
      g.globalAlpha = rng.range(o.alpha[0], o.alpha[1]);
      g.fillStyle = rng.pick(o.colors);
      for (const dx of this.wraps(x, r)) { g.beginPath(); g.ellipse(x + dx, y, r, r * (o.squash ?? 1), 0, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    return this;
  }

  /**
   * Short tapered strokes like brushed fur. `angle(x, y)` gives the stroke direction in radians
   * (0 = pointing right, PI / 2 = pointing down the canvas). Wraps across the left and right edges.
   */
  fur(o: { n: number; colors: string[]; len: [number, number]; width: [number, number]; alpha: [number, number]; angle?: (x: number, y: number) => number; jitter?: number; y?: [number, number]; x?: [number, number] }) {
    const { g, rng } = this;
    g.lineCap = 'round';
    for (let i = 0; i < o.n; i++) {
      const x = o.x ? rng.range(o.x[0] * this.w, o.x[1] * this.w) : rng.range(0, this.w);
      const y = o.y ? rng.range(o.y[0] * this.h, o.y[1] * this.h) : rng.range(0, this.h);
      const a = (o.angle ? o.angle(x / this.w, y / this.h) : Math.PI / 2) + rng.range(-1, 1) * (o.jitter ?? 0.35);
      const len = rng.range(o.len[0], o.len[1]);
      const wd = rng.range(o.width[0], o.width[1]);
      const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
      const bend = rng.range(-0.25, 0.25) * len;
      g.globalAlpha = rng.range(o.alpha[0], o.alpha[1]);
      g.fillStyle = rng.pick(o.colors);
      for (const dx of this.wraps(x, len)) {
        // a thin leaf shape: wide at the root, pointed at the tip
        const x0 = x + dx, nx = -Math.sin(a) * wd * 0.5, ny = Math.cos(a) * wd * 0.5;
        g.beginPath();
        g.moveTo(x0 + nx, y + ny);
        g.quadraticCurveTo(x0 + ex * 0.5 + nx * 0.6 - Math.sin(a) * bend, y + ey * 0.5 + ny * 0.6 + Math.cos(a) * bend, x0 + ex, y + ey);
        g.quadraticCurveTo(x0 + ex * 0.5 - nx * 0.6 - Math.sin(a) * bend, y + ey * 0.5 - ny * 0.6 + Math.cos(a) * bend, x0 - nx, y - ny);
        g.closePath();
        g.fill();
      }
    }
    g.globalAlpha = 1;
    return this;
  }

  /** Fine thin lines, for fabric weave or wood grain. `vertical` runs them down the canvas. */
  lines(o: { n: number; colors: string[]; alpha: [number, number]; width: [number, number]; vertical?: boolean; wobble?: number }) {
    const { g, rng } = this;
    for (let i = 0; i < o.n; i++) {
      g.globalAlpha = rng.range(o.alpha[0], o.alpha[1]);
      g.strokeStyle = rng.pick(o.colors);
      g.lineWidth = rng.range(o.width[0], o.width[1]);
      const p = rng.range(0, o.vertical ? this.w : this.h);
      const wob = o.wobble ?? 2;
      g.beginPath();
      const steps = 12;
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * (o.vertical ? this.h : this.w);
        const off = Math.sin(k * 0.9 + i) * wob;
        if (o.vertical) { if (k === 0) g.moveTo(p + off, t); else g.lineTo(p + off, t); }
        else { if (k === 0) g.moveTo(t, p + off); else g.lineTo(t, p + off); }
      }
      g.stroke();
    }
    g.globalAlpha = 1;
    return this;
  }

  /**
   * Draw centred on the point where a unit direction meets a sphere, with the canvas scaled so shapes keep
   * their proportions on the sphere (the UV layout stretches sideways away from the equator).
   * Sizes inside `draw` are canvas pixels as measured at the equator.
   */
  at(dir: [number, number, number], draw: (g: CanvasRenderingContext2D) => void) {
    const [u, v] = sphereUV(dir[0], dir[1], dir[2]);
    const sx = 1 / Math.max(0.2, Math.sin(v * Math.PI));
    for (const dx of this.wraps(u * this.w, 80 * sx)) {
      this.g.save();
      this.g.translate(u * this.w + dx, v * this.h);
      this.g.scale(sx, 1);
      draw(this.g);
      this.g.restore();
    }
    return this;
  }

  /** Offsets needed to draw something of radius r at x so it wraps across the left and right edges. */
  private wraps(x: number, r: number) {
    const out = [0];
    if (x - r < 0) out.push(this.w);
    if (x + r > this.w) out.push(-this.w);
    return out;
  }

  texture(o: { repeat?: [number, number]; wrap?: boolean } = {}) {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (o.wrap !== false) t.wrapS = THREE.RepeatWrapping;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    return t;
  }
}

/** Remap a geometry's UVs so its texture repeats `ru` times around and `rv` times along. */
export function repeatUV(geo: THREE.BufferGeometry, ru: number, rv: number) {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
  uv.needsUpdate = true;
  return geo;
}

/**
 * Give a BoxGeometry UVs in world units (divided by `scale`, or by `scaleV` vertically), so a tiling
 * texture keeps the same size on every face instead of stretching to fit each face.
 */
export function boxUV(geo: THREE.BoxGeometry, scale: number, scaleV = scale) {
  const { width: w, height: h, depth: d, widthSegments: ws, heightSegments: hs, depthSegments: ds } = geo.parameters;
  // faces in BoxGeometry order: +x, -x, +y, -y, +z, -z, each with its own block of vertices
  const faces: Array<[number, number, number]> = [
    [d, h, (ds + 1) * (hs + 1)], [d, h, (ds + 1) * (hs + 1)],
    [w, d, (ws + 1) * (ds + 1)], [w, d, (ws + 1) * (ds + 1)],
    [w, h, (ws + 1) * (hs + 1)], [w, h, (ws + 1) * (hs + 1)],
  ];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  let i = 0;
  for (const [fu, fv, n] of faces) {
    for (let k = 0; k < n; k++, i++) uv.setXY(i, uv.getX(i) * fu / scale, uv.getY(i) * fv / scaleV);
  }
  uv.needsUpdate = true;
  return geo;
}
