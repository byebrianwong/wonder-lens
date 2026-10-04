import * as THREE from 'three';
import { smoothstep } from '../../../engine/math';
import { WAVE_CENTER } from './plan';
import { lanternPaper } from './textures';

/*
 * The lantern wave. Every lantern, lit window and lit sign in the scene uses a material patched by
 * `waveLit`: its glow is switched on by distance from the middle of the bathhouse compared with one
 * growing radius. The set grows the radius as the rider crosses the bridge, so the light sweeps out from
 * the bathhouse, past the rider and over the town. Nothing is swapped or recompiled: only two uniforms
 * change. Bloom makes the lit parts glow.
 */

/** The two uniforms every patched material shares. */
export const WAVE = {
  center: { value: WAVE_CENTER.clone() },
  /** how far the wave has spread from the centre, in units (a big number once everything is lit) */
  radius: { value: 0 },
};

/**
 * Warm light bounced onto the bathhouse at dusk: a share of each surface's own colour added as emitted
 * light, so its red lacquer and green tiles still read against the sunset before and after the lanterns
 * light. (A uniform, so the set could change it along the ride.)
 */
export const DUSK_BOUNCE = { value: new THREE.Color(0.5, 0.4, 0.36) };

/** Add the dusk bounce to a material that has no wave glow of its own; `k` scales it (dark tiles need more). */
export function duskLit<T extends THREE.Material>(mat: T, key: string, k = 1): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.duskBounce = DUSK_BOUNCE;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 duskBounce;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * duskBounce * ${k.toFixed(3)};`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** How lit a point at distance `d` is for a wave of radius `r`, on the CPU (for the water's reflections). */
export function waveLitAt(d: number, r: number) {
  return 1 - smoothstep(r - 7, r, d);
}

const GLSL = /* glsl */ `
  uniform vec3 waveCenter; uniform float waveRadius; varying vec3 vWaveP;
  // 0 outside the wave, 1 inside it, with a brief flare just behind its front edge
  float waveGlow() {
    float d = distance(vWaveP, waveCenter);
    float lit = 1.0 - smoothstep(waveRadius - 7.0, waveRadius, d);
    float x = (d - waveRadius + 5.0) / 4.5;
    return lit * (1.0 + 1.5 * exp(-x * x));
  }`;

/**
 * Patch a material (Lambert, or anything with an emissive term) so its emissive glow follows the wave.
 * `dim` darkens the paper (wherever the emissive map is bright) before it lights, so unlit windows and
 * lanterns read as dark paper at dusk. `tint` colours the glow by the instance or vertex colour.
 */
export function waveLit<T extends THREE.Material>(mat: T, key: string, o: { dim?: number; tint?: boolean; bounce?: boolean } = {}): T {
  const dim = (o.dim ?? 0.5).toFixed(3);
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.waveCenter = WAVE.center;
    sh.uniforms.waveRadius = WAVE.radius;
    sh.uniforms.duskBounce = DUSK_BOUNCE;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaveP;')
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        {
          vec4 wwp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wwp = instanceMatrix * wwp;
          #endif
          vWaveP = (modelMatrix * wwp).xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 duskBounce;\n' + GLSL)
      .replace('#include <emissivemap_fragment>', /* glsl */ `#include <emissivemap_fragment>
        {
          float wg = waveGlow();
          float paperK = clamp(max(totalEmissiveRadiance.r, max(totalEmissiveRadiance.g, totalEmissiveRadiance.b)), 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, mix(${dim}, 1.0, clamp(wg, 0.0, 1.0)), paperK);
          ${o.tint ? '#ifdef USE_COLOR\n totalEmissiveRadiance *= mix(vec3(1.0), vColor.rgb, 0.55);\n#endif' : ''}
          totalEmissiveRadiance *= wg;
          ${o.bounce ? '// (less on the paper screens, so the wave still makes the big change there)\n totalEmissiveRadiance += diffuseColor.rgb * duskBounce * (1.0 - 0.7 * paperK);' : ''}
        }`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** Lantern colours. */
export const LANTERN = { red: new THREE.Color(0.92, 0.22, 0.14), white: new THREE.Color(1, 0.97, 0.9), yellow: new THREE.Color(1, 0.78, 0.32) };

/** A barrel-shaped paper lantern 1 unit tall, centred on its middle; its front (the character) faces +z. */
function lanternGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 5;
  pts.push(new THREE.Vector2(0.001, -0.5));
  for (let i = 0; i <= N; i++) {
    const t = i / N, y = -0.44 + t * 0.88;
    pts.push(new THREE.Vector2(0.22 + 0.16 * Math.sin(t * Math.PI), y));
  }
  pts.push(new THREE.Vector2(0.001, 0.5));
  const geo = new THREE.LatheGeometry(pts, 9);
  // the lathe's u = 0 is at +z; turn it so the painted front (u = 0.25) faces +z
  geo.rotateY(-Math.PI / 2);
  return geo;
}

/**
 * Collects lanterns from all over the scene and builds them as one instanced mesh with one material,
 * so hundreds of lanterns are one draw call.
 */
export class LanternField {
  readonly items: Array<{ p: THREE.Vector3; s: number; c: THREE.Color; yaw: number }> = [];
  add(p: THREE.Vector3, s = 1, c: THREE.Color = LANTERN.red, yaw = 0) { this.items.push({ p: p.clone(), s, c, yaw }); return this; }
  build() {
    const paper = lanternPaper();
    const mat = waveLit(new THREE.MeshLambertMaterial({ map: paper.map, emissive: 0xffd2a0, emissiveMap: paper.glow, emissiveIntensity: 2.4 }), 'bath-lantern-1', { dim: 0.42, tint: true });
    const im = new THREE.InstancedMesh(lanternGeometry(), mat, this.items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.yaw);
      m.compose(it.p, q, s.setScalar(it.s));
      im.setMatrixAt(i, m);
      im.setColorAt(i, it.c);
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.userData.keep = true;
    return im;
  }
}
