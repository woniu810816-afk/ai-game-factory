/**
 * 游戏全局配置与运行时环境变量读取模块
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
  const gameId = String(globalCfg.gameId || readEnv('VITE_GAME_ID', 'star-dash-v1')).trim();

  return {
    gameId,
    gameVersion: '1.0.0',
    gameTitle: '星际冲刺',
    portalTarget,
    ga4MeasurementId,
    supabaseUrl,
    supabaseKey,
    // 关卡与反作弊参数（与 Supabase 端防刷分阈值保持一致）
    maxLevels: 12,
    commercialCooldownMs: 45_000,
    maxScorePerSecond: 180
  };
}

export const GAME_DESIGN = {
  width: 540,
  height: 960,
  colors: {
    bgTop: 0x090f24,
    bgBottom: 0x121d42,
    primary: 0x38bdf8,
    accent: 0xfacc15,
    danger: 0xf43f5e,
    success: 0x22c55e,
    shield: 0xa855f7,
    panel: 0x0f172a
  }
};
