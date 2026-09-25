import * as THREE from 'three';
import { clamp, damp, deg } from '../engine/math';
import type { Input } from '../engine/Input';

/**
 * First-person camera bolted to the vehicle's anchor with free yaw/pitch look and zoom.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0; pitch = 0;
  yawT = 0; pitchT = 0;
  private keyVelYaw = 0; private keyVelPitch = 0;
  fovBase: number;
  fovT: number;
  fov: number;
  yawLimit = deg(172);
  pitchMin = deg(-55);
  pitchMax = deg(65);
  sensitivity = 0.0022;
  private shakeAmt = 0;
  private sway = 0;
  private tmpQ = new THREE.Quaternion();
  private eul = new THREE.Euler();
  private anchorQ = new THREE.Quaternion();
  private anchorP = new THREE.Vector3();
  invertY = false;

  constructor(fov: number, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 2500);
    this.fovBase = fov; this.fovT = fov; this.fov = fov;
  }

  get zoomLevel() { return this.fovBase / this.fov; }

  /** 0 = widest, 1 = fully zoomed */
  get zoom01() { return clamp((this.fovBase - this.fov) / (this.fovBase - this.fovBase / 3.2), 0, 1); }

  update(dt: number, input: Input, anchor: THREE.Object3D, time: number) {
    const look = input.consume();
    const zoomScale = this.fov / this.fovBase; // slower look when zoomed
    this.yawT -= look.dx * this.sensitivity * zoomScale;
    this.pitchT -= look.dy * this.sensitivity * zoomScale * (this.invertY ? -1 : 1);
    // keyboard look
    const kx = (input.down('ArrowRight') || input.down('KeyD') ? 1 : 0) - (input.down('ArrowLeft') || input.down('KeyA') ? 1 : 0);
    const ky = (input.down('ArrowUp') || input.down('KeyW') ? 1 : 0) - (input.down('ArrowDown') || input.down('KeyS') ? 1 : 0);
    this.keyVelYaw = damp(this.keyVelYaw, -kx * 1.9 * zoomScale, 8, dt);
    this.keyVelPitch = damp(this.keyVelPitch, ky * 1.4 * zoomScale, 8, dt);
    this.yawT += this.keyVelYaw * dt;
    this.pitchT += this.keyVelPitch * dt;
    this.yawT = clamp(this.yawT, -this.yawLimit, this.yawLimit);
    this.pitchT = clamp(this.pitchT, this.pitchMin, this.pitchMax);
    // zoom via wheel or held key
    if (look.wheel !== 0) this.fovT = clamp(this.fovT + look.wheel * 0.09, this.fovBase / 3.2, this.fovBase);
    if (input.down('KeyZ') || input.down('ShiftRight')) this.fovT = clamp(this.fovT - 90 * dt, this.fovBase / 3.2, this.fovBase);
    else if (input.down('KeyX')) this.fovT = clamp(this.fovT + 90 * dt, this.fovBase / 3.2, this.fovBase);

    this.yaw = damp(this.yaw, this.yawT, 14, dt);
    this.pitch = damp(this.pitch, this.pitchT, 14, dt);
    this.fov = damp(this.fov, this.fovT, 10, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }

    anchor.updateWorldMatrix(true, false);
    anchor.matrixWorld.decompose(this.anchorP, this.anchorQ, new THREE.Vector3());
    // gentle vehicle sway on top of the anchor
    this.sway = Math.sin(time * 1.7) * 0.004 + Math.sin(time * 2.9 + 1.0) * 0.003;
    this.shakeAmt = damp(this.shakeAmt, 0, 9, dt);
    const shakeX = (Math.random() - 0.5) * this.shakeAmt;
    const shakeY = (Math.random() - 0.5) * this.shakeAmt;
    this.eul.set(this.pitch + this.sway + shakeY, this.yaw + shakeX, this.sway * 0.6, 'YXZ');
    this.tmpQ.setFromEuler(this.eul);
    this.camera.quaternion.copy(this.anchorQ).multiply(this.tmpQ);
    this.camera.position.copy(this.anchorP);
    this.camera.position.y += Math.sin(time * 2.3) * 0.02;
  }

  shake(amount = 0.01) { this.shakeAmt = amount; }
  resetLook() { this.yaw = this.yawT = 0; this.pitch = this.pitchT = 0; }
}
