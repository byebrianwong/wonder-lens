import * as THREE from 'three';
import { Rng } from './math';

/**
 * A tileable grey texture of soft brush dabs, centred on mid grey.
 * Multiplying a surface colour by (texture * 2) adds painterly light/dark variation without shifting its average.
 */
export function paintedDetailTexture(seed = 11, size = 512, dabs = 2600) {
  const rng = new Rng(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  const dab = (x: number, y: number, rx: number, ry: number, rot: number, fill: string) => {
    // draw wrapped copies so the texture tiles without seams
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      if (x + ox + rx < 0 || x + ox - rx > size || y + oy + rx < 0 || y + oy - rx > size) continue;
      g.save(); g.translate(x + ox, y + oy); g.rotate(rot);
      g.fillStyle = fill; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  // broad washes, then short strokes, then fine flecks
  for (let i = 0; i < 90; i++) {
    const v = rng.chance(0.5) ? 255 : 0;
    dab(rng.range(0, size), rng.range(0, size), rng.range(40, 110), rng.range(25, 70), rng.range(0, Math.PI), `rgba(${v},${v},${v},${rng.range(0.03, 0.07)})`);
  }
  for (let i = 0; i < dabs; i++) {
    const v = rng.chance(0.55) ? 255 : 0;
    const len = rng.range(5, 18);
    dab(rng.range(0, size), rng.range(0, size), len, len * rng.range(0.25, 0.45), rng.range(-0.5, 0.5) + (rng.chance(0.5) ? 0 : Math.PI / 2), `rgba(${v},${v},${v},${rng.range(0.05, 0.14)})`);
  }
  for (let i = 0; i < 1400; i++) {
    const v = rng.chance(0.5) ? 255 : 0;
    dab(rng.range(0, size), rng.range(0, size), rng.range(1, 2.6), rng.range(1, 2.6), 0, `rgba(${v},${v},${v},${rng.range(0.08, 0.2)})`);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/**
 * Adds world-space painterly detail to a Lambert/Toon/Standard material:
 * two scales of the detail texture modulate the diffuse colour. `strength` 0..1.
 */
export function addGroundDetail(material: THREE.Material, tex: THREE.Texture, opts: { scaleA?: number; scaleB?: number; strength?: number; roads?: ExclusionMask; roadColor?: THREE.ColorRepresentation } = {}) {
  const uniforms = {
    uDetail: { value: tex },
    uDetailScale: { value: new THREE.Vector2(1 / (opts.scaleA ?? 26), 1 / (opts.scaleB ?? 7)) },
    uDetailStrength: { value: opts.strength ?? 0.7 },
    uRoadMap: { value: opts.roads ? opts.roads.texture() : null },
    uRoadInfo: { value: opts.roads ? new THREE.Vector4(opts.roads.xMin, opts.roads.zMin, opts.roads.w * opts.roads.res, opts.roads.h * opts.roads.res) : new THREE.Vector4() },
    uRoadColor: { value: new THREE.Color(opts.roadColor ?? 0x9a8660) },
  };
  if (opts.roads) (material as THREE.Material & { defines: Record<string, string> }).defines = { ...((material as THREE.Material & { defines?: Record<string, string> }).defines ?? {}), USE_ROADS: '' };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld; uniform sampler2D uDetail; uniform vec2 uDetailScale; uniform float uDetailStrength; uniform sampler2D uRoadMap; uniform vec4 uRoadInfo; uniform vec3 uRoadColor;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dA = texture2D(uDetail, vGroundWorld.xz * uDetailScale.x).r;
        float dB = texture2D(uDetail, vGroundWorld.xz * uDetailScale.y + 0.37).r;
        float dM = mix(1.0, (dA * 0.55 + dB * 0.45) * 2.0, uDetailStrength);
        #ifdef USE_ROADS
          // bare earth lanes painted from a world-space mask (crisper than the terrain's vertex colours)
          vec2 ruv = (vGroundWorld.xz - uRoadInfo.xy) / uRoadInfo.zw;
          float road = (ruv.x < 0.0 || ruv.y < 0.0 || ruv.x > 1.0 || ruv.y > 1.0) ? 0.0 : 1.0 - texture2D(uRoadMap, ruv).r;
          diffuseColor.rgb = mix(diffuseColor.rgb, uRoadColor * mix(0.9, 1.1, dA), smoothstep(0.15, 0.6, road));
        #endif
        diffuseColor.rgb *= dM;`);
  };
  material.customProgramCacheKey = () => (opts.roads ? 'ground-detail-roads-v1' : 'ground-detail-v1');
  return uniforms;
}

/**
 * A 2D mask rasterised on a canvas: starts at 1 everywhere, shapes paint 0.
 * Used to keep grass off roads, floors and building footprints. Blur softens the edges.
 */
export class ExclusionMask {
  readonly xMin: number; readonly zMin: number; readonly res: number;
  readonly w: number; readonly h: number;
  private g: CanvasRenderingContext2D;
  private data: Uint8ClampedArray | null = null;

  constructor(xMin: number, xMax: number, zMin: number, zMax: number, res = 1) {
    this.xMin = xMin; this.zMin = zMin; this.res = res;
    this.w = Math.ceil((xMax - xMin) / res); this.h = Math.ceil((zMax - zMin) / res);
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    this.g = c.getContext('2d', { willReadFrequently: true })!;
    this.g.fillStyle = '#fff'; this.g.fillRect(0, 0, this.w, this.h);
    this.g.fillStyle = '#000'; this.g.strokeStyle = '#000';
  }
  private px(x: number) { return (x - this.xMin) / this.res; }
  private pz(z: number) { return (z - this.zMin) / this.res; }

  /** Rectangle centred at (x, z), w along its local x, d along local z, rotated by rotY (same sense as Object3D.rotation.y). */
  rect(x: number, z: number, w: number, d: number, rotY = 0, pad = 0) {
    const g = this.g;
    g.save(); g.translate(this.px(x), this.pz(z)); g.rotate(-rotY);
    g.fillRect(-(w / 2 + pad) / this.res, -(d / 2 + pad) / this.res, (w + pad * 2) / this.res, (d + pad * 2) / this.res);
    g.restore();
    this.data = null;
  }
  circle(x: number, z: number, r: number) {
    const g = this.g;
    g.beginPath(); g.arc(this.px(x), this.pz(z), r / this.res, 0, Math.PI * 2); g.fill();
    this.data = null;
  }
  path(points: Array<{ x: number; z: number }>, width: number) {
    const g = this.g;
    g.lineWidth = width / this.res; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    points.forEach((p, i) => (i ? g.lineTo(this.px(p.x), this.pz(p.z)) : g.moveTo(this.px(p.x), this.pz(p.z))));
    g.stroke();
    this.data = null;
  }
  /** Finish drawing; blurPx softens edges. */
  build(blurPx = 0.6) {
    if (blurPx > 0) {
      const c2 = document.createElement('canvas'); c2.width = this.w; c2.height = this.h;
      const g2 = c2.getContext('2d', { willReadFrequently: true })!;
      g2.filter = `blur(${blurPx}px)`;
      g2.drawImage(this.g.canvas, 0, 0);
      this.data = g2.getImageData(0, 0, this.w, this.h).data;
    } else {
      this.data = this.g.getImageData(0, 0, this.w, this.h).data;
    }
    return this;
  }
  /** The mask as a texture (red channel; 1 open, 0 masked), for shaders that paint roads or paths. */
  texture() {
    if (!this.data) this.build();
    const t = new THREE.DataTexture(new Uint8Array(this.data!.buffer.slice(0)), this.w, this.h, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  }

  /** 0 (masked) .. 1 (open); the soft edge is kept short so nothing grows through paving */
  at(x: number, z: number) {
    if (!this.data) this.build();
    const i = Math.floor(this.px(x)), j = Math.floor(this.pz(z));
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return 1;
    const v = this.data![(j * this.w + i) * 4] / 255;
    return v < 0.35 ? 0 : (v - 0.35) / 0.65;
  }
}
