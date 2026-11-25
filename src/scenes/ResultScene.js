import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 《INVESTITURE: Relic Forge / 封神锻炉》结算场景（支持 EN / 中 双语）
 * - 第 3 个高价值激励广告触发点：「2X ESSENCE (AD) / 精魄翻倍（广告）」
 * - 自然停顿插屏广告（FORGE AGAIN）+ 本机/新加坡 Supabase 云存档与全球封神榜 TOP 3 速览
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.score = Math.max(0, Math.round(Number(data?.score || 0)));
    this.wave = Math.max(1, Math.round(Number(data?.wave || 1)));
    this.slainCount = Math.max(0, Math.round(Number(data?.slainCount || 0)));
    this.runEssence = Math.max(0, Math.round(Number(data?.runEssence || 0)));
    this.durationSec = Math.max(1, Math.round(Number(data?.durationSec || 1)));
    this.revived = Boolean(data?.revived);
    this.warlordId = data?.warlordId || platformBridge.getLocalSave().selectedWarlord;

    this.doubleClaimed = false;
    this.baseCredited = false;
    this.busy = false;
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#0b0a10');
    try {
      this.scale?.updateBounds?.();
      synthAudio.stopWarDrums();
    } catch (_) {}

    const prevBest = Number(platformBridge.getLocalSave().bestScore || 0);
    const isNewBest = this.score > prevBest && this.score > 0;
    if (isNewBest) {
      try { platformBridge.happyTime(); } catch (_) {}
    }

    const card = this.add.rectangle(width / 2, height / 2 - 10, 464, 780, 0x161214, 0.96);
    card.setStrokeStyle(2.2, isNewBest ? 0xeab308 : 0xb91c1c, 0.92);

    this.add.text(width / 2, 128, isNewBest ? i18n.t('resultNewBest') : i18n.t('resultOver'), {
      fontSize: '36px',
      fontStyle: 'bold',
      color: isNewBest ? '#fde047' : '#f87171',
      stroke: '#0b0a10',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(width / 2, 182, i18n.t('finalScore'), {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#a8a29e',
      letterSpacing: 2
    }).setOrigin(0.5);

    this.add.text(width / 2, 230, String(this.score), {
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#eab308'
    }).setOrigin(0.5);

    // 战绩三栏：波次 / 斩妖数 / 玄铁精魄
    const statsBg = this.add.rectangle(width / 2, 314, 412, 78, 0x221b18, 0.95);
    statsBg.setStrokeStyle(1.5, 0x78350f, 0.9);

    this.add.text(width / 2 - 134, 294, i18n.t('statWave'), { fontSize: '12px', color: '#a8a29e', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2 - 134, 324, String(this.wave), { fontSize: '24px', fontStyle: 'bold', color: '#fde047' }).setOrigin(0.5);

    this.add.text(width / 2, 294, i18n.t('statSlain'), { fontSize: '12px', color: '#a8a29e', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, 324, String(this.slainCount), { fontSize: '24px', fontStyle: 'bold', color: '#f87171' }).setOrigin(0.5);

    this.add.text(width / 2 + 134, 294, i18n.t('statEssence'), { fontSize: '12px', color: '#a8a29e', fontStyle: 'bold' }).setOrigin(0.5);
    this.essenceEarnedText = this.add.text(width / 2 + 134, 324, `+${this.runEssence}`, {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#34d399'
    }).setOrigin(0.5);

    this.syncStatusText = this.add.text(width / 2, 380, '...', {
      fontSize: '12px',
      color: '#a8a29e'
    }).setOrigin(0.5);

    // 激励广告按钮：精魄翻倍（若本局未获精魄则提供 +10 激励保底）
    const extraEssence = this.runEssence > 0 ? this.runEssence : 10;
    this.doubleBtn = this._createButton(
      width / 2,
      444,
      370,
      60,
      i18n.t('doubleEssenceBtn', extraEssence),
      0xd97706,
      '#fffbeb',
      '18px',
      () => this._handleDoubleEssence(extraEssence),
      12,
      0xfef08a
    );

    // 再战封神（插屏广告停顿点）
    this._createButton(
      width / 2,
      522,
      370,
      58,
      i18n.t('playAgain'),
      0xb91c1c,
      '#ffffff',
      '21px',
      async () => {
        if (this.busy) return;
        this.busy = true;
        try { await platformBridge.showCommercialBreak('retry'); } catch (_) {}
        this.scene.start('GameScene', { warlordId: this.warlordId });
      },
      12,
      0xeab308
    );

    // 返回主界面
    this._createButton(
      width / 2,
      594,
      370,
      48,
      i18n.t('mainMenu'),
      0x221b18,
      '#d6d3d1',
      '17px',
      () => {
        if (this.busy) return;
        this.scene.start('MenuScene', { save: platformBridge.getLocalSave() });
      },
      12,
      0x78350f
    );

    // 全球榜 TOP 3 速览
    this.add.text(width / 2, 668, i18n.t('top3Title'), {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#eab308',
      letterSpacing: 2
    }).setOrigin(0.5);

    this.rankListText = this.add.text(width / 2, 730, '...', {
      fontSize: '14px',
      color: '#d6d3d1',
      align: 'center',
      lineSpacing: 8
    }).setOrigin(0.5);

    this._syncState();
    this._persistAndRefreshRank(0);
  }

  _syncState() {
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'ResultScene';
      window.__GAME_STATE__.score = this.score;
      window.__GAME_STATE__.wave = this.wave;
      window.__GAME_STATE__.essenceBalance = platformBridge.getLocalSave().coins;
    }
  }

  async _persistAndRefreshRank(extraDelta = 0) {
    const curSave = platformBridge.getLocalSave();
    let delta = extraDelta;
    if (!this.baseCredited) {
      this.baseCredited = true;
      delta += this.runEssence;
    }
    const nextCoins = Math.max(0, Number(curSave.coins || 0) + delta);
    const nextBest = Math.max(curSave.bestScore || 0, this.score);
    const nextMaxWave = Math.max(curSave.maxLevel || 1, this.wave);

    try {
      await platformBridge.saveCloudProgress({
        bestScore: nextBest,
        maxLevel: nextMaxWave,
        coins: nextCoins
      });
    } catch (_) {}

    let submitRes = { offline: true };
    try {
      submitRes = await platformBridge.submitScore({
        score: this.score,
        levelReached: this.wave,
        durationSec: this.durationSec,
        revived: this.revived,
        doubleClaimed: this.doubleClaimed
      });
    } catch (_) {}

    if (!this.scene.isActive()) return;
    this._syncState();

    this.syncStatusText.setText(
      submitRes.ok && !submitRes.offline
        ? i18n.t('savedCloud', nextCoins)
        : i18n.t('savedLocal', nextCoins)
    );

    try {
      const lb = await platformBridge.fetchLeaderboard(3);
      if (!this.scene.isActive()) return;
      const lines = (lb.entries || []).map((e) => `#${e.rank}  ${e.nickname}  ·  ${e.score} (W${e.level_reached})`);
      this.rankListText.setText(lines.length ? lines.join('\n') : i18n.t('leaderboardEmpty'));
    } catch (_) {
      if (this.scene.isActive()) this.rankListText.setText(i18n.t('leaderboardLocal'));
    }
  }

  async _handleDoubleEssence(extraEssence) {
    if (this.busy || this.doubleClaimed) return;
    this.busy = true;
    const res = await platformBridge.showRewardedBreak('double_essence');
    this.busy = false;
    if (!this.scene.isActive()) return;

    if (res.granted) {
      this.doubleClaimed = true;
      this.essenceEarnedText.setText(`+${this.runEssence + extraEssence}`);
      try {
        synthAudio.playBonus();
        platformBridge.trackEvent('rewarded_double_essence', {
          extra_essence: extraEssence,
          wave: this.wave,
          score: this.score
        });
      } catch (_) {}

      if (this.doubleBtn) {
        this.doubleBtn.bg.setFillStyle(0x3f3f46);
        this.doubleBtn.bg.disableInteractive();
        this.doubleBtn.label.setText(i18n.t('doubleClaimed', extraEssence));
      }
      await this._persistAndRefreshRank(extraEssence);
    } else {
      this.syncStatusText.setText(i18n.t('adSkipped')).setColor('#f87171');
    }
  }

  _createButton(x, y, w, h, text, bgColor, textColor, fontSize, onClick, hitPad = 12, strokeColor = 0xd99b38) {
    const bg = this.add.rectangle(x, y, w, h, bgColor, 1).setDepth(10);
    bg.setStrokeStyle(2, strokeColor, 0.85);
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
      try { synthAudio.ensureContext(); synthAudio.playClick(); } catch (_) {}
      try { onClick(); } catch (err) { console.error('结算按钮回调异常：', err); }
    });
    return { bg, label };
  }
}
