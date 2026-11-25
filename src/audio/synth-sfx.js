/**
 * 《INVESTITURE: Relic Forge》V1.0 MVP 东方古风 Web Audio 实时合成引擎
 * - 零外部音频文件，包体极轻、弱网秒开
 * - 古筝五声音阶拨弦 / 商周青铜编钟 / 琵琶急奏 / 唐代战鼓
 * - 契合同步回合制：安静思考、落子出招声效利落干脆，含完整 iOS Safari try/catch 容错
 */

const PENTATONIC = [
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66
];

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.adMuted = false;
  }

  ensureContext() {
    try {
      if (typeof window === 'undefined') return null;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    } catch (_) {
      return null;
    }
  }

  setEnabled(flag) {
    this.enabled = !!flag;
  }

  setAdMuted(flag) {
    this.adMuted = !!flag;
    try {
      if (this.ctx) {
        if (this.adMuted && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
        else if (!this.adMuted && this.enabled && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      }
    } catch (_) {}
  }

  canPlay() {
    return this.enabled && !this.adMuted;
  }

  /** 古筝五声音阶拨弦 */
  playGuzheng(step = 5, durationSec = 0.25, gainPeak = 0.12) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const freq = PENTATONIC[Math.max(0, Math.min(PENTATONIC.length - 1, Math.floor(step)))];
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const harm = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const harmGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      harm.type = 'sine';
      harm.frequency.setValueAtTime(freq * 2, now);
      harmGain.gain.setValueAtTime(0.24, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(4200, freq * 5.2), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(360, freq * 1.3), now + durationSec);
      filter.Q.setValueAtTime(2.2, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.007);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(filter);
      harm.connect(harmGain);
      harmGain.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      harm.start(now);
      osc.stop(now + durationSec + 0.03);
      harm.stop(now + durationSec + 0.03);
    } catch (_) {}
  }

  /** 商周青铜编钟清响 */
  playBianzhong(baseFreq = 440.0, durationSec = 0.62, gainPeak = 0.12) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const p of [
        { r: 1.0, a: 1.0, d: durationSec },
        { r: 2.756, a: 0.34, d: durationSec * 0.6 },
        { r: 5.404, a: 0.14, d: durationSec * 0.35 }
      ]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * p.r, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gainPeak * p.a, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.d);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + p.d + 0.03);
      }
    } catch (_) {}
  }

  /** 琵琶急奏轮指 */
  playPipaBurst(steps = [5, 7, 8, 10]) {
    if (!this.canPlay()) return;
    steps.forEach((st, idx) => setTimeout(() => this.playGuzheng(st, 0.12, 0.11), idx * 32));
  }

  /** 唐代低频战鼓 */
  playTangDrum(accent = 1.0) {
    if (!this.canPlay() || accent <= 0) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(118 + accent * 20, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.17);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.16 * accent, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (_) {}
  }

  playClick() { this.playGuzheng(5, 0.12, 0.09); }
  playPickup() { this.playGuzheng(7, 0.1, 0.08); }
  playPlace() { this.playTangDrum(0.5); this.playGuzheng(4, 0.16, 0.1); }
  playInvalid() { this.playGuzheng(1, 0.12, 0.08); }
  playMarch() { this.playTangDrum(0.32); }

  playCast(element) {
    if (element === 'fire') {
      this.playTangDrum(0.95);
      this.playPipaBurst([5, 6, 8, 10]);
    } else if (element === 'thunder') {
      this.playPipaBurst([7, 9, 10, 11]);
      this.playBianzhong(659.25, 0.36, 0.09);
    } else {
      this.playBianzhong(523.25, 0.52, 0.11);
      setTimeout(() => this.playGuzheng(8, 0.26, 0.1), 65);
    }
  }

  playResonance() {
    this.playTangDrum(1.25);
    this.playBianzhong(523.25, 0.65, 0.12);
    setTimeout(() => this.playBianzhong(659.25, 0.65, 0.11), 85);
    setTimeout(() => this.playBianzhong(783.99, 0.78, 0.12), 170);
  }

  playBoss() {
    this.playTangDrum(1.3);
    setTimeout(() => this.playTangDrum(1.15), 140);
    this.playPipaBurst([9, 7, 5, 3]);
  }

  playGateHit() {
    this.playTangDrum(1.2);
    this.playGuzheng(0, 0.22, 0.11);
  }

  playVictory() {
    [5, 6, 7, 8, 10].forEach((st, i) => setTimeout(() => this.playGuzheng(st, 0.34, 0.12), i * 80));
    setTimeout(() => this.playBianzhong(523.25, 0.9, 0.13), 260);
  }
}

export const synthAudio = new SynthAudio();
