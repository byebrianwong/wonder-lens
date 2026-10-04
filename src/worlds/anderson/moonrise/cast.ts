import * as THREE from 'three';
import { envelope, Spring } from '../../../engine/Rig';
import { lerp } from '../../../engine/math';
import { KID, bake, binoculars, lighten, scoutKid, suzyKid, type Kid } from './figures';

/*
 * Moonrise Kingdom's leads for the curtain call (and the character gallery): Sam in his coonskin cap, Suzy
 * with her binoculars, and a Khaki Scout of Troop 55. Each stands on its own (no scene needed), faces +z with
 * its feet at the origin, and has a curtain-call gesture: Sam and the scout salute, Suzy waves and bobs.
 */

export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

function member(k: Kid, gesture: (k: Kid, g: number, t: number) => void, seed: number): CastMember {
  const group = new THREE.Group();
  group.add(k.group);
  lighten(k.group, 56, 36);
  bake(k.group, [k.spine, k.head, k.shoulder[0], k.elbow[0], k.shoulder[1], k.elbow[1]]);
  const sp = new Spring(0, 1.8, 0.65);
  let bowT = -1;
  return {
    group,
    bow() { bowT = 0; },
    update(dt, t) {
      let g = 0;
      if (bowT >= 0) { bowT += dt; g = envelope(bowT, 0, 0.45, 1.9, 2.6); if (bowT > 2.6) bowT = -1; }
      const v = sp.update(g, dt);
      k.tick(dt, t, null, 0);
      // standing easy: a small sway, arms loose
      k.spine.rotation.set(0, Math.sin(t * 0.6 + seed) * 0.05, Math.sin(t * 0.8 + seed) * 0.02);
      k.shoulder[0].rotation.set(0, 0, -0.12); k.elbow[0].rotation.set(-0.15, 0, 0);
      k.shoulder[1].rotation.set(0, 0, 0.12); k.elbow[1].rotation.set(-0.15, 0, 0);
      gesture(k, v, t);
    },
  };
}

/** Sam Shakusky: Khaki Scout uniform, coonskin cap, glasses. His bow is a scout's salute. */
export function makeSam(): CastMember {
  const k = scoutKid({ hair: 0x6a4428, seed: 12101, sam: true });
  k.group.scale.setScalar(KID.tall * 0.98);
  return member(k, (f, g) => {
    f.shoulder[0].rotation.set(lerp(0, -2.5, g), 0, lerp(-0.12, -0.55, g));
    f.elbow[0].rotation.set(lerp(-0.15, -2.1, g), 0, 0);
    f.spine.rotation.x += 0.05 * g;
  }, 1);
}

/** Suzy Bishop: pink dress, blue eyeshadow, binoculars on a strap. Her bow: a wave and a little bob. */
export function makeSuzy(): CastMember {
  const k = suzyKid(12111);
  k.group.scale.setScalar(KID.tall);
  const b = binoculars(1.6);
  b.position.set(0, 0.42, 0.25); b.rotation.x = 0.3;
  k.spine.add(b);
  return member(k, (f, g, t) => {
    f.shoulder[1].rotation.set(lerp(0, -0.4, g), 0, lerp(0.12, 2.5, g));
    f.elbow[1].rotation.set(lerp(-0.15, -0.2, g), 0, g * (Math.sin(t * 11) * 0.45 + 0.2));
    f.spine.rotation.x += 0.18 * g * Math.max(0, Math.sin(t * 3));
    f.head.rotation.z = 0.15 * g;
  }, 2);
}

/** A Khaki Scout of Troop 55: campaign hat, yellow neckerchief, merit badges. Salutes. */
export function makeScout(): CastMember {
  const k = scoutKid({ hair: 0xc89a58, skin: 0xf6dcc4, seed: 12121 });
  k.group.scale.setScalar(KID.scout);
  return member(k, (f, g) => {
    f.shoulder[0].rotation.set(lerp(0, -2.5, g), 0, lerp(-0.12, -0.55, g));
    f.elbow[0].rotation.set(lerp(-0.15, -2.1, g), 0, 0);
  }, 3);
}
