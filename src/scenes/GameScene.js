import Phaser from 'phaser';
import {
  GAME_DESIGN,
  ELEMENTS,
  ELEMENT_KEYS,
  PIECE_SHAPES,
  MAX_WAVES
} from '../config.js';
import { i18n } from '../i18n.js';
import { platformBridge } from '../platform-bridge.js';
import { synthAudio } from '../audio/synth-sfx.js';

const COLS = GAME_DESIGN.board.size; // 8
const ROWS = GAME_DESIGN.board.size; // 8
const CELL = GAME_DESIGN.board.cellSize; // 56
const ORIGIN_X = GAME_DESIGN.board.originX; // 46（与上方 8 条纵道 1:1 完全对齐）
const ORIGIN_Y = GAME_DESIGN.board.originY; // 332
const DRAG_LIFT_Y = GAME_DESIGN.board.dragLiftY; // 65px 防手指遮挡上移
const TRAY_Y = GAME_DESIGN.board.trayY; // 872
const TRAY_SLOTS_X = GAME_DESIGN.board.traySlotsX;

const B_ROWS = GAME_DESIGN.battle.rows; // 5 格同步推进纵深
const B_ROW_Y = GAME_DESIGN.battle.rowOriginY; // 70
const B_ROW_H = GAME_DESIGN.battle.rowHeight; // 36
const GATE_Y = GAME_DESIGN.battle.gateY; // 292

/**
 * 《INVESTITURE: Relic Forge》V1.0 核心玩法 MVP 主场景
 * - 上方 30%：8 条纵道（Lane 1~8）商周古战场，与下方 8×8 阵盘 8 列 1:1 精准垂直对齐
 * - 下方 70%：8×8 青铜八卦锻炉 + 底部 3 槽经典 Block Blast 拼图（无倒计时，拖拽自动上移 65px）
 * - 同步回合制：每成功放置 1 块拼图，上方妖魔才统一推进 1 格；不放块绝不动
 * - 落子定属性（火/金/水）+ 横竖策略分化 + 悬停落点实时联动上方纵道/前排攻击预警光带
 * - 精简 10 波通关循环（第 10 波关底巨型青铜妖王）+ 1 秒极速重开
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init() {
    this.score = 0;
    this.wave = 1;
    this.turnCount = 0;
    this.slainCount = 0;
    this.linesCleared = 0;
    this.piecesPlaced = 0;

    this.gateMaxHp = 100;
    this.gateHp = 100;
    this.gateShield = 0;

    // 8×8 青铜八卦锻炉：null | { element: 'fire'|'thunder'|'tide', sprite: Image }
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.trayPieces = [null, null, null];

    this.enemies = [];
    this.nextEnemyId = 1;
    this.waveRemainingToSpawn = 0;

    this.dragState = null;
    this.isEnded = false;
    this.endModal = null;
    this.fxParticles = [];
    this.lastCast = null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0b0a0f');
    try { this.scale?.updateBounds?.(); } catch (_) {}

    this._buildHud();
    this._buildBattlefield();
    this._buildBoardAndTray();
    this._bindDragInput();

    // 启动第 1 波先锋妖魔 + 发第一组 3 块拼图
    this._startWave(1);
    this._refillTray();
    this._refreshHudAndState();
  }

  // =========================================================================
  // 1. 顶部精简 HUD、上方 8 纵道战场（30%）、下方 8×8 锻炉（70%）
  // =========================================================================

  _buildHud() {
    const { width } = GAME_DESIGN;
    const hudBg = this.add.rectangle(width / 2, 27, width, 54, 0x141012, 0.96).setDepth(20);
    hudBg.setStrokeStyle(1.5, 0x5c3d22, 0.95);

    this.waveText = this.add.text(14, 16, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#eab308'
    }).setOrigin(0, 0.5).setDepth(21);

    this.scoreText = this.add.text(14, 38, '', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#e7e5e4'
    }).setOrigin(0, 0.5).setDepth(21);

    this.statusHintText = this.add.text(width / 2 - 12, 27, '', {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#a8a29e'
    }).setOrigin(0.5).setDepth(21);

    // 右上角轻量按钮：EN/中、音效开关、1 秒重开
    this.hudLangBtn = this._createMiniBtn(386, 27, 56, 34, i18n.lang === 'en' ? '中' : 'EN', 0x22d3ee, () => {
      i18n.toggle();
      this._refreshHudAndState();
    });
    this.hudSoundBtn = this._createMiniBtn(448, 27, 48, 34, synthAudio.enabled ? 'SFX' : 'OFF', 0xd99b38, () => {
      this._toggleSound();
    });
    this.hudRestartBtn = this._createMiniBtn(502, 27, 42, 34, '↻', 0xef4444, () => {
      this.scene.restart();
    });
  }

  _createMiniBtn(x, y, w, h, labelText, strokeColor, onClick) {
    const bg = this.add.rectangle(x, y, w, h, 0x1e1815, 0.96).setDepth(22);
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

  _buildBattlefield() {
    const { width } = GAME_DESIGN;
    const fieldW = COLS * CELL; // 448px，与下方 8×8 棋盘完全等宽对齐
    const fieldH = B_ROWS * B_ROW_H + 54;

    // 商周古战场深墨青铜底幕
    this.add.rectangle(width / 2, 184, width, 260, 0x100d13, 1).setDepth(0);
    // 8 条纵道统一对齐外框（x: 46..494）
    const laneFrame = this.add.rectangle(ORIGIN_X + fieldW / 2, B_ROW_Y + (B_ROWS * B_ROW_H) / 2, fieldW, B_ROWS * B_ROW_H, 0x141016, 0.94).setDepth(1);
    laneFrame.setStrokeStyle(1.5, 0x4b3624, 0.85);

    // 绘制 8 条纵道分界线 + 5 步格虚线（让回合制推进步距一目了然）
    const bgG = this.add.graphics().setDepth(2);
    for (let c = 0; c < COLS; c++) {
      const lx = ORIGIN_X + c * CELL;
      if (c % 2 === 1) {
        bgG.fillStyle(0x1b161b, 0.45);
        bgG.fillRect(lx, B_ROW_Y, CELL, B_ROWS * B_ROW_H);
      }
      if (c > 0) {
        bgG.lineStyle(1, 0x5c3d22, 0.45);
        bgG.beginPath();
        bgG.moveTo(lx, B_ROW_Y);
        bgG.lineTo(lx, B_ROW_Y + B_ROWS * B_ROW_H + 62);
        bgG.strokePath();
      }
    }
    for (let r = 1; r < B_ROWS; r++) {
      const ry = B_ROW_Y + r * B_ROW_H;
      bgG.lineStyle(1, 0x3f2e22, 0.35);
      bgG.beginPath();
      bgG.moveTo(ORIGIN_X, ry);
      bgG.lineTo(ORIGIN_X + fieldW, ry);
      bgG.strokePath();
    }

    // 落点悬停联动预警光带层（绘制在纵道与敌人之间，一眼看懂打中谁）
    this.battlePreviewGraphics = this.add.graphics().setDepth(5);
    // 战场上方法宝特效层
    this.battleFxGraphics = this.add.graphics().setDepth(15);

    // 青铜阵门 + 哪吒全封闭战盔红氅背影剪影
    this.warlordBaseY = GATE_Y - 26;
    this.nezhaSprite = this.add.image(width / 2, this.warlordBaseY, 'hero_nezha').setScale(0.68).setDepth(11);

    this.gateBeam = this.add.rectangle(ORIGIN_X + fieldW / 2, GATE_Y, fieldW, 12, 0x5c3d22, 1).setDepth(8);
    this.gateBeam.setStrokeStyle(1.8, 0xd99b38, 0.95);

    // 阵门血条与护盾条
    this.add.rectangle(width / 2, GATE_Y + 14, 284, 12, 0x1c1917, 0.96).setStrokeStyle(1, 0x78350f, 0.9).setDepth(9);
    this.gateHpBar = this.add.rectangle(width / 2 - 142, GATE_Y + 14, 284, 10, 0x22c55e).setOrigin(0, 0.5).setDepth(10);
    this.gateShieldBar = this.add.rectangle(width / 2 - 142, GATE_Y + 14, 0, 4, 0x22d3ee).setOrigin(0, 0.5).setDepth(11);
    this.gateHpText = this.add.text(width / 2, GATE_Y + 14, '', {
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5).setDepth(12);

    // 上下 1:1 纵道对齐刻度编号（1~8）
    for (let c = 0; c < COLS; c++) {
      this.add.text(this._laneCenterX(c), 320, String(c + 1), {
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#b45309'
      }).setOrigin(0.5).setDepth(12);
    }

    // 联动预警文字条（悬停将消行/列时显示锁定提示）
    this.previewTagText = this.add.text(width / 2, 62, '', {
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#fde047',
      stroke: '#0b0a0f',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(18);
  }

  _buildBoardAndTray() {
    const { width } = GAME_DESIGN;
    const boardPx = COLS * CELL; // 448
    const centerX = ORIGIN_X + boardPx / 2;
    const centerY = ORIGIN_Y + boardPx / 2;

    this.add.rectangle(width / 2, 638, width, 644, 0x0d0b10, 1).setDepth(0);
    this.forgeBagua = this.add.image(centerX, centerY, 'baguaRing').setScale(2.35).setAlpha(0.16).setDepth(1);

    // 8×8 商周青铜八卦锻炉外框（与上方 8 纵道左右边界严丝合缝）
    const frame = this.add.rectangle(centerX, centerY, boardPx + 10, boardPx + 10, 0x181311, 0.96).setDepth(2);
    frame.setStrokeStyle(2.5, 0xb45309, 0.95);

    // 绘制 64 个青铜锻炉凹槽
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = ORIGIN_X + c * CELL + CELL / 2;
        const cy = ORIGIN_Y + r * CELL + CELL / 2;
        const cellBg = this.add.rectangle(cx, cy, CELL - 3, CELL - 3, 0x221b17, 0.94).setDepth(3);
        cellBg.setStrokeStyle(1, 0x4b3624, 0.8);
      }
    }

    // 8×8 棋盘落点半透明预览与即将消除行列高亮层
    this.boardPreviewGraphics = this.add.graphics().setDepth(24);

    // 底部 3 个待选拼图槽位框（无倒计时）
    for (let i = 0; i < 3; i++) {
      const slot = this.add.rectangle(TRAY_SLOTS_X[i], TRAY_Y, 152, 138, 0x161215, 0.95).setDepth(3);
      slot.setStrokeStyle(1.8, 0x5c3d22, 0.9);
    }
  }

  _laneCenterX(lane) {
    return ORIGIN_X + lane * CELL + CELL / 2;
  }

  _battleRowY(row) {
    return B_ROW_Y + row * B_ROW_H + B_ROW_H / 2;
  }

  // =========================================================================
  // 2. 单指拖拽拼图块（自动上移 65px 防遮挡 + 上下联动攻击预警光带）
  // =========================================================================

  _bindDragInput() {
    this.input.keyboard?.on('keydown-M', () => this._toggleSound());
    this.input.keyboard?.on('keydown-R', () => this.scene.restart());

    this.input.on('pointerdown', (pointer) => {
      if (this.isEnded || this.dragState) return;
      if (pointer.y < 790) return;

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

  _createPieceVisual(shape, element, cellPx, depth = 14) {
    const container = this.add.container(0, 0).setDepth(depth);
    const { rows, cols } = this._getShapeBounds(shape);
    const totalW = cols * cellPx;
    const totalH = rows * cellPx;
    const tex = ELEMENTS[element].texture;
    const scale = (cellPx - 3) / 52;

    for (const [r, c] of shape.cells) {
      const lx = c * cellPx + cellPx / 2 - totalW / 2;
      const ly = r * cellPx + cellPx / 2 - totalH / 2;
      container.add(this.add.image(lx, ly, tex).setScale(scale));
    }
    return container;
  }

  _refillTray() {
    for (let i = 0; i < 3; i++) {
      if (this.trayPieces[i]?.container) this.trayPieces[i].container.destroy();
      this.trayPieces[i] = null;
    }

    const shapes = [this._pickRandomShape(), this._pickRandomShape(), this._pickRandomShape()];
    // 若随机 3 块都无处可放但盘面仍有空位，优先兜底 1 块可放入的形状减少纯运气死局
    if (!shapes.some((s) => this._canShapeFitAnywhere(s))) {
      const fit = PIECE_SHAPES.find((s) => this._canShapeFitAnywhere(s));
      if (fit) shapes[0] = fit;
    }

    // 尽量让 3 块涵盖不同属性以增强“落子定属性”的策略选择
    const elems = Phaser.Utils.Array.Shuffle([...ELEMENT_KEYS]);

    for (let i = 0; i < 3; i++) {
      const shape = shapes[i];
      const element = elems[i % elems.length];
      const visual = this._createPieceVisual(shape, element, 30, 14);
      visual.setPosition(TRAY_SLOTS_X[i], TRAY_Y);
      visual.setScale(0.75);
      this.tweens.add({ targets: visual, scaleX: 1, scaleY: 1, duration: 150, ease: 'Back.easeOut' });
      this.trayPieces[i] = { shape, element, container: visual, slotIndex: i };
    }

    this._refreshHudAndState();
    this._checkBoardDeadlock();
  }

  _startDragging(slotIndex, px, py) {
    const piece = this.trayPieces[slotIndex];
    if (!piece) return;
    try { synthAudio.playPickup(); } catch (_) {}

    piece.container.setAlpha(0.2);
    const dragVisual = this._createPieceVisual(piece.shape, piece.element, CELL, 32);
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
    // 红线：手指拖动拼图块时自动向上偏移 65px 防止遮挡
    const liftCenterX = pointerX;
    const liftCenterY = pointerY - DRAG_LIFT_Y;
    const { rows, cols } = this._getShapeBounds(shape);
    const topLeftX = liftCenterX - (cols * CELL) / 2;
    const topLeftY = liftCenterY - (rows * CELL) / 2;
    const col = Math.round((topLeftX - ORIGIN_X) / CELL);
    const row = Math.round((topLeftY - ORIGIN_Y) / CELL);
    return { row, col, liftCenterX, liftCenterY };
  }

  _canPlaceAt(shape, baseRow, baseCol) {
    for (const [dr, dc] of shape.cells) {
      const r = baseRow + dr;
      const c = baseCol + dc;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      if (this.board[r][c] !== null) return false;
    }
    return true;
  }

  _canShapeFitAnywhere(shape) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this._canPlaceAt(shape, r, c)) return true;
      }
    }
    return false;
  }

  _predictClears(shape, baseRow, baseCol) {
    const placedSet = new Set(shape.cells.map(([dr, dc]) => `${baseRow + dr},${baseCol + dc}`));
    const isFullCell = (r, c) => placedSet.has(`${r},${c}`) || this.board[r][c] !== null;

    const fullRows = [];
    const fullCols = [];
    for (let r = 0; r < ROWS; r++) {
      let ok = true;
      for (let c = 0; c < COLS; c++) if (!isFullCell(r, c)) { ok = false; break; }
      if (ok) fullRows.push(r);
    }
    for (let c = 0; c < COLS; c++) {
      let ok = true;
      for (let r = 0; r < ROWS; r++) if (!isFullCell(r, c)) { ok = false; break; }
      if (ok) fullCols.push(c);
    }
    return { fullRows, fullCols };
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

    this._renderDragPreviews(piece, row, col, valid);
  }

  /**
   * 落点高亮联动：
   * 1) 8×8 棋盘实时半透明落点预览 + 将消除行列流光框
   * 2) 上方战场同步亮起对应纵道攻击光带或前排横扫光带，一眼看懂“放这里会打中谁”
   */
  _renderDragPreviews(piece, baseRow, baseCol, valid) {
    const bg = this.boardPreviewGraphics;
    const ug = this.battlePreviewGraphics;
    bg.clear();
    ug.clear();
    this.previewTagText.setText('');

    if (!valid) return;

    const elem = ELEMENTS[piece.element];

    // 1. 棋盘落点半透明高亮预览
    bg.fillStyle(elem.glowHex, 0.34);
    bg.lineStyle(2.2, elem.lightHex, 0.95);
    for (const [dr, dc] of piece.shape.cells) {
      const x = ORIGIN_X + (baseCol + dc) * CELL + 2;
      const y = ORIGIN_Y + (baseRow + dr) * CELL + 2;
      bg.fillRoundedRect(x, y, CELL - 4, CELL - 4, 6);
      bg.strokeRoundedRect(x, y, CELL - 4, CELL - 4, 6);
    }

    // 2. 预判将消除的行与列 -> 联动上方战场预警光带
    const { fullRows, fullCols } = this._predictClears(piece.shape, baseRow, baseCol);
    const totalClears = fullRows.length + fullCols.length;
    if (totalClears === 0) return;

    const isRes = totalClears >= 2;
    const lineColor = isRes ? 0xfde047 : elem.glowHex;

    // 棋盘上高亮即将消除的整列与整行
    bg.lineStyle(3.2, lineColor, 0.98);
    for (const c of fullCols) {
      bg.strokeRoundedRect(ORIGIN_X + c * CELL + 2, ORIGIN_Y + 2, CELL - 4, ROWS * CELL - 4, 6);
    }
    for (const r of fullRows) {
      bg.strokeRoundedRect(ORIGIN_X + 2, ORIGIN_Y + r * CELL + 2, COLS * CELL - 4, CELL - 4, 6);
    }

    // 上方战场联动攻击预警光带：
    // A) 消垂直列 -> 点亮上方完全对齐的第 c 号纵道！
    for (const c of fullCols) {
      const lx = ORIGIN_X + c * CELL;
      ug.fillStyle(elem.glowHex, isRes ? 0.34 : 0.24);
      ug.fillRect(lx + 2, B_ROW_Y, CELL - 4, GATE_Y - B_ROW_Y);
      ug.lineStyle(2.4, lineColor, 0.95);
      ug.strokeRect(lx + 2, B_ROW_Y, CELL - 4, GATE_Y - B_ROW_Y);
      // 给该纵道内将被命中的敌人画瞄准高亮框
      for (const e of this._getEnemiesInLane(c)) {
        ug.lineStyle(2.5, 0xfef08a, 1);
        ug.strokeCircle(e.sprite.x, e.sprite.y, e.kind === 'boss' ? 36 : 22);
      }
    }

    // B) 消水平行 -> 点亮上方前排 8 条纵道横扫区域！
    if (fullRows.length > 0) {
      const sweepY = B_ROW_Y + 2 * B_ROW_H;
      const sweepH = 3 * B_ROW_H;
      ug.fillStyle(elem.glowHex, isRes ? 0.3 : 0.2);
      ug.fillRect(ORIGIN_X, sweepY, COLS * CELL, sweepH);
      ug.lineStyle(2.5, lineColor, 0.95);
      ug.strokeRect(ORIGIN_X, sweepY, COLS * CELL, sweepH);
      for (const e of this._getFrontlineEnemies()) {
        ug.lineStyle(2.5, 0xfef08a, 1);
        ug.strokeCircle(e.sprite.x, e.sprite.y, e.kind === 'boss' ? 36 : 22);
      }
    }

    // 顶部简洁联动提示文字
    if (isRes) {
      this.previewTagText.setText(i18n.t('previewRes')).setColor('#fde047');
    } else if (fullCols.length === 1) {
      this.previewTagText.setText(i18n.t('previewCol', fullCols[0] + 1)).setColor(elem.css);
    } else {
      this.previewTagText.setText(i18n.t('previewRow')).setColor(elem.css);
    }
  }

  _finishDragging(px, py) {
    const st = this.dragState;
    if (!st) return;
    this._updateDragging(px, py);

    const { slotIndex, piece, dragVisual, hoverRow, hoverCol, valid } = st;
    this.boardPreviewGraphics.clear();
    this.battlePreviewGraphics.clear();
    this.previewTagText.setText('');
    dragVisual.destroy();
    this.dragState = null;

    if (valid && this._canPlaceAt(piece.shape, hoverRow, hoverCol)) {
      this._executeTurn(slotIndex, piece, hoverRow, hoverCol);
    } else {
      piece.container.setAlpha(1);
      try { synthAudio.playInvalid(); } catch (_) {}
      this._refreshHudAndState();
    }
  }

  // =========================================================================
  // 3. 同步回合核心结算：落子定属性 -> 横竖神通攻击 -> 灼烧 -> 妖魔同步前移 1 格 -> 刷怪/换波
  // =========================================================================

  _executeTurn(slotIndex, piece, baseRow, baseCol) {
    const castElement = piece.element; // 严格由“刚刚放下去的那一块拼图”决定属性！
    const tex = ELEMENTS[castElement].texture;

    // Step 1: 拼图落子写入 8×8 锻炉
    for (const [dr, dc] of piece.shape.cells) {
      const r = baseRow + dr;
      const c = baseCol + dc;
      const cx = ORIGIN_X + c * CELL + CELL / 2;
      const cy = ORIGIN_Y + r * CELL + CELL / 2;
      const sp = this.add.image(cx, cy, tex).setDepth(12).setScale(0.7);
      this.tweens.add({ targets: sp, scaleX: 1, scaleY: 1, duration: 110, ease: 'Back.easeOut' });
      this.board[r][c] = { element: castElement, sprite: sp };
    }

    if (piece.container) piece.container.destroy();
    this.trayPieces[slotIndex] = null;
    this.piecesPlaced += 1;
    this.turnCount += 1;
    this.score += piece.shape.cells.length * 10;
    try { synthAudio.playPlace(); } catch (_) {}

    // Step 2: 判定消行/消列并按刚落子属性发动横竖分化法宝攻击
    const { fullRows, fullCols } = this._scanFullLines();
    const totalClears = fullRows.length + fullCols.length;
    this.lastCast = null;

    if (totalClears > 0) {
      this._clearLinesAndCast(fullRows, fullCols, castElement);
    }

    // Step 3: 结算敌人灼烧持续伤害
    this._tickEnemyBurns();

    // Step 4: 同步回合制核心——所有存活妖魔统一向下推进 1 格（不放块绝不动）
    if (!this.isEnded) {
      this._advanceAllEnemiesOneStep();
    }

    // Step 5: 若本局未失败，处理本回合增援刷怪或进入下一波（最多 10 波，第 10 波清完即胜利）
    if (!this.isEnded) {
      this._processWaveAfterTurn();
    }

    // Step 6: 3 块放完自动刷新下一组，并检查是否无处可放
    if (!this.isEnded) {
      if (this.trayPieces.every((p) => p === null)) {
        this._refillTray();
      } else {
        this._refreshHudAndState();
        this._checkBoardDeadlock();
      }
    }
  }

  _scanFullLines() {
    const fullRows = [];
    const fullCols = [];
    for (let r = 0; r < ROWS; r++) {
      let ok = true;
      for (let c = 0; c < COLS; c++) if (!this.board[r][c]) { ok = false; break; }
      if (ok) fullRows.push(r);
    }
    for (let c = 0; c < COLS; c++) {
      let ok = true;
      for (let r = 0; r < ROWS; r++) if (!this.board[r][c]) { ok = false; break; }
      if (ok) fullCols.push(c);
    }
    return { fullRows, fullCols };
  }

  _clearLinesAndCast(fullRows, fullCols, element) {
    const totalClears = fullRows.length + fullCols.length;
    const isResonance = totalClears >= 2;
    const mult = isResonance ? 2.0 : 1.0;

    // 清除填满的格子并迸发对应属性粒子
    const toClear = new Set();
    for (const r of fullRows) for (let c = 0; c < COLS; c++) toClear.add(`${r},${c}`);
    for (const c of fullCols) for (let r = 0; r < ROWS; r++) toClear.add(`${r},${c}`);

    for (const key of toClear) {
      const [r, c] = key.split(',').map(Number);
      const cell = this.board[r][c];
      if (!cell) continue;
      const cx = ORIGIN_X + c * CELL + CELL / 2;
      const cy = ORIGIN_Y + r * CELL + CELL / 2;
      this._spawnBurst(cx, cy, 4, ELEMENTS[element].glowHex, 'spark');
      if (cell.sprite) cell.sprite.destroy();
      this.board[r][c] = null;
    }

    this.linesCleared += totalClears;
    this.score += Math.round(totalClears * 120 * mult);

    // 哪吒挥枪脉冲动作
    this.tweens.add({
      targets: this.nezhaSprite,
      y: this.warlordBaseY - 10,
      scaleX: 0.78,
      scaleY: 0.78,
      duration: 100,
      yoyo: true
    });

    if (isResonance) {
      try { synthAudio.playResonance(); } catch (_) {}
      this.cameras.main.shake(160, 0.009);
      this._showFloatingText(GAME_DESIGN.width / 2, 140, i18n.t('resonanceTitle'), '#fde047', '25px');
    } else {
      try { synthAudio.playCast(element); } catch (_) {}
    }

    const hitRecord = {
      element,
      fullCols: [...fullCols],
      fullRows: [...fullRows],
      resonance: isResonance,
      hitEnemyIds: []
    };

    // 1) 垂直列消除 -> 精准轰穿上方对应纵道（Lane c）
    for (const c of fullCols) {
      const ids = this._castColumnAttack(c, element, mult);
      hitRecord.hitEnemyIds.push(...ids);
    }

    // 2) 水平行消除 -> 横扫前排 8 条纵道广域冲击波
    for (let i = 0; i < fullRows.length; i++) {
      const ids = this._castRowSweep(element, mult);
      hitRecord.hitEnemyIds.push(...ids);
    }

    this.lastCast = hitRecord;
  }

  /**
   * 垂直列攻击：精准轰穿上方对应第 lane 号纵道
   */
  _castColumnAttack(lane, element, mult) {
    const lx = this._laneCenterX(lane);
    const elem = ELEMENTS[element];
    const hitIds = [];

    // 绘制贯穿第 lane 号纵道的神通光柱
    const g = this.add.graphics().setDepth(16);
    g.fillStyle(elem.glowHex, 0.36);
    g.fillRect(ORIGIN_X + lane * CELL + 4, B_ROW_Y, CELL - 8, GATE_Y - B_ROW_Y);
    g.lineStyle(5, elem.lightHex, 0.98);
    g.beginPath();
    g.moveTo(lx, GATE_Y - 10);
    g.lineTo(lx, B_ROW_Y);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });

    this._showFloatingText(lx, GATE_Y - 44, i18n.pack.castCol[element], elem.css, '14px');

    const laneEnemies = this._getEnemiesInLane(lane);

    if (element === 'fire') {
      // 火（纵道）：高伤穿透灼烧该纵道所有敌人
      const dmg = Math.round(75 * mult);
      for (const e of laneEnemies) {
        hitIds.push(e.id);
        e.burnTurns = Math.max(e.burnTurns, 2);
        this._damageEnemy(e, dmg, true, 0xef4444);
      }
    } else if (element === 'thunder') {
      // 金（纵道）：命中该列最靠前敌人，并向相邻纵道弹射 3 次连锁闪电
      const primary = laneEnemies[0];
      if (primary) {
        hitIds.push(primary.id);
        this._damageEnemy(primary, Math.round(60 * mult), false, 0xfbbf24);

        const chainPool = this.enemies
          .filter((e) => e.active && e.id !== primary.id)
          .sort((a, b) => {
            const da = Math.abs(a.lane - lane);
            const db = Math.abs(b.lane - lane);
            if (da !== db) return da - db;
            return b.row - a.row;
          })
          .slice(0, 3);

        let prevX = primary.sprite.x;
        let prevY = primary.sprite.y;
        const lg = this.add.graphics().setDepth(17);
        for (const target of chainPool) {
          hitIds.push(target.id);
          const midX = (prevX + target.sprite.x) / 2;
          const midY = (prevY + target.sprite.y) / 2 + Phaser.Math.Between(-14, 14);
          lg.lineStyle(4, 0xfbbf24, 0.95);
          lg.beginPath();
          lg.moveTo(prevX, prevY);
          lg.lineTo(midX, midY);
          lg.lineTo(target.sprite.x, target.sprite.y);
          lg.strokePath();
          prevX = target.sprite.x;
          prevY = target.sprite.y;
          this._damageEnemy(target, Math.round(42 * mult), false, 0xfbbf24);
        }
        this.tweens.add({ targets: lg, alpha: 0, duration: 320, onComplete: () => lg.destroy() });
      }
    } else {
      // 水（纵道）：强力击退该纵道所有敌人 + 回复少量阵门护盾
      const dmg = Math.round(42 * mult);
      for (const e of laneEnemies) {
        hitIds.push(e.id);
        this._knockbackEnemy(e, e.kind === 'boss' ? 1 : 2);
        this._damageEnemy(e, dmg, false, 0x22d3ee);
      }
      this._addShield(Math.round(12 * mult));
    }

    return hitIds;
  }

  /**
   * 水平行攻击：横扫前排 8 条纵道的广域冲击波
   */
  _castRowSweep(element, mult) {
    const elem = ELEMENTS[element];
    const hitIds = [];

    // 绘制横扫 8 纵道的广域光波
    const waveBar = this.add.rectangle(
      ORIGIN_X + (COLS * CELL) / 2,
      GATE_Y - 14,
      COLS * CELL,
      20,
      elem.glowHex,
      0.58
    ).setStrokeStyle(2.5, elem.lightHex, 0.95).setDepth(16);
    this.tweens.add({
      targets: waveBar,
      y: B_ROW_Y + 18,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => waveBar.destroy()
    });

    this._showFloatingText(GAME_DESIGN.width / 2, 232, i18n.pack.castRow[element], elem.css, '16px');

    if (element === 'fire') {
      // 火（横行）：前排灼烧斩，打击每条纵道最前排敌人 + 附加灼烧
      const targets = this._getFrontlineEnemies();
      for (const e of targets) {
        hitIds.push(e.id);
        e.burnTurns = Math.max(e.burnTurns, 2);
        this._damageEnemy(e, Math.round(48 * mult), false, 0xef4444);
      }
    } else if (element === 'thunder') {
      // 金（横行）：随机多目标天雷（4 道，共鸣 6 道）
      const strikeCount = mult >= 2 ? 6 : 4;
      const alive = this.enemies.filter((e) => e.active);
      if (alive.length > 0) {
        const lg = this.add.graphics().setDepth(17);
        for (let i = 0; i < strikeCount; i++) {
          const curAlive = this.enemies.filter((e) => e.active);
          if (!curAlive.length) break;
          const target = curAlive[Phaser.Math.Between(0, curAlive.length - 1)];
          hitIds.push(target.id);
          lg.lineStyle(4, 0xfde047, 0.95);
          lg.beginPath();
          lg.moveTo(target.sprite.x + Phaser.Math.Between(-10, 10), B_ROW_Y - 12);
          lg.lineTo(target.sprite.x + Phaser.Math.Between(-12, 12), (B_ROW_Y + target.sprite.y) / 2);
          lg.lineTo(target.sprite.x, target.sprite.y);
          lg.strokePath();
          this._damageEnemy(target, Math.round(52 * mult), false, 0xfbbf24);
        }
        this.tweens.add({ targets: lg, alpha: 0, duration: 300, onComplete: () => lg.destroy() });
      }
    } else {
      // 水（横行）：全屏前排统一击退 2 格 + 阵门护盾
      for (const e of [...this.enemies]) {
        if (!e.active) continue;
        hitIds.push(e.id);
        this._knockbackEnemy(e, e.kind === 'boss' ? 1 : 2);
        this._damageEnemy(e, Math.round(26 * mult), false, 0x22d3ee);
      }
      this._addShield(Math.round(16 * mult));
    }

    return hitIds;
  }

  _getEnemiesInLane(lane) {
    return this.enemies
      .filter((e) => e.active && (e.lane === lane || (e.span === 2 && (e.lane === lane || e.lane + 1 === lane))))
      .sort((a, b) => b.row - a.row);
  }

  _getFrontlineEnemies() {
    // 返回每条纵道最靠前的敌人（去重 Boss），以及已踏入前排（row >= 2）的全部敌人
    const picked = new Map();
    for (let c = 0; c < COLS; c++) {
      const list = this._getEnemiesInLane(c);
      if (list[0]) picked.set(list[0].id, list[0]);
    }
    for (const e of this.enemies) {
      if (e.active && e.row >= 2) picked.set(e.id, e);
    }
    return Array.from(picked.values());
  }

  // =========================================================================
  // 4. 10 波精简妖魔循环、同步步进、伤血与 1 秒极速重开
  // =========================================================================

  _startWave(waveNum) {
    this.wave = waveNum;
    if (waveNum === MAX_WAVES) {
      // 第 10 波关底：巨型青铜妖王（横跨 Lane 3 & Lane 4）+ 2 名护卫魔兵
      this.waveRemainingToSpawn = 0;
      this._spawnEnemy('boss', 3, 0);
      this._spawnEnemy('golem', 1, 0);
      this._spawnEnemy('golem', 6, 0);
      try { synthAudio.playBoss(); } catch (_) {}
      this._showFloatingText(GAME_DESIGN.width / 2, 130, i18n.t('bossIncoming'), '#fde047', '19px');
      return;
    }

    const totalForWave = 3 + Math.min(7, Math.floor(waveNum * 0.9));
    const initialCount = Math.min(3, totalForWave);
    this.waveRemainingToSpawn = totalForWave - initialCount;

    const lanes = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
    for (let i = 0; i < initialCount; i++) {
      this._spawnEnemy(this._rollEnemyKind(waveNum), lanes[i], null);
    }
  }

  _rollEnemyKind(waveNum) {
    const r = Math.random();
    if (waveNum >= 4 && r > 0.68) return 'golem';
    if (waveNum >= 2 && r > 0.44) return 'wraith';
    return 'grunt';
  }

  _spawnEnemy(kind, lane, forceRow = null) {
    const scale = 1 + (this.wave - 1) * 0.14;
    const specs = {
      grunt: { tex: 'enemy_grunt', hp: Math.round(42 * scale), armor: 0, dmg: 12, startRow: 0, span: 1 },
      golem: { tex: 'enemy_golem', hp: Math.round(90 * scale), armor: 0.35, dmg: 22, startRow: 0, span: 1 },
      wraith: { tex: 'enemy_wraith', hp: Math.round(32 * scale), armor: 0, dmg: 16, startRow: 1, span: 1 },
      boss: { tex: 'enemy_boss', hp: 520, armor: 0.2, dmg: 30, startRow: 0, span: 2 }
    };
    const sp = specs[kind];
    const row = forceRow !== null ? forceRow : sp.startRow;
    const x = sp.span === 2
      ? (this._laneCenterX(lane) + this._laneCenterX(lane + 1)) / 2
      : this._laneCenterX(lane);
    const y = this._battleRowY(row);

    const sprite = this.add.image(x, y, sp.tex).setDepth(kind === 'boss' ? 10 : 8).setScale(0.6);
    this.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });

    const barW = kind === 'boss' ? 92 : 38;
    const barOffsetY = kind === 'boss' ? -30 : -18;
    const hpBg = this.add.rectangle(x, y + barOffsetY, barW, 5, 0x1c1917, 0.92).setDepth(11);
    const hpFill = this.add.rectangle(x - barW / 2, y + barOffsetY, barW, 3.5, kind === 'boss' ? 0xef4444 : 0xf97316)
      .setOrigin(0, 0.5)
      .setDepth(12);

    const enemy = {
      id: this.nextEnemyId++,
      active: true,
      kind,
      lane,
      span: sp.span,
      row,
      hp: sp.hp,
      maxHp: sp.hp,
      armor: sp.armor,
      dmg: sp.dmg,
      burnTurns: 0,
      barW,
      barOffsetY,
      sprite,
      hpBg,
      hpFill
    };
    this.enemies.push(enemy);
    return enemy;
  }

  _syncEnemyVisualPosition(enemy, duration = 160) {
    const x = enemy.span === 2
      ? (this._laneCenterX(enemy.lane) + this._laneCenterX(enemy.lane + 1)) / 2
      : this._laneCenterX(enemy.lane);
    const y = this._battleRowY(Math.min(B_ROWS - 1, Math.max(0, enemy.row)));

    this.tweens.add({ targets: enemy.sprite, x, y, duration, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: enemy.hpBg, x, y: y + enemy.barOffsetY, duration, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: enemy.hpFill,
      x: x - enemy.barW / 2,
      y: y + enemy.barOffsetY,
      duration,
      ease: 'Quad.easeOut'
    });
  }

  _knockbackEnemy(enemy, steps) {
    if (!enemy || !enemy.active) return;
    enemy.row = Math.max(0, enemy.row - steps);
    this._syncEnemyVisualPosition(enemy, 140);
  }

  _tickEnemyBurns() {
    for (const e of [...this.enemies]) {
      if (!e.active || e.burnTurns <= 0) continue;
      e.burnTurns -= 1;
      this._damageEnemy(e, 18, true, 0xf97316);
    }
  }

  /**
   * 同步回合制推进：玩家每放 1 块，场上所有存活妖魔统一向下推进 1 格
   */
  _advanceAllEnemiesOneStep() {
    let marched = false;
    for (const e of [...this.enemies]) {
      if (!e.active) continue;
      marched = true;
      e.row += 1;

      if (e.row >= B_ROWS) {
        // 妖魔触及青铜阵门！
        this._hitGate(e.dmg, e.sprite.x);
        if (e.kind === 'boss') {
          // 关底妖王撞门后回退 2 格继续压迫
          e.row = 2;
          this._syncEnemyVisualPosition(e, 200);
        } else {
          this._removeEnemy(e);
        }
        if (this.gateHp <= 0) {
          this._showEndOverlay(false, i18n.t('defeatGateTitle'));
          return;
        }
      } else {
        this._syncEnemyVisualPosition(e, 160);
      }
    }
    if (marched) {
      try { synthAudio.playMarch(); } catch (_) {}
    }
  }

  _processWaveAfterTurn() {
    // 本波还有待生成妖魔 -> 每回合在空闲纵道刷出 1~2 只
    if (this.waveRemainingToSpawn > 0) {
      const toSpawn = Math.min(this.waveRemainingToSpawn, this.wave >= 5 ? 2 : 1);
      const occupiedTop = new Set(this.enemies.filter((e) => e.active && e.row <= 1).map((e) => e.lane));
      const freeLanes = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4, 5, 6, 7].filter((c) => !occupiedTop.has(c)));
      for (let i = 0; i < toSpawn && i < freeLanes.length; i++) {
        this._spawnEnemy(this._rollEnemyKind(this.wave), freeLanes[i], null);
        this.waveRemainingToSpawn -= 1;
      }
    }

    // 检查本波是否全灭
    const anyAlive = this.enemies.some((e) => e.active);
    if (!anyAlive && this.waveRemainingToSpawn === 0) {
      if (this.wave >= MAX_WAVES) {
        this.score += 1000;
        try { synthAudio.playVictory(); } catch (_) {}
        this._showEndOverlay(true, i18n.t('victoryTitle'));
      } else {
        this.score += 150;
        this._startWave(this.wave + 1);
      }
    }
  }

  _damageEnemy(enemy, rawDmg, halfPierce = false, tint = 0xfbbf24) {
    if (!enemy || !enemy.active) return;
    const armorCut = halfPierce ? enemy.armor * 0.45 : enemy.armor;
    const dmg = Math.max(4, Math.round(rawDmg * (1 - armorCut)));
    enemy.hp -= dmg;

    enemy.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (enemy.active && enemy.sprite) enemy.sprite.clearTint();
    });
    this._showFloatingText(enemy.sprite.x, enemy.sprite.y - 12, `-${dmg}`, '#fef08a', '14px');

    if (enemy.hp <= 0) {
      this._spawnBurst(enemy.sprite.x, enemy.sprite.y, enemy.kind === 'boss' ? 20 : 8, tint, 'shard');
      this.slainCount += 1;
      this.score += enemy.kind === 'boss' ? 600 : 60;
      this._removeEnemy(enemy);
    } else {
      enemy.hpFill.width = Math.max(2, Math.round(enemy.barW * (enemy.hp / enemy.maxHp)));
    }
  }

  _removeEnemy(enemy) {
    enemy.active = false;
    enemy.sprite.destroy();
    enemy.hpBg.destroy();
    enemy.hpFill.destroy();
    const idx = this.enemies.indexOf(enemy);
    if (idx !== -1) this.enemies.splice(idx, 1);
  }

  _addShield(amount) {
    this.gateShield = Math.min(this.gateMaxHp, this.gateShield + amount);
    this._showFloatingText(GAME_DESIGN.width / 2, GATE_Y - 26, `+${amount} SHIELD`, '#22d3ee', '14px');
  }

  _hitGate(amount, impactX) {
    let rem = amount;
    if (this.gateShield > 0) {
      const absorbed = Math.min(this.gateShield, rem);
      this.gateShield -= absorbed;
      rem -= absorbed;
    }
    if (rem > 0) this.gateHp = Math.max(0, this.gateHp - rem);
    try { synthAudio.playGateHit(); } catch (_) {}
    this.cameras.main.shake(150, 0.01);
    this._spawnBurst(impactX, GATE_Y, 8, 0xef4444, 'shard');
    this._showFloatingText(impactX, GATE_Y - 18, `-${amount}`, '#f87171', '16px');
  }

  _checkBoardDeadlock() {
    if (this.isEnded) return;
    const rem = this.trayPieces.filter((p) => p !== null);
    if (!rem.length) return;
    if (!rem.some((p) => this._canShapeFitAnywhere(p.shape))) {
      this._showEndOverlay(false, i18n.t('defeatBoardTitle'));
    }
  }

  /**
   * 极简胜负结算弹窗 + 1 秒极速重开（PLAY AGAIN），无任何多余广告或繁琐流程
   */
  _showEndOverlay(won, titleStr) {
    if (this.isEnded) return;
    this.isEnded = true;

    const save = platformBridge.getLocalSave();
    if (this.score > (save.bestScore || 0)) {
      platformBridge.saveLocal({ bestScore: this.score, maxLevel: Math.max(save.maxLevel || 1, this.wave) });
    }

    const { width, height } = GAME_DESIGN;
    const modal = this.add.container(0, 0).setDepth(60);
    this.endModal = modal;

    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8)
      .setInteractive(new Phaser.Geom.Rectangle(0, 0, width, height), Phaser.Geom.Rectangle.Contains);
    const box = this.add.rectangle(width / 2, height / 2, 420, 410, 0x161214, 0.98);
    box.setStrokeStyle(2.5, won ? 0xeab308 : 0xdc2626, 0.95);

    const title = this.add.text(width / 2, height / 2 - 140, titleStr, {
      fontSize: '34px',
      fontStyle: 'bold',
      color: won ? '#fde047' : '#f87171'
    }).setOrigin(0.5);

    const sub = this.add.text(width / 2, height / 2 - 96, won ? i18n.t('victorySub') : i18n.t('defeatSub'), {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#a8a29e'
    }).setOrigin(0.5);

    const stats = this.add.text(
      width / 2,
      height / 2 - 22,
      `${i18n.t('statScore')}: ${this.score}   ·   ${i18n.t('statWave')}: ${this.wave}/${MAX_WAVES}   ·   ${i18n.t('statSlain')}: ${this.slainCount}`,
      { fontSize: '15px', fontStyle: 'bold', color: '#fef08a' }
    ).setOrigin(0.5);

    // 1 秒极速重开按钮（PLAY AGAIN）
    const replayBg = this.add.rectangle(width / 2, height / 2 + 66, 320, 62, 0xb91c1c, 1);
    replayBg.setStrokeStyle(2, 0xeab308, 0.95);
    replayBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-14, -14, 348, 90),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const replayTxt = this.add.text(width / 2, height / 2 + 66, i18n.t('playAgain'), {
      fontSize: '23px',
      fontStyle: 'bold',
      color: '#fffbeb'
    }).setOrigin(0.5);
    replayBg.on('pointerdown', () => {
      try { synthAudio.playClick(); } catch (_) {}
      this.scene.restart();
    });

    const menuBg = this.add.rectangle(width / 2, height / 2 + 142, 220, 44, 0x241d1b, 1);
    menuBg.setStrokeStyle(1.5, 0x78350f, 0.9);
    menuBg.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-10, -10, 240, 64),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true
    });
    const menuTxt = this.add.text(width / 2, height / 2 + 142, i18n.t('mainMenu'), {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#d6d3d1'
    }).setOrigin(0.5);
    menuBg.on('pointerdown', () => {
      try { synthAudio.playClick(); } catch (_) {}
      this.scene.start('MenuScene', { save: platformBridge.getLocalSave() });
    });

    modal.add([dim, box, title, sub, stats, replayBg, replayTxt, menuBg, menuTxt]);
    this._refreshHudAndState();
  }

  _toggleSound() {
    const next = !synthAudio.enabled;
    try {
      synthAudio.setEnabled(next);
      if (next) { synthAudio.ensureContext(); synthAudio.playClick(); }
    } catch (_) {}
    try { platformBridge.saveLocal({ soundEnabled: next }); } catch (_) {}
    this._refreshHudAndState();
  }

  _spawnBurst(x, y, count, tint, tex = 'spark') {
    for (let i = 0; i < count; i++) {
      const p = this.add.image(x, y, tex).setDepth(26);
      p.setTint(tint);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.FloatBetween(75, 220);
      p.vx = Math.cos(a) * spd;
      p.vy = Math.sin(a) * spd;
      p.life = 0;
      p.maxLife = Phaser.Math.Between(220, 380);
      p.baseScale = Phaser.Math.FloatBetween(0.5, 0.95);
      p.setScale(p.baseScale);
      this.fxParticles.push(p);
    }
  }

  _showFloatingText(x, y, text, color, fontSize = '16px') {
    const t = this.add.text(x, y, text, {
      fontSize,
      fontStyle: 'bold',
      color,
      stroke: '#0b0a0f',
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(35);
    this.tweens.add({
      targets: t,
      y: y - 34,
      alpha: 0,
      duration: 640,
      onComplete: () => t.destroy()
    });
  }

  _refreshHudAndState() {
    this.waveText.setText(
      this.wave === MAX_WAVES ? i18n.t('bossWaveLabel', this.wave, MAX_WAVES) : i18n.t('waveLabel', this.wave, MAX_WAVES)
    );
    this.scoreText.setText(i18n.t('scoreLabel', this.score));
    this.statusHintText.setText(i18n.t('turnHint'));
    this.hudLangBtn.label.setText(i18n.lang === 'en' ? '中' : 'EN');
    this.hudSoundBtn.label.setText(synthAudio.enabled ? 'SFX' : 'OFF');

    const hpRatio = Phaser.Math.Clamp(this.gateHp / this.gateMaxHp, 0, 1);
    this.gateHpBar.width = Math.round(284 * hpRatio);
    this.gateHpBar.setFillStyle(hpRatio > 0.45 ? 0x22c55e : (hpRatio > 0.22 ? 0xf59e0b : 0xef4444));
    this.gateShieldBar.width = Math.round(284 * Phaser.Math.Clamp(this.gateShield / this.gateMaxHp, 0, 1));
    this.gateHpText.setText(i18n.t('gateLabel', Math.ceil(this.gateHp), this.gateMaxHp, Math.ceil(this.gateShield)));

    if (typeof window !== 'undefined' && window.__GAME_STATE__) {
      window.__GAME_STATE__.scene = 'GameScene';
      window.__GAME_STATE__.lang = i18n.lang;
      window.__GAME_STATE__.score = this.score;
      window.__GAME_STATE__.wave = this.wave;
      window.__GAME_STATE__.turnCount = this.turnCount;
      window.__GAME_STATE__.gateHp = Math.ceil(this.gateHp);
      window.__GAME_STATE__.gateShield = Math.ceil(this.gateShield);
      window.__GAME_STATE__.linesCleared = this.linesCleared;
      window.__GAME_STATE__.piecesPlaced = this.piecesPlaced;
      window.__GAME_STATE__.dragging = Boolean(this.dragState);
      window.__GAME_STATE__.isEnded = this.isEnded;
      window.__GAME_STATE__.lastCast = this.lastCast;
      window.__GAME_STATE__.board = this.board.map((row) => row.map((cell) => (cell ? cell.element : null)));
      window.__GAME_STATE__.tray = this.trayPieces.map((p, idx) =>
        p
          ? {
              slotIndex: idx,
              x: TRAY_SLOTS_X[idx],
              y: TRAY_Y,
              shapeId: p.shape.id,
              cells: p.shape.cells,
              element: p.element
            }
          : null
      );
      window.__GAME_STATE__.enemies = this.enemies
        .filter((e) => e.active)
        .map((e) => ({
          id: e.id,
          kind: e.kind,
          lane: e.lane,
          span: e.span,
          row: e.row,
          hp: e.hp,
          maxHp: e.maxHp
        }));
      window.__GAME_STATE__.boardGeom = {
        originX: ORIGIN_X,
        originY: ORIGIN_Y,
        cellSize: CELL,
        size: COLS,
        dragLiftY: DRAG_LIFT_Y
      };
      window.__GAME_STATE__.battleGeom = {
        originX: GAME_DESIGN.battle.originX,
        laneWidth: GAME_DESIGN.battle.laneWidth,
        lanes: GAME_DESIGN.battle.lanes,
        rows: B_ROWS
      };
      window.__GAME_STATE__.hudButtons = {
        lang: { x: 386, y: 27 },
        sound: { x: 448, y: 27 },
        restart: { x: 502, y: 27 }
      };
    }
  }

  update(_time, delta) {
    const dt = delta / 1000;
    if (this.forgeBagua) this.forgeBagua.angle += 5 * dt;

    // 同步回合制：update 中绝不移动任何敌人，只更新粒子衰减动画
    for (let i = this.fxParticles.length - 1; i >= 0; i--) {
      const p = this.fxParticles[i];
      p.life += delta;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.setAlpha(Math.max(0, ratio));
      p.setScale(Math.max(0.05, ratio * p.baseScale));
      if (p.life >= p.maxLife) {
        p.destroy();
        this.fxParticles.splice(i, 1);
      }
    }
  }
}
