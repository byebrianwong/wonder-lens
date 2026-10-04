import * as THREE from 'three';
import { box, cyl, mesh, roofGeometry, sphere } from '../../../engine/Builders';
import { boxUV, repeatUV } from '../../../engine/Paint';
import { fluffyTree } from '../../../engine/Foliage';
import { envelope, Spring } from '../../../engine/Rig';
import { Rng, TAU, clamp, damp, lerp } from '../../../engine/math';
import { optimize } from '../common';
import { bark, planks } from '../textures';
import { texMat } from '../kit';
import { CAMP, PY } from './plan';
import { MK, boardSign, canvasCloth, islandMap, troopPennant, usFlag } from './textures';
import { KID, Troop, bake, clipboard, flat, lighten, scoutMasterWard, unify } from './figures';

/*
 * Camp Ivanhoe, Khaki Scouts of North America, Troop 55: a log gate across the track with the camp's name,
 * canvas tents on platforms in exact rows, the parade ground and its flagpole on the right where the troop
 * marches round in a column and Scout Master Ward stands with his clipboard, the treehouse at an alarming
 * height up one tall pine, and the lookout tower. Sam's tent is the one with the hole cut in its back.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface Camp {
  group: THREE.Group;
  /** the troop's photo anchor (follows the column) */
  troopAnchor: THREE.Object3D;
  ward: THREE.Group;
  treehouse: THREE.Object3D;
  tower: THREE.Object3D;
  /** whistle: everyone stops, faces the track and salutes */
  salute(): void;
  /** a box landed: "Halt!" They stop dead and look at it. */
  halt(at: THREE.Vector3): void;
  update(dt: number, t: number, cam: THREE.Vector3): void;
}

export function buildCamp(ground: (x: number, z: number) => number): Camp {
  const rng = new Rng(8101);
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const add = (o: THREE.Object3D) => { statics.add(o); return o; };
  const logM = texMat(bark(0x6a5038, 8102));
  const planksM = texMat(planks(0x9a7a56, 8103));
  const canvasM = new THREE.MeshLambertMaterial({ map: canvasCloth(0xdccca0, 8104), side: THREE.DoubleSide });
  const canvasDark = new THREE.MeshLambertMaterial({ map: canvasCloth(0xb8a070, 8105), side: THREE.DoubleSide });
  const dark = flat(0x2a2620, 0.1), wood = flat(0x7a5a3a, 0.3), white = flat(0xf4f0e6, 0.3), rope = flat(0xd8c8a0, 0.2);
  const signMat = (tex: THREE.Texture) => new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });

  // ---------- the gate ----------
  {
    const z = CAMP.gate;
    for (const s of [-1, 1]) {
      add(mesh(repeatUV(new THREE.CylinderGeometry(0.32, 0.38, 8.2, 10), 1, 3), logM, s * 3.9, PY + 3.7, z));
      add(cyl(0.36, 0.36, 0.25, logM, s * 3.9, PY + 7.9, z, 10));
      // a pennant on a pole on each post
      add(cyl(0.04, 0.04, 1.6, white, s * 3.9, PY + 8.8, z, 5));
    }
    add(mesh(repeatUV(new THREE.CylinderGeometry(0.26, 0.26, 9.6, 10), 1, 3), logM, 0, PY + 7.1, z).rotateZ(Math.PI / 2));
    add(mesh(repeatUV(new THREE.CylinderGeometry(0.2, 0.2, 9.0, 10), 1, 3), logM, 0, PY + 5.1, z).rotateZ(Math.PI / 2));
    const sign = mesh(new THREE.PlaneGeometry(7.2, 1.7), signMat(boardSign({ title: 'CAMP IVANHOE', fg: 0xf4ecda, bg: 0x4f5a3a, border: 0xe2b33c, w: 1024, h: 240, seed: 8106 })), 0, PY + 6.1, z + 0.22);
    add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = z - 0.22; add(back);
    add(box(7.4, 1.9, 0.3, wood, 0, PY + 6.1, z));
    const sub = mesh(new THREE.PlaneGeometry(5.2, 0.62), signMat(boardSign({ title: 'KHAKI SCOUTS OF NORTH AMERICA', fg: 0x4f5a3a, bg: 0xe8d8a8, w: 1024, h: 120, seed: 8107 })), 0, PY + 4.55, z + 0.12);
    add(sub);
    add(box(5.3, 0.7, 0.16, wood, 0, PY + 4.55, z));
    for (const s of [-1, 1]) for (const x of [-1.9, 1.9]) add(cyl(0.025, 0.025, 0.55, rope, x, PY + 4.95 + (s > 0 ? 0 : 0), z, 4));
    // crossed canoe paddles over the middle
    for (const s of [-1, 1]) { const p = new THREE.Group(); p.add(box(0.08, 2.4, 0.05, wood, 0, 0, 0), box(0.32, 0.7, 0.04, flat(0xb0473a, 0.3), 0, 1.3, 0)); p.position.set(0, PY + 8.0, z); p.rotation.z = s * 0.6; add(p); }
  }

  // ---------- tents on platforms, in rows ----------
  const tent = (x: number, z: number, yaw: number, hole = false) => {
    const t = new THREE.Group();
    const y = ground(x, z);
    t.add(mesh(boxUV(new THREE.BoxGeometry(3.4, 0.35, 4.2), 1, 2), planksM, 0, 0.2, 0));
    for (const [px, pz] of [[-1.5, -1.9], [1.5, -1.9], [-1.5, 1.9], [1.5, 1.9]]) t.add(cyl(0.1, 0.1, 0.6, wood, px, -0.1, pz, 5));
    // walls and a ridge roof of canvas
    const W = 3.0, Dp = 3.6, wallH = 1.2, roofH = 1.4;
    for (const s of [-1, 1]) {
      const wall = mesh(repeatUV(new THREE.PlaneGeometry(Dp, wallH), Dp / 2, wallH / 2), canvasM, s * W / 2, 0.37 + wallH / 2, 0); wall.rotation.y = s * Math.PI / 2; t.add(wall);
    }
    const backWall = mesh(repeatUV(new THREE.PlaneGeometry(W, wallH), W / 2, wallH / 2), canvasM, 0, 0.37 + wallH / 2, -Dp / 2); t.add(backWall);
    const gable = new THREE.Shape(); gable.moveTo(-W / 2, 0); gable.lineTo(W / 2, 0); gable.lineTo(0, roofH); gable.closePath();
    const gb = mesh(new THREE.ShapeGeometry(gable), canvasM, 0, 0.37 + wallH, -Dp / 2); t.add(gb);
    const roof = mesh(roofGeometry(W, Dp, roofH, 0.25), canvasDark, 0, 0.37 + wallH, 0); t.add(roof);
    // the door flaps tied back, the dark inside, a cot
    t.add(mesh(new THREE.PlaneGeometry(W - 0.1, wallH + roofH * 0.9), dark, 0, 0.37 + (wallH + roofH * 0.9) / 2, -Dp / 2 + 0.25));
    for (const s of [-1, 1]) { const flap = mesh(new THREE.PlaneGeometry(0.7, wallH + 0.9), canvasDark, s * (W / 2 - 0.25), 0.37 + (wallH + 0.9) / 2, Dp / 2 + 0.02); flap.rotation.y = s * 0.5; t.add(flap); }
    const gf = new THREE.Shape(); gf.moveTo(-W / 2, 0); gf.lineTo(-0.65, 0); gf.lineTo(-0.15, roofH * 0.85); gf.lineTo(0, roofH); gf.closePath();
    for (const s of [-1, 1]) { const m = mesh(new THREE.ShapeGeometry(gf), canvasM, 0, 0.37 + wallH, Dp / 2); m.scale.x = s; t.add(m); }
    t.add(box(0.8, 0.35, 2.0, flat(0x5a6a3a, 0.2), 0.6, 0.6, -0.4));
    // guy ropes to pegs
    for (const s of [-1, 1]) for (const zz of [-1.5, 1.5]) {
      const a = V(s * W / 2, 0.37 + wallH, zz), b = V(s * (W / 2 + 1.4), -0.1, zz);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, a.distanceTo(b), 3), rope); r.position.copy(a).lerp(b, 0.5); r.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); t.add(r);
    }
    t.add(cyl(0.04, 0.04, 0.37 + wallH + roofH + 0.4, wood, 0, (0.37 + wallH + roofH + 0.4) / 2, Dp / 2 + 0.1, 5));
    if (hole) {
      // Sam's tent: a hole cut in the back canvas, the map of the island pinned half over it
      backWall.visible = false;
      const s2 = new THREE.Shape(); s2.moveTo(-W / 2, 0); s2.lineTo(W / 2, 0); s2.lineTo(W / 2, wallH); s2.lineTo(-W / 2, wallH); s2.closePath();
      const h = new THREE.Path(); for (let k = 0; k <= 12; k++) { const a = (k / 12) * TAU; const r = 0.42 + (k % 2) * 0.06; h.lineTo(0.2 + Math.cos(a) * r, 0.62 + Math.sin(a) * r * 0.9); } s2.holes.push(h);
      const cut = new THREE.ShapeGeometry(s2);
      const uv = cut.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
      t.add(mesh(cut, canvasM, 0, 0.37, -Dp / 2));
      const map = mesh(new THREE.PlaneGeometry(0.7, 0.52), new THREE.MeshLambertMaterial({ map: islandMap(), side: THREE.DoubleSide }), -0.55, 0.37 + 0.72, -Dp / 2 - 0.02); map.rotation.y = Math.PI; map.rotation.z = 0.12; t.add(map);
    }
    t.position.set(x, y, z); t.rotation.y = yaw;
    return t;
  };
  for (const x of [-6.6, -12.2]) for (let i = 0; i < 4; i++) {
    const z = -1315 - i * 8;
    // tents on the left face the track; Sam's (front row, second) turns its back to it
    const hole = x === -6.6 && i === 1;
    add(tent(x, z, hole ? -Math.PI / 2 : Math.PI / 2, hole));
  }
  // on the right, a row behind the parade ground facing it, and two at its front corners
  for (let i = 0; i < 4; i++) add(tent(23.5, -1315 - i * 8, -Math.PI / 2));
  for (const z of [-1313, -1347]) add(tent(5.9, z, -Math.PI / 2));

  // ---------- the parade ground: the flagpole, a bench, the notice board, the bugle post ----------
  const flag = new THREE.Group();
  const flagGeo = new THREE.PlaneGeometry(2.6, 1.37, 10, 3);
  const flagMesh = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ map: usFlag(), side: THREE.DoubleSide }));
  flagMesh.position.set(1.3, 0, 0);
  flag.add(flagMesh);
  const penGeo = new THREE.PlaneGeometry(1.6, 0.8, 6, 1);
  const pennant = new THREE.Mesh(penGeo, new THREE.MeshLambertMaterial({ map: troopPennant(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
  pennant.position.set(0.8, -1.9, 0);
  flag.add(pennant);
  {
    const fx = CAMP.flag.x, fz = CAMP.flag.z, fy = ground(fx, fz);
    add(cyl(0.07, 0.12, 13, white, fx, fy + 6.5, fz, 8));
    add(sphere(0.18, flat(0xd8b25a, 0.5), fx, fy + 13.1, fz, 10, 8));
    add(cyl(1.1, 1.3, 0.3, flat(0xd8d0c0, 0.2), fx, fy + 0.1, fz, 16));
    flag.position.set(fx, fy + 12.1, fz);
    group.add(flag);
    // a ring of white stones round the parade ground
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * TAU;
      const px = fx + Math.cos(a) * 7.4 * 0.95, pz = fz + Math.sin(a) * 13.5 * 0.95;
      add(sphere(0.2, white, px, ground(px, pz) + 0.05, pz, 6, 4));
    }
    // the notice board with the island map
    const nb = new THREE.Group();
    nb.add(cyl(0.08, 0.08, 2.2, wood, -0.9, 1.1, 0, 5), cyl(0.08, 0.08, 2.2, wood, 0.9, 1.1, 0, 5), box(2.1, 1.2, 0.08, flat(0x8a6a4a, 0.2), 0, 1.6, 0));
    nb.add(mesh(new THREE.PlaneGeometry(0.9, 0.68), new THREE.MeshLambertMaterial({ map: islandMap() }), -0.4, 1.62, 0.05));
    nb.add(box(0.5, 0.7, 0.01, flat(0xf4f0e4, 0.1), 0.55, 1.6, 0.05));
    nb.add(mesh(roofGeometry(2.3, 0.4, 0.3, 0.05), flat(0x4f5a3a, 0.2), 0, 2.25, 0));
    nb.position.set(4.6, ground(4.6, -1321), -1321); nb.rotation.y = -Math.PI / 2;
    add(nb);
    // the troop's canoes on a rack
    const rack = new THREE.Group();
    for (const x of [-1.2, 1.2]) rack.add(box(0.1, 1.6, 0.1, wood, x, 0.8, 0));
    for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), flat([0xb0473a, 0x3f8f8c, 0xe2b33c][k], 0.3)); c.scale.set(2.2, 0.22, 0.38); c.position.set(0, 0.5 + k * 0.5, 0); rack.add(c); rack.add(box(2.6, 0.06, 0.1, wood, 0, 0.36 + k * 0.5, 0)); }
    rack.position.set(5.4, ground(5.4, -1340), -1340); rack.rotation.y = Math.PI / 2;
    add(rack);
  }
  // an archery range on the left, behind the tents: straw targets with arrows in them
  for (let k = 0; k < 3; k++) {
    const t = new THREE.Group();
    const face = mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshLambertMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; for (const [r, col] of [[32, '#f4ecda'], [26, '#2a2a2a'], [20, '#4a8ac8'], [14, '#c8402a'], [8, '#e2b33c']] as const) { g.fillStyle = col; g.beginPath(); g.arc(32, 32, r, 0, TAU); g.fill(); } const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })() }), 0, 1.3, 0.12);
    t.add(face, cyl(0.75, 0.75, 0.22, flat(0xc8a860, 0.2), 0, 1.3, 0, 16).rotateX(Math.PI / 2));
    for (const s of [-1, 1]) t.add(box(0.08, 1.5, 0.08, wood, s * 0.5, 0.6, -0.4).rotateX(-0.3));
    for (let a = 0; a < 2; a++) { const ar = cyl(0.015, 0.015, 0.7, wood, rng.range(-0.2, 0.2), 1.3 + rng.range(-0.2, 0.2), 0.45, 4); ar.rotation.x = Math.PI / 2; t.add(ar); }
    t.position.set(-17.5, ground(-17.5, -1318 - k * 4), -1318 - k * 4); t.rotation.y = Math.PI / 2;
    add(t);
  }
  // a campfire ring with logs to sit on, left of the track at the far end
  {
    const fx = -8.2, fz = -1346, fy = ground(fx, fz);
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; add(sphere(0.22, flat(0x8a857a, 0.2), fx + Math.cos(a) * 0.9, fy + 0.08, fz + Math.sin(a) * 0.9, 6, 5)); }
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + 0.4; const l = cyl(0.18, 0.18, 2.0, logM, fx + Math.cos(a) * 2.6, fy + 0.18, fz + Math.sin(a) * 2.6, 8); l.rotation.z = Math.PI / 2; l.rotation.y = -a + Math.PI / 2; add(l); }
    add(cyl(0.07, 0.07, 1.0, flat(0x3a2a1a), fx, fy + 0.15, fz, 5).rotateZ(1.2));
  }

  // ---------- the treehouse at an alarming height ----------
  const treehouse = new THREE.Group();
  {
    const T = CAMP.treehouse, H = T.h;
    const y0 = ground(T.x, T.z);
    treehouse.position.set(T.x, y0, T.z);
    const trunk = mesh(repeatUV(new THREE.CylinderGeometry(0.32, 0.9, H + 3, 12), 2, 8), logM, 0, (H + 3) / 2 - 0.2, 0);
    treehouse.add(trunk);
    const V2 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const blobs = [];
    for (let i = 0; i < 9; i++) { const yy = 6 + i * 2.5, r = lerp(2.4, 1.0, i / 8); blobs.push({ c: V2(Math.sin(i * 2.1) * 0.4, yy, Math.cos(i * 2.1) * 0.4), r: V2(r, 0.9, r) }); }
    const tree = fluffyTree(blobs, MK.pine, rng, { density: 0.9 });
    treehouse.add(tree);
    const pY = H;
    const plat = new THREE.Group(); plat.position.y = pY; treehouse.add(plat);
    plat.add(mesh(boxUV(new THREE.BoxGeometry(4.0, 0.25, 4.0), 1, 2), planksM, 0, 0, 0));
    for (const [x, z] of [[-1.9, -1.9], [1.9, -1.9], [-1.9, 1.9], [1.9, 1.9]]) { const b = V(x * 0.95, -0.1, z * 0.95), a = V(x * 0.15, -2.6, z * 0.15); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, a.distanceTo(b), 5), wood); r.position.copy(a).lerp(b, 0.5); r.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); plat.add(r); }
    for (const s of [-1, 1]) { plat.add(box(4.0, 0.07, 0.07, wood, 0, 0.95, s * 1.95), box(0.07, 0.07, 4.0, wood, s * 1.95, 0.95, 0)); }
    for (const [x, z] of [[-1.95, -1.95], [1.95, -1.95], [-1.95, 1.95], [1.95, 1.95]]) plat.add(box(0.08, 1.0, 0.08, wood, x, 0.5, z));
    // the little hut on it with its lookout window
    plat.add(mesh(boxUV(new THREE.BoxGeometry(2.2, 1.7, 1.8), 1, 2), planksM, -0.5, 0.95, -0.6));
    plat.add(mesh(roofGeometry(2.2, 1.8, 0.8, 0.25), flat(0x4f5a3a, 0.2), -0.5, 1.8, -0.6));
    plat.add(box(0.8, 0.5, 0.05, dark, -0.5, 1.15, 0.31));
    // its flag
    plat.add(cyl(0.035, 0.035, 2.6, white, 1.6, 1.3, -1.6, 5));
    const tf = mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshLambertMaterial({ map: troopPennant(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), 2.1, 2.3, -1.6);
    plat.add(tf);
    // a rope ladder all the way down
    for (const s of [-1, 1]) { const a = V(s * 0.3, 0, 2.0), b = V(s * 0.3, -pY + 0.1, 2.5); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 4), rope); r.position.copy(a).lerp(b, 0.5); r.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); plat.add(r); }
    for (let yy = 0.6; yy < pY; yy += 0.55) plat.add(box(0.64, 0.05, 0.08, wood, 0, -yy, 2.0 + (yy / pY) * 0.5));
    treehouse.rotation.y = Math.PI / 2 + 0.3;
  }
  add(treehouse);

  // ---------- the lookout tower ----------
  const tower = new THREE.Group();
  {
    const T = CAMP.tower, H = T.h;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const a = V(sx * 1.9, 0, sz * 1.9), b = V(sx * 1.4, H + 0.3, sz * 1.4);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, a.distanceTo(b), 6), logM); r.position.copy(a).lerp(b, 0.5); r.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); tower.add(r);
    }
    for (let y = 2.5; y < H; y += 2.5) for (const s of [-1, 1]) { const w = lerp(3.7, 2.8, y / H); tower.add(box(w, 0.1, 0.1, wood, 0, y, s * w / 2), box(0.1, 0.1, w, wood, s * w / 2, y, 0)); }
    tower.add(mesh(boxUV(new THREE.BoxGeometry(3.6, 0.25, 3.6), 1, 2), planksM, 0, H, 0));
    for (const s of [-1, 1]) tower.add(box(3.6, 0.07, 0.07, wood, 0, H + 1.0, s * 1.78), box(0.07, 0.07, 3.6, wood, s * 1.78, H + 1.0, 0));
    for (const [x, z] of [[-1.78, -1.78], [1.78, -1.78], [-1.78, 1.78], [1.78, 1.78]]) tower.add(box(0.1, 2.6, 0.1, wood, x, H + 1.3, z));
    tower.add(mesh(new THREE.ConeGeometry(2.7, 1.3, 4), flat(MK.red, 0.3), 0, H + 3.2, 0).rotateY(Math.PI / 4));
    for (let y = 0.8; y < H; y += 0.8) tower.add(box(0.7, 0.05, 0.05, wood, 0, y, 1.55));
    for (const s of [-1, 1]) tower.add(cyl(0.03, 0.03, H, wood, s * 0.35, H / 2, 1.55, 4));
    tower.position.set(T.x, ground(T.x, T.z), T.z);
    tower.rotation.y = -Math.PI / 2;
  }
  add(tower);

  unify(statics);
  statics.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  optimize(statics);

  // ---------- Scout Master Ward ----------
  const ward = scoutMasterWard();
  const cb = clipboard(1.2);
  cb.position.set(0.02, -0.3, 0.1); cb.rotation.set(-1.2, 0, 0);
  ward.elbow[1].add(cb);
  ward.elbow[1].rotation.x = -1.3;
  ward.shoulder[1].rotation.set(-0.2, 0, 0.15);
  {
    const x = CAMP.flag.x - 2.2, z = CAMP.flag.z + 0.6;
    ward.group.position.set(x, ground(x, z), z);
    ward.group.rotation.y = -Math.PI / 2;
    ward.group.scale.multiplyScalar(1.08);
  }
  group.add(ward.group);
  lighten(ward.group);
  bake(ward.group, [ward.head, ward.shoulder[0], ward.elbow[0]]);

  // ---------- the troop: nine marching round the flagpole, one on the tower, one up the tree ----------
  const N = 9, EXTRA = 2;
  const P = CAMP.parade, fx = CAMP.flag.x, fz = CAMP.flag.z;
  const troop = new Troop(N + EXTRA, Array.from({ length: N + EXTRA }, (_, i) => (i * 7) % 3), new THREE.Sphere(V(-2, PY + 8, (P.z0 + P.z1) / 2 - 4), 48));
  group.add(troop.group);
  // the loop they march: a rounded rectangle round the flagpole
  const loop: THREE.Vector3[] = [];
  {
    const hx = 3.8, hz = 8.4, r = 2.4;
    const c = new THREE.Shape();
    c.moveTo(fx - hx + r, fz - hz); c.lineTo(fx + hx - r, fz - hz); c.quadraticCurveTo(fx + hx, fz - hz, fx + hx, fz - hz + r);
    c.lineTo(fx + hx, fz + hz - r); c.quadraticCurveTo(fx + hx, fz + hz, fx + hx - r, fz + hz);
    c.lineTo(fx - hx + r, fz + hz); c.quadraticCurveTo(fx - hx, fz + hz, fx - hx, fz + hz - r);
    c.lineTo(fx - hx, fz - hz + r); c.quadraticCurveTo(fx - hx, fz - hz, fx - hx + r, fz - hz);
    for (const p of c.getSpacedPoints(120)) loop.push(V(p.x, 0, p.y));
  }
  const loopLen = loop.reduce((s, p, i) => s + (i ? p.distanceTo(loop[i - 1]) : 0), 0);
  const along = (d: number, out: THREE.Vector3) => {
    d = ((d % loopLen) + loopLen) % loopLen;
    const f = (d / loopLen) * (loop.length - 1), i = Math.floor(f), k = f - i;
    out.copy(loop[i]).lerp(loop[Math.min(i + 1, loop.length - 1)], k);
    return Math.atan2(loop[Math.min(i + 1, loop.length - 1)].x - loop[i].x, loop[Math.min(i + 1, loop.length - 1)].z - loop[i].z);
  };
  for (let i = 0; i < N; i++) troop.pose[i].scale = KID.scout * (0.94 + ((i * 37) % 10) / 70);
  // the lookout on the tower and the one up in the treehouse
  {
    const tp = troop.pose[N];
    tp.pos.set(CAMP.tower.x - 0.6, ground(CAMP.tower.x, CAMP.tower.z) + CAMP.tower.h + 0.12, CAMP.tower.z + 0.3); tp.yaw = -Math.PI / 2 - 0.4; tp.scale = KID.scout;
    tp.armR = [-2.4, -0.2, -0.6];
    const hp = troop.pose[N + 1];
    const tw = new THREE.Vector3(0.6, CAMP.treehouse.h + 0.13, 1.1).applyAxisAngle(V(0, 1, 0), Math.PI / 2 + 0.3);
    hp.pos.set(CAMP.treehouse.x + tw.x, ground(CAMP.treehouse.x, CAMP.treehouse.z) + tw.y, CAMP.treehouse.z + tw.z); hp.yaw = Math.PI / 2 - 0.3; hp.scale = KID.scout;
  }

  const troopAnchor = new THREE.Object3D();
  group.add(troopAnchor);

  // ---------- life ----------
  let march = 0, saluteT = -1, haltT = -1;
  const haltAt = new THREE.Vector3();
  const sp = { stop: new Spring(0, 1.4, 0.9), salute: new Spring(0, 2.2, 0.6), wardArm: new Spring(0, 2, 0.6) };
  const tmp = new THREE.Vector3(), flagPos = flagGeo.attributes.position as THREE.BufferAttribute, penPos = penGeo.attributes.position as THREE.BufferAttribute;
  const flagX = Float32Array.from({ length: flagPos.count }, (_, i) => flagPos.getX(i)), penX = Float32Array.from({ length: penPos.count }, (_, i) => penPos.getX(i));
  const heading = new Float32Array(N);
  return {
    group, troopAnchor, ward: ward.group, treehouse, tower,
    salute() { saluteT = 0; },
    halt(at) { haltT = 0; haltAt.copy(at); },
    update(dt, t, cam) {
      // the flags flutter
      for (let i = 0; i < flagPos.count; i++) { const x = flagX[i] + 1.3; flagPos.setZ(i, Math.sin(x * 2.2 - t * 5) * 0.12 * (x / 2.6)); }
      flagPos.needsUpdate = true;
      for (let i = 0; i < penPos.count; i++) { const x = penX[i] + 0.8; penPos.setZ(i, Math.sin(x * 3 - t * 6) * 0.08 * (x / 1.6)); }
      penPos.needsUpdate = true;

      let sal = 0, halt = 0;
      if (saluteT >= 0) { saluteT += dt; sal = envelope(saluteT, 0.15, 0.6, 3.0, 3.6); if (saluteT > 3.8) saluteT = -1; }
      if (haltT >= 0) { haltT += dt; halt = envelope(haltT, 0, 0.12, 2.4, 3.0); if (haltT > 3.0) haltT = -1; }
      const stop = sp.stop.update(Math.max(sal > 0 || saluteT >= 0 ? 1 : 0, halt), dt);
      const s = sp.salute.update(sal, dt);
      march += dt * 1.05 * (1 - clamp(stop, 0, 1));
      const step = march * 1.9;
      let ax = 0, az = 0;
      for (let i = 0; i < N; i++) {
        const P2 = troop.pose[i];
        const yaw = along(march - i * 1.45, P2.pos);
        heading[i] = yaw;
        P2.pos.y = ground(P2.pos.x, P2.pos.z);
        // facing the track for the salute; the column's heading otherwise
        const face = -Math.PI / 2;
        P2.yaw = lerp(yaw, yaw + Math.atan2(Math.sin(face - yaw), Math.cos(face - yaw)), clamp(s * 1.2, 0, 1));
        const k = 1 - clamp(stop, 0, 1);
        const ph = step * Math.PI + i * Math.PI;
        P2.legs = Math.sin(ph) * 0.5 * k;
        P2.armL = -Math.sin(ph) * 0.45 * k;
        P2.bob = Math.abs(Math.cos(ph)) * 0.05 * k;
        // the salute: right hand to the brim of the hat
        P2.armR = [lerp(Math.sin(ph) * 0.45 * k, -2.5, s), lerp(0, 0.55, s), lerp(-0.1, -2.1, s)];
        // heads: towards the box on "Halt!", towards the rider otherwise when close
        let hy = 0;
        if (halt > 0.05) { tmp.copy(haltAt).sub(P2.pos); hy = Math.atan2(tmp.x, tmp.z) - P2.yaw; }
        else { tmp.copy(cam).sub(P2.pos); hy = (Math.atan2(tmp.x, tmp.z) - P2.yaw) * (tmp.length() < 30 ? 1 : 0); }
        hy = Math.atan2(Math.sin(hy), Math.cos(hy));
        P2.head.yaw = damp(P2.head.yaw, clamp(hy, -1.0, 1.0), 4, dt);
        ax += P2.pos.x; az += P2.pos.z;
      }
      troopAnchor.position.set(ax / N, PY + 1.0, az / N);
      // the lookouts
      const lo = troop.pose[N];
      tmp.copy(cam).sub(lo.pos); lo.head.yaw = clamp(Math.atan2(tmp.x, tmp.z) - lo.yaw, -1, 1); lo.head.pitch = 0.2;
      const th = troop.pose[N + 1];
      th.armR = [lerp(-0.1, -2.9, 0.5 + 0.5 * Math.sin(t * 3)), 0.9, -0.3];
      th.armL = 0.1;
      troop.update();
      // Ward: looks at the rider; salutes with the troop; throws up a hand for "Halt!"
      const wa = sp.wardArm.update(Math.max(s, halt), dt);
      ward.tick(dt, t, cam, 1);
      ward.shoulder[0].rotation.set(lerp(-0.05, halt > s ? -2.9 : -2.4, wa), 0, lerp(-0.1, halt > s ? -0.2 : -0.5, wa));
      ward.elbow[0].rotation.set(lerp(-0.15, halt > s ? -0.1 : -2.0, wa), 0, 0);
    },
  };
}
