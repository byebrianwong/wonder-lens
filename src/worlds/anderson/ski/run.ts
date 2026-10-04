import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lambert, toon } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import { lerp } from '../../../engine/math';
import { planks } from '../textures';
import { ribbon, subCurve, type Road } from '../common';
import { CH, CH_OUT, Z, type Plan } from './plan';
import { ICE_U, ICE_V, iceTexture, lipTexture, pisteTexture, snowTexture } from './textures';

/*
 * The run itself: the bobsled channel of glossy ice between banked snow walls with red-and-white striped
 * lips, the groomed start at the summit, the ski jump's in-run on a wooden trestle, and the groomed outrun
 * to the cliff edge.
 */

type Pt = [number, number];

/**
 * Sweep a cross-section along the path from z0 to z1. `prof(z)` gives the section's points from left to right
 * as [lateral offset, height] (already banked), `us` the texture's u for each point; v runs along the path in
 * world units divided by `vTile`. Faces point to the left of the direction the points run (up for a floor
 * drawn left to right).
 */
export function sweep(road: Road, z0: number, z1: number, step: number, prof: (z: number) => Pt[], us: (z: number) => number[], vTile: number) {
  const n = Math.max(1, Math.ceil((z0 - z1) / step));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let dist = 0, px = 0, py = 0, pz = 0, M = 0;
  for (let i = 0; i <= n; i++) {
    const z = z0 - (z0 - z1) * (i / n);
    const p = road.at(z);
    if (i > 0) dist += Math.hypot(p.x - px, p.y - py, p.z - pz);
    px = p.x; py = p.y; pz = p.z;
    const pts = prof(z), u = us(z);
    M = pts.length;
    for (let k = 0; k < M; k++) {
      const [lat, h] = pts[k];
      pos.push(p.x + p.rx * lat, p.y + h, p.z + p.rz * lat);
      uv.push(u[k], dist / vTile);
    }
    if (i < n) for (let k = 0; k < M - 1; k++) {
      const a = i * M + k, b = a + 1, c = a + M, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * The channel's shape at z: the inner surface (ice), the two lips and the two outer skirts. The floor tilts
 * across with the bank and the walls stand upright on its edges, the outside one taller in a curve.
 */
function channelShape(plan: Plan, z: number) {
  const sb = Math.sin(plan.bank(z));
  const { floor: W, r: R, thick: T } = CH;
  const wallH = (s: number) => Math.max(plan.wallTop(z, s), s * W * sb + R + 0.02);
  const inner = (s: number): Pt[] => {
    // from the wall's top down to the floor's edge, on side s
    // (every section must have the same number of points)
    const e = s * W * sb, H = wallH(s), out: Pt[] = [[s * (W + R), H], [s * (W + R), e + R]];
    for (let i = 1; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; out.push([s * (W + R * Math.cos(a)), e + R - R * Math.sin(a)]); }
    return out;
  };
  const left = inner(-1), right = inner(1).reverse();
  const ice: Pt[] = [...left, [0, 0], ...right];
  // u in surface units from the floor's centre, so the painted lines stay put whatever the walls do
  const cum = [0];
  for (let i = 1; i < ice.length; i++) cum.push(cum[i - 1] + Math.hypot(ice[i][0] - ice[i - 1][0], ice[i][1] - ice[i - 1][1]));
  const mid = cum[left.length];
  const uw = cum.map((d) => d - mid);
  const lip = (s: number): Pt[] => {
    const H = wallH(s);
    const pts: Pt[] = [[s * (W + R), H], [s * (W + R + T * 0.15), H + 0.11], [s * (W + R + T * 0.5), H + 0.15], [s * (W + R + T * 0.85), H + 0.11], [s * CH_OUT, H - 0.02]];
    return s < 0 ? pts.reverse() : pts;
  };
  const skirt = (s: number): Pt[] => {
    const H = wallH(s);
    const pts: Pt[] = [[s * CH_OUT, H - 0.02], [s * (CH_OUT + 0.7), H - 0.16], [s * (CH_OUT + 2.2), H - 0.36], [s * (CH_OUT + 3.4), H - 1.5]];
    return s < 0 ? pts.reverse() : pts;
  };
  return { ice, iceU: uw.map((u) => 0.5 + u / ICE_U), lipL: lip(-1), lipR: lip(1), skirtL: skirt(-1), skirtR: skirt(1) };
}

export interface RunParts {
  group: THREE.Group;
  /** materials that the set may want (the ice glints) */
  iceMat: THREE.MeshPhongMaterial;
  snowMat: THREE.Material;
  woodMat: THREE.Material;
}

export function buildRun(plan: Plan): RunParts {
  const { road } = plan;
  const group = new THREE.Group();
  const iceMat = new THREE.MeshPhongMaterial({ map: iceTexture(), shininess: 90, specular: 0x8a9ab8, color: 0xffffff });
  const lipMat = lambert(0xffffff, { map: lipTexture() });
  const snowMat = lambert(0xffffff, { map: snowTexture() });
  const pisteMat = lambert(0xffffff, { map: pisteTexture() });
  const woodTex = planks(0x8a5a3a, 371);
  const woodMat = lambert(0xffffff, { map: woodTex });
  const beamMat = toon(0x6a4430);

  // ---------- the ice channel ----------
  const step = 0.8;
  const shape = (z: number) => channelShape(plan, z);
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = false) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = shadow; group.add(m); return m; };
  const z0 = Z.chan0, z1 = Z.chan1;
  mk(sweep(road, z0, z1, step, (z) => shape(z).ice, (z) => shape(z).iceU, ICE_V), iceMat);
  const lipU = [0, 0.25, 0.5, 0.75, 1];
  mk(sweep(road, z0, z1, step, (z) => shape(z).lipL, () => lipU, 2.4), lipMat, true);
  mk(sweep(road, z0, z1, step, (z) => shape(z).lipR, () => lipU, 2.4), lipMat, true);
  const skU = [0, 0.15, 0.55, 1];
  mk(sweep(road, z0, z1, step, (z) => shape(z).skirtL, () => skU.map((u) => u * 0.8), 6), snowMat);
  mk(sweep(road, z0, z1, step, (z) => shape(z).skirtR, () => skU.map((u) => u * 0.8), 6), snowMat);

  // ---------- groomed snow: the start at the summit, the landing hill and the outrun ----------
  const piste = (za: number, zb: number, half: number, lift = 0.03) => {
    const c = subCurve(road, za, zb, Math.max(8, Math.ceil((za - zb) / 2)));
    const geo = ribbon(c, -half, half, Math.max(8, Math.ceil((za - zb) / 1.2)), lift, 4);
    mk(geo, pisteMat);
  };
  piste(Z.hut + 6, Z.chan0 - 1.5, 3.0);
  piste(Z.touch + 4, Z.edge + 0.4, 3.2);

  // ---------- the ski jump's in-run on its trestle ----------
  const ra = Z.ramp0 + 2, rb = Z.lip;
  {
    // the deck: an ice track between wooden boards, with low side boards
    const HW = 2.5;
    const deckIce: (z: number) => Pt[] = () => [[-1.5, 0], [0, 0], [1.5, 0]];
    mk(sweep(road, ra, rb, 0.8, deckIce, () => [0.5 - 1.5 / ICE_U, 0.5, 0.5 + 1.5 / ICE_U], ICE_V), iceMat);
    const deckWood = (s: number) => (): Pt[] => (s < 0 ? [[-HW, 0.02], [-1.5, 0.0]] : [[1.5, 0.0], [HW, 0.02]]);
    const deckU = (s: number) => () => (s < 0 ? [0, 1] : [0, 1]);
    for (const s of [-1, 1]) mk(sweep(road, ra, rb, 0.8, deckWood(s), deckU(s), 2), woodMat);
    // side boards, inside and out, with a cap
    const board = (s: number) => (): Pt[] => {
      const pts: Pt[] = [[s * (HW - 0.1), 0.0], [s * (HW - 0.1), 0.95], [s * (HW + 0.12), 1.0], [s * (HW + 0.18), -0.45]];
      return s < 0 ? pts.reverse() : pts;
    };
    for (const s of [-1, 1]) mk(sweep(road, ra, rb, 0.8, board(s), () => [0, 0.2, 0.25, 0.55], 2), woodMat, true);
    // beams under the deck and trestle legs down to the falling ground
    const parts: THREE.BufferGeometry[] = [];
    const under = (z: number) => road.at(z).y;
    const beamA = new THREE.Vector3(), beamB = new THREE.Vector3();
    const addBeam = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
      const d = b.clone().sub(a), len = d.length();
      const g = new THREE.BoxGeometry(w, len, w);
      repeatUV(g, 1, len / 2);
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate(a.x, a.y, a.z);
      parts.push(g);
    };
    for (const s of [-1, 1]) {
      // stringers under each side of the deck
      for (let z = ra; z > rb + 0.1; z -= 4) {
        const za = z, zb = Math.max(rb, z - 4);
        beamA.copy(road.side(za, s * 1.9, -0.3)); beamB.copy(road.side(zb, s * 1.9, -0.3));
        addBeam(beamA, beamB, 0.34);
      }
    }
    for (let z = ra - 3; z > rb - 0.5; z -= 3.6) {
      const zz = Math.max(rb + 0.6, z);
      const g = plan.jumpGround(zz) - 0.6;
      const top = under(zz) - 0.3;
      if (top - g < 0.6) continue;
      const L = road.side(zz, -2.1, 0), Rr = road.side(zz, 2.1, 0);
      // two legs splayed a little, a cross-tie and an X brace
      const lt = L.clone().setY(top), lb = road.side(zz, -2.7, 0).setY(g), rt = Rr.clone().setY(top), rbt = road.side(zz, 2.7, 0).setY(g);
      addBeam(lb, lt, 0.32); addBeam(rbt, rt, 0.32);
      const mid = lerp(g, top, 0.5);
      addBeam(road.side(zz, -2.4, 0).setY(mid), road.side(zz, 2.4, 0).setY(mid), 0.2);
      if (top - g > 2.5) { addBeam(lb.clone().setY(g + 0.3), rt.clone().setY(top - 0.3), 0.16); addBeam(rbt.clone().setY(g + 0.3), lt.clone().setY(top - 0.3), 0.16); }
      // a cross-beam under the deck
      addBeam(road.side(zz, -2.6, -0.45), road.side(zz, 2.6, -0.45), 0.3);
    }
    const trestle = new THREE.Mesh(mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g), false)!, beamMat);
    trestle.castShadow = true; trestle.receiveShadow = true;
    group.add(trestle);
  }

  return { group, iceMat, snowMat, woodMat };
}
