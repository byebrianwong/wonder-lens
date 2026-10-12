import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './math';
import type { Placement } from './Builders';

/**
 * Painterly "fluffy" trees.
 *
 * A canopy is a handful of blobs. Each blob is filled with small square cards that always face the camera
 * and carry a leaf-cluster texture. Every card's normal points away from its blob (and the canopy centre),
 * so light falls across the canopy as if it were one soft rounded shape, while the card edges give it a
 * leafy outline. Cards turn towards the light when drawing shadows, so the shadows are solid and leafy too.
 */

export type FluffyShape = 'round' | 'broad' | 'conifer' | 'poplar' | 'bush';

export interface FluffyStyle {
  shape: FluffyShape;
  trunk: THREE.ColorRepresentation;
  leaves: THREE.ColorRepresentation[];
  /** overall size multiplier (default 1) */
  size?: number;
  /** card density multiplier (default 1) */
  density?: number;
  /** 0..1: snow lying on the upward-facing leaf cards (default none) */
  snow?: number;
}

export interface Blob {
  c: THREE.Vector3;
  r: THREE.Vector3;
  /**
   * The radii that set how many cards the blob gets (default `r`). Every card draws from the caller's random
   * numbers, which go on to place the rest of the scene, so a blob whose size changed keeps the card count of
   * its old size here and nothing else in the scene moves.
   */
  cardR?: THREE.Vector3;
}

let leafTexCache: THREE.Texture | null = null;
/**
 * A rounded clump of leaves on a transparent background, light grey so it tints to any colour.
 *
 * The clump stays well inside the square, with leaf tips poking out round its edge, so a card never shows a
 * straight edge. Transparent pixels carry the grey of the outer leaves instead of black: the smaller mipmaps
 * average edge pixels with their neighbours, and black there drew a dark outline round every distant card.
 */
export function leafClusterTexture() {
  if (leafTexCache) return leafTexCache;
  const S = 256;
  const rng = new Rng(4242);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const leaf = (x: number, y: number, len: number, wid: number, rot: number, shade: number) => {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -wid, len / 2, 0);
    g.quadraticCurveTo(0, wid, -len / 2, 0);
    g.closePath();
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.fill();
    g.restore();
  };
  // the clump's outline: a few rounded lobes, so it is not a plain disc
  const lobes = [0, 1, 2, 3, 4].map(() => ({ a: rng.range(0, Math.PI * 2), k: rng.range(0.1, 0.2) }));
  const reach = (a: number) => 1 + lobes.reduce((s, l) => s + l.k * Math.max(0, Math.cos(a - l.a)) ** 3, 0) - 0.08;
  // a solid core, so the clump has no holes in its middle at a distance
  g.fillStyle = 'rgb(168,168,168)';
  g.beginPath();
  for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2, r = 66 * reach(a); g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
  g.fill();
  // darker leaves underneath, lighter on top; each pass is a little smaller than the one below it
  for (let pass = 0; pass < 3; pass++) {
    const n = [36, 32, 24][pass];
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = Math.sqrt(rng.next()) * [80, 68, 54][pass] * reach(a);
      const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d;
      const len = rng.range(38, 58), wid = len * rng.range(0.34, 0.46);
      const shade = Math.round([176, 208, 238][pass] + rng.range(-10, 10));
      // outer leaves point outwards; the ones on top lie every which way, so the clump does not read as a star
      leaf(x, y, len, wid, d > 50 ? a + rng.range(-0.7, 0.7) : rng.range(0, Math.PI * 2), shade);
    }
  }
  // leaf tips round the rim, mostly pointing outwards, so the outline is ragged; all of them end inside the square
  for (let i = 0; i < 46; i++) {
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(28, 46), d = Math.min(118 - len / 2, rng.range(80, 98) * reach(a) - len / 2);
    leaf(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, len, len * rng.range(0.32, 0.44), a + rng.range(-0.6, 0.6), Math.round(196 + rng.range(-16, 16)));
  }
  // copy into a data texture, giving the transparent pixels the outer leaves' grey
  const src = g.getImageData(0, 0, S, S).data;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4, o = ((S - 1 - y) * S + x) * 4; // flipped so v = 1 is the top, as with a canvas texture
      const a = src[i + 3];
      for (let ch = 0; ch < 3; ch++) data[o + ch] = a ? src[i + ch] : 190;
      data[o + 3] = a;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  leafTexCache = t;
  return t;
}

/** Smooth-ish three-tone ramp: shadowed side stays fairly light, like painted foliage. */
let rampCache: THREE.DataTexture | null = null;
function foliageRamp() {
  if (rampCache) return rampCache;
  const v = [118, 118, 160, 208, 238, 255, 255, 255];
  const data = new Uint8Array(v.length * 4);
  v.forEach((x, i) => data.set([x, x, x, 255], i * 4));
  rampCache = new THREE.DataTexture(data, v.length, 1, THREE.RGBAFormat);
  rampCache.minFilter = rampCache.magFilter = THREE.LinearFilter;
  rampCache.needsUpdate = true;
  return rampCache;
}

const CARD_VERTEX = /* glsl */ `
  #ifdef USE_INSTANCING
    float cardScale = length(instanceMatrix[0].xyz);
  #else
    float cardScale = length(modelMatrix[0].xyz);
  #endif
  // expand the card in view space so it always faces whoever is looking (camera or light)
  mvPosition.xy += cardCorner * cardScale;
  gl_Position = projectionMatrix * mvPosition;
`;

/**
 * Painted cards: where this corner sits on the card on screen, -1..1 across, for the clump shading below.
 * Cards also sway a little in the wind, each card by a small part of its own size, out of step with its
 * neighbours. `foliageTime` drives it; a world that never sets it gets still leaves.
 */
const CARD_VERTEX_PAINTED = /* glsl */ `
  vCardOff = cardCorner * (1.41421 / max(length(cardCorner), 1e-5));
  #ifdef USE_INSTANCING
    vec3 swayAt = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vec3 swayAt = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
  float swayPhase = dot(swayAt, vec3(0.31, 0.17, 0.23));
  vec2 sway = vec2(sin(foliageTime * 1.3 + swayPhase) + 0.5 * sin(foliageTime * 2.9 + swayPhase * 1.7), 0.4 * sin(foliageTime * 1.7 + swayPhase * 1.3));
  mvPosition.xy += sway * length(cardCorner) * cardScale * 0.05;
  gl_Position = projectionMatrix * mvPosition;
`;

/** Seconds of wind for the leaf cards' sway. A world sets it each frame; left at 0 the leaves stay still. */
export const foliageTime = { value: 0 };

/**
 * Painted cards, before lighting. Each card is shaded as a small rounded clump: its normal leans towards
 * its own edge, so the top of a clump catches the light and its underside falls into shade.
 * The card's own normal (the rounded leaf mass it belongs to) is kept for the rim below.
 */
const CARD_NORMAL_PAINTED = /* glsl */ `
  #include <normal_fragment_maps>
  paintedMass = normal;
  normal = normalize( normal + vec3( vCardOff * 0.55, 0.0 ) );
`;

/**
 * Painted cards, lighting. Each light also draws a light rim along the edge of every leaf mass on the side
 * it shines from, strongest when the light is behind the tree (the moon behind a wood at night). Where a
 * mass turns away from the viewer it also picks up more of the sky's light. Both separate one mass from
 * the ones behind it. `paintedMass` is the card's own normal, before the clump shading bends it.
 */
const CARD_LIGHT_PAINTED = /* glsl */ `
  #include <lights_toon_pars_fragment>
  vec3 paintedMass;
  void RE_Direct_Painted( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
    RE_Direct_Toon( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
    float edge = smoothstep( 0.45, 0.95, 1.0 - abs( dot( paintedMass, geometryViewDir ) ) );
    float facing = smoothstep( -0.25, 0.35, dot( paintedMass, directLight.direction ) );
    float behind = max( dot( directLight.direction, -geometryViewDir ), 0.0 );
    reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseColor ) * edge * facing * ( 0.3 + 1.2 * behind );
  }
  #undef RE_Direct
  #define RE_Direct RE_Direct_Painted
`;

const CARD_RIM_PAINTED = /* glsl */ `
  #include <lights_fragment_end>
  reflectedLight.indirectDiffuse *= 1.0 + 0.6 * smoothstep( 0.45, 0.95, 1.0 - abs( dot( paintedMass, normalize( vViewPosition ) ) ) );
`;

/** Snow on a card: white, keeping the leaf texture's light and dark so the clumps still read. */
const SNOW_FRAGMENT = /* glsl */ `
  #include <color_fragment>
  #ifdef USE_MAP
    float snowShade = clamp((sampledDiffuseColor.g - 0.45) / 0.42, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 1.0) * (0.78 + 0.22 * snowShade), vSnow);
  #endif
`;

/** `painted` adds the clump shading and rim light (lit leaf materials only, not depth or flowers). */
function patchCards(material: THREE.Material, key: string, snow = false, painted = false) {
  material.onBeforeCompile = (shader) => {
    const vary = painted ? '\nvarying vec2 vCardOff;' : '';
    if (painted) shader.uniforms.foliageTime = foliageTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec2 cardCorner;${vary}${painted ? '\nuniform float foliageTime;' : ''}${snow ? '\nattribute float cardSnow; varying float vSnow;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${CARD_VERTEX}${painted ? CARD_VERTEX_PAINTED : ''}${snow ? '\nvSnow = cardSnow;' : ''}`);
    if (snow || painted) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>${vary}${snow ? '\nvarying float vSnow;' : ''}`);
    }
    if (snow) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', SNOW_FRAGMENT);
    if (painted) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <lights_toon_pars_fragment>', CARD_LIGHT_PAINTED)
        .replace('#include <normal_fragment_maps>', CARD_NORMAL_PAINTED)
        .replace('#include <lights_fragment_end>', CARD_RIM_PAINTED);
    }
  };
  material.customProgramCacheKey = () => key;
}

/**
 * Material for camera-facing leaf cards. With `snow`, cards carrying a `cardSnow` weight turn white.
 * Edges use alpha to coverage, so with the scene's multisampling a card's outline is smooth rather than
 * a stair of whole pixels.
 */
export function foliageMaterial(snow = false) {
  const tex = leafClusterTexture();
  const mat = new THREE.MeshToonMaterial({ map: tex, alphaTest: 0.5, alphaToCoverage: true, vertexColors: true, gradientMap: foliageRamp(), side: THREE.DoubleSide });
  patchCards(mat, snow ? 'foliage-cards-snow-v2' : 'foliage-cards-v2', snow, true);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  patchCards(depth, 'foliage-cards-depth-v1');
  return { material: mat, depth };
}

/**
 * A blob's lobes: a few directions in which it bulges, so its outline is a cluster of rounded clumps
 * rather than one smooth ellipse. Seeded from the blob itself, so it draws nothing from the caller's
 * random numbers (those also place the rest of a scene).
 */
function blobLobes(b: Blob) {
  const seed = Math.abs(Math.round(b.c.x * 7919 + b.c.y * 104729 + b.c.z * 1299709 + b.r.x * 15485863)) % 2147483647;
  const lr = new Rng(seed + 1);
  const n = lr.int(4, 6);
  return Array.from({ length: n }, () => ({
    dir: new THREE.Vector3(lr.range(-1, 1), lr.range(-0.3, 1), lr.range(-1, 1)).normalize(),
    k: lr.range(0.6, 1),
  }));
}

/**
 * Cards spread through a set of blobs. Returns a geometry whose vertices sit at card centres and carry
 * cardCorner offsets; the shader expands them. Cards deeper inside a blob are darker.
 *
 * Each blob bulges into a few lobes. A card on a lobe takes part of its normal from the lobe's own centre,
 * so every lobe is lit like a small sphere: bright on top, in shade underneath.
 */
export function canopyGeometry(blobs: Blob[], rng: Rng, opts: { density?: number; cardScale?: number; center?: THREE.Vector3; snow?: number; lobes?: number } = {}) {
  const lobed = opts.lobes ?? 1;
  const center = opts.center ?? blobs.reduce((a, b) => a.add(b.c), new THREE.Vector3()).multiplyScalar(1 / blobs.length);
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], uv: number[] = [], corner: number[] = [], idx: number[] = [], snow: number[] = [];
  const d = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), n2 = new THREE.Vector3();
  let v = 0;
  const lc = new THREE.Vector3(), ln = new THREE.Vector3();
  for (const b of blobs) {
    const rAvg = (b.r.x + b.r.y + b.r.z) / 3;
    const lobes = blobLobes(b);
    const cr = b.cardR ?? b.r, cAvg = (cr.x + cr.y + cr.z) / 3;
    const count = Math.max(6, Math.round(13 * cAvg * cAvg * (opts.density ?? 1)));
    for (let i = 0; i < count; i++) {
      // random direction, biased towards the surface so the silhouette is full
      d.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
      if (d.lengthSq() > 1 || d.lengthSq() < 1e-4) { i--; continue; }
      d.normalize();
      const depth = rng.chance(0.72) ? rng.range(0.72, 1.0) : rng.range(0.25, 0.72);
      // the lobes bulging this way push the card out
      let bulge = 0, top: (typeof lobes)[number] | null = null, topW = 0;
      for (const l of lobes) {
        const w = l.k * Math.max(0, d.dot(l.dir)) ** 4;
        bulge += w;
        if (w > topW) { topW = w; top = l; }
      }
      p.set(d.x * b.r.x, d.y * b.r.y, d.z * b.r.z).multiplyScalar(depth * (1 + lobed * (0.3 * Math.min(bulge, 1) - 0.1))).add(b.c);
      n.copy(d).multiplyScalar(0.62);
      n2.copy(p).sub(center).normalize().multiplyScalar(0.38);
      n.add(n2).add(new THREE.Vector3(0, 0.12, 0)).normalize();
      if (top) {
        lc.set(top.dir.x * b.r.x, top.dir.y * b.r.y, top.dir.z * b.r.z).multiplyScalar(0.62).add(b.c);
        ln.copy(p).sub(lc).normalize();
        n.lerp(ln, 0.55 * lobed * Math.min(topW * 1.4, 1)).normalize();
      }
      const size = (0.36 * rAvg + 0.2) * (opts.cardScale ?? 1) * rng.range(0.75, 1.25);
      // darker where this mass meets or sinks into another one, so the masses read apart, and a little
      // darker underneath
      let crease = 0;
      for (const o of blobs) {
        if (o === b) continue;
        const q = Math.hypot((p.x - o.c.x) / o.r.x, (p.y - o.c.y) / o.r.y, (p.z - o.c.z) / o.r.z);
        crease = Math.max(crease, THREE.MathUtils.smoothstep(1.3 - q, 0, 0.5));
      }
      const under = THREE.MathUtils.smoothstep(-d.y, 0.1, 0.9);
      const shade = (0.74 + 0.26 * depth) * (1 - 0.22 * crease) * (1 - 0.14 * under) * rng.range(0.94, 1.05);
      const rot = rng.range(0, Math.PI * 2), cs = Math.cos(rot), sn = Math.sin(rot);
      // snow settles on the outer cards that face the sky
      const sw = opts.snow ? THREE.MathUtils.smoothstep(n.y, 0.2, 0.7) * THREE.MathUtils.smoothstep(depth, 0.55, 0.85) * opts.snow * rng.range(0.75, 1) : 0;
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        snow.push(sw);
        pos.push(p.x, p.y, p.z);
        nrm.push(n.x, n.y, n.z);
        col.push(shade, shade, shade);
        uv.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
        corner.push((cx * cs - cy * sn) * size, (cx * sn + cy * cs) * size);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('cardCorner', new THREE.Float32BufferAttribute(corner, 2));
  if (opts.snow) g.setAttribute('cardSnow', new THREE.Float32BufferAttribute(snow, 1));
  g.setIndex(idx);
  // cards extend past their centres; pad the bounds so culling does not clip them
  g.computeBoundingSphere();
  g.boundingSphere!.radius += 2;
  return g;
}

/** A tapered limb from a to b as a cylinder. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Blob layout, trunk and branches for one tree of a given shape (size ~1 = a garden tree). */
export function treeLayout(shape: FluffyShape, rng: Rng, size = 1) {
  const blobs: Blob[] = [];
  const wood: THREE.BufferGeometry[] = [];
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(size);
  const R = (x: number, y = x, z = x) => new THREE.Vector3(x, y, z).multiplyScalar(size);
  const base = V(0, 0, 0);
  if (shape === 'round' || shape === 'broad') {
    const broad = shape === 'broad';
    const trunkH = (broad ? 2.4 : 2.0) * rng.range(0.9, 1.15);
    const crown = V(0, trunkH + (broad ? 1.9 : 1.7), 0);
    // a smaller middle mass with the side masses standing clear of it, so the crown reads as several
    // rounded masses with gaps between them; the crown's overall reach is the same as before. Each blob
    // keeps the card count of its earlier size (`cardR`), so the random numbers after it are unchanged.
    const mainR = broad ? R(2.0, 1.5, 2.0) : R(1.5, 1.4, 1.5);
    blobs.push({ c: crown, r: mainR, cardR: broad ? R(2.5, 1.7, 2.5) : R(1.8, 1.6, 1.8) });
    const n = broad ? rng.int(5, 7) : rng.int(3, 5);
    const top = V(0, trunkH, 0);
    wood.push(limb(base, top, 0.34 * size, 0.24 * size, 7));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const off = (broad ? rng.range(2.4, 3.0) : rng.range(1.45, 1.85));
      const c = V(Math.cos(a) * off, trunkH + (broad ? rng.range(1.0, 2.2) : rng.range(1.0, 2.4)), Math.sin(a) * off);
      const k = rng.next();
      const r = broad ? 1.1 + 0.35 * k : 0.9 + 0.2 * k;
      const rWas = broad ? 1.2 + (1.6 - 1.2) * k : 0.95 + (1.25 - 0.95) * k;
      blobs.push({ c, r: R(r, r * 0.85, r), cardR: R(rWas, rWas * 0.85, rWas) });
      wood.push(limb(top, c.clone().lerp(top, 0.25), 0.16 * size, 0.07 * size, 5));
    }
    blobs.push({ c: V(rng.range(-0.3, 0.3), trunkH + (broad ? 3.2 : 3.1), rng.range(-0.3, 0.3)), r: R(broad ? 1.5 : 1.2) });
  } else if (shape === 'conifer') {
    const trunkH = 1.0;
    wood.push(limb(base, V(0, 7.5, 0), 0.26 * size, 0.06 * size, 6));
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1);
      const r = 1.9 * (1 - t) + 0.45;
      blobs.push({ c: V(rng.range(-0.1, 0.1), trunkH + 0.9 + i * 1.15, rng.range(-0.1, 0.1)), r: R(r, 0.75, r) });
    }
  } else if (shape === 'poplar') {
    wood.push(limb(base, V(0, 3, 0), 0.2 * size, 0.14 * size, 6));
    for (let i = 0; i < 5; i++) {
      const r = [0.95, 1.15, 1.1, 0.9, 0.6][i];
      blobs.push({ c: V(rng.range(-0.15, 0.15), 2.4 + i * 1.35, rng.range(-0.15, 0.15)), r: R(r, 1.0, r) });
    }
  } else {
    // bush
    for (let i = 0; i < 3; i++) {
      const a = rng.range(0, Math.PI * 2);
      blobs.push({ c: V(Math.cos(a) * 0.5, 0.7 + rng.range(0, 0.3), Math.sin(a) * 0.5), r: R(rng.range(0.7, 0.95)) });
    }
  }
  return { blobs, wood: wood.length ? mergeGeometries(wood, false)! : null };
}

/**
 * Instanced fluffy trees: a few variants of the given style, with placements split between them.
 * Returns a group of instanced trunks and canopies.
 */
export function fluffyForest(style: FluffyStyle, placements: Placement[], rng: Rng, opts: { castShadow?: boolean; variants?: number } = {}) {
  const group = new THREE.Group();
  if (!placements.length) return group;
  const { material, depth } = foliageMaterial(!!style.snow);
  const barkMat = new THREE.MeshToonMaterial({ color: style.trunk, gradientMap: foliageRamp() });
  const variants = opts.variants ?? 3;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  // split into 150-unit stretches along z so stretches out of view are culled (the ride runs along z)
  const CHUNK = 150;
  const layouts: Array<{ canopy: THREE.BufferGeometry; wood: THREE.BufferGeometry | null }> = [];
  for (let vi = 0; vi < variants; vi++) {
    const layout = treeLayout(style.shape, rng, style.size ?? 1);
    // conifers and poplars keep their tapering outline: their tiers bulge less
    const lobes = style.shape === 'conifer' ? 0.35 : style.shape === 'poplar' ? 0.6 : 1;
    layouts.push({ canopy: canopyGeometry(layout.blobs, rng, { density: style.density, snow: style.snow, lobes }), wood: layout.wood });
  }
  const chunks = new Map<number, Array<{ pl: Placement; i: number }>>();
  placements.forEach((pl, i) => { const k = Math.floor(pl.z / CHUNK); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k)!.push({ pl, i }); });
  for (const list of chunks.values()) {
    for (let vi = 0; vi < variants; vi++) {
      const mine = list.filter((e) => e.i % variants === vi);
      if (!mine.length) continue;
      const { canopy, wood } = layouts[vi];
      const leaves = new THREE.InstancedMesh(canopy, material, mine.length);
      leaves.customDepthMaterial = depth;
      const trunk = wood ? new THREE.InstancedMesh(wood, barkMat, mine.length) : null;
      mine.forEach(({ pl, i: gi }, i) => {
        q.setFromAxisAngle(up, pl.rot);
        p.set(pl.x, pl.y, pl.z); s.setScalar(pl.scale);
        m.compose(p, q, s);
        leaves.setMatrixAt(i, m);
        trunk?.setMatrixAt(i, m);
        c.set(style.leaves[gi % style.leaves.length]);
        if (pl.tint) c.multiply(pl.tint);
        c.offsetHSL(rng.range(-0.015, 0.015), rng.range(-0.04, 0.04), rng.range(-0.04, 0.04));
        leaves.setColorAt(i, c);
      });
      leaves.instanceMatrix.needsUpdate = true;
      leaves.instanceColor!.needsUpdate = true;
      leaves.computeBoundingSphere();
      leaves.castShadow = !!opts.castShadow; leaves.receiveShadow = true;
      group.add(leaves);
      if (trunk) {
        trunk.instanceMatrix.needsUpdate = true;
        trunk.computeBoundingSphere();
        trunk.castShadow = !!opts.castShadow; trunk.receiveShadow = true;
        group.add(trunk);
      }
    }
  }
  return group;
}

/** One large hand-placed tree (a landmark), built from explicit blobs. */
export function fluffyTree(blobs: Blob[], leafColor: THREE.ColorRepresentation, rng: Rng, opts: { density?: number; cardScale?: number } = {}) {
  const { material, depth } = foliageMaterial();
  const geo = canopyGeometry(blobs, rng, opts);
  const col = new THREE.Color(leafColor);
  const colors = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < colors.count; i++) colors.setXYZ(i, colors.getX(i) * col.r, colors.getY(i) * col.g, colors.getZ(i) * col.b);
  const mesh = new THREE.Mesh(geo, material);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

let flowerTexCache: THREE.Texture | null = null;
/** Four small flower heads in a 2x2 atlas: white daisy, yellow buttercup, pink clover, blue speedwell. */
function flowerTexture() {
  if (flowerTexCache) return flowerTexCache;
  const S = 256, H = S / 2;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!;
  const kinds: Array<{ petal: string; center: string; n: number; len: number; wid: number }> = [
    { petal: '#fbf8ee', center: '#f2c230', n: 12, len: 44, wid: 11 },
    { petal: '#f7d43a', center: '#e0a020', n: 5, len: 36, wid: 22 },
    { petal: '#f2a0c0', center: '#d86a98', n: 16, len: 34, wid: 9 },
    { petal: '#8fb4f0', center: '#f4f0e0', n: 5, len: 32, wid: 20 },
  ];
  kinds.forEach((k, i) => {
    const cx = (i % 2) * H + H / 2, cy = Math.floor(i / 2) * H + H / 2;
    for (let p = 0; p < k.n; p++) {
      const a = (p / k.n) * Math.PI * 2;
      g.save(); g.translate(cx, cy); g.rotate(a);
      g.fillStyle = k.petal;
      g.beginPath(); g.ellipse(k.len / 2 + 4, 0, k.len / 2, k.wid / 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.beginPath(); g.ellipse(k.len / 2 + 4, 0, k.len / 2, k.wid / 5, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    g.fillStyle = k.center; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  flowerTexCache = t;
  return t;
}

/**
 * Meadow flowers as small camera-facing cards that sit among the grass tips.
 * `kinds[i]` picks the flower (0 daisy, 1 buttercup, 2 clover, 3 speedwell) for placement i.
 */
export function flowerField(placements: Placement[], kinds: number[]) {
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], corner: number[] = [], idx: number[] = [];
  placements.forEach((p, i) => {
    const k = kinds[i % kinds.length];
    const u0 = (k % 2) * 0.5, v0 = k < 2 ? 0.5 : 0;
    const s = 0.16 * p.scale;
    const base = i * 4;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(p.x, p.y, p.z);
      nrm.push(0, 1, 0);
      uv.push(u0 + (cx * 0.5 + 0.5) * 0.5, v0 + (cy * 0.5 + 0.5) * 0.5);
      corner.push(cx * s, cy * s * 0.8);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('cardCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.boundingSphere!.radius += 1;
  const mat = new THREE.MeshLambertMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  patchCards(mat, 'flower-cards-v1');
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  return mesh;
}
