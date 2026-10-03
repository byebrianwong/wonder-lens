import * as THREE from 'three';
import { mesh } from '../../engine/Builders';
import { charToon, Painter } from '../../engine/Paint';
import { TAU } from '../../engine/math';
import { css, PAL } from './textures';

/**
 * Nino's red scooter, seen mostly from the rider's seat: a red handlebar cowl with a cream speedometer,
 * chrome levers and black grips, a round mirror, the leg shield's chrome-trimmed top edge, and a wicker
 * basket hung low on the front with a baguette and a posy of flowers (low enough not to block the road).
 * Local +z is forward; the rider's eyes are at about (0, 1.64, -0.42).
 */

/** Fake chrome: a painted reflection (warm sky, a dark horizon band, brown ground) instead of a real environment map. */
function chromeTexture() {
  const p = new Painter(16, 128, 5);
  p.vgrad([[0, '#fbf6ea'], [0.38, '#d8d4c8'], [0.48, '#5a5450'], [0.55, '#9a8a78'], [1, '#4a3a2c']]);
  return p.texture({ wrap: false });
}

/** Speedometer dial: cream face, numbers round the edge, the brand in script. */
function dialTexture() {
  const p = new Painter(256, 256, 7).fill('#20180f');
  const g = p.g;
  g.fillStyle = '#f6ecd2'; g.beginPath(); g.arc(128, 128, 116, 0, TAU); g.fill();
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 3;
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5;
    g.beginPath(); g.moveTo(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92); g.lineTo(128 + Math.cos(a) * (i % 2 ? 104 : 110), 128 + Math.sin(a) * (i % 2 ? 104 : 110)); g.stroke();
    if (i % 2 === 0) { g.fillStyle = '#3a2a1c'; g.font = 'bold 20px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i * 5), 128 + Math.cos(a) * 74, 128 + Math.sin(a) * 74); }
  }
  g.fillStyle = css(PAL.red); g.font = 'italic bold 26px Georgia, serif'; g.textAlign = 'center'; g.fillText('Nino', 128, 176);
  g.fillStyle = '#7a6a50'; g.font = '14px Georgia, serif'; g.fillText('km/h', 128, 96);
  return p.texture({ wrap: false });
}

function wickerTexture() {
  const p = new Painter(128, 64, 9).fill('#a87a40');
  const g = p.g;
  for (let y = 0; y < 64; y += 8) for (let x = 0; x < 128; x += 8) {
    g.fillStyle = ((x + y) / 8) % 2 ? '#d8aa62' : '#8a6030';
    g.beginPath(); g.ellipse(x + 4, y + 4, 4.5, 3, ((x + y) / 8) % 2 ? 0.5 : -0.5, 0, TAU); g.fill();
  }
  p.vgrad([[0, 'rgba(255,240,200,0.15)'], [1, 'rgba(40,20,0,0.25)']]);
  return p.texture({ repeat: [3, 1] });
}

export function buildMoped(opts: { light?: boolean } = {}) {
  const g = new THREE.Group();
  const red = charToon({ color: 0xc8261e, rim: 0.55, shade: 0x9a7090, emissive: new THREE.Color(0x3a0806) });
  const redDark = charToon({ color: 0x8a1a16, rim: 0.4, emissive: new THREE.Color(0x200404) });
  const cream = charToon({ color: 0xf2e6cc, rim: 0.4, emissive: new THREE.Color(0x2a2418) });
  const chrome = new THREE.MeshLambertMaterial({ map: chromeTexture(), emissive: 0x2a2a28 });
  const rubber = charToon({ color: 0x1c1a1a, rim: 0.3 });
  const leather = charToon({ color: 0x4a2c1c, rim: 0.4 });

  // ----- wheels -----
  const wheel = (z: number) => {
    const w = new THREE.Group(); w.position.set(0, 0.3, z);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.075, 8, 22), rubber); tyre.rotation.y = Math.PI / 2; w.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 18), cream); rim.rotation.z = Math.PI / 2; w.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 10), chrome); hub.rotation.z = Math.PI / 2; w.add(hub);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.03), chrome); b.rotation.x = (i / 4) * Math.PI; w.add(b); }
    g.add(w);
    return w;
  };
  const frontWheel = wheel(0.9), rearWheel = wheel(-0.72);

  // ----- body -----
  // floorboard with rubber strips
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 0.82), redDark, 0, 0.3, 0.12));
  for (let i = 0; i < 4; i++) g.add(mesh(new THREE.BoxGeometry(0.04, 0.02, 0.7), rubber, -0.15 + i * 0.1, 0.34, 0.12));
  // the leg shield: a sheet curved round the front, leaning back a little, with a chrome edge on top
  {
    const geo = new THREE.CylinderGeometry(0.5, 0.42, 0.78, 20, 4, true, -0.75, 1.5);
    geo.translate(0, 0, -0.42);
    const shield = new THREE.Mesh(geo, red);
    shield.position.set(0, 0.7, 0.98); shield.rotation.x = -0.18;
    (shield.material as THREE.Material).side = THREE.DoubleSide;
    g.add(shield);

  }
  // front mudguard and fork
  { const mg = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.085, 6, 16, Math.PI * 0.9), red); mg.rotation.y = Math.PI / 2; mg.rotation.x = 0.15; mg.position.set(0, 0.3, 0.9); g.add(mg); }
  for (const s of [-1, 1]) { const f = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6), chrome, s * 0.1, 0.66, 0.84); f.rotation.x = 0.22; g.add(f); }
  // the rear cowl over the engine, the seat and the rack
  { const c = mesh(new THREE.SphereGeometry(1, 18, 12), red, 0, 0.62, -0.45); c.scale.set(0.3, 0.32, 0.56); g.add(c); }
  { const s = mesh(new THREE.CapsuleGeometry(0.15, 0.6, 4, 10), leather, 0, 0.93, -0.35); s.rotation.x = Math.PI / 2; s.scale.set(1.15, 1, 0.5); g.add(s); }
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.03, 0.32), chrome, 0, 0.96, -0.86));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a2a).multiplyScalar(1.2) }), 0, 0.72, -1.02));
  { const ex = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.55, 8), chrome, 0.22, 0.38, -0.55); ex.rotation.x = Math.PI / 2 - 0.15; g.add(ex); }

  // ----- the steering column and the handlebar cowl -----
  const bars = new THREE.Group(); bars.position.set(0, 1.06, 0.62); g.add(bars);
  bars.add(mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 8), redDark, 0, -0.25, 0.02));
  {
    // the cowl: a rounded red body across the bars, swelling at the front round the headlamp
    const cowl = mesh(new THREE.SphereGeometry(1, 24, 14), red, 0, 0.0, 0.02);
    cowl.scale.set(0.17, 0.065, 0.12); bars.add(cowl);
    const nose = mesh(new THREE.SphereGeometry(1, 20, 12), red, 0, -0.02, 0.1);
    nose.scale.set(0.1, 0.09, 0.09); bars.add(nose);
    // the bars out to the grips, with levers
    for (const s of [-1, 1]) {
      const b = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), chrome, s * 0.27, 0.01, 0); b.rotation.z = Math.PI / 2; bars.add(b);
      const grip = mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.14, 10), rubber, s * 0.42, 0.01, 0); grip.rotation.z = Math.PI / 2; bars.add(grip);
      bars.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), chrome, s * 0.5, 0.01, 0));
      const lever = mesh(new THREE.BoxGeometry(0.2, 0.012, 0.024), chrome, s * 0.37, 0.0, 0.07); lever.rotation.y = s * 0.15; bars.add(lever);
      bars.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), chrome, s * 0.27, 0.0, 0.05));
    }
    // speedometer facing the rider
    const speedo = new THREE.Group(); speedo.position.set(0, 0.07, -0.01); speedo.rotation.x = -0.75; bars.add(speedo);
    speedo.add(mesh(new THREE.CylinderGeometry(0.068, 0.07, 0.03, 24), chrome));
    const face = mesh(new THREE.CircleGeometry(0.058, 24), new THREE.MeshLambertMaterial({ map: dialTexture(), emissive: 0x3a3020, emissiveMap: null }), 0, 0.017, 0);
    face.rotation.x = -Math.PI / 2; face.rotation.z = Math.PI; speedo.add(face);
    const needle = new THREE.Group(); needle.position.y = 0.019; speedo.add(needle);
    const nm = mesh(new THREE.BoxGeometry(0.004, 0.002, 0.05), new THREE.MeshBasicMaterial({ color: 0xc82a1e }), 0, 0, -0.022); needle.add(nm);
    bars.userData.needle = needle;
    // headlamp glass at the front of the nose (seen by others, not by the rider)
    const lampMatInner = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(1.15) });
    const lens = mesh(new THREE.CircleGeometry(0.075, 18), lampMatInner, 0, -0.02, 0.2); bars.add(lens);
    bars.add(mesh(new THREE.TorusGeometry(0.078, 0.012, 6, 18), chrome, 0, -0.02, 0.2));
    bars.userData.lampMat = lampMatInner;
    // the round mirror on its stalk, up on the left
    const stalk = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.3, 5), chrome, -0.36, 0.13, 0.02); stalk.rotation.z = 0.5; bars.add(stalk);
    const mirror = new THREE.Group(); mirror.position.set(-0.44, 0.26, 0.04); mirror.rotation.y = 0.3; mirror.scale.setScalar(0.8); bars.add(mirror);
    const back = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 20), chrome); back.rotation.x = Math.PI / 2; mirror.add(back);
    const glass = mesh(new THREE.CircleGeometry(0.065, 20), new THREE.MeshLambertMaterial({ color: 0xd8dccc, emissive: 0x4a5048 }), 0, 0, -0.014); glass.rotation.y = Math.PI; mirror.add(glass);
  }

  // ----- the basket, hung low on the front of the leg shield -----
  {
    const basket = new THREE.Group(); basket.position.set(0, 0.72, 1.08); g.add(basket);
    const wick = charToon({ map: wickerTexture(), rim: 0.3 });
    const b = mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.26, 16, 1, true), wick); b.scale.z = 0.7; (b.material as THREE.Material).side = THREE.DoubleSide; basket.add(b);
    const bottom = mesh(new THREE.CircleGeometry(0.2, 16), wick, 0, -0.12, 0); bottom.rotation.x = -Math.PI / 2; bottom.scale.y = 0.7; basket.add(bottom);
    const rimT = mesh(new THREE.TorusGeometry(0.24, 0.018, 5, 18), charToon({ color: 0x8a6030, rim: 0.3 }), 0, 0.13, 0); rimT.rotation.x = Math.PI / 2; rimT.scale.y = 0.7; basket.add(rimT);
    // a baguette leaning out to the right, low
    const bag = mesh(new THREE.CapsuleGeometry(0.045, 0.5, 4, 8), charToon({ color: 0xd8963e, rim: 0.4 }), 0.12, 0.1, 0.02);
    bag.rotation.set(0.25, 0, -1.05); basket.add(bag);
    // a posy of red flowers on the left
    const stems = charToon({ color: 0x3a6a2a, rim: 0.3 }), petals = charToon({ color: 0xd8222a, rim: 0.5, emissive: new THREE.Color(0x300404) });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      basket.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.2, 4), stems, -0.1 + Math.cos(a) * 0.03, 0.17, Math.sin(a) * 0.03));
      basket.add(mesh(new THREE.IcosahedronGeometry(0.035, 1), petals, -0.1 + Math.cos(a) * 0.045, 0.28 + (i % 2) * 0.03, Math.sin(a) * 0.045));
    }
  }

  let light: THREE.PointLight | null = null;
  // the headlamp light sits well ahead so it lights the road, not the basket
  if (opts.light !== false) { light = new THREE.PointLight(0xffd9a0, 0, 24, 1.5); light.position.set(0, 0.9, 3.0); g.add(light); }
  g.traverse((c) => { if ((c as THREE.Mesh).isMesh) c.castShadow = true; });
  return { group: g, bars, frontWheel, rearWheel, lampMat: bars.userData.lampMat as THREE.MeshBasicMaterial, needle: bars.userData.needle as THREE.Group, light };
}
