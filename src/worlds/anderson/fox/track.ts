import * as THREE from 'three';
import { Rng } from '../../../engine/math';
import type { Road } from '../layout';

/*
 * Rails for the Zubrowka Express under the hill: two steel rails on wooden sleepers, laid on whatever the
 * floor is (the Foxes' runner rug, packed earth, the cellar's bricks under the cider). Rails are swept along
 * the path; sleepers are one instanced mesh per stretch.
 */

const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8e94, metalness: 0.7, roughness: 0.38, emissive: 0x1a1612 });
let sleeperMat: THREE.MeshLambertMaterial | null = null;
function sleeperTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d')!;
  const rng = new Rng(71);
  g.fillStyle = '#6a4a30'; g.fillRect(0, 0, 128, 32);
  for (let i = 0; i < 22; i++) { g.strokeStyle = `rgba(${rng.chance(0.5) ? '40,24,12' : '150,110,70'},${rng.range(0.2, 0.45)})`; g.lineWidth = rng.range(0.6, 1.6); const y = rng.range(0, 32); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y + rng.range(-3, 3), 90, y + rng.range(-3, 3), 128, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rails and sleepers from z0 to z1 along the path (top of the rails 0.2 above the path). */
export function rails(road: Road, z0: number, z1: number, o: { gauge?: number; every?: number; yOff?: number } = {}) {
  const g = new THREE.Group();
  g.position.y = o.yOff ?? 0;
  const gauge = o.gauge ?? 1.5, every = o.every ?? 1.05;
  sleeperMat ??= new THREE.MeshLambertMaterial({ map: sleeperTexture() });
  const n = Math.max(1, Math.floor(Math.abs(z1 - z0) / every));
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(gauge + 0.9, 0.12, 0.34), sleeperMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const rng = new Rng(Math.round(z0));
  for (let i = 0; i < n; i++) {
    const z = z0 + (z1 - z0) * ((i + 0.5) / n);
    const a = road.at(z), b = road.at(z - 0.5);
    const pitch = Math.atan2(a.y - b.y, 0.5);
    e.set(pitch, Math.atan2(a.rz, -a.rx) + rng.range(-0.03, 0.03), 0, 'YXZ');
    q.setFromEuler(e);
    p.set(a.x, a.y + 0.04, z);
    sl.setMatrixAt(i, m.compose(p, q, s));
  }
  sl.instanceMatrix.needsUpdate = true;
  sl.computeBoundingSphere();
  sl.receiveShadow = true;
  g.add(sl);
  // two rails: a narrow head on a web, swept along the path
  const prof: Array<[number, number]> = [[-0.05, 0.1], [0.05, 0.1], [0.05, 0.2], [-0.05, 0.2]];
  const pos: number[] = [];
  const segs = Math.ceil(Math.abs(z1 - z0) / 1.2);
  for (const off of [-gauge / 2, gauge / 2]) {
    for (let i = 0; i < segs; i++) {
      const za = z0 + (z1 - z0) * (i / segs), zb = z0 + (z1 - z0) * ((i + 1) / segs);
      const A = road.at(za), B = road.at(zb);
      for (let k = 0; k < 4; k++) {
        const [x0, y0] = prof[k], [x1, y1] = prof[(k + 1) % 4];
        const P = (r: typeof A, z: number, x: number, y: number) => [r.x + r.rx * (off + x), r.y + y, z + r.rz * (off + x)];
        const a0 = P(A, za, x0, y0), a1 = P(A, za, x1, y1), b0 = P(B, zb, x0, y0), b1 = P(B, zb, x1, y1);
        pos.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
      }
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.computeVertexNormals();
  const r = new THREE.Mesh(rg, railMat);
  r.material.side = THREE.DoubleSide;
  r.receiveShadow = true;
  g.add(r);
  return g;
}
