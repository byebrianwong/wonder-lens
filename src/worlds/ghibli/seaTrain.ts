import * as THREE from 'three';
import { lambert, glow, box, cyl, cone, mesh, sphere, capsule } from '../../engine/Builders';
import { boxUV, repeatUV } from '../../engine/Paint';
import { trainPanels, creamPaint, trainRoof, deckPlanks, trainWindow, cabinPanels } from './propTextures';
import { ironTexture, woodGrain } from './characterTextures';

/** The Spirited Away style sea train: railcar behind an open front deck for the photographer. */
export function buildSeaTrain() {
  const g = new THREE.Group();
  // painted steel in panels with riveted seams; UVs are in world units so every panel is the same size
  const paint = new THREE.MeshLambertMaterial({ map: trainPanels(0x2d5a4a) });
  const cream = new THREE.MeshLambertMaterial({ map: creamPaint(0xe8dcc0) });
  const dark = new THREE.MeshLambertMaterial({ map: ironTexture(0x2a2c30, 308) });
  const B = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), 1.6), mat, x, y, z);
  // car body behind the deck: local +z is forward. The front cabin is hollow so you can see the passengers.
  const car = new THREE.Group();
  // rear body (solid)
  car.add(B(3.2, 2.7, 8.0, paint, 0, 1.9, -8.7));
  car.add(B(3.3, 0.5, 8.1, cream, 0, 1.4, -8.7));
  // cabin side walls (z -1.1 .. -4.7), each with a real glass window beside the seats (y 1.7 .. 2.8,
  // z -3.25 .. -1.75), so a rider leaning out to look back can see the passengers
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ea, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0, depthWrite: false });
  const frameMat = new THREE.MeshLambertMaterial({ map: woodGrain(0x5a4030, 307) });
  for (const sx of [-1, 1]) {
    car.add(B(0.1, 1.15, 3.6, paint, sx * 1.55, 1.125, -2.9));
    car.add(B(0.1, 0.45, 3.6, paint, sx * 1.55, 3.025, -2.9));
    car.add(B(0.1, 1.1, 1.45, paint, sx * 1.55, 2.25, -3.975), B(0.1, 1.1, 0.65, paint, sx * 1.55, 2.25, -1.425));
    car.add(B(0.12, 0.5, 3.6, cream, sx * 1.6, 1.4, -2.9));
    car.add(box(0.03, 1.1, 1.5, glass, sx * 1.56, 2.25, -2.5));
    for (const y of [1.7, 2.8]) car.add(box(0.16, 0.08, 1.6, frameMat, sx * 1.56, y, -2.5));
    for (const z of [-3.25, -1.75]) car.add(box(0.16, 1.16, 0.08, frameMat, sx * 1.56, 2.25, z));
  }
  // front wall pieces around the window opening (y 1.7 .. 2.85, x -1.2 .. 1.2)
  car.add(B(3.2, 1.15, 0.3, paint, 0, 1.125, -0.95));
  car.add(B(3.3, 0.5, 0.32, cream, 0, 1.4, -0.95));
  car.add(B(3.2, 0.4, 0.3, paint, 0, 3.05, -0.95));
  car.add(B(0.4, 1.15, 0.3, paint, -1.4, 2.275, -0.95), B(0.4, 1.15, 0.3, paint, 1.4, 2.275, -0.95));
  const roofGeo = repeatUV(new THREE.CylinderGeometry(1.7, 1.7, 12.2, 16, 1, false, 0, Math.PI), 1, 10);
  const roof = mesh(roofGeo, new THREE.MeshLambertMaterial({ map: trainRoof(0x3a3f44) }), 0, 3.25, -6.9);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
  roof.scale.y = 1; roof.scale.x = 0.55;
  car.add(roof);
  const win = trainWindow();
  const winMat = new THREE.MeshLambertMaterial({ map: win.map, emissive: 0xffffff, emissiveMap: win.glow, emissiveIntensity: 0.9 });
  const windows: THREE.Mesh[] = [];
  // painted lit windows along the rest of the car (the first on each side is the glass one above)
  for (const s of [-1, 1]) for (let i = 1; i < 5; i++) {
    const w = box(0.06, 1.1, 1.4, winMat, s * 1.62, 2.25, -2.5 - i * 2.1);
    car.add(w); windows.push(w);
  }
  // glass in the front opening
  car.add(box(2.4, 1.15, 0.03, glass, 0, 2.275, -0.95));
  // interior: warm panels, a bench facing forward, and the passengers
  const interior = new THREE.Group();
  const panel = new THREE.MeshLambertMaterial({ map: cabinPanels(), emissive: 0x6a5230, emissiveIntensity: 0.6 });
  const P = (w: number, h: number, d: number, x: number, y: number, z: number) => mesh(boxUV(new THREE.BoxGeometry(w, h, d), 1.3), panel, x, y, z);
  interior.add(P(3.0, 2.6, 0.1, 0, 1.9, -4.65));
  for (const sx of [-1, 1]) {
    interior.add(P(0.06, 1.1, 3.6, sx * 1.47, 1.15, -2.9), P(0.06, 0.4, 3.6, sx * 1.47, 3.0, -2.9));
    interior.add(P(0.06, 1.1, 1.45, sx * 1.47, 2.25, -3.975), P(0.06, 1.1, 0.65, sx * 1.47, 2.25, -1.425));
  }
  interior.add(mesh(boxUV(new THREE.BoxGeometry(3.0, 0.1, 3.7), 1), new THREE.MeshLambertMaterial({ map: deckPlanks(0x6a4e3a) }), 0, 0.62, -2.9));
  interior.add(box(3.0, 0.1, 3.7, lambert(0xd9c9a0, { emissive: 0x6a5230, emissiveIntensity: 0.6 }), 0, 3.18, -2.9));
  const benchWood = new THREE.MeshLambertMaterial({ map: woodGrain(0x7a5a3a, 309) });
  interior.add(box(2.6, 0.14, 0.6, benchWood, 0, 1.1, -2.1), box(2.6, 0.7, 0.12, benchWood, 0, 1.4, -2.4));
  const shade = new THREE.MeshBasicMaterial({ color: 0x0a0c12, transparent: true, opacity: 0.7 });
  interior.add(capsule(0.26, 0.9, shade, 1.0, 1.75, -3.7), sphere(0.2, shade, 1.0, 2.45, -3.7), cyl(0.35, 0.35, 0.2, shade, 1.0, 2.7, -3.7));
  car.add(interior);
  // wheels / bogies
  for (const s of [-1, 1]) for (const z of [-2.5, -10.5]) car.add(B(0.5, 0.9, 2.6, dark, s * 1.3, 0.45, z));
  g.add(car);
  // open deck at the front with railings and a lantern; the boards are right under the camera
  const deck = new THREE.Group();
  deck.add(mesh(boxUV(new THREE.BoxGeometry(3.2, 0.3, 4.4), 1), new THREE.MeshLambertMaterial({ map: deckPlanks(0x5a4230) }), 0, 0.45, 1.8));
  deck.add(mesh(boxUV(new THREE.BoxGeometry(3.4, 0.08, 4.6), 1), new THREE.MeshLambertMaterial({ map: deckPlanks(0x8a6a4a) }), 0, 0.62, 1.8));
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc9a25a, metalness: 0.8, roughness: 0.35 });
  const post = (x: number, z: number) => deck.add(cyl(0.035, 0.035, 1.05, railMat, x, 1.15, z));
  for (const x of [-1.5, 1.5]) { post(x, 0.2); post(x, 2.0); post(x, 3.9); }
  post(-0.9, 3.95); post(0.9, 3.95);
  for (const x of [-1.5, 1.5]) { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.8, 6), railMat, x, 1.68, 2.05); r.rotation.x = Math.PI / 2; deck.add(r); }
  { const r = mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 6), railMat, 0, 1.68, 3.95); r.rotation.z = Math.PI / 2; deck.add(r); }
  const lamp = new THREE.Group();
  // a tall corner pole with a hanging lantern, kept above the eyeline so it never blocks a shot
  lamp.add(cyl(0.03, 0.035, 2.6, dark, 0, 1.9, 0), cyl(0.02, 0.02, 0.5, dark, -0.25, 3.15, 0).rotateZ(Math.PI / 2), cyl(0.012, 0.012, 0.3, dark, -0.5, 3.0, 0));
  lamp.add(box(0.15, 0.2, 0.15, dark, -0.5, 2.78, 0), box(0.11, 0.15, 0.11, glow(0xffd28a, 1.05), -0.5, 2.78, 0), cone(0.12, 0.08, dark, -0.5, 2.91, 0, 4));
  lamp.position.set(1.5, 0, 3.9);
  deck.add(lamp);
  const light = new THREE.PointLight(0xffc88a, 2.2, 11, 1.6);
  light.position.set(1.0, 2.75, 3.7);
  deck.add(light);
  g.add(deck);
  const cabinLight = new THREE.PointLight(0xffd9a0, 3, 6, 1.4);
  cabinLight.position.set(0, 2.7, -2.4);
  car.add(cabinLight);
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, windows, winMat, light, interior, cabinLight };
}
