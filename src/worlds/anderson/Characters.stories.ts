import * as THREE from 'three';
import type { Meta } from '@storybook/html-vite';
import { Rng } from '../../engine/math';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import {
  makeAgatha, makeAlien, makeBelafonte, makeBirdFlock, makeCableCar, makeCarChase, makeDeepSearch, makeFunicular, makeGulls, makeGustaveZero, makeJaguarShark,
  makeJellyfish, makeKylie, makeMendlsBox, makeMendlsVan, makeMrFox, makePele, makeRoadrunner, makeSamSuzy, makeScouts, makeSugarCrabs, makeTeamZissou, makeUfo,
} from './characters';

export default {
  title: 'Anderson/Characters',
  args: { ...DEFAULT_ARGS, time: 1 },
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

// Settings match how AndersonWorld.ts builds each character.
export const GustaveAndZero = asset(makeGustaveZero);
export const GustaveBow = asset(() => { const c = makeGustaveZero(); c.bow(); return c; }, { time: 0.8 });
export const Agatha = asset(makeAgatha);
export const AgathaCatchBox = asset(() => { const c = makeAgatha(); c.catchBox(); return c; }, { time: 0.6 });
export const MrFox = asset(makeMrFox);
export const MrFoxWhistleClick = asset(() => { const c = makeMrFox(); c.whistleClick(); return c; }, { time: 0.6 });
export const Kylie = asset(makeKylie);
export const KylieZoningOut = asset(() => { const c = makeKylie(); c.zoneOut(); return c; }, { time: 0.5 });
export const SamAndSuzy = asset(makeSamSuzy);
export const SamAndSuzyBinoculars = asset(() => { const c = makeSamSuzy(); c.binoculars(); return c; }, { time: 0.8 });
export const KhakiScouts = asset(() => makeScouts(7, new Rng(31)));
export const KhakiScoutsSalute = asset(() => { const c = makeScouts(7, new Rng(31)); c.salute(); return c; }, { time: 0.8 });
// The alien only appears once the UFO lowers it; here it is shown standing, without its animation.
export const Alien = asset(() => { const c = makeAlien(); c.group.visible = true; return { group: c.group }; }, { light: 'dusk' });
export const Ufo = asset(makeUfo, { ground: false, light: 'dusk' });
export const UfoBeam = asset(() => { const c = makeUfo(); c.setBeam(true, 12); return c; }, { ground: false, light: 'dusk' });
export const Belafonte = asset(makeBelafonte, { ground: false });
// the port side, cut open like the film's set
export const BelafonteCutaway = asset(makeBelafonte, { ground: false, yaw: -90, pitch: 6, distance: 0.8 });
export const TeamZissou = asset(() => makeTeamZissou(5, new Rng(37)));
export const Pele = asset(makePele);
export const PelePlaying = asset(() => { const c = makePele(); c.play(); return c; }, { time: 0.6 });
export const JaguarShark = asset(() => { const c = makeJaguarShark(); c.surface(); return c; }, { ground: false, time: 6 });
export const DeepSearch = asset(() => { const c = makeDeepSearch(); c.surface(); return c; }, { ground: false, time: 3 });
export const Funicular = asset(() => makeFunicular(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 18, -30)), { yaw: 70 });
export const MendlsVan = asset(makeMendlsVan);
export const MendlsBox = asset(() => makeMendlsBox(1), { time: 0 });
export const CableCar = asset(() => makeCableCar(new THREE.Vector3(0, 8, 0), new THREE.Vector3(0, 28, -40)), { ground: false, yaw: 70 });
export const Roadrunner = asset(makeRoadrunner);
export const RoadrunnerDance = asset(() => { const c = makeRoadrunner(); c.dance(); return c; }, { time: 0.4 });
// the chase partway down a straight road
export const CarChase = asset(() => { const c = makeCarChase(); c.run(0, 0, -200); return c; }, { time: 1, yaw: 60 });
export const SugarCrabs = asset(() => makeSugarCrabs(6, new Rng(83), 0.6), { time: 1 });
export const ElectricJellyfish = asset(() => { const c = makeJellyfish(5, new Rng(89), { x: 0, z: 0, w: 4, d: 4 }); c.level = 1; return c; }, { ground: false, light: 'dusk', time: 1 });
export const Gulls = asset(() => makeGulls(8, new Rng(43)), { ground: false, distance: 0.45 });
export const BirdFlock = asset(() => makeBirdFlock(9), { ground: false });
