import * as THREE from 'three';
import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import { buildMoped } from './moped';
import { makeCarousel } from './sets/butte';
import { eiffelTower, sacreCoeur } from './landmarks';
import { parisBuilding, streetPalette } from './buildings';
import { bench, morrisColumn, parisLamps, produceStand } from './props';

export default {
  title: 'Amelie/Buildings and props',
  args: DEFAULT_ARGS,
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

/** One Paris building with a shopfront, as the street builds them. */
function building(shop: boolean) {
  const rng = new Rng(81);
  const pal = streetPalette(rng, { lit: 0.12, glass: 'day', litStrength: 0.5 });
  return parisBuilding({
    bays: 4, storeys: 5, depth: 12, facade: pal.facades[0], side: pal.sides[0], shopGlow: 0.3,
    ground: shop ? { kind: 'shop', shop: { name: 'BOULANGERIE', paint: 0x6a1a1c, goods: 'bread', sub: 'Pain cuit au feu de bois', seed: 201, w: 1024, h: 280 }, awning: [0xb8282a, 0xf0e2c0] } : { kind: 'door', mat: pal.doors[0] },
    balconies: [1, 4], flowers: 0.5, rng,
  });
}

export const Moped = asset(buildMoped);
export const Carousel = asset(() => makeCarousel(new Rng(57)), { light: 'dusk', time: 1 });
export const CarouselLit = asset(() => { const c = makeCarousel(new Rng(57)); c.lightsOn(); return c; }, { light: 'night', time: 2 });
export const SacreCoeur = asset(sacreCoeur, { yaw: 30, pitch: 18 });
export const EiffelTower = asset(() => eiffelTower(150).group, { light: 'dusk', yaw: 20 });
export const ParisBuildingShop = asset(() => building(true), { yaw: 20 });
export const ParisBuildingDoor = asset(() => building(false), { yaw: -20 });
export const ProduceStand = asset(() => produceStand(new Rng(91), { w: 11, d: 5.5, h: 3.2, tiers: 3, kinds: ['apple', 'orange', 'lemon', 'greenApple'], fruit: 0.36, prices: ['2,40 F', '3,10 F'] }), { pitch: 25 });
export const MorrisColumn = asset(morrisColumn);
export const StreetLamp = asset(() => parisLamps([{ x: 0, y: 0, z: 0, scale: 1, rot: 0 }]), { light: 'dusk' });
export const Bench = asset(() => { const g = new THREE.Group(); g.add(bench()); return g; });
