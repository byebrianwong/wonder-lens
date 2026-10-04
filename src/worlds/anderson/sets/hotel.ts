import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { buildDetailedTrack } from '../../../engine/Builders';
import { Drift } from '../../../engine/Particles';
import { clamp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, optimize, showRange, subCurve, zWindow, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { DESK, DOORS, FUNI, HOTEL as H, LIFT, LOBBY, STAIRS, STATION, TERRACE, TOP_DOORS, Y0, groundHeight } from '../hotel/plan';
import { hotelMats } from '../hotel/mats';
import { buildStation, mendlsVan } from '../hotel/station';
import { makeConductor, makeGustave, makeLiftOperator, makeLobbyBoys, makeMadameD, makePorter, makeTraveller, makeZero } from '../hotel/cast';
import { forwardOf } from '../common';
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

  // ---------- the people on the platform, and Mendl's van ----------
  const sp = station.spots;
  const conductor = makeConductor();
  conductor.group.position.copy(sp.conductor); conductor.group.rotation.y = -0.75;
  const porter = makePorter();
  porter.group.position.copy(sp.porter); porter.group.rotation.y = 0.95;
  const lady = makeTraveller('lady');
  lady.group.position.copy(sp.ladies); lady.group.rotation.y = 1.25;
  const gent = makeTraveller('gent');
  gent.group.position.copy(sp.gent); gent.group.rotation.y = -1.35;
  const van = mendlsVan();
  van.group.position.copy(sp.van);
  live.add(conductor.group, porter.group, lady.group, gent.group, van.group);
  let vanT = 9;
  const conductorS = new Subject({
    id: 'gbh-conductor', name: 'The stationmaster of Nebelsbad', from: FILMS.gbh, group: conductor.group, radius: 1.1, base: 520,
    hint: 'On the right-hand platform as the train leaves Nebelsbad. Blow the whistle and he answers with his own, and raises his flag.',
    poses: { flag: { label: 'All aboard!', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: forwardOf(conductor.group), maxDistance: 70,
    onCall: () => { conductor.flag(); conductorS.setPose('flag', 3); return true; },
    update: (_dt, ride) => { conductorS.active = ride.position.z > 0; },
  });
  const vanS = new Subject({
    id: 'gbh-van', name: "Mendl's delivery van", from: FILMS.gbh, group: van.group, radius: 2.4, base: 450,
    hint: "Parked on the station square, on the left. Blow the whistle and it flashes its lamps; land a Mendl's box beside it for a special delivery.",
    poses: { toot: { label: 'Toot toot', mult: 1.4 }, delivery: { label: 'Special delivery', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), maxDistance: 90, reactRange: 6,
    onCall: () => { vanT = 0; vanS.setPose('toot', 1.8); return true; },
    onItem: () => { vanT = 0; vanS.setPose('delivery', 2.2); return true; },
    update: (_dt, ride) => { vanS.active = ride.position.z > -20; },
  });
  subjects.push(conductorS, vanS);

  // ---------- the lobby's people ----------
  const F = LOBBY.floor;
  const gustave = makeGustave();
  gustave.group.position.set(DESK.x - 1.25, F, DESK.z + 0.9); gustave.group.rotation.y = 1.2;
  const zero = makeZero();
  zero.group.position.set(DESK.x + 2.9, F, DESK.z - 6.0); zero.group.rotation.y = 0.8;
  const boyZ = [-172, -183, -194, -225, -236, -247];
  const boyPlaces = boyZ.flatMap((bz) => [{ pos: V(-3.5, F, bz), yaw: Math.PI / 2 }, { pos: V(3.5, F, bz), yaw: -Math.PI / 2 }]);
  const boys = makeLobbyBoys(boyPlaces);
  const operator = makeLiftOperator();
  operator.group.position.set(LIFT.x + 0.5, F + 0.12, LIFT.z); operator.group.rotation.y = -Math.PI / 2;
  const madame = makeMadameD();
  madame.group.position.set(7.4, F, -249.2); madame.group.rotation.y = -0.45;
  const sitter = makeTraveller('sitter');
  sitter.group.position.set(-14.25, F + 0.12, -181.4); sitter.group.rotation.y = Math.PI / 2 - 0.3;
  const reader = makeTraveller('reader');
  reader.group.position.set(20.15, F + 0.26, -227); reader.group.rotation.y = -Math.PI / 2;
  inside.add(gustave.group, zero.group, boys.group, operator.group, madame.group, sitter.group, reader.group);
  // Madame D.'s luggage: a tower of hatboxes and a trunk
  {
    const lug = new THREE.Group();
    const trunk = new THREE.MeshLambertMaterial({ color: 0x6a2a3a }), stripe = new THREE.MeshLambertMaterial({ color: 0xe8d8b8 });
    lug.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.8), trunk).translateY(0.45));
    lug.add(new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.08, 0.82), stripe).translateY(0.7));
    lug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.42, 16), stripe).translateY(1.11));
    lug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.36, 16), trunk).translateY(1.5));
    lug.position.set(8.9, F, -250.3); lug.rotation.y = 0.3;
    inside.add(lug);
  }
  const look = (z: number) => z < -150;
  const gustaveS = new Subject({
    id: 'gbh-gustave', name: 'M. Gustave', from: FILMS.gbh, group: gustave.group, radius: 1.1, base: 1450, rarity: 'legendary',
    hint: 'The concierge, behind his desk on the left of the lobby, with the wall of keys behind him. Blow the whistle for a perfect bow; toss him a box from Mendl\'s and he catches it with a flourish.',
    poses: { bow: { label: 'A perfect bow', mult: 1.9 }, catch: { label: 'Caught with a flourish', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 1.45, 0), facing: forwardOf(gustave.group),
    onCall: () => { gustave.bow(); gustaveS.setPose('bow', 2.6); return true; },
    onItem: () => { gustave.catchBox(); gustaveS.setPose('catch', 3.2); return true; }, reactRange: 9, maxDistance: 80, swallows: true,
    update: (_dt, ride) => { gustaveS.active = look(ride.position.z) && ride.position.z > -262; },
  });
  const zeroS = new Subject({
    id: 'gbh-zero', name: 'Zero, the lobby boy', from: FILMS.gbh, group: zero.group, radius: 0.9, base: 1100, rarity: 'rare',
    hint: 'Beside the concierge desk in his purple uniform and LOBBY BOY cap, moustache pencilled on. Blow the whistle and he snaps to attention and salutes.',
    poses: { salute: { label: 'Snaps to attention', mult: 1.7 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(zero.group),
    onCall: () => { zero.salute(); zeroS.setPose('salute', 2.6); return true; }, maxDistance: 70,
    update: (_dt, ride) => { zeroS.active = look(ride.position.z) && ride.position.z > -262; },
  });
  const boysAnchor = new THREE.Object3D(); boysAnchor.position.copy(boys.centre()); inside.add(boysAnchor);
  const boysS = new Subject({
    id: 'gbh-lobbyboys', name: 'The lobby boys', from: FILMS.gbh, group: boysAnchor, radius: 6, base: 750,
    hint: 'A guard of honour in purple lining the red carpet. Blow the whistle and they bow one after another, like dominoes.',
    poses: { domino: { label: 'Domino bow', mult: 1.8 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), crowd: true, maxDistance: 90,
    onCall: () => {
      const order = boyPlaces.map((_, i) => i).sort((a, b) => boyPlaces[b].pos.z - boyPlaces[a].pos.z || boyPlaces[a].pos.x - boyPlaces[b].pos.x);
      boys.bowAll(order, 0.16); boysS.setPose('domino', 3.2); return true;
    },
    update: (_dt, ride) => {
      boysS.active = look(ride.position.z) && ride.position.z > -258;
      // the photo centre follows the boys still ahead of the train
      const ahead = boyPlaces.filter((p) => p.pos.z < ride.position.z - 4);
      if (ahead.length) { boysAnchor.position.set(0, F, 0); for (const p of ahead.slice(0, 6)) boysAnchor.position.z += p.pos.z / Math.min(6, ahead.length); }
    },
  });
  let liftT = 9;
  const liftAnchor = new THREE.Object3D(); liftAnchor.position.set(LIFT.x - 1, F + 2, LIFT.z); inside.add(liftAnchor);
  const liftS = new Subject({
    id: 'gbh-lift', name: 'The lift', from: FILMS.gbh, group: liftAnchor, radius: 2.6, base: 700,
    hint: 'The rose-red lift in its gilded cage, on the right of the lobby. Blow the whistle: it comes down, the doors slide open and the operator nods you in.',
    poses: { open: { label: 'Going up?', mult: 1.6 } }, maxDistance: 80,
    onCall: () => { if (liftT < 4.2) return false; liftT = 0; liftS.setPose('open', 4.2); return true; },
    update: (_dt, ride) => { liftS.active = look(ride.position.z) && ride.position.z > -262; },
  });
  const madameS = new Subject({
    id: 'gbh-madamed', name: 'Madame D.', from: FILMS.gbh, group: madame.group, radius: 1.0, base: 950, rarity: 'rare',
    hint: 'At the foot of the grand staircase on the right, with her hatboxes, about to leave. Blow the whistle and she waves goodbye with her handkerchief.',
    poses: { wave: { label: 'Au revoir', mult: 1.6 } }, centerOffset: new THREE.Vector3(0, 1.3, 0), facing: forwardOf(madame.group),
    onCall: () => { madame.wave(); madameS.setPose('wave', 3); return true; }, maxDistance: 80,
    update: (_dt, ride) => { madameS.active = look(ride.position.z) && ride.position.z > -262; },
  });
  let spotT = 9;
  const paintS = new Subject({
    id: 'gbh-boywithapple', name: 'Boy with Apple', from: FILMS.gbh, group: lobby.painting, radius: 2.6, base: 850, rarity: 'rare',
    hint: 'The priceless portrait by Johannes van Hoytl the Younger, hung over the doors at the top of the grand staircase. Blow the whistle and its picture lamp brightens.',
    poses: { lit: { label: 'In the spotlight', mult: 1.5 } }, maxDistance: 140, facing: forwardOf(lobby.painting),
    onCall: () => { spotT = 0; paintS.setPose('lit', 3); return true; },
    update: (_dt, ride) => { paintS.active = look(ride.position.z) && ride.position.z > -294; },
  });
  subjects.push(gustaveS, zeroS, boysS, liftS, madameS, paintS);
  let bellT = 9;

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
  // DEBUG-HOTEL-ACT (temporary, for screenshots): ?hotelAct=<seconds> blows the whistle at that time; ?hotelItem=<id> throws a box at a subject
  const actAt = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('hotelAct') ?? NaN) : NaN;
  const itemAt = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hotelItem') : null;
  let acted = false;
  return {
    id: 'hotel', group, show: showRange(road, R, 60, 6), occluders: [...valley.occluders, ext.occluder], subjects, floor, water: -Infinity,
    onCall(ride) { if (ride.position.z < -160) bellT = 0; },
    bump(z) {
      if (z > STAIRS.z0 || z < STAIRS.z1) return 0;
      const d = (STAIRS.z0 - STAIRS.z1) / 25;
      const f = (((STAIRS.z0 - z) / d) % 1 + 1) % 1;
      return -0.07 * (1 - f) ** 3;
    },
    update(dt, t, ride) {
      const z = ride.position.z;
      if (!acted && t >= (Number.isNaN(actAt) ? 1e9 : actAt)) { acted = true; for (const sb of subjects) if (sb.active) sb.tryCall(camPos, 200); }
      if (!acted && itemAt && t >= 1) { acted = true; const sb = subjects.find((x) => x.id === itemAt); if (sb) sb.hitByItem(sb.center()); }
      // a gentle tilt up the funicular, so the hotel stays in frame
      ctx.shot.pitch = 0.08 * zWindow(z, -42, -62, -118, -140);
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
      // ---- the people ----
      if (outside.visible && z > -40) {
        for (const p of [conductor, porter, lady, gent]) { p.lookTarget = camPos; p.update(dt, t); }
        vanT += dt;
        const vk = vanT < 1.8 ? (Math.sin(vanT * 18) > 0 ? 2.6 : 0.6) : 1;
        for (const l of van.lights) (l.material as THREE.MeshBasicMaterial).color.setHex(0xfff2c0).multiplyScalar(vk);
        van.group.position.y = sp.van.y + (vanT < 1.8 ? Math.abs(Math.sin(vanT * 16)) * 0.05 : 0);
      }
      if (inside.visible) {
        for (const p of [gustave, zero, operator, madame]) { p.lookTarget = camPos; p.update(dt, t); }
        for (const p of [sitter, reader]) { p.lookTarget = camPos; p.update(dt, t); }
        boys.update(dt, t);
        // the lift: the needle comes down to the ground floor, the doors slide open, the operator nods
        liftT += dt;
        lobby.liftNeedle.rotation.x = -Math.PI / 2 * smoothstep(0, 1, liftT) * (1 - smoothstep(4.8, 6.5, liftT));
        const dOpen = smoothstep(0.9, 1.6, liftT) * (1 - smoothstep(3.8, 4.6, liftT));
        for (const d of lobby.liftDoors) d.position.z = LIFT.z + d.userData.side * (1.05 + dOpen * 1.9);
        if (liftT > 1.1 && liftT < 1.2) operator.nod();
        lobby.liftLamp.color.setHex(0xffe0b0).multiplyScalar(1.2 + dOpen * 0.6);
        // the picture lamp over Boy with Apple
        spotT += dt;
        lobby.pictureLamp.color.setHex(0xfff2d0).multiplyScalar(1.1 + 1.6 * (spotT < 3 ? Math.sin(Math.min(1, spotT * 3) * Math.PI / 2) * (1 - smoothstep(2.4, 3, spotT)) : 0));
        // the concierge bell jumps when rung
        bellT += dt;
        lobby.bell.position.y = LOBBY.floor + 1.1 + (bellT < 0.5 ? Math.abs(Math.sin(bellT * 30)) * 0.04 * (1 - bellT * 2) : 0);
        lobby.chandelierBulbs.color.setHex(0xfff0c8).multiplyScalar(1.5 + Math.sin(t * 2.3) * 0.03);
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
