import Phaser from 'phaser';
import { GAME_DESIGN } from '../config.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 启动场景：程序化生成《Celestial Rush》东方玄幻高清矢量纹理（零外部版权素材，极速首屏加载）
 * 并完成 Poki / CrazyGames / Telegram SDK、GA4 与新加坡 Supabase 云存档初始化。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#090714');

    const title = this.add.text(width / 2, height / 2 - 44, 'CELESTIAL RUSH', {
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#fbbf24',
      stroke: '#7c2d12',
      strokeThickness: 6
    }).setOrigin(0.5);

    const statusText = this.add.text(width / 2, height / 2 + 22, 'SUMMONING SPIRIT REALM...', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#a78bfa',
      letterSpacing: 2
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      alpha: 0.65,
      duration: 600,
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
      statusText.setText('READY!');
      this.time.delayedCall(100, () => {
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
    // 1. 东方玄幻行者（佩戴全封闭古风战盔、玄甲披风、几何图腾剪影，无现代科幻/人脸特写）
    if (!this.textures.exists('walker')) {
      const g = this.add.graphics();
      // 朱红古风燕尾披风与飘带剪影
      g.fillStyle(0x991b1b, 0.95);
      g.fillTriangle(40, 30, 10, 74, 34, 62);
      g.fillTriangle(40, 30, 70, 74, 46, 62);
      g.fillStyle(0xdc2626, 0.85);
      g.fillTriangle(40, 32, 18, 68, 40, 58);
      g.fillTriangle(40, 32, 62, 68, 40, 58);

      // 披风金边纹饰
      g.lineStyle(2, 0xfbbf24, 0.9);
      g.beginPath();
      g.moveTo(14, 70);
      g.lineTo(40, 56);
      g.lineTo(66, 70);
      g.strokePath();

      // 玄铁肩甲（锐利几何古风甲片）
      g.fillStyle(0x1c1917, 1);
      g.fillTriangle(40, 32, 16, 44, 24, 54);
      g.fillTriangle(40, 32, 64, 44, 56, 54);
      g.lineStyle(2, 0xd97706, 1);
      g.strokeTriangle(40, 32, 16, 44, 24, 54);
      g.strokeTriangle(40, 32, 64, 44, 56, 54);

      // 躯干玄甲与腰束鎏金带
      g.fillStyle(0x181326, 1);
      g.fillRoundedRect(28, 34, 24, 34, 6);
      g.lineStyle(2, 0xfbbf24, 0.95);
      g.strokeRoundedRect(28, 34, 24, 34, 6);
      // 胸前玄纹菱形图腾
      g.fillStyle(0xfbbf24, 1);
      g.fillTriangle(40, 41, 34, 49, 46, 49);
      g.fillTriangle(40, 57, 34, 49, 46, 49);
      g.fillStyle(0xef4444, 1);
      g.fillCircle(40, 49, 2.5);

      // 双腿玄铁护胫（立于风火轮之上）
      g.fillStyle(0x292524, 1);
      g.fillRect(29, 68, 8, 16);
      g.fillRect(43, 68, 8, 16);
      g.fillStyle(0xf59e0b, 1);
      g.fillRect(29, 76, 8, 3);
      g.fillRect(43, 76, 8, 3);

      // 全封闭古风战盔（兜鍪 + 红缨金冠 + 封闭玄金几何面甲）
      // 顶缨红穗
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(40, 2, 34, 14, 46, 14);
      // 金冠盔顶
      g.fillStyle(0xfbbf24, 1);
      g.fillTriangle(40, 9, 32, 20, 48, 20);
      // 封闭玄铁头盔主体与护颊
      g.fillStyle(0x1c1917, 1);
      g.fillRoundedRect(26, 17, 28, 22, 8);
      g.lineStyle(2.2, 0xfbbf24, 1);
      g.strokeRoundedRect(26, 17, 28, 22, 8);
      // 额头鎏金眉脊
      g.fillStyle(0xd97706, 1);
      g.fillTriangle(40, 17, 30, 24, 50, 24);
      // 封闭面甲双目窄缝金光（纯几何图腾，无人脸细节）
      g.fillStyle(0xfef08a, 1);
      g.fillTriangle(31, 27, 38, 29, 32, 30);
      g.fillTriangle(49, 27, 42, 29, 48, 30);
      // 下颌玄金护面纹
      g.lineStyle(1.6, 0xf59e0b, 0.85);
      g.beginPath();
      g.moveTo(35, 34);
      g.lineTo(40, 37);
      g.lineTo(45, 34);
      g.strokePath();

      g.generateTexture('walker', 80, 92);
      g.destroy();
    }

    // 2. 独立旋转风火轮贴图（挂于行者双脚两侧，实时高速旋转）
    if (!this.textures.exists('windFireWheel')) {
      const g = this.add.graphics();
      const cx = 22;
      const cy = 22;
      // 外层火焰光晕
      g.fillStyle(0xf97316, 0.28);
      g.fillCircle(cx, cy, 20);
      // 6 道旋转锯齿火舌
      g.fillStyle(0xf59e0b, 0.95);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const x1 = cx + Math.cos(a) * 19;
        const y1 = cy + Math.sin(a) * 19;
        const x2 = cx + Math.cos(a + 0.35) * 12;
        const y2 = cy + Math.sin(a + 0.35) * 12;
        const x3 = cx + Math.cos(a - 0.25) * 12;
        const y3 = cy + Math.sin(a - 0.25) * 12;
        g.fillTriangle(x1, y1, x2, y2, x3, y3);
      }
      // 青铜鎏金轮环与轮辐
      g.lineStyle(3, 0xfef08a, 1);
      g.strokeCircle(cx, cy, 12);
      g.lineStyle(2, 0xfbbf24, 0.95);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4);
        g.lineTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12);
        g.strokePath();
      }
      g.fillStyle(0xfffbeb, 1);
      g.fillCircle(cx, cy, 4);
      g.generateTexture('windFireWheel', 44, 44);
      g.destroy();
    }

    // 3. 障碍物 A：旋转青铜雷纹阵（Bronze Thunder Array）
    if (!this.textures.exists('bronzeArray')) {
      const g = this.add.graphics();
      const cx = 34;
      const cy = 34;
      // 暗青雷电外晕
      g.fillStyle(0x2dd4bf, 0.16);
      g.fillCircle(cx, cy, 32);
      // 古青铜圆盘底色
      g.fillStyle(0x451a03, 0.96);
      g.fillCircle(cx, cy, 26);
      // 青铜外环与回字雷纹八齿
      g.lineStyle(4, 0xb45309, 1);
      g.strokeCircle(cx, cy, 24);
      g.lineStyle(2, 0xf59e0b, 0.9);
      g.strokeCircle(cx, cy, 17);

      g.fillStyle(0xd97706, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const bx = cx + Math.cos(a) * 26;
        const by = cy + Math.sin(a) * 26;
        g.fillCircle(bx, by, 3.5);
      }

      // 内部青色雷纹八卦几何电弧
      g.lineStyle(2.4, 0x2dd4bf, 1);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const x1 = cx + Math.cos(a) * 8;
        const y1 = cy + Math.sin(a) * 8;
        const x2 = cx + Math.cos(a + 0.35) * 18;
        const y2 = cy + Math.sin(a + 0.35) * 18;
        const x3 = cx + Math.cos(a) * 22;
        const y3 = cy + Math.sin(a) * 22;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.lineTo(x3, y3);
        g.strokePath();
      }
      // 阵眼菱形青铜核
      g.fillStyle(0x5eead4, 1);
      g.fillTriangle(cx, cy - 9, cx - 8, cy, cx + 8, cy);
      g.fillTriangle(cx, cy + 9, cx - 8, cy, cx + 8, cy);
      g.fillStyle(0x134e4a, 1);
      g.fillCircle(cx, cy, 3);

      g.generateTexture('bronzeArray', 68, 68);
      g.destroy();
    }

    // 4. 障碍物 B：天降玄火陨星（Celestial Meteor）
    if (!this.textures.exists('celestialMeteor')) {
      const g = this.add.graphics();
      const cx = 30;
      const cy = 30;
      // 灼烧红晕
      g.fillStyle(0xef4444, 0.24);
      g.fillCircle(cx, cy, 28);
      // 不规则玄石多边形主体
      const pts = [
        { x: 30, y: 6 },
        { x: 47, y: 12 },
        { x: 54, y: 29 },
        { x: 45, y: 48 },
        { x: 28, y: 54 },
        { x: 11, y: 45 },
        { x: 7, y: 26 },
        { x: 16, y: 12 }
      ];
      g.fillStyle(0x271722, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2.5, 0xdc2626, 0.95);
      g.strokePoints(pts, true);

      // 炽热熔岩裂纹
      g.lineStyle(2.6, 0xf97316, 1);
      g.beginPath();
      g.moveTo(16, 18);
      g.lineTo(29, 28);
      g.lineTo(44, 21);
      g.moveTo(29, 28);
      g.lineTo(23, 45);
      g.moveTo(29, 28);
      g.lineTo(42, 41);
      g.strokePath();

      // 核心赤金火星
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(29, 28, 4.5);

      g.generateTexture('celestialMeteor', 60, 60);
      g.destroy();
    }

    // 5. 收集物 A：发光金玉（Spirit Jade）
    if (!this.textures.exists('spiritJade')) {
      const g = this.add.graphics();
      const cx = 22;
      const cy = 22;
      // 暖金玉晕
      g.fillStyle(0xfbbf24, 0.26);
      g.fillCircle(cx, cy, 20);
      // 菱形鎏金玉框
      g.fillStyle(0xf59e0b, 1);
      g.fillTriangle(cx, 3, 6, cy, 38, cy);
      g.fillTriangle(cx, 41, 6, cy, 38, cy);
      // 内嵌翡翠温润灵玉
      g.fillStyle(0x10b981, 1);
      g.fillTriangle(cx, 7, 10, cy, 34, cy);
      g.fillTriangle(cx, 37, 10, cy, 34, cy);
      // 玉璧高光内芯
      g.fillStyle(0xa7f3d0, 1);
      g.fillTriangle(cx, 12, 16, cy, 28, cy);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(cx, cy, 4);

      g.generateTexture('spiritJade', 44, 44);
      g.destroy();
    }

    // 6. 收集物 B：护体金钟（Golden Bell / Shield）
    if (!this.textures.exists('goldenBell')) {
      const g = this.add.graphics();
      const cx = 24;
      const cy = 24;
      // 金色禅光外环
      g.fillStyle(0xfacc15, 0.22);
      g.fillCircle(cx, cy, 22);
      g.lineStyle(2, 0xfef08a, 0.8);
      g.strokeCircle(cx, cy, 20);
      // 钟钮
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(cx, 10, 4);
      // 钟身（圆顶 + 梯形外撇钟裙）
      g.fillStyle(0xf59e0b, 1);
      g.fillCircle(cx, 18, 9);
      g.fillPoints([
        { x: 15, y: 18 },
        { x: 33, y: 18 },
        { x: 38, y: 34 },
        { x: 10, y: 34 }
      ], true);
      g.lineStyle(2, 0xfef08a, 1);
      g.strokePoints([
        { x: 15, y: 18 },
        { x: 33, y: 18 },
        { x: 38, y: 34 },
        { x: 10, y: 34 }
      ], true);
      // 钟身古纹横带与高光
      g.fillStyle(0x78350f, 0.85);
      g.fillRect(14, 27, 20, 3);
      g.fillStyle(0xfffbeb, 0.9);
      g.fillRect(19, 17, 3, 10);

      g.generateTexture('goldenBell', 48, 48);
      g.destroy();
    }

    // 7. 收集物 C：吸宝灵符（Magnet Talisman）
    if (!this.textures.exists('magnetTalisman')) {
      const g = this.add.graphics();
      const cx = 24;
      const cy = 24;
      // 青金聚宝灵晕
      g.fillStyle(0x38bdf8, 0.24);
      g.fillCircle(cx, cy, 22);
      g.lineStyle(2, 0x67e8f9, 0.85);
      g.strokeCircle(cx, cy, 20);
      // 明黄道符纸矩形
      g.fillStyle(0xfde047, 1);
      g.fillRoundedRect(14, 9, 20, 30, 3);
      g.lineStyle(2, 0xd97706, 1);
      g.strokeRoundedRect(14, 9, 20, 30, 3);
      // 顶部朱砂绳结
      g.fillStyle(0xef4444, 1);
      g.fillRect(18, 6, 12, 4);
      // 朱砂聚宝折线符文
      g.lineStyle(2.4, 0xdc2626, 1);
      g.beginPath();
      g.moveTo(24, 13);
      g.lineTo(24, 34);
      g.moveTo(18, 17);
      g.lineTo(30, 17);
      g.moveTo(19, 22);
      g.lineTo(29, 25);
      g.lineTo(19, 29);
      g.lineTo(29, 32);
      g.strokePath();

      g.generateTexture('magnetTalisman', 48, 48);
      g.destroy();
    }

    // 8. 粒子光点（拖尾与火星）
    if (!this.textures.exists('spark')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(7, 7, 6);
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(7, 7, 8);
      g.generateTexture('spark', 16, 16);
      g.destroy();
    }

    // 9. 几何碎片（Fever 撞碎障碍物用）
    if (!this.textures.exists('shard')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(7, 1, 1, 13, 13, 11);
      g.generateTexture('shard', 14, 14);
      g.destroy();
    }
  }
}
