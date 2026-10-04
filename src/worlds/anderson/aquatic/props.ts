import * as THREE from 'three';
import { canvasTexture, mergeStatic } from '../../../engine/Builders';
import { charToon } from '../../../engine/Paint';
import { TAU } from '../../../engine/math';
import { beanie, HEAD_R } from '../people';

/*
 * Small props for the Life Aquatic scene.
 */

/**
 * Esteban's memorial: his old brass diving helmet lying on a rock, a red knit beanie pulled over its crown and a
 * little plaque with his name. (Esteban du Plantier, Steve's partner, was eaten by the jaguar shark.)
 */
export function estebanHelmet() {
  const g = new THREE.Group();
  const brass = charToon({ color: 0xd8a848, rim: 0.6, emissive: new THREE.Color(0x2a1a04) });
  const glass = charToon({ color: 0x1a3a4a, rim: 0.8, emissive: new THREE.Color(0x0a2030) });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.62, 22, 16), brass);
  dome.scale.set(1, 1.05, 1);
  dome.position.y = 0.62;
  g.add(dome);
  // the breastplate (corselet) under it
  const corselet = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.86, 0.36, 22), brass);
  corselet.position.y = 0.06;
  g.add(corselet);
  // three round windows with heavy rims: front and both sides
  for (const [a, r] of [[0, 0.24], [Math.PI / 2, 0.17], [-Math.PI / 2, 0.17]] as Array<[number, number]>) {
    const w = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 20), brass);
    const pane = new THREE.Mesh(new THREE.CircleGeometry(r, 18), glass);
    w.add(rim, pane);
    w.position.set(Math.sin(a) * 0.6, 0.6, Math.cos(a) * 0.6);
    w.rotation.y = a;
    g.add(w);
    // the grille over the front window
    if (a === 0) for (const x of [-0.08, 0.08]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, r * 2, 5), brass); b.position.set(x, 0.6, 0.63); g.add(b); }
  }
  // bolts round the neck ring
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), brass); b.position.set(Math.cos(a) * 0.66, 0.2, Math.sin(a) * 0.66); g.add(b); }
  // the red beanie, a little crooked
  const cap = beanie(HEAD_R.adult);
  cap.scale.setScalar(3.4);
  cap.position.set(0.03, 0.62, -0.02);
  cap.rotation.set(-0.15, 0, 0.18);
  g.add(cap);
  // the plaque on the rock in front
  const tex = canvasTexture(256, 128, (c) => {
    c.fillStyle = '#c89a3a'; c.fillRect(0, 0, 256, 128);
    c.strokeStyle = '#7a5a1a'; c.lineWidth = 6; c.strokeRect(8, 8, 240, 112);
    c.fillStyle = '#3a2a0a'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 24px Georgia, serif'; c.fillText('ESTEBAN', 128, 46);
    c.font = 'italic 17px Georgia, serif'; c.fillText('du Plantier', 128, 76);
    c.font = '13px Georgia, serif'; c.fillText('beloved friend', 128, 100);
  });
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), charToon({ map: tex, rim: 0.3 }));
  plaque.position.set(0, 0.05, 1.05);
  plaque.rotation.x = -1.0;
  g.add(plaque);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  mergeStatic(g);
  return g;
}
