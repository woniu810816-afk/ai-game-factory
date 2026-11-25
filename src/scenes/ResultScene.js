import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 《Celestial Rush》结算场景（全英文欧美风格 UI）：
 * - 接入 platformBridge 激励视频广告：
 *   1) 每局 1 次「REVIVE (AD)」原地满血复活（含护体金钟与无敌保护，上报 GA4 rewarded_revive）
 *   2) 「2X JADE (AD)」双倍灵玉奖励（永久入账本地与新加坡 Supabase 云端存档）
 * - 自然停顿插屏广告（PLAY AGAIN）、全球排行榜自动提交与 TOP 3 速览
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.score = Math.max(0, Math.round(Number(data?.score || 0)));
    this.runJade = Math.max(0, Math.round(Number(data?.runJade || 0)));
    this.nearMissCount = Math.max(0, Math.round(Number(data?.nearMissCount || 0)));
    this.feverCount = Math.max(0, Math.round(Number(data?.feverCount || 0)));
    this.combo = Math.max(0, Math.round(Number(data?.combo || 0)));
    this.feverStreak = Math.max(0, Math.round(Number(data?.feverStreak || 0)));
    this.durationSec = Math.max(1, Math.round(Number(data?.durationSec || 1)));
    this.elapsedMs = Math.max(0, Number(data?.elapsedMs || 0));
    this.revived = Boolean(data?.revived);
    this.trailId = data?.trailId || platformBridge.getLocalSave().selectedTrail;

    this.doubleJadeClaimed = false;
    this.baseJadeCredited = false;
    this.busy = false;
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#090714');
    try {
      this.scale?.updateBounds?.();
      synthAudio.stopWarDrums();
    } catch (_) {}

    const prevBest = Number(platformBridge.getLocalSave().bestScore || 0);
    const isNewBest = this.score > prevBest && this.score > 0;
    if (isNewBest) {
      try { platformBridge.happyTime(); } catch (_) {}
    }

    // 结算主卡片
    const card = this.add.rectangle(width / 2, height / 2 - 12, 464, 790, 0x140e24, 0.96);
    card.setStrokeStyle(2, isNewBest ? 0xfbbf24 : 0xdc2626, 0.9);

    this.add.text(width / 2, 118, isNewBest ? 'NEW RECORD!' : 'RUN OVER', {
      fontSize: '38px',
      fontStyle: 'bold',
      color: isNewBest ? '#fde047' : '#f87171',
      stroke: '#090714',
      strokeThickness: 6
    }).setOrigin(0.5);

    // 核心分数展示
    this.add.text(width / 2, 168, 'FINAL SCORE', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#94a3b8',
      letterSpacing: 2
    }).setOrigin(0.5);

    this.scoreValueText = this.add.text(width / 2, 214, String(this.score), {
      fontSize: '54px',
      fontStyle: 'bold',
      color: '#fbbf24'
    }).setOrigin(0.5);

    // 局内战绩明细条（Spirit Jade / Near Miss / Fevers）
    const statsBg = this.add.rectangle(width / 2, 294, 412, 74, 0x1e1435, 0.92);
    statsBg.setStrokeStyle(1.5, 0x5b3b1e, 0.85);

    this.add.text(width / 2 - 134, 276, 'SPIRIT JADE', { fontSize: '11px', color: '#94a3b8', fontStyle: 'bold' }).setOrigin(0.5);
    this.jadeEarnedText = this.add.text(width / 2 - 134, 304, `+${this.runJade}`, {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#34d399'
    }).setOrigin(0.5);

    this.add.text(width / 2, 276, 'NEAR MISS', { fontSize: '11px', color: '#94a3b8', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, 304, String(this.nearMissCount), {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#fde047'
    }).setOrigin(0.5);

    this.add.text(width / 2 + 134, 276, 'FEVERS', { fontSize: '11px', color: '#94a3b8', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2 + 134, 304, String(this.feverCount), {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#fb923c'
    }).setOrigin(0.5);

    this.syncStatusText = this.add.text(width / 2, 354, 'SYNCING CLOUD SAVE & LEADERBOARD...', {
      fontSize: '12px',
      color: '#a78bfa'
    }).setOrigin(0.5);

    // 商业化激励广告按钮区：
    // 1) 每局 1 次 REVIVE (AD) 原地满血复活
    let nextBtnY = 412;
    if (!this.revived) {
      this.reviveBtn = this._createButton(
        width / 2,
        nextBtnY,
        370,
        58,
        'REVIVE (AD) · FULL SHIELD',
        0x7c3aed,
        '#ffffff',
        '19px',
        () => this._handleRevive(),
        12,
        0xc4b5fd
      );
      nextBtnY += 70;
    }

    // 2) 2X JADE (AD) 双倍灵玉奖励按钮（若本局未收集到灵玉则提供 +5 激励保底）
    const extraJade = this.runJade > 0 ? this.runJade : 5;
    const doubleLabel = this.runJade > 0 ? `2X JADE (AD) · +${extraJade} JADE` : '2X JADE (AD) · +5 BONUS';
    this.doubleJadeBtn = this._createButton(
      width / 2,
      nextBtnY,
      370,
      56,
      doubleLabel,
      0xd97706,
      '#fffbeb',
      '19px',
      () => this._handleDoubleJade(extraJade),
      12,
      0xfef08a
    );
    nextBtnY += 72;

    // 主按钮：PLAY AGAIN（含自然停顿插屏广告）
    this.playAgainBtn = this._createButton(
      width / 2,
      nextBtnY,
      370,
      58,
      'PLAY AGAIN',
      0xdc2626,
      '#ffffff',
      '22px',
      async () => {
        if (this.busy) return;
        this.busy = true;
        try {
          await platformBridge.showCommercialBreak('retry');
        } catch (_) {}
        this.scene.start('GameScene', {
          score: 0,
          runJade: 0,
          revived: false,
          trailId: this.trailId
        });
      },
      12,
      0xfbbf24
    );
    nextBtnY += 66;

    // 次按钮：MAIN MENU
    this.menuBtn = this._createButton(
      width / 2,
      nextBtnY,
      370,
      48,
      'MAIN MENU',
      0x1e1435,
      '#cbd5e1',
      '18px',
      () => {
        if (this.busy) return;
        this.scene.start('MenuScene', { save: platformBridge.getLocalSave() });
      },
      12,
      0x78350f
    );

    // 底部：全球榜单 TOP 3 速览
    const rankBaseY = Math.min(734, nextBtnY + 56);
    this.add.text(width / 2, rankBaseY, 'GLOBAL TOP 3', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#fbbf24',
      letterSpacing: 2
    }).setOrigin(0.5);

    this.rankListText = this.add.text(width / 2, rankBaseY + 52, 'LOADING...', {
      fontSize: '14px',
      color: '#cbd5e1',
      align: 'center',
      lineSpacing: 7
    }).setOrigin(0.5);

    this._syncDebugState();
    this._persistAndRefreshRank();
  }

  _syncDebugState() {
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'ResultScene';
      window.__GAME_STATE__.score = this.score;
      window.__GAME_STATE__.runJade = this.runJade;
      window.__GAME_STATE__.revived = this.revived;
      window.__GAME_STATE__.jadeBalance = platformBridge.getLocalSave().coins;
    }
  }

  async _persistAndRefreshRank(extraJadeDelta = 0) {
    const curSave = platformBridge.getLocalSave();
    const nextBest = Math.max(curSave.bestScore || 0, this.score);

    // 首次进入结算时记入本局基础灵玉（若已记入则只加额外激励翻倍部分）
    let jadeGain = extraJadeDelta;
    if (!this.baseJadeCredited) {
      this.baseJadeCredited = true;
      jadeGain += this.runJade;
    }

    const nextCoins = Math.max(0, Number(curSave.coins || 0) + jadeGain);

    try {
      await platformBridge.saveCloudProgress({
        bestScore: nextBest,
        coins: nextCoins
      });
    } catch (_) {}

    let submitRes = { offline: true };
    try {
      submitRes = await platformBridge.submitScore({
        score: this.score,
        levelReached: Math.max(1, 1 + Math.floor(this.score / 500)),
        durationSec: this.durationSec,
        revived: this.revived,
        doubleClaimed: this.doubleJadeClaimed
      });
    } catch (_) {}

    if (!this.scene.isActive()) return;
    this._syncDebugState();

    if (submitRes.offline) {
      this.syncStatusText.setText(`SAVED LOCALLY · TOTAL JADE: ${nextCoins}`);
    } else if (submitRes.ok) {
      this.syncStatusText.setText(
        submitRes.flagged
          ? 'SCORE RECORDED (PENDING REVIEW)'
          : `CLOUD SYNCED · TOTAL JADE: ${nextCoins}`
      );
    } else {
      this.syncStatusText.setText(`LOCAL SAVE UPDATED · TOTAL JADE: ${nextCoins}`);
    }

    try {
      const lb = await platformBridge.fetchLeaderboard(3);
      if (!this.scene.isActive()) return;
      const lines = (lb.entries || []).map((e) => `#${e.rank}  ${e.nickname}  ·  ${e.score} PTS`);
      this.rankListText.setText(lines.length ? lines.join('\n') : 'NO ENTRIES YET');
    } catch (_) {
      if (this.scene.isActive()) this.rankListText.setText('OFFLINE RANKING');
    }
  }

  async _handleRevive() {
    if (this.busy || this.revived) return;
    this.busy = true;
    const res = await platformBridge.showRewardedBreak('revive');
    this.busy = false;
    if (!this.scene.isActive()) return;

    if (res.granted) {
      // 回滚本局已提前入账的基础灵玉，避免玩家复活后二次结算重复记账
      if (this.baseJadeCredited && this.runJade > 0) {
        const cur = platformBridge.getLocalSave();
        platformBridge.saveLocal({ coins: Math.max(0, (cur.coins || 0) - this.runJade) });
        this.baseJadeCredited = false;
      }

      try {
        platformBridge.trackEvent('rewarded_revive', {
          score: this.score,
          run_jade: this.runJade,
          duration_sec: this.durationSec
        });
      } catch (_) {}

      this.scene.start('GameScene', {
        score: this.score,
        runJade: this.runJade,
        nearMissCount: this.nearMissCount,
        feverCount: this.feverCount,
        combo: this.combo,
        feverStreak: this.feverStreak,
        elapsedMs: this.elapsedMs,
        revived: true,
        trailId: this.trailId
      });
    } else {
      this.syncStatusText.setText('AD NOT COMPLETED · REVIVE UNAVAILABLE');
    }
  }

  async _handleDoubleJade(extraJade) {
    if (this.busy || this.doubleJadeClaimed) return;
    this.busy = true;
    const res = await platformBridge.showRewardedBreak('double_jade');
    this.busy = false;
    if (!this.scene.isActive()) return;

    if (res.granted) {
      this.doubleJadeClaimed = true;
      const totalRunJade = this.runJade + extraJade;
      this.jadeEarnedText.setText(`+${totalRunJade} (2X)`);
      try { synthAudio.playBonus(); } catch (_) {}

      if (this.doubleJadeBtn) {
        this.doubleJadeBtn.bg.setFillStyle(0x334155);
        this.doubleJadeBtn.bg.disableInteractive();
        this.doubleJadeBtn.label.setText(`2X JADE CLAIMED (+${extraJade})`);
      }
      await this._persistAndRefreshRank(extraJade);
    } else {
      this.syncStatusText.setText('AD NOT COMPLETED · BONUS NOT GRANTED');
    }
  }

  _createButton(x, y, w, h, text, bgColor, textColor, fontSize, onClick, hitPad = 12, strokeColor = 0xfbbf24) {
    const bg = this.add.rectangle(x, y, w, h, bgColor, 1).setDepth(10);
    bg.setStrokeStyle(2, strokeColor, 0.8);
    const hitArea = new Phaser.Geom.Rectangle(-hitPad, -hitPad, w + hitPad * 2, h + hitPad * 2);
    bg.setInteractive({
      hitArea,
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const label = this.add.text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color: textColor
    }).setOrigin(0.5).setDepth(11);
    bg.on('pointerover', () => bg.setAlpha(0.9));
    bg.on('pointerout', () => bg.setAlpha(1));
    bg.on('pointerdown', () => {
      try {
        synthAudio.ensureContext();
        synthAudio.playClick();
      } catch (_) {}
      try {
        onClick();
      } catch (err) {
        console.error('结算按钮回调异常：', err);
      }
    });
    return { bg, label };
  }
}
