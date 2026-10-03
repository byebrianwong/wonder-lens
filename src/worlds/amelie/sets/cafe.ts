import * as THREE from 'three';
import { box, cyl, glow, mesh } from '../../../engine/Builders';
import { boxUV, charToon, Painter, repeatUV } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { SETS, Y } from '../layout';
import { optimize, type BuiltSet, type SetContext } from '../common';
import { tiled } from '../buildings';
import { bistroChair, bistroTable, rooftopBackdrop, toonE } from '../props';
import { css, damask, lettering, mosaic, panelling, PAL, plaster } from '../textures';
import { lightShaft } from '../lens';

/*
 * The Café des 2 Moulins, then a dream: through an arch at the back the room grows enormous, and the moped
 * rides up a red gingham tablecloth onto a giant table, past a crème brûlée, a cup of coffee, sugar cubes
 * and a trembling wine glass.
 */

/** Café hall and giant room, in world z. */
export const CAFE = { front: -252, arch: -342, back: -458, halfW: 10.5, height: 9.5, giantHalfW: 40, giantH: 44, tableFront: -388, tableBack: -470, tableHalfW: 22 };

function bottlesTexture(seed = 101) {
  const p = new Painter(512, 256, seed).fill('#2a1a12');
  const g = p.g, rng = p.rng;
  for (let s = 0; s < 3; s++) {
    const y = 30 + s * 80;
    for (let x = 6; x < 506;) {
      const w = rng.range(14, 22), h = rng.range(46, 66);
      const c = rng.pick(['#2a5a2a', '#6a1a1a', '#c8a040', '#e8e0c0', '#8a4a1a', '#3a6a5a', '#d87a2a', '#f0d070']);
      g.fillStyle = c; g.fillRect(x, y + 70 - h, w, h);
      g.fillRect(x + w * 0.35, y + 70 - h - 18, w * 0.3, 18);
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(x + 2, y + 70 - h + 4, 3, h - 8);
      g.fillStyle = rng.pick(['#f0e8d0', '#e8c070', '#c82a2a']); g.fillRect(x + 2, y + 70 - h * 0.55, w - 4, h * 0.22);
      x += w + rng.range(2, 6);
    }
    g.fillStyle = '#c8a050'; g.fillRect(0, y + 70, 512, 6);
  }
  p.vgrad([[0, 'rgba(255,220,150,0.15)'], [1, 'rgba(0,0,0,0.2)']]);
  return p.texture({ repeat: [1, 1] });
}

/** A café poster: two windmills against a sunset, the café's name in red script. */
function moulinsPoster() {
  const p = new Painter(256, 384, 103);
  p.vgrad([[0, '#f0c060'], [0.6, '#e88a40'], [1, '#8a2a1a']]);
  const g = p.g;
  g.fillStyle = '#f8e8b0'; g.beginPath(); g.arc(128, 210, 60, 0, TAU); g.fill();
  for (const [x, s] of [[80, 1], [176, 0.8]] as const) {
    g.fillStyle = '#3a1a14';
    g.beginPath(); g.moveTo(x - 18 * s, 330); g.lineTo(x - 10 * s, 220); g.lineTo(x + 10 * s, 220); g.lineTo(x + 18 * s, 330); g.fill();
    g.beginPath(); g.moveTo(x - 14 * s, 222); g.lineTo(x, 196); g.lineTo(x + 14 * s, 222); g.fill();
    g.strokeStyle = '#3a1a14'; g.lineWidth = 5 * s;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; g.beginPath(); g.moveTo(x, 214); g.lineTo(x + Math.cos(a) * 56 * s, 214 + Math.sin(a) * 56 * s); g.stroke(); }
  }
  g.fillStyle = '#3a1a14'; g.fillRect(0, 330, 256, 54);
  g.fillStyle = '#f8e8b0'; g.textAlign = 'center'; g.font = 'italic bold 34px Georgia, serif'; g.fillText('Café des', 128, 52);
  g.font = 'bold 50px Georgia, serif'; g.fillStyle = '#b8282a'; g.fillText('2 Moulins', 128, 104);
  g.fillStyle = '#f8e8b0'; g.font = '18px Georgia, serif'; g.fillText('MONTMARTRE', 128, 362);
  return p.texture({ wrap: false });
}

/** Red and white gingham. One tile = 3 x 3 units at the giant table's scale. */
function gingham(seed = 105) {
  const S = 128;
  const p = new Painter(S, S, seed).fill('#f6efe2');
  const g = p.g;
  const n = 4, c = S / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = 'rgba(200,36,40,0.5)'; g.fillRect(i * c, 0, c / 2, S); g.fillRect(0, i * c, S, c / 2);
  }
  p.lines({ n: 60, colors: ['rgba(120,20,20,1)', 'rgba(255,255,255,1)'], alpha: [0.05, 0.12], width: [0.6, 1.2], wobble: 0.4 });
  p.lines({ n: 60, colors: ['rgba(120,20,20,1)', 'rgba(255,255,255,1)'], alpha: [0.05, 0.12], width: [0.6, 1.2], vertical: true, wobble: 0.4 });
  return p.texture({ repeat: [1, 1] });
}

/** The top of a crème brûlée: amber caramel glass with darker burnt patches and glints. */
function caramelTop(cracked: boolean, seed = 107) {
  const S = 512;
  const p = new Painter(S, S, seed).fill('#d89838');
  const g = p.g, rng = p.rng;
  p.dabs({ n: 90, colors: ['#a8601a', '#8a4810', '#e8b050', '#c07a24'], r: [10, 60], alpha: [0.2, 0.5] });
  p.dabs({ n: 40, colors: ['#5a2a08', '#3a1a04'], r: [4, 22], alpha: [0.3, 0.6] });
  p.dabs({ n: 60, colors: ['#fff0c0'], r: [1, 4], alpha: [0.5, 0.9] });
  if (cracked) {
    // shards round the point where the spoon went in, with pale custard showing through the cracks
    g.strokeStyle = '#fbf0c8'; g.lineCap = 'round';
    const cx = S * 0.5, cy = S * 0.5;
    for (let i = 0; i < 9; i++) {
      let x = cx, y = cy, a = (i / 9) * TAU + rng.range(-0.2, 0.2);
      g.lineWidth = 7;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += rng.range(-0.5, 0.5); x += Math.cos(a) * rng.range(20, 50); y += Math.sin(a) * rng.range(20, 50); g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = '#f8ecc0'; g.beginPath(); g.ellipse(cx, cy, 38, 30, 0.3, 0, TAU); g.fill();
  }
  return p.texture({ wrap: false });
}

/** Fluted porcelain ramekin: radius r, height h, open at the top. */
function ramekinGeometry(r: number, h: number) {
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0.001, 0), new THREE.Vector2(r * 0.92, 0), new THREE.Vector2(r, h * 0.08), new THREE.Vector2(r, h * 0.95), new THREE.Vector2(r * 0.98, h), new THREE.Vector2(r * 0.9, h), new THREE.Vector2(r * 0.9, h * 0.1));
  const geo = new THREE.LatheGeometry(pts, 96);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (rr > r * 0.95 && y > h * 0.05 && y < h * 0.97) { const k = 1 + Math.cos(a * 28) * 0.025; pos.setX(i, x * k); pos.setZ(i, z * k); }
  }
  geo.computeVertexNormals();
  return geo;
}

/** A teaspoon lying along +z: a shallow oval bowl at the front and a slim handle. Length about 6.2 * s. */
function teaspoon(mat: THREE.Material, s = 1) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2), mat);
  bowl.scale.set(0.75 * s, 0.32 * s, 1.15 * s); bowl.position.z = 1.4 * s;
  bowl.material = mat; (mat as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  g.add(bowl);
  const shape = new THREE.Shape();
  shape.moveTo(-0.14 * s, 0.4 * s); shape.lineTo(0.14 * s, 0.4 * s); shape.quadraticCurveTo(0.12 * s, -2 * s, 0.32 * s, -4.4 * s); shape.quadraticCurveTo(0, -4.9 * s, -0.32 * s, -4.4 * s); shape.quadraticCurveTo(-0.12 * s, -2 * s, -0.14 * s, 0.4 * s);
  const handle = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.08 * s, bevelEnabled: true, bevelSize: 0.04 * s, bevelThickness: 0.04 * s, bevelSegments: 2 }), mat);
  handle.rotation.x = Math.PI / 2; handle.position.set(0, 0.04 * s, 0.4 * s);
  g.add(handle);
  return g;
}

/** Silver: a painted reflection of the warm room on a lit material. */
function silverMaterial() {
  const p = new Painter(32, 128, 109);
  p.vgrad([[0, '#fffaf0'], [0.3, '#d8d0c0'], [0.45, '#6a5a48'], [0.6, '#c8b8a0'], [1, '#5a4434']]);
  return new THREE.MeshLambertMaterial({ map: p.texture({ wrap: false }), emissive: 0x403830 });
}

export interface Cafe extends BuiltSet {
  spots: { bar: THREE.Vector3; barYaw: number; tabac: THREE.Vector3; tabacYaw: number; joseph: THREE.Vector3; josephYaw: number; espresso: THREE.Vector3 };
  /** the crème brûlée: crack it (spoon comes down, the caramel shatters) */
  creme: { group: THREE.Object3D; crack(): void; cracked(): boolean };
  /** the wine glass that trembles on its own */
  glass: THREE.Object3D;
}

export function buildCafe(ctx: SetContext): Cafe {
  const { road, lights } = ctx;
  const rng = new Rng(4242);
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);
  const y0 = Y.cafe;
  const x0 = road.at(-300).x * 0; // the hall is centred on x = 0
  const H = CAFE.height, HW = CAFE.halfW;
  const zF = CAFE.front, zA = CAFE.arch;
  const hallD = zF - zA;
  const hallZ = (zF + zA) / 2;

  // ---------- materials ----------
  const floorM = new THREE.MeshLambertMaterial({ map: mosaic() });
  const dado = new THREE.MeshLambertMaterial({ map: panelling(0x5a1a14) });
  const upper = new THREE.MeshLambertMaterial({ map: plaster(0xa8a050, 111) });
  const ceilM = new THREE.MeshLambertMaterial({ map: damask(0x7a2a1a, 0xc89a48, 113) });
  const wood = charToon({ color: 0x4a2a18, rim: 0.3, emissive: new THREE.Color(0x1a0a04) });
  const brass = charToon({ color: 0xd8a848, rim: 0.6, emissive: new THREE.Color(0x3a2808) });
  const zinc = silverMaterial();
  const leather = charToon({ color: 0x2a5a3a, rim: 0.4, emissive: new THREE.Color(0x061a0c) });
  const redLeather = charToon({ color: 0x8a1a18, rim: 0.4, emissive: new THREE.Color(0x200404) });
  const globe = glow(0xffe0a0, 1.7);

  // ---------- the hall ----------
  const floor = tiled(HW * 2, 0.4, hallD + 0.4, floorM, 3, 3, x0, y0 - 0.2, hallZ); floor.receiveShadow = true; arch.add(floor);
  // left and right walls: dark red panelling below, mustard plaster above
  for (const s of [-1, 1]) {
    const dw = tiled(0.4, 3.2, hallD, dado, 3, 3.2, x0 + s * HW, y0 + 1.6, hallZ); dw.receiveShadow = true; arch.add(dw);
    if (s < 0) { const uw = tiled(0.4, H - 3.2, hallD, upper, 4, 4, x0 + s * HW, y0 + 3.2 + (H - 3.2) / 2, hallZ); uw.receiveShadow = true; arch.add(uw); }
  }
  // the right wall has tall windows onto a painted, sunlit street
  {
    const winN = 5, step = hallD / winN;
    for (let i = 0; i <= winN; i++) { const pier = tiled(0.5, H - 3.2, 2.4, upper, 4, 4, x0 + HW, y0 + 3.2 + (H - 3.2) / 2, zF - i * step); pier.castShadow = true; arch.add(pier); }
    arch.add(tiled(0.5, 1.2, hallD, upper, 4, 4, x0 + HW, y0 + H - 0.6, hallZ));
    const back = mesh(new THREE.PlaneGeometry(hallD * 1.2, 16), new THREE.MeshBasicMaterial({ map: rooftopBackdrop({ top: '#e8d8a0', bottom: '#f8e0b0', roofs: '#c8a878', lit: 0.1, seed: 115 }), fog: false }), x0 + HW + 9, y0 + 6, hallZ);
    back.rotation.y = -Math.PI / 2; decor.add(back);
    for (let i = 0; i < winN; i++) {
      const z = zF - (i + 0.5) * step;
      // glazing bars and lettering on the glass
      for (let k = -1; k <= 1; k++) decor.add(box(0.08, H - 4.6, 0.08, wood, x0 + HW, y0 + 3.2 + (H - 4.4) / 2, z + k * (step - 2.4) / 4));
      decor.add(box(0.08, 0.08, step - 2.4, wood, x0 + HW, y0 + 5.6, z));
      // sunlight pouring in through each window and across the floor
      decor.add(lightShaft(new THREE.Vector3(x0 + HW + 0.5, y0 + H - 2, z + 1.5), new THREE.Vector3(x0 + HW - 9, y0, z - 2.5), 4.2, 0xffd8a0, 0.13));
    }
  }
  // front wall with the door (we come in from the grocer's back door) and back wall with the great arch
  for (const [z, open] of [[zF, 3.2], [zA, 7]] as const) {
    for (const s of [-1, 1]) {
      const w = HW - open;
      arch.add(tiled(w, 3.2, 0.5, dado, 3, 3.2, x0 + s * (open + w / 2), y0 + 1.6, z));
      arch.add(tiled(w, H - 3.2, 0.5, upper, 4, 4, x0 + s * (open + w / 2), y0 + 3.2 + (H - 3.2) / 2, z));
    }
  }
  arch.add(tiled(6.4, H - 7, 0.5, upper, 4, 4, x0, y0 + 7 + (H - 7) / 2, zF));
  {
    // the arch into the giant room: a round head, gilded
    const shape = new THREE.Shape();
    shape.moveTo(-7, 0); shape.lineTo(-7, H); shape.lineTo(7, H); shape.lineTo(7, 0); shape.lineTo(5.6, 0); shape.lineTo(5.6, 3.2);
    shape.absarc(0, 3.2, 5.6, 0, Math.PI, false); shape.lineTo(-5.6, 0); shape.closePath();
    const a = mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false }), upper, x0, y0, zA - 0.3);
    arch.add(a);
    const rim = mesh(new THREE.TorusGeometry(5.6, 0.22, 8, 32, Math.PI), brass, x0, y0 + 3.2, zA + 0.32); decor.add(rim);
    for (const s of [-1, 1]) decor.add(box(0.44, 3.2, 0.44, brass, x0 + s * 5.6, y0 + 1.6, zA + 0.32));
  }
  // ceiling with mouldings
  const ceil = tiled(HW * 2, 0.4, hallD, ceilM, 2, 2, x0, y0 + H + 0.2, hallZ); arch.add(ceil);
  for (let z = zF - 6; z > zA; z -= 12) decor.add(box(HW * 2, 0.35, 0.5, brass, x0, y0 + H - 0.15, z));

  // ---------- the bar along the left ----------
  const barZ0 = -262, barZ1 = -318, barX = x0 - 5.2;
  {
    const len = barZ0 - barZ1, zc = (barZ0 + barZ1) / 2;
    const front = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.4, 1.5, len), 3, 2.2), new THREE.MeshLambertMaterial({ map: panelling(0x6a2a18, 117) }));
    front.position.set(barX, y0 + 0.75, zc); arch.add(front);
    decor.add(box(1.8, 0.12, len + 0.4, zinc, barX, y0 + 1.56, zc));
    // a raised duckboard behind the bar, so whoever serves stands tall over the zinc
    decor.add(box(2.6, 0.35, len, charToon({ color: 0x5a3a24, rim: 0.2 }), barX - 2.0, y0 + 0.17, zc));
    decor.add(box(0.06, 0.06, len, brass, barX + 1.05, y0 + 0.3, zc));
    // stools
    for (let z = barZ0 - 3; z > barZ1 + 2; z -= 3.6) {
      decor.add(cyl(0.3, 0.3, 0.12, redLeather, barX + 1.6, y0 + 0.95, z, 14));
      decor.add(cyl(0.05, 0.06, 0.9, brass, barX + 1.6, y0 + 0.45, z, 6));
      decor.add(cyl(0.26, 0.3, 0.06, brass, barX + 1.6, y0 + 0.03, z, 12));
    }
    // back bar: shelves of bottles and a long mirror with a gilt frame
    const bottles = tiled(0.3, 3.6, len, new THREE.MeshLambertMaterial({ map: bottlesTexture(), emissive: 0x2a1808, emissiveIntensity: 0.5 }), 6, 3.6, x0 - HW + 0.4, y0 + 3.4, zc);
    decor.add(bottles);
    const mirror = mesh(new THREE.PlaneGeometry(len - 6, 2.0), new THREE.MeshLambertMaterial({ color: 0xc8b890, emissive: 0x3a3018 }), x0 - HW + 0.32, y0 + 6.6, zc);
    mirror.rotation.y = Math.PI / 2; decor.add(mirror);
    decor.add(box(0.2, 0.2, len - 5.6, brass, x0 - HW + 0.4, y0 + 7.7, zc), box(0.2, 0.2, len - 5.6, brass, x0 - HW + 0.4, y0 + 5.5, zc));
    // the café's name painted in gold across the mirror
    const name = mesh(new THREE.PlaneGeometry(16, 1.4), new THREE.MeshBasicMaterial({ map: lettering('Café des 2 Moulins', { fg: '#f3c76a', bg: '#3a0e0a', w: 1024, h: 96, italic: true }) }), x0 - HW + 0.36, y0 + 6.6, zc);
    name.rotation.y = Math.PI / 2; decor.add(name);
    // the espresso machine: a chrome dome with an eagle on top
    const em = new THREE.Group(); em.position.set(barX - 0.3, y0 + 1.62, barZ0 - 18); decor.add(em);
    em.add(cyl(1.0, 1.1, 1.4, zinc, 0, 0.7, 0, 20));
    em.add(mesh(new THREE.SphereGeometry(1.0, 20, 10, 0, TAU, 0, Math.PI / 2), zinc, 0, 1.4, 0));
    em.add(mesh(new THREE.SphereGeometry(0.25, 10, 8), brass, 0, 2.5, 0));
    for (let k = -1; k <= 1; k++) em.add(box(0.12, 0.4, 0.5, brass, 0.9, 0.5, k * 0.5));
    // the tabac counter at the near end: a glass case of cigarettes and the red "carotte" sign outside
    const tab = new THREE.Group(); tab.position.set(barX + 0.2, y0, barZ0 + 3.6); decor.add(tab);
    tab.add(box(2.0, 1.5, 3.0, wood, 0, 0.75, 0));
    tab.add(box(2.1, 0.5, 3.1, new THREE.MeshLambertMaterial({ color: 0xd8e8e0, transparent: true, opacity: 0.4, emissive: 0x303830 }), 0, 1.75, 0));
    tab.add(mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshLambertMaterial({ map: lettering('TABAC', { fg: '#f6e8c8', bg: '#9a1a1a', w: 256, h: 96 }), emissive: 0x401010 }), 1.02, 0.9, 0).rotateY(Math.PI / 2));
    const carrot = mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshLambertMaterial({ color: 0xd8282a, emissive: 0x501010 }), 1.8, 6.6, 0); carrot.scale.set(0.35, 1.0, 1.4); tab.add(carrot);
  }
  // ---------- banquettes and tables along the right, and a row of tables down the middle ----------
  for (let i = 0; i < 6; i++) {
    const z = zF - 8 - i * 12;
    decor.add(box(1.4, 0.7, 9, leather, x0 + HW - 1.0, y0 + 0.75, z));
    decor.add(box(0.5, 1.4, 9, leather, x0 + HW - 0.45, y0 + 1.6, z));
    for (const dz of [-2.4, 2.4]) {
      const t = bistroTable(1.25); t.position.set(x0 + HW - 3.2, y0, z + dz); decor.add(t);
      const c = bistroChair(1.25); c.position.set(x0 + HW - 4.9, y0, z + dz); c.rotation.y = Math.PI / 2; decor.add(c);
      // a cup and saucer on some tables
      if ((i + dz) % 3 !== 0) { decor.add(cyl(0.12, 0.09, 0.14, toonE(0xf4efe4, 0.2), x0 + HW - 3.1, y0 + 1.0, z + dz, 10)); decor.add(cyl(0.2, 0.2, 0.02, toonE(0xf4efe4, 0.2), x0 + HW - 3.1, y0 + 0.94, z + dz, 12)); }
    }
  }
  for (let i = 0; i < 7; i++) {
    const z = zF - 12 - i * 10.5;
    const t = bistroTable(1.25); t.position.set(x0 + 3.6, y0, z); decor.add(t);
    for (const s of [-1, 1]) { const c = bistroChair(1.25); c.position.set(x0 + 3.6, y0, z + s * 1.15); c.rotation.y = s > 0 ? Math.PI : 0; decor.add(c); }
    if (i % 2 === 0) decor.add(cyl(0.05, 0.05, 0.4, new THREE.MeshLambertMaterial({ color: 0x5a1a1a, emissive: 0x200404 }), x0 + 3.6, y0 + 1.12, z, 6));
  }
  // potted palms by the windows
  for (const z of [zF - 3, zF - 46, zA + 4]) {
    const pot = new THREE.Group(); pot.position.set(x0 + HW - 1.2, y0, z); decor.add(pot);
    pot.add(cyl(0.6, 0.45, 1.0, toonE(0x9a5a30, 0.1), 0, 0.5, 0, 12));
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; const leaf = mesh(new THREE.SphereGeometry(1, 8, 6), charToon({ color: 0x3a6a2a, rim: 0.4 }), Math.cos(a) * 0.7, 1.9 + (k % 3) * 0.3, Math.sin(a) * 0.7); leaf.scale.set(0.9, 0.18, 0.35); leaf.rotation.set(0, -a, 0.5); pot.add(leaf); }
  }
  // a chalkboard of the day's dishes, a coat stand and a big round clock
  {
    const menu = new Painter(256, 320, 127).fill('#1e2420');
    const mg = menu.g; mg.fillStyle = '#f4f0e0'; mg.textAlign = 'center'; mg.font = 'italic bold 30px Georgia, serif'; mg.fillText('Plat du jour', 128, 46);
    mg.font = 'italic 22px Georgia, serif';
    ['Œufs mayonnaise', 'Blanquette de veau', 'Crème brûlée', 'Café ........ 5 F', 'Ballon de rouge'].forEach((l, i) => mg.fillText(l, 128, 100 + i * 42));
    mg.strokeStyle = '#8a5a30'; mg.lineWidth = 10; mg.strokeRect(5, 5, 246, 310);
    const board = mesh(new THREE.PlaneGeometry(2.2, 2.75), new THREE.MeshLambertMaterial({ map: menu.texture({ wrap: false }), emissive: 0x101410 }), x0 - HW + 0.32, y0 + 5.2, -326);
    board.rotation.y = Math.PI / 2; decor.add(board);
    const stand = new THREE.Group(); stand.position.set(x0 - 2.2, y0, zF - 2.4); decor.add(stand);
    stand.add(cyl(0.05, 0.06, 3.4, wood, 0, 1.7, 0, 6));
    for (let k = 0; k < 4; k++) { const hook = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), wood, Math.cos(k * 1.57) * 0.2, 3.2, Math.sin(k * 1.57) * 0.2); hook.rotation.z = Math.cos(k * 1.57) * 0.8; hook.rotation.x = -Math.sin(k * 1.57) * 0.8; stand.add(hook); }
    const coat = mesh(new THREE.CylinderGeometry(0.25, 0.45, 1.6, 10), charToon({ color: 0x3a3a2a, rim: 0.3 }), 0.25, 2.4, 0); stand.add(coat);
    const face = new Painter(256, 256, 129).fill('#f6efdc');
    const fg = face.g; fg.strokeStyle = '#2a2018'; fg.lineWidth = 10; fg.beginPath(); fg.arc(128, 128, 120, 0, TAU); fg.stroke();
    fg.fillStyle = '#2a2018'; fg.font = 'bold 28px Georgia, serif'; fg.textAlign = 'center'; fg.textBaseline = 'middle';
    for (let k = 1; k <= 12; k++) { const a = (k / 12) * TAU - Math.PI / 2; fg.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][k - 1], 128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); }
    fg.lineWidth = 8; fg.beginPath(); fg.moveTo(128, 128); fg.lineTo(128 + 40, 128 - 50); fg.stroke(); fg.lineWidth = 5; fg.beginPath(); fg.moveTo(128, 128); fg.lineTo(128 - 70, 128 + 20); fg.stroke();
    decor.add(mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshLambertMaterial({ map: face.texture({ wrap: false }), emissive: 0x302820 }), x0 - 8.8, y0 + 6.8, zA + 0.62));
    decor.add(mesh(new THREE.TorusGeometry(1.35, 0.12, 8, 32), brass, x0 - 8.8, y0 + 6.8, zA + 0.62));
  }
  // yellow globe lamps
  for (let z = zF - 7; z > zA + 4; z -= 11) for (const x of [-4, 4]) {
    decor.add(cyl(0.02, 0.02, 1.4, toonE(0x1a1a1a, 0), x0 + x, y0 + H - 0.7, z, 4));
    decor.add(mesh(new THREE.SphereGeometry(0.5, 16, 12), globe, x0 + x, y0 + H - 1.7, z));
  }
  // posters on the left wall above the door end, and on the back wall
  decor.add(mesh(new THREE.PlaneGeometry(2.2, 3.3), new THREE.MeshLambertMaterial({ map: moulinsPoster(), emissive: 0x3a2010 }), x0 + 8.8, y0 + 5.4, zA + 0.6));

  // ---------- the giant back room ----------
  const GW = CAFE.giantHalfW, GH = CAFE.giantH, zB = CAFE.back - 30;
  const gZ = (zA + zB) / 2, gD = zA - zB;
  const gFloor = tiled(GW * 2, 0.4, gD, floorM, 12, 12, x0, y0 - 0.2, gZ); gFloor.receiveShadow = true; arch.add(gFloor);
  const dadoBig = new THREE.MeshLambertMaterial({ map: panelling(0x5a1a14, 119) });
  for (const s of [-1, 1]) {
    arch.add(tiled(0.8, 13, gD, dadoBig, 12, 13, x0 + s * GW, y0 + 6.5, gZ));
    if (s < 0) arch.add(tiled(0.8, GH - 13, gD, upper, 16, 16, x0 + s * GW, y0 + 13 + (GH - 13) / 2, gZ));
  }
  // the right wall: one enormous window, sun streaming through it onto the table
  {
    const winZ0 = -380, winZ1 = -440;
    arch.add(tiled(0.8, GH - 13, zA - winZ0, upper, 16, 16, x0 + GW, y0 + 13 + (GH - 13) / 2, (zA + winZ0) / 2));
    arch.add(tiled(0.8, GH - 13, winZ1 - zB, upper, 16, 16, x0 + GW, y0 + 13 + (GH - 13) / 2, (winZ1 + zB) / 2));
    arch.add(tiled(0.8, 8, winZ0 - winZ1, upper, 16, 16, x0 + GW, y0 + GH - 4, (winZ0 + winZ1) / 2));
    for (let k = 0; k <= 4; k++) { const bar = box(0.6, GH - 21, 0.6, wood, x0 + GW, y0 + 13 + (GH - 21) / 2, winZ0 - (k / 4) * (winZ0 - winZ1)); bar.castShadow = true; decor.add(bar); }
    for (let k = 1; k < 3; k++) { const bar = box(0.6, 0.6, winZ0 - winZ1, wood, x0 + GW, y0 + 13 + k * (GH - 21) / 3, (winZ0 + winZ1) / 2); bar.castShadow = true; decor.add(bar); }
    const back = mesh(new THREE.PlaneGeometry(120, 60), new THREE.MeshBasicMaterial({ map: rooftopBackdrop({ top: '#e8d098', bottom: '#fbe6b8', roofs: '#b89870', lit: 0, seed: 121, w: 2048, h: 1024 }), fog: false }), x0 + GW + 30, y0 + 22, (winZ0 + winZ1) / 2);
    back.rotation.y = -Math.PI / 2; decor.add(back);
    decor.add(lightShaft(new THREE.Vector3(x0 + GW, y0 + GH - 10, -395), new THREE.Vector3(x0 + 4, y0 + 8, -420), 26, 0xffd8a0, 0.1));
    decor.add(lightShaft(new THREE.Vector3(x0 + GW, y0 + GH - 12, -425), new THREE.Vector3(x0 - 2, y0 + 8, -445), 22, 0xffd8a0, 0.08));
  }
  for (const [z, open] of [[zA, 7], [zB, 0]] as const) {
    for (const s of [-1, 1]) {
      const w = GW - open;
      arch.add(tiled(w, GH, 0.8, upper, 16, 16, x0 + s * (open + w / 2), y0 + GH / 2, z - 0.6 * (z === zA ? 1 : -1)));
    }
  }
  arch.add(tiled(14, GH - H, 0.8, upper, 16, 16, x0, y0 + H + (GH - H) / 2, zA - 0.6));
  arch.add(tiled(GW * 2, 0.8, gD, ceilM, 8, 8, x0, y0 + GH + 0.4, gZ));
  // giant globe lamps hanging high over the table
  for (const [x, z] of [[-14, -380], [12, -405], [-10, -440]] as const) {
    decor.add(cyl(0.1, 0.1, 16, toonE(0x1a1a1a, 0), x0 + x, y0 + GH - 8, z, 4));
    decor.add(mesh(new THREE.SphereGeometry(3.2, 24, 16), globe, x0 + x, y0 + GH - 18, z));
  }
  // a giant poster on the far wall
  decor.add(mesh(new THREE.PlaneGeometry(18, 27), new THREE.MeshLambertMaterial({ map: moulinsPoster(), emissive: 0x3a2010 }), x0 - 8, y0 + 24, zB + 1.1));

  // ---------- the giant table ----------
  const T = { y: Y.table, z0: CAFE.tableFront, z1: CAFE.tableBack, hw: CAFE.tableHalfW };
  const cloth = new THREE.MeshLambertMaterial({ map: gingham(), side: THREE.DoubleSide });
  {
    const tz = (T.z0 + T.z1) / 2, td = T.z0 - T.z1;
    const top = mesh(repeatUV(new THREE.PlaneGeometry(T.hw * 2 + 2, td + 2, 1, 1), (T.hw * 2 + 2) / 6, (td + 2) / 6), cloth, x0, y0 + T.y - Y.cafe + 0.02, tz);
    top.rotation.x = -Math.PI / 2; top.receiveShadow = true; arch.add(top);
    // the cloth hangs in folds down the sides, and slopes down at the front as a ramp to the floor
    const drape = (len: number, h: number, folds: number) => {
      const geo = new THREE.PlaneGeometry(len, h, folds * 6, 4);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const k = (h / 2 - y) / h; p.setZ(i, Math.sin((x / len) * folds * TAU) * 0.5 * k); }
      geo.computeVertexNormals();
      repeatUV(geo, len / 6, h / 6);
      return geo;
    };
    for (const s of [-1, 1]) {
      const d = mesh(drape(td + 2, T.y - Y.cafe + 1, 9), cloth, x0 + s * (T.hw + 1), y0 + (T.y - Y.cafe) / 2 - 0.4, tz);
      d.rotation.y = s * Math.PI / 2; arch.add(d);
    }
    // the table's legs and the giant chairs around it, mostly in shadow under the cloth
    for (const s of [-1, 1]) {
      const c = bistroChair(11); c.position.set(x0 + s * (T.hw + 8), y0, -420); c.rotation.y = -s * Math.PI / 2; decor.add(c);
    }
  }
  // the ramp, set by its ends so it meets the floor and the table edge exactly
  {
    const a = new THREE.Vector3(x0, y0 + 0.02, -350), b = new THREE.Vector3(x0, y0 + T.y - Y.cafe + 0.02, T.z0 + 1);
    const geo = new THREE.PlaneGeometry(T.hw * 2 + 2, a.distanceTo(b), 40, 10);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin((x / (T.hw * 2)) * 7 * TAU) * 0.18 * (1 - Math.abs(x) / (T.hw + 1)) ); }
    geo.computeVertexNormals();
    repeatUV(geo, (T.hw * 2 + 2) / 6, a.distanceTo(b) / 6);
    const ramp = new THREE.Mesh(geo, cloth);
    ramp.position.copy(a).lerp(b, 0.5);
    ramp.rotation.x = -Math.PI / 2;
    ramp.rotateX(Math.atan2(b.y - a.y, a.z - b.z));
    ramp.receiveShadow = true;
    arch.add(ramp);
  }

  // ---------- giant things on the table ----------
  const ty = y0 + T.y - Y.cafe;
  const porcelain = charToon({ color: 0xe8e2d6, rim: 0.3, shade: 0x9890b0 });
  const silver = silverMaterial();
  // the crème brûlée, on a saucer, left of the path
  const creme = new THREE.Group(); creme.position.set(x0 - 5.6, ty, -404); live.add(creme);
  creme.add(mesh(new THREE.CylinderGeometry(4.6, 4.2, 0.18, 48), porcelain, 0, 0.09, 0));
  const ram = mesh(ramekinGeometry(3.6, 1.0), porcelain, 0, 0.18, 0); ram.castShadow = true; creme.add(ram);
  const topWhole = new THREE.MeshLambertMaterial({ map: caramelTop(false), emissive: 0x3a1a04 });
  const topCracked = new THREE.MeshLambertMaterial({ map: caramelTop(true), emissive: 0x3a1a04 });
  const crust = mesh(new THREE.CircleGeometry(3.25, 48), topWhole, 0, 1.06, 0); crust.rotation.x = -Math.PI / 2; creme.add(crust);
  // shards that jump when it cracks
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const sh = mesh(new THREE.CircleGeometry(rng.range(0.35, 0.6), 3), topWhole, Math.cos(i) * 0.6, 1.08, Math.sin(i) * 0.6);
    sh.rotation.x = -Math.PI / 2; sh.visible = false; creme.add(sh); shards.push(sh);
  }
  const spoon = teaspoon(silver, 1.15); creme.add(spoon);
  const spoonRest = { pos: new THREE.Vector3(2.4, 3.6, 2.4), rot: new THREE.Euler(-0.9, -0.6, 0.1) };
  spoon.position.copy(spoonRest.pos); spoon.rotation.copy(spoonRest.rot);
  let crackT = -1, isCracked = false;
  // the coffee cup with its steam, on the right
  const cup = new THREE.Group(); cup.position.set(x0 + 8, ty, -398); live.add(cup);
  cup.add(mesh(new THREE.CylinderGeometry(4.4, 3.6, 0.5, 40), porcelain, 0, 0.25, 0));
  const cupBody = mesh(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(2.3, 1.2), new THREE.Vector2(2.6, 3.0), new THREE.Vector2(2.7, 3.2), new THREE.Vector2(2.5, 3.2), new THREE.Vector2(2.4, 1.4)], 40), porcelain, 0, 0.5, 0);
  cupBody.castShadow = true; cup.add(cupBody);
  const coffee = mesh(new THREE.CircleGeometry(2.45, 32), charToon({ color: 0x4a2814, rim: 0.2, emissive: new THREE.Color(0x100604) }), 0, 3.3, 0); coffee.rotation.x = -Math.PI / 2; cup.add(coffee);
  const crema = mesh(new THREE.RingGeometry(1.6, 2.45, 32), charToon({ color: 0xa86a3a, rim: 0.2 }), 0, 3.31, 0); crema.rotation.x = -Math.PI / 2; cup.add(crema);
  cup.add(mesh(new THREE.TorusGeometry(1.0, 0.28, 10, 20, Math.PI * 1.3), porcelain, 2.7, 2.0, 0).rotateZ(-Math.PI / 2 - 0.3));
  const steam: THREE.Mesh[] = [];
  {
    const tex = (() => { const p = new Painter(64, 128, 123); const gr = p.g.createRadialGradient(32, 64, 0, 32, 64, 32); gr.addColorStop(0, 'rgba(255,250,240,0.7)'); gr.addColorStop(1, 'rgba(255,250,240,0)'); p.g.fillStyle = gr; p.g.fillRect(0, 0, 64, 128); return p.texture({ wrap: false }); })();
    const sm = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 5; i++) { const s = mesh(new THREE.PlaneGeometry(2.4, 5), sm, 0, 5 + i * 2.2, 0); steam.push(s); cup.add(s); }
  }
  // sugar cubes
  const sugar = toonE(0xfbf8f0, 0.25);
  for (const [x, z, r] of [[x0 + 3.2, -416, 0.4], [x0 + 4.6, -414, 1.2], [x0 + 3.8, -418.5, 2.1], [x0 - 2.8, -386, 0.8]] as const) {
    const c = box(1.5, 1.5, 1.5, sugar, x, ty + 0.75, z); c.rotation.y = r; c.castShadow = true; decor.add(c);
  }
  // the wine glass that trembles, as in the opening of the film
  const glass = new THREE.Group(); glass.position.set(x0 - 10, ty, -436); live.add(glass);
  {
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xe8f0e0, transparent: true, opacity: 0.35, emissive: 0x303830, depthWrite: false, side: THREE.DoubleSide });
    glass.add(mesh(new THREE.CylinderGeometry(2.0, 2.2, 0.15, 32), glassMat, 0, 0.08, 0));
    glass.add(mesh(new THREE.CylinderGeometry(0.18, 0.22, 5, 10), glassMat, 0, 2.6, 0));
    glass.add(mesh(new THREE.LatheGeometry([new THREE.Vector2(0.2, 0), new THREE.Vector2(1.8, 1.0), new THREE.Vector2(2.2, 3.0), new THREE.Vector2(2.0, 5.0)], 32), glassMat, 0, 5.0, 0));
    const wine = mesh(new THREE.LatheGeometry([new THREE.Vector2(0.2, 0), new THREE.Vector2(1.75, 1.0), new THREE.Vector2(2.05, 2.4), new THREE.Vector2(0.001, 2.4)], 32), charToon({ color: 0x7a0a1a, rim: 0.6, emissive: new THREE.Color(0x2a0208) }), 0, 5.05, 0);
    glass.add(wine);
  }
  // a plate of raspberries (Amélie wears them on her fingertips)
  {
    const plate = new THREE.Group(); plate.position.set(x0 + 9, ty, -432); decor.add(plate);
    plate.add(mesh(new THREE.CylinderGeometry(4.2, 3.8, 0.3, 40), porcelain, 0, 0.15, 0));
    const rasp = charToon({ color: 0xc81a3a, rim: 0.6, emissive: new THREE.Color(0x30040a) });
    for (let i = 0; i < 14; i++) { const a = rng.range(0, TAU), r = rng.range(0, 2.8); const b = mesh(new THREE.IcosahedronGeometry(0.62, 1), rasp, Math.cos(a) * r, 0.9 + (r < 1.4 ? 0.6 : 0), Math.sin(a) * r); b.scale.y = 1.2; b.castShadow = true; plate.add(b); }
  }
  // a folded newspaper and a postcard of the gnome (in front of the Eiffel tower)
  {
    const paper = new Painter(512, 360, 125).fill('#ece4d0');
    const pg = paper.g;
    pg.fillStyle = '#1e1a16'; pg.font = 'bold 54px Georgia, serif'; pg.textAlign = 'center'; pg.fillText('Le Petit Montmartrois', 256, 64);
    pg.fillRect(20, 80, 472, 3);
    pg.font = 'bold 26px Georgia, serif'; pg.fillText('UN NAIN DE JARDIN FAIT LE TOUR DU MONDE', 256, 120);
    for (let c = 0; c < 3; c++) for (let l = 0; l < 14; l++) pg.fillRect(24 + c * 160, 140 + l * 14, 140 - (l % 4 === 3 ? 50 : 0), 5);
    const np = mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshLambertMaterial({ map: paper.texture({ wrap: false }) }), x0 + 12, ty + 0.06, -446);
    np.rotation.x = -Math.PI / 2; np.rotation.z = 0.35; decor.add(np);
  }

  // ---------- light ----------
  const uIn = road.u(zF + 6), uMid = road.u(zA), uOut = road.u(SETS.cafe.z1);
  lights.add({ from: uIn, to: uMid + 0.004, pos: new THREE.Vector3(x0 - 3, y0 + H - 2, -275), color: 0xffc070, intensity: 40, distance: 30, flicker: 0.2 });
  lights.add({ from: uIn, to: uMid + 0.004, pos: new THREE.Vector3(x0 + 2, y0 + H - 2, -315), color: 0xffd08a, intensity: 40, distance: 30, flicker: 0.2 });
  lights.add({ from: uMid - 0.004, to: uOut, pos: new THREE.Vector3(x0 - 12, y0 + GH - 16, -392), color: 0xffd080, intensity: 220, distance: 70 });
  lights.add({ from: uMid - 0.004, to: uOut, pos: new THREE.Vector3(x0 + 10, y0 + GH - 18, -430), color: 0xffd8a0, intensity: 180, distance: 70 });

  optimize(arch);
  optimize(decor);

  const ride0 = { y: 0 };
  void ride0; void lerp; void smoothstep; void css; void PAL;
  return {
    id: 'cafe', group: g, show: [road.u(SETS.street.z0 - 120), road.u(SETS.cafe.z1)], occluders: [arch], subjects: [],
    floor: (x, z) => {
      if (z > CAFE.arch) return y0;
      // the ramp and the table
      if (Math.abs(x - x0) < T.hw + 1) {
        if (z <= T.z0) return ty;
        if (z < -350) return y0 + (T.y - Y.cafe) * clamp((-350 - z) / (-350 - T.z0), 0, 1);
      }
      return y0;
    },
    spots: {
      bar: new THREE.Vector3(barX - 1.35, y0 + 0.35, -290), barYaw: Math.PI / 2,
      tabac: new THREE.Vector3(barX - 1.6, y0 + 0.35, barZ0 + 3.6), tabacYaw: Math.PI / 2,
      joseph: new THREE.Vector3(x0 + HW - 4.9, y0, zF - 8 - 3 * 12 - 2.4), josephYaw: Math.PI / 2,
      espresso: new THREE.Vector3(barX - 0.3, y0 + 1.62, barZ0 - 18),
    },
    creme: {
      group: creme,
      crack() { if (crackT < 0 && !isCracked) crackT = 0; },
      cracked: () => isCracked,
    },
    glass,
    update(dt, t) {
      // steam curls up from the coffee
      steam.forEach((s, i) => {
        const k = ((t * 0.25 + i / steam.length) % 1);
        s.position.set(Math.sin(t * 0.7 + i * 1.7) * 0.8 * k, 4 + k * 11, Math.cos(t * 0.5 + i) * 0.5 * k);
        s.scale.setScalar(0.6 + k * 1.4);
        (s.material as THREE.MeshBasicMaterial).opacity = 0.32;
        s.lookAt(ctx.camera.position); s.rotation.x = 0; s.rotation.z = 0;
      });
      // the dancing glass: a nervous tremble every few seconds
      const tremble = Math.max(0, Math.sin(t * 0.9)) ** 8;
      glass.rotation.z = Math.sin(t * 31) * 0.025 * tremble;
      glass.rotation.x = Math.cos(t * 27) * 0.02 * tremble;
      glass.position.x = x0 - 10 + Math.sin(t * 0.37) * 0.4;
      // the spoon: it hovers, and when asked it comes down and cracks the caramel
      if (crackT >= 0) {
        crackT += dt;
        const down = crackT < 0.5 ? smoothstep(0, 0.5, crackT) : 1 - smoothstep(0.9, 2.0, crackT);
        spoon.position.set(lerp(spoonRest.pos.x, 0.3, down), lerp(spoonRest.pos.y, 1.4, down), lerp(spoonRest.pos.z, 0.4, down));
        spoon.rotation.set(lerp(spoonRest.rot.x, -0.5, down), lerp(spoonRest.rot.y, -0.4, down), spoonRest.rot.z);
        if (crackT > 0.5 && !isCracked) {
          isCracked = true; crust.material = topCracked;
          shards.forEach((s, i) => { s.visible = true; s.userData.v = new THREE.Vector3(Math.cos(i * 0.9) * 1.6, 3 + (i % 3), Math.sin(i * 0.9) * 1.6); s.userData.p = s.position.clone(); });
        }
        if (crackT > 2.2) crackT = -1;
      } else {
        spoon.position.y = spoonRest.pos.y + Math.sin(t * 1.3) * 0.15;
      }
      for (const s of shards) {
        if (!s.visible) continue;
        const v = s.userData.v as THREE.Vector3;
        v.y -= 14 * dt;
        s.position.addScaledVector(v, dt);
        s.rotation.z += dt * 5;
        if (s.position.y < 1.08) { s.position.y = 1.08; v.set(0, 0, 0); }
      }
    },
  };
}
