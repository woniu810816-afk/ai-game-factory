import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 启动场景：程序化生成高清矢量纹理（零外部图片依赖，极速首屏加载）
 * 并完成 Poki / CrazyGames / Telegram SDK、GA4 与新加坡 Supabase 云存档初始化。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#070b1a');

    const title = this.add.text(width / 2, height / 2 - 40, '星际冲刺', {
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#38bdf8'
    }).setOrigin(0.5);

    const statusText = this.add.text(width / 2, height / 2 + 24, '正在初始化引擎与云端存档...', {
      fontSize: '18px',
      color: '#94a3b8'
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      alpha: 0.6,
      duration: 650,
      yoyo: true,
      repeat: -1
    });

    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'BootScene';
    }

    this._generateProceduralTextures();

    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, ms))
    ]);

    const enterMenu = (save) => {
      const safeSave = save || platformBridge.getLocalSave();
      try {
        synthAudio.setEnabled(safeSave.soundEnabled !== false);
      } catch (_) {}
      try {
        platformBridge.loadingFinished();
      } catch (_) {}
      try {
        this.scale?.updateBounds?.();
      } catch (_) {}
      statusText.setText('加载完成！');
      this.time.delayedCall(120, () => {
        this.scene.start('MenuScene', { save: safeSave });
      });
    };

    Promise.resolve()
      .then(() => withTimeout(platformBridge.init().catch(() => {}), 1200))
      .then(() => withTimeout(platformBridge.loadCloudSave().catch(() => platformBridge.getLocalSave()), 1200))
      .then((save) => enterMenu(save))
      .catch(() => enterMenu(platformBridge.getLocalSave()));
  }

  _generateProceduralTextures() {
    // 1. 玩家能量飞船纹理
    if (!this.textures.exists('ship')) {
      const g = this.add.graphics();
      // 尾焰光晕
      g.fillStyle(0x38bdf8, 0.35);
      g.fillTriangle(32, 62, 22, 46, 42, 46);
      // 飞船机翼
      g.fillStyle(0x0ea5e9, 1);
      g.fillTriangle(32, 6, 8, 52, 56, 52);
      // 核心机身
      g.fillStyle(0xe0f2fe, 1);
      g.fillTriangle(32, 12, 20, 48, 44, 48);
      // 驾驶舱高光
      g.fillStyle(0x38bdf8, 1);
      g.fillCircle(32, 32, 6);
      g.generateTexture('ship', 64, 64);
      g.destroy();
    }

    // 2. 能量星晶（普通收集物）
    if (!this.textures.exists('star')) {
      const g = this.add.graphics();
      g.fillStyle(0x38bdf8, 0.25);
      g.fillCircle(20, 20, 18);
      g.fillStyle(0x7dd3fc, 1);
      g.fillTriangle(20, 4, 12, 20, 28, 20);
      g.fillTriangle(20, 36, 12, 20, 28, 20);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(20, 20, 4);
      g.generateTexture('star', 40, 40);
      g.destroy();
    }

    // 3. 金色高能星核（高分奖励）
    if (!this.textures.exists('goldStar')) {
      const g = this.add.graphics();
      g.fillStyle(0xfacc15, 0.3);
      g.fillCircle(24, 24, 22);
      g.fillStyle(0xfacc15, 1);
      g.fillCircle(24, 24, 13);
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(20, 20, 5);
      g.generateTexture('goldStar', 48, 48);
      g.destroy();
    }

    // 4. 紫色能量护盾道具
    if (!this.textures.exists('shieldItem')) {
      const g = this.add.graphics();
      g.lineStyle(4, 0xc084fc, 1);
      g.strokeCircle(22, 22, 16);
      g.fillStyle(0xa855f7, 0.35);
      g.fillCircle(22, 22, 14);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(19, 13, 6, 18);
      g.fillRect(13, 19, 18, 6);
      g.generateTexture('shieldItem', 44, 44);
      g.destroy();
    }

    // 5. 陨石障碍物
    if (!this.textures.exists('meteor')) {
      const g = this.add.graphics();
      g.fillStyle(0xf43f5e, 0.22);
      g.fillCircle(28, 28, 26);
      g.fillStyle(0xe11d48, 1);
      g.fillCircle(28, 28, 20);
      g.fillStyle(0x9f1239, 1);
      g.fillCircle(22, 22, 6);
      g.fillCircle(35, 31, 5);
      g.fillStyle(0xfda4af, 0.7);
      g.fillCircle(20, 34, 3);
      g.generateTexture('meteor', 56, 56);
      g.destroy();
    }

    // 6. 粒子光点
    if (!this.textures.exists('spark')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 6);
      g.generateTexture('spark', 12, 12);
      g.destroy();
    }
  }
}
