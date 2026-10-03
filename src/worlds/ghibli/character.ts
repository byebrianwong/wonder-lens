import * as THREE from 'three';
import { charToon } from '../../engine/Paint';
import { dirAt, surfaceNormal, type Rig } from '../../engine/Rig';
import { clamp } from '../../engine/math';

/** Characters face +z in local space. */
export interface Character {
  group: THREE.Group;
  update(dt: number, t: number): void;
}

/** A point on a sculpted shape, with the outward normal there and the unit direction it came from. */
export interface SurfacePoint { p: THREE.Vector3; n: THREE.Vector3; dir: THREE.Vector3 }

export type Shape = (dir: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3 | void;

/** Surface point of a sculpted shape at an angle around (0 = front, + towards +x) and a polar angle from the top. */
export function surfaceAt(shape: Shape, around: number, polar: number): SurfacePoint {
  const dir = dirAt(around, polar);
  const p = new THREE.Vector3();
  shape(dir, p);
  const n = surfaceNormal(shape as (d: THREE.Vector3, o: THREE.Vector3) => void, dir, new THREE.Vector3());
  return { p, n, dir };
}

/** The polar angle at which a shape (whose height falls from top to bottom) reaches height y at the front. */
export function polarAtHeight(shape: Shape, y: number, around = 0) {
  let lo = 0.001, hi = Math.PI - 0.001;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    shape(dirAt(around, mid, d), p);
    if (p.y > y) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Orient an object so its local +z points along `normal`, keeping its local +y as close to world up as it can. */
export function alignTo(o: THREE.Object3D, normal: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)) {
  const z = normal.clone().normalize();
  const x = up.clone().cross(z);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = z.clone().cross(x);
  o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return o;
}

/** Direction (as an [x, y, z] array, for `Painter.at`) at an angle around and a polar angle. */
export function dirArr(around: number, polar: number): [number, number, number] {
  const d = dirAt(around, polar);
  return [d.x, d.y, d.z];
}

/** Blink: 0 open, 1 closed, for a blink that started `since` seconds ago and lasts `len` seconds. */
export function blinkAmount(since: number, len = 0.16) {
  if (since < 0 || since > len) return 0;
  const k = since / len;
  return clamp(k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6, 0, 1);
}

/**
 * A mouth that opens on the surface of a sculpted, skinned body: a patch lying on the skin that grows from a
 * line into a wide crescent (open 0..1). `top` is the polar angle of the upper lip at the middle, `drop`
 * how far down (in polar angle) the lower lip goes when fully open, `halfWidth` the angle around to each
 * corner. It is skinned with the body's own weights so it moves exactly with the skin.
 */
export function surfaceMouth(o: { shape: Shape; rig: Rig; weights: (p: THREE.Vector3) => Record<string, number>; top: number; drop: number; halfWidth: number; tex: THREE.Texture; lift?: number; curl?: number }) {
  const NU = 28, NV = 8;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    uv.push(i / NU, 1 - j / NV);
    if (i < NU && j < NV) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const lift = o.lift ?? 0.025, curl = o.curl ?? 0.05;
  const set = (open: number) => {
    for (let i = 0; i <= NU; i++) {
      const s = (i / NU) * 2 - 1;
      const around = s * o.halfWidth * (0.75 + 0.25 * open);
      const top = o.top - curl * s * s * (0.4 + open);
      const depth = Math.max(0.002, open) * o.drop * Math.pow(Math.max(0, 1 - s * s), 0.55);
      for (let j = 0; j <= NV; j++) {
        const sp = surfaceAt(o.shape, around, top + (j / NV) * depth);
        sp.p.addScaledVector(sp.n, lift);
        pos.set([sp.p.x, sp.p.y, sp.p.z], (i * (NV + 1) + j) * 3);
      }
    }
    geo.attributes.position.needsUpdate = true;
  };
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  set(1);
  geo.computeVertexNormals();
  // skinned in the open pose, the only pose it is seen in
  const mesh = o.rig.skin(geo, charToon({ map: o.tex, rim: 0, shade: 0xb0a0b0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), o.weights);
  mesh.visible = false;
  return { mesh, set };
}
