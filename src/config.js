/**
 * 《Celestial Rush》全局配置、流光拖尾皮肤定义与运行时环境变量读取模块
 * 严格遵守安全红线：绝不在代码中硬编码任何真实密钥或独立服务器地址。
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
  const gameId = String(globalCfg.gameId || readEnv('VITE_GAME_ID', 'celestial-rush-v1')).trim();

  return {
    gameId,
    gameVersion: '2.0.0',
    gameTitle: 'Celestial Rush',
    portalTarget,
    ga4MeasurementId,
    supabaseUrl,
    supabaseKey,
    // 商业化广告冷却与反作弊参数（与新加坡 Supabase 端防刷分阈值保持一致）
    maxLevels: 99,
    commercialCooldownMs: 45_000,
    maxScorePerSecond: 260
  };
}

/**
 * 流光拖尾皮肤（TRAILS）配置：
 * - 默认第 1 款免费（CRIMSON FLAME）
 * - 其余 3 款可用局内收集的 Spirit Jade 永久解锁并保存在本地/云端
 */
export const TRAIL_SKINS = [
  {
    id: 'crimson_flame',
    name: 'CRIMSON FLAME',
    cost: 0,
    primaryHex: 0xf97316,
    secondaryHex: 0xfef08a,
    accentHex: 0xef4444,
    cssColor: '#fb923c',
    wheelTint: 0xffb347
  },
  {
    id: 'jade_lotus',
    name: 'JADE LOTUS',
    cost: 40,
    primaryHex: 0x10b981,
    secondaryHex: 0xa7f3d0,
    accentHex: 0x34d399,
    cssColor: '#34d399',
    wheelTint: 0x6ee7b7
  },
  {
    id: 'thunder_gold',
    name: 'THUNDER GOLD',
    cost: 100,
    primaryHex: 0xfacc15,
    secondaryHex: 0x67e8f9,
    accentHex: 0xc084fc,
    cssColor: '#fde047',
    wheelTint: 0x7dd3fc
  },
  {
    id: 'void_ink',
    name: 'VOID INK',
    cost: 200,
    primaryHex: 0x94a3b8,
    secondaryHex: 0xf8fafc,
    accentHex: 0x818cf8,
    cssColor: '#c7d2fe',
    wheelTint: 0xc4b5fd
  }
];

export function getTrailSkin(id) {
  return TRAIL_SKINS.find((s) => s.id === id) || TRAIL_SKINS[0];
}

export const GAME_DESIGN = {
  width: 540,
  height: 960,
  colors: {
    bgDark: 0x090714,
    bgMid: 0x160d29,
    gold: 0xfbbf24,
    crimson: 0xef4444,
    jade: 0x34d399,
    bronze: 0xb45309,
    thunder: 0x2dd4bf,
    panel: 0x140e24,
    panelBorder: 0x5b3b1e
  }
};
