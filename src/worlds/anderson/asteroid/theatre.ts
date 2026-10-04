import * as THREE from 'three';
import { glow, mergeStatic, mesh } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import { Rng, TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { lightShaft } from '../common';
import { texMat } from '../kit';
import { stageBoards as boardsTex } from './textures';
import { carpet, cycDay, cycNight, floorCloth, gilt, houseWall, lettering, maskFace, moonFace, plaster, plywood, skyBorder, strata, velvet } from './textures';
import { boxAt, castAll, cylAt, jackParts, merge, mesaOutline, poly, rodGeometry, slab, slabGeometry } from './kit';
import { ARCH, CLOTH, HOUSE, HOUSE_Y, PATH_Y, STAGE, STAGE_Y, TRACK, AC } from './plan';
import { FUTURA } from '../film';

/**
 * The theatre that Asteroid City is played in. The house is black and white (the film's frame story is a
 * television broadcast in black and white); the stage is in colour. Everything static here is merged by the
 * set (optimize); the returned handles are the few things that move or change at night.
 */

export interface Theatre {
  /** static scenery, merged by the caller */
  statics: THREE.Group;
  /** moving or changing parts (kept apart from the merge) */
  live: THREE.Group;
  /** large shapes that hide subjects */
  occluders: THREE.Object3D[];
  /** 0 day .. 1 night */
  setNight(k: number, t: number): void;
  update(dt: number, t: number, z: number, night: number): void;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The opening of the proscenium arch as a list of points (from the floor on the left, over the top, down the right). */
function archOpening(half: number, spring: number, top: number, y0: number) {
  const pts: Array<[number, number]> = [[-half, y0], [-half, spring]];
  for (let i = 1; i < 24; i++) {
    const a = Math.PI - (i / 24) * Math.PI;
    pts.push([Math.cos(a) * half, spring + Math.sin(a) * (top - spring)]);
  }
  pts.push([half, spring], [half, y0]);
  return pts;
}

export function buildTheatre(rng: Rng): Theatre {
  const statics = new THREE.Group(), live = new THREE.Group();
  const occluders: THREE.Object3D[] = [];

  // ---------- materials (the house in greys, the stage in colour) ----------
  const greyPlaster = texMat(plaster(0x58585a, 501));
  const darkPlaster = texMat(plaster(0x343436, 503));
  const black = new THREE.MeshLambertMaterial({ color: 0x141416 });
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8e6 });
  const silver = new THREE.MeshLambertMaterial({ color: 0xa8a8aa });
  const gold = new THREE.MeshStandardMaterial({ color: AC.gold, metalness: 0.75, roughness: 0.35, emissive: 0x4a3410, emissiveIntensity: 0.35 });
  const giltMat = new THREE.MeshStandardMaterial({ map: gilt(), metalness: 0.6, roughness: 0.4, emissive: 0x3a2808, emissiveIntensity: 0.3 });
  const velvetMat = new THREE.MeshLambertMaterial({ map: velvet(), side: THREE.DoubleSide });
  const wood = new THREE.MeshLambertMaterial({ color: 0xc8a878 });
  const ply = new THREE.MeshLambertMaterial({ map: plywood() });
  const bagMat = new THREE.MeshLambertMaterial({ color: 0xb8a880 });
  const boards = new THREE.MeshLambertMaterial({ map: boardsTex() });
  const lampOn = glow(0xfff4e0, 1.3);

  // =====================================================================================================
  // THE HOUSE (black and white)
  // =====================================================================================================
  const H = HOUSE, hz = (H.z0 + ARCH.z) / 2, hd = H.z0 - ARCH.z;
  {
    // floor and raked tiers of seating, both sides of the runway
    const carpetM = new THREE.MeshLambertMaterial({ map: carpet() });
    const floor = mesh(repeatUV(new THREE.PlaneGeometry(H.half * 2, hd), H.half * 2 / 4, hd / 4), carpetM, 0, HOUSE_Y, hz);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; statics.add(floor);
    const tiers: THREE.BufferGeometry[] = [];
    const seatPl: Array<[number, number, number]> = [];
    const ROW = 1.6, front = ARCH.apron - 3.2;
    const rows = Math.floor((front - (H.z0 + 3)) / ROW);
    // (the television camera stands in a gap in the seats on the left)
    const tvGap = (x: number, z: number) => x < -7.6 && x > -13.6 && z < -1522.5 && z > -1531.5;
    for (let i = 0; i < rows; i++) {
      const z = front + i * ROW, y = HOUSE_Y + i * 0.13;
      for (const s of [-1, 1]) {
        if (i > 0) tiers.push(boxAt(H.half - H.runway - 0.6, y - HOUSE_Y, ROW, s * (H.runway + 0.6 + (H.half - H.runway - 0.6) / 2), (y + HOUSE_Y) / 2, z));
        for (let x = H.runway + 1.4; x < H.half - 1.2; x += 0.95) if (!tvGap(s * x, z)) seatPl.push([s * x, y, z]);
      }
    }
    // the balcony at the back: a slab, a white front, and three tiers of seats on it
    const balY = 10.5, balFront = H.z0 - 13;
    tiers.push(boxAt(H.half * 2, 1.2, H.z0 - balFront, 0, balY - 0.6, (H.z0 + balFront) / 2));
    for (let i = 0; i < 6; i++) {
      const z = balFront + 1.6 + i * 1.7, y = balY + i * 0.55;
      tiers.push(boxAt(H.half * 2, 0.55, H.z0 - z + 0.8, 0, y + 0.27, (z - 0.8 + H.z0) / 2));
      for (let x = -H.half + 1.5; x < H.half - 1.2; x += 0.95) seatPl.push([x, y + 0.55, z]);
    }
    const tierMesh = mesh(merge(tiers), darkPlaster); tierMesh.receiveShadow = true; statics.add(tierMesh);
    // the balcony's front: a white balustrade
    const bal = canvasBalustrade();
    const balMesh = mesh(repeatUV(new THREE.PlaneGeometry(H.half * 2, 1.8), H.half * 2 / 4, 1), new THREE.MeshLambertMaterial({ map: bal }), 0, balY - 0.3, balFront - 0.02);
    statics.add(balMesh);
    statics.add(mesh(boxAt(H.half * 2, 0.25, 0.4, 0, balY + 0.65, balFront), white));

    // seats: a velvet cushion, a back and two arms, all one instanced mesh
    const seatGeo = merge([boxAt(0.78, 0.16, 0.62, 0, 0.42, 0), boxAt(0.8, 0.82, 0.12, 0, 0.82, 0.32), boxAt(0.08, 0.5, 0.6, -0.42, 0.62, 0.02), boxAt(0.08, 0.5, 0.6, 0.42, 0.62, 0.02)]);
    const seats = new THREE.InstancedMesh(seatGeo, new THREE.MeshLambertMaterial({ color: 0x3e3e42 }), seatPl.length);
    const m4 = new THREE.Matrix4();
    seatPl.forEach(([x, y, z], i) => seats.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    seats.computeBoundingSphere();
    statics.add(seats);

    // the audience: a head and shoulders in most seats, all facing the stage (heads in greys, hair darker)
    const head = new THREE.SphereGeometry(0.14, 10, 8); head.scale(0.92, 1.05, 1); head.translate(0, 1.22, 0.02);
    const hair = new THREE.SphereGeometry(0.152, 10, 6, 0, TAU, 0, Math.PI * 0.55); hair.translate(0, 1.24, 0.05);
    const torso = new THREE.SphereGeometry(0.3, 10, 6); torso.scale(0.85, 0.65, 0.5); torso.translate(0, 0.88, 0.1);
    const paint = (g: THREE.BufferGeometry, c: number) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3).fill(c); g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g; };
    const person = merge([paint(head, 0.78), paint(hair, 0.22), paint(torso, 0.34)]);
    const seated = seatPl.filter(() => rng.next() < 0.62);
    const crowd = new THREE.InstancedMesh(person, new THREE.MeshLambertMaterial({ vertexColors: true }), seated.length);
    const c = new THREE.Color(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    seated.forEach(([x, y, z], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.range(-0.15, 0.15) + (x > 0 ? 0.05 : -0.05));
      sc.setScalar(rng.range(0.92, 1.08));
      crowd.setMatrixAt(i, m4.compose(V(x, y, z), q, sc));
      crowd.setColorAt(i, c.setScalar(rng.range(0.55, 1.35)));
    });
    crowd.computeBoundingSphere();
    statics.add(crowd);

    // side walls: two tiers of opera boxes, with gilded fronts standing out from the wall
    const hw = houseWall();
    const wallMat = new THREE.MeshLambertMaterial({ map: hw.map, emissive: 0xffffff, emissiveMap: hw.emissive, emissiveIntensity: 0.6 });
    for (const s of [-1, 1]) {
      const w = mesh(repeatUV(new THREE.PlaneGeometry(hd, H.ceil - HOUSE_Y), hd / 16, 1), wallMat, s * H.half, (H.ceil + HOUSE_Y) / 2, hz);
      w.rotation.y = -s * Math.PI / 2; statics.add(w);
      // box fronts: half drums at the two tiers' balcony fronts
      for (let k = 0; k < Math.floor(hd / 16); k++) {
        const z = H.z0 - 8 - k * 16;
        for (const y of [10.4, 25.0]) {
          const d = new THREE.CylinderGeometry(4.2, 3.8, 1.9, 16, 1, false, 0, Math.PI);
          d.scale(0.32, 1, 1); d.rotateY(s > 0 ? Math.PI : 0); d.translate(s * (H.half - 0.05), y, z);
          statics.add(mesh(d, white));
          statics.add(mesh(cylAt(0.3, 0.3, 0.3, s * (H.half - 1.1), y + 1.1, z), silver));
        }
      }
    }
    // the ceiling: dark, with a pale oval round the chandelier
    const ceil = mesh(new THREE.PlaneGeometry(H.half * 2, hd), darkPlaster, 0, H.ceil, hz); ceil.rotation.x = Math.PI / 2; statics.add(ceil);
    const ring = mesh(new THREE.TorusGeometry(12, 0.5, 6, 40), white, 0, H.ceil - 0.3, hz + 4); ring.rotation.x = Math.PI / 2; ring.scale.set(1.3, 1, 1); statics.add(ring);
    // rear wall with the opening the train comes in by, the projection booth and two exits
    const rear = poly([[-H.half, HOUSE_Y], [-3.6, HOUSE_Y], [-3.6, 6.4], [-2.6, 7.6], [2.6, 7.6], [3.6, 6.4], [3.6, HOUSE_Y], [H.half, HOUSE_Y], [H.half, H.ceil], [-H.half, H.ceil]]);
    const rw = slab(rear, 1, greyPlaster, greyPlaster, greyPlaster, 0.25); rw.position.set(0, 0, H.z0 - 1); statics.add(rw);
    statics.add(mesh(boxAt(7.4, 8, 8, 0, 4, H.z0 + 4.2), black));
    for (const x of [-8, -3, 3, 8]) statics.add(mesh(boxAt(2.2, 1.3, 0.1, x, 27, H.z0 - 0.05), glow(0xf0f0e8, 0.9)));
    const exitTex = lettering([{ text: 'EXIT', font: `bold 70px ${FUTURA}`, color: '#f4f4f0', y: 0.55 }], { w: 256, h: 112, bg: '#1a1a1a' });
    for (const x of [-30, 30]) {
      statics.add(mesh(boxAt(4, 7, 0.3, x, HOUSE_Y + 3.5, H.z0 - 0.1), black));
      const ex = mesh(new THREE.PlaneGeometry(1.8, 0.8), new THREE.MeshBasicMaterial({ map: exitTex }), x, HOUSE_Y + 8, H.z0 - 0.12);
      ex.rotation.y = Math.PI; statics.add(ex);
    }
    // the follow-spot's beam from the booth down onto the stage
    live.add(lightShaft(V(0, 27, H.z0 - 0.5), V(6, 3, -1598), 7, 0xfff6e8, 0.07));

    // the chandelier
    {
      const cz = hz + 4, cy = 31;
      const metal: THREE.BufferGeometry[] = [], crystal: THREE.BufferGeometry[] = [], bulbs: THREE.BufferGeometry[] = [];
      metal.push(cylAt(0.12, 0.12, H.ceil - cy - 2, 0, (H.ceil + cy + 2) / 2, cz, 6));
      for (const [r, y, n] of [[3.6, cy, 16], [2.4, cy + 1.6, 12], [1.2, cy + 3, 8]] as const) {
        const t = new THREE.TorusGeometry(r, 0.12, 5, 32); t.rotateX(Math.PI / 2); t.translate(0, y, cz); metal.push(t);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const b = new THREE.SphereGeometry(0.22, 8, 6); b.translate(Math.cos(a) * r, y + 0.3, cz + Math.sin(a) * r); bulbs.push(b);
          const d = new THREE.ConeGeometry(0.12, 0.7, 5); d.rotateX(Math.PI); d.translate(Math.cos(a + 0.2) * r, y - 0.5, cz + Math.sin(a + 0.2) * r); crystal.push(d);
        }
      }
      const drop = new THREE.ConeGeometry(0.9, 3.2, 8); drop.rotateX(Math.PI); drop.translate(0, cy - 1.8, cz); crystal.push(drop);
      statics.add(mesh(merge(metal), silver), mesh(merge(crystal), new THREE.MeshLambertMaterial({ color: 0xf4f4f8, emissive: 0x606068 })), mesh(merge(bulbs), glow(0xfffaf0, 1.5)));
    }

    // the runway the train runs down: black boards, a white edge, footlights both sides
    const run = H.runway;
    statics.add(mesh(boxAt(run * 2, PATH_Y - HOUSE_Y, H.z0 - TRACK.runwayEnd, 0, (PATH_Y + HOUSE_Y) / 2, (H.z0 + TRACK.runwayEnd) / 2), black));
    const top = mesh(repeatUV(new THREE.PlaneGeometry(run * 2, H.z0 - TRACK.runwayEnd), run * 2 / 8, (H.z0 - TRACK.runwayEnd) / 8), boards, 0, PATH_Y + 0.005, (H.z0 + TRACK.runwayEnd) / 2);
    top.rotation.x = -Math.PI / 2; top.receiveShadow = true; statics.add(top);
    for (const s of [-1, 1]) statics.add(mesh(boxAt(0.12, 0.1, H.z0 - TRACK.runwayEnd, s * (run - 0.06), PATH_Y + 0.05, (H.z0 + TRACK.runwayEnd) / 2), white));
    const hood: THREE.BufferGeometry[] = [], bulb: THREE.BufferGeometry[] = [];
    const foot = (x: number, z: number, y: number, ry: number) => {
      const h = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8, 1, false, 0, Math.PI); h.rotateZ(Math.PI / 2); h.rotateY(ry); h.translate(x, y + 0.12, z); hood.push(h);
      const b = new THREE.SphereGeometry(0.11, 6, 5); b.translate(x, y + 0.1, z); bulb.push(b);
    };
    for (let z = H.z0 - 6; z > ARCH.apron; z -= 2.2) for (const s of [-1, 1]) foot(s * (run - 0.35), z, PATH_Y, s * Math.PI / 2);
    // the apron, the stage's front edge, with its own footlights
    statics.add(mesh(boxAt(H.half * 2, STAGE_Y - HOUSE_Y, ARCH.apron - ARCH.z + 0.5, 0, (STAGE_Y + HOUSE_Y) / 2, (ARCH.apron + ARCH.z - 0.5) / 2), black));
    const apronTop = mesh(repeatUV(new THREE.PlaneGeometry(H.half * 2, ARCH.apron - ARCH.z + 3), H.half * 2 / 8, 1), boards, 0, STAGE_Y + 0.004, (ARCH.apron + ARCH.z - 3) / 2);
    apronTop.rotation.x = -Math.PI / 2; apronTop.receiveShadow = true; statics.add(apronTop);
    statics.add(mesh(boxAt(H.half * 2, 0.16, 0.2, 0, STAGE_Y - 0.08, ARCH.apron + 0.1), gold));
    for (let x = -H.half + 2; x < H.half - 1; x += 1.6) if (Math.abs(x) > run + 0.6) foot(x, ARCH.apron - 0.5, STAGE_Y, 0);
    statics.add(mesh(merge(hood), black), mesh(merge(bulb), lampOn));

    // a 1950s television camera on its pedestal in the aisle seats, ON THE AIR
    {
      const tv = new THREE.Group();
      const parts: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
      parts.push(boxAt(1.3, 1.1, 2.0, 0, 3.3, 0), boxAt(0.9, 0.7, 0.9, 0, 4.1, 0.4), cylAt(0.25, 0.4, 2.0, 0, 1.9, 0, 10), cylAt(1.0, 1.1, 0.25, 0, 0.9, 0, 12));
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; const l = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10); l.rotateX(Math.PI / 2); l.translate(Math.cos(a) * 0.35, 3.3 + Math.sin(a) * 0.35, -1.4); dark.push(l); }
      const turret = new THREE.CylinderGeometry(0.62, 0.62, 0.15, 16); turret.rotateX(Math.PI / 2); turret.translate(0, 3.3, -1.02); parts.push(turret);
      for (const s of [-1, 1]) { const hb = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6); hb.rotateZ(Math.PI / 2 + s * 0.4); hb.translate(s * 0.9, 3.0, 0.9); dark.push(hb); }
      for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; dark.push(boxAt(0.18, 0.18, 1.4, Math.sin(a) * 0.7, 0.75, Math.cos(a) * 0.7, a)); }
      tv.add(mesh(merge(parts), silver), mesh(merge(dark), black));
      const tally = lettering([{ text: 'ON THE AIR', font: `bold 40px ${FUTURA}`, color: '#ffffff', y: 0.55 }], { w: 256, h: 64, bg: '#2a2a2a' });
      const sign = mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: tally }), 0, 4.65, 0.86); tv.add(sign);
      tv.add(mesh(boxAt(3.4, 0.4, 3.4, 0, 0.2, 0), darkPlaster));
      tv.position.set(-10.6, HOUSE_Y + 2.95, -1527);
      tv.rotation.y = -0.18;
      statics.add(tv);
    }
  }

  // =====================================================================================================
  // THE PROSCENIUM
  // =====================================================================================================
  {
    const A = ARCH;
    const spring = A.top - 6.5;
    // the wall the arch is cut through: grey on the house side, black on the stage side
    const outer: Array<[number, number]> = [[-STAGE.half, HOUSE_Y], [STAGE.half, HOUSE_Y], [STAGE.half, STAGE.grid], [-STAGE.half, STAGE.grid]];
    const wallShape = poly(outer);
    const hole = new THREE.Path(); archOpening(A.half, spring, A.top, STAGE_Y).forEach(([x, y], i) => (i ? hole.lineTo(x, y) : hole.moveTo(x, y)));
    hole.closePath();
    wallShape.holes.push(hole);
    const wall = slab(wallShape, 2, black, black, darkPlaster, 0.25, 24);
    wall.position.set(0, 0, A.z - 2);
    statics.add(wall);
    occluders.push(wall);
    // the gold frame: a deep moulded band round the opening, standing out into the house
    const frameShape = poly([[-A.frameHalf, STAGE_Y], [A.frameHalf, STAGE_Y], [A.frameHalf, A.frameTop], [-A.frameHalf, A.frameTop]]);
    const fh = new THREE.Path(); archOpening(A.half, spring, A.top, STAGE_Y).forEach(([x, y], i) => (i ? fh.lineTo(x, y) : fh.moveTo(x, y)));
    fh.closePath(); frameShape.holes.push(fh);
    const frame = slab(frameShape, 1.6, gold, gold, gold, 1, 24);
    frame.position.set(0, 0, A.z - 0.2);
    statics.add(frame);
    // moulding: gilt tubes along the inner and outer edges, and a fluted pilaster face either side
    const inner = archOpening(A.half + 0.5, spring + 0.2, A.top + 0.5, STAGE_Y).map(([x, y]) => V(x, y, A.z + 1.5));
    const innerCurve = new THREE.CatmullRomCurve3(inner, false, 'centripetal');
    statics.add(mesh(repeatUV(new THREE.TubeGeometry(innerCurve, 90, 0.55, 6, false), innerCurve.getLength() / 3, 1), giltMat));
    const outerPts = [V(-A.frameHalf + 0.6, STAGE_Y, A.z + 1.5), V(-A.frameHalf + 0.6, A.frameTop - 0.6, A.z + 1.5), V(A.frameHalf - 0.6, A.frameTop - 0.6, A.z + 1.5), V(A.frameHalf - 0.6, STAGE_Y, A.z + 1.5)];
    const outerCurve = new THREE.CatmullRomCurve3(outerPts, false, 'catmullrom', 0.01);
    statics.add(mesh(repeatUV(new THREE.TubeGeometry(outerCurve, 60, 0.45, 6, false), outerCurve.getLength() / 3, 1), giltMat));
    for (const s of [-1, 1]) {
      const px = s * (A.half + 3.5);
      const pil = boxAt(4.2, A.frameTop - STAGE_Y - 4, 0.4, px, (A.frameTop + STAGE_Y - 4) / 2, A.z + 1.55);
      statics.add(mesh(repeatUV(pil, 1, 1), giltMat));
      for (let k = -1; k <= 1; k++) statics.add(mesh(boxAt(0.35, A.frameTop - STAGE_Y - 7, 0.3, px + k * 1.2, (A.frameTop + STAGE_Y - 4) / 2, A.z + 1.8), gold));
      // capitals with a scroll each side, and a plinth
      statics.add(mesh(boxAt(5, 1.2, 1.2, px, A.frameTop - 4.6, A.z + 1.7), gold), mesh(boxAt(5, 2.2, 1.2, px, STAGE_Y + 1.1, A.z + 1.7), gold));
      for (const k of [-1, 1]) { const vol = new THREE.TorusGeometry(0.55, 0.22, 6, 14); vol.translate(px + k * 2.2, A.frameTop - 4.0, A.z + 2.0); statics.add(mesh(vol, giltMat)); }
    }
    // the cartouche over the arch: a gold oval with the masks of comedy and tragedy on it, and ribbons
    const cart = new THREE.Group();
    const oval = new THREE.Shape(); oval.absellipse(0, 0, 5.2, 3.6, 0, TAU, false, 0);
    const ov = slab(oval, 0.8, gold, gold, gold, 1, 32); cart.add(ov);
    const rim = new THREE.TorusGeometry(1, 0.22, 6, 40); rim.scale(5.2, 3.6, 1); rim.translate(0, 0, 0.85); cart.add(mesh(rim, giltMat));
    for (const s of [-1, 1]) {
      const rib = new THREE.Shape(); rib.moveTo(0, 0); rib.bezierCurveTo(s * 3, 1.2, s * 5, -1.4, s * 8, 0.2); rib.lineTo(s * 8.4, -1.2); rib.bezierCurveTo(s * 5, -2.6, s * 3, 0, 0, -1.2); rib.closePath();
      const r = slab(rib, 0.3, gold, gold, gold, 1, 12); r.position.set(s * 4.4, -1.6, 0.3); cart.add(r);
    }
    const masks: THREE.Mesh[] = [];
    (['comedy', 'tragedy'] as const).forEach((kind, i) => {
      const s = i === 0 ? -1 : 1;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.7, 28, 20), new THREE.MeshStandardMaterial({ map: maskFace(kind), metalness: 0.55, roughness: 0.4, emissive: 0x3a2808, emissiveIntensity: 0.4 }));
      m.scale.set(0.9, 1.15, 0.42);
      m.position.set(s * 1.75, 0.15, 1.2);
      m.rotation.set(0, s * 0.25, s * 0.18);
      cart.add(m); masks.push(m);
    });
    cart.position.set(0, A.frameTop - 2.2, A.z + 1.6);
    statics.add(cart);

    // the house curtain, drawn and tied back each side; the valance across the top with a gold fringe
    const curtainZ = A.z - 2.8;
    for (const s of [-1, 1]) {
      const cols = 26, rowsN = 24, folds = 7;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const hTop = A.top + 1, tieY = 8.5;
      for (let j = 0; j <= rowsN; j++) {
        const y = STAGE_Y + (j / rowsN) * (hTop - STAGE_Y);
        // the curtain's width at this height: wide at the top, pinched at the tie-back, spreading to the floor
        const w = y > tieY ? lerp(3.4, 10, Math.pow(clamp((y - tieY) / (hTop - tieY), 0, 1), 1.3)) : lerp(5.6, 3.4, smoothstep(STAGE_Y, tieY, y));
        for (let i = 0; i <= cols; i++) {
          const u = i / cols;
          const x = s * (A.half + 1.5 - u * w);
          const amp = 0.25 + 0.5 * (1 - Math.min(1, w / 10));
          pos.push(x, y, curtainZ + Math.sin(u * folds * TAU) * amp + (y < tieY ? (tieY - y) * 0.05 : 0));
          uv.push(u * folds / 4 * (w / 10 + 0.6), y / 6);
          if (i < cols && j < rowsN) { const a = j * (cols + 1) + i; idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      statics.add(mesh(g, velvetMat));
      // the tie-back: a gold cord and a tassel
      const cord = new THREE.TorusGeometry(1.9, 0.14, 6, 16); cord.scale(1, 0.5, 1); cord.translate(s * (A.half + 1.5 - 1.9), tieY, curtainZ + 0.3);
      const tas = new THREE.ConeGeometry(0.42, 1.4, 10); tas.translate(s * (A.half + 1.5 - 3.6), tieY - 1.1, curtainZ + 0.8);
      const knob = new THREE.SphereGeometry(0.34, 10, 8); knob.translate(s * (A.half + 1.5 - 3.6), tieY - 0.3, curtainZ + 0.8);
      statics.add(mesh(merge([cord, tas, knob]), gold));
    }
    {
      // valance: swags hanging between the tops of the curtains
      const cols = 120, rowsN = 6, swags = 5, W = (A.half + 1.5) * 2;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const fringe: number[] = [], fIdx: number[] = [], fUv: number[] = [];
      for (let j = 0; j <= rowsN; j++) for (let i = 0; i <= cols; i++) {
        const u = i / cols, x = -W / 2 + u * W;
        const sag = Math.sin(((u * swags) % 1) * Math.PI);
        const bottom = A.top - 1.2 - sag * 2.4;
        const y = lerp(bottom, A.top + 3, j / rowsN);
        pos.push(x, y, curtainZ + 0.6 + sag * 0.6 * (1 - j / rowsN) + Math.sin(u * swags * 9 * TAU) * 0.08);
        uv.push(u * W / 4, y / 6);
        if (i < cols && j < rowsN) { const a = j * (cols + 1) + i; idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1); }
        if (j === 0) { fringe.push(x, bottom + 0.05, curtainZ + 0.7 + sag * 0.6, x, bottom - 0.7, curtainZ + 0.7 + sag * 0.6); fUv.push(u * W / 3, 0, u * W / 3, 1); if (i < cols) { const a = i * 2; fIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      statics.add(mesh(g, velvetMat));
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fringe, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(fUv, 2));
      fg.setIndex(fIdx); fg.computeVertexNormals();
      statics.add(mesh(fg, new THREE.MeshStandardMaterial({ map: fringeTex(), metalness: 0.5, roughness: 0.5, emissive: 0x3a2808, emissiveIntensity: 0.4, side: THREE.DoubleSide, alphaTest: 0.5 })));
    }
  }

  // =====================================================================================================
  // THE STAGE HOUSE
  // =====================================================================================================
  const S = STAGE;
  // floor: bare black boards, and the painted floor cloth of sand over the middle
  {
    const fz = (S.z0 + S.back) / 2, fd = S.z0 - S.back;
    const fl = mesh(repeatUV(new THREE.PlaneGeometry(S.half * 2, fd), S.half * 2 / 8, fd / 8), boards, 0, STAGE_Y - 0.01, fz);
    fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; statics.add(fl);
    const cw = CLOTH.half * 2, cd = CLOTH.z0 - CLOTH.z1;
    const cloth = mesh(repeatUV(new THREE.PlaneGeometry(cw, cd), cw / 16, cd / 16), new THREE.MeshLambertMaterial({ map: floorCloth() }), 0, STAGE_Y + 0.01, (CLOTH.z0 + CLOTH.z1) / 2);
    cloth.rotation.x = -Math.PI / 2; cloth.receiveShadow = true; statics.add(cloth);
    // the cloth's hem, a little raised, and the battens tacked along its edges
    const hem = new THREE.MeshLambertMaterial({ color: 0xd8a888 });
    for (const s of [-1, 1]) statics.add(mesh(boxAt(0.5, 0.06, cd, s * CLOTH.half, STAGE_Y + 0.03, (CLOTH.z0 + CLOTH.z1) / 2), hem));
    statics.add(mesh(boxAt(cw, 0.06, 0.5, 0, STAGE_Y + 0.03, CLOTH.z0), hem));
  }

  // the cyclorama: a curved wall of painted sky round the sides and back; a night cloth over it fades in
  const cycGeo = (() => {
    const pts: THREE.Vector2[] = [];
    const R = S.cycR, cz = S.cycZ, zFront = S.z0 - 3;
    pts.push(new THREE.Vector2(-R, zFront));
    for (let i = 0; i <= 48; i++) { const a = Math.PI + (i / 48) * Math.PI; pts.push(new THREE.Vector2(Math.cos(a) * R, cz + Math.sin(a) * R)); }
    pts.push(new THREE.Vector2(R, zFront));
    let len = 0; const ls = [0];
    for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); ls.push(len); }
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const tile = len / 3;
    pts.forEach((p, i) => {
      pos.push(p.x, STAGE_Y - 0.5, p.y, p.x, S.grid, p.y);
      uv.push(ls[i] / tile, 0, ls[i] / tile, 1);
      if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  const cycDayMat = new THREE.MeshBasicMaterial({ map: cycDay(), side: THREE.DoubleSide, fog: false });
  const cycNightMat = new THREE.MeshBasicMaterial({ map: cycNight(), side: THREE.DoubleSide, fog: false, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const cyc = new THREE.Mesh(cycGeo, cycDayMat); cyc.userData.keep = true; live.add(cyc);
  const cycN = new THREE.Mesh(cycGeo, cycNightMat); cycN.userData.keep = true; cycN.renderOrder = 1; cycN.visible = false; live.add(cycN);
  const dayCol = new THREE.Color(1, 1, 1), duskCol = new THREE.Color(0.55, 0.62, 0.7);

  // the grid overhead: a dark ceiling, pipes, and sky borders hanging from it with rows of lanterns
  {
    const gz = (S.z0 + S.back) / 2, gd = S.z0 - S.back;
    const grid = mesh(new THREE.PlaneGeometry(S.half * 2, gd), new THREE.MeshLambertMaterial({ color: 0x1a1e24 }), 0, S.grid, gz);
    grid.rotation.x = Math.PI / 2; statics.add(grid);
    const pipes: THREE.BufferGeometry[] = [];
    for (let z = S.z0 - 8; z > S.back + 10; z -= 6) pipes.push(rodGeometry(V(-S.half, S.grid - 1.5, z), V(S.half, S.grid - 1.5, z), 0.12, 5));
    statics.add(mesh(merge(pipes), new THREE.MeshLambertMaterial({ color: 0x3a3e44 })));
  }
  const borderMat = new THREE.MeshBasicMaterial({ map: skyBorder(), side: THREE.DoubleSide, fog: false });
  const lanternBody: THREE.Matrix4[] = [];
  const BORDERS = [-1606, -1676, -1746, -1812];
  {
    const bw = S.half * 2 - 4, bh = 13, by = S.grid - bh / 2;
    const borderGeos: THREE.BufferGeometry[] = [], hems: THREE.BufferGeometry[] = [];
    for (const z of BORDERS) {
      const g = repeatUV(new THREE.PlaneGeometry(bw, bh), bw / 60, 1); g.translate((z % 7) * 9, by, z); borderGeos.push(g);
      hems.push(rodGeometry(V(-bw / 2, S.grid - bh + 0.1, z), V(bw / 2, S.grid - bh + 0.1, z), 0.15, 6));
      // a batten of lanterns just downstage of each border, aimed down at the stage
      for (let x = -76; x <= 76; x += 9.5) {
        const m = new THREE.Matrix4().compose(V(x, S.grid - bh - 1.6, z + 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.75, 0, 0)), new THREE.Vector3(1, 1, 1));
        lanternBody.push(m);
      }
      hems.push(rodGeometry(V(-80, S.grid - bh - 0.6, z + 2), V(80, S.grid - bh - 0.6, z + 2), 0.12, 6));
    }
    statics.add(mesh(merge(borderGeos), borderMat));
    statics.add(mesh(merge(hems), new THREE.MeshLambertMaterial({ color: 0x2a2e34 })));
  }
  // lanterns: a body with a yoke, and a lens that glows warm by day and blue by night
  const lensMat = glow(0xfff0c8, 1.4);
  {
    const body = merge([
      (() => { const g = new THREE.CylinderGeometry(0.5, 0.42, 1.3, 10); g.rotateX(Math.PI / 2); return g; })(),
      boxAt(1.3, 0.1, 0.12, 0, 0.75, 0), boxAt(0.1, 0.8, 0.12, -0.62, 0.35, 0), boxAt(0.1, 0.8, 0.12, 0.62, 0.35, 0),
      boxAt(0.7, 0.7, 0.06, 0, 0, 0.72),
    ]);
    // the lens faces +z: tilted down towards the house, so the rider sees the rows of lit lenses overhead
    const lens = new THREE.CircleGeometry(0.4, 12); lens.translate(0, 0, 0.73);
    const bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0x24262a }), lanternBody.length);
    const lenses = new THREE.InstancedMesh(lens, lensMat, lanternBody.length);
    lanternBody.forEach((m, i) => { bodies.setMatrixAt(i, m); lenses.setMatrixAt(i, m); });
    bodies.computeBoundingSphere(); lenses.computeBoundingSphere();
    bodies.userData.keep = true; lenses.userData.keep = true;
    live.add(bodies, lenses);
  }

  // the sun: a giant Fresnel lantern hanging in the painted sky, its lens glowing, a beam of light below it
  const sun = new THREE.Group();
  const sunLens = glow(0xfff2c0, 2.2);
  const sunHaloMat = new THREE.MeshBasicMaterial({ map: haloTex(), color: 0xffe8b0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  {
    const R = 4.6;
    const parts: THREE.BufferGeometry[] = [];
    const body = new THREE.CylinderGeometry(R, R * 0.9, 7, 24, 1, true); body.rotateX(Math.PI / 2); body.translate(0, 0, -3.5); parts.push(body);
    const backCap = new THREE.CircleGeometry(R * 0.9, 24); backCap.rotateY(Math.PI); backCap.translate(0, 0, -7); parts.push(backCap);
    for (let i = 0; i < 6; i++) { const rib = new THREE.TorusGeometry(R + 0.12, 0.18, 4, 32); rib.translate(0, 0, -1 - i * 1.1); parts.push(rib); }
    // yoke and a chain up to the grid
    parts.push(boxAt(R * 2 + 1.6, 0.5, 0.5, 0, R + 1.6, -3.5), boxAt(0.5, R + 1.8, 0.5, -R - 0.8, R / 2 + 0.7, -3.5), boxAt(0.5, R + 1.8, 0.5, R + 0.8, R / 2 + 0.7, -3.5));
    // barn doors round the front
    for (let i = 0; i < 4; i++) { const d = boxAt(R * 1.7, 0.12, 2.6, 0, R + 1.2, 1.1); d.rotateX(-0.35); d.rotateZ((i / 4) * TAU); parts.push(d); }
    sun.add(mesh(merge(parts), new THREE.MeshLambertMaterial({ color: 0x2c2e34, side: THREE.DoubleSide })));
    const lens = mesh(new THREE.CircleGeometry(R * 0.92, 36), sunLens, 0, 0, 0.05); sun.add(lens);
    // Fresnel rings on the lens
    for (let i = 1; i <= 3; i++) sun.add(mesh(new THREE.TorusGeometry(R * 0.22 * i, 0.06, 4, 40), glow(0xffe0a0, 1.1), 0, 0, 0.1));
    const halo = mesh(new THREE.PlaneGeometry(R * 7, R * 7), sunHaloMat, 0, 0, 0.3); halo.renderOrder = 2; sun.add(halo);
    sun.position.set(30, 36, -1824);
    sun.lookAt(V(4, 4, -1600));
    statics.add(sun);
    statics.add(mesh(rodGeometry(V(30, 40.6, -1826), V(30, S.grid, -1826), 0.2, 6), new THREE.MeshLambertMaterial({ color: 0x2c2e34 })));
  }
  const sunBeam = lightShaft(V(30, 33, -1820), V(10, STAGE_Y, -1760), 26, 0xffe8b8, 0.09);
  live.add(sunBeam);

  // the moon, a painted disc flown in on two wires at night; and stars hung on threads
  const moon = new THREE.Group();
  {
    moon.add(mesh(new THREE.CircleGeometry(5, 40), new THREE.MeshBasicMaterial({ map: moonFace(), transparent: true, fog: false })));
    moon.add(mesh(new THREE.CircleGeometry(5.2, 40), new THREE.MeshLambertMaterial({ color: 0x9a8a6a }), 0, 0, -0.05));
    const wires = merge([rodGeometry(V(-3, 3.8, 0), V(-3, 60, 0), 0.04, 4), rodGeometry(V(3, 3.8, 0), V(3, 60, 0), 0.04, 4)]);
    moon.add(mesh(wires, new THREE.MeshBasicMaterial({ color: 0x2a3a40 })));
    mergeStatic(moon);
    moon.position.set(-34, 92, -1818);
    moon.rotation.y = 0.15;
    live.add(moon);
  }
  const stars = new THREE.Group();
  const starMat = glow(0xfff4c0, 1.5);
  {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 0.45 : 1.1; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
    shape.closePath();
    const sg = new THREE.ShapeGeometry(shape);
    const starGeos: THREE.BufferGeometry[] = [], threads: THREE.BufferGeometry[] = [];
    const srng = new Rng(509);
    for (let i = 0; i < 16; i++) {
      const x = srng.range(-70, 70), y = srng.range(26, 46), z = srng.range(-1700, -1830), s = srng.range(0.7, 1.4);
      const g = sg.clone(); g.scale(s, s, s); g.rotateZ(srng.range(-0.3, 0.3)); g.translate(x, y, z); starGeos.push(g);
      threads.push(rodGeometry(V(x, y + 1.1 * s, z), V(x, y + 60, z), 0.025, 3));
    }
    stars.add(mesh(merge(starGeos), starMat), mesh(merge(threads), new THREE.MeshBasicMaterial({ color: 0x3a4a50 })));
    stars.position.y = 50;
    live.add(stars);
  }

  // the flats: mesas, buttes and cliffs painted on plywood, braced from behind with stage jacks and sandbags
  const paintA = new THREE.MeshLambertMaterial({ map: strata(411) }), paintB = new THREE.MeshLambertMaterial({ map: strata(415, 0.92) });
  {
    const woodGeo: THREE.BufferGeometry[] = [], bagGeo: THREE.BufferGeometry[] = [];
    const flats: Array<{ kind: 'mesa' | 'butte' | 'range' | 'cliff'; x0: number; x1: number; z: number; h: number; seed: number }> = [
      { kind: 'cliff', x0: -64, x1: -40, z: -1584, h: 24, seed: 1 }, { kind: 'cliff', x0: 40, x1: 64, z: -1584, h: 24, seed: 2 },
      { kind: 'mesa', x0: -96, x1: -44, z: -1632, h: 30, seed: 3 }, { kind: 'mesa', x0: 44, x1: 96, z: -1632, h: 30, seed: 4 },
      { kind: 'mesa', x0: -80, x1: -42, z: -1680, h: 17, seed: 5 },
      { kind: 'butte', x0: -104, x1: -46, z: -1742, h: 36, seed: 6 }, { kind: 'butte', x0: 52, x1: 108, z: -1742, h: 36, seed: 7 },
      { kind: 'range', x0: -112, x1: -24, z: -1798, h: 16, seed: 8 }, { kind: 'range', x0: 24, x1: 112, z: -1798, h: 16, seed: 9 },
    ];
    for (const f of flats) {
      const w = f.x1 - f.x0;
      let pts = mesaOutline(f.kind, w, f.h, 600 + f.seed);
      // cliffs turn their tall side towards the arch they stand by
      if (f.kind === 'cliff' && f.x0 > 0) pts = pts.map(([x, y]) => [w - x, y] as [number, number]).reverse();
      const geo = slabGeometry(poly(pts), 0.3, 6);
      const fl = new THREE.Mesh(geo, [ply, wood, f.seed % 2 ? paintA : paintB]);
      // the painted face uses the shape's units: one strata tile per 24 units
      const uvA = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) / 24, uvA.getY(i) / 24);
      fl.position.set(f.x0, STAGE_Y, f.z);
      statics.add(fl);
      occluders.push(fl);
      // jacks every six units behind it, at the height of the outline there
      const jw: THREE.BufferGeometry[] = [], jb: THREE.BufferGeometry[] = [];
      for (let x = 2; x < w - 1; x += 6) {
        const hAt = heightOf(pts, x) * 0.85;
        if (hAt > 2) jackParts(x, hAt, jw, jb);
      }
      for (const g of jw) { g.translate(f.x0, STAGE_Y, f.z); woodGeo.push(g); }
      for (const g of jb) { g.translate(f.x0, STAGE_Y, f.z); bagGeo.push(g); }
    }
    statics.add(castAll(mesh(merge(woodGeo), wood), true, true), mesh(merge(bagGeo), bagMat));
    // the ground row: low flats of distant hills along the foot of the cyclorama
    const ground: THREE.BufferGeometry[] = [];
    const gpts = mesaOutline('range', 30, 6, 77);
    const R = S.cycR - 8;
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI + (i / 14) * Math.PI;
      const g = slabGeometry(poly(gpts), 0.2, 4); g.translate(-15, 0, 0);
      g.rotateY(-a - Math.PI / 2);
      g.translate(Math.cos(a) * R, STAGE_Y, S.cycZ + Math.sin(a) * R);
      ground.push(g);
    }
    for (const s of [-1, 1]) for (let z = S.cycZ + 10; z < S.z0 - 30; z += 30) {
      const g = slabGeometry(poly(gpts), 0.2, 4); g.translate(-15, 0, 0); g.rotateY(s * -Math.PI / 2); g.translate(s * R, STAGE_Y, z); ground.push(g);
    }
    const gm = merge(ground);
    // a single painted colour: dusty salmon hills
    statics.add(mesh(gm, new THREE.MeshLambertMaterial({ color: 0xe0a890 })));
  }

  // the backstage side of the proscenium: a pin rail with rope lines and sandbag counterweights, the stage
  // manager's desk with its lamp and cue lights
  {
    const ropes: THREE.BufferGeometry[] = [], bags: THREE.BufferGeometry[] = [], rails: THREE.BufferGeometry[] = [];
    const rz = ARCH.z - 3;
    for (let i = 0; i < 30; i++) {
      const x = -36 - i * 0.6;
      ropes.push(rodGeometry(V(x, STAGE_Y + 3.4, rz), V(x, S.grid, rz), 0.05, 4));
      const by = STAGE_Y + 8 + ((i * 37) % 23);
      const b = new THREE.CylinderGeometry(0.35, 0.3, 1.1, 8); b.translate(x, by, rz + 0.4); bags.push(b);
    }
    rails.push(boxAt(19, 0.3, 0.5, -45, STAGE_Y + 3.4, rz), boxAt(19, 0.3, 0.5, -45, STAGE_Y + 1.6, rz));
    for (let i = 0; i < 30; i++) rails.push(cylAt(0.06, 0.06, 0.9, -36 - i * 0.6, STAGE_Y + 3.6, rz + 0.2, 4));
    statics.add(mesh(merge(ropes), new THREE.MeshLambertMaterial({ color: 0xd8c8a0 })), mesh(merge(bags), bagMat), mesh(merge(rails), wood));
    const desk = merge([boxAt(3.2, 0.12, 1.4, -31, STAGE_Y + 1.6, ARCH.z - 4), boxAt(0.12, 1.6, 1.4, -32.5, STAGE_Y + 0.8, ARCH.z - 4), boxAt(0.12, 1.6, 1.4, -29.5, STAGE_Y + 0.8, ARCH.z - 4), boxAt(3.2, 1.2, 0.1, -31, STAGE_Y + 2.2, ARCH.z - 3.4)]);
    statics.add(mesh(desk, wood));
    statics.add(mesh(boxAt(1.4, 0.05, 1.0, -31.4, STAGE_Y + 1.69, ARCH.z - 4.1), white));
    statics.add(mesh(new THREE.SphereGeometry(0.16, 8, 6).translate(-30.2, STAGE_Y + 2.95, ARCH.z - 3.3), glow(0x60ff80, 1.4)), mesh(new THREE.SphereGeometry(0.16, 8, 6).translate(-29.7, STAGE_Y + 2.95, ARCH.z - 3.3), glow(0xff5040, 1.4)));
    statics.add(mesh(new THREE.ConeGeometry(0.4, 0.4, 10, 1, true).translate(-32, STAGE_Y + 2.6, ARCH.z - 4), glow(0xfff0c0, 1.2)));
    // a ghost light (the bare bulb left on an empty stage) by the wall on the right
    statics.add(mesh(cylAt(0.05, 0.08, 4.5, 34, STAGE_Y + 2.25, ARCH.z - 4, 6), black), mesh(new THREE.SphereGeometry(0.3, 10, 8).translate(34, STAGE_Y + 4.7, ARCH.z - 4), glow(0xfff6e0, 1.8)));
    statics.add(mesh(cylAt(0.7, 0.8, 0.25, 34, STAGE_Y + 0.12, ARCH.z - 4, 10), black));
  }

  // ---------- the light cue ----------
  let lastNight = -1;
  const sunLensDay = new THREE.Color(0xfff2c0).multiplyScalar(2.2), sunLensNight = new THREE.Color(0x6a90b8).multiplyScalar(0.6);
  const lensDay = new THREE.Color(0xfff0c8).multiplyScalar(1.4), lensNight = new THREE.Color(0x5a8ae8).multiplyScalar(1.5);
  const shaft = sunBeam.userData.shaft as THREE.MeshBasicMaterial;
  return {
    statics, live, occluders,
    setNight(k) {
      if (Math.abs(k - lastNight) < 1e-4) return;
      lastNight = k;
      cycNightMat.opacity = k;
      cycN.visible = k > 0.002;
      cyc.visible = k < 0.998;
      cycDayMat.color.copy(dayCol).lerp(duskCol, k);
      sunLens.color.copy(sunLensDay).lerp(sunLensNight, k);
      sunHaloMat.opacity = 0.85 * (1 - k);
      shaft.opacity = 0.09 * (1 - k);
      sunBeam.visible = k < 0.99;
      lensMat.color.copy(lensDay).lerp(lensNight, k);
      borderMat.color.setRGB(1 - k * 0.86, 1 - k * 0.76, 1 - k * 0.72);
    },
    update(dt, t, _z, night) {
      // the moon and the stars come down on their lines when the lights go to night
      const k = smoothstep(0.35, 1, night);
      moon.position.y = lerp(92, 38, k * k * (3 - 2 * k)) + Math.sin(t * 0.7) * 0.15 * k;
      moon.rotation.z = Math.sin(t * 0.5) * 0.02 * k;
      stars.position.y = lerp(50, 0, smoothstep(0.5, 1, night));
      stars.rotation.z = 0;
      void dt;
    },
  };
}

/** Height of a flat's outline at x (the highest edge above that x). */
function heightOf(pts: Array<[number, number]>, x: number) {
  let best = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if ((x >= x0 && x <= x1) || (x >= x1 && x <= x0)) { const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0); best = Math.max(best, y0 + (y1 - y0) * t); }
  }
  return best;
}

let haloT: THREE.Texture | null = null;
/** A soft round glow for the sun lantern (additive). */
function haloTex() {
  if (haloT) return haloT;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(0.25, 'rgba(255,230,170,0.5)'); gr.addColorStop(0.6, 'rgba(255,220,160,0.12)'); gr.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  haloT = new THREE.CanvasTexture(c);
  haloT.colorSpace = THREE.SRGBColorSpace;
  return haloT;
}

/** A gold fringe: hanging threads in a band, transparent between them. */
function fringeTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8c060'; g.fillRect(0, 0, 128, 6);
  for (let x = 1; x < 128; x += 3) { g.fillStyle = x % 2 ? '#f4d47a' : '#b8902e'; g.fillRect(x, 6, 1.6, 22 + (x % 4)); }
  for (let x = 4; x < 128; x += 16) { g.fillStyle = '#f8e090'; g.beginPath(); g.arc(x, 28, 3, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** The balcony's front: a white balustrade, in greys. One tile = 4 units. */
function canvasBalustrade() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d8d6'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, 128, 8); g.fillRect(0, 54, 128, 10);
  for (let x = 8; x < 128; x += 16) { g.fillStyle = '#a8a8a6'; g.beginPath(); g.ellipse(x, 31, 4, 20, 0, 0, TAU); g.fill(); g.fillStyle = '#c8c8c6'; g.beginPath(); g.ellipse(x - 1, 29, 2, 16, 0, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

