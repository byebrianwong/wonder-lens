import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Rails laid over a floor (a carpet, a stage): two brass rails on short lacquered sleepers, with no ballast.
 * The rails' tops sit `lift` above the curve, which is the floor under the train's wheels.
 */
export function floorRails(curve: THREE.Curve<THREE.Vector3>, o: { gauge?: number; every?: number; lift?: number; rail?: number; sleeper?: number } = {}) {
  const gauge = o.gauge ?? 1.5, every = o.every ?? 0.9, lift = o.lift ?? 0.12;
  const len = curve.getLength();
  const segs = Math.ceil(len / 0.8);
  const up = new THREE.Vector3(0, 1, 0);
  const group = new THREE.Group();
  // rails: a box profile swept along the curve
  const railGeos: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const pos: number[] = [], idx: number[] = [];
    const prof: [number, number][] = [[-0.045, 0], [0.045, 0], [0.045, lift], [-0.045, lift]];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const side = new THREE.Vector3().crossVectors(t, up).normalize();
      const c = p.clone().addScaledVector(side, (s * gauge) / 2);
      for (const [x, y] of prof) { const v = c.clone().addScaledVector(side, x); pos.push(v.x, v.y + y, v.z); }
      if (i < segs) for (let k = 0; k < 4; k++) {
        const a = i * 4 + k, b = i * 4 + ((k + 1) % 4), a2 = a + 4, b2 = b + 4;
        idx.push(a, a2, b, b, a2, b2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    railGeos.push(g.toNonIndexed());
  }
  const rails = new THREE.Mesh(mergeGeometries(railGeos, false)!, new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.85, roughness: 0.3, emissive: 0x3a2a08, emissiveIntensity: 0.3, side: THREE.DoubleSide }));
  rails.receiveShadow = true;
  group.add(rails);
  // sleepers
  const n = Math.floor(len / every);
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(gauge + 0.5, 0.06, 0.24), new THREE.MeshLambertMaterial({ color: o.sleeper ?? 0x5a2a20 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = curve.getPointAt(u), t = curve.getTangentAt(u);
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(t.x, 0, t.z).normalize());
    sl.setMatrixAt(i, m.compose(p.clone().setY(p.y + 0.03), q, sc));
  }
  sl.computeBoundingSphere();
  sl.receiveShadow = true;
  group.add(sl);
  return group;
}
