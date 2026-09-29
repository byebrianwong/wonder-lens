import * as THREE from 'three';
import type { Renderer } from '../engine/Renderer';
import type { Input } from '../engine/Input';
import type { AudioEngine } from '../engine/Audio';
import { Puffs } from '../engine/Particles';
import { damp } from '../engine/math';
import type { BuiltWorld, LightingState, WorldDef } from './types';
import { Ride } from './Ride';
import { CameraRig } from './CameraRig';
import { Items, THROW_RANGE, flightTime, type Surface, type ThrowTarget } from './Items';
import type { Subject } from './Subject';
import { Hud } from './Hud';
import { scorePhoto, snapshotCanvas, type PhotoResult } from './Photo';
import { Album, summarize } from './Album';
import { applyLighting, emptyLightingState } from './lighting';
import { pauseElement } from './Screens';

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
/** seconds between throws */
const THROW_COOLDOWN = 0.45;
/** seconds between calls; a little longer than the call's own tune */
const CALL_COOLDOWN = 2.4;
/** subjects within this distance of the camera hear the call */
const CALL_RANGE = 90;

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
  /** smoothed world velocity of each active subject, so throws can lead moving targets */
  private motion = new Map<Subject, { last: THREE.Vector3; vel: THREE.Vector3 }>();
  private stepVel = new THREE.Vector3();
  private instM = new THREE.Matrix4();

  constructor(o: GameOptions) {
    this.o = o;
    this.light = emptyLightingState();
  }

  async start() {
    const { renderer, def, audio } = this.o;
    this.rig = new CameraRig(def.fov, renderer.aspect);
    const t0 = performance.now();
    this.world = def.build({ audio, camera: this.rig.camera, lowDetail: this.o.lowDetail });
    console.info(`[window seat] ${def.id} built in ${(performance.now() - t0).toFixed(0)} ms`);
    this.ride = new Ride(this.world.curve, this.world.speed, this.world.vehicle);
    (window as any).__dbg = { world: this.world, ride: this.ride, game: this, rig: this.rig };
    this.items = new Items(this.world, (pos, surface, spent) => this.onLand(pos, surface, spent), (s, pos) => this.onHit(s, pos));
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
    this.throwCd = THROW_COOLDOWN;
    this.items.throwFrom(this.rig.camera, this.throwTarget());
    this.o.audio.throwWhoosh();
    this.hud.fireTool('item');
  }
  private call() {
    if (this.paused || !this.running || this.callCd > 0) return;
    this.callCd = CALL_COOLDOWN;
    this.o.audio.call(this.o.def.callKind);
    this.hud.fireTool('call');
    const pos = this.rig.camera.getWorldPosition(this.tmp.clone());
    this.world.onCall(pos, this.ride.state);
    const before = this.poses();
    const reacted = this.world.subjects.filter((s) => s.tryCall(pos, CALL_RANGE));
    if (reacted.length) {
      setTimeout(() => this.o.audio.react(1.1), 350);
      this.announce(before, reacted);
    }
  }
  private onLand(pos: THREE.Vector3, surface: Surface, spent: boolean) {
    const water = surface === 'water';
    if (spent) {
      // an item that already hit someone just drops
      this.puffs.burst(pos, 4, water ? 0xcfe8ff : 0xe8dcc8, 1.2, 1.2, 0.6);
      return;
    }
    this.puffs.burst(pos, water ? 12 : 8, water ? 0xcfe8ff : 0xe8dcc8, water ? 3 : 2, water ? 3.5 : 2);
    this.o.audio.thump(water ? 'water' : 'ground');
    this.world.onItemLand(pos);
    const before = this.poses();
    const reacted = this.world.subjects.filter((s) => s.tryItem(pos));
    if (reacted.length) {
      setTimeout(() => this.o.audio.react(0.9), 200);
      this.announce(before, reacted);
    }
  }
  /** A thrown item struck a character in mid-air. */
  private onHit(s: Subject, pos: THREE.Vector3) {
    const before = this.poses();
    const reacted = s.hitByItem(pos);
    this.puffs.burst(pos, 6, 0xfff4dc, 2.4, 2.2, 0.7);
    this.o.audio.bonk();
    if (reacted) {
      setTimeout(() => this.o.audio.react(0.9), 120);
      this.announce(before, [s]);
    }
    return reacted;
  }

  /** Each subject's pose and pose timer, to spot which ones a reaction set off. */
  private poses() {
    return new Map(this.world.subjects.map((s) => [s, { pose: s.pose, timer: s.poseTimer }]));
  }
  /**
   * Say what just happened, naming the special moment so the player knows what to photograph.
   * When several subjects react, the one nearest the reticle is named.
   */
  private announce(before: Map<Subject, { pose: string; timer: number }>, reacted: Subject[]) {
    const moments = this.world.subjects.filter((s) => {
      const b = before.get(s);
      return s.pose !== 'idle' && (!b || s.pose !== b.pose || s.poseTimer > b.timer + 1e-6);
    });
    const cam = this.rig.camera;
    const rank = (s: Subject) => {
      this.ndc.copy(s.center(this.tmp)).project(cam);
      const onScreen = this.ndc.z < 1 && Math.abs(this.ndc.x) < 1 && Math.abs(this.ndc.y) < 1;
      return onScreen ? Math.hypot(this.ndc.x, this.ndc.y) : 10 - s.base / 1000;
    };
    const byRank = (list: Subject[]) => list.map((s) => ({ s, r: rank(s) })).sort((a, b) => a.r - b.r).map((x) => x.s);
    const named = byRank(moments.length ? moments : reacted);
    const top = named[0];
    const others = new Set([...moments, ...reacted]).size - 1;
    const text = top.pose !== 'idle' && top.poseLabel ? `${top.name} · ${top.poseLabel}` : `${top.name} noticed you`;
    this.hud.centerMessage(others > 0 ? `${text}, +${others} more` : text);
  }

  /** Where a throw goes: at the character under the reticle if one would react, else at the ground, water or wall it points at. */
  private throwTarget(): ThrowTarget | null {
    const cam = this.rig.camera;
    const s = this.scanReticle().throwable;
    if (s) {
      const point = s.crowd ? s.groundPoint(new THREE.Vector3()) : s.center(new THREE.Vector3());
      // lead a moving target: aim where it will be when the item gets there
      const m = this.motion.get(s);
      if (m) {
        let t = flightTime(cam.position.distanceTo(point));
        t = flightTime(cam.position.distanceTo(this.tmp.copy(point).addScaledVector(m.vel, t)));
        point.addScaledVector(m.vel, t);
      }
      return { point, kind: s.crowd ? 'floor' : 'body' };
    }
    return this.surfaceUnderReticle();
  }

  /** The first ground, water or large piece of scenery along the view, within throwing range. */
  private surfaceUnderReticle(): ThrowTarget | null {
    const cam = this.rig.camera;
    const w = this.world;
    const o = cam.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const floorAt = (p: THREE.Vector3) => Math.max(w.groundHeight(p.x, p.z), w.waterLevel);
    // march along the view over the height field and water, then narrow down the crossing
    const p = new THREE.Vector3();
    let ground: THREE.Vector3 | null = null;
    let prev = 0;
    for (let t = 1; t <= THROW_RANGE; t += 0.75) {
      p.copy(o).addScaledVector(dir, t);
      if (p.y <= floorAt(p)) {
        let a = prev, b = t;
        for (let k = 0; k < 8; k++) {
          const mid = (a + b) / 2;
          p.copy(o).addScaledVector(dir, mid);
          if (p.y <= floorAt(p)) b = mid; else a = mid;
        }
        ground = o.clone().addScaledVector(dir, b);
        ground.y = floorAt(ground);
        break;
      }
      prev = t;
    }
    // buildings and big scenery in the way
    this.ray.set(o, dir);
    this.ray.near = 0.5;
    this.ray.far = ground ? ground.distanceTo(o) + 0.5 : THROW_RANGE;
    const hit = w.occluders.length ? this.ray.intersectObjects(w.occluders, true)[0] : undefined;
    if (hit && hit.distance > 3) {
      const n = new THREE.Vector3(0, 1, 0);
      if (hit.face) {
        n.copy(hit.face.normal);
        const im = hit.object as THREE.InstancedMesh;
        if (im.isInstancedMesh && hit.instanceId !== undefined) { im.getMatrixAt(hit.instanceId, this.instM); n.transformDirection(this.instM); }
        n.transformDirection(hit.object.matrixWorld);
      }
      // mostly upward-facing: a roof, a deck, a hillside; otherwise the side of something
      return n.y > 0.6 ? { point: hit.point.clone(), kind: 'floor' } : { point: hit.point.clone(), kind: 'wall', normal: n };
    }
    if (ground) return ground.distanceTo(o) > 3 ? { point: ground, kind: 'floor' } : null;
    // looking down at ground further than we can throw: send it as far as we can along the view
    if (dir.y < -0.02) return { point: o.clone().addScaledVector(dir, THROW_RANGE), kind: 'body' };
    return null;
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
    const p = pauseElement({ title: this.o.def.title, hudHidden: this.hud.minimal, mouseMode: this.o.input.mode, muted: this.o.audio.muted });
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
    this.world.lighting(u, this.light);
    applyLighting(this.light, this.world, this.o.renderer, this.ride.state.position);
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
    this.trackMotion(dt);
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
    this.hud.setCooldowns(this.throwCd / THROW_COOLDOWN, this.callCd / CALL_COOLDOWN);
    this.captions(st.u);
    this.hud.showLockHint(inp.mode === 'lock' && !inp.pointerLocked && !inp.isTouch && this.time > 1.5 && !this.ride.finished);
    this.lastTag += dt;
    if (this.lastTag > 0.12) {
      this.lastTag = 0;
      const { tagged, throwable } = this.scanReticle();
      this.hud.tagSubject(tagged, tagged && tagged.pose !== 'idle' ? tagged.poseLabel : '');
      // light up the tools that would make the subject in the viewfinder do something
      const callable = !!tagged && tagged.reactsToCall && tagged.center(this.tmp).distanceTo(this.rig.camera.position) < CALL_RANGE;
      this.hud.setToolHints(!!throwable && throwable.itemReady, callable);
    }
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

  /**
   * What is in the viewfinder: `tagged` is the subject nearest the centre, whose name the HUD shows;
   * `throwable` is the one a thrown item would be aimed at, a subject that reacts to items and is within
   * throwing range. Big subjects count from the edge of their silhouette, so they are easy to aim at.
   */
  private scanReticle(): { tagged: Subject | null; throwable: Subject | null } {
    const cam = this.rig.camera;
    cam.updateMatrixWorld(); // the rig moved it this frame; project() needs the new view
    const halfTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    let tagged: Subject | null = null, tagD = 0.28;
    let throwable: Subject | null = null, throwD = 0.3;
    for (const s of this.world.subjects) {
      if (!s.active) continue;
      s.center(this.tmp);
      const dist = this.tmp.distanceTo(cam.position);
      this.ndc.copy(this.tmp).project(cam);
      if (this.ndc.z > 1 || this.ndc.z < -1) continue;
      const d = Math.hypot(this.ndc.x, this.ndc.y);
      if (dist <= s.maxDistance * 0.8 && d < tagD) { tagD = d; tagged = s; }
      if (s.reactsToItems && dist > 2 && dist <= THROW_RANGE) {
        // when the reticle is inside two silhouettes, the one whose centre is nearer wins
        const edge = Math.max(0, d - s.radius / (dist * halfTan)) + d * 0.2;
        if (edge < throwD) { throwD = edge; throwable = s; }
      }
    }
    const hidden = new Map<Subject, boolean>();
    const occluded = (s: Subject) => {
      if (!this.world.occluders.length) return false;
      let h = hidden.get(s);
      if (h === undefined) {
        const dir = s.center(this.tmp).sub(cam.position);
        const len = dir.length();
        this.ray.set(cam.position, dir.normalize());
        this.ray.near = 0.5; this.ray.far = Math.max(0.6, len - s.radius * 0.6);
        h = this.ray.intersectObjects(this.world.occluders, true).length > 0;
        hidden.set(s, h);
      }
      return h;
    };
    if (tagged && occluded(tagged)) tagged = null;
    if (throwable && occluded(throwable)) throwable = null;
    return { tagged, throwable };
  }

  /** Follow each active subject's centre from frame to frame to estimate how fast it is moving. */
  private trackMotion(dt: number) {
    if (dt <= 0) return;
    const k = 1 - Math.exp(-dt * 8);
    for (const s of this.world.subjects) {
      if (!s.active) { this.motion.delete(s); continue; }
      const c = s.center(this.tmp);
      const m = this.motion.get(s);
      if (!m) { this.motion.set(s, { last: c.clone(), vel: new THREE.Vector3() }); continue; }
      const step = this.stepVel.subVectors(c, m.last).divideScalar(dt);
      m.vel.lerp(step, k);
      m.last.copy(c);
    }
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
