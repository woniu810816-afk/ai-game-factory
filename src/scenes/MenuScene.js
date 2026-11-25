import Phaser from 'phaser';
import { GAME_DESIGN, WARLORDS, getWarlord } from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 《INVESTITURE: Relic Forge / 封神锻炉》主菜单场景
 * - 顶部一键中英文实时切换（EN / 中）与音效开关
 * - 商周青铜八卦祭坛 + 全封闭青铜战盔战将实时预览
 * - WARLORDS / 封神战将 4 尊战将解锁与切换面板（哪吒、杨戬、雷震子、姜子牙，各有真实被动）
 * - 全部按钮显式绑定宽松矩形热区 + try/catch 容错，确保 iPhone Retina 100% 灵敏响应
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    this.embers = [];
    this.leaderboardContainer = null;
    this.warlordCards = {};
  }

  init(data) {
    this.saveData = data?.save || platformBridge.getLocalSave();
    this.selectedWarlord = this.saveData.selectedWarlord || 'nezha';
    this.unlockedWarlords = Array.isArray(this.saveData.unlockedWarlords)
      ? [...this.saveData.unlockedWarlords]
      : ['nezha'];
    this.essenceBalance = Math.max(0, Number(this.saveData.coins || 0));
  }

  _syncDebugState() {
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      const w = GAME_DESIGN.width;
      const warlordBtns = {};
      WARLORDS.forEach((wl, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        warlordBtns[wl.id] = {
          x: w / 2 + (col === 0 ? -116 : 116),
          y: 472 + row * 78
        };
      });
      window.__GAME_STATE__.scene = 'MenuScene';
      window.__GAME_STATE__.lang = i18n.lang;
      window.__GAME_STATE__.soundEnabled = synthAudio.enabled;
      window.__GAME_STATE__.leaderboardOpen = Boolean(this.leaderboardContainer);
      window.__GAME_STATE__.selectedWarlord = this.selectedWarlord;
      window.__GAME_STATE__.unlockedWarlords = [...this.unlockedWarlords];
      window.__GAME_STATE__.essenceBalance = this.essenceBalance;
      window.__GAME_STATE__.buttons = {
        lang: { x: 368, y: 38 },
        sound: { x: 468, y: 38 },
        start: { x: w / 2, y: 672 },
        leaderboard: { x: w / 2, y: 758 },
        warlords: warlordBtns
      };
    }
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#0b0a10');
    try {
      this.scale?.updateBounds?.();
      synthAudio.stopWarDrums();
      platformBridge.gameplayStop();
    } catch (_) {}

    // 水墨青铜飘浮金屑背景
    this.embers = [];
    for (let i = 0; i < 48; i++) {
      const isBronze = i % 2 === 0;
      const e = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.FloatBetween(1.1, 2.4),
        isBronze ? 0xd99b38 : 0x2dd4bf,
        Phaser.Math.FloatBetween(0.15, 0.55)
      );
      e.speedY = Phaser.Math.FloatBetween(18, 56);
      this.embers.push(e);
    }

    // 顶部栏：玄铁精魄余额 + EN/中 + 音效开关
    const essBg = this.add.rectangle(104, 38, 174, 40, 0x1c1612, 0.94).setDepth(10);
    essBg.setStrokeStyle(1.8, 0xd99b38, 0.85);
    this.add.circle(34, 38, 8, 0xfbbf24, 1).setStrokeStyle(2, 0x2dd4bf, 0.9).setDepth(11);
    this.essenceText = this.add.text(50, 38, '', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#fde68a'
    }).setOrigin(0, 0.5).setDepth(11);

    this.langBtn = this._createButton(
      368, 38, 86, 40,
      i18n.t('langBtn'),
      0x1c1612, '#2dd4bf', '14px',
      () => this._toggleLanguage(),
      10, 0x2dd4bf
    );

    this.soundBtn = this._createButton(
      468, 38, 94, 40,
      synthAudio.enabled ? i18n.t('sfxOn') : i18n.t('sfxOff'),
      0x1c1612, '#fde68a', '13px',
      () => this._toggleSound(),
      10, 0xd99b38
    );

    // 标题区
    this.titleMainText = this.add.text(width / 2, 102, '', {
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#eab308',
      stroke: '#3b1d0a',
      strokeThickness: 7
    }).setOrigin(0.5);

    this.titleSubText = this.add.text(width / 2, 144, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#f59e0b',
      letterSpacing: 4
    }).setOrigin(0.5);

    this.taglineText = this.add.text(width / 2, 172, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#a8a29e',
      letterSpacing: 2
    }).setOrigin(0.5);

    // 中央青铜八卦祭坛 + 战将背影/侧影预览
    this.baguaHalo = this.add.image(width / 2, 262, 'baguaRing').setScale(0.86).setAlpha(0.75).setDepth(4);
    this.heroSprite = this.add.image(width / 2, 260, getWarlord(this.selectedWarlord).texture)
      .setScale(1.18)
      .setDepth(6);

    this.tweens.add({
      targets: this.heroSprite,
      y: 251,
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    this.passiveText = this.add.text(width / 2, 338, '', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#5eead4',
      align: 'center'
    }).setOrigin(0.5).setDepth(7);

    this.recordText = this.add.text(width / 2, 366, '', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#fde047'
    }).setOrigin(0.5).setDepth(7);

    // WARLORDS / 封神战将 切换与解锁面板
    const panelBg = this.add.rectangle(width / 2, 500, 476, 206, 0x161214, 0.94).setDepth(5);
    panelBg.setStrokeStyle(2, 0x78350f, 0.9);

    this.warlordsHeaderText = this.add.text(56, 412, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#eab308',
      letterSpacing: 2
    }).setOrigin(0, 0.5).setDepth(6);

    this.warlordTipText = this.add.text(width - 56, 412, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#a8a29e'
    }).setOrigin(1, 0.5).setDepth(6);

    this._buildWarlordCards();

    // 主按钮：开炉破阵 / FORGE & DEFEND
    this.startBtn = this._createButton(
      width / 2, 672, 370, 70,
      '', 0xb91c1c, '#fffbeb', '24px',
      () => this._startGame(),
      14, 0xeab308
    );

    // 次按钮：全球封神榜 / GLOBAL LEADERBOARD
    this.leaderboardBtn = this._createButton(
      width / 2, 758, 370, 52,
      '', 0x1c1612, '#fbbf24', '17px',
      () => this._openLeaderboardModal(),
      12, 0xb45309
    );

    // 底部操作说明
    this.controlsText = this.add.text(width / 2, 856, '', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#a8a29e',
      align: 'center',
      lineSpacing: 8
    }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.leaderboardContainer) this._startGame();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.leaderboardContainer) this._startGame();
    });
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());

    this._refreshAllText();
    this._syncDebugState();
  }

  _buildWarlordCards() {
    const { width } = GAME_DESIGN;
    this.warlordCards = {};

    WARLORDS.forEach((wl, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = width / 2 + (col === 0 ? -116 : 116);
      const cy = 472 + row * 78;
      const cardW = 216;
      const cardH = 64;
      const hitPad = 10;

      const bg = this.add.rectangle(cx, cy, cardW, cardH, 0x1e1817, 0.96).setDepth(10);
      const hitArea = new Phaser.Geom.Rectangle(-hitPad, -hitPad, cardW + hitPad * 2, cardH + hitPad * 2);
      bg.setInteractive({
        hitArea,
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true
      });

      const avatar = this.add.image(cx - 78, cy, wl.texture).setScale(0.54).setDepth(11);
      const nameTxt = this.add.text(cx - 46, cy - 11, '', {
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#f8fafc'
      }).setOrigin(0, 0.5).setDepth(11);

      const statusTxt = this.add.text(cx - 46, cy + 12, '', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fbbf24'
      }).setOrigin(0, 0.5).setDepth(11);

      bg.on('pointerdown', () => {
        try { synthAudio.ensureContext(); } catch (_) {}
        this._handleWarlordTap(wl);
      });

      this.warlordCards[wl.id] = { bg, avatar, nameTxt, statusTxt };
    });
  }

  _refreshAllText() {
    const wlInfo = i18n.pack.warlords[this.selectedWarlord] || i18n.pack.warlords.nezha;
    this.titleMainText.setText(i18n.t('titleMain'));
    this.titleSubText.setText(i18n.t('titleSub'));
    this.taglineText.setText(i18n.t('tagline'));
    this.essenceText.setText(`${this.essenceBalance} ${i18n.t('essenceUnit')}`);
    this.langBtn.label.setText(i18n.t('langBtn'));
    this.soundBtn.label.setText(synthAudio.enabled ? i18n.t('sfxOn') : i18n.t('sfxOff'));
    this.passiveText.setText(`${wlInfo.name}: ${wlInfo.passive}`);
    this.recordText.setText(
      `${i18n.t('bestScore')}: ${this.saveData.bestScore || 0}  ·  ${i18n.t('bestWave')}: ${this.saveData.maxLevel || 1}`
    );
    this.warlordsHeaderText.setText(i18n.t('warlordsHeader'));
    this.warlordTipText.setText(i18n.t('warlordsTip')).setColor('#a8a29e');
    this.startBtn.label.setText(i18n.t('playNow'));
    this.leaderboardBtn.label.setText(i18n.t('leaderboard'));
    this.controlsText.setText(i18n.t('controlsTip'));

    const curWl = getWarlord(this.selectedWarlord);
    this.heroSprite.setTexture(curWl.texture);

    WARLORDS.forEach((wl) => {
      const card = this.warlordCards[wl.id];
      if (!card) return;
      const isUnlocked = this.unlockedWarlords.includes(wl.id);
      const isSelected = this.selectedWarlord === wl.id;
      const meta = i18n.pack.warlords[wl.id];

      card.nameTxt.setText(meta.name);
      if (isSelected) {
        card.bg.setFillStyle(0x2e2119, 1);
        card.bg.setStrokeStyle(2.5, wl.accentHex, 1);
        card.statusTxt.setText(i18n.t('equipped')).setColor('#fde047');
      } else if (isUnlocked) {
        card.bg.setFillStyle(0x1f1918, 0.95);
        card.bg.setStrokeStyle(1.5, 0x57534e, 0.9);
        card.statusTxt.setText(i18n.t('ownedTap')).setColor('#34d399');
      } else {
        const canAfford = this.essenceBalance >= wl.cost;
        card.bg.setFillStyle(0x141114, 0.92);
        card.bg.setStrokeStyle(1.5, canAfford ? 0xf59e0b : 0x3f3f46, 0.9);
        card.statusTxt.setText(i18n.t('unlockCost', wl.cost)).setColor(canAfford ? '#fbbf24' : '#78716c');
      }
    });

    this._syncDebugState();
  }

  _handleWarlordTap(wl) {
    if (this.leaderboardContainer) return;
    const isUnlocked = this.unlockedWarlords.includes(wl.id);
    const meta = i18n.pack.warlords[wl.id];

    if (isUnlocked) {
      this.selectedWarlord = wl.id;
      try { synthAudio.playClick(); } catch (_) {}
      this._refreshAllText();
      try {
        platformBridge.saveCloudProgress({ selectedWarlord: this.selectedWarlord }).catch(() => {});
      } catch (_) {}
      return;
    }

    if (this.essenceBalance >= wl.cost) {
      this.essenceBalance -= wl.cost;
      this.unlockedWarlords = Array.from(new Set([...this.unlockedWarlords, wl.id]));
      this.selectedWarlord = wl.id;
      try { synthAudio.playDecree(); } catch (_) {}
      try {
        platformBridge.trackEvent('warlord_unlock', {
          warlord_id: wl.id,
          cost_essence: wl.cost,
          remaining_essence: this.essenceBalance
        });
        platformBridge.saveCloudProgress({
          coins: this.essenceBalance,
          unlockedWarlords: this.unlockedWarlords,
          selectedWarlord: this.selectedWarlord
        }).catch(() => {});
      } catch (_) {}

      this._refreshAllText();
      this.warlordTipText.setText(i18n.t('unlockedBanner', meta.name)).setColor('#34d399');
    } else {
      const missing = wl.cost - this.essenceBalance;
      try { synthAudio.playInvalid(); } catch (_) {}
      this.warlordTipText.setText(i18n.t('needEssence', missing)).setColor('#f87171');
      const card = this.warlordCards[wl.id];
      if (card) {
        this.tweens.add({ targets: card.bg, x: card.bg.x + 5, duration: 45, yoyo: true, repeat: 2 });
      }
    }
  }

  _toggleLanguage() {
    i18n.toggle();
    this._refreshAllText();
  }

  _toggleSound() {
    const next = !synthAudio.enabled;
    try {
      synthAudio.setEnabled(next);
      if (next) {
        synthAudio.ensureContext();
        synthAudio.playClick();
      }
    } catch (_) {}
    this.soundBtn.label.setText(next ? i18n.t('sfxOn') : i18n.t('sfxOff'));
    this._syncDebugState();
    try {
      platformBridge.saveCloudProgress({ soundEnabled: next }).catch(() => {});
    } catch (_) {}
  }

  _startGame() {
    try {
      synthAudio.ensureContext();
      synthAudio.playClick();
    } catch (_) {}
    this.scene.start('GameScene', {
      warlordId: this.selectedWarlord
    });
  }

  async _openLeaderboardModal() {
    if (this.leaderboardContainer) return;
    const { width, height } = GAME_DESIGN;

    const container = this.add.container(0, 0).setDepth(50);
    this.leaderboardContainer = container;
    this._syncDebugState();

    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const panel = this.add.rectangle(width / 2, height / 2, 464, 620, 0x161214, 0.98);
    panel.setStrokeStyle(2.2, 0xd99b38, 0.95);

    const header = this.add.text(width / 2, height / 2 - 264, i18n.t('leaderboardTitle'), {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#eab308',
      letterSpacing: 2
    }).setOrigin(0.5);

    const loadingText = this.add.text(width / 2, height / 2, '...', {
      fontSize: '18px',
      color: '#a8a29e'
    }).setOrigin(0.5);

    const closeHit = new Phaser.Geom.Rectangle(-14, -14, 248, 80);
    const closeBtnBg = this.add.rectangle(width / 2, height / 2 + 258, 220, 52, 0xb91c1c)
      .setStrokeStyle(2, 0xeab308, 0.9)
      .setInteractive({ hitArea: closeHit, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const closeBtnTxt = this.add.text(width / 2, height / 2 + 258, i18n.t('close'), {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    closeBtnBg.on('pointerdown', () => {
      try { synthAudio.playClick(); } catch (_) {}
      container.destroy();
      this.leaderboardContainer = null;
      this._syncDebugState();
    });

    container.add([mask, panel, header, loadingText, closeBtnBg, closeBtnTxt]);

    let res;
    try {
      res = await platformBridge.fetchLeaderboard(10);
    } catch (_) {
      res = { source: 'local_fallback', entries: [] };
    }
    if (!this.leaderboardContainer) return;
    loadingText.destroy();

    const subTip = this.add.text(
      width / 2,
      height / 2 - 228,
      res.source === 'supabase' ? i18n.t('leaderboardLive') : i18n.t('leaderboardLocal'),
      { fontSize: '12px', color: '#a8a29e' }
    ).setOrigin(0.5);
    container.add(subTip);

    if (!res.entries || !res.entries.length) {
      const empty = this.add.text(width / 2, height / 2, i18n.t('leaderboardEmpty'), {
        fontSize: '17px',
        color: '#d6d3d1'
      }).setOrigin(0.5);
      container.add(empty);
      return;
    }

    res.entries.slice(0, 10).forEach((item, idx) => {
      const y = height / 2 - 182 + idx * 40;
      const rowColor = item.isSelf ? '#34d399' : (idx < 3 ? '#fbbf24' : '#e7e5e4');
      const rowText = this.add.text(
        width / 2 - 196,
        y,
        `#${item.rank}  ${String(item.nickname).slice(0, 12)}${item.isSelf ? ' *' : ''}`,
        { fontSize: '16px', color: rowColor, fontStyle: item.isSelf ? 'bold' : 'normal' }
      ).setOrigin(0, 0.5);
      const scoreText = this.add.text(
        width / 2 + 196,
        y,
        `${item.score} · W${item.level_reached}`,
        { fontSize: '15px', color: rowColor, fontStyle: 'bold' }
      ).setOrigin(1, 0.5);
      container.add([rowText, scoreText]);
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const { width, height } = GAME_DESIGN;
    if (this.baguaHalo) this.baguaHalo.angle += 16 * dt;
    for (const e of this.embers) {
      e.y -= e.speedY * dt;
      if (e.y < -4) {
        e.y = height + 4;
        e.x = Phaser.Math.Between(0, width);
      }
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
      bg.setAlpha(0.75);
      this.time.delayedCall(90, () => {
        if (bg.active) bg.setAlpha(1);
      });
      try {
        synthAudio.ensureContext();
        synthAudio.playClick();
      } catch (_) {}
      try {
        onClick();
      } catch (err) {
        console.error('按钮交互回调异常：', err);
      }
    });
    return { bg, label };
  }
}
