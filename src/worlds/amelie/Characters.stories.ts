import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import {
  makeAmelieSkipping, makeAmelieWaitress, makeBlindPair, makeBlubber, makeBusker, makeCollignon, makeDufayel, makeGeorgette, makeGnome, makeJoseph,
  makeLovers, makeLucien, makeNinoCrouch, makeNinoTelescope, makePigeons, makeRiders, makeStranger,
} from './characters';

export default {
  title: 'Amelie/Characters',
  args: { ...DEFAULT_ARGS, time: 1 },
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

// Each reaction story starts the reaction, then runs the clock to the middle of it.
export const Amelie = asset(makeAmelieWaitress);
export const AmelieWave = asset(() => { const c = makeAmelieWaitress(); c.wave(); return c; }, { time: 0.9 });
export const AmelieGiggle = asset(() => { const c = makeAmelieWaitress(); c.giggle(); return c; }, { time: 0.7 });
export const AmelieSkippingStones = asset(() => { const c = makeAmelieSkipping(); c.skip(); return c; }, { time: 0.45, light: 'night' });
export const NinoAtTheTelescope = asset(makeNinoTelescope, { light: 'dusk' });
export const NinoWithThePhoto = asset(() => { const c = makeNinoTelescope(); c.show(); return c; }, { time: 1.2, light: 'dusk' });
export const NinoUnderTheBooth = asset(makeNinoCrouch, { light: 'night' });
export const Lucien = asset(makeLucien);
export const LucienEndive = asset(() => { const c = makeLucien(); c.endive(); return c; }, { time: 0.9 });
export const Collignon = asset(makeCollignon);
export const CollignonFlinch = asset(() => { const c = makeCollignon(); c.flinch(); return c; }, { time: 0.3 });
export const Georgette = asset(() => { const c = makeGeorgette(); c.swoon(); return c; }, { time: 0.9 });
export const Joseph = asset(makeJoseph);
export const Dufayel = asset(makeDufayel, { yaw: -40, light: 'dusk' });
export const BlindManAndAmelie = asset(makeBlindPair);
export const PhotoBoothStranger = asset(makeStranger, { light: 'night' });
export const Busker = asset(() => { const c = makeBusker(); c.play(); return c; }, { time: 0.8, light: 'night' });
export const Lovers = asset(makeLovers, { light: 'night' });
export const Gnome = asset(makeGnome);
export const GnomeTipsHisHat = asset(() => { const c = makeGnome(); c.tipHat(); return c; }, { time: 0.5 });
export const Pigeons = asset(() => makePigeons(9, new Rng(53), 2.4));
// Blubber hops on his own every few seconds; 5.1 s in he is mid-hop.
export const Blubber = asset(makeBlubber, { time: 5.1, ground: -0.5, light: 'night' });
export const AmelieAndNino = asset(makeRiders, { yaw: 140 });
