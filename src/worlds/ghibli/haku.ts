import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glow } from '../../engine/Builders';
import { charToon, Painter } from '../../engine/Paint';
import { sculpt, profileShape, FlexTube, taperedTube, limbGeometry, outline } from '../../engine/Rig';
import { clamp, lerp, Rng, smoothstep } from '../../engine/math';
import { sphereFur, tealTuft } from './characterTextures';
import type { Character } from './character';

/*
 * Haku as the white dragon from Spirited Away: a long pale jade body with scales that shift colour at the
 * edges, a head with swept-back forked horns, fin-like ears, teal eyes and long whiskers, a flowing teal
 * mane of soft locks behind the head, tufts of fur all along the spine, and a tuft at the tip of the tail.
 * The mane, the tufts, the whiskers and the tail tuft are one mesh of ribbons (`Strands`).
 */

/** Pale jade scales in offset rows, each one tinted a little towards mint, lilac, pearl or sky, with cream belly plates. */
function jadeScales() {
  const W = 256, H = 256;
  const p = new Painter(W, H, 101).fill('#e2efe8');
  const g = p.g;
  // a mint sheen along the back, cooler along the flanks, a warm cream belly
  p.hgrad([[0, '#d6e6e4'], [0.25, '#e2f2e8'], [0.5, '#d6e6e4'], [0.75, '#f2eee0'], [1, '#d6e6e4']]);
  const tints = ['200,240,224', '224,216,246', '250,244,228', '204,230,248', '214,244,232'];
  const rows = 10, cols = 16;
  for (let r = 0; r < rows + 1; r++) for (let c = 0; c < cols + 1; c++) {
    const x = (c + (r % 2) * 0.5) * (W / cols), y = r * (H / rows);
    const u = x / W;
    const belly = Math.max(0, 1 - Math.abs(u - 0.75) / 0.12);
    if (belly > 0.4) continue;
    const rx = (W / cols) * 0.62, ry = (H / rows) * 0.95;
    const tint = p.rng.pick(tints);
    const gr = g.createLinearGradient(x, y - ry, x, y + ry * 0.4);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.55, `rgba(${tint},0.6)`); gr.addColorStop(1, 'rgba(118,168,170,0.42)');
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI); g.fill();
    g.strokeStyle = 'rgba(92,146,150,0.34)'; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0.1, Math.PI - 0.1); g.stroke();
    // a pearly glint on the scale's crown
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(x, y + ry * 0.25, rx * 0.35, ry * 0.18, 0, 0, Math.PI * 2); g.fill();
  }
  // belly plates: cream bands across the underside
  for (let r = 0; r < 12; r++) {
    const y = (r / 12) * H;
    g.fillStyle = 'rgba(246,240,222,0.95)'; g.fillRect(W * 0.64, y, W * 0.22, H / 12 - 3);
    g.fillStyle = 'rgba(170,160,140,0.5)'; g.fillRect(W * 0.64, y + H / 12 - 3, W * 0.22, 3);
  }
  const t = p.texture();
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * One soft lock of hair, in greys so a vertex colour tints it: many fine strands from a wide root (the bottom
 * of the canvas) drawing together to a point (the top), darker at the root. Transparent between strands.
 */
function lockTexture() {
  const W = 64, H = 256;
  const p = new Painter(W, H, 107);
  const g = p.g;
  g.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x0 = W / 2 + p.rng.range(-0.44, 0.44) * W;
    const x1 = W / 2 + (x0 - W / 2) * p.rng.range(0.05, 0.35) + p.rng.range(-3, 3);
    const top = H * p.rng.range(0.0, 0.3);
    const k = p.rng.range(0.8, 1);
    const gr = g.createLinearGradient(0, H, 0, top);
    gr.addColorStop(0, `rgb(${Math.round(150 * k)},${Math.round(150 * k)},${Math.round(150 * k)})`);
    gr.addColorStop(1, `rgb(${Math.round(255 * k)},${Math.round(255 * k)},${Math.round(255 * k)})`);
    g.strokeStyle = gr;
    g.lineWidth = p.rng.range(2.2, 4.6);
    g.beginPath(); g.moveTo(x0, H); g.quadraticCurveTo(x0 + p.rng.range(-6, 6), H * 0.55, x1, top); g.stroke();
  }
  return p.texture({ wrap: false });
}

/** The body's material: the scales shift towards mint, lilac and gold where they turn away from the eye. */
function pearlescent(m: THREE.MeshToonMaterial) {
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', /* glsl */ `
      {
        float pF = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
        vec3 pH = 0.5 + 0.5 * cos( 6.2832 * ( pF * 1.15 + vec3( 0.0, 0.33, 0.67 ) ) );
        outgoingLight *= mix( vec3( 1.0 ), vec3( 0.8 ) + 0.4 * pH, 0.6 * pF );
        outgoingLight += pH * pF * pF * 0.05;
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'charToonPearl1';
  return m;
}

/**
 * Locks of hair, whiskers and tufts as ribbons, all in one mesh. Each ribbon turns about its own centre line
 * to face the camera (in the vertex shader), so it never shows edge on. Set every strand's points, from root
 * to tip, each frame with `set`, then call `commit`.
 */
class Strands {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private tan: Float32Array;
  private nrm: Float32Array;
  private rows: number;
  readonly count: number;
  constructor(count: number, seg: number, widths: number[], colors: THREE.Color[], mat: THREE.Material) {
    this.count = count;
    const rows = (this.rows = seg + 1), nv = count * rows * 2;
    this.pos = new Float32Array(nv * 3); this.tan = new Float32Array(nv * 3); this.nrm = new Float32Array(nv * 3);
    const w = new Float32Array(nv), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const idx: number[] = [];
    for (let s = 0; s < count; s++) for (let k = 0; k < rows; k++) {
      const f = k / seg;
      for (let side = 0; side < 2; side++) {
        const v = (s * rows + k) * 2 + side;
        w[v] = (side ? 1 : -1) * widths[s] * (1 - 0.3 * f);
        uv[v * 2] = side; uv[v * 2 + 1] = f;
        col[v * 3] = colors[s].r; col[v * 3 + 1] = colors[s].g; col[v * 3 + 2] = colors[s].b;
      }
      if (k < seg) { const a = (s * rows + k) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    geo.setAttribute('aTan', new THREE.BufferAttribute(this.tan, 3));
    geo.setAttribute('aW', new THREE.BufferAttribute(w, 1));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }
  /** point k (0 at the root, `seg` at the tip) of strand s */
  set(s: number, k: number, p: THREE.Vector3) {
    const o = (s * this.rows + k) * 6;
    this.pos[o] = this.pos[o + 3] = p.x; this.pos[o + 1] = this.pos[o + 4] = p.y; this.pos[o + 2] = this.pos[o + 5] = p.z;
  }
  /** the normal used to light strand s */
  normal(s: number, n: THREE.Vector3) {
    for (let k = 0; k < this.rows * 2; k++) { const o = (s * this.rows * 2 + k) * 3; this.nrm[o] = n.x; this.nrm[o + 1] = n.y; this.nrm[o + 2] = n.z; }
  }
  /** work out each strand's direction from its points and upload */
  commit() {
    const { pos, tan, rows } = this;
    for (let s = 0; s < this.count; s++) {
      let lx = 0, ly = 1, lz = 0;
      for (let k = 0; k < rows; k++) {
        const a = (s * rows + Math.max(0, k - 1)) * 6, b = (s * rows + Math.min(rows - 1, k + 1)) * 6;
        let x = pos[b] - pos[a], y = pos[b + 1] - pos[a + 1], z = pos[b + 2] - pos[a + 2];
        const l = Math.hypot(x, y, z);
        if (l < 1e-6) { x = lx; y = ly; z = lz; } else { x /= l; y /= l; z /= l; lx = x; ly = y; lz = z; }
        const o = (s * rows + k) * 6;
        tan[o] = tan[o + 3] = x; tan[o + 1] = tan[o + 4] = y; tan[o + 2] = tan[o + 5] = z;
      }
    }
    const at = this.mesh.geometry.attributes;
    at.position.needsUpdate = true; at.aTan.needsUpdate = true; at.normal.needsUpdate = true;
  }
}

/** Toon material for `Strands`: widens each ribbon sideways to the camera. */
function strandMaterial() {
  const m = charToon({ map: lockTexture(), vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide, emissive: 0x0e2c28, rim: 0.3 });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aTan;\nattribute float aW;')
      .replace('#include <project_vertex>', /* glsl */ `#include <project_vertex>
        {
          vec3 stT = mat3( modelViewMatrix ) * aTan;
          stT = dot( stT, stT ) > 1e-12 ? normalize( stT ) : vec3( 0.0, 1.0, 0.0 );
          vec3 stS = cross( stT, -mvPosition.xyz );
          float stL = length( stS );
          stS = stL > 1e-6 ? stS / stL : vec3( 1.0, 0.0, 0.0 );
          // thinner close to the eye, so locks that stream past a rider read as hair rather than a sheet
          mvPosition.xyz += stS * aW * length( modelMatrix[ 0 ].xyz ) * clamp( -mvPosition.z / 3.0, 0.4, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
        }`);
  };
  m.customProgramCacheKey = () => 'charToonStrand1';
  return m;
}

/**
 * The path the head has flown, kept by distance travelled, so the body that follows it is always the
 * same length however fast or slow the dragon flies.
 */
class Trail {
  private p: THREE.Vector3[] = [];
  private d: number[] = [];
  private total = 0;
  push(q: THREE.Vector3) {
    const last = this.p[this.p.length - 1];
    if (last) {
      const step = last.distanceTo(q);
      if (step < 0.04) return;
      this.total += step;
    }
    this.p.push(q.clone());
    this.d.push(this.total);
    // keep a little more than the body length
    while (this.p.length > 2 && this.total - this.d[1] > 40) { this.p.shift(); this.d.shift(); }
  }
  /** the point `back` units behind the newest point along the path (extended straight past the oldest point) */
  sample(back: number, out: THREE.Vector3) {
    const n = this.p.length;
    if (n === 0) return out.set(0, 0, 0);
    if (n === 1) return out.copy(this.p[0]);
    const want = this.total - back;
    if (want <= this.d[0]) {
      // beyond the start of the trail: carry on in the direction of the first stretch
      const dir = new THREE.Vector3().subVectors(this.p[0], this.p[1]).normalize();
      return out.copy(this.p[0]).addScaledVector(dir, this.d[0] - want);
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.d[mid] <= want) lo = mid; else hi = mid; }
    const k = (want - this.d[lo]) / Math.max(1e-6, this.d[hi] - this.d[lo]);
    return out.copy(this.p[lo]).lerp(this.p[hi], k);
  }
  /** start again with a straight body lying behind `head` along -`dir` */
  reset(head: THREE.Vector3, dir: THREE.Vector3) {
    this.p = []; this.d = []; this.total = 0;
    const back = dir.clone().normalize().multiplyScalar(-1);
    for (let i = 30; i >= 0; i--) this.push(head.clone().addScaledVector(back, i * 1.0));
  }
  /** start again along the given points, oldest first */
  seed(pts: THREE.Vector3[]) {
    this.p = []; this.d = []; this.total = 0;
    for (const q of pts) this.push(q);
  }
}

/** Where a rider's world puts the dragon this frame (see `Haku.ride`). */
export interface HakuRide {
  /** the head's position and the direction it flies */
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  /** the head's up; tilt it to bank into a turn (default straight up) */
  up?: THREE.Vector3;
  /** the head turned on the neck, in radians: yaw about its own up (positive turns it to its left), pitch (positive lifts the snout) */
  yaw: number;
  pitch: number;
  /**
   * The head swung out from the flight path by this much (to glance back over his shoulder). The body still
   * follows `pos`; the neck curves out to the head over the first `bend` units behind it.
   */
  offset?: THREE.Vector3;
  bend?: number;
  /** the neck's thickness where it meets the head, as a fraction of the body's (it widens back to full over `bend`) */
  neck?: number;
}

export interface Haku extends Character {
  state: { target: THREE.Vector3; swoopT: number; time: number; seeded: boolean };
  head: THREE.Group;
  /** current flying velocity of the head */
  vel: THREE.Vector3;
  setTarget(p: THREE.Vector3): void;
  swoop(): void;
  /** fastest the dragon may fly right now (units per second); the world raises it to keep up with the train */
  maxSpeed: number;
  /** put the dragon somewhere else at once, flying in direction `dir` */
  teleport(p: THREE.Vector3, dir: THREE.Vector3): void;
  /**
   * Ridden: when set, `update` puts the head exactly here each frame instead of steering towards the
   * target, and the body still follows the path the head has flown. The mane on the neck lies low so a
   * rider can sit there, and the locks stream back in the wind. Null (the default) steers as before.
   */
  ride: HakuRide | null;
  /** 0..1: the scales come away and the body thins to nothing from the tail to the neck, then the head goes (0 = whole) */
  dissolve: number;
  /** the body tube (centre line, frames and radii), for effects that follow the body */
  body: FlexTube;
  /** lay the body along these points (oldest first; the last one is where the head is) */
  seedTrail(pts: THREE.Vector3[]): void;
}


/** What a strand grows from: a body ring, a point on the head, a whisker on the snout, or the tip of the tail. */
type Root = 'body' | 'head' | 'whisker' | 'tail';
interface StrandDef {
  root: Root;
  /** body ring (Body) */
  ring: number;
  /** angle round the body from the top (Body, Tail) */
  a: number;
  /** the root on the head, in the head's space, and which way it leans out (Head, Whisker) */
  at: THREE.Vector3;
  out: THREE.Vector3;
  len: number;
  lift: number;
  phase: number;
}

export function makeHaku(): Haku {
  const g = new THREE.Group();
  const rng = new Rng(4242);
  const shade = 0x9ea8d4;
  const white = pearlescent(charToon({ map: jadeScales(), emissive: 0x24384e, rim: 0.7, shade }));
  const headMat = charToon({ map: sphereFur(0xeef6f1, 105, { w: 512, contrast: 0.35 }).texture(), emissive: 0x24384e, rim: 0.7, shade });
  const teal = charToon({ map: tealTuft(), emissive: 0x143a34, rim: 0.5 });
  const hornMat = charToon({ color: 0xf0e6c8, emissive: 0x2c2a2a, rim: 0.5 });
  const dark = charToon({ color: 0x1a2a30, rim: 0 });
  const ink = 0x1e2638;

  // ----- head: a long, narrow dog-like head with a flat-topped snout -----
  const head = new THREE.Group();
  const shape = profileShape([[1.8, 0], [1.74, 0.13], [1.58, 0.21], [1.2, 0.25], [0.85, 0.28], [0.6, 0.35], [0.32, 0.45], [0.0, 0.5], [-0.32, 0.46], [-0.6, 0.3], [-0.7, 0]], {
    depth: 0.8, // the top of the head (-z before the head is turned to face forward)
    front: () => 0.68, // the underside of the jaw
  });
  const headGeo = sculpt(shape, 40, 28).rotateX(Math.PI / 2);
  const skull = new THREE.Mesh(headGeo, headMat);
  head.add(skull);
  outline(skull, ink, 1.4, 0.03);
  for (const s of [-1, 1]) {
    // brow ridges over the eyes
    const brow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), headMat);
    brow.scale.set(0.09, 0.06, 0.32); brow.position.set(s * 0.23, 0.235, 0.62); brow.rotation.y = s * 0.25;
    head.add(brow);
    // teal eyes with dark pupils, set under the brow and looking forward
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), glow(0x7fe0d0, 1.5));
    eye.scale.set(0.8, 0.75, 1.2); eye.position.set(s * 0.31, 0.16, 0.72);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark);
    pupil.scale.set(0.6, 1, 0.6); pupil.position.set(s * 0.355, 0.165, 0.79);
    head.add(pupil);
    // horns: pale and forked, rising from behind the brows and sweeping back, so they stand out against the sky
    // from behind the head as well as from the side
    const V = (x: number, y: number, z: number) => new THREE.Vector3(s * x, y, z);
    const beam = new THREE.CatmullRomCurve3([V(0.17, 0.32, 0.16), V(0.3, 0.68, -0.06), V(0.46, 1.02, -0.34), V(0.58, 1.22, -0.74), V(0.64, 1.26, -1.06)]);
    const tine = new THREE.CatmullRomCurve3([V(0.34, 0.8, -0.14), V(0.36, 1.04, -0.08), V(0.4, 1.22, -0.16)]);
    head.add(new THREE.Mesh(mergeGeometries([taperedTube(beam, 0.09, 0.014, 18, 8), taperedTube(tine, 0.05, 0.012, 8, 6)])!, hornMat));
    // a fin-like ear behind each eye, swept back
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.6, 8), teal);
    ear.scale.set(1, 1, 0.45);
    ear.position.set(s * 0.44, 0.24, -0.2); ear.rotation.set(-1.15, 0, -s * 0.75);
    head.add(ear);
    // nostril and the line of the mouth along the snout
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark);
    nostril.position.set(s * 0.08, 0.1, 1.72);
    head.add(nostril);
    const lip = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.12, -0.08, 1.7), new THREE.Vector3(s * 0.22, -0.11, 1.25), new THREE.Vector3(s * 0.28, -0.1, 0.8), new THREE.Vector3(s * 0.3, -0.04, 0.55)]);
    head.add(new THREE.Mesh(taperedTube(lip, 0.016, 0.012, 10, 5), dark));
  }
  g.add(head);

  // ----- body: one tube that follows the head's path -----
  const N = 72, SEG = 0.27;
  const body = new FlexTube(N, 16, (k) => lerp(0.42, 0.08, Math.pow(k, 1.5)) * (1 + 0.12 * Math.exp(-(((k - 0.15) / 0.12) ** 2))), white, { uvAlong: 11 });
  g.add(body.mesh);

  // ----- the mane, the fur along the spine, the whiskers and the tail tuft: one mesh of locks -----
  const MANE_END = Math.floor(N * 0.9);
  const defs: StrandDef[] = [];
  const widths: number[] = [], colors: THREE.Color[] = [];
  const maneC = [new THREE.Color(0x4fb8a4), new THREE.Color(0x3aa494), new THREE.Color(0x6ccab4), new THREE.Color(0x2e8f86), new THREE.Color(0x86dcc6)];
  const add = (d: Partial<StrandDef> & { root: Root; len: number }, w: number, c: THREE.Color) => {
    defs.push({ ring: 0, a: 0, at: new THREE.Vector3(), out: new THREE.Vector3(), lift: 0.6, phase: rng.range(0, 6.3), ...d });
    widths.push(w); colors.push(c);
  };
  // the long mane behind the head: a crescent of locks round the back of the skull, longest at the sides
  for (let j = 0; j < 34; j++) {
    const th = lerp(-1.3, 1.3, j / 33) + rng.range(-0.04, 0.04);
    add({ root: 'head', at: new THREE.Vector3(Math.sin(th) * 0.36, 0.3 + Math.cos(th) * 0.14, -0.32 - Math.cos(th) * 0.06), out: new THREE.Vector3(Math.sin(th), 0.4 * Math.cos(th), 0), len: rng.range(1.7, 2.5) + Math.abs(th) * 0.35 }, rng.range(0.14, 0.19), rng.pick(maneC));
  }
  // a cap of mane over the back of the skull, between the horns, lying back over the neck
  for (let j = 0; j < 16; j++) {
    const x = lerp(-0.26, 0.26, (j % 8) / 7) + rng.range(-0.03, 0.03), z = j < 8 ? -0.12 : -0.42;
    add({ root: 'head', at: new THREE.Vector3(x, 0.44 - Math.abs(x) * 0.3 - (j < 8 ? 0 : 0.06), z), out: new THREE.Vector3(x * 1.5, 1, 0), len: rng.range(1.2, 1.7) }, rng.range(0.13, 0.17), rng.pick(maneC));
  }
  // fur on the cheeks and under the jaw, swept back
  for (const s of [-1, 1]) for (let j = 0; j < 5; j++) {
    add({ root: 'head', at: new THREE.Vector3(s * (0.3 + j * 0.02), -0.1 - j * 0.04, 0.15 - j * 0.12), out: new THREE.Vector3(s, -0.5, 0), len: rng.range(0.6, 0.95) }, rng.range(0.13, 0.17), rng.pick(maneC));
  }
  // tufts of fur along the spine, seven fine locks each, lying back and shorter towards the tail
  for (let ring = 1; ring < MANE_END; ring += 2) {
    const a0 = rng.range(-0.15, 0.15), ph = rng.range(0, 6.3), c = rng.pick(maneC);
    for (let j = 0; j < 7; j++) {
      add({ root: 'body', ring: Math.min(MANE_END - 1, ring + (j % 2)), a: a0 + (j - 3) * 0.16 + rng.range(-0.04, 0.04), len: rng.range(0.8, 1.2), lift: rng.range(0.25, 0.55), phase: ph + j * 0.25 }, rng.range(0.08, 0.12), c.clone().lerp(rng.pick(maneC), 0.4));
    }
  }
  // whiskers: a long pair from the sides of the snout and a short pair from the upper lip
  const whiskerC = new THREE.Color(0xcfeee2);
  for (const s of [-1, 1]) {
    add({ root: 'whisker', at: new THREE.Vector3(s * 0.15, -0.02, 1.55), out: new THREE.Vector3(s * 0.25, -0.15, 0), len: 3.6 }, 0.034, whiskerC);
    add({ root: 'whisker', at: new THREE.Vector3(s * 0.22, -0.06, 1.15), out: new THREE.Vector3(s * 0.4, -0.25, 0), len: 1.7 }, 0.026, whiskerC);
  }
  // the tuft at the tip of the tail
  for (let j = 0; j < 11; j++) add({ root: 'tail', a: (j / 11) * Math.PI * 2, len: rng.range(1.0, 1.6), lift: rng.range(0.35, 0.6) }, rng.range(0.2, 0.26), rng.pick(maneC));
  const SEGS = 6;
  const strands = new Strands(defs.length, SEGS, widths, colors, strandMaterial());
  g.add(strands.mesh);

  // ----- legs: upper and lower leg, three claws, a teal tuft at the elbow -----
  const legGeoA = limbGeometry(0.09, 0.07, 0.42, 10, 6), legGeoB = limbGeometry(0.07, 0.05, 0.36, 10, 6);
  const clawGeo = mergeGeometries([-1, 0, 1].map((i) => new THREE.ConeGeometry(0.025, 0.14, 6).rotateX(Math.PI - 0.6).translate(i * 0.05, -0.4, 0.06)))!;
  const legs = [10, 10, 44, 44].map((ring, k) => {
    const hip = new THREE.Group();
    const upper = new THREE.Mesh(legGeoA, headMat);
    const knee = new THREE.Group(); knee.position.y = -0.42;
    knee.add(new THREE.Mesh(legGeoB, headMat), new THREE.Mesh(clawGeo, hornMat));
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 8), teal);
    tuft.position.set(0, -0.05, -0.12); tuft.rotation.x = -2.2;
    knee.add(tuft);
    hip.add(upper, knee);
    g.add(hip);
    return { hip, knee, ring, side: k % 2 ? 1 : -1, phase: k * 1.3 };
  });

  const trail = new Trail();
  const headPos = new THREE.Vector3();
  const vel = new THREE.Vector3(0, 0, 8);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const mBasis = new THREE.Matrix4(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), e = new THREE.Euler();
  const headQ = new THREE.Quaternion();
  let bank = 0;
  const state = { target: new THREE.Vector3(), swoopT: 0, time: 0, seeded: false };
  // ridden mode and the dissolve: the flight direction without the head's glance, the full-size radii
  const flyQ = new THREE.Quaternion(), neckQ = new THREE.Quaternion(), eRide = new THREE.Euler(0, 0, 0, 'YXZ');
  const bendC = new THREE.Vector3(), bendT = new THREE.Vector3();
  const bodyR = body.radii.slice();
  let lastDissolve = 0, lastTaper = 1;
  /** how much of body ring i is left while dissolving: the tail goes first, the neck last */
  const ringLeft = (i: number) => { const at = (1 - i / (N - 1)) * 0.85; return 1 - smoothstep(at, at + 0.1, ch.dissolve); };
  /** scale a part that hangs off the body; hidden at zero, since a zero scale breaks its normals */
  const shrink = (o: THREE.Object3D, k: number) => { o.visible = k > 0.002; o.scale.setScalar(Math.max(k, 0.002)); };
  // strand building
  const sp = new THREE.Vector3(), sd = new THREE.Vector3(), sd0 = new THREE.Vector3(), radial = new THREE.Vector3(), sBack = new THREE.Vector3();
  const hRight = new THREE.Vector3(), hUp = new THREE.Vector3(), sOut = new THREE.Vector3();

  const ch: Haku = {
    group: g, state, head, vel, maxSpeed: 22, ride: null, dissolve: 0, body,
    setTarget(p) { state.target.copy(p); },
    swoop() { state.swoopT = 3.5; },
    teleport(p, dir) {
      headPos.copy(p); vel.copy(dir).normalize().multiplyScalar(10);
      trail.reset(headPos, vel);
      state.seeded = true;
      head.position.copy(headPos);
      head.quaternion.setFromRotationMatrix(mBasis.lookAt(tmp.set(0, 0, 0), vel, up)).multiply(qA.setFromAxisAngle(up, Math.PI));
      headQ.copy(head.quaternion);
    },
    seedTrail(pts) {
      if (!pts.length) return;
      trail.seed(pts);
      headPos.copy(pts[pts.length - 1]);
      head.position.copy(headPos);
      state.seeded = true;
    },
    update(dt, t) {
      state.time = t;
      const ride = ch.ride;
      if (ride) {
        // ridden: the head goes exactly where the rider's world puts it, facing along `dir`, tilted to `up`
        if (!state.seeded) ch.teleport(ride.pos, ride.dir);
        // the trail follows the flight path; the head itself may be swung out from it
        trail.push(ride.pos);
        tmp2.copy(ride.pos);
        if (ride.offset) tmp2.add(ride.offset);
        if (dt > 0) vel.copy(tmp2).sub(headPos).divideScalar(dt);
        headPos.copy(tmp2);
        head.position.copy(headPos);
        mBasis.lookAt(tmp.set(0, 0, 0), ride.dir, ride.up ?? up);
        flyQ.setFromRotationMatrix(mBasis).multiply(qB.setFromAxisAngle(up, Math.PI));
        headQ.copy(flyQ).multiply(qB.setFromEuler(eRide.set(-ride.pitch, ride.yaw, 0, 'YXZ')));
        head.quaternion.copy(headQ);
      } else {
        if (!state.seeded) ch.teleport(state.target.clone().add(tmp.set(0, 0, -20)), tmp2.set(0, 0, 1));
        // steer towards the target with inertia, so the body snakes
        tmp.copy(state.target).sub(headPos);
        const dist = tmp.length();
        const top = ch.maxSpeed + (state.swoopT > 0 ? 12 : 0);
        const desired = tmp.normalize().multiplyScalar(clamp(dist * 1.5, 5, top));
        const prevVel = tmp2.copy(vel);
        vel.lerp(desired, 1 - Math.exp(-dt * 1.7));
        headPos.addScaledVector(vel, dt);
        trail.push(headPos);
        // the head faces where it is flying, turns smoothly and banks into curves
        head.position.copy(headPos);
        if (vel.lengthSq() > 0.01) {
          // Matrix4.lookAt points -z at the target; turn half round so the snout (+z) leads
          mBasis.lookAt(tmp.set(0, 0, 0), vel, up);
          qA.setFromRotationMatrix(mBasis).multiply(qB.setFromAxisAngle(up, Math.PI));
          headQ.slerp(qA, 1 - Math.exp(-dt * 6));
        }
        const turn = prevVel.lengthSq() > 0.01 ? Math.atan2(prevVel.clone().cross(vel).y, prevVel.dot(vel)) / Math.max(dt, 1e-3) : 0;
        bank = lerp(bank, clamp(-turn * 0.5, -0.7, 0.7), 1 - Math.exp(-dt * 3));
        head.quaternion.copy(headQ).multiply(qB.setFromEuler(e.set(Math.sin(t * 2.1) * 0.06, 0, bank + Math.sin(t * 3) * 0.08)));
      }

      // the neck may be slimmer where it meets the head (ridden), and while dissolving the rings thin to
      // nothing from the tail forward, then the head shrinks away
      const dissolving = ch.dissolve > 0 || lastDissolve > 0;
      const bendLen = ride && ride.offset ? (ride.bend ?? 1.9) : 0;
      const taper = ride && bendLen > 0.7 ? (ride.neck ?? 1) : 1;
      if (dissolving || taper !== 1 || lastTaper !== 1) {
        for (let i = 0; i < N; i++) {
          let r = bodyR[i];
          if (dissolving) r *= ringLeft(i);
          if (taper !== 1) r *= lerp(taper, 1, smoothstep(0.55, bendLen + 0.6, i * SEG + 0.55));
          body.radii[i] = r;
        }
        lastTaper = taper;
      }
      const headLeft = dissolving ? 1 - smoothstep(0.85, 1, ch.dissolve) : 1;
      if (dissolving) {
        shrink(head, headLeft);
        lastDissolve = ch.dissolve;
      }

      // body: rings spaced evenly along the path behind the head, with a swimming wave up and down and from side
      // to side (ridden, the neck leaves the back of the head; when the head is swung out the first `bend` units
      // of the neck curve from it back to the flight path, and the rider's seat stays steady)
      const neck = ride
        ? tmp.set(0, 0, -0.5).applyQuaternion(ride.offset ? headQ : neckQ.copy(flyQ).slerp(headQ, 0.4)).add(headPos)
        : tmp.set(0, 0, -0.55).applyQuaternion(head.quaternion).add(headPos);
      if (bendLen > 0.7) {
        // the curve's middle: halfway along the path between the head and the end of the bend, moved half as far as the head
        trail.sample(bendLen, bendT);
        trail.sample(0.55, bendC).lerp(bendT, 0.5).addScaledVector(ride!.offset!, 0.5);
      }
      for (let i = 0; i < N; i++) {
        const p = body.pts[i];
        const d = i * SEG + 0.55;
        trail.sample(d, p);
        if (i === 0) p.copy(neck);
        else if (bendLen > 0.7 && d < bendLen) {
          // a smooth curve from the back of the head to the flight path
          const k = (d - 0.55) / (bendLen - 0.55), a = (1 - k) * (1 - k), b = 2 * (1 - k) * k, c = k * k;
          p.set(neck.x * a + bendC.x * b + bendT.x * c, neck.y * a + bendC.y * b + bendT.y * c, neck.z * a + bendC.z * b + bendT.z * c);
        }
        // the wave travels down the body; it grows from the neck back (ridden, it starts behind the rider)
        const amp = ride ? smoothstep(5, 22, i) : Math.min(1, i / 8);
        const ph = t * 2.6 - i * 0.16;
        p.y += Math.sin(ph) * 0.24 * amp;
        // side to side, along last frame's sideways direction of this ring
        p.addScaledVector(body.B[i], Math.sin(ph * 0.8 + 1.3) * 0.3 * amp * Math.min(1, i / 20));
      }
      body.update(up);

      // ---- the locks ----
      const hq = head.quaternion;
      // where the wind blows the locks on the head: behind the head (ridden, straight back along the flight)
      if (ride) sBack.copy(ride.dir).normalize().negate(); else sBack.set(0, 0, -1).applyQuaternion(hq);
      hRight.set(1, 0, 0).applyQuaternion(ride ? flyQ : hq);
      hUp.set(0, 1, 0).applyQuaternion(ride ? flyQ : hq);
      for (let s = 0; s < defs.length; s++) {
        const st = defs[s];
        let len = st.len;
        if (st.root === 'body') {
          const i = st.ring, T = body.T[i], Nn = body.N[i], B = body.B[i], r = body.radii[i], c = body.pts[i];
          // longest just behind the head; ridden, the ones under the rider lie low and short
          len *= 0.25 + 1.1 * Math.pow(1 - i / MANE_END, 0.8);
          if (ride) len *= lerp(0.25, 1, smoothstep(3, 16, i));
          if (dissolving) len *= ringLeft(i);
          radial.copy(Nn).multiplyScalar(Math.cos(st.a)).addScaledVector(B, Math.sin(st.a));
          sp.copy(c).addScaledVector(radial, r * 0.85);
          // out from the body and back towards the tail, bending further back and rippling towards the tip
          sd0.copy(radial).multiplyScalar(st.lift).add(T).normalize();
          strands.normal(s, radial);
          strands.set(s, 0, sp);
          for (let k = 1; k <= SEGS; k++) {
            const f = k / SEGS;
            const sway = Math.sin(t * 5 - i * 0.4 - k * 0.55 + st.phase) * 0.35 * f;
            const flap = Math.sin(t * 3.3 - i * 0.3 + st.phase * 1.7) * 0.2 * f;
            sd.copy(sd0).addScaledVector(T, 1.1 * f).addScaledVector(B, sway).addScaledVector(radial, flap - 0.25 * f).normalize();
            sp.addScaledVector(sd, len / SEGS);
            strands.set(s, k, sp);
          }
        } else if (st.root === 'tail') {
          const i = N - 1, T = body.T[i], Nn = body.N[i], B = body.B[i], c = body.pts[i];
          if (dissolving) len *= ringLeft(i);
          radial.copy(Nn).multiplyScalar(Math.cos(st.a)).addScaledVector(B, Math.sin(st.a));
          sp.copy(c);
          sd0.copy(radial).multiplyScalar(st.lift).add(T).normalize();
          strands.normal(s, radial);
          strands.set(s, 0, sp);
          for (let k = 1; k <= SEGS; k++) {
            const f = k / SEGS;
            sd.copy(sd0).addScaledVector(B, Math.sin(t * 4 - k * 0.6 + st.phase) * 0.4 * f).addScaledVector(Nn, Math.sin(t * 3.1 + st.phase) * 0.3 * f).normalize();
            sp.addScaledVector(sd, len / SEGS);
            strands.set(s, k, sp);
          }
        } else {
          // on the head: the mane, the cheek fur and the whiskers stream back in the wind and ripple
          len *= headLeft;
          sp.copy(st.at).multiplyScalar(headLeft).applyQuaternion(hq).add(headPos);
          sOut.copy(st.out).applyQuaternion(hq);
          strands.normal(s, st.root === 'whisker' ? hUp : sOut);
          strands.set(s, 0, sp);
          const whisker = st.root === 'whisker';
          // ridden, the mane parts to both sides of the neck, so the rider sees the top of the head between
          const side = Math.sign(st.out.x) || 1;
          const part = ride && !whisker ? side * (0.1 + 0.9 * Math.abs(st.out.x)) : 0;
          const wave = whisker ? 0.25 : 0.2;
          for (let k = 1; k <= SEGS; k++) {
            const f = k / SEGS;
            const rip = Math.sin(t * (whisker ? 4 : 6) - k * (whisker ? 0.7 : 1.1) + st.phase) * wave * f;
            sd.copy(sBack);
            // (each lock a little apart from its neighbours, so they do not lie in one flat sheet)
            if (ride && !whisker) sd.addScaledVector(hRight, part * (0.25 + 0.45 * f) + 0.15 * Math.sin(st.phase * 3) * f).addScaledVector(hUp, -0.2 * f - 0.3 * Math.abs(part) * f + 0.2 * Math.cos(st.phase * 2) * f + rip);
            else sd.addScaledVector(sOut, 0.45 * (1 - f * 0.5)).addScaledVector(hUp, (whisker ? -0.1 : 0.25 * (1 - f)) + rip).addScaledVector(hRight, rip * 0.6);
            sp.addScaledVector(sd.normalize(), len / SEGS);
            strands.set(s, k, sp);
          }
        }
      }
      strands.commit();

      // legs paddle the air
      for (const l of legs) {
        const i = l.ring, T = body.T[i], Nn = body.N[i], B = body.B[i], r = body.radii[i];
        l.hip.position.copy(body.pts[i]).addScaledVector(B, l.side * r * 0.8).addScaledVector(Nn, -r * 0.35);
        mBasis.makeBasis(B, Nn, T);
        qA.setFromRotationMatrix(mBasis);
        const paddle = Math.sin(t * 4.2 + l.phase);
        l.hip.quaternion.copy(qA).multiply(qB.setFromEuler(e.set(0.5 + paddle * 0.55, 0, l.side * 0.55)));
        l.knee.rotation.x = -0.9 - paddle * 0.4;
        if (dissolving) shrink(l.hip, ringLeft(l.ring));
      }
      if (state.swoopT > 0) state.swoopT -= dt;
    },
  };
  return ch;
}
