import * as THREE from 'three';
import { smoothstep } from '../engine/math';
import type { Renderer } from '../engine/Renderer';
import type { BuiltWorld, LightingState } from './types';

export interface LightKey {
  u: number;
  skyTop: number; skyMid: number; skyBottom: number;
  fog: number; fogDensity: number;
  sunDir: [number, number, number]; sunColor: number; sunIntensity: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  stars?: number; moon?: number; exposure?: number; bloom?: number; saturation?: number; tint?: number;
  /** sky sun disc glow (0 hides the sun, e.g. rain or night) */
  sunGlow?: number; sunSize?: number; horizonHeight?: number;
  /** drifting cloud shadows on the ground (0 = none) */
  cloudShadow?: number;
}

const ca = new THREE.Color(), cb = new THREE.Color();
const va = new THREE.Vector3(), vb = new THREE.Vector3();

/** Interpolates a list of lighting keyframes by ride progress. */
export function makeLighting(keys: LightKey[]) {
  keys.sort((a, b) => a.u - b.u);
  return (u: number, out: LightingState) => {
    let i = 0;
    while (i < keys.length - 2 && u > keys[i + 1].u) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const t = a === b ? 0 : smoothstep(a.u, b.u, u);
    const mixC = (x: number, y: number, target: THREE.Color) => { ca.set(x); cb.set(y); target.copy(ca).lerp(cb, t); };
    const mixN = (x: number | undefined, y: number | undefined, d: number) => { const xa = x ?? d, ya = y ?? d; return xa + (ya - xa) * t; };
    mixC(a.skyTop, b.skyTop, out.skyTop); mixC(a.skyMid, b.skyMid, out.skyMid); mixC(a.skyBottom, b.skyBottom, out.skyBottom);
    mixC(a.fog, b.fog, out.fog); out.fogDensity = mixN(a.fogDensity, b.fogDensity, 0.002);
    va.fromArray(a.sunDir).normalize(); vb.fromArray(b.sunDir).normalize();
    out.sunDir.copy(va).lerp(vb, t).normalize();
    mixC(a.sunColor, b.sunColor, out.sunColor); out.sunIntensity = mixN(a.sunIntensity, b.sunIntensity, 1);
    mixC(a.hemiSky, b.hemiSky, out.hemiSky); mixC(a.hemiGround, b.hemiGround, out.hemiGround); out.hemiIntensity = mixN(a.hemiIntensity, b.hemiIntensity, 1);
    out.stars = mixN(a.stars, b.stars, 0); out.moon = mixN(a.moon, b.moon, 0);
    out.exposure = mixN(a.exposure, b.exposure, 1); out.bloom = mixN(a.bloom, b.bloom, 0.4); out.saturation = mixN(a.saturation, b.saturation, 1);
    mixC(a.tint ?? 0xffffff, b.tint ?? 0xffffff, out.tint);
    out.sunGlow = mixN(a.sunGlow, b.sunGlow, 0.6); out.sunSize = mixN(a.sunSize, b.sunSize, 0.02); out.horizonHeight = mixN(a.horizonHeight, b.horizonHeight, 0.08);
    out.cloudShadow = mixN(a.cloudShadow, b.cloudShadow, 0);
  };
}

/**
 * Writes a lighting state into a scene's sky, fog and lights and into the renderer's post effects.
 * `focus` is the point the sun's shadow camera follows (the rider's position in the game).
 */
export function applyLighting(L: LightingState, w: Pick<BuiltWorld, 'sky' | 'scene' | 'sun' | 'hemi'>, r: Renderer, focus: THREE.Vector3) {
  const sky = w.sky.uniforms;
  sky.topColor.value.copy(L.skyTop); sky.midColor.value.copy(L.skyMid); sky.bottomColor.value.copy(L.skyBottom);
  sky.sunDir.value.copy(L.sunDir).normalize(); sky.sunColor.value.copy(L.sunColor);
  sky.starAmount.value = L.stars; sky.moonAmount.value = L.moon;
  sky.sunGlow.value = L.sunGlow; sky.sunSize.value = L.sunSize;
  sky.moonDir.value.copy(L.sunDir).normalize();
  sky.horizonColor.value.copy(L.fog); sky.horizonHeight.value = L.horizonHeight;
  const fog = w.scene.fog as THREE.FogExp2 | null;
  if (fog) { fog.color.copy(L.fog); fog.density = L.fogDensity; }
  w.sun.color.copy(L.sunColor); w.sun.intensity = L.sunIntensity;
  w.sun.position.copy(L.sunDir).multiplyScalar(180).add(focus);
  w.sun.target.position.copy(focus);
  w.sun.target.updateMatrixWorld();
  w.hemi.color.copy(L.hemiSky); w.hemi.groundColor.copy(L.hemiGround); w.hemi.intensity = L.hemiIntensity;
  r.renderer.toneMappingExposure = L.exposure;
  r.bloom.strength = L.bloom;
  r.grade.uniforms.saturation.value = L.saturation;
  r.fx.uniforms.cloudShadow.value = L.cloudShadow;
  r.fx.uniforms.sunDir.value.copy(L.sunDir);
  (r.grade.uniforms.tint.value as THREE.Color).copy(L.tint);
}

/** A lighting state with neutral defaults, for callers that fill it from `makeLighting`. */
export function emptyLightingState(): LightingState {
  return {
    skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyBottom: new THREE.Color(), fog: new THREE.Color(), fogDensity: 0.002,
    sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunIntensity: 1, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
    hemiIntensity: 1, stars: 0, moon: 0, exposure: 1, bloom: 0.4, saturation: 1, tint: new THREE.Color(1, 1, 1),
    sunGlow: 0.6, sunSize: 0.02, horizonHeight: 0.08, cloudShadow: 0,
  };
}
