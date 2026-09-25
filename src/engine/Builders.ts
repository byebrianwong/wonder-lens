import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, clamp, fbm, lerp, smoothstep } from './math';

// ---------- materials ----------
const gradientCache = new Map<number, THREE.DataTexture>();
/** N-step gradient map for MeshToonMaterial (soft cel shading). */
export function gradientMap(steps = 4) {
  let t = gradientCache.get(steps);
  if (t) return t;
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round(lerp(70, 255, i / (steps - 1)));
    data.set([v, v, v, 255], i * 4);
  }
  t = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
  gradientCache.set(steps, t);
  return t;
}
export function toon(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(4), ...opts });
}
export function lambert(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}
export function glow(color: THREE.ColorRepresentation, intensity = 1.6) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c });
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
export const sphere = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0, ws = 14, hs = 10) => mesh(new THREE.SphereGeometry(r, ws, hs), mat, x, y, z);
export const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
export const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);
export const cone = (r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12) => mesh(new THREE.ConeGeometry(r, h, seg), mat, x, y, z);
export const capsule = (r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0) => mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat, x, y, z);

export function ellipsoid(rx: number, ry: number, rz: number, mat: THREE.Material, x = 0, y = 0, z = 0, ws = 18, hs = 14) {
  const m = mesh(new THREE.SphereGeometry(1, ws, hs), mat, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
}

/** Triangular prism roof; width along x, depth along z, ridge along z. */
export function roofGeometry(w: number, d: number, h: number, overhang = 0.3) {
  const hw = w / 2 + overhang, hd = d / 2 + overhang;
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    // front triangle
    -hw, 0, hd, hw, 0, hd, 0, h, hd,
    // back triangle
    hw, 0, -hd, -hw, 0, -hd, 0, h, -hd,
    // left slope
    -hw, 0, -hd, -hw, 0, hd, 0, h, hd, -hw, 0, -hd, 0, h, hd, 0, h, -hd,
    // right slope
    hw, 0, hd, hw, 0, -hd, 0, h, -hd, hw, 0, hd, 0, h, -hd, 0, h, hd,
    // bottom
    -hw, 0, hd, -hw, 0, -hd, hw, 0, -hd, -hw, 0, hd, hw, 0, -hd, hw, 0, hd,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Pagoda style roof: a flared square pyramid with curved eaves. */
export function pagodaRoofGeometry(w: number, h: number, flare = 0.25) {
  const shape: THREE.Vector2[] = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const r = lerp(w / 2, 0.15, Math.pow(t, 0.75));
    const y = lerp(0, h, t) - Math.sin(t * Math.PI) * h * flare * 0.5;
    shape.push(new THREE.Vector2(r, y));
  }
  const g = new THREE.LatheGeometry(shape, 4);
  g.rotateY(Math.PI / 4);
  return g;
}

// ---------- canvas textures ----------
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** A facade with rows of windows; returns colour map and emissive map (windows only). */
export function facadeTextures(opts: { wall: string; window: string; frame?: string; rows: number; cols: number; lit?: number; rng?: Rng; sill?: boolean; shutters?: string }) {
  const rng = opts.rng ?? new Rng(7);
  const W = 256, H = 256;
  const lit = opts.lit ?? 1;
  const draw = (emissive: boolean) => canvasTexture(W, H, (g) => {
    g.fillStyle = emissive ? '#000' : opts.wall;
    g.fillRect(0, 0, W, H);
    if (!emissive) {
      // subtle plaster noise
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.01, 0.05)})`; g.fillRect(rng.range(0, W), rng.range(0, H), rng.range(2, 12), rng.range(2, 12)); }
    }
    const cw = W / opts.cols, ch = H / opts.rows;
    for (let r = 0; r < opts.rows; r++) for (let c = 0; c < opts.cols; c++) {
      const isLit = rng.next() < lit;
      const x = c * cw + cw * 0.3, y = r * ch + ch * 0.22, w = cw * 0.4, h = ch * 0.5;
      if (emissive) { if (isLit) { g.fillStyle = opts.window; g.fillRect(x, y, w, h); } continue; }
      if (opts.frame) { g.fillStyle = opts.frame; g.fillRect(x - 3, y - 3, w + 6, h + 6); }
      g.fillStyle = isLit ? opts.window : '#3a4657';
      g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, h * 0.4);
      if (opts.shutters) { g.fillStyle = opts.shutters; g.fillRect(x - w * 0.45, y, w * 0.38, h); g.fillRect(x + w * 1.07, y, w * 0.38, h); }
      if (opts.sill) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 4, y + h, w + 8, 4); }
    }
  });
  return { map: draw(false), emissiveMap: draw(true) };
}

export function textTexture(text: string, opts: { font?: string; color?: string; bg?: string; w?: number; h?: number; stroke?: string } = {}) {
  const w = opts.w ?? 256, h = opts.h ?? 128;
  return canvasTexture(w, h, (g) => {
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, w, h); }
    g.font = opts.font ?? 'bold 64px serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (opts.stroke) { g.lineWidth = 8; g.strokeStyle = opts.stroke; g.strokeText(text, w / 2, h / 2); }
    g.fillStyle = opts.color ?? '#fff';
    g.fillText(text, w / 2, h / 2);
  });
}

// ---------- path helpers ----------
/** Spatial lookup of a curve so terrain can be flattened near the track. */
export class PathField {
  private pts: THREE.Vector3[] = [];
  private us: number[] = [];
  private grid = new Map<string, number[]>();
  private cell: number;
  constructor(curve: THREE.Curve<THREE.Vector3>, step = 2, cell = 24) {
    this.cell = cell;
    const len = curve.getLength();
    const n = Math.ceil(len / step);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const p = curve.getPointAt(u);
      this.pts.push(p); this.us.push(u);
      const k = this.key(p.x, p.z);
      let list = this.grid.get(k);
      if (!list) { list = []; this.grid.set(k, list); }
      list.push(i);
    }
  }
  private key(x: number, z: number) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  /** nearest sample: distance in xz, its height and u. */
  nearest(x: number, z: number, out = { dist: Infinity, y: 0, u: 0, x: 0, z: 0 }) {
    out.dist = Infinity;
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = this.grid.get(`${cx + dx},${cz + dz}`);
      if (!list) continue;
      for (const i of list) {
        const p = this.pts[i];
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < out.dist) { out.dist = d; out.y = p.y; out.u = this.us[i]; out.x = p.x; out.z = p.z; }
      }
    }
    if (out.dist === Infinity) {
      // far from every cell: coarse scan
      for (let i = 0; i < this.pts.length; i += 8) {
        const p = this.pts[i];
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < out.dist) { out.dist = d; out.y = p.y; out.u = this.us[i]; out.x = p.x; out.z = p.z; }
      }
    }
    return out;
  }
}

// ---------- terrain ----------
export interface TerrainOpts {
  xMin: number; xMax: number; zMin: number; zMax: number;
  res: number;
  height: (x: number, z: number) => number;
  color: (x: number, z: number, y: number, slope: number, out: THREE.Color) => void;
  chunk?: number;
}
/** Chunked heightfield with vertex colours. */
export function buildTerrain(o: TerrainOpts) {
  const group = new THREE.Group();
  const chunk = o.chunk ?? 300;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const c = new THREE.Color();
  for (let z0 = o.zMin; z0 < o.zMax; z0 += chunk) {
    const z1 = Math.min(o.zMax, z0 + chunk);
    for (let x0 = o.xMin; x0 < o.xMax; x0 += chunk) {
      const x1 = Math.min(o.xMax, x0 + chunk);
      const nx = Math.max(1, Math.round((x1 - x0) / o.res)), nz = Math.max(1, Math.round((z1 - z0) / o.res));
      const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        const y = o.height(x, z);
        pos.setY(i, y);
      }
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
        o.color(x, z, pos.getY(i), 1 - nrm.getY(i), c);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const m = new THREE.Mesh(geo, mat);
      m.position.set(cx, 0, cz);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  return group;
}

// ---------- track ----------
/** Two rails plus sleepers following a curve. */
export function buildTrack(curve: THREE.Curve<THREE.Vector3>, opts: { gauge?: number; railColor?: number; sleeperColor?: number; sleeperEvery?: number; ballast?: boolean; segments?: number } = {}) {
  const gauge = opts.gauge ?? 1.5;
  const group = new THREE.Group();
  const len = curve.getLength();
  const segs = opts.segments ?? Math.ceil(len / 1.5);
  const railMat = new THREE.MeshStandardMaterial({ color: opts.railColor ?? 0x6b6f75, metalness: 0.7, roughness: 0.45 });
  const sleeperMat = lambert(opts.sleeperColor ?? 0x5a4634);
  const leftPts: THREE.Vector3[] = [], rightPts: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const sleeperGeo = new THREE.BoxGeometry(gauge + 0.9, 0.16, 0.5);
  const every = opts.sleeperEvery ?? 2.2;
  const sleeperCount = Math.floor(len / every);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const look = new THREE.Matrix4();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    leftPts.push(p.clone().addScaledVector(side, -gauge / 2).add(new THREE.Vector3(0, 0.18, 0)));
    rightPts.push(p.clone().addScaledVector(side, gauge / 2).add(new THREE.Vector3(0, 0.18, 0)));
  }
  for (let i = 0; i < sleeperCount; i++) {
    const u = (i + 0.5) / sleeperCount;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    look.lookAt(new THREE.Vector3(), t, up);
    q.setFromRotationMatrix(look);
    m4.compose(p.clone().add(new THREE.Vector3(0, 0.06, 0)), q, s);
    sleepers.setMatrixAt(i, m4);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  group.add(sleepers);
  const railGeo = (pts: THREE.Vector3[]) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.min(segs, 2400), 0.07, 5, false);
  group.add(new THREE.Mesh(railGeo(leftPts), railMat));
  group.add(new THREE.Mesh(railGeo(rightPts), railMat));
  if (opts.ballast !== false) {
    // a flat ribbon of gravel under the track
    const ribbon = ribbonGeometry(curve, gauge + 2.6, segs, 0.02);
    group.add(new THREE.Mesh(ribbon, lambert(0x8c8478)));
  }
  return group;
}

/** Flat ribbon along a curve (roads, ballast, canal towpaths). */
export function ribbonGeometry(curve: THREE.Curve<THREE.Vector3>, width: number, segs: number, yOffset = 0, uvRepeat = 1) {
  const up = new THREE.Vector3(0, 1, 0);
  const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(t, up).normalize();
    const a = p.clone().addScaledVector(side, -width / 2), b = p.clone().addScaledVector(side, width / 2);
    verts.push(a.x, a.y + yOffset, a.z, b.x, b.y + yOffset, b.z);
    uvs.push(0, u * uvRepeat, 1, u * uvRepeat);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- water ----------
export function waterMaterial(opts: { shallow: THREE.ColorRepresentation; deep: THREE.ColorRepresentation; sky: THREE.ColorRepresentation; opacity?: number; waveScale?: number }) {
  const uniforms = {
    time: { value: 0 },
    shallow: { value: new THREE.Color(opts.shallow) },
    deep: { value: new THREE.Color(opts.deep) },
    skyColor: { value: new THREE.Color(opts.sky) },
    sunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
    sunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    opacity: { value: opts.opacity ?? 0.92 },
    waveScale: { value: opts.waveScale ?? 1 },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.002 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: /* glsl */ `
      uniform float time; uniform float waveScale;
      varying vec3 vWorld; varying vec3 vNormal; varying float vFogDepth;
      void main(){
        vec3 p = position;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float w1 = sin(wp.x * 0.35 * waveScale + time * 0.9) * 0.08;
        float w2 = sin(wp.z * 0.27 * waveScale - time * 0.7 + wp.x * 0.1) * 0.06;
        wp.y += (w1 + w2);
        // analytic normal from the two waves
        float dx = cos(wp.x * 0.35 * waveScale + time * 0.9) * 0.35 * 0.08 + cos(wp.z * 0.27 * waveScale - time * 0.7 + wp.x * 0.1) * 0.1 * 0.06;
        float dz = cos(wp.z * 0.27 * waveScale - time * 0.7 + wp.x * 0.1) * 0.27 * 0.06;
        vNormal = normalize(vec3(-dx, 1.0, -dz));
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 shallow; uniform vec3 deep; uniform vec3 skyColor; uniform vec3 sunDir; uniform vec3 sunColor; uniform float opacity;
      uniform vec3 fogColor; uniform float fogDensity; uniform float time;
      varying vec3 vWorld; varying vec3 vNormal; varying float vFogDepth;
      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(clamp(1.0 - dot(V, vNormal), 0.0, 1.0), 3.0);
        vec3 base = mix(deep, shallow, 0.35 + 0.35 * vNormal.x * 4.0);
        vec3 col = mix(base, skyColor, clamp(fres * 0.9 + 0.25, 0.0, 1.0));
        vec3 H = normalize(V + sunDir);
        float spec = pow(clamp(dot(vNormal, H), 0.0, 1.0), 180.0);
        // broken up sparkle
        float sparkle = sin(vWorld.x * 3.1 + time * 2.0) * sin(vWorld.z * 2.7 - time * 1.6);
        spec *= 0.6 + 0.4 * smoothstep(0.2, 0.9, sparkle);
        col += sunColor * spec * 1.4;
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, opacity);
      }
    `,
  });
  return { material: mat, uniforms };
}

// ---------- vegetation ----------
export interface TreeStyle { trunk: number; canopy: number[]; shape: 'round' | 'cone' | 'broad' | 'poplar' | 'palm'; }
/** Low-poly tree geometry as [trunkGeometry, canopyGeometry], both centred at the base. */
export function treeGeometry(style: TreeStyle, rng: Rng, scale = 1) {
  const trunkH = (style.shape === 'poplar' ? 1.2 : style.shape === 'palm' ? 5 : 2.2) * scale;
  const trunk = new THREE.CylinderGeometry(0.18 * scale, 0.32 * scale, trunkH, 6);
  trunk.translate(0, trunkH / 2, 0);
  const parts: THREE.BufferGeometry[] = [];
  if (style.shape === 'cone') {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry((1.6 - i * 0.35) * scale, 2.2 * scale, 7);
      c.translate(0, trunkH + (0.6 + i * 1.3) * scale, 0);
      parts.push(c);
    }
  } else if (style.shape === 'poplar') {
    const c = new THREE.SphereGeometry(1, 8, 8); c.scale(1.1 * scale, 3.4 * scale, 1.1 * scale); c.translate(0, trunkH + 3 * scale, 0); parts.push(c);
  } else if (style.shape === 'palm') {
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.ConeGeometry(0.5 * scale, 3 * scale, 4);
      leaf.rotateX(Math.PI / 2 + 0.5);
      leaf.rotateY((i / 6) * Math.PI * 2);
      leaf.translate(0, trunkH, 0);
      parts.push(leaf);
    }
  } else {
    const n = style.shape === 'broad' ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const r = (style.shape === 'broad' ? 1.8 : 1.4) * scale * rng.range(0.8, 1.15);
      const s = new THREE.IcosahedronGeometry(r, 1);
      const ang = rng.range(0, Math.PI * 2);
      const off = i === 0 ? 0 : rng.range(0.6, 1.2) * scale;
      s.translate(Math.cos(ang) * off, trunkH + r * 0.75 + (i === 0 ? 0.2 : rng.range(-0.3, 0.8)) * scale, Math.sin(ang) * off);
      parts.push(s);
    }
  }
  const canopy = mergeGeometries(parts, false)!;
  return { trunk, canopy };
}

export interface Placement { x: number; y: number; z: number; scale: number; rot: number; tint?: THREE.Color; }
/** Instanced trunk + canopy pair. */
export function instancedTrees(style: TreeStyle, placements: Placement[], rng: Rng, castShadow = false) {
  const { trunk, canopy } = treeGeometry(style, rng);
  const group = new THREE.Group();
  if (!placements.length) return group;
  const trunkMesh = new THREE.InstancedMesh(trunk, toon(style.trunk), placements.length);
  const canopyMat = toon(0xffffff);
  const canopyMesh = new THREE.InstancedMesh(canopy, canopyMat, placements.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color();
  placements.forEach((pl, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot);
    p.set(pl.x, pl.y, pl.z); s.setScalar(pl.scale);
    m.compose(p, q, s);
    trunkMesh.setMatrixAt(i, m); canopyMesh.setMatrixAt(i, m);
    c.set(style.canopy[i % style.canopy.length]);
    if (pl.tint) c.multiply(pl.tint);
    c.offsetHSL(rng.range(-0.02, 0.02), 0, rng.range(-0.05, 0.05));
    canopyMesh.setColorAt(i, c);
  });
  trunkMesh.instanceMatrix.needsUpdate = true; canopyMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceColor!.needsUpdate = true;
  trunkMesh.castShadow = castShadow; canopyMesh.castShadow = castShadow;
  group.add(trunkMesh, canopyMesh);
  return group;
}

/** Generic instanced mesh from placements with optional per-instance colour. */
export function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, placements: Placement[], colorFn?: (i: number, out: THREE.Color) => void) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, placements.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color();
  placements.forEach((pl, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.rot);
    p.set(pl.x, pl.y, pl.z); s.setScalar(pl.scale);
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    if (colorFn) { colorFn(i, c); im.setColorAt(i, c); }
  });
  im.count = placements.length;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  return im;
}

/** Wind-swaying grass blades (instanced quads with a vertex shader). */
export function grassField(placements: Placement[], opts: { base: THREE.ColorRepresentation; tip: THREE.ColorRepresentation; height?: number; width?: number }) {
  const h = opts.height ?? 0.9, w = opts.width ?? 0.14;
  const geo = new THREE.PlaneGeometry(w, h, 1, 2);
  geo.translate(0, h / 2, 0);
  const uniforms = { time: { value: 0 }, base: { value: new THREE.Color(opts.base) }, tip: { value: new THREE.Color(opts.tip) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.002 }, light: { value: new THREE.Color(1, 1, 1) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float time; varying float vH; varying float vFogDepth;
      void main(){
        vH = position.y / ${h.toFixed(3)};
        vec3 p = position;
        p.x *= 1.0 - vH * 0.85;
        vec4 wp = instanceMatrix * vec4(p, 1.0);
        float sway = sin(time * 1.6 + wp.x * 0.35 + wp.z * 0.21) * 0.28 + sin(time * 2.7 + wp.z * 0.5) * 0.12;
        wp.x += sway * vH * vH;
        wp.z += sway * 0.4 * vH * vH;
        vec4 mv = viewMatrix * modelMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 base; uniform vec3 tip; uniform vec3 fogColor; uniform float fogDensity; uniform vec3 light;
      varying float vH; varying float vFogDepth;
      void main(){
        vec3 col = mix(base, tip, vH) * light;
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const im = instanced(geo, mat, placements);
  im.frustumCulled = false;
  return { mesh: im, uniforms };
}

// ---------- clouds ----------
export function cloudGeometry(rng: Rng, size = 1) {
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(4, 8);
  for (let i = 0; i < n; i++) {
    const r = rng.range(3, 6.5) * size;
    const s = new THREE.SphereGeometry(r, 10, 8);
    s.scale(1, 0.62, 1);
    s.translate(rng.range(-8, 8) * size, rng.range(-0.5, 1.6) * size * (i === 0 ? 0 : 1), rng.range(-3, 3) * size);
    parts.push(s);
  }
  const g = mergeGeometries(parts, false)!;
  return g;
}
export function cloudField(rng: Rng, placements: Placement[], color = 0xffffff) {
  const group = new THREE.Group();
  const geos = [cloudGeometry(rng, 1), cloudGeometry(rng, 1.4), cloudGeometry(rng, 0.8), cloudGeometry(rng, 1.9)];
  const mat = toon(color, { transparent: true, opacity: 0.96 });
  for (const geo of geos) {
    const mine = placements.filter((_, i) => geos.indexOf(geo) === i % geos.length);
    if (!mine.length) continue;
    const im = instanced(geo, mat, mine);
    group.add(im);
  }
  return group;
}

// ---------- scattering ----------
export function scatter(rng: Rng, count: number, xMin: number, xMax: number, zMin: number, zMax: number, accept: (x: number, z: number) => boolean, heightAt: (x: number, z: number) => number, scaleRange: [number, number] = [0.8, 1.3]): Placement[] {
  const out: Placement[] = [];
  let tries = 0;
  while (out.length < count && tries < count * 12) {
    tries++;
    const x = rng.range(xMin, xMax), z = rng.range(zMin, zMax);
    if (!accept(x, z)) continue;
    out.push({ x, y: heightAt(x, z), z, scale: rng.range(scaleRange[0], scaleRange[1]), rot: rng.range(0, Math.PI * 2) });
  }
  return out;
}

export const hills = (x: number, z: number, scale = 0.012, amp = 14) => (fbm(x * scale, z * scale, 4) - 0.45) * amp;
export { clamp, smoothstep, lerp };
