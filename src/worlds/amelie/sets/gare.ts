import * as THREE from 'three';
import { box, cyl, glow, instanced, mesh, type Placement } from '../../../engine/Builders';
import { boxUV, charToon, Painter, repeatUV } from '../../../engine/Paint';
import { TAU, clamp, lerp, smoothstep } from '../../../engine/math';
import { SETS, Y } from '../layout';
import { optimize, type BuiltSet, type SetContext } from '../common';
import { tiled } from '../buildings';
import { toonE } from '../props';
import { ashlar, css, lettering, PAL, pavement } from '../textures';
import { lightShaft } from '../lens';

/*
 * The Gare de l'Est at night. The moped climbs out of the canal tunnel onto a platform under the great
 * glass vault, beside a waiting train and a steam engine breathing clouds into the lamplight. At the
 * concourse the departures board clatters, a row of photo booths stands against the wall, and the one in
 * the middle is enormous: the moped rides in through its curtain and the flash goes off four times.
 */

export const GARE = { z0: -1230, concourse: -1378, back: -1446, hw: 30, crown: 34, booth: -1404 };
const PLATFORM_Y = Y.platform;

/** Iron and glass: dark painted glazing bars over a night sky, a few panes catching light. One tile = 4 x 4. */
function glazing(seed = 501) {
  const p = new Painter(128, 128, seed);
  const g = p.g, rng = p.rng;
  g.clearRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 32) for (let y = 0; y < 128; y += 32) {
    g.fillStyle = `rgba(${rng.range(40, 70)},${rng.range(60, 90)},${rng.range(70, 100)},${rng.range(0.25, 0.5)})`;
    g.fillRect(x + 3, y + 3, 26, 26);
  }
  g.fillStyle = '#1e2a24';
  for (let x = 0; x <= 128; x += 32) g.fillRect(x - 2.5, 0, 5, 128);
  for (let y = 0; y <= 128; y += 32) g.fillRect(0, y - 2, 128, 4);
  return p.texture({ repeat: [1, 1] });
}

/** Painted coach side: bottle green with a cream band, a row of lit windows with travellers' silhouettes. One tile = one bay of 3 units. */
function coachSide(seed = 503) {
  const p = new Painter(128, 128, seed).fill('#1f3a2a');
  const e = new Painter(128, 128, 1).fill('#000');
  const g = p.g, rng = p.rng;
  g.fillStyle = '#d8c8a0'; g.fillRect(0, 86, 128, 6);
  g.fillStyle = '#c8a050'; g.fillRect(0, 96, 128, 2);
  const lit = rng.chance(0.8);
  g.fillStyle = lit ? '#f8d890' : '#2a3a3a'; g.beginPath(); g.roundRect(14, 24, 100, 52, 8); g.fill();
  if (lit) { e.g.fillStyle = '#f8d890'; e.g.beginPath(); e.g.roundRect(14, 24, 100, 52, 8); e.g.fill(); }
  if (lit && rng.chance(0.7)) {
    const x = rng.range(30, 90);
    for (const [gg, c] of [[g, '#3a2a20'], [e.g, '#000']] as const) { gg.fillStyle = c; gg.beginPath(); gg.arc(x, 48, 8, 0, TAU); gg.fill(); gg.fillRect(x - 12, 56, 24, 22); if (rng.chance(0.4)) { gg.fillRect(x - 10, 34, 20, 4); gg.fillRect(x - 6, 26, 12, 8); } }
  }
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(14, 24, 100, 6);
  p.dabs({ n: 20, colors: ['#0a1a10', '#3a5a40'], r: [4, 16], alpha: [0.08, 0.16] });
  return { map: p.texture({ repeat: [1, 1] }), emissive: e.texture({ repeat: [1, 1] }) };
}

const DESTS = [['STRASBOURG', '21H04', '5'], ['REIMS', '21H12', '9'], ['NANCY', '21H30', '3'], ['METZ', '21H47', '7'], ['MUNICH', '22H05', '11'], ['VIENNE', '22H40', '2'], ['MOSCOU', '23H15', '14'], ['LUXEMBOURG', '23H52', '6']];
const LOVE = [['AMÉLIE', '♥', ''], ['ET', '', ''], ['NINO', '♥', ''], ['', '', ''], ['RENDEZ-VOUS', '', ''], ['AU CAFÉ', '', ''], ['DES 2 MOULINS', '', ''], ['', '', '']];

/** The split-flap departures board, redrawn as letters flip. */
function solariBoard() {
  const W = 1024, H = 512;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const g = canvas.getContext('2d')!;
  const rows = 8, cols = 18, cw = 44, rh = 52, x0 = 40, y0 = 70;
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const cur: string[][] = DESTS.map((r) => (r[0].padEnd(13) + r[1].padStart(5)).split(''));
  let target = cur.map((r) => r.slice());
  const flipping: number[][] = cur.map((r) => r.map(() => 0));
  const draw = () => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e8e0c8'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'left'; g.fillText('DÉPARTS', 40, 46);
    g.textAlign = 'right'; g.fillText('HEURE', W - 40, 46);
    g.font = 'bold 34px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * (cw + 8) + (c >= 13 ? 30 : 0), y = y0 + r * rh;
      g.fillStyle = '#2a2a2a'; g.fillRect(x, y, cw, rh - 8);
      g.fillStyle = '#0a0a0a'; g.fillRect(x, y + (rh - 8) / 2 - 1, cw, 2);
      const ch = cur[r][c] ?? ' ';
      g.fillStyle = ch === '♥' ? '#ff5a5a' : '#f6f0e0';
      g.fillText(ch, x + cw / 2, y + (rh - 8) / 2 + 2);
    }
  };
  draw();
  let acc = 0;
  return {
    texture: tex,
    /** flip to the given lines (or back to the departures) */
    show(love: boolean) {
      const lines = love ? LOVE : DESTS;
      target = lines.map((r) => (r[0].padEnd(13) + (r[1] ?? '').padStart(5)).slice(0, cols).split(''));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (target[r][c] !== cur[r][c]) flipping[r][c] = 3 + Math.floor(Math.random() * 6);
    },
    busy: () => flipping.some((r) => r.some((x) => x > 0)),
    update(dt: number) {
      acc += dt;
      if (acc < 0.06) return false;
      acc = 0;
      let changed = false;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (flipping[r][c] > 0) {
          flipping[r][c]--;
          cur[r][c] = flipping[r][c] === 0 ? target[r][c] : glyphs[Math.floor(Math.random() * glyphs.length)];
          changed = true;
        }
      }
      if (changed) { draw(); tex.needsUpdate = true; }
      return changed;
    },
  };
}

/** The photo booth's front: cream panels, "PHOTOMATON 4 POSES" and sample strips under glass. */
function boothFront(seed = 505) {
  const p = new Painter(256, 512, seed).fill('#e8e0cc');
  const g = p.g;
  g.fillStyle = '#2a4a8a'; g.fillRect(0, 0, 256, 70);
  g.fillStyle = '#fff3d0'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('PHOTOMATON', 128, 48);
  g.fillStyle = '#c8282a'; g.fillRect(0, 70, 256, 30);
  g.fillStyle = '#fff3d0'; g.font = 'bold 20px Arial, sans-serif'; g.fillText('4 POSES — 20 F', 128, 92);
  // sample strips
  for (let k = 0; k < 3; k++) {
    const x = 40 + k * 64;
    g.fillStyle = '#f6f2e8'; g.fillRect(x, 130, 44, 150);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#8a8a80'; g.fillRect(x + 4, 134 + i * 36, 36, 32); g.fillStyle = '#d8b8a0'; g.beginPath(); g.ellipse(x + 22, 148 + i * 36, 8, 10, 0, 0, TAU); g.fill(); }
  }
  g.fillStyle = '#3a3a3a'; g.fillRect(80, 320, 96, 30);
  g.fillStyle = '#c8a040'; g.fillRect(110, 328, 36, 6);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 380, 256, 132);
  return p.texture({ wrap: false });
}

export interface Gare extends BuiltSet {
  board: ReturnType<typeof solariBoard>;
  spots: { nino: THREE.Vector3; ninoYaw: number; stranger: THREE.Vector3; strangerYaw: number; platform: (z: number, lat: number) => THREE.Vector3 };
  /** flash amount inside the giant booth (0..1), for the lens */
  flash(u: number): number;
}

export function buildGare(ctx: SetContext): Gare {
  const { road, lights } = ctx;
  const g = new THREE.Group();
  const arch = new THREE.Group(), decor = new THREE.Group(), live = new THREE.Group();
  g.add(arch, decor, live);
  const G = GARE, y0 = PLATFORM_Y;
  const shedZ0 = G.z0, shedZ1 = G.concourse, shedLen = shedZ0 - shedZ1, shedZc = (shedZ0 + shedZ1) / 2;
  const iron = charToon({ color: 0x24302a, rim: 0.4, emissive: new THREE.Color(0x060a08) });
  const stone = new THREE.MeshLambertMaterial({ map: ashlar(0xc8bca0, 507) });
  const platM = new THREE.MeshLambertMaterial({ map: pavement(0x8a8478, 509) });

  // ---------- floor: platforms and tracks ----------
  const trackBed = mesh(new THREE.PlaneGeometry(G.hw * 2, shedLen + 80), toonE(0x2a2622, 0.04), 0, y0 - 1.2, shedZc - 30);
  trackBed.rotation.x = -Math.PI / 2; arch.add(trackBed);
  const plats = [-15, 0, 15];
  for (const x of plats) {
    const pl = tiled(x === 0 ? 8 : 7, 1.2, shedLen + 6, platM, 4, 4, x, y0 - 0.6, shedZc - 3); pl.receiveShadow = true; arch.add(pl);
    // a white safety line near each edge
    for (const s of [-1, 1]) arch.add(box(0.3, 0.04, shedLen + 6, toonE(0xe8e0c8, 0.15), x + s * ((x === 0 ? 4 : 3.5) - 0.7), y0 + 0.02, shedZc - 3));
  }
  // rails between the platforms
  {
    const railPl: Placement[] = [], sleeperPl: Placement[] = [];
    for (const tx of [-7.5, 7.5, -22.5, 22.5]) for (const s of [-0.75, 0.75]) railPl.push({ x: tx + s, y: y0 - 1.1, z: shedZc - 30, scale: 1, rot: 0 });
    for (const tx of [-7.5, 7.5, -22.5, 22.5]) for (let z = shedZ0 + 10; z > G.concourse - 4; z -= 1.2) sleeperPl.push({ x: tx, y: y0 - 1.17, z, scale: 1, rot: 0 });
    const railG = new THREE.BoxGeometry(0.12, 0.16, shedLen + 80);
    decor.add(instanced(railG, charToon({ color: 0x9a9a98, rim: 0.6 }), railPl));
    decor.add(instanced(new THREE.BoxGeometry(2.6, 0.1, 0.35), toonE(0x4a3a2a, 0.05), sleeperPl));
  }
  // the ramp up out of the canal water onto the middle platform
  {
    const a = new THREE.Vector3(0, -0.2, -1212), b = new THREE.Vector3(0, y0, shedZ0 - 6);
    const geo = new THREE.PlaneGeometry(8, a.distanceTo(b));
    const ramp = new THREE.Mesh(geo, platM);
    ramp.position.copy(a).lerp(b, 0.5); ramp.rotation.x = -Math.PI / 2; ramp.rotateX(Math.atan2(b.y - a.y, a.z - b.z));
    arch.add(ramp);
  }

  // ---------- side walls with arcades, the glass vault on iron arches ----------
  for (const s of [-1, 1]) {
    const w = tiled(2, G.crown * 0.42, shedLen + 70, stone, 4, 4, s * (G.hw + 1), y0 - 1.2 + G.crown * 0.21, shedZc - 34);
    arch.add(w);
    for (let z = shedZ0 - 4; z > G.back; z -= 9) {
      decor.add(mesh(new THREE.PlaneGeometry(5, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(0.55) }), s * (G.hw - 0.05), y0 + 5, z).rotateY(-s * Math.PI / 2));
      decor.add(box(1.2, 14, 1.2, stone, s * (G.hw - 0.4), y0 + 5, z + 4.5));
    }
  }
  const R = G.hw, springY = y0 - 1.2 + G.crown * 0.42;
  {
    const glass = new THREE.MeshLambertMaterial({ map: glazing(), transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x101818 });
    const vault = mesh(repeatUV(new THREE.CylinderGeometry(R, R, shedLen + 70, 40, 1, true, -Math.PI / 2, Math.PI), 18, (shedLen + 70) / 4), glass, 0, springY, shedZc - 34);
    vault.rotation.set(-Math.PI / 2, 0, 0); vault.renderOrder = 3;
    decor.add(vault);
    for (let z = shedZ0; z > G.back; z -= 10) {
      const rib = mesh(new THREE.TorusGeometry(R - 0.3, 0.35, 6, 40, Math.PI), iron, 0, springY, z);
      decor.add(rib);
      // tie rods and lamps hanging from each rib
      decor.add(box(R * 2, 0.15, 0.15, iron, 0, springY, z));
      for (const x of [-15, 0, 15]) {
        decor.add(cyl(0.03, 0.03, 9, iron, x, springY - 4.5, z, 4));
        decor.add(mesh(new THREE.SphereGeometry(0.55, 12, 10), glow(0xffe0a0, 1.8), x, springY - 9.4, z));
      }
    }
  }
  // the station front seen from inside: the end wall with the great half-moon window over the concourse
  {
    const endWall = new THREE.Shape(); endWall.moveTo(-G.hw - 2, -2); endWall.lineTo(G.hw + 2, -2); endWall.lineTo(G.hw + 2, springY + R + 4); endWall.lineTo(-G.hw - 2, springY + R + 4); endWall.closePath();
    const win = new THREE.Path(); win.moveTo(R - 4, springY); win.absarc(0, springY, R - 4, 0, Math.PI, false); win.lineTo(R - 4, springY); endWall.holes.push(win);
    const door = new THREE.Path(); door.moveTo(-8, y0 - 1.2); door.lineTo(8, y0 - 1.2); door.lineTo(8, y0 + 10); door.lineTo(-8, y0 + 10); door.closePath(); endWall.holes.push(door);
    const ew = mesh(new THREE.ShapeGeometry(endWall), stone, 0, 0, G.back);
    arch.add(ew);
    const lunette = mesh(new THREE.CircleGeometry(R - 4, 40, 0, Math.PI), new THREE.MeshLambertMaterial({ map: glazing(511), transparent: true, depthWrite: false, emissive: 0x302818, side: THREE.DoubleSide }), 0, springY, G.back + 0.2);
    decor.add(lunette);
    for (let k = -5; k <= 5; k++) decor.add(box(0.3, (R - 4) * Math.sqrt(1 - (k / 6) ** 2), 0.3, iron, k * (R - 4) / 6, springY + (R - 4) * Math.sqrt(1 - (k / 6) ** 2) / 2, G.back + 0.3));
  }
  // concourse floor
  const conc = tiled(G.hw * 2, 0.4, G.concourse - G.back, new THREE.MeshLambertMaterial({ map: pavement(0xa89a84, 513) }), 4, 4, 0, y0 - 0.2, (G.concourse + G.back) / 2);
  conc.receiveShadow = true; arch.add(conc);

  // ---------- the train on the left, the steam engine at its head ----------
  const coach = coachSide();
  const coachM = new THREE.MeshLambertMaterial({ map: coach.map, emissive: 0xffffff, emissiveMap: coach.emissive, emissiveIntensity: 1.0 });
  const roofM = charToon({ color: 0x3a3a38, rim: 0.4 });
  for (let i = 0; i < 6; i++) {
    const z = G.concourse + 36 + i * 22.5;
    const c = new THREE.Group(); c.position.set(-7.5, y0 - 0.9, z); decor.add(c);
    const bodyG = boxUV(new THREE.BoxGeometry(3.2, 3.6, 21), 3, 3.6);
    c.add(mesh(bodyG, [coachM, coachM, roofM, roofM, roofM, roofM] as unknown as THREE.Material, 0, 2.4, 0));
    const roof = mesh(new THREE.CylinderGeometry(1.7, 1.7, 21, 16, 1, false, -Math.PI / 2, Math.PI), roofM, 0, 4.2, 0); roof.rotation.set(Math.PI / 2, 0, 0); roof.scale.set(1, 1, 0.4);
    roof.rotation.set(-Math.PI / 2, 0, 0); c.add(roof);
    for (const bz of [-7, 7]) c.add(box(2.6, 0.8, 3, toonE(0x1a1a1a, 0.02), 0, 0.4, bz));
  }
  // the steam engine, nose towards the concourse
  const engine = new THREE.Group(); engine.position.set(-7.5, y0 - 0.9, G.concourse + 18); decor.add(engine);
  {
    const black = charToon({ color: 0x1e2220, rim: 0.6, emissive: new THREE.Color(0x060606) });
    const redM = charToon({ color: 0x9a1a1a, rim: 0.5 });
    const brass = charToon({ color: 0xd8a848, rim: 0.7 });
    const boiler = mesh(new THREE.CylinderGeometry(1.5, 1.5, 11, 20), black, 0, 3.4, -1); boiler.rotation.x = Math.PI / 2; engine.add(boiler);
    engine.add(box(3.2, 4.2, 4.4, black, 0, 3.0, 6.6));
    engine.add(box(3.4, 0.3, 5, roofM, 0, 5.2, 6.6));
    engine.add(cyl(0.55, 0.7, 2.2, black, 0, 5.4, -4.6, 12));
    engine.add(cyl(0.5, 0.5, 1.0, brass, 0, 5.2, 0.6, 12));
    engine.add(mesh(new THREE.CircleGeometry(1.45, 20), black, 0, 3.4, -6.52).rotateY(Math.PI));
    engine.add(mesh(new THREE.SphereGeometry(0.35, 10, 8), glow(0xfff0c0, 2), 0, 4.4, -6.6));
    engine.add(box(3.3, 0.5, 13, redM, 0, 1.4, 0));
    for (const s of [-1, 1]) for (const z of [-4, -1, 2, 5]) { const w = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 18), redM, s * 1.6, 1.0, z); w.rotation.z = Math.PI / 2; engine.add(w); }
    // warm glow from the firebox
    engine.add(mesh(new THREE.PlaneGeometry(1.2, 0.8), glow(0xff8030, 2.2), 1.62, 2.4, 6.6).rotateY(Math.PI / 2));
  }
  // steam: soft billboards that rise, swell and thin out
  const steamTex = (() => { const p = new Painter(128, 128, 517); const gr = p.g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(255,250,240,0.85)'); gr.addColorStop(0.5, 'rgba(240,236,228,0.45)'); gr.addColorStop(1, 'rgba(240,236,228,0)'); p.g.fillStyle = gr; p.g.fillRect(0, 0, 128, 128); return p.texture({ wrap: false }); })();
  const steam: { m: THREE.Mesh; age: number; life: number; v: THREE.Vector3 }[] = [];
  for (let i = 0; i < 28; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: steamTex, transparent: true, depthWrite: false, emissive: 0x403830, opacity: 0 }));
    m.visible = false; live.add(m); steam.push({ m, age: 99, life: 4, v: new THREE.Vector3() });
  }
  const chimneyTop = engine.position.clone().add(new THREE.Vector3(0, 6.6, -4.6));

  // ---------- the concourse: departures board, clock, the row of photo booths ----------
  const board = solariBoard();
  {
    const bz = G.concourse - 14;
    const frame = mesh(new THREE.BoxGeometry(22, 11.4, 0.8), iron, 0, y0 + 15, bz);
    decor.add(frame);
    const face = mesh(new THREE.PlaneGeometry(21, 10.5), new THREE.MeshBasicMaterial({ map: board.texture, color: new THREE.Color(1.05, 1.05, 1.05) }), 0, y0 + 15, bz + 0.42);
    face.userData.keep = true; live.add(face);
    for (const s of [-1, 1]) decor.add(cyl(0.06, 0.06, springY + 10 - (y0 + 20), iron, s * 9, (springY + 10 + y0 + 20) / 2, bz, 4));
    // the clock hanging beside it
    const cp = new Painter(256, 256, 515).fill('#f6efdc');
    const cg = cp.g; cg.strokeStyle = '#1a1a1a'; cg.lineWidth = 8; cg.beginPath(); cg.arc(128, 128, 118, 0, TAU); cg.stroke();
    for (let k = 0; k < 60; k++) { const a = (k / 60) * TAU; const r0 = k % 5 === 0 ? 92 : 104; cg.lineWidth = k % 5 === 0 ? 6 : 2; cg.beginPath(); cg.moveTo(128 + Math.cos(a) * r0, 128 + Math.sin(a) * r0); cg.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); cg.stroke(); }
    cg.lineWidth = 8; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 + 50, 128 - 30); cg.stroke(); cg.lineWidth = 5; cg.beginPath(); cg.moveTo(128, 128); cg.lineTo(128 - 10, 128 - 95); cg.stroke();
    const clock = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 32), [iron, new THREE.MeshLambertMaterial({ map: cp.texture({ wrap: false }), emissive: 0x403a30 }), iron] as unknown as THREE.Material, 15, y0 + 13, bz + 2);
    clock.rotation.x = Math.PI / 2; decor.add(clock);
  }
  // the row of photo booths against the back wall; the giant one in the middle where the path goes in
  const front = boothFront();
  const cream = charToon({ color: 0xe8e0cc, rim: 0.4, emissive: new THREE.Color(0x201c14) });
  const blue = charToon({ color: 0x2a4a8a, rim: 0.4 });
  const curtainM = new THREE.MeshLambertMaterial({ color: 0xc8402a, emissive: 0x401008, side: THREE.DoubleSide });
  const boothMat = new THREE.MeshLambertMaterial({ map: front, emissive: 0x302820 });
  const makeBooth = (s: number) => {
    const b = new THREE.Group();
    b.add(box(1.7 * s, 2.5 * s, 1.7 * s, [cream, cream, blue, cream, boothMat, cream] as unknown as THREE.Material, 0, 1.25 * s, 0));
    const cur = mesh(new THREE.PlaneGeometry(0.9 * s, 2.0 * s, 6, 1), curtainM, 0.85 * s + 0.01, 1.05 * s, 0.25 * s); cur.rotation.y = Math.PI / 2; b.add(cur);
    b.add(box(1.8 * s, 0.12 * s, 1.8 * s, glow(0xffd890, 1.2), 0, 2.56 * s, 0));
    return b;
  };
  for (const x of [-22, -14, 14, 22]) { const b = makeBooth(1.25); b.position.set(x, y0, G.back + 4); b.rotation.y = x < 0 ? 0.3 : -0.3; decor.add(b); }
  // the giant booth, open towards the platform so the moped rides straight in
  const B = { s: 6, z: G.booth };
  const giant = new THREE.Group(); giant.position.set(0, y0, B.z - 7); live.add(giant);
  {
    const s = B.s, W2 = 1.7 * s / 2, H2 = 2.5 * s;
    // walls left, right, back and roof (the front is the open curtain)
    giant.add(box(0.4, H2, 1.7 * s, cream, -W2, H2 / 2, 0), box(0.4, H2, 1.7 * s, cream, W2, H2 / 2, 0), box(1.7 * s, H2, 0.4, cream, 0, H2 / 2, -W2));
    giant.add(box(1.7 * s + 0.4, 0.6, 1.7 * s + 0.4, blue, 0, H2, 0));
    giant.add(mesh(new THREE.PlaneGeometry(1.7 * s, 2.0), new THREE.MeshBasicMaterial({ map: lettering('PHOTOMATON', { fg: '#fff3d0', bg: '#2a4a8a', w: 512, h: 96 }) }), 0, H2 - 1.2, W2 + 0.22));
    giant.add(box(1.7 * s, 0.8, 0.3, blue, 0, H2 - 0.2, W2 + 0.05));
    giant.add(box(1.7 * s + 0.6, 0.4, 1.7 * s + 0.6, glow(0xffd890, 1.4), 0, H2 + 0.5, 0));
    // the curtains pulled to the sides, in heavy red folds
    for (const sd of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(2.8, H2 - 1.6, 16, 1);
      const pp = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 4.5) * 0.25);
      geo.computeVertexNormals();
      const c = mesh(geo, curtainM, sd * (W2 - 1.6), (H2 - 1.6) / 2, W2 - 0.3); giant.add(c);
    }
    // inside: the round stool, the glass with the camera behind it, the flash panel and the sample strips
    giant.add(cyl(1.2, 1.2, 0.4, charToon({ color: 0x1a1a1a, rim: 0.4 }), 0, 4.0, -1.5, 20), cyl(0.15, 0.15, 3.8, charToon({ color: 0xc8c8c0, rim: 0.6 }), 0, 1.9, -1.5, 8));
    giant.add(mesh(new THREE.PlaneGeometry(4.6, 3.2), new THREE.MeshLambertMaterial({ color: 0x1a2020, emissive: 0x050808 }), 0, 8.6, -W2 + 0.25));
    giant.add(mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }), 0, 8.6, -W2 + 0.27));
    const flashPanel = mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e0).multiplyScalar(0.8) }), 0, 11.6, -W2 + 0.27);
    giant.add(flashPanel);
    giant.userData.flashPanel = flashPanel;
    giant.add(mesh(new THREE.PlaneGeometry(3, 5.6), boothMat, -3.4, 7, -W2 + 0.26));
  }

  // ---------- light ----------
  const uIn = road.u(G.z0 + 8), uOut = road.u(SETS.gare.z1);
  lights.add({ from: uIn, to: road.u(G.concourse + 30), pos: new THREE.Vector3(0, y0 + 9, -1270), color: 0xffd8a0, intensity: 70, distance: 46 });
  lights.add({ from: road.u(-1290), to: uOut, pos: new THREE.Vector3(0, y0 + 12, G.concourse - 4), color: 0xffd8a0, intensity: 90, distance: 50 });
  lights.add({ from: uIn, to: road.u(G.concourse - 10), pos: engine.position.clone().add(new THREE.Vector3(2.2, 2.4, 6.6)), color: 0xff8030, intensity: 26, distance: 16, flicker: 2 });
  decor.add(lightShaft(new THREE.Vector3(0, springY + R - 6, G.back + 2), new THREE.Vector3(0, y0, G.concourse - 4), 30, 0xa8c0d0, 0.08));

  optimize(arch);
  optimize(decor);

  // the four flashes in the giant booth, by ride progress
  const fz = [B.z - 1, B.z - 4.5, B.z - 8, B.z - 11.5].map((z) => road.u(z));
  const flash = (u: number) => { let f = 0; for (const a of fz) f = Math.max(f, Math.exp(-(((u - a) / 0.0009) ** 2))); return f; };
  let puffT = 0;
  void lerp; void clamp; void css; void PAL; void smoothstep;
  return {
    id: 'gare', group: g, show: [road.u(-1200), road.u(SETS.gare.z1 + 2)], occluders: [arch], subjects: [],
    floor: (x, z) => (z > G.z0 - 4 ? (Math.abs(x) < 4 ? -0.2 : 0) : Math.abs(x) < 4 || z < G.concourse ? y0 : y0 - 1.2),
    board,
    spots: {
      nino: new THREE.Vector3(14 + 1.4, y0, G.back + 6.2), ninoYaw: Math.PI - 0.3,
      stranger: new THREE.Vector3(-14 + 2.2, y0, G.back + 6.6), strangerYaw: Math.PI * 0.85,
      platform: (z, lat) => new THREE.Vector3(lat, y0, z),
    },
    flash,
    update(dt, t, ride) {
      board.update(dt);
      // steam from the engine's chimney, slow and billowing in the lamplight
      puffT -= dt;
      if (puffT <= 0) {
        puffT = 0.28 + Math.sin(t * 3) * 0.08;
        const p = steam.find((x) => x.age >= x.life);
        if (p) { p.age = 0; p.life = 3.5 + Math.sin(t * 7) * 0.8; p.m.position.copy(chimneyTop); p.v.set(Math.sin(t * 5) * 0.5, 2.6, -0.6 + Math.cos(t * 4) * 0.4); p.m.visible = true; }
      }
      for (const p of steam) {
        if (p.age >= p.life) { p.m.visible = false; continue; }
        p.age += dt;
        const k = p.age / p.life;
        p.v.y *= 1 - dt * 0.35;
        p.m.position.addScaledVector(p.v, dt);
        p.m.scale.setScalar(1.6 + k * 9);
        p.m.quaternion.copy(ctx.camera.quaternion);
        (p.m.material as THREE.MeshLambertMaterial).opacity = Math.min(1, p.age * 3) * (1 - k) * 0.75;
      }
      const fp = giant.userData.flashPanel as THREE.Mesh;
      (fp.material as THREE.MeshBasicMaterial).color.setHex(0xfff6e0).multiplyScalar(0.8 + flash(ride.u) * 3);
    },
  };
}
