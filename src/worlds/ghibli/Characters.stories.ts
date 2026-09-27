import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, type StageArgs } from '../../stories/stage';
import {
  makeCatbus, makeChihiroSeated, makeDirigible, makeHaku, makeHoppingLamp, makeHowlsCastle, makeKiki, makeKodama, makeLaputa,
  makeNoFace, makePonyoSchool, makeRadishSpirit, makeSatsukiMei, makeSeagulls, makeShadowPassengers, makeSootSprites, makeTotoro,
} from './characters';

export default {
  title: 'Ghibli/Characters',
  args: { ...DEFAULT_ARGS, time: 1 },
  argTypes: STAGE_ARG_TYPES,
} satisfies Meta<StageArgs>;

// Settings match how GhibliWorld.ts builds each character.
export const Totoro = asset(() => makeTotoro({ umbrella: true }));
export const TotoroRoar = asset(() => { const c = makeTotoro({ umbrella: true }); c.roar(); return c; }, { time: 0.7 });
export const ChuTotoro = asset(() => makeTotoro({ color: 0x5f7fa8, belly: 0xe8e2d0, scale: 0.62, chevrons: false, bag: true }));
export const ChibiTotoro = asset(() => makeTotoro({ color: 0xf4f1ea, belly: -1, scale: 0.34, chevrons: false, leaf: true }));
export const Catbus = asset(makeCatbus);
export const Kiki = asset(makeKiki, { ground: false });
export const KikiWave = asset(() => { const c = makeKiki(); c.wave(); return c; }, { ground: false, time: 0.6 });
export const NoFace = asset(makeNoFace);
export const NoFaceOffer = asset(() => { const c = makeNoFace(); c.offer(); return c; }, { time: 0.8 });
export const SootSprites = asset(() => makeSootSprites(11, new Rng(5), 3.2));
export const Haku = asset(makeHaku, { ground: false, light: 'dusk', pitch: 20 });
export const Kodama = asset(() => makeKodama(14, new Rng(9), 7));
export const PonyoSchool = asset(() => makePonyoSchool(14, new Rng(13)), { ground: false });
export const RadishSpirit = asset(makeRadishSpirit);
export const RadishSpiritBow = asset(() => { const c = makeRadishSpirit(); c.bow(); return c; }, { time: 0.6 });
export const HoppingLamp = asset(makeHoppingLamp, { light: 'dusk' });
export const Laputa = asset(makeLaputa, { ground: false, pitch: 4 });
export const HowlsCastle = asset(makeHowlsCastle);
export const ShadowPassengers = asset(() => makeShadowPassengers(4, new Rng(17), 8), { light: 'night' });
export const Seagulls = asset(() => makeSeagulls(9, new Rng(21)), { ground: false, distance: 0.45 });
export const Dirigible = asset(makeDirigible, { ground: false });
export const SatsukiAndMei = asset(makeSatsukiMei);
export const SatsukiAndMeiWave = asset(() => { const c = makeSatsukiMei(); c.wave(); return c; }, { time: 0.6 });
export const ChihiroSeated = asset(makeChihiroSeated);
