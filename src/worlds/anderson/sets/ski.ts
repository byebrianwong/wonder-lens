import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { envelope } from '../../../engine/Rig';
import { clamp, lerp, smoothstep } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, forwardOf, optimize, showRange, zWindow, type BuiltSet, type MountDef, type SetContext, type SetModule, type ZLightKey } from '../common';
import { CH, PROM, SPOT, Z, makePlan } from '../ski/plan';
import { buildRun } from '../ski/run';
import { buildMountain } from '../ski/terrain';
import { buildToboggan } from '../ski/toboggan';
import { buildPanorama } from '../ski/panorama';
import { buildCableCar, buildChapel, buildGate, buildObservatory, buildStartHut, flagpole } from '../ski/summit';
import { Beat, makeJopling, makeSkier, makeSledPair } from '../ski/cast';
import { makeIbex, makeMonks } from '../ski/creatures';
import { buildDressing } from '../ski/dressing';
import { SnowAir, Spray } from '../ski/fx';

/*
 * Part Three: Gabelmeister's Peak (The Grand Budapest Hotel), z -560 to -880.
 *
 *  -560..-586  under the lid of the pastry box, the rider is set down on a toboggan at the summit
 *  -586        the lid lifts: the start house behind, the start gate ahead, the observatory on its crag to the
 *              right with a great brass telescope, the cable car's red gondolas climbing to its station, the
 *              chapel on the left with its monks in a row; Gustave and Zero on their toboggan already over
 *              the edge ahead, and Jopling far below on skis
 *  -604        over the edge and down the bobsled run of glossy ice: a banked curve left, then right,
 *              through snowy firs, the painted Alps all round and the Grand Budapest small in the valley
 *  -699        onto the ski jump's trestle; off the lip at -729 and through the air over the crowd on the
 *              stands and the judges' box, down onto the landing hill at -772
 *  -772        across the snowfield past a ski instructor and an ibex on its crag, to the cliff edge, where
 *              Gustave hangs by his fingertips, Zero reaches down for him and Jopling stands over them
 *  -846        off the edge and down into the drift below (the white cover)
 */

const R = SETS.ski;

const KEY = { skyTop: 0x2c5cc4, skyMid: 0x7eaae8, skyBottom: 0xf2dbe6, fog: 0xdcdff2, fogDensity: 0.0013, sunDir: [0.75, 0.5, -0.38] as [number, number, number], sunColor: 0xffd8d0, sunIntensity: 2.2, hemiSky: 0xb4c8f4, hemiGround: 0xeadcf0, hemiIntensity: 0.95, exposure: 0.96, bloom: 0.32, saturation: 1.1, sunGlow: 0.7, sunSize: 0.022, horizonHeight: 0.1, cloudShadow: 0 };
export const LIGHTS: ZLightKey[] = [{ z: -562, ...KEY }, { z: -878, ...KEY }];

/** where Jopling and Gustave and Zero's toboggan come to a stop at the cliff */
const STOP_J = -853.2, STOP_G = -847.5;
/** where Gustave hangs from the promontory's lip */
const G_HANG_Z = -851.2;
/** where the ski instructor pulls up */
const SKIER_STOP = -836;
/** Gustave flies off the toboggan and catches the edge once it stops */
const TUMBLE_Z = -829;

function build(ctx: SetContext): BuiltSet {
  const { road, fx, shot } = ctx;
  const plan = makePlan(road);
  const group = new THREE.Group();
  const statics = new THREE.Group(), live = new THREE.Group();
  group.add(statics, live);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // ---------- the run, the mountain, the panorama ----------
  const run = buildRun(plan);
  statics.add(run.group);
  const keepOut: Array<[number, number, number]> = [[SPOT.obs.x, SPOT.obs.z, 22], [SPOT.station.x, SPOT.station.z, 12], [SPOT.chapel.x, SPOT.chapel.z, 20], [0, -553, 10], [SPOT.ibex.x, SPOT.ibex.z, 7]];
  const avoid = (x: number, z: number) => {
    for (const [kx, kz, r] of keepOut) if (Math.hypot(x - kx, z - kz) < r) return true;
    // the summit plateau and the run's piste stay clear; the cliff's tableau too
    if (z > Z.tip && Math.abs(x) < 26) return true;
    // keep the vista from the summit open: no trees close beside the first stretch of the run
    if (z > -660 && z < Z.tip + 2 && Math.abs(x - road.at(z).x) < 21) return true;
    if (z < Z.edge + 12 && z > Z.edge - 2 && Math.abs(x) < 16) return true;
    if (z < Z.touch && z > Z.edge && Math.abs(x - road.at(z).x) < 14) return true;
    return false;
  };
  const mountain = buildMountain(plan, avoid, ctx.lowDetail);
  group.add(mountain.group);
  const ground = mountain.ground;
  const pano = buildPanorama((x, z) => plan.height(x, z));
  statics.add(pano.group);

  // ---------- the summit ----------
  const hut = buildStartHut();
  hut.position.set(0, 54, Z.hut);
  statics.add(hut);
  const gate = buildGate();
  { const p = road.at(Z.gate); gate.position.set(p.x, p.y, p.z); }
  statics.add(gate);
  const obs = buildObservatory();
  obs.group.position.copy(SPOT.obs);
  obs.group.rotation.y = -0.78;
  statics.add(obs.group);
  const chapel = buildChapel();
  chapel.group.position.copy(SPOT.chapel);
  chapel.group.rotation.y = 0.98;
  statics.add(chapel.group);
  const cable = buildCableCar();
  statics.add(cable.group);
  // flags along the start, in pairs either side of the piste
  const summitFlags: THREE.Object3D[] = [];
  for (const [z, a, b] of [[-572, 0xc8323c, 0xf6efe2], [-596, 0x5d3a8a, 0xf2b8c6], [-601.5, 0x2a3a6a, 0xf6efe2]] as Array<[number, number, number]>) {
    for (const s of [-1, 1]) {
      const fp = flagpole(6.5, a, b, s < 0 ? 'keys' : 'stripe');
      fp.group.position.set(s * 6.6, 54, z);
      fp.group.rotation.y = s > 0 ? Math.PI : 0;
      statics.add(fp.group);
      summitFlags.push(fp.flag);
    }
  }
  // monks in a row before the chapel door
  chapel.group.updateMatrixWorld(true);
  const monkSpots = Array.from({ length: 7 }, (_, i) => {
    const p = chapel.group.localToWorld(V(-4.8 + i * 1.6, 0, 10.6));
    p.y = ground(p.x, p.z) - 0.02;
    return { pos: p, yaw: 0.98 };
  });
  const monks = makeMonks(monkSpots);
  live.add(monks.group);

  // ---------- along the descent ----------
  const dress = buildDressing(plan, ground, ctx.lowDetail);
  statics.add(dress.statics);
  live.add(dress.live);
  statics.updateMatrixWorld(true);
  optimize(statics);

  // ---------- the rider's toboggan ----------
  const sled = buildToboggan({ rider: true });
  const mount: MountDef = {
    kind: 'sled', group: sled.group, seat: sled.seat, z0: R.z0, z1: R.z1, tilt: 1, bank: 0.35,
    update(dt, t, ride) { sled.update(dt, t, ride.speedMult); },
  };

  // ---------- snow in the air, powder thrown up ----------
  const air = new SnowAir(ctx.lowDetail ? 500 : 900);
  const spray = new Spray(ctx.lowDetail ? 140 : 240);
  live.add(air.points, spray.points);

  // ---------- the chase ----------
  const jop = makeJopling();
  const jopWrap = new THREE.Group();
  jopWrap.add(jop.group);
  live.add(jopWrap);
  const pair = makeSledPair();
  live.add(pair.group);
  const skier = makeSkier();
  live.add(skier.group);
  const ibex = makeIbex();
  ibex.group.position.copy(dress.ibexSpot);
  ibex.group.rotation.y = 0.9;
  live.add(ibex.group);

  // DEBUG-COUNT
  {
    const tally = (o: THREE.Object3D) => { let n = 0, sh = 0; o.traverse((c) => { const m = c as THREE.Mesh; if ((m.isMesh || (c as THREE.Points).isPoints) && c.visible) { n++; if (m.castShadow) sh++; } }); return `${n}/${sh}`; };
    console.warn(`[ski-count] statics ${tally(statics)} mountain ${tally(mountain.group)} jop ${tally(jop.group)} pair ${tally(pair.group)} skier ${tally(skier.group)} ibex ${tally(ibex.group)} monks ${tally(monks.group)} dress.live ${tally(dress.live)} sled ${tally(sled.group)}`);
  }
  // ---------- photo subjects ----------
  const camPos = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const subjects: Subject[] = [];
  const add = (s: Subject) => { subjects.push(s); return s; };

  const obsLook = new Beat(5);
  const obsS = add(new Subject({
    id: 'observatory', name: "The observatory on Gabelmeister's Peak", from: FILMS.gbh, group: obs.anchor, radius: 9, base: 600,
    hint: 'On its crag to the right of the start, a white domed observatory with a brass telescope far too big for it. Blow the whistle and the dome turns and the telescope looks your way.',
    poses: { peek: { label: 'The telescope looks back', mult: 1.6 } }, maxDistance: 220, reactRange: 20,
    onCall: () => { if (obsLook.on) return false; obsLook.start(); obsS.setPose('peek', 4); return true; },
  }));

  let cableP = 0.78, cableStop = new Beat(4.5);
  const carAnchor = new THREE.Object3D();
  carAnchor.position.set(0, -5.2, 0);
  cable.car.add(carAnchor);
  const carS = add(new Subject({
    id: 'cablecar', name: 'The cable car', from: FILMS.gbh, group: carAnchor, radius: 4.5, base: 700,
    hint: 'A red gondola climbing on its cable from the valley to the station by the observatory. Blow the whistle and it stops dead in mid-air, swinging.',
    poses: { stopped: { label: 'Stopped in mid-air', mult: 1.6 } }, maxDistance: 240, reactRange: 30,
    onCall: () => { if (cableStop.on) return false; cableStop.start(); carS.setPose('stopped', 4.5); return true; },
    onItem: () => { cableStop.start(); carS.setPose('stopped', 3); return true; },
  }));

  const monkAnchor = new THREE.Object3D();
  monkAnchor.position.copy(monkSpots[3].pos).add(V(0, 1.4, 0));
  live.add(monkAnchor);
  const monkS = add(new Subject({
    id: 'monks', name: 'The monks of Gabelmeister', from: FILMS.gbh, group: monkAnchor, radius: 6, base: 650, crowd: true,
    hint: 'A row of monks in brown habits before the chapel on the left of the start, chanting. Blow the whistle and they all turn to you at once, and bow.',
    poses: { unison: { label: 'In perfect unison', mult: 1.7 } }, maxDistance: 140, reactRange: 18,
    facing: () => new THREE.Vector3(Math.sin(0.98), 0, Math.cos(0.98)),
    onCall: () => { if (monks.turning) return false; monks.turnTo(eye); monkS.setPose('unison', 4.2); return true; },
    onItem: () => { if (monks.turning) return false; monks.turnTo(eye); monkS.setPose('unison', 4.2); return true; },
  }));

  const jopAnchor = new THREE.Object3D();
  jopAnchor.position.set(0, 1.3, 0);
  jop.group.add(jopAnchor);
  const jopS = add(new Subject({
    id: 'jopling', name: 'Jopling', from: FILMS.gbh, group: jopAnchor, radius: 1.4, base: 1450, rarity: 'legendary',
    hint: 'The killer in the black leather coat, skiing down the mountain ahead of everyone; at the bottom he waits at the edge of the cliff. Blow the whistle and he looks back at you; throw a box and out come the brass knuckles.',
    poses: { glare: { label: 'The look back', mult: 1.8 }, menace: { label: 'Brass knuckles', mult: 1.6 }, cliff: { label: "At the cliff's edge", mult: 1.5 } },
    maxDistance: 120, reactRange: 10, facing: forwardOf(jop.group),
    onCall: () => { jop.glare(); jopS.setPose('glare', 3); return true; },
    onItem: () => { jop.menace(); jopS.setPose('menace', 2.8); return true; },
  }));

  const pairAnchor = new THREE.Object3D();
  pairAnchor.position.set(0, 1.0, 0);
  pair.body.add(pairAnchor);
  const pairS = add(new Subject({
    id: 'gustave-zero', name: 'M. Gustave and Zero', from: FILMS.gbh, group: pairAnchor, radius: 1.8, base: 1100, rarity: 'rare',
    hint: 'The concierge and his lobby boy on their own toboggan, just ahead of you in the chase. Blow the whistle and M. Gustave raises his hat; throw a box and Zero hauls the toboggan round.',
    poses: { hat: { label: 'Hats off', mult: 1.7 }, steer: { label: 'Zero steers', mult: 1.5 }, hanging: { label: 'Hanging on', mult: 1.8 } },
    maxDistance: 110, reactRange: 9, facing: forwardOf(pair.group),
    onCall: () => { pair.gustave.waveHat(); pairS.setPose('hat', 2.6); return true; },
    onItem: () => { if (tumbleT >= 0) return false; pair.steer(); pairS.setPose('steer', 2.2); return true; },
  }));

  const jumpS = add(new Subject({
    id: 'skijump', name: 'The ski jump', from: FILMS.gbh, group: dress.jumpAnchor, radius: 10, base: 550,
    hint: 'The bobsled run ends on a wooden ski jump over a landing hill lined with spectators, with the judges in their box. Blow the whistle in the air and the crowd goes wild; the judges hold up their cards when you land.',
    poses: { cheer: { label: 'The crowd goes wild', mult: 1.5 }, scores: { label: 'Full marks', mult: 1.6 } }, maxDistance: 160, reactRange: 30,
    onCall: () => { dress.crowd.cheer(); jumpS.setPose('cheer', 3.4); return true; },
    onItem: () => { dress.crowd.cheer(); jumpS.setPose('cheer', 3.4); return true; },
  }));

  const skierAnchor = new THREE.Object3D();
  skierAnchor.position.set(0, 1.0, 0);
  skier.group.add(skierAnchor);
  const skierS = add(new Subject({
    id: 'skier', name: 'A ski instructor', from: FILMS.gbh, group: skierAnchor, radius: 1.2, base: 550,
    hint: 'In a red-and-white striped jumper and a bobble hat, skiing beside you across the snowfield below the jump. Blow the whistle and she waves a pole; a box knocks her head over heels.',
    poses: { wave: { label: 'A friendly wave', mult: 1.4 }, tumble: { label: 'Head over heels', mult: 1.8 } }, maxDistance: 90, reactRange: 6, facing: forwardOf(skier.group),
    onCall: () => { skier.wave(); skierS.setPose('wave', 2.2); return true; },
    onItem: () => { if (skier.tumbling) return false; skier.tumble(); skierS.setPose('tumble', 3); spray.emit(skier.group.position, V(0, 1, 0), 18, 2, 0.6, 1.2); return true; },
  }));

  const ibexAnchor = new THREE.Object3D();
  ibexAnchor.position.set(0, 1.0, 0);
  ibex.group.add(ibexAnchor);
  const ibexS = add(new Subject({
    id: 'ibex', name: 'An alpine ibex', from: FILMS.gbh, group: ibexAnchor, radius: 1.4, base: 800, rarity: 'rare',
    hint: 'A wild goat with great ridged horns, on top of a crag to the left of the snowfield. Blow the whistle or throw a box and it rears up on its hind legs.',
    poses: { rear: { label: 'King of the crag', mult: 1.7 } }, maxDistance: 110, reactRange: 12, facing: forwardOf(ibex.group),
    onCall: () => { if (ibex.busy) return false; ibex.rear(); ibexS.setPose('rear', 2.8); return true; },
    onItem: () => { if (ibex.busy) return false; ibex.rear(); ibexS.setPose('rear', 2.8); return true; },
  }));

  const hotelGlow = new Beat(6);
  const hotelS = add(new Subject({
    id: 'gbh-valley', name: 'The Grand Budapest, far below', from: FILMS.gbh, group: pano.hotel.anchor, radius: 22, base: 750, rarity: 'rare',
    hint: 'Small and pink and far below in the valley straight ahead, on its crag above the roofs of Nebelsbad. Best seen as you tip over the summit and in the air off the ski jump. Blow the whistle and its windows light up.',
    poses: { lights: { label: 'Lights in the valley', mult: 1.5 } }, maxDistance: 700,
    onCall: () => { hotelGlow.start(); hotelS.setPose('lights', 5); return true; },
  }));

  // ---------- the chase: where everyone is, by the rider's z ----------
  /** past `lim`, ease into a stop at it: the distance left shrinks smoothly to zero */
  const ease = (d: number, k = 4) => (d >= k ? d : k * Math.exp((d - k) / k));
  const tq = new THREE.Quaternion(), tm = new THREE.Matrix4(), tUp = new THREE.Vector3(0, 1, 0), tf = new THREE.Vector3(), tr = new THREE.Vector3();
  /** stand an object on the run at z and lateral offset, facing down the run, pitched with the slope and tilted with the floor */
  const onRun = (o: THREE.Object3D, z: number, lat: number, yaw = 0, lift = 0) => {
    const p = road.at(z), a = road.at(z + 0.6), b = road.at(z - 0.6);
    const x = p.x + p.rx * lat, zz = p.z + p.rz * lat;
    // on the snowfield (and out on the promontory) stand on the snow itself
    const y = (z < Z.touch ? ground(x, zz) : plan.surface(z, lat)) + lift;
    o.position.set(x, y, zz);
    // pitched with the run (or, on the snowfield, with the snow under it)
    tf.set(b.x - a.x, 0, b.z - a.z).normalize();
    const slope = z < Z.touch ? (ground(x + tf.x * 0.6, zz + tf.z * 0.6) - ground(x - tf.x * 0.6, zz - tf.z * 0.6)) / 1.2 : (b.y - a.y) / Math.max(0.01, Math.hypot(b.x - a.x, b.z - a.z));
    tf.y = slope; tf.normalize();
    tr.set(p.rx, 0, p.rz);
    const roll = z <= Z.chan0 && z >= Z.chan1 ? plan.bank(z) * 0.8 : 0;
    tUp.set(0, 1, 0).applyAxisAngle(tf, -roll);
    tm.lookAt(new THREE.Vector3(), tf, tUp);
    // lookAt points -z at the target; turn half round so +z leads
    tq.setFromRotationMatrix(tm).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + yaw));
    o.quaternion.copy(tq);
  };
  let tumbleT = -1;
  const gHang = V(0, 0, 0), zKneel = V(0, 0, 0), sledRest = V(0, 0, 0);
  {
    // Gustave hangs from the promontory's left lip, facing its wall; Zero kneels above reaching down to him
    gHang.set(PROM.x0 - 0.42, ground(PROM.x0 + 1.2, G_HANG_Z) - 2.3, G_HANG_Z);
    zKneel.set(PROM.x0 + 0.95, ground(PROM.x0 + 0.95, G_HANG_Z + 1.6), G_HANG_Z + 1.6);
    sledRest.set(PROM.x0 + 4, ground(PROM.x0 + 4, STOP_G), STOP_G);
  }
  const gFrom = new THREE.Vector3(), zFrom = new THREE.Vector3();
  const jumpPuff = { done: false };
  let landed = false;

  const sprayV = new THREE.Vector3();
  let sprayAcc = 0;

  return {
    id: 'ski', group, show: showRange(road, R, 8, 10), occluders: mountain.occluders, subjects, water: -Infinity,
    floor: (x, z) => {
      const { lat } = plan.foot(x, z);
      if (z <= Z.chan0 && z >= Z.chan1 && Math.abs(lat) < CH.floor + CH.r) return plan.surface(z, lat);
      if (z <= Z.ramp0 && z >= Z.lip && Math.abs(lat) < 2.5) return road.at(z).y;
      return ground(x, z);
    },
    mounts: [mount],
    bump(z) {
      // chatter on the ice, a rattle on the trestle's boards, the landing, ripples in the snow
      let b = 0;
      if (z <= Z.chan0 && z >= Z.chan1) b += 0.012 * Math.sin(z * 9.1) + 0.007 * Math.sin(z * 23.7);
      if (z <= Z.ramp0 && z >= Z.lip) b += 0.02 * Math.abs(Math.sin(z * Math.PI / 0.7));
      if (z < Z.touch + 0.5 && z > Z.touch - 8) b -= 0.34 * Math.sin(clamp((Z.touch + 0.5 - z) / 8.5, 0, 1) * Math.PI) * (1 - (Z.touch - z) / 12);
      if (z < Z.touch - 8 && z > Z.edge) b += 0.025 * Math.sin(z * 1.7);
      return b;
    },
    update(dt, t, ride) {
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      eye.copy(camPos);
      const speed = ride.speedMult;

      // ---- subjects on and off by stretch ----
      obsS.active = z < Z.clear + 2 && z > -700;
      carS.active = z < Z.clear + 2 && z > -720;
      monkS.active = z < Z.clear + 2 && z > -660;
      jopS.active = z < Z.clear && z > Z.coverIn;
      pairS.active = z < Z.clear + 2 && z > Z.coverIn;
      jumpS.active = z < -690 && z > -800;
      skierS.active = z < -768 && z > Z.edge + 2;
      ibexS.active = z < -760 && z > Z.edge;
      hotelS.active = z < Z.tip + 2 && z > Z.coverIn;

      // ---- the camera: the shake of the ice, the lift off the lip, a look down in the air and over the edge ----
      const inChan = z <= Z.chan0 && z >= Z.chan1 ? 1 : 0;
      shot.roll += inChan * (Math.sin(t * 17.3) * 0.004 + Math.sin(t * 29.1) * 0.003) * speed;
      shot.offset.x += inChan * Math.sin(t * 23.1) * 0.006 * speed;
      shot.pitch += 0.06 * zWindow(z, Z.lip + 4, Z.lip, Z.lip - 4, Z.lip - 10) - 0.15 * zWindow(z, Z.lip - 8, Z.lip - 20, Z.touch + 2, Z.touch - 8) - 0.3 * zWindow(z, Z.edge + 3, Z.edge - 5, -876, -884);
      shot.offset.y += 0.18 * zWindow(z, Z.lip + 2, Z.lip - 3, Z.touch + 6, Z.touch);
      // at the cliff the camera cranes up over the toboggan and turns a little to the tableau at the edge
      const crane = zWindow(z, -810, -832, -850, -862);
      shot.offset.y += 2.4 * crane;
      shot.offset.z -= 0.8 * crane;
      shot.pitch -= 0.16 * crane;
      shot.yaw -= 0.1 * crane;

      // ---- snow in the air; powder from the runners ----
      air.update(t, camPos);
      air.intensity = 1;
      sprayAcc += dt;
      const puff = sprayAcc > 0.07;
      if (puff) sprayAcc = 0;
      if (puff && speed > 0.3 && (z > Z.touch || z < Z.lip)) {
        // the rider's own runners, out behind (seen when looking back)
        for (const s of [-1, 1]) {
          tr.set(s * 0.45, 0.05, -1.2).applyQuaternion(ctx.vehicle.quaternion).add(ctx.vehicle.position);
          sprayV.set(0, 0.6, 0);
          spray.emit(tr, sprayV, 1, 0.8, 0.28, 0.7);
        }
      }
      if (!jumpPuff.done && z < Z.touch && z > Z.touch - 6) {
        jumpPuff.done = true;
        tr.copy(ride.position).addScaledVector(ride.tangent, 2.5);
        spray.emit(tr, sprayV.set(0, 2.2, 0), 26, 3.5, 0.7, 1.3);
        fx.flash(0.12, 0xffffff);
      }
      if (z > Z.lip) jumpPuff.done = false;
      spray.update(dt);

      // ---- the summit: flags, the telescope, the gondolas, the monks ----
      if (z > -760) {
        const allFlags = [...summitFlags, ...dress.flags];
        allFlags.forEach((f, i) => { f.rotation.y = 0.35 + Math.sin(t * 2.3 + i * 1.7) * 0.25 + Math.sin(t * 5.1 + i) * 0.08; });
        // the observatory: on the whistle the dome swings round and the telescope tips down to look at you
        const ol = obsLook.step(dt);
        const k = ol >= 0 ? envelope(ol, 0, 1.2, 3.6, 5) : 0;
        if (k > 0) { tr.copy(eye); obs.group.worldToLocal(tr); }
        const toYou = k > 0 ? Math.atan2(tr.x, tr.z) : 0;
        obs.dome.rotation.y = lerp(Math.sin(t * 0.07) * 0.3, toYou, k);
        obs.telescope.rotation.x = 0.5 * k + Math.sin(t * 0.21) * 0.02;
        // the gondolas creep along their cables; stopped by the whistle, the climbing one swings
        const cs = cableStop.step(dt);
        if (!cableStop.on) cableP = (cableP + dt * 0.012) % 1;
        const swing = cs >= 0 ? Math.sin(cs * 3.1) * 0.22 * Math.exp(-cs * 0.45) : Math.sin(t * 0.9) * 0.015;
        cable.place(1 - cableP, swing, cableP);
        monks.update(dt, t);
      }

      // ---- Jopling: skiing well ahead, then standing at the cliff's edge ----
      {
        const zj = STOP_J + ease(z - 44 - STOP_J);
        const atCliff = zj - STOP_J < 0.6;
        const toEdge = smoothstep(STOP_J + 32, STOP_J + 9, zj);
        let lat = zj > Z.chan1 ? Math.sin(zj * 0.21) * 0.55 : zj > Z.lip ? 0 : zj > Z.touch ? 0 : Math.sin(zj * 0.16) * 2.2 * (1 - toEdge);
        lat = lerp(lat, PROM.x0 + 2.4, toEdge);
        onRun(jopWrap, zj, lat, toEdge * (Math.PI - 0.9));
        jop.skis.visible = !atCliff || z > STOP_J + 40;
        jop.crouch = atCliff ? 0 : zj < Z.lip && zj > Z.touch ? 0.6 : 0.9;
        jop.lookTarget = eye;
        jopWrap.visible = z < Z.clear + 14 && z > Z.coverFull;
        if (jopWrap.visible) jop.update(dt, t);
        if (atCliff && jopS.pose === 'idle' && z < STOP_J + 40) jopS.setPose('cliff', 0.2);
        if (puff && !atCliff && speed > 0.3 && (zj > Z.touch || zj < Z.lip)) spray.emit(jopWrap.position, sprayV.set(0, 0.8, 0), 1, 0.9, 0.3, 0.6);
      }

      // ---- Gustave and Zero: just ahead, then the tumble at the cliff ----
      {
        const lead = lerp(12, 21, smoothstep(-586, -630, z));
        const zg = STOP_G + ease(z - lead - STOP_G);
        const toEdge = smoothstep(STOP_G + 28, STOP_G + 7, zg);
        let lat = zg > Z.chan1 ? Math.sin(zg * 0.17 + 1) * 0.45 : zg > Z.touch ? 0 : Math.sin(zg * 0.13) * 1.4 * (1 - toEdge);
        lat = lerp(lat, PROM.x0 + 4, toEdge);
        onRun(pair.group, zg, lat, toEdge * 0.5);
        pair.group.visible = z < Z.clear + 14 && z > Z.coverFull;
        pair.gustave.lookTarget = eye; pair.zero.lookTarget = eye;
        // the tumble: once stopped, Gustave flies off over the front and catches the edge; Zero scrambles to him
        if (z > TUMBLE_Z + 4 && tumbleT >= 0) {
          tumbleT = -1;
          pair.body.add(pair.gustave.group, pair.zero.group);
          pair.gustave.group.position.set(0, 0, -0.55); pair.gustave.group.rotation.set(0, 0, 0);
          pair.zero.group.position.set(0, 0, 0.45); pair.zero.group.rotation.set(0, 0, 0);
          pair.gustave.mode = 'sit'; pair.zero.mode = 'steer';
          pairAnchor.removeFromParent(); pair.body.add(pairAnchor); pairAnchor.position.set(0, 1, 0);
        }
        if (z < TUMBLE_Z && tumbleT < 0) {
          tumbleT = 0;
          pair.gustave.group.getWorldPosition(gFrom); pair.zero.group.getWorldPosition(zFrom);
          live.add(pair.gustave.group, pair.zero.group);
          pairAnchor.removeFromParent(); pair.gustave.group.add(pairAnchor); pairAnchor.position.set(0, 1.2, 0);
          spray.emit(sledRest, sprayV.set(0, 1.5, -1), 20, 2.2, 0.6, 1.2);
        }
        if (tumbleT >= 0) {
          tumbleT += dt;
          const k = clamp(tumbleT / 0.9, 0, 1), e = k * k * (3 - 2 * k);
          pair.gustave.group.position.lerpVectors(gFrom, gHang, e);
          pair.gustave.group.position.y += Math.sin(k * Math.PI) * 1.4;
          // facing the promontory's wall (+x), his back to the path
          pair.gustave.group.rotation.set(0, Math.PI / 2, 0);
          pair.gustave.mode = k > 0.45 ? 'hang' : 'stand';
          const kz = clamp((tumbleT - 0.3) / 0.9, 0, 1), ez = kz * kz * (3 - 2 * kz);
          pair.zero.group.position.lerpVectors(zFrom, zKneel, ez);
          pair.zero.group.rotation.set(0, -Math.PI / 2 + 0.35, 0);
          pair.zero.mode = kz > 0.5 ? 'reach' : 'stand';
          // the empty toboggan slews round and stops at the edge
          pair.body.rotation.y = lerp(0, 0.9, e);
          if (pairS.pose === 'idle' && k >= 1) pairS.setPose('hanging', 0.2);
        }
        if (pair.group.visible) pair.update(dt, t, tumbleT >= 0 ? 0 : speed);
        if (puff && tumbleT < 0 && speed > 0.3 && (zg > Z.touch || zg < Z.lip)) spray.emit(pair.group.position, sprayV.set(0, 0.7, 0), 1, 0.8, 0.32, 0.6);
      }

      // ---- the jump: the crowd, the judges' cards as you land ----
      if (z < -680 && z > -820) {
        dress.crowd.update(dt, t);
        if (!landed && z < Z.touch - 3) { landed = true; dress.judges.score(); jumpS.setPose('scores', 4); }
        if (z > Z.touch) landed = false;
        dress.judges.update(dt, t);
      }

      // ---- the ski instructor alongside on the snowfield; the ibex ----
      {
        // she keeps pace beside the rider, then pulls up short of the edge to watch
        const zs = SKIER_STOP + ease(z - lerp(-4, 10, smoothstep(-776, -830, z)) - SKIER_STOP, 5);
        const lat = 8 + Math.sin(zs * 0.18) * 2.4;
        onRun(skier.group, zs, lat, Math.cos(zs * 0.18) * 0.35);
        skier.group.position.y = ground(skier.group.position.x, skier.group.position.z);
        skier.group.visible = z < -760 && z > Z.coverFull;
        skier.lookTarget = eye;
        if (skier.group.visible) {
          skier.update(dt, t);
          if (puff && !skier.tumbling) spray.emit(skier.group.position, sprayV.set(0, 0.7, 0), 1, 0.8, 0.3, 0.6);
        }
        ibex.group.visible = z < -740 && z > Z.coverFull;
        if (ibex.group.visible) ibex.update(dt, t, eye);
      }

      // ---- the Grand Budapest's windows ----
      const hg = hotelGlow.step(dt);
      pano.hotel.lights.set(hg >= 0 ? envelope(hg, 0, 0.6, 4.5, 6) : 0);
    },
  };
}

export const SKI: SetModule = {
  build, lights: LIGHTS,
  env: (z) => ({ wind: lerp(0.45, 0.85, smoothstep(-600, -650, z)) * (1 - 0.35 * smoothstep(-800, -850, z)), birds: 0.12 * (1 - smoothstep(-590, -620, z)), sea: 0, rain: 0, crickets: 0 }),
};
