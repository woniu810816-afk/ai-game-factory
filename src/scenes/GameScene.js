import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 核心玩法场景：《星际冲刺》
 * - 手机竖屏触控拖动/左右分屏点击 + 电脑键盘（方向键 / A / D / P 暂停 / M 静音）
 * - 关卡进度条递进、连击倍率、护盾道具、广告复活无缝续玩
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.level = Math.max(1, Number(data?.level || 1));
    this.score = Math.max(0, Number(data?.score || 0));
    this.levelStartScore = this.score;
    this.revived = Boolean(data?.revived);
    this.targetScore = this.levelStartScore + 180 + this.level * 95;
    this.combo = 1;
    this.hasShield = this.revived; // 广告复活自带初始护盾
    this.invulnerableUntil = this.revived ? 2200 : 0;
    this.elapsedMs = Math.max(0, Number(data?.elapsedMs || 0));
    this.isPaused = false;
    this.isEnded = false;
    this.pointerTargetX = null;
    this.starsBg = [];
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#070b1a');

    // 背景星空
    this.starsBg = [];
    for (let i = 0; i < 75; i++) {
      const s = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.FloatBetween(1, 2.5),
        0xffffff,
        Phaser.Math.FloatBetween(0.2, 0.85)
      );
      s.speedY = Phaser.Math.FloatBetween(80, 220) + this.level * 12;
      this.starsBg.push(s);
    }

    // 玩家飞船
    this.player = this.physics.add.sprite(width / 2, height - 155, 'ship');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(34, 38);

    // 护盾视觉光环
    this.shieldRing = this.add.circle(this.player.x, this.player.y, 44, 0xa855f7, 0.16);
    this.shieldRing.setStrokeStyle(3, 0xc084fc, 0.9);
    this.shieldRing.setVisible(this.hasShield || this.invulnerableUntil > 0);

    // 物理分组
    this.collectibles = this.physics.add.group();
    this.obstacles = this.physics.add.group();

    this.physics.add.overlap(this.player, this.collectibles, this._onCollect, null, this);
    this.physics.add.overlap(this.player, this.obstacles, this._onHitObstacle, null, this);

    // 顶部 HUD
    this._createHud();

    // 输入：键盘 + 手机触控
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keyA = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard?.on('keydown-P', () => this._togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this._togglePause());
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());

    this.input.on('pointerdown', (pointer) => {
      if (pointer.y > 105 && !this.isPaused && !this.isEnded) {
        this.pointerTargetX = Phaser.Math.Clamp(pointer.x, 36, width - 36);
      }
    });
    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown && pointer.y > 105 && !this.isPaused && !this.isEnded) {
        this.pointerTargetX = Phaser.Math.Clamp(pointer.x, 36, width - 36);
      }
    });
    this.input.on('pointerup', () => {
      this.pointerTargetX = null;
    });

    // 定时生成器（随关卡平滑递增节奏）
    const starDelay = Math.max(420, 820 - this.level * 28);
    const meteorDelay = Math.max(380, 960 - this.level * 45);

    this.starTimer = this.time.addEvent({
      delay: starDelay,
      callback: () => this._spawnCollectible(),
      loop: true
    });
    this.meteorTimer = this.time.addEvent({
      delay: meteorDelay,
      callback: () => this._spawnObstacle(),
      loop: true
    });

    // 通知门户 SDK：玩法正式开始
    platformBridge.gameplayStart({ level: this.level, revived: this.revived ? 1 : 0 });

    if (this.revived) {
      synthAudio.playRevive();
      this._showFloatingText(width / 2, height / 2 - 40, '⚡ 已复活！护盾生效', '#a855f7');
    }
  }

  _createHud() {
    const { width } = GAME_DESIGN;
    const hudBg = this.add.rectangle(width / 2, 50, width, 100, 0x0b1229, 0.88).setDepth(20);
    hudBg.setStrokeStyle(1, 0x1e293b, 1);

    this.levelText = this.add.text(20, 18, `第 ${this.level} 关`, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#38bdf8'
    }).setDepth(21);

    this.scoreText = this.add.text(20, 44, `分数：${this.score}`, {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#facc15'
    }).setDepth(21);

    this.comboText = this.add.text(20, 72, '连击 ×1', {
      fontSize: '14px',
      color: '#94a3b8'
    }).setDepth(21);

    // 关卡目标进度条
    this.add.text(width / 2 + 12, 22, '本关进度', { fontSize: '13px', color: '#94a3b8' }).setOrigin(0.5).setDepth(21);
    this.add.rectangle(width / 2 + 12, 46, 170, 14, 0x1e293b).setDepth(21);
    this.progressBar = this.add.rectangle(width / 2 - 73, 46, 0, 14, 0x22c55e).setOrigin(0, 0.5).setDepth(22);
    this.progressLabel = this.add.text(width / 2 + 12, 68, `${this.score} / ${this.targetScore}`, {
      fontSize: '13px',
      color: '#cbd5e1'
    }).setOrigin(0.5).setDepth(21);

    // 音效与暂停快捷按钮
    this.hudSoundBtn = this.add.text(width - 94, 48, synthAudio.enabled ? '🔊' : '🔇', {
      fontSize: '24px'
    }).setOrigin(0.5).setDepth(22).setInteractive({ useHandCursor: true });
    this.hudSoundBtn.on('pointerdown', () => this._toggleSound());

    this.hudPauseBtn = this.add.text(width - 40, 48, '⏸', {
      fontSize: '24px'
    }).setOrigin(0.5).setDepth(22).setInteractive({ useHandCursor: true });
    this.hudPauseBtn.on('pointerdown', () => this._togglePause());

    this._updateHud();
  }

  _updateHud() {
    this.scoreText.setText(`分数：${this.score}`);
    this.comboText.setText(`连击 ×${this.combo}${this.hasShield ? ' · 🛡️ 护盾就绪' : ''}`);
    const span = Math.max(1, this.targetScore - this.levelStartScore);
    const ratio = Phaser.Math.Clamp((this.score - this.levelStartScore) / span, 0, 1);
    this.progressBar.width = Math.round(170 * ratio);
    this.progressLabel.setText(`${this.score} / ${this.targetScore}`);
  }

  _toggleSound() {
    const next = !synthAudio.enabled;
    synthAudio.setEnabled(next);
    if (next) synthAudio.playClick();
    this.hudSoundBtn.setText(next ? '🔊' : '🔇');
    platformBridge.saveCloudProgress({ soundEnabled: next });
  }

  _togglePause() {
    if (this.isEnded) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.world.pause();
      this.starTimer.paused = true;
      this.meteorTimer.paused = true;
      platformBridge.gameplayStop();
      this._showPauseOverlay();
    } else {
      this._hidePauseOverlay();
      this.physics.world.resume();
      this.starTimer.paused = false;
      this.meteorTimer.paused = false;
      platformBridge.gameplayStart({ level: this.level, resume: 1 });
    }
  }

  _showPauseOverlay() {
    const { width, height } = GAME_DESIGN;
    this.pauseOverlay = this.add.container(0, 0).setDepth(40);
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.65).setInteractive();
    const box = this.add.rectangle(width / 2, height / 2, 340, 250, 0x0f172a, 0.96);
    box.setStrokeStyle(2, 0x38bdf8, 0.8);
    const txt = this.add.text(width / 2, height / 2 - 75, '游戏已暂停', {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#f8fafc'
    }).setOrigin(0.5);

    const resumeBg = this.add.rectangle(width / 2, height / 2, 220, 50, 0x0ea5e9).setInteractive({ useHandCursor: true });
    const resumeTxt = this.add.text(width / 2, height / 2, '继续冲刺', { fontSize: '20px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
    resumeBg.on('pointerdown', () => this._togglePause());

    const menuBg = this.add.rectangle(width / 2, height / 2 + 72, 220, 46, 0x1e293b).setInteractive({ useHandCursor: true });
    const menuTxt = this.add.text(width / 2, height / 2 + 72, '返回主菜单', { fontSize: '18px', color: '#cbd5e1' }).setOrigin(0.5);
    menuBg.on('pointerdown', () => {
      this.scene.start('MenuScene', { save: platformBridge.getLocalSave() });
    });

    this.pauseOverlay.add([dim, box, txt, resumeBg, resumeTxt, menuBg, menuTxt]);
  }

  _hidePauseOverlay() {
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = null;
    }
  }

  _spawnCollectible() {
    if (this.isPaused || this.isEnded) return;
    const { width } = GAME_DESIGN;
    const x = Phaser.Math.Between(42, width - 42);
    const roll = Math.random();
    let texture = 'star';
    let itemType = 'star';
    if (roll > 0.9) {
      texture = 'shieldItem';
      itemType = 'shield';
    } else if (roll > 0.72) {
      texture = 'goldStar';
      itemType = 'gold';
    }
    const item = this.collectibles.create(x, 108, texture);
    item.setData('itemType', itemType);
    item.setVelocityY(210 + this.level * 18 + Phaser.Math.Between(0, 60));
    item.setAngularVelocity(Phaser.Math.Between(-90, 90));
  }

  _spawnObstacle() {
    if (this.isPaused || this.isEnded) return;
    const { width } = GAME_DESIGN;
    const x = Phaser.Math.Between(42, width - 42);
    const meteor = this.obstacles.create(x, 108, 'meteor');
    const scale = Phaser.Math.FloatBetween(0.82, 1.2);
    meteor.setScale(scale);
    meteor.body.setCircle(18, 10, 10);
    meteor.setVelocityY(260 + this.level * 26 + Phaser.Math.Between(0, 85));
    meteor.setVelocityX(Phaser.Math.Between(-35 - this.level * 4, 35 + this.level * 4));
    meteor.setAngularVelocity(Phaser.Math.Between(-150, 150));
  }

  _onCollect(_player, item) {
    if (this.isEnded || !item.active) return;
    const type = item.getData('itemType');
    const ix = item.x;
    const iy = item.y;
    item.destroy();

    if (type === 'shield') {
      this.hasShield = true;
      synthAudio.playShield();
      this._showFloatingText(ix, iy, '🛡️ 护盾+1', '#c084fc');
    } else {
      const base = type === 'gold' ? 35 : 12;
      const gain = Math.round(base * (1 + (this.combo - 1) * 0.15));
      this.score += gain;
      this.combo = Math.min(8, this.combo + 1);
      if (type === 'gold') synthAudio.playBonus();
      else synthAudio.playCollect(this.combo);
      this._showFloatingText(ix, iy, `+${gain}`, type === 'gold' ? '#facc15' : '#38bdf8');
    }

    this._updateHud();

    // 达成关卡目标分数 -> 过关！
    if (this.score >= this.targetScore) {
      this._finishRound(true);
    }
  }

  _onHitObstacle(_player, obstacle) {
    if (this.isEnded || !obstacle.active) return;
    obstacle.destroy();

    if (this.invulnerableUntil > 0) return;

    if (this.hasShield) {
      this.hasShield = false;
      this.invulnerableUntil = 1200;
      this.combo = 1;
      synthAudio.playHit();
      this.cameras.main.shake(140, 0.008);
      this._showFloatingText(this.player.x, this.player.y - 35, '🛡️ 护盾抵挡！', '#c084fc');
      this._updateHud();
      return;
    }

    synthAudio.playHit();
    this.cameras.main.shake(220, 0.015);
    this._finishRound(false);
  }

  _finishRound(won) {
    this.isEnded = true;
    this.physics.world.pause();
    this.starTimer.remove(false);
    this.meteorTimer.remove(false);
    platformBridge.gameplayStop();

    const durationSec = Math.max(1, Math.round(this.elapsedMs / 1000));
    if (won) {
      synthAudio.playLevelClear();
      platformBridge.happyTime();
      platformBridge.trackEvent('level_complete', {
        level: this.level,
        score: this.score,
        duration_sec: durationSec,
        revived: this.revived ? 1 : 0
      });
    } else {
      platformBridge.trackEvent('level_fail', {
        level: this.level,
        score: this.score,
        duration_sec: durationSec,
        revived: this.revived ? 1 : 0
      });
    }

    this.time.delayedCall(260, () => {
      this.scene.start('ResultScene', {
        won,
        level: this.level,
        score: this.score,
        durationSec,
        elapsedMs: this.elapsedMs,
        revived: this.revived
      });
    });
  }

  _showFloatingText(x, y, text, color) {
    const label = this.add.text(x, y, text, {
      fontSize: '20px',
      fontStyle: 'bold',
      color
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      duration: 620,
      onComplete: () => label.destroy()
    });
  }

  update(_time, delta) {
    if (this.isPaused || this.isEnded) return;
    const dt = delta / 1000;
    const { width, height } = GAME_DESIGN;
    this.elapsedMs += delta;

    // 星空滚动
    for (const s of this.starsBg) {
      s.y += s.speedY * dt;
      if (s.y > height + 4) {
        s.y = -4;
        s.x = Phaser.Math.Between(0, width);
      }
    }

    // 键盘与触控双模式操控
    const moveSpeed = 430;
    let vx = 0;
    if (this.cursors?.left?.isDown || this.keyA?.isDown) {
      vx = -moveSpeed;
      this.pointerTargetX = null;
    } else if (this.cursors?.right?.isDown || this.keyD?.isDown) {
      vx = moveSpeed;
      this.pointerTargetX = null;
    } else if (this.pointerTargetX !== null) {
      const diff = this.pointerTargetX - this.player.x;
      if (Math.abs(diff) > 4) {
        vx = Phaser.Math.Clamp(diff * 12, -560, 560);
      }
    }
    this.player.setVelocityX(vx);
    this.player.setAngle(Phaser.Math.Clamp(vx * 0.035, -16, 16));

    // 无敌计时与护盾光环跟随
    if (this.invulnerableUntil > 0) {
      this.invulnerableUntil = Math.max(0, this.invulnerableUntil - delta);
      this.player.setAlpha(Math.sin(this.elapsedMs * 0.03) > 0 ? 1 : 0.45);
    } else {
      this.player.setAlpha(1);
    }
    this.shieldRing.setPosition(this.player.x, this.player.y);
    this.shieldRing.setVisible(this.hasShield || this.invulnerableUntil > 0);

    // 回收越界物体，保持 60FPS 零内存泄漏
    this.collectibles.children.each((obj) => {
      if (obj.y > height + 50) {
        if (obj.getData('itemType') !== 'shield') this.combo = 1;
        obj.destroy();
      }
      return true;
    });
    this.obstacles.children.each((obj) => {
      if (obj.y > height + 60 || obj.x < -60 || obj.x > width + 60) {
        obj.destroy();
      }
      return true;
    });
  }
}
