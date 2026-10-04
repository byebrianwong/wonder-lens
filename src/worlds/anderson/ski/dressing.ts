import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cone, cyl, mesh, sphere, toon } from '../../../engine/Builders';
import { Painter, boxUV } from '../../../engine/Paint';
import { Rng, fbm, lerp } from '../../../engine/math';
import { planks } from '../textures';
import { PAL } from '../kit';
import { CH_OUT, PROM, SPOT, Z, type Plan } from './plan';
import { signTexture } from './textures';
import { flagpole } from './summit';
import { makeCrowd, makeJudges, type Crowd, type Judges } from './creatures';

/*
 * Everything along the descent that is not the run itself: flags and curve boards beside the channel, the
 * ski jump's banner arch, flags at its lip, the landing hill's painted distance lines and fir-branch edges,
 * the wooden stands with their crowd, the judges' box, the ibex's crag, and the snow cornice at the cliff edge.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A board on two posts, its face towards +z. */
function postSign(tex: THREE.Texture, w: number, h: number, postH: number, postMat: THREE.Material) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(cyl(0.07, 0.08, postH + h, postMat, s * (w / 2 - 0.15), (postH + h) / 2, -0.05, 6));
  g.add(box(w + 0.16, h + 0.16, 0.08, toon(0xf6efe2), 0, postH + h / 2, -0.02));
  g.add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }), 0, postH + h / 2, 0.03));
  return g;
}

export interface Dressing {
  statics: THREE.Group;
  live: THREE.Group;
  flags: THREE.Object3D[];
  crowd: Crowd;
  judges: Judges;
  /** where the ibex stands (the top of its crag) */
  ibexSpot: THREE.Vector3;
  /** the ski jump's photo anchor (over the landing hill) */
  jumpAnchor: THREE.Object3D;
}

export function buildDressing(plan: Plan, ground: (x: number, z: number) => number, lowDetail: boolean): Dressing {
  const { road } = plan;
  const statics = new THREE.Group(), live = new THREE.Group();
  const flags: THREE.Object3D[] = [];
  const rng = new Rng(1101);
  const post = toon(0x7a4a30);
  const at = (z: number, lat: number, yOff = 0) => road.side(z, lat, yOff);
  const placeFace = (o: THREE.Object3D, z: number, lat: number, y: number) => {
    // face back up the run (towards the rider coming down)
    const p = at(z, lat);
    o.position.set(p.x, y, p.z);
    o.rotation.y = road.along(z) + Math.PI;
    return o;
  };

  // ---------- flags on the banks of the channel, and boards at the curves ----------
  const cols: Array<[number, number]> = [[0xc8323c, 0xf6efe2], [0x5d3a8a, 0xf2b8c6], [0x2a3a6a, 0xf6efe2], [0xf2b8c6, 0x7a2a36]];
  let fi = 0;
  for (let z = Z.chan0 - 12; z > Z.chan1 + 6; z -= 13) {
    for (const s of [-1, 1]) {
      const lat = s * (CH_OUT + 1.7);
      const p = at(z, lat);
      const [a, b] = cols[fi++ % cols.length];
      const fp = flagpole(5.2, a, b, 'stripe');
      fp.group.position.set(p.x, ground(p.x, p.z) - 0.2, p.z);
      fp.group.rotation.y = road.along(z) + (s > 0 ? Math.PI : 0) + Math.PI / 2 + 0.3;
      // these whip past too fast to see them flutter: they merge with the rest of the scenery
      fp.flag.traverse((o) => { o.userData.keep = false; });
      statics.add(fp.group);
    }
  }
  const curveBoard = (z: number, s: number, text: string) => {
    const lat = s * (CH_OUT + 3.2);
    const p = at(z, lat);
    const sg = postSign(signTexture(text, { bg: '#7a2a36', fg: '#f6efe2', w: 512, h: 160, sub: 'Bobbahn Gabelmeister' }), 2.6, 0.8, 1.6, post);
    placeFace(sg, z, lat, ground(p.x, p.z) - 0.1);
    statics.add(sg);
  };
  curveBoard(-626, 1, 'KURVE 1');
  curveBoard(-672, -1, 'KURVE 2');

  // ---------- the ski jump: the banner over the start of the in-run, flags at its lip ----------
  {
    const z = Z.ramp0 + 1;
    const g = new THREE.Group();
    const pole = new THREE.MeshLambertMaterial({ map: (() => { const p = new Painter(16, 64, 1102).fill('#fbf8f4'); p.g.fillStyle = '#5d3a8a'; for (let y = 0; y < 64; y += 32) p.g.fillRect(0, y, 16, 16); return p.texture({ repeat: [1, 1] }); })() });
    for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 7.4, 10), pole); c.position.set(s * 3.5, 3.7, 0); g.add(c); g.add(sphere(0.3, toon(PAL.brass), s * 3.5, 7.5, 0, 10, 8)); }
    const board = new THREE.Group();
    board.add(box(6.9, 1.35, 0.12, toon(0xf6efe2), 0, 0, -0.07));
    board.add(mesh(new THREE.PlaneGeometry(6.7, 1.15), new THREE.MeshLambertMaterial({ map: signTexture('SPRUNGSCHANZE', { bg: '#5d3a8a', fg: '#fbe8c8', w: 1024, h: 176, sub: 'Hans Gabelmeister Memorial' }) }), 0, 0, 0.0));
    board.position.y = 6.5;
    g.add(board);
    const p = road.at(z);
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = road.along(z) + Math.PI;
    statics.add(g);
    // two tall flags either side of the lip
    for (const s of [-1, 1]) {
      const q = at(Z.lip + 1, s * 3.4, 0);
      const fp = flagpole(8.5, s < 0 ? 0xc8323c : 0x5d3a8a, 0xf6efe2, 'keys');
      fp.group.position.copy(q).setY(road.at(Z.lip + 1).y - 0.2);
      fp.group.scale.setScalar(1.25);
      fp.group.rotation.y = road.along(Z.lip) + Math.PI / 2;
      statics.add(fp.group);
      flags.push(fp.flag);
    }
    // little pennants along the in-run's side boards
    const penM = [toon(0xc8323c), toon(0xf6efe2), toon(0xf2b8c6), toon(0x6a9fd8)];
    let k = 0;
    for (let zz = Z.ramp0 - 2; zz > Z.lip + 1; zz -= 2.6) {
      for (const s of [-1, 1]) {
        const q = at(zz, s * 2.62, 1.0);
        statics.add(cyl(0.02, 0.02, 0.9, post, q.x, q.y + 0.45, q.z, 4));
        const pen = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 3), penM[k++ % 4]);
        pen.rotation.set(0, road.along(zz), Math.PI / 2);
        pen.position.set(q.x, q.y + 0.75, q.z - 0.25);
        statics.add(pen);
      }
    }
  }

  // ---------- the landing hill: painted distance lines, a red K line, fir branches along the edges ----------
  {
    const lineGeo: THREE.BufferGeometry[] = [], redGeo: THREE.BufferGeometry[] = [];
    const across = (z: number, half: number, w: number) => {
      const n = 18, pos: number[] = [], idx: number[] = [];
      for (let i = 0; i <= n; i++) {
        const lat = -half + (2 * half * i) / n;
        for (const dz of [-w / 2, w / 2]) { const p = at(z + dz, lat); pos.push(p.x, ground(p.x, p.z) + 0.06, p.z); }
        if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g.toNonIndexed();
    };
    for (let z = Z.lip - 12; z > Z.touch - 14; z -= 5) lineGeo.push(across(z, 8.5, 0.35));
    redGeo.push(across(Z.touch - 1, 9, 0.6));
    const lines = new THREE.Mesh(mergeGeometries(lineGeo, false)!, new THREE.MeshLambertMaterial({ color: 0x6a8ad8 }));
    const red = new THREE.Mesh(mergeGeometries(redGeo, false)!, new THREE.MeshLambertMaterial({ color: 0xc8323c }));
    lines.receiveShadow = red.receiveShadow = true;
    statics.add(lines, red);
    // fir branches stuck in the snow along both edges, the way real jumps are marked
    const br: THREE.BufferGeometry[] = [];
    for (let z = Z.lip - 6; z > Z.touch - 26; z -= 1.6) {
      for (const s of [-1, 1]) {
        const p = at(z, s * 9.4);
        const c = new THREE.ConeGeometry(0.35, 1.1, 5);
        c.rotateZ(s * 0.25); c.translate(p.x, ground(p.x, p.z) + 0.45, p.z);
        br.push(c.toNonIndexed());
      }
    }
    const branches = new THREE.Mesh(mergeGeometries(br, false)!, toon(0x2c5848));
    branches.castShadow = true;
    statics.add(branches);
  }

  // ---------- the stands either side of the landing hill, and the crowd ----------
  const crowdSpots: Array<{ pos: THREE.Vector3; yaw: number }> = [];
  {
    const wood = new THREE.MeshLambertMaterial({ map: planks(0x9a6038, 1103) });
    const rail = toon(0xf6efe2);
    for (const s of [-1, 1]) {
      const za = -748, zb = -790;
      for (let tier = 0; tier < 3; tier++) {
        const lat = s * (13.5 + tier * 1.6);
        for (let z = za; z > zb; z -= 6) {
          const z2 = z - 6;
          const p1 = at(z, lat), p2 = at(z2, lat);
          const yTop = Math.max(ground(p1.x, p1.z), ground(p2.x, p2.z)) + 0.5 + tier * 0.9;
          const yBot = Math.min(ground(p1.x, p1.z), ground(p2.x, p2.z)) - 1.5;
          const mid = p1.clone().lerp(p2, 0.5);
          const len = p1.distanceTo(p2);
          const step = new THREE.Mesh(boxUV(new THREE.BoxGeometry(1.6, yTop - yBot, len + 0.05), 1, 1), wood);
          step.position.set(mid.x, (yTop + yBot) / 2, mid.z);
          step.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z);
          statics.add(step);
          // spectators along each tier, facing the hill
          for (let k = 0; k < 4; k++) {
            if (lowDetail && k % 2) continue;
            const q = p1.clone().lerp(p2, (k + 0.5 + rng.range(-0.2, 0.2)) / 4);
            crowdSpots.push({ pos: V(q.x + rng.range(-0.2, 0.2), yTop, q.z), yaw: road.along(z) + (s > 0 ? -Math.PI / 2 : Math.PI / 2) + rng.range(-0.3, 0.3) });
          }
        }
      }
      // a white rail along the front of the stands
      const r0 = at(-748, s * 12.6), r1 = at(-790, s * 12.6);
      const rl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, r0.distanceTo(r1)), rail);
      rl.position.copy(r0.clone().lerp(r1, 0.5)); rl.position.y = ground(rl.position.x, rl.position.z) + 1.4;
      rl.rotation.y = Math.atan2(r1.x - r0.x, r1.z - r0.z);
      statics.add(rl);
      for (let z = -748; z > -791; z -= 3) { const q = at(z, s * 12.6); statics.add(cyl(0.06, 0.06, 1.5, rail, q.x, ground(q.x, q.z) + 0.65, q.z, 5)); }
    }
  }
  const crowd = makeCrowd(crowdSpots);
  live.add(crowd.group);

  // ---------- the judges' box on the left of the landing hill ----------
  const judges = makeJudges();
  {
    const p = at(-760, -24);
    judges.group.position.set(p.x, ground(p.x, p.z) - 0.3, p.z);
    // facing the landing hill
    judges.group.rotation.y = road.along(-760) + Math.PI / 2 + 0.35;
    live.add(judges.group);
  }

  // ---------- the ibex's crag beside the outrun ----------
  const ibexSpot = new THREE.Vector3();
  {
    const base = SPOT.ibex.clone();
    base.y = ground(base.x, base.z);
    const rockM = new THREE.MeshLambertMaterial({ color: 0x9890ae, flatShading: true });
    const capM = new THREE.MeshLambertMaterial({ color: 0xf8f6fc });
    const parts: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = [];
    const lump = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const g = new THREE.DodecahedronGeometry(1, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const k = 0.8 + fbm(p.getX(i) * 2 + x, p.getZ(i) * 2 + y, 2) * 0.4; p.setXYZ(i, p.getX(i) * k * sx, p.getY(i) * k * sy, p.getZ(i) * k * sz); }
      g.translate(x, y, z); g.computeVertexNormals();
      parts.push(g);
    };
    lump(base.x, base.y + 2.5, base.z, 4.2, 4.5, 3.8);
    lump(base.x + 1.2, base.y + 6.5, base.z - 0.6, 2.6, 2.4, 2.4);
    lump(base.x - 2.6, base.y + 1.2, base.z + 2.2, 2.4, 2.2, 2.2);
    const cap = new THREE.SphereGeometry(2.3, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45); cap.scale(1, 0.4, 1); cap.translate(base.x + 1.2, base.y + 8.4, base.z - 0.6);
    caps.push(cap.toNonIndexed());
    const rocks = new THREE.Mesh(mergeGeometries(parts, false)!, rockM); rocks.castShadow = true; rocks.receiveShadow = true;
    const snow = new THREE.Mesh(mergeGeometries(caps, false)!, capM); snow.receiveShadow = true;
    statics.add(rocks, snow);
    ibexSpot.set(base.x + 1.2, base.y + 8.75, base.z - 0.6);
  }

  // ---------- a rolled lip of snow along the cliff edge and round the promontory ----------
  {
    const parts: THREE.BufferGeometry[] = [];
    /** a lip from (xa, za) to (xb, zb), lying on the snow just inside the edge (offset (ix, iz) inwards) */
    const lip = (xa: number, za: number, xb: number, zb: number, ix: number, iz: number, seed: number) => {
      const len = Math.hypot(xb - xa, zb - za), n = Math.max(3, Math.round(len / 1.9));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, x = lerp(xa, xb, k), z = lerp(za, zb, k);
        const w = Math.sin(i * 1.3 + seed) * 0.2;
        pts.push(V(x + (iz !== 0 ? 0 : w), ground(x + ix * 1.4, z + iz * 1.4) - 0.25 + Math.sin(i * 0.9 + seed) * 0.1, z + (iz !== 0 ? w : 0)));
      }
      // squash the tube about its own height, so it lies low along the edge
      const base = pts[0].y;
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y - base))), n * 2, 0.8, 8, false);
      tube.scale(1, 0.75, 1); tube.translate(0, base, 0);
      parts.push(tube.toNonIndexed());
      for (const p of [pts[0], pts[pts.length - 1]]) { const c = new THREE.SphereGeometry(0.8, 10, 8); c.scale(1, 0.75, 1); c.translate(p.x, p.y, p.z); parts.push(c.toNonIndexed()); }
    };
    const E = Z.edge - 0.15;
    lip(-1.7, E, -46, E, 0, 1, 1);
    lip(1.7, E, PROM.x0 - 0.3, E, 0, 1, 2);
    lip(PROM.x0, E, PROM.x0, PROM.z1, 1, 0, 3);
    lip(PROM.x0, PROM.z1, PROM.x1, PROM.z1, 0, 1, 4);
    lip(PROM.x1, PROM.z1, PROM.x1, E, -1, 0, 5);
    lip(PROM.x1 + 0.3, E, 46, E, 0, 1, 6);
    const cornice = new THREE.Mesh(mergeGeometries(parts, false)!, new THREE.MeshLambertMaterial({ color: 0xf8f6fc }));
    cornice.receiveShadow = true;
    statics.add(cornice);
    // rocks on the cliff's face below the edge
    const rocks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 40; i++) {
      const x = rng.range(-60, 60), y = rng.range(-36, 4);
      if ((Math.abs(x) < 12 && y < -2) || (x > 2 && x < 18)) continue;
      const g = new THREE.DodecahedronGeometry(rng.range(1.5, 4), 0);
      g.scale(1.3, 1, 0.8);
      g.translate(x, y, Z.edge - 2.5 - rng.range(0, 3) - (4 - y) * 0.06);
      rocks.push(g);
    }
    const rm = new THREE.Mesh(mergeGeometries(rocks, false)!, new THREE.MeshLambertMaterial({ color: 0x8a82a2, flatShading: true }));
    rm.receiveShadow = true;
    statics.add(rm);
    // a warning board at the edge, too late to be of use
    const p = at(Z.edge + 5, -4.6);
    const sg = postSign(signTexture('ACHTUNG', { bg: '#c8323c', fg: '#fbf8f4', w: 512, h: 160, sub: 'Abgrund · Precipice' }), 2.2, 0.75, 1.3, post);
    placeFace(sg, Z.edge + 5, -4.6, ground(p.x, p.z) - 0.1);
    sg.rotation.y += 0.3;
    statics.add(sg);
  }

  const jumpAnchor = new THREE.Object3D();
  jumpAnchor.position.copy(at(Z.lip - 6, 0)).setY(road.at(Z.lip).y - 2);
  live.add(jumpAnchor);
  void cone;
  return { statics, live, flags, crowd, judges, ibexSpot, jumpAnchor };
}
