import * as THREE from 'three';
import { smoothstep } from '../engine/math';
import type { LightingState } from './types';

export interface LightKey {
  u: number;
  skyTop: number; skyMid: number; skyBottom: number;
  fog: number; fogDensity: number;
  sunDir: [number, number, number]; sunColor: number; sunIntensity: number;
  hemiSky: number; hemiGround: number; hemiIntensity: number;
  stars?: number; moon?: number; exposure?: number; bloom?: number; saturation?: number; tint?: number;
  /** sky sun disc glow (0 hides the sun, e.g. rain or night) */
  sunGlow?: number; sunSize?: number; horizonHeight?: number;
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
  };
}
