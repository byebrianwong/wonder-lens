import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { box, type Placement } from '../../../engine/Builders';
import { CumulusField } from '../../../engine/Clouds';
import { FogCuller } from '../../../engine/Culling';
import { GrassField } from '../../../engine/Grass';
import { flowerField, fluffyForest, type FluffyStyle } from '../../../engine/Foliage';
import { Heading, Spring, envelope } from '../../../engine/Rig';
import { Rng, TAU, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import type { Sky } from '../../../engine/Sky';
import { SETS } from '../layout';
import { FILMS, boxProxy, forwardOf, lightShaft, optimize, showRange, type BuiltSet, type SetContext } from '../common';
import { BACK_Z, HOUSES, SPOTS, buildLand, hillDistance } from '../fields/land';
import { MAX_LAMPS } from '../fields/paddyWater';
import { buildPowerLines } from '../fields/powerLines';
import { makeFlyingTotoro } from '../fields/flyingTotoro';
import { makeOwl } from '../fields/owl';
import { Fireflies } from '../fields/fireflies';
import { bench, busStopSign, camphorTree, farmhouse, fieldMats, stoneFox, stoneLantern, storehouse, torii, wayShrine } from '../fields/buildings';

/*
 * Over the fields on the power lines (My Neighbor Totoro), z -230 to -610, at night under the moon.
 *
 *  -230  the Catbus leaps off the treetop and runs down through the air
 *  -238  Totoro, on his spinning top, comes out of a cloud high behind and swoops down after the Catbus
 *  -244  it plunges into a bank of cloud; the screen washes pale for a moment (the garden scene goes here,
 *        and the ground behind z -290 comes in)
 *  -270  out under the cloud: the moonlit valley below, flooded rice fields mirroring the moon and stars,
 *        farm houses with lit paper doors, the lane and its poles, woods on the hills, fireflies
 *  -300  Totoro sweeps past close on the right and settles alongside, the girls on his belly, Chu and Chibi
 *        clinging on
 *  -348  the Catbus lands on the corner pole and runs along the top wire, which dips under its paws
 *  -390  Totoro swoops across in front to the left and back again
 *  -446  the owl on the telephone pole to the right watches the Catbus pass
 *  -472  the great camphor tree on the right, its rope and shrine lit by lanterns; Totoro flies out by it
 *  -500  Totoro crosses ahead to the left
 *  -520  the Inari-mae bus stop below on the left: its sign, its lamp on the pole, the little red shrine
 *  -575  past the last paddies, a meadow; Totoro climbs away towards the moon (gone by -638)
 *  -588  the wire ends at the last pole; the Catbus jumps down onto the bank at the edge of the wood
 */

type SkyU = Sky['uniforms'];
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** A value from [z, value] keys (z decreasing), eased between keys. */
const keyed = (keys: Array<[number, number]>, z: number) => {
  if (z >= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) if (z <= keys[i][0] && z >= keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], smoothstep(keys[i][0], keys[i + 1][0], z));
  return keys[keys.length - 1][1];
};
const bezier = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, e: number, out: THREE.Vector3) => {
  const k = 1 - e;
  return out.set(0, 0, 0).addScaledVector(a, k * k * k).addScaledVector(b, 3 * k * k * e).addScaledVector(c, 3 * k * e * e).addScaledVector(d, e * e * e);
};

export function buildFields(ctx: SetContext): BuiltSet {
  const { road, camera, fx, lights } = ctx;
  const rng = new Rng(19880701);
  const low = ctx.lowDetail;
  const group = new THREE.Group();
  const U = (z: number) => road.u(z);

  // the sky's colours and the moonlight belong to the world; read them each frame
  const skyMesh = ctx.scene.children.find((o) => ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms?.moonDir !== undefined) as THREE.Mesh | undefined;
  const skyU = skyMesh ? ((skyMesh.material as THREE.ShaderMaterial).uniforms as unknown as SkyU) : null;
  const moonLight = ctx.scene.children.find((o) => (o as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight | undefined;
  const moonDir = new THREE.Vector3(-0.25, 0.32, -0.92).normalize();

  // ---------- the ground: valley, paddies, bunds, the lane ----------
  const land = buildLand(road, rng);
  group.add(land.group, land.back);
  land.back.visible = false;
  const H = land.heightAt;
  const occluders: THREE.Object3D[] = [];
  const glowSpots: Array<{ p: THREE.Vector3; w: number; d: number }> = [];
  const M = fieldMats();
  const built = new THREE.Group();
  group.add(built);
  const at = <T extends THREE.Object3D>(o: T, x: number, z: number, yaw: number, into: THREE.Object3D = built) => {
    o.position.set(x, H(x, z) - 0.05, z); o.rotation.y = yaw; into.add(o); return o;
  };

  // ---------- farm houses, with groves of cedars behind them ----------
  const groves: Placement[] = [], yardTrees: Placement[] = [];
  HOUSES.forEach((h, i) => {
    const y = H(h.x, h.z);
    const house = farmhouse(h.kind, M, rng);
    house.group.position.set(h.x, y, h.z);
    house.group.rotation.y = h.yaw;
    if (i === 2) { const k = storehouse(M); k.position.set(-11, 0, -1.5); house.group.add(k); }
    built.add(house.group);
    house.group.updateMatrixWorld(true);
    occluders.push(boxProxy(house.group));
    for (const g of house.glows) glowSpots.push({ p: g.clone().applyMatrix4(house.group.matrixWorld), w: h.kind === 'small' ? 0.3 : 0.45, d: 0 });
    const fwd = new THREE.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw)), side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    for (let k = 0; k < (h.kind === 'small' ? 5 : 9); k++) {
      const p = new THREE.Vector3(h.x, 0, h.z).addScaledVector(fwd, -rng.range(9.5, 16)).addScaledVector(side, rng.range(-13, 13));
      groves.push({ x: p.x, y: H(p.x, p.z) - 0.3, z: p.z, scale: rng.range(1.5, 2.2), rot: rng.range(0, TAU) });
    }
    // a couple of trees beside the yard (not on the side of the annex or the storehouse)
    const s = h.kind === 'tile' ? -1 : i === 2 ? 1 : 0;
    for (let k = 0; k < 2; k++) {
      const sd = s || (k % 2 ? 1 : -1);
      const p = new THREE.Vector3(h.x, 0, h.z).addScaledVector(fwd, rng.range(-3, 4)).addScaledVector(side, sd * rng.range(13, 16));
      yardTrees.push({ x: p.x, y: H(p.x, p.z) - 0.2, z: p.z, scale: rng.range(0.9, 1.25), rot: rng.range(0, TAU) });
    }
  });

  // ---------- the great camphor tree, its shrine and lanterns ----------
  const C = SPOTS.camphor;
  const camphor = camphorTree(rng);
  const cy = H(C.x, C.z);
  camphor.group.position.set(C.x, cy - 0.3, C.z);
  group.add(camphor.group);
  // merges the wood, rope and paper streamers (the crown keeps its own mesh, so it can still sway)
  optimize(camphor.group);
  {
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(11, 30, 11)); trunk.position.set(C.x, cy + 14, C.z);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(44, 22, 44)); crown.position.set(C.x, cy + 42, C.z);
    for (const m of [trunk, crown]) { m.visible = false; m.updateMatrixWorld(true); occluders.push(m); }
  }
  at(torii(3.4, 4.2, M), C.x - 21, C.z + 0.5, -Math.PI / 2);
  at(wayShrine(M, 1.2), C.x - 10.5, C.z + 7, -Math.PI / 2 - 0.35);
  for (const dz of [-3.2, 4.2]) {
    const l = stoneLantern(M);
    at(l.group, C.x - 15, C.z + dz, -Math.PI / 2);
    glowSpots.push({ p: l.group.position.clone().add(l.light), w: 0.6, d: 0 });
  }
  for (let k = 0; k < 9; k++) {
    const x = C.x - 28 + k * 2.1, z = C.z + 0.5;
    const st = box(1.6, 0.3, 0.9, M.stone, x, H(x, z) + 0.04, z);
    st.rotation.y = rng.range(-0.12, 0.12);
    built.add(st);
  }

  // ---------- the Inari shrine and the bus stop ----------
  const B = SPOTS.busStop;
  for (const x of [-12, -14.6, -17.2]) at(torii(2.0, 2.7, M), x, -515.5, Math.PI / 2);
  at(wayShrine(M, 1), -21.8, -515.5, Math.PI / 2);
  const foxEyes = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7a5a2a) });
  const foxEyeBase = foxEyes.color.clone();
  for (const dz of [-1.9, 1.9]) at(stoneFox(M, foxEyes), -19.6, -515.5 + dz, Math.PI / 2 - dz * 0.12);
  {
    const l = stoneLantern(M, 0.85);
    at(l.group, -13.4, -519.8, Math.PI / 2);
    glowSpots.push({ p: l.group.position.clone().add(l.light), w: 0.45, d: 0 });
  }
  at(bench(M), -10.4, -517.2, Math.PI / 2);
  const stop = busStopSign(M);
  at(stop.group, B.x, B.z, 0.75, group);

  // ---------- power lines ----------
  const lines = buildPowerLines(road, H);
  group.add(lines.group);
  optimize(lines.group);
  for (const l of lines.lamps) {
    glowSpots.push({ p: l, w: 0.9, d: 0 });
    // a soft cone of lamplight down to the lane
    group.add(lightShaft(l.clone().add(new THREE.Vector3(0, -0.15, 0)), new THREE.Vector3(l.x, H(l.x, l.z), l.z), 3.6, 0xffd8a0, 0.13));
  }
  const bulbBase = lines.bulbs.color.clone();

  // ---------- the owl on the telephone pole ----------
  const owl = makeOwl();
  owl.group.position.copy(lines.owlSeat);
  owl.group.rotation.y = -1.0;
  owl.group.scale.setScalar(1.15);
  group.add(owl.group);

  // ---------- woods: on the hills, round the houses, at the edge of the wood ----------
  const forests = new THREE.Group();
  group.add(forests);
  const backForests = new THREE.Group();
  backForests.userData.chunked = true;
  land.back.add(backForests);
  const ROUND: FluffyStyle = { shape: 'round', trunk: 0x3a2e24, leaves: [0x2c5230, 0x355e34, 0x26482a, 0x3a6236], density: 0.6 };
  const CEDAR: FluffyStyle = { shape: 'conifer', trunk: 0x3a2a20, leaves: [0x1f3c2c, 0x274834, 0x22402e], density: 0.7 };
  const BROAD: FluffyStyle = { shape: 'broad', trunk: 0x3a2e24, leaves: [0x2a4a2e, 0x31563a, 0x284a30], density: 0.6 };
  const hillRound: Placement[] = [], hillCedar: Placement[] = [], backRound: Placement[] = [], backCedar: Placement[] = [];
  const want = low ? 650 : 1250;
  const lineZ = (x: number) => -350 + (x + 30) * 0.109; // the line from the left into the corner pole
  for (let i = 0, n = 0; i < want * 10 && n < want; i++) {
    const x = rng.range(-430, 430), z = rng.range(-672, -236);
    const d = hillDistance(x, z);
    if (d < -4 || !rng.chance(d < 80 ? 0.9 : d < 200 ? 0.45 : 0.25)) continue;
    if (HOUSES.some((h) => Math.abs(x - h.x) < h.yard[0] + 4 && Math.abs(z - h.z) < h.yard[1] + 4)) continue;
    if (Math.abs(x - 142) < 6 || (Math.abs(z + 446) < 5 && Math.abs(x) < 180) || (x < -20 && Math.abs(z - lineZ(x)) < 5)) continue;
    // trees far up the hills take on a little of the blue-grey moonlit haze
    const far = smoothstep(60, 260, d);
    const pl: Placement = { x, y: H(x, z) - 0.6, z, scale: rng.range(2.0, 3.3) * (d > 150 ? 1.25 : 1), rot: rng.range(0, TAU), tint: new THREE.Color(1 + 0.25 * far, 1 + 0.35 * far, 1 + 1.3 * far) };
    const cedar = rng.chance(0.4);
    (z > BACK_Z ? (cedar ? backCedar : backRound) : (cedar ? hillCedar : hillRound)).push(pl);
    n++;
  }
  // a few trees on the valley floor where there is no paddy, lane or yard: round the mound, by the hills
  const floorTrees: Placement[] = [];
  for (let i = 0, n = 0; i < 3000 && n < (low ? 40 : 80); i++) {
    const x = rng.range(-150, 150), z = rng.range(-560, -306);
    if (land.paddyAt(x, z) || Math.abs(x - land.laneX(z)) < 10 || hillDistance(x, z) > -2) continue;
    if (Math.hypot(x - C.x, z - C.z) < 16 || Math.hypot(x - SPOTS.inari.x, z - SPOTS.inari.z) < 9) continue;
    if (HOUSES.some((h) => Math.abs(x - h.x) < h.yard[0] && Math.abs(z - h.z) < h.yard[1])) continue;
    floorTrees.push({ x, y: H(x, z) - 0.2, z, scale: rng.range(1.2, 2.0), rot: rng.range(0, TAU) });
    n++;
  }
  // the dark wood behind the bus stop
  for (let k = 0; k < 16; k++) { const x = rng.range(-46, -27), z = rng.range(-532, -502); groves.push({ x, y: H(x, z) - 0.3, z, scale: rng.range(1.7, 2.4), rot: rng.range(0, TAU) }); }
  // the edge of the wood at the far end, leaving a wide gap for the path into it (broad crowns spread far,
  // so those stand further back from it than the narrow cedars)
  const edge: Placement[] = [], edgeCedar: Placement[] = [];
  for (let i = 0; i < (low ? 150 : 280); i++) {
    // (kept beyond z -600 so they fall in one of the forest's 150-unit stretches: fewer draw calls)
    const z = rng.range(-601, -642), x = rng.range(-270, 270);
    const lat = Math.abs(x - road.at(z).x), cedar = rng.chance(0.45);
    if (lat < (cedar ? 16 : 27)) continue;
    (cedar ? edgeCedar : edge).push({ x, y: H(x, z) - 0.4, z, scale: rng.range(2.4, 3.6), rot: rng.range(0, TAU) });
  }
  // each call is a few instanced meshes per 150-unit stretch; fewer tree shapes where the trees are fewer
  const forest = (style: FluffyStyle, pl: Placement[], into: THREE.Group, shadow = false, variants = 2) => {
    if (!pl.length) return;
    const f = fluffyForest(style, pl, rng, { castShadow: shadow, variants });
    f.userData.chunked = true;
    into.add(f);
  };
  forest(ROUND, hillRound, forests);
  forest(CEDAR, hillCedar, forests);
  forest(ROUND, backRound, backForests);
  forest(CEDAR, backCedar, backForests);
  forest(CEDAR, groves, forests, true);
  forest({ ...ROUND, leaves: [0x3a6a34, 0x4a7a3c, 0x5a7a40, 0x2c5230] }, [...yardTrees, ...floorTrees], forests, true);
  forest(BROAD, edge, forests);
  forest(CEDAR, edgeCedar, forests);

  // the meadow at the far end: wild flowers in the grass
  {
    const pl: Placement[] = [], kinds: number[] = [];
    for (let i = 0; i < (low ? 500 : 1100); i++) {
      const z = rng.range(-578, -598), x = road.at(z).x + rng.range(-70, 70);
      if (Math.abs(x - land.laneX(z)) < 3) continue;
      pl.push({ x, y: H(x, z) + 0.12, z, scale: rng.range(0.8, 1.3), rot: 0 });
      kinds.push(rng.int(0, 3));
    }
    group.add(flowerField(pl, kinds));
  }

  // ---------- long grass on the verges, between the fields, in the meadow and on the bank at the end ----------
  const gA = new THREE.Color(0x35561f), gB = new THREE.Color(0x58742a), gC = new THREE.Color();
  const grass = new GrassField({
    heights: land.grid, xMin: -120, xMax: 120, zMin: -628, zMax: -300, res: 1, tile: 24,
    radius: low ? 44 : 64, bladesPerM2: low ? 10 : 18,
    sample: (x, z, out) => {
      // none in the water or under the banks round the fields, on the lane or in the yards
      for (const [dx, dz] of [[0, 0], [1.3, 0], [-1.3, 0], [0, 1.3], [0, -1.3]]) if (land.paddyAt(x + dx, z + dz)) return;
      const dl = x - land.laneX(z);
      if (dl > -2.6 && dl < 2.6 && z > -618) return;
      if (HOUSES.some((h) => Math.abs(x - h.x) < h.yard[0] - 1.5 && Math.abs(z - h.z) < h.yard[1] - 1.5)) return;
      if (Math.hypot(x - SPOTS.inari.x, z - SPOTS.inari.z) < 6 || Math.hypot(x - C.x, z - C.z) < 8) return;
      const n = fbm(x * 0.05 + 11, z * 0.05, 2);
      const meadow = smoothstep(-574, -590, z);
      out.density = hillDistance(x, z) > 2 ? 0.35 : 0.75 + 0.25 * meadow;
      gC.copy(gA).lerp(gB, n * 0.8 + meadow * 0.2);
      out.r = gC.r; out.g = gC.g; out.b = gC.b;
      // longer on the verges and in the meadow, shorter round the shrine and the houses
      out.height = lerp(0.8, 1.5, Math.max(meadow, smoothstep(2.6, 7, Math.abs(dl)) * n));
    },
  });
  group.add(grass.group);

  // ---------- clouds: the deck the Catbus dives through, Totoro's cloud above it, clouds round the horizon ----------
  // the second placement gets a long low bank (the field alternates heaped towers and banks): the one the
  // Catbus dives through, its top meeting the path at about z -246 and its base at about z -268
  const deckPl: Placement[] = [{ x: -120, y: 38, z: -300, scale: 1.5, rot: 0.4 }, { x: 0, y: 41, z: -256, scale: 1.0, rot: Math.PI / 2 }];
  for (let i = 0; i < 15; i++) deckPl.push({ x: rng.sign() * rng.range(36, 200), y: rng.range(34, 44), z: rng.range(-228, -334), scale: rng.range(1.0, 1.8), rot: rng.range(0, TAU) });
  const PARK = new THREE.Vector3(34, 107, -156);
  const parkPl: Placement[] = [{ x: 34, y: 95, z: -156, scale: 1.8, rot: 0.3 }, { x: 40, y: 98, z: -148, scale: 1.4, rot: 1.7 }, { x: 28, y: 99, z: -162, scale: 1.3, rot: 2.6 }];
  const farPl: Placement[] = [];
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0.15, 0.85) * Math.PI * (rng.chance(0.5) ? 1 : -1) + Math.PI / 2, d = rng.range(320, 460);
    farPl.push({ x: Math.cos(a) * d, y: rng.range(70, 120), z: -420 + Math.sin(a) * d * 0.6, scale: rng.range(2.2, 3.6), rot: rng.range(0, TAU) });
  }
  const clouds = [new CumulusField(rng, deckPl, { variants: 5 }), new CumulusField(rng, parkPl, { variants: 2 }), new CumulusField(rng, farPl, { variants: 5 })];
  for (const c of clouds) group.add(c.group);

  // ---------- a band of moonlit haze in the sky just above the horizon, all the way round ----------
  // It stands far off (beyond all of this scene's ground) and follows the camera, so whatever stands
  // against the skyline (hills, the wood ahead) shows as a dark shape against a soft blue-grey glow.
  const hazeTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const g = c.getContext('2d')!;
    // the top of the canvas is the top of the band; the horizon is about 85% of the way down
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)');
    gr.addColorStop(0.75, 'rgba(255,255,255,1)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const hazeMat = new THREE.MeshBasicMaterial({ map: hazeTex, color: 0x8ea0c0, transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide, fog: false });
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(560, 560, 190, 48, 1, true).translate(0, 65, 0), hazeMat);
  haze.frustumCulled = false;
  group.add(haze);

  // ---------- fireflies ----------
  const flies = new Fireflies();
  group.add(flies.group);
  let ffT = -1;

  // ---------- ripples where an acorn falls into a paddy ----------
  const ripples = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xc8d8f0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.visible = false;
    group.add(m);
    return { m, t: -1 };
  });
  let nextRipple = 0;

  // ---------- lights: warm light from a house by the lane, the shrine lanterns, the bus stop lamp ----------
  const houseB = HOUSES[1];
  lights.add({ from: U(-350), to: U(-440), pos: new THREE.Vector3(houseB.x - 7.5, H(houseB.x, houseB.z) + 2.6, houseB.z), color: 0xffb060, intensity: 30, distance: 26 });
  lights.add({ from: U(-434), to: U(-498), pos: new THREE.Vector3(C.x - 14, cy + 2.4, C.z + 0.5), color: 0xffa050, intensity: 28, distance: 26, flicker: 1 });
  const busSpot = { from: U(-472), to: U(-556), pos: lines.lamps[1].clone().add(new THREE.Vector3(0, -0.4, 0)), color: 0xffd890, intensity: 22, distance: 20 };
  lights.add(busSpot);

  // ---------- Totoro on his top ----------
  const fly = makeFlyingTotoro();
  group.add(fly.group);
  fly.group.position.copy(PARK);
  fly.group.rotation.y = Math.PI;
  const Z = { swoop0: -238, swoop1: -318, climb0: -574, climb1: -638 };
  // which side he flies on (+ right, radians from straight ahead) and how far out, by the rider's z
  const BEARING: Array<[number, number]> = [[-300, 0.55], [-376, 0.55], [-402, -0.42], [-418, -0.42], [-444, 0.6], [-484, 0.62], [-510, -0.5], [-600, -0.5]];
  const DIST: Array<[number, number]> = [[-300, 22], [-440, 22], [-458, 30], [-490, 30], [-505, 22], [-600, 24]];
  type Phase = 'park' | 'swoop' | 'fly' | 'climb' | 'gone';
  const tt = {
    phase: 'park' as Phase, vel: new THREE.Vector3(), heading: new Heading(Math.PI, 1.0, 0.85), bank: new Spring(0, 1.1, 0.8), pitch: new Spring(0, 1.2, 0.85),
    prevYaw: Math.PI, closeT: 0, closeSide: 1, climbOff: new THREE.Vector3(), prev: new THREE.Vector3(),
  };

  // ---------- per-frame scratch ----------
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), travel = new THREE.Vector3(0, 0, -1), side = new THREE.Vector3(1, 0, 0);
  const lastRide = new THREE.Vector3(), riderVel = new THREE.Vector3(), riderVelS = new THREE.Vector3();
  const tgt = new THREE.Vector3(), rel = new THREE.Vector3(), b1 = new THREE.Vector3(), b2 = new THREE.Vector3(), b3 = new THREE.Vector3(), tmp = new THREE.Vector3();
  let haveRide = false;
  const alongside = (z: number, t: number, out: THREE.Vector3) => {
    const close = smoothstep(0, 1, tt.closeT);
    const b = keyed(BEARING, z), d = keyed(DIST, z) + Math.sin(t * 0.23) * 4;
    const ahead = lerp(d * Math.cos(b), 3.5, close), across = lerp(d * Math.sin(b), tt.closeSide * 8, close);
    out.copy(camPos).addScaledVector(travel, ahead).addScaledVector(side, across);
    out.y = camPos.y + lerp(1.6 + Math.sin(t * 0.9) * 1.2, 0.2, close);
    return out;
  };

  // ---------- subjects ----------
  const totoroS = new Subject({
    id: 'totoro-top', name: 'Totoro on his spinning top', from: FILMS.totoro, group: fly.group, radius: 4.6, base: 1500, rarity: 'legendary',
    hint: 'Flies beside the Catbus over the rice fields, with Satsuki and Mei on his belly. Play the ocarina and he roars for joy and swoops in close; throw an acorn and he rolls right over on his top.',
    poses: { roar: { label: 'A roar of joy', mult: 1.8 }, roll: { label: 'Barrel roll', mult: 1.6 }, flying: { label: 'Flying alongside', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, fly.centre, 0), facing: forwardOf(fly.totoro.group), maxDistance: 140, reactRange: 16,
    onCall: () => {
      fly.roar();
      camera.getWorldDirection(look);
      const ls = look.dot(side);
      if (Math.abs(ls) > 0.2) tt.closeSide = Math.sign(ls);
      tt.closeT = 4.5;
      totoroS.setPose('roar', 2.6);
      return true;
    },
    onItem: () => { fly.roll(); totoroS.setPose('roll', 1.6); return true; },
  });
  const camphorAnchor = new THREE.Object3D();
  camphorAnchor.position.set(C.x, cy, C.z);
  group.add(camphorAnchor);
  const sway = new Spring(0, 0.5, 0.18);
  const hollow = new THREE.Vector3(C.x - 6.5, cy + 1.2, C.z);
  const camphorS = new Subject({
    id: 'camphor', name: 'The great camphor tree', from: FILMS.totoro, group: camphorAnchor, radius: 26, base: 700,
    hint: 'Towers over the fields on the right, a sacred rope round its trunk and a little shrine at its foot. It is where Totoro lives. Play the ocarina near it.',
    poses: { stirring: { label: 'The great tree stirs', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 30, 0), maxDistance: 320, reactRange: 30,
    onCall: () => { sway.v += 0.09; flies.burst(hollow, 40); camphorS.setPose('stirring', 3); return true; },
  });
  const owlS = new Subject({
    id: 'owl', name: 'The owl', from: FILMS.totoro, group: owl.group, radius: 0.7, base: 650, rarity: 'rare',
    hint: 'Perched on a telephone pole to the right of the wire, half way along. Play the ocarina and it turns its head right round; an acorn makes it flap.',
    poses: { look: { label: 'Head right round', mult: 1.6 }, flap: { label: 'Ruffled feathers', mult: 1.4 } },
    centerOffset: new THREE.Vector3(0, 0.55, 0), facing: forwardOf(owl.head), maxDistance: 70, reactRange: 8,
    onCall: () => { owl.turn(); owlS.setPose('look', 2.2); return true; },
    onItem: () => { owl.flap(); owlS.setPose('flap', 1.3); return true; },
  });
  const ffAnchor = new THREE.Object3D();
  group.add(ffAnchor);
  const firefliesS = new Subject({
    id: 'fireflies', name: 'Fireflies', from: FILMS.totoro, group: ffAnchor, radius: 9, base: 380, crowd: true,
    hint: 'Glowing over the rice fields all along the wire. Throw an acorn among them and a cloud of them rises.',
    poses: { rise: { label: 'Fireflies rising', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.6, 0), maxDistance: 90, reactRange: 18,
    onItem: (pos) => { flies.burst(pos, 44); firefliesS.setPose('rise', 4); return true; },
  });
  const sign = new Spring(0, 1.4, 0.12);
  let flareT = -1;
  const stopS = new Subject({
    id: 'busstop', name: 'Inari-mae bus stop', from: FILMS.totoro, group: stop.group, radius: 2.4, base: 450,
    hint: 'Below the wire on the left: the stop where the girls waited in the rain, its lamp on the pole and the little fox shrine behind. Play the ocarina there.',
    poses: { glow: { label: 'The lamp flares, the foxes watch', mult: 1.5 }, ding: { label: 'Ding!', mult: 1.4 } },
    centerOffset: new THREE.Vector3(0, 2.2, 0), maxDistance: 110, reactRange: 6,
    onCall: () => { flareT = 0; stopS.setPose('glow', 2.4); return true; },
    onItem: () => { sign.v += 4; stopS.setPose('ding', 1.4); return true; },
  });
  const subjects = [totoroS, camphorS, owlS, firefliesS, stopS];
  for (const s of subjects) s.active = false;

  // ---------- hide what the fog has swallowed ----------
  const culler = new FogCuller();
  culler.addChildren(land.group);
  culler.addChildren(land.back, 4);
  culler.addChildren(forests, 4);
  // the same shadow settings everywhere, so each material merges into one mesh (lit glass casts none)
  built.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const lit = m.material === M.shoji || m.material === M.lamp || (m.material as THREE.Material).type === 'MeshBasicMaterial';
    m.castShadow = !lit; m.receiveShadow = !lit;
  });
  optimize(built);

  const lampOrder = glowSpots.slice();

  return {
    id: 'fields', group, show: showRange(road, SETS.fields, 70, 110), occluders, subjects,
    floor: land.floor,
    water: 0,
    update(dt, t, ride) {
      const z = ride.position.z;
      camera.getWorldPosition(camPos);
      if (haveRide && dt > 0 && lastRide.distanceToSquared(ride.position) < 900) riderVel.copy(ride.position).sub(lastRide).divideScalar(dt);
      else riderVel.set(0, 0, 0);
      riderVelS.lerp(riderVel, 1 - Math.exp(-dt * 8));
      lastRide.copy(ride.position); haveRide = true;
      travel.copy(ride.tangent).setY(0);
      if (travel.lengthSq() < 1e-6) travel.set(0, 0, -1); else travel.normalize();
      side.set(-travel.z, 0, travel.x);
      if (skyU) moonDir.copy(skyU.moonDir.value).normalize();
      const fog = ctx.scene.fog as THREE.FogExp2 | null;

      // through the cloud deck: a pale wash while the garden scene is put away and the ground behind appears
      const wash = smoothstep(-240, -248, z) * (1 - smoothstep(-262, -276, z));
      if (wash > 0.001) fx.wash(wash * 0.92, 0x9aa8c2);
      land.back.visible = z < -253;

      // ---- the water mirrors the sky; the nearest lit windows and lamps leave streaks on it ----
      const wu = land.water.uniforms;
      wu.uTime.value = t;
      if (skyU) {
        wu.uSkyTop.value.copy(skyU.topColor.value); wu.uSkyMid.value.copy(skyU.midColor.value); wu.uHorizon.value.copy(skyU.horizonColor.value);
        wu.uMoonDir.value.copy(moonDir); wu.uMoonAmount.value = skyU.moonAmount.value; wu.uStars.value = skyU.starAmount.value;
      }
      if (fog) { wu.uFogColor.value.copy(fog.color); wu.uFogDensity.value = fog.density; }
      for (const g of lampOrder) g.d = g.p.distanceToSquared(camPos);
      lampOrder.sort((a, b) => a.d - b.d);
      for (let i = 0; i < MAX_LAMPS; i++) {
        const g = lampOrder[i];
        if (!g) { wu.uLamps.value[i].set(0, 0, 0, 0); continue; }
        wu.uLamps.value[i].set(g.p.x, g.p.y, g.p.z, g.w * smoothstep(170 * 170, 50 * 50, g.d));
      }
      if (skyU && fog) for (const c of clouds) c.update(skyU, fog, moonLight?.intensity ?? 1);
      if (fog) culler.update(camera, fog);

      // ---- the haze band follows the camera; it fades in below the cloud and out in the wood ----
      haze.position.set(camPos.x, camPos.y, camPos.z);
      hazeMat.opacity = 0.3 * smoothstep(-250, -280, z) * (1 - smoothstep(-596, -632, z));
      haze.visible = hazeMat.opacity > 0.002;

      // ---- grass round the camera while it is near the ground ----
      const nearGround = camPos.y - H(camPos.x, camPos.z) < 26 && z < -290;
      grass.group.visible = nearGround;
      if (nearGround) grass.update(t, camera);

      // ---- the wire under the Catbus ----
      lines.update(dt, z);

      // ---- Totoro ----
      const phase: Phase = z > Z.swoop0 ? 'park' : z > Z.swoop1 ? 'swoop' : z > Z.climb0 ? 'fly' : z > Z.climb1 ? 'climb' : 'gone';
      const P = fly.group.position;
      tt.prev.copy(P);
      tt.closeT = Math.max(0, tt.closeT - dt);
      let showT = true, activeT = false;
      if (phase === 'park') {
        // waiting inside his cloud, high behind the treetop
        P.copy(PARK); tt.heading.set(Math.PI); tt.vel.set(0, 0, 0);
      } else if (phase === 'swoop') {
        // out of the cloud and down after the Catbus, ending alongside it
        const e = smoothstep(Z.swoop0, Z.swoop1, z);
        alongside(z, t, tgt);
        b1.copy(PARK).add(tmp.set(-6, -16, -34));
        b2.copy(camPos).addScaledVector(side, 9).addScaledVector(travel, -12); b2.y += 6;
        bezier(PARK, b1, b2, tgt, e, P);
        activeT = e > 0.25;
      } else if (phase === 'fly') {
        // fly alongside: keep pace with the rider, then close in on the place he wants to be
        alongside(z, t, tgt);
        if ((tt.phase !== 'fly' && tt.phase !== 'swoop') || P.distanceTo(camPos) > 120) { P.copy(tgt); tt.vel.copy(riderVelS); }
        rel.subVectors(tgt, P).multiplyScalar(1.2).clampLength(0, tt.closeT > 0 ? 24 : 17).add(riderVelS);
        tt.vel.lerp(rel, 1 - Math.exp(-dt * 2.4));
        P.addScaledVector(tt.vel, dt);
        activeT = true;
      } else if (phase === 'climb') {
        // away up towards the moon, faster and faster, into the sky
        if (tt.phase !== 'climb') tt.climbOff.copy(tt.phase === 'fly' ? P : alongside(Z.climb0, t, tgt)).sub(camPos);
        const k = smoothstep(Z.climb0, Z.climb1, z);
        b1.copy(camPos).add(tt.climbOff);
        b2.copy(b1).addScaledVector(travel, 14); b2.y += 10;
        b3.copy(camPos).addScaledVector(moonDir, 100);
        tgt.copy(camPos).addScaledVector(moonDir, 215); tgt.y += 34;
        bezier(b1, b2, b3, tgt, Math.pow(k, 1.7), P);
        activeT = k < 0.55;
      } else showT = false;
      if (phase === 'swoop' || phase === 'climb') { if (dt > 0 && tt.phase === phase) tt.vel.copy(P).sub(tt.prev).divideScalar(dt); }
      tt.phase = phase;
      fly.group.visible = showT;
      totoroS.active = activeT;
      if (showT) {
        // face the way he flies, turned part way towards the rider; lean into turns, nose down in a dive
        if (phase !== 'park') {
          const hv = Math.hypot(tt.vel.x, tt.vel.z);
          const velYaw = hv > 0.5 ? Math.atan2(tt.vel.x, tt.vel.z) : tt.heading.value;
          const toCam = Math.atan2(camPos.x - P.x, camPos.z - P.z);
          const want = velYaw + wrapAngle(toCam - velYaw) * (phase === 'fly' ? 0.5 : 0.2);
          const yaw = tt.heading.update(want, dt);
          const yawRate = wrapAngle(yaw - tt.prevYaw) / Math.max(dt, 1e-3);
          tt.prevYaw = yaw;
          fly.group.rotation.set(tt.pitch.update(clamp(-tt.vel.y * 0.025, -0.3, 0.3), dt), yaw, tt.bank.update(clamp(-yawRate * 0.5, -0.5, 0.5), dt) + Math.sin(t * 0.8) * 0.05);
        }
        fly.lookTarget = camPos;
        fly.update(dt, t);
        if (activeT && totoroS.pose === 'idle' && tmp.copy(P).setY(P.y + fly.centre).distanceTo(camPos) < 15) totoroS.setPose('flying', 0.5);
      }

      // ---- the owl ----
      const owlOn = z < -360 && z > -480;
      owlS.active = z < -372 && z > -462;
      if (owlOn) { owl.lookTarget = camPos; owl.update(dt, t); }

      // ---- the camphor tree sways in a gust when the ocarina plays ----
      const sw = sway.update(0, dt);
      camphor.crown.rotation.set(sw * 0.5, 0, sw);
      camphorS.active = z < -300 && z > -560;

      // ---- the bus stop: the sign swings when hit, the lamp flares and the foxes' eyes glint ----
      stop.sign.rotation.y = sign.update(0, dt) * 0.35;
      let flare = 0;
      if (flareT >= 0) { flareT += dt; flare = envelope(flareT, 0, 0.25, 1.4, 2.4); if (flareT > 2.5) flareT = -1; }
      lines.bulbs.color.copy(bulbBase).multiplyScalar(1 + 1.4 * flare + Math.sin(t * 31) * 0.15 * flare);
      foxEyes.color.copy(foxEyeBase).multiplyScalar(1 + 5 * flare);
      lights.boost.set(busSpot, 1 + 1.5 * flare);
      stopS.active = z < -440 && z > -545;

      // ---- fireflies over the fields ----
      let boost = 1;
      if (ffT >= 0) { ffT += dt; boost += 0.8 * envelope(ffT, 0, 0.3, 1.4, 2.6); if (ffT > 2.7) ffT = -1; }
      const ffOn = smoothstep(-256, -300, z) * (1 - smoothstep(-598, -618, z));
      flies.update(dt, t, ride.position, travel, 0, fog, ffOn * boost);
      ffAnchor.position.set(ride.position.x - 5, 0.2, z - 24);
      firefliesS.active = ffOn > 0.5 && z < -320;

      // ---- ripples ----
      for (const r of ripples) {
        if (r.t < 0) continue;
        r.t += dt;
        const k = r.t / 1.8;
        r.m.scale.setScalar(0.3 + k * 3.2);
        (r.m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k) * (1 - k);
        if (k >= 1) { r.t = -1; r.m.visible = false; }
      }
    },
    onCall() { ffT = 0; },
    onItemLand(pos) {
      const c = land.paddyAt(pos.x, pos.z);
      if (!c) return;
      const r = ripples[nextRipple]; nextRipple = (nextRipple + 1) % ripples.length;
      r.t = 0; r.m.visible = true; r.m.position.set(pos.x, c.level + 0.04, pos.z);
      flies.burst(tmp.set(pos.x, c.level + 0.3, pos.z), 10);
    },
  };
}
