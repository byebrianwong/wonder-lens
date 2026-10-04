import * as THREE from 'three';
import { CumulusField } from '../../../engine/Clouds';
import type { Placement } from '../../../engine/Builders';
import { Rng, TAU, fbm, smoothstep } from '../../../engine/math';
import { NEST } from '../layout';
import { CX, CZ } from './parts';

/*
 * The floor of the calm eye: a sea of sunlit cloud far below the island (about y -40) that fills the eye
 * out to the storm wall, plus a few cumulus heaps rising out of it and some small clouds drifting at the
 * island's own height. They all use the engine's cumulus shader; the set feeds it this scene's fixed
 * morning light each frame.
 */

export const CLOUD_Y = -44;

/** Height of the cloud tops at a point (heaped billows, a shallow hollow under the island). */
export function cloudTop(x: number, z: number) {
  const d = Math.hypot(x - CX, z - CZ);
  const heap = Math.pow(fbm(x * 0.018 + 3.1, z * 0.018 - 1.7, 4), 1.6) * 22 * (0.4 + 0.6 * smoothstep(35, 85, d));
  const fine = fbm(x * 0.07, z * 0.07, 2) * 3;
  // the cloud sinks under the island, so the crystal hangs clear of it
  const hollow = -24 * (1 - smoothstep(35, 85, d));
  return CLOUD_Y + heap + fine + hollow - 4;
}

/** A disc of heaped cloud tops, with the attributes the cumulus shader wants (centre-out normal, height). */
function floorGeometry(radius: number, step: number) {
  const n = Math.ceil((radius * 2) / step);
  const pos: number[] = [], nrm: number[] = [], cn: number[] = [], ch: number[] = [], idx: number[] = [];
  const map = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const e = 1.5;
  let v = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = CX - radius + i * step, z = CZ - radius + j * step;
    if (Math.hypot(x - CX, z - CZ) > radius + step) continue;
    const y = cloudTop(x, z);
    const nx = cloudTop(x - e, z) - cloudTop(x + e, z), nz = cloudTop(x, z - e) - cloudTop(x, z + e);
    const N = new THREE.Vector3(nx, 2 * e, nz).normalize();
    pos.push(x, y, z); nrm.push(N.x, N.y, N.z);
    // the cloud shader blends this with the normal; tipping it up makes the tops read as soft round heaps
    const C = N.clone().multiplyScalar(0.6).add(new THREE.Vector3(0, 0.6, 0)).normalize();
    cn.push(C.x, C.y, C.z);
    ch.push(Math.min(1, Math.max(0, (y - (CLOUD_Y - 14)) / 30)));
    map[j * (n + 1) + i] = v++;
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = map[j * (n + 1) + i], b = map[j * (n + 1) + i + 1], c = map[(j + 1) * (n + 1) + i], d = map[(j + 1) * (n + 1) + i + 1];
    if (a < 0 || b < 0 || c < 0 || d < 0) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('cloudN', new THREE.Float32BufferAttribute(cn, 3));
  g.setAttribute('cloudH', new THREE.Float32BufferAttribute(ch, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** The light of the calm eye, in the shape `CumulusField.update` reads from the sky. */
const MORNING = {
  topColor: { value: new THREE.Color(0x2a66d0) },
  midColor: { value: new THREE.Color(0x8ec0ee) },
  bottomColor: { value: new THREE.Color(0xe4eef0) },
  sunDir: { value: new THREE.Vector3(0.45, 0.62, -0.5).normalize() },
  sunColor: { value: new THREE.Color(0xfff0d8) },
};

export function eyeClouds(rng: Rng, lowDetail: boolean) {
  // heaps rising out of the floor, and a few small clouds at the island's height, kept off the ride's path
  const pl: Placement[] = [];
  for (let i = 0; i < (lowDetail ? 8 : 12); i++) {
    const a = rng.range(0, TAU), d = rng.range(60, NEST.inner - 10);
    const x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;
    pl.push({ x, y: cloudTop(x, z) - 6, z, scale: rng.range(1.6, 2.8), rot: rng.range(0, TAU) });
  }
  for (let i = 0, tries = 0; i < (lowDetail ? 3 : 5) && tries < 60; tries++) {
    const a = rng.range(0, TAU), d = rng.range(100, NEST.inner - 12);
    const x = CX + Math.cos(a) * d, z = CZ + Math.sin(a) * d;
    // the glide in (x near 0, z > -1300) and the fall out (x near 0, z < -1440) stay clear
    if (Math.abs(x) < 45 && (z > -1310 || z < -1430)) continue;
    pl.push({ x, y: rng.range(8, 70), z, scale: rng.range(0.7, 1.2), rot: rng.range(0, TAU) });
    i++;
  }
  const field = new CumulusField(rng, pl, { variants: 4 });
  const floor = new THREE.Mesh(floorGeometry(NEST.inner + 14, lowDetail ? 7 : 4.5), field.material);
  field.group.add(floor);
  return {
    group: field.group,
    update(fog: THREE.FogExp2) { field.update(MORNING, fog, 2.3); },
  };
}
