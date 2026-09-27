import * as THREE from 'three';
import type { HeightGrid } from './HeightGrid';

/** What a world returns for one point of the grass map. Colour is linear RGB in 0..1. */
export interface GrassSample { r: number; g: number; b: number; density: number; height: number }

export interface GrassOptions {
  heights: HeightGrid;
  /** area covered by the grass maps (world units) */
  xMin: number; xMax: number; zMin: number; zMax: number;
  /** map resolution in world units per texel (default 1) */
  res?: number;
  /** optional per-row limit [x0, x1] so the build only samples near the track */
  rowRange?: (z: number) => [number, number] | null;
  /** colour at the blade root, density 0..1 and a height multiplier (1 = normal, up to 2) */
  sample: (x: number, z: number, out: GrassSample) => void;
  /** world units per tile (default 16) */
  tile?: number;
  /** draw distance (default 100) */
  radius?: number;
  /** blades per square unit at full density, close to the camera (default 28) */
  bladesPerM2?: number;
  /** blade height range before the map multiplier (default 0.45 .. 1.0) */
  bladeHeight?: [number, number];
  /** blade width at the root (default 0.1) */
  bladeWidth?: number;
  /** wind direction (xz) times strength */
  wind?: [number, number];
}

const GRASS_COMMON = /* glsl */ `
uniform sampler2D uHeightMap; uniform vec4 uHeightInfo;
uniform sampler2D uColorMap; uniform sampler2D uParamMap; uniform vec4 uMapInfo;
uniform float uTime; uniform vec2 uWind; uniform float uTile; uniform float uCount;
uniform vec4 uBlade; uniform vec2 uLod;
varying float vGrassTip;
uint gHash(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
float gRand(inout uint s) { s = gHash(s); return float(s & 0x00ffffffu) / 16777216.0; }
float gHashF(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHashF(i), gHashF(i + vec2(1.0, 0.0)), u.x), mix(gHashF(i + vec2(0.0, 1.0)), gHashF(i + vec2(1.0, 1.0)), u.x), u.y);
}
// same two-triangle interpolation as HeightGrid.sample, so blades sit exactly on the terrain mesh
float gGround(vec2 p) {
  ivec2 sz = textureSize(uHeightMap, 0);
  vec2 f = clamp((p - uHeightInfo.xy) / uHeightInfo.z, vec2(0.0), vec2(sz - 1) - 0.001);
  ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  float h00 = texelFetch(uHeightMap, i, 0).r, h10 = texelFetch(uHeightMap, i + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeightMap, i + ivec2(0, 1), 0).r, h11 = texelFetch(uHeightMap, i + ivec2(1, 1), 0).r;
  if (t.x + t.y <= 1.0) return h00 + (h10 - h00) * t.x + (h01 - h00) * t.y;
  return h11 + (h01 - h11) * (1.0 - t.x) + (h10 - h11) * (1.0 - t.y);
}
`;

const GRASS_VERTEX = /* glsl */ `
  // ---- one grass blade, placed from the instance id ----
  vec3 tileOrigin = modelMatrix[3].xyz;
  ivec2 tileIx = ivec2(floor(tileOrigin.xz / uTile + 0.5));
  uint gs = gHash(uint(gl_InstanceID) ^ gHash(uint(tileIx.x + 65536) * 73856093u ^ uint(tileIx.y + 65536) * 19349663u));
  float gRank = float(gl_InstanceID) / uCount;
  vec2 gRoot = tileOrigin.xz + vec2(gRand(gs), gRand(gs)) * uTile;
  vec2 gUv = (gRoot - uMapInfo.xy) * uMapInfo.zw;
  vec4 gCol = texture(uColorMap, gUv);
  vec4 gPar = texture(uParamMap, gUv);
  float gDist = distance(gRoot, cameraPosition.xz);
  // thin out with distance (blades are drawn in random order, so the first N are an even sample)
  float gKeep = gCol.a * mix(1.0, uLod.y, smoothstep(uLod.x, uBlade.w * 0.6, gDist));
  float gAlive = 1.0 - smoothstep(gKeep - 0.05, gKeep, gRank);
  gAlive *= 1.0 - smoothstep(uBlade.w * 0.78, uBlade.w, gDist);
  // mid-scale patches: some areas lusher and taller, some thinner and paler
  float gPatch = gNoise(gRoot * 0.11 + 3.7);
  // small-scale tufts: neighbouring blades share a height, so the field reads as clumps rather than an even carpet
  float gTuft = gNoise(gRoot * 0.9 + 11.0) * 0.65 + gNoise(gRoot * 2.3 - 4.0) * 0.35;
  float gH = mix(uBlade.x, uBlade.y, gRand(gs)) * gPar.r * 2.0 * gAlive * mix(0.5, 1.25, gTuft) * mix(0.8, 1.2, gPatch) * mix(0.35, 1.0, smoothstep(0.0, 0.6, gCol.a));
  float gAng = gRand(gs) * 6.2831853;
  vec2 gSide = vec2(cos(gAng), sin(gAng));
  vec2 gFace = vec2(-gSide.y, gSide.x);
  // wind: slow gusts roll across the field; each blade also sways on its own
  vec2 gWindDir = uWind / max(length(uWind), 1e-4);
  vec2 gWp = gRoot * 0.05 - gWindDir * uTime * 0.16;
  float gGust = smoothstep(0.3, 0.85, gNoise(gWp) * 0.7 + gNoise(gWp * 2.7 + 7.1) * 0.3);
  float gSway = sin(uTime * 2.3 + gRoot.x * 0.7 + gRoot.y * 0.5 + gRand(gs) * 6.28) * 0.09;
  vec2 gBend = gFace * (gRand(gs) * 0.55 - 0.12) + uWind * (0.3 + gGust * 1.1) + gWindDir * gSway;
  float gT = position.y;
  float gW = uBlade.z * mix(0.65, 1.3, gRand(gs)) * (1.0 + gDist * 0.028);
  float gBL = min(dot(gBend, gBend), 1.0);
  vec3 gLocal;
  gLocal.xz = gSide * position.x * gW * pow(1.0 - gT, 0.55) + gBend * gH * gT * gT;
  gLocal.y = gH * gT * (1.0 - 0.32 * gBL * gT);
  vec3 bladeLocal = vec3(gRoot.x, gGround(gRoot) - 0.04, gRoot.y) + gLocal - tileOrigin;
  vec3 bladeNormal = normalize(vec3(0.0, 1.0, 0.0) + vec3(gSide.x, 0.0, gSide.y) * position.x * 1.1 + vec3(gBend.x, 0.0, gBend.y) * 0.6 * gT);
  // colour: deep at the root, a little lighter at the tip; each blade leans warm or cool
  float gV = mix(0.82, 1.1, gRand(gs)) * mix(0.86, 1.08, gPatch) * mix(0.9, 1.05, gTuft);
  vec3 gHue = mix(vec3(0.9, 1.0, 1.08), vec3(1.08, 1.03, 0.86), gRand(gs));
  vec3 gTipC = gCol.rgb * vec3(1.08, 1.08, 0.94);
  vec3 gC = mix(gCol.rgb * 0.42, gTipC, smoothstep(0.0, 1.0, gT)) * gV * gHue;
  gC += gGust * gT * gT * vec3(0.04, 0.05, 0.03);
  vColor = vec4(gC, 1.0);
  vGrassTip = gT;
`;

/**
 * Dense wind-blown grass drawn around the camera.
 * Blades are generated on the GPU from the instance id inside a grid of tiles that follows the camera,
 * so the only build cost is filling a colour/density map. Uses Lambert lighting, so it receives shadows,
 * fog and point lights like everything else.
 */
export class GrassField {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial;
  readonly uniforms: Record<string, THREE.IUniform>;
  private tiles: THREE.Mesh[] = [];
  private geos: THREE.InstancedBufferGeometry[] = [];
  private coverage: Float32Array;
  private covNx: number;
  private covNz: number;
  private o: Required<Omit<GrassOptions, 'rowRange'>> & Pick<GrassOptions, 'rowRange'>;
  private maxCount: number;
  private reach: number;
  private textures: THREE.Texture[] = [];

  constructor(opts: GrassOptions) {
    this.o = { res: 1, tile: 16, radius: 100, bladesPerM2: 28, bladeHeight: [0.45, 1.0], bladeWidth: 0.1, wind: [0.35, -0.12], ...opts };
    const o = this.o;
    const res = o.res;
    const W = Math.ceil((o.xMax - o.xMin) / res), H = Math.ceil((o.zMax - o.zMin) / res);
    // colour (sRGB bytes) + density in alpha; params: height multiplier in red
    const col = new Uint8Array(W * H * 4), par = new Uint8Array(W * H * 4);
    const s: GrassSample = { r: 0, g: 0, b: 0, density: 0, height: 1 };
    const tmp = new THREE.Color();
    for (let j = 0; j < H; j++) {
      const z = o.zMin + (j + 0.5) * res;
      const range = o.rowRange ? o.rowRange(z) : [o.xMin, o.xMax];
      if (!range) continue;
      const i0 = Math.max(0, Math.floor((range[0] - o.xMin) / res)), i1 = Math.min(W - 1, Math.ceil((range[1] - o.xMin) / res));
      for (let i = i0; i <= i1; i++) {
        const x = o.xMin + (i + 0.5) * res;
        s.density = 0; s.height = 1;
        o.sample(x, z, s);
        if (s.density <= 0) continue;
        tmp.setRGB(s.r, s.g, s.b, THREE.LinearSRGBColorSpace);
        const k = (j * W + i) * 4;
        // store sRGB-encoded so dark greens keep their precision; the GPU decodes on sampling
        col[k] = Math.round(THREE.MathUtils.clamp(srgb(tmp.r), 0, 1) * 255);
        col[k + 1] = Math.round(THREE.MathUtils.clamp(srgb(tmp.g), 0, 1) * 255);
        col[k + 2] = Math.round(THREE.MathUtils.clamp(srgb(tmp.b), 0, 1) * 255);
        col[k + 3] = Math.round(THREE.MathUtils.clamp(s.density, 0, 1) * 255);
        par[k] = Math.round(THREE.MathUtils.clamp(s.height / 2, 0, 1) * 255);
      }
    }
    // spread colour into empty neighbours so linear filtering at the edge of a patch does not pull in black
    bleedColour(col, W, H);
    const colorTex = new THREE.DataTexture(col, W, H, THREE.RGBAFormat);
    colorTex.colorSpace = THREE.SRGBColorSpace;
    colorTex.magFilter = THREE.LinearFilter; colorTex.minFilter = THREE.LinearFilter;
    colorTex.needsUpdate = true;
    const paramTex = new THREE.DataTexture(par, W, H, THREE.RGBAFormat);
    paramTex.magFilter = THREE.LinearFilter; paramTex.minFilter = THREE.LinearFilter;
    paramTex.needsUpdate = true;
    const hg = o.heights;
    const heightTex = hg.texture();
    this.textures.push(colorTex, paramTex);

    // per-tile maximum density, so empty tiles are skipped and sparse tiles draw fewer blades
    const T = o.tile;
    this.covNx = Math.ceil((o.xMax - o.xMin) / T) + 1;
    this.covNz = Math.ceil((o.zMax - o.zMin) / T) + 1;
    this.coverage = new Float32Array(this.covNx * this.covNz);
    for (let j = 0; j < H; j++) {
      const tz = Math.floor((o.zMin + (j + 0.5) * res - this.tz0()) / T);
      for (let i = 0; i < W; i++) {
        const d = col[(j * W + i) * 4 + 3] / 255;
        if (d <= 0) continue;
        const tx = Math.floor((o.xMin + (i + 0.5) * res - this.tx0()) / T);
        const k = tz * this.covNx + tx;
        if (d > this.coverage[k]) this.coverage[k] = d;
      }
    }

    this.maxCount = Math.round(o.bladesPerM2 * T * T);
    this.uniforms = {
      uHeightMap: { value: heightTex }, uHeightInfo: { value: new THREE.Vector4(hg.xMin, hg.zMin, hg.res, 0) },
      uColorMap: { value: colorTex }, uParamMap: { value: paramTex },
      uMapInfo: { value: new THREE.Vector4(o.xMin, o.zMin, 1 / (W * res), 1 / (H * res)) },
      uTime: { value: 0 }, uWind: { value: new THREE.Vector2(o.wind[0], o.wind[1]) }, uTile: { value: T }, uCount: { value: this.maxCount },
      uBlade: { value: new THREE.Vector4(o.bladeHeight[0], o.bladeHeight[1], o.bladeWidth, o.radius) },
      uLod: { value: new THREE.Vector2(16, 0.1) },
    };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${GRASS_COMMON}`)
        .replace('#include <color_vertex>', GRASS_VERTEX)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = bladeNormal;')
        .replace('#include <begin_vertex>', 'vec3 transformed = bladeLocal;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGrassTip;')
        // both faces use the same (mostly upward) normal so the field shades like one soft surface
        .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
            // sunlight glowing through the blades when looking towards the sun
            float gBack = pow(clamp(dot(normalize(-vViewPosition), directionalLights[0].direction), 0.0, 1.0), 3.0);
            reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * gBack * vGrassTip * vGrassTip * 0.35;
          #endif`);
    };
    material.customProgramCacheKey = () => 'grass-v1';
    this.material = material;

    // one blade: a tapered strip with a few segments and a pointed tip; distant tiles use a two-segment blade
    const blade = (SEG: number) => {
      const pos: number[] = [], idx: number[] = [];
      for (let l = 0; l < SEG; l++) { const y = l / SEG; pos.push(-0.5, y, 0, 0.5, y, 0); }
      pos.push(0, 1, 0);
      for (let l = 0; l < SEG - 1; l++) { const a = l * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      idx.push((SEG - 1) * 2, (SEG - 1) * 2 + 1, SEG * 2);
      const n = pos.length / 3;
      return {
        position: new THREE.Float32BufferAttribute(pos, 3),
        normal: new THREE.Float32BufferAttribute(new Array(n * 3).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3),
        color: new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3),
        index: new THREE.Uint16BufferAttribute(idx, 1),
      };
    };
    const lods = [blade(4), blade(2)];

    this.reach = Math.ceil(o.radius / T);
    const n = this.reach * 2 + 1;
    for (let k = 0; k < n * n; k++) {
      for (let l = 0; l < 2; l++) {
        const b = lods[l];
        const g = new THREE.InstancedBufferGeometry();
        g.setIndex(b.index);
        g.setAttribute('position', b.position); g.setAttribute('normal', b.normal); g.setAttribute('color', b.color);
        g.instanceCount = 0;
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(T / 2, 0, T / 2), T * 0.71 + 8);
        g.boundingBox = new THREE.Box3(new THREE.Vector3(0, -8, 0), new THREE.Vector3(T, 8, T));
        const m = new THREE.Mesh(g, material);
        m.receiveShadow = true;
        m.castShadow = false;
        m.visible = false;
        this.geos.push(g);
        this.tiles.push(m);
        this.group.add(m);
      }
    }
  }

  private tx0() { return Math.floor(this.o.xMin / this.o.tile) * this.o.tile; }
  private tz0() { return Math.floor(this.o.zMin / this.o.tile) * this.o.tile; }

  /** Moves the tile grid to the camera and picks how many blades each tile draws. */
  update(time: number, camera: THREE.Camera) {
    this.uniforms.uTime.value = time;
    const o = this.o, T = o.tile;
    const cx = Math.floor(camera.position.x / T), cz = Math.floor(camera.position.z / T);
    const lod = this.uniforms.uLod.value as THREE.Vector2;
    const tx0 = this.tx0(), tz0 = this.tz0();
    let k = 0;
    for (let j = -this.reach; j <= this.reach; j++) {
      for (let i = -this.reach; i <= this.reach; i++, k += 2) {
        const x0 = (cx + i) * T, z0 = (cz + j) * T;
        const ci = Math.round((x0 - tx0) / T), cj = Math.round((z0 - tz0) / T);
        const cov = ci >= 0 && cj >= 0 && ci < this.covNx && cj < this.covNz ? this.coverage[cj * this.covNx + ci] : 0;
        const dx = Math.max(x0 - camera.position.x, 0, camera.position.x - (x0 + T));
        const dz = Math.max(z0 - camera.position.z, 0, camera.position.z - (z0 + T));
        const d = Math.hypot(dx, dz);
        const near = d < 26 ? 0 : 1;
        this.tiles[k + 1 - near].visible = false;
        const m = this.tiles[k + near], g = this.geos[k + near];
        if (cov <= 0 || d > o.radius) { m.visible = false; continue; }
        const t = THREE.MathUtils.smoothstep(d, lod.x, o.radius * 0.6);
        const keep = cov * (1 + (lod.y - 1) * t);
        g.instanceCount = Math.min(this.maxCount, Math.ceil(this.maxCount * (keep + 0.05)));
        m.position.set(x0, o.heights.sample(x0 + T / 2, z0 + T / 2), z0);
        m.visible = true;
      }
    }
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const t of this.textures) t.dispose();
    this.material.dispose();
  }
}

function srgb(c: number) { return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

/** Copies colour into empty texels from filled neighbours (a few passes), leaving alpha alone. */
function bleedColour(px: Uint8Array, W: number, H: number) {
  const filled = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;
  for (let pass = 0; pass < 3; pass++) {
    const next = filled.slice();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (filled[k]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const q = jj * W + ii;
        if (!filled[q]) continue;
        r += px[q * 4]; g += px[q * 4 + 1]; b += px[q * 4 + 2]; n++;
      }
      if (n) { px[k * 4] = r / n; px[k * 4 + 1] = g / n; px[k * 4 + 2] = b / n; next[k] = 1; }
    }
    filled.set(next);
  }
}
