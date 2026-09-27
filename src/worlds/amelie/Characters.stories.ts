import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import {
  makeAmelie, makeBlindPair, makeBlubber, makeBusker, makeCarousel, makeCat, makeDufayel, makeFinale, makeGnome, makeGrocers,
  makeLovers, makeNino, makePigeons,
} from './characters';

export default {
  title: 'Amelie/Characters',
  args: { ...DEFAULT_ARGS, time: 1 },
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

// Settings match how AmelieWorld.ts builds each character.
export const Amelie = asset(makeAmelie);
export const AmelieWave = asset(() => { const c = makeAmelie(); c.wave(); return c; }, { time: 0.6 });
export const Grocers = asset(() => makeGrocers(new Rng(51)));
export const GrocersEndive = asset(() => { const c = makeGrocers(new Rng(51)); c.endive(); return c; }, { time: 0.8 });
export const Pigeons = asset(() => makePigeons(9, new Rng(53), 2.4));
export const Nino = asset(makeNino);
export const NinoStand = asset(() => { const c = makeNino(); c.stand(); return c; }, { time: 0.8 });
export const Gnome = asset(makeGnome);
export const GnomeTipHat = asset(() => { const c = makeGnome(); c.tipHat(); return c; }, { time: 0.5 });
export const BlindPair = asset(makeBlindPair);
export const Dufayel = asset(makeDufayel);
export const Cat = asset(makeCat);
export const Carousel = asset(() => makeCarousel(new Rng(57)));
export const CarouselLit = asset(() => { const c = makeCarousel(new Rng(57)); c.lightsOn(); return c; }, { light: 'night', time: 2 });
// Blubber hides under the water and hops every few seconds; 4.4 s in, he is mid-hop.
export const Blubber = asset(makeBlubber, { time: 4.4, ground: 0 });
export const Busker = asset(makeBusker);
export const BuskerPlaying = asset(() => { const c = makeBusker(); c.play(); return c; }, { time: 0.8 });
export const Lovers = asset(makeLovers);
export const Finale = asset(makeFinale, { light: 'dusk' });
