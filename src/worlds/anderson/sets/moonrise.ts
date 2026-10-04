import * as THREE from 'three';
import { clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { showRange, type BuiltSet, type SetContext, type SetEnv, type SetModule, type ZLightKey } from '../common';
import { buildLand } from '../moonrise/land';
import { buildSummersEnd } from '../moonrise/house';
import { buildCamp } from '../moonrise/camp';
import { COVE, PY, STORM } from '../moonrise/plan';

/*
 * Part Five: New Penzance (Moonrise Kingdom), September 1965. See ../moonrise/plan.ts for the layout.
 */

const R = SETS.moonrise;

const SUMMER: Omit<ZLightKey, 'z'> = {
  skyTop: 0x5f98c4, skyMid: 0xbcd6dc, skyBottom: 0xf2e0ae, fog: 0xe6dab4, fogDensity: 0.0042,
  sunDir: [0.55, 0.5, 0.3], sunColor: 0xffe4b0, sunIntensity: 2.2, hemiSky: 0xd8e2e0, hemiGround: 0x9a8c4a, hemiIntensity: 0.95,
  exposure: 1.02, bloom: 0.3, saturation: 1.12, sunGlow: 0.6, cloudShadow: 0.35,
};
const GOLDEN: Omit<ZLightKey, 'z'> = {
  ...SUMMER, skyTop: 0x6a92bc, skyMid: 0xd8d0b8, skyBottom: 0xf6d098, fog: 0xecd2a4, sunDir: [0.6, 0.32, 0.25], sunColor: 0xffd090, sunIntensity: 2.1,
  hemiGround: 0xa08a48, saturation: 1.15,
};
const STORMY: Omit<ZLightKey, 'z'> = {
  skyTop: 0x2e3a3a, skyMid: 0x5c6a64, skyBottom: 0x7c8a80, fog: 0x66746c, fogDensity: 0.0105,
  sunDir: [0.3, 0.7, 0.2], sunColor: 0xc4d4c0, sunIntensity: 0.55, hemiSky: 0x8a9a94, hemiGround: 0x34443c, hemiIntensity: 0.8,
  exposure: 0.95, bloom: 0.35, saturation: 0.72, sunGlow: 0, cloudShadow: 0, tint: 0xdce8e0,
};

export const LIGHTS: ZLightKey[] = [
  { z: -1180, ...SUMMER },
  { z: -1300, ...SUMMER },
  { z: -1380, ...GOLDEN },
  { z: -1400, ...GOLDEN },
  { z: -1438, ...STORMY },
  { z: -1500, ...STORMY, fogDensity: 0.012, exposure: 0.9 },
];

const ENV: SetEnv = (z) => {
  const storm = smoothstep(-1400, -1436, z);
  const cove = smoothstep(-1350, -1370, z);
  return {
    wind: 0.2 + 0.75 * storm, sea: 0.25 + 0.35 * cove, rain: storm, birds: 0.6 * (1 - storm), crickets: 0.35 * smoothstep(-1300, -1320, z) * (1 - storm),
  };
};

function build(ctx: SetContext): BuiltSet {
  const { road } = ctx;
  const T0 = performance.now();
  const group = new THREE.Group();
  const land = buildLand(road, ctx.lowDetail);
  group.add(land.group);
  const house = buildSummersEnd();
  group.add(...house.halves, house.lighthouse, house.anchor);
  const camp = buildCamp(land.ground);
  group.add(camp.group);
  const camPos = new THREE.Vector3();

  let sky: { topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; horizonColor: { value: THREE.Color }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color } } | null = null;
  ctx.scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (!sky && m && (m as THREE.ShaderMaterial).uniforms?.horizonColor && m.uniforms.topColor) sky = m.uniforms as unknown as typeof sky;
  });
  let level = COVE.sea;
  console.warn(`[moonrise] built in ${Math.round(performance.now() - T0)} ms`);
  {
    const count = (o: THREE.Object3D) => { let n = 0, c = 0; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) { n++; if ((x as THREE.Mesh).castShadow) c++; } }); return `${n}/${c}`; };
    console.warn('[moonrise] meshes', group.children.map((c, i) => `${i}:${count(c)}`).join(' '), 'land:', land.group.children.map((c) => count(c)).join(' '));
  }

  return {
    id: 'moonrise', group, show: showRange(road, R, 30, 10), occluders: [], subjects: [],
    floor: (x, z) => land.grid.sample(x, z),
    get water() { return level; },
    update(dt, t, ride) {
      const z = ride.position.z;
      level = COVE.sea + (STORM.flood - COVE.sea) * smoothstep(STORM.z0, STORM.z1, z);
      land.seaMesh.position.y = level;
      land.sea.uniforms.uWaterY.value = level;
      const fog = ctx.scene.fog as THREE.FogExp2;
      if (sky) land.sea.update(t, sky, fog, clamp(smoothstep(-1396, -1436, z), 0, 1));
      land.grass.update(t, ctx.camera);
      ctx.camera.getWorldPosition(camPos);
      if (z > -1300) house.update(dt, t, z, camPos);
      if (z < -1200 && z > -1420) camp.update(dt, t, camPos);
      void dt; void PY;
    },
  };
}

export const MOONRISE: SetModule = { build, lights: LIGHTS, env: ENV };
