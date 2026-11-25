import Phaser from 'phaser';
import {
  GAME_DESIGN,
  ELEMENTS,
  ELEMENT_KEYS,
  PIECE_SHAPES,
  DECREE_POOL,
  getWarlord
} from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

const BOARD_SIZE = GAME_DESIGN.board.size;
const CELL_SIZE = GAME_DESIGN.board.cellSize;
const ORIGIN_X = GAME_DESIGN.board.originX;
const ORIGIN_Y = GAME_DESIGN.board.originY;
const DRAG_LIFT_Y = GAME_DESIGN.board.dragLiftY;
const TRAY_Y = GAME_DESIGN.board.trayY;
const TRAY_SLOTS_X = GAME_DESIGN.board.traySlotsX;

/**
 * 《INVESTITURE: Relic Forge / 封神锻炉：天劫破阵》核心双区战斗与锻炉场景
 * - 上半屏（42%）：商周古战场、全封闭青铜战盔战将、青铜阵门血条与分波水墨妖魔（每 5 波青铜妖王）
 * - 下半屏（58%）：5×5 商周青铜八卦锻炉 + 无倒计时三选一五行拼图槽（单指拖拽自动上移 60px 防遮挡）
 * - 五行炼宝神通 + 天道共鸣（≥2 行/列双倍爆发）+ 肉鸽元始敕令三选一 + 每 3 波天劫异变 + 濒死太乙真火复活
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    const save = platformBridge.getLocalSave();
    this.warlord = getWarlord(data?.warlordId || save.selectedWarlord);

    this.score = 0;
    this.wave = 1;
    this.slainCount = 0;
    this.runEssence = 0;
    this.linesCleared = 0;
    this.piecesPlaced = 0;
    this.elapsedMs = 0;
    this.revived = false;

    this.gateMaxHp = 100;
    this.gateHp = 100;
    this.gateShield = 0;

    // 灵气条（满槽弹出元始敕令三选一）
    this.spiritQi = 0;
    this.spiritQiMax = 90;
    this.decrees = {}; // { decreeId: count }

    // 波次生成状态
    this.waveEnemiesTotal = 6;
    this.waveEnemiesSpawned = 0;
    this.spawnTimerMs = 0;
    this.waveClearPauseMs = 0;

    // 5×5 八卦锻炉矩阵：null | { element: string, sprite: Image } | { sealed: true, sprite: Image }
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    this.trayPieces = [null, null, null]; // 每项：{ shape, element, isPill, container, slotIndex }

    // 单指拖拽状态
    this.dragState = null; // { slotIndex, piece, previewContainer, hoverRow, hoverCol, valid }
    this.isPaused = false;
    this.modalActive = false; // 敕令/复活/暂停弹窗期间冻结战场
    this.isEnded = false;
    this.hitStopMs = 0;

    this.enemies = [];
    this.fxParticles = [];
    this.fogBands = [];
  }

  create() {
    const { width } = GAME_DESIGN;
    this.cameras.main.setBackgroundColor('#0b0a10');
    try { this.scale?.updateBounds?.(); } catch (_) {}

    this._buildBattlefield();
    this._buildBaguaForge();
    this._buildHud();
    this._bindDragAndKeys();

    // 初始发一组 3 块五行拼图
    this._refillTray();

    try {
      platformBridge.gameplayStart({ warlord_id: this.warlord.id });
      synthAudio.startWarDrums(false);
    } catch (_) {}

    this.events.once('shutdown', () => {
      try { synthAudio.stopWarDrums(); } catch (_) {}
    });

    this._refreshHudAndState();
  }

  // =========================================================================
  // 1. 构建上半屏商周古战场（42%）与下半屏 5×5 青铜八卦锻炉（58%）
  // =========================================================================

  _buildBattlefield() {
    const { width, battleTop, battleBottom, gateY } = GAME_DESIGN;
    const battleH = battleBottom - battleTop;

    // 古战场深墨底幕与淡淡青铜地脉线
    this.add.rectangle(width / 2, battleTop + battleH / 2, width, battleH, 0x110e15, 1).setDepth(0);
    for (let x = 90; x < width; x += 90) {
      this.add.rectangle(x, battleTop + battleH / 2, 1, battleH, 0x3b2a1c, 0.25).setDepth(1);
    }

    // 顶部浓雾翻涌带（水墨妖魔从浓雾中分波次现身）
    this.fogBands = [];
    for (let i = 0; i < 6; i++) {
      const fog = this.add.ellipse(
        Phaser.Math.Between(30, width - 30),
        battleTop + Phaser.Math.Between(14, 42),
        Phaser.Math.Between(160, 260),
        Phaser.Math.Between(42, 68),
        0x272030,
        0.52
      ).setDepth(2);
      fog.vx = Phaser.Math.FloatBetween(-18, 18) || 12;
      this.fogBands.push(fog);
    }

    // 商周青铜阵门防线
    this.gateBeam = this.add.rectangle(width / 2, gateY, width - 24, 14, 0x5c3d22, 1).setDepth(5);
    this.gateBeam.setStrokeStyle(2, 0xd99b38, 0.95);

    // 阵门血条与护盾条
    this.add.rectangle(width / 2, gateY + 18, 300, 12, 0x1c1917, 0.95).setStrokeStyle(1, 0x78350f, 0.9).setDepth(6);
    this.gateHpBar = this.add.rectangle(width / 2 - 150, gateY + 18, 300, 10, 0x22c55e).setOrigin(0, 0.5).setDepth(7);
    this.gateShieldBar = this.add.rectangle(width / 2 - 150, gateY + 18, 0, 4, 0x38bdf8).setOrigin(0, 0.5).setDepth(8);
    this.gateHpText = this.add.text(width / 2, gateY + 18, '', {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(9);

    // 阵门底部中央：佩戴全封闭商周青铜战盔的守阵战将背影/侧影
    this.warlordBaseY = gateY - 26;
    this.warlordHalo = this.add.circle(width / 2, this.warlordBaseY + 10, 38, this.warlord.accentHex, 0.14).setDepth(5);
    this.warlordSprite = this.add.image(width / 2, this.warlordBaseY, this.warlord.texture).setScale(0.86).setDepth(10);

    // 妖王专属血条（默认隐藏，每 5 波妖王登场时显示）
    this.bossBarContainer = this.add.container(0, 0).setDepth(15).setVisible(false);
    const bossBg = this.add.rectangle(width / 2, battleTop + 18, 320, 16, 0x1c1917, 0.95).setStrokeStyle(1.5, 0xef4444, 0.95);
    this.bossHpFill = this.add.rectangle(width / 2 - 158, battleTop + 18, 316, 12, 0xdc2626).setOrigin(0, 0.5);
    this.bossBarLabel = this.add.text(width / 2, battleTop + 18, 'BRONZE DEMON KING', {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#fef08a'
    }).setOrigin(0.5);
    this.bossBarContainer.add([bossBg, this.bossHpFill, this.bossBarLabel]);

    // 青铜分隔横梁 + 实时天劫/神通播报栏
    this.add.rectangle(width / 2, 418, width, 26, 0x1c1612, 0.98).setStrokeStyle(1.5, 0x78350f, 0.95).setDepth(12);
    this.bannerText = this.add.text(width / 2, 418, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#fbbf24',
      letterSpacing: 1
    }).setOrigin(0.5).setDepth(13);
  }

  _buildBaguaForge() {
    const { width } = GAME_DESIGN;
    const boardPx = BOARD_SIZE * CELL_SIZE;
    const boardCenterX = ORIGIN_X + boardPx / 2;
    const boardCenterY = ORIGIN_Y + boardPx / 2;

    // 下半屏青铜锻炉暗底
    this.add.rectangle(width / 2, 695, width, 530, 0x0d0b11, 1).setDepth(0);

    // 底层缓慢旋转的商周青铜八卦圆阵装饰
    this.forgeBaguaBg = this.add.image(boardCenterX, boardCenterY, 'baguaRing').setScale(1.88).setAlpha(0.24).setDepth(1);

    // 5×5 青铜八卦外框
    const frame = this.add.rectangle(boardCenterX, boardCenterY, boardPx + 18, boardPx + 18, 0x181312, 0.96).setDepth(2);
    frame.setStrokeStyle(3, 0xb45309, 0.95);

    // 绘制 25 个青铜锻炉凹槽
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cx = ORIGIN_X + c * CELL_SIZE + CELL_SIZE / 2;
        const cy = ORIGIN_Y + r * CELL_SIZE + CELL_SIZE / 2;
        const cell = this.add.rectangle(cx, cy, CELL_SIZE - 4, CELL_SIZE - 4, 0x221b18, 0.92).setDepth(3);
        cell.setStrokeStyle(1.2, 0x4b3624, 0.85);
      }
    }

    // 落点半透明预览层 & 即将消除行/列高亮层
    this.previewGraphics = this.add.graphics().setDepth(24);

    // 底部 3 个待选五行拼图槽位底框（无倒计时，大热区易抓起）
    this.traySlotBgs = [];
    for (let i = 0; i < 3; i++) {
      const sx = TRAY_SLOTS_X[i];
      const slotBg = this.add.rectangle(sx, TRAY_Y, 152, 146, 0x171316, 0.94).setDepth(3);
      slotBg.setStrokeStyle(1.8, 0x5c3d22, 0.9);
      this.traySlotBgs.push(slotBg);
    }
  }

  _buildHud() {
    const { width } = GAME_DESIGN;
    const hudBg = this.add.rectangle(width / 2, 34, width, 68, 0x141012, 0.96).setDepth(20);
    hudBg.setStrokeStyle(1.5, 0x5c3d22, 0.95);

    // 左侧：波次与战功
    this.waveText = this.add.text(14, 12, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#fbbf24'
    }).setDepth(21);

    this.scoreText = this.add.text(14, 38, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#e7e5e4'
    }).setDepth(21);

    // 中间：上方元始灵气条（满槽弹出 3 张青铜竹简元始敕令）
    this.qiLabel = this.add.text(width / 2 - 18, 16, '', {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#5eead4',
      letterSpacing: 1
    }).setOrigin(0.5).setDepth(21);
    this.add.rectangle(width / 2 - 18, 40, 146, 14, 0x1f191a).setStrokeStyle(1.2, 0x0d9488, 0.9).setDepth(21);
    this.qiBar = this.add.rectangle(width / 2 - 91, 40, 0, 10, 0x2dd4bf).setOrigin(0, 0.5).setDepth(22);

    // 右上角：EN/中 切换、音效开关、暂停（宽大矩形热区）
    this.hudLangBtn = this._createMiniBtn(376, 34, 58, 38, i18n.lang === 'en' ? '中' : 'EN', 0x2dd4bf, () => {
      i18n.toggle();
      this._refreshHudAndState();
    });

    this.hudSoundBtn = this._createMiniBtn(440, 34, 50, 38, synthAudio.enabled ? 'SFX' : 'OFF', 0xd99b38, () => {
      this._toggleSound();
    });

    this.hudPauseBtn = this._createMiniBtn(498, 34, 46, 38, 'II', 0xd99b38, () => {
      this._togglePause();
    });
  }

  _createMiniBtn(x, y, w, h, labelText, strokeColor, onClick) {
    const bg = this.add.rectangle(x, y, w, h, 0x1f1816, 0.95).setDepth(22);
    bg.setStrokeStyle(1.5, strokeColor, 0.85);
    bg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-8, -8, w + 16, h + 16),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const label = this.add.text(x, y, labelText, {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#fef08a'
    }).setOrigin(0.5).setDepth(23);
    bg.on('pointerdown', () => {
      try { synthAudio.ensureContext(); synthAudio.playClick(); } catch (_) {}
      try { onClick(); } catch (_) {}
    });
    return { bg, label };
  }

  _refreshHudAndState() {
    const hasBoss = this.enemies.some((e) => e.active && e.kind === 'boss');
    this.waveText.setText(hasBoss ? i18n.t('bossWave', this.wave) : i18n.t('wave', this.wave));
    this.scoreText.setText(i18n.t('scoreLabel', this.score));
    this.qiLabel.setText(`${i18n.t('spiritQi')} ${Math.floor(this.spiritQi)}/${this.spiritQiMax}`);
    this.qiBar.width = Math.round(146 * Phaser.Math.Clamp(this.spiritQi / this.spiritQiMax, 0, 1));

    const hpRatio = Phaser.Math.Clamp(this.gateHp / this.gateMaxHp, 0, 1);
    this.gateHpBar.width = Math.round(300 * hpRatio);
    this.gateHpBar.setFillStyle(hpRatio > 0.45 ? 0x22c55e : (hpRatio > 0.22 ? 0xf59e0b : 0xef4444));
    this.gateShieldBar.width = Math.round(300 * Phaser.Math.Clamp(this.gateShield / this.gateMaxHp, 0, 1));
    this.gateHpText.setText(
      this.gateShield > 0
        ? `${i18n.t('gateHp', Math.ceil(this.gateHp), this.gateMaxHp)} (+${Math.ceil(this.gateShield)})`
        : i18n.t('gateHp', Math.ceil(this.gateHp), this.gateMaxHp)
    );

    this.hudLangBtn.label.setText(i18n.lang === 'en' ? '中' : 'EN');
    this.hudSoundBtn.label.setText(synthAudio.enabled ? 'SFX' : 'OFF');

    // 同步轻量化只读状态快照（供手机触摸拖拽验收测试精准读取盘面与槽位）
    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      let occupied = 0;
      const boardSnap = this.board.map((row) =>
        row.map((cell) => {
          if (!cell) return null;
          occupied += 1;
          return cell.sealed ? 'sealed' : cell.element;
        })
      );
      window.__GAME_STATE__.scene = 'GameScene';
      window.__GAME_STATE__.lang = i18n.lang;
      window.__GAME_STATE__.score = this.score;
      window.__GAME_STATE__.wave = this.wave;
      window.__GAME_STATE__.gateHp = Math.ceil(this.gateHp);
      window.__GAME_STATE__.gateMaxHp = this.gateMaxHp;
      window.__GAME_STATE__.runEssence = this.runEssence;
      window.__GAME_STATE__.linesCleared = this.linesCleared;
      window.__GAME_STATE__.piecesPlaced = this.piecesPlaced;
      window.__GAME_STATE__.occupiedCells = occupied;
      window.__GAME_STATE__.dragging = Boolean(this.dragState);
      window.__GAME_STATE__.dragLiftY = DRAG_LIFT_Y;
      window.__GAME_STATE__.board = boardSnap;
      window.__GAME_STATE__.tray = this.trayPieces.map((p, idx) =>
        p
          ? {
              slotIndex: idx,
              x: TRAY_SLOTS_X[idx],
              y: TRAY_Y,
              shapeId: p.shape.id,
              cells: p.shape.cells,
              element: p.element,
              isPill: Boolean(p.isPill)
            }
          : null
      );
      window.__GAME_STATE__.boardGeom = {
        originX: ORIGIN_X,
        originY: ORIGIN_Y,
        cellSize: CELL_SIZE,
        size: BOARD_SIZE,
        dragLiftY: DRAG_LIFT_Y
      };
      window.__GAME_STATE__.hudButtons = {
        lang: { x: 376, y: 34 },
        sound: { x: 440, y: 34 },
        pause: { x: 498, y: 34 }
      };
      window.__GAME_STATE__.soundEnabled = synthAudio.enabled;
      window.__GAME_STATE__.revived = this.revived;
    }
  }

  // =========================================================================
  // 2. 底部三选一拼图生成、单指拖拽（上移 60px 防遮挡）与落点高亮预览
  // =========================================================================

  _bindDragAndKeys() {
    this.input.keyboard?.on('keydown-P', () => this._togglePause());
    this.input.keyboard?.on('keydown-ESC', () => this._togglePause());
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());

    this.input.on('pointerdown', (pointer) => {
      if (this.isPaused || this.modalActive || this.isEnded || this.dragState) return;
      // 仅在底部待选拼图区响应抓起
      if (pointer.y < 764) return;

      let bestIdx = -1;
      let bestDist = 92;
      for (let i = 0; i < 3; i++) {
        if (!this.trayPieces[i]) continue;
        const dx = Math.abs(pointer.x - TRAY_SLOTS_X[i]);
        if (dx < bestDist) {
          bestDist = dx;
          bestIdx = i;
        }
      }
      if (bestIdx !== -1) {
        try { synthAudio.ensureContext(); } catch (_) {}
        this._startDragging(bestIdx, pointer.x, pointer.y);
      }
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.dragState || !pointer.isDown) return;
      this._updateDragging(pointer.x, pointer.y);
    });

    this.input.on('pointerup', (pointer) => {
      if (!this.dragState) return;
      this._finishDragging(pointer.x, pointer.y);
    });
  }

  _pickRandomShape() {
    const totalW = PIECE_SHAPES.reduce((acc, s) => acc + s.weight, 0);
    let r = Math.random() * totalW;
    for (const s of PIECE_SHAPES) {
      r -= s.weight;
      if (r <= 0) return s;
    }
    return PIECE_SHAPES[0];
  }

  _getShapeBounds(shape) {
    let maxR = 0;
    let maxC = 0;
    for (const [r, c] of shape.cells) {
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    return { rows: maxR + 1, cols: maxC + 1 };
  }

  _createPieceVisual(shape, element, isPill, cellPx, depth = 14) {
    const container = this.add.container(0, 0).setDepth(depth);
    const { rows, cols } = this._getShapeBounds(shape);
    const totalW = cols * cellPx;
    const totalH = rows * cellPx;
    const tex = isPill ? 'tile_pill' : ELEMENTS[element].texture;
    const scale = (cellPx - 4) / 56;

    for (const [r, c] of shape.cells) {
      const lx = c * cellPx + cellPx / 2 - totalW / 2;
      const ly = r * cellPx + cellPx / 2 - totalH / 2;
      const img = this.add.image(lx, ly, tex).setScale(scale);
      container.add(img);
    }
    return container;
  }

  _refillTray(forcePillSlot = false) {
    // 清理残留容器
    for (let i = 0; i < 3; i++) {
      if (this.trayPieces[i]?.container) {
        this.trayPieces[i].container.destroy();
      }
      this.trayPieces[i] = null;
    }

    const shapes = [this._pickRandomShape(), this._pickRandomShape(), this._pickRandomShape()];
    // 智能保护：若随机的 3 块都无法放入当前盘面，尝试将第 1 块替换为可放入的形状（保持流畅体验）
    if (!shapes.some((sh) => this._canShapeFitAnywhere(sh))) {
      const fitShape = PIECE_SHAPES.find((sh) => this._canShapeFitAnywhere(sh));
      if (fitShape) shapes[0] = fitShape;
    }

    for (let i = 0; i < 3; i++) {
      const isPill = forcePillSlot && i === 1;
      const shape = isPill ? PIECE_SHAPES[0] : shapes[i];
      const element = ELEMENT_KEYS[Phaser.Math.Between(0, ELEMENT_KEYS.length - 1)];
      const visual = this._createPieceVisual(shape, element, isPill, 34, 14);
      visual.setPosition(TRAY_SLOTS_X[i], TRAY_Y);
      visual.setScale(0.75);
      this.tweens.add({ targets: visual, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
      this.trayPieces[i] = { shape, element, isPill, container: visual, slotIndex: i };
    }

    this._refreshHudAndState();
    this._checkNoMovesCondition();
  }

  _startDragging(slotIndex, px, py) {
    const piece = this.trayPieces[slotIndex];
    if (!piece) return;
    try { synthAudio.playPickup(); } catch (_) {}

    piece.container.setAlpha(0.22);
    const dragVisual = this._createPieceVisual(piece.shape, piece.element, piece.isPill, CELL_SIZE, 32);
    dragVisual.setAlpha(0.92);

    this.dragState = {
      slotIndex,
      piece,
      dragVisual,
      hoverRow: -1,
      hoverCol: -1,
      valid: false
    };
    this._updateDragging(px, py);
    this._refreshHudAndState();
  }

  _computeDropGrid(shape, pointerX, pointerY) {
    // 核心红线：手机单指拖动时拼图块自动向上偏移 60px，避免手指遮挡落点预览
    const liftCenterX = pointerX;
    const liftCenterY = pointerY - DRAG_LIFT_Y;
    const { rows, cols } = this._getShapeBounds(shape);
    const topLeftX = liftCenterX - (cols * CELL_SIZE) / 2;
    const topLeftY = liftCenterY - (rows * CELL_SIZE) / 2;
    const col = Math.round((topLeftX - ORIGIN_X) / CELL_SIZE);
    const row = Math.round((topLeftY - ORIGIN_Y) / CELL_SIZE);
    return { row, col, liftCenterX, liftCenterY };
  }

  _canPlaceAt(shape, baseRow, baseCol) {
    for (const [dr, dc] of shape.cells) {
      const r = baseRow + dr;
      const c = baseCol + dc;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
      if (this.board[r][c] !== null) return false;
    }
    return true;
  }

  _canShapeFitAnywhere(shape) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this._canPlaceAt(shape, r, c)) return true;
      }
    }
    return false;
  }

  _updateDragging(px, py) {
    if (!this.dragState) return;
    const { piece, dragVisual } = this.dragState;
    const { row, col, liftCenterX, liftCenterY } = this._computeDropGrid(piece.shape, px, py);

    dragVisual.setPosition(liftCenterX, liftCenterY);
    const valid = this._canPlaceAt(piece.shape, row, col);
    this.dragState.hoverRow = row;
    this.dragState.hoverCol = col;
    this.dragState.valid = valid;

    this._renderPlacementPreview(piece, row, col, valid);
  }

  _renderPlacementPreview(piece, baseRow, baseCol, valid) {
    const g = this.previewGraphics;
    g.clear();
    if (!valid) return;

    const color = piece.isPill ? 0xfbbf24 : ELEMENTS[piece.element].hex;

    // 1. 绘制落点半透明高亮预览格
    g.fillStyle(color, 0.34);
    g.lineStyle(2.5, 0xfef08a, 0.92);
    for (const [dr, dc] of piece.shape.cells) {
      const x = ORIGIN_X + (baseCol + dc) * CELL_SIZE + 3;
      const y = ORIGIN_Y + (baseRow + dr) * CELL_SIZE + 3;
      g.fillRoundedRect(x, y, CELL_SIZE - 6, CELL_SIZE - 6, 7);
      g.strokeRoundedRect(x, y, CELL_SIZE - 6, CELL_SIZE - 6, 7);
    }

    // 2. 预演放置后是否会填满整行/整列，并用流光金框高亮即将触发神通的行列
    const simSet = new Set(piece.shape.cells.map(([dr, dc]) => `${baseRow + dr},${baseCol + dc}`));
    const isFilled = (r, c) => {
      if (simSet.has(`${r},${c}`)) return true;
      return Boolean(this.board[r][c] && !this.board[r][c].sealed);
    };

    g.lineStyle(3.5, 0xfde047, 0.95);
    for (let r = 0; r < BOARD_SIZE; r++) {
      let full = true;
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!isFilled(r, c)) { full = false; break; }
      }
      if (full) {
        g.strokeRoundedRect(ORIGIN_X + 2, ORIGIN_Y + r * CELL_SIZE + 2, BOARD_SIZE * CELL_SIZE - 4, CELL_SIZE - 4, 8);
      }
    }
    for (let c = 0; c < BOARD_SIZE; c++) {
      let full = true;
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (!isFilled(r, c)) { full = false; break; }
      }
      if (full) {
        g.strokeRoundedRect(ORIGIN_X + c * CELL_SIZE + 2, ORIGIN_Y + 2, CELL_SIZE - 4, BOARD_SIZE * CELL_SIZE - 4, 8);
      }
    }
  }

  _finishDragging(px, py) {
    const state = this.dragState;
    if (!state) return;
    this._updateDragging(px, py);

    const { slotIndex, piece, dragVisual, hoverRow, hoverCol, valid } = state;
    this.previewGraphics.clear();
    dragVisual.destroy();
    this.dragState = null;

    if (valid && this._canPlaceAt(piece.shape, hoverRow, hoverCol)) {
      this._commitPlacement(slotIndex, piece, hoverRow, hoverCol);
    } else {
      piece.container.setAlpha(1);
      try { synthAudio.playInvalid(); } catch (_) {}
      this._refreshHudAndState();
    }
  }

  _commitPlacement(slotIndex, piece, baseRow, baseCol) {
    // 1. 写入 5×5 阵盘并渲染青铜方块
    const tex = piece.isPill ? 'tile_pill' : ELEMENTS[piece.element].texture;
    for (const [dr, dc] of piece.shape.cells) {
      const r = baseRow + dr;
      const c = baseCol + dc;
      const cx = ORIGIN_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = ORIGIN_Y + r * CELL_SIZE + CELL_SIZE / 2;
      const sprite = this.add.image(cx, cy, tex).setDepth(12).setScale(0.7);
      this.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, duration: 120, ease: 'Back.easeOut' });
      this.board[r][c] = { element: piece.element, isPill: Boolean(piece.isPill), sprite };
    }

    // 消耗该槽位拼图
    if (piece.container) piece.container.destroy();
    this.trayPieces[slotIndex] = null;
    this.piecesPlaced += 1;
    this.score += piece.shape.cells.length * 10;
    try { synthAudio.playPlace(); } catch (_) {}

    // 2. 若为天劫「真假灵丹」块，落子后即刻揭晓吉凶！
    if (piece.isPill) {
      this._resolveMysticElixir(baseRow, baseCol);
    }

    // 3. 检测整行/整列消除与五行神通轰击
    this._resolveLineClears();

    // 4. 若 3 个槽位全部放完，立即刷新下一组 3 块
    if (this.trayPieces.every((p) => p === null)) {
      this._refillTray(false);
    } else {
      this._refreshHudAndState();
      this._checkNoMovesCondition();
    }
  }

  _resolveMysticElixir(row, col) {
    const isReal = Math.random() < 0.7;
    const cx = ORIGIN_X + col * CELL_SIZE + CELL_SIZE / 2;
    const cy = ORIGIN_Y + row * CELL_SIZE + CELL_SIZE / 2;
    if (isReal) {
      // 太上金丹：清空自身，释放全五行震荡波并回血
      if (this.board[row][col]?.sprite) this.board[row][col].sprite.destroy();
      this.board[row][col] = null;
      this._healGate(18, 12);
      this._damageAllEnemies(55, false, 0xfbbf24);
      this._showBanner(i18n.t('realPillMsg'), '#fde047');
      this._spawnBurst(cx, cy, 16, 0xfbbf24, 'spark');
      try { synthAudio.playResonance(); } catch (_) {}
    } else {
      // 魔化伪丹：刷出一只急速妖影突袭（击杀可赚额外精魄）
      this._spawnEnemy('wraith', Phaser.Math.Between(100, GAME_DESIGN.width - 100));
      this._showBanner(i18n.t('fakePillMsg'), '#f87171');
      this._spawnBurst(cx, cy, 12, 0xa855f7, 'shard');
      try { synthAudio.playTribulation(); } catch (_) {}
    }
  }

  // =========================================================================
  // 3. 五行炼宝消除、天道共鸣（≥2 行/列）与五大法宝神通特效
  // =========================================================================

  _resolveLineClears() {
    const fullRows = [];
    const fullCols = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      let ok = true;
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!this.board[r][c] || this.board[r][c].sealed) { ok = false; break; }
      }
      if (ok) fullRows.push(r);
    }

    for (let c = 0; c < BOARD_SIZE; c++) {
      let ok = true;
      for (let r = 0; r < BOARD_SIZE; r++) {
        if (!this.board[r][c] || this.board[r][c].sealed) { ok = false; break; }
      }
      if (ok) fullCols.push(c);
    }

    const totalLines = fullRows.length + fullCols.length;
    if (totalLines === 0) return;

    // 统计每条消除行/列的主导五行元素
    const lineCasts = [];
    const pickDominant = (cells) => {
      const counts = {};
      for (const cell of cells) {
        if (cell && cell.element) counts[cell.element] = (counts[cell.element] || 0) + 1;
      }
      let best = 'fire';
      let bestN = -1;
      for (const k of ELEMENT_KEYS) {
        if ((counts[k] || 0) > bestN) { bestN = counts[k] || 0; best = k; }
      }
      return best;
    };

    for (const r of fullRows) {
      const cells = [];
      for (let c = 0; c < BOARD_SIZE; c++) cells.push(this.board[r][c]);
      lineCasts.push({ element: pickDominant(cells), colHint: 2 });
    }
    for (const c of fullCols) {
      const cells = [];
      for (let r = 0; r < BOARD_SIZE; r++) cells.push(this.board[r][c]);
      lineCasts.push({ element: pickDominant(cells), colHint: c });
    }

    // 收集所有待消除格坐标
    const clearSet = new Set();
    for (const r of fullRows) for (let c = 0; c < BOARD_SIZE; c++) clearSet.add(`${r},${c}`);
    for (const c of fullCols) for (let r = 0; r < BOARD_SIZE; r++) clearSet.add(`${r},${c}`);

    // 相邻紫雷封印格自动破封解锁
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const brokenSeals = new Set();
    for (const key of clearSet) {
      const [r, c] = key.split(',').map(Number);
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
          if (this.board[nr][nc]?.sealed) brokenSeals.add(`${nr},${nc}`);
        }
      }
    }

    // 执行格子消除动画与粒子爆裂
    for (const key of clearSet) {
      const [r, c] = key.split(',').map(Number);
      const cell = this.board[r][c];
      if (!cell) continue;
      const cx = ORIGIN_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = ORIGIN_Y + r * CELL_SIZE + CELL_SIZE / 2;
      const tint = cell.element ? ELEMENTS[cell.element].hex : 0xfbbf24;
      this._spawnBurst(cx, cy, 5, tint, 'spark');
      if (cell.sprite) cell.sprite.destroy();
      this.board[r][c] = null;
    }

    for (const key of brokenSeals) {
      const [r, c] = key.split(',').map(Number);
      const cell = this.board[r][c];
      if (cell?.sprite) cell.sprite.destroy();
      this.board[r][c] = null;
      const cx = ORIGIN_X + c * CELL_SIZE + CELL_SIZE / 2;
      const cy = ORIGIN_Y + r * CELL_SIZE + CELL_SIZE / 2;
      this._spawnBurst(cx, cy, 10, 0xc084fc, 'shard');
      this._addSpiritQi(18);
      this._showFloatingText(cx, cy - 12, i18n.t('sealBroken'), '#d8b4fe', '15px');
    }

    this.linesCleared += totalLines;
    const isResonance = totalLines >= 2;
    const resonanceMult = isResonance ? (this.warlord.bonus.resonanceMult || 2.0) : 1.0;

    this.score += Math.round(totalLines * 120 * resonanceMult);
    this._addSpiritQi(totalLines * 14);

    // 肉鸽敕令：青莲圣愈（每次消行自动回血与护盾）
    const bastionStacks = this.decrees.wood_bastion || 0;
    if (bastionStacks > 0) {
      this._healGate(8 * bastionStacks, 6 * bastionStacks);
    }

    // 战将出招动作脉冲
    this.tweens.add({
      targets: this.warlordSprite,
      y: this.warlordBaseY - 12,
      scaleX: 0.96,
      scaleY: 0.96,
      duration: 110,
      yoyo: true
    });

    if (isResonance) {
      try { synthAudio.playResonance(); } catch (_) {}
      this.cameras.main.shake(170, 0.01);
      this._showBanner(`${i18n.t('resonanceTitle')} ${i18n.t('resonanceBonus')}`, '#fde047');
      this._showFloatingText(GAME_DESIGN.width / 2, 210, i18n.t('resonanceTitle'), '#fde047', '26px');
      try {
        platformBridge.trackEvent('heavenly_resonance', {
          lines: totalLines,
          wave: this.wave,
          score: this.score
        });
      } catch (_) {}

      // 雷震子被动：天道共鸣追加紫雷全屏打击
      if (this.warlord.bonus.resonanceZap) {
        this._damageAllEnemies(45, true, 0xc084fc);
      }
      // 敕令：天道回响（额外砸落一座番天印）
      if ((this.decrees.resonance_echo || 0) > 0) {
        this._castEarthSeal(1.5);
      }
    }

    // 按各消除行/列主导元素依次轰出神通
    lineCasts.forEach((cast, idx) => {
      this.time.delayedCall(idx * 90, () => {
        if (!this.isEnded) {
          this._castElementSkill(cast.element, resonanceMult, idx + 1, cast.colHint);
        }
      });
    });

    try {
      platformBridge.trackEvent('line_clear', {
        lines: totalLines,
        resonance: isResonance ? 1 : 0,
        elements: lineCasts.map((x) => x.element).join(','),
        wave: this.wave
      });
    } catch (_) {}

    this._refreshHudAndState();
  }

  _castElementSkill(element, mult = 1, comboStep = 1, colHint = 2) {
    try { synthAudio.playElementCast(element, comboStep); } catch (_) {}
    const label = i18n.pack.elements[element] || '';
    if (label) {
      this._showFloatingText(this.warlordSprite.x, this.warlordBaseY - 46, label, ELEMENTS[element].css, '18px');
    }

    if (element === 'fire') this._castFireSpear(mult, colHint);
    else if (element === 'metal') this._castMetalWhip(mult);
    else if (element === 'earth') this._castEarthSeal(mult);
    else if (element === 'water') this._castWaterSilk(mult);
    else this._castWoodLotus(mult);
  }

  /** 火 → 火尖枪：穿透火焰光束直贯战场 */
  _castFireSpear(mult, colHint) {
    const splitStacks = this.decrees.fire_split || 0;
    const wlMult = this.warlord.bonus.fireDmgMult || 1.0;
    const dmg = Math.round(52 * mult * wlMult * (1 + splitStacks * 0.35));

    // 优先瞄准当前最靠近阵门的妖魔 X，否则使用对应列 X
    const target = this._findClosestEnemy();
    const centerX = target ? target.x : ORIGIN_X + colHint * CELL_SIZE + CELL_SIZE / 2;
    const angles = splitStacks > 0 ? [-0.24, 0, 0.24] : [0];

    for (const ang of angles) {
      const startX = this.warlordSprite.x;
      const startY = this.warlordBaseY - 18;
      const endX = Phaser.Math.Clamp(centerX + Math.sin(ang) * 280, 26, GAME_DESIGN.width - 26);
      const endY = GAME_DESIGN.battleTop + 8;

      const g = this.add.graphics().setDepth(16);
      g.lineStyle(14, 0xef4444, 0.45);
      g.beginPath();
      g.moveTo(startX, startY);
      g.lineTo(endX, endY);
      g.strokePath();
      g.lineStyle(5, 0xfef08a, 0.98);
      g.beginPath();
      g.moveTo(startX, startY);
      g.lineTo(endX, endY);
      g.strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 280, onComplete: () => g.destroy() });

      // 穿透火焰线沿途妖魔
      const pierceCap = 4 + (this.warlord.bonus.fireExtraPierce || 0) + splitStacks * 2;
      let hitCount = 0;
      for (const e of [...this.enemies]) {
        if (!e.active || hitCount >= pierceCap) continue;
        const dist = this._distToSegment(e.x, e.y, startX, startY, endX, endY);
        if (dist <= e.radius + 26) {
          hitCount += 1;
          this._damageEnemy(e, dmg, false, 0xef4444);
        }
      }
    }
  }

  /** 金 → 打神鞭：多目标连锁金色闪电 */
  _castMetalWhip(mult) {
    const extraChain = (this.decrees.metal_chain || 0) * 2 + (this.warlord.bonus.metalExtraChain || 0);
    const maxTargets = 3 + extraChain;
    const dmg = Math.round(44 * mult);
    const alive = this.enemies.filter((e) => e.active).sort((a, b) => b.y - a.y).slice(0, maxTargets);
    if (!alive.length) return;

    const g = this.add.graphics().setDepth(16);
    let prevX = this.warlordSprite.x;
    let prevY = this.warlordBaseY - 22;

    for (const e of alive) {
      const midX = (prevX + e.x) / 2 + Phaser.Math.Between(-22, 22);
      const midY = (prevY + e.y) / 2 + Phaser.Math.Between(-16, 16);
      g.lineStyle(7, 0xfbbf24, 0.45);
      g.beginPath();
      g.moveTo(prevX, prevY);
      g.lineTo(midX, midY);
      g.lineTo(e.x, e.y);
      g.strokePath();
      g.lineStyle(2.8, 0xfef08a, 1);
      g.beginPath();
      g.moveTo(prevX, prevY);
      g.lineTo(midX, midY);
      g.lineTo(e.x, e.y);
      g.strokePath();

      this._damageEnemy(e, dmg, Boolean(this.warlord.bonus.armorPierce), 0xfbbf24);
      prevX = e.x;
      prevY = e.y;
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
  }

  /** 土 → 番天印：天降范围砸击（带屏幕震动 + 60ms 顿帧反馈） */
  _castEarthSeal(mult) {
    const stunStacks = this.decrees.earth_stun || 0;
    const target = this._findClosestEnemy();
    const tx = target ? target.x : GAME_DESIGN.width / 2;
    const ty = target ? target.y : 220;
    const radius = 118 + stunStacks * 28;
    const dmg = Math.round(62 * mult);

    const stamp = this.add.image(tx, ty - 95, 'sealStamp').setDepth(17).setScale(1.45).setAlpha(0.92);
    this.tweens.add({
      targets: stamp,
      y: ty,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 145,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        // 砸地瞬间触发 60ms 顿帧 + 强震屏 + 青铜冲击波
        this.hitStopMs = 60;
        this.cameras.main.shake(190, 0.014);
        this._spawnBurst(tx, ty, 16, 0xf59e0b, 'shard');

        const waveRing = this.add.circle(tx, ty, 24, 0xd97706, 0.2).setStrokeStyle(4, 0xfef08a, 0.95).setDepth(16);
        this.tweens.add({
          targets: waveRing,
          scaleX: radius / 24,
          scaleY: radius / 24,
          alpha: 0,
          duration: 300,
          onComplete: () => waveRing.destroy()
        });

        for (const e of [...this.enemies]) {
          if (!e.active) continue;
          if (Phaser.Math.Distance.Between(tx, ty, e.x, e.y) <= radius + e.radius) {
            this._damageEnemy(e, dmg, false, 0xf59e0b);
            if (stunStacks > 0 && e.active) {
              e.stunMs = Math.max(e.stunMs, 2200);
            }
          }
        }

        this.tweens.add({
          targets: stamp,
          alpha: 0,
          scaleX: 1.25,
          scaleY: 1.25,
          duration: 240,
          onComplete: () => stamp.destroy()
        });
      }
    });
  }

  /** 水 → 混天绫：全屏击退减速波 */
  _castWaterSilk(mult) {
    const surgeStacks = this.decrees.water_surge || 0;
    const pushDist = Math.round((68 + surgeStacks * 34) * Math.min(1.5, mult));
    const dmg = Math.round((24 + surgeStacks * 22) * mult);

    const wave = this.add.rectangle(GAME_DESIGN.width / 2, GAME_DESIGN.gateY - 12, GAME_DESIGN.width - 20, 18, 0x06b6d4, 0.65).setDepth(16);
    wave.setStrokeStyle(3, 0xa5f3fc, 0.95);
    this.tweens.add({
      targets: wave,
      y: GAME_DESIGN.battleTop + 14,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => wave.destroy()
    });

    for (const e of [...this.enemies]) {
      if (!e.active) continue;
      e.y = Math.max(GAME_DESIGN.battleTop + 26, e.y - (e.kind === 'boss' ? pushDist * 0.45 : pushDist));
      e.slowMs = Math.max(e.slowMs, 3500);
      this._damageEnemy(e, dmg, false, 0x22d3ee);
    }
  }

  /** 木 → 青莲阵门回血与护盾 */
  _castWoodLotus(mult) {
    const heal = Math.round((16 + (this.warlord.bonus.woodBonusHeal || 0)) * mult);
    const shield = Math.round(14 * mult);
    this._healGate(heal, shield);

    const ring = this.add.circle(GAME_DESIGN.width / 2, GAME_DESIGN.gateY - 14, 28, 0x10b981, 0.24).setDepth(15);
    ring.setStrokeStyle(3.5, 0x6ee7b7, 0.95);
    this.tweens.add({
      targets: ring,
      scaleX: 4.5,
      scaleY: 1.8,
      alpha: 0,
      duration: 420,
      onComplete: () => ring.destroy()
    });
  }

  _healGate(hpGain, shieldGain = 0) {
    this.gateHp = Math.min(this.gateMaxHp, this.gateHp + hpGain);
    this.gateShield = Math.min(this.gateMaxHp, this.gateShield + shieldGain);
    this._showFloatingText(GAME_DESIGN.width / 2, GAME_DESIGN.gateY - 38, `+${hpGain} HP`, '#34d399', '16px');
    this._refreshHudAndState();
  }

  // =========================================================================
  // 4. 上半屏水墨妖魔波次与每 3 波天劫异变
  // =========================================================================

  _spawnEnemy(forceKind = null, forceX = null) {
    const { width, battleTop } = GAME_DESIGN;
    const isBossWave = this.wave % 5 === 0;
    let kind = forceKind;

    if (!kind) {
      if (isBossWave && this.waveEnemiesSpawned === this.waveEnemiesTotal - 1) {
        kind = 'boss';
      } else {
        const roll = Math.random();
        if (this.wave >= 3 && roll > 0.72) kind = 'golem';
        else if (this.wave >= 2 && roll > 0.48) kind = 'wraith';
        else kind = 'grunt';
      }
    }

    const scaleWave = 1 + (this.wave - 1) * 0.22;
    const specs = {
      grunt: { tex: 'enemy_grunt', hp: Math.round(48 * scaleWave), speed: 24 + this.wave * 1.6, armor: 0, dmg: 12, radius: 22, qi: 16, essence: 3 },
      golem: { tex: 'enemy_golem', hp: Math.round(92 * scaleWave), speed: 16 + this.wave * 1.1, armor: 0.42, dmg: 20, radius: 26, qi: 24, essence: 6 },
      wraith: { tex: 'enemy_wraith', hp: Math.round(34 * scaleWave), speed: 40 + this.wave * 2.2, armor: 0, dmg: 10, radius: 19, qi: 18, essence: 4 },
      boss: { tex: 'enemy_boss', hp: Math.round(360 * scaleWave), speed: 13 + this.wave * 0.6, armor: 0.28, dmg: 38, radius: 40, qi: 50, essence: 22 }
    };
    const sp = specs[kind];
    const x = forceX !== null ? forceX : Phaser.Math.Between(56, width - 56);
    const y = battleTop + 26;

    const sprite = this.add.image(x, y, sp.tex).setDepth(kind === 'boss' ? 11 : 8);
    const hpBg = this.add.rectangle(x, y - sp.radius - 8, kind === 'boss' ? 76 : 42, 6, 0x1c1917, 0.9).setDepth(12);
    const hpFill = this.add.rectangle(x - (kind === 'boss' ? 38 : 21), y - sp.radius - 8, kind === 'boss' ? 76 : 42, 4, kind === 'boss' ? 0xef4444 : 0xf97316)
      .setOrigin(0, 0.5)
      .setDepth(13);

    const enemy = {
      active: true,
      kind,
      x,
      y,
      hp: sp.hp,
      maxHp: sp.hp,
      speed: sp.speed,
      armor: sp.armor,
      dmg: sp.dmg,
      radius: sp.radius,
      qi: sp.qi,
      essence: sp.essence,
      slowMs: 0,
      stunMs: 0,
      sprite,
      hpBg,
      hpFill
    };
    this.enemies.push(enemy);

    if (kind === 'boss') {
      try { synthAudio.setBossDrumMode(true); synthAudio.playTribulation(); } catch (_) {}
      this.bossBarContainer.setVisible(true);
      this._updateBossBar(enemy);
      this._showBanner(i18n.t('bossWave', this.wave), '#f87171');
    }
  }

  _updateBossBar(boss) {
    if (!boss || !boss.active) {
      this.bossBarContainer.setVisible(false);
      try { synthAudio.setBossDrumMode(false); } catch (_) {}
      return;
    }
    this.bossBarContainer.setVisible(true);
    this.bossHpFill.width = Math.round(316 * Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1));
  }

  _damageEnemy(enemy, rawDmg, ignoreArmor = false, tint = 0xfbbf24) {
    if (!enemy || !enemy.active) return;
    const armorCut = (ignoreArmor || this.warlord.bonus.armorPierce) ? 0 : enemy.armor;
    const finalDmg = Math.max(4, Math.round(rawDmg * (1 - armorCut)));
    enemy.hp -= finalDmg;

    // 受击闪白
    enemy.sprite.setTintFill(0xffffff);
    this.time.delayedCall(75, () => {
      if (enemy.active && enemy.sprite) enemy.sprite.clearTint();
    });
    this._showFloatingText(enemy.x, enemy.y - 16, `-${finalDmg}`, '#fef08a', '15px');

    if (enemy.hp <= 0) {
      this._killEnemy(enemy, tint);
    } else {
      const barW = enemy.kind === 'boss' ? 76 : 42;
      enemy.hpFill.width = Math.max(2, Math.round(barW * (enemy.hp / enemy.maxHp)));
      if (enemy.kind === 'boss') this._updateBossBar(enemy);
    }
  }

  _damageAllEnemies(dmg, ignoreArmor, tint) {
    for (const e of [...this.enemies]) {
      if (e.active) this._damageEnemy(e, dmg, ignoreArmor, tint);
    }
  }

  _killEnemy(enemy, tint) {
    enemy.active = false;
    this._spawnBurst(enemy.x, enemy.y, enemy.kind === 'boss' ? 22 : 9, tint, 'shard');
    enemy.sprite.destroy();
    enemy.hpBg.destroy();
    enemy.hpFill.destroy();

    if (enemy.kind === 'boss') {
      this._updateBossBar(null);
      this.cameras.main.shake(200, 0.015);
    }

    this.slainCount += 1;
    const greedMult = 1 + (this.decrees.forge_greed || 0) * 0.35;
    this.runEssence += Math.max(1, Math.round(enemy.essence * greedMult));
    this.score += enemy.kind === 'boss' ? 450 : 65;
    this._addSpiritQi(enemy.qi);
    this._refreshHudAndState();
  }

  _addSpiritQi(amount) {
    const mult = this.warlord.bonus.qiGainMult || 1.0;
    this.spiritQi += amount * mult;
    if (this.spiritQi >= this.spiritQiMax && !this.modalActive && !this.isEnded) {
      this.spiritQi -= this.spiritQiMax;
      this.spiritQiMax = Math.round(this.spiritQiMax * 1.25);
      this._openDecreeModal();
    }
  }

  _advanceWave() {
    this.wave += 1;
    this.waveEnemiesSpawned = 0;
    this.waveEnemiesTotal = 6 + Math.min(14, this.wave * 2);
    this.spawnTimerMs = 800;
    this.score += 150;

    // 每 3 波随机触发一次反套路「天劫异变」
    if (this.wave % 3 === 0) {
      this._triggerTribulation();
    }
    this._refreshHudAndState();
  }

  /**
   * 每 3 波反套路「天劫异变」：
   * 1) 八卦盘顺时针旋转 90°
   * 2) 紫雷封印 2 个空格（旁消可破封）
   * 3) 刷出高风险高回报「真假灵丹」1×1 块
   */
  _triggerTribulation() {
    const types = ['rotate', 'seal', 'pill'];
    const chosen = types[Phaser.Math.Between(0, types.length - 1)];
    try { synthAudio.playTribulation(); } catch (_) {}
    this.cameras.main.shake(150, 0.01);

    try {
      platformBridge.trackEvent('tribulation_trigger', {
        tribulation_type: chosen,
        wave: this.wave
      });
    } catch (_) {}

    if (chosen === 'rotate') {
      // 5×5 八卦盘顺时针旋转 90°
      const next = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          const cell = this.board[r][c];
          if (!cell) continue;
          const nr = c;
          const nc = BOARD_SIZE - 1 - r;
          next[nr][nc] = cell;
          const nx = ORIGIN_X + nc * CELL_SIZE + CELL_SIZE / 2;
          const ny = ORIGIN_Y + nr * CELL_SIZE + CELL_SIZE / 2;
          if (cell.sprite) {
            this.tweens.add({ targets: cell.sprite, x: nx, y: ny, duration: 280, ease: 'Back.easeOut' });
          }
        }
      }
      this.board = next;
      this._showBanner(i18n.t('tribulationRotate'), '#c084fc');
    } else if (chosen === 'seal') {
      // 紫雷封印最多 2 个空格
      const empties = [];
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (!this.board[r][c]) empties.push([r, c]);
        }
      }
      Phaser.Utils.Array.Shuffle(empties);
      const targets = empties.slice(0, Math.min(2, empties.length));
      for (const [r, c] of targets) {
        const cx = ORIGIN_X + c * CELL_SIZE + CELL_SIZE / 2;
        const cy = ORIGIN_Y + r * CELL_SIZE + CELL_SIZE / 2;
        const sp = this.add.image(cx, cy, 'tile_sealed').setDepth(12).setScale(0.5);
        this.tweens.add({ targets: sp, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
        this.board[r][c] = { sealed: true, sprite: sp };
        this._spawnBurst(cx, cy, 8, 0xa855f7, 'spark');
      }
      this._showBanner(i18n.t('tribulationSeal'), '#d8b4fe');
    } else {
      // 在任意空闲或第 2 个槽位注入 1×1「真假灵丹」诱饵块
      const idx = this.trayPieces.findIndex((p) => p !== null);
      const slot = idx >= 0 ? idx : 1;
      if (this.trayPieces[slot]?.container) this.trayPieces[slot].container.destroy();
      const shape = PIECE_SHAPES[0];
      const visual = this._createPieceVisual(shape, 'fire', true, 36, 14);
      visual.setPosition(TRAY_SLOTS_X[slot], TRAY_Y);
      this.trayPieces[slot] = { shape, element: 'fire', isPill: true, container: visual, slotIndex: slot };
      this._showBanner(i18n.t('tribulationPill'), '#fde047');
    }
    this._refreshHudAndState();
  }

  // =========================================================================
  // 5. 局内肉鸽「元始敕令」青铜竹简三选一（含激励广告重抽）
  // =========================================================================

  _openDecreeModal() {
    this.modalActive = true;
    try { synthAudio.playDecree(); } catch (_) {}
    this._renderDecreeModal(false);
  }

  _renderDecreeModal(isReroll = false) {
    if (this.decreeModal) {
      this.decreeModal.destroy();
      this.decreeModal = null;
    }

    const { width, height } = GAME_DESIGN;
    const container = this.add.container(0, 0).setDepth(55);
    this.decreeModal = container;

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const panel = this.add.rectangle(width / 2, height / 2, 470, 620, 0x161214, 0.98);
    panel.setStrokeStyle(2.5, 0xeab308, 0.95);

    const title = this.add.text(width / 2, height / 2 - 258, i18n.t('decreeTitle'), {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#eab308',
      letterSpacing: 3
    }).setOrigin(0.5);

    const sub = this.add.text(width / 2, height / 2 - 222, isReroll ? i18n.t('decreeRerolled') : i18n.t('decreeSub'), {
      fontSize: '14px',
      fontStyle: 'bold',
      color: isReroll ? '#34d399' : '#a8a29e'
    }).setOrigin(0.5);

    container.add([dim, panel, title, sub]);

    // 随机抽取 3 张青铜竹简强化卡
    const picks = Phaser.Utils.Array.Shuffle([...DECREE_POOL]).slice(0, 3);
    picks.forEach((card, idx) => {
      const cy = height / 2 - 122 + idx * 126;
      const meta = i18n.pack.decrees[card.id];
      const slipBg = this.add.rectangle(width / 2, cy, 412, 106, 0x221a16, 0.98);
      slipBg.setStrokeStyle(2.2, card.color, 0.95);
      slipBg.setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-10, -10, 432, 126),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        useHandCursor: true
      });

      const icon = this.add.image(width / 2 - 166, cy, ELEMENTS[card.element].texture).setScale(0.84);
      const nameTxt = this.add.text(width / 2 - 122, cy - 20, meta.name, {
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#fef08a'
      }).setOrigin(0, 0.5);
      const descTxt = this.add.text(width / 2 - 122, cy + 14, meta.desc, {
        fontSize: '13px',
        color: '#d6d3d1',
        wordWrap: { width: 310 }
      }).setOrigin(0, 0.5);

      slipBg.on('pointerdown', () => {
        this._applyDecree(card.id);
        container.destroy();
        this.decreeModal = null;
        this.modalActive = false;
      });

      container.add([slipBg, icon, nameTxt, descTxt]);
    });

    // 底部激励广告重抽按钮：REROLL DECREES (AD)
    const rerollBg = this.add.rectangle(width / 2, height / 2 + 244, 340, 52, 0x7c3aed, 1);
    rerollBg.setStrokeStyle(2, 0xc4b5fd, 0.95);
    rerollBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-12, -12, 364, 76),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const rerollTxt = this.add.text(width / 2, height / 2 + 244, i18n.t('decreeReroll'), {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    let rerolling = false;
    rerollBg.on('pointerdown', async () => {
      if (rerolling) return;
      rerolling = true;
      const res = await platformBridge.showRewardedBreak('reroll_decree');
      rerolling = false;
      if (!this.decreeModal) return;
      if (res.granted) {
        try {
          synthAudio.playDecree();
          platformBridge.trackEvent('rewarded_reroll', { wave: this.wave });
        } catch (_) {}
        this._renderDecreeModal(true);
      } else {
        sub.setText(i18n.t('adSkipped')).setColor('#f87171');
      }
    });

    container.add([rerollBg, rerollTxt]);
  }

  _applyDecree(decreeId) {
    this.decrees[decreeId] = (this.decrees[decreeId] || 0) + 1;
    try {
      synthAudio.playDecree();
      platformBridge.trackEvent('decree_pick', { decree_id: decreeId, wave: this.wave });
    } catch (_) {}

    if (decreeId === 'iron_gate') {
      this.gateMaxHp += 40;
      this._healGate(40, 15);
    }
    if (this.warlord.bonus.decreeHeal) {
      this._healGate(this.warlord.bonus.decreeHeal, 8);
    }
    this._refreshHudAndState();
  }

  // =========================================================================
  // 6. 死局/濒死判定与「太乙真火」激励复活
  // =========================================================================

  _checkNoMovesCondition() {
    if (this.isEnded || this.modalActive) return;
    const remaining = this.trayPieces.filter((p) => p !== null);
    if (!remaining.length) return;
    const canFitAny = remaining.some((p) => this._canShapeFitAnywhere(p.shape));
    if (!canFitAny) {
      this._triggerNearDeath(i18n.t('noMovesHint'));
    }
  }

  _triggerNearDeath(reasonText) {
    if (this.isEnded || this.modalActive) return;
    if (!this.revived) {
      this._openTaiyiReviveModal(reasonText);
    } else {
      this._finishRun();
    }
  }

  _openTaiyiReviveModal(reasonText) {
    this.modalActive = true;
    try { synthAudio.stopWarDrums(); } catch (_) {}
    const { width, height } = GAME_DESIGN;
    const container = this.add.container(0, 0).setDepth(60);
    this.reviveModal = container;

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.82)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const box = this.add.rectangle(width / 2, height / 2, 436, 368, 0x1a1214, 0.98);
    box.setStrokeStyle(2.5, 0xef4444, 0.95);

    const warn = this.add.text(width / 2, height / 2 - 134, reasonText, {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#f87171'
    }).setOrigin(0.5);

    const title = this.add.text(width / 2, height / 2 - 86, i18n.t('reviveTitle'), {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#fde047'
    }).setOrigin(0.5);

    const desc = this.add.text(width / 2, height / 2 - 22, i18n.t('reviveDesc'), {
      fontSize: '14px',
      color: '#e7e5e4',
      align: 'center',
      lineSpacing: 6
    }).setOrigin(0.5);

    const revBg = this.add.rectangle(width / 2, height / 2 + 64, 356, 58, 0xdc2626, 1);
    revBg.setStrokeStyle(2, 0xfbbf24, 0.95);
    revBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-12, -12, 380, 82),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const revTxt = this.add.text(width / 2, height / 2 + 64, i18n.t('reviveBtn'), {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#fffbeb'
    }).setOrigin(0.5);

    const endBg = this.add.rectangle(width / 2, height / 2 + 134, 240, 44, 0x262022, 1);
    endBg.setStrokeStyle(1.5, 0x57534e, 0.9);
    endBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-10, -10, 260, 64),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const endTxt = this.add.text(width / 2, height / 2 + 134, i18n.t('giveUpBtn'), {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#a8a29e'
    }).setOrigin(0.5);

    let busy = false;
    revBg.on('pointerdown', async () => {
      if (busy) return;
      busy = true;
      const res = await platformBridge.showRewardedBreak('revive_taiyi');
      busy = false;
      if (!this.reviveModal) return;
      if (res.granted) {
        container.destroy();
        this.reviveModal = null;
        this._executeTaiyiRevive();
      } else {
        warn.setText(i18n.t('adSkipped'));
      }
    });

    endBg.on('pointerdown', () => {
      container.destroy();
      this.reviveModal = null;
      this.modalActive = false;
      this._finishRun();
    });

    container.add([dim, box, warn, title, desc, revBg, revTxt, endBg, endTxt]);
  }

  /**
   * 执行「太乙真火」复活：焚清最拥挤的 2 行、击退妖魔、回复 60% 阵门血量、刷新 3 块新拼图
   */
  _executeTaiyiRevive() {
    this.revived = true;
    this.modalActive = false;

    // 找出最拥挤的 2 行清空
    const rowCounts = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      let cnt = 0;
      for (let c = 0; c < BOARD_SIZE; c++) if (this.board[r][c]) cnt += 1;
      rowCounts.push({ r, cnt });
    }
    rowCounts.sort((a, b) => b.cnt - a.cnt);
    const clearRows = rowCounts.slice(0, 2).map((x) => x.r);

    for (const r of clearRows) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = this.board[r][c];
        if (cell?.sprite) cell.sprite.destroy();
        this.board[r][c] = null;
        const cx = ORIGIN_X + c * CELL_SIZE + CELL_SIZE / 2;
        const cy = ORIGIN_Y + r * CELL_SIZE + CELL_SIZE / 2;
        this._spawnBurst(cx, cy, 7, 0xf97316, 'spark');
      }
    }

    // 击退近门妖魔并造成真火灼伤
    for (const e of [...this.enemies]) {
      if (!e.active) continue;
      e.y = Math.max(GAME_DESIGN.battleTop + 32, e.y - 130);
      this._damageEnemy(e, 55, true, 0xef4444);
    }

    this.gateHp = Math.max(this.gateHp, Math.round(this.gateMaxHp * 0.6));
    this.gateShield = Math.max(this.gateShield, 25);

    this._refillTray(false);
    this.cameras.main.shake(220, 0.014);
    try {
      synthAudio.playRevive();
      synthAudio.startWarDrums(this.enemies.some((e) => e.active && e.kind === 'boss'));
      platformBridge.trackEvent('rewarded_revive', { wave: this.wave, score: this.score });
    } catch (_) {}

    this._showBanner(i18n.t('reviveTitle'), '#fde047');
    this._refreshHudAndState();
  }

  _finishRun() {
    if (this.isEnded) return;
    this.isEnded = true;
    try { synthAudio.stopWarDrums(); } catch (_) {}
    try { platformBridge.gameplayStop(); } catch (_) {}

    const durationSec = Math.max(1, Math.round(this.elapsedMs / 1000));
    try {
      platformBridge.trackEvent('game_over', {
        score: this.score,
        wave: this.wave,
        slain: this.slainCount,
        run_essence: this.runEssence,
        lines_cleared: this.linesCleared,
        duration_sec: durationSec,
        revived: this.revived ? 1 : 0,
        warlord_id: this.warlord.id
      });
    } catch (_) {}

    this.time.delayedCall(260, () => {
      this.scene.start('ResultScene', {
        score: this.score,
        wave: this.wave,
        slainCount: this.slainCount,
        runEssence: this.runEssence,
        durationSec,
        revived: this.revived,
        warlordId: this.warlord.id
      });
    });
  }

  // =========================================================================
  // 7. 暂停、音效、辅助几何与主循环（含 60ms 顿帧）
  // =========================================================================

  _toggleSound() {
    const next = !synthAudio.enabled;
    try {
      synthAudio.setEnabled(next);
      if (next) { synthAudio.ensureContext(); synthAudio.playClick(); }
    } catch (_) {}
    this._refreshHudAndState();
    try {
      platformBridge.saveCloudProgress({ soundEnabled: next }).catch(() => {});
    } catch (_) {}
  }

  _togglePause() {
    if (this.isEnded || this.decreeModal || this.reviveModal) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      try { synthAudio.stopWarDrums(); platformBridge.gameplayStop(); } catch (_) {}
      this._showPauseOverlay();
    } else {
      if (this.pauseOverlay) { this.pauseOverlay.destroy(); this.pauseOverlay = null; }
      try {
        synthAudio.startWarDrums(this.enemies.some((e) => e.active && e.kind === 'boss'));
        platformBridge.gameplayStart({ resume: 1 });
      } catch (_) {}
    }
  }

  _showPauseOverlay() {
    const { width, height } = GAME_DESIGN;
    const container = this.add.container(0, 0).setDepth(58);
    this.pauseOverlay = container;
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.76)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const box = this.add.rectangle(width / 2, height / 2, 344, 252, 0x161214, 0.98).setStrokeStyle(2, 0xd99b38, 0.95);
    const title = this.add.text(width / 2, height / 2 - 74, i18n.t('pauseTitle'), {
      fontSize: '28px', fontStyle: 'bold', color: '#eab308'
    }).setOrigin(0.5);

    const resBg = this.add.rectangle(width / 2, height / 2, 224, 52, 0xb91c1c).setStrokeStyle(2, 0xeab308, 0.9)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-10, -10, 244, 72), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const resTxt = this.add.text(width / 2, height / 2, i18n.t('resume'), { fontSize: '19px', fontStyle: 'bold', color: '#fff' }).setOrigin(0.5);
    resBg.on('pointerdown', () => this._togglePause());

    const menuBg = this.add.rectangle(width / 2, height / 2 + 72, 224, 46, 0x261f1d).setStrokeStyle(1.5, 0x78350f, 0.9)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-10, -10, 244, 66), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    const menuTxt = this.add.text(width / 2, height / 2 + 72, i18n.t('mainMenu'), { fontSize: '17px', fontStyle: 'bold', color: '#d6d3d1' }).setOrigin(0.5);
    menuBg.on('pointerdown', () => {
      try { synthAudio.stopWarDrums(); } catch (_) {}
      this.scene.start('MenuScene', { save: platformBridge.getLocalSave() });
    });

    container.add([dim, box, title, resBg, resTxt, menuBg, menuTxt]);
  }

  _findClosestEnemy() {
    let best = null;
    for (const e of this.enemies) {
      if (e.active && (!best || e.y > best.y)) best = e;
    }
    return best;
  }

  _distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Phaser.Math.Distance.Between(px, py, x1, y1);
    const t = Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
    return Phaser.Math.Distance.Between(px, py, x1 + t * dx, y1 + t * dy);
  }

  _spawnBurst(x, y, count, tint, tex = 'spark') {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x, y, tex).setDepth(26);
      p.setTint(tint);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.FloatBetween(80, 250);
      p.vx = Math.cos(a) * spd;
      p.vy = Math.sin(a) * spd;
      p.spin = Phaser.Math.FloatBetween(-320, 320);
      p.life = 0;
      p.maxLife = Phaser.Math.Between(240, 440);
      p.baseScale = Phaser.Math.FloatBetween(0.55, 1.05);
      p.setScale(p.baseScale);
      this.fxParticles.push(p);
    }
  }

  _showFloatingText(x, y, text, color, fontSize = '18px') {
    const t = this.add.text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color,
      stroke: '#0b0a10',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(35);
    this.tweens.add({
      targets: t,
      y: y - 42,
      alpha: 0,
      duration: 680,
      onComplete: () => t.destroy()
    });
  }

  _showBanner(text, color = '#fbbf24') {
    this.bannerText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.bannerText);
    this.tweens.add({
      targets: this.bannerText,
      alpha: 0.75,
      duration: 2400
    });
  }

  update(_time, delta) {
    if (this.isPaused || this.modalActive || this.isEnded) return;

    // 60ms 顿帧反馈（番天印砸击）
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - delta);
      return;
    }

    const dt = delta / 1000;
    this.elapsedMs += delta;

    // 背景八卦盘慢转 & 顶部浓雾流动
    if (this.forgeBaguaBg) this.forgeBaguaBg.angle += 7 * dt;
    for (const f of this.fogBands) {
      f.x += f.vx * dt;
      if (f.x < -60) f.x = GAME_DESIGN.width + 60;
      if (f.x > GAME_DESIGN.width + 60) f.x = -60;
    }

    // 粒子更新
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += delta;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.setAlpha(Math.max(0, ratio));
      p.setScale(Math.max(0.05, ratio * p.baseScale));
      if (p.life >= p.maxLife) {
        p.destroy();
        this.fxParticles.splice(i, 1);
      }
    }

    // 波次妖魔生成
    if (this.waveEnemiesSpawned < this.waveEnemiesTotal) {
      this.spawnTimerMs -= delta;
      if (this.spawnTimerMs <= 0) {
        this._spawnEnemy();
        this.waveEnemiesSpawned += 1;
        this.spawnTimerMs = Math.max(900, 2150 - this.wave * 95);
      }
    } else if (this.enemies.every((e) => !e.active)) {
      this.waveClearPauseMs += delta;
      if (this.waveClearPauseMs >= 900) {
        this.waveClearPauseMs = 0;
        this._advanceWave();
      }
    }

    // 妖魔推进与撞击青铜阵门
    const gateLineY = GAME_DESIGN.gateY - 22;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.active) {
        this.enemies.splice(i, 1);
        continue;
      }

      if (e.stunMs > 0) {
        e.stunMs = Math.max(0, e.stunMs - delta);
      } else {
        const slowFactor = e.slowMs > 0 ? 0.45 : 1.0;
        if (e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - delta);
        e.y += e.speed * slowFactor * dt;
      }

      e.sprite.setPosition(e.x, e.y);
      const barW = e.kind === 'boss' ? 76 : 42;
      e.hpBg.setPosition(e.x, e.y - e.radius - 8);
      e.hpFill.setPosition(e.x - barW / 2, e.y - e.radius - 8);

      // 撞击商周青铜阵门
      if (e.y >= gateLineY) {
        let dmg = e.dmg;
        if (this.gateShield > 0) {
          const absorbed = Math.min(this.gateShield, dmg);
          this.gateShield -= absorbed;
          dmg -= absorbed;
        }
        if (dmg > 0) this.gateHp = Math.max(0, this.gateHp - dmg);

        try { synthAudio.playGateHit(); } catch (_) {}
        this.cameras.main.shake(150, 0.011);
        this._spawnBurst(e.x, gateLineY, 10, 0xef4444, 'shard');
        this._showFloatingText(e.x, gateLineY - 24, `-${e.dmg}`, '#f87171', '18px');

        if (e.kind === 'boss') {
          // 妖王撞门后小幅回弹继续压迫，不直接白给消失
          e.y -= 78;
        } else {
          e.active = false;
          e.sprite.destroy();
          e.hpBg.destroy();
          e.hpFill.destroy();
          this.enemies.splice(i, 1);
        }

        this._refreshHudAndState();
        if (this.gateHp <= 0) {
          this._triggerNearDeath(i18n.t('gateFallenHint'));
          return;
        }
      }
    }
  }
}
