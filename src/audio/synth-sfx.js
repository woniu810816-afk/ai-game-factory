/**
 * 《Celestial Rush》零外部音频依赖的东方古风 Web Audio 实时合成引擎
 * - 五声音阶（宫商角徵羽）古风拨弦音效（随连击数逐级升调）
 * - 低频战鼓节奏循环（随速度与狂热模式动态提速，静音/暂停/广告时即时停播）
 * - 全面保留 iOS Safari 音频限制 try/catch 容错，任何音频异常绝不阻塞触控与场景跳转
 */

// 传统五声音阶频率表（C4 ~ D6：宫 商 角 徵 羽）
const PENTATONIC_SCALE = [
  261.63, 293.66, 329.63, 392.0, 440.0,
  523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66
];

// 8 拍东方战鼓律动权重（1=重鼓，0.5=次鼓，0=休止）
const DRUM_PATTERN = [1.0, 0, 0.52, 0, 0.88, 0.42, 0.68, 0];
const FEVER_DRUM_PATTERN = [1.0, 0.45, 0.75, 0.4, 1.0, 0.55, 0.82, 0.5];

export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.adMuted = false;
    this.drumTimer = null;
    this.drumStep = 0;
    this.drumRunning = false;
    this.drumIntensity = 0; // 0 ~ 1
    this.drumFever = false;
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
   * 合成古风拨弦音（古筝/琵琶质感：三角波基音 + 2倍频泛音 + 低通衰减滤波）
   */
  playPluck(freq, durationSec = 0.28, gainPeak = 0.13) {
    if (!this.canPlay()) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const oscMain = ctx.createOscillator();
      const oscHarm = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const harmGain = ctx.createGain();

      oscMain.type = 'triangle';
      oscMain.frequency.setValueAtTime(freq, now);

      oscHarm.type = 'sine';
      oscHarm.frequency.setValueAtTime(freq * 2, now);
      harmGain.gain.setValueAtTime(0.28, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(4200, freq * 5.2), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(380, freq * 1.4), now + durationSec);
      filter.Q.setValueAtTime(2.2, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      oscMain.connect(filter);
      oscHarm.connect(harmGain);
      harmGain.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      oscMain.start(now);
      oscHarm.start(now);
      oscMain.stop(now + durationSec + 0.03);
      oscHarm.stop(now + durationSec + 0.03);
    } catch (_) {
      // iOS 音频受限时静默降级
    }
  }

  /**
   * 通用音调合成（供钟鸣、重击、符箓特效使用）
   */
  playTone(freqStart, freqEnd, durationSec, type = 'sine', gainPeak = 0.14) {
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

  /**
   * 合成低频古风战鼓单次击打
   */
  playWarDrum(accent = 1.0) {
    if (!this.canPlay() || accent <= 0) return;
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const startFreq = 108 + accent * 22;
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.16);

      const peak = 0.14 * accent;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.009);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.24);
    } catch (_) {}
  }

  /**
   * 启动/停止战鼓节奏循环（局内动态节奏）
   */
  startWarDrums() {
    this.drumRunning = true;
    this.drumStep = 0;
    this._clearDrumTimer();
    if (this.canPlay()) {
      this._scheduleNextDrum();
    }
  }

  stopWarDrums() {
    this.drumRunning = false;
    this.drumFever = false;
    this._clearDrumTimer();
  }

  setDrumIntensity(intensity = 0, isFever = false) {
    this.drumIntensity = Math.max(0, Math.min(1, Number(intensity) || 0));
    this.drumFever = Boolean(isFever);
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

    const pattern = this.drumFever ? FEVER_DRUM_PATTERN : DRUM_PATTERN;
    const weight = pattern[this.drumStep % pattern.length];
    if (weight > 0) {
      this.playWarDrum(weight * (this.drumFever ? 1.15 : 0.85));
    }
    this.drumStep = (this.drumStep + 1) % pattern.length;

    // 根据局内强度与狂热状态动态计算八分音符间隔（约 105 BPM -> 148 BPM）
    const bpm = this.drumFever ? 148 : 104 + this.drumIntensity * 28;
    const stepMs = Math.round((60 / bpm / 2) * 1000);
    this.drumTimer = setTimeout(() => this._scheduleNextDrum(), stepMs);
  }

  // =========================================================================
  // 场景与玩法语义化音效接口
  // =========================================================================

  playClick() {
    this.playPluck(523.25, 0.14, 0.09);
  }

  /**
   * 拾取金玉（Spirit Jade）：五声音阶随连击数逐级升调
   */
  playCollect(combo = 1) {
    const idx = Math.min(PENTATONIC_SCALE.length - 1, Math.max(0, Math.floor(combo) - 1));
    const freq = PENTATONIC_SCALE[idx];
    this.playPluck(freq, 0.24, 0.13);
  }

  /**
   * 擦身而过（Near-Miss）：清越双音五声金铁擦鸣
   */
  playNearMiss() {
    this.playPluck(783.99, 0.18, 0.12);
    setTimeout(() => this.playPluck(1046.5, 0.22, 0.13), 55);
  }

  /**
   * 触发 10 连击狂热模式（FEVER MODE）：古筝五声上行刮奏 + 重战鼓
   */
  playFeverStart() {
    this.playWarDrum(1.25);
    const gliss = [392.0, 440.0, 523.25, 659.25, 783.99, 1046.5];
    gliss.forEach((f, i) => {
      setTimeout(() => this.playPluck(f, 0.32, 0.13), i * 42);
    });
  }

  /**
   * 狂热模式撞碎青铜阵/陨星：低频战鼓 + 金石碎裂
   */
  playSmash() {
    this.playWarDrum(1.2);
    this.playTone(460, 120, 0.14, 'sawtooth', 0.11);
    setTimeout(() => this.playPluck(880, 0.16, 0.09), 30);
  }

  /**
   * 拾取护体金钟（Shield）或金钟抵挡撞击：洪亮钟鸣（基频 + 2.756 倍非谐泛音）
   */
  playShield() {
    this.playTone(330, 326, 0.45, 'sine', 0.14);
    this.playTone(909, 895, 0.3, 'triangle', 0.07);
  }

  playBellBlock() {
    this.playTone(261.63, 255, 0.55, 'sine', 0.18);
    this.playTone(721, 705, 0.36, 'triangle', 0.09);
  }

  /**
   * 拾取吸宝灵符（Magnet）：五声灵符聚气上扬
   */
  playMagnet() {
    const notes = [440.0, 587.33, 880.0];
    notes.forEach((f, i) => {
      setTimeout(() => this.playPluck(f, 0.22, 0.11), i * 55);
    });
  }

  /**
   * 解锁流光拖尾皮肤 / 双倍灵玉奖励：古风五声庆典和弦
   */
  playSkinUnlock() {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => {
      setTimeout(() => this.playPluck(f, 0.38, 0.13), i * 65);
    });
  }

  playBonus() {
    this.playSkinUnlock();
  }

  playHit() {
    this.playWarDrum(1.25);
    this.playTone(195, 58, 0.28, 'sawtooth', 0.16);
  }

  playRevive() {
    this.playWarDrum(1.0);
    const notes = [329.63, 440.0, 659.25, 880.0];
    notes.forEach((f, i) => {
      setTimeout(() => this.playPluck(f, 0.3, 0.13), i * 60);
    });
  }

  playLevelClear() {
    this.playSkinUnlock();
  }
}

export const synthAudio = new SynthAudio();
