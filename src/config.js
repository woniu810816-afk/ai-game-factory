/**
 * 《INVESTITURE: Relic Forge / 封神锻炉：天劫破阵》全局配置
 * - 五行属性色纹定义（火/金/土/水/木）
 * - 4 尊全封闭青铜战盔封神战将（真实生效的局内被动）
 * - 8 张肉鸽「元始敕令」青铜竹简强化卡
 * - 5×5 八卦锻炉布局与 Block Blast! 风格拼图形状库
 * 严格遵守安全红线：绝不硬编码任何真实密钥或独立服务器地址。
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
    gameVersion: '3.0.0',
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
 * 五行属性色纹与法宝映射
 */
export const ELEMENTS = {
  fire: {
    id: 'fire',
    hex: 0xef4444,
    lightHex: 0xfca5a5,
    css: '#f87171',
    texture: 'tile_fire'
  },
  metal: {
    id: 'metal',
    hex: 0xfbbf24,
    lightHex: 0xfef08a,
    css: '#fde047',
    texture: 'tile_metal'
  },
  earth: {
    id: 'earth',
    hex: 0xb45309,
    lightHex: 0xf59e0b,
    css: '#f59e0b',
    texture: 'tile_earth'
  },
  water: {
    id: 'water',
    hex: 0x06b6d4,
    lightHex: 0x67e8f9,
    css: '#22d3ee',
    texture: 'tile_water'
  },
  wood: {
    id: 'wood',
    hex: 0x10b981,
    lightHex: 0x6ee7b7,
    css: '#34d399',
    texture: 'tile_wood'
  }
};

export const ELEMENT_KEYS = ['fire', 'metal', 'earth', 'water', 'wood'];

/**
 * 4 尊封神战将（全封闭商周青铜战盔 / 饕餮面甲背影或侧影，各自拥有真实生效的被动加成）
 */
export const WARLORDS = [
  {
    id: 'nezha',
    cost: 0,
    texture: 'warlord_nezha',
    accentHex: 0xef4444,
    trimHex: 0xfbbf24,
    cssColor: '#f87171',
    bonus: { fireDmgMult: 1.35, fireExtraPierce: 2 }
  },
  {
    id: 'yangjian',
    cost: 60,
    texture: 'warlord_yangjian',
    accentHex: 0xfbbf24,
    trimHex: 0x38bdf8,
    cssColor: '#fde047',
    bonus: { armorPierce: true, metalExtraChain: 1 }
  },
  {
    id: 'leizhenzi',
    cost: 120,
    texture: 'warlord_leizhenzi',
    accentHex: 0xa855f7,
    trimHex: 0x22d3ee,
    cssColor: '#c084fc',
    bonus: { resonanceMult: 2.6, resonanceZap: true }
  },
  {
    id: 'jiangziya',
    cost: 200,
    texture: 'warlord_jiangziya',
    accentHex: 0x10b981,
    trimHex: 0xfef08a,
    cssColor: '#34d399',
    bonus: { qiGainMult: 1.3, woodBonusHeal: 15, decreeHeal: 15 }
  }
];

export function getWarlord(id) {
  return WARLORDS.find((w) => w.id === id) || WARLORDS[0];
}

/**
 * 局内肉鸽「元始敕令」青铜竹简强化卡池（三选一可叠加构筑）
 */
export const DECREE_POOL = [
  { id: 'fire_split', element: 'fire', color: 0xef4444 },
  { id: 'metal_chain', element: 'metal', color: 0xfbbf24 },
  { id: 'earth_stun', element: 'earth', color: 0xd97706 },
  { id: 'water_surge', element: 'water', color: 0x06b6d4 },
  { id: 'wood_bastion', element: 'wood', color: 0x10b981 },
  { id: 'resonance_echo', element: 'metal', color: 0xc084fc },
  { id: 'forge_greed', element: 'earth', color: 0xf59e0b },
  { id: 'iron_gate', element: 'wood', color: 0x2dd4bf }
];

/**
 * 5×5 商周青铜八卦锻炉拼图块形状库（兼顾策略深度与 5×5 盘面流畅度）
 */
export const PIECE_SHAPES = [
  { id: 'dot', cells: [[0, 0]], weight: 10 },
  { id: 'h2', cells: [[0, 0], [0, 1]], weight: 16 },
  { id: 'v2', cells: [[0, 0], [1, 0]], weight: 16 },
  { id: 'h3', cells: [[0, 0], [0, 1], [0, 2]], weight: 14 },
  { id: 'v3', cells: [[0, 0], [1, 0], [2, 0]], weight: 14 },
  { id: 'sq2', cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 12 },
  { id: 'l3a', cells: [[0, 0], [1, 0], [1, 1]], weight: 12 },
  { id: 'l3b', cells: [[0, 1], [1, 0], [1, 1]], weight: 12 },
  { id: 'l3c', cells: [[0, 0], [0, 1], [1, 0]], weight: 10 },
  { id: 'l3d', cells: [[0, 0], [0, 1], [1, 1]], weight: 10 },
  { id: 't4', cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 7 },
  { id: 'diag2', cells: [[0, 0], [1, 1]], weight: 7 }
];

export const GAME_DESIGN = {
  width: 540,
  height: 960,
  // 黄金双区竖屏布局常量（上半屏战场 42% + 下半屏 5×5 八卦锻炉与三槽 58%）
  battleTop: 68,
  battleBottom: 404,
  gateY: 374,
  board: {
    size: 5,
    cellSize: 60,
    originX: 120, // (540 - 300) / 2
    originY: 444, // 棋盘占 444..744（300×300），外青铜八卦框占 432..756
    dragLiftY: 60, // 手机单指拖拽时向上偏移 60px，绝不遮挡落点预览
    trayY: 856,
    traySlotsX: [104, 270, 436]
  },
  colors: {
    inkBg: 0x0b0a10,
    bronzeDark: 0x1c1612,
    bronzeMid: 0x5c3d22,
    bronzeGold: 0xd99b38,
    verdigris: 0x2dd4bf,
    crimson: 0xdc2626
  }
};
