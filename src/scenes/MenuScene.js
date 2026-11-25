import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 主菜单场景：支持关卡选择、音效开关、全球排行榜弹窗与一键开局
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    this.starsBg = [];
    this.leaderboardContainer = null;
  }

  init(data) {
    this.saveData = data?.save || platformBridge.getLocalSave();
    this.selectedLevel = Math.min(
      platformBridge.config.maxLevels,
      Math.max(1, Number(this.saveData.maxLevel || 1))
    );
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#070b1a');
    platformBridge.gameplayStop();

    // 视差星空背景
    this.starsBg = [];
    for (let i = 0; i < 65; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        Phaser.Math.FloatBetween(1, 2.6),
        0xffffff,
        Phaser.Math.FloatBetween(0.25, 0.85)
      );
      star.speedY = Phaser.Math.FloatBetween(22, 85);
      this.starsBg.push(star);
    }

    // 渠道标识与右上角音效开关
    const platformLabelMap = {
      poki: 'POKI 渠道',
      crazygames: 'CRAZYGAMES 渠道',
      telegram: 'TELEGRAM MINI APP',
      standalone: 'SERVERLESS 独立版'
    };
    this.add.text(24, 26, platformLabelMap[platformBridge.platform] || 'HTML5 母版', {
      fontSize: '13px',
      color: '#64748b',
      fontStyle: 'bold'
    });

    this.soundBtn = this._createButton(
      width - 84,
      36,
      128,
      38,
      synthAudio.enabled ? '🔊 音效开' : '🔇 音效关',
      0x1e293b,
      '#e2e8f0',
      '15px',
      () => this._toggleSound()
    );

    // 标题与副标题
    this.add.text(width / 2, 155, '星 际 冲 刺', {
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#38bdf8',
      stroke: '#0c4a6e',
      strokeThickness: 6
    }).setOrigin(0.5);

    this.add.text(width / 2, 212, 'STAR DASH · HTML5 休闲母版', {
      fontSize: '17px',
      color: '#94a3b8',
      letterSpacing: 2
    }).setOrigin(0.5);

    // 飞船悬浮展示
    const heroShip = this.add.image(width / 2, 330, 'ship').setScale(1.65);
    this.tweens.add({
      targets: heroShip,
      y: 314,
      duration: 1200,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    // 玩家进度统计卡片
    const cardBg = this.add.rectangle(width / 2, 468, 436, 134, 0x0f172a, 0.92);
    cardBg.setStrokeStyle(2, 0x1e3a5f, 0.9);

    this.add.text(width / 2, 424, `飞行员：${this.saveData.nickname || platformBridge.nickname}`, {
      fontSize: '18px',
      color: '#cbd5e1'
    }).setOrigin(0.5);

    this.add.text(width / 2 - 110, 472, '历史最高分', { fontSize: '14px', color: '#64748b' }).setOrigin(0.5);
    this.add.text(width / 2 - 110, 502, String(this.saveData.bestScore || 0), {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#facc15'
    }).setOrigin(0.5);

    this.add.text(width / 2 + 110, 472, '已解锁关卡', { fontSize: '14px', color: '#64748b' }).setOrigin(0.5);
    this.add.text(width / 2 + 110, 502, `第 ${this.saveData.maxLevel || 1} 关`, {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#38bdf8'
    }).setOrigin(0.5);

    // 关卡选择器
    this.levelLabel = this.add.text(width / 2, 580, `挑战关卡：第 ${this.selectedLevel} 关`, {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#f8fafc'
    }).setOrigin(0.5);

    this._createButton(width / 2 - 140, 580, 52, 40, '◀', 0x1e293b, '#38bdf8', '20px', () => {
      if (this.selectedLevel > 1) {
        this.selectedLevel--;
        this.levelLabel.setText(`挑战关卡：第 ${this.selectedLevel} 关`);
      }
    });

    this._createButton(width / 2 + 140, 580, 52, 40, '▶', 0x1e293b, '#38bdf8', '20px', () => {
      const maxUnlocked = Math.min(platformBridge.config.maxLevels, Math.max(1, Number(this.saveData.maxLevel || 1)));
      if (this.selectedLevel < maxUnlocked) {
        this.selectedLevel++;
        this.levelLabel.setText(`挑战关卡：第 ${this.selectedLevel} 关`);
      }
    });

    // 主按钮：开始游戏
    this._createButton(width / 2, 675, 340, 68, '🚀 开始冲刺', 0x0ea5e9, '#ffffff', '26px', () => {
      this._startGame();
    });

    // 次按钮：全球排行榜
    this._createButton(width / 2, 764, 340, 54, '🏆 全球排行榜', 0x1e293b, '#facc15', '20px', () => {
      this._openLeaderboardModal();
    });

    // 操控说明
    this.add.text(width / 2, 855, '手机：手指按住拖动或点左右半屏移动\n电脑：方向键 ← / → 或 A / D，空格快速开局', {
      fontSize: '15px',
      color: '#64748b',
      align: 'center',
      lineSpacing: 8
    }).setOrigin(0.5);

    // 键盘快捷开局
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.leaderboardContainer) this._startGame();
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.leaderboardContainer) this._startGame();
    });
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());
  }

  update(_time, delta) {
    const dt = delta / 1000;
    const { width, height } = GAME_DESIGN;
    for (const s of this.starsBg) {
      s.y += s.speedY * dt;
      if (s.y > height + 4) {
        s.y = -4;
        s.x = Phaser.Math.Between(0, width);
      }
    }
  }

  _toggleSound() {
    const next = !synthAudio.enabled;
    synthAudio.setEnabled(next);
    if (next) synthAudio.playClick();
    this.soundBtn.label.setText(next ? '🔊 音效开' : '🔇 音效关');
    platformBridge.saveCloudProgress({ soundEnabled: next });
  }

  _startGame() {
    synthAudio.ensureContext();
    synthAudio.playClick();
    this.scene.start('GameScene', {
      level: this.selectedLevel,
      score: 0,
      revived: false
    });
  }

  async _openLeaderboardModal() {
    if (this.leaderboardContainer) return;
    synthAudio.playClick();
    const { width, height } = GAME_DESIGN;

    const container = this.add.container(0, 0).setDepth(50);
    this.leaderboardContainer = container;

    const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.72).setInteractive();
    const panel = this.add.rectangle(width / 2, height / 2, 460, 620, 0x0f172a, 0.98);
    panel.setStrokeStyle(2, 0x38bdf8, 0.8);

    const header = this.add.text(width / 2, height / 2 - 265, '🏆 全球排行榜 TOP 10', {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#facc15'
    }).setOrigin(0.5);

    const loadingText = this.add.text(width / 2, height / 2, '正在连接新加坡 Supabase 榜单...', {
      fontSize: '17px',
      color: '#94a3b8'
    }).setOrigin(0.5);

    const closeBtnBg = this.add.rectangle(width / 2, height / 2 + 258, 220, 48, 0x0ea5e9).setInteractive({ useHandCursor: true });
    const closeBtnTxt = this.add.text(width / 2, height / 2 + 258, '关闭', {
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);
    closeBtnBg.on('pointerdown', () => {
      synthAudio.playClick();
      container.destroy();
      this.leaderboardContainer = null;
    });

    container.add([mask, panel, header, loadingText, closeBtnBg, closeBtnTxt]);

    const res = await platformBridge.fetchLeaderboard(10);
    if (!this.leaderboardContainer) return;
    loadingText.destroy();

    const subTip = this.add.text(
      width / 2,
      height / 2 - 230,
      res.source === 'supabase' ? '数据来源：新加坡 Supabase（已开启 RLS 防刷分）' : '当前为本机离线榜单（配置 Supabase 后自动同步全球排名）',
      { fontSize: '12px', color: '#64748b' }
    ).setOrigin(0.5);
    container.add(subTip);

    if (!res.entries.length) {
      const empty = this.add.text(width / 2, height / 2, '暂无上榜成绩，快去挑战吧！', {
        fontSize: '18px',
        color: '#94a3b8'
      }).setOrigin(0.5);
      container.add(empty);
      return;
    }

    res.entries.slice(0, 10).forEach((item, idx) => {
      const y = height / 2 - 185 + idx * 41;
      const rowColor = item.isSelf ? '#38bdf8' : (idx < 3 ? '#facc15' : '#e2e8f0');
      const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${item.rank}`;
      const rowText = this.add.text(
        width / 2 - 195,
        y,
        `${rankBadge}  ${String(item.nickname).slice(0, 10)}${item.isSelf ? ' (我)' : ''}`,
        { fontSize: '17px', color: rowColor, fontStyle: item.isSelf ? 'bold' : 'normal' }
      ).setOrigin(0, 0.5);
      const scoreText = this.add.text(
        width / 2 + 195,
        y,
        `${item.score} 分 · Lv.${item.level_reached}`,
        { fontSize: '16px', color: rowColor, fontStyle: 'bold' }
      ).setOrigin(1, 0.5);
      container.add([rowText, scoreText]);
    });
  }

  _createButton(x, y, w, h, text, bgColor, textColor, fontSize, onClick) {
    const bg = this.add.rectangle(x, y, w, h, bgColor, 1).setInteractive({ useHandCursor: true });
    bg.setStrokeStyle(2, 0x38bdf8, 0.45);
    const label = this.add.text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color: textColor
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setAlpha(0.88));
    bg.on('pointerout', () => bg.setAlpha(1));
    bg.on('pointerdown', () => {
      synthAudio.playClick();
      onClick();
    });
    return { bg, label };
  }
}
