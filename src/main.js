import Phaser from 'phaser';
import { GAME_DESIGN } from './config.js';
import { i18n } from './i18n.js';
import { platformBridge } from './platform-bridge.js';
import { synthAudio } from './audio/synth-sfx.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';

// 阻止空格键、方向键和滚轮触发宿主页面滚动
window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key)) {
    e.preventDefault();
  }
}, { passive: false });

// 阻止 iOS Safari 页面级下拉橡皮筋滚动，不拦截 canvas 内部触摸
document.addEventListener('touchmove', (e) => {
  if (e.cancelable) e.preventDefault();
}, { passive: false });

// 轻量只读运行态快照（供 iPhone 竖屏自动化验收使用，绝不含任何密钥）
window.__GAME_STATE__ = {
  scene: 'BootScene',
  lang: i18n.lang,
  score: 0,
  wave: 1,
  turnCount: 0,
  gateHp: 100,
  gateShield: 0,
  linesCleared: 0,
  piecesPlaced: 0,
  dragging: false,
  isEnded: false,
  lastCast: null,
  board: [],
  tray: [],
  enemies: [],
  soundEnabled: true
};

const gameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_DESIGN.width,
  height: GAME_DESIGN.height,
  backgroundColor: '#0b0a0f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_DESIGN.width,
    height: GAME_DESIGN.height,
    autoRound: true
  },
  input: {
    activePointers: 3,
    touch: {
      capture: true
    }
  },
  scene: [BootScene, MenuScene, GameScene]
};

const game = new Phaser.Game(gameConfig);

// 高分屏（Retina DPR=3）与 iOS Safari 地址栏动态伸缩时，强制保持视觉尺寸与输入边界 1:1 严格对齐
function syncCanvasMetrics() {
  try {
    if (!game || !game.scale) return;
    game.scale.refresh();
    game.scale.updateBounds();
    if (game.canvas) {
      game.canvas.style.touchAction = 'none';
      game.canvas.style.pointerEvents = 'auto';
    }
  } catch (_) {}
}

window.addEventListener('resize', syncCanvasMetrics);
window.addEventListener('orientationchange', () => setTimeout(syncCanvasMetrics, 120));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncCanvasMetrics);
}

// 捕获阶段每次触摸前刷新 canvasBounds，彻底杜绝 iOS Safari 动态地址栏引起的热区偏移
window.addEventListener('touchstart', () => {
  try { game.scale?.updateBounds?.(); } catch (_) {}
}, { capture: true, passive: true });
window.addEventListener('pointerdown', () => {
  try { game.scale?.updateBounds?.(); } catch (_) {}
}, { capture: true, passive: true });

platformBridge.setAudioPauseHandlers({
  onPause: () => {
    synthAudio.setAdMuted(true);
    try { game.loop?.sleep?.(); } catch (_) {}
  },
  onResume: () => {
    synthAudio.setAdMuted(false);
    try { game.loop?.wake?.(); } catch (_) {}
  }
});

document.addEventListener('visibilitychange', () => {
  synthAudio.setAdMuted(document.hidden);
});
