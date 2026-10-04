import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { Painter } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { css } from '../textures';
import type { Adult } from '../people';

/*
 * Helpers for the Grand Budapest's people: a uniform painter for the figure's torso (lapels, shirt, tie,
 * buttons, gold braid, the Crossed Keys pin), and `bake`, which merges a figure's meshes into one mesh per
 * material on each joint that still moves, so a person costs a dozen draw calls instead of forty.
 */

export interface Uniform {
  color: number;
  /** open lapels over a shirt and tie */
  lapel?: number; shirt?: number; tie?: number;
  /** a row (or two) of buttons down the front */
  buttons?: number; double?: boolean;
  /** gold braid round the hem and the collar, and down the front */
  braid?: number;
  /** the Society of the Crossed Keys pin on the left lapel */
  keys?: boolean;
  /** a fur collar painted round the neck */
  fur?: number;
  seed?: number;
}

/**
 * A jacket for makeAdult's torso (a lathe turned round, so the front is the middle of the canvas and the
 * neck is at the top).
 */
export function uniformTexture(o: Uniform) {
  const W = 512, H = 256, cx = W / 2;
  const p = new Painter(W, H, o.seed ?? 5).fill(css(o.color));
  const g = p.g;
  p.lines({ n: 50, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], wobble: 0.5 });
  p.lines({ n: 50, colors: ['rgba(255,255,255,0.5)', 'rgba(0,0,0,0.5)'], alpha: [0.04, 0.08], width: [1, 1.5], vertical: true, wobble: 0.5 });
  // shading round the sides and a soft sheen down the chest
  for (const u of [0.0, 0.25, 0.75, 1.0]) { const gr = g.createLinearGradient(u * W - 40, 0, u * W + 40, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(u * W - 40, 0, 80, H); }
  const sh = g.createLinearGradient(cx - 90, 0, cx + 90, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.fillRect(cx - 90, 0, 180, H);
  if (o.lapel !== undefined) {
    g.fillStyle = css(o.shirt ?? 0xf8f4ee);
    g.beginPath(); g.moveTo(cx - 40, 0); g.lineTo(cx + 40, 0); g.lineTo(cx, 120); g.closePath(); g.fill();
    if (o.tie !== undefined) {
      g.fillStyle = css(o.tie); g.beginPath(); g.moveTo(cx - 9, 4); g.lineTo(cx + 9, 4); g.lineTo(cx + 6, 14); g.lineTo(cx + 12, 96); g.lineTo(cx, 112); g.lineTo(cx - 12, 96); g.lineTo(cx - 6, 14); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(cx - 2, 18, 3, 80);
    }
    for (const s of [-1, 1]) {
      g.fillStyle = css(o.lapel);
      g.beginPath(); g.moveTo(cx + s * 40, 0); g.lineTo(cx + s * 78, 0); g.lineTo(cx + s * 52, 58); g.lineTo(cx + s * 66, 70); g.lineTo(cx + s * 4, 128); g.closePath(); g.fill();
      g.strokeStyle = o.braid !== undefined ? css(o.braid) : css(o.color, 0.65); g.lineWidth = o.braid !== undefined ? 3 : 2;
      g.beginPath(); g.moveTo(cx + s * 78, 0); g.lineTo(cx + s * 52, 58); g.lineTo(cx + s * 66, 70); g.lineTo(cx + s * 4, 128); g.stroke();
    }
  }
  if (o.fur !== undefined) {
    g.fillStyle = css(o.fur); g.fillRect(0, 0, W, 38);
    p.fur({ n: 260, colors: [css(o.fur, 0.85), css(o.fur, 1.1)], len: [8, 16], width: [3, 5], alpha: [0.4, 0.7], y: [0, 0.18] });
  }
  if (o.braid !== undefined) {
    g.fillStyle = css(o.braid);
    g.fillRect(0, H - 12, W, 7);
    if (o.lapel === undefined) {
      g.fillRect(0, 0, W, 12);
      g.fillRect(cx - 3, 12, 6, H - 24);
    }
  }
  if (o.buttons !== undefined) {
    const cols = o.double ? [-20, 20] : [o.lapel === undefined ? 14 : 0];
    for (const bx of cols) for (let i = 0; i < (o.lapel === undefined ? 5 : 3); i++) {
      const y = (o.lapel === undefined ? 34 : 146) + i * (o.lapel === undefined ? 40 : 30);
      g.fillStyle = css(o.buttons, 0.6); g.beginPath(); g.arc(cx + bx + 1, y + 1, 6, 0, TAU); g.fill();
      g.fillStyle = css(o.buttons); g.beginPath(); g.arc(cx + bx, y, 5.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.arc(cx + bx - 1.5, y - 1.5, 2, 0, TAU); g.fill();
    }
  }
  if (o.keys) {
    // two crossed gold keys on the left lapel (the viewer's right)
    g.save(); g.translate(cx + 50, 42); g.strokeStyle = '#f0cc5a'; g.lineWidth = 3.5; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.save(); g.rotate(s * 0.62); g.beginPath(); g.moveTo(0, -13); g.lineTo(0, 12); g.moveTo(0, 9); g.lineTo(5, 9); g.moveTo(0, 4); g.lineTo(4, 4); g.stroke(); g.beginPath(); g.arc(0, -16, 4, 0, TAU); g.stroke(); g.restore(); }
    g.restore();
  }
  const t = p.texture();
  return t;
}

/** Give a figure's torso its own uniform. */
export function dressTorso(a: Adult, tex: THREE.Texture, emissive = 0x000000) {
  const torso = a.spine.children.find((c) => (c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'LatheGeometry') as THREE.Mesh | undefined;
  if (torso) torso.material = charToon({ map: tex, rim: 0.35, shade: 0x9aa0cc, emissive });
  return torso;
}

/** Mark a prop so `bake` leaves it alone (it shows and hides, or moves on its own). */
export function keepApart(o: THREE.Object3D) { o.traverse((c) => { c.userData.keepMesh = true; }); return o; }

/**
 * Merge every mesh of a figure into one mesh per material on its nearest ancestor among `movers` (or the
 * root). Joints not listed are frozen in the pose they have now. Props marked with keepApart stay as they are.
 */
export function bake(root: THREE.Object3D, movers: THREE.Object3D[]) {
  root.updateMatrixWorld(true);
  const keep = new Set<THREE.Object3D>([root, ...movers]);
  const buckets = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  const gone: THREE.Mesh[] = [];
  const inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.keepMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    let a = m.parent;
    while (a && !keep.has(a)) a = a.parent;
    if (!a) return;
    inv.copy(a.matrixWorld).invert();
    rel.multiplyMatrices(inv, m.matrixWorld);
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.morphAttributes = {};
    geo.applyMatrix4(rel);
    if (rel.determinant() < 0) {
      const p = geo.attributes.position as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute, u = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i += 3) for (const at of [p, n, u]) { for (let k = 0; k < at.itemSize; k++) { const t = at.getComponent(i + 1, k); at.setComponent(i + 1, k, at.getComponent(i + 2, k)); at.setComponent(i + 2, k, t); } }
    }
    let byMat = buckets.get(a);
    if (!byMat) { byMat = new Map(); buckets.set(a, byMat); }
    const mat = m.material as THREE.Material;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(geo);
    gone.push(m);
  });
  for (const m of gone) {
    // keep any non-mesh children (joints hung on a mesh) by moving them to the mesh's parent
    for (const c of [...m.children]) if (!(c as THREE.Mesh).isMesh || c.userData.keepMesh) { m.parent?.attach(c); }
    m.parent?.remove(m);
  }
  for (const [anchor, byMat] of buckets) for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mm = new THREE.Mesh(merged, mat);
    mm.userData.baked = true;
    anchor.add(mm);
  }
  return root;
}

/**
 * The ink outline for instanced meshes (the engine's outline ignores the instance matrix): the back faces
 * pushed out along their normals, a pixel or so wide.
 */
export function instancedInk(color = 0x2a1e24, px = 1.3, max = 0.014) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineWidth = { value: px * 0.0011 };
    sh.uniforms.outlineMax = { value: max };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float outlineWidth;\nuniform float outlineMax;')
      .replace('#include <project_vertex>', /* glsl */ `
        vec4 olP = vec4( transformed, 1.0 );
        vec3 olN = normal;
        #ifdef USE_INSTANCING
          olP = instanceMatrix * olP;
          olN = mat3( instanceMatrix ) * olN;
        #endif
        vec4 mvPosition = modelViewMatrix * olP;
        vec3 olVN = normalize( normalMatrix * olN );
        mvPosition.xyz += olVN * min( outlineWidth * -mvPosition.z, outlineMax );
        gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'inkOutlineInst1';
  return m;
}
