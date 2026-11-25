import Phaser from 'phaser';
import { GAME_DESIGN, getTrailSkin } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 《Celestial Rush》核心街机玩法场景（全英文 UI + 东方玄幻高爽感机制）：
 * - 单指按住左右跟手滑动（完整保留 iPhone Retina 坐标映射）+ 电脑键盘（←/→、A/D、P 暂停、M 静音）
 * - 随分数平滑提速、动态低频战鼓 + 五声音阶古风升调拨弦
 * - 擦身而过（Near-Miss）金色飘字 "+50 NEAR MISS!" 与火花反馈
 * - 10 连击自动触发 5 秒无敌疾驰（FEVER MODE），直接撞碎青铜雷纹阵/陨星并触发微震 + 顿帧反馈
 * - 护体金钟（Shield）+ 吸宝灵符（Magnet）+ 流光拖尾皮肤（TRAILS）实时呈现
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    const save = platformBridge.getLocalSave();
    this.score = Math.max(0, Math.round(Number(data?.score || 0)));
    this.runJade = Math.max(0, Math.round(Number(data?.runJade || 0)));
    this.revived = Boolean(data?.revived);
    this.trailSkin = getTrailSkin(data?.trailId || save.selectedTrail);

    this.combo = Math.max(0, Number(data?.combo || 0));
    this.feverStreak = Math.max(0, Number(data?.feverStreak || 0));
    this.nearMissCount = Math.max(0, Number(data?.nearMissCount || 0));
    this.feverCount = Math.max(0, Number(data?.feverCount || 0));
    this.elapsedMs = Math.max(0, Number(data?.elapsedMs || 0));

    // 复活自带护体金钟 + 2.4 秒无敌清屏保护
    this.hasShield = this.revived;
    this.invulnerableUntil = this.revived ? 2400 : 0;
    this.magnetRemainingMs = 0;
    this.isFever = false;
    this.feverRemainingMs = 0;
    this.hitStopMs = 0;

    this.isPaused = false;
    this.isEnded = false;
    this.pointerTargetX = null;

    this.motesBg = [];
    this.speedLines = [];
    this.fxParticles = [];
    this.collectSpawnAcc = 0;
    this.obstacleSpawnAcc = 0;
    this.trailEmitAcc = 0;
    this.distScoreAcc = 0;
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#090714');
    try {
      this.scale?.updateBounds?.();
    } catch (_) {}

    // 玄夜流云与星尘背景
    this.motesBg = [];
    for (let i = 0; i < 60; i++) {
      const isGold = i % 3 === 0;
      const m = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.FloatBetween(1.1, 2.5),
        isGold ? 0xfbbf24 : 0x818cf8,
        Phaser.Math.FloatBetween(0.18, 0.72)
      );
      m.baseSpeed = Phaser.Math.FloatBetween(95, 240);
      this.motesBg.push(m);
    }

    // 狂热模式高速流线（默认隐藏）
    this.speedLines = [];
    for (let i = 0; i < 14; i++) {
      const line = this.add.rectangle(
        Phaser.Math.Between(16, width - 16),
        Phaser.Math.Between(0, height),
        2.5,
        Phaser.Math.Between(55, 120),
        0xfbbf24,
        0
      ).setDepth(3);
      line.speed = Phaser.Math.Between(780, 1180);
      this.speedLines.push(line);
    }

    // Fever 屏幕金红光框
    this.feverFrame = this.add.rectangle(width / 2, height / 2, width - 8, height - 8, 0x000000, 0).setDepth(18);
    this.feverFrame.setStrokeStyle(6, 0xf97316, 0);

    // 玩家双风火轮（独立渲染于角色脚下，高速旋转并按皮肤配色染色）
    this.leftWheel = this.add.image(width / 2 - 16, height - 118, 'windFireWheel').setScale(0.78).setDepth(7);
    this.rightWheel = this.add.image(width / 2 + 16, height - 118, 'windFireWheel').setScale(0.78).setDepth(7);
    this.leftWheel.setTint(this.trailSkin.wheelTint);
    this.rightWheel.setTint(this.trailSkin.wheelTint);

    // 玩家行者实体（物理碰撞盒偏紧以优化手感和擦身判定）
    this.player = this.physics.add.sprite(width / 2, height - 154, 'walker').setDepth(9);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(34, 48);
    this.player.body.setOffset(23, 22);

    // 吸宝灵符外环（青金灵光）
    this.magnetRing = this.add.circle(this.player.x, this.player.y, 58, 0x38bdf8, 0.08).setDepth(6);
    this.magnetRing.setStrokeStyle(2.2, 0x67e8f9, 0.85);
    this.magnetRing.setVisible(false);

    // 护体金钟护罩（金色禅钟光环）
    this.shieldRing = this.add.circle(this.player.x, this.player.y, 48, 0xfbbf24, 0.14).setDepth(10);
    this.shieldRing.setStrokeStyle(3, 0xfef08a, 0.92);
    this.shieldRing.setVisible(this.hasShield || this.invulnerableUntil > 0);

    // Fever 烈焰光环
    this.feverAura = this.add.circle(this.player.x, this.player.y, 56, 0xf97316, 0.2).setDepth(8);
    this.feverAura.setStrokeStyle(3.5, 0xfef08a, 0.95);
    this.feverAura.setVisible(false);

    // 物理分组
    this.collectibles = this.physics.add.group();
    this.obstacles = this.physics.add.group();

    this.physics.add.overlap(this.player, this.collectibles, this._onCollect, null, this);
    this.physics.add.overlap(this.player, this.obstacles, this._onHitObstacle, null, this);

    // 顶部 HUD（全英文）
    this._createHud();

    // 输入：键盘（左右 / A、D / P / ESC / M）+ 手机单指按住滑动
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.keyA = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.input.keyboard?.on('keydown-P', () => this._togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this._togglePause());
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());

    // 保留高可靠 pointerdown / pointermove 滑动跟手控制逻辑（与 iPhone Retina 坐标 1:1 对齐）
    this.input.on('pointerdown', (pointer) => {
      if (pointer.y > 108 && !this.isPaused && !this.isEnded) {
        try { synthAudio.ensureContext(); } catch (_) {}
        this.pointerTargetX = Phaser.Math.Clamp(pointer.x, 38, width - 38);
      }
    });
    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown && pointer.y > 108 && !this.isPaused && !this.isEnded) {
        this.pointerTargetX = Phaser.Math.Clamp(pointer.x, 38, width - 38);
      }
    });
    this.input.on('pointerup', () => {
      this.pointerTargetX = null;
    });

    // 通知门户 SDK 与 GA4（上报 game_start）
    try {
      platformBridge.gameplayStart({
        trail_id: this.trailSkin.id,
        revived: this.revived ? 1 : 0
      });
    } catch (_) {}

    // 启动低频战鼓节奏
    try {
      synthAudio.setDrumIntensity(0, false);
      synthAudio.startWarDrums();
    } catch (_) {}

    if (this.revived) {
      try { synthAudio.playRevive(); } catch (_) {}
      this._showFloatingText(width / 2, height / 2 - 48, 'REVIVED! GOLDEN BELL ACTIVE', '#fde047', '22px');
    }

    // 场景退出时务必停止战鼓循环，防止残留
    this.events.once('shutdown', () => {
      try { synthAudio.stopWarDrums(); } catch (_) {}
    });

    this._updateHud();
  }

  _createHud() {
    const { width } = GAME_DESIGN;
    const hudBg = this.add.rectangle(width / 2, 52, width, 104, 0x110b22, 0.92).setDepth(20);
    hudBg.setStrokeStyle(1.5, 0x5b3b1e, 0.9);

    // 左侧：分数与本局灵玉
    this.scoreText = this.add.text(18, 14, `SCORE ${this.score}`, {
      fontSize: '23px',
      fontStyle: 'bold',
      color: '#fbbf24'
    }).setDepth(21);

    this.add.image(28, 55, 'spiritJade').setScale(0.45).setDepth(21);
    this.jadeHudText = this.add.text(44, 46, `${this.runJade} JADE`, {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#6ee7b7'
    }).setDepth(21);

    this.statusLineText = this.add.text(18, 74, 'COMBO ×0', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#c4b5fd'
    }).setDepth(21);

    // 中间：10 连击狂热能量槽（FEVER BAR）
    this.feverLabel = this.add.text(width / 2 + 22, 22, 'FEVER 0/10', {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#fdba74',
      letterSpacing: 1
    }).setOrigin(0.5).setDepth(21);

    const barBg = this.add.rectangle(width / 2 + 22, 46, 154, 14, 0x261a3d).setDepth(21);
    barBg.setStrokeStyle(1.2, 0x78350f, 0.9);
    this.feverBar = this.add.rectangle(width / 2 - 55, 46, 0, 12, 0xf97316).setOrigin(0, 0.5).setDepth(22);

    this.buffLabel = this.add.text(width / 2 + 22, 74, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#67e8f9'
    }).setOrigin(0.5).setDepth(21);

    // 右上角静音与暂停按钮（宽松矩形触控热区）
    const soundHitBg = this.add.rectangle(width - 96, 48, 46, 46, 0x1e1435, 0.9)
      .setStrokeStyle(1.5, 0xf59e0b, 0.7)
      .setDepth(22)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-10, -10, 66, 66),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true
      });
    this.hudSoundBtn = this.add.text(width - 96, 48, synthAudio.enabled ? 'SFX' : 'MUTE', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: synthAudio.enabled ? '#fde68a' : '#94a3b8'
    }).setOrigin(0.5).setDepth(23);
    soundHitBg.on('pointerdown', () => this._toggleSound());

    const pauseHitBg = this.add.rectangle(width - 38, 48, 46, 46, 0x1e1435, 0.9)
      .setStrokeStyle(1.5, 0xf59e0b, 0.7)
      .setDepth(22)
      .setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-10, -10, 66, 66),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true
      });
    this.hudPauseBtn = this.add.text(width - 38, 48, 'II', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#fde68a'
    }).setOrigin(0.5).setDepth(23);
    pauseHitBg.on('pointerdown', () => this._togglePause());
  }

  _updateHud() {
    this.scoreText.setText(`SCORE ${this.score}`);
    this.jadeHudText.setText(`${this.runJade} JADE`);
    this.statusLineText.setText(
      this.isFever ? 'FEVER MODE ACTIVE!' : `COMBO ×${this.combo}`
    );
    this.statusLineText.setColor(this.isFever ? '#fde047' : '#c4b5fd');

    if (this.isFever) {
      const sec = Math.max(0, this.feverRemainingMs / 1000).toFixed(1);
      this.feverLabel.setText(`FEVER ${sec}s`).setColor('#fde047');
      const ratio = Phaser.Math.Clamp(this.feverRemainingMs / 5000, 0, 1);
      this.feverBar.width = Math.round(154 * ratio);
      this.feverBar.setFillStyle(0xfef08a);
    } else {
      this.feverLabel.setText(`FEVER ${this.feverStreak}/10`).setColor('#fdba74');
      const ratio = Phaser.Math.Clamp(this.feverStreak / 10, 0, 1);
      this.feverBar.width = Math.round(154 * ratio);
      this.feverBar.setFillStyle(0xf97316);
    }

    const buffs = [];
    if (this.hasShield) buffs.push('SHIELD');
    if (this.magnetRemainingMs > 0) buffs.push(`MAGNET ${Math.ceil(this.magnetRemainingMs / 1000)}s`);
    this.buffLabel.setText(buffs.join(' · '));

    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'GameScene';
      window.__GAME_STATE__.score = this.score;
      window.__GAME_STATE__.runJade = this.runJade;
      window.__GAME_STATE__.combo = this.combo;
      window.__GAME_STATE__.feverActive = this.isFever;
      window.__GAME_STATE__.nearMissCount = this.nearMissCount;
      window.__GAME_STATE__.playerX = Math.round(this.player?.x || GAME_DESIGN.width / 2);
      window.__GAME_STATE__.soundEnabled = synthAudio.enabled;
      window.__GAME_STATE__.revived = this.revived;
    }
  }

  _getSpeedFactor() {
    // 随分数平滑加快节奏（1.0x -> 2.85x）
    const base = 1 + Math.min(1.85, this.score / 2600);
    return this.isFever ? base * 1.38 : base;
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
    this.hudSoundBtn.setText(next ? 'SFX' : 'MUTE');
    this.hudSoundBtn.setColor(next ? '#fde68a' : '#94a3b8');
    this._updateHud();
    try {
      platformBridge.saveCloudProgress({ soundEnabled: next }).catch(() => {});
    } catch (_) {}
  }

  _togglePause() {
    if (this.isEnded) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.physics.world.pause();
      try { synthAudio.stopWarDrums(); } catch (_) {}
      try { platformBridge.gameplayStop(); } catch (_) {}
      this._showPauseOverlay();
    } else {
      this._hidePauseOverlay();
      this.physics.world.resume();
      try { synthAudio.startWarDrums(); } catch (_) {}
      try { platformBridge.gameplayStart({ resume: 1 }); } catch (_) {}
    }
  }

  _showPauseOverlay() {
    const { width, height } = GAME_DESIGN;
    this.pauseOverlay = this.add.container(0, 0).setDepth(40);
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const box = this.add.rectangle(width / 2, height / 2, 348, 256, 0x140e24, 0.97);
    box.setStrokeStyle(2, 0xf59e0b, 0.9);
    const txt = this.add.text(width / 2, height / 2 - 76, 'PAUSED', {
      fontSize: '30px',
      fontStyle: 'bold',
      color: '#fbbf24',
      letterSpacing: 3
    }).setOrigin(0.5);

    const resumeHit = new Phaser.Geom.Rectangle(-12, -12, 248, 76);
    const resumeBg = this.add.rectangle(width / 2, height / 2, 224, 52, 0xdc2626)
      .setStrokeStyle(2, 0xfbbf24, 0.85)
      .setInteractive({ hitArea: resumeHit, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const resumeTxt = this.add.text(width / 2, height / 2, 'RESUME', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    resumeBg.on('pointerdown', () => this._togglePause());

    const menuHit = new Phaser.Geom.Rectangle(-12, -12, 248, 72);
    const menuBg = this.add.rectangle(width / 2, height / 2 + 74, 224, 48, 0x1e1435)
      .setStrokeStyle(1.5, 0x78350f, 0.9)
      .setInteractive({ hitArea: menuHit, hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const menuTxt = this.add.text(width / 2, height / 2 + 74, 'MAIN MENU', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#cbd5e1'
    }).setOrigin(0.5);
    menuBg.on('pointerdown', () => {
      try { synthAudio.stopWarDrums(); } catch (_) {}
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
    const { width } = GAME_DESIGN;
    const speedFactor = this._getSpeedFactor();
    const x = Phaser.Math.Between(44, width - 44);
    const roll = Math.random();
    let texture = 'spiritJade';
    let itemType = 'jade';
    if (roll > 0.92 && !this.hasShield) {
      texture = 'goldenBell';
      itemType = 'shield';
    } else if (roll > 0.84 && this.magnetRemainingMs <= 0) {
      texture = 'magnetTalisman';
      itemType = 'magnet';
    }

    const item = this.collectibles.create(x, 108, texture).setDepth(7);
    item.setData('itemType', itemType);
    item.setVelocityY((220 + Phaser.Math.Between(0, 55)) * speedFactor);
    item.setAngularVelocity(itemType === 'jade' ? Phaser.Math.Between(-75, 75) : Phaser.Math.Between(-35, 35));
  }

  _spawnObstacle() {
    const { width } = GAME_DESIGN;
    const speedFactor = this._getSpeedFactor();
    const x = Phaser.Math.Between(46, width - 46);
    const isBronze = Math.random() > 0.45;
    const texture = isBronze ? 'bronzeArray' : 'celestialMeteor';

    const obs = this.obstacles.create(x, 108, texture).setDepth(8);
    const scale = Phaser.Math.FloatBetween(0.86, 1.16);
    obs.setScale(scale);
    obs.setData('obstacleKind', isBronze ? 'bronze' : 'meteor');
    obs.setData('nearMissed', false);

    if (isBronze) {
      obs.body.setCircle(22, 12, 12);
      obs.setVelocityY((255 + Phaser.Math.Between(0, 65)) * speedFactor);
      obs.setVelocityX(Phaser.Math.Between(-36, 36) * Math.min(1.6, speedFactor));
      obs.setAngularVelocity(Phaser.Math.Between(140, 240) * (Math.random() > 0.5 ? 1 : -1));
    } else {
      obs.body.setCircle(20, 10, 10);
      obs.setVelocityY((290 + Phaser.Math.Between(0, 80)) * speedFactor);
      obs.setVelocityX(Phaser.Math.Between(-58, 58) * Math.min(1.6, speedFactor));
      obs.setAngularVelocity(Phaser.Math.Between(-190, 190));
    }
  }

  _onCollect(_player, item) {
    if (this.isEnded || !item.active) return;
    const type = item.getData('itemType');
    const ix = item.x;
    const iy = item.y;
    item.destroy();

    if (type === 'shield') {
      this.hasShield = true;
      try { synthAudio.playShield(); } catch (_) {}
      this._spawnBurst(ix, iy, 10, 0xfef08a, 'spark');
      this._showFloatingText(ix, iy, 'GOLDEN BELL!', '#fde047', '20px');
    } else if (type === 'magnet') {
      this.magnetRemainingMs = 7000;
      try { synthAudio.playMagnet(); } catch (_) {}
      this._spawnBurst(ix, iy, 10, 0x67e8f9, 'spark');
      this._showFloatingText(ix, iy, 'MAGNET 7S!', '#67e8f9', '20px');
    } else {
      // 发光金玉（Spirit Jade）：五声音阶连击升调 + 累计 10 连击触发 FEVER MODE
      this.combo += 1;
      this.runJade += 1;
      const mult = 1 + Math.min(1.5, (this.combo - 1) * 0.12);
      const gain = Math.round(20 * mult * (this.isFever ? 1.5 : 1));
      this.score += gain;

      try { synthAudio.playCollect(this.combo); } catch (_) {}
      this._spawnBurst(ix, iy, 7, 0x34d399, 'spark');
      this._showFloatingText(ix, iy, `+${gain}`, '#6ee7b7', '19px');

      if (!this.isFever) {
        this.feverStreak += 1;
        if (this.feverStreak >= 10) {
          this._triggerFeverMode();
        }
      }
    }

    this._updateHud();
  }

  _triggerFeverMode() {
    this.isFever = true;
    this.feverRemainingMs = 5000;
    this.feverStreak = 0;
    this.feverCount += 1;

    try { synthAudio.playFeverStart(); } catch (_) {}
    this.cameras.main.shake(180, 0.01);
    this._spawnBurst(this.player.x, this.player.y, 18, 0xfbbf24, 'spark');
    this._showFloatingText(GAME_DESIGN.width / 2, 230, 'FEVER MODE! SMASH ALL!', '#fde047', '28px');

    try {
      platformBridge.trackEvent('fever_trigger', {
        score: this.score,
        combo: this.combo,
        fever_count: this.feverCount
      });
    } catch (_) {}
  }

  _onHitObstacle(_player, obstacle) {
    if (this.isEnded || !obstacle.active) return;
    const ox = obstacle.x;
    const oy = obstacle.y;
    const kind = obstacle.getData('obstacleKind');
    obstacle.destroy();

    // 狂热模式：直接撞碎沿途障碍 + 屏幕微震 + 顿帧反馈
    if (this.isFever) {
      this.score += 80;
      this.hitStopMs = 42;
      try { synthAudio.playSmash(); } catch (_) {}
      this.cameras.main.shake(115, 0.009);
      this._spawnBurst(ox, oy, 14, kind === 'bronze' ? 0x2dd4bf : 0xf97316, 'shard');
      this._showFloatingText(ox, oy - 14, '+80 SMASH!', '#fde047', '22px');
      this._updateHud();
      return;
    }

    if (this.invulnerableUntil > 0) return;

    // 护体金钟抵挡一次撞击
    if (this.hasShield) {
      this.hasShield = false;
      this.invulnerableUntil = 1400;
      try { synthAudio.playBellBlock(); } catch (_) {}
      this.cameras.main.shake(150, 0.01);
      this._spawnBurst(ox, oy, 12, 0xfef08a, 'shard');
      this._showFloatingText(this.player.x, this.player.y - 42, 'BELL SHIELD BLOCKED!', '#fde047', '21px');
      this._updateHud();
      return;
    }

    // 致命撞击 -> 结束本局
    try { synthAudio.playHit(); } catch (_) {}
    this.cameras.main.shake(240, 0.016);
    this._spawnBurst(this.player.x, this.player.y, 18, 0xef4444, 'shard');
    this._finishRound();
  }

  _finishRound() {
    this.isEnded = true;
    this.physics.world.pause();
    try { synthAudio.stopWarDrums(); } catch (_) {}
    try { platformBridge.gameplayStop(); } catch (_) {}

    const durationSec = Math.max(1, Math.round(this.elapsedMs / 1000));
    try {
      platformBridge.trackEvent('game_over', {
        score: this.score,
        run_jade: this.runJade,
        near_misses: this.nearMissCount,
        fever_count: this.feverCount,
        duration_sec: durationSec,
        revived: this.revived ? 1 : 0,
        trail_id: this.trailSkin.id
      });
    } catch (_) {}

    this.time.delayedCall(280, () => {
      this.scene.start('ResultScene', {
        score: this.score,
        runJade: this.runJade,
        nearMissCount: this.nearMissCount,
        feverCount: this.feverCount,
        combo: this.combo,
        feverStreak: this.feverStreak,
        durationSec,
        elapsedMs: this.elapsedMs,
        revived: this.revived,
        trailId: this.trailSkin.id
      });
    });
  }

  _spawnBurst(x, y, count, tint, texture = 'spark') {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x, y, texture).setDepth(14);
      p.setTint(tint);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.FloatBetween(95, 290);
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.spin = Phaser.Math.FloatBetween(-360, 360);
      p.life = 0;
      p.maxLife = Phaser.Math.Between(260, 460);
      p.baseScale = Phaser.Math.FloatBetween(0.55, 1.05);
      p.setScale(p.baseScale);
      this.fxParticles.push(p);
    }
  }

  _showFloatingText(x, y, text, color, fontSize = '20px') {
    const label = this.add.text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color,
      stroke: '#090714',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(30);
    label.setScale(0.75);
    this.tweens.add({
      targets: label,
      scaleX: 1.08,
      scaleY: 1.08,
      duration: 110,
      yoyo: true
    });
    this.tweens.add({
      targets: label,
      y: y - 54,
      alpha: 0,
      duration: 720,
      onComplete: () => label.destroy()
    });
  }

  update(_time, delta) {
    if (this.isPaused || this.isEnded) return;

    // 顿帧打击反馈（Hit-Stop）：Fever 撞碎障碍物时短暂停滞 42ms
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - delta);
      if (this.hitStopMs > 0) {
        if (!this.physics.world.isPaused) this.physics.world.pause();
        return;
      }
      if (this.physics.world.isPaused) this.physics.world.resume();
    }

    const dt = delta / 1000;
    const { width, height } = GAME_DESIGN;
    this.elapsedMs += delta;

    const speedFactor = this._getSpeedFactor();
    // 同步动态低频战鼓节奏强度
    try {
      synthAudio.setDrumIntensity(Math.min(1, (speedFactor - 1) / 1.8), this.isFever);
    } catch (_) {}

    // 距离得分平滑累加
    this.distScoreAcc += delta;
    if (this.distScoreAcc >= 240) {
      this.distScoreAcc = 0;
      this.score += this.isFever ? 5 : 2;
      this._updateHud();
    }

    // 狂热模式倒计时
    if (this.isFever) {
      this.feverRemainingMs = Math.max(0, this.feverRemainingMs - delta);
      this.feverFrame.setStrokeStyle(6, 0xf97316, 0.55 + Math.sin(this.elapsedMs * 0.02) * 0.3);
      if (this.feverRemainingMs <= 0) {
        this.isFever = false;
        this.invulnerableUntil = 950;
        this.feverFrame.setStrokeStyle(6, 0xf97316, 0);
        this._showFloatingText(width / 2, 240, 'FEVER ENDED', '#fdba74', '18px');
      }
      this._updateHud();
    }

    // 吸宝灵符倒计时
    if (this.magnetRemainingMs > 0) {
      this.magnetRemainingMs = Math.max(0, this.magnetRemainingMs - delta);
      this._updateHud();
    }

    // 星空流云与 Fever 高速流线滚动
    for (const m of this.motesBg) {
      m.y += m.baseSpeed * speedFactor * dt;
      if (m.y > height + 4) {
        m.y = -4;
        m.x = Phaser.Math.Between(0, width);
      }
    }
    for (const line of this.speedLines) {
      line.setAlpha(this.isFever ? 0.35 : 0);
      if (this.isFever) {
        line.y += line.speed * dt;
        if (line.y > height + 80) {
          line.y = -80;
          line.x = Phaser.Math.Between(16, width - 16);
        }
      }
    }

    // 键盘与单指按住滑动双模式操控
    const keyMoveSpeed = 480;
    let vx = 0;
    if (this.cursors?.left?.isDown || this.keyA?.isDown) {
      vx = -keyMoveSpeed;
      this.pointerTargetX = null;
    } else if (this.cursors?.right?.isDown || this.keyD?.isDown) {
      vx = keyMoveSpeed;
      this.pointerTargetX = null;
    } else if (this.pointerTargetX !== null) {
      const diff = this.pointerTargetX - this.player.x;
      if (Math.abs(diff) > 3) {
        vx = Phaser.Math.Clamp(diff * 18, -760, 760);
      }
    }
    this.player.setVelocityX(vx);
    this.player.setAngle(Phaser.Math.Clamp(vx * 0.03, -17, 17));

    // 双风火轮跟随脚底高速旋转
    const wheelScale = this.isFever ? 0.96 : 0.78;
    this.leftWheel.setPosition(this.player.x - 16, this.player.y + 36).setScale(wheelScale);
    this.rightWheel.setPosition(this.player.x + 16, this.player.y + 36).setScale(wheelScale);
    const wheelSpin = (this.isFever ? 980 : 540) * dt;
    this.leftWheel.angle += wheelSpin;
    this.rightWheel.angle -= wheelSpin;

    // 实时发射当前装备 TRAILS 皮肤的流光拖尾
    this.trailEmitAcc += delta;
    const emitInterval = this.isFever ? 18 : 30;
    if (this.trailEmitAcc >= emitInterval) {
      this.trailEmitAcc = 0;
      const side = Math.random() > 0.5 ? -16 : 16;
      const p = this.add.image(
        this.player.x + side + Phaser.Math.Between(-5, 5),
        this.player.y + 42,
        'spark'
      ).setDepth(5);
      const tint = this.isFever
        ? (Math.random() > 0.4 ? 0xfef08a : 0xef4444)
        : (Math.random() > 0.45 ? this.trailSkin.primaryHex : this.trailSkin.secondaryHex);
      p.setTint(tint);
      p.vx = -vx * 0.08 + Phaser.Math.FloatBetween(-22, 22);
      p.vy = Phaser.Math.FloatBetween(120, 210) * speedFactor;
      p.spin = 0;
      p.life = 0;
      p.maxLife = this.isFever ? 380 : 300;
      p.baseScale = this.isFever ? Phaser.Math.FloatBetween(0.75, 1.25) : Phaser.Math.FloatBetween(0.45, 0.9);
      p.setScale(p.baseScale);
      this.fxParticles.push(p);
    }

    // 更新全部粒子（拖尾、火花、碎片）
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += delta;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.angle += p.spin * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.setAlpha(Math.max(0, ratio));
      p.setScale(Math.max(0.05, ratio * p.baseScale));
      if (p.life >= p.maxLife) {
        p.destroy();
        this.fxParticles.splice(i, 1);
      }
    }

    // 护体金钟 / 无敌闪烁 / 吸宝灵符 / Fever 光环跟随
    if (this.invulnerableUntil > 0) {
      this.invulnerableUntil = Math.max(0, this.invulnerableUntil - delta);
      this.player.setAlpha(Math.sin(this.elapsedMs * 0.03) > 0 ? 1 : 0.45);
    } else {
      this.player.setAlpha(1);
    }
    this.shieldRing.setPosition(this.player.x, this.player.y);
    this.shieldRing.setVisible(this.hasShield || this.invulnerableUntil > 0);
    this.magnetRing.setPosition(this.player.x, this.player.y);
    this.magnetRing.setVisible(this.magnetRemainingMs > 0);
    if (this.magnetRemainingMs > 0) {
      this.magnetRing.setScale(0.95 + Math.sin(this.elapsedMs * 0.015) * 0.12);
    }
    this.feverAura.setPosition(this.player.x, this.player.y);
    this.feverAura.setVisible(this.isFever);
    if (this.isFever) {
      this.feverAura.setScale(1.0 + Math.sin(this.elapsedMs * 0.025) * 0.14);
    }

    // 自适应生成节奏（随分数平滑提速）
    const collectInterval = Math.max(320, 680 / Math.sqrt(speedFactor));
    const obstacleInterval = Math.max(300, 820 / Math.pow(speedFactor, 0.72));
    this.collectSpawnAcc += delta;
    this.obstacleSpawnAcc += delta;
    if (this.collectSpawnAcc >= collectInterval) {
      this.collectSpawnAcc = 0;
      this._spawnCollectible();
    }
    if (this.obstacleSpawnAcc >= obstacleInterval) {
      this.obstacleSpawnAcc = 0;
      this._spawnObstacle();
    }

    // 收集物遍历：吸宝灵符磁吸 + 越界回收（严格使用 Phaser 4 兼容的 getChildren().slice()）
    const collectiblesList = this.collectibles.getChildren().slice();
    for (const obj of collectiblesList) {
      if (!obj || !obj.active) continue;
      if (this.magnetRemainingMs > 0 && obj.getData('itemType') === 'jade') {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, obj.x, obj.y);
        if (dist < 250) {
          const angle = Phaser.Math.Angle.Between(obj.x, obj.y, this.player.x, this.player.y);
          obj.setVelocity(Math.cos(angle) * 640, Math.sin(angle) * 640);
        }
      }
      if (obj.y > height + 50) {
        if (obj.getData('itemType') === 'jade' && !this.isFever) {
          this.combo = 0;
          this.feverStreak = 0;
          this._updateHud();
        }
        obj.destroy();
      }
    }

    // 障碍物遍历：擦身而过（Near-Miss）实时判定 + 越界回收
    const obstaclesList = this.obstacles.getChildren().slice();
    for (const obj of obstaclesList) {
      if (!obj || !obj.active) continue;

      if (!this.isFever && this.invulnerableUntil <= 0 && !obj.getData('nearMissed')) {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, obj.x, obj.y);
        // 贴近障碍物边缘闪避（距离 < 82px 且正在擦过玩家身体高度）
        if (dist < 82 && obj.y >= this.player.y - 22 && obj.y <= this.player.y + 42) {
          obj.setData('nearMissed', true);
          this.nearMissCount += 1;
          this.score += 50;
          try { synthAudio.playNearMiss(); } catch (_) {}
          const midX = (this.player.x + obj.x) / 2;
          const midY = (this.player.y + obj.y) / 2;
          this._spawnBurst(midX, midY, 10, 0xfef08a, 'spark');
          this._showFloatingText(this.player.x, this.player.y - 54, '+50 NEAR MISS!', '#fde047', '22px');
          try {
            platformBridge.trackEvent('near_miss', {
              score: this.score,
              near_miss_count: this.nearMissCount
            });
          } catch (_) {}
          this._updateHud();
        }
      }

      if (obj.y > height + 65 || obj.x < -70 || obj.x > width + 70) {
        obj.destroy();
      }
    }

    // 同步玩家实时坐标至只读状态快照（供手机滑动验收测试验证）
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.playerX = Math.round(this.player.x);
    }
  }
}
