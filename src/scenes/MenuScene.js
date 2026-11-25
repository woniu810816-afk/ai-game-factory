import Phaser from 'phaser';
import { GAME_DESIGN, TRAIL_SKINS, getTrailSkin } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 《Celestial Rush》主菜单场景（全英文欧美风格 UI）：
 * - 东方玄幻古风战盔行者与双风火轮实时动态预览
 * - TRAILS 流光拖尾皮肤面板（4 款皮肤：默认免费 + 3 款灵玉永久解锁并同步本地/云端）
 * - 右上角静音开关、全球排行榜弹窗与一键开局
 * - 所有按钮保留宽松 Phaser.Geom.Rectangle 点击热区与 try/catch 容错，确保 iPhone 高分屏 100% 灵敏响应
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    this.motesBg = [];
    this.trailParticles = [];
    this.leaderboardContainer = null;
    this.trailCardMap = {};
  }

  init(data) {
    this.saveData = data?.save || platformBridge.getLocalSave();
    this.selectedTrail = this.saveData.selectedTrail || 'crimson_flame';
    this.unlockedTrails = Array.isArray(this.saveData.unlockedTrails)
      ? [...this.saveData.unlockedTrails]
      : ['crimson_flame'];
    this.jadeBalance = Math.max(0, Number(this.saveData.coins || 0));
    this.trailEmitTimer = 0;
  }

  _syncDebugState() {
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      const w = GAME_DESIGN.width;
      const trailButtons = {};
      TRAIL_SKINS.forEach((skin, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        trailButtons[skin.id] = {
          x: w / 2 + (col === 0 ? -116 : 116),
          y: 462 + row * 78
        };
      });
      window.__GAME_STATE__.scene = 'MenuScene';
      window.__GAME_STATE__.soundEnabled = synthAudio.enabled;
      window.__GAME_STATE__.leaderboardOpen = Boolean(this.leaderboardContainer);
      window.__GAME_STATE__.selectedTrail = this.selectedTrail;
      window.__GAME_STATE__.unlockedTrails = [...this.unlockedTrails];
      window.__GAME_STATE__.jadeBalance = this.jadeBalance;
      window.__GAME_STATE__.buttons = {
        sound: { x: w - 82, y: 38 },
        start: { x: w / 2, y: 668 },
        leaderboard: { x: w / 2, y: 758 },
        trails: trailButtons
      };
    }
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#090714');
    try {
      this.scale?.updateBounds?.();
      synthAudio.stopWarDrums();
      platformBridge.gameplayStop();
    } catch (_) {}

    // 东方玄夜背景：远景暗金云纹流光与星尘
    this.motesBg = [];
    this.trailParticles = [];
    for (let i = 0; i < 55; i++) {
      const isGold = i % 3 === 0;
      const mote = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.FloatBetween(1.1, 2.7),
        isGold ? 0xfbbf24 : 0xa78bfa,
        Phaser.Math.FloatBetween(0.18, 0.65)
      );
      mote.speedY = Phaser.Math.FloatBetween(24, 78);
      this.motesBg.push(mote);
    }

    // 柔和东方云纹光环背景装饰
    const halo = this.add.circle(width / 2, 266, 108, 0xd97706, 0.08);
    halo.setStrokeStyle(1.5, 0xfbbf24, 0.2);

    // 左上角灵玉余额徽章（Spirit Jade）
    const jadePill = this.add.rectangle(104, 38, 170, 42, 0x1a112e, 0.92).setDepth(10);
    jadePill.setStrokeStyle(1.8, 0x10b981, 0.75);
    this.add.image(42, 38, 'spiritJade').setScale(0.62).setDepth(11);
    this.jadeBalanceText = this.add.text(64, 38, `${this.jadeBalance} JADE`, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#6ee7b7'
    }).setOrigin(0, 0.5).setDepth(11);

    // 右上角静音开关
    this.soundBtn = this._createButton(
      width - 82,
      38,
      128,
      42,
      synthAudio.enabled ? 'SFX ON' : 'SFX OFF',
      0x1a112e,
      '#fde68a',
      '15px',
      () => this._toggleSound(),
      12,
      0xf59e0b
    );

    // 主标题与副标题（全英文简洁风格）
    this.add.text(width / 2, 112, 'CELESTIAL RUSH', {
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#fbbf24',
      stroke: '#7c2d12',
      strokeThickness: 7
    }).setOrigin(0.5);

    this.add.text(width / 2, 156, 'RIDE THE WIND & FIRE WHEELS', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#c4b5fd',
      letterSpacing: 3
    }).setOrigin(0.5);

    // 角色与旋转双风火轮动态展示区
    this.heroBaseY = 264;
    this.heroContainer = this.add.container(width / 2, this.heroBaseY).setDepth(6);
    this.leftWheel = this.add.image(-18, 42, 'windFireWheel').setScale(0.92);
    this.rightWheel = this.add.image(18, 42, 'windFireWheel').setScale(0.92);
    this.heroSprite = this.add.image(0, 0, 'walker').setScale(1.18);
    this.heroContainer.add([this.leftWheel, this.rightWheel, this.heroSprite]);

    this._applySkinPreview();

    this.tweens.add({
      targets: this.heroContainer,
      y: this.heroBaseY - 11,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // 最高分与玩家标识
    this.add.text(width / 2, 344, `BEST SCORE: ${this.saveData.bestScore || 0}`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#fde047'
    }).setOrigin(0.5);

    // TRAILS（流光拖尾皮肤）切换面板
    const panelBg = this.add.rectangle(width / 2, 492, 476, 204, 0x140e24, 0.92).setDepth(5);
    panelBg.setStrokeStyle(2, 0x78350f, 0.85);

    this.add.text(56, 405, 'TRAILS', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#fbbf24',
      letterSpacing: 2
    }).setOrigin(0, 0.5).setDepth(6);

    this.trailFeedbackText = this.add.text(width - 56, 405, 'SELECT YOUR SPIRIT AURA', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#a78bfa'
    }).setOrigin(1, 0.5).setDepth(6);

    this._buildTrailCards();

    // 主按钮：PLAY NOW
    this.startBtn = this._createButton(
      width / 2,
      668,
      364,
      72,
      'PLAY NOW',
      0xdc2626,
      '#fffbeb',
      '28px',
      () => this._startGame(),
      14,
      0xfbbf24
    );

    // 次按钮：LEADERBOARD
    this.leaderboardBtn = this._createButton(
      width / 2,
      758,
      364,
      54,
      'GLOBAL LEADERBOARD',
      0x1a112e,
      '#fbbf24',
      '18px',
      () => this._openLeaderboardModal(),
      12,
      0xd97706
    );

    // 操控说明（简洁英文）
    this.add.text(width / 2, 858, 'TOUCH: HOLD & SLIDE TO DODGE\nPC: A / D OR ARROWS  ·  SPACE TO PLAY', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#94a3b8',
      align: 'center',
      lineSpacing: 8
    }).setOrigin(0.5);

    // 键盘快捷开局与静音
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.leaderboardContainer) this._startGame();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.leaderboardContainer) this._startGame();
    });
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());

    this._syncDebugState();
  }

  _buildTrailCards() {
    const { width } = GAME_DESIGN;
    this.trailCardMap = {};

    TRAIL_SKINS.forEach((skin, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = width / 2 + (col === 0 ? -116 : 116);
      const cy = 462 + row * 78;
      const cardW = 216;
      const cardH = 64;
      const hitPad = 10;

      const bg = this.add.rectangle(cx, cy, cardW, cardH, 0x1d1433, 0.95).setDepth(10);
      const hitArea = new Phaser.Geom.Rectangle(-hitPad, -hitPad, cardW + hitPad * 2, cardH + hitPad * 2);
      bg.setInteractive({
        hitArea,
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true
      });

      // 左侧皮肤色彩徽标
      const swatchOuter = this.add.circle(cx - 82, cy, 14, skin.primaryHex, 0.95).setDepth(11);
      swatchOuter.setStrokeStyle(2, skin.secondaryHex, 0.95);
      const swatchInner = this.add.circle(cx - 82, cy, 6, skin.secondaryHex, 1).setDepth(12);

      const nameTxt = this.add.text(cx - 56, cy - 11, skin.name, {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#f8fafc'
      }).setOrigin(0, 0.5).setDepth(11);

      const statusTxt = this.add.text(cx - 56, cy + 12, '', {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#fbbf24'
      }).setOrigin(0, 0.5).setDepth(11);

      bg.on('pointerdown', () => {
        try {
          synthAudio.ensureContext();
        } catch (_) {}
        this._handleTrailTap(skin);
      });

      this.trailCardMap[skin.id] = { bg, swatchOuter, swatchInner, nameTxt, statusTxt };
    });

    this._refreshTrailCards();
  }

  _refreshTrailCards() {
    TRAIL_SKINS.forEach((skin) => {
      const card = this.trailCardMap[skin.id];
      if (!card) return;
      const isUnlocked = this.unlockedTrails.includes(skin.id);
      const isSelected = this.selectedTrail === skin.id;

      if (isSelected) {
        card.bg.setFillStyle(0x2d1b4e, 1);
        card.bg.setStrokeStyle(2.5, skin.primaryHex, 1);
        card.statusTxt.setText('EQUIPPED');
        card.statusTxt.setColor('#fde047');
      } else if (isUnlocked) {
        card.bg.setFillStyle(0x1b1430, 0.95);
        card.bg.setStrokeStyle(1.5, 0x475569, 0.85);
        card.statusTxt.setText('OWNED · TAP TO EQUIP');
        card.statusTxt.setColor('#6ee7b7');
      } else {
        const canAfford = this.jadeBalance >= skin.cost;
        card.bg.setFillStyle(0x130e24, 0.92);
        card.bg.setStrokeStyle(1.5, canAfford ? 0xf59e0b : 0x334155, 0.85);
        card.statusTxt.setText(`UNLOCK · ${skin.cost} JADE`);
        card.statusTxt.setColor(canAfford ? '#fbbf24' : '#94a3b8');
      }
    });

    if (this.jadeBalanceText) {
      this.jadeBalanceText.setText(`${this.jadeBalance} JADE`);
    }
    this._syncDebugState();
  }

  _applySkinPreview() {
    const skin = getTrailSkin(this.selectedTrail);
    if (this.leftWheel) this.leftWheel.setTint(skin.wheelTint);
    if (this.rightWheel) this.rightWheel.setTint(skin.wheelTint);
  }

  _handleTrailTap(skin) {
    if (this.leaderboardContainer) return;
    const isUnlocked = this.unlockedTrails.includes(skin.id);

    if (isUnlocked) {
      if (this.selectedTrail !== skin.id) {
        this.selectedTrail = skin.id;
        try { synthAudio.playClick(); } catch (_) {}
        this._applySkinPreview();
        this._refreshTrailCards();
        this.trailFeedbackText.setText(`EQUIPPED: ${skin.name}`).setColor('#fde047');
        try {
          platformBridge.saveCloudProgress({ selectedTrail: this.selectedTrail }).catch(() => {});
        } catch (_) {}
      } else {
        try { synthAudio.playClick(); } catch (_) {}
      }
      return;
    }

    // 尝试用 Spirit Jade 永久解锁皮肤
    if (this.jadeBalance >= skin.cost) {
      this.jadeBalance -= skin.cost;
      this.unlockedTrails = Array.from(new Set([...this.unlockedTrails, skin.id]));
      this.selectedTrail = skin.id;

      try {
        synthAudio.playSkinUnlock();
      } catch (_) {}

      try {
        platformBridge.trackEvent('skin_unlock', {
          skin_id: skin.id,
          skin_name: skin.name,
          cost_jade: skin.cost,
          remaining_jade: this.jadeBalance
        });
        platformBridge.saveCloudProgress({
          coins: this.jadeBalance,
          unlockedTrails: this.unlockedTrails,
          selectedTrail: this.selectedTrail
        }).catch(() => {});
      } catch (_) {}

      this._applySkinPreview();
      this._refreshTrailCards();
      this.trailFeedbackText.setText(`UNLOCKED ${skin.name}!`).setColor('#34d399');
      this._showFloatingTip(GAME_DESIGN.width / 2, 360, `UNLOCKED ${skin.name}!`, '#fde047');
    } else {
      const missing = skin.cost - this.jadeBalance;
      try { synthAudio.playTone(180, 120, 0.12, 'triangle', 0.1); } catch (_) {}
      this.trailFeedbackText.setText(`NEED ${missing} MORE JADE`).setColor('#f87171');
      const card = this.trailCardMap[skin.id];
      if (card) {
        this.tweens.add({
          targets: card.bg,
          x: card.bg.x + 6,
          duration: 45,
          yoyo: true,
          repeat: 2
        });
      }
    }
  }

  _showFloatingTip(x, y, text, color) {
    const tip = this.add.text(x, y, text, {
      fontSize: '18px',
      fontStyle: 'bold',
      color,
      stroke: '#090714',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: tip,
      y: y - 34,
      alpha: 0,
      duration: 850,
      onComplete: () => tip.destroy()
    });
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const { width, height } = GAME_DESIGN;

    // 背景流光粒子滚动
    for (const m of this.motesBg) {
      m.y += m.speedY * dt;
      if (m.y > height + 4) {
        m.y = -4;
        m.x = Phaser.Math.Between(0, width);
      }
    }

    // 脚下双风火轮实时旋转
    if (this.leftWheel && this.rightWheel) {
      this.leftWheel.angle += 420 * dt;
      this.rightWheel.angle -= 420 * dt;
    }

    // 主界面实时预览所选 TRAILS 流光拖尾
    this.trailEmitTimer += delta;
    if (this.trailEmitTimer >= 42 && this.heroContainer) {
      this.trailEmitTimer = 0;
      const skin = getTrailSkin(this.selectedTrail);
      const side = Math.random() > 0.5 ? -18 : 18;
      const p = this.add.image(
        this.heroContainer.x + side + Phaser.Math.Between(-6, 6),
        this.heroContainer.y + 44,
        'spark'
      ).setDepth(4);
      p.setTint(Math.random() > 0.45 ? skin.primaryHex : skin.secondaryHex);
      p.setScale(Phaser.Math.FloatBetween(0.45, 0.9));
      p.setAlpha(0.85);
      p.vx = Phaser.Math.FloatBetween(-16, 16);
      p.vy = Phaser.Math.FloatBetween(55, 110);
      p.life = 0;
      p.maxLife = 420;
      this.trailParticles.push(p);
    }

    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life += delta;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.setAlpha(Math.max(0, ratio * 0.85));
      p.setScale(Math.max(0.05, ratio * 0.8));
      if (p.life >= p.maxLife) {
        p.destroy();
        this.trailParticles.splice(i, 1);
      }
    }
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
    this.soundBtn.label.setText(next ? 'SFX ON' : 'SFX OFF');
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
      score: 0,
      runJade: 0,
      revived: false,
      trailId: this.selectedTrail
    });
  }

  async _openLeaderboardModal() {
    if (this.leaderboardContainer) return;
    const { width, height } = GAME_DESIGN;

    const container = this.add.container(0, 0).setDepth(50);
    this.leaderboardContainer = container;
    this._syncDebugState();

    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const panel = this.add.rectangle(width / 2, height / 2, 464, 620, 0x140e24, 0.98);
    panel.setStrokeStyle(2, 0xf59e0b, 0.9);

    const header = this.add.text(width / 2, height / 2 - 264, 'GLOBAL TOP 10', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#fbbf24',
      letterSpacing: 2
    }).setOrigin(0.5);

    const loadingText = this.add.text(width / 2, height / 2, 'SYNCING LEADERBOARD...', {
      fontSize: '16px',
      color: '#a78bfa'
    }).setOrigin(0.5);

    const closeHit = new Phaser.Geom.Rectangle(-14, -14, 248, 80);
    const closeBtnBg = this.add.rectangle(width / 2, height / 2 + 258, 220, 52, 0xdc2626)
      .setInteractive({ hitArea: closeHit, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    closeBtnBg.setStrokeStyle(2, 0xfbbf24, 0.85);
    const closeBtnTxt = this.add.text(width / 2, height / 2 + 258, 'CLOSE', {
      fontSize: '19px',
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
      res.source === 'supabase' ? 'LIVE GLOBAL RANKINGS' : 'LOCAL RANKING (CLOUD SYNC READY)',
      { fontSize: '12px', color: '#94a3b8', letterSpacing: 1 }
    ).setOrigin(0.5);
    container.add(subTip);

    if (!res.entries || !res.entries.length) {
      const empty = this.add.text(width / 2, height / 2, 'NO SCORES YET. CLAIM #1!', {
        fontSize: '18px',
        color: '#cbd5e1'
      }).setOrigin(0.5);
      container.add(empty);
      return;
    }

    res.entries.slice(0, 10).forEach((item, idx) => {
      const y = height / 2 - 182 + idx * 40;
      const rowColor = item.isSelf ? '#34d399' : (idx < 3 ? '#fbbf24' : '#e2e8f0');
      const rankBadge = `#${item.rank}`;
      const rowText = this.add.text(
        width / 2 - 196,
        y,
        `${rankBadge}  ${String(item.nickname).slice(0, 12)}${item.isSelf ? ' (YOU)' : ''}`,
        { fontSize: '16px', color: rowColor, fontStyle: item.isSelf ? 'bold' : 'normal' }
      ).setOrigin(0, 0.5);
      const scoreText = this.add.text(
        width / 2 + 196,
        y,
        `${item.score} PTS`,
        { fontSize: '16px', color: rowColor, fontStyle: 'bold' }
      ).setOrigin(1, 0.5);
      container.add([rowText, scoreText]);
    });
  }

  _createButton(x, y, w, h, text, bgColor, textColor, fontSize, onClick, hitPad = 12, strokeColor = 0xfbbf24) {
    const bg = this.add.rectangle(x, y, w, h, bgColor, 1).setDepth(10);
    bg.setStrokeStyle(2, strokeColor, 0.78);
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
