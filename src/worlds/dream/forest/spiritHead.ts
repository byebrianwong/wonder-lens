import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sculpt, taperedTube } from '../../../engine/Rig';
import { Rng, smoothstep } from '../../../engine/math';

/*
 * The Forest Spirit's head, shared by its day form (the deer) and its night form (the Night-Walker): a long
 * face, almost human, with front-facing eyes and a long nose (painted on by `spiritFace` in textures.ts),
 * leaf-shaped ears, and great branching antlers.
 *
 * Sizes are for a head about 1 unit tall and 1.5 long, facing +z, centred on the origin. Scale the group.
 */

/**
 * The head's shape on a unit sphere: a rounded skull with a broad, flat face in front (the front is
 * squared off rather than pointed) and only a short muzzle below the eyes, so it reads as an almost
 * human face rather than a deer's long snout.
 */
export function headShape(d: THREE.Vector3, out: THREE.Vector3) {
  const fwd = Math.max(0, d.z);
  let x = d.x * 0.45 * (1 - 0.1 * fwd * fwd), y = d.y * 0.5;
  // the front is pushed out towards a flat plane: a broad face
  let z = d.z > 0 ? Math.pow(d.z, 0.55) * 0.55 : d.z * 0.62;
  // a short muzzle below the eyes
  z += 0.1 * fwd * fwd * smoothstep(0.3, -0.5, d.y);
  // a little narrower at the jaw
  x *= 1 - 0.14 * Math.max(0, -d.y) * fwd;
  out.set(x, y, z);
  return out;
}

export function headGeometry(detail = 1) {
  return sculpt(headShape, Math.round(48 * detail), Math.round(32 * detail));
}

/** Where on the head (in its own space) the antlers grow from. */
export const ANTLER_BASE = [new THREE.Vector3(-0.17, 0.4, -0.08), new THREE.Vector3(0.17, 0.4, -0.08)];

/**
 * A pair of great antlers: on each side a main beam that sweeps up, out and a little back, with many tines
 * branching off it, most of them forking again. One merged geometry in the head's space.
 */
export function antlerGeometry(seed: number, o: { spread?: number; height?: number; radius?: number; radial?: number; tines?: number; fork?: number; twigs?: boolean } = {}) {
  const rng = new Rng(seed);
  const spread = o.spread ?? 1, height = o.height ?? 1, r0 = (o.radius ?? 0.07), radial = o.radial ?? 6;
  const n = o.tines ?? 7, forkChance = o.fork ?? 0.75;
  const parts: THREE.BufferGeometry[] = [];
  const tube = (pts: THREE.Vector3[], ra: number, rb: number, segs: number) => {
    parts.push(taperedTube(new THREE.CatmullRomCurve3(pts), ra, rb, segs, radial));
  };
  for (const s of [-1, 1]) {
    const base = ANTLER_BASE[s < 0 ? 0 : 1];
    const beam = [
      base.clone(),
      base.clone().add(new THREE.Vector3(s * 0.35 * spread, 0.7 * height, -0.22)),
      base.clone().add(new THREE.Vector3(s * 1.0 * spread, 1.45 * height, -0.4)),
      base.clone().add(new THREE.Vector3(s * 1.55 * spread, 2.2 * height, -0.25)),
      base.clone().add(new THREE.Vector3(s * 1.8 * spread, 2.9 * height, 0.1)),
    ];
    const curve = new THREE.CatmullRomCurve3(beam);
    tube(beam, r0, r0 * 0.35, 18);
    // a brow tine reaching forward over the face
    {
      const p = curve.getPointAt(0.12);
      tube([p, p.clone().add(new THREE.Vector3(s * 0.15, 0.25 * height, 0.35)), p.clone().add(new THREE.Vector3(s * 0.1, 0.55 * height, 0.62))], r0 * 0.7, r0 * 0.2, 8);
    }
    // tines up the beam, alternating inwards and outwards, most with a fork near the end
    for (let i = 0; i < n; i++) {
      const t = 0.22 + (i / n) * 0.74;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const out = i % 2 ? s : -s * 0.4;
      const len = (0.55 + rng.range(0, 0.45)) * (1 - t * 0.45) * height;
      const dir = new THREE.Vector3(out * 0.45 * spread, 1, rng.range(-0.35, 0.45)).normalize().lerp(tan, 0.25).normalize();
      const mid = p.clone().addScaledVector(dir, len * 0.55).add(new THREE.Vector3(out * 0.08, 0, rng.range(-0.1, 0.1)));
      const end = p.clone().addScaledVector(dir, len);
      const rr = r0 * (0.75 - t * 0.35);
      tube([p, mid, end], rr, rr * 0.2, 8);
      if (rng.chance(forkChance)) {
        const fd = new THREE.Vector3(out * rng.range(0.3, 0.7), 0.8, rng.range(-0.4, 0.4)).normalize();
        const f0 = mid.clone(), f1 = f0.clone().addScaledVector(fd, len * 0.25), f2 = f0.clone().addScaledVector(fd, len * 0.48);
        tube([f0, f1, f2], rr * 0.6, rr * 0.15, 6);
        // and on the biggest antlers, a twig off the fork and another near the tine's tip
        if (o.twigs) {
          const td = new THREE.Vector3(-out * rng.range(0.2, 0.6), 0.9, rng.range(-0.5, 0.5)).normalize();
          tube([f1, f1.clone().addScaledVector(td, len * 0.14), f1.clone().addScaledVector(td, len * 0.28)], rr * 0.35, rr * 0.1, 4);
          const e0 = p.clone().addScaledVector(dir, len * 0.8);
          const ed = new THREE.Vector3(out * rng.range(0.4, 0.9), 0.7, rng.range(-0.5, 0.5)).normalize();
          tube([e0, e0.clone().addScaledVector(ed, len * 0.13), e0.clone().addScaledVector(ed, len * 0.26)], rr * 0.35, rr * 0.1, 4);
        }
      }
    }
    // a crown of short points where the beam ends
    if (o.twigs) {
      const tip = curve.getPointAt(0.97);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + rng.range(0, 1);
        const td = new THREE.Vector3(Math.cos(a) * 0.6 + s * 0.3, 1, Math.sin(a) * 0.6).normalize();
        tube([tip, tip.clone().addScaledVector(td, 0.25 * height), tip.clone().addScaledVector(td, 0.5 * height)], r0 * 0.3, r0 * 0.08, 5);
      }
    }
  }
  const geo = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }), false)!;
  geo.computeBoundingSphere();
  return geo;
}

/** A leaf-shaped ear pointing out along +x from its base (mirrored for the left ear), about 0.4 long. */
export function earGeometry() {
  const geo = new THREE.SphereGeometry(1, 14, 10);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // long along x, pointed at the tip, thin front to back, cupped
    const t = (x + 1) / 2;
    p.setXYZ(i, t * 0.42, y * 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)), z * 0.035 - 0.03 * Math.abs(y));
  }
  geo.computeVertexNormals();
  return geo;
}
