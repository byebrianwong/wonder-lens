import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CumulusField } from '../../engine/Clouds';
import { Rng, TAU } from '../../engine/math';
import type { Placement } from '../../engine/Builders';

/**
 * Clouds for the flight, including the animals little Amélie saw in the sky: a teddy bear, a rabbit and a duck.
 * Each animal is built from the same soft puffs as the engine's cumulus and drawn with its material, so it
 * takes the sunset colours. Moving parts (the bear's arm, the rabbit's ears, the duck's head) are their own
 * meshes so they can wave.
 */

type Puff = [number, number, number, number];

/** Merge puffs into one cloud geometry with the attributes the cumulus shader wants (centre-out normal, height). */
function puffGeometry(puffs: Puff[], rng: Rng, centre?: THREE.Vector3, size?: THREE.Vector3) {
  const geos = puffs.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r * rng.range(0.92, 1.08), 2);
    g.deleteAttribute('uv');
    g.translate(x, y, z);
    return g;
  });
  const g = mergeGeometries(geos, false)!;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const ctr = centre ?? box.getCenter(new THREE.Vector3()), sz = size ?? box.getSize(new THREE.Vector3());
  const cn = new Float32Array(pos.count * 3), ch = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3((pos.getX(i) - ctr.x) / (sz.x * 0.5), (pos.getY(i) - ctr.y) / (sz.y * 0.5) + 0.3, (pos.getZ(i) - ctr.z) / (sz.z * 0.5)).normalize();
    cn.set([v.x, v.y, v.z], i * 3);
    ch[i] = Math.min(1, Math.max(0, (pos.getY(i) - (ctr.y - sz.y * 0.5)) / sz.y));
  }
  g.setAttribute('cloudN', new THREE.BufferAttribute(cn, 3));
  g.setAttribute('cloudH', new THREE.BufferAttribute(ch, 1));
  g.computeBoundingSphere();
  return g;
}

/** A blob of puffs filling an ellipsoid. */
function blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, pr: number, rng: Rng): Puff[] {
  const out: Puff[] = [];
  for (let i = 0; i < n; i++) {
    const u = rng.range(0, TAU), v = Math.acos(rng.range(-1, 1)), k = Math.cbrt(rng.next()) * 0.75;
    out.push([cx + Math.sin(v) * Math.cos(u) * rx * k, cy + Math.cos(v) * ry * k, cz + Math.sin(v) * Math.sin(u) * rz * k, pr * rng.range(0.8, 1.2)]);
  }
  return out;
}

export interface AnimalCloud { group: THREE.Group; parts: Record<string, THREE.Object3D> }

/** A teddy bear sitting in the sky, facing +z: round head with ears and a muzzle, a fat body, stubby arms and legs. */
export function cloudBear(mat: THREE.Material, rng: Rng): AnimalCloud {
  const g = new THREE.Group();
  const body = new THREE.Mesh(puffGeometry([...blob(0, 0, 0, 9, 10, 7, 22, 3.6, rng), ...blob(0, 13, 0, 7, 6.5, 6, 18, 3.2, rng), ...blob(0, 11.5, 5, 2.8, 2.2, 2, 5, 1.6, rng), ...blob(-6, 19, 0, 2.4, 2.4, 2, 5, 1.6, rng), ...blob(6, 19, 0, 2.4, 2.4, 2, 5, 1.6, rng), ...blob(-5, -9, 4, 3, 2.6, 4, 7, 2.2, rng), ...blob(5, -9, 4, 3, 2.6, 4, 7, 2.2, rng)], rng), mat);
  g.add(body);
  const armL = new THREE.Group(); armL.position.set(-8, 4, 0); g.add(armL);
  armL.add(new THREE.Mesh(puffGeometry(blob(-2, -3, 1, 2.6, 4.5, 2.6, 8, 2, rng), rng), mat));
  const armR = new THREE.Group(); armR.position.set(8, 4, 0); g.add(armR);
  armR.add(new THREE.Mesh(puffGeometry(blob(2, -3, 1, 2.6, 4.5, 2.6, 8, 2, rng), rng), mat));
  return { group: g, parts: { armL, armR } };
}

/** A rabbit, sitting up, with two tall ears that can twitch. */
export function cloudRabbit(mat: THREE.Material, rng: Rng): AnimalCloud {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(puffGeometry([...blob(0, 0, 0, 8, 7, 7, 18, 3.4, rng), ...blob(0, 9.5, 2, 5, 4.6, 4.6, 12, 2.8, rng), ...blob(-7.5, -3, -2, 2.8, 2.8, 2.8, 5, 2, rng), ...blob(4, -6, 5, 3, 1.8, 3.4, 6, 1.8, rng)], rng), mat));
  const earL = new THREE.Group(); earL.position.set(-1.8, 13, 1); g.add(earL);
  earL.add(new THREE.Mesh(puffGeometry(blob(0, 5.5, 0, 1.6, 6, 1.4, 9, 1.4, rng), rng), mat));
  const earR = new THREE.Group(); earR.position.set(1.8, 13, 1); g.add(earR);
  earR.add(new THREE.Mesh(puffGeometry(blob(0, 5.5, 0, 1.6, 6, 1.4, 9, 1.4, rng), rng), mat));
  earL.rotation.z = 0.15; earR.rotation.z = -0.25;
  return { group: g, parts: { earL, earR } };
}

/** A duck swimming across the sky, its head on a neck that can bob. */
export function cloudDuck(mat: THREE.Material, rng: Rng): AnimalCloud {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(puffGeometry([...blob(0, 0, 0, 12, 5.5, 6, 22, 3.4, rng), ...blob(-11, 3, 0, 4, 3.5, 3.5, 7, 2.4, rng)], rng), mat));
  const head = new THREE.Group(); head.position.set(9, 4, 0); g.add(head);
  head.add(new THREE.Mesh(puffGeometry([...blob(1, 5, 0, 2.6, 5, 2.4, 9, 2, rng), ...blob(2, 11, 0, 3.8, 3.4, 3.4, 9, 2.4, rng), ...blob(6.5, 10.5, 0, 2.6, 1.2, 1.6, 5, 1.2, rng)], rng), mat));
  return { group: g, parts: { head } };
}

/** The flight's sky: ordinary cumulus plus the three animals. */
export function buildSkyClouds(rng: Rng, placements: Placement[]) {
  const field = new CumulusField(rng, placements, { variants: 6 });
  const mat = field.material;
  const bear = cloudBear(mat, rng), rabbit = cloudRabbit(mat, rng), duck = cloudDuck(mat, rng);
  field.group.add(bear.group, rabbit.group, duck.group);
  return { field, bear, rabbit, duck };
}
