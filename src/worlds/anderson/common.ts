import * as THREE from 'three';
import type { RideState } from '../../game/types';
import type { Subject } from '../../game/Subject';
import type { LightKey } from '../../game/lighting';
import type { EnvLevels } from '../../engine/Audio';
import { Rng } from '../../engine/math';
import type { LightPool } from '../amelie/lens';
import type { Road, SetId } from './layout';

export type { Road, SetId };

/*
 * The contract between the Zubrowka Express and its scenes (sets). The scene framework is the one the Amélie
 * world and Catbus to Anywhere use (see WORLD_GUIDE.md); its general helpers are re-exported here so the
 * sets import from one place.
 */

export const FILMS = {
  gbh: 'The Grand Budapest Hotel',
  fox: 'Fantastic Mr. Fox',
  moonrise: 'Moonrise Kingdom',
  asteroid: 'Asteroid City',
  isle: 'Isle of Dogs',
  aquatic: 'The Life Aquatic with Steve Zissou',
  darjeeling: 'The Darjeeling Limited',
  tenenbaums: 'The Royal Tenenbaums',
  dispatch: 'The French Dispatch',
};

/**
 * Screen effects a set may ask for this frame. The world takes the strongest request of each kind and
 * draws it over everything (see `FilmLens` in film.ts).
 */
export interface ScreenFx {
  /** a flash towards `color` (0..1.5; above 1 it blooms): lightning, a flashbulb */
  flash(amount: number, color?: THREE.ColorRepresentation): void;
  /** a flat colour over the whole picture (0..1) */
  wash(amount: number, color?: THREE.ColorRepresentation): void;
}

/**
 * A camera move a set may ask for this frame, added to the rider's seat: an offset in the mount's own space
 * (x right, y up, z forward), and extra pitch, yaw and roll in radians. The world resets it every frame
 * before the sets update. The rider can still look around within it.
 */
export interface Shot { offset: THREE.Vector3; pitch: number; yaw: number; roll: number }

/**
 * Something the rider rides on for part of the route instead of the train: the funicular car, the pastry box,
 * the toboggan, the trash gondola, the Deep Search. The world shows it, hides the train, and puts the camera
 * in its seat while the ride is inside [z0, z1). Mount changes should happen while the screen is covered or
 * where the change makes sense on screen (stepping from the platform into the funicular car).
 */
export interface MountDef {
  kind: 'funicular' | 'box' | 'sled' | 'gondola' | 'sub';
  /** the model; its origin sits on the path, local +z points along the direction of travel */
  group: THREE.Group;
  /** the camera's place in the model's own space (eye height about 1.5-2.4 above the origin) */
  seat: THREE.Vector3;
  z0: number;
  z1: number;
  /**
   * How much of the path's slope the model takes (0..1). The ride keeps the camera nearly level on slopes;
   * a toboggan should tilt with the run (1), a funicular car stays level (0).
   */
  tilt?: number;
  /** largest bank into turns, in radians (0 = none) */
  bank?: number;
  /** called every frame while this is the mount, after the world has placed it */
  update?(dt: number, t: number, ride: RideState): void;
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
  fx: ScreenFx;
  shot: Shot;
  /**
   * The group the ride moves along the path. When a set's update runs, it is already placed and banked for
   * this frame, so a set can place things relative to it (a passenger that rides along).
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
  /** the whistle was blown: set-wide reactions (subjects handle their own) */
  onCall?(ride: RideState): void;
  /** a thrown item came down at `pos` (after subjects have had their chance to react) */
  onItemLand?(pos: THREE.Vector3): void;
  /** extra up-and-down jolt for the mount at a z (steps, rough ice), in units; 0 when smooth */
  bump?(z: number): number;
  /** mounts this set supplies for parts of its stretch */
  mounts?: MountDef[];
}

/**
 * Lighting for a stretch of the ride, keyed by z instead of ride progress (the world converts). Each set
 * exports its own keys; keep the first key at or just after the set's start and give the light time to
 * change while a cover hides the join.
 */
export type ZLightKey = Omit<LightKey, 'u'> & { z: number };

/** Ambient sound levels for a set, by z (only asked while the ride is inside the set). */
export type SetEnv = (z: number) => Partial<EnvLevels>;

/** A set's whole module: the builder, its light and its sound. */
export interface SetModule { build(ctx: SetContext): BuiltSet; lights: ZLightKey[]; env?: SetEnv }

export { subCurve, ribbon, wallStrip, setActive, forwardOf, shadows, place, optimize, boxProxy, explodeGroups, gatherInstances } from '../amelie/common';
export { LightPool, lightShaft, cue, type LightSpot } from '../amelie/lens';

/** Is `z` inside the set's stretch (z0 >= z > z1)? */
export const inZ = (z: number, r: { z0: number; z1: number }) => z <= r.z0 && z > r.z1;

/** The ride progress range [u0, u1] in which a set should be drawn: its own z range, widened by `before` and `after` units. */
export function showRange(road: Road, r: { z0: number; z1: number }, before = 60, after = 20): [number, number] {
  return [road.u(r.z0 + before), road.u(r.z1 - after)];
}

/**
 * A weight that is 0 outside [a, d] and 1 inside [b, c], easing between, for z running down the ride
 * (a > b > c > d). For timed things keyed to the rider's z.
 */
export function zWindow(z: number, a: number, b: number, c: number, d: number) {
  if (z > a || z < d) return 0;
  if (z > b) return smooth((a - z) / (a - b));
  if (z >= c) return 1;
  return 1 - smooth((c - z) / (c - d));
}
const smooth = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/** A placeholder set: an empty stretch with a floor at the path's height. */
export function emptySet(id: SetId, ctx: SetContext, r: { z0: number; z1: number }): BuiltSet {
  return {
    id, group: new THREE.Group(), show: showRange(ctx.road, r), occluders: [], subjects: [], water: -Infinity,
    floor: (_x, z) => ctx.road.at(z).y - 0.5,
    update() { /* nothing yet */ },
  };
}
