import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { Drift, Puffs } from '../../../engine/Particles';
import { Rng, TAU, clamp, easeInOutSine, lerp, smoothstep } from '../../../engine/math';
import { envelope } from '../../../engine/Rig';
import { SETS } from '../layout';
import { FILMS, cue, forwardOf, type BuiltSet, type SetContext } from '../common';
import { BED, HOUSE } from '../garden/layout';
import { buildPlace } from '../garden/place';
import { CROWN, ERUPT, LIMB, PERCH, buildGiantTree } from '../garden/tree';
import { buildCloudSea, buildMoon, worldLight } from '../garden/clouds';
import { dancePose, flyPose, gatherPose, getCast, playPose, poseKid, type TotoroPose } from '../garden/cast';
import { buildSootSwarm, makeSootSprite } from '../garden/soot';
import { NoteStream, buildSprouts } from '../garden/fx';

/*
 * Totoro's garden at midnight (My Neighbor Totoro), z 60 to -230. In ride order:
 *
 *  z 60    on foot in the dirt lane: the old house on the left, its paper screens lit, soot sprites drifting out
 *          of its windows and away towards the moon; the meadow on the right, where the Catbus comes running
 *          (the world drives the Catbus); far ahead by the seed bed, Totoro, Chu, Chibi and the girls dancing
 *  z 40    on the Catbus, slowly; the seed dance ahead on the right, in front of the bed (9.5, -30) on its
 *          lane side, facing you: crouch, then slowly stretch up together, umbrellas high (4 s); from z 24
 *          the shoots push up out of the bed behind them, a little more with every stretch. By z -14 the
 *          nearest dancers are 12 units away, 7 to 14 units from the lane
 *  z 35    a soot sprite waiting by the lane hops onto the Catbus's back behind you (it rides along all night)
 *  z -14   Totoro gathers the girls onto his belly, Chu takes his paw, Chibi climbs onto his head; the
 *          umbrellas are put away; Totoro hops onto his spinning top (z -18 to -20.5)
 *  z -21   the shoots burst into a green shoot that rises twisting ahead on the right, browning into bark,
 *          young leaves opening along it, earth heaving round its foot; the tree swells to full size by
 *          z -50; the troupe flies up ahead; the great limb bursts out of the lane at z -42
 *  z -42   up the great limb, which unfolds ahead; the crown bursts into leaf overhead; the troupe circles
 *          ahead of the rider; the sea of cloud gathers round the crown as the rider climbs
 *  z -148  the troupe flies up through the leaves and lands on Totoro's bough on top (z -166 to -172)
 *  z -176  out through the top of the crown: the sea of cloud, the huge moon ahead-left; the concert on
 *          the bough on the left (z -172 to -201): everyone playing ocarinas, notes drifting up
 *  z -201  they climb back on the top and fly off up and away to the right (out of sight by z -226)
 *  z -207  the Catbus leaps off the end of the limb; at z -240 to -262 it dives through the sea of cloud
 *          (a white wash); this scene's scenery is hidden at z -252 while the screen is white
 */

/** Where this scene's scenery is hidden: in the middle of the dive through the cloud, while the screen is white. */
const HIDE_Z = -252;
const DIVE = { a: -239, b: -247, c: -254, d: -263 };

export function buildGarden(ctx: SetContext): BuiltSet {
  const { road, camera, lights, fx, mount, scene } = ctx;
  const U = (z: number) => road.u(z);
  const group = new THREE.Group();
  const own = new THREE.Group();
  group.add(own);
  const rng = new Rng(6060);

  // ---------- the place, the tree, the sky ----------
  const place = buildPlace({
    oz: 0, night: true, lowDetail: ctx.lowDetail, frontRight: true, zLimit: -236,
    grass: { x0: -40, x1: 128, z0: -104, z1: 170 },
    clear: [{ x: BED.x, z: BED.z, r: 20 }, { x: -5, z: -52, r: 14 }],
  });
  own.add(place.group);
  const tree = buildGiantTree(road);
  own.add(tree.group);
  const light = worldLight(scene);
  const moonDir0 = new THREE.Vector3(-0.38, 0.42, -0.82).normalize();
  const eyes = [new THREE.Vector3(0, 1.5, 60), new THREE.Vector3(-3, 1.5, 0), new THREE.Vector3(-4, 5, -40)];
  const sea = buildCloudSea({
    y: 50, hole: CROWN.c.clone(), holeR: [CROWN.r.x * 1.02, CROWN.r.z * 1.02],
    // no cloud that hides the moon from the garden, looms over the garden, or sits in the dive
    avoid: (p, r) => {
      if (p.z > -70 && Math.hypot(p.x, p.z - 20) < 260) return true;
      if (Math.abs(p.x) < r + 40 && p.z < -190 && p.z > -340) return true;
      for (const e of eyes) {
        const d = p.clone().sub(e), len = d.length();
        if (d.normalize().angleTo(moonDir0) < Math.asin(Math.min(1, r / len)) + 0.08) return true;
      }
      return false;
    },
  });
  own.add(sea.group);
  const moon = buildMoon(4.6);
  own.add(moon.group);

  // ---------- the cast ----------
  const cast = getCast(ctx);
  const { totoro, chu, chibi, satsuki, mei } = cast;
  const troupe = new THREE.Group();
  own.add(troupe);
  const members = [totoro.group, chu.group, chibi.group, satsuki.group, mei.group, cast.top];
  const adopt = () => { for (const m of members) if (m.parent !== troupe) troupe.add(m); };
  adopt();

  // the seed bed's shoots
  const sprouts = buildSprouts(34);
  own.add(sprouts.mesh);
  const sproutAt: Array<{ x: number; z: number; ph: number; s: number }> = [];
  for (let i = 0; i < sprouts.count; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng.next());
    sproutAt.push({ x: BED.x + Math.cos(a) * r * (BED.w / 2 - 0.3), z: BED.z + Math.sin(a) * r * (BED.d / 2 - 0.3), ph: rng.range(0, TAU), s: rng.range(0.7, 1.3) });
  }

  const dust = new Puffs(0x7a6048, 64, 61), leafPuffs = new Puffs(0x5a9a40, 56, 62);
  own.add(dust.group, leafPuffs.group);
  const notes = new NoteStream(48);
  own.add(notes.points);
  const fireflies = new Drift({ count: 200, color: 0xd6ff6a, size: 0.3, box: new THREE.Vector3(80, 8, 80), speed: new THREE.Vector3(0.3, 0.1, -0.2), wobble: 1.3, opacity: 0.9, blending: THREE.AdditiveBlending, seed: 63 });
  const motes = new Drift({ count: 160, color: 0xe8ffc0, size: 0.24, box: new THREE.Vector3(60, 30, 60), speed: new THREE.Vector3(0.1, 0.35, 0), wobble: 0.8, opacity: 0.8, blending: THREE.AdditiveBlending, seed: 64 });
  own.add(fireflies.points, motes.points);

  // ---------- soot sprites: out of the windows, away towards the moon ----------
  const houseC = new THREE.Vector3(HOUSE.x, 0, HOUSE.z);
  const soot = buildSootSwarm(place.windows, houseC, new THREE.Vector3(-0.42, 0.12, -0.9), ctx.lowDetail ? 20 : 34);
  own.add(soot.group);
  // the one that rides on the Catbus: waits by the lane, hops on as you climb aboard, and stays all night
  const rider = makeSootSprite();
  rider.scale.setScalar(1.5);
  const holder = new THREE.Group();
  holder.add(rider);
  mount.seats[1].add(holder);
  {
    const baseUpdate = rider.updateMatrixWorld.bind(rider);
    // a little bob and wobble whatever scene is running (this runs whenever the scene's matrices update)
    rider.updateMatrixWorld = (force?: boolean) => {
      const s = performance.now() / 1000;
      rider.position.y = 0.42 + Math.abs(Math.sin(s * 3.3)) * 0.07 + mount.catbus.lift * 0.4;
      rider.rotation.z = Math.sin(s * 2.1) * 0.1;
      baseUpdate(force);
    };
  }
  const SOOT_WAIT = new THREE.Vector3(2.4, 0, 34.5);

  // ---------- lights: the veranda lamp, a glow over the seed bed, moonlight on the bough ----------
  lights.add({ from: U(200), to: U(-12), pos: new THREE.Vector3(HOUSE.x + 6.5, 3.4, HOUSE.z - 2), color: 0xffb468, intensity: 9, distance: 15, flicker: 0.5 });
  lights.add({ from: U(34), to: U(-46), pos: new THREE.Vector3(BED.x - 3, 3.5, BED.z + 5), color: 0xc8ffb0, intensity: 7, distance: 17 });
  const perchFwd = new THREE.Vector3(Math.sin(PERCH.yaw), 0, Math.cos(PERCH.yaw));
  const perchAlong = new THREE.Vector3(Math.cos(PERCH.yaw), 0, -Math.sin(PERCH.yaw));
  lights.add({ from: U(-150), to: U(-232), pos: PERCH.pos.clone().addScaledVector(perchFwd, 6).add(new THREE.Vector3(0, 6, 0)), color: 0xc4d4ff, intensity: 12, distance: 26 });

  // ---------- the troupe's places (world) ----------
  const bed = new THREE.Vector3(BED.x, 0, BED.z);
  // they dance in front of the bed on its lane side, facing the way the rider comes, 7 to 14 units from the
  // lane; the top spins on its tip beside Totoro
  const KD = bed.clone().add(new THREE.Vector3(-3.6, 2.4, 1.4));
  const facingFrom = (p: THREE.Vector3) => Math.atan2(bed.x - 6 - p.x, bed.z + 22 - p.z);
  const DANCE = {
    totoro: bed.clone().add(new THREE.Vector3(-3, 0, 5)), chu: bed.clone().add(new THREE.Vector3(0.2, 0, 7.6)), chibi: bed.clone().add(new THREE.Vector3(-5.5, 0, 6.5)),
    satsuki: bed.clone().add(new THREE.Vector3(-6.3, 0, 9.5)), mei: bed.clone().add(new THREE.Vector3(-4.6, 0, 8.6)),
  };
  const seat = (along: number, fwd = 0) => PERCH.pos.clone().addScaledVector(perchAlong, along).addScaledVector(perchFwd, fwd);
  const CONCERT = { totoro: seat(0), chu: seat(-4.5, 0.2), satsuki: seat(3.1, 0.1), mei: seat(4.25, 0.1), top: seat(1.2, -3.4).add(new THREE.Vector3(0, 1.4, 0)) };

  /** Where the top (the troupe's frame) is at a rider z while it flies. */
  const flight = (z: number, out: THREE.Vector3) => {
    // circling ahead of the rider as it climbs: 13 to 21 ahead, up to 12 to either side
    const a = road.at(z - 17);
    const ph = (-45 - z) * TAU / 70;
    const rx = a.x + a.rx * 12 * Math.sin(ph) + a.rz * 4 * Math.cos(ph);
    const rz = a.z + a.rz * 12 * Math.sin(ph) - a.rx * 4 * Math.cos(ph);
    // high enough that the top's tip stays clear of the limb ahead
    const ry = a.y + 6.5 + 2 * Math.sin(ph * 2);
    out.set(rx, ry, rz);
    // at first: up off the ground by the bed, rising ahead of the rider as the tree erupts beside it
    if (z > -45) out.lerp(KD.clone().add(new THREE.Vector3(-1, 12 * smoothstep(-20.5, -32, z), -6 * smoothstep(-20.5, -32, z))), 1 - smoothstep(-20.5, -45, z));
    return out;
  };
  const DEP = [CONCERT.top.clone(), CONCERT.top.clone().add(new THREE.Vector3(0, 12, 0)), CONCERT.top.clone().add(new THREE.Vector3(45, 50, 30)), CONCERT.top.clone().add(new THREE.Vector3(120, 110, 80))];
  const depCurve = new THREE.CubicBezierCurve3(DEP[0], DEP[1], DEP[2], DEP[3]);
  /** The troupe's frame (the top's upper face) at any rider z: position and turn. */
  const pA = new THREE.Vector3(), pB = new THREE.Vector3();
  const frameAt = (z: number, out: THREE.Vector3) => {
    if (z >= -20.5) return out.copy(KD);
    if (z >= -148) return flight(z, out);
    if (z >= -204.5) {
      const k = easeInOutSine(smoothstep(-148, -168, z));
      flight(Math.max(z, -168), out).lerp(CONCERT.top, k);
      out.y += 7 * Math.sin(Math.PI * k);
      return out;
    }
    return out.copy(depCurve.getPoint(Math.pow(smoothstep(-204.5, -226, z), 1.6)));
  };
  const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

  // ---------- reactions ----------
  let waveT = -1, duetT = -1, hopNext = 0;
  const pose: TotoroPose = {}, poseC: TotoroPose = {}, poseB: TotoroPose = {};

  // ---------- subjects ----------
  const camPos = new THREE.Vector3();
  const totoroS = new Subject({
    id: 'totoro', name: 'Totoro', from: FILMS.totoro, group: totoro.group, radius: 3.2, base: 1500, rarity: 'legendary',
    hint: 'Dancing at the seed bed at midnight with the girls, then flying up round the tree on his spinning top, and playing the ocarina on the very top. Throw an acorn and he jumps; play your ocarina and he roars, or joins in on the treetop.',
    poses: {
      dance: { label: 'The seed dance', mult: 1.8 }, flying: { label: 'Flying on the spinning top', mult: 1.7 }, jump: { label: 'Jumping for joy', mult: 1.6 },
      roar: { label: 'The big roar', mult: 2.0 }, duet: { label: 'A duet on the treetop', mult: 2.0 },
    },
    centerOffset: new THREE.Vector3(0, 2.8, 0), facing: forwardOf(totoro.group), maxDistance: 170,
    onItem: () => { totoro.jump(() => dust.burst(totoro.group.getWorldPosition(new THREE.Vector3()), 8, 0x8a7a64, 3, 1.5, 1.5)); totoroS.setPose('jump', 1.5); return true; },
    onCall: () => {
      const z = lastZ;
      totoro.roar();
      if (z < -172 && z > -202) { duetT = 0; totoroS.setPose('duet', 3); } else totoroS.setPose('roar', 2.4);
      return true;
    }, reactRange: 16,
  });
  const chuAnchor = new THREE.Object3D(); troupe.add(chuAnchor);
  const chuS = new Subject({
    id: 'chu', name: 'Chu & Chibi Totoro', from: FILMS.totoro, group: chuAnchor, radius: 1.8, base: 820, rarity: 'rare',
    hint: 'The two small Totoros: dancing by the seed bed, hanging on to Totoro as he flies, and playing on the treetop. Throw an acorn and they hop.',
    poses: { dance: { label: 'Dancing the shoots up', mult: 1.6 }, hop: { label: 'A happy hop', mult: 1.5 }, play: { label: 'Playing the ocarina', mult: 1.7 } },
    onItem: () => { chu.hop(); chibi.hop(); chuS.setPose('hop', 1.2); return true; },
    onCall: () => { chu.hop(); hopNext = 0.25; chuS.setPose('hop', 1.2); return true; }, maxDistance: 120,
  });
  const girlsAnchor = new THREE.Object3D(); troupe.add(girlsAnchor);
  const girlsS = new Subject({
    id: 'satsuki', name: 'Satsuki & Mei', from: FILMS.totoro, group: girlsAnchor, radius: 1.8, base: 780, rarity: 'rare',
    hint: 'In their nightclothes, dancing with Totoro at the seed bed, riding on his tummy, and playing ocarinas on the treetop. Play your ocarina and they wave.',
    poses: { dance: { label: 'The seed dance', mult: 1.6 }, wave: { label: 'Waving', mult: 1.6 }, flying: { label: 'Flying with Totoro', mult: 1.8 } },
    onCall: () => { waveT = 0; girlsS.setPose('wave', 2.2); return true; }, maxDistance: 120,
  });
  const treeAnchor = new THREE.Object3D(); treeAnchor.position.set(8, 36, -70); own.add(treeAnchor);
  const treeS = new Subject({
    id: 'tree', name: 'The tree that grew in one night', from: FILMS.totoro, group: treeAnchor, radius: 48, base: 650,
    hint: 'The acorns the girls planted burst into a giant tree in a moment, and it carries you up into the sky. Play the ocarina and its leaves dance.',
    poses: { growing: { label: 'Bursting out of the ground', mult: 1.8 }, rustle: { label: 'Leaves dancing', mult: 1.4 } },
    onCall: () => { for (let i = 0; i < 3; i++) leafPuffs.burst(camPos.clone().add(new THREE.Vector3(rng.range(-8, 8), rng.range(2, 8), rng.range(-14, -4))), 8, 0x5a9a46, 6, 2, 2.5); treeS.setPose('rustle', 2); return true; },
    maxDistance: 460,
  });
  const sootS = new Subject({
    id: 'soot', name: 'Soot sprites', from: FILMS.totoro, group: soot.anchor, radius: 6, base: 560, crowd: true,
    hint: "Leaving the old house at midnight, drifting away towards the moon. Play the ocarina and they whirl; an acorn scatters them.",
    poses: { swirl: { label: 'Whirling', mult: 1.6 }, scatter: { label: 'Scattering', mult: 1.5 } },
    onCall: () => { soot.swirl(); sootS.setPose('swirl', 3); return true; },
    onItem: (p) => { soot.scatter(p); sootS.setPose('scatter', 2.5); return true; }, reactRange: 18, maxDistance: 140,
  });
  const subjects = [totoroS, chuS, girlsS, treeS, sootS];
  // the home scene switches all of these off while it runs (the characters are shared with it)
  cast.subjects.garden = subjects;
  treeS.active = false;

  // bursts of dust and leaves at moments along the ride
  const BURSTS: Array<{ z: number; p: THREE.Vector3; n: number; leaves?: boolean; spread: number; up: number; size: number }> = [
    { z: -17, p: KD.clone().add(new THREE.Vector3(0, 1, 0)), n: 10, leaves: true, spread: 3, up: 2, size: 1.2 },
    { z: -20.8, p: bed.clone().add(new THREE.Vector3(0, 0.6, 0)), n: 26, spread: 9, up: 5, size: 3.2 },
    { z: -21.5, p: bed.clone().add(new THREE.Vector3(0, 3, 0)), n: 16, leaves: true, spread: 7, up: 6, size: 2.2 },
    { z: -24, p: bed.clone().add(new THREE.Vector3(-7, 0.5, 4)), n: 14, spread: 6, up: 3, size: 2.4 },
    { z: -26, p: new THREE.Vector3(-4.4, 0.4, -43), n: 14, spread: 6, up: 3, size: 2.2 },
    { z: -32, p: new THREE.Vector3(-5, 1.5, -50), n: 14, spread: 6, up: 3, size: 2.4 },
    { z: -32.5, p: new THREE.Vector3(10, 22, -38), n: 16, leaves: true, spread: 14, up: 4, size: 4 },
    { z: -40, p: new THREE.Vector3(8, 40, -66), n: 16, leaves: true, spread: 16, up: 4, size: 4.5 },
  ];
  let lastZ = 1e4;

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), seatW = new THREE.Vector3(), q = new THREE.Quaternion(), qY = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
  /** Put a member at a world point and turn (it is a child of the troupe frame). */
  const putWorld = (o: THREE.Object3D, p: THREE.Vector3, yaw: number) => {
    tmp.copy(p); troupe.worldToLocal(tmp); o.position.copy(tmp);
    o.rotation.set(0, yaw - troupe.rotation.y, 0);
  };
  const arc = (a: THREE.Vector3, b: THREE.Vector3, k: number, h: number, out: THREE.Vector3) => out.copy(a).lerp(b, k).add(tmp2.set(0, h * Math.sin(Math.PI * clamp(k, 0, 1)), 0));

  const update = (dt: number, t: number, ride: { position: THREE.Vector3 }) => {
    const z = ride.position.z, ry = ride.position.y;
    const jumped = Math.abs(lastZ - z) > 4;
    camera.getWorldPosition(camPos);
    adopt();
    for (const s of cast.subjects.home) s.active = false;
    tree.update(z);

    // ---------- the dive through the cloud: a white wash, and the scenery goes while it is full ----------
    const dive = cue(-z, -DIVE.a, -DIVE.b, -DIVE.c, -DIVE.d);
    if (dive > 0) fx.wash(dive * 0.92, 0xd4dcec);
    own.visible = z > HIDE_Z;
    for (const s of subjects) if (!own.visible) s.active = false;
    if (!own.visible) { lastZ = z; return; }

    place.update(t, camera);
    if (place.glow) place.glow.color.setRGB(1.35, 1.2, 1.0).multiplyScalar(1 + Math.sin(t * 7.3) * 0.015 + Math.sin(t * 2.9) * 0.02);

    // ---------- sky: the sea of cloud gathers as you climb; the big moon fades in the dive ----------
    sea.opacity = smoothstep(16, 40, ry) * (1 - smoothstep(-243, -250, z));
    sea.update(t, light);
    moon.opacity = 1 - smoothstep(-243, -250, z);
    moon.update(camPos, light.sky ? light.sky.sunDir.value : moonDir0);
    // passing up through the top of the crown: the leaves close round you for a moment
    const leafy = cue(-z, 170, 175, 178, 183);
    if (leafy > 0) fx.wash(leafy * 0.22, 0x2a4a30);

    // ---------- soot sprites ----------
    const sootOn = z > -62;
    soot.group.visible = sootOn; sootS.active = z > -30;
    // they dwindle away into the night as you climb
    soot.fade = 1 - smoothstep(-30, -60, z);
    if (sootOn) soot.update(t, dt, camPos);
    // the one that boards: it waits at the side of the lane just ahead of where the Catbus stops, and hops
    // onto its back as you set off past it (z 36.5 to 33.5)
    {
      const seatObj = mount.seats[1];
      seatObj.updateWorldMatrix(true, false);
      seatObj.getWorldPosition(seatW);
      const k = smoothstep(36.5, 33.5, z);
      const w = arc(SOOT_WAIT, seatW, k, 2.4, new THREE.Vector3());
      if (k >= 1) { holder.position.set(0, 0, 0); holder.quaternion.identity(); }
      else {
        seatObj.worldToLocal(w);
        holder.position.copy(w);
        // face the rider while waiting, then the way the Catbus faces
        seatObj.getWorldQuaternion(q).invert();
        qY.setFromAxisAngle(yAxis, Math.atan2(camPos.x - SOOT_WAIT.x, camPos.z - SOOT_WAIT.z));
        holder.quaternion.copy(q.multiply(qY)).slerp(new THREE.Quaternion(), k);
      }
    }

    // ---------- fireflies near the ground, motes of light inside the crown ----------
    fireflies.intensity = 1 - smoothstep(8, 22, ry);
    if (fireflies.intensity > 0.01) fireflies.update(dt, t, tmp.set(camPos.x, place.height(camPos.x, camPos.z - 18) + 2.5, camPos.z - 18));
    else fireflies.points.visible = false;
    motes.intensity = smoothstep(-40, -70, z) * (1 - smoothstep(-172, -184, z));
    if (motes.intensity > 0.01) motes.update(dt, t, camPos); else motes.points.visible = false;

    // ---------- the dance beat: crouch, then a slow stretch up, every 4 s ----------
    const ph = ((t / 4) % 1 + 1) % 1;
    const c = smoothstep(0, 0.18, ph) * (1 - smoothstep(0.3, 0.55, ph));
    const r = smoothstep(0.38, 0.72, ph) * (1 - smoothstep(0.88, 1, ph));

    // ---------- the seed bed's shoots ----------
    const shoot = smoothstep(24, -8, z), burst = smoothstep(-17.5, -21, z);
    sprouts.mesh.visible = z > -23.5 && shoot > 0;
    if (sprouts.mesh.visible) {
      sproutAt.forEach((s, i) => {
        const h = 1.65 * shoot * s.s * (1 + 0.28 * r * shoot) * (1 + 7 * burst) * (1 - smoothstep(-21.5, -23.5, z));
        tmp.set(lerp(s.x, bed.x, burst * 0.85), 0.1, lerp(s.z, bed.z, burst * 0.85));
        sprouts.set(i, tmp, h, Math.sin(t * 1.7 + s.ph) * 0.08 + r * 0.05 - burst * 0.1, s.ph + burst * 3 + z * 0.05 * burst);
      });
      sprouts.commit();
    }

    // ---------- bursts ----------
    if (!jumped) for (const b of BURSTS) if (lastZ > b.z && z <= b.z) (b.leaves ? leafPuffs : dust).burst(b.p, b.n, undefined, b.spread, b.up, b.size);
    // the troupe bursts up through the top of the crown on its way to the bough
    if (!jumped && lastZ > -153 && z <= -153) leafPuffs.burst(troupe.position.clone().add(new THREE.Vector3(0, -1, 0)), 16, undefined, 8, 4, 2.6);
    // while the trunk erupts: earth thrown up round its foot, leaves bursting from its growing tip
    if (z < ERUPT.z0 && z > ERUPT.z0 - 21 && Math.floor(t * 9) !== Math.floor((t - dt) * 9)) {
      const a = t * 7.3, rr = 9.5 * tree.size + 1;
      dust.burst(tmp.set(bed.x + Math.cos(a) * rr, 0.4, bed.z + Math.sin(a) * rr), 3, 0x6a4c30, 2.5, 3, 1.6);
      if (tree.tip(z, tmp)) leafPuffs.burst(tmp, 3, Math.floor(t * 9) % 2 ? 0x8ad048 : 0x5a9a40, 4, 2.5, 1.5);
    }
    dust.update(dt); leafPuffs.update(dt);

    // ---------- the troupe ----------
    const active = z > -227;
    troupe.visible = active;
    totoroS.active = chuS.active = girlsS.active = active;
    treeS.active = z < ERUPT.z0 && z > SETS.garden.z1;
    if (z < ERUPT.z0 && z > ERUPT.z0 - 40 && treeS.pose === 'idle') treeS.setPose('growing', 0.4);
    if (active) {
      // the frame: where the top is and which way it faces
      frameAt(z, troupe.position);
      frameAt(z + 1, pA); frameAt(z - 1, pB);
      const heading = pB.distanceTo(pA) > 0.05 ? Math.atan2(pB.x - pA.x, pB.z - pA.z) : facingFrom(KD);
      const toCam = Math.atan2(camPos.x - troupe.position.x, camPos.z - troupe.position.z);
      let yaw: number;
      if (z >= -20.5) yaw = facingFrom(KD);
      else if (z > -166) yaw = lerpAngle(heading, toCam, 0.55);
      else if (z > -204.5) yaw = lerpAngle(lerpAngle(heading, toCam, 0.55), PERCH.yaw, smoothstep(-160, -168, z));
      else yaw = lerpAngle(PERCH.yaw, heading, smoothstep(-204.5, -208, z));
      troupe.rotation.set(0, yaw, 0);
      troupe.scale.setScalar(lerp(1, 1.3, smoothstep(-45, -110, z)));
      troupe.updateMatrixWorld(true);

      // the top: spins slowly by the bed, fast when flying; wobbles on its tip
      const fast = smoothstep(-14, -17, z) * (1 - smoothstep(-168, -172, z) + smoothstep(-201, -204, z));
      cast.topSpin.rotation.y += dt * lerp(2.2, 11, clamp(fast, 0, 1));
      const wob = 0.04 + 0.02 * Math.sin(t * 0.7);
      // in the concert the top hovers behind the bough, humming
      cast.top.position.set(0, z < -168 && z > -204.5 ? Math.sin(t * 1.4) * 0.15 : 0, 0);
      cast.top.rotation.set(Math.sin(t * 2.3) * wob, 0, Math.cos(t * 2.3) * wob);

      const gather = smoothstep(-14, -18, z);
      const land = smoothstep(-166, -172, z), leave = smoothstep(-201, -204.5, z);
      const seated = land * (1 - leave);
      const dancing = 1 - gather;
      const flying = z < -20.5 && seated < 0.5;

      // Totoro
      const onTop = troupe.localToWorld(new THREE.Vector3(0, 0, 0));
      const hop = smoothstep(-18, -20.5, z);
      const tW = new THREE.Vector3();
      if (z > -18) tW.copy(DANCE.totoro);
      else if (z > -166) arc(DANCE.totoro, onTop, hop, 2.6, tW);
      else arc(onTop, CONCERT.totoro, seated, 2.2, tW);
      const tYaw = z > -18 ? facingFrom(DANCE.totoro) : z > -166 ? lerpAngle(facingFrom(DANCE.totoro), yaw, hop) : z > -201 ? PERCH.yaw : lerpAngle(PERCH.yaw, yaw, leave);
      putWorld(totoro.group, tW, tYaw);
      // his umbrella (and the small ones') is put away as he gathers the girls; at dawn they have them again
      const umb = 1 - smoothstep(-15, -18.5, z);
      for (const tt of [totoro, chu, chibi]) if (tt.umbrella) { tt.umbrella.scale.setScalar(Math.max(0.001, umb)); tt.umbrella.visible = umb > 0.002; }
      if (duetT >= 0) { duetT += dt; if (duetT > 2.7) duetT = -1; }
      if (dancing > 0.5) dancePose(c, r, pose);
      else if (seated > 0.5) playPose(t, pose);
      else if (z > -20.5) gatherPose(gather, pose);
      else flyPose(t, pose);
      totoro.pose = duetT >= 0 || totoro.roarTime > 0 ? null : pose;
      totoro.lookTarget = camPos.distanceTo(tW) < 70 ? camPos : null;
      totoro.update(dt, t);
      totoro.group.updateMatrixWorld(true);
      if (totoroS.poseTimer <= 0) totoroS.setPose(dancing > 0.5 ? 'dance' : flying ? 'flying' : 'idle', 0.3);

      // Chu: dances, then hangs from Totoro's raised paw, then sits on the bough's far end
      const hang = new THREE.Vector3();
      cast.paw(hang);
      troupe.worldToLocal(hang).add(new THREE.Vector3(0.25, -2.75, 0));
      troupe.localToWorld(hang);
      const cW = new THREE.Vector3();
      if (z > -166) arc(DANCE.chu, hang, gather, 2, cW); else arc(hang, CONCERT.chu, seated, 2, cW);
      putWorld(chu.group, cW, z > -166 ? lerpAngle(facingFrom(DANCE.chu), yaw, gather) : PERCH.yaw);
      // Chibi: dances, then rides on Totoro's head, and stays there on the bough
      const head = totoro.group.localToWorld(cast.slots.chibi.clone());
      const bW = arc(DANCE.chibi, head, gather, 2.4, new THREE.Vector3());
      putWorld(chibi.group, bW, lerpAngle(facingFrom(DANCE.chibi), tYaw + 0.25, gather));
      if (dancing > 0.5) { dancePose(c, r, poseC); dancePose(c, r, poseB); }
      else if (seated > 0.5) { playPose(t + 1, poseC); playPose(t + 2, poseB); }
      else { Object.assign(poseC, { out: [0.12, 0.12], up: [-2.85, -2.85], mouth: 0.25, lean: 0, stretch: 0, rise: 0, head: 0 }); Object.assign(poseB, { out: [0.9, 0.5], up: [-2.1, -1.0], mouth: 0.2, lean: 0, stretch: 0, rise: 0, head: 0 }); }
      chu.pose = chu.roarTime > 0 ? null : poseC; chibi.pose = poseB;
      if (hopNext > 0) { hopNext -= dt; if (hopNext <= 0) chibi.hop(); }
      // a little hop for Chibi at the top of every stretch
      if (dancing > 0.5 && ph > 0.72 && ph < 0.74) chibi.hop();
      chu.lookTarget = chibi.lookTarget = camPos.distanceTo(cW) < 60 ? camPos : null;
      chu.update(dt, t); chibi.update(dt, t);
      chuAnchor.position.copy(troupe.worldToLocal(cW.clone().lerp(bW, 0.5).add(new THREE.Vector3(0, 1.2, 0))));
      if (chuS.poseTimer <= 0) chuS.setPose(dancing > 0.5 ? 'dance' : seated > 0.5 ? 'play' : 'idle', 0.3);

      // the girls: dance, ride on his belly, sit on the bough
      const girls: Array<[typeof satsuki, THREE.Vector3, THREE.Vector3, number, number]> = [[satsuki, DANCE.satsuki, CONCERT.satsuki, -0.3, 0], [mei, DANCE.mei, CONCERT.mei, 0.35, 1]];
      if (waveT >= 0) { waveT += dt; if (waveT > 2.4) waveT = -1; }
      const wave = waveT >= 0 ? envelope(waveT, 0, 0.3, 1.9, 2.4) : 0;
      const gW = new THREE.Vector3();
      for (const [k, dance, concert, turn, i] of girls) {
        const slot = totoro.group.localToWorld((i === 0 ? cast.slots.satsuki : cast.slots.mei).clone());
        const kW = new THREE.Vector3();
        if (z > -166) arc(dance, slot, gather, 2.4, kW); else arc(slot, concert, seated, 2.0, kW);
        const kYaw = z > -166 ? lerpAngle(facingFrom(dance), tYaw + turn, gather) : lerpAngle(tYaw + turn, PERCH.yaw, seated);
        k.tick(dt, t, camPos.distanceTo(kW) < 50 ? camPos : null, 1);
        const ride = gather * (1 - seated);
        // now and then, flying, one waves at you
        const flyWave = flying ? smoothstep(0.7, 0.92, 0.5 + 0.5 * Math.sin(t * 0.6 + i * 2.2)) : 0;
        const lift = poseKid(k, {
          crouch: c * dancing, reach: r * dancing + (z > -20.5 ? 0.6 * Math.sin(Math.PI * gather) : 0), ride, sit: seated, play: seated * (1 - wave),
          wave: Math.max(wave, flyWave),
        }, t, i * 1.7);
        if (ride > 0.5) k.knee.forEach((kn, j) => { kn.rotation.x += Math.sin(t * 3.1 + j * 1.9 + i) * 0.2; });
        putWorld(k.group, kW.add(tmp2.set(0, lift, 0)), kYaw);
        gW.add(kW);
      }
      girlsAnchor.position.copy(troupe.worldToLocal(gW.multiplyScalar(0.5).add(new THREE.Vector3(0, 1.4, 0))));
      if (girlsS.poseTimer <= 0) girlsS.setPose(dancing > 0.5 ? 'dance' : flying ? 'flying' : 'idle', 0.3);

      // ocarinas come out on the bough; notes drift up while they play
      const oc = smoothstep(-170, -173, z) * (1 - smoothstep(-199, -202, z));
      cast.ocarinas.forEach((o) => { o.visible = oc > 0.01; o.scale.setScalar(Math.max(0.001, oc)); });
      if (oc > 0.5 && Math.floor(t * 3) !== Math.floor((t - dt) * 3)) {
        notes.emit(totoro.group.localToWorld(tmp.set(0, 3.9, 2.2)));
        if (Math.floor(t * 3) % 2 === 0) notes.emit(chu.group.localToWorld(tmp.set(0, 3.9, 2.2)));
        else notes.emit(satsuki.head.localToWorld(tmp.set(0, 0.1, 0.4)));
      }
    } else {
      for (const tt of [totoro, chu, chibi]) tt.pose = null;
    }
    notes.update(dt, t);
    lastZ = z;
  };

  return {
    id: 'garden', group,
    // drawn from the start until the cloud dive has cleared (its scenery is hidden at z -252, under the wash)
    show: [U(SETS.garden.z0 + 60), U(DIVE.d - 3)],
    occluders: [place.terrain, place.proxies, tree.proxies],
    subjects, water: -Infinity,
    floor: (x, z) => {
      // on the tree: the great limb under the path, the top of the crown, or the sea of cloud
      if (lastZ < LIMB.z0 && lastZ > HIDE_Z) {
        if (z <= LIMB.z0 && z >= LIMB.z1) {
          const a = road.at(z);
          if (Math.abs((x - a.x) * a.rx + (z - a.z) * a.rz) < 3.2) return a.y;
        }
        if (lastZ < -172) {
          const top = tree.crownTop(x, z);
          if (top > -Infinity) return top;
          if (sea.opacity > 0.5) return 50;
        }
      }
      return place.height(x, z);
    },
    update,
    onItemLand(p) {
      if (p.y > 30) leafPuffs.burst(p, 6, 0x5a9a46, 2, 1.5, 1);
      else dust.burst(p, 5, 0x8a7a64, 1.5, 1, 0.8);
    },
  };
}
