import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './math';
import type { Placement } from './Builders';

/**
 * Painted-looking cumulus clouds, in the style of a Ghibli background.
 *
 * Each cloud is a cluster of smooth puffs with a flattened base. The shader treats the cluster as one soft mass:
 *  - Normals lean hard towards the direction from the cloud's centre, so the puffs light as one shape.
 *  - Each puff's outline is worn away by a noise fixed to the cloud (so it does not swim as the camera moves),
 *    drawn with alpha-to-coverage on the multisampled render target. Silhouettes break into soft ragged edges,
 *    and the round outlines of puffs in front of other puffs break up too. Nothing is blended, so there is no
 *    sorting to get wrong.
 *  - The lit side is warm and creamy, the shade is the sky's own blue-violet, the flat base is a little darker
 *    and cooler, and the outline catches a bright rim when the sun is behind the cloud.
 *  - The final colour is capped below the bloom threshold, so sunlit tops never glow into white balls.
 * Colours are set every frame from the world's lighting via `update`.
 */
export interface CumulusOptions {
  /** how many cloud shapes to build (even ones are tall towers, odd ones long banks) */
  variants?: number;
  /** how strongly the puffs' outlines are worn away: 0 keeps round puffs, 1 is the default */
  erode?: number;
}

/**
 * GLSL for wearing a puff's outline away. `cloudNoise2(p)` is a two-octave noise in [0, 1], sized for puffs about
 * 3 to 6 units across (scale `p` for bigger puffs). `cloudWear(nz, puffNormal, toCamera, strength)` gives the
 * alpha: 1 where the puff faces the camera, eaten away by the noise towards its silhouette. Draw with
 * `alphaToCoverage` and discard below about 0.02.
 */
export const GLSL_CLOUD_WEAR = /* glsl */ `
  float cloudHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float cloudNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
    float a = mix(cloudHash(i), cloudHash(i + vec3(1.0, 0.0, 0.0)), u.x);
    float b = mix(cloudHash(i + vec3(0.0, 1.0, 0.0)), cloudHash(i + vec3(1.0, 1.0, 0.0)), u.x);
    float c = mix(cloudHash(i + vec3(0.0, 0.0, 1.0)), cloudHash(i + vec3(1.0, 0.0, 1.0)), u.x);
    float d = mix(cloudHash(i + vec3(0.0, 1.0, 1.0)), cloudHash(i + vec3(1.0, 1.0, 1.0)), u.x);
    return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
  }
  float cloudNoise2(vec3 p) { return cloudNoise(p * 0.42) * 0.62 + cloudNoise(p * 1.25 + 7.1) * 0.38; }
  float cloudWear(float nz, vec3 pn, vec3 V, float strength) {
    if (strength <= 0.0) return 1.0;
    // how far into the puff's outline this is: 0 on its silhouette, 1 facing the camera
    float facing = abs(dot(pn, V));
    return smoothstep(0.15, 0.65, facing / (0.9 * strength) + (nz - 0.5) * 1.4);
  }
`;

/**
 * Pushes a sphere's points in or out along their normals by a noise of their position, so a puff is lumpy, not
 * round. The same position always gets the same push, so the sphere's shared corners stay joined. `scale` sizes
 * the lumps (1 suits puffs about 4 units across; use about 4 / radius for others).
 */
export function lumpPuff(g: THREE.BufferGeometry, r: number, scale = 1) {
  const pos = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const qx = px * scale, qy = py * scale, qz = pz * scale;
    const k = (lump3(qx * 0.3, qy * 0.3, qz * 0.3) - 0.5) * 0.5 + (lump3(qx * 0.7 + 5.3, qy * 0.7, qz * 0.7) - 0.5) * 0.2;
    pos.setXYZ(i, px + nrm.getX(i) * r * k, py + nrm.getY(i) * r * k, pz + nrm.getZ(i) * r * k);
  }
  return g;
}

/** A comment in the fragment shader where the colour is final, before the cap and the fog (for scenes that adjust it). */
export const CUMULUS_HOOK = '/* cumulus: colour done */';

export class CumulusField {
  readonly group = new THREE.Group();
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.6, -0.5).normalize() },
    uLit: { value: new THREE.Color(1, 0.97, 0.92) },
    uShade: { value: new THREE.Color(0.55, 0.62, 0.78) },
    uRim: { value: new THREE.Color(1, 0.95, 0.85) },
    /** the sky round the cloud: it fills the shade from above and tints the thin edges */
    uSky: { value: new THREE.Color(0.6, 0.72, 0.9) },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.001 },
    uErode: { value: 1 },
    /** brightness cap: luminance above x eases towards y. Keep y under the bloom threshold (0.97). */
    uCap: { value: new THREE.Vector2(0.6, 0.86) },
  };
  readonly material: THREE.ShaderMaterial;

  constructor(rng: Rng, placements: Placement[], opts: CumulusOptions = {}) {
    this.uniforms.uErode.value = opts.erode ?? 1;
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      alphaToCoverage: true,
      vertexShader: /* glsl */ `
        attribute vec3 cloudN;
        attribute float cloudH;
        varying vec3 vN; varying vec3 vPN; varying vec3 vWorld; varying vec3 vObj; varying float vH; varying float vFogDepth;
        void main() {
          mat4 m = modelMatrix;
          vObj = position;
          #ifdef USE_INSTANCING
            m = m * instanceMatrix;
            // shift the noise per copy, so copies of one shape do not wear away the same way
            vObj += mod(instanceMatrix[3].xyz, 61.0);
          #endif
          vec4 wp = m * vec4(position, 1.0);
          mat3 nm = mat3(m);
          vPN = normalize(nm * normal);
          // mostly the cloud's overall shape, a little of each puff's own roundness
          vN = normalize(nm * normalize(normal * 0.24 + cloudN));
          vH = cloudH;
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uSky;
        uniform vec3 uFogColor; uniform float uFogDensity;
        uniform float uErode; uniform vec2 uCap;
        varying vec3 vN; varying vec3 vPN; varying vec3 vWorld; varying vec3 vObj; varying float vH; varying float vFogDepth;
        ${GLSL_CLOUD_WEAR}
        vec3 cloudCap(vec3 c) {
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          if (l <= uCap.x) return c;
          return c * ((uCap.x + (uCap.y - uCap.x) * (1.0 - exp(-(l - uCap.x) / (uCap.y - uCap.x)))) / l);
        }
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 n = normalize(vN);
          float nz = cloudNoise2(vObj);
          // the flat base keeps a cleaner edge
          float a = cloudWear(nz, normalize(vPN), V, uErode * mix(0.5, 1.0, smoothstep(0.02, 0.3, vH)));
          if (a < 0.02) discard;

          float d = dot(n, uSunDir) + (nz - 0.5) * 0.3;
          // a wide soft terminator, then a gentle second step so the light side has painted bands
          float lit = smoothstep(-0.4, 0.6, d) * 0.8 + smoothstep(0.35, 0.8, d) * 0.2;
          vec3 col = mix(uShade, uLit, lit);
          // the sky lights the shade a little from above
          col += uSky * (0.1 * (0.5 + 0.5 * n.y) * (1.0 - lit));
          // base to top: the flat underside is a little darker and cooler
          float base = 1.0 - smoothstep(0.0, 0.42, vH);
          col = mix(col, uShade * 0.86, base * 0.5);
          // the cloud's outer edge is thin, so the sky shows through it a little. This uses the cloud's overall
          // shape, not each puff's, so the puffs inside do not get light outlines.
          float edge = 1.0 - clamp(abs(dot(n, V)), 0.0, 1.0);
          col = mix(col, uSky, edge * edge * 0.3 * (1.0 - 0.6 * lit));
          // a bright rim on the cloud's outline, strongest with the sun behind it
          float rim = edge * edge;
          float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 2.0);
          col += uRim * rim * (0.1 + 0.75 * back);
          ${CUMULUS_HOOK}
          col = cloudCap(col);
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const variants = opts.variants ?? 5;
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < variants; i++) geos.push(cumulusGeometry(rng, i % 2 === 0 ? 'tower' : 'bank'));
    // chunk along z so clouds far behind or ahead are culled
    const CHUNK = 500;
    const chunks = new Map<string, Placement[]>();
    placements.forEach((pl, i) => { const k = `${i % geos.length}_${Math.floor(pl.z / CHUNK)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push(pl); });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [key, mine] of chunks) {
      const geo = geos[Number(key.split('_')[0])];
      const im = new THREE.InstancedMesh(geo, this.material, mine.length);
      mine.forEach((pl, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot);
        p.set(pl.x, pl.y, pl.z); s.setScalar(pl.scale);
        m.compose(p, q, s);
        im.setMatrixAt(i, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  /** Pull colours from the current sky and sun. Call once per frame. */
  update(sky: { midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color }; topColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color } }, fog: THREE.FogExp2, sunIntensity: number) {
    const u = this.uniforms;
    u.uSunDir.value.copy(sky.sunDir.value).normalize();
    const light = Math.min(1, sunIntensity / 2.2);
    // how bright the sky itself is: clouds at night are lit by the moon, not glowing
    const m = sky.midColor.value, skyLum = 0.2126 * m.r + 0.7152 * m.g + 0.0722 * m.b;
    const dayness = Math.min(1, Math.max(0, (skyLum - 0.01) / 0.2));
    const night = 1 - dayness;
    // at night the moon's strength is a lighting choice for the ground, so the clouds use a fixed moonlight instead
    const lightN = light * dayness + 0.6 * night;
    // lit side: creamy white tinted by the sun, dimmer when the sun is weak (rain, dusk); at night a moonlit blue-grey
    u.uLit.value.setRGB(1, 0.97, 0.9).lerp(sky.sunColor.value, 0.3).multiplyScalar(0.58 + 0.4 * light)
      .lerp(MOONLIT.copy(sky.sunColor.value).lerp(BLUE_GREY, 0.5).multiplyScalar(0.3 + 0.25 * lightN), night);
    // shade: the sky's own colour leaning blue-violet, never grey; deep blue at night
    u.uShade.value.copy(sky.midColor.value).lerp(sky.topColor.value, 0.3).lerp(VIOLET, 0.3 * dayness).multiplyScalar(0.78 + 0.12 * lightN)
      .lerp(NIGHT_SHADE, 0.35 * night);
    u.uSky.value.copy(sky.midColor.value).lerp(sky.topColor.value, 0.3);
    // the rim: the sun's colour, or the moon's at night (brighter against the dark cloud)
    u.uRim.value.copy(sky.sunColor.value).multiplyScalar((0.8 + 0.5 * night) * lightN);
    u.uFogColor.value.copy(fog.color);
    u.uFogDensity.value = fog.density * 0.32;
  }
}

const MOONLIT = new THREE.Color(), BLUE_GREY = new THREE.Color(0.55, 0.62, 0.78), VIOLET = new THREE.Color(0.6, 0.6, 0.86);
const NIGHT_SHADE = new THREE.Color(0.12, 0.15, 0.26);

function hash3(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}
/** Smooth 3D value noise in [0, 1], for shaping the puffs at build time. */
function lump3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

/** A cumulus made of merged puffs with a flat base. 'tower' is tall and heaped, 'bank' is long and low. */
export function cumulusGeometry(rng: Rng, kind: 'tower' | 'bank') {
  const puffs: THREE.BufferGeometry[] = [];
  const add = (x: number, y: number, z: number, r: number) => {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, y, z);
    puffs.push(lumpPuff(g, r));
  };
  const len = kind === 'bank' ? rng.range(26, 36) : rng.range(16, 22);
  const dep = kind === 'bank' ? rng.range(10, 14) : rng.range(11, 15);
  // base layer
  const nBase = kind === 'bank' ? 14 : 10;
  for (let i = 0; i < nBase; i++) {
    const t = (i / (nBase - 1)) * 2 - 1;
    add(t * len * 0.5 + rng.range(-2, 2), rng.range(0.5, 2.5), rng.range(-dep, dep) * 0.35, rng.range(3.8, 5.8) * (1 - Math.abs(t) * 0.3));
  }
  // heaped middle
  const nMid = kind === 'bank' ? 10 : 12;
  for (let i = 0; i < nMid; i++) {
    const t = rng.range(-1, 1) * (kind === 'bank' ? 0.8 : 0.6);
    const h = (1 - Math.abs(t)) * (kind === 'bank' ? 6 : 10);
    add(t * len * 0.5, 3 + rng.range(0, h), rng.range(-dep, dep) * 0.25, rng.range(4, 6.5) * (1 - Math.abs(t) * 0.35));
  }
  // cauliflower top
  const nTop = kind === 'bank' ? 4 : 8;
  for (let i = 0; i < nTop; i++) {
    const a = rng.range(0, Math.PI * 2);
    add(Math.cos(a) * rng.range(0, len * 0.18), (kind === 'bank' ? 8 : 13) + rng.range(-1.5, 3.5), Math.sin(a) * rng.range(0, dep * 0.2), rng.range(3.2, 5.2));
  }
  const g = mergeGeometries(puffs.map((p) => { p.deleteAttribute('uv'); return p; }), false)!;
  // flatten the base, record height, and a centre-out normal for volume shading
  const pos = g.attributes.position as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  const baseY = 0.8;
  const cn = new Float32Array(pos.count * 3), ch = new Float32Array(pos.count);
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i);
    if (y < baseY) { y = baseY - (baseY - y) * 0.12; pos.setY(i, y); nrm.setXYZ(i, nrm.getX(i) * 0.3, -1, nrm.getZ(i) * 0.3); }
    const v = new THREE.Vector3((pos.getX(i) - ctr.x) / (size.x * 0.5), (y - ctr.y) / (size.y * 0.5) + 0.3, (pos.getZ(i) - ctr.z) / (size.z * 0.5)).normalize();
    cn.set([v.x, v.y, v.z], i * 3);
    ch[i] = (y - baseY) / Math.max(1, box.max.y - baseY);
  }
  g.setAttribute('cloudN', new THREE.BufferAttribute(cn, 3));
  g.setAttribute('cloudH', new THREE.BufferAttribute(ch, 1));
  g.computeBoundingSphere();
  return g;
}
