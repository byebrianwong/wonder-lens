import * as THREE from 'three';
import { box, cyl, mesh } from '../../../engine/Builders';
import { Painter, boxUV, charToon, repeatUV } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import type { HeightGrid } from '../../../engine/HeightGrid';
import { css } from '../../ghibli/characterTextures';
import { clayTiles, doorBoards, fieldstone } from './paint';
import { optimize } from '../common';

/*
 * Scenery for Howl's meadow: the ring of painted snowy peaks round the valley (two bands at different
 * distances, so they part a little as the rider moves), the still mountain lake that mirrors the sky, the peaks
 * and the walking castle, and Howl's childhood hut with its windmill.
 */

/** The shared sky uniforms (see engine/Sky.ts), so the lake reflects the sky exactly as it is drawn. */
export interface SkyU {
  topColor: { value: THREE.Color }; midColor: { value: THREE.Color }; bottomColor: { value: THREE.Color }; horizonColor: { value: THREE.Color };
  horizonHeight: { value: number }; sunDir: { value: THREE.Vector3 }; sunColor: { value: THREE.Color }; sunGlow: { value: number };
}

/** The sky's uniforms, found on the sky dome in the scene; a golden-hour stand-in if there is none. */
export function findSky(scene: THREE.Scene): SkyU {
  for (const o of scene.children) {
    const u = ((o as THREE.Mesh).material as THREE.ShaderMaterial | undefined)?.uniforms;
    if (u && u.topColor && u.midColor && u.bottomColor && u.horizonColor && u.sunDir && u.sunColor && u.sunGlow && u.horizonHeight) return u as unknown as SkyU;
  }
  return {
    topColor: { value: new THREE.Color(0x3a78c8) }, midColor: { value: new THREE.Color(0xa8d0e8) }, bottomColor: { value: new THREE.Color(0xffe2b4) },
    horizonColor: { value: new THREE.Color(0xead8b8) }, horizonHeight: { value: 0.08 }, sunDir: { value: new THREE.Vector3(-0.55, 0.28, -0.79).normalize() },
    sunColor: { value: new THREE.Color(0xffd090) }, sunGlow: { value: 0.9 },
  };
}

// ---------------------------------------------------------------- the painted peaks
/** A band of painted mountains: a cylinder of radius `r` round `c`, from `y0` to `y0 + h`. */
export interface Band { tex: THREE.Texture; r: number; y0: number; h: number }

/** The valley's two mountain bands: snowy peaks far away, forested ridges in front of them. */
export const PANO = { cx: 0, cz: -1680, far: { r: 450, y0: -30, h: 260 }, near: { r: 360, y0: -30, h: 115 } };

/** Direction (x, z) of a texture column u on a band, matching three's CylinderGeometry (x = sin, z = cos). */
const dirOf = (u: number) => [Math.sin(u * TAU), Math.cos(u * TAU)] as const;

/**
 * The far band: a full circle of snowy peaks. Each peak has a sunlit flank and a shadowed one, decided by
 * where the sun is (ahead and to the left); peaks against the sun get a bright rim along the ridge.
 */
function paintPeaks(sun: THREE.Vector3) {
  const W = 2048, H = 512, B = PANO.far;
  const p = new Painter(W, H, 811);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, W, H);
  const yPix = (y: number) => H - ((y - B.y0) / B.h) * H;
  const S = sun.clone().normalize();
  // peaks: bigger ahead and to the sides, smaller behind (u = 0 is behind the rider, u = 0.5 ahead)
  const peaks: Array<{ u: number; top: number; w: number; base: number }> = [];
  let u = 0;
  while (u < 1) {
    const ahead = 0.5 - 0.5 * Math.cos(u * TAU);
    peaks.push({ u, top: lerp(70, 205, ahead * 0.7 + 0.3 * rng.next()) * rng.range(0.8, 1.08), w: rng.range(0.022, 0.05), base: rng.range(38, 52) });
    u += rng.range(0.018, 0.04);
  }
  // tallest first, so lower peaks (painted as nearer) overlap them
  peaks.sort((a, b) => b.top - a.top);
  const snowLit = new THREE.Color(0xfff2e6), snowShade = new THREE.Color(0x9aa6cc), rockLit = new THREE.Color(0xb89a86), rockShade = new THREE.Color(0x5a6488);
  const forest = new THREE.Color(0x3a5a5a), haze = new THREE.Color(0xd8d0c8), rim = new THREE.Color(0xffe0a8);
  const c = new THREE.Color();
  const cssOf = (col: THREE.Color) => `#${col.getHexString()}`;
  for (const pk of peaks) {
    const [dx, dz] = dirOf(pk.u);
    const d = new THREE.Vector3(dx, 0, dz), t = new THREE.Vector3(dz, 0, -dx);
    const flank = (s: number) => clamp(new THREE.Vector3().addScaledVector(d, -0.55).addScaledVector(t, 0.75 * s).add(new THREE.Vector3(0, 0.35, 0)).normalize().dot(S), -1, 1);
    const litL = smoothstep(-0.15, 0.55, flank(-1)), litR = smoothstep(-0.15, 0.55, flank(1));
    const backlit = smoothstep(0.2, 0.7, d.dot(new THREE.Vector3(S.x, 0, S.z).normalize()));
    const near = 1 - (pk.top - 70) / 160;
    // random shape decided once, so the copies drawn across the wrap-around seam match
    const N = 26;
    const jags = Array.from({ length: N + 1 }, (_, i) => (rng.next() - 0.5) * 14 * (1 - Math.abs((i / N) * 2 - 1) * 0.5));
    const wiggle = Array.from({ length: 48 }, () => rng.next() - 0.5);
    const streaks = Array.from({ length: 9 }, () => ({ x: rng.range(-1, 1), y: rng.range(0.45, 0.85), a: rng.range(0.25, 0.6), dx: rng.range(-8, 8), len: rng.range(30, 80) }));
    const litSide = litR >= litL ? 1 : -1;
    for (const off of [-W, 0, W]) {
      const x0 = pk.u * W + off;
      if (x0 + pk.w * W * 1.6 < 0 || x0 - pk.w * W * 1.6 > W) continue;
      // the silhouette: a jagged peak falling away to both sides
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= N; i++) {
        const k = (i / N) * 2 - 1;
        const fall = Math.pow(Math.abs(k), 0.85);
        const jag = jags[i] + Math.sin(k * 9 + pk.u * 50) * 6;
        const y = pk.base + (pk.top - pk.base) * (1 - fall) + jag * (Math.abs(k) > 0.05 ? 1 : 0);
        pts.push([x0 + k * pk.w * W * 1.6, yPix(y)]);
      }
      const outline = () => { g.beginPath(); g.moveTo(pts[0][0], H); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(pts[N][0], H); g.closePath(); };
      const grad = (lit: number) => {
        const gr = g.createLinearGradient(0, yPix(pk.top), 0, yPix(pk.base - 20));
        const snowT = clamp((pk.top - 95) / (pk.top - pk.base), 0.12, 0.7);
        gr.addColorStop(0, cssOf(c.copy(snowShade).lerp(snowLit, lit)));
        gr.addColorStop(snowT, cssOf(c.copy(snowShade).lerp(snowLit, lit * 0.9)));
        gr.addColorStop(Math.min(0.95, snowT + 0.08), cssOf(c.copy(rockShade).lerp(rockLit, lit)));
        gr.addColorStop(1, cssOf(c.copy(forest).lerp(haze, 0.35)));
        return gr;
      };
      outline(); g.fillStyle = grad(Math.min(litL, litR)); g.fill();
      g.save(); outline(); g.clip();
      // the lit flank: everything on one side of a ridge line that wanders down from the summit
      const sx = pts[N / 2][0], sy = pts[N / 2][1];
      g.beginPath(); g.moveTo(sx, sy);
      let rx = sx, wi = 0;
      for (let y = sy; y < H; y += 12) { rx += wiggle[wi++ % wiggle.length] * 10 - litSide * 1.5; g.lineTo(rx, y); }
      g.lineTo(sx + litSide * pk.w * W * 2, H); g.lineTo(sx + litSide * pk.w * W * 2, sy - 10); g.closePath();
      g.fillStyle = grad(Math.max(litL, litR)); g.fill();
      // gullies of rock running down through the snow, and snow fingers down into the rock
      streaks.forEach((st, k) => {
        const gx = sx + st.x * pk.w * W * 0.9, gy = yPix(lerp(pk.base, pk.top, st.y));
        g.fillStyle = k % 2 ? `rgba(70,80,110,${st.a * 0.75})` : `rgba(250,246,244,${st.a})`;
        g.beginPath(); g.moveTo(gx - 3, gy); g.lineTo(gx + 3, gy); g.lineTo(gx + st.dx, gy + st.len); g.fill();
      });
      g.restore();
      // a bright rim along the ridge where the sun is behind the peak
      if (backlit > 0.05) {
        g.strokeStyle = cssOf(rim); g.globalAlpha = 0.85 * backlit; g.lineWidth = 3;
        g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y + 1.5) : g.moveTo(x, y + 1.5))); g.stroke();
        g.globalAlpha = 1;
      }
      // the taller (further) peaks are hazier
      g.save(); outline(); g.clip();
      g.fillStyle = `rgba(216,208,200,${0.18 * (1 - near)})`; g.fillRect(0, 0, W, H);
      g.restore();
    }
  }
  // haze over the lower slopes, and a solid forested foot so the band is opaque down to its bottom
  g.globalCompositeOperation = 'source-atop';
  const hz = g.createLinearGradient(0, yPix(110), 0, H);
  hz.addColorStop(0, 'rgba(216,208,200,0)'); hz.addColorStop(0.7, 'rgba(206,204,200,0.55)'); hz.addColorStop(1, 'rgba(190,196,196,0.7)');
  g.fillStyle = hz; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#9aa8b0'; g.fillRect(0, yPix(50), W, H);
  g.globalCompositeOperation = 'source-over';
  // a few soft cloud banks hugging the peaks
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, W), y = yPix(rng.range(70, 140));
    for (let k = 0; k < 7; k++) {
      const bx = x + rng.range(-60, 60), by = y + rng.range(-8, 8), r = rng.range(14, 30);
      // (each blob is drawn at all three wrap offsets with the same values)
      const gr = g.createRadialGradient(bx, by - r * 0.3, 2, bx, by, r);
      gr.addColorStop(0, 'rgba(255,250,244,0.75)'); gr.addColorStop(1, 'rgba(240,236,236,0)');
      g.fillStyle = gr;
      for (const off of [-W, 0, W]) { g.beginPath(); g.ellipse(bx + off, by, r * 1.8, r, 0, 0, TAU); g.fill(); }
    }
  }
  return p.texture();
}

/** The near band: two or three layers of forested ridges, darker and nearer at the bottom. */
function paintRidges(sun: THREE.Vector3) {
  const W = 2048, H = 256, B = PANO.near;
  const p = new Painter(W, H, 821);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, W, H);
  const yPix = (y: number) => H - ((y - B.y0) / B.h) * H;
  const S = sun.clone().setY(0).normalize();
  const layers = [
    { lo: 52, hi: 78, col: 0x6a8a8a, tips: 0x5a7a7a },
    { lo: 44, hi: 66, col: 0x46705a, tips: 0x3a604a },
    { lo: 38, hi: 54, col: 0x2f5a3a, tips: 0x264a30 },
  ];
  layers.forEach((L, li) => {
    const ph = rng.range(0, TAU), ph2 = rng.range(0, TAU);
    const top = (x: number) => {
      const u = x / W;
      const y = lerp(L.lo, L.hi, 0.5 + 0.3 * Math.sin(u * TAU * 3 + ph) + 0.2 * Math.sin(u * TAU * 7 + ph2));
      return yPix(y);
    };
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) g.lineTo(x, top(x));
    g.lineTo(W, H); g.closePath();
    // the sunny side of the valley is a little warmer
    const gr = g.createLinearGradient(0, yPix(L.hi), 0, H);
    gr.addColorStop(0, css(L.col, 1.1)); gr.addColorStop(1, css(L.col, 0.75, 0x9aa8a8, 0.35));
    g.fillStyle = gr; g.fill();
    // light falling across each column, from the sun
    for (let x = 0; x < W; x += 4) {
      const [dx, dz] = dirOf(x / W);
      const lit = clamp(-(dx * S.x + dz * S.z), 0, 1);
      g.fillStyle = `rgba(255,220,160,${0.12 * lit})`; g.fillRect(x, top(x), 4, H);
    }
    // conifer tips along the ridge line
    g.fillStyle = css(L.tips);
    for (let x = 0; x < W; x += rng.range(2.5, 5)) {
      const y = top(x), h = rng.range(5, 12) * (1 + li * 0.25), w = h * 0.35;
      g.beginPath(); g.moveTo(x - w, y + 4); g.lineTo(x, y - h); g.lineTo(x + w, y + 4); g.fill();
    }
    // haze over the far layers
    if (li < 2) { g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(214,210,200,${0.3 - li * 0.12})`; g.fillRect(0, 0, W, H); g.restore(); }
  });
  return p.texture();
}

/**
 * Painted band material: unlit (the light is painted in), with the scene's fog at a fraction of its density
 * so the peaks stay readable through the valley's haze.
 */
function bandMaterial(tex: THREE.Texture, fogScale: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.002 }, uFogScale: { value: fogScale } },
    side: THREE.BackSide, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vDepth;
      void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uFogScale;
      varying vec2 vUv; varying float vDepth;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.02) discard;
        float d = uFogDensity * uFogScale * vDepth;
        vec3 col = mix(t.rgb, uFogColor, clamp(1.0 - exp(-d * d), 0.0, 1.0));
        gl_FragColor = vec4(col, t.a);
      }
    `,
  });
}

export interface Mountains { group: THREE.Group; far: Band; near: Band; update(fog: THREE.FogExp2 | null, camPos: THREE.Vector3): void }

/** Both bands of painted mountains round the valley. */
export function buildMountains(sun: THREE.Vector3): Mountains {
  const group = new THREE.Group();
  const mk = (tex: THREE.Texture, b: { r: number; y0: number; h: number }, fogScale: number, order: number) => {
    tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, b.h, 160, 1, true), bandMaterial(tex, fogScale));
    m.position.set(PANO.cx, b.y0 + b.h / 2, PANO.cz);
    m.renderOrder = order;
    m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const farTex = paintPeaks(sun), nearTex = paintRidges(sun);
  const farM = mk(farTex, PANO.far, 0.42, -502), nearM = mk(nearTex, PANO.near, 0.5, -501);
  return {
    group, far: { tex: farTex, ...PANO.far }, near: { tex: nearTex, ...PANO.near },
    update(fog) {
      for (const m of [farM, nearM]) {
        const u = (m.material as THREE.ShaderMaterial).uniforms;
        if (fog) { u.uFogColor.value.copy(fog.color); u.uFogDensity.value = fog.density; }
      }
    },
  };
}

// ---------------------------------------------------------------- the mirror lake
/**
 * Still mountain water. The reflection is worked out in the shader: the sky (from the sky's own uniforms),
 * the two painted mountain bands (the reflected ray is traced out to each cylinder), and the walking castle as
 * two soft ellipsoids, so the castle's dark bulk shows upside down in the water as it wades past. A light breeze
 * roughens the surface in drifting patches; shallow water near the shore shows the bed and fades out.
 */
export class MirrorLake {
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: Record<string, THREE.IUniform>;
  constructor(heights: HeightGrid, sky: SkyU, mountains: Mountains) {
    this.uniforms = {
      uTime: { value: 0 },
      uHeightMap: { value: heights.texture() }, uHeightInfo: { value: new THREE.Vector4(heights.xMin, heights.zMin, heights.res, 0) },
      uTop: sky.topColor, uMid: sky.midColor, uBottom: sky.bottomColor, uHorizon: sky.horizonColor, uHorizonH: sky.horizonHeight,
      uSunDir: sky.sunDir, uSunColor: sky.sunColor, uSunGlow: sky.sunGlow,
      uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.002 },
      uPanoC: { value: new THREE.Vector2(PANO.cx, PANO.cz) },
      uFar: { value: mountains.far.tex }, uFarR: { value: new THREE.Vector3(mountains.far.r, mountains.far.y0, mountains.far.h) },
      uNear: { value: mountains.near.tex }, uNearR: { value: new THREE.Vector3(mountains.near.r, mountains.near.y0, mountains.near.h) },
      uDeep: { value: new THREE.Color(0x1a4a5a) }, uShallow: { value: new THREE.Color(0x5a8a6a) },
      // the castle: x, z, yaw, and how much of it to draw (0 hides it)
      uCastle: { value: new THREE.Vector4(0, 0, 0, 0) },
      // its two ellipsoids in its own space: centre (x, y, z) and radii
      uCastleA: { value: new THREE.Vector3(0, 10, 0) }, uCastleAR: { value: new THREE.Vector3(8.5, 6.5, 19) },
      uCastleB: { value: new THREE.Vector3(0, 24, -2) }, uCastleBR: { value: new THREE.Vector3(7, 12, 11) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying float vDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mv = viewMatrix * wp;
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uHeightMap; uniform vec4 uHeightInfo;
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; uniform vec3 uHorizon; uniform float uHorizonH;
        uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunGlow;
        uniform vec3 uFogColor; uniform float uFogDensity;
        uniform vec2 uPanoC; uniform sampler2D uFar; uniform vec3 uFarR; uniform sampler2D uNear; uniform vec3 uNearR;
        uniform vec3 uDeep; uniform vec3 uShallow;
        uniform vec4 uCastle; uniform vec3 uCastleA; uniform vec3 uCastleAR; uniform vec3 uCastleB; uniform vec3 uCastleBR;
        varying vec3 vWorld; varying float vDepth;

        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float ripples(vec2 p) {
          return noise(p * 0.7 + vec2(uTime * 0.21, uTime * 0.13)) * 0.6 + noise(p * 1.9 - vec2(uTime * 0.33, -uTime * 0.17)) * 0.4;
        }
        float ground(vec2 p) {
          ivec2 sz = textureSize(uHeightMap, 0);
          vec2 f = clamp((p - uHeightInfo.xy) / uHeightInfo.z, vec2(0.0), vec2(sz - 1) - 0.001);
          ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
          float h00 = texelFetch(uHeightMap, i, 0).r, h10 = texelFetch(uHeightMap, i + ivec2(1, 0), 0).r;
          float h01 = texelFetch(uHeightMap, i + ivec2(0, 1), 0).r, h11 = texelFetch(uHeightMap, i + ivec2(1, 1), 0).r;
          return mix(mix(h00, h10, t.x), mix(h01, h11, t.x), t.y);
        }
        vec3 skyCol(vec3 d) {
          float h = d.y;
          vec3 c = mix(uBottom, uMid, smoothstep(-0.05, 0.25, h));
          c = mix(c, uTop, smoothstep(0.2, 0.85, h));
          c = mix(uHorizon, c, smoothstep(-0.02, max(uHorizonH, 0.01), h));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          c += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 40.0) * 0.48) * uSunGlow;
          return c;
        }
        // a reflected ray from o along d, traced out to a band of painted mountains (inside a cylinder)
        vec4 band(sampler2D tex, vec3 r, vec3 o, vec3 d, out float dist) {
          vec2 O = o.xz - uPanoC, D = d.xz;
          float a = max(dot(D, D), 1e-5), b = 2.0 * dot(O, D), c = dot(O, O) - r.x * r.x;
          float t = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
          dist = t;
          vec3 h = o + d * t;
          vec2 hp = h.xz - uPanoC;
          float u = atan(hp.x, hp.y) / 6.2831853;
          float v = (h.y - r.y) / r.z;
          if (v > 1.0) return vec4(0.0);
          return texture2D(tex, vec2(fract(u), clamp(v, 0.002, 0.998)));
        }
        // nearest hit of a ray with an ellipsoid (centre c, radii r), or -1
        float ellip(vec3 o, vec3 d, vec3 c, vec3 r) {
          vec3 oc = (o - c) / r, dd = d / r;
          float a = dot(dd, dd), b = dot(oc, dd), k = dot(oc, oc) - 1.0;
          float h = b * b - a * k;
          if (h < 0.0) return -1.0;
          return (-b - sqrt(h)) / a;
        }
        void main() {
          vec3 V = normalize(cameraPosition - vWorld);
          float dist = vDepth;
          vec2 p = vWorld.xz;
          // a mirror with a breath of wind: ripples only in slowly drifting patches
          float breeze = smoothstep(0.45, 0.8, noise(p * 0.025 + vec2(uTime * 0.012, -uTime * 0.008)));
          float amp = (0.05 + 0.3 * breeze) * (1.0 - smoothstep(25.0, 140.0, dist));
          float e = 0.14;
          float r0 = ripples(p), rx = ripples(p + vec2(e, 0.0)), rz = ripples(p + vec2(0.0, e));
          vec3 n = normalize(vec3(-(rx - r0) / e * amp, 1.0, -(rz - r0) / e * amp));
          vec3 R = reflect(-V, n);
          R.y = max(R.y, 0.004);
          R = normalize(R);
          // the reflection: sky, far peaks, near ridges, then the castle in front of them all
          vec3 refl = skyCol(R);
          float dA, dB;
          vec4 fa = band(uFar, uFarR, vWorld, R, dA);
          float fogA = uFogDensity * 0.42 * (dA + dist);
          refl = mix(refl, mix(fa.rgb, uFogColor, clamp(1.0 - exp(-fogA * fogA), 0.0, 1.0)), fa.a);
          vec4 fb = band(uNear, uNearR, vWorld, R, dB);
          float fogB = uFogDensity * 0.5 * (dB + dist);
          refl = mix(refl, mix(fb.rgb, uFogColor, clamp(1.0 - exp(-fogB * fogB), 0.0, 1.0)), fb.a);
          if (uCastle.w > 0.0) {
            // the ray in the castle's own space (it stands at uCastle.xy, turned by uCastle.z)
            float cs = cos(uCastle.z), sn = sin(uCastle.z);
            vec3 o = vWorld - vec3(uCastle.x, 0.0, uCastle.y);
            vec3 ol = vec3(cs * o.x - sn * o.z, o.y, sn * o.x + cs * o.z);
            vec3 dl = vec3(cs * R.x - sn * R.z, R.y, sn * R.x + cs * R.z);
            float ta = ellip(ol, dl, uCastleA, uCastleAR), tb = ellip(ol, dl, uCastleB, uCastleBR);
            float tc = ta > 0.0 && (tb < 0.0 || ta < tb) ? ta : tb;
            if (tc > 0.0) {
              vec3 hit = ol + dl * tc;
              vec3 cn = tc == ta ? normalize((hit - uCastleA) / (uCastleAR * uCastleAR)) : normalize((hit - uCastleB) / (uCastleBR * uCastleBR));
              vec3 sunL = vec3(cs * uSunDir.x - sn * uSunDir.z, uSunDir.y, sn * uSunDir.x + cs * uSunDir.z);
              float lit = clamp(dot(cn, normalize(sunL)), 0.0, 1.0);
              vec3 cc = mix(vec3(0.07, 0.065, 0.075), vec3(0.42, 0.3, 0.22) * uSunColor, lit * 0.8);
              // a few warm window glints
              cc += vec3(1.0, 0.6, 0.25) * step(0.93, noise(hit.xy * vec2(0.9, 0.7) + hit.z * 0.3)) * 0.6;
              float fogC = uFogDensity * (tc + dist);
              cc = mix(cc, uFogColor, clamp(1.0 - exp(-fogC * fogC), 0.0, 1.0));
              refl = mix(refl, cc, 0.9 * uCastle.w);
            }
          }
          // the water itself: clear over the bed near the shore, deep blue-green further out
          float depth = max(-ground(p), 0.0);
          float shallow = exp(-depth * 0.7);
          vec3 body = mix(uDeep, uShallow, shallow);
          float NV = clamp(dot(V, n), 0.0, 1.0);
          float fres = 0.42 + 0.58 * pow(1.0 - NV, 3.0);
          fres *= mix(1.0, 0.55, shallow);
          vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
          // sun glitter where the breeze roughens the water
          vec3 Hh = normalize(V + normalize(uSunDir));
          col += uSunColor * pow(clamp(dot(n, Hh), 0.0, 1.0), 260.0) * (1.0 + 4.0 * breeze) * 1.6;
          float fog = uFogDensity * dist;
          col = mix(col, uFogColor, clamp(1.0 - exp(-fog * fog), 0.0, 1.0));
          // fade out over the last few centimetres of depth, so the shoreline is soft
          float alpha = smoothstep(0.0, 0.35, depth) * mix(0.97, 0.7, shallow);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
  }

  /** Per frame: time, fog, and where the castle is (pass null to leave it out of the reflection). */
  update(t: number, fog: THREE.FogExp2 | null, castle: { x: number; z: number; yaw: number; lift: number } | null) {
    const u = this.uniforms;
    u.uTime.value = t;
    if (fog) { (u.uFogColor.value as THREE.Color).copy(fog.color); u.uFogDensity.value = fog.density; }
    const c = u.uCastle.value as THREE.Vector4;
    if (!castle) { c.w = 0; return; }
    // the shader turns world points into the castle's space by undoing its yaw
    c.set(castle.x, castle.z, castle.yaw, 1);
    (u.uCastleA.value as THREE.Vector3).set(0, 10 + castle.lift, 0);
    (u.uCastleB.value as THREE.Vector3).set(0, 24 + castle.lift, -2);
  }
}

// ---------------------------------------------------------------- Howl's hut and windmill
export interface Hut { group: THREE.Group; wheel: THREE.Group; door: THREE.Vector3; update(dt: number, t: number): void; whirl(): void }

/**
 * Howl's childhood hut by the lake: a little timber cottage on a stone footing with a steep tiled roof, a
 * chimney and a porch, a short jetty out into the water, and beside it a windmill on a lattice tower whose
 * many-bladed wheel turns in the breeze. Built facing +z; place and turn it as a whole.
 */
export function buildHut(rng: Rng): Hut {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const wood = charToon({ map: doorBoards(0x8a6440, 951), rim: 0.2 });
  const darkWood = charToon({ color: 0x5a3e28, rim: 0.2 });
  const stone = charToon({ map: fieldstone(0x9a9488, 953), rim: 0.15 });
  const roofTex = clayTiles(0xa8503a, 955);
  const roof = charToon({ map: roofTex, rim: 0.2, side: THREE.DoubleSide });
  const white = charToon({ color: 0xece4d4, rim: 0.3 });
  const glass = charToon({ color: 0x2a3a50, emissive: new THREE.Color(0x0a1420), rim: 0.1 });
  const W = 5, D = 6, Hh = 3.4;
  // stone footing, plank walls (one board tile per wall), a door and two windows
  g.add(mesh(boxUV(new THREE.BoxGeometry(W + 0.4, 0.8, D + 0.4), 3), stone, 0, 0.4, 0));
  const walls = new THREE.BoxGeometry(W, Hh, D);
  repeatUV(walls, 1, 1);
  g.add(mesh(walls, wood, 0, 0.8 + Hh / 2, 0));
  // the roof: two steep slopes and gable ends
  const pitch = 0.75, rl = (W / 2 + 0.5) / Math.cos(pitch);
  for (const s of [-1, 1]) {
    const slope = mesh(boxUV(new THREE.BoxGeometry(rl, 0.16, D + 1.0), 3), roof, s * (W / 4 + 0.12), 0.8 + Hh + Math.sin(pitch) * rl / 2 - 0.1, 0);
    slope.rotation.z = -s * pitch;
    g.add(slope);
  }
  const gable = new THREE.Shape(); gable.moveTo(-W / 2, 0); gable.lineTo(W / 2, 0); gable.lineTo(0, Math.tan(pitch) * W / 2); gable.closePath();
  const gableGeo = new THREE.ShapeGeometry(gable);
  for (const s of [-1, 1]) { const gm = mesh(gableGeo, wood, 0, 0.8 + Hh, s * D / 2); gm.rotation.y = s > 0 ? 0 : Math.PI; g.add(gm); }
  // chimney
  g.add(mesh(boxUV(new THREE.BoxGeometry(0.8, 2.6, 0.8), 2), stone, -1.2, 0.8 + Hh + 1.6, -1.2));
  // door and porch on the front (+z)
  g.add(box(1.1, 2.1, 0.12, darkWood, 0.8, 0.8 + 1.05, D / 2 + 0.06));
  g.add(box(2.6, 0.14, 1.4, darkWood, 0.8, 0.8 + 2.5, D / 2 + 0.7));
  for (const s of [-1, 1]) g.add(cyl(0.07, 0.07, 2.5, darkWood, 0.8 + s * 1.15, 0.8 + 1.25, D / 2 + 1.3, 6));
  g.add(box(2.6, 0.12, 1.6, darkWood, 0.8, 0.86, D / 2 + 0.8));
  // windows with white frames and cross bars
  const win = (x: number, y: number, z: number, ry: number) => {
    const w = new THREE.Group();
    w.add(box(1.0, 0.9, 0.08, glass, 0, 0, 0), box(1.15, 0.1, 0.12, white, 0, 0.48, 0.02), box(1.15, 0.1, 0.12, white, 0, -0.48, 0.02), box(0.1, 0.95, 0.12, white, -0.55, 0, 0.02), box(0.1, 0.95, 0.12, white, 0.55, 0, 0.02), box(0.06, 0.9, 0.1, white, 0, 0, 0.03), box(1.0, 0.06, 0.1, white, 0, 0, 0.03));
    w.position.set(x, y, z); w.rotation.y = ry; g.add(w);
  };
  win(-1.2, 0.8 + 2.0, D / 2 + 0.05, 0);
  win(W / 2 + 0.05, 0.8 + 2.0, 0.5, Math.PI / 2);
  win(-W / 2 - 0.05, 0.8 + 2.0, -0.8, -Math.PI / 2);
  // a rain barrel, a woodpile and a bench
  g.add(cyl(0.45, 0.4, 1.0, darkWood, W / 2 + 0.6, 0.5, -2.0, 10));
  for (let i = 0; i < 9; i++) { const lg = cyl(0.13, 0.13, 1.4, charToon({ color: 0x9a7048, rim: 0.1 }), -W / 2 - 0.35, 0.2 + Math.floor(i / 3) * 0.26, -2.2 + (i % 3) * 0.28 + (Math.floor(i / 3) % 2) * 0.12, 6); lg.rotation.x = Math.PI / 2; lg.rotation.z = 0; g.add(lg); }
  g.add(box(1.8, 0.1, 0.45, darkWood, -1.3, 0.55, D / 2 + 1.0));
  // the jetty: planks on posts running out behind the hut (-z), into the lake
  for (let i = 0; i < 12; i++) g.add(box(1.8, 0.12, 0.42, darkWood, 1.2, 0.35, -D / 2 - 1.5 - i * 0.5 + rng.range(-0.03, 0.03)));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) g.add(cyl(0.1, 0.1, 2.2, darkWood, 1.2 + s * 0.8, -0.6, -D / 2 - 1.7 - i * 1.8, 6));

  // ---- the windmill: a lattice tower with a wheel of many blades and a tail vane ----
  const mill = new THREE.Group();
  mill.position.set(W / 2 + 3.4, 0, 1.5);
  const TH = 8.5;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const leg = new THREE.Vector3(sx * 1.1, 0, sz * 1.1), top = new THREE.Vector3(sx * 0.32, TH, sz * 0.32);
    const len = leg.distanceTo(top), mid = leg.clone().lerp(top, 0.5);
    const m = cyl(0.07, 0.09, len, white, mid.x, mid.y, mid.z, 5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(leg).normalize());
    mill.add(m);
  }
  // cross braces on each face, every couple of units up
  for (let k = 0; k < 4; k++) {
    const y0 = k * 2.1, y1 = y0 + 2.1, w0 = lerp(1.1, 0.32, y0 / TH), w1 = lerp(1.1, 0.32, y1 / TH);
    for (let f = 0; f < 4; f++) {
      const a = (f / 4) * TAU;
      for (const s of [-1, 1]) {
        const p0 = new THREE.Vector3(s * w0, y0, w0), p1 = new THREE.Vector3(-s * w1, y1, w1);
        const len = p0.distanceTo(p1), mid = p0.clone().lerp(p1, 0.5);
        const brace = cyl(0.03, 0.03, len, white, 0, 0, 0, 4);
        brace.position.copy(mid);
        brace.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
        const holder = new THREE.Group(); holder.rotation.y = a; holder.add(brace); mill.add(holder);
      }
    }
  }
  mill.add(box(0.9, 0.12, 0.9, darkWood, 0, TH, 0));
  // the head: a hub, the wheel facing +z, and a tail vane behind
  const wheel = new THREE.Group();
  wheel.position.set(0, TH + 0.6, 0.6);
  const bladeMat = charToon({ color: 0xd8c8a0, rim: 0.2, side: THREE.DoubleSide });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU;
    const b = box(0.32, 1.5, 0.03, bladeMat, Math.sin(a) * 1.0, Math.cos(a) * 1.0, 0);
    b.rotation.z = -a; b.rotation.y = 0.35;
    const holder = new THREE.Group(); holder.add(b); wheel.add(holder);
  }
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.04, 4, 32), white), new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 4, 16), white));
  wheel.add(cyl(0.16, 0.16, 0.3, darkWood, 0, 0, 0, 8).rotateX(Math.PI / 2));
  mill.add(box(0.12, 0.12, 2.6, darkWood, 0, TH + 0.6, -0.8));
  mill.add(box(0.04, 1.0, 1.4, white, 0, TH + 0.7, -2.2));
  g.add(mill);
  wheel.position.add(mill.position);
  root.add(wheel);
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  optimize(g);
  optimize(wheel);
  let speed = 0.8, whirlT = 0;
  return {
    group: root, wheel, door: new THREE.Vector3(0.8, 1.8, D / 2 + 1.4),
    whirl() { whirlT = 3.2; },
    update(dt, t) {
      whirlT = Math.max(0, whirlT - dt);
      const target = whirlT > 0 ? 9 : 0.8 + Math.sin(t * 0.3) * 0.4;
      speed += (target - speed) * Math.min(1, dt * (whirlT > 0 ? 2.5 : 0.6));
      wheel.rotation.z -= speed * dt;
    },
  };
}
