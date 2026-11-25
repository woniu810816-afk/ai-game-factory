/**
 * 《INVESTITURE: Relic Forge / 封神锻炉》Web Audio API 东方古典民乐实时合成引擎
 * 零外部音频文件（包体 0 负担，弱网秒开）：
 * - 古筝五声音阶拨弦（宫商角徵羽，随消除连击逐级升调）
 * - 商周青铜编钟清响（金属钟体非谐泛音 1.0x / 2.756x / 5.404x）
 * - 琵琶急奏扫弦（极短促连弹，用于神通齐发与天劫预警）
 * - 唐代低频战鼓（沉厚鼓点与节奏律动，暂停/静音/广告时即时停播）
 * 全面保留 iOS Safari 音频受限 try/catch 容错，绝不阻塞触控交互。
 */

const PENTATONIC = [
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66
];

// 唐代战鼓 8 拍律动
const TANG_DRUM_PATTERN = [1.0, 0, 0.45, 0, 0.85, 0.35, 0.65, 0];
const BOSS_DRUM_PATTERN = [1.0, 0.42, 0.72, 0.35, 1.0, 0.5, 0.8, 0.45];

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.adMuted = false;
    this.drumTimer = null;
    this.drumStep = 0;
    this.drumRunning = false;
    this.drumBossMode = false;
  }

  ensureContext() {
    try {
      if (typeof window === 'undefined') return null;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch (_) {
      return null;
    }
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (!this.enabled) {
      this._clearDrumTimer();
    } else if (this.drumRunning && !this.adMuted) {
      this._scheduleNextDrum();
    }
  }

  setAdMuted(flag) {
    this.adMuted = !!flag;
    try {
      if (this.adMuted) {
        this._clearDrumTimer();
      } else if (this.drumRunning && this.enabled) {
        this._scheduleNextDrum();
      }
      if (this.ctx) {
        if (this.adMuted && this.ctx.state === 'running') {
          this.ctx.suspend().catch(() => {});
        } else if (!this.adMuted && this.enabled && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      }
    } catch (_) {}
  }

  canPlay() {
    return this.enabled && !this.adMuted;
  }

  /**
   * 1. 古筝五声音阶拨弦（三角波 + 2x 泛音 + 扫频低通滤波）
   */
  playGuzheng(step = 5, durationSec = 0.28, gainPeak = 0.12) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const idx = Math.max(0, Math.min(PENTATONIC.length - 1, Math.floor(step)));
      const freq = PENTATONIC[idx];
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
      harmGain.gain.setValueAtTime(0.26, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(4400, freq * 5.5), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(360, freq * 1.3), now + durationSec);
      filter.Q.setValueAtTime(2.4, now);

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

  /**
   * 2. 商周青铜编钟清响（基频 + 2.756x + 5.404x 金属非谐泛音）
   */
  playBianzhong(baseFreq = 392.0, durationSec = 0.65, gainPeak = 0.13) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const partials = [
        { ratio: 1.0, amp: 1.0, dur: durationSec },
        { ratio: 2.756, amp: 0.36, dur: durationSec * 0.62 },
        { ratio: 5.404, amp: 0.14, dur: durationSec * 0.35 }
      ];
      for (const p of partials) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * p.ratio, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(gainPeak * p.amp, now + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + p.dur + 0.03);
      }
    } catch (_) {}
  }

  /**
   * 3. 琵琶急奏轮指（极短促高频连弹）
   */
  playPipaBurst(steps = [5, 7, 8, 10]) {
    if (!this.canPlay()) return;
    steps.forEach((st, idx) => {
      setTimeout(() => this.playGuzheng(st, 0.12, 0.11), idx * 34);
    });
  }

  /**
   * 4. 唐代低频战鼓单次击打
   */
  playTangDrum(accent = 1.0) {
    if (!this.canPlay() || accent <= 0) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(118 + accent * 22, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.16 * accent, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.27);
    } catch (_) {}
  }

  playTone(freqStart, freqEnd, durationSec, type = 'sine', gainPeak = 0.12) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(32, freqEnd), now + durationSec);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.02);
    } catch (_) {}
  }

  startWarDrums(bossMode = false) {
    this.drumRunning = true;
    this.drumBossMode = Boolean(bossMode);
    this.drumStep = 0;
    this._clearDrumTimer();
    if (this.canPlay()) this._scheduleNextDrum();
  }

  setBossDrumMode(bossMode) {
    this.drumBossMode = Boolean(bossMode);
  }

  stopWarDrums() {
    this.drumRunning = false;
    this.drumBossMode = false;
    this._clearDrumTimer();
  }

  _clearDrumTimer() {
    if (this.drumTimer !== null) {
      clearTimeout(this.drumTimer);
      this.drumTimer = null;
    }
  }

  _scheduleNextDrum() {
    this._clearDrumTimer();
    if (!this.drumRunning || !this.canPlay()) return;
    const pat = this.drumBossMode ? BOSS_DRUM_PATTERN : TANG_DRUM_PATTERN;
    const w = pat[this.drumStep % pat.length];
    if (w > 0) this.playTangDrum(w * (this.drumBossMode ? 1.0 : 0.72));
    this.drumStep = (this.drumStep + 1) % pat.length;
    const bpm = this.drumBossMode ? 132 : 96;
    const stepMs = Math.round((60 / bpm / 2) * 1000);
    this.drumTimer = setTimeout(() => this._scheduleNextDrum(), stepMs);
  }

  // =========================================================================
  // 语义化音效快捷方法
  // =========================================================================

  playClick() {
    this.playGuzheng(5, 0.13, 0.09);
  }

  playPickup() {
    this.playGuzheng(7, 0.11, 0.08);
  }

  playPlace() {
    this.playTangDrum(0.55);
    this.playGuzheng(4, 0.16, 0.1);
  }

  playInvalid() {
    this.playTone(170, 110, 0.12, 'triangle', 0.1);
  }

  playElementCast(element, comboStep = 1) {
    if (element === 'fire') {
      this.playPipaBurst([5, 6, 8, 10]);
    } else if (element === 'metal') {
      this.playPipaBurst([7, 9, 10, 11]);
      this.playBianzhong(659.25, 0.35, 0.09);
    } else if (element === 'earth') {
      this.playTangDrum(1.35);
      this.playTone(145, 42, 0.3, 'sawtooth', 0.12);
    } else if (element === 'water') {
      this.playGuzheng(Math.min(11, 5 + comboStep), 0.32, 0.12);
      setTimeout(() => this.playGuzheng(8, 0.32, 0.1), 70);
    } else {
      this.playBianzhong(523.25, 0.55, 0.12);
    }
  }

  /** 天道共鸣（单次消除 >= 2 行/列）：编钟连鸣 + 唐代重战鼓 */
  playResonance() {
    this.playTangDrum(1.3);
    this.playBianzhong(523.25, 0.72, 0.13);
    setTimeout(() => this.playBianzhong(659.25, 0.7, 0.12), 95);
    setTimeout(() => this.playBianzhong(783.99, 0.85, 0.13), 190);
    setTimeout(() => this.playTangDrum(1.15), 210);
  }

  /** 天劫异变降临：急促琵琶 + 低沉雷鸣 */
  playTribulation() {
    this.playTangDrum(1.25);
    this.playPipaBurst([9, 8, 6, 5, 3]);
  }

  /** 元始敕令弹出 / 选择 / 战将解锁 */
  playDecree() {
    this.playBianzhong(440.0, 0.55, 0.11);
    setTimeout(() => this.playBianzhong(659.25, 0.65, 0.12), 110);
  }

  playGateHit() {
    this.playTangDrum(1.1);
    this.playTone(190, 62, 0.22, 'sawtooth', 0.13);
  }

  playRevive() {
    this.playResonance();
  }

  playBonus() {
    this.playDecree();
  }
}

export const synthAudio = new SynthAudio();
