import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import isChromatic from 'chromatic/isChromatic';
import type { ArgTypes } from '@storybook/html-vite';
import { Renderer } from '../engine/Renderer';
import { Sky } from '../engine/Sky';
import { toon } from '../engine/Builders';
import { applyLighting, emptyLightingState, makeLighting, type LightKey } from '../game/lighting';

/*
 * A small 3D set for Storybook: one asset, a fixed camera, the game's own renderer and lighting.
 *
 * Every story must draw the same picture on every run, so the stage:
 * - renders at a fixed size and pixel ratio,
 * - steps any animation with a fixed 1/60 s time step for a set number of seconds, then renders once,
 * - never reads the clock.
 *
 * In Storybook on your own machine you can also drag to orbit and turn on "animate".
 * Chromatic never does either, so its snapshots stay still.
 */

export const STAGE_SIZE = { width: 960, height: 640 };

/** Lighting presets, taken from the Ghibli world's keys for morning, sunset and night. Cloud shadows are off. */
export const LIGHTS = {
  day: { u: 0, skyTop: 0x3b7fd8, skyMid: 0xa6d3f5, skyBottom: 0xeaf2f4, fog: 0xd6e6f0, fogDensity: 0.0021, sunDir: [0.45, 0.75, 0.35], sunColor: 0xfff4de, sunIntensity: 2.3, hemiSky: 0xbfe0ff, hemiGround: 0x6f8f5a, hemiIntensity: 0.8, exposure: 1.0, bloom: 0.3, saturation: 1.1 },
  dusk: { u: 0, skyTop: 0x5b6fb5, skyMid: 0xe8a878, skyBottom: 0xffcf95, fog: 0xe8bb95, fogDensity: 0.0028, sunDir: [0.9, 0.16, 0.3], sunColor: 0xffa060, sunIntensity: 1.7, hemiSky: 0xd0a0a0, hemiGround: 0x5a5a40, hemiIntensity: 0.7, exposure: 1.0, bloom: 0.4, saturation: 1.12 },
  night: { u: 0, skyTop: 0x0a1030, skyMid: 0x1a2a55, skyBottom: 0x34477a, fog: 0x1c2748, fogDensity: 0.0042, sunDir: [-0.4, 0.6, 0.6], sunColor: 0xb4c6ee, sunIntensity: 1.1, hemiSky: 0x4a5c92, hemiGround: 0x161c30, hemiIntensity: 0.95, stars: 1, moon: 1, exposure: 1.12, bloom: 0.6, saturation: 1.05, sunGlow: 0, sunSize: 0 },
} satisfies Record<string, LightKey>;

export type LightName = keyof typeof LIGHTS;

/** Settings a story can change. They also appear as Storybook controls. */
export interface StageArgs {
  light: LightName;
  /** camera angle around the asset in degrees; 0 looks at its front (+z) */
  yaw: number;
  /** camera height angle in degrees */
  pitch: number;
  /** 1 fits the asset in the frame; larger moves the camera back */
  distance: number;
  /** seconds of animation to run before the picture is taken */
  time: number;
  /** keep animating in the browser (never in Chromatic) */
  animate: boolean;
}

export const DEFAULT_ARGS: StageArgs = { light: 'day', yaw: 28, pitch: 12, distance: 1, time: 0, animate: false };

/** Storybook controls for StageArgs. */
export const STAGE_ARG_TYPES: Partial<ArgTypes<StageArgs>> = {
  light: { control: 'inline-radio', options: Object.keys(LIGHTS) },
  yaw: { control: { type: 'range', min: -180, max: 180, step: 1 } },
  pitch: { control: { type: 'range', min: -30, max: 85, step: 1 } },
  distance: { control: { type: 'range', min: 0.3, max: 4, step: 0.05 } },
  time: { control: { type: 'range', min: 0, max: 10, step: 0.1 } },
  animate: { control: 'boolean' },
};

export interface StageOptions extends Partial<StageArgs> {
  /** draw a ground disc under the asset (off for things that fly or float) */
  ground?: boolean | number;
  /** advance the asset's animation; called in fixed steps */
  update?: (dt: number, t: number) => void;
  /** frame this point instead of the asset's bounding-box centre */
  focus?: THREE.Vector3;
  /** frame a sphere of this radius instead of the asset's bounds */
  radius?: number;
  /** extra objects to put in the scene (lanterns, props) */
  extras?: THREE.Object3D[];
}

export const STEP = 1 / 60;

/*
 * A browser page can hold only a few WebGL contexts, so only one story keeps its renderer.
 * Each story frees the previous one before it creates its own.
 */
let current: (() => void) | null = null;
export function releaseStage() { current?.(); current = null; }
export function holdStage(dispose: () => void) { current = dispose; }

/** Build the set around `object`, render it, and return the canvas. */
export function stage(object: THREE.Object3D, o: StageOptions = {}): HTMLElement {
  releaseStage();
  const a = { ...DEFAULT_ARGS, ...o };

  const canvas = document.createElement('canvas');
  canvas.style.width = `${STAGE_SIZE.width}px`;
  canvas.style.height = `${STAGE_SIZE.height}px`;
  canvas.style.display = 'block';
  const renderer = new Renderer(canvas, { size: STAGE_SIZE, pixelRatio: 1, preserveDrawingBuffer: true });

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xffffff, 0.002);
  const sky = new Sky(1400);
  scene.add(sky.mesh);
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);

  scene.add(object);
  for (const e of o.extras ?? []) scene.add(e);

  // run the animation to the requested time in fixed steps, before framing, since some assets move
  let t = 0;
  const steps = Math.round(a.time / STEP);
  for (let i = 0; i < steps; i++) { t += STEP; o.update?.(STEP, t); }
  object.updateMatrixWorld(true);
  object.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  // frame the asset
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const focus = o.focus ?? sphere.center;
  const radius = o.radius ?? Math.max(sphere.radius, 0.5);
  const camera = new THREE.PerspectiveCamera(35, STAGE_SIZE.width / STAGE_SIZE.height, Math.max(0.05, radius * 0.02), 3000);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(35) / 2)) * 1.02 * a.distance;
  const yaw = THREE.MathUtils.degToRad(a.yaw), pitch = THREE.MathUtils.degToRad(a.pitch);
  camera.position.set(focus.x + Math.sin(yaw) * Math.cos(pitch) * dist, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(focus);

  if (o.ground !== false) {
    const y = typeof o.ground === 'number' ? o.ground : box.min.y;
    // wide enough that its edge sits in the haze near the horizon
    const disc = new THREE.Mesh(new THREE.CircleGeometry(Math.max(radius * 60, 400), 96), toon(0x9aa58a));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(focus.x, y - 0.01, focus.z);
    disc.receiveShadow = true;
    scene.add(disc);
  }

  // the game's lighting code, fed one preset
  const L = emptyLightingState();
  makeLighting([{ ...LIGHTS[a.light] }])(0, L);
  applyLighting(L, { sky, scene, sun, hemi }, renderer, focus);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -radius * 1.6;
  sc.right = sc.top = radius * 1.6;
  sc.near = 180 - radius * 3; sc.far = 180 + radius * 3;
  sc.updateProjectionMatrix();

  renderer.setScene(scene, camera);

  const draw = () => { sky.update(camera.position, t); renderer.render(t); };
  draw();

  // workbench extras, only outside Chromatic
  let raf = 0;
  let controls: OrbitControls | null = null;
  if (!isChromatic()) {
    controls = new OrbitControls(camera, canvas);
    controls.target.copy(focus);
    controls.update();
    controls.addEventListener('change', () => { if (!a.animate) draw(); });
    if (a.animate && o.update) {
      const loop = () => { t += STEP; o.update!(STEP, t); draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
  }

  holdStage(() => {
    cancelAnimationFrame(raf);
    controls?.dispose();
    renderer.dispose();
  });
  return canvas;
}

/** A character from the worlds' `characters.ts`: a group plus an update function. */
export interface CharacterLike { group: THREE.Object3D; update(dt: number, t: number): void }

/**
 * Makes a story that stages one asset. `make` builds a fresh copy for each render.
 * It may return a character (group + update), a builder result with a `group`, or a plain object.
 */
export function asset(make: () => CharacterLike | { group: THREE.Object3D } | THREE.Object3D, opts: StageOptions = {}) {
  return {
    args: pickArgs(opts),
    render: (args: StageArgs) => {
      const made = make();
      const object = made instanceof THREE.Object3D ? made : made.group;
      const update = 'update' in made && typeof made.update === 'function' ? (made.update as CharacterLike['update']).bind(made) : undefined;
      return stage(object, { ...opts, ...args, update: opts.update ?? update });
    },
  };
}

function pickArgs(o: StageOptions): Partial<StageArgs> {
  const out: Partial<StageArgs> = {};
  for (const k of Object.keys(DEFAULT_ARGS) as (keyof StageArgs)[]) if (o[k] !== undefined) (out as Record<string, unknown>)[k] = o[k];
  return out;
}
