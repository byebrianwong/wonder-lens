import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, toon, type Placement } from '../../../engine/Builders';
import { Painter } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { chunkedParts, texMat } from '../kit';
import { rustIron } from './paint';

/*
 * The rubbish lying about on top of the bales (tyres, oil drums, old fridges and washing machines, television
 * sets, broken umbrellas), instanced in stretches along z; the gulls wheeling over the island; scraps of paper
 * blowing past the gondola.
 */

function applianceTex() {
  const p = new Painter(256, 256, 611).fill('#e2ddd0');
  const g = p.g;
  p.dabs({ n: 40, colors: ['#8a4a2a', '#a86a3a', '#6a3a24'], r: [2, 12], alpha: [0.35, 0.7] });
  g.fillStyle = 'rgba(40,36,32,0.6)'; g.fillRect(0, 90, 256, 4);
  g.fillStyle = '#9a9890'; g.fillRect(220, 110, 10, 70);
  g.fillStyle = 'rgba(30,26,22,0.5)'; g.beginPath(); g.arc(128, 170, 50, 0, TAU); g.fill();
  g.fillStyle = 'rgba(160,190,200,0.5)'; g.beginPath(); g.arc(128, 170, 38, 0, TAU); g.fill();
  return p.texture();
}

function tvTex() {
  return canvasTexture(256, 256, (g) => {
    g.fillStyle = '#7a5a3a'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(40,24,12,0.4)'; for (let y = 0; y < 256; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + 3); g.stroke(); }
    g.fillStyle = '#3e4442'; g.beginPath(); g.roundRect(24, 30, 160, 130, 18); g.fill();
    g.fillStyle = 'rgba(160,180,170,0.35)'; g.beginPath(); g.roundRect(34, 40, 60, 40, 10); g.fill();
    g.fillStyle = '#c8b070'; for (const y of [60, 100, 140]) { g.beginPath(); g.arc(218, y, 10, 0, TAU); g.fill(); }
  });
}

export function buildJunk(rng: Rng, top: (x: number, z: number) => number, avoid: (x: number, z: number) => boolean, lowDetail: boolean) {
  const g = new THREE.Group();
  const spots = (n: number, xr: number, z0: number, z1: number) => {
    const out: Placement[] = [];
    for (let i = 0; i < n * 6 && out.length < n; i++) {
      const x = rng.range(-xr, xr), z = rng.range(z1, z0);
      if (avoid(x, z)) continue;
      const y = top(x, z);
      if (!(y > 1)) continue;
      // keep a little way in from the edge of the bale under it
      const fx = ((x % 2) + 2) % 2, fz = ((z % 2) + 2) % 2;
      if (fx < 0.35 || fx > 1.65 || fz < 0.35 || fz > 1.65) continue;
      out.push({ x, y, z, scale: rng.range(0.8, 1.25), rot: rng.range(0, TAU) });
    }
    return out;
  };
  const k = lowDetail ? 0.5 : 1;
  // tyres, lying flat, some stacked two high
  {
    const t = new THREE.TorusGeometry(0.42, 0.17, 7, 14).rotateX(Math.PI / 2).translate(0, 0.17, 0);
    const pl = spots(Math.round(170 * k), 80, -1832, -2044);
    for (const p of pl.slice(0, 40)) pl.push({ ...p, y: p.y + 0.34, rot: p.rot + 1 });
    g.add(chunkedParts([t], toon(0x2a2828), pl, { castShadow: true }));
  }
  // oil drums in faded colours, upright or on their side
  {
    const d = new THREE.CylinderGeometry(0.42, 0.42, 1.25, 12).translate(0, 0.62, 0);
    const pl = spots(Math.round(140 * k), 90, -1832, -2044);
    const cols = [0x3a5a7a, 0x9a3a2a, 0x5a6a3a, 0xc8a040, 0x8a8a84].map((c) => new THREE.Color(c));
    g.add(chunkedParts([d], texMat(rustIron(0xd8d4cc, 613, 0.8)), pl, { castShadow: true, color: (i, out) => out.copy(cols[i % cols.length]) }));
  }
  // fridges and washing machines
  {
    const b = new THREE.BoxGeometry(0.9, 1.5, 0.8).translate(0, 0.75, 0);
    const pl = spots(Math.round(70 * k), 70, -1835, -2044);
    g.add(chunkedParts([b], texMat(applianceTex()), pl, { castShadow: true }));
  }
  // television sets
  {
    const b = new THREE.BoxGeometry(1.0, 0.8, 0.75).translate(0, 0.4, 0);
    const pl = spots(Math.round(60 * k), 70, -1835, -2044);
    g.add(chunkedParts([b], texMat(tvTex()), pl, { castShadow: true }));
  }
  // broken umbrellas: a ribbed canopy, half open, on a bent stick
  {
    const c = new THREE.ConeGeometry(0.75, 0.35, 8, 1, true).translate(0, 1.1, 0);
    c.rotateZ(0.5);
    const s = new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4).translate(0, 0.5, 0);
    const pl = spots(Math.round(30 * k), 60, -1835, -2044);
    g.add(chunkedParts([mergeGeometries([c.toNonIndexed(), s.toNonIndexed()])!], toon(0xc84a4a, { side: THREE.DoubleSide }), pl));
  }
  return g;
}

/**
 * Gulls wheeling over the island: each a flat V of wings that flaps by folding, one instanced mesh for all,
 * circling in loose rings round a few centres.
 */
export class Gulls {
  readonly mesh: THREE.InstancedMesh;
  private birds: Array<{ c: THREE.Vector3; r: number; w: number; ph: number; h: number; flap: number }> = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(centres: THREE.Vector3[], perCentre: number, seed: number) {
    const rng = new Rng(seed);
    // a body and two wings, as one shape whose wingtips lift with the instance's y scale
    const shape = new THREE.BufferGeometry();
    const v = [
      0, 0, 0.35, -0.08, 0, -0.3, 0.08, 0, -0.3,
      0, 0, 0.12, -1.1, 0.25, -0.05, 0, 0, -0.18,
      0, 0, 0.12, 0, 0, -0.18, 1.1, 0.25, -0.05,
    ];
    shape.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    shape.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0xf2efe8, side: THREE.DoubleSide });
    for (const c of centres) for (let i = 0; i < perCentre; i++) this.birds.push({ c, r: rng.range(8, 22), w: rng.range(0.25, 0.45) * rng.sign(), ph: rng.range(0, TAU), h: rng.range(-4, 6), flap: rng.range(5, 7) });
    this.mesh = new THREE.InstancedMesh(shape, mat, this.birds.length);
    this.mesh.frustumCulled = false;
  }

  update(t: number) {
    this.birds.forEach((b, i) => {
      const a = b.ph + t * b.w;
      this.p.set(b.c.x + Math.cos(a) * b.r, b.c.y + b.h + Math.sin(t * 0.5 + b.ph) * 1.5, b.c.z + Math.sin(a) * b.r);
      // heading along the circle, banked into it
      this.e.set(0, -a + (b.w > 0 ? 0 : Math.PI), b.w > 0 ? 0.35 : -0.35, 'YXZ');
      this.q.setFromEuler(this.e);
      const fl = Math.sin(t * b.flap + b.ph);
      // glide most of the time, flap in bursts
      const burst = Math.sin(t * 0.7 + b.ph) > 0.2 ? 1 : 0.15;
      this.s.set(1.3, 1.3 * (0.2 + fl * 1.6 * burst), 1.3);
      this.m4.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
