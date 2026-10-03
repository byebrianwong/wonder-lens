import * as THREE from 'three';
import { clamp, smoothstep } from '../../engine/math';

/**
 * Film tricks for the Amélie ride.
 *
 * `Lens` is a small sphere around the camera, drawn over everything else. It can close an iris to black
 * (a circle that shrinks to the middle of the screen, like an old film), flash white (a photo booth), and
 * wash the picture with a colour. While the screen is covered the ride can pass from one scene into another.
 *
 * `LightPool` is a fixed set of point lights that move from scene to scene. Each scene names a few spots;
 * the pool fades lights in and out as the ride passes. The number of lights never changes, so shaders
 * never recompile mid-ride.
 *
 * `lightShaft` is a soft beam of light (sun through a window, moonlight through a skylight), and `Cue`
 * describes a timed effect along the ride.
 */

export class Lens {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    /** iris radius as an angle from the middle of the view, in radians; 1.2 or more is fully open */
    iris: { value: 2 },
    irisSoft: { value: 0.05 },
    flash: { value: 0 },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    wash: { value: 0 },
    washColor: { value: new THREE.Color(0, 0, 0) },
  };

  constructor() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float iris; uniform float irisSoft; uniform float flash; uniform vec3 flashColor;
        uniform float wash; uniform vec3 washColor;
        varying vec3 vView;
        void main() {
          vec3 d = normalize(vView);
          float ang = acos(clamp(-d.z, -1.0, 1.0));
          // black outside the iris, with a soft edge
          float dark = smoothstep(iris, iris + irisSoft, ang);
          vec3 col = mix(washColor, vec3(0.0), dark);
          float a = max(dark, wash);
          // the flash goes over everything; above 1 it blooms
          col = mix(col, flashColor * 2.4, flash);
          a = max(a, clamp(flash, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat);
    this.mesh.renderOrder = 10000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Set the effects for this frame. iris: 1 open .. 0 closed. */
  set(o: { iris?: number; flash?: number; wash?: number; washColor?: THREE.ColorRepresentation; flashColor?: THREE.ColorRepresentation }) {
    const u = this.uniforms;
    const open = clamp(o.iris ?? 1, 0, 1);
    // ease the radius so the circle shrinks slowly at first and closes briskly at the end
    u.iris.value = open >= 0.999 ? 2 : -0.06 + Math.pow(open, 1.4) * 1.1;
    u.flash.value = clamp(o.flash ?? 0, 0, 1.5);
    u.wash.value = clamp(o.wash ?? 0, 0, 1);
    if (o.washColor !== undefined) u.washColor.value.set(o.washColor);
    if (o.flashColor !== undefined) u.flashColor.value.set(o.flashColor);
    this.mesh.visible = open < 0.999 || u.flash.value > 0.002 || u.wash.value > 0.002;
  }
}

/** A point light spot that a scene wants lit while the ride is between `from` and `to` (ride progress). */
export interface LightSpot { from: number; to: number; pos: THREE.Vector3; color: THREE.ColorRepresentation; intensity: number; distance: number; flicker?: number }

export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  private spots: LightSpot[][];
  private fade = 0.006;

  constructor(scene: THREE.Scene, count: number) {
    this.spots = Array.from({ length: count }, () => []);
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** Add a spot to the light that is free over its whole span. */
  add(s: LightSpot) {
    for (const list of this.spots) {
      if (list.every((o) => s.to + this.fade * 2 < o.from || s.from - this.fade * 2 > o.to)) { list.push(s); return; }
    }
    console.warn('[amelie] no free light for spot', s);
  }

  /** extra brightness for a spot, set by the scene that owns it (a carousel lighting up) */
  boost = new Map<LightSpot, number>();

  update(u: number, t: number) {
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const s = this.spots[i].find((o) => u > o.from - this.fade && u < o.to + this.fade);
      // an unused light stays switched on at zero brightness: hiding it would change the number of lights,
      // and three.js would recompile every lit material in the scene
      if (!s) { l.intensity = 0; continue; }
      const k = smoothstep(s.from - this.fade, s.from, u) * (1 - smoothstep(s.to, s.to + this.fade, u));
      const fl = s.flicker ? 1 + Math.sin(t * 9.1 + i) * 0.04 * s.flicker + Math.sin(t * 23.7 + i * 2) * 0.03 * s.flicker : 1;
      l.position.copy(s.pos);
      l.color.set(s.color);
      l.distance = s.distance;
      l.intensity = s.intensity * k * fl * (this.boost.get(s) ?? 1);
    }
  }
}

let shaftTex: THREE.Texture | null = null;
/** Soft beam texture: bright at the top, fading down and towards both edges. */
function shaftTexture() {
  if (shaftTex) return shaftTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const u = x / 63, v = y / 127;
    const edge = Math.pow(Math.sin(u * Math.PI), 1.6);
    const along = Math.pow(1 - v, 0.8) * smoothstep(0, 0.08, v);
    const a = edge * along;
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  shaftTex = new THREE.CanvasTexture(c);
  return shaftTex;
}

/**
 * A beam of light from `from` to `to`: a few crossed soft planes, additive, so it reads as light in the
 * air from most angles. `width` is the beam's width at the far end (it starts at 60% of that).
 */
export function lightShaft(from: THREE.Vector3, to: THREE.Vector3, width: number, color: THREE.ColorRepresentation, opacity = 0.25) {
  const len = from.distanceTo(to);
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  // taper: narrower at the top (the window), wider where it lands
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (y > 0 ? 0.6 : 1) * width); p.setY(i, (y - 0.5) * len); }
  geo.translate(0, 0, 0);
  const mat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = (k / 3) * Math.PI;
    m.userData.keep = true;
    g.add(m);
  }
  g.position.copy(from);
  // point the group's -y along the beam
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  g.userData.shaft = mat;
  return g;
}

/**
 * A timed effect along the ride: 0 before `a`, rises to 1 at `b`, holds, falls back to 0 between `c` and `d`
 * (all in ride progress u). For an iris: `iris = 1 - cue(u)`.
 */
export function cue(u: number, a: number, b: number, c: number, d: number) {
  if (u <= a || u >= d) return 0;
  if (u < b) return smoothstep(a, b, u);
  if (u <= c) return 1;
  return 1 - smoothstep(c, d, u);
}
