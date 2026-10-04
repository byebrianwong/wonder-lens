import * as THREE from 'three';
import { Subject } from '../../../game/Subject';
import { CumulusField } from '../../../engine/Clouds';
import { Puffs } from '../../../engine/Particles';
import type { Placement } from '../../../engine/Builders';
import { Rng, clamp, smoothstep } from '../../../engine/math';
import { NEST } from '../layout';
import { TOUCH_Z } from '../route/sky';
import { FILMS, type BuiltSet, type SetContext } from '../common';
import { SkyLight, capColor, softenCumulus } from '../sky/shared';
import { CloudSea, findTouches, makeSeaHeight, seaClouds } from '../sky/cloudSea';
import { buildNest, rOut } from '../sky/nest';
import { buildAirship, buildKiki } from '../sky/flyers';
import { buildCrossing } from '../sky/crossing';

/*
 * Above the clouds at sunrise (z -920 to -1230), from Kiki's Delivery Service and Castle in the Sky.
 *
 * Out of the white mist at the top of the cedar, the Catbus bounds across a sea of cloud tops, a puff of
 * cloud at each landing, with the low sun ahead and to the right. Kiki and Jiji fly in from far ahead and
 * keep it company; the airship from Koriko drifts past on the left. Ahead the whole way the storm wall of
 * the Dragon's Nest grows until it fills the sky, lightning flickering inside it. Kiki climbs away, the
 * light goes grey, and the Catbus leaps into the storm: rain, lightning, and in one flash the dark shape
 * of the castle ahead.
 *
 * The Dragon's Nest ring is built here but lives in the scene (not this set's group), because the Laputa
 * scene sees it from inside. This set stays shown until z -1545 so its update can keep running the ring;
 * everything else of this set is hidden while the screen is covered after z -1232.
 */

/** Where this set's own scenery shows (both ends are under a full screen cover). */
const OWN = { z0: -912, z1: -1232 };
/** Where the Dragon's Nest shows: from the white cover at the start to the white cover on leaving the eye. */
const RING = { z0: -916, z1: -1508 };

export function buildSky(ctx: SetContext): BuiltSet {
  const { road, scene, fx, camera } = ctx;
  const rng = new Rng(5150);
  const group = new THREE.Group();
  const own = new THREE.Group();
  group.add(own);
  const light = new SkyLight(scene);

  // ---------- the sea of cloud, with a dome under every landing ----------
  const touches = findTouches(road, TOUCH_Z);
  const height = makeSeaHeight(road, touches);
  const sea = new CloudSea(height, ctx.lowDetail);
  own.add(sea.mesh);
  const clouds = seaClouds(rng, road, height, ctx.lowDetail);
  own.add(clouds.group);
  // sunrise tints for the sea's clouds: peach-gold tops, rose-lilac shade, a muted lilac-grey as the storm looms
  const warmLit = new THREE.Color(1.0, 0.84, 0.7), roseLilac = new THREE.Color(0.86, 0.72, 0.84), lilacGrey = new THREE.Color(0.6, 0.58, 0.7);
  (clouds.material.uniforms.uLift.value as THREE.Color).copy(roseLilac);
  clouds.material.uniforms.uLiftAmt.value = 0.4;

  // big dark billows either side of where the path goes into the storm wall; even entries are towers, odd ones banks
  const gatePl: Placement[] = [
    { x: -44, y: 44, z: -1196, scale: 2.4, rot: 0.3 },
    { x: -26, y: 36, z: -1186, scale: 2.0, rot: Math.PI / 2 },
    { x: 42, y: 46, z: -1194, scale: 2.3, rot: -0.4 },
    { x: 26, y: 37, z: -1189, scale: 2.0, rot: Math.PI / 2 + 0.15 },
    { x: -5, y: 68, z: -1200, scale: 1.8, rot: 0.2 },
    { x: -72, y: 40, z: -1184, scale: 2.6, rot: Math.PI / 2 - 0.2 },
  ];
  const gate = softenCumulus(new CumulusField(rng, gatePl, { variants: 4 }));
  own.add(gate.group);
  const gateLit = new THREE.Color(0.52, 0.5, 0.6), gateShade = new THREE.Color(0.16, 0.18, 0.24), boltTint = new THREE.Color(0.75, 0.82, 1.0), tmpC = new THREE.Color();

  // ---------- landings: a puff of cloud under the paws ----------
  const puffs = new Puffs(0xfff2e8, 48, 4242);
  own.add(puffs.group);
  // set from the sea's own light at each landing, and kept below the bloom threshold
  const puffColor = new THREE.Color(0xf4dccc);

  // ---------- the Dragon's Nest ----------
  const nest = buildNest(road, ctx.lowDetail);
  scene.add(nest.group);
  // shown only inside its range, and never while this set is hidden (a jump along the ride skips this set's update)
  let ringWanted = false;
  const baseUpdate = nest.group.updateMatrixWorld.bind(nest.group);
  nest.group.updateMatrixWorld = (force?: boolean) => { nest.group.visible = ringWanted && group.visible; baseUpdate(force); };
  nest.group.visible = false;

  // ---------- Kiki and Jiji, and the airship ----------
  const kiki = buildKiki(camera);
  own.add(kiki.group);
  const ship = buildAirship();
  own.add(ship.root);

  // ---------- through the storm ----------
  const crossing = buildCrossing(road, camera, ctx.lowDetail);
  group.add(crossing.group);

  // ---------- the nest as a photo subject: a point on its face towards the camera ----------
  const nestAnchor = new THREE.Object3D();
  group.add(nestAnchor);
  const nestS = new Subject({
    id: 'nest', name: "The Dragon's Nest", from: FILMS.laputa, group: nestAnchor, radius: 110, base: 700,
    hint: 'The storm wall round the floating castle looms ahead the whole way across the clouds. Play the ocarina and lightning answers.',
    poses: { lightning: { label: "Lightning in the Dragon's Nest", mult: 1.6 } }, maxDistance: 900,
    // the game updates every subject every frame, so this holds even when the ride jumps past this set
    update: (_dt, ride) => {
      const z = ride.position.z;
      nestS.active = z <= -925 && z > -1196;
      // the wall blocks photos only around this scene (raycasts skip layer 31), not from the meadow beyond the ring
      nest.proxy.layers.set(z < -880 && z > -1260 ? 0 : 31);
    },
  });
  nestS.active = false;
  nest.onBolt = () => { if (nestS.active && nestS.poseTimer < 1.4) nestS.setPose('lightning', 1.4); };

  // a light that flares on the Catbus (and Kiki) when lightning strikes near
  const flashSpot = { from: road.u(-1060), to: road.u(-1214), pos: new THREE.Vector3(), color: 0xd4deff, intensity: 300, distance: 70 };
  ctx.lights.add(flashSpot);

  // ---------- per-frame state ----------
  const seat = ctx.mount.seat;
  const camPos = new THREE.Vector3(), eye = new THREE.Vector3(), riderVel = new THREE.Vector3(), lastPos = new THREE.Vector3(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  let havePos = false, prevZ = 0;

  const set: BuiltSet = {
    id: 'sky', group, show: [road.u(-860), road.u(-1545)],
    occluders: [nest.proxy], subjects: [...kiki.subjects, ship.subject, nestS], water: -Infinity,
    floor: (x, z) => height(x, z),
    bump: (z) => {
      // a small dip of the camera just after each landing
      let b = 0;
      for (const t of touches) b += Math.exp(-(((z - (t.z - 1.2)) / 2.2) ** 2));
      return -0.22 * b;
    },
    update(dt, t, ride) {
      const z = ride.position.z;
      camera.getWorldPosition(camPos);
      // the rider's eye on the Catbus this frame (the camera itself is placed after the world updates)
      fwd.copy(ride.tangent).setY(0).normalize();
      eye.copy(ride.position).addScaledVector(fwd, seat.z);
      eye.y += seat.y;
      if (havePos && dt > 0 && lastPos.distanceTo(ride.position) < 30) riderVel.subVectors(ride.position, lastPos).divideScalar(dt);
      else riderVel.set(0, 0, 0);
      const jumped = !havePos || Math.abs(prevZ - z) > 6;
      lastPos.copy(ride.position); havePos = true;

      ringWanted = z <= RING.z0 && z > RING.z1;
      const on = z <= OWN.z0 && z > OWN.z1;
      own.visible = on;
      // the storm's gloom spreads over everything as the wall looms
      const gloom = smoothstep(-1080, -1190, z);
      if (on) {
        sea.update(light, gloom, t);
        clouds.update(light.sky, light.fog, light.sunIntensity);
        const cu = clouds.uniforms;
        cu.uLit.value.lerp(warmLit, 0.4); cu.uShade.value.lerp(roseLilac, 0.45);
        cu.uLit.value.lerp(lilacGrey, gloom * 0.3); cu.uShade.value.lerp(lilacGrey, gloom * 0.3);
        cu.uRim.value.multiplyScalar(0.7);
        gate.update(light.sky, light.fog, light.sunIntensity);
        const gu = gate.uniforms;
        // lightning close by lights them up for a moment
        tmpC.copy(boltTint).multiplyScalar(nest.flashLevel * 1.5);
        gu.uLit.value.lerp(gateLit, 0.7).add(tmpC); gu.uShade.value.copy(gateShade).add(tmpC);
        // a puff of cloud under the front and back paws at each landing
        if (!jumped) for (const tc of touches) {
          if (prevZ > tc.z && z <= tc.z) {
            capColor(puffColor.copy(sea.uniforms.uLit.value).lerp(sea.uniforms.uShade.value, 0.3), 0.72);
            puffs.burst(tmp.copy(ride.position).addScaledVector(fwd, 2.8), 6, puffColor, 3.5, 1.2, 2.4);
            puffs.burst(tmp.copy(ride.position).addScaledVector(fwd, -2.6), 6, puffColor, 3.5, 1.2, 2.4);
          }
        }
        puffs.update(dt);
        ship.update(dt, t, z);
      } else {
        ship.subject.active = false;
      }
      kiki.update(dt, t, ride, eye, riderVel);
      prevZ = z;

      // the ring, its lightning and its photo anchor
      if (ringWanted) nest.update(dt, t, camPos, light, fx);
      else nest.flashLevel = 0;
      const dx = camPos.x - NEST.x, dz = camPos.z - NEST.z, dc = Math.hypot(dx, dz) || 1;
      const face = Math.max(0, dc - NEST.outer);
      const ay = clamp(camPos.y + face * 0.35, 60, 220);
      nestAnchor.position.set(NEST.x + (dx / dc) * (rOut(ay) + 16), ay, NEST.z + (dz / dc) * (rOut(ay) + 16));

      crossing.update(dt, t, z, fwd, fx);
      // lightning lights the Catbus: a light ahead of it, towards the storm, that flares with each flash
      flashSpot.pos.copy(camPos).addScaledVector(tmp.set(-dx / dc, 0, -dz / dc), 14);
      flashSpot.pos.y += 8;
      ctx.lights.boost.set(flashSpot, Math.min(1, nest.flashLevel * 3 + crossing.flash));
    },
    onCall() {
      if (nestS.active) { nest.storm(); nestS.setPose('lightning', 2.5); }
    },
    onItemLand(pos) {
      puffs.burst(pos, 8, puffColor, 3, 1.5, 1.6);
    },
  };
  return set;
}
