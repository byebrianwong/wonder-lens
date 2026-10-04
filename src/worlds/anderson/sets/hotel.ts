import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { buildDetailedTrack } from '../../../engine/Builders';
import { Drift } from '../../../engine/Particles';
import { clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, optimize, showRange, subCurve, zWindow, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { DESK, DOORS, FUNI, HOTEL as H, LIFT, LOBBY, STAIRS, STATION, TERRACE, TOP_DOORS, Y0, groundHeight } from '../hotel/plan';
import { hotelMats } from '../hotel/mats';
import { buildStation } from '../hotel/station';
import { buildValley } from '../hotel/town';
import { buildFunicularTrack, makeFunicularCar } from '../hotel/funicular';
import { buildExterior } from '../hotel/exterior';
import { buildLobby } from '../hotel/lobby';

/*
 * Part One: The Grand Budapest Hotel (1932). The ride starts at Nebelsbad station in the snow, crosses the
 * model spa town on a viaduct, climbs the funicular's rack rail straight up the cliff while the little red
 * car comes down beside it, goes in through the hotel's front doors into the lobby (a dollhouse set with
 * M. Gustave at the concierge desk, Zero, a row of lobby boys, the lift, Madame D. and Boy with Apple), and
 * climbs the grand staircase to the doors at the top, where a whip pan carries it to Mendl's.
 */

const R = SETS.hotel;

const DAY: Omit<ZLightKey, 'z'> = {
  skyTop: 0x6c9ad8, skyMid: 0xb4cdee, skyBottom: 0xf4dde6, fog: 0xe8dce8, fogDensity: 0.0014,
  sunDir: [-0.42, 0.62, 0.58], sunColor: 0xfff0e4, sunIntensity: 2.0, hemiSky: 0xd8e4f8, hemiGround: 0xf0e2ea, hemiIntensity: 0.95,
  exposure: 0.95, bloom: 0.3, saturation: 1.12, sunGlow: 0.5, sunSize: 0.02, horizonHeight: 0.1, cloudShadow: 0,
};
const LOBBY_LIGHT: Omit<ZLightKey, 'z'> = {
  skyTop: 0x7ea6dc, skyMid: 0xbcd2ee, skyBottom: 0xf4dde6, fog: 0xe6c4c0, fogDensity: 0.0055,
  sunDir: [0.22, 0.88, 0.32], sunColor: 0xffe6c8, sunIntensity: 1.5, hemiSky: 0xfff0e2, hemiGround: 0x9a4a56, hemiIntensity: 1.05,
  exposure: 1.0, bloom: 0.42, saturation: 1.1, sunGlow: 0.5, sunSize: 0.02, horizonHeight: 0.1, cloudShadow: 0,
};

export const LIGHTS: ZLightKey[] = [
  { z: 60, ...DAY },
  { z: -150, ...DAY },
  { z: -176, ...LOBBY_LIGHT },
  { z: -300, ...LOBBY_LIGHT },
];

function build(ctx: SetContext): BuiltSet {
  const { road } = ctx;
  const group = new THREE.Group();
  const outside = new THREE.Group(), inside = new THREE.Group(), live = new THREE.Group();
  group.add(outside, inside, live);
  const railY = (z: number) => road.at(z).y;
  const height = (x: number, z: number) => groundHeight(x, z, railY);
  const m = hotelMats();

  // ---------- outside: the station, the valley, the funicular, the hotel ----------
  const statics = new THREE.Group();
  outside.add(statics);
  const station = buildStation(m);
  statics.add(station.group);
  const valley = buildValley(m, height, ctx.lowDetail);
  outside.add(valley.group);
  statics.add(buildFunicularTrack(road, m, (x, z) => valley.grid.sample(x, z)));
  const ext = buildExterior(m);
  statics.add(ext.group);
  for (const d of ext.doors) { d.removeFromParent(); live.add(d); }
  const track = buildDetailedTrack(subCurve(road, STATION.terraceZ0 - 2, FUNI.z0 + 2, 120), { bedDrop: 0.5 });
  track.traverse((o) => { o.receiveShadow = true; });
  statics.add(track);
  statics.updateMatrixWorld(true);
  optimize(statics);

  // ---------- inside: the lobby ----------
  const lobby = buildLobby(road, m);
  inside.add(lobby.group);
  lobby.group.children[0].updateMatrixWorld(true);
  optimize(lobby.group.children[0]);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  ctx.lights.add({ from: road.u(-92), to: road.u(-136), pos: V(0, H.base + 6, H.front + 6), color: 0xffd0a0, intensity: 16, distance: 22 });
  ctx.lights.add({ from: road.u(-150), to: road.u(-296), pos: V(0, LOBBY.glass - 9, -196), color: 0xffd6a8, intensity: 60, distance: 60 });
  ctx.lights.add({ from: road.u(-172), to: road.u(-296), pos: V(0, LOBBY.glass - 9, -250), color: 0xffd6a8, intensity: 60, distance: 60 });
  ctx.lights.add({ from: road.u(-172), to: road.u(-262), pos: V(DESK.x + 2, LOBBY.floor + 4.5, DESK.z), color: 0xffc890, intensity: 20, distance: 18, flicker: 0.3 });
  ctx.lights.add({ from: road.u(-172), to: road.u(-262), pos: V(LIFT.x - 3, LOBBY.floor + 4, LIFT.z), color: 0xffb8a8, intensity: 14, distance: 14 });

  // ---------- the red funicular car ----------
  const car = makeFunicularCar(0.4);
  live.add(car.group);
  const carPos = new THREE.Vector3();
  /** the car comes down while the train goes up: they pass halfway */
  const carZ = (riderZ: number) => {
    const top = FUNI.z1 + 3, bottom = FUNI.z0 - 3;
    const k = clamp((FUNI.z0 - 2 - riderZ) / (FUNI.z0 - 2 - (FUNI.z1 + 4)), 0, 1);
    return top + (bottom - top) * k;
  };

  // ---------- snow ----------
  const snow = new Drift({ count: ctx.lowDetail ? 500 : 1000, color: 0xffffff, size: 0.09, box: new THREE.Vector3(60, 30, 60), speed: new THREE.Vector3(0.5, -1.3, 0.2), wobble: 0.7, opacity: 0.95, seed: 1932 });
  live.add(snow.points);

  // ---------- subjects ----------
  const subjects: Subject[] = [];
  const hotelAnchor = new THREE.Object3D(); hotelAnchor.position.copy(ext.centre); live.add(hotelAnchor);
  let signT = 9;
  const hotelS = new Subject({
    id: 'gbh-hotel', name: 'The Grand Budapest Hotel', from: FILMS.gbh, group: hotelAnchor, radius: 30, base: 900, rarity: 'rare',
    hint: 'High on its cliff above Nebelsbad, pink and perfectly symmetrical. Take it from the station, framed between the clock towers. Blow the whistle and the sign on the roof lights up.',
    poses: { lit: { label: 'All lit up', mult: 1.6 } }, maxDistance: 420,
    onCall: () => { signT = 0; hotelS.setPose('lit', 3.5); return true; },
    update: (_dt, ride) => { hotelS.active = ride.position.z > -150; },
  });
  subjects.push(hotelS);
  const carS = new Subject({
    id: 'gbh-funicular', name: 'The funicular car', from: FILMS.gbh, group: car.group, radius: 2.6, base: 650,
    hint: 'The little red car that runs up and down the cliff to the hotel. It passes the train halfway up. Blow the whistle and it rings its bell.',
    poses: { ring: { label: 'Ding ding!', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.8, 0), maxDistance: 160, reactRange: 30,
    onCall: () => { car.ring(); carS.setPose('ring', 2.5); return true; },
    update: (_dt, ride) => { carS.active = ride.position.z > -160; },
  });
  subjects.push(carS);

  // ---------- floor for thrown items ----------
  const floor = (x: number, z: number) => {
    const ax = Math.abs(x);
    if (z <= H.front - 2 && ax < 22) return railY(z) - 0.1;
    if (z <= TERRACE.z0 && z > H.front && ax < TERRACE.half) return TERRACE.y;
    if (z <= STATION.terraceZ0 && z > STATION.terraceZ1 && ax < STATION.terraceHalf) return ax < STATION.edge ? Y0 : STATION.top;
    if (z <= FUNI.z0 + 6 && z > FUNI.z1 && x > -2.2 && x < FUNI.x + 2) return railY(z) - 0.1;
    if (z <= STATION.terraceZ1 && z > FUNI.z0 && ax < 3.4) return Y0 - 0.1;
    return valley.grid.sample(x, z);
  };

  const camPos = new THREE.Vector3();
  return {
    id: 'hotel', group, show: showRange(road, R, 60, 6), occluders: [...valley.occluders, ext.occluder], subjects, floor, water: -Infinity,
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      outside.visible = z > DOORS.close1;
      inside.visible = z < DOORS.open0 + 10;
      // the doors at the top of the stairs open as the whip pan begins
      const top = smoothstep(TOP_DOORS.open0, TOP_DOORS.open1, z);
      lobby.topDoors[0].rotation.y = top * 1.5;
      lobby.topDoors[1].rotation.y = -top * 1.5;
      void STAIRS;
      // doors: open as the train arrives, close behind it
      const open = smoothstep(DOORS.open0, DOORS.open1, z) * (1 - smoothstep(DOORS.close0, DOORS.close1, z));
      ext.doors[0].rotation.y = open * 1.62;
      ext.doors[1].rotation.y = -open * 1.62;
      if (outside.visible) {
        valley.update(dt, t);
        carPos.set(FUNI.x, 0, carZ(z)); carPos.y = railY(carPos.z);
        car.update(dt, t, carPos);
        // the sign's bulbs: a steady glow, chasing when the whistle blows
        signT += dt;
        ext.sign.emissiveIntensity = signT < 3.5 ? 0.9 + 1.4 * (Math.sin(signT * 14) > 0 ? 1 : 0.2) : 0.9 + Math.sin(t * 1.3) * 0.05;
        ext.flag.rotation.y = Math.sin(t * 1.7) * 0.25 + Math.sin(t * 3.1) * 0.08;
      }
      snow.intensity = 1 - smoothstep(-150, -166, z);
      snow.update(dt, t, camPos);
      void zWindow;
    },
  };
}

export const HOTEL: SetModule = {
  build, lights: LIGHTS,
  env: (z) => ({ wind: z > -150 ? 0.3 + 0.2 * smoothstep(-40, -120, z) : 0.04, birds: 0, sea: 0, rain: 0, crickets: 0 }),
};
