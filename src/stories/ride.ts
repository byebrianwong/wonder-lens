import * as THREE from 'three';
import { Renderer } from '../engine/Renderer';
import { AudioEngine } from '../engine/Audio';
import type { Input } from '../engine/Input';
import { CameraRig } from '../game/CameraRig';
import { Ride } from '../game/Ride';
import { applyLighting, emptyLightingState } from '../game/lighting';
import type { BuiltWorld, WorldDef } from '../game/types';
import { holdStage, releaseStage, STAGE_SIZE, STEP } from './stage';

/*
 * A whole world, seen from the rider's seat at one point on the ride.
 *
 * This runs the same pieces as Game.ts (world, ride, camera rig, lighting) but with no
 * player, no sound and no clock: the ride is parked at a fixed spot, the world runs for a
 * fixed number of 1/60 s steps so animals and weather settle, and one frame is drawn.
 */

export interface RideViewOptions {
  /** index into the world's `captions`; the ride parks just after that story beat */
  beat: number;
  /** how far past the beat to park, as a fraction of the ride */
  after?: number;
  /** seconds the world runs before the picture */
  settle?: number;
}

const drawn = new WeakMap<HTMLElement, Promise<void>>();

/** Resolves once a ride view's canvas has its picture. Stories await this in `play`, and Chromatic waits for `play`. */
export function whenDrawn(root: HTMLElement): Promise<void> {
  const canvas = root.querySelector('canvas');
  return (canvas && drawn.get(canvas)) || Promise.resolve();
}

/** An input that never has anything pressed, for the camera rig. */
const stillInput = { consume: () => ({ dx: 0, dy: 0, wheel: 0 }), down: () => false } as unknown as Input;

export function rideView(def: WorldDef, o: RideViewOptions): HTMLElement {
  releaseStage();
  const canvas = document.createElement('canvas');
  canvas.style.width = `${STAGE_SIZE.width}px`;
  canvas.style.height = `${STAGE_SIZE.height}px`;
  canvas.style.display = 'block';
  const renderer = new Renderer(canvas, { size: STAGE_SIZE, pixelRatio: 1, preserveDrawingBuffer: true });

  const rig = new CameraRig(def.fov, renderer.aspect);
  const audio = new AudioEngine(); // never started, so it makes no sound
  const world = def.build({ audio, camera: rig.camera, lowDetail: false });
  const ride = new Ride(world.curve, world.speed, world.vehicle);
  const beat = world.captions[Math.min(o.beat, world.captions.length - 1)];
  const u = Math.min(0.995, beat[0] + (o.after ?? 0.012));
  ride.speedTarget = 0; // parked
  ride.state.s = ride.length * u;

  const light = emptyLightingState();
  let t = 0;
  const step = () => {
    t += STEP;
    ride.update(STEP);
    world.update(STEP, ride.state);
    for (const s of world.subjects) s.update(STEP, ride.state);
    rig.update(STEP, stillInput, world.cameraAnchor, t);
    world.lighting(ride.state.u, light);
    applyLighting(light, world, renderer, ride.state.position);
    world.sky.update(rig.camera.position, t);
  };
  step();
  aimAtSubject(world, rig);
  const steps = Math.round((o.settle ?? 1) / STEP);
  for (let i = 1; i < steps; i++) step();

  renderer.setScene(world.scene, rig.camera);
  // The first frame compiles every shader, which takes seconds in a software renderer.
  // Draw it after the story has rendered, so it counts against the play step's time instead.
  let disposed = false;
  drawn.set(canvas, new Promise<void>((resolve) => setTimeout(() => { if (!disposed) renderer.render(t); resolve(); }, 0)));

  holdStage(() => { disposed = true; world.dispose(); renderer.dispose(); });
  return canvas;
}

/**
 * Turn the camera toward the most interesting subject ahead, scored the way the game's idle
 * "tour guide" camera does (Game.autoCamera), so each picture has something in it.
 * Unlike the game, it ignores anything more than 75 degrees off the direction of travel:
 * from a parked vehicle those views are mostly the vehicle's own walls.
 */
function aimAtSubject(world: BuiltWorld, rig: CameraRig) {
  const cam = rig.camera;
  const toLocal = world.cameraAnchor.getWorldQuaternion(new THREE.Quaternion()).invert();
  const p = new THREE.Vector3();
  let best: { yaw: number; pitch: number } | null = null;
  let bestScore = 0;
  for (const s of world.subjects) {
    if (!s.active) continue;
    s.center(p);
    const d = p.distanceTo(cam.position);
    if (d > Math.min(s.maxDistance * 0.7, 150) || d < 7) continue;
    const local = p.sub(cam.position).applyQuaternion(toLocal);
    const yaw = Math.atan2(-local.x, -local.z);
    if (Math.abs(yaw) > THREE.MathUtils.degToRad(75)) continue;
    const score = (s.base / 1000) * (1 - d / 160);
    if (score > bestScore) { bestScore = score; best = { yaw, pitch: Math.atan2(local.y, Math.hypot(local.x, local.z)) }; }
  }
  if (!best) return;
  rig.yaw = rig.yawT = best.yaw;
  rig.pitch = rig.pitchT = THREE.MathUtils.clamp(best.pitch, rig.pitchMin, rig.pitchMax);
}
