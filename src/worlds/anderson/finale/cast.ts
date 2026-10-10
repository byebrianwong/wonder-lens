import type * as THREE from 'three';
import { makeGustave, makeZero } from '../hotel/cast';
import { makeAgatha } from '../mendls/cast';
import { makeJopling } from '../ski/cast';
import { makeKylie, makeMrFox } from '../fox/cast';
import { makeSam, makeSuzy } from '../moonrise/cast';
import { makeAlien, makeAugie } from '../asteroid/cast';
import { makeAtari, makeChief } from '../isle/cast';
import { makePele, makeZissou } from '../aquatic/cast';

/*
 * The cast of the curtain call, one or two from every scene, in the order they stand across the stage
 * (left to right as the audience sees them). Each scene exports its own builders from <scene>/cast.ts.
 */

export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

/** Builders for the line, left to right. */
export const CURTAIN_CALL: Array<{ name: string; make: () => CastMember }> = [
  { name: 'Steve Zissou', make: makeZissou },
  { name: 'Chief', make: () => makeChief() },
  { name: 'The alien', make: makeAlien },
  { name: 'Suzy', make: makeSuzy },
  { name: 'Mr. Fox', make: makeMrFox },
  { name: 'Agatha', make: makeAgatha },
  { name: 'M. Gustave', make: makeGustave },
  { name: 'Zero', make: makeZero },
  { name: 'Jopling', make: makeJopling },
  { name: 'Kylie', make: makeKylie },
  { name: 'Sam', make: makeSam },
  { name: 'Augie', make: makeAugie },
  { name: 'Atari', make: makeAtari },
  { name: 'Pelé', make: makePele },
];
