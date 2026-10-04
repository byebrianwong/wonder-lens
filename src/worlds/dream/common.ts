import * as THREE from 'three';
import type { RideState } from '../../game/types';
import type { Subject } from '../../game/Subject';
import type { Rng } from '../../engine/math';
import type { LightPool } from '../amelie/lens';
import type { Road, SetId } from './layout';
import type { CatbusMount } from './mount';

/*
 * The contract between "Catbus to Anywhere" and its scenes (sets). The scene framework is the one the
 * Amélie world uses (see WORLD_GUIDE.md); its general helpers are re-exported here so the sets import
 * from one place.
 */

export const FILMS = {
  totoro: 'My Neighbor Totoro',
  mononoke: 'Princess Mononoke',
  kiki: "Kiki's Delivery Service",
  laputa: 'Castle in the Sky',
  howl: "Howl's Moving Castle",
  spirited: 'Spirited Away',
  ponyo: 'Ponyo',
};

/**
 * Screen effects a set may ask for this frame. The world takes the strongest request of each kind and
 * draws it over everything (see `Lens` in ../amelie/lens.ts).
 */
export interface ScreenFx {
  /** a flash towards `color` (0..1.5; above 1 it blooms): lightning, a burst of light */
  flash(amount: number, color?: THREE.ColorRepresentation): void;
  /** a flat colour over the whole picture (0..1): mist, cloud, a paper storm */
  wash(amount: number, color?: THREE.ColorRepresentation): void;
}

/** What every set builder receives. */
export interface SetContext {
  rng: Rng;
  road: Road;
  /** four point lights shared by every scene (no light is ever added or hidden mid-ride) */
  lights: LightPool;
  camera: THREE.Camera;
  lowDetail: boolean;
  /** the scene itself, for the rare thing that must live outside the set's group */
  scene: THREE.Scene;
  /** the Catbus the rider sits on: seats for passengers, where its head looks */
  mount: CatbusMount;
  fx: ScreenFx;
  /**
   * The group the ride moves along the path. When a set's update runs, it is already placed, banked and
   * bobbing for this frame, so a set can place things relative to it (Haku under the rider).
   * `vehicle.userData.unbanked` holds its rotation before the bank (a THREE.Quaternion).
   */
  vehicle: THREE.Object3D;
}

/** One scene of the ride. */
export interface BuiltSet {
  id: SetId;
  group: THREE.Group;
  /** the set is drawn while the ride's progress is inside this range */
  show: [number, number];
  /** large meshes (or invisible box proxies) that can hide a subject from the camera */
  occluders: THREE.Object3D[];
  subjects: Subject[];
  /** height of the solid ground under a point, for thrown items, inside this set */
  floor(x: number, z: number): number;
  /** height of the water surface in this set, or -Infinity where there is none */
  water: number;
  /** called every frame while the set is shown (while it is hidden, the world switches its subjects off) */
  update(dt: number, t: number, ride: RideState): void;
  /** the ocarina was played: set-wide reactions (subjects handle their own) */
  onCall?(ride: RideState): void;
  /** a thrown item came down at `pos` (after subjects have had their chance to react) */
  onItemLand?(pos: THREE.Vector3): void;
  /** extra up-and-down jolt for the mount at a z (steps, a bumpy root), in units; 0 when smooth */
  bump?(z: number): number;
}

export { subCurve, ribbon, wallStrip, setActive, forwardOf, shadows, place, optimize, boxProxy, explodeGroups, gatherInstances } from '../amelie/common';
export { Lens, LightPool, lightShaft, cue, type LightSpot } from '../amelie/lens';

/** Is `z` inside the set's stretch (z0 > z >= z1)? */
export const inZ = (z: number, r: { z0: number; z1: number }) => z <= r.z0 && z > r.z1;

/** The ride progress range [u0, u1] in which a set should be drawn: its own z range, widened by `before` and `after` units. */
export function showRange(road: Road, r: { z0: number; z1: number }, before = 60, after = 20): [number, number] {
  return [road.u(r.z0 + before), road.u(r.z1 - after)];
}

/** A small, cheap per-frame vector pool, so update loops do not allocate. */
export const V = () => new THREE.Vector3();
