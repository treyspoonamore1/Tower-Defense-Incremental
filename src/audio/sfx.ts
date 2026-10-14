import type { TowerType } from '../core/defs';

// All sounds are synthesized with WebAudio, so the game ships no audio files.
// Frequent sounds (shots, kills) are rate-limited so big waves don't turn into noise.

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  enabled = true;
  volume = 0.6;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  private ready(key: string, minGap: number): boolean {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: Wave, gain: number, endFreq = freq, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, gain: number, filterFreq: number, endFilter = filterFreq, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFilter), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  fire(type: TowerType): void {
    if (!this.ready(`fire:${type}`, type === 'pulse' ? 0.07 : 0.1)) return;
    const jitter = 1 + (Math.random() - 0.5) * 0.08;
    switch (type) {
      case 'pulse': this.tone(1400 * jitter, 0.05, 'triangle', 0.025, 900); break;
      case 'arc': this.burst(0.09, 0.05, 6000, 1500); this.tone(2200 * jitter, 0.06, 'sawtooth', 0.012, 600); break;
      case 'frost': this.tone(2600 * jitter, 0.12, 'sine', 0.018, 3200); break;
      case 'mortar': this.tone(180 * jitter, 0.14, 'sine', 0.07, 70); break;
    }
  }

  kill(boss: boolean): void {
    if (boss) {
      if (!this.ready('bosskill', 0.3)) return;
      this.burst(0.9, 0.5, 2400, 60);
      this.tone(160, 0.9, 'sine', 0.35, 35);
      this.tone(660, 0.5, 'triangle', 0.08, 1320, 0.05);
      return;
    }
    if (!this.ready('kill', 0.045)) return;
    const pitch = 0.85 + Math.random() * 0.3;
    this.burst(0.12, 0.09, 3200 * pitch, 400);
    this.tone(520 * pitch, 0.08, 'square', 0.02, 180);
  }

  /** A two-note chime that climbs with tier. */
  merge(tier: number): void {
    if (!this.ready('merge', 0.03)) return;
    const base = 330 * Math.pow(2, (tier - 2) / 6);
    this.tone(base, 0.18, 'sine', 0.14);
    this.tone(base * 1.5, 0.28, 'sine', 0.12, base * 1.5, 0.07);
    if (tier >= 5) this.tone(base * 2, 0.45, 'triangle', 0.08, base * 2, 0.14);
  }

  build(): void {
    if (!this.ready('build', 0.04)) return;
    this.tone(520, 0.07, 'triangle', 0.06, 780);
  }

  pickup(): void {
    if (!this.ready('pickup', 0.06)) return;
    this.tone(1800 + Math.random() * 400, 0.04, 'sine', 0.018, 2400);
  }

  bossWarning(): void {
    if (!this.ready('alarm', 1)) return;
    for (let i = 0; i < 3; i++) {
      this.tone(440, 0.16, 'square', 0.045, 440, i * 0.32);
      this.tone(330, 0.16, 'square', 0.045, 330, i * 0.32 + 0.16);
    }
  }

  rush(): void {
    if (!this.ready('rush', 1)) return;
    this.tone(300, 0.35, 'sawtooth', 0.05, 900);
  }

  breach(): void {
    if (!this.ready('breach', 0.5)) return;
    this.burst(0.8, 0.45, 900, 50);
    this.tone(90, 0.8, 'sine', 0.4, 30);
  }

  overdrive(): void {
    if (!this.ready('overdrive', 0.3)) return;
    this.tone(200, 0.6, 'sawtooth', 0.06, 1200);
    this.tone(400, 0.6, 'sine', 0.08, 2400);
  }

  achievement(): void {
    if (!this.ready('ach', 0.3)) return;
    [660, 880, 1320].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.09, f, i * 0.09));
  }

  /** The core implodes: a falling sweep, then a deep boom. */
  collapse(): void {
    if (!this.ready('collapse', 1)) return;
    this.tone(1600, 1.0, 'sine', 0.12, 60);
    this.tone(800, 1.0, 'triangle', 0.08, 40);
    this.burst(1.6, 0.6, 3000, 40, 0.95);
    this.tone(70, 1.6, 'sine', 0.5, 25, 0.95);
  }

  click(): void {
    if (!this.ready('click', 0.03)) return;
    this.tone(900, 0.03, 'triangle', 0.03, 700);
  }
}
