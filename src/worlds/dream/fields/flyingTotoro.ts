import * as THREE from 'three';
import { charToon, Painter } from '../../../engine/Paint';
import { Spring, envelope, easeInOut, outline } from '../../../engine/Rig';
import { TAU, clamp, lerp } from '../../../engine/math';
import { makeTotoro, type Totoro } from '../../ghibli/totoro';
import { makeKid, type Kid } from '../../ghibli/people';
import { bakeRigid } from './bake';

/*
 * Totoro flying on his spinning top, as in the film's night flight: he stands on a big painted wooden top
 * that spins and hums, arms spread wide, grinning. Satsuki and Mei, in their nightclothes, ride on his
 * belly with their backs in his fur, holding on behind them. Chu hangs from his outstretched right arm
 * (on his +x side) and Chibi sits on his head, hugging an ear.
 *
 * Local frame: +z is the way he faces; the origin is the top's upper face, where his feet are. The scene
 * moves and turns `group`. The barrel roll turns an inner group about a pivot in the middle of his body.
 *
 * Five characters are a great many small meshes, so once everything is posed the parts that only follow a
 * bone or a joint are baked together (see bake.ts). What still moves on its own: the top's spin and wobble,
 * Totoro's bones and arms, Chu swinging from the paw, the heads of Chu, Chibi and the girls (they look at
 * the camera) and the arm each girl waves with. Their legs, nightdresses and other arm are posed and fixed.
 */

export interface FlyingTotoro {
  group: THREE.Group;
  totoro: Totoro;
  /** height of the middle of his body above `group`'s origin (the roll's pivot), in world units */
  centre: number;
  /** a roar of joy: his head goes back and his arms go up; the girls wave; Chibi roars too */
  roar(): void;
  /** a barrel roll, top and all (1.6 s) */
  roll(): void;
  readonly rolling: boolean;
  /** where they all look (the camera) */
  lookTarget: THREE.Vector3 | null;
  update(dt: number, t: number): void;
}

const SCALE = 1.3;
const ROLL = 1.6;

/**
 * The wooden top: natural wood with painted rings, a few streaks so the spin shows, an iron tip. The lathe's
 * texture runs from its upper face at the top of the canvas to the tip at the bottom.
 */
function topTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 3301).fill('#c89a62');
  const g = p.g;
  p.lines({ n: 50, colors: ['#b08050', '#dcb07a'], alpha: [0.2, 0.45], width: [1, 3], wobble: 2 });
  // rings of colour round the body; f is the distance from the tip along the outline (0 tip, 1 middle of the face)
  const band = (f0: number, f1: number, c: string) => { g.fillStyle = c; g.fillRect(0, (1 - f1) * H, W, (f1 - f0) * H); };
  band(0, 0.1, '#2a2622');
  band(0.1, 0.13, '#5a3a24');
  band(0.36, 0.42, '#c8302c');
  band(0.42, 0.45, '#1e2a3a');
  band(0.52, 0.6, '#2f7a4a');
  band(0.6, 0.63, '#e8c040');
  band(0.7, 0.76, '#c8302c');
  band(0.84, 0.87, '#1e2a3a');
  // streaks across the rings, so the spinning reads
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * W;
    g.fillStyle = i % 2 ? 'rgba(255,240,200,0.35)' : 'rgba(40,20,10,0.35)';
    g.beginPath(); g.moveTo(x, 0.7 * H); g.lineTo(x + 26, 0.7 * H); g.lineTo(x + 60, 0); g.lineTo(x + 30, 0); g.closePath(); g.fill();
  }
  p.vgrad([[0, 'rgba(255,230,190,0.25)'], [0.15, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]);
  return p.texture();
}

/** A soft spiral of moving air, drawn under the top. */
function swirlTexture() {
  const S = 256;
  const p = new Painter(S, S, 3302);
  const g = p.g;
  g.clearRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  for (let k = 0; k < 5; k++) {
    g.rotate(TAU / 5);
    g.strokeStyle = 'rgba(220,235,255,0.5)';
    g.lineCap = 'round';
    for (let w = 0; w < 3; w++) {
      g.lineWidth = 6 - w * 2;
      g.globalAlpha = 0.35 + w * 0.2;
      g.beginPath();
      for (let i = 0; i <= 30; i++) { const a = i * 0.11, r = 20 + i * 3.4; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  const t = p.texture({ wrap: false });
  return t;
}

export function makeFlyingTotoro(): FlyingTotoro {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
  const centre = 2.4 * SCALE;
  const rollG = new THREE.Group(); rollG.position.y = centre; group.add(rollG);
  const inner = new THREE.Group(); inner.position.y = -centre; rollG.add(inner);
  const body = new THREE.Group(); body.scale.setScalar(SCALE); inner.add(body);
  const tilt = new THREE.Group(); body.add(tilt);
  const ink = 0x24252e;

  // ---------- the top ----------
  const spin = new THREE.Group(); tilt.add(spin);
  const prof: Array<[number, number]> = [
    [0.001, -2.75], [0.09, -2.62], [0.24, -2.35], [0.62, -1.86], [1.2, -1.32], [1.74, -0.86], [2.08, -0.52], [2.14, -0.33], [2.04, -0.15], [1.62, -0.03], [0.9, 0.0], [0.001, 0.02],
  ];
  const topGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
  const topMesh = new THREE.Mesh(topGeo, charToon({ map: topTexture(), rim: 0.4, shade: 0x9a90b0 }));
  topMesh.castShadow = true;
  spin.add(topMesh);
  outline(topMesh, ink, 1.4, 0.04);
  // the air it stirs: a faint spiral under the tip
  const swirl = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ map: swirlTexture(), color: 0x9ab8e0, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  swirl.rotation.x = -Math.PI / 2;
  swirl.position.y = -2.7;
  tilt.add(swirl);

  // ---------- Totoro ----------
  const totoro = makeTotoro();
  tilt.add(totoro.group);
  // the parts that keep moving on their own (everything else is baked at the end)
  const moving = new Set<THREE.Object3D>([spin, tilt, swirl]);
  totoro.group.traverse((o) => { if ((o as THREE.Bone).isBone) moving.add(o); });
  totoro.group.position.y = 0.02;
  const pose = { out: [1.25, 1.25] as [number, number], up: [-0.22, -0.22] as [number, number], mouth: 0.55, lean: 0.06 };
  totoro.pose = pose;
  totoro.group.updateMatrixWorld(true);
  const chest = totoro.group.getObjectByName('chest') as THREE.Bone | undefined;
  const head = totoro.group.getObjectByName('head') as THREE.Bone | undefined;
  // his arms are groups hung on the chest bone; the +x one is the one Chu hangs from
  const rightArm = chest?.children.find((c) => !(c as THREE.Bone).isBone && (c as THREE.Group).isGroup && c.position.x > 0.5) as THREE.Group | undefined;
  // both arms flap and go up in the roar
  chest?.children.forEach((c) => { if (!(c as THREE.Bone).isBone && (c as THREE.Group).isGroup) moving.add(c); });

  // ---------- Satsuki and Mei in their nightclothes, on his belly ----------
  const satsuki = makeKid({
    hair: 0x3a2a22, style: 'short', top: 0xf4ecd4, sleeves: 'short', bottom: { kind: 'dress', color: 0xf2e6c8, length: 0.46 },
    socks: 'bare', shoes: 0xf0cfb4, face: { mouth: 'open', blush: 0.55 }, seed: 31,
  });
  const mei = makeKid({
    hair: 0x8a5a30, style: 'pigtails', top: 0xf6dce4, sleeves: 'short', bottom: { kind: 'dress', color: 0xf4d2de, length: 0.4 },
    socks: 'bare', shoes: 0xf0cfb4, face: { mouth: 'open', blush: 0.65 }, seed: 33,
  });
  mei.group.scale.setScalar(0.68);
  // children are hung on his hips bone, so they move with his body; positions are given in his own space
  const hips = (totoro.group.getObjectByName('hips') as THREE.Bone | undefined) ?? totoro.group;
  group.updateMatrixWorld(true);
  const onBone = (bone: THREE.Object3D, obj: THREE.Object3D, at: THREE.Vector3) => {
    const p = totoro.group.localToWorld(at.clone());
    bone.worldToLocal(p);
    obj.position.copy(p);
    bone.add(obj);
  };
  /**
   * Sit a child against his belly: back in the fur, legs out in front, one hand behind holding on. `wa` is
   * the arm she waves with (the outer one: Satsuki's right, Mei's left).
   */
  const seat = (kid: Kid, at: THREE.Vector3, turn: number, wa: number, kneeBend: number) => {
    kid.group.rotation.y = turn;
    kid.spine.rotation.x = -0.12;
    kid.hip.forEach((h, i) => { const s = i === 0 ? -1 : 1; h.rotation.set(-1.25 + (i ? 0.12 : 0), 0, s * 0.18); });
    kid.knee.forEach((k, i) => { k.rotation.x = kneeBend + (i ? 0.25 : 0); });
    if (kid.skirt) kid.skirt.rotation.x = -0.25;
    const hold = 1 - wa, sh = hold === 0 ? -1 : 1;
    kid.shoulder[hold].rotation.set(0.75, 0, sh * 0.5);
    kid.elbow[hold].rotation.set(-0.5, 0, 0);
    kid.shoulder[wa].rotation.set(0.75, 0, -sh * 0.5);
    kid.elbow[wa].rotation.set(-0.5, 0, 0);
    moving.add(kid.head).add(kid.shoulder[wa]);
    onBone(hips, kid.group, at);
  };
  seat(satsuki, new THREE.Vector3(-0.62, 0.52, 1.88), -0.3, 0, 1.05);
  seat(mei, new THREE.Vector3(0.74, 0.5, 1.86), 0.35, 1, 1.2);

  // ---------- Chu hangs from his right arm, Chibi sits on his head ----------
  const chu = makeTotoro({ color: 0x5f7fa8, belly: 0xe8e2d0, scale: 0.62, chevrons: false, bag: true });
  chu.pose = { out: [0.12, 0.12], up: [-2.85, -2.85], mouth: 0.25 };
  const chuHead = chu.group.getObjectByName('head');
  if (chuHead) moving.add(chuHead);
  // a group at his paw, kept upright each frame, from which Chu hangs by his raised arms
  const hang = new THREE.Group();
  hang.add(chu.group);
  chu.group.position.set(0.25, -2.75, 0);
  moving.add(hang);
  if (rightArm) {
    // in the arm's own space the arm hangs along -y from the shoulder, so the paw is near y -1.5
    hang.position.set(0.15, -1.5, 0.05);
    rightArm.add(hang);
  } else {
    hang.position.set(2.9, 2.6, 0.3);
    totoro.group.add(hang);
  }
  const chibi = makeTotoro({ color: 0xf4f1ea, belly: -1, scale: 0.34, chevrons: false, leaf: true });
  chibi.pose = { out: [0.9, 0.5], up: [-2.1, -1.0], mouth: 0.2 };
  const chibiHead = chibi.group.getObjectByName('head');
  if (chibiHead) moving.add(chibiHead);
  chibi.group.rotation.set(-0.1, 0.25, 0.08);
  onBone(head ?? totoro.group, chibi.group, new THREE.Vector3(-0.32, 4.6, 0.48));

  // ---------- life ----------
  let roarT = -1, rollT = -1;
  const waveS = [new Spring(0, 2.4, 0.6), new Spring(0, 2.4, 0.6)];
  const hangQ = new THREE.Quaternion(), parentQ = new THREE.Quaternion(), bodyQ = new THREE.Quaternion();
  const fly: FlyingTotoro = {
    group, totoro, centre, lookTarget: null,
    get rolling() { return rollT >= 0; },
    roar() { roarT = 0; totoro.roar(); chibi.roar(); },
    roll() { if (rollT < 0) rollT = 0; },
    update(dt, t) {
      // the top spins and hums, its axis wandering in a slow circle
      spin.rotation.y += dt * 11;
      swirl.rotation.z -= dt * 3.2;
      const wob = 0.045 + 0.015 * Math.sin(t * 0.7);
      tilt.rotation.set(Math.sin(t * 2.3) * wob, 0, Math.cos(t * 2.3) * wob);
      tilt.position.y = Math.sin(t * 47) * 0.012;
      // the barrel roll: once round about the middle of his body, eased in and out
      if (rollT >= 0) {
        rollT += dt;
        rollG.rotation.z = TAU * easeInOut(clamp(rollT / (ROLL * 0.85), 0, 1));
        if (rollT > ROLL) { rollT = -1; rollG.rotation.z = 0; }
      }
      // arms spread wide while flying; up high in the roar
      let roar = 0;
      if (roarT >= 0) { roarT += dt; roar = envelope(roarT, 0.3, 0.7, 1.9, 2.5); if (roarT > 2.6) roarT = -1; }
      const flap = Math.sin(t * 1.7) * 0.06;
      pose.out[0] = pose.out[1] = 1.25 + flap + roar * 0.45;
      pose.up[0] = pose.up[1] = -0.22 - roar * 0.7;
      pose.mouth = 0.55;
      totoro.lookTarget = fly.lookTarget;
      totoro.update(dt, t);
      // the girls look round at you, and in the roar each waves her outer arm high, hand wagging
      const kids: Array<[Kid, number]> = [[satsuki, 0], [mei, 1]];
      for (const [kid, i] of kids) {
        kid.tick(dt, t, fly.lookTarget, 1);
        const w = waveS[i].update(roarT >= 0 && rollT < 0 ? envelope(roarT, 0.2, 0.5, 2.0, 2.5) : 0, dt);
        const s = i === 0 ? -1 : 1;
        kid.shoulder[i].rotation.set(lerp(0.75, -0.2, w), 0, s * (lerp(0.5, 2.5, w) + w * Math.sin(t * 10 + i) * 0.3));
      }
      // Chu dangles upright from the paw, swinging a little
      hang.parent!.getWorldQuaternion(parentQ).invert();
      body.getWorldQuaternion(bodyQ);
      hang.quaternion.copy(hangQ.copy(parentQ).multiply(bodyQ));
      hang.rotateZ(Math.sin(t * 1.9) * 0.12);
      hang.rotateX(Math.sin(t * 1.3 + 1) * 0.08);
      chu.lookTarget = fly.lookTarget;
      chu.update(dt, t);
      chibi.lookTarget = fly.lookTarget;
      chibi.update(dt, t);
    },
  };
  // let every spring settle into the flying pose, then bake the parts that no longer move on their own
  fly.lookTarget = new THREE.Vector3(-6, 4, 14);
  for (let i = 0; i < 90; i++) fly.update(1 / 60, i / 60);
  fly.lookTarget = null;
  bakeRigid(group, (o) => moving.has(o));
  return fly;
}
