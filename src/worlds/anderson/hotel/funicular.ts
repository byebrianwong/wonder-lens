import * as THREE from 'three';
import { box, cyl, sphere, mesh, canvasTexture, glow, toon } from '../../../engine/Builders';
import { Painter } from '../../../engine/Paint';
import { Spring } from '../../../engine/Rig';
import { clamp, damp } from '../../../engine/math';
import { FUTURA } from '../film';
import type { Road } from '../layout';
import { FUNI, TERRACE } from './plan';
import { GBH } from './textures';
import { shade, tbox, type HotelMats } from './mats';

/*
 * The funicular up the cliff: a cream iron trestle carrying a timber deck with two tracks, the train's (with
 * a toothed rack rail between its rails) and the little red car's (with its haulage cable running over
 * pulleys), the valley station at the foot and the top station on the hotel's terrace. The red car comes
 * down as the train goes up, counterbalanced, and passes it halfway.
 */

/** A rectangular bar swept along the path between two z, at a lateral offset and height above the path. */
export function sweep(road: Road, z0: number, z1: number, lat: number, w: number, h: number, yOff: number, mat: THREE.Material, step = 1.5, tileV = 0) {
  const n = Math.max(2, Math.ceil(Math.abs(z0 - z1) / step));
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const corners: Array<[number, number]> = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
  let dist = 0, prevY = 0;
  for (let i = 0; i <= n; i++) {
    const z = z0 + (z1 - z0) * (i / n);
    const y = road.at(z).y + yOff;
    if (i > 0) dist += Math.hypot((z1 - z0) / n, y - prevY);
    prevY = y;
    // each face gets its own pair of vertices so the normals stay flat
    for (let f = 0; f < 4; f++) {
      const a = corners[f], b = corners[(f + 1) % 4];
      pos.push(lat + a[0], y + a[1], z, lat + b[0], y + b[1], z);
      uv.push(0, tileV ? dist / tileV : dist, 1, tileV ? dist / tileV : dist);
    }
    if (i < n) for (let f = 0; f < 4; f++) {
      const k = i * 8 + f * 2, k2 = k + 8;
      idx.push(k, k2, k + 1, k + 1, k2, k2 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the winding depends on the direction of travel: make the top face point up
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  if (nrm.getY(4) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return new THREE.Mesh(g, mat);
}

/** Rack teeth: dark steel with bright tooth tops in a row. One tile = 0.5 units along. */
function rackTexture() {
  const p = new Painter(32, 64, 71).fill('#4a4a52');
  const g = p.g;
  for (let y = 0; y < 64; y += 32) { g.fillStyle = '#b8b8c0'; g.fillRect(0, y + 4, 32, 14); g.fillStyle = '#2a2a30'; g.fillRect(0, y + 18, 32, 4); }
  return p.texture({ repeat: [1, 1] });
}

/** A railing on a transparent canvas: a top rail, a mid rail and posts. One tile = 2 units. */
function railingTexture() {
  const p = new Painter(128, 64, 73);
  const g = p.g;
  g.fillStyle = '#f4ece0';
  g.fillRect(0, 2, 128, 7); g.fillRect(0, 30, 128, 4);
  for (const x of [2, 64]) g.fillRect(x, 2, 6, 62);
  for (let x = 14; x < 128; x += 12) g.fillRect(x, 9, 2, 55);
  return p.texture({ repeat: [1, 1] });
}

export function buildFunicularTrack(road: Road, m: HotelMats, ground: (x: number, z: number) => number) {
  const g = new THREE.Group();
  const z0 = FUNI.z0 + 2, z1 = FUNI.z1 - 1;
  const deckL = -2.1, deckR = FUNI.x + 2.0, deckMid = (deckL + deckR) / 2, deckW = deckR - deckL;
  const timber = m.wood;
  // the deck: planks across, with cream iron girders along both edges underneath
  g.add(sweep(road, z0, z1, deckMid, deckW, 0.2, -0.32, timber, 1.5, 2));
  for (const x of [deckL + 0.3, deckR - 0.3, -0.75, 0.75, FUNI.x - 0.75, FUNI.x + 0.75]) g.add(sweep(road, z0, z1, x, 0.3, 0.7, -1.0, m.cream, 1.5));
  // sleepers across both tracks, rails, the rack between the train's rails, the car's cable
  const steel = new THREE.MeshLambertMaterial({ color: 0x9a9aa2 });
  for (const x of [-0.75, 0.75, FUNI.x - 0.75, FUNI.x + 0.75]) g.add(sweep(road, z0, z1, x, 0.1, 0.16, -0.0, steel, 1.5));
  g.add(sweep(road, z0, z1, 0, 0.16, 0.2, -0.06, new THREE.MeshLambertMaterial({ map: rackTexture() }), 1.5, 0.5));
  g.add(sweep(road, z0, z1, FUNI.x, 0.06, 0.06, 0.12, m.dark, 1.5));
  {
    const n = Math.floor((z0 - z1) / 0.9);
    const geo = new THREE.BoxGeometry(FUNI.x + 2.6, 0.12, 0.36);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x6a4a36 }), n);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const z = z0 - (i + 0.5) * 0.9;
      const y = road.at(z).y, dy = road.at(z - 0.5).y - road.at(z + 0.5).y;
      e.set(Math.atan2(dy, 1), 0, 0);
      mm.compose(new THREE.Vector3(FUNI.x / 2, y - 0.08, z), q.setFromEuler(e), new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, mm);
    }
    im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.receiveShadow = true;
    g.add(im);
    // pulleys for the cable every few metres
    for (let z = z0 - 2; z > z1; z -= 6) g.add(cyl(0.12, 0.12, 0.3, m.brass, FUNI.x, road.at(z).y + 0.05, z, 8).rotateZ(Math.PI / 2));
  }
  // railings along both edges
  const rail = new THREE.MeshLambertMaterial({ map: railingTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  for (const x of [deckL, deckR]) {
    const n = Math.ceil((z0 - z1) / 2);
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const z = z0 + (z1 - z0) * (i / n), y = road.at(z).y - 0.2;
      pos.push(x, y, z, x, y + 1.1, z); uv.push(i * (z0 - z1) / n / 2, 0, i * (z0 - z1) / n / 2, 1);
      if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, rail));
  }
  // the trestle: tapered bents of cream ironwork down to the ground, tied and crossed every few metres,
  // with struts along between neighbouring bents
  const beam = (a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material) => {
    const d = b.clone().sub(a);
    const bm = mesh(new THREE.BoxGeometry(w, d.length(), w), mat);
    bm.position.copy(a).addScaledVector(d, 0.5);
    bm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.add(bm);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const legX = (side: number, y: number, top: number) => (side < 0 ? deckL + 0.3 : deckR - 0.3) + side * (top - y) * 0.09;
  let prev: { z: number; levels: number[] } | null = null;
  for (let z = z0 - 1; z > z1 + 3; z -= 6) {
    const top = road.at(z).y - 1.0;
    const gy = Math.min(ground(legX(-1, top - 10, top), z), ground(legX(1, top - 10, top), z)) - 0.8;
    if (top - gy < 0.6) { prev = null; continue; }
    for (const s of [-1, 1]) {
      beam(V(legX(s, top, top), top, z), V(legX(s, gy, top), gy, z), 0.4, m.cream);
      g.add(box(1.2, 0.8, 1.2, m.ashlarDark, legX(s, gy, top), gy + 0.3, z));
    }
    const levels: number[] = [];
    for (let y = top - 4; y > gy + 1; y -= 4) {
      levels.push(y);
      beam(V(legX(-1, y, top), y, z), V(legX(1, y, top), y, z), 0.22, m.cream);
      const y2 = Math.min(top, y + 4);
      beam(V(legX(-1, y, top), y, z), V(legX(1, y2, top), y2, z), 0.14, m.cream);
      beam(V(legX(1, y, top), y, z), V(legX(-1, y2, top), y2, z), 0.14, m.cream);
    }
    if (prev) for (const y of levels.filter((_, i) => i % 2 === 0)) for (const s of [-1, 1]) {
      const ptop = road.at(prev.z).y - 1.0;
      beam(V(legX(s, y, top), y, z), V(legX(s, y, ptop) , y, prev.z), 0.16, m.cream);
    }
    prev = { z, levels };
  }
  // the valley station: a little pink pavilion over the bottom of the car's track
  {
    const vs = new THREE.Group();
    vs.add(tbox(5.2, 4.4, 6, m.pink, 3, 0, 2.2, 0));
    vs.add(box(5.8, 0.4, 6.6, m.cream, 0, 4.6, 0));
    const roof = mesh(new THREE.ConeGeometry(4.4, 2.6, 4).rotateY(Math.PI / 4), m.roof, 0, 6.1, 0); roof.scale.z = 1.15; vs.add(roof);
    vs.add(box(4.2, 0.9, 0.1, new THREE.MeshBasicMaterial({ map: funiSign() }), 0, 3.6, -3.06));
    vs.position.set(FUNI.x + 5.6, road.at(FUNI.z0).y - 1.2, FUNI.z0 + 2);
    g.add(vs);
  }
  // the top station on the terrace: a canopy over the end of the car's track, with the big wheel
  {
    const ts = new THREE.Group();
    const zt = FUNI.z1 - 1;
    for (const [x, z] of [[-1.6, 1.6], [1.6, 1.6], [-1.6, -3.6], [1.6, -3.6]]) ts.add(cyl(0.12, 0.14, 4, m.cream, x, 2, z, 8));
    ts.add(tbox(4.2, 0.3, 6.2, m.pinkDeep, 3, 0, 4.1, -1));
    ts.add(mesh(new THREE.CylinderGeometry(0.01, 3.6, 1.4, 4).rotateY(Math.PI / 4), m.roof, 0, 4.9, -1));
    const wheel = mesh(new THREE.TorusGeometry(1.3, 0.12, 6, 20), m.iron, 0, 1.6, -4.2);
    ts.add(wheel);
    ts.add(cyl(0.1, 0.1, 0.4, m.brass, 0, 1.6, -4.2, 8).rotateX(Math.PI / 2));
    ts.position.set(FUNI.x, TERRACE.y, zt);
    g.add(ts);
  }
  shade(g, true, true);
  return g;
}

function funiSign() {
  return canvasTexture(256, 56, (c) => {
    c.fillStyle = '#7a2236'; c.fillRect(0, 0, 256, 56);
    c.strokeStyle = '#d8b25a'; c.lineWidth = 3; c.strokeRect(4, 4, 248, 48);
    c.fillStyle = '#f6e6b8'; c.font = `bold 26px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('F U N I C U L A R', 128, 30);
  });
}

/**
 * The little red funicular car: a body shaped like a parallelogram so its floor follows the slope while its
 * ends stay upright, big windows, cream trim, a brass bell on the roof and a lamp at each end. Origin on its
 * rails; it runs along z.
 */
export function makeFunicularCar(slope: number) {
  const g = new THREE.Group();
  const red = new THREE.MeshLambertMaterial({ map: carPaint() });
  const cream = toon(GBH.cream), dark = toon(0x2a2630), brass = toon(GBH.gold);
  const L = 3.6, H = 2.5, W = 2.3;
  // the side shape: uphill is -z, so the floor rises towards -z
  const shape = new THREE.Shape();
  const y = (z: number) => -z * slope;
  shape.moveTo(-L / 2, y(-L / 2)); shape.lineTo(L / 2, y(L / 2)); shape.lineTo(L / 2, y(L / 2) + H); shape.lineTo(-L / 2, y(-L / 2) + H); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
  // shape x is z here: turn it so the shape's x runs along z, the extrusion across x
  geo.rotateY(-Math.PI / 2); geo.translate(W / 2, 0.45, 0);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / L + 0.5, (uv.getY(i) + slope * L / 2) / (H + slope * L));
  const body = mesh(geo, red);
  g.add(body);
  // roof with an overhang, following the slope
  const roof = box(W + 0.3, 0.16, L + 0.5, cream, 0, 0.45 + H + 0.08, 0);
  roof.rotation.x = Math.atan(slope);
  g.add(roof);
  // the running gear
  for (const z of [-1.1, 1.1]) {
    g.add(box(W - 0.4, 0.5, 0.6, dark, 0, 0.3 + y(z), z));
    for (const s of [-1, 1]) g.add(cyl(0.24, 0.24, 0.14, dark, s * 0.75, 0.24 + y(z), z, 10).rotateZ(Math.PI / 2));
  }
  // lamps at both ends, and the bell
  const lamps = [sphere(0.16, glow(0xfff0c0, 1.3), 0, 0.45 + y(-L / 2) + H * 0.62, -L / 2 - 0.05, 8, 6), sphere(0.16, glow(0xfff0c0, 1.3), 0, 0.45 + y(L / 2) + H * 0.62, L / 2 + 0.05, 8, 6)];
  g.add(...lamps);
  const bell = new THREE.Group();
  bell.add(mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.26, 12, 1, true), new THREE.MeshStandardMaterial({ color: GBH.gold, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }), 0, -0.18, 0));
  bell.add(sphere(0.05, brass, 0, -0.32, 0, 6, 5));
  const bellPost = new THREE.Group();
  bellPost.add(box(0.06, 0.5, 0.06, brass, -0.3, 0.25, 0), box(0.06, 0.5, 0.06, brass, 0.3, 0.25, 0), box(0.66, 0.06, 0.06, brass, 0, 0.5, 0));
  bellPost.position.set(0, 0.45 + H + 0.18 + y(-0.9), -0.9);
  bell.position.set(0, 0.48, 0);
  bellPost.add(bell);
  g.add(bellPost);
  shade(g, true, false);
  const bellSwing = new Spring(0, 2.4, 0.12);
  let ringT = 9;
  const base = new THREE.Vector3();
  return {
    group: g,
    ring() { ringT = 0; bellSwing.v += 9; },
    get ringing() { return ringT < 2.5; },
    update(dt: number, t: number, pos: THREE.Vector3) {
      ringT += dt;
      bell.rotation.z = bellSwing.update(0, dt);
      const flash = ringT < 2.5 ? (Math.sin(ringT * 16) > 0 ? 2.2 : 0.7) : 1.15;
      for (const l of lamps) (l.material as THREE.MeshBasicMaterial).color.setHex(0xfff0c0).multiplyScalar(flash);
      base.copy(pos);
      // a shudder while the bell rings, and a gentle sway on the cable
      const shake = ringT < 1.2 ? Math.sin(ringT * 40) * 0.02 * (1 - ringT / 1.2) : 0;
      g.position.set(base.x + shake, base.y, base.z);
      g.rotation.z = damp(g.rotation.z, Math.sin(t * 2.1) * 0.01, 4, dt) + shake * 0.5;
      void clamp;
    },
  };
}

/** Red lacquer with cream window frames and a gold line, laid over the car's side (u along, v up). */
function carPaint() {
  const W = 256, H = 128;
  const p = new Painter(W, H, 75).fill('#c8283a');
  const g = p.g;
  p.vgrad([[0, 'rgba(255,255,255,0.08)'], [1, 'rgba(0,0,0,0.12)']]);
  // windows in the upper half: three panes
  for (let i = 0; i < 3; i++) {
    const x = 16 + i * 78, w = 66;
    g.fillStyle = '#f6eee0'; g.fillRect(x - 4, 20, w + 8, 56);
    g.fillStyle = '#3c4a66'; g.fillRect(x, 24, w, 48);
    g.fillStyle = 'rgba(255,240,210,0.7)'; g.fillRect(x + 4, 28, w * 0.3, 40);
  }
  g.fillStyle = '#d8b25a'; g.fillRect(0, 86, W, 5);
  g.fillStyle = '#f6eee0'; g.font = `bold 20px ${FUTURA}`; g.textAlign = 'center'; g.fillText('GRAND BUDAPEST', W / 2, 112);
  return p.texture({ wrap: false });
}
