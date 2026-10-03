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
  dispose(): void;
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
