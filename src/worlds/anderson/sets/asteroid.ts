import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { mergeStatic } from '../../../engine/Builders';
import { clamp, lerp, smoothstep } from '../../../engine/math';
import { Rng } from '../../../engine/math';
import { SETS } from '../layout';
import { FILMS, explodeGroups, forwardOf, gatherInstances, showRange, zWindow, type BuiltSet, type LightSpot, type SetContext, type SetModule, type ZLightKey } from '../common';
import { buildTheatre } from '../asteroid/theatre';
import { buildTown } from '../asteroid/town';
import { unifyColours } from '../asteroid/kit';
import { makeAlienPuppet, makeAugieFigure, makeCarChase, makeCowboys, makeGeneral, makeRoadrunner, makeStargazers, makeUfo } from '../asteroid/characters';
import { ARCH, AUGIE, COWBOYS, CRATER, HOUSE, HOUSE_Y, NIGHT, OVERPASS, PATH_Y, PODIUM, ROAD, STAGE_Y, STARGAZERS, bermY } from '../asteroid/plan';

/*
 * Part Six: Asteroid City, a play in three acts. The town is staged on a giant stage, and the theatre is
 * part of the show.
 *
 *  z -1506  the lightning flash clears: the rider is on a runway through the audience of a black-and-white
 *           theatre (the film's television frame story), looking through a gold proscenium at the desert
 *  z -1566  through the arch onto the stage: painted mesa flats braced from behind, a cyclorama sky, a sun
 *           that is a stage lantern, fly bars overhead
 *  z -1575  the roadrunner dashes back and forth across the line ahead of the train
 *  z -1588  the car chase overtakes the train on the road; later it comes back the other way
 *  z -1606  Augie Steenbeck at the gas station by his broken-down car; the vending machines (martinis,
 *           deeds to land); the motor court's cabins; the diner, cut away like a doll's house
 *  z -1636  a pastel mushroom cloud rises far off on the left (a cut-out flat on a lift); nobody looks up
 *  z -1672  the singing cowboys; z -1690 under the overpass that stops in mid-air
 *  z -1698  the lighting cue: the stage goes to night, the moon and the stars are flown in on wires
 *  z -1724  the UFO comes down over the crater (or sooner, if the rider whistles near it); the alien
 *           floats down in the beam, takes the meteorite from its cage, poses for Augie's photograph at
 *           the end of the line, and goes back up
 *  z -1778  the curtain comes down on the play
 */

const R = SETS.asteroid;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const DAY: Omit<ZLightKey, 'z'> = {
  skyTop: 0x16181e, skyMid: 0x1c1f26, skyBottom: 0x24262c, fog: 0xf2dcc8, fogDensity: 0.0021,
  sunDir: [0.22, 0.8, 0.55], sunColor: 0xfff4e6, sunIntensity: 2.3, hemiSky: 0xcfe8f0, hemiGround: 0xeac8ae, hemiIntensity: 0.95,
  exposure: 0.98, bloom: 0.3, saturation: 1.15, sunGlow: 0, cloudShadow: 0, stars: 0,
};
const NIGHT_KEY: Omit<ZLightKey, 'z'> = {
  skyTop: 0x04070a, skyMid: 0x060c10, skyBottom: 0x0a161a, fog: 0x0c3440, fogDensity: 0.0024,
  sunDir: [-0.25, 0.75, 0.5], sunColor: 0x9ac8f0, sunIntensity: 0.6, hemiSky: 0x2e7088, hemiGround: 0x1a3c3c, hemiIntensity: 0.8,
  exposure: 1.06, bloom: 0.6, saturation: 1.1, sunGlow: 0, cloudShadow: 0, stars: 0,
};
export const LIGHTS: ZLightKey[] = [
  { z: -1500, ...DAY },
  { z: NIGHT.a, ...DAY },
  { z: NIGHT.b, ...NIGHT_KEY },
  { z: -1800, ...NIGHT_KEY },
];

/** Make a static group cheap: split per-face materials, fold plain colours into one material, pool, merge. */
function optimizeAC(root: THREE.Object3D) {
  explodeGroups(root);
  unifyColours(root);
  gatherInstances(root);
  mergeStatic(root);
}

function build(ctx: SetContext): BuiltSet {
  const { road, lights, fx, shot } = ctx;
  const group = new THREE.Group();
  const rng = new Rng(1955);
  const theatre = buildTheatre(rng);
  group.add(theatre.statics, theatre.live);
  optimizeAC(theatre.statics);
  const town = buildTown(road, rng);
  group.add(town.statics, town.live);
  optimizeAC(town.statics);
  const cast = new THREE.Group();
  group.add(cast);

  const camPos = new THREE.Vector3(), camDir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const inView = (p: THREE.Vector3, k = 0.35) => tmp.copy(p).sub(camPos).normalize().dot(camDir) > k;
  const subjects: Subject[] = [];
  const zOf = (ride: { position: THREE.Vector3 }) => ride.position.z;

  // ---------- light: the footlights on the house, the follow spot on the general, the beam, the flash ----------
  const beamSpot: LightSpot = { from: road.u(-1694), to: road.u(-1810), pos: V(0, 6, CRATER.z), color: 0x9affe8, intensity: 0, distance: 34 };
  const flashSpot: LightSpot = { from: road.u(-1590), to: road.u(-1810), pos: V(AUGIE.dayX, 4, AUGIE.dayZ), color: 0xf4f8ff, intensity: 60, distance: 22 };
  lights.add({ from: road.u(-1494), to: road.u(-1586), pos: V(0, 5, ARCH.apron + 6), color: 0xffe4b8, intensity: 26, distance: 34 });
  lights.add({ from: road.u(-1690), to: road.u(-1810), pos: V(PODIUM.x + 6, 9, PODIUM.z + 2), color: 0xffe0b0, intensity: 40, distance: 24 });
  lights.add(beamSpot);
  lights.add(flashSpot);
  lights.boost.set(beamSpot, 0); lights.boost.set(flashSpot, 0);

  // =====================================================================================================
  // THE PROSCENIUM (landmark)
  // =====================================================================================================
  const archAnchor = new THREE.Object3D(); archAnchor.position.set(0, 20, ARCH.z + 1); group.add(archAnchor);
  const archS = new Subject({
    id: 'ac-proscenium', name: 'The proscenium', from: FILMS.asteroid, group: archAnchor, radius: 26, base: 650,
    hint: 'The gold arch of the theatre, with the masks of comedy and tragedy over it and the red curtain drawn back. Take it as the flash clears, with the desert lit up beyond.',
    poses: { curtain: { label: 'Curtain up', mult: 1.5 } }, maxDistance: 140,
    update: (_dt, ride) => { const z = zOf(ride); archS.active = z > -1566 && z < -1500; if (z > -1546 && z < -1505) archS.setPose('curtain', 0.3); },
  });
  subjects.push(archS);

  // =====================================================================================================
  // THE ROADRUNNER: dashes across the line ahead of the train, stops, looks about, dashes back
  // =====================================================================================================
  const rr = makeRoadrunner();
  cast.add(rr.group);
  const rrState = { side: 1, pause: 0, gone: false, target: V(6.5, STAGE_Y, -1600), dancing: 0 };
  rr.group.position.set(6.5, STAGE_Y, -1600);
  const rrS = new Subject({
    id: 'ac-roadrunner', name: 'The roadrunner', from: FILMS.asteroid, group: rr.group, radius: 1.1, base: 820, rarity: 'rare',
    hint: 'A roadrunner (a rod puppet, stop-motion) dashing back and forth across the line just ahead of the train. Whistle and it does its little dance; throw a box and it pecks at it.',
    poses: { dance: { label: 'The roadrunner dance', mult: 1.8 }, peck: { label: 'Pecking at the box', mult: 1.5 } }, centerOffset: V(0, 0.8, 0), facing: forwardOf(rr.group),
    onCall: () => { rr.dance(); rrS.setPose('dance', 3.4); return true; },
    onItem: (pos) => { rrState.target.set(pos.x, STAGE_Y, pos.z); rrState.pause = 0; rr.peck(); rrS.setPose('peck', 2.2); return true; },
    maxDistance: 70, reactRange: 16,
    update: (_dt, ride) => { const z = zOf(ride); rrS.active = !rrState.gone && z < -1560 && z > -1700; },
  });
  subjects.push(rrS);

  // =====================================================================================================
  // THE CAR CHASE: overtakes the train on the road, then comes back the other way
  // =====================================================================================================
  const chase = makeCarChase();
  cast.add(chase.group);
  let chaseRuns = 0;

  // =====================================================================================================
  // AUGIE STEENBECK: by his station wagon at the gas station in the day, at the crater with his camera at night
  // =====================================================================================================
  const augie = makeAugieFigure();
  cast.add(augie.group);
  const augieAt = (night: boolean) => {
    if (night) { augie.group.position.set(AUGIE.x, bermY(AUGIE.x, AUGIE.z), AUGIE.z); augie.group.rotation.y = 2.45; }
    else { augie.group.position.set(AUGIE.dayX, STAGE_Y, AUGIE.dayZ); augie.group.rotation.y = Math.PI / 4; }
    augie.group.userData.yaw0 = augie.group.rotation.y;
  };
  augieAt(false);
  let augieNight = false;
  const flashAt = (strength: number) => {
    augie.snap();
    flashSpot.pos.copy(augie.group.position).add(V(0, 2.2, 0));
    // the flash reaches the rider's eyes if Augie is near and facing them
    const d = augie.group.position.distanceTo(camPos);
    flashK = strength * clamp(1.4 - d / 40, 0.15, 1);
  };
  let flashK = 0;
  const augieS = new Subject({
    id: 'ac-augie', name: 'Augie Steenbeck', from: FILMS.asteroid, group: augie.group, radius: 1.2, base: 760,
    hint: 'The war photographer, with his pipe and his press camera: by his broken-down station wagon at the gas station, and at the crater after dark. Whistle and he takes your picture.',
    poses: { flash: { label: 'Flashbulb!', mult: 1.6 }, alien: { label: 'The photograph of the century', mult: 2.0 } }, centerOffset: V(0, 1.4, 0), facing: forwardOf(augie.group),
    onCall: () => { augie.aim = camPos.clone(); flashAt(0.75); augieS.setPose('flash', 2); return true; },
    onItem: (pos) => { augie.aim = pos.clone(); flashAt(0.5); augieS.setPose('flash', 2); return true; },
    maxDistance: 80, reactRange: 14,
    update: (_dt, ride) => { const z = zOf(ride); augieS.active = z < -1570 && (augieNight ? z < -1700 : z > -1700); },
  });
  subjects.push(augieS);

  // =====================================================================================================
  // GENERAL GIBSON at the Asteroid Day podium, and THE SINGING COWBOYS (dressing, not subjects)
  // =====================================================================================================
  const general = makeGeneral();
  general.group.position.set(PODIUM.x + 0.6, STAGE_Y + 1.3, PODIUM.z);
  general.group.rotation.y = Math.PI / 2;
  cast.add(general.group);
  const cowboys = makeCowboys();
  cowboys.group.position.set(COWBOYS.x + 2.4, STAGE_Y + 0.45, COWBOYS.z);
  cowboys.group.rotation.y = -Math.PI / 2;
  cast.add(cowboys.group);

  // =====================================================================================================
  // THE JUNIOR STARGAZERS at the crater's rim with their telescope
  // =====================================================================================================
  const kids = makeStargazers();
  kids.group.position.set(STARGAZERS.x, bermY(STARGAZERS.x, STARGAZERS.z) - 0.05, STARGAZERS.z);
  kids.group.rotation.y = -0.55;
  cast.add(kids.group);
  kids.cue('stand');
  const kidsS = new Subject({
    id: 'ac-stargazers', name: 'The Junior Stargazers', from: FILMS.asteroid, group: kids.group, radius: 2.4, base: 680, crowd: true,
    hint: 'Three Junior Stargazers with their telescope on the rim of the crater, at the end of the line. Whistle and they wave; when the saucer comes they point.',
    poses: { wave: { label: 'Waving', mult: 1.5 }, point: { label: 'Pointing at the saucer', mult: 1.8 } }, centerOffset: V(0, 0.9, 0),
    facing: forwardOf(kids.group),
    onCall: () => { if (ufoT > 0 && ufoT < 12) return false; kids.cue('wave'); kidsS.setPose('wave', 3); return true; },
    maxDistance: 90,
    update: (_dt, ride) => { const z = zOf(ride); kidsS.active = z < -1640; },
  });
  subjects.push(kidsS);

  // =====================================================================================================
  // THE LANDMARKS OF TOWN: the diner, the vending machines, the overpass, the meteorite
  // =====================================================================================================
  const dinerS = new Subject({
    id: 'ac-diner', name: 'The diner', from: FILMS.asteroid, group: town.anchors.diner, radius: 9, base: 520,
    hint: 'The diner, its front cut away like a doll\'s house: checkered floor, chrome stools, pie à la mode. Whistle and every sign in town flickers on.',
    poses: { lights: { label: 'The lights flicker on', mult: 1.4 } }, maxDistance: 110,
    onCall: (d) => { if (d > 45) return false; town.flicker(); dinerS.setPose('lights', 3.5); return true; },
    update: (_dt, ride) => { const z = zOf(ride); dinerS.active = z < -1560 && z > -1700; },
  });
  const vendS = new Subject({
    id: 'ac-vending', name: 'The vending machines', from: FILMS.asteroid, group: town.anchors.vending, radius: 3.6, base: 480,
    hint: 'A row of vending machines by the line: martinis, cold milk, cigarettes, and a deed to an acre of land for twenty-five dollars in quarters. Whistle for a martini; throw a box at them for a deed.',
    poses: { martini: { label: 'One martini, dry', mult: 1.4 }, deed: { label: 'A deed to the land', mult: 1.5 } }, maxDistance: 70, reactRange: 8,
    onCall: (d) => { if (d > 30) return false; town.dispense('martini'); vendS.setPose('martini', 5); return true; },
    onItem: () => { town.dispense('deed'); vendS.setPose('deed', 5); return true; },
    update: (_dt, ride) => { const z = zOf(ride); vendS.active = z < -1560 && z > -1650; },
  });
  const overS = new Subject({
    id: 'ac-overpass', name: 'The overpass to nowhere', from: FILMS.asteroid, group: town.anchors.overpass, radius: 14, base: 560,
    hint: 'An elevated highway that stops in mid-air over the road, construction suspended. Catch the car chase going under it.',
    poses: { chase: { label: 'Car chase under the overpass', mult: 1.6 } }, maxDistance: 160,
    update: (_dt, ride) => { const z = zOf(ride); overS.active = z < -1566 && z > -1700; if (chase.active && Math.abs(chase.z - OVERPASS.z) < 14) overS.setPose('chase', 0.3); },
  });
  let rockHeld = false, rockGlowT = 9;
  const metS = new Subject({
    id: 'ac-meteorite', name: 'The meteorite', from: FILMS.asteroid, group: town.anchors.meteorite, radius: 1.0, base: 720, rarity: 'rare',
    hint: 'The meteorite of 3007 B.C. on its plinth in a brass cage, in the crater at the end of the line. Throw a box at it and it glows; after dark someone comes for it.',
    poses: { glow: { label: 'Glowing', mult: 1.4 }, taken: { label: 'In the alien\'s hand', mult: 1.8 } }, maxDistance: 90, reactRange: 6,
    onItem: () => { rockGlowT = 0; metS.setPose('glow', 2.5); return true; },
    update: (_dt, ride) => { const z = zOf(ride); metS.active = z < -1640 && town.meteorite.visible; if (rockHeld) metS.setPose('taken', 0.3); },
  });
  subjects.push(dinerS, vendS, overS, metS);

  // =====================================================================================================
  // THE UFO and THE ALIEN
  // =====================================================================================================
  const ufo = makeUfo();
  ufo.group.visible = false;
  cast.add(ufo.group);
  const alien = makeAlienPuppet(7);
  alien.group.scale.setScalar(1.2);
  alien.group.visible = false;
  cast.add(alien.group);
  /** seconds since the saucer started down (-1 before) */
  let ufoT = -1;
  const ufoHome = V(CRATER.x + 1.5, 44, CRATER.z + 1);
  const ufoOver = V(0.5, 24, CRATER.z + 1);
  const ufoFront = V(0, 21, -1806);
  const landA = V(CRATER.x + 1.5, STAGE_Y + 0.05, CRATER.z + 1.2);
  const rimTop = V(0, STAGE_Y + CRATER.rim - 0.05, CRATER.z + CRATER.r + 0.2);
  const rockHome = town.meteorite.position.clone();
  const rockParent = town.meteorite.parent!;
  const startUfo = () => { if (ufoT < 0) ufoT = 0; };
  const ufoS = new Subject({
    id: 'ac-ufo', name: 'The flying saucer', from: FILMS.asteroid, group: ufo.group, radius: 6, base: 900, rarity: 'rare',
    hint: 'After the lights go down for the stargazing, a saucer hangs over the crater. Whistle once you are near and it comes down, beam and all.',
    poses: { descend: { label: 'Coming down', mult: 1.6 }, beam: { label: 'Tractor beam', mult: 1.8 } }, maxDistance: 160,
    onCall: (d) => { if (ufoT >= 0 || d > 95) return false; startUfo(); ufoS.setPose('descend', 2); return true; },
    update: (_dt, ride) => { const z = zOf(ride); ufoS.active = ufo.group.visible && z < -1700; },
  });
  const alienS = new Subject({
    id: 'ac-alien', name: 'The alien', from: FILMS.asteroid, group: alien.group, radius: 1.6, base: 1450, rarity: 'legendary',
    hint: 'Very tall, very thin, very still. It comes down from the saucer in its beam, takes the meteorite from its cage, and stands for Augie\'s photograph at the end of the line.',
    poses: { floating: { label: 'In the beam', mult: 1.6 }, taking: { label: 'Taking the meteorite', mult: 1.8 }, posing: { label: 'Posing for the photograph', mult: 2.0 } },
    centerOffset: V(0, 1.9, 0), facing: forwardOf(alien.group), maxDistance: 120,
    update: () => { alienS.active = alien.group.visible; },
  });
  subjects.push(ufoS, alienS);

  const ufoPos = new THREE.Vector3(), alienPos = new THREE.Vector3();
  const ease = (x: number) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  /** the saucer and the alien by seconds since the saucer started down */
  const ufoTimeline = (t: number, now: number) => {
    // the saucer: down over the crater, across to the end of the line, back, and away
    if (t < 2.2) ufoPos.lerpVectors(ufoHome, ufoOver, ease(t / 2.2));
    else if (t < 5.6) ufoPos.copy(ufoOver);
    else if (t < 7.4) ufoPos.lerpVectors(ufoOver, ufoFront, ease((t - 5.6) / 1.8));
    else if (t < 12.6) ufoPos.copy(ufoFront);
    else ufoPos.lerpVectors(ufoFront, V(-10, 90, -1840), ease((t - 12.6) / 2.6));
    ufoPos.y += Math.sin(now * 1.3) * 0.25;
    ufo.group.position.copy(ufoPos);
    const beamK = t < 2.2 ? 0 : t < 2.6 ? (t - 2.2) / 0.4 : t < 12.2 ? 1 : t < 12.6 ? (12.6 - t) / 0.4 : 0;
    // the beam reaches down to whatever is below: the bowl of the crater, or the rim
    const floorY = t < 6.6 ? STAGE_Y + 0.05 : rimTop.y;
    ufo.beam(ufoPos.y - 1 - floorY, beamK);
    beamSpot.pos.set(ufoPos.x, floorY + 7, ufoPos.z + 2);
    lights.boost.set(beamSpot, beamK);
    beamSpot.intensity = 26;
    // the alien
    alien.group.visible = t > 2.4 && t < 12.4;
    let yaw = Math.PI * 0.5;
    if (t < 4.2) { alien.act('float'); alienPos.lerpVectors(V(landA.x, ufoPos.y - 2.5, landA.z), landA, ease((t - 2.4) / 1.8)); yaw = (t - 2.4) * 1.3 + 0.8; }
    else if (t < 5.1) { alien.act('reach'); alienPos.copy(landA); yaw = Math.PI * 1.5 + 0.1; }
    else if (t < 5.7) { alien.act('lift'); alienPos.copy(landA); yaw = Math.PI * 1.5 + 0.1; }
    else if (t < 7.4) {
      // carried in the beam over the rim to the end of the line, the meteorite held to its chest
      alien.act('float');
      const k = ease((t - 5.7) / 1.7);
      alienPos.lerpVectors(landA, rimTop, k); alienPos.y += Math.sin(k * Math.PI) * 4.5;
      yaw = lerp(Math.PI * 1.5, 0, k);
    } else if (t < 10.6) { alien.act('photo'); alienPos.copy(rimTop); yaw = -0.1; }
    else { alien.act('float'); alienPos.copy(rimTop); alienPos.y += ease((t - 10.6) / 1.8) * (ufoPos.y - 3 - rimTop.y); yaw = 0; }
    alien.place(alienPos, yaw);
    // the cage's lid swings open while it reaches in, and the meteorite goes into its hand
    town.cageLid.rotation.x = -1.9 * ease((t - 4.3) / 0.5);
    const held = t >= 4.9 && t < 13;
    if (held !== rockHeld) {
      rockHeld = held;
      if (held) { alien.hand.add(town.meteorite); town.meteorite.position.set(0, -0.12, 0.08); town.meteorite.scale.setScalar(0.62); }
      else { rockParent.add(town.meteorite); town.meteorite.position.copy(rockHome); town.meteorite.scale.setScalar(1); town.meteorite.visible = false; }
    }
    // the photograph: Augie's flashbulb, and everyone's poses
    if (t > 8.0 && t - lastDt <= 8.0) { augie.aim = rimTop.clone().add(V(0, 2, 0)); flashAt(1.1); augieS.setPose('alien', 3); }
    if (t > 2.4 && t < 4.2) alienS.setPose('floating', 0.3);
    else if (t >= 4.2 && t < 7.4) alienS.setPose('taking', 0.3);
    else if (t >= 7.4 && t < 10.6) alienS.setPose('posing', 0.3);
    else if (t >= 10.6 && t < 12.4) alienS.setPose('floating', 0.3);
    if (t < 2.2) ufoS.setPose('descend', 0.3); else if (beamK > 0.5) ufoS.setPose('beam', 0.3);
    if (t > 1 && t < 13) { kids.cue('point'); kidsS.setPose('point', 0.3); } else if (t >= 13 && t - lastDt < 13) kids.cue('look');
    ufo.group.visible = t < 15.2;
  };
  let lastDt = 0;

  // =====================================================================================================
  // the floor under thrown items
  // =====================================================================================================
  const floor = (x: number, z: number) => {
    if (z > ARCH.apron) return Math.abs(x) < HOUSE.runway ? PATH_Y : HOUSE_Y;
    if (Math.abs(x) < 2.6 && z > -1800) return PATH_Y;
    return bermY(x, z);
  };


  let cloudT = -1;
  return {
    id: 'asteroid', group, show: showRange(road, R, 6, 8), occluders: [...theatre.occluders, ...town.occluders], subjects, water: -Infinity,
    floor,
    onCall(ride) {
      const z = ride.position.z;
      // the general salutes and the cowboys raise their hats if the rider is near
      if (Math.abs(z - PODIUM.z) < 40) general.salute();
      if (Math.abs(z - COWBOYS.z) < 40) cowboys.finale();
    },
    update(dt, t, ride) {
      lastDt = dt;
      const z = ride.position.z;
      ctx.camera.getWorldPosition(camPos);
      ctx.camera.getWorldDirection(camDir);
      const night = smoothstep(NIGHT.a, NIGHT.b, z);
      theatre.setNight(night, t);
      theatre.update(dt, t, z, night);
      town.update(dt, t, night);

      // ---- the reveal: as the flash clears, the camera is tilted up at the arch and settles level ----
      shot.pitch = 0.075 * zWindow(z, -1500, -1504, -1514, -1548);

      // ---- the roadrunner zigzags ahead of the train ----
      if (!rrState.gone) {
        if (z < -1668) { rrState.target.set(-46, STAGE_Y, Math.min(rr.group.position.z, z - 20)); }
        const p = rr.group.position;
        const d = Math.hypot(rrState.target.x - p.x, rrState.target.z - p.z);
        if (rr.dancing()) rr.running = 0;
        else if (d > 0.4) {
          const sp = Math.min(d, 15 * dt);
          p.x += (rrState.target.x - p.x) / d * sp; p.z += (rrState.target.z - p.z) / d * sp;
          rr.group.rotation.y = Math.atan2(rrState.target.x - p.x, rrState.target.z - p.z);
          rr.running = Math.min(1, rr.running + dt * 5);
        } else {
          rr.running = Math.max(0, rr.running - dt * 6);
          rrState.pause += dt;
          if (rrState.pause > 1.1 && z < -1562 && z > -1668) {
            // next dash: across the line, about thirty units ahead of the rider
            rrState.side = -rrState.side; rrState.pause = 0;
            rrState.target.set(rrState.side * 5.5, STAGE_Y, Math.min(p.z - 4, z - 30));
          } else if (z < -1668 && d < 0.5) rrState.gone = true;
        }
        rr.group.visible = !rrState.gone;
        if (!rrState.gone) rr.update(dt, t);
      }

      // ---- the car chase, twice ----
      if (chaseRuns === 0 && z < -1586) { chase.run(ROAD.x - 1.7, z + 50, ROAD.z1 - 2, 27); chaseRuns = 1; }
      if (chaseRuns === 1 && z < -1652 && !chase.active) { chase.run(ROAD.x + 1.7, ROAD.z1 + 4, -1572, 25); chaseRuns = 2; }
      chase.update(dt, t);

      // ---- the mushroom cloud rises from below the stage on its lift, with a soft pink flash ----
      if (cloudT < 0 && z < -1634) cloudT = 0;
      if (cloudT >= 0) {
        cloudT += dt;
        const up = ease(cloudT / 5) * (1 - smoothstep(0.2, 0.7, night));
        town.cloud.position.y = STAGE_Y - 46 + up * 46;
        if (cloudT < 1.2) fx.flash(0.22 * (1 - cloudT / 1.2), 0xffd8d0);
      }

      // ---- Augie: day at the gas station, night at the crater (moved while nobody is looking) ----
      if (!augieNight && night > 0.5) {
        const old = augie.group.position.clone().add(V(0, 1.5, 0));
        const nw = V(AUGIE.x, bermY(AUGIE.x, AUGIE.z) + 1.5, AUGIE.z);
        if (!inView(old) && (!inView(nw) || nw.distanceTo(camPos) > 70)) { augieNight = true; augieAt(true); augie.aim = null; }
      }
      augie.update(dt, t, camPos);
      flashK = Math.max(0, flashK - dt * 2.5);
      const fl = augie.sinceFlash < 0.1 ? 1 : Math.exp(-(augie.sinceFlash - 0.1) * 6);
      if (augie.sinceFlash < 1.2) { lights.boost.set(flashSpot, fl); if (augie.sinceFlash < 0.35) fx.flash(flashK * (1 - augie.sinceFlash / 0.35), 0xf4f8ff); }
      else lights.boost.set(flashSpot, 0);

      // ---- the general, the cowboys, the kids ----
      if (general.group.visible) general.update(dt, t, camPos);
      if (z > -1712) cowboys.update(dt, t);
      cowboys.group.visible = z > -1712 && z < -1566;
      if (night > 0.6 && ufoT < 0) kids.cue('look');
      // the stargazers come on for the last act (they are a speck at the far end before that)
      kids.group.visible = z < -1662;
      if (kids.group.visible) kids.update(dt, t, camPos);
      general.group.visible = z < -1590 && z > -1790;

      // ---- the meteorite glows when hit ----
      rockGlowT += dt;
      town.glowRock(clamp(1 - rockGlowT / 2.5, 0, 1) + (rockHeld ? 0.5 + Math.sin(t * 4) * 0.2 : 0));
      town.dish.rotation.y = ufoT >= 0 ? lerp(town.dish.rotation.y, Math.atan2(ufoPos.x - town.dish.position.x, ufoPos.z - town.dish.position.z), 1 - Math.exp(-dt)) : Math.sin(t * 0.1) * 0.4;

      // ---- the saucer and the alien ----
      if (night > 0.95 && ufoT < 0) {
        // it hangs high over the crater until the rider whistles near it, or comes down on its own
        ufo.group.visible = true;
        ufo.group.position.copy(ufoHome).add(V(0, Math.sin(t * 0.7) * 0.6, 0));
        if (z < -1726) startUfo();
      }
      if (ufoT >= 0) { ufoT += dt; ufoTimeline(ufoT, t); }
      if (ufo.group.visible) ufo.update(dt, t);
      if (alien.group.visible) alien.update(dt, t, camPos);
    },
  };
}

export const ASTEROID: SetModule = {
  build,
  lights: LIGHTS,
  env: (z) => {
    const n = smoothstep(NIGHT.a, NIGHT.b, z);
    return { wind: 0.12 * (1 - n) + 0.05, birds: 0.08 * (1 - n), crickets: 0.65 * n };
  },
};
