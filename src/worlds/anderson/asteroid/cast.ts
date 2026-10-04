import * as THREE from 'three';
import { makeAlienPuppet, makeAugieFigure } from './characters';

/*
 * Asteroid City's leads for the curtain call (and the character gallery): standalone builders, no scene
 * needed. Each faces +z with its origin at its feet.
 */

export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

/** The alien: a tall, thin stop-motion puppet. It bows stiffly from the waist, a hand on its chest. */
export function makeAlien(): CastMember {
  const a = makeAlienPuppet(17);
  let bowT = 99;
  return {
    group: a.group,
    bow() { bowT = 0; a.act('bow'); },
    update(dt, t) {
      bowT += dt;
      if (bowT > 1.8 && a.current === 'bow') a.act('idle');
      a.update(dt, t, null);
    },
  };
}

/** Augie Steenbeck with his press camera. For his bow he takes the audience's picture (the flashbulb fires), then bows. */
export function makeAugie(): CastMember {
  const a = makeAugieFigure(63);
  let bowT = 99;
  return {
    group: a.group,
    bow() { bowT = 0; a.snap(); },
    update(dt, t) {
      bowT += dt;
      if (bowT > 1.2 && bowT - dt <= 1.2) a.bow();
      a.update(dt, t, null);
    },
  };
}
