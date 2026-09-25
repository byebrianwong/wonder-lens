import * as THREE from 'three';
import type { RideState } from './types';

export interface PoseDef { label: string; mult: number; }
export type Rarity = 'common' | 'rare' | 'legendary';

export interface SubjectSpec {
  id: string;
  name: string;
  /** which film they are from */
  from: string;
  group: THREE.Object3D;
  /** approximate radius for framing */
  radius: number;
  /** base points */
  base: number;
  rarity?: Rarity;
  /** shown in the field guide */
  hint?: string;
  poses?: Record<string, PoseDef>;
  /** local-space offset of the photographic centre */
  centerOffset?: THREE.Vector3;
  /** returns world-space forward direction, used for the facing bonus */
  facing?: () => THREE.Vector3;
  /** reaction when an item lands within `dist`; return true if it reacted */
  onItem?: (pos: THREE.Vector3, dist: number) => boolean;
  /** reaction to the call; return true if it reacted */
  onCall?: (dist: number) => boolean;
  update?: (dt: number, ride: RideState) => void;
  /** max distance at which a photo of it counts */
  maxDistance?: number;
  /** distance within which item / call reactions trigger */
  reactRange?: number;
}

const tmp = new THREE.Vector3();

export class Subject {
  readonly id: string;
  readonly name: string;
  readonly from: string;
  readonly group: THREE.Object3D;
  readonly radius: number;
  readonly base: number;
  readonly rarity: Rarity;
  readonly hint: string;
  readonly poses: Record<string, PoseDef>;
  readonly maxDistance: number;
  readonly reactRange: number;
  pose = 'idle';
  poseTimer = 0;
  private centerOffset: THREE.Vector3;
  private spec: SubjectSpec;
  /** last frame's screen visibility, used by the HUD to show names */
  visible = false;
  /** set by the world when the subject is active in the scene */
  active = true;

  constructor(spec: SubjectSpec) {
    this.spec = spec;
    this.id = spec.id; this.name = spec.name; this.from = spec.from; this.group = spec.group;
    this.radius = spec.radius; this.base = spec.base; this.rarity = spec.rarity ?? 'common';
    this.hint = spec.hint ?? '';
    this.poses = { idle: { label: '', mult: 1 }, ...(spec.poses ?? {}) };
    this.centerOffset = spec.centerOffset ?? new THREE.Vector3();
    this.maxDistance = spec.maxDistance ?? 220;
    this.reactRange = spec.reactRange ?? 14;
  }

  center(out = new THREE.Vector3()) {
    this.group.updateWorldMatrix(true, false);
    return out.copy(this.centerOffset).applyMatrix4(this.group.matrixWorld);
  }
  facing(): THREE.Vector3 | null {
    if (this.spec.facing) return this.spec.facing();
    return null;
  }
  setPose(name: string, seconds = 0) {
    if (!this.poses[name]) return;
    this.pose = name;
    this.poseTimer = seconds;
  }
  get poseMult() { return this.poses[this.pose]?.mult ?? 1; }
  get poseLabel() { return this.poses[this.pose]?.label ?? ''; }

  update(dt: number, ride: RideState) {
    if (this.poseTimer > 0) {
      this.poseTimer -= dt;
      if (this.poseTimer <= 0) { this.poseTimer = 0; this.pose = 'idle'; }
    }
    this.spec.update?.(dt, ride);
  }
  tryItem(pos: THREE.Vector3): boolean {
    if (!this.active || !this.spec.onItem) return false;
    const d = this.center(tmp).distanceTo(pos);
    if (d > this.reactRange) return false;
    return this.spec.onItem(pos, d);
  }
  tryCall(from: THREE.Vector3, range: number): boolean {
    if (!this.active || !this.spec.onCall) return false;
    const d = this.center(tmp).distanceTo(from);
    if (d > range) return false;
    return this.spec.onCall(d);
  }
}
