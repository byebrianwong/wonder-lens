import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { charToon } from '../../../engine/Paint';
import { Rng, clamp, damp, smoothstep } from '../../../engine/math';
import { kodamaFace } from '../../ghibli/characterTextures';

/*
 * Hundreds of Kodama, the little white tree spirits, drawn as instanced meshes: one body mesh and four
 * head meshes (one per face) for each stretch of z. They are the same shapes and faces as `makeKodama` in
 * ghibli/spirits.ts, which costs two draw calls per Kodama; here a stretch of a hundred costs five.
 *
 * Bodies never move. Heads turn on their necks every frame: an idle sway, a turn to watch the rider go by,
 * a turn towards a thrown acorn, and the clicking rattle, which spreads out in a wave from where it starts.
 */

export interface KodamaSpot {
  p: THREE.Vector3;
  /** the way the body faces (0 faces +z) */
  yaw: number;
  /** size (about 0.7 to 1.25; 1 is a Kodama about 1.2 units tall) */
  s: number;
  /** a lean of the head to one side, for the ones peeking round trunks */
  tilt?: number;
}

interface Kod {
  spot: KodamaSpot;
  body: THREE.Matrix4;
  bodyQ: THREE.Quaternion;
  neck: THREE.Vector3;
  mesh: THREE.InstancedMesh;
  index: number;
  phase: number;
  base: number;
  yaw: number; roll: number; pitch: number;
  /** when the rattle starts and stops (ride time), and a point to look at while it lasts */
  r0: number; r1: number;
  look: THREE.Vector3 | null;
  lookUntil: number;
}

const NECK = 0.7, HEAD_UP = 0.24;

export class KodamaCrowd {
  readonly group = new THREE.Group();
  /** one group per stretch, to be hidden with the scenery of that stretch */
  readonly stretches: THREE.Group[] = [];
  private kods: Kod[] = [];
  private heads: THREE.InstancedMesh[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler(0, 0, 0, 'YXZ');
  private v = new THREE.Vector3();
  private inv = new THREE.Quaternion();
  private turnM = new THREE.Matrix4();
  /** the head sits a little above the neck joint and is a squashed sphere */
  private headM = new THREE.Matrix4().compose(new THREE.Vector3(0, HEAD_UP, 0), new THREE.Quaternion(), new THREE.Vector3(0.27, 0.3, 0.27));

  constructor(spots: KodamaSpot[], stretches: Array<[number, number]>, seed = 77) {
    const rng = new Rng(seed);
    // a little brighter than the Ghibli world's Kodama, so they glow faintly in the mist
    const bodyMat = charToon({ color: 0xeaede6, emissive: 0x46585a, rim: 0.85, shade: 0xa8b4c0 });
    const faces = [0, 1, 2, 3].map((v) => charToon({ map: kodamaFace(v), emissive: 0x46585a, rim: 0.85, shade: 0xa8b4c0 }));
    const headGeos = [0, 1].map((v) => {
      const geo = new THREE.SphereGeometry(1, 16, 11);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const hr = new Rng(300 + v);
      const bumps = Array.from({ length: 4 }, () => ({ d: new THREE.Vector3(hr.range(-1, 1), hr.range(0, 1), hr.range(-1, 0.3)).normalize(), k: hr.range(0.06, 0.14) }));
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        let r = 1 + (p.y > 0 ? p.y * 0.12 : 0);
        for (const b of bumps) r += b.k * Math.max(0, p.dot(b.d)) ** 3;
        pos.setXYZ(i, p.x * r, p.y * r, p.z * r);
      }
      geo.computeVertexNormals();
      return geo;
    });
    // the same little body as makeKodama's, with plainer arms and legs: there are hundreds of them
    const limb = (r0: number, r1: number, len: number) => new THREE.CylinderGeometry(r0, r1, len, 6, 1).translate(0, -len / 2, 0);
    const bodyGeo = mergeGeometries([
      new THREE.LatheGeometry([new THREE.Vector2(0.001, 0.12), new THREE.Vector2(0.17, 0.16), new THREE.Vector2(0.2, 0.35), new THREE.Vector2(0.15, 0.62), new THREE.Vector2(0.06, 0.72), new THREE.Vector2(0.001, 0.73)], 10),
      ...[-1, 1].map((s) => limb(0.05, 0.035, 0.26).rotateZ(s * 0.7).translate(s * 0.17, 0.55, 0.02)),
      ...[-1, 1].map((s) => limb(0.06, 0.05, 0.16).translate(s * 0.08, 0.17, 0)),
    ].map((geo) => { geo.deleteAttribute('uv'); return geo.index ? geo.toNonIndexed() : geo; }))!;

    const up = new THREE.Vector3(0, 1, 0);
    stretches.forEach(([z0, z1]) => {
      const g = new THREE.Group();
      this.stretches.push(g);
      this.group.add(g);
      const mine = spots.filter((s) => s.p.z <= z0 && s.p.z > z1);
      if (!mine.length) return;
      const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, mine.length);
      const byFace = [0, 1, 2, 3].map((f) => mine.filter((_, i) => i % 4 === f));
      const headMeshes = byFace.map((list, f) => {
        const im = new THREE.InstancedMesh(headGeos[f % 2], faces[f], Math.max(1, list.length));
        im.count = list.length;
        return im;
      });
      mine.forEach((spot, i) => {
        const bodyQ = new THREE.Quaternion().setFromAxisAngle(up, spot.yaw);
        const body = new THREE.Matrix4().compose(spot.p, bodyQ, new THREE.Vector3(spot.s, spot.s, spot.s));
        bodies.setMatrixAt(i, body);
        const f = i % 4;
        const mesh = headMeshes[f];
        const k: Kod = {
          spot, body, bodyQ, neck: new THREE.Vector3(0, NECK * spot.s, 0).applyQuaternion(bodyQ).add(spot.p),
          mesh, index: byFace[f].indexOf(spot), phase: rng.range(0, 10), base: (spot.tilt ?? 0) + rng.range(-0.25, 0.25),
          yaw: 0, roll: 0, pitch: 0, r0: -1, r1: -1, look: null, lookUntil: -1,
        };
        this.kods.push(k);
      });
      bodies.instanceMatrix.needsUpdate = true;
      bodies.computeBoundingSphere();
      g.add(bodies);
      for (const im of headMeshes) {
        if (!im.count) continue;
        g.add(im);
        this.heads.push(im);
      }
      for (const im of [bodies, ...headMeshes]) { im.userData.keep = true; im.castShadow = false; im.receiveShadow = false; }
    });
    // pose every head once, so they are right before the first update
    for (const k of this.kods) this.pose(k);
    for (const im of this.heads) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); if (im.boundingSphere) im.boundingSphere.radius += 2; }
  }

  get count() { return this.kods.length; }

  /** Write a Kodama's head matrix: body, then the neck joint, the head's turn, and the head's offset and size. */
  private pose(k: Kod) {
    this.e.set(k.pitch, k.yaw, k.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.turnM.makeRotationFromQuaternion(this.q);
    this.m.makeTranslation(0, NECK, 0).multiply(this.turnM).multiply(this.headM).premultiply(k.body);
    k.mesh.setMatrixAt(k.index, this.m);
  }

  /**
   * The ocarina: heads rattle in a wave that spreads out from `from` at `speed` units a second.
   * `t` is the ride time now.
   */
  wave(from: THREE.Vector3, t: number, speed = 24) {
    for (const k of this.kods) {
      const d = k.spot.p.distanceTo(from);
      if (d > 150) continue;
      const start = t + d / speed;
      // a Kodama already rattling keeps going rather than starting again
      if (t < k.r1 && t >= k.r0) { k.r1 = Math.max(k.r1, start + 2.4); continue; }
      k.r0 = start; k.r1 = start + 2.4;
    }
  }

  /** An acorn came down at `pos`: the Kodama near it turn to look, then rattle (nearest first). */
  startle(pos: THREE.Vector3, t: number, radius = 16) {
    let n = 0;
    for (const k of this.kods) {
      const d = k.spot.p.distanceTo(pos);
      if (d > radius) continue;
      n++;
      k.look = pos.clone(); k.lookUntil = t + 4;
      const start = t + 0.5 + d / 20;
      if (!(t < k.r1 && t >= k.r0)) { k.r0 = start; k.r1 = start + 2.0; }
    }
    return n;
  }

  /** How many Kodama are within `r` of a point. */
  near(p: THREE.Vector3, r: number) {
    let n = 0;
    for (const k of this.kods) if (k.spot.p.distanceToSquared(p) < r * r) n++;
    return n;
  }

  /** True while any Kodama within `r` of `p` is rattling. */
  rattling(p: THREE.Vector3, r: number, t: number) {
    for (const k of this.kods) if (t >= k.r0 && t < k.r1 && k.spot.p.distanceToSquared(p) < r * r) return true;
    return false;
  }

  /**
   * Turn the heads. Only Kodama within `reach` of the camera are posed (the rest keep their last pose).
   * Near ones turn to watch the rider pass.
   */
  update(dt: number, t: number, cam: THREE.Vector3, reach = 130) {
    const r2 = reach * reach;
    for (const k of this.kods) {
      const d2 = k.spot.p.distanceToSquared(cam);
      if (d2 > r2) continue;
      let ty = Math.sin(t * 0.31 + k.phase) * 0.3, tr = k.base + Math.sin(t * 0.5 + k.phase) * 0.15, tp = 0;
      // something to look at: a thrown acorn, or the rider going by
      const target = k.look && t < k.lookUntil ? k.look : d2 < 34 * 34 ? cam : null;
      if (target) {
        this.inv.copy(k.bodyQ).invert();
        this.v.copy(target).sub(k.neck).applyQuaternion(this.inv);
        const yaw = Math.atan2(this.v.x, this.v.z);
        if (Math.abs(yaw) < 2.4) {
          ty = clamp(yaw, -1.3, 1.3);
          tp = clamp(-Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z)), -0.5, 0.4);
          tr *= 0.5;
        }
      }
      if (t >= k.r0 && t < k.r1) {
        // a quick clicking spin of the head, each one a little out of step, easing in and out
        const a = smoothstep(k.r0, k.r0 + 0.25, t) * (1 - smoothstep(k.r1 - 0.6, k.r1, t)) * (0.65 + 0.35 * Math.sin(k.phase));
        k.roll = tr * (1 - a) + Math.sin(t * 38 + k.phase) * 0.38 * a;
        k.yaw = ty * (1 - a) + Math.sign(Math.sin(t * 9 + k.phase)) * 0.5 * a;
        k.pitch = tp * (1 - a);
      } else {
        k.roll = damp(k.roll, tr, 3, dt);
        k.yaw = damp(k.yaw, ty, 3, dt);
        k.pitch = damp(k.pitch, tp, 3, dt);
      }
      this.pose(k);
    }
    for (const im of this.heads) im.instanceMatrix.needsUpdate = true;
  }
}
