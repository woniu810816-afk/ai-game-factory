import Phaser from 'phaser';
import { GAME_DESIGN, ELEMENTS } from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 启动场景：程序化绘制《INVESTITURE: Relic Forge》V1.0 MVP 全部商周青铜与水墨美术
 * 严守视觉红线：暗青铜底色、朱砂红/流光金/玄青色、全封闭青铜战盔哪吒背影与水墨妖魔剪影，
 * 绝无裸露人脸特写、日文字符或科幻元素。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#0b0a0f');

    const title = this.add.text(width / 2, height / 2 - 52, i18n.t('titleMain'), {
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#eab308',
      stroke: '#3b1d0a',
      strokeThickness: 7
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 8, i18n.t('titleSub'), {
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#f59e0b',
      letterSpacing: 5
    }).setOrigin(0.5);

    const statusText = this.add.text(width / 2, height / 2 + 44, i18n.t('bootLoading'), {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#a8a29e'
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, alpha: 0.7, duration: 550, yoyo: true, repeat: -1 });

    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'BootScene';
      window.__GAME_STATE__.lang = i18n.lang;
    }

    this._generateTextures();

    const save = platformBridge.getLocalSave();
    try { synthAudio.setEnabled(save.soundEnabled !== false); } catch (_) {}
    try { this.scale?.updateBounds?.(); } catch (_) {}
    statusText.setText(i18n.t('bootReady'));

    this.time.delayedCall(90, () => {
      this.scene.start('MenuScene', { save });
    });
  }

  _generateTextures() {
    this._genElementTiles();
    this._genNezhaSilhouette();
    this._genDemons();
    this._genParticlesAndBagua();
  }

  /**
   * 1. 三大法宝属性方块（52×52）：颜色 + 内部几何图腾双重清晰区分
   */
  _genElementTiles() {
    const drawTile = (key, mainHex, darkHex, lightHex, glyphFn) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      g.fillStyle(darkHex, 1);
      g.fillRoundedRect(1, 1, 50, 50, 7);
      g.fillStyle(mainHex, 0.94);
      g.fillRoundedRect(4, 4, 44, 44, 5);
      // 商周青铜外框与内回字纹
      g.lineStyle(2, 0xd99b38, 0.95);
      g.strokeRoundedRect(2, 2, 48, 48, 6);
      g.lineStyle(1.3, lightHex, 0.72);
      g.strokeRoundedRect(7, 7, 38, 38, 4);
      // 四角青铜钉
      g.fillStyle(0xfef08a, 0.85);
      g.fillCircle(8, 8, 1.6);
      g.fillCircle(44, 8, 1.6);
      g.fillCircle(8, 44, 1.6);
      g.fillCircle(44, 44, 1.6);
      glyphFn(g, lightHex);
      g.generateTexture(key, 52, 52);
      g.destroy();
    };

    // 火 Flame：朱砂红 + 火焰几何纹
    drawTile('tile_fire', ELEMENTS.fire.hex, 0x450a0a, 0xfef08a, (g, c) => {
      g.fillStyle(c, 0.96);
      g.fillTriangle(26, 10, 16, 35, 36, 35);
      g.fillStyle(0xf97316, 0.96);
      g.fillTriangle(26, 17, 20, 37, 32, 37);
      g.fillStyle(0xfffbeb, 1);
      g.fillCircle(26, 30, 3.6);
    });

    // 金 Thunder：流光金 + 雷电锯齿纹
    drawTile('tile_thunder', ELEMENTS.thunder.hex, 0x422006, 0xfef9c3, (g, c) => {
      g.lineStyle(3.2, c, 1);
      g.beginPath();
      g.moveTo(30, 11);
      g.lineTo(18, 26);
      g.lineTo(29, 26);
      g.lineTo(21, 41);
      g.strokePath();
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(26, 26, 2.8);
    });

    // 水 Tide：玄青色 + 双层水波纹
    drawTile('tile_tide', ELEMENTS.tide.hex, 0x083344, 0xa5f3fc, (g, c) => {
      g.lineStyle(2.8, c, 0.96);
      g.beginPath();
      g.moveTo(11, 22);
      g.lineTo(18, 16);
      g.lineTo(26, 23);
      g.lineTo(34, 16);
      g.lineTo(41, 22);
      g.moveTo(11, 33);
      g.lineTo(18, 27);
      g.lineTo(26, 34);
      g.lineTo(34, 27);
      g.lineTo(41, 33);
      g.strokePath();
    });
  }

  /**
   * 2. 佩戴全封闭商周青铜战盔与红氅的哪吒背影剪影（绝无裸露人脸）
   */
  _genNezhaSilhouette() {
    if (this.textures.exists('hero_nezha')) return;
    const g = this.add.graphics();
    // 背后混天绫赤环
    g.lineStyle(4, 0xef4444, 0.85);
    g.strokeCircle(48, 42, 28);
    // 飘扬燕尾红氅（背影）
    g.fillStyle(0x7f1d1d, 0.96);
    g.fillTriangle(48, 34, 12, 90, 44, 78);
    g.fillTriangle(48, 34, 84, 90, 52, 78);
    g.fillStyle(0xdc2626, 0.94);
    g.fillTriangle(48, 36, 20, 84, 48, 72);
    g.fillTriangle(48, 36, 76, 84, 48, 72);
    g.lineStyle(2, 0xfbbf24, 0.92);
    g.beginPath();
    g.moveTo(16, 86);
    g.lineTo(48, 70);
    g.lineTo(80, 86);
    g.strokePath();
    // 青铜肩甲与背心玄甲
    g.fillStyle(0x261d17, 1);
    g.fillTriangle(48, 34, 18, 48, 28, 59);
    g.fillTriangle(48, 34, 78, 48, 68, 59);
    g.lineStyle(2, 0xfbbf24, 1);
    g.strokeTriangle(48, 34, 18, 48, 28, 59);
    g.strokeTriangle(48, 34, 78, 48, 68, 59);
    g.fillStyle(0x1c1917, 1);
    g.fillRoundedRect(34, 38, 28, 34, 6);
    g.strokeRoundedRect(34, 38, 28, 34, 6);
    // 全封闭商周青铜兜鍪（背影高冠 + 红缨）
    g.fillStyle(0xef4444, 1);
    g.fillTriangle(48, 4, 40, 17, 56, 17);
    g.fillStyle(0xfbbf24, 1);
    g.fillTriangle(48, 11, 38, 23, 58, 23);
    g.fillStyle(0x292524, 1);
    g.fillRoundedRect(33, 20, 30, 21, 9);
    g.lineStyle(2.2, 0xfbbf24, 1);
    g.strokeRoundedRect(33, 20, 30, 21, 9);
    g.lineStyle(1.8, 0xfef08a, 0.9);
    g.beginPath();
    g.moveTo(48, 21);
    g.lineTo(48, 37);
    g.strokePath();
    // 斜挑火尖枪剪影
    g.lineStyle(3, 0xd97706, 1);
    g.beginPath();
    g.moveTo(73, 86);
    g.lineTo(83, 14);
    g.strokePath();
    g.fillStyle(0xfef08a, 1);
    g.fillTriangle(84, 5, 78, 19, 89, 19);
    g.fillStyle(0xef4444, 1);
    g.fillCircle(82, 22, 3.8);

    g.generateTexture('hero_nezha', 96, 96);
    g.destroy();
  }

  /**
   * 3. 3 种清晰区分的水墨妖魔剪影 + 第 10 波巨型青铜妖王 Boss
   */
  _genDemons() {
    // A. 普通水墨魔兵（44×44）
    if (!this.textures.exists('enemy_grunt')) {
      const g = this.add.graphics();
      g.fillStyle(0x18181b, 0.96);
      g.fillCircle(22, 21, 15);
      g.fillTriangle(8, 25, 22, 42, 36, 25);
      g.lineStyle(2, 0xb45309, 1);
      g.strokeCircle(22, 20, 13);
      g.fillStyle(0xd97706, 1);
      g.fillTriangle(12, 13, 8, 3, 17, 10);
      g.fillTriangle(32, 13, 36, 3, 27, 10);
      g.fillStyle(0xef4444, 1);
      g.fillCircle(17, 20, 2.4);
      g.fillCircle(27, 20, 2.4);
      g.generateTexture('enemy_grunt', 44, 44);
      g.destroy();
    }

    // B. 重甲青铜傀儡（48×48）：方鼎重铠 + 铜绿厚盾
    if (!this.textures.exists('enemy_golem')) {
      const g = this.add.graphics();
      g.fillStyle(0x292524, 1);
      g.fillRoundedRect(4, 8, 40, 36, 6);
      g.lineStyle(3, 0xd97706, 1);
      g.strokeRoundedRect(4, 8, 40, 36, 6);
      g.lineStyle(2, 0x2dd4bf, 0.92);
      g.strokeRect(10, 14, 28, 24);
      g.fillStyle(0xb45309, 1);
      g.fillRect(8, 3, 8, 6);
      g.fillRect(32, 3, 8, 6);
      g.fillStyle(0x2dd4bf, 1);
      g.fillRect(14, 22, 7, 4);
      g.fillRect(27, 22, 7, 4);
      g.generateTexture('enemy_golem', 48, 48);
      g.destroy();
    }

    // C. 高机动影妖（44×44）：尖锐玄紫双翼鬼影
    if (!this.textures.exists('enemy_wraith')) {
      const g = this.add.graphics();
      g.fillStyle(0x4c1d95, 0.35);
      g.fillCircle(22, 22, 19);
      g.fillStyle(0x1e1b4b, 1);
      g.fillTriangle(22, 3, 3, 28, 22, 41);
      g.fillTriangle(22, 3, 41, 28, 22, 41);
      g.lineStyle(2, 0xc084fc, 1);
      g.strokeTriangle(22, 3, 3, 28, 22, 41);
      g.strokeTriangle(22, 3, 41, 28, 22, 41);
      g.fillStyle(0x22d3ee, 1);
      g.fillTriangle(22, 14, 16, 23, 28, 23);
      g.generateTexture('enemy_wraith', 44, 44);
      g.destroy();
    }

    // D. 第 10 波关底巨型青铜妖王 Boss（横跨 2 条纵道，104×68）
    if (!this.textures.exists('enemy_boss')) {
      const g = this.add.graphics();
      g.fillStyle(0x7f1d1d, 0.32);
      g.fillEllipse(52, 36, 98, 62);
      // 巨型商周青铜双牛角
      g.fillStyle(0xd97706, 1);
      g.fillTriangle(20, 26, 2, 4, 34, 16);
      g.fillTriangle(84, 26, 102, 4, 70, 16);
      // 巨型饕餮青铜魔面主甲
      g.fillStyle(0x1c1917, 1);
      g.fillRoundedRect(16, 14, 72, 48, 10);
      g.lineStyle(3.4, 0xf59e0b, 1);
      g.strokeRoundedRect(16, 14, 72, 48, 10);
      g.lineStyle(2, 0x2dd4bf, 0.9);
      g.strokeRect(24, 21, 56, 34);
      // 炽红怒目 + 青铜獠牙纹
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(30, 32, 45, 36, 34, 42);
      g.fillTriangle(74, 32, 59, 36, 70, 42);
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(37, 36, 2.8);
      g.fillCircle(67, 36, 2.8);
      g.fillStyle(0xfbbf24, 1);
      g.fillTriangle(38, 56, 43, 47, 48, 56);
      g.fillTriangle(56, 56, 61, 47, 66, 56);
      g.generateTexture('enemy_boss', 104, 68);
      g.destroy();
    }
  }

  _genParticlesAndBagua() {
    if (!this.textures.exists('baguaRing')) {
      const g = this.add.graphics();
      const cx = 90;
      const cy = 90;
      g.lineStyle(2, 0xd99b38, 0.48);
      g.strokeCircle(cx, cy, 84);
      g.strokeCircle(cx, cy, 62);
      g.lineStyle(2.6, 0xf59e0b, 0.6);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 66, cy + Math.sin(a) * 66);
        g.lineTo(cx + Math.cos(a) * 80, cy + Math.sin(a) * 80);
        g.strokePath();
      }
      g.generateTexture('baguaRing', 180, 180);
      g.destroy();
    }

    if (!this.textures.exists('spark')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 5);
      g.generateTexture('spark', 12, 12);
      g.destroy();
    }

    if (!this.textures.exists('shard')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(6, 1, 1, 11, 11, 10);
      g.generateTexture('shard', 12, 12);
      g.destroy();
    }
  }
}
