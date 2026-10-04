import * as THREE from 'three';
import { CumulusField } from '../../../engine/Clouds';
import type { Placement } from '../../../engine/Builders';
import { Rng, TAU, clamp, fbm, lerp, noise2, smoothstep } from '../../../engine/math';
import { NEST, type Road } from '../layout';
import { GLSL_CAP, GLSL_NOISE, softenCumulus, type SkyLight } from './shared';

/*
 * The sea of cloud above which the sky scene happens: a broad heightfield of soft cumulus tops (y 33 to 44)
 * reaching to the horizon, a cloud dome under every spot where the Catbus's paws come down, and cumulus
 * towers, banks and small drifting cloudlets on top of it.
 */

/** A spot where the path comes down onto a cloud top. */
export interface Touch { x: number; y: number; z: number }

/** The exact low points of the path near each nominal z. */
export function findTouches(road: Road, nominal: number[]): Touch[] {
  return nominal.map((z0) => {
    let best = road.at(z0);
    for (let z = z0 + 6; z >= z0 - 6; z -= 0.2) { const p = road.at(z); if (p.y < best.y) best = p; }
    return { x: best.x, y: best.y, z: best.z };
  });
}

const smax = (a: number, b: number, k: number) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(a, b, h) + k * h * (1 - h); };
const smin = (a: number, b: number, k: number) => { if (k < 1e-3) return Math.min(a, b); const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };

/** Ride z range the fine part of the floor covers. */
const NEAR = { z0: -880, z1: -1250 };

/**
 * Height of the cloud tops at (x, z). Under the path the clouds stay at least a few units below it,
 * except at the touch spots, where a dome rises so its top meets the path.
 */
export function makeSeaHeight(road: Road, touches: Touch[]) {
  return (x: number, z: number) => {
    // how far from the stretch the rider sees up close: small detail fades out further away
    const zOut = Math.max(0, z - NEAR.z0, NEAR.z1 - z);
    const far = Math.max(Math.abs(x), zOut);
    const fine = 1 - smoothstep(90, 240, far);
    const broad = smoothstep(0.3, 0.72, fbm(x * 0.0085 + 11.3, z * 0.0085 - 4.7, 3));
    const n = noise2(x * 0.034 + 3.1, z * 0.034 + 8.9) * (0.65 + 0.35 * (1 - fine)) + noise2(x * 0.081 + 1.7, z * 0.081 - 5.2) * 0.35 * fine;
    const heads = Math.sqrt(Math.max(0, n - 0.3) / 0.7);
    let h = 32.5 + 7 * broad + 4.5 * heads * (0.45 + 0.55 * broad);
    // under and beside the path the sea stays a few units below the Catbus
    const p = road.at(z);
    const lat = Math.abs((x - p.x) * p.rx + (z - p.z) * p.rz);
    const w = smoothstep(-888, -904, z) * (1 - smoothstep(-1200, -1216, z)) * (1 - smoothstep(32, 40, lat));
    if (w > 0) {
      const cap = p.y - 4.4 + Math.max(0, lat - 3) ** 2 * 0.12;
      let dzT = 99;
      for (const t of touches) dzT = Math.min(dzT, Math.abs(z - t.z));
      let hc = smin(h, cap, 3 * (1 - Math.exp(-((dzT / 5) ** 2))));
      // a dome under each touch spot, its top just under the paws
      for (const t of touches) {
        const dz = z - t.z;
        if (Math.abs(dz) > 30) continue;
        const dx = x - t.x;
        hc = smax(hc, t.y - 0.02 - ((dz / 12) ** 2 + (dx / 8) ** 2) * 3.2, 1.5);
      }
      // never above the path inside the Catbus's corridor
      hc = Math.min(hc, p.y - 0.02 + Math.max(0, lat - 3.5) ** 2 * 0.3);
      h = lerp(h, hc, w);
    }
    // the clouds sink away inside the storm wall, so nothing of the sea shows in the calm eye
    const dn = Math.hypot(x - NEST.x, z - NEST.z);
    if (dn < 172) h = lerp(h, -30, smoothstep(172, 150, dn));
    return h;
  };
}

/** Grid coordinates from lo to hi: `step` apart inside [c0, c1], growing further out. */
function axis(lo: number, hi: number, c0: number, c1: number, step: number, growth: number) {
  const out: number[] = [];
  let v = lo;
  while (v < hi) { out.push(v); v += step + growth * Math.max(0, c0 - v, v - c1); }
  out.push(hi);
  return out;
}

export class CloudSea {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(0.5, 0.08, -0.86).normalize() },
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uRim: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.002 },
    uTime: { value: 0 }, uGloom: { value: 0 },
    uNest: { value: new THREE.Vector3(NEST.x, NEST.z, NEST.outer) },
  };
  private warmLit = new THREE.Color(0xffd8b8);
  private lilac = new THREE.Color(0xb8a4d0);
  private dusk = new THREE.Color(0x8a86a4);

  constructor(height: (x: number, z: number) => number, lowDetail: boolean) {
    const k = lowDetail ? 1.7 : 1;
    const xs = axis(-1250, 1250, -60, 60, 3 * k, 0.06);
    const zs = axis(-2300, 260, NEAR.z1, NEAR.z0, 3.5 * k, 0.06);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const o = (j * nx + i) * 3;
      pos[o] = xs[i]; pos[o + 1] = height(xs[i], zs[j]); pos[o + 2] = zs[j];
    }
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      // z grows with j, x with i: (a, c, b) faces up
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    if (nrm.getY(Math.floor(nx * nz / 2)) < 0) {
      for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
      geo.setIndex(idx); geo.computeVertexNormals();
    }
    geo.computeBoundingSphere();

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vN;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uSky; uniform vec3 uHaze;
        uniform vec3 uFogColor; uniform float uFogDensity; uniform float uTime; uniform float uGloom; uniform vec3 uNest;
        varying vec3 vWorld; varying vec3 vN;
        ${GLSL_NOISE}
        ${GLSL_CAP}
        float puffs(vec2 q) { return noise2(q) + 0.5 * noise2(q * 2.3 + 7.1); }
        void main() {
          vec3 n = normalize(vN);
          float dist = length(cameraPosition - vWorld);
          // small round heads on the big ones, drifting slowly; they fade with distance so they never shimmer
          float det = 1.0 - smoothstep(70.0, 280.0, dist);
          vec2 q = vWorld.xz * 0.1 + vec2(uTime * 0.02, uTime * 0.007);
          float h0 = puffs(q), hx = puffs(q + vec2(0.4, 0.0)), hz = puffs(q + vec2(0.0, 0.4));
          n = normalize(n + vec3(h0 - hx, 0.0, h0 - hz) * 1.8 * det);
          // a wide soft terminator, then a second step for the painted bands on the sunny side
          float d = dot(n, uSunDir);
          float lit = smoothstep(-0.4, 0.55, d) * 0.8 + smoothstep(0.3, 0.8, d) * 0.2;
          vec3 col = mix(uShade, uLit, lit);
          col += uSky * 0.16 * clamp(n.y, 0.0, 1.0);
          // the valleys between the heads fill with haze
          float low = 1.0 - smoothstep(30.0, 41.0, vWorld.y);
          col = mix(col, uHaze, low * 0.5);
          // edges seen against the sun glow; the sides facing you near the sun stay in their own shade
          vec3 V = normalize(cameraPosition - vWorld);
          float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
          float back = pow(clamp(dot(-V, uSunDir), 0.0, 1.0), 3.0);
          col *= 1.0 - 0.2 * smoothstep(0.8, 0.97, clamp(dot(-V, uSunDir), 0.0, 1.0)) * (1.0 - rim);
          col += uRim * rim * (0.05 + 0.4 * back);
          // sunlit tops stay peach-gold, below the bloom threshold
          col = capLum(col, 0.6, 0.82);
          // the storm wall's gloom on the clouds round its foot
          float dn = length(vWorld.xz - uNest.xy) - uNest.z;
          col *= 1.0 - uGloom * 0.5 * (1.0 - smoothstep(0.0, 280.0, dn));
          // fog, and fully the fog colour (the horizon) before the edge of the floor
          float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          f = max(f, smoothstep(820.0, 1150.0, dist));
          col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }

  /** Colours from the world's light: warm peach tops, lilac shade; `gloom` darkens the foot of the storm. */
  update(light: SkyLight, gloom: number, t: number) {
    const u = this.uniforms, sky = light.sky;
    const I = Math.min(1, light.sunIntensity / 2.2);
    u.uSunDir.value.copy(light.sunDir);
    u.uLit.value.setRGB(1, 1, 1).lerp(light.sunColor, 0.45).lerp(this.warmLit, 0.3).multiplyScalar(0.6 + 0.35 * I);
    // the shade side is a soft rose-lilac at sunrise, going a muted lilac-grey (not smoke) as the storm looms
    u.uShade.value.copy(sky.midColor.value).lerp(sky.topColor.value, 0.25).lerp(this.lilac, 0.5).multiplyScalar(0.85 + 0.12 * I);
    u.uShade.value.lerp(this.dusk, gloom * 0.35);
    u.uRim.value.copy(light.sunColor).multiplyScalar(0.9 * I);
    u.uSky.value.copy(sky.topColor.value).lerp(sky.midColor.value, 0.5);
    u.uHaze.value.copy(light.fog.color).lerp(sky.bottomColor.value, 0.3).multiplyScalar(0.92);
    u.uFogColor.value.copy(light.fog.color);
    u.uFogDensity.value = light.fog.density * 0.75;
    u.uGloom.value = gloom;
    u.uTime.value = t;
  }
}

/** Is a cloud at (x, z) of radius r in front of the low sun, seen from somewhere along the bounding stretch? */
function hidesSun(road: Road, sunDir: THREE.Vector3, x: number, z: number, r: number) {
  const sunAz = Math.atan2(sunDir.x, -sunDir.z);
  for (let zr = -940; zr >= -1180; zr -= 20) {
    if (z > zr) continue;
    const p = road.at(zr);
    const dx = x - p.x, dz = z - zr, d = Math.hypot(dx, dz);
    const az = Math.atan2(dx, -dz);
    if (Math.abs(az - sunAz) < Math.atan(r / d) + 0.07) return true;
  }
  return false;
}

/**
 * Cumulus on the sea: towers (60-150 tall) and long banks out to the horizon, and small cloudlets that
 * drift past close to the path. Towers and banks alternate in the list so each gets the right shape
 * (CumulusField makes even variants towers and odd ones banks).
 */
export function seaClouds(rng: Rng, road: Road, height: (x: number, z: number) => number, lowDetail: boolean) {
  const sunDir = new THREE.Vector3(0.5, 0.08, -0.86).normalize();
  // clear of the storm and of the anvil that spreads out over its top (radius about 320)
  const nestClear = (x: number, z: number, r: number) => Math.hypot(x - NEST.x, z - NEST.z) > 340 + r;
  // the airship's track on the left (see flyers.ts)
  const shipClear = (x: number, z: number, r: number) => x > -30 + r || x < -150 - r || z > -940 + r || z < -1110 - r;
  const towers: Placement[] = [], banks: Placement[] = [];
  const nT = lowDetail ? 9 : 16, nB = lowDetail ? 9 : 16;
  for (let i = 0; i < 400 && towers.length < nT; i++) {
    const near = towers.length < nT * 0.6;
    const z = rng.range(-560, -1650), x = rng.sign() * rng.range(near ? 110 : 260, near ? 360 : 700);
    const scale = rng.range(3.2, 6.5), r = 12 * scale;
    // cloudlets are small, so they go anywhere off the path; towers keep clear of the sun, the storm and the airship
    if (!nestClear(x, z, r) || !shipClear(x, z, r + 20) || hidesSun(road, sunDir, x, z, r)) continue;
    towers.push({ x, y: height(x, z) - 4, z, scale, rot: rng.range(0, TAU) });
  }
  for (let i = 0; i < 400 && banks.length < nB; i++) {
    const a = rng.range(0, TAU), d = rng.range(240, 900);
    const x = Math.sin(a) * d, z = -1060 + Math.cos(a) * d * 1.3;
    const scale = rng.range(3.5, 7), r = 18 * scale;
    if (!nestClear(x, z, r) || hidesSun(road, sunDir, x, z, r * 0.5)) continue;
    banks.push({ x, y: height(x, z) - 3, z, scale, rot: rng.range(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI) });
  }
  // little clouds near the path, so the speed shows; they keep out of the Catbus's way
  const lets: Placement[] = [];
  const nL = lowDetail ? 6 : 12;
  for (let i = 0; i < 300 && lets.length < nL; i++) {
    const z = rng.range(-950, -1175), scale = rng.range(0.5, 1.0);
    const p = road.at(z), lat = rng.sign() * rng.range(10 + 19 * scale, 70);
    const x = p.x + p.rx * lat, zz = z + p.rz * lat;
    if (!shipClear(x, zz, 25) || !nestClear(x, zz, 20)) continue;
    if (lets.some((o) => Math.hypot(o.x - x, o.z - zz) < 30)) continue;
    lets.push({ x, y: p.y + rng.range(-1, 5), z: zz, scale, rot: rng.range(0, TAU) });
  }
  const evens = [...towers, ...lets.filter((_, i) => i % 2 === 0)], odds = [...banks, ...lets.filter((_, i) => i % 2 === 1)];
  const n = Math.min(evens.length, odds.length);
  const placements: Placement[] = [];
  for (let i = 0; i < n; i++) placements.push(evens[i], odds[i]);
  return softenCumulus(new CumulusField(rng, placements, { variants: 6 }));
}
