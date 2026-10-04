import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canopyGeometry, foliageMaterial, type Blob } from '../../../engine/Foliage';
import { repeatUV } from '../../../engine/Paint';
import { softDot } from '../../../engine/Particles';
import { Rng, TAU, clamp, fbm, lerp, smoothstep } from '../../../engine/math';
import { boxProxy } from '../common';
import type { Road } from '../layout';
import {
  BANDS, BOWL_BOTTOM, Bins, CRYSTAL, CX, CZ, INNER, KEEP1, KEEP2, RIM, Y_IN, Y_K1, Y_K2, Y_OUT,
  angDiff, annulus, block, deg, laputaMats, polar, radiusOf, ringWall, rootTube,
} from './parts';
import type { Plan } from './plan';
import { mistPuffs, waterfalls, type FallSpec } from './water';
import { cloudTop } from './clouds';

/*
 * Laputa itself: the stone tiers and towers, the rock bowl underneath with its hanging spires and roots,
 * the glowing levitation crystal, the keep with the great tree on top, the tree's roots pouring over the
 * walls, the gateway arches in the inner terrace's wall, the waterfalls and their mist, and ivy on the
 * walls. Everything static is filed into `bins` so it can be merged per material and culled in pieces.
 */

const SECTORS = 8;
/** the outer wall's top, just above the garden, where the parapet sits */
const RIM_TOP = 48.6;

export interface Castle {
  crystal: THREE.Group;
  /** set the crystal's glow (1 normal, higher brighter) */
  glow(k: number, t: number): void;
  falls: ReturnType<typeof waterfalls>;
  mist: ReturnType<typeof mistPuffs>;
  /** the great tree's leaves, swayed by the set */
  crown: THREE.Mesh;
  /** the trunk's top, for the tree's photo subject */
  treeTop: THREE.Vector3;
  proxies: THREE.Object3D[];
}

/** One gateway arch, perpendicular to the path at z: two piers and a round arch the Catbus runs under. */
function gatewayArch(road: Road, z: number, mats: ReturnType<typeof laputaMats>, rng: Rng) {
  const p = road.at(z);
  const g = new THREE.Group();
  const W = 7.6, open = 4.8, spring = 3.2, H = 11.6, D = 2.0;
  const s = new THREE.Shape();
  s.moveTo(-W, 0); s.lineTo(-open, 0); s.lineTo(-open, spring);
  s.absarc(0, spring, open, Math.PI, 0, true);
  s.lineTo(open, 0); s.lineTo(W, 0); s.lineTo(W, H - 1.2);
  // a broken top: the right shoulder has lost some stones
  s.lineTo(W - 1.6, H - 0.6); s.lineTo(W - 3.0, H); s.lineTo(-W + 1.0, H); s.lineTo(-W, H - 0.4); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false, curveSegments: 18 });
  geo.translate(0, -0.3, -D / 2);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 8, uv.getY(i) / 8);
  g.add(new THREE.Mesh(geo, mats.stone));
  // plinths at the foot of the piers, a cornice, the voussoirs picked out, moss along the top
  for (const sx of [-1, 1]) {
    g.add(block(W - open + 0.8, 1.2, D + 0.8, mats.stone, sx * (open + W) / 2, 0.3, 0));
    g.add(block(W - open + 0.4, 0.5, D + 0.5, mats.stone, sx * (open + W) / 2, spring, 0));
  }
  g.add(block(W * 2 - 2.6, 0.6, D + 0.6, mats.stone, -0.6, H - 0.2, 0));
  g.add(block(1.1, 1.5, D + 0.3, mats.stone, 0, spring + open + 0.55, 0));
  const moss = block(W * 2 - 3.2, 0.35, D + 0.7, mats.moss, -0.8, H + 0.25, 0, 0, 3);
  g.add(moss);
  // fallen stones at the foot
  for (let i = 0; i < 5; i++) {
    const b = block(rng.range(0.6, 1.3), rng.range(0.4, 0.8), rng.range(0.6, 1.2), mats.ruin, rng.sign() * rng.range(8.5, 11), 0.15, rng.range(-2, 2), rng.range(0, 3));
    b.rotation.z = rng.range(-0.3, 0.3);
    g.add(b);
  }
  g.position.set(p.x, p.y - 0.02, z);
  g.rotation.y = road.along(z);
  return g;
}

export function buildCastle(road: Road, plan: Plan, bins: Bins, rng: Rng, lowDetail: boolean): Castle {
  const M = laputaMats();
  const proxies: THREE.Object3D[] = [];
  const gaps = [plan.entryA, plan.exitA];
  const gapHalf = 7.5 / RIM;
  const inGap = (a: number, extra = 0) => gaps.some((g) => Math.abs(angDiff(a, g)) < gapHalf + extra);
  const sectorA = (k: number) => -Math.PI + (k / SECTORS) * TAU;
  const mid = (a0: number, a1: number, r: number) => polar(r, (a0 + a1) / 2, 0);
  const put = (m: THREE.Object3D, a: number, r: number, cast?: boolean) => { const p = polar(r, a, 0); return bins.addAt(m, p.x, p.z, cast); };

  // =============== the walls under the rim, stepping inwards as they go down ===============
  for (let k = 0; k < SECTORS; k++) {
    const a0 = sectorA(k), a1 = sectorA(k + 1);
    BANDS.forEach(([r, y0, y1], b) => {
      const top = b === 0
        ? (a: number) => { const gk = gaps.reduce((m, g) => Math.max(m, 1 - smoothstep(gapHalf, gapHalf + 0.035, Math.abs(angDiff(a, g)))), 0); const p = polar(r, a, 0); return lerp(RIM_TOP, plan.height(p.x, p.z) - 0.05, gk); }
        : () => y1;
      const geo = ringWall(r, a0, a1, () => y0, top, { tile: 12, tileV: (y1 - y0) / (b === 2 ? 1 : 2), vBase: y0 + (b === 0 ? -0.6 : 0) });
      const c = mid(a0, a1, r);
      bins.addAt(new THREE.Mesh(geo, M.arches), c.x, c.z, false);
      // the overhang underneath, where the next band steps in
      if (b < 2) bins.addAt(new THREE.Mesh(annulus(BANDS[b + 1][0], r, a0, a1, () => y0, false, 8), M.stone), c.x, c.z, false);
    });
    // a band of moss along the foot of the parapet, which also tidies the garden's edge against the wall
    { const c = mid(a0, a1, RIM); bins.addAt(new THREE.Mesh(annulus(RIM - 1.5, RIM + 0.02, a0, a1, (r, a) => { const p = polar(r, a, 0); return plan.height(p.x, p.z) + 0.03; }, true, 4, 1.0), M.moss), c.x, c.z, false); }
    // the rock bowl under everything
    const phi0 = Math.PI / 2 - a1, len = a1 - a0;
    const prof: Array<[number, number]> = [[0.01, BOWL_BOTTOM], [8, BOWL_BOTTOM + 0.7], [20, BOWL_BOTTOM + 3], [32, BOWL_BOTTOM + 7.5], [44, BOWL_BOTTOM + 14.5], [53, -8], [58.5, -3], [61, 0], [61.3, 0.5]];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 14, phi0, len);
    const pos = lathe.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const w = smoothstep(-0.5, -5, y) * Math.min(1, r / 12);
      const n = (fbm((x + CX) * 0.07, (z + CZ) * 0.07 + y * 0.05, 3) - 0.5) * 7 * w;
      const s = r > 0.01 ? (r + n) / r : 1;
      pos.setXYZ(i, x * s + CX, y + (fbm(x * 0.05 + 3, z * 0.05, 2) - 0.5) * 4 * w, z * s + CZ);
    }
    lathe.computeVertexNormals();
    repeatUV(lathe, (len * 61) / 14, 4);
    const lm = new THREE.Mesh(lathe, M.rock);
    const c = mid(a0, a1, 40);
    bins.addAt(lm, c.x, c.z, false);
  }
  // the island's body, for line-of-sight checks: two crossed boxes inside the walls, and one for the bowl
  for (const yaw of [0, Math.PI / 4]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(118, 47, 118), new THREE.MeshBasicMaterial());
    b.position.set(CX, 23.5, CZ); b.rotation.y = yaw; b.visible = false; b.updateMatrixWorld(true);
    proxies.push(b);
  }
  { const b = new THREE.Mesh(new THREE.BoxGeometry(76, 26, 76), new THREE.MeshBasicMaterial()); b.position.set(CX, -13, CZ); b.visible = false; b.updateMatrixWorld(true); proxies.push(b); }

  // =============== buttresses down the walls ===============
  BANDS.forEach(([r, y0, y1], b) => {
    const step = deg([10, 12, 15][b]);
    for (let a = -Math.PI + rng.range(0, step); a < Math.PI; a += step) {
      if (b === 0 && inGap(a, 0.06)) continue;
      const h = (b === 0 ? RIM_TOP - 0.4 : y1) - y0;
      const g = new THREE.Group();
      g.add(block(1.8, h, 2.4, M.stone, 0, h / 2, 1.0));
      // a sloped cap and a stepped foot
      const cap = block(1.9, 0.8, 3.0, M.stone, 0, h - 0.2, 0.8); cap.rotation.x = 0.45; g.add(cap);
      g.add(block(1.4, 1.6, 1.6, M.stone, 0, -0.6, 0.6));
      g.position.copy(polar(r, a, y0));
      g.rotation.y = Math.PI / 2 - a;
      put(g, a, r, false);
    }
  });

  // =============== the parapet round the rim, with merlons; open where the path crosses ===============
  {
    const segLen = 3.1;
    const n = Math.round((TAU * RIM) / segLen);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI + (i / n) * TAU;
      // open between the two gate towers
      if (inGap(a, 0.03)) continue;
      // here and there a stretch has fallen away
      if (fbm(a * 3 + 11, 2, 2) > 0.66) continue;
      const g = new THREE.Group();
      const h = 1.2 + rng.range(-0.15, 0.1);
      // the blocks reach down into the turf, so no gap shows under them from inside
      g.add(block(segLen + 0.05, h + 0.8, 1.1, M.stone, 0, (h - 0.8) / 2, 0));
      if (i % 2 === 0 && rng.chance(0.85)) g.add(block(1.3, 0.85, 1.25, M.stone, 0, h + 0.42, 0));
      g.position.copy(polar(RIM - 0.45, a, RIM_TOP - 0.05));
      g.rotation.y = -a + Math.PI / 2;
      put(g, a, RIM);
    }
    // stubby gate towers either side of each gap, where the path lands and where it leaves
    for (const gA of gaps) for (const s of [-1, 1]) {
      const a = gA + s * (gapHalf + 0.03);
      const t = new THREE.Group();
      t.add(new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(1.5, 1.7, 4.6, 12), 1, 0.6), M.stone).translateY(2.0));
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.5, 12), M.stone).translateY(4.4));
      t.add(new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.95, 0.2, 12), M.moss).translateY(4.75));
      t.position.copy(polar(RIM - 0.6, a, RIM_TOP - 0.4));
      put(t, a, RIM);
    }
  }

  // =============== towers on the rim ===============
  const towerAngles = [0, 38, 76, 142, 180, 218, 284, 322].map(deg);
  for (const [i, a] of towerAngles.entries()) {
    const t = new THREE.Group();
    const r = 3.4 + rng.range(0, 0.6), top = 58 + rng.range(-2, 6), base = 22;
    const h = top - base;
    t.add(new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(r, r, h, 18, 1, true), Math.max(1, Math.round((TAU * r) / 10)), h / 9), M.arches).translateY(base + h / 2));
    // a corbelled foot tapering down under the wall
    const foot = new THREE.Mesh(repeatUV(new THREE.ConeGeometry(r, 9, 18, 1, true), 2, 1), M.stone); foot.rotation.x = Math.PI; foot.position.y = base - 4.5; t.add(foot);
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.6, r + 0.6, 1.2, 18), M.stone).translateY(top + 0.2));
    if (i % 3 !== 2) {
      // a verdigris cone roof with a little finial
      t.add(new THREE.Mesh(repeatUV(new THREE.ConeGeometry(r + 1.1, 7 + r * 0.6, 18), 2, 1), M.roof).translateY(top + 0.8 + (7 + r * 0.6) / 2));
      t.add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), M.roof).translateY(top + 1.0 + 7 + r * 0.6));
    } else {
      // a broken top: jagged merlons and moss
      for (let k = 0; k < 7; k++) { const aa = (k / 7) * TAU; t.add(block(1.3, rng.range(0.6, 2.4), 0.9, M.ruin, Math.cos(aa) * r, top + 0.9, Math.sin(aa) * r, -aa)); }
      t.add(new THREE.Mesh(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), M.moss).translateY(top + 0.85));
    }
    t.position.copy(polar(RIM + r * 0.55, a, 0));
    put(t, a, RIM, false);
  }

  // =============== the bowl's hanging spires, upside-down turrets and roots ===============
  const bowlY = (r: number) => { const pts = [[0, BOWL_BOTTOM], [8, BOWL_BOTTOM + 0.7], [20, BOWL_BOTTOM + 3], [32, BOWL_BOTTOM + 7.5], [44, BOWL_BOTTOM + 14.5], [53, -8], [58.5, -3], [61, 0]]; for (let i = 0; i < pts.length - 1; i++) if (r <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (r - pts[i][0]) / (pts[i + 1][0] - pts[i][0])); return 0; };
  for (let i = 0; i < 26; i++) {
    const a = rng.range(-Math.PI, Math.PI), r = rng.range(10, 56);
    const len = lerp(26, 8, r / 56) * rng.range(0.7, 1.2), rad = lerp(4.2, 1.6, r / 56) * rng.range(0.8, 1.2);
    // keep clear of the crystal and the roots holding it
    { const p = polar(r, a, 0); if (Math.hypot(p.x - CRYSTAL.x, p.z - CRYSTAL.z) < 13) continue; }
    const sp = new THREE.Mesh(repeatUV(new THREE.ConeGeometry(rad, len, 7, 3), 2, len / 10), M.rock);
    sp.rotation.set(Math.PI + rng.range(-0.12, 0.12), rng.range(0, TAU), rng.range(-0.12, 0.12));
    sp.position.copy(polar(r, a, bowlY(r) - len / 2 + 2));
    put(sp, a, r, false);
  }
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI + ((i + rng.range(0.2, 0.8)) / 10) * TAU;
    const [r0, y0] = i % 2 ? [79, 30] : [67, 13];
    const t = new THREE.Group();
    t.add(new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(2.1, 2.1, 7, 12, 1, true), 1, 0.7), M.arches).translateY(-3.5));
    const tip = new THREE.Mesh(repeatUV(new THREE.ConeGeometry(2.5, 6.5, 12), 2, 1), M.roof); tip.rotation.x = Math.PI; tip.position.y = -7 - 3.25; t.add(tip);
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.8, 12), M.stone).translateY(-6.9));
    t.position.copy(polar(r0, a, y0));
    put(t, a, r0, false);
  }
  {
    // fine roots hanging from the bowl and under the overhangs, merged as one
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < (lowDetail ? 30 : 56); i++) {
      const a = rng.range(-Math.PI, Math.PI);
      const under = rng.chance(0.3);
      const r = under ? rng.range(62, 84) : rng.range(6, 58);
      const y0 = under ? (r > 73 ? 30 : 13) : bowlY(r) + 0.5;
      const len = rng.range(8, 30);
      const p0 = polar(r, a, y0), dr = rng.range(-0.15, 0.15);
      const pts = [p0, polar(r + dr * len * 0.3, a + rng.range(-0.02, 0.02), y0 - len * 0.35), polar(r + dr * len * 0.6, a + rng.range(-0.03, 0.03), y0 - len * 0.7), polar(r + dr * len, a, y0 - len)];
      const r0 = rng.range(0.18, 0.4);
      if (Math.hypot(p0.x - CRYSTAL.x, p0.z - CRYSTAL.z) < 9) continue;
      parts.push(rootTube(new THREE.CatmullRomCurve3(pts), (t) => lerp(r0, 0.04, t), 10, 5));
    }
    const geo = mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
    bins.addAt(new THREE.Mesh(geo, M.bark), CX, CZ + 70, false);
  }

  // =============== the levitation crystal, held by roots under the middle ===============
  const crystal = new THREE.Group();
  crystal.position.copy(CRYSTAL);
  const cu = { glow: { value: 1.4 }, time: { value: 0 }, core: { value: new THREE.Color(0xa6ecff) }, edge: { value: new THREE.Color(0x2a62ff) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.0026 } };
  const cmat = new THREE.ShaderMaterial({
    uniforms: cu,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vWorld; varying float vFogDepth; varying float vY;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz; vY = position.y;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float glow; uniform float time; uniform vec3 core; uniform vec3 edge; uniform vec3 fogColor; uniform float fogDensity;
      varying vec3 vN; varying vec3 vWorld; varying float vFogDepth; varying float vY;
      void main() {
        vec3 n = normalize(vN);
        vec3 V = normalize(cameraPosition - vWorld);
        float f = clamp(dot(n, V), 0.0, 1.0);
        // each facet a different brightness, a bright heart seen straight on, deep blue at the edges
        float facet = 0.6 + 0.4 * abs(sin(dot(n, vec3(3.1, 1.7, 2.3)) * 2.0));
        vec3 col = mix(edge, core, f * f) * facet;
        float pulse = 0.88 + 0.12 * sin(time * 1.6 - vY * 0.35);
        col *= glow * pulse;
        float fog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
        col = mix(col, fogColor, clamp(fog, 0.0, 1.0) * 0.3);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const prism = (len: number, r: number) => {
    const body = new THREE.CylinderGeometry(r, r * 0.9, len * 0.72, 6, 1).translate(0, -len * 0.36, 0);
    const tip = new THREE.ConeGeometry(r * 0.9, len * 0.28, 6).rotateX(Math.PI).translate(0, -len * 0.72 - len * 0.14, 0);
    const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()], false)!;
    g.computeVertexNormals();
    return g;
  };
  {
    const parts: THREE.BufferGeometry[] = [prism(22, 3.6)];
    const cr = new Rng(909);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * TAU + cr.range(-0.2, 0.2), tilt = cr.range(0.3, 0.9);
      const g = prism(cr.range(7, 15), cr.range(1.1, 2.4));
      g.rotateX(tilt); g.rotateY(a); g.translate(Math.cos(a) * 0.8, cr.range(-3, 0.5), Math.sin(a) * 0.8);
      parts.push(g);
    }
    const geo = mergeGeometries(parts, false)!;
    crystal.add(new THREE.Mesh(geo, cmat));
    // a soft blue halo round it, brighter when the crystal flares
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0x58b8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(60); halo.position.y = -11;
    crystal.add(halo);
    crystal.userData.halo = halo;
    // its light falling on the cloud below: a soft blue pool on the cloud tops
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softDot(), color: 0x3a8cff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.position.y = cloudTop(CRYSTAL.x, CRYSTAL.z) - CRYSTAL.y + 1.5;
    crystal.add(pool);
    crystal.userData.pool = pool;
  }
  {
    // roots from the bottom of the bowl curl down round the crystal and hold it
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3, pts: THREE.Vector3[] = [];
      const top = bowlY(radiusOf(CRYSTAL.x, CRYSTAL.z)) + 2;
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, rr = 3.0 + Math.sin(t * Math.PI) * 2.8 + (k === 0 ? 3.5 : 0);
        pts.push(new THREE.Vector3(CRYSTAL.x + Math.cos(a + t * 1.6) * rr, lerp(top, CRYSTAL.y - 9, t), CRYSTAL.z + Math.sin(a + t * 1.6) * rr));
      }
      parts.push(rootTube(new THREE.CatmullRomCurve3(pts), (t) => lerp(0.9, 0.18, t), 24, 6));
    }
    bins.addAt(new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!, M.bark), CX, CZ - 70, false);
  }

  // =============== the inner terrace's retaining wall and balustrade, with two gateways ===============
  const gateHalf = 8.2 / INNER;
  const wallGaps = [plan.gate1A, plan.gate2A];
  const wallGap = (a: number) => wallGaps.some((g) => Math.abs(angDiff(a, g)) < gateHalf) || Math.abs(angDiff(a, plan.streamA)) < 1.3 / INNER;
  {
    const N = Math.round((TAU * INNER) / 1.5);
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        const a0 = run[0], a1 = run[run.length - 1] + TAU / N;
        const c = mid(a0, a1, INNER);
        bins.addAt(new THREE.Mesh(ringWall(INNER + 0.5, a0, a1, () => Y_OUT - 0.4, () => Y_IN + 0.2, { tile: 8, vBase: Y_IN + 0.2 }), M.stone), c.x, c.z);
        bins.addAt(new THREE.Mesh(annulus(INNER - 0.3, INNER + 0.55, a0, a1, () => Y_IN + 0.2, true, 4), M.stone), c.x, c.z);
      }
      run = [];
    };
    for (let i = 0; i < N; i++) { const a = -Math.PI + (i / N) * TAU; if (wallGap(a)) flush(); else run.push(a); }
    flush();
    // the balustrade: a rail on little posts, broken here and there
    const n = Math.round((TAU * INNER) / 2.4);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI + (i / n) * TAU;
      if (wallGap(a) || wallGap(a + 1.2 / INNER) || wallGap(a - 1.2 / INNER)) continue;
      if (fbm(a * 4 + 5, 7, 2) > 0.64) continue;
      const g = new THREE.Group();
      g.add(block(2.5, 0.22, 0.45, M.stone, 0, 0.92, 0));
      g.add(block(2.5, 0.2, 0.55, M.stone, 0, 0.1, 0));
      for (let k = 0; k < 4; k++) g.add(block(0.2, 0.7, 0.2, M.stone, -0.9 + k * 0.6, 0.5, 0));
      g.position.copy(polar(INNER + 0.1, a, Y_IN + 0.2));
      g.rotation.y = -a + Math.PI / 2;
      put(g, a, INNER);
    }
  }
  for (const z of [plan.gate1Z, plan.gate2Z]) {
    const arch = gatewayArch(road, z, M, rng);
    const p = road.at(z);
    bins.addAt(arch, p.x, z, true);
    // line-of-sight stand-ins for the two piers only, so the view through the arch stays open
    for (const s of [-1, 1]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.8, 11, 2), new THREE.MeshBasicMaterial());
      pier.position.copy(road.side(z, s * 6.2, 5.5)); pier.rotation.y = road.along(z); pier.visible = false; pier.updateMatrixWorld(true);
      proxies.push(pier);
    }
  }

  // =============== the keep: two round tiers with turrets, the great tree on top ===============
  const core = (m: THREE.Object3D) => bins.addAt(m, CX, CZ, true);
  for (let q = 0; q < 4; q++) {
    const a0 = -Math.PI + (q * TAU) / 4, a1 = a0 + TAU / 4;
    core(new THREE.Mesh(ringWall(KEEP1, a0, a1, () => Y_IN - 0.5, () => Y_K1 + 0.2, { tile: 12, tileV: 8.8, vBase: Y_IN - 0.4 }), M.arches));
    core(new THREE.Mesh(annulus(KEEP2 - 0.3, KEEP1, a0, a1, () => Y_K1, true, 6), M.moss));
    core(new THREE.Mesh(ringWall(KEEP2, a0, a1, () => Y_K1 - 0.3, () => Y_K2 + 0.2, { tile: 12, tileV: 7.9, vBase: Y_K1 - 0.3 }), M.arches));
    core(new THREE.Mesh(annulus(0.5, KEEP2, a0, a1, () => Y_K2, true, 6), M.moss));
  }
  for (const [r, y] of [[KEEP1, Y_K1], [KEEP2, Y_K2]] as const) {
    const n = Math.round((TAU * r) / 2.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const g = new THREE.Group();
      g.add(block(2.65, 0.9, 0.8, M.stone, 0, 0.45, 0));
      if (i % 2 === 0) g.add(block(1.2, 0.8, 0.9, M.stone, 0, 1.25, 0));
      g.position.copy(polar(r - 0.4, a, y));
      g.rotation.y = -a + Math.PI / 2;
      core(g);
    }
  }
  for (const a of [0, 90, 180, 270].map(deg)) {
    const t = new THREE.Group(), h = Y_K1 + 8 - (Y_IN - 1);
    t.add(new THREE.Mesh(repeatUV(new THREE.CylinderGeometry(2.4, 2.4, h, 14, 1, true), 1, h / 9), M.arches).translateY(Y_IN - 1 + h / 2));
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.8, 14), M.stone).translateY(Y_K1 + 8.2));
    t.add(new THREE.Mesh(repeatUV(new THREE.ConeGeometry(3.1, 6, 14), 2, 1), M.roof).translateY(Y_K1 + 11.6));
    t.position.copy(polar(KEEP1 + 0.8, a, 0));
    core(t);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + deg(15);
    const g = new THREE.Group();
    g.add(block(1.4, Y_K1 - Y_IN, 1.8, M.stone, 0, (Y_K1 - Y_IN) / 2, 0.7));
    g.position.copy(polar(KEEP1, a, Y_IN - 0.3));
    g.rotation.y = Math.PI / 2 - a;
    core(g);
  }
  proxies.push(boxProxy(new THREE.Mesh(new THREE.CylinderGeometry(KEEP1 * 0.8, KEEP1 * 0.8, Y_K1 - Y_IN, 8).translate(CX, (Y_K1 + Y_IN) / 2, CZ))));

  // ---- the trunk: fluted and flaring at the foot, rising from the top of the keep ----
  const trunkBase = Y_K2 - 0.6, trunkTop = Y_K2 + 25;
  {
    const h = trunkTop - trunkBase;
    const geo = new THREE.CylinderGeometry(6.0, 10.5, h, 36, 14, true);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const t = (y + h / 2) / h, a = Math.atan2(z, x);
      const s = 1 + 0.17 * Math.sin(a * 7 + t * 2.2) * Math.pow(Math.max(0, 1 - t), 1.5) + (fbm(a * 2 + 3, t * 3, 3) - 0.5) * 0.18;
      pos.setXYZ(i, x * s + CX, y + trunkBase + h / 2, z * s + CZ);
    }
    geo.computeVertexNormals();
    repeatUV(geo, 9, h / 6);
    core(new THREE.Mesh(geo, M.bark));
    proxies.push(boxProxy(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, h, 8).translate(CX, trunkBase + h / 2, CZ))));
  }

  // ---- the crown: big soft blobs of leaf cards, wide enough to hang over the path ----
  const crownBlobs: Blob[] = [
    [0, 100, 0, 26, 13, 26], [22, 93, 8, 15, 10, 15], [-21, 94, 12, 16, 10, 15], [-13, 95, -22, 15, 10, 15], [14, 94, -21, 15, 10, 14],
    [6, 92, 26, 14, 9, 14], [-29, 89, -5, 13, 9, 13], [-24, 86, 18, 10, 7, 10], [2, 113, 2, 18, 10, 18], [-9, 108, 11, 12, 8, 12], [12, 109, -9, 12, 8, 12],
    [30, 88, -6, 10, 7, 10], [-6, 87, -31, 10, 7, 10],
  ].map(([x, y, z, rx, ry, rz]) => ({ c: new THREE.Vector3(CX + x, y, CZ + z), r: new THREE.Vector3(rx, ry, rz) }));
  const leaf = foliageMaterial();
  let crown: THREE.Mesh;
  {
    const lr = new Rng(1987);
    const geo = canopyGeometry(crownBlobs, lr, { density: lowDetail ? 0.045 : 0.08, cardScale: 0.75 });
    // deep green with sunlit yellow-green on top
    const col = geo.attributes.color as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute;
    const dark = new THREE.Color(0x3f7a3a), light = new THREE.Color(0x8cba54), c = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      const k = clamp((pos.getY(i) - 84) / 32, 0, 1);
      c.copy(dark).lerp(light, k * 0.7);
      col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
    }
    crown = new THREE.Mesh(geo, leaf.material);
    crown.customDepthMaterial = leaf.depth;
    crown.castShadow = true; crown.receiveShadow = true;
    // pivot the crown at the trunk's top so it can sway as one
    const pivot = new THREE.Group(); pivot.position.set(CX, trunkTop, CZ);
    geo.translate(-CX, -trunkTop, -CZ);
    // the cards are widened in the shader, so leave room round the bounds for them
    geo.boundingSphere!.radius += 8;
    pivot.add(crown);
    bins.root.add(pivot);
  }
  // ---- the great limbs, from the top of the trunk out into the blobs ----
  {
    const parts: THREE.BufferGeometry[] = [];
    const lr = new Rng(1988);
    for (const b of crownBlobs) {
      if (b.c.y > 105) continue;
      const a = Math.atan2(b.c.z - CZ, b.c.x - CX);
      const p0 = polar(lr.range(1.5, 3.5), a, trunkTop - lr.range(2, 6));
      const p2 = b.c.clone().add(new THREE.Vector3(0, -b.r.y * 0.4, 0));
      const p1 = p0.clone().lerp(p2, 0.5).add(new THREE.Vector3(0, 3 + lr.range(0, 3), 0));
      const r0 = lerp(2.8, 1.6, Math.min(1, (radiusOf(p2.x, p2.z) - 10) / 25));
      parts.push(rootTube(new THREE.CatmullRomCurve3([p0, p1, p2]), (t) => lerp(r0, 0.5, t), 16, 8));
    }
    core(new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!, M.bark));
  }

  // ---- roots: out of the trunk's foot, over the keep's two tiers, across the gardens ----
  /** ground height (sunk a little) on the terraces, the keep's tops on the keep */
  const gy = (x: number, z: number, sink: number) => { const r = radiusOf(x, z); return r < KEEP2 ? Y_K2 - sink : r < KEEP1 ? Y_K1 - sink : plan.height(x, z) - sink; };
  /** points for a root leaving the trunk at angle a and climbing down the keep */
  const overKeep = (a: number) => [
    polar(7.5, a, Y_K2 + 2.2), polar(12, a, Y_K2 + 0.5), polar(KEEP2 + 0.4, a, Y_K2 + 0.6), polar(KEEP2 + 1.0, a, Y_K1 + 1.5),
    polar(20, a, Y_K1 + 0.2), polar(KEEP1 + 0.4, a, Y_K1 + 0.5), polar(KEEP1 + 1.1, a, Y_IN + 1.6),
  ];
  {
    const parts: THREE.BufferGeometry[] = [];
    const lr = new Rng(1989);
    // the big ones go all the way over the rim and hang below the island
    for (const ad of [-86, -52, -18, 16, 52, 88]) {
      const a = deg(ad + lr.range(-4, 4));
      const pts = overKeep(a);
      for (const r of [30, 40, 50]) { const aa = a + lr.range(-0.04, 0.04); const p = polar(r, aa, 0); p.y = gy(p.x, p.z, 0.35); pts.push(p); }
      pts.push(polar(INNER - 0.6, a, Y_IN + 0.9), polar(INNER + 1.4, a, Y_IN + 0.4), polar(INNER + 2.4, a, Y_OUT + 0.3));
      for (const r of [66, 75]) { const p = polar(r, a + lr.range(-0.03, 0.03), 0); p.y = gy(p.x, p.z, 0.3); pts.push(p); }
      pts.push(polar(RIM - 1.6, a, RIM_TOP + 1.2), polar(RIM + 0.4, a, RIM_TOP + 1.7), polar(RIM + 1.7, a, RIM_TOP - 1.0), polar(RIM + 1.9, a, 40), polar(RIM + 2.0, a, 31));
      // below the wall it hangs free, swinging in towards the bowl
      const hang = lr.range(30, 55);
      pts.push(polar(RIM + 1.2, a + 0.004, 31 - hang * 0.35), polar(RIM - 1.5, a + 0.01, 31 - hang * 0.7), polar(RIM - 3.5, a + 0.012, 31 - hang));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      parts.push(rootTube(curve, (t) => lerp(2.5, 0.12, Math.pow(t, 0.8)), 150, 8));
      // a couple of thinner roots split off at the rim and hang beside it
      for (let k = 0; k < 2; k++) {
        const a2 = a + lr.range(-0.05, 0.05), hang2 = lr.range(18, 40);
        const q = [polar(RIM - 3, a, RIM_TOP + 0.6), polar(RIM + 0.3, a2, RIM_TOP + 1.3), polar(RIM + 1.4, a2, RIM_TOP - 1.5), polar(RIM + 1.6, a2, RIM_TOP - 12), polar(RIM + 1.4, a2, RIM_TOP - 12 - hang2)];
        parts.push(rootTube(new THREE.CatmullRomCurve3(q, false, 'centripetal'), (t) => lerp(0.7, 0.08, t), 40, 6));
      }
    }
    // the root that arches high over the path, and the one the path runs over
    {
      const a = plan.archA, pc = road.at(plan.archZ), rc = radiusOf(pc.x, pc.z);
      const pts = overKeep(a).slice(0, 6);
      const P = (r: number, y: number) => polar(r, a, y);
      pts.push(P(KEEP1 + 1.2, 55.5), P(rc - 7, 58.2), P(rc - 3.5, pc.y + 9.4), P(rc, pc.y + 10.0), P(rc + 3.5, pc.y + 9.4), P(rc + 7, 57.0), P(rc + 9.5, 53.4));
      const q1 = P(rc + 11.5, 0); q1.y = gy(q1.x, q1.z, -0.1);
      const q2 = P(rc + 14, 0); q2.y = gy(q2.x, q2.z, 1.2);
      pts.push(q1, q2);
      parts.push(rootTube(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), (t) => lerp(2.3, 0.6, t), 110, 8));
    }
    {
      const a = plan.humpA, pc = road.at(plan.humpZ), rc = radiusOf(pc.x, pc.z);
      const pts = overKeep(a);
      for (const r of [rc - 6, rc - 2.5, rc, rc + 2.5, rc + 6, rc + 9]) { const p = polar(r, a, 0); p.y = gy(p.x, p.z, 0.62); pts.push(p); }
      const p = polar(rc + 11, a, 0); p.y = gy(p.x, p.z, 1.6); pts.push(p);
      parts.push(rootTube(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), (t) => lerp(2.2, 0.85, Math.min(1, t * 1.6)), 90, 8));
    }
    // short roots spreading over the keep and into the inner terrace
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + lr.range(-0.15, 0.15);
      if (Math.abs(angDiff(a, plan.archA)) < 0.25 || Math.abs(angDiff(a, plan.humpA)) < 0.25) continue;
      const pts = overKeep(a);
      const end = polar(KEEP1 + lr.range(4, 9), a + lr.range(-0.1, 0.1), 0); end.y = gy(end.x, end.z, 0.9);
      pts.push(end);
      parts.push(rootTube(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), (t) => lerp(1.6, 0.4, t), 50, 7));
    }
    // file the roots by where they mostly lie (the over-the-rim ones are long; the core group is fine for all)
    core(new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!, M.bark));
  }

  // =============== waterfalls off the edge, and their mist ===============
  const specs: FallSpec[] = [];
  {
    const end = plan.stream[plan.stream.length - 1], prev = plan.stream[plan.stream.length - 3];
    specs.push({ from: end.clone().add(new THREE.Vector3(0, -0.1, 0)), out: end.clone().sub(prev), width: 1.8, drop: 78, throw: 2.2 });
    // spouts in the walls: [angle, band, width, drop]
    const spouts: Array<[number, number, number, number]> = [[-40, 0, 5, 80], [28, 0, 4.2, 82], [126, 0, 4, 76], [166, 0, 4.6, 80], [-150, 0, 3.6, 74], [72, 1, 3.4, 60], [-4, 1, 3.8, 62], [-72, 2, 3, 46]];
    for (const [ad, b, w, drop] of spouts) {
      const a = deg(ad), [r, , y1] = BANDS[b];
      const y = (b === 0 ? RIM_TOP : y1) - 2.6;
      const from = polar(r + 1.4, a, y);
      specs.push({ from, out: polar(1, a, 0).sub(new THREE.Vector3(CX, 0, CZ)), width: w, drop });
      // the spout: a stone channel jutting from the wall, and a dark arch over the outflow
      const s = new THREE.Group();
      s.add(block(w + 1.2, 0.7, 2.6, M.stone, 0, -0.45, 0.9));
      for (const sx of [-1, 1]) s.add(block(0.5, 0.9, 2.6, M.stone, sx * (w / 2 + 0.35), 0.2, 0.9));
      s.add(block(w + 0.4, 1.6, 0.3, M.rock, 0, 0.8, -0.1));
      s.position.copy(polar(r, a, y)); s.rotation.y = Math.PI / 2 - a;
      put(s, a, r, false);
    }
  }
  const falls = waterfalls(specs);
  bins.root.add(falls.mesh);
  const mist = mistPuffs(specs, lowDetail ? 8 : 14, new Rng(4141));
  bins.root.add(mist.mesh);

  // =============== ivy hanging on the walls ===============
  {
    const byBin = new Map<THREE.Group, THREE.BufferGeometry[]>();
    const ir = new Rng(2121);
    const ivy = (blobs: Blob[], x: number, z: number, tint: number) => {
      const geo = canopyGeometry(blobs, ir, { density: 0.9, cardScale: 0.8 });
      const col = geo.attributes.color as THREE.BufferAttribute, c = new THREE.Color(tint);
      c.offsetHSL(ir.range(-0.02, 0.02), 0, ir.range(-0.05, 0.05));
      for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * c.r, col.getY(i) * c.g, col.getZ(i) * c.b);
      const bin = bins.at(x, z);
      const list = byBin.get(bin) ?? [];
      list.push(geo); byBin.set(bin, list);
    };
    const tints = [0x4a7a34, 0x5e8c3e, 0x3f6e30, 0x6a9a44];
    // curtains down the outer wall from the parapet
    for (let i = 0; i < (lowDetail ? 26 : 44); i++) {
      const a = ir.range(-Math.PI, Math.PI);
      if (inGap(a, 0.02)) continue;
      const len = ir.range(4, 12), r = RIM + 0.7;
      const blobs: Blob[] = [];
      for (let k = 0; k < 3; k++) blobs.push({ c: polar(r, a + ir.range(-0.01, 0.01), RIM_TOP + 0.6 - (k + 0.5) * (len / 3)), r: new THREE.Vector3(ir.range(1.4, 2.4), len / 4.5, ir.range(1.4, 2.4)).multiply(new THREE.Vector3(1, 1, 1)) });
      const p = polar(r, a, 0);
      ivy(blobs, p.x, p.z, ir.pick(tints));
    }
    // on the keep's walls
    for (let i = 0; i < 14; i++) {
      const a = ir.range(-Math.PI, Math.PI), two = ir.chance(0.5);
      const r = (two ? KEEP2 : KEEP1) + 0.6, top = two ? Y_K2 : Y_K1, len = ir.range(3, 7);
      ivy([{ c: polar(r, a, top - len / 2), r: new THREE.Vector3(ir.range(1.2, 2), len / 2.5, ir.range(1.2, 2)) }], CX, CZ, ir.pick(tints));
    }
    // on the gateway arches
    for (const z of [plan.gate1Z, plan.gate2Z]) for (const s of [-1, 1]) {
      const p = road.side(z, s * 6.6, 7.5);
      ivy([{ c: p, r: new THREE.Vector3(1.6, 3.2, 1.6) }, { c: road.side(z, s * 7.4, 10.5), r: new THREE.Vector3(1.8, 1.2, 1.8) }], p.x, p.z, ir.pick(tints));
    }
    for (const [bin, list] of byBin) {
      const m = new THREE.Mesh(mergeGeometries(list, false)!, leaf.material);
      m.customDepthMaterial = leaf.depth;
      m.castShadow = bin.name.startsWith('path'); m.receiveShadow = true;
      bin.add(m);
    }
  }

  return {
    crystal, falls, mist, crown, proxies,
    treeTop: new THREE.Vector3(CX, 96, CZ),
    glow(k, t) {
      cu.glow.value = 1.5 * k;
      cu.time.value = t;
      const halo = crystal.userData.halo as THREE.Sprite;
      (halo.material as THREE.SpriteMaterial).opacity = clamp(0.35 + 0.2 * k + Math.sin(t * 1.6) * 0.05, 0, 1);
      halo.scale.setScalar(56 + 16 * k);
      ((crystal.userData.pool as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = clamp(0.3 + 0.15 * k, 0, 0.9);
    },
  };
}

/** The crystal's fog follows the scene's (its shader computes fog itself). */
export function crystalFog(c: Castle, fog: THREE.FogExp2) {
  const m = (c.crystal.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
  m.uniforms.fogColor.value.copy(fog.color);
  m.uniforms.fogDensity.value = fog.density;
}
