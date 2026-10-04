import * as THREE from 'three';
import { sculpt } from '../../../engine/Rig';
import { Rng, TAU, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import type { Road } from '../layout';
import { colorize, growQuat, instances, mergeParts, tubeAB, type Inst } from './geo';
import { LEDGE, SHIP, Z, seabed } from './plan';
import { reefMat } from './shaders';
import { brainTexture, fanTexture, feltTexture, kelpTexture, reefFlat, rockTexture, sandTexture, swirlTexture } from './textures';

/*
 * The sea floor and everything growing on it: a reef canyon of candy-coloured coral (branching staghorn,
 * brain coral, tube sponges, sea fans, anemones, table coral with a candy swirl, pom-poms, urchins and
 * starfish), boulders and pinnacles set in symmetric pairs down the canyon like the columns of a nave, the
 * coral arch over the path, the drop-off into the abyss, the dark cliffs far out at the sides with glowing
 * specks on them, and the kelp forest on the far wall. Painted flats at the back of the set fill the distance.
 */

export const CANDY = {
  pink: 0xf7a1bf, gum: 0xff86b0, lilac: 0xc9a6f2, peri: 0xa9b4ff, mint: 0x9ef0d2, aqua: 0x7fe3e0,
  butter: 0xffe08a, apricot: 0xffb48a, coral: 0xff8c7a, baby: 0xa6dcff, cream: 0xfff0dc, tangerine: 0xff9f4a,
};

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- coral shapes
/** Branching coral: a short trunk splitting into upturned branches with pale rounded tips. About 1 unit tall. */
function staghornGeo(seed: number) {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const grow = (a: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number) => {
    const b = a.clone().addScaledVector(dir, len);
    parts.push(tubeAB(a, b, r, r * 0.8, 5, true));
    if (depth <= 0) { parts.push(new THREE.SphereGeometry(r * 1.12, 5, 3).translate(b.x, b.y, b.z)); return; }
    const n = depth === 2 ? 3 : rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const az = (i / n) * TAU + rng.range(-0.5, 0.5);
      const spread = rng.range(0.35, 0.7);
      const d = dir.clone().multiplyScalar(Math.cos(spread)).add(V(Math.cos(az) * Math.sin(spread), 0, Math.sin(az) * Math.sin(spread))).normalize();
      d.y = Math.max(d.y, 0.35); d.normalize();
      grow(b, d, len * rng.range(0.8, 0.95), r * 0.74, depth - 1);
    }
  };
  grow(V(0, -0.1, 0), V(0, 1, 0), 0.42, 0.12, 2);
  const g = mergeParts(parts.map((p) => colorize(p, (q) => lerp(0.62, 1.0, clamp(q.y / 1.0, 0, 1)))));
  return g;
}

/** Brain coral: a low dome painted with a maze. Radius 1. */
function brainGeo() {
  const g = new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI * 0.56);
  g.scale(1, 0.62, 1);
  g.translate(0, -0.06, 0);
  return colorize(g, (p) => lerp(0.75, 1, clamp(p.y / 0.6, 0, 1)));
}

/** A cluster of tube sponges, open at the top, with a rolled rim. About 1.6 tall. */
function tubesGeo(seed: number) {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.3, 0.3), d = i === 0 ? 0 : rng.range(0.22, 0.42);
    const r = rng.range(0.11, 0.19), h = rng.range(0.7, 1.7);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const lean = V(x * 0.25, 1, z * 0.25).normalize();
    const top = V(x, -0.1, z).addScaledVector(lean, h);
    parts.push(tubeAB(V(x, -0.1, z), top, r * 0.85, r, 9, true, 2));
    const rim = new THREE.TorusGeometry(r, r * 0.22, 4, 10);
    rim.rotateX(Math.PI / 2);
    rim.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), lean));
    rim.translate(top.x, top.y, top.z);
    parts.push(rim);
  }
  return mergeParts(parts.map((p) => colorize(p, (q) => lerp(0.7, 1.0, clamp(q.y / 1.6, 0, 1)))));
}

/** A sea fan: a flat net on a pivot at its foot, 2 units tall. */
function fanGeo() {
  const g = new THREE.PlaneGeometry(2.2, 2.2, 2, 2);
  g.translate(0, 1.1, 0);
  return colorize(g, (p) => lerp(0.75, 1, clamp(p.y / 2, 0, 1)));
}

/** An anemone: a short column with a crown of candy-striped tentacles. About 0.8 tall. */
function anemoneGeo(seed: number) {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(colorize(new THREE.CylinderGeometry(0.3, 0.36, 0.42, 12, 1).translate(0, 0.11, 0), 0.75));
  const n = 15;
  for (let i = 0; i < n; i++) {
    const ring = i < 10 ? 0.26 : 0.13, a = (i / (i < 10 ? 10 : 5)) * TAU + (i < 10 ? 0 : 0.3);
    const base = V(Math.cos(a) * ring, 0.32, Math.sin(a) * ring);
    const out = V(Math.cos(a) * (ring > 0.2 ? 0.6 : 0.25), 1, Math.sin(a) * (ring > 0.2 ? 0.6 : 0.25)).normalize();
    const len = rng.range(0.42, 0.62);
    const t = tubeAB(base, base.clone().addScaledVector(out, len), 0.055, 0.012, 4, false, 3);
    // candy stripes along each tentacle
    colorize(t, (p) => (Math.floor(p.distanceTo(base) / 0.11) % 2 ? 1.0 : 0.7));
    parts.push(t);
  }
  return mergeParts(parts);
}

/** Table coral: a stalk with a flat top painted with a candy swirl. Top radius 1. */
function tableGeo() {
  const top = new THREE.CylinderGeometry(1, 0.86, 0.16, 28, 1);
  top.translate(0, 0.62, 0);
  const stalk = new THREE.CylinderGeometry(0.16, 0.28, 0.66, 8, 1, true);
  stalk.translate(0, 0.27, 0);
  return mergeParts([colorize(top, 1), colorize(stalk, 0.8)]);
}

/** Pom-pom coral: a mound of little balls. */
function pompomGeo(seed: number) {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, 0.45), r = rng.range(0.14, 0.26);
    const y = 0.12 + (0.45 - d) * 0.7 + rng.range(0, 0.1);
    parts.push(colorize(new THREE.SphereGeometry(r, 7, 5).translate(Math.cos(a) * d, y, Math.sin(a) * d), lerp(0.8, 1, y)));
  }
  return mergeParts(parts);
}

/** A sea urchin: a ball of long spines. Radius about 0.6 with spines. */
function urchinGeo(seed: number) {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [colorize(new THREE.SphereGeometry(0.22, 10, 7).translate(0, 0.12, 0), 0.7)];
  for (let i = 0; i < 26; i++) {
    const y = rng.range(-0.2, 1), a = rng.range(0, TAU), r = Math.sqrt(1 - y * y);
    const d = V(Math.cos(a) * r, y, Math.sin(a) * r);
    const s = V(0, 0.12, 0).addScaledVector(d, 0.18);
    parts.push(colorize(tubeAB(s, s.clone().addScaledVector(d, rng.range(0.3, 0.48)), 0.024, 0.004, 3, true), 1));
  }
  return mergeParts(parts);
}

/** A five-armed starfish lying flat, with a bevelled edge. About 0.5 across. */
function starGeo() {
  const sh = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, r = i % 2 ? 0.1 : 0.26;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.02, 0);
  return colorize(g, (p) => lerp(0.8, 1, clamp(p.y / 0.08, 0, 1)));
}

/** A lumpy boulder (radius about 1), sculpted so it keeps a sphere's UVs. */
function boulderGeo(seed: number, flatTop = false) {
  const off = seed * 3.7;
  return sculpt((d, out) => {
    const n = fbm(d.x * 1.7 + off, d.z * 1.7 + d.y * 1.3 - off, 3) - 0.5;
    let r = 1 + n * 0.55 + 0.08 * Math.sin(d.x * 7 + off) * Math.sin(d.z * 6);
    out.copy(d).multiplyScalar(r);
    if (flatTop && out.y > 0.42) out.y = 0.42 + (out.y - 0.42) * 0.12;
    if (out.y < -0.3) out.y = -0.3 + (out.y + 0.3) * 0.4;
  }, 22, 14);
}

/** A kelp stalk with alternating blades, `h` tall. v of the uvs runs up the stalk. */
function kelpGeo(h: number, seed: number) {
  const rng = new Rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  // the stalk: a thin twisted ribbon
  const n = Math.ceil(h / 0.8);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * h, a = y * 0.4, w = 0.07;
    pos.push(-Math.cos(a) * w, y, -Math.sin(a) * w, Math.cos(a) * w, y, Math.sin(a) * w);
    uv.push(0.45, y / 4, 0.55, y / 4);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const stalk = new THREE.BufferGeometry();
  stalk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  stalk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  stalk.setIndex(idx);
  stalk.computeVertexNormals();
  parts.push(stalk);
  // blades: long pointed leaves off alternate sides, angled up
  for (let y = 1.2; y < h - 0.6; y += rng.range(0.7, 1.0)) {
    const side = Math.floor(y / 0.85) % 2 ? 1 : -1, len = rng.range(1.3, 2.0) * (1 - 0.3 * (y / h)), w = rng.range(0.22, 0.34);
    const az = side * rng.range(0.6, 1.3) + y * 0.4;
    const dir = V(Math.cos(az) * 0.75, 0.66, Math.sin(az) * 0.75).normalize();
    const sideV = V(-Math.sin(az), 0, Math.cos(az));
    const b = V(0, y, 0);
    const p1 = b.clone().addScaledVector(dir, len * 0.35).addScaledVector(sideV, w);
    const p2 = b.clone().addScaledVector(dir, len * 0.35).addScaledVector(sideV, -w);
    const tip = b.clone().addScaledVector(dir, len).add(V(0, -len * 0.12, 0));
    const leaf = new THREE.BufferGeometry();
    leaf.setAttribute('position', new THREE.Float32BufferAttribute([b.x, b.y, b.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z, p2.x, p2.y, p2.z], 3));
    leaf.setAttribute('uv', new THREE.Float32BufferAttribute([0.5, 0, 0, 0.35, 0.5, 1, 1, 0.35], 2));
    leaf.setIndex([0, 1, 2, 0, 2, 3]);
    leaf.computeVertexNormals();
    parts.push(leaf);
  }
  return mergeParts(parts.map((p) => colorize(p, (q) => lerp(0.55, 1.05, clamp(q.y / h, 0, 1)))));
}

// ---------------------------------------------------------------- the reef
export interface Reef {
  group: THREE.Group;
  /** the seabed height (with the ledges and the arch) for thrown items */
  floor(x: number, z: number): number;
  /** the glowing specks on the deep cliffs, brightened by the set */
  deepGlow: THREE.MeshBasicMaterial;
  /** the painted flats' materials: their colour follows the fog, so they always read as a darker silhouette */
  flats: THREE.MeshBasicMaterial[];
  /** top of the arch at its middle, where the octopus sits */
  archTop: THREE.Vector3;
  /** top of the crabs' ledge */
  ledgeTop: number;
  /** the rock where Esteban's helmet lies */
  memorial: THREE.Vector3;
}

export function buildReef(road: Road, lowDetail: boolean): Reef {
  const group = new THREE.Group();
  const rng = new Rng(8101);
  const py = (z: number) => road.at(z).y;
  const H = (x: number, z: number) => seabed(x, z, py);
  const normalAt = (x: number, z: number, out = new THREE.Vector3()) => {
    const e = 0.8;
    return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize();
  };

  // ---------- the seabed itself, in strips along z ----------
  {
    const mat = reefMat({ map: sandTexture(), vertexColors: true, rim: 0 });
    const x0 = -132, x1 = 132, step = 2.6;
    const strips: Array<[number, number]> = [[-2076, -2160], [-2158, -2250], [-2248, -2340], [-2338, -2446]];
    const nrm = new THREE.Vector3();
    for (const [za, zb] of strips) {
      const nx = Math.round((x1 - x0) / step), nz = Math.round((za - zb) / step);
      const g = new THREE.PlaneGeometry(x1 - x0, za - zb, nx, nz);
      g.rotateX(-Math.PI / 2);
      g.translate((x0 + x1) / 2, 0, (za + zb) / 2);
      const pos = g.attributes.position as THREE.BufferAttribute, uvA = g.attributes.uv as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        // pull the columns together near the path, where the detail is seen
        let x = pos.getX(i);
        const t = x / 132;
        x = Math.sign(t) * Math.pow(Math.abs(t), 1.35) * 132;
        const z = pos.getZ(i);
        const y = H(x, z);
        pos.setXYZ(i, x, y, z);
        uvA.setXY(i, x / 8, z / 8);
        normalAt(x, z, nrm);
        const steep = smoothstep(0.92, 0.55, nrm.y);
        const n = fbm(x * 0.08, z * 0.08 + 3, 2);
        // sand, tinted pink and mint in patches; lilac rock on the steep walls; darker deep down
        let r = 1, gg = 1, b = 1;
        if (n > 0.55) { r = 1.0; gg = 0.9; b = 0.95; } else if (n < 0.4) { r = 0.9; gg = 1.0; b = 0.96; }
        r = lerp(r, 0.86, steep); gg = lerp(gg, 0.66, steep); b = lerp(b, 0.82, steep);
        const dk = clamp(1 + (y + 22) / 50, 0.35, 1);
        col[i * 3] = r * dk; col[i * 3 + 1] = gg * dk; col[i * 3 + 2] = b * dk;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // ---------- coral, in candy colours ----------
  const felt = feltTexture();
  const mats = {
    stag: reefMat({ map: felt, vertexColors: true, sway: 0.03 }),
    brain: reefMat({ map: brainTexture(), vertexColors: true }),
    tubes: reefMat({ map: felt, vertexColors: true, side: THREE.DoubleSide }),
    fan: reefMat({ map: fanTexture(), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, sway: 0.05, rim: 0.4 }),
    anem: reefMat({ map: felt, vertexColors: true, sway: 0.35 }),
    table: reefMat({ map: swirlTexture(), vertexColors: true }),
    pom: reefMat({ map: felt, vertexColors: true }),
    urchin: reefMat({ color: 0x8a4aa8, vertexColors: true, rim: 0.5 }),
    star: reefMat({ map: felt, vertexColors: true }),
    rock: reefMat({ map: rockTexture(), rim: 0.15 }),
    ledge: reefMat({ map: rockTexture(), color: 0xd8a4c0, rim: 0.15 }),
    kelp: reefMat({ map: kelpTexture(), vertexColors: true, side: THREE.DoubleSide, sway: 0.055, swayMode: 'kelp', rim: 0.45 }),
  };
  const geos = {
    stag: [staghornGeo(11), staghornGeo(23), staghornGeo(37)],
    brain: brainGeo(), tubes: [tubesGeo(5), tubesGeo(9)], fan: fanGeo(), anem: [anemoneGeo(3), anemoneGeo(17)],
    table: tableGeo(), pom: [pompomGeo(2), pompomGeo(8)], urchin: urchinGeo(4), star: starGeo(),
    rock: [boulderGeo(1), boulderGeo(2), boulderGeo(3)], ledge: boulderGeo(4, true),
    kelp: [kelpGeo(13, 1), kelpGeo(17, 2), kelpGeo(21, 3), kelpGeo(25, 4)],
  };
  type Kind = 'stag0' | 'stag1' | 'stag2' | 'brain' | 'tubes0' | 'tubes1' | 'fan' | 'anem0' | 'anem1' | 'table' | 'pom0' | 'pom1' | 'urchin' | 'star' | 'rock0' | 'rock1' | 'rock2' | 'kelp0' | 'kelp1' | 'kelp2' | 'kelp3';
  const lists = new Map<Kind, Inst[]>();
  const put = (k: Kind, it: Inst) => { if (!lists.has(k)) lists.set(k, []); lists.get(k)!.push(it); };
  const C = (hex: number, k = 1) => new THREE.Color(hex).multiplyScalar(k);
  const pal = {
    stag: [CANDY.pink, CANDY.gum, CANDY.apricot, CANDY.coral, CANDY.lilac, CANDY.cream, CANDY.tangerine],
    brain: [CANDY.butter, CANDY.mint, CANDY.apricot, CANDY.lilac, CANDY.aqua, CANDY.pink],
    tubes: [CANDY.tangerine, CANDY.butter, CANDY.lilac, CANDY.peri, CANDY.gum],
    fan: [CANDY.lilac, CANDY.gum, CANDY.peri, CANDY.coral, CANDY.tangerine, CANDY.pink],
    anem: [CANDY.pink, CANDY.mint, CANDY.aqua, CANDY.butter, CANDY.lilac, CANDY.gum],
    pom: [CANDY.lilac, CANDY.pink, CANDY.mint, CANDY.butter, CANDY.baby],
    star: [CANDY.tangerine, CANDY.coral, CANDY.gum, CANDY.butter],
    rock: [0xd6a8c4, 0xb8a4d8, 0xc8a0b4, 0xa8b0d0, 0xe0b8c0],
  };
  /** the sub's swept tube: keep tall things out of it */
  const clearOf = (x: number, z: number, top: number) => {
    if (z > Z.start + 4) return true;
    const ax = Math.abs(x);
    if (ax > 4.6) return true;
    const p = road.at(z);
    return top < p.y - 1.4 || (ax > 3.2 && top < p.y - 0.2);
  };
  const nrm = new THREE.Vector3();

  // ---- coral on a jittered grid: small things near the path, bigger ones up the canyon walls ----
  const avoid = (x: number, z: number) => Math.hypot(x - LEDGE.x, z - LEDGE.z) < LEDGE.r + 1.2 || Math.hypot(x - 5.8, z - Z.esteban) < 3 || (Math.abs(z - Z.arch) < 3.5 && Math.abs(x) < 11);
  const plant = (x: number, z: number, scale: number, small: boolean) => {
    const y = H(x, z);
    normalAt(x, z, nrm);
    if (nrm.y < 0.4 || avoid(x, z)) return;
    const r = rng.next();
    const yaw = rng.range(0, TAU);
    const q = growQuat(yaw, nrm, 0.5);
    let kind: Kind, s: number, hgt: number, colors: number[];
    if (small) {
      if (r < 0.22) { kind = rng.chance(0.5) ? 'anem0' : 'anem1'; s = rng.range(0.8, 1.3); hgt = s; colors = pal.anem; }
      else if (r < 0.36) { kind = 'urchin'; s = rng.range(0.6, 1.0); hgt = s * 0.7; colors = [0xffffff]; }
      else if (r < 0.5) { kind = 'star'; s = rng.range(0.9, 1.5); hgt = 0.1; colors = pal.star; }
      else if (r < 0.64) { kind = rng.chance(0.5) ? 'pom0' : 'pom1'; s = rng.range(0.7, 1.2); hgt = s * 0.6; colors = pal.pom; }
      else if (r < 0.8) { kind = 'brain'; s = rng.range(0.4, 0.9); hgt = s * 0.6; colors = pal.brain; }
      else { kind = (['stag0', 'stag1', 'stag2'] as const)[rng.int(0, 2)]; s = rng.range(0.9, 1.5); hgt = s * 1.1; colors = pal.stag; }
    } else {
      if (r < 0.3) { kind = (['stag0', 'stag1', 'stag2'] as const)[rng.int(0, 2)]; s = rng.range(1.4, 2.4) * scale; hgt = s * 1.1; colors = pal.stag; }
      else if (r < 0.44) { kind = 'brain'; s = rng.range(0.8, 1.5) * scale; hgt = s * 0.6; colors = pal.brain; }
      else if (r < 0.58) { kind = rng.chance(0.5) ? 'tubes0' : 'tubes1'; s = rng.range(1.1, 1.8) * scale; hgt = s * 1.7; colors = pal.tubes; }
      else if (r < 0.72) { kind = 'fan'; s = rng.range(0.9, 1.6) * scale; hgt = s * 2.2; colors = pal.fan; }
      else if (r < 0.82) { kind = rng.chance(0.5) ? 'anem0' : 'anem1'; s = rng.range(1.1, 1.8) * scale; hgt = s; colors = pal.anem; }
      else if (r < 0.9) { kind = 'table'; s = rng.range(0.9, 1.6) * scale; hgt = s * 0.7; colors = [0xffffff]; }
      else { kind = rng.chance(0.5) ? 'pom0' : 'pom1'; s = rng.range(1.0, 1.8) * scale; hgt = s * 0.6; colors = pal.pom; }
    }
    if (!clearOf(x, z, y + hgt)) return;
    // fans face the path, so their lace shows
    const qq = kind === 'fan' ? growQuat(Math.PI / 2 + rng.range(-0.5, 0.5), nrm, 0.3) : q;
    put(kind, { p: V(x, y - 0.05, z), q: qq, s, c: C(rng.pick(colors), rng.range(0.92, 1.05)) });
  };
  const dens = lowDetail ? 0.6 : 1;
  for (let z = -2084; z > Z.dropOff + 1; z -= 1.8) for (let ax = 2.2; ax < 9; ax += 1.8) for (const sd of [-1, 1]) {
    if (rng.next() < 0.62 * dens) plant(sd * (ax + rng.range(-0.8, 0.8)), z + rng.range(-0.8, 0.8), 1, true);
  }
  for (let z = -2083; z > Z.dropOff + 1; z -= 2.3) for (let ax = 9; ax < 36; ax += 2.3) for (const sd of [-1, 1]) {
    if (rng.next() < (ax > 26 ? 0.5 : 0.85) * dens) plant(sd * (ax + rng.range(-1, 1)), z + rng.range(-1, 1), 1 + (ax - 9) / 30, false);
    if (rng.next() < 0.45 * dens) plant(sd * (ax + rng.range(-1.2, 1.2)), z + rng.range(-1.2, 1.2), 1, true);
  }
  // an avenue of giant coral down both sides of the path, the same on the left and the right
  {
    const giants: Array<[Kind, number, number]> = [['fan', 2.1, CANDY.lilac], ['stag1', 3.2, CANDY.gum], ['tubes0', 2.4, CANDY.tangerine], ['anem0', 2.6, CANDY.mint], ['stag0', 3.4, CANDY.apricot], ['fan', 2.3, CANDY.coral], ['tubes1', 2.6, CANDY.butter], ['table', 2.2, 0xffffff], ['stag2', 3.0, CANDY.peri], ['anem1', 2.8, CANDY.pink]];
    let i = 0;
    for (let z = -2097; z > Z.dropOff + 6; z -= 8.6) {
      const [k, sc, col] = giants[i++ % giants.length];
      for (const sd of [-1, 1]) {
        const x = sd * 7.4;
        if (avoid(x, z)) continue;
        const y = H(x, z);
        const q = k === 'fan' ? growQuat(Math.PI / 2) : growQuat(sd > 0 ? 0.6 : -0.6 + Math.PI);
        put(k, { p: V(x, y - 0.1, z), q, s: sc, c: C(col) });
        // a little apron of small coral round each giant's foot
        for (let j = 0; j < 4; j++) plant(x + rng.range(-1.6, 1.6), z + rng.range(-1.6, 1.6), 1, true);
      }
    }
  }

  // ---- boulders down the canyon, and the pinnacles in symmetric pairs ----
  for (let i = 0; i < (lowDetail ? 60 : 110); i++) {
    const z = rng.range(Z.dropOff + 4, -2084), ax = rng.range(9, 42), x = rng.sign() * ax, y = H(x, z);
    const s = rng.range(1.0, 2.6) * (1 + smoothstep(10, 40, ax));
    if (!clearOf(x, z, y + s)) continue;
    put((['rock0', 'rock1', 'rock2'] as const)[rng.int(0, 2)], { p: V(x, y - s * 0.2, z), q: growQuat(rng.range(0, TAU)), s: V(s * rng.range(1, 1.6), s * rng.range(0.6, 1), s * rng.range(1, 1.5)), c: C(rng.pick(pal.rock)) });
  }
  const pinnacles: Array<[number, number, number]> = [[-2116, 9.5, 5.5], [-2140, 11.5, 7], [-2170, 10, 8.5], [-2190, 9, 7.5]];
  for (const [z, ax, h] of pinnacles) for (const s of [-1, 1]) {
    const x = s * ax, y = H(x, z);
    const top = Math.min(y + h, -1.8);
    const hh = top - y;
    put('rock1', { p: V(x, y + hh * 0.35, z), q: growQuat(s * 0.4 + z), s: V(2.6, hh * 0.62, 2.4), c: C(0xd6a8c4) });
    put('rock2', { p: V(x + s * 0.4, y + hh * 0.75, z + 0.3), q: growQuat(z * 0.3), s: V(1.9, hh * 0.32, 1.8), c: C(0xb8a4d8) });
    // a crown of coral on top, the same on both sides of the path
    const crown: Array<[Kind, number, number, number, number]> = [['stag1', 0, 0, 2.6, CANDY.gum], ['fan', -1.1, 0.4, 1.3, CANDY.lilac], ['anem0', 1.0, -0.6, 1.3, CANDY.mint], ['brain', 0.6, 0.9, 0.9, CANDY.butter], ['tubes0', -0.8, -0.8, 1.2, CANDY.tangerine]];
    for (const [k, dx, dz, sc, col] of crown) {
      const yy = top + 0.1 - Math.hypot(dx, dz) * 0.35;
      put(k, { p: V(x + s * dx, yy, z + dz), q: growQuat(k === 'fan' ? s * Math.PI / 2 : z + dx), s: sc, c: C(col) });
    }
  }

  // ---- the crabs' ledge: a flat-topped rock beside the path ----
  const ledgeTop = py(LEDGE.z) - 1.15;
  {
    const yb = H(LEDGE.x, LEDGE.z);
    const hh = ledgeTop - yb;
    const m = new THREE.Mesh(geos.ledge, mats.ledge);
    // the sculpted top is flattened at 0.42 of the radius: put it at the ledge's height, and sink the foot
    m.scale.set(LEDGE.r * 1.2, Math.max(1, hh) * 1.2, LEDGE.r);
    m.position.set(LEDGE.x - 0.4, ledgeTop - 0.42 * m.scale.y, LEDGE.z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    // coral round the rim, leaving the top clear for the crabs
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU, x = LEDGE.x + Math.cos(a) * LEDGE.r * 1.15, z = LEDGE.z + Math.sin(a) * LEDGE.r * 0.95;
      if (x > LEDGE.x + 1.5) continue;
      put(k % 3 === 0 ? 'anem1' : k % 3 === 1 ? 'pom0' : 'stag2', { p: V(x, ledgeTop - 0.35 - k * 0.04, z), q: growQuat(a), s: 0.9 + (k % 2) * 0.3, c: C(rng.pick(pal.anem)) });
    }
  }

  // ---- Esteban's rock, where his old diving helmet lies ----
  const memorial = V(5.8, 0, Z.esteban);
  {
    memorial.y = py(Z.esteban) - 1.7;
    const yb = H(memorial.x, memorial.z);
    const m = new THREE.Mesh(geos.ledge, mats.ledge);
    m.scale.set(2.2, Math.max(1, memorial.y - yb) * 1.2, 1.9);
    m.position.set(memorial.x + 0.4, memorial.y - 0.42 * m.scale.y, memorial.z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    for (const [dx, dz, k, col] of [[1.6, 0.8, 'anem0', CANDY.pink], [1.4, -1.2, 'fan', CANDY.lilac], [-0.2, 1.6, 'pom1', CANDY.mint]] as Array<[number, number, Kind, number]>) {
      put(k, { p: V(memorial.x + dx, memorial.y - 0.3, memorial.z + dz), q: growQuat(Math.PI / 2), s: 1, c: C(col) });
    }
  }

  // ---- the coral arch over the path, where the paisley octopus sits ----
  const archTop = V(0, py(Z.arch) + 7.1 + 1.0, Z.arch);
  {
    const pz = Z.arch, p0 = py(pz);
    const footY = (x: number) => H(x, pz) - 1;
    const pts = [V(-9.5, footY(-9.5), pz + 0.6), V(-8.4, p0 + 1.5, pz + 0.3), V(-7.0, p0 + 4.4, pz), V(-4.4, p0 + 6.4, pz - 0.2), V(0, p0 + 7.1, pz), V(4.4, p0 + 6.4, pz + 0.2), V(7.0, p0 + 4.4, pz), V(8.4, p0 + 1.5, pz - 0.3), V(9.5, footY(9.5), pz - 0.6)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const segs = 70, radial = 14;
    const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const c = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      curve.getPointAt(t, c);
      const r = lerp(2.3, 1.15, Math.sin(t * Math.PI) ** 0.6);
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        p.fromBufferAttribute(pos, k).sub(c);
        const lump = 1 + (fbm(t * 9 + j * 0.3, j * 0.7 + t * 3, 2) - 0.5) * 0.7;
        p.multiplyScalar(r * lump).add(c);
        pos.setXYZ(k, p.x, p.y, p.z);
      }
    }
    geo.computeVertexNormals();
    // the tube's uvs run along and around it; scale them so the rock texture keeps its size
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 9, uv.getY(i) * 2);
    const arch = new THREE.Mesh(geo, reefMat({ map: rockTexture(), color: 0xd8a8c8, rim: 0.2 }));
    arch.castShadow = true; arch.receiveShadow = true;
    group.add(arch);
    // coral growing on the arch, mirrored left and right
    for (let k = 0; k < 18; k++) {
      const t = 0.08 + (k / 17) * 0.84;
      for (const s of [-1, 1]) {
        if (s > 0 && t > 0.5) continue;
        const tt = s < 0 ? t : 1 - t;
        curve.getPointAt(tt, c);
        const r = lerp(2.3, 1.15, Math.sin(tt * Math.PI) ** 0.6);
        const up = Math.abs(tt - 0.5) < 0.12 ? 0 : 1;
        if (!up) continue;
        const kind: Kind = (['stag0', 'anem0', 'fan', 'pom1', 'tubes1', 'anem1'] as const)[k % 6];
        const col = [CANDY.pink, CANDY.mint, CANDY.lilac, CANDY.butter, CANDY.tangerine, CANDY.aqua][k % 6];
        const out = V(c.x > 0 ? 0.6 : -0.6, 1, 0).normalize();
        put(kind, { p: c.clone().addScaledVector(out, r * 0.85).setZ(c.z + (k % 3 - 1) * 0.6), q: growQuat(k * 1.3, out, 0.7), s: 0.8 + (k % 4) * 0.15, c: C(col) });
      }
    }
  }

  // ---- the kelp forest on the far wall, up to the light ----
  const kelpN = lowDetail ? 150 : 260;
  for (let i = 0; i < kelpN; i++) {
    const z = rng.range(Z.wall0 - 6, Z.kelp1);
    const ax = 4.8 + Math.pow(rng.next(), 1.3) * 42, x = rng.sign() * ax;
    // keep the kelp clear of the Belafonte's hull
    if (x > SHIP.face - 2 && z < SHIP.stern + 3) continue;
    const y = H(x, z);
    if (y < -36) continue;
    const want = -0.8 - y;
    const k = want > 22 ? 3 : want > 18 ? 2 : want > 14 ? 1 : 0;
    const h = [13, 17, 21, 25][k];
    const s = clamp(want / h, 0.6, 1.15);
    const top = y + h * s;
    if (Math.abs(x) < 5.5 && top > py(z) - 1.5 && z > Z.surface - 10) continue;
    put((['kelp0', 'kelp1', 'kelp2', 'kelp3'] as const)[k], { p: V(x, y - 0.2, z), q: growQuat(rng.range(0, TAU)), s: V(1, s, 1), c: C(rng.pick([0xffffff, 0xf0f4c0, 0xffe8b0, 0xe0f0b0]), rng.range(0.85, 1.05)) });
    // coral and boulders at the kelp's feet
    if (rng.chance(0.35)) put((['rock0', 'rock1', 'rock2'] as const)[rng.int(0, 2)], { p: V(x + rng.range(-2, 2), y - 0.4, z + rng.range(-2, 2)), q: growQuat(rng.range(0, TAU)), s: rng.range(0.8, 1.8), c: C(rng.pick(pal.rock), 0.9) });
    if (rng.chance(0.3)) put((['anem0', 'brain', 'pom0'] as const)[rng.int(0, 2)], { p: V(x + rng.range(-2, 2), y, z + rng.range(-2, 2)), q: growQuat(rng.range(0, TAU)), s: rng.range(0.8, 1.4), c: C(rng.pick(pal.anem)) });
  }

  // ---- build the instanced meshes ----
  const geoOf = (k: Kind): [THREE.BufferGeometry, THREE.Material, boolean] => {
    const n = +k.slice(-1);
    if (k.startsWith('stag')) return [geos.stag[n], mats.stag, true];
    if (k.startsWith('tubes')) return [geos.tubes[n], mats.tubes, true];
    if (k.startsWith('anem')) return [geos.anem[n], mats.anem, false];
    if (k.startsWith('pom')) return [geos.pom[n], mats.pom, false];
    if (k.startsWith('rock')) return [geos.rock[n], mats.rock, true];
    if (k.startsWith('kelp')) return [geos.kelp[n], mats.kelp, false];
    switch (k) {
      case 'brain': return [geos.brain, mats.brain, true];
      case 'fan': return [geos.fan, mats.fan, false];
      case 'table': return [geos.table, mats.table, true];
      case 'urchin': return [geos.urchin, mats.urchin, false];
      default: return [geos.star, mats.star, false];
    }
  };
  const dbg: string[] = [];
  for (const [k, list] of lists) {
    const [geo, mat, shadow] = geoOf(k);
    dbg.push(`${k}:${list.length}x${(geo.index ? geo.index.count : geo.attributes.position.count) / 3}`);
    const ig = instances(geo, mat, list, { chunk: 24, castShadow: shadow && !lowDetail && k.startsWith('rock') });
    ig.name = k;
    group.add(ig);
  }

  console.warn('[aq] reef', dbg.join(' '));
  // ---------- the painted flats at the back of the set ----------
  const flats: THREE.MeshBasicMaterial[] = [];
  {
    const flatMat = (seed: number, color: number) => { const m = new THREE.MeshBasicMaterial({ map: reefFlat(seed), color, alphaTest: 0.5, side: THREE.DoubleSide, fog: true }); flats.push(m); return m; };
    const layers: Array<[number, number, number]> = [[38, 16, 0x2a7890], [52, 24, 0x2a7088], [68, 32, 0x2a6a84]];
    layers.forEach(([ax, h, col], li) => {
      const mat = flatMat(600 + li, col);
      for (let z = -2086; z > Z.dropOff - 2; z -= 52) for (const s of [-1, 1]) {
        const x = s * (ax + ((z * 0.37) % 5));
        const y0 = H(x, z - 26) - 2;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(56, h), mat);
        m.position.set(x, y0 + h / 2 - 1, z - 26);
        m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(m);
      }
      // the kelp forest's flats
      const kmat = flatMat(700 + li, col);
      for (let z = Z.wall0 + 4; z > Z.kelp1 - 30; z -= 50) for (const s of [-1, 1]) {
        const x = s * (ax + 6);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(54, h + 10), kmat);
        m.position.set(x, -22 + (h + 10) / 2, z - 25);
        m.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(m);
      }
    });
  }

  // ---------- glowing specks on the dark cliffs of the deep ----------
  const deepGlow = new THREE.MeshBasicMaterial({ color: 0x9ff8ff, fog: true });
  {
    const items: Inst[] = [];
    const g = new THREE.SphereGeometry(0.22, 6, 4);
    const cols = [0x9ff8ff, 0xffa8e8, 0xc8ff9a, 0xb8b0ff];
    for (let i = 0; i < 420; i++) {
      const z = rng.range(Z.dropOff - 2, Z.wall1 + 4), s = rng.sign();
      const ax = rng.range(30, 56), x = s * ax;
      const y = H(x, z);
      if (y < -78 || y > -6) continue;
      items.push({ p: V(x - s * 0.3, y + 0.2, z), s: rng.range(0.6, 1.6), c: new THREE.Color(rng.pick(cols)).multiplyScalar(rng.range(0.6, 1.4)) });
    }
    // and a scatter on the drop-off's face below the reef's lip
    for (let i = 0; i < 160; i++) {
      const z = rng.range(Z.dropOff - 9, Z.dropOff - 3), x = rng.range(-30, 30);
      const y = H(x, z);
      if (y > py(z) - 6) continue;
      items.push({ p: V(x, y, z + 0.6), s: rng.range(0.5, 1.2), c: new THREE.Color(rng.pick(cols)).multiplyScalar(rng.range(0.6, 1.3)) });
    }
    group.add(instances(g, deepGlow, items, { chunk: 50 }));
  }

  const floor = (x: number, z: number) => {
    if (Math.hypot(x - LEDGE.x, (z - LEDGE.z) * 1.2) < LEDGE.r) return ledgeTop;
    if (Math.hypot(x - memorial.x, z - memorial.z) < 1.8) return memorial.y;
    return H(x, z);
  };
  return { group, floor, deepGlow, flats, archTop, ledgeTop, memorial };
}
