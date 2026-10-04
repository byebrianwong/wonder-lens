import * as THREE from 'three';
import { SETS } from '../layout';
import { optimize, showRange, type BuiltSet, type MountDef, type SetContext, type SetModule, type ZLightKey } from '../common';
import { makePlan, Z } from '../ski/plan';
import { buildRun } from '../ski/run';
import { buildMountain } from '../ski/terrain';
import { buildToboggan } from '../ski/toboggan';

/*
 * Part Three: Gabelmeister's Peak (The Grand Budapest Hotel), z -560 to -880.
 */

const R = SETS.ski;

export const LIGHTS: ZLightKey[] = [
  { z: -562, skyTop: 0x2c5cc4, skyMid: 0x7eaae8, skyBottom: 0xf2dbe6, fog: 0xdcdff2, fogDensity: 0.0013, sunDir: [0.75, 0.5, -0.38], sunColor: 0xffd8d0, sunIntensity: 2.2, hemiSky: 0xb4c8f4, hemiGround: 0xeadcf0, hemiIntensity: 0.95, exposure: 0.96, bloom: 0.32, saturation: 1.1, sunGlow: 0.7, sunSize: 0.022, horizonHeight: 0.1 },
  { z: -878, skyTop: 0x2c5cc4, skyMid: 0x7eaae8, skyBottom: 0xf2dbe6, fog: 0xdcdff2, fogDensity: 0.0013, sunDir: [0.75, 0.5, -0.38], sunColor: 0xffd8d0, sunIntensity: 2.2, hemiSky: 0xb4c8f4, hemiGround: 0xeadcf0, hemiIntensity: 0.95, exposure: 0.96, bloom: 0.32, saturation: 1.1, sunGlow: 0.7, sunSize: 0.022, horizonHeight: 0.1 },
];

function build(ctx: SetContext): BuiltSet {
  const { road } = ctx;
  const plan = makePlan(road);
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);

  const run = buildRun(plan);
  statics.add(run.group);
  const avoid = () => false;
  const mountain = buildMountain(plan, avoid, ctx.lowDetail);
  group.add(mountain.group);
  optimize(statics);

  // ---------- the rider's toboggan ----------
  const sled = buildToboggan({ rider: true });
  const mount: MountDef = {
    kind: 'sled', group: sled.group, seat: sled.seat, z0: R.z0, z1: R.z1, tilt: 1, bank: 0.35,
    update(dt, t, ride) { sled.update(dt, t, ride.speedMult); },
  };

  return {
    id: 'ski', group, show: showRange(road, R, 8, 10), occluders: mountain.occluders, subjects: [], water: -Infinity,
    floor: (x, z) => mountain.ground(x, z),
    mounts: [mount],
    update() { void Z; },
  };
}

export const SKI: SetModule = { build, lights: LIGHTS, env: () => ({ wind: 0.55, birds: 0 }) };
