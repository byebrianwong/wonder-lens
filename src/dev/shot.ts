import * as THREE from 'three';
import { Renderer } from '../engine/Renderer';
import { AudioEngine } from '../engine/Audio';
import type { Input } from '../engine/Input';
import { CameraRig } from '../game/CameraRig';
import { Ride } from '../game/Ride';
import { applyLighting, emptyLightingState } from '../game/lighting';
import { WORLDS } from '../worlds';
import { captionIndexAtZ, makeCurve } from '../worlds/anderson/layout';

/*
 * Dev-only snapshot page: open /shot.html while the dev server runs. It builds a world, parks the ride at one
 * point, runs it for a few seconds and draws one frame, then sets `window.__done` to the build time, draw
 * calls, triangles, active subjects and caption. scripts/shoot.mjs drives it from Playwright and saves PNGs.
 * Params:
 *  w=<world id>  u=<0..1> | z=<z on path> | beat=<caption index>&after=<du>
 *  yaw, pitch (degrees, relative to the rider's view), settle (s), fov
 *  cam=x,y,z&look=x,y,z (free camera instead of the rider's seat)
 *  W, H (pixels); act=<fn name on window> optional
 */
const q = new URLSearchParams(location.search);
const W = +(q.get('W') ?? 1280), H = +(q.get('H') ?? 720);
const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
const renderer = new Renderer(canvas, { size: { width: W, height: H }, pixelRatio: 1, preserveDrawingBuffer: true });
const def = WORLDS.find((w) => w.id === (q.get('w') ?? 'anderson'))!;
const rig = new CameraRig(+(q.get('fov') ?? def.fov), renderer.aspect);
const audio = new AudioEngine();
const t0 = performance.now();
let focusCaption = q.has('beat') ? +q.get('beat')! : undefined;
if (def.id === 'anderson' && focusCaption === undefined && q.get('all') !== '1') {
  if (q.has('z')) focusCaption = captionIndexAtZ(+q.get('z')!);
  else if (q.has('u')) focusCaption = captionIndexAtZ(makeCurve().getPointAt(+q.get('u')!).z);
}
const world = def.build({ audio, camera: rig.camera, lowDetail: false, focusCaption });
const buildMs = performance.now() - t0;
const ride = new Ride(world.curve, world.speed, world.vehicle);
if (world.speedAt) ride.profile = world.speedAt.bind(world);
let u = 0;
if (q.has('u')) u = +q.get('u')!;
else if (q.has('beat')) u = world.captions[+q.get('beat')!][0] + +(q.get('after') ?? 0.012);
else if (q.has('z')) {
  const z = +q.get('z')!;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (world.curve.getPointAt(m).z > z) lo = m; else hi = m; }
  u = (lo + hi) / 2;
}
const settle = +(q.get('settle') ?? 1);
const moving = q.get('moving') === '1';
const STEP = 1 / 60;
const still = { consume: () => ({ dx: 0, dy: 0, wheel: 0 }), down: () => false } as unknown as Input;
// back the ride up so it arrives at u after `settle` seconds when moving
ride.speedTarget = moving ? 1 : 0;
ride.state.s = ride.length * u - (moving ? world.speed * settle : 0);
ride.state.time = moving ? 10 : 0;
rig.yaw = rig.yawT = THREE.MathUtils.degToRad(+(q.get('yaw') ?? 0));
rig.pitch = rig.pitchT = THREE.MathUtils.degToRad(+(q.get('pitch') ?? 0));
const light = emptyLightingState();
let t = 0;
const free = q.get('cam');
const step = () => {
  t += STEP;
  ride.update(STEP);
  world.update(STEP, ride.state);
  for (const s of world.subjects) s.update(STEP, ride.state);
  rig.update(STEP, still, world.cameraAnchor, t);
  if (free) {
    const [x, y, z] = free.split(',').map(Number);
    rig.camera.position.set(x, y, z);
    const [lx, ly, lz] = (q.get('look') ?? '0,0,0').split(',').map(Number);
    rig.camera.lookAt(lx, ly, lz);
  }
  world.lighting(ride.state.u, light);
  applyLighting(light, world, renderer, free ? rig.camera.position : ride.state.position);
  world.sky.update(rig.camera.position, t);
};
const steps = Math.max(1, Math.round(settle / STEP));
for (let i = 0; i < steps; i++) step();
renderer.setScene(world.scene, rig.camera);
setTimeout(() => {
  // count what the scene itself costs (the composer's passes would hide it)
  const gl = renderer.renderer;
  gl.info.autoReset = false; gl.info.reset();
  gl.render(world.scene, rig.camera);
  const info = { render: { calls: gl.info.render.calls, triangles: gl.info.render.triangles } };
  gl.info.autoReset = true;
  const r0 = performance.now();
  renderer.render(t);
  (window as unknown as { __done: unknown }).__done = {
    buildMs: Math.round(buildMs), renderMs: Math.round(performance.now() - r0), u: ride.state.u, z: ride.state.position.z,
    calls: info.render.calls, tris: info.render.triangles, active: world.subjects.filter((s) => s.active).map((s) => s.id).join(','),
    caption: world.captions.filter((c) => c[0] <= ride.state.u).pop()?.[1],
  };
}, 0);
