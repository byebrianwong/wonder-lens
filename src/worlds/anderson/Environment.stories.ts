import type { Meta } from '@storybook/html-vite';
import * as THREE from 'three';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import { Rng } from '../../engine/math';
import { boyWithAppleEasel, buildStation, buildZubrowkaExpress, courtesan, dispatchKiosk, lampPosts, palmTree, PAL, signPost, topiary, whitmanLuggageTrolley } from './environment';
import { buildGrandBudapest } from './hotel';

export default {
  title: 'Anderson/Buildings and props',
  args: DEFAULT_ARGS,
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

export const ZubrowkaExpress = asset(buildZubrowkaExpress);
export const Topiary = asset(() => {
  const g = new THREE.Group();
  (['ball', 'cone', 'double'] as const).forEach((k, i) => { const t = topiary(k); t.position.x = (i - 1) * 2.4; g.add(t); });
  return g;
});
// The two signs AndersonWorld puts up (environment.ts), side by side.
export const SignPosts = asset(() => {
  const g = new THREE.Group();
  const camp = signPost('CAMP IVANHOE', 2.6, 0.7, 2.2, 0x8a6a4a, { color: '#fbf7f2', bg: '#4f6a4a', texW: 512, texH: 120, sub: 'Khaki Scouts of North America', frame: 0x8a6a4a });
  const rock = signPost('METEORITE', 2.4, 0.7, 1.6, 0x8a7a6a, { color: '#b93a4c', bg: '#fbf7f2', border: '#b93a4c', texW: 512, texH: 130, sub: 'do not touch', frame: PAL.white });
  camp.position.x = -1.7; rock.position.x = 1.7;
  g.add(camp, rock);
  return g;
}, { yaw: 10 });
export const LampPosts = asset(() => {
  const g = new THREE.Group();
  g.add(lampPosts([{ x: -2, y: 0, z: 0, scale: 1, rot: 0 }], { height: 3.4, color: 0x3c3a48, lamp: 0xffe2a8, head: 'globe' }));
  g.add(lampPosts([{ x: 2, y: 0, z: 0, scale: 1, rot: 0 }], { height: 3.4, color: 0x2f4a3a, lamp: 0xffd48a, head: 'lantern' }));
  return g;
}, { light: 'dusk' });
export const GrandBudapestHotel = asset(buildGrandBudapest, { yaw: 20, pitch: 10 });
export const NebelsbadStation = asset(() => buildStation('NEBELSBAD', 'Republic of Zubrowka', 0, () => 0, () => ({ x: 0, y: 0.45 }), { wall: 0xf6efe2, trim: PAL.burgundy, roof: PAL.burgundy, len: 34, houseSide: -1, seed: 31 }).group, { yaw: 40, pitch: 18 });
export const WhitmanLuggage = asset(whitmanLuggageTrolley, { yaw: 35 });
export const BoyWithApple = asset(boyWithAppleEasel, { yaw: 10, pitch: 4 });
export const CourtesanAuChocolat = asset(() => courtesan(1), { pitch: 20 });
export const FrenchDispatchKiosk = asset(dispatchKiosk, { yaw: 20 });
export const PalmTree = asset(() => palmTree(new Rng(3), 0.15), { pitch: 8 });
