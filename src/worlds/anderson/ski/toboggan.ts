import * as THREE from 'three';
import { box, cyl, glow, mergeStatic, sphere, toon } from '../../../engine/Builders';
import { Painter, boxUV } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { css, planks } from '../textures';
import { mendlsBox, PAL } from '../kit';

/*
 * A wooden toboggan in the manner of the film's: two bentwood runners curling up at the front into a big
 * scroll, a slatted deck on little posts, brass hand rails, a low bentwood backrest, a red pull rope, and a
 * brass lantern hanging from the front crossbar. The rider's version has a striped blanket over the knees, a
 * pink pennant on a stick and a Mendl's box strapped on behind.
 *
 * Origin: where the runners touch the snow, under the middle of the deck. Local +z is forward.
 */

let woodTex: THREE.Texture | null = null, blanketTex: THREE.Texture | null = null;
const mats = new Map<string, THREE.Material>();
const mat = (k: string, make: () => THREE.Material) => { let m = mats.get(k); if (!m) { m = make(); mats.set(k, m); } return m; };

/** A striped wool blanket: pink, plum and cream bands with a fringe at the ends. */
function blanket() {
  return blanketTex ??= (() => {
    const p = new Painter(256, 256, 501).fill(css(0xf2b8c6));
    const g = p.g;
    const bands: Array<[number, number]> = [[0.08, 0x5d3a8a], [0.16, 0xf6efe2], [0.3, 0xc8323c], [0.36, 0xf6efe2], [0.62, 0x5d3a8a], [0.7, 0xf6efe2], [0.84, 0xc8323c], [0.9, 0xf6efe2]];
    for (const [v, c] of bands) { g.fillStyle = css(c); g.fillRect(0, v * 256, 256, 9); }
    // the weave
    p.lines({ n: 90, colors: ['rgba(255,255,255,0.5)', 'rgba(60,20,40,0.5)'], alpha: [0.05, 0.12], width: [1, 2] });
    p.lines({ n: 90, colors: ['rgba(255,255,255,0.5)', 'rgba(60,20,40,0.5)'], alpha: [0.05, 0.12], width: [1, 2], vertical: true });
    return p.texture({ repeat: [1, 1] });
  })();
}

/** A flat strip bent along a curve in the yz plane (a bentwood runner): width across x, thickness out from the curve. */
function bentStrip(pts: THREE.Vector2[], width: number, thick: number, x: number) {
  const curve = new THREE.SplineCurve(pts);
  const n = 48;
  const P = curve.getSpacedPoints(n);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  // four edges of the section: [offset across, offset along the normal]
  const sec: Array<[number, number]> = [[-width / 2, 0], [width / 2, 0], [width / 2, thick], [-width / 2, thick], [-width / 2, 0]];
  let dist = 0;
  for (let i = 0; i <= n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
    const tz = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tz, ty) || 1;
    // the normal is the tangent turned a quarter (pointing up on a flat run)
    const nz = -ty / tl, ny = tz / tl;
    if (i > 0) dist += P[i].distanceTo(P[i - 1]);
    for (let k = 0; k < sec.length; k++) {
      const [ax, an] = sec[k];
      pos.push(x + ax, P[i].y + ny * an, P[i].x + nz * an);
      uv.push(k / 4, dist);
    }
    if (i < n) for (let k = 0; k < 4; k++) { const A = i * 5 + k, B = A + 1, C = A + 5, D = C + 1; idx.push(A, C, B, B, C, D); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface Toboggan {
  group: THREE.Group;
  /** the rider's eye, in the toboggan's space */
  seat: THREE.Vector3;
  /** the lantern swings on its hook */
  lantern: THREE.Group;
  pennant: THREE.Object3D | null;
  update(dt: number, t: number, speed: number): void;
}

export function buildToboggan(o: { rider?: boolean; scale?: number } = {}): Toboggan {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  woodTex ??= planks(0xc88a52, 503);
  const wood = mat('wood', () => toon(0xffffff, { map: woodTex! }));
  const bent = mat('bent', () => toon(0x9a5e34));
  const brass = mat('brass', () => toon(PAL.brass));
  const rope = mat('rope', () => toon(0xc8323c));
  const iron = mat('iron', () => toon(0x2a2c30));

  // ---- runners: flat along the snow, curling up and back over at the front ----
  const runnerPts: THREE.Vector2[] = [];
  // (z, y) in the yz plane
  runnerPts.push(new THREE.Vector2(-1.15, 0.12), new THREE.Vector2(-1.0, 0.0), new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.75, 0.02), new THREE.Vector2(1.1, 0.14));
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 1.55;
    const r = 0.36 - i * 0.012;
    runnerPts.push(new THREE.Vector2(1.08 + Math.cos(a) * r, 0.5 + Math.sin(a) * r));
  }
  for (const s of [-1, 1]) body.add(new THREE.Mesh(bentStrip(runnerPts, 0.07, 0.07, s * 0.42), bent));
  // the front crossbar between the scrolls, and the back one
  const bar = cyl(0.035, 0.035, 0.94, brass, 0, 0.86, 1.2, 8); bar.rotation.z = Math.PI / 2; body.add(bar);
  const bar2 = cyl(0.03, 0.03, 0.9, bent, 0, 0.28, 0.82, 8); bar2.rotation.z = Math.PI / 2; body.add(bar2);
  // posts from the runners to the deck
  for (const s of [-1, 1]) for (const z of [-0.85, -0.3, 0.25, 0.75]) body.add(box(0.07, 0.24, 0.1, bent, s * 0.42, 0.18, z));
  // the deck: slats along the toboggan with gaps, on two cross battens
  for (let i = 0; i < 6; i++) {
    const x = -0.44 + i * 0.176;
    const slat = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.15, 0.05, 2.0), 0.6, 0.6), wood);
    slat.position.set(x, 0.33, -0.08);
    body.add(slat);
  }
  for (const z of [-0.85, 0.7]) body.add(box(1.0, 0.06, 0.12, bent, 0, 0.29, z));
  // brass hand rails along both sides
  for (const s of [-1, 1]) {
    const r = cyl(0.025, 0.025, 1.7, brass, s * 0.53, 0.5, -0.1, 6); r.rotation.x = Math.PI / 2; body.add(r);
    for (const z of [-0.85, 0.65]) body.add(cyl(0.02, 0.02, 0.18, brass, s * 0.53, 0.41, z, 6));
  }
  // the low bentwood backrest
  {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push(new THREE.Vector2(Math.cos(a) * 0.46, Math.sin(a) * 0.32)); }
    const back = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, 0))), 16, 0.04, 6, false), bent);
    back.position.set(0, 0.36, -1.02);
    back.rotation.x = -0.25;
    body.add(back);
  }
  // the pull rope looping from the crossbar
  {
    const pts = [new THREE.Vector3(-0.3, 0.86, 1.2), new THREE.Vector3(-0.2, 0.5, 1.45), new THREE.Vector3(0, 0.42, 1.55), new THREE.Vector3(0.2, 0.5, 1.45), new THREE.Vector3(0.3, 0.86, 1.2)];
    body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.022, 5, false), rope));
  }

  // ---- the brass lantern on a hook under the front crossbar ----
  const lantern = new THREE.Group();
  lantern.position.set(0, 0.86, 1.2);
  {
    const L = new THREE.Group();
    L.position.y = -0.08;
    L.add(cyl(0.012, 0.012, 0.1, iron, 0, 0.0, 0, 5));
    L.add(cyl(0.07, 0.1, 0.06, brass, 0, -0.08, 0, 8));
    L.add(box(0.13, 0.16, 0.13, glow(0xffd890, 1.25), 0, -0.19, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L.add(box(0.018, 0.17, 0.018, brass, x * 0.068, -0.19, z * 0.068));
    L.add(cyl(0.1, 0.08, 0.04, brass, 0, -0.29, 0, 8));
    lantern.add(L);
  }
  body.add(lantern);

  let pennant: THREE.Object3D | null = null;
  const seat = new THREE.Vector3(0, 1.12, -0.42);
  if (o.rider) {
    // ---- the blanket over the rider's knees, draped over the sides ----
    const geo = new THREE.PlaneGeometry(1.16, 1.5, 16, 16);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i); // x across, y along (towards the front at +y)
      const ax = Math.abs(x) / 0.58;
      // two knees under the wool, hanging down over the deck's edges
      const knees = 0.26 * Math.exp(-((Math.abs(x) - 0.17) ** 2) / 0.02) * Math.exp(-((y - 0.1) ** 2) / 0.22);
      const lap = 0.17 * (1 - ax * ax) * Math.exp(-((y + 0.5) ** 2) / 0.4);
      const drape = -0.24 * Math.pow(Math.max(0, ax - 0.75) / 0.25, 1.6);
      const h = 0.4 + knees + lap + drape + 0.04 * (1 - ax);
      p.setXYZ(i, x * (1 + 0.04 * (1 - ax)), h, -y);
    }
    geo.rotateY(Math.PI);
    geo.computeVertexNormals();
    const bl = new THREE.Mesh(geo, mat('blanket', () => toon(0xffffff, { map: blanket(), side: THREE.DoubleSide })));
    bl.position.set(0, 0, 0.12);
    body.add(bl);
    // a Mendl's box strapped on behind
    const mb = mendlsBox(2.1);
    mb.position.set(0, 0.36, -0.82); mb.rotation.y = 0.12;
    body.add(mb);
    body.add(box(0.05, 0.02, 0.8, rope, 0, 0.92, -0.82));
    // a little pink pennant on a stick at the front left
    const stick = cyl(0.012, 0.012, 0.75, bent, -0.48, 0.75, 0.62, 5);
    body.add(stick);
    const pg = new THREE.Group();
    pg.position.set(-0.48, 1.06, 0.62);
    const pen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.16, 6, 1), mat('pennant', () => toon(0xf2a8bc, { side: THREE.DoubleSide })));
    pen.geometry.translate(0.16, 0, 0);
    const pp = pen.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) * (1 - pp.getX(i) / 0.36));
    pen.rotation.y = Math.PI / 2;
    pg.add(pen);
    body.add(pg);
    pennant = pg;
    body.add(sphere(0.02, brass, -0.48, 1.13, 0.62, 6, 4));
  }

  // merge everything that never moves
  body.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  mergeStatic(lantern);
  if (pennant) mergeStatic(pennant);
  for (const c of [lantern, pennant]) c?.traverse((m) => { m.userData.keep = true; });
  mergeStatic(body);
  if (o.scale) group.scale.setScalar(o.scale);

  let swing = 0, swingV = 0;
  return {
    group, seat, lantern, pennant,
    update(dt, t, speed) {
      // the lantern swings on its hook, nudged by the ride's jolts
      swingV += (-swing * 40 - swingV * 1.6 + Math.sin(t * 7.3) * speed * 2.2) * dt;
      swing += swingV * dt;
      lantern.rotation.x = swing * 0.5;
      lantern.rotation.z = Math.sin(t * 2.1) * 0.06 * speed;
      if (pennant) pennant.rotation.y = Math.sin(t * 13) * 0.25 * Math.min(1, speed) + Math.sin(t * 5.1) * 0.15;
    },
  };
}

void TAU;
