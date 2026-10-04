import * as THREE from 'three';
import { charToon } from '../../../engine/Paint';
import { foliageMaterial } from '../../../engine/Foliage';

/*
 * Growth driven by the rider's position. Every vertex of the giant tree carries `aKey`: the rider z at
 * which that part starts to grow. The shaders read the rider's z from one shared uniform, so the whole
 * tree (bark and leaves, and their shadows) grows in one draw call per mesh, and it is always in the same
 * state for the same z, however fast the rider goes or wherever the ride is jumped to.
 *
 *  Bark: each ring of a branch carries its centre (`aAxis`). A ring swells from nothing to its full
 *  width as the rider goes `uSpan` units past its key, turning about its centre as it does (so the bark
 *  twists into place). Rings ahead of the growing tip have no width, so the branch seems to reach out.
 *  Fresh growth is the bright green of a young shoot and browns into bark over the next few units; moss
 *  (`aMoss`, strongest on the upper side of limbs) comes in once a ring is full grown.
 *  Leaves: each leaf card carries the centre of its clump (`aCentre`); it slides out from there and opens.
 */

export interface GrowUniforms { uRideZ: { value: number }; uSpan: { value: number }; uTwist: { value: number }; uYoungSpan: { value: number }; uYoung: { value: THREE.Color }; uMoss: { value: THREE.Color } }

/**
 * One set per material: `span` is how many units of the rider's travel a ring or a leaf takes to grow,
 * `twist` how far (radians) a ring turns as it grows, `young` over how many units it browns from shoot green.
 */
export function growUniforms(span = 9, twist = 1.4, young = 8): GrowUniforms {
  return { uRideZ: { value: 1e4 }, uSpan: { value: span }, uTwist: { value: twist }, uYoungSpan: { value: young }, uYoung: { value: new THREE.Color(0x7cc844) }, uMoss: { value: new THREE.Color(0x5e8a34) } };
}

const COMMON = /* glsl */ `
  attribute float aKey;
  uniform float uRideZ; uniform float uSpan; uniform float uTwist; uniform float uYoungSpan;
  float growK() { float k = clamp((aKey - uRideZ) / uSpan, 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }
`;

/** Turn a ring point about its centre and scale it towards the centre (bark). */
const BARK_BEGIN = /* glsl */ `
  #include <begin_vertex>
  {
    float bK = growK(); float bA = uTwist * (1.0 - bK) * (1.0 - bK);
    float bC = cos(bA), bS = sin(bA);
    vec3 bR = transformed - aAxis;
    bR = vec3(bC * bR.x + bS * bR.z, bR.y, -bS * bR.x + bC * bR.z);
    transformed = aAxis + bR * bK;
  }
`;

/** The young-shoot green and the moss, mixed into the bark's colour (not used by the shadow material). */
const BARK_COLOUR = /* glsl */ `
  #include <color_fragment>
  {
    float bl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.6 + 0.9 * bl), clamp(vMoss, 0.0, 1.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, uYoung * (0.75 + 0.5 * bl), clamp(vYoung, 0.0, 1.0) * 0.85);
    totalEmissiveRadiance += uYoung * clamp(vYoung, 0.0, 1.0) * 0.14;
  }
`;

/** Patch a material for the bark of the growing tree. `colour` adds the young green and the moss. */
function patchBark(m: THREE.Material, u: GrowUniforms, key: string, colour: boolean) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nattribute vec3 aAxis;${colour ? '\nattribute float aMoss; varying float vYoung; varying float vMoss;' : ''}`)
      .replace('#include <begin_vertex>', BARK_BEGIN + (colour ? '\nvYoung = 1.0 - smoothstep(0.0, uYoungSpan, aKey - uRideZ);\nvMoss = aMoss * growK();' : ''));
    if (colour) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uYoung; uniform vec3 uMoss; varying float vYoung; varying float vMoss;')
        .replace('#include <color_fragment>', BARK_COLOUR);
    }
    if (sh.vertexShader.includes('#include <beginnormal_vertex>')) {
      sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { float nK = growK(); float nA = uTwist * (1.0 - nK) * (1.0 - nK); float nC = cos(nA), nS = sin(nA);
          objectNormal = vec3(nC * objectNormal.x + nS * objectNormal.z, objectNormal.y, -nS * objectNormal.x + nC * objectNormal.z); }`);
    }
  };
  m.customProgramCacheKey = () => key;
}

/** Bark material (painted, cel-shaded) and its shadow material, both growing with the rider. */
export function barkMaterials(map: THREE.Texture, u: GrowUniforms, emissive = 0x000000) {
  // a warm shadow tone, so the bark stays brown in blue moonlight instead of going grey
  // (a weak rim: limbs seen from below against the moon would otherwise wash out pale)
  const material = charToon({ map, rim: 0.1, shade: 0x8c6a54, mid: 0.92, emissive });
  patchBark(material, u, 'bark-grow-v2', true);
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchBark(depth, u, 'bark-grow-depth-v2', false);
  return { material, depth };
}

/** Leaf cards that slide out of their clump's centre and open as the rider passes their key. */
function patchLeaves(m: THREE.Material, u: GrowUniforms, key: string) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${COMMON}\nattribute vec3 aCentre;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat gLeaf = growK();\ntransformed = mix(aCentre, transformed, gLeaf);')
      .replace('mvPosition.xy += cardCorner * cardScale;', 'mvPosition.xy += cardCorner * cardScale * gLeaf;');
  };
  m.customProgramCacheKey = () => key;
}

/** The leaf-card material of the engine's fluffy trees, growing with the rider. */
export function leafMaterials(u: GrowUniforms, emissive = 0x000000) {
  const { material, depth } = foliageMaterial();
  material.emissive.set(emissive);
  patchLeaves(material, u, 'foliage-grow-v1');
  patchLeaves(depth, u, 'foliage-grow-depth-v1');
  return { material, depth };
}

// ---------------- geometry ----------------
export interface Ring { c: THREE.Vector3; r: number; key: number }

/**
 * A branch as a tube through rings (centre, radius, growth key). UVs are in world units (one bark tile
 * per 6 units round and along). `gnarl` adds ridges; with `smoothTop` they fade out on the upper side, so
 * a branch something runs along stays smooth on top. The far end closes in a rounded tip.
 */
export function branchGeometry(rings: Ring[], radial: number, o: { gnarl?: number; smoothTop?: boolean; spiral?: number; tip?: boolean; moss?: number } = {}) {
  const n = rings.length;
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = rings[Math.max(0, i - 1)].c, b = rings[Math.min(n - 1, i + 1)].c;
    T.push(b.clone().sub(a).normalize());
  }
  // frames carried along the tube without twisting (parallel transport)
  const N: THREE.Vector3[] = [], B: THREE.Vector3[] = [];
  const first = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(first.clone().sub(T[0].clone().multiplyScalar(first.dot(T[0]))).normalize());
  for (let i = 1; i < n; i++) {
    const q = new THREE.Quaternion().setFromUnitVectors(T[i - 1], T[i]);
    const nn = N[i - 1].clone().applyQuaternion(q);
    nn.sub(T[i].clone().multiplyScalar(nn.dot(T[i]))).normalize();
    N.push(nn);
  }
  for (let i = 0; i < n; i++) B.push(new THREE.Vector3().crossVectors(T[i], N[i]).normalize());

  const tipRing = o.tip !== false;
  const rows = n + (tipRing ? 1 : 0);
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], axis: number[] = [], key: number[] = [], moss: number[] = [], idx: number[] = [];
  const gnarl = o.gnarl ?? 0.08;
  const d = new THREE.Vector3(), p = new THREE.Vector3();
  let s = 0;
  for (let i = 0; i < rows; i++) {
    const tip = i === n;
    const R = tip ? { c: rings[n - 1].c.clone().addScaledVector(T[n - 1], rings[n - 1].r * 0.9), r: 0.02, key: rings[n - 1].key - 0.5 } : rings[i];
    if (i > 0) s += R.c.distanceTo(tip ? rings[n - 1].c : rings[i - 1].c);
    const k = tip ? n - 1 : i;
    const around = Math.max(1, Math.round((Math.PI * 2 * R.r) / 6));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      d.copy(N[k]).multiplyScalar(Math.cos(a)).addScaledVector(B[k], Math.sin(a));
      let bump = 1 + gnarl * (Math.sin(a * 3 + s * 0.21) * 0.6 + Math.sin(a * 7 - s * 0.13) * 0.4);
      if (o.smoothTop) bump = 1 + (bump - 1) * (1 - THREE.MathUtils.smoothstep(d.y, 0.1, 0.55));
      p.copy(R.c).addScaledVector(d, R.r * bump);
      pos.push(p.x, p.y, p.z);
      nrm.push(d.x, d.y, d.z);
      uv.push((j / radial) * around + s * (o.spiral ?? 0) / 6, s / 6);
      axis.push(R.c.x, R.c.y, R.c.z);
      key.push(R.key);
      // moss on the upper side, in patches along the branch
      moss.push((o.moss ?? 0) * THREE.MathUtils.smoothstep(d.y, 0.05, 0.75) * (0.55 + 0.45 * Math.sin(s * 0.37 + a * 2.1)));
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAxis', new THREE.Float32BufferAttribute(axis, 3));
  g.setAttribute('aKey', new THREE.Float32BufferAttribute(key, 1));
  g.setAttribute('aMoss', new THREE.Float32BufferAttribute(moss, 1));
  g.setIndex(idx);
  return g;
}

/** Rings along a curve, with radius and key given as functions of the fraction along it. */
export function ringsAlong(curve: THREE.Curve<THREE.Vector3>, count: number, radius: (f: number) => number, key: (f: number) => number): Ring[] {
  const out: Ring[] = [];
  for (let i = 0; i <= count; i++) { const f = i / count; out.push({ c: curve.getPointAt(f), r: radius(f), key: key(f) }); }
  return out;
}
