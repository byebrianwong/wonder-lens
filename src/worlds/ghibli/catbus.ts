import * as THREE from 'three';
import { canvasTexture, glow } from '../../engine/Builders';
import { charToon } from '../../engine/Paint';
import { Rig, band, Spring, LookAt, limbGeometry, taperedTube, outline, envelope, easeInOut } from '../../engine/Rig';
import { clamp, damp, lerp } from '../../engine/math';
import { sphereFur, catbusBody, catbusHead, catbusEye, catbusBands, catbusEar } from './characterTextures';
import type { Character } from './character';

export interface Catbus extends Character {
  /** false while it waits at a stop: the legs come to rest */
  running: boolean;
  /** distance moved this frame in world units; the legs step in time with it */
  stride: number;
  /** a world point for the head to turn towards, or null */
  lookTarget: THREE.Vector3 | null;
  /** when true the head turns towards `lookTarget` even while running (a ridden Catbus looking at the sights) */
  lookWhileRunning: boolean;
  /** the destination board on top of the head */
  sign: THREE.Group;
  /** 0 to 1: sweeps the tail aside and down, out of the way of someone climbing on at the back */
  tailAside: number;
  /** how far the body is lifted by the gallop this frame */
  readonly lift: number;
  grin(): void;
}

const ORANGE = 0xdc8e3e;

export function makeCatbus(): Catbus {
  const g = new THREE.Group();
  const ink = 0x3a2416;
  // window openings along both sides; they glow from the fur-lined cabin inside
  const windows: Array<{ z: number; side: number; up: number }> = [];
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) windows.push({ z: i * 1.45 - 2.2, side, up: 0.38 });
  const bodyTex = catbusBody(windows);
  const bodyMat = charToon({ map: bodyTex.map, emissive: 0xffe0a8, emissiveMap: bodyTex.glow, emissiveIntensity: 1.5, rim: 0.45 });

  // ----- skeleton: a spine that flexes as it gallops, and the head -----
  const rig = new Rig(g, [
    { name: 'root', at: [0, 0, 0] },
    { name: 'mid', parent: 'root', at: [0, 2.0, 0] },
    { name: 'back', parent: 'mid', at: [0, 2.0, -2.4] },
    { name: 'front', parent: 'mid', at: [0, 2.0, 2.2] },
    { name: 'head', parent: 'front', at: [0, 2.15, 3.4] },
  ]);
  const B = rig.bones;
  const spineW = (p: THREE.Vector3) => {
    const front = band(p.z, 0.4, 2.6), back = 1 - band(p.z, -2.6, -0.4);
    return { front, back, mid: Math.max(0, 1 - front - back) };
  };
  const bodyGeo = new THREE.CapsuleGeometry(1.35, 6.0, 12, 40).rotateX(Math.PI / 2).translate(0, 2.0, 0);
  const body = rig.skin(bodyGeo, bodyMat, spineW);
  outline(body, ink, 1.6, 0.05);
  const onBone = (bone: string, obj: THREE.Object3D, at: THREE.Vector3) => {
    obj.position.copy(at).sub(new THREE.Vector3().setFromMatrixPosition(B[bone].matrixWorld));
    B[bone].add(obj);
    return obj;
  };

  // ----- head -----
  const head = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), charToon({ map: catbusHead(), rim: 0.45 }));
  headMesh.scale.set(1.55, 1.4, 1.4);
  head.add(headMesh);
  outline(headMesh, ink, 1.6, 0.05);
  const earMat = charToon({ map: catbusEar(), rim: 0.4 });
  const ears: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.0, 20), earMat);
    ear.position.y = 0.4;
    pivot.add(ear);
    pivot.position.set(s * 0.85, 1.05, -0.12);
    pivot.rotation.set(-0.1, 0, -s * 0.3);
    head.add(pivot);
    outline(ear, ink, 1.4, 0.04);
    ears.push(pivot);
  }
  // glowing headlamp eyes in dark fur rims
  const eyeMat = new THREE.MeshBasicMaterial({ map: catbusEye(), color: new THREE.Color(1.5, 1.5, 1.5) });
  const rimMat = charToon({ color: 0x4a2a16, rim: 0 });
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), rimMat);
    rim.scale.set(0.58, 0.5, 0.26); rim.position.set(s * 0.7, 0.35, 1.22); rim.rotation.y = s * 0.25;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), eyeMat);
    eye.scale.set(0.5, 0.42, 0.25); eye.position.set(s * 0.7, 0.35, 1.3); eye.rotation.y = s * 0.25;
    head.add(rim, eye);
    eyes.push(eye);
  }
  // whiskers: three long curved strands on each side of the muzzle
  const whiskerMat = charToon({ color: 0x3a2a20, rim: 0 });
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const a = new THREE.Vector3(s * 0.7, -0.22 - i * 0.1, 1.15);
    const curve = new THREE.QuadraticBezierCurve3(a, a.clone().add(new THREE.Vector3(s * 0.8, 0.1 - i * 0.05, 0.25)), a.clone().add(new THREE.Vector3(s * 1.7, -0.05 - i * 0.15 + 0.1, 0.1)));
    head.add(new THREE.Mesh(taperedTube(curve, 0.025, 0.006, 12, 5), whiskerMat));
  }
  // the grin: a band of painted teeth lying on the head, wrapping round the front and curling up into the
  // cheeks, so it can be seen from the side as the Catbus runs past
  const MOUTH_Y = -0.43;
  const grinGeo = new THREE.BufferGeometry();
  {
    const N = 48, TH = 1.45, RX = 1.55, RYZ = 1.4;
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const k = (i / N) * 2 - 1;
      const th = k * TH;
      const mid = MOUTH_Y + 0.28 * k * k;
      const h = 0.25 * (1 - 0.5 * k * k);
      for (const [j, y] of [[0, mid - h], [1, mid + h]]) {
        // a point just outside the head's ellipsoid at this height and angle, and the surface normal there
        const sc = Math.sqrt(Math.max(0, 1 - (y / RYZ) ** 2)) * 1.015;
        const x = RX * sc * Math.sin(th), z = RYZ * sc * Math.cos(th);
        const n = new THREE.Vector3(x / RX ** 2, y / RYZ ** 2, z / RYZ ** 2).normalize();
        pos.push(x, y - MOUTH_Y, z); nrm.push(n.x, n.y, n.z); uv.push(i / N, j);
      }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    grinGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    grinGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    grinGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    grinGeo.setIndex(idx);
  }
  const teeth = canvasTexture(512, 64, (c, w, h) => {
    c.fillStyle = '#2e1418'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f4efe2'; c.fillRect(10, 13, w - 20, h - 26);
    c.fillStyle = 'rgba(120,100,90,0.55)'; c.fillRect(10, h / 2 - 1, w - 20, 2);
    for (let x = 10 + 21; x < w - 10; x += 21) c.fillRect(x, 13, 2, h - 26);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(10, 13, w - 20, 5);
  });
  const grin = new THREE.Mesh(grinGeo, charToon({ map: teeth, emissive: 0x1a1414, rim: 0.1 }));
  grin.position.y = MOUTH_Y;
  grin.visible = false;
  head.add(grin);
  onBone('head', head, new THREE.Vector3(0, 2.15, 3.55));

  // destination board on top
  const signTex = canvasTexture(256, 96, (c, w, h) => {
    c.fillStyle = '#f4efe4'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#8a6a4a'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.fillStyle = '#1f2a4a'; c.font = 'bold 60px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('めい', w / 2, h / 2 + 4);
  });
  const sign = new THREE.Group();
  sign.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 0.5), charToon({ color: 0x4a3526, rim: 0.1 })));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(1.15, 1.12, 1.05) }));
  face.position.z = 0.26;
  sign.add(face);
  onBone('front', sign, new THREE.Vector3(0, 3.55, 2.2));

  // ----- legs: six pairs, each a thigh, a shin and a round paw, stepping in a wave down the body -----
  const legMat = charToon({ map: catbusBands(5, 3), rim: 0.4 });
  const pawMat = charToon({ map: sphereFur(0xf0d7a8, 13, { w: 128 }).texture(), rim: 0.3 });
  const thighGeo = limbGeometry(0.21, 0.15, 0.62, 12, 6), shinGeo = limbGeometry(0.15, 0.12, 0.56, 12, 6);
  const legs: Array<{ hip: THREE.Group; knee: THREE.Group; paw: THREE.Mesh; i: number; side: number; lift: number }> = [];
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const z = i * 1.1 - 2.75;
    const hip = new THREE.Group();
    const thigh = new THREE.Mesh(thighGeo, legMat);
    hip.add(thigh);
    const knee = new THREE.Group(); knee.position.y = -0.62;
    knee.add(new THREE.Mesh(shinGeo, legMat));
    const paw = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), pawMat);
    paw.scale.set(0.2, 0.12, 0.26); paw.position.set(0, -0.6, 0.06);
    knee.add(paw);
    hip.add(knee);
    hip.rotation.z = side * 0.12;
    const bone = z > 1.2 ? 'front' : z < -1.2 ? 'back' : 'mid';
    onBone(bone, hip, new THREE.Vector3(side * 0.98, 1.25, z));
    outline(thigh, ink, 1.3, 0.035);
    legs.push({ hip, knee, paw, i, side, lift: 0 });
  }
  // ----- tail: a chain of striped segments that sways, with a fluffy tip -----
  const tailMat = charToon({ map: catbusBands(6, 2), rim: 0.4 });
  const tailSegs: THREE.Group[] = [];
  let parent: THREE.Object3D = B.back;
  for (let i = 0; i < 6; i++) {
    const seg = new THREE.Group();
    const r0 = 0.24 - i * 0.025;
    const m = new THREE.Mesh(limbGeometry(r0, r0 - 0.025, 0.5, 10, 4), tailMat);
    m.rotation.x = Math.PI; // grow along +y from the joint
    seg.add(m);
    if (i === 0) { onBone('back', seg, new THREE.Vector3(0, 2.6, -3.7)); seg.rotation.x = -0.75; }
    else { seg.position.y = 0.5; parent.add(seg); }
    parent = seg; tailSegs.push(seg);
  }
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), charToon({ map: sphereFur(ORANGE, 14, { w: 128 }).texture(), rim: 0.4 }));
  tuft.scale.set(0.22, 0.32, 0.22); tuft.position.y = 0.6;
  parent.add(tuft);
  // tail-light mice: little round mice with glowing red eyes, riding at the back
  const mouseFur = charToon({ map: sphereFur(0x9a9a9a, 12, { w: 256 }).texture(), rim: 0.4 });
  const mice: Array<{ m: THREE.Group; y: number }> = [];
  for (const s of [-1, 1]) {
    const mouse = new THREE.Group();
    const mb = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mouseFur);
    mb.scale.set(0.24, 0.22, 0.3);
    mouse.add(mb);
    for (const e of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), charToon({ color: 0xd8a0a0, rim: 0.2 }));
      ear.scale.z = 0.4; ear.position.set(e * 0.12, 0.2, -0.05);
      mouse.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow(0xff5a4a, 2.4));
      eye.position.set(e * 0.08, 0.06, -0.27);
      mouse.add(eye);
    }
    onBone('back', mouse, new THREE.Vector3(s * 0.85, 2.75, -3.45));
    mice.push({ m: mouse, y: mouse.position.y });
  }

  // ----- animation -----
  const sp = {
    // how hard it is running: 0 standing, about 1 at ride speed
    move: new Spring(0, 1.6, 0.9),
    // nose down when it slows, nose up when it speeds away; loosely damped so it rocks and settles
    pitch: new Spring(0, 1.3, 0.35),
    // leaning into a turn
    roll: new Spring(0, 1.2, 0.6),
    headX: new Spring(0, 3, 0.6), headZ: new Spring(0, 2, 0.7),
    // the tail swings forward when it stops and out to the side in a turn, a little after the body
    tailX: new Spring(0, 1.1, 0.3), tailZ: new Spring(0, 1.0, 0.35),
    grin: new Spring(0, 3.2, 0.45),
    aside: new Spring(0, 1.4, 0.8),
  };
  const earSp = [new Spring(0, 5, 0.3), new Spring(0, 5, 0.3)];
  const look = new LookAt(0.6, 0.25);
  const fwd = new THREE.Vector3();
  const STANCE = 0.62; // share of each step the paw spends on the ground
  let gait = 0, grinT = 0, heading = NaN, speed = 0, lastSpeed = 0, accel = 0;
  let blinkIn = 2.5, blinkSince = 9, earIn = 1.5, shiftIn = 1.2, shiftT = -1, shiftLeg = 0;
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ch: Catbus = {
    group: g, running: true, stride: 0, lookTarget: null, lookWhileRunning: false, sign, tailAside: 0,
    get lift() { return B.root.position.y; },
    grin() { grinT = 3; },
    update(dt, t) {
      dt = Math.max(dt, 1e-4);
      // how far it turned this frame: turning on the spot moves the paws as well
      g.updateWorldMatrix(true, false);
      fwd.set(0, 0, 1).transformDirection(g.matrixWorld);
      const h = Math.atan2(fwd.x, fwd.z);
      let turn = Number.isNaN(heading) ? 0 : Math.atan2(Math.sin(h - heading), Math.cos(h - heading));
      heading = h;
      if (Math.abs(turn) > 0.4) turn = 0; // it was put somewhere new, not turned
      const travel = Math.min(1.5, (ch.running ? ch.stride : 0) + Math.abs(turn) * 2.4);
      speed = damp(speed, travel / dt, 6, dt);
      accel = damp(accel, (speed - lastSpeed) / dt, 5, dt);
      lastSpeed = speed;
      const move = clamp(sp.move.update(clamp(speed / 9, 0, 1.15), dt), 0, 1.2);
      const m1 = Math.min(1, move);
      // one full stepping cycle per 4.5 units travelled, so the paws don't slide
      gait += (travel / 4.5) * Math.PI * 2;

      // ---- legs: a wave of steps runs from the front pair to the back, the two sides half a step apart ----
      // On the ground the paw sweeps back under the body and the knee gives under the weight; then it lifts,
      // swings forward and reaches. The paw stays flat on the ground and curls as it lifts.
      const a = Math.min(1, move * 1.6);
      if (move < 0.08) {
        // standing: now and then one paw lifts and is put down again, as a cat shifts its weight
        shiftIn -= dt;
        if (shiftIn <= 0 && shiftT < 0) { shiftT = 0; shiftLeg = Math.floor(rand() * legs.length); shiftIn = 1.4 + rand() * 2.6; }
      }
      if (shiftT >= 0) { shiftT += dt; if (shiftT > 0.5) shiftT = -1; }
      for (const l of legs) {
        const ph = gait - l.i * 0.95 + (l.side > 0 ? Math.PI : 0);
        const p = (((ph / (Math.PI * 2)) % 1) + 1) % 1;
        let hip: number, knee: number, curl = 0;
        if (p < STANCE) {
          const k = p / STANCE;
          hip = lerp(-0.5, 0.48, k);
          knee = 0.18 + 0.28 * Math.sin(k * Math.PI);
        } else {
          const k = (p - STANCE) / (1 - STANCE);
          hip = lerp(0.48, -0.5, easeInOut(k));
          knee = 0.2 + 1.25 * Math.sin(k * Math.PI);
          curl = 0.7 * Math.sin(k * Math.PI);
        }
        // standing: the front legs reach a little forward and the back ones back, so it stands square
        const restHip = (2.5 - l.i) * -0.035, restKnee = 0.14;
        l.lift = l === legs[shiftLeg] ? envelope(shiftT, 0, 0.15, 0.25, 0.5) : 0;
        const amp = Math.min(1.1, move);
        const hx = lerp(restHip, hip * amp, a) - l.lift * 0.25;
        const kx = lerp(restKnee, lerp(0.18, knee, amp), a) + l.lift * 0.9;
        l.hip.rotation.x = hx;
        l.knee.rotation.x = kx;
        l.paw.rotation.x = -(hx + kx) * (1 - l.lift) + curl * a + l.lift * 0.5;
      }

      // ---- body: it rides up twice a step, rolls with each pair of steps, and a slow wave runs down the spine ----
      const bob = (1 - Math.cos(gait * 2)) * 0.5;
      B.root.position.y = bob * 0.17 * m1;
      B.mid.position.y = rig.restPos('mid').y + Math.sin(t * 1.7) * 0.022 * (1 - m1); // breathing while it waits
      B.front.rotation.x = Math.sin(gait * 2 + 0.4) * 0.05 * m1;
      B.back.rotation.x = Math.sin(gait * 2 - 1.2) * 0.05 * m1;
      B.mid.rotation.z = Math.sin(gait) * 0.035 * m1;
      // weight: braking tips it nose down and it rocks back level; speeding off sits it back on its haunches
      // It tips about its front paws when it brakes (the back end comes up) and about its back paws when it
      // sets off, so no paw sinks into the ground.
      const lean = sp.pitch.update(clamp(-accel * 0.008, -0.06, 0.075), dt);
      const pivot = lean > 0 ? 2.75 : -2.85;
      const turnRate = turn / dt;
      const roll = sp.roll.update(clamp(-turnRate * Math.min(speed, 14) * 0.006, -0.1, 0.1), dt);
      B.root.rotation.set(lean, 0, roll);
      B.root.position.y += pivot * Math.sin(lean);
      B.root.position.z = pivot * (1 - Math.cos(lean));

      // ---- head: held steady against the bobbing body, like a cat's; looks at things; tips back to grin ----
      grinT = Math.max(0, grinT - dt);
      const open = clamp(sp.grin.update(grinT > 0.3 ? 1 : 0, dt), 0, 1.25);
      const [ly, lp] = look.update(B.head, ch.running && !ch.lookWhileRunning ? null : ch.lookTarget, dt);
      const steady = -B.front.rotation.x - lean * 0.7 + Math.sin(gait * 2 + 0.9) * 0.025 * m1;
      B.head.rotation.set(sp.headX.update(steady - open * 0.1, dt) + lp, ly, sp.headZ.update(Math.sin(t * 0.7) * 0.05 * (1 - m1 * 0.6) - roll * 0.5, dt));

      // ---- ears: laid back and fluttering in the wind of running; upright and twitching when it waits ----
      earIn -= dt;
      if (earIn <= 0) { earIn = 1.5 + rand() * 3.5; if (move < 0.5) earSp[rand() < 0.5 ? 0 : 1].v -= 6; }
      ears.forEach((e, i) => {
        const flutter = (Math.sin(t * 13 + i * 1.7) * 0.05 + Math.sin(t * 7.3 + i) * 0.03) * m1;
        const back = earSp[i].update(0.38 * m1 - open * 0.15, dt);
        const s = i === 0 ? -1 : 1;
        e.rotation.x = -0.1 - back + flutter + Math.sin(t * 1.3 + i) * 0.04 * (1 - m1);
        e.rotation.z = -s * (0.3 + back * 0.35);
      });

      // ---- eyes: a quick blink every few seconds, wide open when it grins ----
      blinkIn -= dt; blinkSince += dt;
      if (blinkIn <= 0) { blinkIn = 2.5 + rand() * 4; blinkSince = 0; }
      const shut = envelope(blinkSince, 0, 0.06, 0.1, 0.2);
      for (const e of eyes) { e.scale.y = 0.42 * (1 - 0.88 * shut) * (1 + 0.12 * open); e.scale.x = 0.5 * (1 + 0.08 * open); }

      // ---- tail: streams out behind when running and curls lazily when waiting, and swings after the body ----
      const tx = sp.tailX.update(clamp(accel * 0.02, -0.5, 0.35), dt);
      const tz = sp.tailZ.update(clamp(turnRate * 0.35, -0.6, 0.6), dt);
      const aside = sp.aside.update(ch.tailAside, dt);
      tailSegs.forEach((s, i) => {
        const w = i / (tailSegs.length - 1);
        if (i > 0) s.rotation.x = damp(s.rotation.x, move * 0.06 - (1 - m1) * 0.22 + Math.sin(t * 3 - i * 0.7) * 0.05 + tx * 0.18 * (0.5 + w) + aside * 0.12, 6, dt);
        else s.rotation.x = -0.75 - aside * 0.5;
        s.rotation.z = Math.sin(t * (2 + m1 * 4) - i * 0.6) * (0.12 + 0.1 * (1 - m1)) * (1 - aside * 0.6) + tz * 0.14 * (0.4 + w) + aside * (i === 0 ? 1.1 : 0.22);
      });
      mice.forEach((m, i) => { m.m.position.y = m.y + Math.abs(Math.sin(gait + i)) * 0.05 * m1; });

      // ---- the grin spreads out from the middle of the face with a little overshoot, holds, and shrinks back ----
      grin.visible = open > 0.01;
      grin.scale.set(open, 0.5 + 0.5 * Math.min(1, open), 1);
    },
  };
  return ch;
}
