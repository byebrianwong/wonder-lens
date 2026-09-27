import * as THREE from 'three';
import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, type StageArgs } from '../../stories/stage';
import {
  makeAgatha, makeAlien, makeBelafonte, makeBirdFlock, makeDeepSearch, makeFunicular, makeGulls, makeGustaveZero, makeJaguarShark,
  makeMendlsBox, makeMendlsVan, makeMrFox, makeSamSuzy, makeScouts, makeTeamZissou, makeUfo,
} from './characters';

export default {
  title: 'Anderson/Characters',
  args: { ...DEFAULT_ARGS, time: 1 },
  argTypes: STAGE_ARG_TYPES,
} satisfies Meta<StageArgs>;

// Settings match how AndersonWorld.ts builds each character.
export const GustaveAndZero = asset(makeGustaveZero);
export const GustaveBow = asset(() => { const c = makeGustaveZero(); c.bow(); return c; }, { time: 0.8 });
export const Agatha = asset(makeAgatha);
export const AgathaCatchBox = asset(() => { const c = makeAgatha(); c.catchBox(); return c; }, { time: 0.6 });
export const MrFox = asset(makeMrFox);
export const MrFoxWhistleClick = asset(() => { const c = makeMrFox(); c.whistleClick(); return c; }, { time: 0.6 });
export const SamAndSuzy = asset(makeSamSuzy);
export const SamAndSuzyBinoculars = asset(() => { const c = makeSamSuzy(); c.binoculars(); return c; }, { time: 0.8 });
export const KhakiScouts = asset(() => makeScouts(7, new Rng(31)));
export const KhakiScoutsSalute = asset(() => { const c = makeScouts(7, new Rng(31)); c.salute(); return c; }, { time: 0.8 });
// The alien only appears once the UFO lowers it; here it is shown standing, without its animation.
export const Alien = asset(() => { const c = makeAlien(); c.group.visible = true; return { group: c.group }; }, { light: 'dusk' });
export const Ufo = asset(makeUfo, { ground: false, light: 'dusk' });
export const UfoBeam = asset(() => { const c = makeUfo(); c.setBeam(true, 12); return c; }, { ground: false, light: 'dusk' });
export const Belafonte = asset(makeBelafonte, { ground: false });
export const TeamZissou = asset(() => makeTeamZissou(5, new Rng(37)));
export const JaguarShark = asset(() => { const c = makeJaguarShark(new Rng(41)); c.surface(); return c; }, { ground: false, time: 6 });
export const DeepSearch = asset(() => { const c = makeDeepSearch(); c.surface(); return c; }, { ground: false, time: 3 });
export const Funicular = asset(() => makeFunicular(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 18, -30)), { yaw: 70 });
export const MendlsVan = asset(makeMendlsVan);
export const MendlsBox = asset(() => makeMendlsBox(1), { time: 0 });
export const Gulls = asset(() => makeGulls(8, new Rng(43)), { ground: false, distance: 0.45 });
export const BirdFlock = asset(() => makeBirdFlock(9), { ground: false });
