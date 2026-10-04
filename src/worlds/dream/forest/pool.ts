import * as THREE from 'three';
import type { HeightGrid } from '../../../engine/HeightGrid';

/*
 * The spirit pool: a clear, still, shallow lake at y 0.
 *
 * The water reads the ground height under each pixel (the same grid the terrain is built from), so the
 * shallows are clear and show the moss and stones on the bottom, and deeper water turns dark teal. Its
 * reflection is painted rather than rendered: the sky colour overhead, a ragged dark band of reflected
 * trees all round the shore, the pink of first light towards the sun, and a soft glowing column where the
 * Night-Walker stands. Rings spread from wherever something touches the surface (the Catbus's paws).
 */

const RINGS = 32;

export class PoolWater {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uTime: { value: 0 },
    uHeightMap: { value: null as THREE.Texture | null },
    uHeightInfo: { value: new THREE.Vector4() },
    uDeep: { value: new THREE.Color(0x0c2a2c) },
    uShallow: { value: new THREE.Color(0x2c5a4c) },
    uSkyTop: { value: new THREE.Color(0x4a7a7a) },
    uSkyLow: { value: new THREE.Color(0x6a8a88) },
    uTree: { value: new THREE.Color(0x0e1c18) },
    uSunDir: { value: new THREE.Vector3(0.45, 0.12, -0.88).normalize() },
    uSunColor: { value: new THREE.Color(0xffc0a0) },
    uDawn: { value: 0 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.01 },
    uRings: { value: Array.from({ length: RINGS }, () => new THREE.Vector4(0, 0, -99, 0)) },
    /** the Night-Walker: x, z, height of its glow, strength */
    uWalker: { value: new THREE.Vector4(0, 0, 0, 0) },
    uWalkerColor: { value: new THREE.Color(0x7ab0ff) },
  };
  private next = 0;

  /** `area` is the rectangle the water plane covers; the terrain hides it wherever the ground is above y 0. */
  constructor(grid: HeightGrid, area: { x0: number; x1: number; z0: number; z1: number }) {
    const u = this.uniforms;
    u.uHeightMap.value = grid.texture();
    u.uHeightInfo.value.set(grid.xMin, grid.zMin, grid.res, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying float vFogDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uHeightMap; uniform vec4 uHeightInfo;
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSkyTop; uniform vec3 uSkyLow; uniform vec3 uTree;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uDawn;
        uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec4 uRings[${RINGS}];
        uniform vec4 uWalker; uniform vec3 uWalkerColor;
        varying vec3 vWorld; varying float vFogDepth;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 w = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
        }
        float ground(vec2 p) {
          ivec2 sz = textureSize(uHeightMap, 0);
          vec2 f = clamp((p - uHeightInfo.xy) / uHeightInfo.z, vec2(0.0), vec2(sz - 1) - 0.001);
          ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
          float h00 = texelFetch(uHeightMap, i, 0).r, h10 = texelFetch(uHeightMap, i + ivec2(1, 0), 0).r;
          float h01 = texelFetch(uHeightMap, i + ivec2(0, 1), 0).r, h11 = texelFetch(uHeightMap, i + ivec2(1, 1), 0).r;
          return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
        }
        void main() {
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / max(dist, 0.001);
          vec2 p = vWorld.xz;
          // still water: only the faintest breath of movement, plus rings where something touched it
          float n1 = noise(p * 0.3 + uTime * vec2(0.04, 0.03));
          float n2 = noise(p * 1.3 - uTime * vec2(0.05, -0.07));
          vec2 slope = vec2(n1 - 0.5, n2 - 0.5) * 0.05;
          float rings = 0.0;
          for (int i = 0; i < ${RINGS}; i++) {
            vec4 R = uRings[i];
            float age = uTime - R.z;
            if (R.w <= 0.0 || age < 0.0 || age > 3.0) continue;
            vec2 d = p - R.xy;
            float r = length(d);
            float x = (r - (0.3 + age * 2.4)) / (0.16 + age * 0.14);
            float env = R.w * exp(-age * 1.3) * exp(-x * x);
            slope += (d / max(r, 0.05)) * env * sin(x * 2.6) * 0.45;
            rings += env;
          }
          vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
          // what lies under the water: clear over the shallows, dark teal where it is deep
          float depth = max(0.0, -ground(p));
          float clear = exp(-depth * 0.55);
          vec3 body = mix(uDeep, uShallow, clear);
          // the Night-Walker's light falls on the water round it
          vec2 wd = p - uWalker.xy;
          body += uWalkerColor * exp(-dot(wd, wd) / 900.0) * 0.35 * uWalker.w;
          // the painted reflection
          vec3 R = reflect(-V, n);
          vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(0.0, 0.6, R.y));
          sky += uSunColor * pow(max(dot(R, uSunDir), 0.0), 6.0) * uDawn * 0.9;
          vec2 dir = R.xz / max(length(R.xz), 0.001);
          float line = 0.11 + 0.1 * noise(dir * 2.5 + 3.1) + 0.06 * noise(dir * 9.0 + 7.3);
          float trees = 1.0 - smoothstep(line - 0.025, line + 0.025, R.y);
          sky = mix(sky, uTree, trees * 0.85);
          // the Night-Walker's reflection: where the reflected ray passes close to it, a soft glowing column
          vec2 rxz = R.xz;
          float tt = max(dot(uWalker.xy - p, rxz) / max(dot(rxz, rxz), 0.0001), 0.0);
          float dm = length(p + rxz * tt - uWalker.xy);
          float h01 = clamp(R.y * tt / max(uWalker.z, 1.0), 0.0, 1.0);
          float inH = step(0.0, R.y) * smoothstep(0.0, 0.04, h01) * (1.0 - smoothstep(0.8, 1.0, h01));
          float wdth = mix(4.0, 9.0, smoothstep(0.35, 0.6, h01));
          float glow = exp(-dm * dm / (wdth * wdth)) * inH * uWalker.w;
          sky = mix(sky, uWalkerColor * 1.4, clamp(glow, 0.0, 1.0) * 0.8);
          float fres = 0.03 + 0.97 * pow(1.0 - clamp(dot(V, n), 0.0, 1.0), 5.0);
          vec3 col = mix(body, sky, clamp(fres + 0.18, 0.0, 1.0));
          // first light glinting on the ripples
          vec3 H = normalize(V + uSunDir);
          col += uSunColor * pow(max(dot(n, H), 0.0), 160.0) * uDawn * 1.5;
          col += vec3(0.75, 0.92, 0.95) * clamp(rings, 0.0, 1.0) * 0.18;
          float alpha = mix(0.32, 0.93, 1.0 - clear);
          alpha = max(alpha, clamp(fres + 0.1, 0.0, 1.0));
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
          col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));
          alpha = mix(alpha, 1.0, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(area.x1 - area.x0, area.z0 - area.z1, 1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set((area.x0 + area.x1) / 2, 0, (area.z0 + area.z1) / 2);
    this.mesh.renderOrder = 2;
    this.mesh.userData.keep = true;
  }

  /** A ring spreading from a point on the water, starting at ride time `t`. */
  ring(x: number, z: number, t: number, amp = 1) {
    this.uniforms.uRings.value[this.next].set(x, z, t, amp);
    this.next = (this.next + 1) % RINGS;
  }

  update(t: number, fog: THREE.FogExp2, o: { dawn: number; skyTop: THREE.Color; skyLow: THREE.Color; tree: THREE.Color; deep: THREE.Color; shallow: THREE.Color }) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uFogColor.value.copy(fog.color);
    u.uFogDensity.value = fog.density;
    u.uDawn.value = o.dawn;
    u.uSkyTop.value.copy(o.skyTop);
    u.uSkyLow.value.copy(o.skyLow);
    u.uTree.value.copy(o.tree);
    u.uDeep.value.copy(o.deep);
    u.uShallow.value.copy(o.shallow);
  }
}
