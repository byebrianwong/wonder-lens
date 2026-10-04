import * as THREE from 'three';
import { Rng, smoothstep } from '../../../engine/math';
import { FogCuller } from '../../../engine/Culling';
import type { Subject } from '../../../game/Subject';
import { SETS } from '../layout';
import { showRange, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { Z, deepness, surfaced } from '../aquatic/plan';
import { buildReef } from '../aquatic/reef';
import { SEA, tickSea } from '../aquatic/shaders';
import { buildDeepSearch } from '../aquatic/sub';
import { Bubbles, LightShafts, SeaSurface, Specks } from '../aquatic/water';

/*
 * Part Eight: The Deep (The Life Aquatic with Steve Zissou).
 *
 *  -2090  the trash gondola's splash covers the change: the rider is now in the glass bubble of the Deep Search,
 *         just under the surface, in a cloud of bubbles
 *  -2108  down a reef canyon of candy-coloured stop-motion coral, shafts of light from the surface, a school of
 *         crayon ponyfish leading the way, sugar crabs on a ledge, under the coral arch where the paisley
 *         octopus sits, past Esteban's old helmet
 *  -2198  over the drop-off into the dark: electric jellyfish, then the jaguar shark gliding alongside
 *  -2282  up the far wall through the kelp towards the golden light, under the Belafonte's keel
 *  -2324  out through the surface at sundown, along the Belafonte's cutaway side (every room lit, the crew in it,
 *         Pele with his guitar, Team Zissou in a row on deck, Steve at the bow with his binoculars) to the
 *         iris that closes on the scene
 */

const R = SETS.aquatic;
const DEBUG = true;
const OFF = typeof location !== 'undefined' ? (new URLSearchParams(location.search).get('aqoff') ?? '').split(',') : [];
const GOLD = new THREE.Color(0xffd690), WINDOW_GOLD = new THREE.Color(0xffe2b0);

const UNDER = (z: number, o: Partial<ZLightKey>): ZLightKey => ({
  z, skyTop: 0xb8f4f0, skyMid: 0x2a92b2, skyBottom: 0x0e3a5a, fog: 0x2a92b2, fogDensity: 0.02,
  sunDir: [0.25, 1, -0.35], sunColor: 0xeafff2, sunIntensity: 1.3, hemiSky: 0xa8ecf0, hemiGround: 0x1a4a6a, hemiIntensity: 1.0,
  exposure: 1.05, bloom: 0.45, saturation: 1.2, sunGlow: 0, sunSize: 0, horizonHeight: 0.35, tint: 0xf4ffff, ...o,
});
const SUNDOWN = (z: number, o: Partial<ZLightKey> = {}): ZLightKey => ({
  z, skyTop: 0x4a3a8a, skyMid: 0xe07a9a, skyBottom: 0xffb46a, fog: 0xf0a08a, fogDensity: 0.0042,
  sunDir: [-0.42, 0.07, -0.9], sunColor: 0xffae62, sunIntensity: 1.5, hemiSky: 0xd8a0c8, hemiGround: 0x5a3a5a, hemiIntensity: 1.05,
  exposure: 1.05, bloom: 0.6, saturation: 1.15, sunGlow: 1.3, sunSize: 0.045, horizonHeight: 0.06, tint: 0xfff2f0, ...o,
});
const DEEP: Partial<ZLightKey> = {
  skyTop: 0x0a2a4a, skyMid: 0x0a2440, skyBottom: 0x020814, fog: 0x08264a, fogDensity: 0.03, sunColor: 0x8ab0ff, sunIntensity: 0.35,
  hemiSky: 0x2a4a8a, hemiGround: 0x060c20, hemiIntensity: 0.55, exposure: 1.2, bloom: 0.85, saturation: 1.15, tint: 0xeef4ff,
};
const GOLDEN: Partial<ZLightKey> = {
  skyMid: 0x4a9aa4, fog: 0x4a9aa0, fogDensity: 0.022, sunColor: 0xffd090, sunIntensity: 1.35, hemiSky: 0xffe0b0, hemiGround: 0x1a4a5a,
  hemiIntensity: 1.15, bloom: 0.55, tint: 0xfff6ec,
};

export const LIGHTS: ZLightKey[] = [
  UNDER(-2090, {}),
  UNDER(-2150, { fog: 0x2288aa, skyMid: 0x2288aa, fogDensity: 0.022, sunIntensity: 1.2, hemiIntensity: 0.95 }),
  UNDER(-2190, { fog: 0x1a6a94, skyMid: 0x1a6a94, fogDensity: 0.025, sunIntensity: 0.9, hemiIntensity: 0.9, exposure: 1.1, bloom: 0.6 }),
  UNDER(-2212, DEEP),
  UNDER(-2272, DEEP),
  UNDER(-2298, { fog: 0x145a7a, skyMid: 0x145a7a, fogDensity: 0.026, sunColor: 0xffd8a0, sunIntensity: 0.8, hemiIntensity: 0.8, bloom: 0.6 }),
  UNDER(-2316, GOLDEN),
  UNDER(Z.surface + 2.5, GOLDEN),
  SUNDOWN(Z.surface - 2.5),
  SUNDOWN(-2412, { sunIntensity: 1.35, exposure: 1.0 }),
];

function env(z: number) {
  const up = surfaced(z);
  return { wind: 0.25 * up, sea: 0.3 + 0.4 * up, birds: 0.5 * smoothstep(Z.surface, Z.surface - 20, z), rain: 0, crickets: 0 };
}

function build(ctx: SetContext): BuiltSet {
  const { road, lights } = ctx;
  const group = new THREE.Group();
  const rng = new Rng(2090);
  const t0 = performance.now();

  // ---------- the sea floor and the reef ----------
  const reef = buildReef(road, ctx.lowDetail);
  group.add(reef.group);
  const culler = new FogCuller();
  culler.threshold = 0.97;
  culler.addChildren(reef.group);

  // ---------- the water ----------
  const sea = new SeaSurface();
  group.add(sea.mesh);
  const shaftList = (z0: number, z1: number, n: number, dir: THREE.Vector3, len: [number, number]) => {
    const out: Array<{ a: THREE.Vector3; b: THREE.Vector3; w0: number; w1: number }> = [];
    for (let i = 0; i < n; i++) {
      const z = rng.range(z1, z0), x = rng.sign() * rng.range(2, 30);
      const a = new THREE.Vector3(x, -0.4, z);
      out.push({ a, b: a.clone().addScaledVector(dir, rng.range(len[0], len[1])), w0: rng.range(0.8, 2.2), w1: rng.range(2.2, 4.5) });
    }
    return out;
  };
  const reefShafts = new LightShafts(shaftList(-2092, -2196, ctx.lowDetail ? 10 : 16, new THREE.Vector3(-0.25, -1, 0.35).normalize(), [16, 30]));
  group.add(reefShafts.mesh);
  const kelpShafts = new LightShafts(shaftList(-2284, -2346, ctx.lowDetail ? 9 : 14, new THREE.Vector3(0.3, -1, 0.5).normalize(), [18, 28]));
  kelpShafts.uniforms.uColor.value.set(0xffd8a0);
  group.add(kelpShafts.mesh);
  const bubbles = new Bubbles(ctx.lowDetail ? 240 : 380);
  group.add(bubbles.points);
  const snow = new Specks(ctx.lowDetail ? 260 : 420, new THREE.Vector3(36, 22, 36), { size: 0.045, seed: 31 });
  snow.uniforms.uColor.value.set(0xf4fffa);
  group.add(snow.points);
  const plankton = new Specks(ctx.lowDetail ? 200 : 340, new THREE.Vector3(40, 24, 40), { size: 0.06, additive: true, twinkle: true, seed: 37 });
  plankton.uniforms.uColor.value.set(0x8ffcff);
  group.add(plankton.points);
  // bubble vents in the reef
  const vents = Array.from({ length: 10 }, (_, i) => {
    const z = -2100 - i * 9.5 - rng.range(0, 4), x = rng.sign() * rng.range(5, 14);
    return new THREE.Vector3(x, reef.floor(x, z) + 0.3, z);
  });

  if (DEBUG) console.warn(`[aq] reef+water built in ${Math.round(performance.now() - t0)} ms`);
  // ---------- the Deep Search ----------
  const sub = buildDeepSearch();

  // ---------- lights ----------
  const lampPos = new THREE.Vector3();
  lights.add({ from: road.u(-2186), to: road.u(-2300), pos: lampPos, color: 0xfff0d8, intensity: 34, distance: 28 });

  if (DEBUG) console.warn(`[aq] built in ${Math.round(performance.now() - t0)} ms`);
  const subjects: Subject[] = [];
  const camPos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let riderZ = R.z0;
  let emitAcc = 0, dbgN = 0;
  const ventAcc = vents.map(() => 0);

  const set: BuiltSet = {
    id: 'aquatic', group, show: showRange(road, R, 40, 10), occluders: [], subjects,
    floor: (x, z) => reef.floor(x, z),
    get water() { return riderZ < Z.surface ? 0 : -Infinity; },
    mounts: [sub.mount],
    update(dt, t, ride) {
      const z = ride.position.z;
      riderZ = z;
      tickSea(t);
      ctx.camera.getWorldPosition(camPos);
      const fog = ctx.scene.fog as THREE.FogExp2 | null;
      if (fog) culler.update(ctx.camera, fog);
      if (DEBUG && ++dbgN === 30) {
        let tris = 0, calls = 0;
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(ctx.camera.projectionMatrix, ctx.camera.matrixWorldInverse));
        group.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          if (m.frustumCulled && m.geometry.boundingSphere) { const bs = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).boundingSphere : m.geometry.boundingSphere; if (bs && !fr.intersectsSphere(bs.clone().applyMatrix4(m.matrixWorld))) return; }
          const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
          tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1); calls++;
        });
        console.warn(`[aq] my set: ~${calls} meshes, ~${Math.round(tris / 1000)}k tris in view`);
      }
      const deep = deepness(z), up = surfaced(z);
      const camDepth = Math.max(0, -camPos.y);

      // caustics fade in the deep, and turn golden towards the surface
      SEA.causticAmount.value = (1 - deep) * (1 - up);
      SEA.causticColor.value.set(0xd8fff4).lerp(GOLD, smoothstep(-2280, -2318, z));
      sea.update(camPos, fog);
      sea.uniforms.uUnderLight.value = Math.exp(-camDepth * 0.045) * (1 - deep * 0.6);
      sea.uniforms.uWindow.value.set(0xe8fff8).lerp(WINDOW_GOLD, smoothstep(-2280, -2318, z));
      sea.uniforms.uUnder.value.copy(fog?.color ?? sea.uniforms.uUnder.value);
      reefShafts.update(fog); kelpShafts.update(fog);
      reefShafts.mesh.visible = z > -2215;
      kelpShafts.mesh.visible = z < -2262 && up < 1;
      reefShafts.uniforms.uOpacity.value = 0.5 * (1 - deep);
      kelpShafts.uniforms.uOpacity.value = 0.5 * smoothstep(-2262, -2290, z);

      // bubbles: the splash at the start, the sub's wake, the vents
      const stern = sub.stern.getWorldPosition(tmp);
      if (up < 1) {
        emitAcc += dt * (z > -2112 ? 70 : 9);
        while (emitAcc > 1) {
          emitAcc -= 1;
          if (z > -2112) bubbles.emit(camPos.clone().add(new THREE.Vector3(rng.range(-3, 3), rng.range(-3, 1), rng.range(-6, 2))), 1, 0.4, [0.04, 0.16], 2.4);
          else bubbles.emit(stern, 1, 0.25, [0.03, 0.08], 1.2);
        }
      }
      if (z > -2210) vents.forEach((v, i) => {
        if (Math.abs(v.z - z) > 60) return;
        ventAcc[i] += dt * 5;
        while (ventAcc[i] > 1) { ventAcc[i] -= 1; bubbles.emit(v, 1, 0.12, [0.03, 0.09], 1.4); }
      });
      bubbles.update(dt, t, fog);
      snow.uniforms.uAmount.value = (1 - up) * (0.7 + deep * 0.3);
      snow.update(t, camPos, new THREE.Vector3(0.05, -0.18, 0.04), fog);
      plankton.uniforms.uAmount.value = deep;
      plankton.update(t, camPos, new THREE.Vector3(0.1, 0.06, -0.05), fog);
      if (OFF.length > 1 || OFF[0]) {
        reef.group.visible = !OFF.includes('reef');
        reefShafts.mesh.visible &&= !OFF.includes('shafts'); kelpShafts.mesh.visible &&= !OFF.includes('shafts');
        bubbles.points.visible = !OFF.includes('bubbles'); snow.points.visible &&= !OFF.includes('specks'); plankton.points.visible &&= !OFF.includes('specks');
        sea.mesh.visible = !OFF.includes('sea'); sub.mount.group.visible = !OFF.includes('sub');
        if (OFF.includes('inst')) reef.group.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) o.visible = false; });
        for (const c of reef.group.children) if (c.name && OFF.some((k) => c.name.startsWith(k))) c.visible = false;
      }
      reef.deepGlow.color.setHex(0x9ff8ff).multiplyScalar(0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.23));

      // the sub's lamp light runs just ahead of it in the deep
      ctx.vehicle.localToWorld(lampPos.set(0, 1.2, 6));
    },
  };
  return set;
}

export const AQUATIC: SetModule = { build, lights: LIGHTS, env };
