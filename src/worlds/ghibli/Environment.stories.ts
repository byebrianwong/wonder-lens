import * as THREE from 'three';
import type { Meta } from '@storybook/html-vite';
import { cyl, glow, mesh, sphere, toon } from '../../engine/Builders';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, type StageArgs } from '../../stories/stage';
import { buildBathhouse } from './bathhouse';
import { buildCottage, buildFarmhouse } from './farmhouse';
import { buildSailboats, buildSeaTrain } from './environment';

export default {
  title: 'Ghibli/Buildings and vehicles',
  args: DEFAULT_ARGS,
  argTypes: STAGE_ARG_TYPES,
} satisfies Meta<StageArgs>;

/** The paper lantern buildSpiritSea hangs on the bathhouse (copied from environment.ts). */
function lantern(x: number, y: number, z: number, s = 1) {
  const l = new THREE.Group();
  const paper = new THREE.MeshLambertMaterial({ color: 0xff6b4a, emissive: 0xff5a30, emissiveIntensity: 0.9 });
  l.add(mesh(new THREE.SphereGeometry(0.42 * s, 10, 8), paper, 0, 0, 0));
  l.add(sphere(0.22 * s, glow(0xffb36b, 1.9), 0, 0, 0));
  l.add(cyl(0.12 * s, 0.12 * s, 0.14 * s, toon(0x2a2a2a), 0, 0.46 * s, 0));
  l.position.set(x, y, z);
  return l;
}

export const SeaTrain = asset(buildSeaTrain);
export const Bathhouse = asset(() => buildBathhouse(lantern), { light: 'night' });
export const BathhouseByDay = asset(() => buildBathhouse(lantern));
export const Farmhouse = asset(buildFarmhouse);
export const Cottage = asset(buildCottage);
export const Sailboats = asset(() => {
  const b = buildSailboats(new Rng(3), 3, -14, 14, -10, 10);
  return { group: b.group, update: (_dt: number, t: number) => b.update(t) };
}, { ground: false, time: 1 });
