import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, type StageArgs } from '../../stories/stage';
import {
  buildBench, buildCafe, buildCar, buildDufayelHouse, buildGare, buildMetro, buildMoped, buildMoulinRouge, buildPhoneBox, buildPhotobooth,
  buildSacreCoeur, buildStairs,
} from './environment';

export default {
  title: 'Amelie/Buildings and props',
  args: DEFAULT_ARGS,
  argTypes: STAGE_ARG_TYPES,
} satisfies Meta<StageArgs>;

// Settings match how AmelieWorld.ts builds each one.
export const Moped = asset(buildMoped);
export const Cafe = asset(() => buildCafe(new Rng(61)));
export const MoulinRouge = asset(() => buildMoulinRouge(new Rng(63)), { light: 'dusk' });
export const Photobooth = asset(buildPhotobooth);
export const PhoneBox = asset(buildPhoneBox);
export const Bench = asset(buildBench);
export const DufayelHouse = asset(() => buildDufayelHouse(new Rng(67)));
export const SacreCoeur = asset(buildSacreCoeur);
export const Stairs = asset(() => buildStairs(12, 22, 20, 11.5, 3), { yaw: 50 });
export const Gare = asset(() => buildGare(new Rng(71)));
export const Metro = asset(buildMetro);
export const Car = asset(() => buildCar(0x7a9ec2));
