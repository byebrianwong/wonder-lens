import * as THREE from 'three';
import type { Renderer } from '../engine/Renderer';
import type { Input } from '../engine/Input';
import type { AudioEngine } from '../engine/Audio';
import { Puffs } from '../engine/Particles';
import { damp } from '../engine/math';
import type { BuiltWorld, LightingState, WorldDef } from './types';
import { Ride } from './Ride';
import { CameraRig } from './CameraRig';
import { Items } from './Items';
import { Hud } from './Hud';
import { scorePhoto, snapshotCanvas, type PhotoResult } from './Photo';
import { Album, summarize } from './Album';

export interface GameOptions {
  renderer: Renderer;
  input: Input;
  audio: AudioEngine;
  def: WorldDef;
  relax: boolean;
  lowDetail: boolean;
  onExit: () => void;
  onAgain: () => void;
  ui: HTMLElement;
}

const FILM_MAX = 24;

/** One ride through one world: owns the loop, the camera, the photo state and the HUD. */
export class Game {
  private o: GameOptions;
  private world!: BuiltWorld;
  private ride!: Ride;
  private rig!: CameraRig;
  private items!: Items;
  private hud!: Hud;
  private puffs!: Puffs;
  private photos: PhotoResult[] = [];
  private film = FILM_MAX;
  private discovered = new Set<string>();
  private pendingShot = false;
  private throwCd = 0;
  private callCd = 0;
  private paused = false;
  private running = false;
  private last = 0;
  private time = 0;
  private raf = 0;
  private endTimer = -1;
  private album: Album | null = null;
  private pauseEl: HTMLElement | null = null;
  private light: LightingState;
  private captionIdx = 0;
  private fade = 1;
  private fadeTarget = 0;
  private tmp = new THREE.Vector3();
  private ndc = new THREE.Vector3();
  private ray = new THREE.Raycaster();
  private lastTag = 0;
  private cheeringCd = 0;
  fps = 60;
  private idle = 0;
  private autoLook = new THREE.Vector3();

  constructor(o: GameOptions) {
    this.o = o;
    this.light = {
      skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyBottom: new THREE.Color(), fog: new THREE.Color(), fogDensity: 0.002,
      sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(), sunIntensity: 1, hemiSky: new THREE.Color(), hemiGround: new THREE.Color(),
      hemiIntensity: 1, stars: 0, moon: 0, exposure: 1, bloom: 0.4, saturation: 1, tint: new THREE.Color(1, 1, 1),
      sunGlow: 0.6, sunSize: 0.02, horizonHeight: 0.08,
    };
  }

  async start() {
    const { renderer, def, audio } = this.o;
    this.rig = new CameraRig(def.fov, renderer.aspect);
    const t0 = performance.now();
    this.world = def.build({ audio, camera: this.rig.camera, lowDetail: this.o.lowDetail });
    console.info(`[window seat] ${def.id} built in ${(performance.now() - t0).toFixed(0)} ms`);
    this.ride = new Ride(this.world.curve, this.world.speed, this.world.vehicle);
    (window as any).__dbg = { world: this.world, ride: this.ride, game: this, rig: this.rig };
    this.items = new Items(this.world, (pos, water) => this.onLand(pos, water));
    this.puffs = new Puffs();
    this.world.scene.add(this.puffs.group);
    this.hud = new Hud(this.o.ui, def.title, def.itemName, def.callName, def.accent, this.o.input.isTouch);
    this.hud.onShoot = () => this.shoot();
    this.hud.onThrow = () => this.throwItem();
    this.hud.onCall = () => this.call();
    this.hud.onZoom = (d) => { this.rig.fovT = Math.max(this.rig.fovBase / 3.2, Math.min(this.rig.fovBase, this.rig.fovT + d * 12)); };
    this.hud.setMinimal(this.o.relax);
    this.film = this.o.relax ? Infinity : FILM_MAX;
    this.hud.setFilm(this.film, FILM_MAX);
    renderer.setScene(this.world.scene, this.rig.camera);
    renderer.resize();
    audio.setProfile(this.world.ambience);
    this.bindInput();
    this.o.input.enabled = true;
    if (!this.o.input.isTouch) this.o.input.requestLock();
    this.running = true;
    this.last = performance.now();
    this.time = 0;
    this.applyLighting(0);
    this.hud.caption(`${def.vehicleName} departing…`, 4);
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  private bindInput() {
    const inp = this.o.input;
    inp.on('shoot', () => this.shoot());
    inp.on('throw', () => this.throwItem());
    inp.on('call', () => this.call());
    inp.on('pause', () => this.togglePause());
    inp.on('hud', () => { this.hud.setMinimal(!this.hud.minimal); });
  }

  private shoot() {
    if (this.paused || !this.running || this.ride.finished && this.endTimer > 1.5) return;
    if (this.film <= 0) { this.hud.flashWarning('Out of film'); this.o.audio.uiClick(); return; }
    this.pendingShot = true;
  }
  private throwItem() {
    if (this.paused || !this.running || this.throwCd > 0) return;
    this.throwCd = 1.1;
    this.items.throwFrom(this.rig.camera);
    this.o.audio.throwWhoosh();
  }
  private call() {
    if (this.paused || !this.running || this.callCd > 0) return;
    this.callCd = 3.2;
    this.o.audio.call(this.o.def.callKind);
    const pos = this.rig.camera.getWorldPosition(this.tmp.clone());
    this.world.onCall(pos, this.ride.state);
    let reacted: string[] = [];
    for (const s of this.world.subjects) if (s.tryCall(pos, 90)) reacted.push(s.name);
    if (reacted.length) {
      setTimeout(() => this.o.audio.react(1.1), 350);
      this.hud.centerMessage(`${reacted[0]} noticed!`);
    }
  }
  private onLand(pos: THREE.Vector3, water: boolean) {
    this.puffs.burst(pos, water ? 12 : 8, water ? 0xcfe8ff : 0xe8dcc8, water ? 3 : 2, water ? 3.5 : 2);
    this.o.audio.thump(water ? 'water' : 'ground');
    this.world.onItemLand(pos);
    for (const s of this.world.subjects) {
      if (s.tryItem(pos)) { setTimeout(() => this.o.audio.react(0.9), 200); this.hud.centerMessage(`${s.name} reacts!`); }
    }
  }

  togglePause() {
    if (!this.running || this.album) return;
    this.paused ? this.resume() : this.pause();
  }
  private pause() {
    this.paused = true;
    this.o.input.suspended = true;
    this.o.audio.setPaused(true);
    this.o.input.releaseLock();
    const p = document.createElement('div');
    p.className = 'pause';
    p.innerHTML = `
      <div class="pause-box">
        <h2>Paused</h2>
        <p class="pause-sub">${this.o.def.title}</p>
        <button class="btn primary" data-act="resume">Resume ride</button>
        <button class="btn" data-act="relax">${this.hud.minimal ? 'Show camera HUD' : 'Relax: hide HUD'}</button>
        <button class="btn" data-act="mouse">Mouse: ${this.o.input.mode === 'lock' ? 'locked (click to look)' : 'drag to look'}</button>
        <button class="btn" data-act="mute">${this.o.audio.muted ? 'Unmute' : 'Mute'} sound</button>
        <button class="btn" data-act="finish">Finish ride now</button>
        <button class="btn ghost" data-act="exit">Back to worlds</button>
        <div class="pause-help">
          <span><kbd>Click</kbd>/<kbd>Space</kbd> photo</span><span><kbd>E</kbd> throw</span><span><kbd>Q</kbd> call</span>
          <span><kbd>Wheel</kbd>/<kbd>Z</kbd> zoom</span><span><kbd>Shift</kbd> fast</span><span><kbd>Ctrl</kbd> slow</span><span><kbd>H</kbd> HUD</span>
        </div>
      </div>`;
    this.o.ui.appendChild(p);
    this.pauseEl = p;
    requestAnimationFrame(() => p.classList.add('show'));
    p.querySelector('[data-act=resume]')!.addEventListener('click', () => this.resume());
    p.querySelector('[data-act=relax]')!.addEventListener('click', () => { this.hud.setMinimal(!this.hud.minimal); this.resume(); });
    p.querySelector('[data-act=mouse]')!.addEventListener('click', () => {
      this.o.input.mode = this.o.input.mode === 'lock' ? 'drag' : 'lock';
      localStorage.setItem('ride.mouse', this.o.input.mode);
      this.resume();
    });
    p.querySelector('[data-act=mute]')!.addEventListener('click', () => { this.o.audio.setMuted(!this.o.audio.muted); this.resume(); });
    p.querySelector('[data-act=finish]')!.addEventListener('click', () => { this.resume(); this.finish(); });
    p.querySelector('[data-act=exit]')!.addEventListener('click', () => this.exit());
  }
  private resume() {
    if (!this.paused) return;
    this.paused = false;
    this.o.input.suspended = false;
    this.o.input.consume(); // drop anything that accumulated while the menu was open
    this.o.audio.setPaused(false);
    this.o.audio.resume();
    this.pauseEl?.remove(); this.pauseEl = null;
    this.last = performance.now();
    if (!this.o.input.isTouch) this.o.input.requestLock();
    this.hud.showHints();
  }

  private finishing = false;
  private finish() {
    if (this.album || this.finishing) return;
    this.finishing = true;
    this.o.input.enabled = false;
    this.o.input.releaseLock();
    this.fadeTarget = 1;
    setTimeout(() => {
      if (!this.running) return;
      try {
        const summary = summarize(this.photos, this.world.subjects);
        this.album = new Album(this.o.ui, summary, this.world.subjects, this.o.def.title, this.o.def.accent,
          () => this.o.onAgain(), () => this.exit(), this.o.relax);
      } catch (err) {
        console.error('[window seat] album failed', err);
        this.exit();
        return;
      }
      this.hud.root.style.display = 'none';
      this.o.audio.setPaused(true);
      // the world keeps drawing behind the album but no longer needs the fade
      this.fadeTarget = 0.85;
    }, 900);
  }

  exit() { this.destroy(); this.o.onExit(); }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.o.input.enabled = false;
    this.o.input.releaseLock();
    this.o.audio.setPaused(false);
    this.hud?.destroy();
    this.album?.destroy();
    this.pauseEl?.remove();
    this.items?.clear();
    this.world?.dispose();
    this.o.renderer.grade.uniforms.fade.value = 0;
    this.o.renderer.grade.uniforms.flash.value = 0;
  }

  private applyLighting(u: number) {
    const L = this.light;
    const w = this.world;
    w.lighting(u, L);
    const sky = w.sky.uniforms;
    sky.topColor.value.copy(L.skyTop); sky.midColor.value.copy(L.skyMid); sky.bottomColor.value.copy(L.skyBottom);
    sky.sunDir.value.copy(L.sunDir).normalize(); sky.sunColor.value.copy(L.sunColor);
    sky.starAmount.value = L.stars; sky.moonAmount.value = L.moon;
    sky.sunGlow.value = L.sunGlow; sky.sunSize.value = L.sunSize;
    sky.moonDir.value.copy(L.sunDir).normalize();
    sky.horizonColor.value.copy(L.fog); sky.horizonHeight.value = L.horizonHeight;
    const fog = w.scene.fog as THREE.FogExp2 | null;
    if (fog) { fog.color.copy(L.fog); fog.density = L.fogDensity; }
    w.sun.color.copy(L.sunColor); w.sun.intensity = L.sunIntensity;
    w.sun.position.copy(L.sunDir).multiplyScalar(180).add(this.ride.state.position);
    w.sun.target.position.copy(this.ride.state.position);
    w.sun.target.updateMatrixWorld();
    w.hemi.color.copy(L.hemiSky); w.hemi.groundColor.copy(L.hemiGround); w.hemi.intensity = L.hemiIntensity;
    const r = this.o.renderer;
    r.renderer.toneMappingExposure = L.exposure;
    r.bloom.strength = L.bloom;
    r.grade.uniforms.saturation.value = L.saturation;
    (r.grade.uniforms.tint.value as THREE.Color).copy(L.tint);
  }

  private loop(now: number) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.loop(t));
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(rawDt, 0.05);
    if (rawDt > 0) this.fps = this.fps * 0.95 + (1 / rawDt) * 0.05;
    const r = this.o.renderer;
    r.govern(rawDt * 1000);
    if (this.paused) { r.render(this.time); return; }
    this.time += dt;
    const inp = this.o.input;
    // speed control
    const fast = inp.down('ShiftLeft');
    const slow = inp.down('ControlLeft') || inp.down('ControlRight') || inp.down('KeyV');
    this.ride.speedTarget = fast ? 2.4 : slow ? 0.35 : 1;
    this.ride.update(dt);
    const st = this.ride.state;
    this.o.audio.setVehicleSpeed(st.speedMult);
    this.world.update(dt, st);
    for (const s of this.world.subjects) s.update(dt, st);
    this.autoCamera(dt, inp);
    this.rig.update(dt, inp, this.world.cameraAnchor, this.time);
    this.items.update(dt);
    this.puffs.update(dt);
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.callCd = Math.max(0, this.callCd - dt);
    this.cheeringCd = Math.max(0, this.cheeringCd - dt);
    this.applyLighting(st.u);
    this.world.sky.update(this.rig.camera.position, this.time);
    const env = this.world.env(st.u);
    this.o.audio.setEnvironment(env);
    this.o.audio.update(dt);
    // hud
    this.hud.update(dt);
    this.hud.setZoom(this.rig.zoom01);
    this.hud.setProgress(st.u);
    this.hud.setCooldowns(this.throwCd / 1.1, this.callCd / 3.2);
    this.captions(st.u);
    this.hud.showLockHint(inp.mode === 'lock' && !inp.pointerLocked && !inp.isTouch && this.time > 1.5 && !this.ride.finished);
    this.lastTag += dt;
    if (this.lastTag > 0.12) { this.lastTag = 0; this.hud.tagSubject(this.nearestCentered()); }
    // fades
    this.fade = damp(this.fade, this.fadeTarget, this.fadeTarget > this.fade ? 4 : 2.2, dt);
    r.grade.uniforms.fade.value = this.fade;
    r.grade.uniforms.flash.value = damp(r.grade.uniforms.flash.value, 0, 10, dt);
    // end of ride
    if (this.ride.finished) {
      if (this.endTimer < 0) { this.endTimer = 0; this.hud.caption('End of the line.', 4); }
      this.endTimer += dt;
      if (this.endTimer > 3.5 && !this.album) this.finish();
    }
    r.render(this.time);
    if (this.pendingShot) { this.pendingShot = false; this.takePhoto(); }
  }

  /** After a while without input the camera drifts toward whatever is worth looking at, like a tour guide. */
  private autoCamera(dt: number, inp: import('../engine/Input').Input) {
    const moved = inp.lookDX !== 0 || inp.lookDY !== 0 || inp.wheel !== 0 || inp.down('ArrowLeft') || inp.down('ArrowRight') || inp.down('ArrowUp') || inp.down('ArrowDown') || inp.down('KeyA') || inp.down('KeyD') || inp.down('KeyW') || inp.down('KeyS');
    if (moved) { this.idle = 0; return; }
    this.idle += dt;
    const delay = this.o.relax ? 4 : 12;
    if (this.idle < delay) return;
    const strength = Math.min(1, (this.idle - delay) / 6);
    // pick the closest active subject in front-ish of the vehicle
    const cam = this.rig.camera;
    let best: import('./Subject').Subject | null = null;
    let bestScore = 0;
    for (const s of this.world.subjects) {
      if (!s.active) continue;
      s.center(this.tmp);
      const d = this.tmp.distanceTo(cam.position);
      if (d > Math.min(s.maxDistance * 0.7, 150) || d < 7) continue; // skip things riding with us
      const score = (s.base / 1000) * (1 - d / 160) * (s.pose !== 'idle' ? 1.6 : 1);
      if (score > bestScore) { bestScore = score; best = s; }
    }
    let yawT: number, pitchT: number;
    if (best) {
      best.center(this.autoLook);
      const q = this.world.cameraAnchor.getWorldQuaternion(new THREE.Quaternion()).invert();
      const local = this.autoLook.sub(cam.position).applyQuaternion(q);
      yawT = Math.atan2(-local.x, -local.z);
      pitchT = Math.atan2(local.y, Math.hypot(local.x, local.z));
    } else {
      yawT = Math.sin(this.time * 0.11) * 0.45;
      pitchT = 0.04 + Math.sin(this.time * 0.07) * 0.06;
    }
    yawT = Math.max(-this.rig.yawLimit, Math.min(this.rig.yawLimit, yawT));
    pitchT = Math.max(this.rig.pitchMin, Math.min(this.rig.pitchMax, pitchT));
    const k = 1 - Math.exp(-dt * 0.9 * strength);
    this.rig.yawT += (yawT - this.rig.yawT) * k;
    this.rig.pitchT += (pitchT - this.rig.pitchT) * k;
  }

  private captions(u: number) {
    const caps = this.world.captions;
    while (this.captionIdx < caps.length && u >= caps[this.captionIdx][0]) {
      this.hud.caption(caps[this.captionIdx][1], 6);
      this.captionIdx++;
    }
  }

  private nearestCentered() {
    const cam = this.rig.camera;
    let best: import('./Subject').Subject | null = null;
    let bestD = 0.28;
    for (const s of this.world.subjects) {
      if (!s.active) continue;
      s.center(this.tmp);
      const dist = this.tmp.distanceTo(cam.position);
      if (dist > s.maxDistance * 0.8) continue;
      this.ndc.copy(this.tmp).project(cam);
      if (this.ndc.z > 1 || this.ndc.z < -1) continue;
      const d = Math.hypot(this.ndc.x, this.ndc.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && this.world.occluders.length) {
      best.center(this.tmp);
      const dir = this.tmp.clone().sub(cam.position);
      const len = dir.length();
      this.ray.set(cam.position, dir.normalize());
      this.ray.near = 0.5; this.ray.far = Math.max(0.6, len - best.radius * 0.6);
      if (this.ray.intersectObjects(this.world.occluders, true).length) return null;
    }
    return best;
  }

  private takePhoto() {
    const r = this.o.renderer;
    const dataUrl = snapshotCanvas(r.canvas);
    const result = scorePhoto(this.rig.camera, this.world.subjects, this.world.occluders, { symmetryBonus: this.o.def.id === 'anderson' }, this.ride.state.u, this.time, dataUrl);
    this.photos.push(result);
    if (this.film !== Infinity) this.film--;
    this.hud.setFilm(this.film, FILM_MAX);
    r.grade.uniforms.flash.value = 0.85;
    this.rig.shake(0.006);
    this.o.audio.shutter();
    this.hud.showPhoto(result);
    if (result.stars > 0) setTimeout(() => this.o.audio.chime(result.stars), 150);
    for (const s of result.shots) {
      if (!this.discovered.has(s.subject.id)) {
        this.discovered.add(s.subject.id);
        this.hud.toast(`<b>New in your field guide:</b> ${s.subject.name}`, 'discover');
      }
    }
    if (this.film === 0) this.hud.toast('That was your last shot. Sit back and enjoy the ride.', 'warn');
  }
}
