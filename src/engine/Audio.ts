/**
 * Fully synthesised audio: no samples, no copyrighted music.
 * A slow generative pad + melody voice sets the mood; noise layers make wind, sea and rain;
 * short synthesised hits cover the camera, throws and calls.
 */
export type MelodyVoice = 'musicbox' | 'pluck' | 'accordion' | 'vibes' | 'piano';
export type VehicleSound = 'train' | 'moped' | 'none';

export interface AmbienceProfile {
  root: number;               // midi note
  scale: number[];            // semitone offsets used by the melody walk
  chords: number[][];         // chord voicings, semitone offsets from root
  padWave: OscillatorType;
  padLevel: number;
  melody: MelodyVoice;
  melodyInterval: number;     // seconds between melody ticks
  melodyDensity: number;      // 0..1 chance a tick plays
  melodyLevel: number;
  chordSeconds: number;
  vehicle: VehicleSound;
}

export interface EnvLevels { wind: number; sea: number; rain: number; birds: number; crickets: number; }

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private envBus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private env: Record<keyof EnvLevels, GainNode> | null = null;
  private envTarget: EnvLevels = { wind: 0, sea: 0, rain: 0, birds: 0, crickets: 0 };
  private profile: AmbienceProfile | null = null;
  private padOscs: { osc: OscillatorNode; gain: GainNode }[] = [];
  private padFilter!: BiquadFilterNode;
  private chordIndex = 0;
  private chordTimer = 0;
  private melodyTimer = 0;
  private lastMelodyIdx = 0;
  private birdTimer = 0;
  /** One cricket chirps at a time, in a steady rhythm for a few seconds, then everything rests. */
  private cricket = { on: false, bout: 0, next: 0, every: 0.7, hz: 4200, pan: 0 };
  private dripTimer = 0;
  private clackTimer = 0;
  private vehicleNode: { gain: GainNode; osc?: OscillatorNode; lfo?: OscillatorNode } | null = null;
  private vehicleSpeed = 1;
  private paused = false;
  muted = false;
  musicVolume = 0.8;
  sfxVolume = 0.9;
  started = false;

  /** Must be called from a user gesture. */
  start() {
    if (this.started) return;
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    this.started = true;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVolume; this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVolume; this.sfxBus.connect(this.master);
    this.envBus = ctx.createGain(); this.envBus.gain.value = 1; this.envBus.connect(this.master);
    // reverb: exponentially decaying stereo noise impulse
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (0.5 + 0.5 * Math.exp(-t * 4));
      }
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.master);
    // shared noise loop
    const nlen = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    this.buildEnvironment();
    if (ctx.state === 'suspended') ctx.resume();
  }

  resume() { this.ctx?.resume(); }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  setPaused(p: boolean) {
    this.paused = p;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(p ? this.musicVolume * 0.35 : this.musicVolume, this.ctx.currentTime, 0.2);
    this.envBus.gain.setTargetAtTime(p ? 0.3 : 1, this.ctx.currentTime, 0.2);
  }

  private noiseSource(loop = true) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noiseBuffer; s.loop = loop;
    return s;
  }

  private buildEnvironment() {
    const ctx = this.ctx!;
    const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.envBus); return g; };
    this.env = { wind: mk(), sea: mk(), rain: mk(), birds: mk(), crickets: mk() };
    // wind: low rumble, slow LFO breathing
    {
      const src = this.noiseSource();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
      const lfoG = ctx.createGain(); lfoG.gain.value = 220;
      lfo.connect(lfoG).connect(lp.frequency);
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(lp).connect(g).connect(this.env.wind);
      src.start(); lfo.start();
    }
    // sea: band-passed noise with slow swells
    {
      const src = this.noiseSource();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.5;
      const swell = ctx.createGain(); swell.gain.value = 0.35;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
      lfo.connect(lfoG).connect(swell.gain);
      src.connect(bp).connect(swell).connect(this.env.sea);
      src.start(); lfo.start();
    }
    // rain: hissy top end
    {
      const src = this.noiseSource();
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      const g = ctx.createGain(); g.gain.value = 0.28;
      src.connect(hp).connect(lp).connect(g).connect(this.env.rain);
      src.start();
    }
    // crickets are short chirps scheduled in update() (see playCricket); each chirp carries its own level
    this.env.crickets.gain.value = 1;
  }

  setEnvironment(levels: Partial<EnvLevels>) {
    Object.assign(this.envTarget, levels);
    if (!this.env || !this.ctx) return;
    const t = this.ctx.currentTime;
    for (const k of Object.keys(this.envTarget) as (keyof EnvLevels)[]) {
      const v = this.envTarget[k];
      if (k === 'birds' || k === 'crickets') continue; // handled by their schedulers in update()
      this.env[k].gain.setTargetAtTime(v, t, 0.8);
    }
  }

  setProfile(p: AmbienceProfile) {
    this.profile = p;
    if (!this.ctx) return;
    this.stopPad();
    this.stopVehicle();
    const ctx = this.ctx;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 700; this.padFilter.Q.value = 0.4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(this.padFilter.frequency); lfo.start();
    const padOut = ctx.createGain(); padOut.gain.value = p.padLevel;
    this.padFilter.connect(padOut).connect(this.musicBus);
    padOut.connect(this.reverbSend);
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator(); osc.type = p.padWave;
      const g = ctx.createGain(); g.gain.value = 0;
      osc.connect(g).connect(this.padFilter);
      osc.start();
      this.padOscs.push({ osc, gain: g });
    }
    this.chordIndex = 0; this.chordTimer = 0;
    this.applyChord(0, 2.5);
    this.melodyTimer = 1.5;
    this.startVehicle(p.vehicle);
  }

  private stopPad() {
    for (const v of this.padOscs) { try { v.osc.stop(); } catch { /* */ } v.osc.disconnect(); v.gain.disconnect(); }
    this.padOscs = [];
    this.padFilter?.disconnect();
  }

  private applyChord(idx: number, fade = 4) {
    if (!this.ctx || !this.profile) return;
    const chord = this.profile.chords[idx % this.profile.chords.length];
    const t = this.ctx.currentTime;
    this.padOscs.forEach((v, i) => {
      const off = chord[i % chord.length] + (i >= chord.length ? 12 : 0);
      const hz = midiHz(this.profile!.root + off - 12);
      v.osc.frequency.setTargetAtTime(hz, t, fade * 0.25);
      v.osc.detune.setValueAtTime((i - 1.5) * 5, t);
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setTargetAtTime(0.16, t, fade * 0.4);
    });
  }

  private startVehicle(kind: VehicleSound) {
    if (!this.ctx || kind === 'none') return;
    const ctx = this.ctx;
    const gain = ctx.createGain(); gain.gain.value = 0;
    gain.connect(this.envBus);
    if (kind === 'moped') {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 62;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 11;
      const lfoG = ctx.createGain(); lfoG.gain.value = 6;
      lfo.connect(lfoG).connect(osc.frequency);
      osc.connect(lp).connect(gain);
      osc.start(); lfo.start();
      gain.gain.setTargetAtTime(0.05, ctx.currentTime, 1);
      this.vehicleNode = { gain, osc, lfo };
    } else {
      // train: low rumble + clacks scheduled in update()
      const src = this.noiseSource();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
      src.connect(lp).connect(gain);
      src.start();
      gain.gain.setTargetAtTime(0.35, ctx.currentTime, 1.5);
      this.vehicleNode = { gain };
    }
  }
  private stopVehicle() {
    if (!this.vehicleNode) return;
    this.vehicleNode.gain.disconnect();
    try { this.vehicleNode.osc?.stop(); this.vehicleNode.lfo?.stop(); } catch { /* */ }
    this.vehicleNode = null;
  }
  setVehicleSpeed(s: number) {
    this.vehicleSpeed = s;
    if (this.vehicleNode?.osc && this.ctx) this.vehicleNode.osc.frequency.setTargetAtTime(52 + 26 * s, this.ctx.currentTime, 0.3);
  }

  /** Call every frame. */
  update(dt: number) {
    if (!this.ctx || !this.profile || this.paused) return;
    const p = this.profile;
    this.chordTimer += dt;
    if (this.chordTimer > p.chordSeconds) {
      this.chordTimer = 0;
      this.chordIndex++;
      this.applyChord(this.chordIndex);
    }
    this.melodyTimer -= dt;
    if (this.melodyTimer <= 0) {
      this.melodyTimer = p.melodyInterval * (0.7 + Math.random() * 0.6);
      if (Math.random() < p.melodyDensity) this.playMelodyStep();
    }
    // birds
    if (this.envTarget.birds > 0.02) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 1.5 + Math.random() * 6 / this.envTarget.birds;
        this.playBird(this.envTarget.birds);
      }
    }
    // crickets: a few seconds of chirping from one cricket, then a rest, then another cricket somewhere else.
    // The rests matter: without them a high chirp at a steady rhythm soon grates.
    if (this.envTarget.crickets > 0.02) {
      const c = this.cricket;
      c.bout -= dt;
      if (c.bout <= 0) {
        c.on = !c.on;
        c.bout = c.on ? 3 + Math.random() * 4 : 3 + Math.random() * 6;
        if (c.on) { c.hz = 3900 + Math.random() * 700; c.pan = Math.random() * 1.4 - 0.7; c.every = 0.55 + Math.random() * 0.4; c.next = 0; }
      }
      if (c.on) {
        c.next -= dt;
        if (c.next <= 0) { c.next = c.every * (0.95 + Math.random() * 0.1); this.playCricket(this.envTarget.crickets); }
      }
    }
    // rain drips
    if (this.envTarget.rain > 0.05) {
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) { this.dripTimer = 0.08 + Math.random() * 0.4; this.playDrip(this.envTarget.rain); }
    }
    // train clacks
    if (p.vehicle === 'train' && this.vehicleNode) {
      this.clackTimer -= dt * this.vehicleSpeed;
      if (this.clackTimer <= 0) { this.clackTimer = 0.62; this.playClack(); }
    }
  }

  private playMelodyStep() {
    const p = this.profile!;
    const scale = p.scale;
    // random walk on the scale, occasionally a small phrase
    const step = Math.round((Math.random() - 0.5) * 4);
    this.lastMelodyIdx = Math.max(0, Math.min(scale.length * 2 - 1, this.lastMelodyIdx + step));
    const notes = Math.random() < 0.3 ? 3 : Math.random() < 0.5 ? 2 : 1;
    const gap = p.melody === 'piano' ? 0.19 : p.melody === 'pluck' ? 0.24 : 0.36;
    for (let i = 0; i < notes; i++) {
      const idx = Math.max(0, Math.min(scale.length * 2 - 1, this.lastMelodyIdx + (i === 0 ? 0 : (Math.random() < 0.5 ? 1 : -1) * (i))));
      const octave = Math.floor(idx / scale.length);
      const midi = p.root + 12 + octave * 12 + scale[idx % scale.length];
      this.playVoice(p.melody, midi, this.ctx!.currentTime + i * gap, p.melodyLevel);
    }
  }

  private playVoice(voice: MelodyVoice, midi: number, at: number, level: number) {
    const ctx = this.ctx!;
    const hz = midiHz(midi);
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(this.musicBus); out.connect(this.reverbSend);
    const env = out.gain;
    const stopAt = (t: number, nodes: OscillatorNode[]) => nodes.forEach((n) => n.stop(t));
    if (voice === 'musicbox') {
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = hz;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 3.01;
      const g2 = ctx.createGain(); g2.gain.value = 0.18;
      o1.connect(out); o2.connect(g2).connect(out);
      env.setValueAtTime(0, at); env.linearRampToValueAtTime(level, at + 0.008); env.exponentialRampToValueAtTime(0.0001, at + 2.6);
      o1.start(at); o2.start(at); stopAt(at + 2.7, [o1, o2]);
    } else if (voice === 'pluck') {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(hz * 6, at); lp.frequency.exponentialRampToValueAtTime(hz * 1.2, at + 0.5);
      o.connect(lp).connect(out);
      env.setValueAtTime(0, at); env.linearRampToValueAtTime(level, at + 0.005); env.exponentialRampToValueAtTime(0.0001, at + 0.9);
      o.start(at); o.stop(at + 1);
    } else if (voice === 'piano') {
      const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = hz;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 2;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(hz * 8, at); lp.frequency.exponentialRampToValueAtTime(hz * 2, at + 1.2);
      o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(out);
      env.setValueAtTime(0, at); env.linearRampToValueAtTime(level, at + 0.006); env.exponentialRampToValueAtTime(0.0001, at + 1.8);
      o1.start(at); o2.start(at); stopAt(at + 1.9, [o1, o2]);
    } else if (voice === 'accordion') {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = hz; o1.detune.value = -6;
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = hz; o2.detune.value = 6;
      const o3 = ctx.createOscillator(); o3.type = 'square'; o3.frequency.value = hz / 2;
      const g3 = ctx.createGain(); g3.gain.value = 0.15;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(hz * 4, 3200); lp.Q.value = 1.2;
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 4;
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune);
      o1.connect(lp); o2.connect(lp); o3.connect(g3).connect(lp); lp.connect(out);
      env.setValueAtTime(0, at); env.linearRampToValueAtTime(level * 0.5, at + 0.06); env.setValueAtTime(level * 0.5, at + 0.5); env.linearRampToValueAtTime(0, at + 0.75);
      o1.start(at); o2.start(at); o3.start(at); vib.start(at); stopAt(at + 0.8, [o1, o2, o3, vib]);
    } else {
      // vibes: sine with tremolo
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz;
      const trem = ctx.createGain(); trem.gain.value = 0.7;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 0.3;
      lfo.connect(lg).connect(trem.gain);
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = hz * 4; const g2 = ctx.createGain(); g2.gain.value = 0.08;
      o.connect(trem).connect(out); o2.connect(g2).connect(out);
      env.setValueAtTime(0, at); env.linearRampToValueAtTime(level, at + 0.01); env.exponentialRampToValueAtTime(0.0001, at + 2.2);
      o.start(at); o2.start(at); lfo.start(at); stopAt(at + 2.3, [o, o2, lfo]);
    }
  }

  private playBird(level: number) {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.env!.birds); pan.connect(this.reverbSend);
    this.env!.birds.gain.value = Math.min(1, level) * 0.5;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.08);
      const o = ctx.createOscillator(); o.type = 'sine';
      const f = base * (0.9 + Math.random() * 0.3);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.5), t + 0.05); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.09);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(pan); o.start(t); o.stop(t + 0.12);
    }
  }
  /** One chirp: three or four 20 ms pulses of a high sine, with soft edges so they don't click. */
  private playCricket(level: number) {
    const ctx = this.ctx!;
    const c = this.cricket;
    const t0 = ctx.currentTime + 0.01;
    const pulses = Math.random() < 0.4 ? 4 : 3;
    const gap = 0.034;
    const peak = 0.035 * Math.min(1, level);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = c.hz * (0.99 + Math.random() * 0.02);
    const g = ctx.createGain(); g.gain.value = 0;
    for (let i = 0; i < pulses; i++) {
      const t = t0 + i * gap;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    }
    const pan = ctx.createStereoPanner(); pan.pan.value = c.pan;
    o.connect(g).connect(pan); pan.connect(this.env!.crickets); pan.connect(this.reverbSend);
    o.start(t0); o.stop(t0 + pulses * gap + 0.02);
  }
  private playDrip(level: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    const f = 900 + Math.random() * 2500;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.06);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * level, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    o.connect(g).connect(pan).connect(this.env!.rain); o.start(t); o.stop(t + 0.1);
  }
  private playClack() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const v = this.vehicleNode!.gain.gain.value;
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.085;
      const s = this.noiseSource(false);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + i * 250;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * v, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
      s.connect(lp).connect(g).connect(this.envBus); s.start(at); s.stop(at + 0.08);
    }
  }

  // ---------- SFX ----------
  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const click = (at: number, f: number, len: number, vol: number) => {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g).connect(this.sfxBus); o.start(at); o.stop(at + len + 0.01);
    };
    const burst = (at: number, len: number, vol: number, hp: number) => {
      const s = this.noiseSource(false);
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const g = ctx.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      s.connect(f).connect(g).connect(this.sfxBus); s.start(at); s.stop(at + len + 0.01);
    };
    click(t, 1800, 0.02, 0.25); burst(t, 0.045, 0.35, 1800);
    click(t + 0.07, 1200, 0.03, 0.2); burst(t + 0.07, 0.06, 0.3, 900);
  }
  throwWhoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this.noiseSource(false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(bp).connect(g).connect(this.sfxBus); s.start(t); s.stop(t + 0.4);
  }
  thump(kind: 'ground' | 'water' = 'ground') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = this.noiseSource(false);
    const f = ctx.createBiquadFilter();
    if (kind === 'water') { f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7; }
    else { f.type = 'lowpass'; f.frequency.value = 320; }
    const g = ctx.createGain(); g.gain.setValueAtTime(kind === 'water' ? 0.35 : 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'water' ? 0.3 : 0.14));
    s.connect(f).connect(g).connect(this.sfxBus); g.connect(this.reverbSend); s.start(t); s.stop(t + 0.35);
    if (kind === 'ground') {
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(og).connect(this.sfxBus); o.start(t); o.stop(t + 0.16);
    }
  }
  /** A light wooden knock when a thrown item strikes a character. */
  bonk() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(760, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.09);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.sfxBus); g.connect(this.reverbSend); o.start(t); o.stop(t + 0.14);
    const s = this.noiseSource(false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.5;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    s.connect(bp).connect(ng).connect(this.sfxBus); s.start(t); s.stop(t + 0.05);
  }
  /** The "call" instrument for a world. */
  call(kind: 'ocarina' | 'whistle' | 'accordion') {
    if (!this.ctx || !this.profile) return;
    const ctx = this.ctx, t = ctx.currentTime, root = this.profile.root + 24;
    if (kind === 'ocarina') {
      const motif = [0, 4, 7, 12, 7];
      motif.forEach((n, i) => {
        const at = t + i * 0.22;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midiHz(root + n);
        const vib = ctx.createOscillator(); vib.frequency.value = 6; const vg = ctx.createGain(); vg.gain.value = 5; vib.connect(vg).connect(o.detune);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.22, at + 0.04); g.gain.setValueAtTime(0.22, at + 0.2); g.gain.linearRampToValueAtTime(0, at + (i === motif.length - 1 ? 0.7 : 0.26));
        o.connect(g).connect(this.sfxBus); g.connect(this.reverbSend);
        o.start(at); vib.start(at); o.stop(at + 0.8); vib.stop(at + 0.8);
      });
    } else if (kind === 'whistle') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(2300, t + 0.12); o.frequency.setValueAtTime(2300, t + 0.25); o.frequency.exponentialRampToValueAtTime(1700, t + 0.5);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02); g.gain.setValueAtTime(0.2, t + 0.45); g.gain.linearRampToValueAtTime(0, t + 0.55);
      const s = this.noiseSource(false); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 6;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.08, t); ng.gain.linearRampToValueAtTime(0, t + 0.55);
      s.connect(bp).connect(ng).connect(this.sfxBus); s.start(t); s.stop(t + 0.6);
      o.connect(g).connect(this.sfxBus); g.connect(this.reverbSend); o.start(t); o.stop(t + 0.6);
    } else {
      [0, 4, 7].forEach((n) => this.playVoice('accordion', root - 12 + n, t, 0.16));
      [0, 4, 7].forEach((n) => this.playVoice('accordion', root - 12 + n + 5, t + 0.42, 0.16));
    }
  }
  /** Ascending chime for the photo score. */
  chime(stars: number) {
    if (!this.ctx || !this.profile) return;
    const t = this.ctx.currentTime;
    const notes = [0, 4, 7, 12, 16];
    for (let i = 0; i < Math.max(1, stars); i++) this.playVoice('musicbox', this.profile.root + 24 + notes[i], t + 0.12 + i * 0.09, 0.14);
  }
  uiClick() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.1);
  }
  /** Small squeak/pop when a subject reacts. */
  react(pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(500 * pitch, t); o.frequency.exponentialRampToValueAtTime(900 * pitch, t + 0.08); o.frequency.exponentialRampToValueAtTime(600 * pitch, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.sfxBus); g.connect(this.reverbSend); o.start(t); o.stop(t + 0.25);
  }
}
