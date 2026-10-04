import * as THREE from 'three';
import { makeKylie as kylie, makeMrFox as mrFox, makeWolf as wolf } from './characters';

/*
 * The fox scene's characters for the curtain call (and the dev gallery): standalone builders that need no
 * scene. Each faces +z with its origin at its feet, moves on twos, and `bow()` plays its curtain-call
 * gesture (Mr. Fox bows with a paw on his chest, Kylie bows with a little wave, the wolf dips his head).
 */

export interface CastMember { group: THREE.Group; update(dt: number, t: number): void; bow(): void }

const wrap = (c: { group: THREE.Group; update(dt: number, t: number, cam: THREE.Vector3 | null): void; bow(): void }): CastMember => ({
  group: c.group,
  update: (dt, t) => c.update(dt, t, null),
  bow: () => c.bow(),
});

/** Mr. Fox in his corduroy suit, about 2 units tall. */
export function makeMrFox(): CastMember { return wrap(mrFox()); }
/** Kylie the opossum in his pale blue cardigan, about 1.7 units tall. */
export function makeKylie(): CastMember { return wrap(kylie()); }
/** The black wolf on all fours, about 2.4 long and 1.9 tall at the head. */
export function makeWolf(): CastMember { return wrap(wolf()); }
