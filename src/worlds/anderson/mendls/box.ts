import * as THREE from 'three';
import { mergeStatic } from '../../../engine/Builders';
import { charToon, Painter } from '../../../engine/Paint';
import { clamp, lerp, smoothstep, TAU } from '../../../engine/math';
import { easeOutBack } from '../../../engine/Rig';
import { css } from '../textures';
import { boxSide, cardInside, flapInside, lidInside, lidTop, MC, ribbonTex, tissue } from './textures';
import { courtesan } from './pastry';

/**
 * The rider's seat: a giant open Mendl's box. Pink card printed with the shop's cartouche, its lid hinged at
 * the back and folded up behind the rider, the side flaps folded out, tissue paper puffed over the rims, a
 * Courtesan au chocolat on a doily in the front corner, and the pale blue ribbon untied: one end over the
 * front rim, the other two streaming from the sides. At the end of the line the lid swings shut.
 *
 * Origin: on the path (the belt's surface). Local +z is forward; the rider's right is local -x.
 */

export const BOX = { w: 3.6, l: 3.6, h: 1.32, t: 0.05, floor: 0.08 };
/** the lid's angle when open (radians about the hinge; 0 is shut) */
const LID_OPEN = -1.98;

interface BoxMats { flap: THREE.Material; flapB: THREE.Material; side: THREE.Material; inside: THREE.Material; insideB: THREE.Material; edge: THREE.Material; pinkPlain: THREE.Material; pinkB: THREE.Material; top: THREE.Material; under: THREE.Material; ribbon: THREE.Material; tissues: THREE.Material[] }
let shared: BoxMats | null = null;
export function boxMaterials(): BoxMats {
  if (shared) return shared;
  const side = charToon({ map: boxSide(1), rim: 0.25, shade: 0xc8a8c0 });
  const insideMap = cardInside(5);
  const inside = charToon({ map: insideMap, rim: 0.15, shade: 0xc8b8c8 });
  const insideB = charToon({ map: insideMap, rim: 0.15, shade: 0xc8b8c8, side: THREE.BackSide });
  const edge = charToon({ color: 0xf0d8d0, rim: 0.1, shade: 0xc8b0b8 });
  const pinkMap = (() => { const p = new Painter(64, 64, 3).fill(css(MC.pink)); p.lines({ n: 30, colors: [css(MC.pink, 1.06), css(MC.pink, 0.93)], alpha: [0.1, 0.2], width: [0.5, 1], wobble: 1 }); return p.texture({ repeat: [1, 1] }); })();
  const pinkPlain = charToon({ map: pinkMap, rim: 0.25, shade: 0xc8a8c0 });
  const pinkB = charToon({ map: pinkMap, rim: 0.25, shade: 0xc8a8c0, side: THREE.BackSide });
  const top = charToon({ map: lidTop(3), rim: 0.25, shade: 0xc8a8c0 });
  const under = charToon({ map: lidInside(7), rim: 0.1, shade: 0xc8b8c8, side: THREE.BackSide });
  const ribbon = charToon({ map: ribbonTex(), rim: 0.5, shade: 0x9aa8d0, side: THREE.DoubleSide, emissive: new THREE.Color(0x0a1424) });
  const tissues = [0xf8dde4, 0xfbf3ea, 0xe8dcf4].map((c, i) => new THREE.MeshLambertMaterial({ map: tissue(c, 9 + i), side: THREE.DoubleSide, emissive: new THREE.Color(c).multiplyScalar(0.18) }));
  const flapMap = flapInside();
  const flap = charToon({ map: flapMap, rim: 0.15, shade: 0xc8b8c8 }), flapB = charToon({ map: flapMap, rim: 0.15, shade: 0xc8b8c8, side: THREE.BackSide });
  shared = { flap, flapB, side, inside, insideB, edge, pinkPlain, pinkB, top, under, ribbon, tissues };
  return shared;
}

/** A flat strip of ribbon along a polyline, lying against the given surface normals. */
export function ribbonStrip(pts: THREE.Vector3[], nrm: THREE.Vector3[], width: number, mat: THREE.Material) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0;
  const t = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    t.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    s.crossVectors(t, nrm[i]).normalize().multiplyScalar(width / 2);
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    const lift = nrm[i].clone().multiplyScalar(0.012);
    for (const k of [-1, 1]) { const v = pts[i].clone().addScaledVector(s, k).add(lift); pos.push(v.x, v.y, v.z); uv.push(k < 0 ? 0 : 1, dist / width / 3); }
    if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** A smooth path through a few points, resampled. */
function smoothPath(keys: THREE.Vector3[], n: number) {
  return new THREE.CatmullRomCurve3(keys, false, 'centripetal').getSpacedPoints(n);
}

/**
 * A loose tail of ribbon that flutters in the wind of the box's travel: N points from a fixed root, waves
 * running along it. Updated each frame in the box's own space.
 */
class RibbonTail {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private root: THREE.Vector3; private dir: THREE.Vector3; private len: number; private width: number; private seed: number; private n: number;
  constructor(root: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, seed: number, mat: THREE.Material, n = 18) {
    this.root = root; this.dir = dir; this.len = len; this.width = width; this.seed = seed; this.n = n;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    const uv: number[] = [], idx: number[] = [];
    for (let i = 0; i < n; i++) { uv.push(0, (i / (n - 1)) * len / width / 3, 1, (i / (n - 1)) * len / width / 3); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.update(0, 0.5);
  }
  update(t: number, wind: number) {
    const p = new THREE.Vector3().copy(this.root);
    const d = this.dir.clone();
    const side = new THREE.Vector3(0, 1, 0).cross(d).normalize();
    const seg = this.len / (this.n - 1);
    for (let i = 0; i < this.n; i++) {
      const k = i / (this.n - 1);
      if (i > 0) {
        // the tail droops when still and streams back with speed; waves run down it
        const wave = Math.sin(t * (5 + wind * 6) - k * 7 + this.seed) * (0.35 + 0.5 * wind) * k;
        const flap = Math.sin(t * 3.1 + k * 4 + this.seed * 2) * 0.25 * k;
        const step = new THREE.Vector3().copy(d).multiplyScalar(seg);
        step.y += (-0.55 * (1 - wind) - 0.05) * seg + wave * seg * 0.9;
        step.addScaledVector(side, flap * seg);
        p.add(step);
      }
      const twist = Math.sin(t * 4 + k * 5 + this.seed) * 0.6 * k;
      const across = new THREE.Vector3(0, Math.cos(twist), 0).addScaledVector(side, Math.sin(twist)).multiplyScalar(this.width / 2);
      this.pos.set([p.x - across.x, p.y - across.y, p.z - across.z, p.x + across.x, p.y + across.y, p.z + across.z], i * 6);
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  }
}

/** Tissue paper along one wall: lying on the floor, up the inside of the wall and puffed over the rim in soft crinkled peaks. */
function tissueSheet(len: number, peak: (u: number) => number, seed: number, mat: THREE.Material) {
  const nu = 40, nv = 14;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const H = BOX.h;
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, x = (u - 0.5) * len;
      const h = peak(u);
      const cr = (Math.sin(u * 71 + seed) * Math.sin(v * 17 + seed * 2) * 0.6 + Math.sin(u * 29 + v * 11 + seed) * 0.4) * 0.016;
      let d: number, y: number;
      if (v < 0.6) { const k = v / 0.6; d = lerp(0.42, 0.075, Math.pow(k, 0.6)); y = lerp(BOX.floor + 0.02, H - 0.12, k * k); }
      else { const k = (v - 0.6) / 0.4; d = lerp(0.075, -0.012, k); y = H - 0.12 + (h + 0.12) * Math.sin(k * Math.PI * 0.62) / Math.sin(Math.PI * 0.62) * (k < 0.85 ? 1 : 1 - (k - 0.85) * 2.5); }
      pos.push(x, y + cr, d + cr * 0.5);
      uv.push(u * len / 2, v * 0.9);
      if (i < nu && j < nv) { const a = j * (nu + 1) + i; idx.push(a, a + 1, a + nu + 1, a + 1, a + nu + 2, a + nu + 1); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/** A paper doily: a disc with a lace edge of holes and scallops. */
function doily(r: number) {
  const p = new Painter(256, 256, 13);
  const g = p.g;
  g.fillStyle = '#fdfbf6';
  g.beginPath();
  for (let i = 0; i <= 360; i++) { const a = (i / 360) * TAU, k = 1 - 0.06 * Math.abs(Math.sin(a * 12)); const x = 128 + Math.cos(a) * 124 * k, y = 128 + Math.sin(a) * 124 * k; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let ring = 0; ring < 3; ring++) {
    const R = 104 - ring * 22, n = 36 - ring * 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + ring * 0.2; g.beginPath(); g.ellipse(128 + Math.cos(a) * R, 128 + Math.sin(a) * R, 5 - ring, 9 - ring * 2, a, 0, TAU); g.fill(); }
  }
  g.globalCompositeOperation = 'source-over';
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshLambertMaterial({ map: p.texture({ wrap: false }), alphaTest: 0.5, emissive: 0x302820 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export interface PastryBox {
  group: THREE.Group;
  seat: THREE.Vector3;
  /** 0 open .. 1 shut */
  setLid(k: number): void;
  update(dt: number, t: number, speed: number): void;
}

/** The rider's box. `withRider` adds the things only the rider's own box has (fluttering tails, the Courtesan, tissue). */
export function buildPastryBox(withRider = true): PastryBox {
  const M = boxMaterials();
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const { w, l, h, t, floor } = BOX;
  const hw = w / 2, hl = l / 2;
  const plane = (pw: number, ph: number, mat: THREE.Material, x: number, y: number, z: number, ry: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ');
    statics.add(m);
    return m;
  };
  // floor: card on top, a slab under it
  const fl = new THREE.Mesh(new THREE.BoxGeometry(w, floor - 0.02, l), M.inside);
  fl.position.y = 0.02 + (floor - 0.02) / 2; statics.add(fl);
  const fu = (fl.geometry.attributes.uv as THREE.BufferAttribute); for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) * 1.8, fu.getY(i) * 1.8);
  // walls: printed outside, plain card inside, a cut edge on top
  for (const [x, z, ry] of [[0, hl, 0], [0, -hl, Math.PI], [hw, 0, Math.PI / 2], [-hw, 0, -Math.PI / 2]] as const) {
    const out = plane(w, h, M.side, x, h / 2 + 0.02, z, ry); out.castShadow = true;
    const ix = x - Math.sign(x) * t, iz = z - Math.sign(z) * t;
    const inn = plane(w - t * 2, h - floor + 0.02, M.inside, ix, (h + floor) / 2 - 0.0, iz, ry + Math.PI);
    const iu = inn.geometry.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < iu.count; i++) iu.setXY(i, iu.getX(i) * 1.8, iu.getY(i) * 0.66);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.025, t + 0.004), M.edge);
    rim.position.set(x - Math.sign(x) * t / 2, h + 0.0125, z - Math.sign(z) * t / 2); rim.rotation.y = ry;
    statics.add(rim);
  }
  // side flaps folded out and up, like wings framing the view
  const flapShape = new THREE.Shape();
  flapShape.moveTo(-hl, 0); flapShape.lineTo(hl, 0); flapShape.lineTo(hl - 0.28, 0.82); flapShape.quadraticCurveTo(hl - 0.34, 0.95, hl - 0.48, 0.95);
  flapShape.lineTo(-hl + 0.48, 0.95); flapShape.quadraticCurveTo(-hl + 0.34, 0.95, -hl + 0.28, 0.82); flapShape.closePath();
  for (const s of [-1, 1]) {
    const geo = new THREE.ShapeGeometry(flapShape, 6);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const el = -0.28;
    for (let i = 0; i < p.count; i++) {
      const sx = p.getX(i), sy = p.getY(i);
      p.setXYZ(i, s * (hw + Math.cos(el) * sy), h + Math.sin(el) * sy, sx);
    }
    geo.computeVertexNormals();
    const fu = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < fu.count; i++) fu.setXY(i, (fu.getX(i) + hl) / l, fu.getY(i) / 0.95);
    // which side faces in depends on the winding: give both faces their own material
    const a = new THREE.Mesh(geo, M.pinkPlain), b = new THREE.Mesh(geo, M.inside);
    const inward = (geo.attributes.normal as THREE.BufferAttribute).getX(0) * s < 0;
    (a.material as THREE.Material) = inward ? M.flap : M.pinkPlain;
    (b.material as THREE.Material) = inward ? M.pinkB : M.flapB;
    statics.add(a, b);
  }
  // the ribbon: up the outside of the front, over the rim and loosely down inside onto the floor
  {
    const keys = [
      new THREE.Vector3(0, 0.03, hl), new THREE.Vector3(0, h * 0.5, hl), new THREE.Vector3(0, h - 0.02, hl), new THREE.Vector3(0, h + 0.1, hl - 0.04),
      new THREE.Vector3(0.02, h - 0.02, hl - 0.3), new THREE.Vector3(0.1, h * 0.55, hl - 0.38), new THREE.Vector3(0.24, 0.3, hl - 0.6), new THREE.Vector3(0.36, floor + 0.01, hl - 1.1), new THREE.Vector3(0.62, floor + 0.01, hl - 1.9),
    ];
    const pts = smoothPath(keys, 40);
    const nrm = pts.map((pp) => {
      if (pp.z >= hl - 0.01) return new THREE.Vector3(0, 0, 1);
      if (pp.y > h - 0.05) return new THREE.Vector3(0, 1, 0.3).normalize();
      if (pp.y < floor + 0.05) return new THREE.Vector3(0, 1, 0);
      return new THREE.Vector3(0, 0.5, -1).normalize();
    });
    statics.add(ribbonStrip(pts, nrm, 0.26, M.ribbon));
    // and up the back and the sides
    statics.add(ribbonStrip([new THREE.Vector3(0, 0.03, -hl), new THREE.Vector3(0, h, -hl)], [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)], 0.26, M.ribbon));
    for (const s of [-1, 1]) {
      statics.add(ribbonStrip([new THREE.Vector3(s * hw, 0.03, 0), new THREE.Vector3(s * hw, h - 0.02, 0), new THREE.Vector3(s * (hw - 0.02), h + 0.04, 0)], [new THREE.Vector3(s, 0, 0), new THREE.Vector3(s, 0, 0), new THREE.Vector3(s, 1, 0).normalize()], 0.26, M.ribbon));
    }
  }
  statics.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
  mergeStatic(statics);

  // ---------- the lid, hinged at the top of the back wall ----------
  const lid = new THREE.Group();
  lid.position.set(0, h, -hl);
  group.add(lid);
  {
    const topG = new THREE.PlaneGeometry(w + 0.04, l + 0.04); topG.rotateX(-Math.PI / 2); topG.translate(0, 0.03, l / 2);
    const top = new THREE.Mesh(topG, M.top); top.castShadow = true;
    // the underside's printing reads the right way up when the lid stands open behind the rider
    const underG = topG.clone(); const uu = underG.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uu.count; i++) uu.setY(i, 1 - uu.getY(i));
    const under = new THREE.Mesh(underG, M.under);
    lid.add(top, under);
    const flap = new THREE.PlaneGeometry(w + 0.04, 0.42); flap.translate(0, -0.18, l + 0.02);
    lid.add(new THREE.Mesh(flap, M.pinkPlain), new THREE.Mesh(flap, M.insideB));
    // the lid's edges, so it reads as card with a thickness
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(t, 0.06, l + 0.04), M.edge); e.position.set(s * (hw + 0.02), 0.0, l / 2); lid.add(e); }
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, t), M.edge); lip.position.set(0, 0, l + 0.02); lid.add(lip);
  }
  lid.rotation.x = LID_OPEN;

  // ---------- what only the rider's box has ----------
  const tails: RibbonTail[] = [];
  if (withRider) {
    const extras = new THREE.Group();
    group.add(extras);
    // tissue paper: three sheets in three pale tints, along the front and the sides
    const front = tissueSheet(w - 0.12, (u) => 0.03 + 0.04 * Math.abs(Math.sin(u * Math.PI * 5 + 0.3)) + 0.2 * smoothstep(0.3, 0.47, Math.abs(u - 0.5)), 1, M.tissues[0]);
    front.position.z = hl; front.rotation.y = Math.PI; extras.add(front);
    for (const s of [-1, 1]) {
      const sh = tissueSheet(l - 0.12, (u) => 0.05 + 0.16 * Math.pow(Math.abs(Math.sin(u * Math.PI * 2 + s)), 0.8) + 0.12 * smoothstep(0.62, 0.95, s > 0 ? u : 1 - u), s > 0 ? 2 : 3, M.tissues[s > 0 ? 1 : 2]);
      sh.position.x = s * hw; sh.rotation.y = -s * Math.PI / 2; extras.add(sh);
    }
    // a Courtesan on a doily in the front left corner, and a second, smaller one beside it
    const d = doily(0.62); d.position.set(0.95, floor + 0.006, 0.85); extras.add(d);
    const c = courtesan(1.0, true); c.position.set(0.95, floor + 0.01, 0.85); c.rotation.y = 0.6; c.castShadow = true; extras.add(c);
    const d2 = doily(0.42); d2.position.set(-1.05, floor + 0.006, 1.15); extras.add(d2);
    const c2 = courtesan(0.62, true); c2.position.set(-1.05, floor + 0.01, 1.15); c2.rotation.y = -0.4; extras.add(c2);
    extras.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    mergeStatic(extras);
    // two long tails streaming back from the side rims
    for (const s of [-1, 1]) {
      const tail = new RibbonTail(new THREE.Vector3(s * (hw + 0.02), h + 0.03, 0), new THREE.Vector3(s * 0.35, 0.05, -1).normalize(), 2.6, 0.26, s > 0 ? 0 : 2.1, M.ribbon);
      tails.push(tail);
      group.add(tail.mesh);
    }
  }

  let lidK = 0;
  return {
    group, seat: new THREE.Vector3(0, floor + 1.9, -0.25),
    setLid(k) {
      lidK = clamp(k, 0, 1);
      // eases over, then lands with a small bounce
      const e = lidK < 1 ? easeOutBack(lidK, 0.9) : 1;
      lid.rotation.x = lerp(LID_OPEN, 0, clamp(e, 0, 1.06));
    },
    update(_dt, time, speed) {
      for (const tl of tails) tl.update(time, clamp(speed, 0, 1));
      void lidK;
    },
  };
}

