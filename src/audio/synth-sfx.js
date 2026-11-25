/**
 * 零外部音频依赖的 Web Audio 合成音效引擎
 * 优势：大幅缩减 Poki / CrazyGames 打包体积，且在广告播放期间可即时一键静音。
 * 已全面增加 iOS Safari 音频限制容错，任何音频异常绝不阻塞交互与场景跳转。
 */

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
  }

  setAdMuted(flag) {
    this.adMuted = !!flag;
    try {
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
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.02);
    } catch (_) {
      // iOS 静音/未解锁限制时静默降级，绝不中断游戏逻辑
    }
  }

  playClick() {
    this.playTone(520, 680, 0.07, 'triangle', 0.1);
  }

  playCollect(combo = 1) {
    const base = Math.min(1200, 560 + combo * 45);
    this.playTone(base, base * 1.35, 0.11, 'sine', 0.13);
  }

  playBonus() {
    this.playTone(660, 990, 0.12, 'triangle', 0.15);
    setTimeout(() => this.playTone(990, 1320, 0.16, 'sine', 0.14), 85);
  }

  playShield() {
    this.playTone(420, 840, 0.18, 'sine', 0.14);
  }

  playHit() {
    this.playTone(220, 68, 0.24, 'sawtooth', 0.18);
  }

  playLevelClear() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, n * 1.02, 0.16, 'triangle', 0.14), idx * 90);
    });
  }

  playRevive() {
    this.playTone(330, 880, 0.25, 'sine', 0.15);
  }
}

export const synthAudio = new SynthAudio();
