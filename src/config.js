/**
 * 《INVESTITURE: Relic Forge》V1.0 核心玩法 MVP 全局配置
 * - 上方 8 条纵道（Lane 1~8）与下方 8×8 青铜八卦锻炉严格 1:1 垂直对齐
 * - 拖拽防遮挡自动上移 65px（dragLiftY = 65）
 * - 三大属性（火 Flame / 金 Thunder / 水 Tide）+ 10 种经典 Block Blast 基础拼图形状
 * - 10 波精简通关循环（第 10 波关底巨型青铜妖王 Boss）
 */

function readEnv(key, fallback = '') {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key] !== undefined) {
      return String(import.meta.env[key] || '').trim();
    }
  } catch (_) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] !== undefined) {
      return String(process.env[key] || '').trim();
    }
  } catch (_) {}
  return fallback;
}

export function getRuntimeConfig() {
  const globalCfg = (typeof window !== 'undefined' && window.__GAME_CONFIG__) ? window.__GAME_CONFIG__ : {};
  const supabaseUrl = String(globalCfg.supabaseUrl || readEnv('VITE_SUPABASE_URL', ''))
    .trim()
    .replace(/\/+$/, '');
  const supabaseKey = String(globalCfg.supabasePublishableKey || readEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '')).trim();
  const ga4MeasurementId = String(globalCfg.ga4MeasurementId || readEnv('VITE_GA4_MEASUREMENT_ID', '')).trim();
  const portalTarget = String(globalCfg.portalTarget || readEnv('VITE_PORTAL_TARGET', 'auto')).trim().toLowerCase();
  const gameId = String(globalCfg.gameId || readEnv('VITE_GAME_ID', 'investiture-relic-forge-v1')).trim();

  return {
    gameId,
    gameVersion: '1.0.0-mvp',
    gameTitle: 'INVESTITURE: Relic Forge',
    portalTarget,
    ga4MeasurementId,
    supabaseUrl,
    supabaseKey,
    commercialCooldownMs: 45_000,
    maxScorePerSecond: 320
  };
}

/**
 * 三大核心法宝属性（颜色 + 内部几何图腾双重区分）
 */
export const ELEMENTS = {
  fire: {
    id: 'fire',
    hex: 0xdc2626,
    glowHex: 0xef4444,
    lightHex: 0xfef08a,
    css: '#f87171',
    texture: 'tile_fire'
  },
  thunder: {
    id: 'thunder',
    hex: 0xd97706,
    glowHex: 0xfbbf24,
    lightHex: 0xfef9c3,
    css: '#fde047',
    texture: 'tile_thunder'
  },
  tide: {
    id: 'tide',
    hex: 0x0891b2,
    glowHex: 0x22d3ee,
    lightHex: 0xa5f3fc,
    css: '#22d3ee',
    texture: 'tile_tide'
  }
};

export const ELEMENT_KEYS = ['fire', 'thunder', 'tide'];

/**
 * 10 种经典 Block Blast 基础拼图形状（适配 8×8 青铜八卦锻炉，策略流畅易上手）
 */
export const PIECE_SHAPES = [
  { id: 'dot', cells: [[0, 0]], weight: 8 },
  { id: 'h2', cells: [[0, 0], [0, 1]], weight: 14 },
  { id: 'v2', cells: [[0, 0], [1, 0]], weight: 14 },
  { id: 'h3', cells: [[0, 0], [0, 1], [0, 2]], weight: 14 },
  { id: 'v3', cells: [[0, 0], [1, 0], [2, 0]], weight: 14 },
  { id: 'h4', cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 10 },
  { id: 'v4', cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 10 },
  { id: 'sq2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 12 },
  { id: 'l3a', cells: [[0, 0], [1, 0], [1, 1]], weight: 10 },
  { id: 't4', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 8 }
];

export const MAX_WAVES = 10;

export const GAME_DESIGN = {
  width: 540,
  height: 960,
  // 上方商周古战场（约 30%，严格 8 条纵道与下方 8×8 阵盘 1:1 水平对齐）
  battle: {
    topY: 54,
    originX: 46, // 与 board.originX 完全一致
    laneWidth: 56, // 与 board.cellSize 完全一致
    lanes: 8,
    rows: 5, // 同步回合制 5 格纵深（row 0..4，超过 row 4 即撞击阵门）
    rowOriginY: 70,
    rowHeight: 36,
    gateY: 292
  },
  // 下方 8×8 青铜八卦锻炉 + 底部三选一拼图槽（约 70%）
  board: {
    size: 8,
    cellSize: 56, // 8 * 56 = 448px，左右边距各 46px
    originX: 46,
    originY: 332, // 棋盘占 y: 332..780
    dragLiftY: 65, // 手指拖动时自动向上偏移 65px 防止手指遮挡落点预览
    trayY: 872,
    traySlotsX: [102, 270, 438]
  },
  colors: {
    bgDark: 0x0b0a0f,
    bronzeDark: 0x1a1512,
    bronzeMid: 0x5c3d22,
    bronzeGold: 0xd99b38
  }
};
