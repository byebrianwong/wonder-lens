import * as THREE from 'three';
import { SETS } from '../layout';
import { optimize, showRange, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { buildTrashLand } from '../isle/terrain';
import { buildCableLine, buildGondolaMount } from '../isle/gondola';
import { seaTexture } from '../isle/paint';
import { SEA, ZSNAP, PACK, CHIEF, NUTMEG, SPOTS } from '../isle/plan';
import { makeDog, DOGS, DogLife } from '../isle/dogs';

/*
 * Part Seven: Trash Island (Isle of Dogs).
 */

const R = SETS.isle;

export const LIGHTS: ZLightKey[] = [
  { z: -1796, skyTop: 0x8c9cac, skyMid: 0xcfc6b4, skyBottom: 0xe6d2b0, fog: 0xcdbfa8, fogDensity: 0.0024, sunDir: [0.55, 0.5, 0.45], sunColor: 0xffd8a8, sunIntensity: 1.9, hemiSky: 0xc4ccd4, hemiGround: 0x7a6450, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.3, saturation: 0.92, tint: 0xfff2e4, sunGlow: 0.8, sunSize: 0.03, horizonHeight: 0.1 },
  { z: -2090, skyTop: 0x8c9cac, skyMid: 0xcfc6b4, skyBottom: 0xe6d2b0, fog: 0xcdbfa8, fogDensity: 0.0024, sunDir: [0.55, 0.5, 0.45], sunColor: 0xffd8a8, sunIntensity: 1.9, hemiSky: 0xc4ccd4, hemiGround: 0x7a6450, hemiIntensity: 0.95, exposure: 1.0, bloom: 0.3, saturation: 0.92, tint: 0xfff2e4, sunGlow: 0.8, sunSize: 0.03, horizonHeight: 0.1 },
];

function build(ctx: SetContext): BuiltSet {
  const { road } = ctx;
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);

  const land = buildTrashLand(road, ctx.lowDetail);
  group.add(land.group);
  const ground = (x: number, z: number) => Math.max(SEA, land.top(x, z));

  const cables = buildCableLine(road, ground, ctx.lowDetail);
  group.add(cables.group);
  const gondola = buildGondolaMount(ctx, R.z0, R.z1);

  // the sea
  const seaTex = seaTexture().clone();
  seaTex.needsUpdate = true;
  seaTex.repeat.set(1400 / 24, 1000 / 24);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1000), new THREE.MeshLambertMaterial({ map: seaTex }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA, -2150);
  sea.receiveShadow = true;
  group.add(sea);

  // dogs (test placement)
  const lives: DogLife[] = [];
  const put = (o: ReturnType<typeof DOGS.rex>, x: number, z: number, yaw: number, base: Partial<import('../isle/dogs').DogPose> = {}) => {
    const d = makeDog(o);
    d.group.position.set(x, ground(x, z), z);
    d.group.rotation.y = yaw;
    group.add(d.group);
    const l = new DogLife(d, o.seed);
    l.base = base;
    lives.push(l);
  };
  put(DOGS.rex(), PACK.x + 4.5, PACK.z, 0.3);
  put(DOGS.king(), PACK.x + 1.5, PACK.z, 0.2, { sit: 1 });
  put(DOGS.boss(), PACK.x - 1.5, PACK.z, 0.1);
  put(DOGS.duke(), PACK.x - 4.5, PACK.z, 0.0, { sit: 1 });
  put(DOGS.chief(), CHIEF.x, CHIEF.z, 0.5);
  put(DOGS.nutmeg(), NUTMEG.x, NUTMEG.z, 0.6, { sit: 1 });
  put(DOGS.spots(), SPOTS.x, SPOTS.z, -0.6);
  const camPos = new THREE.Vector3();

  statics.updateMatrixWorld(true);
  optimize(statics);

  return {
    id: 'isle', group, show: showRange(road, R, 8, 8), occluders: [], subjects: [], water: SEA,
    floor: (x, z) => { const t = land.top(x, z); return t > -1e6 ? t : SEA - 2; },
    mounts: [gondola.def],
    update(dt, t, ride) {
      cables.update(dt, t, ride);
      ctx.camera.getWorldPosition(camPos);
      for (const l of lives) l.update(dt, camPos);
      seaTex.offset.set(Math.sin(t * 0.05) * 0.02, t * 0.004);
      void ZSNAP;
    },
  };
}

export const ISLE: SetModule = {
  build, lights: LIGHTS,
  env: (z) => ({ wind: 0.45, sea: z < -2000 ? 0.5 : 0.25, birds: 0.15 }),
};
