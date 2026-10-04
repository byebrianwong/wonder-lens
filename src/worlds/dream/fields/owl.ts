import * as THREE from 'three';
import { charToon, Painter } from '../../../engine/Paint';
import { LookAt, Spring, envelope, easeInOut, outline } from '../../../engine/Rig';
import { Rng, clamp } from '../../../engine/math';
import { css } from '../../ghibli/characterTextures';
import { blinkAmount } from '../../ghibli/character';
import { bakeRigid } from './bake';

/*
 * A horned owl on top of a telephone pole: a round, mottled body, a pale face disc with big golden eyes
 * that catch the light, two ear tufts and a little hooked beak. It looks round at the Catbus as it passes.
 * The ocarina makes it turn its head right round; an acorn makes it flap and hop.
 *
 * Local frame: +z is the way it faces; the origin is between its feet.
 */

export interface Owl {
  group: THREE.Group;
  head: THREE.Group;
  /** turn the head right round, pausing when it faces backwards (2.2 s) */
  turn(): void;
  /** a startled flap and a little hop (1.2 s) */
  flap(): void;
  lookTarget: THREE.Vector3 | null;
  update(dt: number, t: number): void;
}

const BROWN = 0x7a6248, BUFF = 0xcdb894;

/** Feathers for the body sphere: mottled brown back, pale barred breast at the front. */
function bodyTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 4401).fill(css(BROWN));
  p.vgrad([[0, css(BROWN, 1.1)], [1, css(BROWN, 0.7)]]);
  const g = p.g;
  // the pale breast (front is u 0.25)
  const gr = g.createRadialGradient(W * 0.25, H * 0.62, 4, W * 0.25, H * 0.62, W * 0.16);
  gr.addColorStop(0, css(BUFF)); gr.addColorStop(0.75, css(BUFF, 0.92)); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.ellipse(W * 0.25, H * 0.62, W * 0.16, H * 0.45, 0, 0, Math.PI * 2); g.fill();
  // dark streaks and cross bars on the breast
  for (let i = 0; i < 70; i++) {
    const x = W * (0.25 + p.rng.range(-0.11, 0.11)), y = H * p.rng.range(0.3, 0.95);
    g.strokeStyle = css(0x3a2a1e, 1); g.globalAlpha = p.rng.range(0.4, 0.8); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.moveTo(x - 5, y + 2); g.lineTo(x + 5, y + 1); g.stroke();
  }
  g.globalAlpha = 1;
  // mottled spots over the back and wings
  p.dabs({ n: 260, colors: [css(BROWN, 0.55), css(BUFF, 1.05), css(BROWN, 1.25)], r: [2, 6], alpha: [0.4, 0.8], squash: 0.6 });
  p.fur({ n: 900, colors: [css(BROWN, 0.8), css(BROWN, 1.15)], len: [6, 12], width: [2, 3], alpha: [0.25, 0.5] });
  return p.texture();
}

/** The head sphere: a pale face disc with a dark rim at the front, mottled feathers elsewhere, white brows. */
function headTexture() {
  const W = 512, H = 256;
  const p = new Painter(W, H, 4402).fill(css(BROWN));
  p.dabs({ n: 200, colors: [css(BROWN, 0.6), css(BUFF), css(BROWN, 1.25)], r: [2, 5], alpha: [0.4, 0.8] });
  const g = p.g, cx = W * 0.25, cy = H * 0.56;
  // the face disc: two pale bowls round the eyes with a dark ruff round the edge
  for (const s of [-1, 1]) {
    const x = cx + s * W * 0.045;
    const gr = g.createRadialGradient(x, cy, 4, x, cy, W * 0.07);
    gr.addColorStop(0, css(BUFF, 1.12)); gr.addColorStop(0.8, css(BUFF, 0.95)); gr.addColorStop(1, css(0x3a2a1e));
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, cy, W * 0.07, H * 0.24, 0, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = css(0x2e2016); g.lineWidth = 6; g.globalAlpha = 0.8;
  g.beginPath(); g.ellipse(cx, cy + 4, W * 0.115, H * 0.27, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  g.globalAlpha = 1;
  // pale brows sweeping up into the ear tufts
  g.strokeStyle = '#efe6d2'; g.lineWidth = 5; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 6, cy - H * 0.05); g.quadraticCurveTo(cx + s * W * 0.04, cy - H * 0.2, cx + s * W * 0.09, cy - H * 0.24); g.stroke(); }
  return p.texture();
}

export function makeOwl(seed = 4400): Owl {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const ink = 0x2a1e16;
  const bodyMat = charToon({ map: bodyTexture(), rim: 0.5 });
  const plain = charToon({ color: BROWN, rim: 0.45 });
  const lift = new THREE.Group(); group.add(lift);

  // body, tail and feet
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), bodyMat);
  body.scale.set(0.3, 0.38, 0.27); body.position.y = 0.38;
  lift.add(body);
  outline(body, ink, 1.4, 0.02);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), plain);
  tail.scale.set(0.14, 0.05, 0.2); tail.position.set(0, 0.1, -0.22); tail.rotation.x = 0.5;
  lift.add(tail);
  const toes = charToon({ color: 0x8a8070, rim: 0.2 });
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), toes);
    foot.scale.set(1, 0.6, 1.4); foot.position.set(s * 0.09, 0.03, 0.08);
    group.add(foot);
  }

  // wings: folded at the sides, they swing open in a flap
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.24, 0.6, -0.02);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bodyMat);
    w.scale.set(0.07, 0.3, 0.2); w.position.set(0, -0.24, -0.02);
    pivot.add(w);
    outline(w, ink, 1.3, 0.02);
    lift.add(pivot);
    wings.push(pivot);
  }

  // the head: face disc, eyes that shine, beak, ear tufts
  const head = new THREE.Group(); head.position.y = 0.72; lift.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), charToon({ map: headTexture(), rim: 0.45 }));
  skull.scale.set(1.05, 0.92, 0.92);
  head.add(skull);
  outline(skull, ink, 1.4, 0.02);
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf2b030).multiplyScalar(1.5) });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0c0806 });
  const lidMat = charToon({ color: 0x8a7458, rim: 0.2 });
  const lids: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.1, 0.02, 0.2);
    eye.rotation.y = s * 0.25;
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), eyeMat); iris.scale.z = 0.45; eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), pupilMat); pupil.scale.z = 0.3; pupil.position.z = 0.03; eye.add(pupil);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); shine.position.set(-0.02, 0.025, 0.045); eye.add(shine);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
    lid.scale.z = 0.55; lid.rotation.x = -1.5; eye.add(lid);
    lids.push(lid);
    head.add(eye);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), charToon({ color: 0x6a6a62, rim: 0.2 }));
  beak.position.set(0, -0.06, 0.24); beak.rotation.x = Math.PI - 0.5;
  head.add(beak);
  for (const s of [-1, 1]) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), plain);
    tuft.position.set(s * 0.15, 0.22, 0.02); tuft.rotation.set(-0.15, 0, -s * 0.45); tuft.scale.z = 0.5;
    head.add(tuft);
    outline(tuft, ink, 1.3, 0.02);
  }
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.outline) o.castShadow = true; });
  // merge the parts that only follow the body, the head or a wing (see bake.ts)
  bakeRigid(group, (o) => o === lift || o === head || wings.includes(o as THREE.Group));

  // ---------- life ----------
  const look = new LookAt(1.4, 0.5);
  let turnT = -1, flapT = -1, blinkSince = 9, nextBlink = 1.5, bobT = 3 + rng.next() * 4;
  const bob = new Spring(0, 3, 0.4);
  const owl: Owl = {
    group, head, lookTarget: null,
    turn() { if (turnT < 0) turnT = 0; },
    flap() { flapT = 0; },
    update(dt, t) {
      // turning right round: half way, a pause looking backwards, then the rest of the way
      let spin = 0;
      if (turnT >= 0) {
        turnT += dt;
        spin = Math.PI * easeInOut(clamp(turnT / 0.75, 0, 1)) + Math.PI * easeInOut(clamp((turnT - 1.25) / 0.75, 0, 1));
        if (turnT > 2.2) turnT = -1;
      }
      const [ly, lp] = look.update(head, turnT >= 0 ? null : owl.lookTarget, dt, 1);
      head.rotation.set(lp + bob.update(0, dt) * 0.3, ly + spin, Math.sin(t * 0.8) * 0.05);
      // now and then a curious bob of the head
      bobT -= dt;
      if (bobT <= 0) { bobT = 3 + rng.next() * 5; bob.v -= 2.2; }
      // a flap and a hop
      let f = 0;
      if (flapT >= 0) { flapT += dt; f = envelope(flapT, 0, 0.15, 0.85, 1.2); if (flapT > 1.3) flapT = -1; }
      wings.forEach((w, i) => { const s = i === 0 ? -1 : 1; w.rotation.z = s * f * (1.0 + Math.sin(t * 22) * 0.5); });
      lift.position.y = f * 0.25 * Math.abs(Math.sin(flapT * 5));
      // blink
      blinkSince += dt; nextBlink -= dt;
      if (nextBlink <= 0) { nextBlink = 2 + rng.next() * 4; blinkSince = 0; }
      const closed = blinkAmount(blinkSince, 0.22);
      for (const lid of lids) { lid.rotation.x = -1.5 + closed * 2.9; lid.visible = closed > 0.02; }
    },
  };
  return owl;
}
