import * as THREE from 'three';
import { Subject } from '../../game/Subject';
import { easeOutBack } from '../../engine/Rig';
import { Rng, clamp, smoothstep } from '../../engine/math';
import { makeKodama } from '../ghibli/spirits';
import { FILMS, forwardOf, type SetContext } from './common';
import { Foxsquirrels } from './laputa/foxsquirrel';
import { secretsOf } from './secrets';

/*
 * Secret passengers on the Catbus (see secrets.ts). Each is built at load, parented to the Catbus, and hidden
 * until its secret is found; from then on it rides along wherever the Catbus goes (it is out of sight with the
 * Catbus while the rider is on Haku's back or falling, and back with it at home).
 *
 * Their photo subjects switch themselves on and off in their own update, which the game runs every frame
 * wherever the rider is.
 */

/** How long a new passenger takes to arrive on the Catbus, in seconds. */
const ARRIVE = 0.7;

/**
 * A Kodama that pops up on the Catbus's head, beside its right ear, when the ocarina is played to the Kodama
 * in the forest. Call `found()` from that reaction.
 */
export function buildKodamaRider(ctx: SetContext) {
  const secrets = secretsOf(ctx);
  const head = ctx.mount.catbus.group.getObjectByName('head')!;
  const kodama = makeKodama(1, new Rng(4141), 0);
  kodama.group.children[0].position.set(0, 0, 0);
  kodama.group.children[0].rotation.y = 0;
  // a touch darker than the Kodama in the wood: this one is right in front of the rider, close to the scenes' lights
  kodama.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined; if (m?.color) m.color.multiplyScalar(0.86); });
  const holder = new THREE.Group();
  // on top of the head, between the right ear and the middle (head bone space: the head's centre is 0.15 ahead)
  holder.position.set(-0.42, 1.27, -0.22);
  holder.rotation.set(-0.12, 0, 0.1);
  holder.add(kodama.group);
  holder.visible = false;
  head.add(holder);

  let since = -1, nextRattle = 6;
  const subject: Subject = new Subject({
    id: 'kodama-rider', name: 'A Kodama riding along', from: FILMS.mononoke, group: holder, radius: 0.55, base: 900, rarity: 'rare', secret: true,
    hint: 'Play the ocarina to the Kodama in the Forest Spirit\'s wood and one climbs onto the Catbus\'s head. It rides with you the rest of the night, all the way home.',
    poses: { rattle: { label: 'Rattling along', mult: 1.6 }, arrive: { label: 'Hopping aboard', mult: 1.5 } },
    centerOffset: new THREE.Vector3(0, 0.55, 0), facing: forwardOf(holder), maxDistance: 40, reactRange: 4,
    onCall: () => { kodama.rattle(); subject.setPose('rattle', 2.4); return true; },
    update: (dt, ride) => {
      const on = secrets.kodama && ctx.mount.root.visible;
      holder.visible = on;
      subject.active = on;
      if (!on) return;
      if (since < 0) { since = 0; kodama.rattle(); subject.setPose('arrive', 2); }
      since += dt;
      // it pops up out of the fur with a little bounce
      const k = clamp(since / ARRIVE, 0, 1);
      holder.scale.setScalar(Math.max(0.001, easeOutBack(k, 1.6)));
      // and rattles its head now and then by itself
      nextRattle -= dt;
      if (nextRattle <= 0) { nextRattle = 5 + (ride.time * 7.3) % 6; kodama.rattle(); }
      kodama.update(dt, ride.time);
    },
  });
  subject.active = false;
  return { subject, found() { secrets.kodama = true; } };
}

/**
 * A foxsquirrel that jumps onto the Catbus's back, just ahead of the rider on the left, after the rider throws
 * the foxsquirrels on Laputa an acorn. Its instanced meshes live in the scene itself (they are placed in world
 * space from its perch). Call `found()` from that reaction.
 */
export function buildFoxsquirrelRider(ctx: SetContext) {
  const secrets = secretsOf(ctx);
  const mid = ctx.mount.catbus.group.getObjectByName('mid')!;
  // the perch is in the 'mid' bone's space (the bone sits 2 above the paws); the back's top is 1.35 above it
  const SEAT = new THREE.Vector3(0.55, 1.28, 0.95);
  const perch = new THREE.Group();
  perch.position.copy(SEAT);
  mid.add(perch);
  const one = new Foxsquirrels([perch], [], 0, () => 0, 8181);
  one.group.visible = false;
  ctx.scene.add(one.group);

  let since = -1, wait = 1.2, nextLook = 4;
  const subject: Subject = new Subject({
    id: 'foxsquirrel-rider', name: 'A foxsquirrel along for the ride', from: FILMS.laputa, group: perch, radius: 0.5, base: 850, rarity: 'rare', secret: true,
    hint: 'Throw the foxsquirrels on Laputa an acorn, and one of them jumps onto the Catbus\'s back to come with you. Look down just ahead of you.',
    poses: { listen: { label: 'All ears', mult: 1.5 }, arrive: { label: 'Jumping aboard', mult: 1.6 } },
    centerOffset: new THREE.Vector3(0, 0.4, 0.1), facing: forwardOf(perch), maxDistance: 30, reactRange: 4,
    onCall: () => { one.alert(2.6); subject.setPose('listen', 2.4); return true; },
    update: (dt, ride) => {
      // it finishes its acorn first, then comes running
      if (secrets.foxsquirrel && wait > 0) wait -= dt;
      const on = secrets.foxsquirrel && wait <= 0 && ctx.mount.root.visible;
      one.group.visible = on;
      subject.active = on;
      if (!on) return;
      if (since < 0) { since = 0; subject.setPose('arrive', 1.8); }
      since += dt;
      // the jump: up from beside the Catbus's flank onto its back
      const k = clamp(since / ARRIVE, 0, 1);
      perch.position.set(SEAT.x + (1 - k) * 1.1, SEAT.y - (1 - k) * 1.6 + Math.sin(Math.PI * k) * 0.9, SEAT.z - (1 - k) * 0.6);
      // now and then it sits up to look round
      nextLook -= dt;
      if (nextLook <= 0) { nextLook = 6 + (ride.time * 3.1) % 5; one.alert(1.4); }
      one.update(dt, ride.time, ride.position);
      perch.rotation.y = 0.25 * smoothstep(0, 1, k) * Math.sin(ride.time * 0.3);
    },
  });
  subject.active = false;
  return { subject, found() { secrets.foxsquirrel = true; } };
}
