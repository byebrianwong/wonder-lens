import type { Meta } from '@storybook/html-vite';
import { fluffyForest, flowerField, type FluffyStyle } from './Foliage';
import { Rng } from './math';
import type { Placement } from './Builders';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, type StageArgs } from '../stories/stage';

export default {
  title: 'Engine/Nature',
  args: DEFAULT_ARGS,
  argTypes: STAGE_ARG_TYPES,
} satisfies Meta<StageArgs>;

/** Three trees in a row, so each canopy variant shows. Styles match the Ghibli forests. */
function trees(style: FluffyStyle) {
  const at: Placement[] = [-7, 0, 7].map((x, i) => ({ x, y: 0, z: i === 1 ? -2 : 0, scale: 1, rot: i * 1.3 }));
  return fluffyForest(style, at, new Rng(11), { castShadow: true, variants: 3 });
}

export const RoundTrees = asset(() => trees({ shape: 'round', trunk: 0x6a5040, leaves: [0x5a9a44, 0x6aa84c, 0x4e8e40] }));
export const BroadTrees = asset(() => trees({ shape: 'broad', trunk: 0x5e4838, leaves: [0x4c8d3a, 0x5a9a42, 0x3f7f36, 0x6ea24c] }));
export const ConiferTrees = asset(() => trees({ shape: 'conifer', trunk: 0x5a4636, leaves: [0x2f6b46, 0x3b7a4f, 0x2a5f40] }));
export const PoplarTrees = asset(() => trees({ shape: 'poplar', trunk: 0x6a5040, leaves: [0x3f8436, 0x4c9240] }));
export const Bushes = asset(() => trees({ shape: 'bush', trunk: 0x5e4838, leaves: [0x4c8d3a, 0x5a9a42] }));
export const Flowers = asset(() => {
  const rng = new Rng(4);
  const at: Placement[] = Array.from({ length: 220 }, () => ({ x: rng.range(-4, 4), y: 0, z: rng.range(-3, 3), scale: rng.range(0.8, 1.3), rot: rng.range(0, 6.28) }));
  return flowerField(at, [0, 1, 2, 3]);
}, { pitch: 30, ground: 0 });
