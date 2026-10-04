import * as THREE from 'three';
import { charToon } from '../../../engine/Paint';

/*
 * Fewer draw calls for a rigged character.
 *
 * A character is built from many small meshes (eyes, claws, whiskers, buttons, each with its own material,
 * many with an ink outline). Most of them never move on their own: they only follow the bone or joint they
 * hang from. `bakeRigid` finds, for every such mesh, the nearest part above it that does move on its own
 * (`moving`), and merges all the meshes that hang from that part into one mesh per material, baked in their
 * current pose. Plain-coloured materials (no texture) are first turned into vertex colours on one shared
 * material, so eyes, noses, claws and shoes all merge together.
 *
 * Left alone: skinned meshes, meshes that move themselves, hidden meshes (they keep their own show and
 * hide), and eyelids (half spheres that swing shut to blink).
 */

const shared = new Map<string, THREE.Material>();
/** One vertex-coloured material per kind and side, shared by every baked character. */
function vcMaterial(kind: 'toon' | 'basic', side: THREE.Side) {
  const key = `${kind}|${side}`;
  let m = shared.get(key);
  if (!m) {
    m = kind === 'toon' ? charToon({ vertexColors: true, rim: 0.3, side }) : new THREE.MeshBasicMaterial({ vertexColors: true, side });
    shared.set(key, m);
  }
  return m;
}

/** 'toon' or 'basic' for a plain-coloured material whose colour can go into the vertices, else null. */
function plainKind(m: THREE.Material): 'toon' | 'basic' | null {
  const a = m as THREE.MeshToonMaterial;
  if (m.transparent || a.map || a.alphaMap || m.alphaTest > 0) return null;
  // the cel-shaded character material (it marks itself with its rim strength)
  if (a.isMeshToonMaterial && !a.emissiveMap && m.userData.rim !== undefined) return 'toon';
  // a plain unlit colour, but not the ink outline (which has its own shader)
  if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial && m.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey) return 'basic';
  return null;
}

const isEyelid = (m: THREE.Mesh) => {
  const g = m.geometry as THREE.SphereGeometry;
  return g.type === 'SphereGeometry' && g.parameters.thetaLength < Math.PI - 1e-3;
};

export function bakeRigid(root: THREE.Object3D, moving: (o: THREE.Object3D) => boolean) {
  root.updateMatrixWorld(true);
  const shown = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) return false; return root.visible; };
  const buckets = new Map<THREE.Object3D, Map<string, { kind: 'toon' | 'basic' | null; list: THREE.Mesh[] }>>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    if (moving(m) || !shown(m) || isEyelid(m) || m.userData.live) return;
    let a: THREE.Object3D | null = m.parent;
    while (a && a !== root && !moving(a)) a = a.parent;
    if (!a) return;
    const mat = m.material as THREE.Material;
    const kind = plainKind(mat);
    const key = kind ? `${kind}|${mat.side}` : mat.uuid;
    if (!buckets.has(a)) buckets.set(a, new Map());
    const b = buckets.get(a)!;
    if (!b.has(key)) b.set(key, { kind, list: [] });
    b.get(key)!.list.push(m);
  });

  const removed = new Set<THREE.Mesh>();
  const inv = new THREE.Matrix4(), mtx = new THREE.Matrix4(), col = new THREE.Color();
  for (const [anchor, map] of buckets) {
    inv.copy(anchor.matrixWorld).invert();
    for (const { kind, list } of map.values()) {
      if (list.length < 2) continue;
      const pos: number[] = [], nrm: number[] = [], uv: number[] = [], clr: number[] = [];
      for (const m of list) {
        mtx.multiplyMatrices(inv, m.matrixWorld);
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(mtx);
        const flip = mtx.determinant() < 0;
        const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute, t = g.attributes.uv as THREE.BufferAttribute | undefined;
        if (kind) col.copy((m.material as THREE.MeshBasicMaterial).color);
        for (let i = 0; i < p.count; i++) {
          // a mirrored part would turn inside out: swap two corners of each triangle
          const j = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
          pos.push(p.getX(j), p.getY(j), p.getZ(j));
          nrm.push(n.getX(j), n.getY(j), n.getZ(j));
          if (kind) clr.push(col.r, col.g, col.b);
          else uv.push(t ? t.getX(j) : 0, t ? t.getY(j) : 0);
        }
        g.dispose();
        removed.add(m);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      if (kind) geo.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
      else geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const first = list[0];
      const out = new THREE.Mesh(geo, kind ? vcMaterial(kind, (first.material as THREE.Material).side) : first.material);
      out.castShadow = first.castShadow; out.receiveShadow = first.receiveShadow; out.renderOrder = first.renderOrder;
      out.userData.outline = first.userData.outline;
      anchor.add(out);
    }
  }
  // take the merged meshes out, keeping anything that hangs from them and was not merged
  for (const m of removed) {
    for (const c of [...m.children]) if (!removed.has(c as THREE.Mesh)) m.parent?.attach(c);
    m.parent?.remove(m);
  }
}
