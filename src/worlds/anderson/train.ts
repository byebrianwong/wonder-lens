import * as THREE from 'three';
import { box, cyl, sphere, mesh, canvasTexture, glow, mergeStatic, toon } from '../../engine/Builders';
import { Painter, boxUV, repeatUV } from '../../engine/Paint';
import { TAU } from '../../engine/math';
import { css, panels, planks, stripes, whitmanLuggage } from './textures';
import { PAL, texMat, tiled } from './kit';
import { FUTURA } from './film';

/**
 * The Zubrowka Express: the rider stands on the open observation platform at the front of a pink Pullman
 * car. A brass rail and a wrought-iron screen with the Society of the Crossed Keys' monogram run round the
 * platform; two slim brass posts hold up a striped canopy with a scalloped valance, which frames the top of
 * the view like a proscenium; two lanterns hang at the front corners. Behind the rider is the end of the car:
 * a door and two windows onto a lamplit compartment.
 *
 * Origin: on the path (the top of the track bed). Local +z is forward. The camera's place is `seat`.
 */
export interface Train {
  group: THREE.Group;
  seat: THREE.Vector3;
  /** the lantern glass and the platform lamp, brightened by the world as the light goes */
  lampMats: THREE.MeshBasicMaterial[];
  light: THREE.PointLight;
  /** the bell under the canopy, which swings when the whistle blows */
  bell: THREE.Group;
  ring(): void;
  update(dt: number, t: number, dusk: number): void;
}

const DECK_Y = 0.66, FRONT = 4.0, BACK = -0.4, HALF = 1.6, CANOPY = 3.78;

/** Wrought-iron screen: scrolls and bars, with a crossed-keys roundel at the centre of each panel. Transparent between. */
function ironScreen(panelsAcross: number) {
  const W = 256 * panelsAcross, H = 160;
  const p = new Painter(W, H, 91);
  const g = p.g;
  const iron = '#24302c', brass = css(PAL.brass);
  g.strokeStyle = iron; g.lineCap = 'round';
  for (let k = 0; k < panelsAcross; k++) {
    const x0 = k * 256;
    // frame
    g.lineWidth = 8; g.strokeRect(x0 + 6, 6, 244, H - 12);
    // bars
    g.lineWidth = 5;
    for (let i = 1; i < 8; i++) { const x = x0 + 6 + i * 30.5; if (Math.abs(x - (x0 + 128)) < 40) continue; g.beginPath(); g.moveTo(x, 10); g.lineTo(x, H - 10); g.stroke(); }
    // scrolls either side of the roundel
    g.lineWidth = 4;
    for (const s of [-1, 1]) {
      const cx = x0 + 128 + s * 44;
      g.beginPath(); g.arc(cx, 52, 16, s > 0 ? Math.PI : 0, s > 0 ? TAU * 1.25 : -Math.PI * 1.25, s > 0); g.stroke();
      g.beginPath(); g.arc(cx, 108, 16, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI * 1.75 : -Math.PI * 0.75, s < 0); g.stroke();
    }
    // the roundel with two crossed keys
    g.fillStyle = brass; g.beginPath(); g.arc(x0 + 128, 80, 34, 0, TAU); g.fill();
    g.lineWidth = 3; g.strokeStyle = '#8a6a2a'; g.beginPath(); g.arc(x0 + 128, 80, 30, 0, TAU); g.stroke();
    g.strokeStyle = '#6a4a1a'; g.lineWidth = 5;
    for (const s of [-1, 1]) {
      g.save(); g.translate(x0 + 128, 80); g.rotate(s * 0.7);
      g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 18); g.stroke();
      g.beginPath(); g.arc(0, -24, 6, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(0, 12); g.lineTo(7, 12); g.moveTo(0, 18); g.lineTo(9, 18); g.stroke();
      g.restore();
    }
  }
  const t = p.texture();
  t.anisotropy = 4;
  return t;
}

/** The compartment seen through the end door and windows: wallpaper, a velvet banquette, a lamp, luggage. */
function compartment() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 77).fill('#e8c4c0');
  const g = p.g;
  // striped wallpaper
  for (let x = 0; x < W; x += 16) { g.fillStyle = 'rgba(180,90,100,0.22)'; g.fillRect(x, 0, 6, H); }
  // dado and panelling
  g.fillStyle = '#7a2a36'; g.fillRect(0, H * 0.58, W, H * 0.42);
  g.fillStyle = '#5a1a26'; for (let x = 10; x < W; x += 64) g.fillRect(x, H * 0.64, 50, H * 0.3);
  // banquette
  g.fillStyle = '#a8283a'; g.fillRect(40, H * 0.5, W - 80, H * 0.22);
  g.fillStyle = '#c23a4c'; for (let x = 52; x < W - 60; x += 46) { g.beginPath(); g.ellipse(x + 20, H * 0.56, 18, 10, 0, 0, TAU); g.fill(); }
  // a table lamp with a pink shade, glowing
  const lg = g.createRadialGradient(W * 0.5, H * 0.3, 4, W * 0.5, H * 0.3, 90);
  lg.addColorStop(0, 'rgba(255,230,180,0.9)'); lg.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2a8bc'; g.beginPath(); g.moveTo(W * 0.5 - 22, H * 0.36); g.lineTo(W * 0.5 + 22, H * 0.36); g.lineTo(W * 0.5 + 14, H * 0.24); g.lineTo(W * 0.5 - 14, H * 0.24); g.closePath(); g.fill();
  g.fillStyle = '#d8b25a'; g.fillRect(W * 0.5 - 3, H * 0.36, 6, H * 0.12);
  // a luggage rack with the Whitman cases
  g.fillStyle = '#d8b25a'; g.fillRect(30, H * 0.12, W - 60, 4);
  g.fillStyle = '#8a5a34'; g.fillRect(60, H * 0.03, 90, H * 0.09); g.fillRect(360, H * 0.05, 70, H * 0.07);
  g.fillStyle = '#f2b8c6'; g.fillRect(200, H * 0.06, 60, H * 0.06);
  g.strokeStyle = '#7a9ac8'; g.lineWidth = 2; g.beginPath(); g.moveTo(200, H * 0.09); g.lineTo(260, H * 0.09); g.stroke();
  const t = p.texture();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTrain(): Train {
  const group = new THREE.Group();
  const statics = new THREE.Group();
  group.add(statics);
  const brass = new THREE.MeshStandardMaterial({ color: PAL.brass, metalness: 0.85, roughness: 0.32, emissive: 0x3a2a08, emissiveIntensity: 0.25 });
  const pink = texMat(panels(PAL.pink, 51));
  const cream = toon(PAL.cream), burgundy = toon(PAL.burgundy), dark = toon(0x2a2a30);
  const add = (...o: THREE.Object3D[]) => { statics.add(...o); };

  // ---------- the platform ----------
  const deckLen = FRONT - BACK;
  add(box(HALF * 2, 0.34, deckLen, toon(0x6a3a3a), 0, DECK_Y - 0.18, (FRONT + BACK) / 2));
  add(tiled(HALF * 2 + 0.06, 0.06, deckLen + 0.06, texMat(planks(0xb08a62, 55)), 0.8, 2, 0, DECK_Y + 0.01, (FRONT + BACK) / 2));
  // a red runner with a gold border down the middle
  const runner = canvasTexture(64, 256, (c) => {
    c.fillStyle = '#9a1e30'; c.fillRect(0, 0, 64, 256);
    c.fillStyle = '#d8b25a'; c.fillRect(0, 0, 5, 256); c.fillRect(59, 0, 5, 256);
    c.fillStyle = 'rgba(255,220,150,0.25)';
    for (let y = 16; y < 256; y += 32) { c.beginPath(); c.moveTo(32, y - 8); c.lineTo(42, y); c.lineTo(32, y + 8); c.lineTo(22, y); c.closePath(); c.fill(); }
  }, [1, 1]);
  const run = mesh(repeatUV(new THREE.PlaneGeometry(1.2, deckLen - 0.4), 1, (deckLen - 0.4) / 1.4), new THREE.MeshLambertMaterial({ map: runner }), 0, DECK_Y + 0.045, (FRONT + BACK) / 2 - 0.1);
  run.rotation.x = -Math.PI / 2;
  add(run);
  // the deck's edge: a burgundy fascia with a brass strip, and steps down at the front corners
  add(box(HALF * 2 + 0.1, 0.22, 0.1, burgundy, 0, DECK_Y - 0.1, FRONT + 0.03), box(HALF * 2 + 0.12, 0.04, 0.12, brass, 0, DECK_Y - 0.01, FRONT + 0.04));
  for (const s of [-1, 1]) add(box(0.1, 0.22, deckLen, burgundy, s * (HALF + 0.03), DECK_Y - 0.1, (FRONT + BACK) / 2), box(0.12, 0.04, deckLen, brass, s * (HALF + 0.04), DECK_Y - 0.01, (FRONT + BACK) / 2));
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) add(box(0.7, 0.05, 0.3, brass, s * (HALF - 0.4), DECK_Y - 0.3 - k * 0.24, FRONT + 0.2 + k * 0.08));

  // ---------- rail and iron screen round the front and sides ----------
  const RAIL_Y = DECK_Y + 0.92;
  const screenMat = new THREE.MeshLambertMaterial({ map: ironScreen(1), alphaTest: 0.5, side: THREE.DoubleSide });
  const front = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(HALF * 2 - 0.1, 0.82), 3, 1), screenMat);
  front.position.set(0, DECK_Y + 0.45, FRONT - 0.04);
  add(front);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(deckLen - 1.6, 0.82), 3, 1), screenMat);
    side.rotation.y = Math.PI / 2; side.position.set(s * (HALF - 0.04), DECK_Y + 0.45, FRONT - (deckLen - 1.6) / 2 - 0.04);
    add(side);
  }
  const rail = (a: THREE.Vector3, b: THREE.Vector3, r = 0.035) => {
    const d = b.clone().sub(a);
    const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), brass);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    add(m);
  };
  const fz = FRONT - 0.04, bz = BACK + 1.5;
  rail(new THREE.Vector3(-HALF + 0.04, RAIL_Y, fz), new THREE.Vector3(HALF - 0.04, RAIL_Y, fz), 0.04);
  for (const s of [-1, 1]) rail(new THREE.Vector3(s * (HALF - 0.04), RAIL_Y, fz), new THREE.Vector3(s * (HALF - 0.04), RAIL_Y, bz), 0.04);
  rail(new THREE.Vector3(-HALF + 0.04, DECK_Y + 0.06, fz), new THREE.Vector3(HALF - 0.04, DECK_Y + 0.06, fz), 0.03);
  // newel posts with brass balls
  for (const [x, z] of [[-HALF + 0.04, fz], [HALF - 0.04, fz], [-HALF + 0.04, bz], [HALF - 0.04, bz], [-0.5, fz], [0.5, fz]]) {
    add(cyl(0.045, 0.055, RAIL_Y - DECK_Y, brass, x, (RAIL_Y + DECK_Y) / 2, z, 10), sphere(0.07, brass, x, RAIL_Y + 0.06, z, 10, 8));
  }

  // ---------- canopy: brass posts, a ribbed roof, a striped scalloped valance ----------
  for (const s of [-1, 1]) {
    add(cyl(0.045, 0.05, CANOPY - DECK_Y, brass, s * (HALF - 0.12), (CANOPY + DECK_Y) / 2, FRONT - 0.18, 10));
    // a diagonal brace where the post meets the roof
    const brace = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), brass, s * (HALF - 0.28), CANOPY - 0.2, FRONT - 0.18);
    brace.rotation.z = s * 0.8;
    add(brace);
  }
  const roofGeo = repeatUV(new THREE.CylinderGeometry(2.2, 2.2, deckLen + 0.3, 24, 1, true, -0.85, 1.7), 1, 1);
  const roof = mesh(roofGeo, texMat(stripes(0xf6e8ea, 0xd85a78, 6), { side: THREE.DoubleSide }), 0, CANOPY - 1.75, (FRONT + BACK) / 2 + 0.15);
  // the arc's middle faces up
  roof.rotation.x = -Math.PI / 2;
  add(roof);
  const valanceTex = stripes(0xf6e8ea, 0xd85a78, 4, true);
  valanceTex.wrapS = THREE.RepeatWrapping;
  const valanceMat = new THREE.MeshLambertMaterial({ map: valanceTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const val = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(HALF * 2 + 0.3, 0.34), 3.2, 1), valanceMat);
  val.position.set(0, CANOPY - 0.06, FRONT + 0.12);
  add(val);
  for (const s of [-1, 1]) {
    const sv = new THREE.Mesh(repeatUV(new THREE.PlaneGeometry(deckLen + 0.3, 0.34), 4.4, 1), valanceMat);
    sv.rotation.y = Math.PI / 2; sv.position.set(s * (HALF + 0.12), CANOPY - 0.06, (FRONT + BACK) / 2 + 0.15);
    add(sv);
  }
  add(box(HALF * 2 + 0.34, 0.08, 0.08, brass, 0, CANOPY + 0.14, FRONT + 0.12));

  // ---------- lanterns at the front corners ----------
  const lampMats: THREE.MeshBasicMaterial[] = [];
  for (const s of [-1, 1]) {
    const lm = glow(0xfff0c8, 1.05); lampMats.push(lm);
    const lx = s * (HALF + 0.08), ly = 2.75, lz = FRONT - 0.18;
    add(box(0.26, 0.04, 0.05, brass, s * (HALF - 0.02), ly + 0.16, lz));
    const lan = new THREE.Group();
    lan.add(box(0.16, 0.22, 0.16, lm, 0, 0, 0));
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lan.add(box(0.018, 0.25, 0.018, dark, cx * 0.085, 0, cz * 0.085));
    lan.add(box(0.22, 0.03, 0.22, brass, 0, -0.13, 0), box(0.22, 0.03, 0.22, brass, 0, 0.13, 0));
    const cap = mesh(new THREE.ConeGeometry(0.16, 0.12, 4), brass, 0, 0.2, 0); cap.rotation.y = Math.PI / 4; lan.add(cap);
    lan.add(sphere(0.03, brass, 0, 0.28, 0, 6, 5));
    lan.position.set(lx, ly, lz);
    add(lan);
  }

  // ---------- the end of the car behind the rider ----------
  const WALL_Z = BACK, TOP = 3.6;
  const compTex = compartment();
  const comp = texMat(compTex, { emissive: 0xffffff, emissiveMap: compTex, emissiveIntensity: 0.55 });
  // door (centre) and a window either side, all looking into the compartment
  const doorW = 0.9, winW = 0.62, openY0 = DECK_Y + 0.95, openY1 = DECK_Y + 2.15;
  const holes = [[-0.95, winW, openY0, openY1], [0, doorW, DECK_Y + 1.1, DECK_Y + 2.2], [0.95, winW, openY0, openY1]] as const;
  // solid wall pieces round the openings (pink panels above and below, cream frames)
  add(tiled(HALF * 2, openY0 - DECK_Y, 0.1, pink, 1.6, 1.6, 0, (openY0 + DECK_Y) / 2, WALL_Z));
  add(tiled(HALF * 2, TOP - openY1 - 0.05, 0.1, pink, 1.6, 1.6, 0, (TOP + openY1 + 0.05) / 2, WALL_Z));
  const gaps = [-HALF, -0.95 - winW / 2, -0.95 + winW / 2, -doorW / 2, doorW / 2, 0.95 - winW / 2, 0.95 + winW / 2, HALF];
  for (let i = 0; i < gaps.length; i += 2) { const w = gaps[i + 1] - gaps[i]; if (w > 0.01) add(tiled(w, openY1 - openY0 + 0.05, 0.1, pink, 1.6, 1.6, (gaps[i] + gaps[i + 1]) / 2, (openY0 + openY1) / 2, WALL_Z)); }
  // the door's lower panel fills the gap below its glass
  add(box(doorW, DECK_Y + 1.1 - DECK_Y, 0.06, burgundy, 0, (DECK_Y + 1.1 + DECK_Y) / 2, WALL_Z + 0.03));
  add(sphere(0.045, brass, 0.33, DECK_Y + 1.0, WALL_Z + 0.09, 8, 6));
  for (const [x, w, y0, y1] of holes) {
    const back = mesh(new THREE.PlaneGeometry(w + 0.1, y1 - y0 + 0.1), comp, x, (y0 + y1) / 2, WALL_Z - 0.35);
    back.rotation.y = 0; // faces +z, towards the platform
    add(back);
    // reveal: short walls from the opening back to the compartment
    for (const s of [-1, 1]) { const r = mesh(new THREE.PlaneGeometry(0.35, y1 - y0), burgundy, x + s * w / 2, (y0 + y1) / 2, WALL_Z - 0.17); r.rotation.y = -s * Math.PI / 2; add(r); }
    add(box(w + 0.12, 0.07, 0.14, cream, x, y1 + 0.03, WALL_Z + 0.02), box(w + 0.12, 0.07, 0.14, cream, x, y0 - 0.03, WALL_Z + 0.02));
    for (const s of [-1, 1]) add(box(0.06, y1 - y0 + 0.1, 0.14, cream, x + s * (w / 2 + 0.03), (y0 + y1) / 2, WALL_Z + 0.02));
    // a red pelmet at the top of each opening
    add(box(w, 0.16, 0.05, toon(PAL.red), x, y1 - 0.09, WALL_Z - 0.04));
  }
  // faint glass
  const glass = new THREE.MeshLambertMaterial({ color: 0xdfeef4, transparent: true, opacity: 0.12, depthWrite: false });
  for (const [x, w, y0, y1] of holes) add(mesh(new THREE.PlaneGeometry(w, y1 - y0), glass, x, (y0 + y1) / 2, WALL_Z + 0.06));
  // cream belt line and brass strips across the end
  add(box(HALF * 2 + 0.04, 0.32, 0.06, cream, 0, DECK_Y + 0.75, WALL_Z + 0.07));
  add(box(HALF * 2 + 0.06, 0.04, 0.07, brass, 0, DECK_Y + 0.93, WALL_Z + 0.08), box(HALF * 2 + 0.06, 0.04, 0.07, brass, 0, DECK_Y + 0.57, WALL_Z + 0.08));
  // the Crossed Keys crest over the door
  {
    const crest = new THREE.Group();
    const disc = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), cream);
    disc.rotation.x = Math.PI / 2; crest.add(disc);
    crest.add(mesh(new THREE.TorusGeometry(0.3, 0.025, 6, 24), brass));
    for (const s of [-1, 1]) {
      const key = new THREE.Group();
      key.add(box(0.04, 0.38, 0.03, brass, 0, 0, 0), mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 12), brass, 0, 0.22, 0), box(0.08, 0.03, 0.03, brass, 0.04, -0.16, 0), box(0.06, 0.03, 0.03, brass, 0.03, -0.1, 0));
      key.rotation.z = s * 0.62; key.position.z = 0.04; crest.add(key);
    }
    crest.position.set(0, TOP - 0.38, WALL_Z + 0.08);
    add(crest);
  }

  // ---------- the car body: pink panels, cream belt, lit windows, lettering, a rounded roof ----------
  const BODY_Z1 = -12.5, bodyLen = WALL_Z - BODY_Z1, bodyMid = (WALL_Z + BODY_Z1) / 2;
  for (const s of [-1, 1]) {
    add(tiled(0.1, TOP - 0.3, bodyLen, pink, 1.6, 1.6, s * HALF, (TOP + 0.3) / 2, bodyMid));
    add(box(0.06, 0.32, bodyLen, cream, s * (HALF + 0.05), DECK_Y + 0.75, bodyMid));
    add(box(0.07, 0.04, bodyLen, brass, s * (HALF + 0.07), DECK_Y + 0.93, bodyMid), box(0.07, 0.04, bodyLen, brass, s * (HALF + 0.07), DECK_Y + 0.57, bodyMid));
  }
  const winMat = new THREE.MeshLambertMaterial({ map: compTex, emissive: 0xffffff, emissiveMap: compTex, emissiveIntensity: 0.5 });
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = WALL_Z - 1.4 - i * 2.2;
    const w = mesh(new THREE.PlaneGeometry(1.5, 1.05), winMat, s * (HALF + 0.055), DECK_Y + 1.6, z);
    w.rotation.y = s * Math.PI / 2; add(w);
    add(box(0.07, 0.07, 1.62, cream, s * (HALF + 0.07), DECK_Y + 2.16, z), box(0.07, 0.07, 1.62, cream, s * (HALF + 0.07), DECK_Y + 1.06, z));
    add(box(0.05, 0.22, 1.5, toon(PAL.red), s * (HALF + 0.08), DECK_Y + 2.0, z));
  }
  const name = canvasTexture(1024, 96, (c) => {
    c.clearRect(0, 0, 1024, 96);
    c.font = `bold 58px ${FUTURA}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#7a2a36'; c.fillText('Z U B R O W K A   E X P R E S S', 512, 50);
  });
  for (const s of [-1, 1]) { const n = mesh(new THREE.PlaneGeometry(6.4, 0.6), new THREE.MeshBasicMaterial({ map: name, transparent: true }), s * (HALF + 0.08), DECK_Y + 0.75, bodyMid); n.rotation.y = s * Math.PI / 2; n.renderOrder = 1; add(n); }
  const ribs = canvasTexture(64, 256, (c) => {
    c.fillStyle = '#7a2a36'; c.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 64) { c.fillStyle = '#5a1c26'; c.fillRect(0, y, 64, 6); c.fillStyle = '#9a4a54'; c.fillRect(0, y + 6, 64, 4); }
  }, [1, 1]);
  const bodyRoof = mesh(repeatUV(new THREE.CylinderGeometry(1.9, 1.9, bodyLen + 0.2, 18, 1, false, 0, Math.PI), 1, (bodyLen + 0.2) / 1.6), texMat(ribs), 0, TOP - 0.55, bodyMid);
  bodyRoof.rotation.z = Math.PI / 2; bodyRoof.rotation.y = Math.PI / 2; bodyRoof.scale.x = 0.42;
  add(bodyRoof);
  // the end wall's top follows the roof's curve: a cream lunette
  const lun = mesh(new THREE.CircleGeometry(1.9, 24, 0, Math.PI), cream, 0, TOP - 0.55, WALL_Z + 0.01);
  lun.scale.y = 0.42; add(lun);
  // bogies and wheels
  const wheelMat = toon(0x3a3438);
  for (const z of [-2.6, -10.4]) {
    add(box(2.4, 0.5, 2.8, dark, 0, 0.35, z));
    for (const s of [-1, 1]) for (const dz of [-0.9, 0.9]) { const w = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16), wheelMat, s * 0.78, 0.42, z + dz); w.rotation.z = Math.PI / 2; add(w); }
  }
  // the Whitman luggage strapped on the roof at the back, where it shows when the rider looks round
  {
    const lug = texMat(whitmanLuggage(61));
    add(box(1.0, 0.42, 0.62, lug, -0.4, TOP + 0.05, -3.2), box(0.8, 0.36, 0.5, lug, 0.5, TOP + 0.02, -3.0), box(0.6, 0.3, 0.4, lug, 0.1, TOP + 0.38, -3.1));
  }

  statics.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true; });
  mergeStatic(statics);
  void boxUV;

  // ---------- the bell (animated, so not merged) ----------
  const bell = new THREE.Group();
  const bellMesh = mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.2, 14, 1, true), new THREE.MeshStandardMaterial({ color: PAL.brass, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }), 0, -0.16, 0);
  bell.add(bellMesh, sphere(0.04, brass, 0, -0.27, 0, 6, 5), cyl(0.012, 0.012, 0.08, brass, 0, -0.03, 0, 5));
  bell.position.set(0, CANOPY - 0.08, FRONT - 1.0);
  group.add(bell);

  const light = new THREE.PointLight(0xffd9a8, 1.6, 10, 1.6);
  light.position.set(0, 2.9, 3.0);
  group.add(light);

  let ringT = 9;
  return {
    group, seat: new THREE.Vector3(0, 2.35, 1.9), lampMats, light, bell,
    ring() { ringT = 0; },
    update(dt, t, dusk) {
      ringT += dt;
      const swing = ringT < 2.4 ? Math.sin(ringT * 14) * 0.5 * Math.exp(-ringT * 1.6) : 0;
      bell.rotation.x = swing + Math.sin(t * 1.3) * 0.02;
      const flick = (1.05 + Math.sin(t * 7.3) * 0.04) * (1 + dusk * 0.35);
      for (const m of lampMats) m.color.setHex(0xffe6b0).multiplyScalar(flick);
      light.intensity = 1.4 + dusk * 5;
    },
  };
}
