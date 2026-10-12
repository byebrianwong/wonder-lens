import { speedAtZ } from './layout';
import type { SetContext } from './common';
import type { HowlCastle } from './howl/castle';
import type { Smoke } from './howl/smoke';

/*
 * Secrets and moment cues for "Catbus to Anywhere".
 *
 * A secret is a subject that only appears because the rider did something earlier in the ride, usually in an
 * earlier scene:
 *  kodama       play the ocarina to the Kodama in the Forest Spirit's wood: one climbs onto the Catbus's head
 *               and rides along for the rest of the night (forest set)
 *  foxsquirrel  throw an acorn to the foxsquirrels on Laputa: one jumps onto the Catbus's back and comes along
 *               (laputa set)
 *  calcifer     throw Calcifer an acorn: Howl's castle walks across the hills behind the garden at dawn
 *               (meadow set; the home set walks the castle)
 *  noFace       throw No-Face an acorn on the bathhouse bridge: he rides the sea train under Haku (bathhouse set;
 *               the haku set seats him)
 * When the trigger never happens the secret never appears, and nothing is left empty in its place.
 *
 * The state is made once per built world (keyed by the Catbus mount, which every build makes anew), so every
 * ride starts with no secrets found.
 */

export interface Secrets {
  kodama: boolean;
  foxsquirrel: boolean;
  calcifer: boolean;
  noFace: boolean;
  /** Howl's castle, handed over by the meadow set so the home set can walk it over the hills at dawn */
  howlCastle: HowlCastle | null;
  /** and the castle's chimney smoke */
  howlSmoke: Smoke | null;
}

const all = new WeakMap<object, Secrets>();

/** This ride's secrets (shared by every set of one built world). */
export function secretsOf(ctx: SetContext): Secrets {
  let s = all.get(ctx.mount);
  if (!s) { s = { kodama: false, foxsquirrel: false, calcifer: false, noFace: false, howlCastle: null, howlSmoke: null }; all.set(ctx.mount, s); }
  return s;
}

/** The ride's base speed in units per second (BuiltWorld.speed in DreamWorld.ts). */
const BASE_SPEED = 14;

/**
 * A `SubjectSpec.cue` for a moment that happens when the rider reaches `z`: true while the rider is within
 * about `seconds` of it at the ride's normal pace. The rider's z is read from the vehicle, which the ride
 * places on the path every frame.
 */
export function momentCue(ctx: SetContext, z: number, seconds = 1.5) {
  const z0 = z + seconds * BASE_SPEED * speedAtZ(z);
  return () => { const rz = ctx.vehicle.position.z; return rz <= z0 && rz > z; };
}
