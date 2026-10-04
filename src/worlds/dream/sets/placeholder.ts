import * as THREE from 'three';
import { SETS, type SetId } from '../layout';
import { ribbon, subCurve, showRange, type BuiltSet, type SetContext } from '../common';

/** A stand-in scene: a coloured strip under the path, so the ride can be run before the scene is built. */
export function placeholderSet(id: SetId, ctx: SetContext, color: number): BuiltSet {
  const r = SETS[id];
  const group = new THREE.Group();
  const curve = subCurve(ctx.road, r.z0, r.z1, 80);
  const strip = new THREE.Mesh(ribbon(curve, -6, 6, 160, -0.05, 4), new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  strip.receiveShadow = true;
  group.add(strip);
  return {
    id, group, show: showRange(ctx.road, r), occluders: [], subjects: [], water: -Infinity,
    floor: (_x, z) => ctx.road.at(z).y,
    update() { /* nothing moves */ },
  };
}
