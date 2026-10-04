import * as THREE from 'three';
import { box, cyl, sphere, mesh, canvasTexture, glow, toon } from '../../../engine/Builders';
import { repeatUV } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { facadeTile, stripes } from '../textures';
import { topiary } from '../kit';
import { FUTURA } from '../film';
import { STATION, TOWN_Y, VIADUCT, Y0 } from './plan';
import { balustrade, clockFace, enamelSign, fretBracket, GBH } from './textures';
import { shade, tbox, tplane, type HotelMats } from './mats';

/*
 * Nebelsbad station: a stone terrace above the model town, two platforms under pink canopies with scalloped
 * valances and hanging globes, twin clock towers with onion domes at the far end (they frame the hotel on
 * its cliff in the first view), and the station hall behind the train with the name and a big clock. Then
 * the stone viaduct over the town to the foot of the cliff.
 */

const S = STATION;

/** An onion dome: a lathe swelling out and drawing up to a point. r is the widest radius. */
export function onionGeometry(r: number, h: number, seg = 16) {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // radius: neck, swell to the widest at a third, then a long ogee up to the tip
    const rr = t < 0.32 ? r * (0.72 + 0.28 * Math.sin((t / 0.32) * Math.PI / 2)) : r * Math.pow(Math.cos(((t - 0.32) / 0.68) * Math.PI / 2), 1.6);
    pts.push(new THREE.Vector2(Math.max(0.001, rr), t * h));
  }
  return new THREE.LatheGeometry(pts, seg);
}

/** A finial: a gold ball and spike. */
function finial(mat: THREE.Material, s = 1) {
  const g = new THREE.Group();
  g.add(sphere(0.22 * s, mat, 0, 0.2 * s, 0, 10, 8), cyl(0.04 * s, 0.07 * s, 1.0 * s, mat, 0, 0.8 * s, 0, 6), sphere(0.1 * s, mat, 0, 1.35 * s, 0, 8, 6));
  return g;
}

/** A clock tower: stone pier from the town up to the terrace, a pink shaft, clocks on four faces, a belfry and an onion dome. */
function clockTower(m: HotelMats, clock: THREE.Material, nameMat: THREE.Material, side: number) {
  const g = new THREE.Group();
  const w = S.towerW, top = S.towerTop;
  g.add(tbox(w + 0.8, S.top - TOWN_Y + 0.5, w + 0.8, m.ashlar, 4, 0, (S.top + TOWN_Y - 0.5) / 2, 0, 2));
  g.add(tbox(w, top - S.top, w, m.pink, 3, 0, (top + S.top) / 2, 0));
  // quoins: cream strips up the corners
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) g.add(box(0.36, top - S.top, 0.36, m.cream, cx * (w / 2 - 0.1), (top + S.top) / 2, cz * (w / 2 - 0.1)));
  // cornices
  for (const [y, d] of [[S.top + 0.25, 0.5], [S.top + 6.4, 0.3], [top - 0.1, 0.5]] as const) g.add(box(w + d, 0.35, w + d, m.cream, 0, y, 0));
  // the clocks
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const f = new THREE.Group();
    f.add(mesh(new THREE.CircleGeometry(1.45, 32), clock, 0, 0, 0.02));
    const rim = mesh(new THREE.TorusGeometry(1.5, 0.12, 6, 32), m.gold);
    f.add(rim);
    f.position.set(Math.sin(a) * (w / 2 + 0.02), top - 2.9, Math.cos(a) * (w / 2 + 0.02));
    f.rotation.y = a;
    g.add(f);
  }
  // the station's name on the face towards the platforms (+z) and towards the track
  for (const a of [0, side > 0 ? -Math.PI / 2 : Math.PI / 2]) {
    const n = mesh(new THREE.PlaneGeometry(w - 0.6, 0.62), nameMat);
    n.position.set(Math.sin(a) * (w / 2 + 0.03), S.top + 5.4, Math.cos(a) * (w / 2 + 0.03));
    n.rotation.y = a;
    g.add(n);
  }
  // arched windows on the lower shaft
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const win = new THREE.Group();
    win.add(box(1.0, 2.0, 0.1, m.dark, 0, 0, 0));
    const arch = mesh(new THREE.CircleGeometry(0.5, 12, 0, Math.PI), m.dark, 0, 1.0, 0.05); win.add(arch);
    win.add(box(1.4, 0.16, 0.2, m.cream, 0, -1.1, 0.06));
    win.position.set(Math.sin(a) * (w / 2 + 0.02), S.top + 2.8, Math.cos(a) * (w / 2 + 0.02));
    win.rotation.y = a;
    g.add(win);
  }
  // the belfry: four columns and a dark inside, then the dome
  const by = top + 0.1;
  g.add(box(w - 1.2, 2.2, w - 1.2, m.dark, 0, by + 1.1, 0));
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) g.add(cyl(0.22, 0.26, 2.2, m.cream, cx * (w / 2 - 0.5), by + 1.1, cz * (w / 2 - 0.5), 8));
  g.add(box(w + 0.2, 0.4, w + 0.2, m.cream, 0, by + 2.4, 0));
  const dome = mesh(onionGeometry(2.3, 5.2, 16), m.roofLav, 0, by + 2.6, 0);
  g.add(dome);
  const f = finial(m.gold, 1.1); f.position.set(0, by + 7.6, 0); g.add(f);
  return g;
}

/** The pink delivery van from Mendl's, parked: rounded pink body, cream roof, the name in red script. */
export function mendlsVan() {
  const g = new THREE.Group();
  const pink = toon(0xf2b8c6), white = toon(0xfbf7f2), dark = toon(0x2a2c30), brass = toon(0xd8b25a);
  g.add(box(2.0, 1.6, 3.6, pink, 0, 1.3, -0.6));
  g.add(box(2.06, 0.18, 3.7, white, 0, 2.15, -0.6));
  g.add(box(2.05, 0.2, 3.65, white, 0, 0.62, -0.6));
  g.add(box(1.9, 1.1, 1.4, pink, 0, 1.05, 1.9));
  const cab = mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.9, 14, 1, false, 0, Math.PI), pink, 0, 1.6, 1.25);
  cab.rotation.z = Math.PI / 2; cab.scale.set(1, 1, 0.6); g.add(cab);
  g.add(box(1.7, 0.55, 0.05, new THREE.MeshLambertMaterial({ color: 0xcfe2ee, emissive: 0x405060 }), 0, 1.75, 1.83));
  g.add(box(1.95, 0.22, 0.25, brass, 0, 0.55, 2.62));
  g.add(box(1.0, 0.55, 0.05, dark, 0, 1.0, 2.62));
  for (const s of [-1, 1]) {
    for (const z of [-1.7, 1.7]) {
      const w = cyl(0.4, 0.4, 0.3, dark, s * 0.98, 0.42, z, 14); w.rotation.z = Math.PI / 2; g.add(w);
      const hub = cyl(0.17, 0.17, 0.32, white, s * 0.99, 0.42, z, 10); hub.rotation.z = Math.PI / 2; g.add(hub);
      // mudguards
      const mg = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.36, 12, 1, false, -Math.PI / 2, Math.PI), pink, s * 0.98, 0.45, z);
      mg.rotation.z = Math.PI / 2; mg.rotation.y = 0; g.add(mg);
    }
  }
  const name = canvasTexture(512, 160, (c) => {
    c.clearRect(0, 0, 512, 160);
    c.fillStyle = '#c8323c'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'italic bold 92px Georgia, serif'; c.fillText("Mendl's", 256, 70);
    c.font = `bold 22px ${FUTURA}`; c.fillStyle = '#5a8ac8'; c.fillText('PATISSERIE  ·  NEBELSBAD', 256, 132);
  });
  const nm = new THREE.MeshBasicMaterial({ map: name, transparent: true });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(3.0, 0.95), nm, s * 1.02, 1.35, -0.6); n.rotation.y = s * Math.PI / 2; g.add(n); }
  // a box on the roof rack, tied with blue ribbon
  g.add(box(0.8, 0.5, 0.8, pink, 0, 2.5, -1.2), box(0.82, 0.05, 0.1, toon(0x6a9fd8), 0, 2.76, -1.2), box(0.1, 0.05, 0.82, toon(0x6a9fd8), 0, 2.76, -1.2));
  const lights = [sphere(0.15, glow(0xfff2c0, 1.0), -0.68, 1.05, 2.64, 8, 6), sphere(0.15, glow(0xfff2c0, 1.0), 0.68, 1.05, 2.64, 8, 6)];
  shade(g, true, true);
  return { group: g, lights };
}

export interface Station {
  group: THREE.Group;
  /** where the people and the van go */
  spots: { conductor: THREE.Vector3; porter: THREE.Vector3; ladies: THREE.Vector3; gent: THREE.Vector3; van: THREE.Vector3 };
}

export function buildStation(m: HotelMats): Station {
  const g = new THREE.Group();
  const top = S.top;
  const clockMat = new THREE.MeshBasicMaterial({ map: clockFace() });
  const nameMat = new THREE.MeshBasicMaterial({ map: enamelSign('NEBELSBAD') });

  // ---------- the terrace: two blocks either side of the track, a lower one under it ----------
  const zMid = (S.terraceZ0 + S.terraceZ1) / 2, zLen = S.terraceZ0 - S.terraceZ1;
  for (const s of [-1, 1]) {
    const w = S.terraceHalf - S.edge;
    g.add(tbox(w, top - 0.1 - TOWN_Y + 1, zLen, m.ashlar, 4, s * (S.edge + w / 2), (top - 0.1 + TOWN_Y - 1) / 2, zMid, 2));
    // platform paving (under the canopies and swept beyond them) and snow at the sides
    g.add(tbox(S.outer - S.edge - 0.5, 0.12, S.z0 - S.z1, m.paving, 2, s * ((S.outer + S.edge + 0.5) / 2), top - 0.06, (S.z0 + S.z1) / 2));
    g.add(tbox(2.2, 0.16, S.canopyZ1 - S.z1, m.snow, 8, s * (S.outer - 0.9), top - 0.03, (S.canopyZ1 + S.z1) / 2));
    g.add(tbox(S.terraceHalf - S.outer, 0.14, zLen, m.snow, 8, s * ((S.terraceHalf + S.outer) / 2), top - 0.05, zMid));
    // the platform ends beyond the canopies, under snow
    g.add(tbox(S.outer - S.edge - 0.5, 0.12, S.z1 - S.terraceZ1, m.snow, 8, s * ((S.outer + S.edge + 0.5) / 2), top - 0.05, (S.z1 + S.terraceZ1) / 2));
    g.add(tbox(S.outer - S.edge - 0.5, 0.12, S.terraceZ0 - S.z0, m.snow, 8, s * ((S.outer + S.edge + 0.5) / 2), top - 0.05, (S.terraceZ0 + S.z0) / 2));
    // the coping along the platform edge: a cream slab overhanging the track a little
    g.add(box(0.6, 0.16, zLen, m.cream, s * (S.edge + 0.22), top - 0.02, zMid));
    g.add(box(0.06, 0.03, zLen, toon(0xe8c04a), s * (S.edge + 0.62), top + 0.065, zMid));
    // balustrade along the outer edge
    const bal = tplane(zLen, 1.2, new THREE.MeshLambertMaterial({ map: balustrade(GBH.cream, GBH.cream), alphaTest: 0.5, side: THREE.DoubleSide }), 2.4, 1.2);
    bal.rotation.y = Math.PI / 2; bal.position.set(s * (S.terraceHalf - 0.15), top + 0.6, zMid);
    g.add(bal);
    g.add(box(0.4, 0.14, zLen, m.cream, s * (S.terraceHalf - 0.15), top + 1.22, zMid));
  }
  g.add(tbox(S.edge * 2, Y0 - 0.55 - TOWN_Y + 1, zLen, m.ashlarDark, 4, 0, (Y0 - 0.55 + TOWN_Y - 1) / 2, zMid, 2));
  // the terrace's front wall faces the town: a cornice along its top
  g.add(box(S.terraceHalf * 2 + 0.6, 0.4, 0.6, m.cream, 0, top - 0.1, S.terraceZ1 + 0.1));

  // ---------- the canopies ----------
  const colGeo = new THREE.CylinderGeometry(0.13, 0.15, S.canopyY - top - 0.3, 8);
  const fret = new THREE.MeshLambertMaterial({ map: fretBracket(GBH.cream), alphaTest: 0.5, side: THREE.DoubleSide });
  const boards = new THREE.MeshLambertMaterial({ map: stripes(GBH.cream, GBH.pink, 6) });
  boards.map!.wrapS = boards.map!.wrapT = THREE.RepeatWrapping;
  for (const s of [-1, 1]) {
    for (const z of S.colZ) {
      const x = s * S.colX;
      g.add(mesh(colGeo, m.cream, x, (S.canopyY - 0.3 + top) / 2, z));
      g.add(cyl(0.28, 0.3, 0.3, m.pinkDeep, x, top + 0.15, z, 8), cyl(0.3, 0.16, 0.36, m.pinkDeep, x, S.canopyY - 0.45, z, 8));
      // fretwork brackets either side of the column, under the roof
      for (const d of [-1, 1]) {
        const b = mesh(new THREE.PlaneGeometry(1.5, 1.5), fret, x + d * 0.8, S.canopyY - 1.05, z);
        if (d < 0) b.scale.x = -1;
        g.add(b);
      }
    }
    // roof: a shallow slab, boards underneath, snow on top, lifting a little towards the track
    const cw = S.outer + 0.4 - (S.edge + 0.2), cx = s * (S.edge + 0.2 + cw / 2), cz0 = S.canopyZ0, cz1 = S.canopyZ1, cl = cz0 - cz1;
    const under = mesh(repeatUV(new THREE.PlaneGeometry(cw, cl), 1, cl / 4), boards, cx, S.canopyY - 0.18, (cz0 + cz1) / 2);
    under.rotation.x = Math.PI / 2; under.rotation.y = 0;
    g.add(under);
    g.add(tbox(cw, 0.3, cl, m.cream, 3, cx, S.canopyY, (cz0 + cz1) / 2));
    const snowTop = tbox(cw + 0.1, 0.18, cl + 0.1, m.snow, 8, cx, S.canopyY + 0.22, (cz0 + cz1) / 2);
    g.add(snowTop);
    // scalloped valances along both long edges and across the ends
    for (const ex of [S.edge + 0.15, S.outer + 0.45]) {
      const v = mesh(repeatUV(new THREE.PlaneGeometry(cl, 0.75), cl / 0.9, 1), m.scallop, s * ex, S.canopyY - 0.48, (cz0 + cz1) / 2);
      v.rotation.y = Math.PI / 2; g.add(v);
    }
    for (const ez of [cz0, cz1]) {
      const v = mesh(repeatUV(new THREE.PlaneGeometry(cw, 0.75), cw / 0.9, 1), m.scallop, cx, S.canopyY - 0.48, ez);
      g.add(v);
    }
    // hanging globes over the platform edge
    for (let i = 0; i < S.colZ.length; i++) {
      const z = S.colZ[i] + 4, x = s * (S.edge + 1.5);
      g.add(cyl(0.025, 0.025, 1.0, m.iron, x, S.canopyY - 0.7, z, 5));
      g.add(cyl(0.16, 0.24, 0.18, m.brass, x, S.canopyY - 1.25, z, 10));
      g.add(sphere(0.3, m.lamp, x, S.canopyY - 1.6, z, 12, 10));
    }
    // lamp standards on the open ends of the platforms
    for (const z of [24, 13]) {
      const x = s * (S.edge + 2.2);
      g.add(cyl(0.07, 0.11, 4.2, m.iron, x, top + 2.1, z, 8), cyl(0.24, 0.3, 0.3, m.iron, x, top + 0.15, z, 8));
      g.add(cyl(0.12, 0.2, 0.2, m.brass, x, top + 4.25, z, 8), sphere(0.32, m.lamp, x, top + 4.6, z, 12, 10));
    }
    // benches against the outer edge, facing the track
    for (const z of s < 0 ? [50, 18] : [58, 34]) {
      const b = new THREE.Group();
      b.add(box(0.5, 0.08, 2.4, m.wood, 0, 0.5, 0), box(0.08, 0.5, 2.4, m.wood, -0.27, 0.85, 0));
      for (const dz of [-1.0, 1.0]) b.add(box(0.5, 0.5, 0.08, m.iron, 0, 0.25, dz), box(0.08, 0.6, 0.08, m.iron, -0.27, 0.8, dz));
      b.position.set(s * (S.outer - 1.0), top, z);
      if (s > 0) b.rotation.y = Math.PI;
      g.add(b);
    }
    // the station's name on enamel boards on two posts
    const sign = new THREE.Group();
    sign.add(mesh(new THREE.PlaneGeometry(3.4, 0.64), nameMat, 0, 0, 0.04));
    sign.add(box(3.6, 0.8, 0.06, m.cream, 0, 0, 0));
    for (const dx of [-1.5, 1.5]) sign.add(cyl(0.06, 0.07, 2.8, m.iron, dx, -1.2, -0.06, 6));
    sign.position.set(s * (S.outer - 0.4), top + 2.6, 38);
    sign.rotation.y = -s * Math.PI / 2;
    g.add(sign);
    // tubs of snowy topiary at the platforms' ends
    for (const z of [74.5, 9.5]) {
      const t = topiary('cone', 0x5f8a6c, 0xf0dcd0);
      t.position.set(s * 8.6, top, z);
      g.add(t);
      g.add(cone2(m.snow, s * 8.6, top + 3.0, z));
    }
  }

  // ---------- the twin clock towers ----------
  for (const s of [-1, 1]) {
    const t = clockTower(m, clockMat, nameMat, s);
    t.position.set(s * S.towerX, 0, S.towerZ);
    g.add(t);
  }

  // ---------- the station hall behind the train ----------
  {
    const hz = S.hallZ, hw = S.terraceHalf, hh = 15.6;
    const ft = facadeTile({ wall: GBH.pink, frame: GBH.white, curtain: 0xf4dce0, cornice: GBH.white, pilaster: 0xf7c6d2, arch: true, bays: 4, storeys: 2, lit: 0.45, seed: 31 });
    const facade = new THREE.MeshLambertMaterial({ map: ft.map, emissive: 0xffdcb0, emissiveMap: ft.emissive, emissiveIntensity: 0.6 });
    // the two halves of the front either side of the great arch, and the band above it
    const archHalf = 4.6, archTop = top + 8.4;
    for (const s of [-1, 1]) {
      const w = hw - archHalf;
      g.add(tbox(w, hh, 12, facade, 9.6, s * (archHalf + w / 2), top + hh / 2, hz + 6, 6.8));
    }
    g.add(tbox(archHalf * 2, top + hh - archTop, 12, m.pink, 3, 0, (archTop + top + hh) / 2, hz + 6));
    // the arch: a cream surround and a dark inside where the track runs in
    const ring = mesh(new THREE.TorusGeometry(archHalf - 0.1, 0.45, 8, 24, Math.PI), m.cream, 0, archTop - archHalf + 0.2, hz - 0.1);
    g.add(ring);
    for (const s of [-1, 1]) g.add(box(0.9, archTop - archHalf + 0.2 - top, 0.9, m.cream, s * (archHalf - 0.1), (archTop - archHalf + 0.2 + top) / 2, hz - 0.1));
    g.add(box(archHalf * 2, archTop - top, 0.2, toon(0x2a1c22), 0, (archTop + top) / 2, hz + 9));
    const inner = mesh(new THREE.CircleGeometry(archHalf, 20, 0, Math.PI), toon(0x2a1c22), 0, archTop - archHalf + 0.2, hz + 0.2);
    inner.rotation.y = Math.PI; g.add(inner);
    // the name over the arch, a cornice, and a pediment with the big clock
    const nameBand = mesh(new THREE.PlaneGeometry(12, 1.3), new THREE.MeshBasicMaterial({ map: hallName() }), 0, archTop + 1.3, hz - 0.06);
    nameBand.rotation.y = Math.PI; g.add(nameBand);
    g.add(box(hw * 2 + 0.8, 0.6, 12.8, m.cream, 0, top + hh + 0.3, hz + 6));
    const ped = new THREE.Shape(); ped.moveTo(-8, 0); ped.lineTo(8, 0); ped.lineTo(0, 4.6); ped.closePath();
    const pg = mesh(new THREE.ExtrudeGeometry(ped, { depth: 1.2, bevelEnabled: false }), m.cream, 0, top + hh + 0.5, hz - 0.6);
    g.add(pg);
    const pin = new THREE.Shape(); pin.moveTo(-6.8, 0); pin.lineTo(6.8, 0); pin.lineTo(0, 3.7); pin.closePath();
    const pi = mesh(new THREE.ShapeGeometry(pin), m.pink, 0, top + hh + 0.75, hz - 0.62); pi.rotation.y = Math.PI; g.add(pi);
    const bigClock = new THREE.Group();
    bigClock.add(mesh(new THREE.CircleGeometry(1.6, 32), clockMat), mesh(new THREE.TorusGeometry(1.65, 0.14, 6, 32), m.gold));
    bigClock.position.set(0, top + hh + 2.0, hz - 0.68); bigClock.rotation.y = Math.PI;
    g.add(bigClock);
    // a mansard behind, under snow, with two little domes at the corners
    const roof = mesh(new THREE.CylinderGeometry(hw * 1.2, hw * 1.45, 4, 4, 1).rotateY(Math.PI / 4), m.roof, 0, top + hh + 2.6, hz + 6);
    roof.scale.set(1, 1, 0.37); g.add(roof);
    g.add(box(hw * 1.2, 0.3, 4.4, m.snow, 0, top + hh + 4.7, hz + 6));
    for (const s of [-1, 1]) {
      g.add(tbox(3.4, 3.2, 3.4, m.pink, 3, s * (hw - 1.7), top + hh + 1.6, hz + 1.7));
      g.add(box(3.8, 0.3, 3.8, m.cream, s * (hw - 1.7), top + hh + 3.3, hz + 1.7));
      g.add(mesh(onionGeometry(1.7, 3.6, 14), m.roofLav, s * (hw - 1.7), top + hh + 3.4, hz + 1.7));
      const f = finial(m.gold, 0.8); f.position.set(s * (hw - 1.7), top + hh + 6.9, hz + 1.7); g.add(f);
    }
    // a red and white awning over each side door
    for (const s of [-1, 1]) {
      const aw = mesh(new THREE.PlaneGeometry(4.2, 1.6), m.awning, s * 10.5, top + 3.6, hz - 0.8);
      aw.rotation.x = 0.7; aw.rotation.y = Math.PI; g.add(aw);
      g.add(box(2.0, 3.0, 0.1, toon(0x5a2a30), s * 10.5, top + 1.5, hz - 0.05));
    }
  }

  // ---------- the viaduct over the town ----------
  {
    const z0 = S.terraceZ1, z1 = VIADUCT.z1, half = VIADUCT.half;
    // the arcade in profile: the shape's x is -z (so it turns the right way round), extruded across the track
    const shape = new THREE.Shape();
    const yb = TOWN_Y - 1, yt = Y0 - 0.55, X = (z: number) => -z;
    shape.moveTo(X(z0), yb - 0.6); shape.lineTo(X(z1), yb - 0.6); shape.lineTo(X(z1), yt); shape.lineTo(X(z0), yt); shape.closePath();
    const span = (z0 - z1) / 4;
    for (let i = 0; i < 4; i++) {
      const a = X(z0 - i * span - 1.2), b = X(z0 - (i + 1) * span + 1.2), r = (b - a) / 2, cy = yt - 2.4 - r;
      const hole = new THREE.Path();
      hole.moveTo(a, yb); hole.lineTo(a, cy); hole.absarc((a + b) / 2, cy, r, Math.PI, 0, true); hole.lineTo(b, yb); hole.closePath();
      shape.holes.push(hole);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: half * 2 - 0.4, bevelEnabled: false, curveSegments: 10 });
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 2);
    geo.rotateY(Math.PI / 2);
    geo.translate(-(half - 0.2), 0, 0);
    g.add(mesh(geo, m.ashlar));
    // parapets with a cream coping, and lamps
    for (const s of [-1, 1]) {
      g.add(tbox(0.5, 1.1, z0 - z1, m.ashlar, 4, s * half, Y0 + 0.0, (z0 + z1) / 2, 2));
      g.add(box(0.75, 0.16, z0 - z1, m.cream, s * half, Y0 + 0.6, (z0 + z1) / 2));
      g.add(box(0.7, 0.4, z0 - z1, m.cream, s * (half - 0.05), Y0 - 0.55, (z0 + z1) / 2));
      for (let z = z0 - 6; z > z1 + 2; z -= 12) {
        g.add(cyl(0.06, 0.09, 3.4, m.iron, s * half, Y0 + 2.3, z, 6), cyl(0.16, 0.12, 0.14, m.brass, s * half, Y0 + 4.0, z, 8));
        g.add(sphere(0.26, m.lamp, s * half, Y0 + 4.3, z, 10, 8));
      }
    }
    // the deck under the track bed
    g.add(tbox(half * 2 - 0.2, 0.3, z0 - z1, m.ashlarDark, 4, 0, Y0 - 0.7, (z0 + z1) / 2, 2));
  }

  shade(g, true, true);
  const spots = {
    conductor: new THREE.Vector3(4.2, top, 28.5),
    porter: new THREE.Vector3(-4.6, top, 31),
    ladies: new THREE.Vector3(-7.4, top, 19.5),
    gent: new THREE.Vector3(8.2, top, 44),
    van: new THREE.Vector3(-13.8, top, 30),
  };
  return { group: g, spots };
}

/** A cap of snow on a topiary cone. */
function cone2(mat: THREE.Material, x: number, y: number, z: number) {
  const c = mesh(new THREE.ConeGeometry(0.42, 0.9, 10), mat, x, y, z);
  return c;
}

/** "NEBELSBAD" in gold capitals on a burgundy band, for the hall over the arch. */
function hallName() {
  return canvasTexture(1024, 112, (c) => {
    c.fillStyle = '#7a2236'; c.fillRect(0, 0, 1024, 112);
    c.strokeStyle = '#d8b25a'; c.lineWidth = 4; c.strokeRect(8, 8, 1008, 96);
    c.fillStyle = '#f0d27a'; c.font = `bold 66px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const t = 'N E B E L S B A D   H A U P T B A H N H O F';
    c.fillText(t, 512, 60);
  });
}
