import * as THREE from 'three';
import { makeCatbus, type Catbus } from '../ghibli/catbus';
import { canvasTexture } from '../../engine/Builders';

/**
 * The Catbus as the ride. The rider sits in the fur on its back, just behind its head, so its ears and
 * the destination board sit at the bottom of the view. The board has a second face on its back, for the
 * rider, that names where the Catbus is going.
 *
 * Origin: the Catbus's paws, on the path. Local +z is forward (the head). The world places `root`; while
 * riding, `root` sits at the vehicle's origin.
 */
export interface CatbusMount {
  catbus: Catbus;
  root: THREE.Group;
  /** the camera's place on its back, in its own space */
  seat: THREE.Vector3;
  /**
   * Spots on its back behind the rider, in its own space, facing forward. Parent a passenger to one
   * (`mount.seats[0].add(noFace.group)`); they ride along wherever the Catbus goes.
   */
  seats: THREE.Group[];
  /** the destination on the rider's side of the board */
  setSign(text: string): void;
  /** a world point the Catbus turns its head towards while it runs, or null to look ahead */
  lookAt(p: THREE.Vector3 | null): void;
}

export const SEAT = new THREE.Vector3(0, 5.1, -1.5);

export function buildCatbusMount(): CatbusMount {
  const catbus = makeCatbus();
  const root = new THREE.Group();
  root.add(catbus.group);
  catbus.lookWhileRunning = true;

  // the board's back face, which the rider reads
  let text = '';
  let ctx2d: CanvasRenderingContext2D | null = null;
  const tex = canvasTexture(512, 160, (c) => { ctx2d = c; });
  const draw = () => {
    const c = ctx2d;
    if (!c) return;
    const w = 512, h = 160;
    c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#7a5a3c'; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = 'rgba(120,90,60,0.12)'; c.fillRect(10, h - 34, w - 20, 24);
    c.fillStyle = '#1f2a4a';
    let size = 76;
    c.font = `bold ${size}px Georgia, serif`;
    while (c.measureText(text).width > w - 50 && size > 30) { size -= 4; c.font = `bold ${size}px Georgia, serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 4);
    tex.needsUpdate = true;
  };
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.1, 1.08, 1.0) }));
  back.position.z = -0.26;
  back.rotation.y = Math.PI;
  catbus.sign.add(back);

  // passenger spots along the back, behind the rider
  const seats: THREE.Group[] = [];
  for (const z of [-2.4, -3.6]) {
    const s = new THREE.Group();
    s.position.set(0, 3.32, z);
    root.add(s);
    seats.push(s);
  }

  const mount: CatbusMount = {
    catbus, root, seat: SEAT.clone(), seats,
    setSign(t) { if (t === text) return; text = t; draw(); },
    lookAt(p) { catbus.lookTarget = p; },
  };
  mount.setSign('ANYWHERE');
  return mount;
}
