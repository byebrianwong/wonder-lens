import * as THREE from 'three';
import { Rng, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { optimize, showRange, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { buildTheatre } from '../asteroid/theatre';
import { NIGHT, STAGE_Y, HOUSE_Y, ARCH } from '../asteroid/plan';

const R = SETS.asteroid;

export const LIGHTS: ZLightKey[] = [
  { z: -1500, skyTop: 0x1a1c22, skyMid: 0x22252c, skyBottom: 0x2a2c30, fog: 0xf0d8c4, fogDensity: 0.0022, sunDir: [0.22, 0.8, 0.55], sunColor: 0xfff6ea, sunIntensity: 2.3, hemiSky: 0xcfe6ee, hemiGround: 0xe8c8b0, hemiIntensity: 0.95, exposure: 0.98, bloom: 0.3, saturation: 1.15, sunGlow: 0, cloudShadow: 0 },
  { z: NIGHT.a, skyTop: 0x1a1c22, skyMid: 0x22252c, skyBottom: 0x2a2c30, fog: 0xf0d8c4, fogDensity: 0.0022, sunDir: [0.22, 0.8, 0.55], sunColor: 0xfff6ea, sunIntensity: 2.3, hemiSky: 0xcfe6ee, hemiGround: 0xe8c8b0, hemiIntensity: 0.95, exposure: 0.98, bloom: 0.3, saturation: 1.15, sunGlow: 0, cloudShadow: 0 },
  { z: NIGHT.b, skyTop: 0x05080c, skyMid: 0x081016, skyBottom: 0x0c1a20, fog: 0x0e3640, fogDensity: 0.0026, sunDir: [-0.2, 0.75, 0.45], sunColor: 0x9ac8e8, sunIntensity: 0.55, hemiSky: 0x2a6a80, hemiGround: 0x183a3a, hemiIntensity: 0.75, exposure: 1.05, bloom: 0.55, saturation: 1.1, sunGlow: 0, cloudShadow: 0 },
];

function build(ctx: SetContext): BuiltSet {
  const { road } = ctx;
  const group = new THREE.Group();
  const rng = new Rng(1955);
  const theatre = buildTheatre(rng);
  group.add(theatre.statics, theatre.live);
  optimize(theatre.statics);

  return {
    id: 'asteroid', group, show: showRange(road, R, 6, 8), occluders: theatre.occluders, subjects: [], water: -Infinity,
    floor: (_x, z) => (z > ARCH.apron ? HOUSE_Y : STAGE_Y),
    update(dt, t, ride) {
      const z = ride.position.z;
      const night = smoothstep(NIGHT.a, NIGHT.b, z);
      theatre.setNight(night, t);
      theatre.update(dt, t, z, night);
    },
  };
}

export const ASTEROID: SetModule = { build, lights: LIGHTS };
