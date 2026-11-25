import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 结算场景：内置激励视频触发点（失败复活 / 通关双倍积分）、
 * 自然停顿插屏广告点、云存档自动同步与新加坡 Supabase 榜单提交。
 */
export class ResultScene extends Phaser.Scene {
  constructor() {
    super('ResultScene');
  }

  init(data) {
    this.won = Boolean(data?.won);
    this.level = Math.max(1, Number(data?.level || 1));
    this.score = Math.max(0, Number(data?.score || 0));
    this.durationSec = Math.max(1, Number(data?.durationSec || 1));
    this.elapsedMs = Math.max(0, Number(data?.elapsedMs || 0));
    this.revived = Boolean(data?.revived);
    this.doubleClaimed = false;
    this.busy = false;
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#070b1a');

    // 结算主卡片
    const card = this.add.rectangle(width / 2, height / 2 - 20, 456, 700, 0x0f172a, 0.96);
    card.setStrokeStyle(2, this.won ? 0x22c55e : 0xf43f5e, 0.85);

    this.add.text(width / 2, 165, this.won ? `🎉 第 ${this.level} 关通关！` : '💥 飞船受损', {
      fontSize: '36px',
      fontStyle: 'bold',
      color: this.won ? '#22c55e' : '#f43f5e'
    }).setOrigin(0.5);

    this.add.text(width / 2, 224, `本局用时 ${this.durationSec} 秒`, {
      fontSize: '16px',
      color: '#94a3b8'
    }).setOrigin(0.5);

    this.add.text(width / 2, 272, '本局得分', { fontSize: '15px', color: '#64748b' }).setOrigin(0.5);
    this.scoreValueText = this.add.text(width / 2, 322, String(this.score), {
      fontSize: '54px',
      fontStyle: 'bold',
      color: '#facc15'
    }).setOrigin(0.5);

    this.syncStatusText = this.add.text(width / 2, 376, '正在同步云存档与全球排名...', {
      fontSize: '14px',
      color: '#64748b'
    }).setOrigin(0.5);

    // 激励视频触发点：
    // - 失败且未复活过：看广告立即复活（继承当前分数 + 护盾）
    // - 通关且未翻倍：看广告双倍积分（×2）
    if (!this.won && !this.revived) {
      this.rewardBtn = this._createButton(
        width / 2,
        452,
        360,
        62,
        '📺 看广告立即复活（附护盾）',
        0xa855f7,
        '#ffffff',
        '20px',
        () => this._handleRevive()
      );
    } else if (this.won && !this.doubleClaimed) {
      this.rewardBtn = this._createButton(
        width / 2,
        452,
        360,
        62,
        '📺 看广告双倍积分（×2）',
        0xd97706,
        '#ffffff',
        '21px',
        () => this._handleDoubleScore()
      );
    }

    // 主流程按钮（触发自然停顿插屏广告）
    const nextLevel = Math.min(platformBridge.config.maxLevels, this.level + 1);
    const primaryLabel = this.won
      ? (this.level < platformBridge.config.maxLevels ? `🚀 挑战第 ${nextLevel} 关` : '🏆 再战巅峰关卡')
      : '🔄 重新挑战本关';

    this._createButton(width / 2, 536, 360, 58, primaryLabel, 0x0ea5e9, '#ffffff', '22px', async () => {
      if (this.busy) return;
      this.busy = true;
      await platformBridge.showCommercialBreak(this.won ? 'next_level' : 'retry');
      this.scene.start('GameScene', {
        level: this.won ? nextLevel : this.level,
        score: 0,
        revived: false
      });
    });

    this._createButton(width / 2, 610, 360, 48, '🏠 返回主菜单', 0x1e293b, '#cbd5e1', '18px', () => {
      if (this.busy) return;
      this.scene.start('MenuScene', { save: platformBridge.getLocalSave() });
    });

    // 紧凑版 TOP 3 榜单预览
    this.rankTitle = this.add.text(width / 2, 675, '全球榜单速览', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#38bdf8'
    }).setOrigin(0.5);
    this.rankListText = this.add.text(width / 2, 740, '加载中...', {
      fontSize: '15px',
      color: '#cbd5e1',
      align: 'center',
      lineSpacing: 8
    }).setOrigin(0.5);

    this._persistAndRefreshRank();
  }

  async _persistAndRefreshRank() {
    const curSave = platformBridge.getLocalSave();
    const nextMaxLevel = this.won
      ? Math.min(platformBridge.config.maxLevels, Math.max(curSave.maxLevel, this.level + 1))
      : curSave.maxLevel;
    const nextBest = Math.max(curSave.bestScore, this.score);

    await platformBridge.saveCloudProgress({
      maxLevel: nextMaxLevel,
      bestScore: nextBest,
      coins: (curSave.coins || 0) + Math.floor(this.score / 10)
    });

    const submitRes = await platformBridge.submitScore({
      score: this.score,
      levelReached: this.level,
      durationSec: this.durationSec,
      revived: this.revived,
      doubleClaimed: this.doubleClaimed
    });

    if (!this.scene.isActive()) return;

    if (submitRes.offline) {
      this.syncStatusText.setText('本机存档已更新（配置 Supabase 后自动上传全球榜）');
    } else if (submitRes.ok) {
      this.syncStatusText.setText(submitRes.flagged ? '成绩已记录（进入异常分速复核队列）' : '☁️ 存档与全球排行榜同步成功');
    } else {
      this.syncStatusText.setText(`本地已保存（云端提示：${submitRes.error || '离线'}）`);
    }

    const lb = await platformBridge.fetchLeaderboard(3);
    if (!this.scene.isActive()) return;
    const lines = lb.entries.map((e) => `#${e.rank} ${e.nickname}  ${e.score}分`);
    this.rankListText.setText(lines.length ? lines.join('\n') : '暂无上榜数据');
  }

  async _handleRevive() {
    if (this.busy) return;
    this.busy = true;
    const res = await platformBridge.showRewardedBreak('revive');
    this.busy = false;
    if (res.granted) {
      this.scene.start('GameScene', {
        level: this.level,
        score: this.score,
        elapsedMs: this.elapsedMs,
        revived: true
      });
    } else {
      this.syncStatusText.setText('未完整观看激励广告，无法复活');
    }
  }

  async _handleDoubleScore() {
    if (this.busy || this.doubleClaimed) return;
    this.busy = true;
    const res = await platformBridge.showRewardedBreak('double_score');
    this.busy = false;
    if (res.granted) {
      this.doubleClaimed = true;
      this.score = this.score * 2;
      this.scoreValueText.setText(`${this.score} (×2)`);
      synthAudio.playBonus();
      if (this.rewardBtn) {
        this.rewardBtn.bg.setFillStyle(0x334155);
        this.rewardBtn.bg.disableInteractive();
        this.rewardBtn.label.setText('✅ 双倍积分已发放');
      }
      await this._persistAndRefreshRank();
    } else {
      this.syncStatusText.setText('激励广告未完成，暂未发放双倍积分');
    }
  }

  _createButton(x, y, w, h, text, bgColor, textColor, fontSize, onClick) {
    const bg = this.add.rectangle(x, y, w, h, bgColor, 1).setInteractive({ useHandCursor: true });
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
