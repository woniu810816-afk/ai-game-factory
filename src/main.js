import Phaser from 'phaser';
import { GAME_DESIGN } from './config.js';
import { platformBridge } from './platform-bridge.js';
import { synthAudio } from './audio/synth-sfx.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { ResultScene } from './scenes/ResultScene.js';

// 符合 Poki / CrazyGames 审核规范：阻止空格键、方向键和滚轮触发宿主页面滚动
window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key)) {
    e.preventDefault();
  }
}, { passive: false });

const gameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_DESIGN.width,
  height: GAME_DESIGN.height,
  backgroundColor: '#070b1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, MenuScene, GameScene, ResultScene]
};

const game = new Phaser.Game(gameConfig);

// 广告期间自动静音并暂停游戏主循环，广告结束立即恢复（Poki / CrazyGames 必检项）
platformBridge.setAudioPauseHandlers({
  onPause: () => {
    synthAudio.setAdMuted(true);
    try {
      game.sound?.setMute?.(true);
      game.loop?.sleep?.();
    } catch (_) {}
  },
  onResume: () => {
    synthAudio.setAdMuted(false);
    try {
      game.sound?.setMute?.(!synthAudio.enabled);
      game.loop?.wake?.();
    } catch (_) {}
  }
});

// 页面切入后台自动静音
document.addEventListener('visibilitychange', () => {
  synthAudio.setAdMuted(document.hidden);
});
