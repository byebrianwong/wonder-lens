import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { smoothstep } from '../../../engine/math';
import { box, toon } from '../../../engine/Builders';
import { SETS } from '../layout';
import { FILMS, lightShaft, optimize, showRange, subCurve, type BuiltSet, type SetContext, type SetModule, type ZLightKey } from '../common';
import { buildTheatre } from '../finale/theatre';
import { buildDollhouse } from '../finale/dollhouse';
import { CURTAIN_CALL, type CastMember } from '../finale/cast';
import { Confetti } from '../finale/confetti';
import { floorRails } from '../finale/rails';
import { FLOOR, HALL, HOUSE, LINE, PIT, PROSC, STAGE, STAGE_Y } from '../finale/plan';

/*
 * Part Nine: the curtain call.
 *
 *  z -2430  the iris opens in the centre aisle of a gilded opera house: the stalls full, the boxes lit, three
 *           chandeliers, the orchestra in the pit, the red curtain closed ahead
 *  z -2490  the house lights dim and the curtain flies up on the stage: the Grand Budapest as a dollhouse
 *           with its front off, a room for every film, and the cast of the ride in a line before it
 *  z -2545  over the pit on a ramp and under the proscenium onto the stage
 *  z -2584  the cast bow, a wave running out from the middle; confetti
 *  z -2588  the camera cranes up and back to take in the whole stage; the film's own curtain comes down
 *           (layout.ts) on "The End"
 */

const R = SETS.finale;

export const LIGHTS: ZLightKey[] = [
  // the theatre: warm, dim, the chandeliers doing the work; the "sun" is the stage lighting from the front
  { z: -2430, skyTop: 0x1a0a10, skyMid: 0x2a1018, skyBottom: 0x3a1a1a, fog: 0x2a1014, fogDensity: 0.0045, sunDir: [0.15, 0.75, 0.65], sunColor: 0xffd8a8, sunIntensity: 1.0, hemiSky: 0xe0a880, hemiGround: 0x4a1a1a, hemiIntensity: 1.25, exposure: 1.1, bloom: 0.6, saturation: 1.12, tint: 0xfff0e0, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
  { z: -2486, skyTop: 0x1a0a10, skyMid: 0x2a1018, skyBottom: 0x3a1a1a, fog: 0x2a1014, fogDensity: 0.0045, sunDir: [0.15, 0.75, 0.65], sunColor: 0xffd8a8, sunIntensity: 1.0, hemiSky: 0xe0a880, hemiGround: 0x4a1a1a, hemiIntensity: 1.2, exposure: 1.1, bloom: 0.6, saturation: 1.12, tint: 0xfff0e0, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
  // house lights down, stage lights up
  { z: -2530, skyTop: 0x0a0408, skyMid: 0x1a0a10, skyBottom: 0x2a1014, fog: 0x1a0a0e, fogDensity: 0.004, sunDir: [0.1, 0.62, 0.78], sunColor: 0xfff0d0, sunIntensity: 2.1, hemiSky: 0xd09878, hemiGround: 0x3a1418, hemiIntensity: 0.95, exposure: 1.12, bloom: 0.66, saturation: 1.14, tint: 0xfff2e0, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
  { z: -2610, skyTop: 0x0a0408, skyMid: 0x1a0a10, skyBottom: 0x2a1014, fog: 0x1a0a0e, fogDensity: 0.004, sunDir: [0.1, 0.62, 0.78], sunColor: 0xfff0d0, sunIntensity: 2.2, hemiSky: 0xd09878, hemiGround: 0x3a1418, hemiIntensity: 0.95, exposure: 1.12, bloom: 0.7, saturation: 1.14, tint: 0xfff2e0, sunGlow: 0, sunSize: 0, horizonHeight: 0.1 },
];

function build(ctx: SetContext): BuiltSet {
  const { road, lights, rng } = ctx;
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);

  const theatre = buildTheatre(rng);
  group.add(theatre.group);
  const house = buildDollhouse();
  group.add(house.group);

  // rails down the aisle and up the ramp; a trestle under the ramp where it crosses the pit
  statics.add(floorRails(subCurve(road, R.z0 - 12, R.z1, 80)));
  {
    const wood = toon(0x5a3a2a);
    const deck = box(3.0, 0.2, PIT.z0 - PIT.z1 + 2, toon(0x6a2a24), 0, (FLOOR + STAGE_Y) / 2 - 0.12, (PIT.z0 + PIT.z1) / 2);
    deck.rotation.x = Math.atan2(STAGE_Y - FLOOR, PIT.z0 - PIT.z1 + 2) * -1;
    statics.add(deck);
    for (const s of [-1, 1]) for (const z of [PIT.z0 - 2, PIT.z0 - 5, PIT.z0 - 8]) {
      const y = road.at(z).y;
      statics.add(box(0.2, y - PIT.floor, 0.2, wood, s * 1.3, (y + PIT.floor) / 2, z));
    }
  }
  optimize(statics);

  // ---------- the cast in a line across the stage, facing the audience ----------
  const cast: CastMember[] = CURTAIN_CALL.map((c) => c.make());
  const n = cast.length;
  cast.forEach((c, i) => {
    const x = (i - (n - 1) / 2) * LINE.spacing;
    c.group.position.set(x, STAGE_Y, LINE.z);
    group.add(c.group);
  });
  // bow order: from the middle outwards
  const bowAt = cast.map((_, i) => Math.abs(i - (n - 1) / 2) * 0.22);
  let bowT = -1, bowDone = false;

  const confetti = new Confetti(700, { x0: -PROSC.halfW, x1: PROSC.halfW, y0: STAGE_Y, y1: STAGE_Y + 16, z0: HOUSE.z + 2, z1: PROSC.z - 2 }, 1979);
  group.add(confetti.mesh);

  // ---------- lights: a chandelier glow over the stalls, then two warm spots on the line ----------
  lights.add({ from: road.u(R.z0 - 8), to: road.u(-2546), pos: new THREE.Vector3(0, FLOOR + HALL.ceiling - 7, (HALL.back + HALL.front) / 2), color: 0xffd8a0, intensity: 70, distance: 70 });
  lights.add({ from: road.u(-2470), to: 1, pos: new THREE.Vector3(-7, STAGE_Y + 9, LINE.z + 8), color: 0xfff0d8, intensity: 60, distance: 40 });
  lights.add({ from: road.u(-2470), to: 1, pos: new THREE.Vector3(7, STAGE_Y + 9, LINE.z + 8), color: 0xffe0c8, intensity: 60, distance: 40 });

  // ---------- two follow spots from the upper boxes onto the line, once the curtain is up ----------
  const beams = [-1, 1].map((sd) => {
    const b = lightShaft(new THREE.Vector3(sd * 20, FLOOR + 15, -2512), new THREE.Vector3(sd * 4, STAGE_Y, LINE.z + 1), 7, 0xfff0d0, 0);
    group.add(b);
    return b.userData.shaft as THREE.MeshBasicMaterial;
  });

  // ---------- subjects ----------
  const lineAnchor = new THREE.Group();
  lineAnchor.position.set(0, STAGE_Y, LINE.z);
  group.add(lineAnchor);
  const forwardZ = () => new THREE.Vector3(0, 0, 1);
  const bowAll = () => { bowT = 0; return true; };
  const castSubject = new Subject({
    id: 'curtaincall', name: 'The curtain call', from: 'The Zubrowka Express', group: lineAnchor, radius: 14, base: 1300, rarity: 'legendary',
    hint: 'The whole cast in a line across the stage at the very end. They bow as the train comes on stage; whistle and they bow again.',
    poses: { bow: { label: 'Curtain call', mult: 2.0 } }, centerOffset: new THREE.Vector3(0, 1.2, 0), facing: forwardZ, maxDistance: 80, crowd: true,
    onCall: () => { bowAll(); castSubject.setPose('bow', 2.6); return true; },
  });
  const houseSubject = new Subject({
    id: 'dollhouse', name: 'The dollhouse', from: FILMS.gbh, group: house.group, radius: 16, base: 800, rarity: 'rare',
    hint: 'The Grand Budapest with its front taken off, at the back of the stage: a room for every film, even ones the train did not visit.',
    centerOffset: new THREE.Vector3(0, STAGE_Y + 9, HOUSE.z - 2), maxDistance: 160,
  });
  const conductorSubject = new Subject({
    id: 'conductor', name: 'The conductor', from: 'The Zubrowka Express', group: theatre.conductor, radius: 1.2, base: 500,
    hint: 'In the orchestra pit, by the ramp up to the stage. Whistle and he strikes up the band.',
    poses: { conduct: { label: 'Maestro', mult: 1.5 } }, centerOffset: new THREE.Vector3(0, 1.5, 0), maxDistance: 60,
    onCall: () => { theatre.conduct(); conductorSubject.setPose('conduct', 4); return true; },
  });
  const theatreAnchor = new THREE.Group();
  theatreAnchor.position.set(0, STAGE_Y + PROSC.height + 3, PROSC.z);
  group.add(theatreAnchor);
  const prosceniumSubject = new Subject({
    id: 'proscenium', name: 'The proscenium', from: 'The Zubrowka Express', group: theatreAnchor, radius: 10, base: 450,
    hint: 'The gilded arch over the stage with the Crossed Keys at its crown, at the end of the aisle.', maxDistance: 140,
  });
  const subjects = [castSubject, houseSubject, conductorSubject, prosceniumSubject];

  let craneT = -1;
  const set: BuiltSet = {
    // the set appears once the iris before it has closed (layout.ts)
    id: 'finale', group, show: showRange(road, R, 4, 40), occluders: theatre.occluders, subjects, water: -Infinity,
    floor: (x, z) => {
      if (z < STAGE.front && Math.abs(x) < STAGE.halfW) return STAGE_Y;
      if (z < PIT.z0 && z > PIT.z1 && Math.abs(x) > 1.6) return PIT.floor;
      return FLOOR;
    },
    update(dt, t, ride) {
      const z = ride.position.z;
      // house lights down and the curtain up as the train comes down the aisle
      const up = smoothstep(-2484, -2522, z);
      theatre.raise(up);
      for (const b of beams) b.opacity = 0.16 * smoothstep(0.6, 1, up);
      theatre.setLights(up);
      house.setGlow(up);
      theatre.update(dt, t);
      house.update(dt, t);
      // the cast bow as the train comes on stage
      if (!bowDone && z < -2584) { bowDone = true; bowT = 0; castSubject.setPose('bow', 3); }
      if (bowT >= 0) {
        bowT += dt;
        cast.forEach((c, i) => { if (bowT - dt < bowAt[i] && bowT >= bowAt[i]) c.bow(); });
        if (bowT > 4) bowT = -1;
      }
      // the cast stand behind the curtain until it rises (and cost nothing to draw until then)
      const onStage = up > 0.02;
      for (const c of cast) { c.group.visible = onStage; if (onStage) c.update(dt, t); }
      confetti.level = smoothstep(-2584, -2600, z);
      confetti.update(dt, t);
      // the closing crane: once the train is nearly stopped, the camera rises and pulls back
      if (craneT < 0 && z < -2588) craneT = 0;
      if (craneT >= 0) {
        craneT += dt;
        const k = smoothstep(0, 5, craneT);
        ctx.shot.offset.set(0, k * 7.5, -k * 4.5);
        ctx.shot.pitch = -k * 0.3;
      }
    },
    onCall() { theatre.conduct(); },
  };
  return set;
}

export const FINALE: SetModule = { build, lights: LIGHTS };
