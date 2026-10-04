import * as THREE from 'three';
import { box, cyl, glow, mesh, roofGeometry, sphere } from '../../../engine/Builders';
import { boxUV, Painter, repeatUV } from '../../../engine/Paint';
import { Rain } from '../../../engine/Particles';
import { CumulusField } from '../../../engine/Clouds';
import { Rng, TAU, clamp, smoothstep } from '../../../engine/math';
import { optimize } from '../common';
import { planks } from '../textures';
import { texMat } from '../kit';
import { FUTURA } from '../film';
import { COVE, PY, STORM } from './plan';
import { boardSign, boltTexture, churchBay, noyeBoard, shingles } from './textures';
import { KID, bake, captainSharp, flat, lighten, scoutKid, socialServices, suzyKid, umbrella, unify } from './figures';

/*
 * The storm. Past the cove the sky turns grey-green, rain sweeps in and the sea rises over the low meadow to
 * the rails. Fence posts and telegraph poles stand in the flood; the wooden ark from the church's Noye's
 * Fludde floats loose with its painted animals two by two; Social Services waits on a jetty under her umbrella
 * beside the seaplane she came in. Dead ahead stands St. Jack's, white, its steeple lit by the flashes, with
 * Sam, Suzy and Captain Sharp out on the belfry. Lightning walks in from the sea, and the last bolt strikes
 * the steeple: its flash is the cover into the next scene.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface Bolt { mesh: THREE.Group; at: THREE.Vector3; z: number; t: number; fired: boolean; big: boolean }

export interface Storm {
  group: THREE.Group;
  church: THREE.Group;
  steeple: THREE.Object3D;
  trio: THREE.Group;
  social: THREE.Group;
  ark: THREE.Group;
  bolts: Bolt[];
  /** the bolt that is lit now, if any (for the lightning subject) */
  live(): Bolt | null;
  /** brightness of the lightning this frame (0..1) */
  flash: number;
  update(dt: number, t: number, z: number, cam: THREE.Vector3, level: number, fog: THREE.FogExp2, sky: Parameters<CumulusField['update']>[0] | null, sun: number): void;
}

/** A jagged bolt from `top` to `bottom` with a couple of forks, as crossed glowing ribbons. */
function makeBolt(rng: Rng, top: THREE.Vector3, bottom: THREE.Vector3, width: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const strokes: THREE.Vector3[][] = [];
  const main: THREE.Vector3[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const p = top.clone().lerp(bottom, i / n);
    if (i > 0 && i < n) { p.x += rng.range(-1, 1) * width * 2.4; p.z += rng.range(-1, 1) * width * 1.2; }
    main.push(p);
  }
  strokes.push(main);
  for (let f = 0; f < 2; f++) {
    const s = rng.int(3, 8), pts = [main[s].clone()];
    const dir = V(rng.sign() * rng.range(0.5, 1), -1.2, 0).normalize();
    for (let k = 1; k < 5; k++) pts.push(pts[k - 1].clone().addScaledVector(dir, (bottom.distanceTo(top) / n) * 0.9).add(V(rng.range(-1, 1) * width, 0, 0)));
    strokes.push(pts);
  }
  strokes.forEach((pts, si) => {
    const w = si ? width * 0.45 : width;
    for (const axis of [V(1, 0, 0), V(0, 0, 1)]) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      pts.forEach((p, i) => {
        const a = p.clone().addScaledVector(axis, -w), b = p.clone().addScaledVector(axis, w);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z); uv.push(0, i / (pts.length - 1), 1, i / (pts.length - 1));
        if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5; m.userData.keep = true;
      g.add(m);
    }
  });
  g.visible = false;
  return g;
}

/** A small seaplane on floats: cream with a red stripe. Nose along +z. */
function seaplane() {
  const g = new THREE.Group();
  const cream = flat(0xf2ead6, 0.4), red = flat(0xb0372e, 0.3), dark = flat(0x2a2c30, 0.3), glass = flat(0x5a7a8a, 0.6);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 4.2, 6, 14), cream); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.95); body.position.y = 2.2; g.add(body);
  g.add(box(1.42, 0.18, 4.6, red, 0, 2.15, -0.1));
  g.add(box(10.5, 0.16, 1.6, cream, 0, 3.0, 0.6), box(10.5, 0.04, 0.3, red, 0, 3.08, 0.0));
  g.add(box(1.2, 0.55, 1.0, glass, 0, 2.75, 1.4));
  g.add(box(3.6, 0.1, 0.9, cream, 0, 2.4, -2.8), box(0.1, 1.3, 1.0, red, 0, 3.0, -2.9));
  g.add(cyl(0.14, 0.14, 0.4, dark, 0, 2.2, 3.0, 8).rotateX(Math.PI / 2));
  for (const r of [0, Math.PI / 2]) { const b = box(0.12, 2.0, 0.06, dark, 0, 2.2, 3.22); b.rotation.z = r + 0.4; g.add(b); }
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 3.6, 4, 10), cream); fl.rotation.x = Math.PI / 2; fl.position.set(s * 1.5, 0.3, 0.3); g.add(fl);
    for (const z of [-0.6, 1.2]) { const st = box(0.07, 1.7, 0.07, dark, s * 1.0, 1.2, z); st.rotation.z = s * 0.45; g.add(st); }
  }
  return g;
}

export function buildStorm(ground: (x: number, z: number) => number): Storm {
  const rng = new Rng(10101);
  const group = new THREE.Group(), statics = new THREE.Group();
  group.add(statics);
  const add = (o: THREE.Object3D) => { statics.add(o); return o; };
  const wood = flat(0x6a5038, 0.25), weathered = flat(0x8a8274, 0.2), white = flat(0xf4f0e6, 0.3), dark = flat(0x2a2620, 0.1);
  const planksM = texMat(planks(0x8a7a62, 10102));

  // ---------- fence posts and telegraph poles standing in the flood ----------
  for (let z = -1418; z > -1520; z -= 3.2) for (const s of [-1, 1]) {
    const x = s * 4.6 + rng.range(-0.1, 0.1);
    const post = cyl(0.08, 0.1, 1.4, weathered, x, ground(x, z) + 0.5, z, 5);
    post.rotation.z = rng.range(-0.08, 0.08); add(post);
    add(box(0.06, 0.08, 3.2, weathered, x, ground(x, z) + 0.95, z - 1.6));
  }
  const poles: THREE.Vector3[] = [];
  for (let z = -1404; z > -1540; z -= 17) {
    const x = 9.5, y = ground(x, z);
    const lean = rng.range(-0.06, 0.06);
    const p = new THREE.Group();
    p.add(cyl(0.14, 0.18, 8.5, wood, 0, 4.25, 0, 7), box(2.2, 0.16, 0.16, wood, 0, 7.8, 0));
    for (const xx of [-0.9, -0.3, 0.3, 0.9]) p.add(cyl(0.05, 0.05, 0.18, white, xx, 7.98, 0, 5));
    p.position.set(x, y - 0.4, z); p.rotation.z = lean; add(p);
    poles.push(V(x, y - 0.4 + 8.05, z));
  }
  // the wires between them, sagging
  for (let i = 0; i < poles.length - 1; i++) for (const xx of [-0.9, 0.9]) {
    const a = poles[i].clone().add(V(xx, 0, 0)), b = poles[i + 1].clone().add(V(xx, 0, 0));
    const pts: THREE.Vector3[] = []; for (let k = 0; k <= 8; k++) { const p = a.clone().lerp(b, k / 8); p.y -= Math.sin((k / 8) * Math.PI) * 0.6; pts.push(p); }
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.02, 3), dark));
  }
  // a road sign to the church
  {
    const s = new THREE.Group();
    s.add(cyl(0.06, 0.06, 2.6, weathered, 0, 1.3, 0, 5));
    const tex = boardSign({ title: "ST. JACK'S", sub: 'Church of New Penzance', fg: 0xf4ecda, bg: 0x2a3550, border: 0xf4ecda, w: 512, h: 192, seed: 10103 });
    s.add(mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshLambertMaterial({ map: tex }), 0, 2.3, 0.05), box(1.66, 0.66, 0.06, white, 0, 2.3, 0));
    s.position.set(-3.6, ground(-3.6, -1430), -1430); s.rotation.set(0, 0.5, 0.12);
    add(s);
  }

  // ---------- St. Jack's ----------
  const church = new THREE.Group();
  const steeple = new THREE.Object3D();
  {
    const C = STORM.church, gy = ground(C.x, C.z);
    const bay = churchBay(10104);
    const wallM = new THREE.MeshLambertMaterial({ map: bay.map, emissive: 0xffe0a0, emissiveMap: bay.emissive, emissiveIntensity: 1.1 });
    const W = 12, L = 21, H = 7.5;
    const nave = new THREE.Mesh(boxUV(new THREE.BoxGeometry(W, H, L), 3, 6), wallM);
    nave.position.set(0, H / 2, -L / 2);
    church.add(nave);
    church.add(mesh(roofGeometry(W, L, 5.5, 0.6), texMat(shingles(0x3a3e40, 10105)), 0, H, -L / 2));
    // the tower at the front: base, belfry with open arches and its bell, the spire
    const TW = 4.6, tz = 1.4;
    const towerM = new THREE.MeshLambertMaterial({ map: (() => { const p = new Painter(64, 64, 10106).fill('#f4f1e8'); for (let y = 0; y < 64; y += 8) { p.g.fillStyle = 'rgba(0,0,0,0.12)'; p.g.fillRect(0, y + 6, 64, 2); } return p.texture({ repeat: [1, 1] }); })() });
    church.add(mesh(boxUV(new THREE.BoxGeometry(TW, 13, TW), 1.5), towerM, 0, 6.5, tz));
    // the door, lit from inside, under a pediment; the steps
    const doorTex = new Painter(128, 192, 10107).fill('#b0372e');
    { const g = doorTex.g; g.fillStyle = '#7a2420'; g.fillRect(8, 8, 52, 176); g.fillRect(68, 8, 52, 176); g.fillStyle = '#ffd890'; g.beginPath(); g.arc(64, 48, 40, Math.PI, TAU); g.fill(); g.fillStyle = '#d8b25a'; g.fillRect(56, 100, 4, 14); g.fillRect(68, 100, 4, 14); }
    church.add(mesh(new THREE.PlaneGeometry(1.8, 2.9), new THREE.MeshLambertMaterial({ map: doorTex.texture({ wrap: false }), emissive: 0x401810 }), 0, 1.45, tz + TW / 2 + 0.02));
    church.add(mesh(roofGeometry(2.6, 0.5, 0.7, 0.05), white, 0, 3.05, tz + TW / 2 + 0.25));
    for (let k = 0; k < 3; k++) church.add(box(3.0 - k * 0.3, 0.2, 1.2 - k * 0.3, flat(0xd8d2c4, 0.2), 0, 0.1 + k * 0.2, tz + TW / 2 + 0.6 - k * 0.15));
    // the clock
    const clockTex = new Painter(128, 128, 10108).fill('#f6efdc');
    { const g = clockTex.g; g.strokeStyle = '#1e1e22'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 22); g.moveTo(64, 64); g.lineTo(94, 76); g.stroke(); for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; g.fillStyle = '#1e1e22'; g.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); } }
    church.add(mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshLambertMaterial({ map: clockTex.texture({ wrap: false }), emissive: 0x403828 }), 0, 9.6, tz + TW / 2 + 0.02));
    // belfry: four corner posts, arches, the bell, a ledge round it
    const by = 13;
    church.add(box(TW + 0.6, 0.3, TW + 0.6, white, 0, by + 0.15, tz));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) church.add(box(0.6, 3.6, 0.6, white, x * (TW / 2 - 0.3), by + 2.1, tz + z * (TW / 2 - 0.3)));
    for (const s of [-1, 1]) { church.add(box(TW, 0.6, 0.4, white, 0, by + 3.6, tz + s * (TW / 2 - 0.2)), box(0.4, 0.6, TW, white, s * (TW / 2 - 0.2), by + 3.6, tz)); }
    church.add(box(TW - 0.6, 0.15, TW - 0.6, dark, 0, by + 0.32, tz));
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 1.0, 1.3, 16, 1, true), flat(0xb08a3a, 0.6)); bell.position.set(0, by + 2.4, tz); church.add(bell);
    church.add(box(TW + 0.4, 0.5, TW + 0.4, white, 0, by + 4.1, tz));
    // the spire, octagonal, with a weathervane
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 13, 8), texMat(shingles(0x5a6066, 10109))); spire.position.set(0, by + 10.8, tz); church.add(spire);
    church.add(cyl(0.05, 0.05, 2.0, dark, 0, by + 18.2, tz, 5), sphere(0.15, flat(0xd8b25a, 0.5), 0, by + 17.6, tz, 8, 6));
    church.add(box(1.2, 0.06, 0.06, dark, 0, by + 18.9, tz), box(0.06, 0.06, 1.2, dark, 0, by + 18.9, tz));
    steeple.position.set(0, by + 19, tz);
    church.add(steeple);
    church.position.set(C.x, gy, C.z);
    // a white picket fence along the front of the churchyard
    for (let x = -14; x <= 14; x += 0.5) { if (Math.abs(x) < 2.2) continue; church.add(box(0.1, 1.0, 0.05, white, x, 0.5, 9.5)); }
    for (const s of [-1, 1]) church.add(box(11.8, 0.08, 0.06, white, s * 8.1, 0.7, 9.5));
    church.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    unify(church);
    optimize(church);
  }
  group.add(church);

  // Sam, Suzy and Captain Sharp out on the belfry's ledge
  const trio = new THREE.Group();
  {
    const sam = scoutKid({ hair: 0x6a4428, seed: 10111, sam: true });
    const suzy = suzyKid(10121);
    const sharp = captainSharp();
    for (const k of [sam, suzy]) k.group.scale.setScalar(KID.tall * 1.15);
    sharp.group.scale.multiplyScalar(1.12);
    sam.group.position.set(-0.75, 0, 0); suzy.group.position.set(0.15, 0, 0.05); sharp.group.position.set(1.15, 0, -0.1);
    // clinging on: Sam's hand in Sharp's, Suzy's arm round Sam
    sam.shoulder[1].rotation.set(-0.4, 0, 0.9); sam.shoulder[0].rotation.set(-0.3, 0, -0.5);
    suzy.shoulder[0].rotation.set(-0.5, 0, -0.8); suzy.shoulder[1].rotation.set(-0.9, 0, 0.3); suzy.elbow[1].rotation.x = -1.2;
    sharp.shoulder[0].rotation.set(-0.5, 0, -0.9); sharp.shoulder[1].rotation.set(-2.6, 0, 0.4); sharp.elbow[1].rotation.x = -0.3;
    sam.head.rotation.set(-0.15, 0.3, 0); suzy.head.rotation.set(-0.1, -0.2, 0.1); sharp.head.rotation.set(-0.25, 0, 0);
    trio.add(sam.group, suzy.group, sharp.group);
    for (const f of [sam, suzy, sharp]) { lighten(f.group, 28, 18); bake(f.group, [], false); }
    trio.position.set(STORM.church.x, ground(STORM.church.x, STORM.church.z) + 13.3, STORM.church.z + 1.4 + 2.6);
  }
  group.add(trio);

  // ---------- the Noye's Fludde ark, adrift ----------
  const ark = new THREE.Group();
  {
    const hull = new THREE.Shape(); hull.moveTo(-5, 1.6); hull.lineTo(5, 1.6); hull.quadraticCurveTo(4.6, -0.2, 3.2, -0.6); hull.lineTo(-3.2, -0.6); hull.quadraticCurveTo(-4.6, -0.2, -5, 1.6);
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 3.2, bevelEnabled: false });
    const huv = hg.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < huv.count; i++) huv.setXY(i, huv.getX(i) / 2, huv.getY(i) / 2);
    hg.translate(0, 0, -1.6);
    ark.add(new THREE.Mesh(hg, planksM));
    ark.add(box(5.6, 2.2, 2.4, planksM, 0, 2.7, 0));
    ark.add(mesh(roofGeometry(2.6, 5.8, 1.1, 0.3), flat(0x7a2a24, 0.3), 0, 3.8, 0).rotateY(Math.PI / 2));
    ark.add(mesh(new THREE.PlaneGeometry(3.8, 0.95), new THREE.MeshLambertMaterial({ map: noyeBoard(), emissive: 0x201008 }), 0, 2.7, 1.22));
    // painted plywood animals, two by two, along the deck
    const animal = (kind: number, color: string) => {
      const p = new Painter(128, 128, 10120 + kind);
      const g = p.g; g.fillStyle = color; g.strokeStyle = '#2a2018'; g.lineWidth = 3;
      if (kind === 0) { g.beginPath(); g.ellipse(64, 72, 44, 28, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.arc(24, 54, 18, 0, TAU); g.fill(); g.stroke(); g.fillRect(14, 64, 8, 50); for (const x of [40, 60, 80, 96]) g.fillRect(x, 92, 10, 30); }
      else if (kind === 1) { g.beginPath(); g.ellipse(70, 84, 30, 18, 0, 0, TAU); g.fill(); g.stroke(); g.fillRect(46, 10, 12, 76); g.beginPath(); g.ellipse(48, 14, 14, 9, 0, 0, TAU); g.fill(); for (const x of [52, 64, 80, 90]) g.fillRect(x, 96, 7, 30); g.fillStyle = '#7a4a24'; for (let k = 0; k < 6; k++) g.fillRect(60 + (k % 3) * 12, 76 + Math.floor(k / 3) * 10, 6, 6); }
      else { g.beginPath(); g.ellipse(64, 74, 38, 30, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(94, 50); g.lineTo(124, 66); g.lineTo(94, 80); g.fill(); g.fillStyle = '#2a2018'; g.beginPath(); g.arc(46, 64, 4, 0, TAU); g.fill(); }
      return new THREE.MeshLambertMaterial({ map: p.texture({ wrap: false }), alphaTest: 0.5, side: THREE.DoubleSide });
    };
    const animals = [animal(0, '#9aa0a8'), animal(1, '#e2b33c'), animal(2, '#2a2a2e')];
    let x = -4.4;
    for (let k = 0; k < 6; k++) { const m = mesh(new THREE.PlaneGeometry(1.3, 1.3), animals[Math.floor(k / 2)], x, 2.25 + (k % 2) * 0.1, 1.45 - (k % 2) * 0.25); ark.add(m); x += k % 2 ? 1.0 : 0.25; if (k === 3) x += 2.4; }
    ark.position.set(-17, 0, -1462); ark.rotation.y = 0.35;
    optimize(ark);
  }
  group.add(ark);

  // ---------- Social Services on the jetty, and her seaplane ----------
  const social = new THREE.Group();
  {
    const jx = 7.2, jz = -1452;
    const jetty = new THREE.Group();
    jetty.add(mesh(boxUV(new THREE.BoxGeometry(3.0, 0.2, 9), 1, 2), planksM, 0, PY + 0.55, 0));
    for (const [x, z] of [[-1.3, -4], [1.3, -4], [-1.3, 0], [1.3, 0], [-1.3, 4], [1.3, 4]]) jetty.add(cyl(0.14, 0.14, 3.2, wood, x, PY - 0.9, z, 6));
    jetty.position.set(jx + 1.5, 0, jz); add(jetty);
    const plane = seaplane(); plane.position.set(jx + 7.2, COVE.sea - 0.3, jz - 2); plane.rotation.y = 0.5; group.add(plane);
    plane.userData.float = true;
    const ss = socialServices();
    const um = umbrella(1.25);
    um.position.set(0, -0.32, 0.05); um.rotation.x = -0.15;
    ss.elbow[1].add(um);
    ss.shoulder[1].rotation.set(-0.6, 0, 0.2); ss.elbow[1].rotation.set(-1.25, 0, 0);
    ss.group.position.set(0, 0, 0);
    social.add(ss.group);
    social.position.set(jx + 0.4, PY + 0.65, jz + 2.4); social.rotation.y = -Math.PI / 2 + 0.3;
    lighten(ss.group, 36, 24);
    bake(ss.group, [ss.head]);
    social.userData.fig = ss;
    group.add(social);
    // a black car half drowned beside the track: the police car
    const car = new THREE.Group();
    car.add(box(1.9, 0.8, 4.4, flat(0x1e2230, 0.4), 0, 0.6, 0), box(1.7, 0.7, 2.2, flat(0x1e2230, 0.4), 0, 1.3, -0.2), box(1.72, 0.5, 2.0, flat(0x9ab0c0, 0.6), 0, 1.35, -0.2), box(1.92, 0.25, 1.0, white, 0, 0.75, 0.6));
    car.add(sphere(0.18, glow(0x4a7af0, 1.5), -0.4, 1.75, -0.2, 8, 6), sphere(0.18, glow(0xf04a4a, 1.5), 0.4, 1.75, -0.2, 8, 6));
    car.position.set(-6.4, ground(-6.4, -1474) - 0.2, -1474); car.rotation.set(0.05, 0.4, -0.06);
    add(car);
  }

  // floating things: suitcases, a canoe, a hymn board
  const floats: THREE.Object3D[] = [];
  for (const [x, z, c, w] of [[-8, -1440, 0x7aaad8, 0.8], [-12, -1478, 0xb0473a, 0.7], [12, -1488, 0xe2b33c, 0.9], [-5.6, -1494, 0x4a5a3a, 1.0]] as const) {
    const f = box(w, 0.4, w * 0.6, flat(c, 0.3), x, 0, z); f.rotation.y = rng.range(0, 3); f.userData.base = V(x, 0, z); floats.push(f); group.add(f);
  }
  {
    const canoe = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), flat(0xb0473a, 0.3));
    canoe.scale.set(0.45, 0.35, 2.3); canoe.rotation.x = Math.PI; const cg = new THREE.Group(); cg.add(canoe); cg.position.set(14, 0, -1466); cg.userData.base = cg.position.clone(); floats.push(cg); group.add(cg);
  }

  unify(statics);
  statics.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  optimize(statics);

  // ---------- storm clouds, low and heavy over the flood ----------
  const cloudPl = [];
  for (let i = 0; i < 16; i++) cloudPl.push({ x: rng.range(-160, 160), y: rng.range(48, 70), z: rng.range(-1480, -1700), scale: rng.range(1.6, 2.6), rot: rng.range(0, TAU) });
  const clouds = new CumulusField(rng, cloudPl, { variants: 4 });
  group.add(clouds.group);

  // ---------- rain ----------
  const rain = new Rain(1600, 10131);
  group.add(rain.lines);

  // ---------- lightning ----------
  const boltMat = new THREE.MeshBasicMaterial({ map: boltTexture(), color: 0xeef2ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const bolts: Bolt[] = [];
  const addBolt = (top: THREE.Vector3, bottom: THREE.Vector3, z: number, w: number, big = false) => {
    const m = makeBolt(rng, top, bottom, w, boltMat);
    group.add(m);
    bolts.push({ mesh: m, at: bottom.clone(), z, t: -1, fired: false, big });
  };
  addBolt(V(-60, 70, -1500), V(-48, COVE.sea, -1488), -1418, 0.9);
  addBolt(V(70, 72, -1540), V(58, COVE.sea, -1528), -1440, 1.0);
  addBolt(V(-30, 68, -1560), V(-26, COVE.sea, -1546), -1458, 0.9);
  const tip = new THREE.Vector3(); steeple.updateWorldMatrix(true, false); steeple.getWorldPosition(tip);
  addBolt(V(tip.x + 10, tip.y + 46, tip.z - 6), tip.clone(), STORM.strike, 1.3, true);

  let flash = 0, ambientT = 3;
  const amb = new Rng(10141);
  const st: Storm = {
    group, church, steeple, trio, social, ark, bolts,
    live: () => bolts.find((b) => b.t >= 0 && b.t < 0.5) ?? null,
    get flash() { return flash; },
    update(dt, t, z, cam, level, fog, sky, sun) {
      const storm = smoothstep(STORM.z0, STORM.z1, z);
      rain.intensity = storm;
      rain.update(dt, cam);
      if (sky) clouds.update(sky, fog, sun);
      // bobbing on the flood
      ark.position.y = level - 0.2 + Math.sin(t * 0.9) * 0.18;
      ark.rotation.z = Math.sin(t * 0.7) * 0.06; ark.rotation.x = Math.sin(t * 0.55 + 1) * 0.04;
      for (const o of group.children) if (o.userData.float) { o.position.y = level - 0.25 + Math.sin(t * 0.8) * 0.06; o.rotation.z = Math.sin(t * 0.6) * 0.03; }
      for (const f of floats) { const b = f.userData.base as THREE.Vector3; f.position.y = level - 0.12 + Math.sin(t * 1.3 + b.x) * 0.08; f.position.x = b.x + Math.sin(t * 0.2 + b.z) * 0.6; }
      // the lightning: each bolt fires as the rider passes its mark, flickering two or three times
      flash = 0;
      for (const b of bolts) {
        if (z > b.z + 6) { b.fired = false; b.t = -1; }
        if (!b.fired && z < b.z) { b.fired = true; b.t = 0; }
        if (b.t >= 0) {
          b.t += dt;
          const on = b.t < 0.08 || (b.t > 0.16 && b.t < 0.24) || (b.big ? b.t > 0.34 : b.t > 0.32 && b.t < 0.38);
          b.mesh.visible = on && b.t < (b.big ? 9 : 0.5);
          if (b.mesh.visible) flash = Math.max(flash, b.big ? 1 : 0.7);
          if (b.t > (b.big ? 9 : 0.6)) b.t = -1;
        } else b.mesh.visible = false;
      }
      // and the sky flickers now and then, far off
      if (storm > 0.5) {
        ambientT -= dt;
        if (ambientT < 0) ambientT = amb.range(3.5, 7);
        if (ambientT < 0.12) flash = Math.max(flash, 0.3);
      }
      void clamp;
    },
  };
  void FUTURA; void repeatUV;
  return st;
}
