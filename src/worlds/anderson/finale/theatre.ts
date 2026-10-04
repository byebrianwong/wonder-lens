import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, glow, mesh, sphere, toon } from '../../../engine/Builders';
import { Painter, boxUV, repeatUV } from '../../../engine/Paint';
import { Rng, TAU } from '../../../engine/math';
import { damask } from '../../amelie/textures';
import { css } from '../textures';
import { FUTURA } from '../film';
import { optimize } from '../common';
import { AISLE, FLOOR, HALL, PIT, PROSC, STAGE, STAGE_Y } from './plan';

/*
 * The theatre of the curtain call: a gilded opera house at night, symmetrical about the aisle. The stalls,
 * filled with an audience in the films' hats; two tiers of boxes on each side; three chandeliers; the
 * orchestra pit with its players; the proscenium arch with the Crossed Keys at its crown; the red curtain,
 * which flies up as the train comes down the aisle; the stage with its wings, footlights and a painted night
 * sky at the back.
 */

const GOLD = 0xd8a840, RED = 0x8a1424, DEEP = 0x5a0e1a;

/** Velvet: deep red with a soft nap, darker in the creases. One tile = 1.5 x 1.5 units. */
function velvet(color = RED, seed = 3) {
  const p = new Painter(128, 128, seed).fill(css(color));
  p.dabs({ n: 70, colors: [css(color, 1.15), css(color, 0.82)], r: [6, 24], alpha: [0.08, 0.2] });
  p.lines({ n: 50, colors: [css(color, 0.75), css(color, 1.2)], alpha: [0.05, 0.14], width: [1, 2], vertical: true, wobble: 1 });
  return p.texture({ repeat: [1, 1] });
}

/** Gilded mouldings: gold with bands of beading and darker grooves, running along the texture's u. */
function gilt(seed = 5) {
  const p = new Painter(256, 64, seed).fill(css(GOLD));
  const g = p.g;
  g.fillStyle = css(GOLD, 0.62); g.fillRect(0, 12, 256, 4); g.fillRect(0, 48, 256, 4);
  g.fillStyle = css(GOLD, 1.3);
  for (let x = 4; x < 256; x += 10) { g.beginPath(); g.arc(x, 32, 3.4, 0, TAU); g.fill(); }
  g.fillStyle = css(GOLD, 1.25); g.fillRect(0, 4, 256, 3); g.fillRect(0, 56, 256, 3);
  p.dabs({ n: 40, colors: [css(GOLD, 0.8), css(GOLD, 1.2)], r: [4, 14], alpha: [0.06, 0.15] });
  return p.texture({ repeat: [1, 1] });
}

/** The red curtain: vertical folds, lit from the front, with a gold fringe at the hem. */
function curtainCloth() {
  const W = 512, H = 512;
  const p = new Painter(W, H, 11).fill(css(RED));
  const g = p.g;
  for (let x = 0; x < W; x++) {
    const f = 0.5 + 0.5 * Math.cos((x / W) * TAU * 8);
    g.fillStyle = `rgba(0,0,0,${(1 - f) * 0.45})`; g.fillRect(x, 0, 1, H);
    if (f > 0.85) { g.fillStyle = `rgba(255,140,140,${(f - 0.85) * 0.6})`; g.fillRect(x, 0, 1, H); }
  }
  p.vgrad([[0, 'rgba(0,0,0,0.35)'], [0.3, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.1)']]);
  g.fillStyle = css(GOLD); g.fillRect(0, H - 28, W, 10);
  for (let x = 2; x < W; x += 6) { g.fillStyle = css(GOLD, x % 12 ? 0.85 : 1.1); g.fillRect(x, H - 18, 3, 18); }
  const t = p.texture();
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The back cloth: a night sky with a crescent moon, stars and a painted line of Alps along the bottom. */
function nightSky() {
  const W = 2048, H = 768;
  const p = new Painter(W, H, 17);
  p.vgrad([[0, '#0c1236'], [0.55, '#2a2f6a'], [0.85, '#6a4a7a'], [1, '#c87a7a']]);
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 700; i++) {
    const x = rng.range(0, W), y = rng.range(0, H * 0.7), r = rng.range(0.6, 2.4);
    g.fillStyle = `rgba(255,250,230,${rng.range(0.4, 1)})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  // a few big painted stars with points, like a stage cloth
  for (let i = 0; i < 18; i++) {
    const x = rng.range(80, W - 80), y = rng.range(40, H * 0.55), r = rng.range(8, 16);
    g.fillStyle = '#fff4c8'; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  // the moon
  g.fillStyle = '#fff2c4'; g.beginPath(); g.arc(W * 0.5, H * 0.22, 70, 0, TAU); g.fill();
  g.fillStyle = '#0e1440'; g.beginPath(); g.arc(W * 0.5 + 34, H * 0.2, 64, 0, TAU); g.fill();
  // the Alps, cut flat like a ground row
  g.fillStyle = '#3a3a72';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 64) g.lineTo(x, H * 0.72 - Math.abs(Math.sin(x * 0.006)) * H * 0.18 - rng.range(0, 30));
  g.lineTo(W, H); g.closePath(); g.fill();
  g.fillStyle = '#e8e4f4';
  for (let x = 0; x <= W; x += 64) { const y = H * 0.72 - Math.abs(Math.sin(x * 0.006)) * H * 0.18; g.beginPath(); g.moveTo(x - 18, y + 26); g.lineTo(x, y - 4); g.lineTo(x + 18, y + 26); g.closePath(); g.fill(); }
  return p.texture();
}

/** A wing flat: a stand of snowy firs, cut out (transparent round them), painted flat like scenery. */
function firFlat(seed: number) {
  const W = 256, H = 512;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  for (let k = 0; k < 4; k++) {
    const x = 30 + k * 62 + rng.range(-12, 12), base = H - rng.range(0, 30), h = rng.range(300, 470), w = h * 0.36;
    g.fillStyle = css(0x2a5a5a, rng.range(0.8, 1.1));
    g.beginPath(); g.moveTo(x, base - h);
    for (let t = 1; t <= 6; t++) { const y = base - h + (h * t) / 6, ww = (w * t) / 6; g.lineTo(x + ww, y); g.lineTo(x + ww * 0.55, y); }
    for (let t = 6; t >= 1; t--) { const y = base - h + (h * t) / 6, ww = (w * t) / 6; g.lineTo(x - ww * 0.55, y); g.lineTo(x - ww, y); }
    g.closePath(); g.fill();
    // snow on each tier
    g.fillStyle = '#f4f0fa';
    for (let t = 1; t <= 6; t++) { const y = base - h + (h * t) / 6, ww = (w * t) / 6; g.beginPath(); g.moveTo(x - ww * 0.9, y - 4); g.quadraticCurveTo(x, y - h / 14, x + ww * 0.9, y - 4); g.lineTo(x + ww * 0.6, y - 10); g.quadraticCurveTo(x, y - h / 10, x - ww * 0.6, y - 10); g.closePath(); g.fill(); }
    g.fillStyle = '#4a3020'; g.fillRect(x - 5, base - 6, 10, 20);
  }
  return p.texture();
}

/** A cloud border: a row of flat painted clouds, cut out. */
function cloudBorder(seed: number) {
  const W = 1024, H = 192;
  const p = new Painter(W, H, seed);
  const g = p.g, rng = p.rng;
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 115 + rng.range(-20, 20), y = rng.range(80, 120);
    g.fillStyle = '#c8d0ec';
    for (const [dx, dy, r] of [[-40, 18, 36], [0, 0, 52], [44, 12, 40], [80, 26, 28], [-74, 30, 24]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, TAU); g.fill(); }
    g.fillStyle = '#9aa4d0'; g.fillRect(x - 100, y + 40, 200, 30);
  }
  g.clearRect(0, 150, W, H);
  return p.texture();
}

/** A seat in the stalls: a velvet back and cushion on a gilt-edged frame. Origin at the floor, facing -z (the stage). */
function seatGeometry() {
  const parts = [
    new THREE.BoxGeometry(0.58, 0.12, 0.5).translate(0, 0.46, 0),
    new THREE.BoxGeometry(0.58, 0.7, 0.1).translate(0, 0.86, 0.24),
    new THREE.BoxGeometry(0.06, 0.62, 0.52).translate(-0.31, 0.31, 0),
    new THREE.BoxGeometry(0.06, 0.62, 0.52).translate(0.31, 0.31, 0),
  ];
  return mergeGeometries(parts.map((p) => p.toNonIndexed()), false)!;
}

/** A seated member of the audience, seen from behind: shoulders and a head. Facing -z. */
function sitterGeometry() {
  const body = new THREE.CylinderGeometry(0.17, 0.22, 0.6, 8).translate(0, 0.86, 0.06);
  const head = new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.32, 0.04);
  return mergeGeometries([body.toNonIndexed(), head.toNonIndexed()], false)!;
}

export interface Theatre {
  group: THREE.Group;
  /** the red curtain; `raise(k)` flies it up (0 down, 1 out of sight) */
  raise(k: number): void;
  /** footlights and chandeliers brighten as the curtain call starts (0..1) */
  setLights(k: number): void;
  /** the conductor's baton arm, for a cue */
  conductor: THREE.Group;
  conduct(): void;
  update(dt: number, t: number): void;
  occluders: THREE.Object3D[];
}

export function buildTheatre(rng: Rng): Theatre {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const add = (...o: THREE.Object3D[]) => { statics.add(...o); };

  const velvetMat = new THREE.MeshLambertMaterial({ map: velvet() });
  const giltTex = gilt();
  const giltMat = new THREE.MeshLambertMaterial({ map: giltTex, emissive: 0x3a2808, emissiveIntensity: 0.6 });
  const goldPlain = toon(GOLD, { emissive: new THREE.Color(0x4a3008) });
  const wallMat = new THREE.MeshLambertMaterial({ map: damask(0x7a1626, 0xa8303e, 41) });
  const cream = toon(0xf4e6d0);
  const dark = toon(0x2a1418);
  const carpetTex = new Painter(128, 128, 21).fill(css(0x9a1a2a)).dabs({ n: 60, colors: [css(0xb02a38), css(0x7a1220)], r: [4, 16], alpha: [0.1, 0.25] }).texture({ repeat: [1, 1] });
  const carpet = new THREE.MeshLambertMaterial({ map: carpetTex });

  const L = HALL.back - HALL.front, midZ = (HALL.back + HALL.front) / 2, W = HALL.halfW;

  // ---------- the auditorium's shell ----------
  add(mesh(boxUV(new THREE.BoxGeometry(W * 2, 0.4, L + 2), 2, 2), carpet, 0, FLOOR - 0.2, midZ));
  // a gold-bordered runner down the aisle, under the track
  {
    const runner = new Painter(64, 256, 23).fill(css(0xb8202e));
    runner.g.fillStyle = css(GOLD); runner.g.fillRect(0, 0, 6, 256); runner.g.fillRect(58, 0, 6, 256);
    const m = mesh(repeatUV(new THREE.PlaneGeometry(AISLE * 2 - 0.2, L), 1, L / 3), new THREE.MeshLambertMaterial({ map: runner.texture({ repeat: [1, 1] }) }), 0, FLOOR + 0.01, midZ);
    m.rotation.x = -Math.PI / 2; add(m);
  }
  for (const s of [-1, 1]) {
    // side walls: damask above a panelled dado
    add(mesh(boxUV(new THREE.BoxGeometry(0.5, HALL.ceiling, L), 3, 3), wallMat, s * (W + 0.25), FLOOR + HALL.ceiling / 2, midZ));
    add(box(0.3, 1.4, L, toon(0x5a1a20), s * (W - 0.1), FLOOR + 0.7, midZ));
  }
  add(mesh(boxUV(new THREE.BoxGeometry(W * 2, HALL.ceiling, 0.5), 3, 3), wallMat, 0, FLOOR + HALL.ceiling / 2, HALL.back + 0.25));
  // the doors the train came in by: tall, padded red leather with brass studs, under a lit EXIT sign
  for (const s of [-1, 1]) {
    add(box(2.6, 6.4, 0.2, velvetMat, s * 1.35, FLOOR + 3.2, HALL.back - 0.05));
    add(sphere(0.12, goldPlain, s * 0.3, FLOOR + 3.2, HALL.back - 0.2, 8, 6));
  }
  add(box(6.2, 0.5, 0.4, giltMat, 0, FLOOR + 6.7, HALL.back - 0.1));
  for (const s of [-1, 1]) add(box(0.4, 7, 0.4, giltMat, s * 2.95, FLOOR + 3.5, HALL.back - 0.1));
  {
    const exit = new Painter(256, 64, 1).fill('#2a0a0a');
    exit.g.fillStyle = '#ff6a5a'; exit.g.font = `bold 40px ${FUTURA}`; exit.g.textAlign = 'center'; exit.g.textBaseline = 'middle'; exit.g.fillText('E X I T', 128, 34);
    add(mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ map: exit.texture(), color: new THREE.Color(1.6, 1.6, 1.6) }), 0, FLOOR + 7.4, HALL.back - 0.32));
  }
  // the ceiling: coffered, cream and gold, with a painted rose round each chandelier
  {
    const ceil = new Painter(256, 256, 31).fill(css(0xf0dcc0));
    const g = ceil.g;
    g.strokeStyle = css(GOLD); g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
    g.strokeStyle = css(GOLD, 0.8); g.lineWidth = 3; g.strokeRect(28, 28, 200, 200);
    g.fillStyle = css(0xe8c4b8); g.fillRect(34, 34, 188, 188);
    g.fillStyle = css(GOLD, 1.1); for (const [x, y] of [[128, 20], [128, 236], [20, 128], [236, 128]]) { g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); }
    const m = mesh(repeatUV(new THREE.PlaneGeometry(W * 2, L), W / 4, L / 8), new THREE.MeshLambertMaterial({ map: ceil.texture({ repeat: [1, 1] }) }), 0, FLOOR + HALL.ceiling, midZ);
    m.rotation.x = Math.PI / 2; add(m);
  }

  // ---------- two tiers of boxes along each side wall, and a circle across the back ----------
  for (const tier of [0, 1]) {
    const y = FLOOR + 7 + tier * 6;
    for (const s of [-1, 1]) {
      const x = s * (W - 2.2);
      // the gilded parapet, curving out at each box
      for (let z = HALL.back - 8; z > HALL.front + 8; z -= 6) {
        const front = mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.2, 14, 1, true, s > 0 ? Math.PI : 0, Math.PI), giltMat, x + s * 1.6, y, z - 3);
        front.scale.set(0.55, 1, 1.15); add(front);
        add(box(0.4, 4.6, 0.4, giltMat, x - s * 0.5, y + 2.3, z - 0.1));
        // red drapes swagged back in each box
        add(box(0.12, 3.2, 1.2, velvetMat, x - s * 0.3, y + 3, z - 0.8), box(0.12, 3.2, 1.2, velvetMat, x - s * 0.3, y + 3, z - 5.2));
      }
      add(box(4.2, 0.3, L - 14, toon(0x6a1a22), x + s * 0.4, y - 0.7, midZ));
      // the boxes' back walls are lit warm
      add(box(0.1, 4.5, L - 14, toon(0xc8504a, { emissive: new THREE.Color(0x401010) }), s * (W - 0.05), y + 2.2, midZ));
    }
    // the circle across the back
    add(mesh(boxUV(new THREE.BoxGeometry(W * 2 - 6, 1.2, 0.4), 2, 1.2), giltMat, 0, y, HALL.back - 4.5));
    add(box(W * 2 - 6, 0.3, 4.4, toon(0x6a1a22), 0, y - 0.7, HALL.back - 2.4));
  }

  // ---------- seats and the audience ----------
  {
    const seatGeo = seatGeometry();
    const seatPl: THREE.Matrix4[] = [], sitPl: THREE.Matrix4[] = [], sitCol: THREE.Color[] = [];
    const hats: Record<string, THREE.Matrix4[]> = { beanie: [], scout: [], pill: [], ears: [] };
    const tmp = new THREE.Object3D();
    const coats = [0x2a2a3a, 0x3a2a2a, 0x2a3a3a, 0x4a3a2a, 0x5a2a3a, 0x2a2a2a, 0x3a3a4a, 0x6a4a5a];
    for (let z = HALL.front + 5; z < HALL.back - 8; z += 1.15) {
      for (const s of [-1, 1]) for (let x = AISLE + 0.4; x < W - 4.6; x += 0.7) {
        const sx = s * x;
        tmp.position.set(sx, FLOOR, z); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
        seatPl.push(tmp.matrix.clone());
        if (rng.next() < 0.55) {
          tmp.position.set(sx, FLOOR, z + 0.02); tmp.scale.setScalar(rng.range(0.92, 1.08)); tmp.updateMatrix();
          sitPl.push(tmp.matrix.clone());
          sitCol.push(new THREE.Color(rng.pick(coats)));
          const r = rng.next();
          const hatAt = (key: string) => { tmp.position.y += 1.38 * tmp.scale.y; tmp.updateMatrix(); hats[key].push(tmp.matrix.clone()); };
          if (r < 0.04) hatAt('beanie'); else if (r < 0.07) hatAt('scout'); else if (r < 0.1) hatAt('pill'); else if (r < 0.12) hatAt('ears');
        }
      }
    }
    const seats = new THREE.InstancedMesh(seatGeo, velvetMat, seatPl.length);
    seatPl.forEach((m, i) => seats.setMatrixAt(i, m));
    seats.computeBoundingSphere();
    group.add(seats);
    const sitMat = toon(0xffffff);
    const sitters = new THREE.InstancedMesh(sitterGeometry(), sitMat, sitPl.length);
    sitPl.forEach((m, i) => { sitters.setMatrixAt(i, m); sitters.setColorAt(i, sitCol[i]); });
    sitters.computeBoundingSphere();
    group.add(sitters);
    const hatGeo: Record<string, THREE.BufferGeometry> = {
      beanie: new THREE.SphereGeometry(0.13, 10, 6, 0, TAU, 0, Math.PI / 2),
      scout: mergeGeometries([new THREE.CylinderGeometry(0.24, 0.24, 0.02, 12).toNonIndexed(), new THREE.ConeGeometry(0.12, 0.16, 4).translate(0, 0.08, 0).toNonIndexed()], false)!,
      pill: new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12).translate(0, 0.02, 0),
      ears: mergeGeometries([new THREE.ConeGeometry(0.05, 0.14, 4).translate(-0.07, 0.06, 0).toNonIndexed(), new THREE.ConeGeometry(0.05, 0.14, 4).translate(0.07, 0.06, 0).toNonIndexed()], false)!,
    };
    const hatCol: Record<string, number> = { beanie: 0xc8202a, scout: 0xb89a5a, pill: 0x5a2a6a, ears: 0xd9782f };
    for (const k of Object.keys(hats)) {
      if (!hats[k].length) continue;
      const im = new THREE.InstancedMesh(hatGeo[k], toon(hatCol[k]), hats[k].length);
      hats[k].forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      group.add(im);
    }
  }

  // ---------- chandeliers: tiers of glowing bulbs and crystal drops ----------
  const bulbs = glow(0xfff0c8, 1.2);
  for (const z of [HALL.back - 22, midZ, HALL.front + 22]) {
    const c = new THREE.Group();
    const big = z === midZ ? 1.35 : 1;
    c.add(cyl(0.05, 0.05, 4, goldPlain, 0, 2, 0, 6));
    for (const [r, y, n] of [[2.4, 0, 20], [1.7, -0.9, 14], [1.0, -1.7, 9]] as const) {
      const ring = mesh(new THREE.TorusGeometry(r, 0.06, 6, 32), goldPlain, 0, y, 0); ring.rotation.x = Math.PI / 2; c.add(ring);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        c.add(sphere(0.12, bulbs, Math.cos(a) * r, y + 0.18, Math.sin(a) * r, 8, 6));
        const drop = mesh(new THREE.ConeGeometry(0.07, 0.4, 5), toon(0xf0f4ff, { emissive: new THREE.Color(0x8890a0) }), Math.cos(a + 0.15) * r, y - 0.3, Math.sin(a + 0.15) * r);
        drop.rotation.x = Math.PI; c.add(drop);
      }
    }
    c.add(sphere(0.35, goldPlain, 0, -2.3, 0, 10, 8));
    c.scale.setScalar(big);
    c.position.set(0, FLOOR + HALL.ceiling - 5 * big, z);
    statics.add(c);
  }

  // ---------- the orchestra pit: a rail, music stands with little lamps, the players, the conductor ----------
  add(box(W * 2, 1.2, 0.3, giltMat, 0, FLOOR + 0.6, PIT.z0 + 0.15));
  add(mesh(boxUV(new THREE.BoxGeometry(W * 2, 0.3, PIT.z0 - PIT.z1), 2, 2), toon(0x2a1a14), 0, PIT.floor - 0.15, (PIT.z0 + PIT.z1) / 2));
  const lampMat = glow(0xffe0a0, 1.3);
  const players = new THREE.Group();
  {
    const pr = new Rng(77);
    for (let x = -W + 3; x < W - 3; x += 2.1) {
      if (Math.abs(x) < 4.2) continue;
      const z = (PIT.z0 + PIT.z1) / 2 + pr.range(-1.5, 1.5);
      const p = new THREE.Group();
      p.add(cyl(0.22, 0.3, 0.8, toon(0x1a1a22), 0, 0.9, 0, 8), sphere(0.17, toon(0xe8c8a8), 0, 1.5, 0, 10, 8));
      // a cello or a violin
      if (pr.next() < 0.4) { const cello = mesh(new THREE.SphereGeometry(0.32, 10, 8), toon(0x8a4a20), 0.25, 0.9, -0.3); cello.scale.set(0.8, 1.4, 0.4); p.add(cello, cyl(0.02, 0.02, 1.2, dark, 0.25, 1.7, -0.3, 4)); }
      else p.add(box(0.36, 0.14, 0.1, toon(0x9a5a2a), 0.12, 1.32, -0.18));
      p.add(cyl(0.02, 0.02, 1.0, dark, 0, 0.5, -0.7, 4), box(0.5, 0.36, 0.04, cream, 0, 1.1, -0.72), sphere(0.06, lampMat, 0, 1.36, -0.66, 6, 5));
      p.position.set(x, PIT.floor, z);
      p.rotation.y = Math.PI + pr.range(-0.2, 0.2);
      players.add(p);
    }
  }
  statics.add(players);
  // the conductor on a podium beside the ramp, facing the stage, baton up
  const conductor = new THREE.Group();
  const batonArm = new THREE.Group();
  {
    conductor.add(cyl(0.6, 0.6, 0.6, toon(0x5a1a20), 0, 0.3, 0, 12));
    conductor.add(cyl(0.2, 0.26, 1.0, toon(0x111118), 0, 1.1, 0, 8), sphere(0.18, toon(0xe8c8a8), 0, 1.8, 0, 10, 8));
    // a shock of white hair
    const hair = sphere(0.21, toon(0xf4f4f0), 0, 1.86, 0.03, 10, 8); hair.scale.set(1.15, 0.9, 1.1); conductor.add(hair);
    batonArm.add(cyl(0.05, 0.05, 0.6, toon(0x111118), 0, -0.3, 0, 6), cyl(0.008, 0.008, 0.5, cream, 0, -0.75, 0, 4));
    batonArm.position.set(0.24, 1.5, 0);
    batonArm.rotation.set(-2.2, 0, -0.4);
    conductor.add(batonArm);
    conductor.position.set(4.6, PIT.floor, PIT.z0 - 2);
    conductor.rotation.y = Math.PI;
  }
  group.add(conductor);

  // ---------- the proscenium arch ----------
  {
    const P = PROSC, z = P.z, top = STAGE_Y + P.height;
    const outerW = W, outerTop = FLOOR + HALL.ceiling;
    // the wall the arch is cut through, in deep red
    const shape = new THREE.Shape();
    shape.moveTo(-outerW, FLOOR); shape.lineTo(outerW, FLOOR); shape.lineTo(outerW, outerTop); shape.lineTo(-outerW, outerTop); shape.closePath();
    // the opening, wound the other way round from the outline so it cuts a hole
    const hole = new THREE.Path();
    hole.moveTo(-P.halfW, STAGE_Y - 0.6); hole.lineTo(-P.halfW, top - 3);
    hole.quadraticCurveTo(-P.halfW, top, -P.halfW + 4, top);
    hole.lineTo(P.halfW - 4, top);
    hole.quadraticCurveTo(P.halfW, top, P.halfW, top - 3);
    hole.lineTo(P.halfW, STAGE_Y - 0.6);
    hole.closePath();
    shape.holes.push(hole);
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, curveSegments: 10 });
    wallGeo.translate(0, 0, z - 0.6);
    // extruded shapes get UVs in world units; one damask tile per 3 units
    add(mesh(repeatUV(wallGeo, 1 / 3, 1 / 3), wallMat));
    // gilded frame round the opening: pilasters and a deep moulded lintel
    for (const s of [-1, 1]) {
      add(mesh(boxUV(new THREE.BoxGeometry(1.6, top - STAGE_Y + 1.5, 1.6), 1.5, 1.5), giltMat, s * (P.halfW + 0.8), (top + STAGE_Y - 1.5) / 2, z + 0.4));
      add(box(2.2, 0.6, 2.0, giltMat, s * (P.halfW + 0.8), STAGE_Y - 1.2, z + 0.4), box(2.2, 0.6, 2.0, giltMat, s * (P.halfW + 0.8), top - 0.1, z + 0.4));
      // comedy and tragedy masks on the pilasters
      const mask = new THREE.Group();
      const face = sphere(0.9, goldPlain, 0, 0, 0, 14, 10); face.scale.set(0.8, 1, 0.35); mask.add(face);
      for (const e of [-1, 1]) mask.add(sphere(0.16, dark, e * 0.28, 0.2, 0.3, 8, 6));
      const mouth = mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 12, Math.PI), dark, 0, -0.35, 0.3);
      mouth.rotation.z = s > 0 ? 0 : Math.PI; mouth.position.y = s > 0 ? -0.45 : -0.25; mask.add(mouth);
      mask.position.set(s * (P.halfW + 0.8), top - 3, z + 1.3);
      add(mask);
    }
    const lintel = mesh(boxUV(new THREE.BoxGeometry(P.halfW * 2 + 4, 2.4, 1.8), 2, 2), giltMat, 0, top + 1.2, z + 0.4);
    add(lintel);
    // the crown: the Crossed Keys on a cartouche
    const crest = new THREE.Group();
    const disc = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 28), goldPlain); disc.rotation.x = Math.PI / 2; crest.add(disc);
    const inner = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.32, 28), toon(RED)); inner.rotation.x = Math.PI / 2; crest.add(inner);
    for (const s of [-1, 1]) {
      const key = new THREE.Group();
      key.add(box(0.18, 1.7, 0.12, goldPlain, 0, 0, 0), mesh(new THREE.TorusGeometry(0.26, 0.07, 6, 14), goldPlain, 0, 1.0, 0), box(0.36, 0.12, 0.12, goldPlain, 0.18, -0.72, 0), box(0.26, 0.12, 0.12, goldPlain, 0.13, -0.48, 0));
      key.rotation.z = s * 0.62; key.position.z = 0.22; crest.add(key);
    }
    crest.position.set(0, top + 3.6, z + 1.0);
    add(crest);
    // the pelmet: a deep velvet border with swags and a gold fringe, just behind the arch
    const pel = mesh(repeatUV(new THREE.PlaneGeometry(P.halfW * 2, 2.6), 6, 1), new THREE.MeshLambertMaterial({ map: curtainCloth(), side: THREE.DoubleSide }), 0, top - 1.1, z - 0.7);
    add(pel);
  }

  // ---------- the stage: boards, footlights, wings, borders, the back cloth ----------
  {
    const S = STAGE, depth = S.front - S.back, mz = (S.front + S.back) / 2;
    const boards = new Painter(128, 256, 33).fill(css(0x6a4a30));
    for (let i = 0; i < 8; i++) { boards.g.fillStyle = css(0x6a4a30, boards.rng.range(0.85, 1.12)); boards.g.fillRect(i * 16 + 1, 0, 14, 256); }
    add(mesh(boxUV(new THREE.BoxGeometry(S.halfW * 2, 0.4, depth), 2, 4), new THREE.MeshLambertMaterial({ map: boards.texture({ repeat: [1, 1] }) }), 0, STAGE_Y - 0.2, mz));
    // the apron's face over the pit, dark red, gilt-edged
    add(box(PROSC.halfW * 2 + 6, STAGE_Y - PIT.floor, 0.3, toon(DEEP), 0, (STAGE_Y + PIT.floor) / 2, S.front + 0.1));
    add(box(PROSC.halfW * 2 + 6, 0.16, 0.36, giltMat, 0, STAGE_Y - 0.05, S.front + 0.12));
    // a pair of black legs and a border just behind the arch, masking the wings
    const black = toon(0x161214);
    for (const s of [-1, 1]) add(box(5, 20, 0.2, black, s * (PROSC.halfW + 1.5), STAGE_Y + 10, S.front - 6));
    add(box(PROSC.halfW * 2 + 8, 3, 0.2, black, 0, STAGE_Y + PROSC.height + 0.6, S.front - 6));
    // the stage house in deep night blue, so the space round the set reads as night sky, not a void
    const night = toon(0x161a34);
    for (const s of [-1, 1]) add(box(0.4, 34, depth, night, s * S.halfW, STAGE_Y + 15, mz));
    add(box(S.halfW * 2, 0.4, depth, night, 0, STAGE_Y + 30, mz));
    // painted wing flats of snowy firs, three on each side, and two cloud borders overhead
    const firMats = [0, 1].map((k) => new THREE.MeshLambertMaterial({ map: firFlat(51 + k), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x101828 }));
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.PlaneGeometry(9, 18), firMats[k % 2], s * (PROSC.halfW + 1 - k * 1.2 + 2), STAGE_Y + 9, S.front - 10 - k * 15);
      f.rotation.y = -s * 0.25;
      add(f);
    }
    const cloudMat = new THREE.MeshLambertMaterial({ map: cloudBorder(57), alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x181c34 });
    for (const [z, y] of [[S.front - 12, STAGE_Y + PROSC.height - 1.5], [S.front - 34, STAGE_Y + PROSC.height + 1]]) add(mesh(new THREE.PlaneGeometry(PROSC.halfW * 2 + 12, 5), cloudMat, 0, y, z));
    // the back cloth hangs as a cyclorama: a curved sky that wraps round the back and both sides of the set
    const cycGeo = new THREE.CylinderGeometry(29.5, 29.5, 32, 40, 1, true, Math.PI - 1.35, 2.7);
    const cyc = mesh(cycGeo, new THREE.MeshBasicMaterial({ map: nightSky(), color: new THREE.Color(0.9, 0.9, 0.95), side: THREE.BackSide }), 0, STAGE_Y + 15, -2622);
    add(cyc);
  }

  // footlights along the stage's edge: little shells with bulbs
  const foot = glow(0xffe8b0, 1.1);
  for (let x = -PROSC.halfW + 1; x <= PROSC.halfW - 1; x += 1.3) {
    if (Math.abs(x) < 3.6) continue;
    add(box(0.5, 0.2, 0.3, giltMat, x, STAGE_Y + 0.1, STAGE.front - 0.3));
    add(sphere(0.1, foot, x, STAGE_Y + 0.22, STAGE.front - 0.36, 6, 5));
  }

  statics.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.receiveShadow = true; } });
  optimize(statics);

  // ---------- the curtain (it moves, so it is not merged) ----------
  const curtainGeo = new THREE.PlaneGeometry(PROSC.halfW * 2 + 2, PROSC.height + 2, 64, 1);
  {
    const pos = curtainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / (PROSC.halfW * 2 + 2)) * TAU * 16) * 0.22);
    curtainGeo.computeVertexNormals();
  }
  const curtain = mesh(repeatUV(curtainGeo, 2, 1), new THREE.MeshLambertMaterial({ map: curtainCloth(), side: THREE.DoubleSide }), 0, STAGE_Y + (PROSC.height + 2) / 2 - 0.5, PROSC.z - 1.2);
  group.add(curtain);
  const curtainY0 = curtain.position.y;

  let conductT = 9;
  return {
    group, conductor, occluders: [],
    raise(k) {
      curtain.position.y = curtainY0 + k * (PROSC.height + 3);
      curtain.visible = k < 0.999;
    },
    setLights(k) {
      bulbs.color.setScalar(1.0 + k * 0.5);
      foot.color.setScalar(0.7 + k * 0.9);
    },
    conduct() { conductT = 0; },
    update(dt, t) {
      conductT += dt;
      const busy = conductT < 6 ? 1 : 0.35;
      batonArm.rotation.x = -2.2 + Math.sin(t * 5.2) * 0.35 * busy;
      batonArm.rotation.z = -0.4 + Math.cos(t * 2.6) * 0.3 * busy;
    },
  };
}
