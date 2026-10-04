import * as THREE from 'three';
import { Rng } from '../../../engine/math';

/**
 * Rising plumes of soft puffs (steam over the food stalls, steam from the boiler room's valves, smoke from
 * the chimney) in one Points object. Each puff rises from its source, drifts, grows and fades, then starts
 * again; all of it happens in the vertex shader, so the CPU does nothing per frame but set the time.
 */
export interface PlumeSource {
  p: THREE.Vector3;
  /** number of puffs */
  n: number;
  /** how high a puff rises before it fades */
  rise: number;
  /** how far it drifts sideways */
  spread: number;
  /** puff size in world units */
  size: number;
  /** rising speed, units per second */
  speed: number;
  alpha: number;
  color: THREE.ColorRepresentation;
}

export class Plumes {
  readonly points: THREE.Points;
  readonly uniforms = {
    time: { value: 0 },
    px: { value: 900 },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.004 },
  };

  constructor(sources: PlumeSource[], seed = 1) {
    const rng = new Rng(seed);
    const pos: number[] = [], params: number[] = [], phase: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    for (const s of sources) {
      c.set(s.color);
      for (let i = 0; i < s.n; i++) {
        pos.push(s.p.x + rng.range(-0.3, 0.3) * s.spread, s.p.y, s.p.z + rng.range(-0.3, 0.3) * s.spread);
        params.push(s.rise, s.spread, s.size * rng.range(0.8, 1.2), s.speed * rng.range(0.8, 1.2));
        phase.push(i / s.n + rng.range(-0.3, 0.3) / s.n);
        col.push(c.r, c.g, c.b, s.alpha);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aParams', new THREE.Float32BufferAttribute(params, 4));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 4));
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aParams; attribute float aPhase; attribute vec4 aColor;
        uniform float time; uniform float px;
        varying vec4 vCol; varying float vFogDepth;
        void main() {
          float k = fract(time * aParams.w / aParams.x + aPhase);
          vec3 p = position;
          float sw = aParams.y * (0.25 + k);
          p.x += sin(aPhase * 37.0 + time * 0.6) * sw;
          p.z += cos(aPhase * 23.0 + time * 0.5) * sw;
          p.y += k * aParams.x;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = max(-mv.z, 0.5);
          gl_PointSize = min(aParams.z * (0.45 + k * 1.3) * px / dist, 240.0);
          // fade in and out over the puff's life, and fade puffs right at the lens
          vCol = vec4(aColor.rgb, aColor.a * sin(k * 3.14159) * smoothstep(0.8, 3.0, dist));
          vFogDepth = dist;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 fogColor; uniform float fogDensity;
        varying vec4 vCol; varying float vFogDepth;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = (1.0 - smoothstep(0.15, 1.0, r)) * vCol.a;
          if (a < 0.004) discard;
          float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
          gl_FragColor = vec4(mix(vCol.rgb, fogColor, clamp(fog, 0.0, 1.0)), a);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  update(t: number, fog: THREE.Fog | THREE.FogExp2 | null) {
    this.uniforms.time.value = t;
    if (fog) {
      this.uniforms.fogColor.value.copy(fog.color);
      if ((fog as THREE.FogExp2).isFogExp2) this.uniforms.fogDensity.value = (fog as THREE.FogExp2).density;
    }
  }
}
