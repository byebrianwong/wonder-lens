import * as THREE from 'three';
import type { Meta } from '@storybook/html-vite';
import { asset, DEFAULT_ARGS, STAGE_ARG_TYPES, STAGE_PARAMETERS, type StageArgs } from '../../stories/stage';
import { makeConductor, makeGustave, makeLiftOperator, makeMadameD, makePorter, makeZero } from './hotel/cast';
import { makeAgatha, makeMendl } from './mendls/cast';
import { makeJopling } from './ski/cast';
import { makeKylie, makeMrFox, makeWolf } from './fox/cast';
import { makeSam, makeScout, makeSuzy } from './moonrise/cast';
import { makeAlien, makeAugie } from './asteroid/cast';
import { makeAtari, makeChief } from './isle/cast';
import { makePele, makeZissou } from './aquatic/cast';
import { makeTeamRow } from './aquatic/crew';
import { JaguarShark as Shark } from './aquatic/shark';
import { Octopus } from './aquatic/octopus';

/*
 * The Zubrowka Express's characters, one scene at a time. Each comes from its scene's cast.ts (the builders
 * the curtain call uses too). The "bow" stories show each one's curtain-call gesture partway through.
 */

export default {
  title: 'Anderson/Characters',
  args: { ...DEFAULT_ARGS, time: 1 },
  argTypes: STAGE_ARG_TYPES,
  parameters: STAGE_PARAMETERS,
} satisfies Meta<StageArgs>;

const bowing = <T extends { bow(): void }>(make: () => T) => () => { const c = make(); c.bow(); return c; };

// ---- The Grand Budapest Hotel ----
export const Gustave = asset(makeGustave);
export const GustaveBow = asset(bowing(makeGustave), { time: 0.8 });
export const Zero = asset(makeZero);
export const MadameD = asset(makeMadameD);
export const LiftOperator = asset(makeLiftOperator);
export const Conductor = asset(makeConductor);
// from the side: from the front the stack of cases on his trolley hides him
export const Porter = asset(makePorter, { yaw: 100 });
// ---- Mendl's ----
export const Agatha = asset(makeAgatha);
export const AgathaBow = asset(bowing(makeAgatha), { time: 0.8 });
export const Mendl = asset(makeMendl);
// ---- the ski chase ----
export const Jopling = asset(makeJopling);
// ---- Fantastic Mr. Fox ----
export const MrFox = asset(makeMrFox);
export const MrFoxBow = asset(bowing(makeMrFox), { time: 0.8 });
export const Kylie = asset(makeKylie);
export const Wolf = asset(makeWolf);
// ---- Moonrise Kingdom ----
export const Sam = asset(makeSam);
export const Suzy = asset(makeSuzy);
export const KhakiScout = asset(makeScout);
// ---- Asteroid City ----
export const Alien = asset(makeAlien, { light: 'dusk' });
export const Augie = asset(makeAugie);
// ---- Isle of Dogs ----
export const Chief = asset(() => makeChief());
export const ChiefBow = asset(bowing(() => makeChief()), { time: 0.8 });
export const Atari = asset(makeAtari);
// ---- The Life Aquatic ----
// in daylight, so the uniforms' powder blue can be checked (under the ride's sundown they look grey)
export const SteveZissou = asset(makeZissou);
export const SteveZissouBow = asset(bowing(makeZissou), { time: 1.8 });
export const TeamZissou = asset(() => {
  const r = makeTeamRow(1.05);
  return { group: r.group, update: (dt: number, t: number) => r.update(dt, t, null) };
});
export const TeamZissouPointing = asset(() => {
  const r = makeTeamRow(1.05);
  r.point(new THREE.Vector3(0.6, 2.4, 6));
  return { group: r.group, update: (dt: number, t: number) => r.update(dt, t, null) };
}, { time: 1.2 });
export const Pele = asset(makePele);
export const PelePlaying = asset(bowing(makePele), { time: 1.4 });
const cam = new THREE.Vector3(0, 2, 12);
export const JaguarShark = asset(() => {
  const s = new Shark();
  s.presence = 1;
  return { group: s.group, update: (dt: number) => s.update(dt, cam, 1) };
}, { ground: false, light: 'night', yaw: 70 });
export const PaisleyOctopus = asset(() => {
  const o = new Octopus(6);
  // the arms are tubes that take their shape on the first stop-motion frame (12 a second); give them one
  // before the stage measures the octopus
  o.update(1 / 12, cam);
  return { group: o.group, update: (dt: number) => o.update(dt, cam) };
}, { ground: false, light: 'dusk' });
