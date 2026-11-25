import Phaser from 'phaser';
import { GAME_DESIGN, ELEMENTS } from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

/**
 * 启动场景：程序化绘制《INVESTITURE: Relic Forge / 封神锻炉》全套商周青铜与水墨东方神话美术
 * - 零外部图片依赖，极速首屏加载（总包体远小于 2MB，弱网秒开）
 * - 严格遵守视觉红线：全封闭商周青铜战盔、饕餮面甲、剪影/背影造型，无裸露人脸与现代科幻元素
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create() {
    const { width, height } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#0b0a10');

    const title = this.add.text(width / 2, height / 2 - 58, i18n.t('titleMain'), {
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#eab308',
      stroke: '#3b1d0a',
      strokeThickness: 7
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - 12, i18n.t('titleSub'), {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#f59e0b',
      letterSpacing: 5
    }).setOrigin(0.5);

    const statusText = this.add.text(width / 2, height / 2 + 44, i18n.t('bootLoading'), {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#a8a29e',
      letterSpacing: 1
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      alpha: 0.68,
      duration: 600,
      yoyo: true,
      repeat: -1
    });

    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'BootScene';
      window.__GAME_STATE__.lang = i18n.lang;
    }

    this._generateProceduralArt();

    const withTimeout = (promise, ms) => Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, ms))
    ]);

    const enterMenu = (save) => {
      const safeSave = save || platformBridge.getLocalSave();
      try { synthAudio.setEnabled(safeSave.soundEnabled !== false); } catch (_) {}
      try { platformBridge.loadingFinished(); } catch (_) {}
      try { this.scale?.updateBounds?.(); } catch (_) {}
      statusText.setText(i18n.t('bootReady'));
      this.time.delayedCall(90, () => {
        this.scene.start('MenuScene', { save: safeSave });
      });
    };

    Promise.resolve()
      .then(() => withTimeout(platformBridge.init().catch(() => {}), 1200))
      .then(() => withTimeout(platformBridge.loadCloudSave().catch(() => platformBridge.getLocalSave()), 1200))
      .then((save) => enterMenu(save))
      .catch(() => enterMenu(platformBridge.getLocalSave()));
  }

  _generateProceduralArt() {
    this._genFiveElementTiles();
    this._genSpecialTiles();
    this._genWarlords();
    this._genInkDemons();
    this._genEffectsAndBagua();
  }

  /**
   * 1. 五行商周青铜铭文方块（56×56）：火/金/土/水/木各自独特古纹与色系
   */
  _genFiveElementTiles() {
    const drawTile = (key, mainColor, lightColor, darkColor, glyphFn) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();
      // 青铜玄黑底座
      g.fillStyle(darkColor, 1);
      g.fillRoundedRect(2, 2, 52, 52, 8);
      // 主色玉石/青铜面
      g.fillStyle(mainColor, 0.92);
      g.fillRoundedRect(5, 5, 46, 46, 6);
      // 商周青铜内回字边框
      g.lineStyle(2.2, 0xd99b38, 0.95);
      g.strokeRoundedRect(3, 3, 50, 50, 7);
      g.lineStyle(1.4, lightColor, 0.72);
      g.strokeRoundedRect(8, 8, 40, 40, 4);
      // 四角青铜铆钉
      g.fillStyle(0xfef08a, 0.85);
      g.fillCircle(9, 9, 1.8);
      g.fillCircle(47, 9, 1.8);
      g.fillCircle(9, 47, 1.8);
      g.fillCircle(47, 47, 1.8);
      // 五行核心古篆几何图腾
      glyphFn(g, lightColor);
      g.generateTexture(key, 56, 56);
      g.destroy();
    };

    // 火（朱砂红）：三簇火尖枪焰纹
    drawTile('tile_fire', ELEMENTS.fire.hex, 0xfef08a, 0x450a0a, (g, c) => {
      g.fillStyle(c, 0.95);
      g.fillTriangle(28, 12, 18, 36, 38, 36);
      g.fillStyle(0xf97316, 0.95);
      g.fillTriangle(28, 18, 22, 38, 34, 38);
      g.fillStyle(0xfffbeb, 1);
      g.fillCircle(28, 32, 4);
    });

    // 金（流光金）：打神鞭雷电菱节纹
    drawTile('tile_metal', 0xd97706, 0xfef08a, 0x422006, (g, c) => {
      g.lineStyle(3.2, c, 1);
      g.beginPath();
      g.moveTo(32, 13);
      g.lineTo(20, 28);
      g.lineTo(31, 28);
      g.lineTo(23, 43);
      g.strokePath();
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(28, 28, 3);
    });

    // 土（青铜褐）：商周方鼎/番天印回字山岳纹
    drawTile('tile_earth', 0x92400e, 0xfcd34d, 0x291507, (g, c) => {
      g.lineStyle(2.6, c, 0.95);
      g.strokeRect(16, 16, 24, 24);
      g.fillStyle(c, 0.9);
      g.fillTriangle(28, 19, 19, 36, 37, 36);
      g.fillStyle(0x451a03, 1);
      g.fillRect(25, 29, 6, 7);
    });

    // 水（碧波青）：混天绫双波玄水纹
    drawTile('tile_water', 0x0891b2, 0xa5f3fc, 0x083344, (g, c) => {
      g.lineStyle(3, c, 0.95);
      g.beginPath();
      g.moveTo(13, 24);
      g.lineTo(20, 18);
      g.lineTo(28, 25);
      g.lineTo(36, 18);
      g.lineTo(43, 24);
      g.moveTo(13, 35);
      g.lineTo(20, 29);
      g.lineTo(28, 36);
      g.lineTo(36, 29);
      g.lineTo(43, 35);
      g.strokePath();
    });

    // 木（翠玉绿）：青莲花瓣护阵纹
    drawTile('tile_wood', 0x059669, 0xa7f3d0, 0x022c22, (g, c) => {
      g.fillStyle(c, 0.95);
      g.fillTriangle(28, 13, 22, 30, 34, 30);
      g.fillTriangle(15, 26, 25, 36, 27, 25);
      g.fillTriangle(41, 26, 31, 36, 29, 25);
      g.fillStyle(0xecfdf5, 1);
      g.fillCircle(28, 33, 4.2);
    });
  }

  /**
   * 2. 天劫特殊格：紫雷封印格 + 真假灵丹块
   */
  _genSpecialTiles() {
    if (!this.textures.exists('tile_sealed')) {
      const g = this.add.graphics();
      g.fillStyle(0x1e1038, 1);
      g.fillRoundedRect(2, 2, 52, 52, 8);
      g.lineStyle(2.8, 0xa855f7, 1);
      g.strokeRoundedRect(4, 4, 48, 48, 7);
      // 紫雷青铜锁链交叉封印
      g.lineStyle(3, 0xd8b4fe, 0.95);
      g.beginPath();
      g.moveTo(11, 11);
      g.lineTo(45, 45);
      g.moveTo(45, 11);
      g.lineTo(11, 45);
      g.strokePath();
      g.fillStyle(0xc084fc, 1);
      g.fillCircle(28, 28, 8);
      g.fillStyle(0x3b0764, 1);
      g.fillCircle(28, 28, 3.5);
      g.generateTexture('tile_sealed', 56, 56);
      g.destroy();
    }

    if (!this.textures.exists('tile_pill')) {
      const g = this.add.graphics();
      g.fillStyle(0x2d1022, 1);
      g.fillRoundedRect(2, 2, 52, 52, 8);
      g.lineStyle(2.5, 0xfbbf24, 1);
      g.strokeRoundedRect(4, 4, 48, 48, 7);
      // 神秘真假灵丹（半金半紫太极丹气，落子揭晓）
      g.fillStyle(0xf59e0b, 0.3);
      g.fillCircle(28, 28, 20);
      g.fillStyle(0xfbbf24, 1);
      g.fillCircle(28, 28, 13);
      g.fillStyle(0xa855f7, 0.85);
      g.fillTriangle(28, 15, 41, 28, 28, 41);
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(24, 24, 3);
      g.generateTexture('tile_pill', 56, 56);
      g.destroy();
    }
  }

  /**
   * 3. 4 尊全封闭商周青铜战盔战将（背影/侧影剪影，绝无人脸特写与现代元素）
   */
  _genWarlords() {
    const drawBaseWarrior = (key, cfg) => {
      if (this.textures.exists(key)) return;
      const g = this.add.graphics();

      // 背后标志法宝/羽翼剪影（绘制在身躯后方）
      if (cfg.backExtra) cfg.backExtra(g);

      // 飘扬古风长披风（背影/三四分侧影）
      g.fillStyle(cfg.cloakDark, 0.96);
      g.fillTriangle(48, 34, 12, 92, 44, 80);
      g.fillTriangle(48, 34, 84, 92, 52, 80);
      g.fillStyle(cfg.cloakMain, 0.92);
      g.fillTriangle(48, 36, 20, 86, 48, 74);
      g.fillTriangle(48, 36, 76, 86, 48, 74);
      g.lineStyle(2, cfg.trim, 0.9);
      g.beginPath();
      g.moveTo(16, 88);
      g.lineTo(48, 72);
      g.lineTo(80, 88);
      g.strokePath();

      // 商周饕餮青铜肩甲
      g.fillStyle(0x261d17, 1);
      g.fillTriangle(48, 34, 18, 48, 28, 60);
      g.fillTriangle(48, 34, 78, 48, 68, 60);
      g.lineStyle(2.2, cfg.trim, 1);
      g.strokeTriangle(48, 34, 18, 48, 28, 60);
      g.strokeTriangle(48, 34, 78, 48, 68, 60);

      // 玄铜背甲身躯 + 背心八卦/饕餮鎏金图腾
      g.fillStyle(0x1c1917, 1);
      g.fillRoundedRect(34, 38, 28, 36, 6);
      g.lineStyle(2, cfg.trim, 0.95);
      g.strokeRoundedRect(34, 38, 28, 36, 6);
      g.fillStyle(cfg.trim, 1);
      g.fillTriangle(48, 44, 40, 54, 56, 54);
      g.fillTriangle(48, 64, 40, 54, 56, 54);
      g.fillStyle(cfg.gem, 1);
      g.fillCircle(48, 54, 3.2);

      // 全封闭商周青铜战盔（兜鍪 + 高冠顶缨 + 背甲护颈，绝无裸露人脸）
      g.fillStyle(cfg.plume, 1);
      g.fillTriangle(48, 4, 40, 18, 56, 18);
      g.fillStyle(cfg.trim, 1);
      g.fillTriangle(48, 12, 38, 24, 58, 24);
      g.fillStyle(0x292524, 1);
      g.fillRoundedRect(33, 20, 30, 22, 9);
      g.lineStyle(2.4, cfg.trim, 1);
      g.strokeRoundedRect(33, 20, 30, 22, 9);
      // 盔脊商周青铜饕餮纹饰（纯几何图腾）
      g.lineStyle(2, cfg.gem, 0.95);
      g.beginPath();
      g.moveTo(48, 21);
      g.lineTo(48, 38);
      g.moveTo(39, 30);
      g.lineTo(57, 30);
      g.strokePath();

      // 手持标志法宝剪影
      if (cfg.weapon) cfg.weapon(g);

      g.generateTexture(key, 96, 98);
      g.destroy();
    };

    // 1. 哪吒（朱红披风 + 混天绫飘带 + 火尖枪）
    drawBaseWarrior('warlord_nezha', {
      cloakDark: 0x7f1d1d,
      cloakMain: 0xdc2626,
      trim: 0xfbbf24,
      plume: 0xef4444,
      gem: 0xfef08a,
      backExtra: (g) => {
        // 混天绫红环飘带
        g.lineStyle(4, 0xef4444, 0.85);
        g.strokeCircle(48, 42, 30);
      },
      weapon: (g) => {
        // 斜挑火尖枪
        g.lineStyle(3.2, 0xd97706, 1);
        g.beginPath();
        g.moveTo(74, 86);
        g.lineTo(84, 14);
        g.strokePath();
        g.fillStyle(0xfef08a, 1);
        g.fillTriangle(85, 5, 79, 20, 90, 20);
        g.fillStyle(0xef4444, 0.95);
        g.fillCircle(83, 22, 4);
      }
    });

    // 2. 杨戬（玄蓝银金铠 + 饕餮三目青铜盔纹 + 三尖两刃戟）
    drawBaseWarrior('warlord_yangjian', {
      cloakDark: 0x1e293b,
      cloakMain: 0x1d4ed8,
      trim: 0xfbbf24,
      plume: 0x38bdf8,
      gem: 0x67e8f9,
      backExtra: (g) => {
        // 背后金环灵光
        g.lineStyle(2.5, 0x38bdf8, 0.7);
        g.strokeCircle(48, 32, 24);
      },
      weapon: (g) => {
        // 三尖两刃戟
        g.lineStyle(3.2, 0xe2e8f0, 1);
        g.beginPath();
        g.moveTo(76, 88);
        g.lineTo(80, 16);
        g.strokePath();
        g.fillStyle(0xfef08a, 1);
        g.fillTriangle(80, 4, 75, 19, 85, 19);
        g.fillTriangle(72, 12, 74, 22, 79, 18);
        g.fillTriangle(88, 12, 86, 22, 81, 18);
      }
    });

    // 3. 雷震子（玄紫雷甲 + 展开双雷翼 + 黄金双雷锤）
    drawBaseWarrior('warlord_leizhenzi', {
      cloakDark: 0x3b0764,
      cloakMain: 0x7e22ce,
      trim: 0xfacc15,
      plume: 0x22d3ee,
      gem: 0xa855f7,
      backExtra: (g) => {
        // 左右展开的几何青铜雷翼剪影
        g.fillStyle(0x4c1d95, 0.95);
        g.fillTriangle(36, 46, 2, 16, 12, 62);
        g.fillTriangle(60, 46, 94, 16, 84, 62);
        g.lineStyle(2, 0x22d3ee, 0.95);
        g.strokeTriangle(36, 46, 2, 16, 12, 62);
        g.strokeTriangle(60, 46, 94, 16, 84, 62);
      },
      weapon: (g) => {
        // 黄金雷锤
        g.fillStyle(0xfacc15, 1);
        g.fillRect(76, 48, 14, 10);
        g.lineStyle(2.4, 0xf59e0b, 1);
        g.beginPath();
        g.moveTo(83, 58);
        g.lineTo(80, 78);
        g.strokePath();
      }
    });

    // 4. 姜子牙（玄青八卦道袍 + 杏黄令旗 + 金色打神鞭）
    drawBaseWarrior('warlord_jiangziya', {
      cloakDark: 0x064e3b,
      cloakMain: 0x059669,
      trim: 0xfef08a,
      plume: 0x34d399,
      gem: 0xfbbf24,
      backExtra: (g) => {
        // 背后杏黄封神令旗剪影
        g.lineStyle(2.5, 0xd97706, 1);
        g.beginPath();
        g.moveTo(22, 76);
        g.lineTo(18, 14);
        g.strokePath();
        g.fillStyle(0xfbbf24, 0.92);
        g.fillTriangle(18, 14, 34, 24, 18, 36);
      },
      weapon: (g) => {
        // 打神鞭（金色节鞭）
        g.lineStyle(3.5, 0xfef08a, 1);
        g.beginPath();
        g.moveTo(74, 78);
        g.lineTo(84, 24);
        g.strokePath();
        g.fillStyle(0xf59e0b, 1);
        for (let y = 30; y <= 66; y += 12) {
          g.fillCircle(82 - (y - 30) * 0.16, y, 3);
        }
      }
    });
  }

  /**
   * 4. 四种水墨妖魔（纯水墨剪影 + 商周青铜饕餮兽面甲，绝无人脸特写）
   */
  _genInkDemons() {
    // A. 普通水墨魔兵（enemy_grunt）
    if (!this.textures.exists('enemy_grunt')) {
      const g = this.add.graphics();
      // 水墨黑雾体
      g.fillStyle(0x18181b, 0.96);
      g.fillCircle(26, 26, 19);
      g.fillTriangle(10, 32, 26, 52, 42, 32);
      // 商周青铜饕餮角面甲
      g.lineStyle(2.2, 0xb45309, 1);
      g.strokeCircle(26, 24, 15);
      g.fillStyle(0xd97706, 1);
      g.fillTriangle(14, 16, 10, 4, 20, 12);
      g.fillTriangle(38, 16, 42, 4, 32, 12);
      // 饕餮面甲眼缝光点
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(17, 23, 23, 25, 19, 27);
      g.fillTriangle(35, 23, 29, 25, 33, 27);
      g.generateTexture('enemy_grunt', 52, 54);
      g.destroy();
    }

    // B. 护甲青铜傀儡（enemy_golem）
    if (!this.textures.exists('enemy_golem')) {
      const g = this.add.graphics();
      // 厚重商周方鼎青铜甲壳
      g.fillStyle(0x292524, 1);
      g.fillRoundedRect(6, 10, 48, 44, 7);
      g.lineStyle(3.2, 0xd97706, 1);
      g.strokeRoundedRect(6, 10, 48, 44, 7);
      // 铜绿青铜回字装甲纹
      g.lineStyle(2, 0x2dd4bf, 0.9);
      g.strokeRect(13, 17, 34, 30);
      // 顶角青铜耳
      g.fillStyle(0xb45309, 1);
      g.fillRect(10, 4, 10, 8);
      g.fillRect(40, 4, 10, 8);
      // 饕餮双目青铜炉火
      g.fillStyle(0x2dd4bf, 1);
      g.fillRect(18, 26, 8, 5);
      g.fillRect(34, 26, 8, 5);
      g.generateTexture('enemy_golem', 60, 60);
      g.destroy();
    }

    // C. 急速妖影（enemy_wraith）
    if (!this.textures.exists('enemy_wraith')) {
      const g = this.add.graphics();
      g.fillStyle(0x3b0764, 0.45);
      g.fillCircle(24, 24, 21);
      // 锐利水墨鬼影三角翼
      g.fillStyle(0x1e1b4b, 1);
      g.fillTriangle(24, 4, 4, 32, 24, 46);
      g.fillTriangle(24, 4, 44, 32, 24, 46);
      g.lineStyle(2, 0xc084fc, 1);
      g.strokeTriangle(24, 4, 4, 32, 24, 46);
      g.strokeTriangle(24, 4, 44, 32, 24, 46);
      // 青紫妖火核心
      g.fillStyle(0x22d3ee, 1);
      g.fillTriangle(24, 16, 17, 25, 31, 25);
      g.generateTexture('enemy_wraith', 48, 48);
      g.destroy();
    }

    // D. 巨型青铜妖王（enemy_boss，每 5 波登场）
    if (!this.textures.exists('enemy_boss')) {
      const g = this.add.graphics();
      // 妖王紫黑魔雾晕
      g.fillStyle(0x7c2d12, 0.35);
      g.fillCircle(48, 48, 45);
      // 巨型青铜双牛角
      g.fillStyle(0xd97706, 1);
      g.fillTriangle(22, 32, 4, 6, 32, 20);
      g.fillTriangle(74, 32, 92, 6, 64, 20);
      // 巨型商周饕餮青铜魔面主甲
      g.fillStyle(0x1c1917, 1);
      g.fillRoundedRect(16, 20, 64, 58, 12);
      g.lineStyle(3.8, 0xf59e0b, 1);
      g.strokeRoundedRect(16, 20, 64, 58, 12);
      // 饕餮青铜额纹与雷环
      g.lineStyle(2.4, 0x2dd4bf, 0.9);
      g.strokeRect(24, 28, 48, 42);
      // 炽红饕餮怒目
      g.fillStyle(0xef4444, 1);
      g.fillTriangle(28, 44, 42, 48, 32, 54);
      g.fillTriangle(68, 44, 54, 48, 64, 54);
      g.fillStyle(0xfef08a, 1);
      g.fillCircle(35, 48, 3);
      g.fillCircle(61, 48, 3);
      // 下颌青铜獠牙纹
      g.fillStyle(0xfbbf24, 1);
      g.fillTriangle(34, 68, 39, 58, 44, 68);
      g.fillTriangle(52, 68, 57, 58, 62, 68);
      g.generateTexture('enemy_boss', 96, 92);
      g.destroy();
    }
  }

  /**
   * 5. 法宝特效、番天印青铜巨印与八卦法阵圆环
   */
  _genEffectsAndBagua() {
    if (!this.textures.exists('sealStamp')) {
      const g = this.add.graphics();
      g.fillStyle(0x78350f, 0.95);
      g.fillRoundedRect(6, 6, 84, 84, 10);
      g.lineStyle(4, 0xfbbf24, 1);
      g.strokeRoundedRect(6, 6, 84, 84, 10);
      g.lineStyle(2.5, 0xfef08a, 0.9);
      g.strokeRect(16, 16, 64, 64);
      // 古印几何回字山纹
      g.fillStyle(0xf59e0b, 0.95);
      g.fillTriangle(48, 22, 24, 68, 72, 68);
      g.fillStyle(0x451a03, 1);
      g.fillRect(42, 46, 12, 22);
      g.generateTexture('sealStamp', 96, 96);
      g.destroy();
    }

    if (!this.textures.exists('baguaRing')) {
      const g = this.add.graphics();
      const cx = 90;
      const cy = 90;
      g.lineStyle(2.2, 0xd99b38, 0.5);
      g.strokeCircle(cx, cy, 84);
      g.strokeCircle(cx, cy, 62);
      // 八方位卦象短横
      g.lineStyle(3, 0xf59e0b, 0.65);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const x1 = cx + Math.cos(a) * 66;
        const y1 = cy + Math.sin(a) * 66;
        const x2 = cx + Math.cos(a) * 80;
        const y2 = cy + Math.sin(a) * 80;
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.strokePath();
      }
      g.generateTexture('baguaRing', 180, 180);
      g.destroy();
    }

    if (!this.textures.exists('spark')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillCircle(7, 7, 5.5);
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(7, 7, 7.5);
      g.generateTexture('spark', 15, 15);
      g.destroy();
    }

    if (!this.textures.exists('shard')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillTriangle(7, 1, 1, 13, 13, 11);
      g.generateTexture('shard', 14, 14);
      g.destroy();
    }
  }
}
