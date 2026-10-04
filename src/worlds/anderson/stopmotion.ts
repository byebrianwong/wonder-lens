import * as THREE from 'three';
import { Rng } from '../../engine/math';

/**
 * Stop-motion, as in Fantastic Mr. Fox and Isle of Dogs: the puppets move "on twos", holding each pose for
 * two film frames (12 poses a second), and their fur "boils" because the animators' fingers moved it a
 * little between frames.
 *
 *   const sm = new StopMotion(12, seed);
 *   update(dt, t) {
 *     if (!sm.tick(dt)) return;    // hold the pose between steps
 *     pose(sm.t);                  // animate with the stepped clock
 *     sm.boil(furMaterials);       // nudge the fur
 *   }
 *
 * Use it only for the puppet characters. The rider's camera, the vehicle, water and particles stay smooth,
 * which is how the films look too (the camera moves smoothly over a stepped puppet).
 */
export class StopMotion {
  /** the stepped clock: time as of the last pose step */
  t = 0;
  /** seconds of real time the puppet has been running */
  private clock = 0;
  private acc = 0;
  private step: number;
  private rng: Rng;
  /** how far a boiling texture moves per step, in UV units */
  boilAmount = 0.004;

  constructor(fps = 12, seed = 1) {
    this.step = 1 / fps;
    this.rng = new Rng(seed);
  }

  /** Advance by dt; true when a new pose should be drawn this frame. */
  tick(dt: number) {
    this.clock += dt;
    this.acc += dt;
    if (this.acc < this.step) return false;
    this.acc %= this.step;
    this.t = this.clock;
    return true;
  }

  /** The time passed since the last step, so a reaction can start on a step (0 right after one). */
  get sinceStep() { return this.acc; }

  /** Nudge the maps of these materials a little, so fur and felt seem to be handled between frames. */
  boil(mats: Array<THREE.Material & { map?: THREE.Texture | null }>) {
    for (const m of mats) {
      const map = m.map;
      if (!map) continue;
      map.offset.set((this.rng.next() - 0.5) * this.boilAmount, (this.rng.next() - 0.5) * this.boilAmount);
    }
  }
}

/**
 * A texture of its own for a puppet that should boil: the material and its map are cloned (the picture is
 * shared, though the GPU holds one copy per clone), so its offset can move without moving everyone else's.
 * Use it for the few puppets seen close up.
 */
export function ownMap<T extends THREE.Material & { map?: THREE.Texture | null }>(mat: T): T {
  const m = mat.clone() as T;
  if (m.map) { m.map = m.map.clone(); m.map.needsUpdate = true; }
  return m;
}
