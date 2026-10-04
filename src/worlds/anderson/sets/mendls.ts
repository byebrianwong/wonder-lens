import * as THREE from 'three';
import { Drift } from '../../../engine/Particles';
import { clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { optimize, showRange, subCurve, zWindow, type BuiltSet, type MountDef, type SetContext, type SetEnv, type SetModule, type ZLightKey } from '../common';
import { buildPastryBox } from '../mendls/box';
import { buildConveyor } from '../mendls/conveyor';
import { buildRooms } from '../mendls/rooms';
import { HALL, OVENS, PACK, ROT, SHOP, SIDE, Y } from '../mendls/plan';
import { MC } from '../mendls/textures';

/*
 * Part Two: Mendl's. The rider rides in an open pink Mendl's box along a bakery conveyor through the
 * patisserie at giant scale: the icing hall, the ovens, the tower of Courtesans in the rotunda, and the shop,
 * where Agatha packs the box and the lid closes. See mendls/plan.ts for the layout.
 */

const R = SETS.mendls;

const PINK_FOG = 0xf6dce0;
export const LIGHTS: ZLightKey[] = [
  { z: -296, skyTop: 0xa8d0f0, skyMid: 0xf8dce4, skyBottom: 0xfff0f0, fog: PINK_FOG, fogDensity: 0.0052, sunDir: [-0.55, 0.75, 0.3], sunColor: 0xfff0e0, sunIntensity: 1.6, hemiSky: 0xfbeef0, hemiGround: 0xe8c8cc, hemiIntensity: 1.25, exposure: 1.02, bloom: 0.42, saturation: 1.12, tint: 0xfff6f4, sunGlow: 0, sunSize: 0 },
  { z: -400, skyTop: 0xa8d0f0, skyMid: 0xf8dce4, skyBottom: 0xfff0f0, fog: 0xf6dcd4, fogDensity: 0.0056, sunDir: [-0.5, 0.78, 0.25], sunColor: 0xffe8d0, sunIntensity: 1.5, hemiSky: 0xfbeee8, hemiGround: 0xe8c4bc, hemiIntensity: 1.2, exposure: 1.02, bloom: 0.46, saturation: 1.12, tint: 0xfff2ec, sunGlow: 0, sunSize: 0 },
  { z: -470, skyTop: 0xa8d0f0, skyMid: 0xf8dce4, skyBottom: 0xfff0f0, fog: 0xeee0ec, fogDensity: 0.005, sunDir: [-0.2, 0.95, 0.1], sunColor: 0xfff4ec, sunIntensity: 1.6, hemiSky: 0xeef2fb, hemiGround: 0xe0ccd8, hemiIntensity: 1.25, exposure: 1.02, bloom: 0.45, saturation: 1.12, tint: 0xfaf6ff, sunGlow: 0, sunSize: 0 },
  { z: -530, skyTop: 0xa8d0f0, skyMid: 0xf8dce4, skyBottom: 0xfff0f0, fog: 0xf6dce4, fogDensity: 0.0055, sunDir: [0.1, 0.6, -0.8], sunColor: 0xfff2e8, sunIntensity: 1.5, hemiSky: 0xfbeef4, hemiGround: 0xe8c8d4, hemiIntensity: 1.25, exposure: 1.0, bloom: 0.45, saturation: 1.12, tint: 0xfff4f6, sunGlow: 0, sunSize: 0 },
  { z: -556, skyTop: 0x3a2a30, skyMid: 0x3a2a30, skyBottom: 0x3a2a30, fog: 0x3a2028, fogDensity: 0.008, sunDir: [0.1, 0.6, -0.8], sunColor: 0xd0b0b0, sunIntensity: 0.6, hemiSky: 0xa08890, hemiGround: 0x503840, hemiIntensity: 0.8, exposure: 1.0, bloom: 0.4, saturation: 1.05, tint: 0xfff0f0, sunGlow: 0, sunSize: 0 },
];

export const ENV: SetEnv = (z) => ({ wind: 0.04, birds: 0, crickets: 0, rain: 0, sea: 0, ...(z < -500 ? { wind: 0.02 } : {}) });

function build(ctx: SetContext): BuiltSet {
  const { road, lights } = ctx;
  const group = new THREE.Group();
  const statics = new THREE.Group(), live = new THREE.Group();
  group.add(statics, live);

  // ---------- the rooms ----------
  const rooms = buildRooms(ctx.lowDetail);
  statics.add(rooms.statics);
  live.add(rooms.shafts);

  // ---------- the conveyors ----------
  const main = buildConveyor(subCurve(road, R.z0 + 4, PACK.z - 0.5, 160), { width: 5, floorY: Y.floor, frame: 0xa8d8c8 });
  live.add(main.belt); main.group.remove(main.belt);
  statics.add(main.group);
  const sides = [-1, 1].map((s) => {
    const c = new THREE.LineCurve3(new THREE.Vector3(s * SIDE.x, Y.belt, SIDE.z0), new THREE.Vector3(s * SIDE.x, Y.belt, SIDE.z1));
    const cv = buildConveyor(c, { width: 4, floorY: Y.floor, frame: 0xf2c4d0, segs: 40 });
    live.add(cv.belt); cv.group.remove(cv.belt);
    statics.add(cv.group);
    return cv;
  });

  // ---------- the mount: the pastry box ----------
  const box = buildPastryBox(true);
  const mount: MountDef = {
    kind: 'box', group: box.group, seat: box.seat, z0: R.z0, z1: R.z1, tilt: 0.6, bank: 0.05,
    update(dt, t, ride) {
      const z = ride.position.z;
      box.setLid(smoothstep(-536, -551, z));
      box.update(dt, t, clamp(ride.speedMult, 0, 1));
    },
  };

  // ---------- flour in the air ----------
  const flour = new Drift({ count: ctx.lowDetail ? 260 : 520, color: 0xfff8f0, size: 0.16, box: new THREE.Vector3(70, 34, 90), speed: new THREE.Vector3(0.2, -0.25, 0.1), wobble: 0.6, opacity: 0.55, seed: 2101 });
  live.add(flour.points);

  // ---------- lights ----------
  lights.add({ from: road.u(-300), to: road.u(-402), pos: new THREE.Vector3(0, Y.belt + 22, -352), color: 0xffe2c8, intensity: 120, distance: 90 });
  lights.add({ from: road.u(-392), to: road.u(-446), pos: new THREE.Vector3(0, Y.belt + 2, -419), color: 0xff9a50, intensity: 90, distance: 55, flicker: 0.6 });
  lights.add({ from: road.u(-436), to: road.u(-506), pos: new THREE.Vector3(0, Y.belt + 40, ROT.z), color: 0xf4f0ff, intensity: 140, distance: 90 });
  lights.add({ from: road.u(-496), to: road.u(-560), pos: new THREE.Vector3(0, Y.belt + 18, -528), color: 0xffe8e0, intensity: 120, distance: 80 });

  statics.updateMatrixWorld(true);
  optimize(statics);
  void MC; void OVENS; void HALL; void SHOP;

  const camPos = new THREE.Vector3();
  const floor = (x: number, z: number) => {
    const p = road.at(z);
    if (Math.abs(x - p.x) < 2.6 && z <= R.z0 && z >= PACK.z) return p.y;
    if (z <= SIDE.z0 && z >= SIDE.z1 && Math.abs(Math.abs(x) - SIDE.x) < 2.1) return Y.belt;
    return Y.floor;
  };

  return {
    id: 'mendls', group, show: showRange(road, R, 5, 12), occluders: [], subjects: [], floor, water: -Infinity,
    mounts: [mount],
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      main.run(ride.s);
      for (const s of sides) s.run(t * 3.2);
      flour.update(dt, t, camPos);
      // as the lid comes down the rider ducks into the box
      const duck = zWindow(z, -538, -549, -600, -601);
      ctx.shot.offset.y -= 0.85 * duck;
      ctx.shot.pitch += 0.12 * duck;
    },
  };
}

export const MENDLS: SetModule = { build, lights: LIGHTS, env: ENV };
