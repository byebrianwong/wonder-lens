import * as THREE from 'three';
import { clamp, damp, smoothstep } from '../engine/math';
import type { RideState } from './types';

/**
 * Moves the vehicle along the world's spline at a steady pace.
 * Speed eases in at the start and out at the end; the player can push it faster or slower.
 */
export class Ride {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  readonly baseSpeed: number;
  readonly state: RideState;
  speedTarget = 1;
  private speedMult = 0;
  private up = new THREE.Vector3(0, 1, 0);
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private tangentAhead = new THREE.Vector3();
  private roll = 0;
  finished = false;
  /** the object that moves along the track */
  vehicle: THREE.Object3D;

  constructor(curve: THREE.CatmullRomCurve3, baseSpeed: number, vehicle: THREE.Object3D) {
    this.curve = curve;
    this.curve.arcLengthDivisions = 4000;
    this.length = curve.getLength();
    this.baseSpeed = baseSpeed;
    this.vehicle = vehicle;
    this.state = { u: 0, s: 0, speedMult: 0, position: new THREE.Vector3(), tangent: new THREE.Vector3(0, 0, -1), time: 0 };
    this.place(0);
  }

  get u() { return this.state.u; }

  update(dt: number) {
    if (this.finished) return;
    const st = this.state;
    st.time += dt;
    // ease in over the first 4 seconds; slow to a gentle roll over the last 30 units, then stop
    const startEase = smoothstep(0, 4, st.time);
    const remaining = this.length - st.s;
    const endEase = clamp(remaining / 30, 0.3, 1);
    const target = this.speedTarget * startEase * endEase;
    this.speedMult = damp(this.speedMult, target, 1.6, dt);
    st.speedMult = this.speedMult;
    st.s += this.baseSpeed * this.speedMult * dt;
    if (st.s >= this.length - 0.6) { st.s = this.length - 0.6; this.finished = true; this.speedMult = 0; st.speedMult = 0; }
    this.place(st.s / this.length, dt);
  }

  private place(u: number, dt = 0.016) {
    const st = this.state;
    st.u = u;
    this.curve.getPointAt(u, st.position);
    this.curve.getTangentAt(u, st.tangent);
    // banking: compare heading a little ahead
    const uAhead = clamp(u + 0.004, 0, 1);
    this.curve.getTangentAt(uAhead, this.tangentAhead);
    const turn = st.tangent.x * this.tangentAhead.z - st.tangent.z * this.tangentAhead.x; // y of cross
    const targetRoll = clamp(turn * 18, -0.12, 0.12);
    this.roll = damp(this.roll, targetRoll, 3, dt);
    const flatT = new THREE.Vector3(st.tangent.x, st.tangent.y * 0.35, st.tangent.z).normalize();
    this.m.lookAt(new THREE.Vector3(), flatT.clone().negate(), this.up);
    this.q.setFromRotationMatrix(this.m);
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll);
    this.q.multiply(rollQ);
    this.vehicle.position.copy(st.position);
    this.vehicle.quaternion.copy(this.q);
  }
}
