import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, canvasTexture, cyl, glow, mesh, toon } from '../../../engine/Builders';
import { Painter, repeatUV } from '../../../engine/Paint';
import { TAU, lerp } from '../../../engine/math';
import { texMat, tiled } from '../kit';
import { FUTURA } from '../film';
import { CITY, LAB, PARK, SAKE, SEA, TAIKO } from './plan';
import { corrugated, jpSign, JP, oldBoards, rustIron } from './paint';

/*
 * The set pieces of Trash Island: Atari's crashed Junior-Turbo Prop nose-down in a heap of bales, Spots' cage,
 * the sake barrel Nutmeg poses on, the abandoned amusement park (a Ferris wheel and a broken roller coaster),
 * the sake brewery and the animal-testing laboratory in the valleys, Megasaki City's skyline across the bay
 * as painted flats, and the taiko drummers' floating stage.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material, seg = 6) {
  const d = b.clone().sub(a);
  const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}

// ---------------- the crashed plane ----------------
function planeSkin() {
  const p = new Painter(512, 256, 401).fill('#e6e0d0');
  const g = p.g;
  p.dabs({ n: 40, colors: ['#d8d0bc', '#f0ece2'], r: [10, 40], alpha: [0.2, 0.4] });
  // a red cheat line down the side and the registration
  g.fillStyle = '#c03028'; g.fillRect(0, 118, 512, 22);
  g.fillStyle = '#1e2a4a'; g.fillRect(0, 142, 512, 6);
  g.fillStyle = '#1e2a4a'; g.font = `bold 34px ${FUTURA}`; g.textAlign = 'center';
  for (const x of [128, 384]) g.fillText('JA-7 JUNIOR-TURBO', x, 100);
  g.font = `bold 30px ${JP}`; g.fillStyle = '#c03028';
  for (const x of [128, 384]) g.fillText('小林', x, 186);
  // scorch and dents
  p.dabs({ n: 30, colors: ['#3a3430', '#5a524a'], r: [6, 24], alpha: [0.2, 0.5], squash: 0.6 });
  p.dabs({ n: 40, colors: ['#8a4a2a'], r: [2, 8], alpha: [0.3, 0.6] });
  return p.texture();
}

/** Atari's plane, nose-down; origin where the nose meets the heap. Returns the group and the point on its wing where Atari stands. */
export function buildPlane(baleMat: THREE.Material) {
  const g = new THREE.Group();
  const skin = texMat(planeSkin());
  const red = texMat(rustIron(0xc03028, 403, 0.3));
  const dark = toon(0x2a2a2e);
  const glass = new THREE.MeshPhongMaterial({ color: 0x8ab8c8, shininess: 100, specular: 0xffffff, transparent: true, opacity: 0.75 });
  const plane = new THREE.Group();
  // fuselage along +x (nose at the origin end), tapering to the tail
  const prof: THREE.Vector2[] = [];
  const LEN = 7.2;
  for (let i = 0; i <= 16; i++) { const k = i / 16; const r = k < 0.15 ? lerp(0.55, 0.78, k / 0.15) : k < 0.45 ? 0.78 : lerp(0.78, 0.18, (k - 0.45) / 0.55); prof.push(new THREE.Vector2(r, k * LEN)); }
  const fus = new THREE.LatheGeometry(prof, 18);
  fus.rotateZ(-Math.PI / 2);
  plane.add(mesh(fus, skin));
  // the engine cowl and the bent propeller at the nose
  plane.add(mesh(new THREE.CylinderGeometry(0.58, 0.5, 0.6, 16).rotateZ(Math.PI / 2), red, -0.25, 0, 0));
  plane.add(mesh(new THREE.ConeGeometry(0.2, 0.4, 10).rotateZ(Math.PI / 2), red, -0.7, 0, 0));
  for (const [ang, bend] of [[0.3, 0.6], [0.3 + Math.PI, -0.9]] as const) {
    const blade = mesh(new THREE.BoxGeometry(0.06, 1.3, 0.22), dark, -0.62, 0, 0);
    blade.geometry.translate(0, 0.65, 0);
    blade.rotation.set(ang, 0, bend * 0.4);
    plane.add(blade);
  }
  // the canopy over the cockpit, its glass cracked open
  const can = mesh(new THREE.SphereGeometry(0.62, 14, 10, 0, TAU, 0, Math.PI / 2), glass, 2.2, 0.55, 0);
  can.scale.set(1.8, 0.85, 0.9); plane.add(can);
  // wings: the left one crumpled up, the right one whole (Atari stands on it)
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  wingR.add(mesh(new THREE.BoxGeometry(1.6, 0.16, 4.6), skin, 0, 0, 2.3));
  wingR.add(mesh(new THREE.BoxGeometry(1.62, 0.17, 0.6), red, 0, 0, 4.4));
  wingR.position.set(2.0, -0.35, 0.5); plane.add(wingR);
  wingL.add(mesh(new THREE.BoxGeometry(1.6, 0.16, 2.4), skin, 0, 0, -1.2));
  const tip = mesh(new THREE.BoxGeometry(1.4, 0.16, 2.2), skin, 0, 0, -1.0);
  const tipG = new THREE.Group(); tipG.add(tip); tipG.position.z = -2.3; tipG.rotation.x = -0.9; tipG.rotation.z = 0.3; wingL.add(tipG);
  wingL.position.set(2.0, -0.35, -0.5); wingL.rotation.x = -0.25; plane.add(wingL);
  // tail: the fin with a red disc, and the tailplane
  const fin = mesh(new THREE.BoxGeometry(1.4, 1.5, 0.1), skin, LEN - 0.6, 0.85, 0);
  plane.add(fin);
  const disc = mesh(new THREE.CircleGeometry(0.42, 18), toon(0xc03028), LEN - 0.6, 0.95, 0.06);
  plane.add(disc);
  const disc2 = disc.clone(); disc2.position.z = -0.06; disc2.rotation.y = Math.PI; plane.add(disc2);
  plane.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 3.0), skin, LEN - 0.5, 0.1, 0));
  // landing gear sticking up, a wheel off
  plane.add(rod(V(1.6, -0.6, 0.6), V(1.4, -1.4, 0.9), 0.06, dark));
  const wh = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12).rotateX(Math.PI / 2), dark, 1.4, -1.5, 0.95); plane.add(wh);
  // nose down into the heap, rolled a little
  plane.rotation.set(0.12, 0, 0.62);
  plane.position.set(0, 0.6, 0);
  plane.scale.setScalar(1.35);
  g.add(plane);
  // a mound of bales round the nose (on the grid, for the bale shader)
  // (the group stands at an odd x and an even z, so whole bales sit at even x and odd z here)
  const bale = (x: number, y: number, z: number, w = 2, h = 2, d = 2) => { const m = mesh(new THREE.BoxGeometry(w, h, d), baleMat); m.position.set(x, y + h / 2, z); g.add(m); };
  bale(-2, 0, -1, 2, 4); bale(-2, 0, 1, 2, 2); bale(0, 0, -1, 2, 2); bale(-4, 0, 1, 2, 6, 6); bale(-2, 2, -3, 2, 2); bale(2, 0, -3, 2, 2);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== glass) { m.castShadow = true; m.receiveShadow = true; } });
  // where Atari stands: on the right wing, near its root (in the group's space)
  plane.updateMatrixWorld(true);
  const stand = wingR.localToWorld(V(0.1, 0.08, 1.4));
  return { group: g, stand, smoke: plane.localToWorld(V(-0.2, 0.6, 0)) };
}

// ---------------- Spots' cage ----------------
export function buildCage() {
  const g = new THREE.Group();
  const iron = texMat(rustIron(0x5a4a40, 411, 0.8));
  const W = 2.6, D = 3.4, H = 2.8;
  // base plate and roof
  g.add(box(W + 0.2, 0.2, D + 0.2, iron, 0, 0.1, 0));
  g.add(box(W + 0.2, 0.16, D + 0.2, iron, 0, H, 0));
  // bars all round (the front, facing +z, has a door hanging open on one hinge)
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 8) {
    g.add(cyl(0.035, 0.035, H, iron, x, H / 2, -D / 2, 5));
    if (Math.abs(x) > 0.6) g.add(cyl(0.035, 0.035, H, iron, x, H / 2, D / 2, 5));
  }
  for (let z = -D / 2; z <= D / 2 + 0.01; z += D / 10) for (const x of [-W / 2, W / 2]) g.add(cyl(0.035, 0.035, H, iron, x, H / 2, z, 5));
  for (const y of [0.9, 1.9]) for (const s of [-1, 1]) { g.add(box(W, 0.06, 0.06, iron, 0, y, s * D / 2)); g.add(box(0.06, 0.06, D, iron, s * W / 2, y, 0)); }
  // the door: bars in a frame, swung half open
  const door = new THREE.Group();
  for (let x = 0; x <= 1.2; x += 0.3) door.add(cyl(0.03, 0.03, H - 0.3, iron, x, (H - 0.3) / 2, 0, 5));
  door.add(box(1.25, 0.06, 0.06, iron, 0.6, 0.2, 0), box(1.25, 0.06, 0.06, iron, 0.6, H - 0.4, 0));
  door.position.set(-0.6, 0.15, D / 2); door.rotation.y = -1.1;
  g.add(door);
  // a padlock hanging open, and a name plate
  g.add(box(0.2, 0.24, 0.1, toon(0xc8a050), 0.64, 1.3, D / 2 + 0.06));
  const plate = mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshLambertMaterial({ map: jpSign('スポッツ', 'SPOTS', { w: 256, h: 96, bg: '#e8e0cc', fg: '#2a2a3a' }) }), 0, H + 0.36, D / 2 + 0.1);
  g.add(plate, box(1.2, 0.5, 0.06, iron, 0, H + 0.36, D / 2 + 0.06));
  // an empty bowl
  g.add(cyl(0.25, 0.18, 0.12, toon(0x8a96a8), 0.7, 0.26, -0.9, 12));
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// ---------------- Nutmeg's sake barrel ----------------
export function buildBarrel() {
  const g = new THREE.Group();
  const straw = canvasTexture(256, 128, (c) => {
    c.fillStyle = '#d8c08a'; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = 'rgba(140,110,60,0.6)'; c.lineWidth = 1.2;
    for (let x = 0; x < 256; x += 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2, 128); c.stroke(); }
    // the label: a big 酒 in black and red on the straw
    c.fillStyle = '#f2ead6'; c.fillRect(20, 24, 86, 80);
    c.fillStyle = '#1a1a1a'; c.font = `bold 62px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('酒', 63, 66);
    c.fillStyle = '#c03028'; c.beginPath(); c.arc(92, 34, 9, 0, TAU); c.fill();
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 6; for (const y of [14, 114]) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke(); }
  });
  const R = 1.25, H = 3.0;
  g.add(mesh(new THREE.CylinderGeometry(R * 0.92, R, H, 20, 1, true), new THREE.MeshLambertMaterial({ map: straw }), 0, H / 2, 0));
  g.add(mesh(new THREE.CylinderGeometry(R * 0.92, R * 0.92, 0.06, 20), toon(0xa8885a), 0, H, 0));
  for (const y of [0.3, H * 0.5, H - 0.25]) { const t = mesh(new THREE.TorusGeometry(R * 0.97, 0.07, 6, 24), toon(0x3a2a1a), 0, y, 0); t.rotation.x = Math.PI / 2; g.add(t); }
  // empty sake bottles round its foot (her trick props)
  const bottle = (x: number, z: number, lying: boolean) => {
    const b = new THREE.Group();
    b.add(cyl(0.16, 0.18, 0.62, toon(0x6a7a4a), 0, 0.31, 0, 10), cyl(0.06, 0.13, 0.26, toon(0x6a7a4a), 0, 0.74, 0, 8));
    b.position.set(x, lying ? 0.17 : 0, z); if (lying) b.rotation.set(0, 0.7, Math.PI / 2);
    g.add(b);
  };
  bottle(1.5, 0.6, false); bottle(1.2, -1.2, true); bottle(-1.4, 0.9, true);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return { group: g, top: H + 0.03 };
}

// ---------------- the amusement park ----------------
export interface Park {
  group: THREE.Group;
  wheel: THREE.Group;
  cabins: THREE.InstancedMesh;
  cabinAngles: number[];
  radius: number;
  bulbs: THREE.MeshBasicMaterial;
  /** a point at the wheel's hub, for the photo subject */
  hub: THREE.Vector3;
}

export function buildPark(groundAt: (x: number, z: number) => number): Park {
  const g = new THREE.Group();
  const white = texMat(rustIron(0xe6e0d0, 433, 0.55));
  const mint = texMat(rustIron(0x9ac8b8, 435, 0.6));
  const pink = texMat(rustIron(0xe2a8b0, 437, 0.6));
  const yellow = texMat(rustIron(0xe8c86a, 439, 0.6));
  const railRed = texMat(rustIron(0xb83a30, 441, 0.7));
  const bulbs = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x8a7a60) });
  const floor = PARK.y;
  // ---- the Ferris wheel, its axle along x so it faces the cable line ----
  const R = PARK.wheelR, hubY = floor + R + 3.5;
  const wx = PARK.x - 8, wz = PARK.z + 4;
  const wheel = new THREE.Group();
  for (const s of [-1, 1]) {
    const rim = mesh(new THREE.TorusGeometry(R, 0.22, 6, 64), white);
    rim.rotation.y = Math.PI / 2; rim.position.x = s * 1.1; wheel.add(rim);
    const inner = mesh(new THREE.TorusGeometry(R * 0.62, 0.14, 6, 48), white);
    inner.rotation.y = Math.PI / 2; inner.position.x = s * 1.1; wheel.add(inner);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      wheel.add(rod(V(s * 1.1, 0, 0), V(s * 1.1, Math.sin(a) * R, Math.cos(a) * R), 0.09, white, 5));
      // bulbs along the spokes
      for (let j = 1; j <= 4; j++) wheel.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), bulbs, s * 1.25, Math.sin(a) * R * j / 4.2, Math.cos(a) * R * j / 4.2));
    }
    // a zigzag of struts between the rims
  }
  for (let k = 0; k < 32; k++) { const a = (k / 32) * TAU; wheel.add(rod(V(-1.1, Math.sin(a) * R, Math.cos(a) * R), V(1.1, Math.sin(a + TAU / 32) * R, Math.cos(a + TAU / 32) * R), 0.07, white, 4)); }
  wheel.add(cyl(0.7, 0.7, 3.2, white, 0, 0, 0, 14).rotateZ(Math.PI / 2));
  wheel.position.set(wx, hubY, wz);
  g.add(wheel);
  // the cabins hang from the rim and stay upright (the scene keeps them level as the wheel turns): one
  // instanced mesh, each cabin tinted a faded pastel
  const cabinParts: THREE.BufferGeometry[] = [];
  const part = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => { const gg = geo.index ? geo.toNonIndexed() : geo; gg.translate(x, y, z); cabinParts.push(gg); };
  part(new THREE.BoxGeometry(1.8, 0.12, 1.6), 0, -2.0, 0);
  part(new THREE.BoxGeometry(1.8, 1.0, 0.08), 0, -1.5, 0.78); part(new THREE.BoxGeometry(1.8, 1.0, 0.08), 0, -1.5, -0.78);
  part(new THREE.BoxGeometry(0.08, 1.0, 1.6), -0.88, -1.5, 0); part(new THREE.BoxGeometry(0.08, 1.0, 1.6), 0.88, -1.5, 0);
  part(new THREE.ConeGeometry(1.35, 0.7, 4).rotateY(Math.PI / 4), 0, -0.45, 0);
  for (const x of [-0.85, 0.85]) for (const z of [-0.75, 0.75]) part(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 4), x, -0.9, z);
  part(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4), 0, -0.1, 0);
  for (const gg of cabinParts) { for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k); }
  const cabins = new THREE.InstancedMesh(mergeGeometries(cabinParts, false)!, texMat(rustIron(0xf2eee6, 443, 0.55)), 16);
  const tints = [0x9ac8b8, 0xe2a8b0, 0xe8c86a, 0xe6e0d0].map((c) => new THREE.Color(c));
  for (let k = 0; k < 16; k++) cabins.setColorAt(k, tints[k % 4]);
  cabins.castShadow = true; cabins.frustumCulled = false;
  const cabinAngles = Array.from({ length: 16 }, (_, k) => (k / 16) * TAU);
  // the A-frame legs
  for (const s of [-1, 1]) for (const dz of [-1, 1]) g.add(rod(V(wx + s * 2.2, floor, wz + dz * R * 0.55), V(wx + s * 1.5, hubY, wz), 0.32, white, 8));
  // a ticket booth and the gate arch with the park's name, facing the cable line
  {
    const gate = new THREE.Group();
    for (const s of [-1, 1]) gate.add(cyl(0.3, 0.36, 7, mint, 0, 3.5, s * 5, 10), mesh(new THREE.SphereGeometry(0.6, 10, 8), pink, 0, 7.4, s * 5));
    const sign = mesh(new THREE.PlaneGeometry(10.5, 2.4), new THREE.MeshLambertMaterial({ map: parkSign(), side: THREE.DoubleSide }), 0, 6.2, 0);
    sign.rotation.y = -Math.PI / 2;
    gate.add(sign, box(0.2, 2.6, 10.8, white, 0.12, 6.2, 0));
    gate.position.set(PARK.x - 36, groundAt(PARK.x - 36, PARK.z + 14), PARK.z + 14);
    gate.rotation.z = -0.06;
    g.add(gate);
  }
  // ---- the roller coaster: a loop round the valley with a hill, a vertical loop, and a broken span ----
  {
    const pts: THREE.Vector3[] = [];
    const cx = PARK.x + 6, cz = PARK.z - 4;
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU;
      const r = 30 + Math.sin(a * 3) * 5;
      const x = cx + Math.cos(a) * r * 0.7, z = cz + Math.sin(a) * r;
      const y = floor + 6 + Math.max(0, Math.sin(a * 2 + 0.6)) * 12 + Math.max(0, Math.sin(a * 5)) * 3;
      pts.push(V(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const N = 220;
    const up = V(0, 1, 0);
    const railGeo: THREE.BufferGeometry[] = [];
    const parts = new THREE.Group();
    const gapA = 0.62, gapB = 0.66;
    for (const off of [-0.6, 0.6]) {
      // each rail in pieces, leaving the broken span out
      for (const [u0, u1] of [[0, gapA], [gapB, 1]]) {
        const sub: THREE.Vector3[] = [];
        for (let i = 0; i <= 80; i++) {
          const u = u0 + (u1 - u0) * (i / 80);
          const p = curve.getPointAt(u), t = curve.getTangentAt(u);
          const side = V(0, 0, 0).crossVectors(t, up).normalize();
          sub.push(p.clone().addScaledVector(side, off));
        }
        railGeo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sub), 80, 0.14, 5, false));
      }
    }
    for (const geo of railGeo) parts.add(mesh(geo, railRed));
    // ties and supports
    for (let i = 0; i < N; i++) {
      const u = i / N;
      if (u > gapA && u < gapB) continue;
      const p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const tie = mesh(new THREE.BoxGeometry(1.5, 0.1, 0.2), white);
      tie.position.copy(p).add(V(0, -0.12, 0));
      tie.lookAt(p.clone().add(t)); tie.position.y -= 0.0;
      parts.add(tie);
      if (i % 6 === 0) { const gy = groundAt(p.x, p.z); if (p.y - gy > 1) parts.add(rod(V(p.x, gy, p.z), V(p.x, p.y - 0.2, p.z), 0.16, white, 5), rod(V(p.x - 1.4, gy, p.z), V(p.x, p.y * 0.6 + gy * 0.4, p.z), 0.08, white, 4)); }
    }
    // a vertical loop on the near side
    {
      const lp = curve.getPointAt(0.36), lt = curve.getTangentAt(0.36);
      const loop = mesh(new THREE.TorusGeometry(5, 0.16, 6, 40), railRed);
      loop.position.copy(lp).add(V(0, 5, 0));
      loop.lookAt(loop.position.clone().add(V(-lt.z, 0, lt.x)));
      parts.add(loop);
      const loop2 = loop.clone(); loop2.position.addScaledVector(V(-lt.z, 0, lt.x).normalize(), 1.2); parts.add(loop2);
      for (let k = 0; k < 4; k++) parts.add(rod(V(lp.x, groundAt(lp.x, lp.z), lp.z), loop.position.clone().add(V(Math.cos(k) * 2, Math.sin(k) * 2, 0)), 0.12, white, 4));
    }
    // a car stranded at the top of the hill
    {
      const u = 0.12;
      const p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const car = new THREE.Group();
      car.add(box(1.6, 0.8, 2.6, pink, 0, 0.5, 0), box(1.6, 0.5, 0.3, yellow, 0, 1.0, 1.15), box(1.62, 0.12, 2.62, white, 0, 0.9, 0));
      car.position.copy(p); car.lookAt(p.clone().add(t));
      parts.add(car);
    }
    // the broken span's dangling rail ends
    const ga = curve.getPointAt(gapA);
    parts.add(rod(ga, ga.clone().add(V(1.5, -4, 0.8)), 0.13, railRed, 5));
    g.add(parts);
  }
  // a little carousel roof and a tea-cup ride, half buried
  {
    const car = new THREE.Group();
    const roof = mesh(new THREE.ConeGeometry(6, 2.6, 16), texMat(stripesTex()), 0, 5.2, 0);
    car.add(roof, cyl(0.4, 0.4, 5, yellow, 0, 2.5, 0, 10), cyl(5.6, 5.6, 0.4, pink, 0, 0.8, 0, 24));
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; car.add(cyl(0.08, 0.08, 4.0, yellow, Math.cos(a) * 4.5, 2.8, Math.sin(a) * 4.5, 5)); car.add(box(0.5, 0.9, 1.3, white, Math.cos(a) * 4.5, 1.9 + (k % 2) * 0.6, Math.sin(a) * 4.5)); }
    const cx = PARK.x + 22, cz = PARK.z + 22;
    car.position.set(cx, groundAt(cx, cz), cz); car.rotation.z = 0.08;
    g.add(car);
  }
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== bulbs) { m.castShadow = true; m.receiveShadow = true; } });
  return { group: g, wheel, cabins, cabinAngles, radius: R, bulbs, hub: V(wx, hubY, wz) };
}

let stripes: THREE.Texture | null = null;
function stripesTex() {
  return stripes ??= canvasTexture(256, 64, (c) => {
    for (let x = 0; x < 256; x += 32) { c.fillStyle = (x / 32) % 2 ? '#e6dccb' : '#d28890'; c.fillRect(x, 0, 32, 64); }
    c.fillStyle = 'rgba(90,50,30,0.3)'; for (let i = 0; i < 60; i++) c.fillRect((i * 53) % 256, (i * 29) % 64, 5, 4);
  });
}

function parkSign() {
  const p = new Painter(1024, 240, 451).fill('#efe2c4');
  const g = p.g;
  g.strokeStyle = '#c84a5a'; g.lineWidth = 12; g.strokeRect(10, 10, 1004, 220);
  g.fillStyle = '#c84a5a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 110px ${JP}`; g.fillText('ドリームランド', 512, 100);
  g.fillStyle = '#3a7a8a'; g.font = `bold 40px ${FUTURA}`; g.fillText('MEGASAKI DREAMLAND  ·  CLOSED', 512, 196);
  // missing letters and rust
  p.dabs({ n: 70, colors: ['#8a4a2a', '#6a3a24', '#c8b898'], r: [3, 14], alpha: [0.4, 0.8] });
  g.fillStyle = '#efe2c4'; g.fillRect(560, 40, 110, 120);
  return p.texture({ wrap: false });
}

// ---------------- the sake brewery ----------------
export function buildBrewery(groundAt: (x: number, z: number) => number) {
  const g = new THREE.Group();
  const brick = texMat(rustIron(0x9a5a44, 461, 0.35));
  const timber = texMat(oldBoards(0x5a4636, 463));
  const roofM = texMat(corrugated(0x6a6a66, 465));
  const plaster = texMat(rustIron(0xe2dccb, 467, 0.25));
  const x0 = SAKE.x, z0 = SAKE.z, y0 = groundAt(SAKE.x, SAKE.z);
  // three long halls with sawtooth roofs, side by side, gable ends towards the cable line
  for (let k = 0; k < 3; k++) {
    const hz = z0 - 12 + k * 12;
    g.add(tiled(22, 7, 10, k === 1 ? plaster : brick, 2, 2, x0, y0 + 3.5, hz));
    g.add(box(22, 0.4, 10.4, timber, x0, y0 + 7.1, hz));
    for (let j = 0; j < 4; j++) {
      const r = mesh(new THREE.BoxGeometry(5.6, 0.2, 5.4), roofM, x0 - 8.25 + j * 5.5, y0 + 9, hz - 2.4);
      r.rotation.x = 0.5; g.add(r);
      g.add(box(5.4, 2.6, 0.2, glowGlass(), x0 - 8.25 + j * 5.5, y0 + 8.4, hz + 2.4));
    }
    // dark windows down the side facing the track
    for (let j = 0; j < 5; j++) g.add(box(0.1, 1.6, 1.4, toon(0x2a2a2a), x0 + 11.05, y0 + 3.6, hz - 3.6 + j * 1.8));
  }
  // the chimney, with 酒造 down it
  const chim = new THREE.Group();
  chim.add(mesh(new THREE.CylinderGeometry(1.1, 1.7, 26, 14), brick, 0, 13, 0));
  const label = mesh(repeatUV(new THREE.CylinderGeometry(1.32, 1.42, 9, 14, 1, true, -0.7, 1.4), 1, 1), new THREE.MeshLambertMaterial({ map: jpSign('小林酒造', '', { w: 128, h: 512, vertical: true, bg: '#efe6d2', fg: '#1a1a1a' }) }), 0, 17, 0);
  chim.add(label);
  for (const y of [8, 22, 25.6]) { const r = mesh(new THREE.TorusGeometry(1.25 - y * 0.012, 0.12, 6, 18), toon(0x3a3434), 0, y, 0); r.rotation.x = Math.PI / 2; chim.add(r); }
  chim.position.set(x0 + 8, y0, z0 + 12);
  chim.rotation.y = Math.PI / 2 + 0.35;
  g.add(chim);
  // big cedar vats outside, and a pyramid of sake barrels
  for (let k = 0; k < 3; k++) {
    const v = new THREE.Group();
    v.add(cyl(2.4, 2.6, 5, timber, 0, 2.5, 0, 16));
    for (const y of [1, 2.5, 4]) { const r = mesh(new THREE.TorusGeometry(2.5, 0.08, 5, 24), toon(0x2a2420), 0, y, 0); r.rotation.x = Math.PI / 2; v.add(r); }
    v.position.set(x0 + 16, groundAt(x0 + 16, z0 - 10 + k * 6), z0 - 10 + k * 6);
    g.add(v);
  }
  const barrel = texMat(jpSign('酒', '', { w: 128, h: 128, bg: '#d8c08a', fg: '#1a1a1a' }));
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const b = mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 12).rotateZ(Math.PI / 2), barrel, x0 + 14, groundAt(x0 + 14, z0 + 8) + 0.75 + row * 1.35, z0 + 6 + i * 1.55 + row * 0.77);
    b.rotation.x = Math.PI / 2; g.add(b);
  }
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

let glassMat: THREE.Material | null = null;
const glowGlass = () => glassMat ??= new THREE.MeshLambertMaterial({ color: 0xa8b4a8, emissive: 0x2a3028 });

// ---------------- the animal-testing laboratory ----------------
export function buildLab() {
  const g = new THREE.Group();
  const white = texMat(rustIron(0xe8e6de, 471, 0.15));
  const blue = toon(0x5a7a9a);
  const y0 = LAB.y;
  g.add(tiled(26, 9, 16, white, 3, 3, 0, y0 + 4.5, 0));
  g.add(tiled(10, 5, 10, white, 3, 3, 9, y0 + 11.5, 2));
  // ribbon windows
  for (const y of [y0 + 2.5, y0 + 6.2]) g.add(box(24, 1.3, 16.1, blue, 0, y, 0));
  g.add(box(26.4, 0.4, 16.4, toon(0xc8c4b8), 0, y0 + 9.1, 0));
  // a red cross and the sign over the door, facing the cable line (+x)
  const sign = mesh(new THREE.PlaneGeometry(14, 2.2), new THREE.MeshLambertMaterial({ map: jpSign('動物実験研究所', 'ANIMAL TESTING LABORATORY', { w: 1024, h: 160, bg: '#f2f0ea', fg: '#2a4a6a' }) }), 13.06, y0 + 7.6, 0);
  sign.rotation.y = Math.PI / 2; g.add(sign);
  g.add(box(0.2, 2.6, 0.8, toon(0xc8302a), 13.1, y0 + 12.4, 5), box(0.2, 0.8, 2.6, toon(0xc8302a), 13.1, y0 + 12.4, 5));
  // a dish on the roof
  const dish = mesh(new THREE.SphereGeometry(2.2, 14, 8, 0, TAU, 0, Math.PI * 0.32), toon(0xdcd8cc), 4, y0 + 14.8, -4);
  dish.material.side = THREE.DoubleSide; dish.rotation.x = 2.3; g.add(dish, cyl(0.15, 0.2, 2.4, toon(0x6a6a6a), 4, y0 + 15, -4, 6));
  // a wire fence round it
  const fence = new THREE.MeshLambertMaterial({ map: fenceTex(), alphaTest: 0.5, side: THREE.DoubleSide });
  for (const [w, x, z, ry] of [[36, 0, 12, 0], [36, 0, -12, 0], [24, 18, 0, Math.PI / 2], [24, -18, 0, Math.PI / 2]] as const) {
    const f = mesh(repeatUV(new THREE.PlaneGeometry(w, 3), w / 3, 1), fence, x, y0 + 1.5, z);
    f.rotation.y = ry; g.add(f);
  }
  g.position.set(LAB.x, 0, LAB.z);
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== fence) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

let fenceT: THREE.Texture | null = null;
function fenceTex() {
  return fenceT ??= (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#8a8a86'; g.lineWidth = 2;
    for (let k = -64; k < 128; k += 12) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
    g.lineWidth = 4; g.strokeStyle = '#5a5a56'; g.beginPath(); g.moveTo(2, 0); g.lineTo(2, 64); g.stroke(); g.beginPath(); g.moveTo(0, 3); g.lineTo(64, 3); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
}

// ---------------- Megasaki City across the bay ----------------
/**
 * Megasaki's skyline as three painted flats, one behind the other, symmetrical about the cable line: the
 * mountains (with a snow-capped peak) at the back, then the towers round the domed City Hall, then the
 * waterfront with its cranes and the trash barges' quay. Lit windows glow a little.
 */
export function buildSkyline() {
  const g = new THREE.Group();
  const layers: Array<{ z: number; w: number; h: number; draw: (p: Painter, W: number, H: number) => void; tint: number }> = [
    { z: CITY.z - 120, w: 1500, h: 260, tint: 0xb8b0b8, draw: (p, W, H) => {
      const c = p.g;
      c.fillStyle = '#9a98a8';
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) { const k = x / W - 0.5; const fuji = Math.max(0, 1 - Math.abs(k) * 4.2); c.lineTo(x, H - (H * 0.18 + Math.sin(x * 0.013) * H * 0.04 + Math.sin(x * 0.041) * H * 0.02 + fuji * H * 0.62)); }
      c.lineTo(W, H); c.closePath(); c.fill();
      // the snow cap on the centre peak
      c.fillStyle = '#eceaf0';
      c.beginPath(); c.moveTo(W * 0.5 - W * 0.06, H * 0.38); c.lineTo(W * 0.5, H * 0.2); c.lineTo(W * 0.5 + W * 0.06, H * 0.38);
      for (let k = 0; k < 6; k++) c.lineTo(W * 0.5 + W * 0.06 - k * W * 0.02, H * 0.38 + (k % 2) * H * 0.03);
      c.closePath(); c.fill();
    } },
    { z: CITY.z, w: 900, h: 200, tint: 0xd0c4bc, draw: (p, W, H) => {
      const c = p.g, r = p.rng;
      const tower = (cx: number, w: number, h: number, col: string) => {
        c.fillStyle = col; c.fillRect(cx - w / 2, H - h, w, h);
        c.fillStyle = 'rgba(255,226,170,0.85)';
        for (let y = H - h + 6; y < H - 6; y += 7) for (let x = cx - w / 2 + 3; x < cx + w / 2 - 4; x += 6) if (r.chance(0.35)) c.fillRect(x, y, 3, 3);
      };
      // symmetrical: pairs of towers stepping up towards the middle
      const cols = ['#7a7e8a', '#8a8890', '#6e7480', '#8a8070'];
      for (let k = 18; k >= 1; k--) {
        const off = k * (W * 0.024) + 18;
        const h = H * (0.18 + 0.5 * Math.pow(1 - k / 19, 1.6)) + (k % 3) * 6;
        const w = 14 + (k % 4) * 5;
        for (const s of [-1, 1]) tower(W / 2 + s * off, w, h, cols[k % 4]);
      }
      // City Hall: a broad block under a great dome, with a spire and two red banners
      c.fillStyle = '#8a8478'; c.fillRect(W / 2 - 60, H * 0.45, 120, H * 0.55);
      c.fillStyle = '#9a9488'; c.beginPath(); c.ellipse(W / 2, H * 0.45, 52, 44, 0, Math.PI, TAU); c.fill();
      c.fillStyle = '#7a7468'; c.fillRect(W / 2 - 3, H * 0.08, 6, H * 0.18);
      c.fillStyle = '#c03028'; c.fillRect(W / 2 - 50, H * 0.55, 14, 50); c.fillRect(W / 2 + 36, H * 0.55, 14, 50);
      c.fillStyle = '#f2e8d0'; c.beginPath(); c.arc(W / 2, H * 0.62, 12, 0, TAU); c.fill();
      c.fillStyle = '#c03028'; c.beginPath(); c.arc(W / 2, H * 0.62, 8, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,226,170,0.8)';
      for (let y = H * 0.7; y < H - 6; y += 9) for (let x = W / 2 - 54; x < W / 2 + 54; x += 9) c.fillRect(x, y, 4, 5);
    } },
    { z: CITY.z + 60, w: 760, h: 90, tint: 0xd8ccc0, draw: (p, W, H) => {
      const c = p.g, r = p.rng;
      // the waterfront: warehouses and cranes, the incinerator chimneys either side
      for (let x = 0; x < W; x += r.range(18, 40)) { c.fillStyle = r.pick(['#8a7e74', '#7a7470', '#948a7e']); const h = r.range(H * 0.15, H * 0.35); c.fillRect(x, H - h, r.range(14, 36), h); }
      for (const s of [-1, 1]) {
        const x = W / 2 + s * W * 0.32;
        c.fillStyle = '#6e6a66'; c.fillRect(x - 6, H * 0.1, 12, H * 0.9);
        c.fillStyle = '#c03028'; c.fillRect(x - 6, H * 0.1, 12, 6); c.fillRect(x - 6, H * 0.24, 12, 6);
        // cranes
        for (const d of [-60, 60]) { const cx = x + d; c.strokeStyle = '#b84a2a'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, H); c.lineTo(cx, H * 0.3); c.lineTo(cx + s * 40, H * 0.3); c.stroke(); c.beginPath(); c.moveTo(cx + s * 30, H * 0.3); c.lineTo(cx + s * 30, H * 0.55); c.stroke(); }
      }
      c.fillStyle = '#5a5654'; c.fillRect(0, H - 6, W, 6);
    } },
  ];
  for (const L of layers) {
    const W = 2048, H = Math.round((2048 * L.h) / L.w);
    const p = new Painter(W, Math.max(64, H), 491 + L.z);
    p.g.clearRect(0, 0, W, p.h);
    L.draw(p, W, p.h);
    const tex = p.texture({ wrap: false });
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, color: L.tint, fog: true, depthWrite: true });
    const flat = mesh(new THREE.PlaneGeometry(L.w, L.h), m, CITY.x, SEA - 2 + L.h / 2, L.z);
    g.add(flat);
  }
  return g;
}

// ---------------- the taiko stage ----------------
/** A floating stage, red-lacquered, with a gold folding screen painted with a red sun and waves behind. */
export function buildTaikoStage() {
  const g = new THREE.Group();
  const red = texMat(rustIron(0xb02a24, 501, 0.15));
  const deck = texMat(oldBoards(0x9a7a56, 503));
  const black = toon(0x1e1a1a);
  const W = 30, D = 12;
  // the pontoon and the deck
  g.add(box(W + 2, 2.2, D + 2, texMat(rustIron(0x5a5a5e, 505, 0.6)), 0, -0.6, 0));
  g.add(tiled(W, 0.3, D, deck, 2, 2, 0, 0.6, 0));
  g.add(box(W + 0.4, 0.5, 0.4, red, 0, 0.6, D / 2 + 0.2), box(W + 0.4, 0.5, 0.4, red, 0, 0.6, -D / 2 - 0.2));
  for (const s of [-1, 1]) g.add(box(0.4, 0.5, D + 0.8, red, s * (W / 2 + 0.2), 0.6, 0));
  // the folding screen: six panels in a shallow zigzag
  const screenTex = (() => {
    const p = new Painter(1536, 512, 507);
    const c = p.g;
    const gr = c.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#e8c470'); gr.addColorStop(1, '#c8a050');
    c.fillStyle = gr; c.fillRect(0, 0, 1536, 512);
    p.dabs({ n: 120, colors: ['#f2d488', '#c09040'], r: [10, 50], alpha: [0.08, 0.2] });
    // gold leaf squares
    c.strokeStyle = 'rgba(150,110,40,0.25)'; c.lineWidth = 1;
    for (let x = 0; x < 1536; x += 48) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 512); c.stroke(); }
    for (let y = 0; y < 512; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(1536, y); c.stroke(); }
    c.fillStyle = '#c8302a'; c.beginPath(); c.arc(768, 210, 140, 0, TAU); c.fill();
    // stylised waves along the bottom
    for (let row = 0; row < 4; row++) for (let x = -40; x < 1600; x += 96) {
      const y = 400 + row * 34;
      c.fillStyle = row % 2 ? '#2a4a6a' : '#3a6a8a';
      c.beginPath(); c.arc(x + (row % 2) * 48, y, 48, Math.PI, TAU); c.fill();
      c.strokeStyle = '#f2ead6'; c.lineWidth = 4; for (const rr of [36, 24]) { c.beginPath(); c.arc(x + (row % 2) * 48, y, rr, Math.PI, TAU); c.stroke(); }
    }
    c.fillStyle = '#1a1a1a'; c.font = `bold 96px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('太', 220, 200); c.fillText('鼓', 1316, 200);
    return p.texture({ wrap: false });
  })();
  const screen = new THREE.Group();
  const PW = 5, PH = 8;
  for (let k = 0; k < 6; k++) {
    const geo = new THREE.PlaneGeometry(PW, PH);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 6);
    const panel = mesh(geo, new THREE.MeshLambertMaterial({ map: screenTex, side: THREE.DoubleSide }), 0, 0, 0);
    const x = (k - 2.5) * PW * 0.97;
    panel.position.set(x, 0.75 + PH / 2, -D / 2 + 1 + (k % 2) * 0.6);
    panel.rotation.y = (k % 2 ? 1 : -1) * 0.12;
    screen.add(panel);
    screen.add(box(0.14, PH + 0.2, 0.14, black, x - PW / 2, 0.75 + PH / 2, -D / 2 + 1 + 0.3));
  }
  screen.add(box(PW * 6, 0.2, 0.3, black, 0, 0.75 + PH + 0.1, -D / 2 + 1.3));
  g.add(screen);
  // two tall paper lanterns at the front corners
  const lanternMat = glow(0xffd8a0, 1.25);
  for (const s of [-1, 1]) {
    g.add(cyl(0.1, 0.1, 6, black, s * (W / 2 - 1), 3.6, D / 2 - 1, 6));
    const lan = mesh(new THREE.SphereGeometry(1.0, 14, 10), lanternMat, s * (W / 2 - 1), 6.4, D / 2 - 1);
    lan.scale.set(0.8, 1.15, 0.8); g.add(lan);
    g.add(cyl(0.6, 0.6, 0.2, black, s * (W / 2 - 1), 7.65, D / 2 - 1, 10), cyl(0.6, 0.6, 0.2, black, s * (W / 2 - 1), 5.15, D / 2 - 1, 10));
  }
  // a banner of red and white along the front edge (kumo-gata bunting)
  for (let k = 0; k < 15; k++) g.add(box(W / 15 - 0.05, 0.9, 0.06, k % 2 ? toon(0xf2ece0) : red, -W / 2 + (k + 0.5) * (W / 15), 0.2, D / 2 + 0.45));
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== lanternMat) { m.castShadow = true; m.receiveShadow = true; } });
  g.position.set(TAIKO.x, TAIKO.y, TAIKO.z);
  return { group: g, deckY: TAIKO.y + 0.75, front: TAIKO.z + D / 2 };
}

