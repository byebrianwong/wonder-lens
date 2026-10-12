import * as THREE from 'three';
import type { AmbienceProfile, AudioEngine, EnvLevels } from '../engine/Audio';
import type { Sky } from '../engine/Sky';
import type { Subject } from './Subject';

export interface RideState {
  /** progress 0..1 along the path */
  u: number;
  /** distance travelled */
  s: number;
  /** current speed multiplier relative to base */
  speedMult: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  /** seconds since the ride started */
  time: number;
}

export interface LightingState {
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyBottom: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  stars: number;
  moon: number;
  exposure: number;
  bloom: number;
  saturation: number;
  tint: THREE.Color;
  sunGlow: number;
  sunSize: number;
  horizonHeight: number;
  /** strength of drifting cloud shadows on the ground, 0..1 */
  cloudShadow: number;
}

export interface WorldContext {
  audio: AudioEngine;
  camera: THREE.PerspectiveCamera;
  /** true when running the low-detail profile */
  lowDetail: boolean;
  /**
   * Optional, set only by Storybook's ride views: the index of the caption the view will be parked just after.
   * A large world may skip building the parts of the ride far from it, so the view loads faster. The game
   * never sets it.
   */
  focusCaption?: number;
}

export interface BuiltWorld {
  scene: THREE.Scene;
  curve: THREE.CatmullRomCurve3;
  /** base speed in units per second */
  speed: number;
  vehicle: THREE.Group;
  cameraAnchor: THREE.Object3D;
  subjects: Subject[];
  /** large meshes that can hide a subject from the camera */
  occluders: THREE.Object3D[];
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  lighting(u: number, out: LightingState): void;
  env(u: number): Partial<EnvLevels>;
  ambience: AmbienceProfile;
  /** ground height under a point, used for thrown items */
  groundHeight(x: number, z: number): number;
  /** water level or -Infinity */
  waterLevel: number;
  makeProjectile(): THREE.Object3D;
  update(dt: number, ride: RideState): void;
  onItemLand(pos: THREE.Vector3): void;
  onCall(pos: THREE.Vector3, ride: RideState): void;
  /** text shown at story beats: [u, text] */
  captions: Array<[number, string]>;
  /**
   * Optional: when the rider turns to look behind, the camera leans out over the side by `out` units and
   * rises by `up`, so the vehicle hides less of the view. The lean starts once the turn passes `from`
   * radians (default 1.4) and is full at the turn limit.
   */
  lookBackLean?: { out: number; up: number; from?: number };
  /**
   * Optional: a speed multiplier along the ride (u in 0..1), on top of `speed` and the rider's own faster or
   * slower. Below 1 the ride lingers (a small room, a character worth watching); above 1 it rushes (a flight).
   * Keep it between about 0.4 and 1.6, and change it gently: the ride eases towards it, but a sudden step
   * still reads as a jolt.
   */
  speedAt?(u: number): number;
  /**
   * Optional: how loud the vehicle's own sound is along the ride (0..1, default 1), for a world whose rider
   * changes vehicle (the train's clatter stops while the rider is on a toboggan).
   */
  vehicleAt?(u: number): number;
  /**
   * Optional: famous shots from the films. A photo that matches one gets a "Film still" bonus, and the
   * photo book lists each still with a hint until it has been matched.
   */
  filmStills?: FilmStill[];
  dispose(): void;
}

/**
 * A famous frame from a film that the rider can recreate. A photo matches when every listed subject is in
 * it and every optional condition holds. The first subject in `subjects` is the main one.
 */
export interface FilmStill {
  id: string;
  /** the still's name, shown as the bonus and in the photo book, for example 'The Catbus arrives' */
  name: string;
  /** the film it is from */
  from: string;
  /** where and when to look, shown in the photo book until the still is matched */
  hint: string;
  /** points added to the photo when it matches */
  bonus: number;
  /** ids of subjects that must all be in the photo */
  subjects: string[];
  /** the pose the main subject must be in */
  pose?: string;
  /** range of the main subject's size in the frame, as a share of the frame height (SubjectShot.size) */
  size?: [number, number];
  /** stretch of the ride (u, 0..1) the photo must be taken in */
  u?: [number, number];
  /** any further test, for example that the camera looks up at the subject */
  test?: (photo: import('./Photo').PhotoResult, camera: THREE.PerspectiveCamera) => boolean;
}

export interface WorldDef {
  id: string;
  title: string;
  subtitle: string;
  blurb: string;
  vehicleName: string;
  itemName: string;
  callName: string;
  callKind: 'ocarina' | 'whistle' | 'accordion';
  accent: string;
  accent2: string;
  /** camera field of view default */
  fov: number;
  build(ctx: WorldContext): BuiltWorld;
}
