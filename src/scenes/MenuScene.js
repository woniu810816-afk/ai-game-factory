import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 《INVESTITURE: Relic Forge》V1.0 核心玩法 MVP 主界面
 * 极简干净、零多余系统：顶部 EN / 中 切换与 SFX 开关、哪吒全封闭战盔背影、
 * 火/金/水三属性一目了然图解、大号 PLAY 按钮秒进 8 列同步回合制战场。
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    this.embers = [];
  }

  init(data) {
    this.saveData = data?.save || platformBridge.getLocalSave();
  }

  _syncState() {
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      const w = GAME_DESIGN.width;
      window.__GAME_STATE__.scene = 'MenuScene';
      window.__GAME_STATE__.lang = i18n.lang;
      window.__GAME_STATE__.soundEnabled = synthAudio.enabled;
      window.__GAME_STATE__.buttons = {
        lang: { x: 368, y: 38 },
        sound: { x: 468, y: 38 },
        start: { x: w / 2, y: 726 }
      };
    }
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#0b0a0f');
    try { this.scale?.updateBounds?.(); } catch (_) {}

    // 柔和青铜金屑背景
    this.embers = [];
    for (let i = 0; i < 42; i++) {
      const e = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.FloatBetween(1.1, 2.3),
        i % 3 === 0 ? 0x22d3ee : 0xd99b38,
        Phaser.Math.FloatBetween(0.16, 0.52)
      );
      e.speedY = Phaser.Math.FloatBetween(16, 48);
      this.embers.push(e);
    }

    // 顶部右侧：EN / 中 与 SFX 静音开关
    this.langBtn = this._createButton(
      368, 38, 86, 40,
      i18n.t('langBtn'),
      0x1a1512, '#22d3ee', '14px',
      () => {
        i18n.toggle();
        this._refreshText();
      },
      10, 0x22d3ee
    );

    this.soundBtn = this._createButton(
      468, 38, 94, 40,
      synthAudio.enabled ? i18n.t('sfxOn') : i18n.t('sfxOff'),
      0x1a1512, '#fde68a', '13px',
      () => this._toggleSound(),
      10, 0xd99b38
    );

    // 标题区
    this.titleMain = this.add.text(width / 2, 120, '', {
      fontSize: '46px',
      fontStyle: 'bold',
      color: '#eab308',
      stroke: '#3b1d0a',
      strokeThickness: 7
    }).setOrigin(0.5);

    this.titleSub = this.add.text(width / 2, 166, '', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#f59e0b',
      letterSpacing: 5
    }).setOrigin(0.5);

    this.mvpTag = this.add.text(width / 2, 200, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#a8a29e',
      letterSpacing: 1.5
    }).setOrigin(0.5);

    // 商周青铜八卦祭坛 + 哪吒全封闭战盔背影剪影
    this.baguaHalo = this.add.image(width / 2, 326, 'baguaRing').setScale(0.95).setAlpha(0.75);
    this.hero = this.add.image(width / 2, 322, 'hero_nezha').setScale(1.36);
    this.tweens.add({
      targets: this.hero,
      y: 312,
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // 火 / 金 / 水 三属性极简图解卡片
    const cardBg = this.add.rectangle(width / 2, 526, 444, 184, 0x161214, 0.94);
    cardBg.setStrokeStyle(2, 0x78350f, 0.9);

    this.add.image(116, 472, 'tile_fire').setScale(0.78);
    this.ruleFlame = this.add.text(154, 472, '', { fontSize: '16px', fontStyle: 'bold', color: '#f87171' }).setOrigin(0, 0.5);

    this.add.image(116, 526, 'tile_thunder').setScale(0.78);
    this.ruleThunder = this.add.text(154, 526, '', { fontSize: '16px', fontStyle: 'bold', color: '#fde047' }).setOrigin(0, 0.5);

    this.add.image(116, 580, 'tile_tide').setScale(0.78);
    this.ruleTide = this.add.text(154, 580, '', { fontSize: '16px', fontStyle: 'bold', color: '#22d3ee' }).setOrigin(0, 0.5);

    // 历史最高战功
    this.bestScoreText = this.add.text(width / 2, 650, '', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#fde047'
    }).setOrigin(0.5);

    // 大号开局按钮
    this.startBtn = this._createButton(
      width / 2, 726, 356, 74,
      '', 0xb91c1c, '#fffbeb', '28px',
      () => this._startGame(),
      14, 0xeab308
    );

    // 核心规则提示
    this.menuHint = this.add.text(width / 2, 832, '', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#a8a29e',
      align: 'center',
      lineSpacing: 8
    }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-SPACE', () => this._startGame());
    this.input.keyboard?.on('keydown-ENTER', () => this._startGame());
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());

    this._refreshText();
  }

  _refreshText() {
    this.titleMain.setText(i18n.t('titleMain'));
    this.titleSub.setText(i18n.t('titleSub'));
    this.mvpTag.setText(i18n.t('mvpTag'));
    this.langBtn.label.setText(i18n.t('langBtn'));
    this.soundBtn.label.setText(synthAudio.enabled ? i18n.t('sfxOn') : i18n.t('sfxOff'));
    this.ruleFlame.setText(i18n.t('ruleFlame'));
    this.ruleThunder.setText(i18n.t('ruleThunder'));
    this.ruleTide.setText(i18n.t('ruleTide'));
    this.bestScoreText.setText(i18n.t('bestScore', this.saveData.bestScore || 0));
    this.startBtn.label.setText(i18n.t('playBtn'));
    this.menuHint.setText(i18n.t('menuHint'));
    this._syncState();
  }

  _toggleSound() {
    const next = !synthAudio.enabled;
    try {
      synthAudio.setEnabled(next);
      if (next) { synthAudio.ensureContext(); synthAudio.playClick(); }
    } catch (_) {}
    this.soundBtn.label.setText(next ? i18n.t('sfxOn') : i18n.t('sfxOff'));
    try { platformBridge.saveLocal({ soundEnabled: next }); } catch (_) {}
    this._syncState();
  }

  _startGame() {
    try { synthAudio.ensureContext(); synthAudio.playClick(); } catch (_) {}
    this.scene.start('GameScene');
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const { width, height } = GAME_DESIGN;
    if (this.baguaHalo) this.baguaHalo.angle += 14 * dt;
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
    bg.setStrokeStyle(2, strokeColor, 0.88);
    bg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-hitPad, -hitPad, w + hitPad * 2, h + hitPad * 2),
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
      this.time.delayedCall(80, () => { if (bg.active) bg.setAlpha(1); });
      try { synthAudio.ensureContext(); synthAudio.playClick(); } catch (_) {}
      try { onClick(); } catch (err) { console.error('按钮交互异常：', err); }
    });
    return { bg, label };
  }
}
