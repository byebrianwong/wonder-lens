import * as THREE from 'three';
import { envelope } from '../../../engine/Rig';
import { makePeleFigure, makeSteve } from './crew';

/*
 * The Life Aquatic's leads for the curtain call (and the character gallery): standalone builders, no scene
 * needed. Each faces +z with its origin at its feet.
 */

export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

/** Steve Zissou in his beanie, binoculars round his neck. For his bow he salutes, then bows from the waist. */
export function makeZissou(): CastMember {
  const s = makeSteve();
  const f = s.figure;
  let bowT = 99, k = 0;
  return {
    group: s.group,
    bow() { bowT = 0; s.salute(); },
    update(dt, t) {
      bowT += dt;
      // take off last frame's bow first: the joints ease from wherever they were left
      f.spine.rotation.x -= k * 0.6;
      f.neck.rotation.x -= k * 0.2;
      s.update(dt, t, null);
      k = envelope(bowT, 1.3, 1.7, 2.5, 3.2);
      f.spine.rotation.x += k * 0.6;
      f.neck.rotation.x += k * 0.2;
    },
  };
}

/** Pele dos Santos on his crate with his guitar. His bow is a song. */
export function makePele(): CastMember {
  const p = makePeleFigure();
  return {
    group: p.group,
    bow() { p.play(); },
    update(dt, t) { p.update(dt, t, null); },
  };
}
