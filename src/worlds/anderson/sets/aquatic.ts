import * as THREE from 'three';
import { Rng, smoothstep } from '../../../engine/math';
import { FogCuller } from '../../../engine/Culling';
import { Subject } from '../../../game/Subject';
import { SETS } from '../layout';
import { FILMS, forwardOf, showRange, zWindow, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { LEDGE, Z, deepness, surfaced } from '../aquatic/plan';
import { PonyfishSchool } from '../aquatic/ponyfish';
import { SugarCrabs } from '../aquatic/crabs';
import { Jellyfish } from '../aquatic/jellyfish';
import { Octopus } from '../aquatic/octopus';
import { JaguarShark } from '../aquatic/shark';
import { estebanHelmet } from '../aquatic/props';
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
const DEBUG = false;
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

  const subjects: Subject[] = [];
  const camPos = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const py = (z: number) => road.at(z).y;
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;
  const live = new THREE.Group();
  group.add(live);

  // ---------- the crayon ponyfish: two schools milling beside the path ----------
  const schools = [new PonyfishSchool(ctx.lowDetail ? 16 : 24, new THREE.Vector3(3.6, py(-2120) + 1.4, -2120)), new PonyfishSchool(ctx.lowDetail ? 16 : 24, new THREE.Vector3(-3.8, py(-2166) + 1.2, -2166))];
  const ponyAnchor = new THREE.Object3D();
  for (const sc of schools) live.add(sc.mesh);
  live.add(ponyAnchor);
  const nearSchool = () => (camPos.z > -2143 ? schools[0] : schools[1]);
  const ponyS = new Subject({
    id: 'ponyfish', name: 'Crayon ponyfish', from: FILMS.aquatic, group: ponyAnchor, radius: 3, base: 650, crowd: true,
    hint: 'Schools of little fish striped in crayon colours, milling round and round beside the path in the reef. Blow the whistle and they swirl round the bubble; throw a box and they dart to it.',
    poses: { swirl: { label: 'Swirling round the bubble', mult: 1.7 }, dart: { label: 'Darting for the box', mult: 1.5 } },
    onCall: () => { nearSchool().swirl(); ponyS.setPose('swirl', 4.5); return true; },
    onItem: (pos) => { nearSchool().dartTo(pos); ponyS.setPose('dart', 4); return true; }, reactRange: 16, maxDistance: 60,
    update: (_dt, ride) => { const z = zOf(ride); ponyS.active = z < -2096 && z > -2180; ponyAnchor.position.copy(nearSchool().anchor.position); },
  });
  subjects.push(ponyS);

  // ---------- the sugar crabs on their ledge ----------
  const crabs = new SugarCrabs(ctx.lowDetail ? 6 : 9, new THREE.Vector3(LEDGE.x, reef.ledgeTop, LEDGE.z), LEDGE.r * 0.85);
  live.add(crabs.group, crabs.anchor);
  const crabS = new Subject({
    id: 'sugar-crabs', name: 'Sugar crabs', from: FILMS.aquatic, group: crabs.anchor, radius: 2.6, base: 600, crowd: true,
    hint: 'Candy-striped crabs on a flat rock on the left, early in the reef. Throw a box onto the rock and they all rush to it; blow the whistle and they wave their claws.',
    poses: { rush: { label: 'Sugar rush', mult: 1.7 }, claws: { label: 'Claws up', mult: 1.4 } },
    onItem: (pos) => { if (!crabs.rush(pos)) return false; crabS.setPose('rush', 5); return true; },
    onCall: () => { crabs.wave(); crabS.setPose('claws', 3); return true; }, reactRange: 9, maxDistance: 50,
    update: (_dt, ride) => { const z = zOf(ride); crabS.active = z < -2096 && z > -2150; },
  });
  subjects.push(crabS);

  // ---------- the paisley octopus on the arch ----------
  const octo = new Octopus(6);
  octo.group.position.copy(reef.archTop).add(new THREE.Vector3(0, -0.3, 0));
  octo.group.scale.setScalar(1.25);
  live.add(octo.group);
  const octoAnchor = new THREE.Object3D();
  octoAnchor.position.set(0, 1.2, 0.3);
  octo.group.add(octoAnchor);
  const octoS = new Subject({
    id: 'octopus', name: 'The paisley octopus', from: FILMS.aquatic, group: octoAnchor, radius: 2.8, base: 900, rarity: 'rare',
    hint: 'Draped over the top of the coral arch you pass under, watching you with big eyes. Blow the whistle and it shows off its colours; throw a box and it squirts ink.',
    poses: { show: { label: 'Showing off', mult: 1.8 }, ink: { label: 'Ink!', mult: 1.6 } },
    facing: forwardOf(octo.group),
    onCall: () => { octo.showOff(); octoS.setPose('show', 3.2); return true; },
    onItem: () => { octo.squirt(); octoS.setPose('ink', 3); return true; }, reactRange: 12, maxDistance: 70,
    update: (_dt, ride) => { const z = zOf(ride); octoS.active = z < -2100 && z > -2162; },
  });
  subjects.push(octoS);

  // ---------- Esteban's helmet ----------
  const helmet = estebanHelmet();
  helmet.position.copy(reef.memorial);
  helmet.rotation.y = -1.1;
  live.add(helmet);
  const helmetS = new Subject({
    id: 'esteban', name: "Esteban's helmet", from: FILMS.aquatic, group: helmet, radius: 1.2, base: 450, centerOffset: new THREE.Vector3(0, 0.6, 0),
    hint: "Steve's old partner Esteban was eaten by the jaguar shark. His brass diving helmet lies on a rock on the right, just before the drop-off, with a red beanie on it.",
    maxDistance: 40,
    update: (_dt, ride) => { const z = zOf(ride); helmetS.active = z < -2140 && z > -2190; },
  });
  subjects.push(helmetS);

  // ---------- the electric jellyfish over the drop-off ----------
  const jellyPlaces: THREE.Vector3[] = [];
  {
    const jr = new Rng(2244);
    while (jellyPlaces.length < (ctx.lowDetail ? 22 : 34)) {
      const z = jr.range(Z.jelly1, Z.jelly0), x = jr.sign() * jr.range(2, 17), y = py(z) + 1.5 + jr.range(-7, 7);
      if (Math.abs(x) < 4 && Math.abs(y - py(z) - 1.2) < 3) continue;
      jellyPlaces.push(new THREE.Vector3(x, y, z));
    }
  }
  const jelly = new Jellyfish(jellyPlaces.length, jellyPlaces);
  live.add(jelly.group, jelly.anchor);
  const jellyS = new Subject({
    id: 'jellyfish', name: 'Electric jellyfish', from: FILMS.aquatic, group: jelly.anchor, radius: 2.5, base: 750, rarity: 'rare', crowd: true,
    hint: 'Glowing jellyfish drifting over the drop-off where the reef ends. Blow the whistle and a wave of light runs out through them.',
    poses: { glow: { label: 'All lit up', mult: 1.8 } },
    onCall: () => { jelly.glow(camPos); jellyS.setPose('glow', 4); return true; }, maxDistance: 60,
    update: (_dt, ride) => { const z = zOf(ride); jellyS.active = z < -2170 && z > -2250; },
  });
  subjects.push(jellyS);
  const jellyLight = new THREE.Vector3();
  const jellySpot = { from: road.u(-2168), to: road.u(-2246), pos: jellyLight, color: 0x8af0ff, intensity: 18, distance: 24 };
  lights.add(jellySpot);

  // ---------- the jaguar shark ----------
  const shark = new JaguarShark();
  live.add(shark.group);
  // where it is relative to the sub, by the rider's z: far off in the dark, across the path ahead, then gliding
  // alongside on the right while the sub slowly overtakes it, its eye level with the bubble; then down into the abyss
  const SHARK: Array<[number, number, number, number]> = [
    [-2194, -34, -16, -66], [-2210, -17, -8, -50], [-2222, -1, -4, -42], [-2232, 8.5, -1.6, -34], [-2246, 9.5, -0.6, -24],
    [-2260, 8.2, 0.2, -10], [-2274, 6.8, 0.6, 2], [-2284, 7.6, -1.5, 9], [-2294, 11, -10, 19], [-2306, 15, -26, 32],
  ];
  const sharkCurve = new THREE.CatmullRomCurve3(SHARK.map(([, x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const sharkAt = (z: number, out: THREE.Vector3) => {
    const zc = Math.min(SHARK[0][0], Math.max(SHARK[SHARK.length - 1][0], z));
    let i = 0;
    while (i < SHARK.length - 2 && zc < SHARK[i + 1][0]) i++;
    const k = (SHARK[i][0] - zc) / (SHARK[i][0] - SHARK[i + 1][0]);
    sharkCurve.getPoint((i + k) / (SHARK.length - 1), out);
    const r = road.at(zc);
    return out.add(new THREE.Vector3(r.x, r.y, r.z));
  };
  const sharkP = new THREE.Vector3(), sharkNext = new THREE.Vector3(), sharkVel = new THREE.Vector3();
  const sharkQ = new THREE.Quaternion(), sharkLook = new THREE.Matrix4();
  let sharkInit = false;
  const sharkS = new Subject({
    id: 'jaguar-shark', name: 'The jaguar shark', from: FILMS.aquatic, group: shark.head, radius: 6, base: 1500, rarity: 'legendary',
    hint: 'In the dark past the drop-off. Huge, spotted like a jaguar, its spots glowing. It crosses ahead and then glides alongside on your right, its eye level with the bubble. Blow the whistle and its spots blaze.',
    poses: { glow: { label: 'Its spots blaze', mult: 2.0 } },
    facing: forwardOf(shark.group),
    onCall: () => { shark.flare(); sharkS.setPose('glow', 3.2); return true; }, maxDistance: 90,
    update: (_dt, ride) => { const z = zOf(ride); sharkS.active = z < -2206 && z > -2298; },
  });
  subjects.push(sharkS);

  if (DEBUG) console.warn(`[aq] built in ${Math.round(performance.now() - t0)} ms`);
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
      if (fog) reef.flats.forEach((m, i) => m.color.copy(fog.color).multiplyScalar(0.62 + i * 0.06));
      reef.deepGlow.color.setHex(0x9ff8ff).multiplyScalar(0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.23));

      // the sub's lamp light runs just ahead of it in the deep
      ctx.vehicle.localToWorld(lampPos.set(0, 1.2, 6));

      // ---- the reef's creatures ----
      if (z > -2200) {
        for (const sc of schools) sc.update(dt, t, camPos);
        crabs.update(dt, t);
        octo.update(dt, camPos);
      }
      // ---- the jellyfish: brighter as the light goes ----
      if (z < -2160 && z > -2260) {
        jelly.level = 0.55 + 0.45 * deep;
        jelly.update(dt, camPos, fog);
        jellyLight.set(camPos.x + 4, camPos.y + 2, camPos.z - 8);
        jellySpot.intensity = 14 + 10 * deep + (jelly.glowing ? 22 : 0);
      }
      // ---- the jaguar shark ----
      const sv = z < -2190 && z > -2310;
      shark.group.visible = sv;
      if (sv) {
        sharkAt(z, sharkP);
        sharkAt(z - 1.5, sharkNext);
        sharkVel.subVectors(sharkNext, sharkP);
        // where it is barely moving it keeps facing on along the path
        sharkVel.addScaledVector(new THREE.Vector3(0, 0, -1), 0.35);
        sharkVel.y *= 0.4;
        sharkVel.normalize();
        sharkLook.lookAt(new THREE.Vector3(), sharkVel.clone().negate(), new THREE.Vector3(0, 1, 0));
        const q = new THREE.Quaternion().setFromRotationMatrix(sharkLook);
        if (!sharkInit) { sharkQ.copy(q); sharkInit = true; } else sharkQ.slerp(q, 1 - Math.exp(-1.6 * dt));
        shark.group.position.copy(sharkP);
        shark.group.quaternion.copy(sharkQ);
        shark.presence = smoothstep(-2192, -2206, z) * (1 - smoothstep(-2290, -2306, z));
        shark.update(dt, camPos, 1);
        // a slow pan to the right while it glides alongside
        ctx.shot.yaw += -0.22 * zWindow(z, -2238, -2256, -2272, -2290);
      }
    },
  };
  return set;
}

export const AQUATIC: SetModule = { build, lights: LIGHTS, env };
