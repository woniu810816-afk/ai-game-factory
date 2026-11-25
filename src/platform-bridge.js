/**
 * 统一商业化、门户生命周期、GA4 埋点与新加坡 Supabase 排行榜/云存档桥接层
 *
 * 参考规范：
 * - defold/template-html5-poki 与 Poki SDK v2 官方生命周期/广告静音规范
 * - CrazyGames HTML5 SDK v2/v3 官方广告与环境探测规范
 * - Telegram Mini App (WebApp) 容器适配
 * - 新加坡 Supabase（兼容新版 sb_publishable_ 可发布密钥与防刷分 RPC）
 */

import { getRuntimeConfig } from './config.js';

const STORAGE_KEYS = {
  playerId: 'gf_player_id_v1',
  playerSecret: 'gf_player_secret_v1',
  nickname: 'gf_player_nickname_v1',
  save: 'gf_local_save_v1',
  retention: 'gf_retention_meta_v1'
};

function safeStorageGet(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

function safeStorageSet(key, val) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val));
  } catch (_) {}
}

function randomHex(len = 24) {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function isLegacyJwtKey(key) {
  return typeof key === 'string' && key.startsWith('eyJ') && key.split('.').length === 3;
}

export class PlatformBridge {
  constructor(customConfig = null) {
    this.config = customConfig ? Object.assign(getRuntimeConfig(), customConfig) : getRuntimeConfig();
    this.platform = 'standalone';
    this.initialized = false;
    this.isGameplayActive = false;
    this.lastCommercialAt = 0;
    this.sessionId = `sess_${Date.now()}_${randomHex(6)}`;
    this.pauseHandlers = { onPause: () => {}, onResume: () => {} };
    this.eventLog = [];

    this.playerId = this._ensurePlayerId();
    this.playerSecret = this._ensurePlayerSecret();
    this.nickname = this._ensureNickname();
    this.retentionInfo = this._computeRetention();
  }

  _ensurePlayerId() {
    const existing = safeStorageGet(STORAGE_KEYS.playerId);
    if (existing) return existing;
    const tgUser = typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user;
    const id = tgUser?.id ? `tg_${tgUser.id}` : `p_${randomHex(16)}`;
    safeStorageSet(STORAGE_KEYS.playerId, id);
    return id;
  }

  _ensurePlayerSecret() {
    const existing = safeStorageGet(STORAGE_KEYS.playerSecret);
    if (existing) return existing;
    const sec = randomHex(32);
    safeStorageSet(STORAGE_KEYS.playerSecret, sec);
    return sec;
  }

  _ensureNickname() {
    const tgUser = typeof window !== 'undefined' && window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser?.first_name) {
      const tgName = String(tgUser.first_name).slice(0, 16);
      safeStorageSet(STORAGE_KEYS.nickname, tgName);
      return tgName;
    }
    const existing = safeStorageGet(STORAGE_KEYS.nickname);
    if (existing) return existing;
    const name = `飞行员${this.playerId.slice(-4).toUpperCase()}`;
    safeStorageSet(STORAGE_KEYS.nickname, name);
    return name;
  }

  _computeRetention() {
    const today = new Date().toISOString().slice(0, 10);
    let meta = null;
    try {
      meta = JSON.parse(safeStorageGet(STORAGE_KEYS.retention) || 'null');
    } catch (_) {
      meta = null;
    }
    if (!meta || !meta.firstDate) {
      meta = { firstDate: today, lastDate: today, visits: 1, consecutiveDays: 1 };
    } else if (meta.lastDate !== today) {
      const diffFromLast = Math.round((new Date(today) - new Date(meta.lastDate)) / 86400000);
      meta.consecutiveDays = diffFromLast === 1 ? (meta.consecutiveDays || 1) + 1 : 1;
      meta.lastDate = today;
      meta.visits = (meta.visits || 1) + 1;
    }
    const daysSinceFirst = Math.max(0, Math.round((new Date(today) - new Date(meta.firstDate)) / 86400000));
    safeStorageSet(STORAGE_KEYS.retention, JSON.stringify(meta));
    return {
      firstDate: meta.firstDate,
      daysSinceFirst,
      isReturning: daysSinceFirst > 0,
      visits: meta.visits,
      consecutiveDays: meta.consecutiveDays
    };
  }

  /**
   * 自动探测当前运行渠道：poki / crazygames / telegram / standalone
   */
  detectPlatform() {
    if (typeof window === 'undefined') return 'standalone';
    if (this.config.portalTarget && this.config.portalTarget !== 'auto') {
      return this.config.portalTarget;
    }
    if (window.PokiSDK) return 'poki';
    if (window.CrazyGames?.SDK && window.CrazyGames.SDK.environment !== 'disabled') {
      return 'crazygames';
    }
    if (window.Telegram?.WebApp && window.Telegram.WebApp.initData) {
      return 'telegram';
    }
    return 'standalone';
  }

  /**
   * 注册广告播放时的静音/暂停与恢复回调（Poki & CrazyGames 审核强制要求）
   */
  setAudioPauseHandlers({ onPause, onResume }) {
    this.pauseHandlers = {
      onPause: typeof onPause === 'function' ? onPause : () => {},
      onResume: typeof onResume === 'function' ? onResume : () => {}
    };
  }

  /**
   * 按需动态注入 GA4 gtag.js（仅当配置了衡量 ID 且非离线沙箱）
   */
  _initGA4() {
    const mid = this.config.ga4MeasurementId;
    if (!mid || typeof window === 'undefined' || typeof document === 'undefined') return;
    if (typeof window.gtag === 'function') return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', mid, {
      send_page_view: false,
      app_name: this.config.gameId,
      app_version: this.config.gameVersion
    });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(mid)}`;
    document.head.appendChild(script);
  }

  /**
   * 统一初始化入口：门户 SDK + GA4 + 留存上报
   */
  async init() {
    if (this.initialized) return { platform: this.platform };
    this.platform = this.detectPlatform();
    this._initGA4();

    try {
      if (this.platform === 'poki' && window.PokiSDK?.init) {
        await window.PokiSDK.init().catch(() => {});
      } else if (this.platform === 'crazygames' && window.CrazyGames?.SDK?.init) {
        await window.CrazyGames.SDK.init().catch(() => {});
      } else if (this.platform === 'telegram' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready?.();
        window.Telegram.WebApp.expand?.();
      }
    } catch (_) {
      // 广告拦截器或离线环境不阻塞游戏启动
    }

    this.initialized = true;
    this.trackEvent('game_boot', {
      days_since_first: this.retentionInfo.daysSinceFirst,
      is_returning: this.retentionInfo.isReturning ? 1 : 0
    });
    this.trackEvent('player_retention', {
      retention_day: this.retentionInfo.daysSinceFirst,
      visits: this.retentionInfo.visits,
      consecutive_days: this.retentionInfo.consecutiveDays
    });
    return { platform: this.platform };
  }

  /**
   * 首屏资源加载完成（Poki / CrazyGames 转化率统计必需）
   */
  loadingFinished() {
    try {
      if (this.platform === 'poki') {
        window.PokiSDK?.gameLoadingFinished?.();
      } else if (this.platform === 'crazygames') {
        window.CrazyGames?.SDK?.game?.loadingStop?.();
      }
    } catch (_) {}
    this.trackEvent('game_ready', {});
  }

  /**
   * 进入可交互局内玩法（防重复触发状态机）
   */
  gameplayStart(meta = {}) {
    if (!this.isGameplayActive) {
      this.isGameplayActive = true;
      try {
        if (this.platform === 'poki') {
          window.PokiSDK?.gameplayStart?.();
        } else if (this.platform === 'crazygames') {
          window.CrazyGames?.SDK?.game?.gameplayStart?.();
        }
      } catch (_) {}
    }
    this.trackEvent('level_start', meta);
  }

  /**
   * 局内玩法暂停/结算/返回菜单
   */
  gameplayStop() {
    if (!this.isGameplayActive) return;
    this.isGameplayActive = false;
    try {
      if (this.platform === 'poki') {
        window.PokiSDK?.gameplayStop?.();
      } else if (this.platform === 'crazygames') {
        window.CrazyGames?.SDK?.game?.gameplayStop?.();
      }
    } catch (_) {}
  }

  /**
   * 通关/破纪录高光时刻（触发 CrazyGames happytime）
   */
  happyTime() {
    try {
      if (this.platform === 'crazygames') {
        window.CrazyGames?.SDK?.game?.happytime?.();
      }
    } catch (_) {}
  }

  /**
   * 触发插屏广告（自然停顿点：重开/下一关前调用），自动处理静音与暂停
   */
  async showCommercialBreak(placement = 'interstitial') {
    this.gameplayStop();
    const now = Date.now();
    if (now - this.lastCommercialAt < this.config.commercialCooldownMs) {
      return { shown: false, reason: 'cooldown' };
    }
    this.lastCommercialAt = now;
    this.trackEvent('ad_commercial_request', { placement });

    this.pauseHandlers.onPause('commercial');
    try {
      if (this.platform === 'poki' && window.PokiSDK?.commercialBreak) {
        await window.PokiSDK.commercialBreak();
      } else if (this.platform === 'crazygames' && window.CrazyGames?.SDK?.ad?.requestAd) {
        await new Promise((resolve) => {
          window.CrazyGames.SDK.ad.requestAd('midgame', {
            adStarted: () => {},
            adFinished: () => resolve(),
            adError: () => resolve()
          });
        });
      }
      this.trackEvent('ad_commercial_complete', { placement });
      return { shown: true, reason: 'completed' };
    } catch (_) {
      return { shown: false, reason: 'error' };
    } finally {
      this.pauseHandlers.onResume('commercial');
    }
  }

  /**
   * 触发激励视频广告（复活 / 双倍积分），严格校验发奖结果并自动静音暂停
   * @returns {Promise<{ granted: boolean, reason: string }>}
   */
  async showRewardedBreak(rewardType = 'revive') {
    this.gameplayStop();
    this.trackEvent('ad_rewarded_request', { reward_type: rewardType });

    this.pauseHandlers.onPause('rewarded');
    try {
      let granted = false;
      let reason = 'completed';

      if (this.platform === 'poki' && window.PokiSDK?.rewardedBreak) {
        granted = Boolean(await window.PokiSDK.rewardedBreak());
        reason = granted ? 'poki_granted' : 'poki_skipped';
      } else if (this.platform === 'crazygames' && window.CrazyGames?.SDK?.ad?.requestAd) {
        granted = await new Promise((resolve) => {
          window.CrazyGames.SDK.ad.requestAd('rewarded', {
            adStarted: () => {},
            adFinished: () => resolve(true),
            adError: () => resolve(false)
          });
        });
        reason = granted ? 'crazygames_granted' : 'crazygames_error';
      } else {
        // 独立站 / GitHub Pages / Telegram 演示模式：短暂模拟激励回调以便完整验收业务闭环
        await new Promise((r) => setTimeout(r, 350));
        granted = true;
        reason = 'standalone_demo';
      }

      if (granted) {
        this.lastCommercialAt = Date.now();
        this.trackEvent('ad_rewarded_complete', { reward_type: rewardType, reason });
      } else {
        this.trackEvent('ad_rewarded_denied', { reward_type: rewardType, reason });
      }
      return { granted, reason };
    } catch (_) {
      this.trackEvent('ad_rewarded_denied', { reward_type: rewardType, reason: 'exception' });
      return { granted: false, reason: 'exception' };
    } finally {
      this.pauseHandlers.onResume('rewarded');
    }
  }

  /**
   * GA4 统一事件上报（启动、开局、通关/失败、广告触发、留存）
   */
  trackEvent(eventName, params = {}) {
    const payload = {
      game_id: this.config.gameId,
      game_version: this.config.gameVersion,
      platform: this.platform,
      session_id: this.sessionId,
      ...params
    };
    this.eventLog.push({ eventName, payload, ts: Date.now() });
    if (this.eventLog.length > 200) this.eventLog.shift();

    try {
      if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
        window.gtag('event', eventName, payload);
      }
    } catch (_) {}
  }

  /**
   * 构造新加坡 Supabase 请求头（严格兼容新版 sb_publishable_ 密钥）
   */
  buildSupabaseHeaders(extra = {}) {
    const key = this.config.supabaseKey;
    const headers = {
      apikey: key,
      'x-gf-player-id': this.playerId,
      'x-gf-player-secret': this.playerSecret,
      ...extra
    };
    // 新版 sb_publishable_ 不是 JWT，严禁放入 Authorization: Bearer
    if (isLegacyJwtKey(key)) {
      headers.Authorization = `Bearer ${key}`;
    }
    return headers;
  }

  isSupabaseReady() {
    return Boolean(this.config.supabaseUrl && this.config.supabaseKey);
  }

  async _supabaseFetch(path, options = {}) {
    if (!this.isSupabaseReady()) {
      throw new Error('未配置新加坡 Supabase 连接信息');
    }
    const headers = this.buildSupabaseHeaders(options.headers || {});
    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${this.config.supabaseUrl}/rest/v1/${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = text;
      }
    }
    if (!res.ok) {
      const msg = (data && (data.message || data.details || data.hint)) || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  /**
   * 读取玩家本地与云端存档（合并取最优进度，不回退）
   */
  getLocalSave() {
    const def = {
      maxLevel: 1,
      bestScore: 0,
      coins: 0,
      soundEnabled: true,
      nickname: this.nickname
    };
    try {
      const parsed = JSON.parse(safeStorageGet(STORAGE_KEYS.save) || 'null');
      return parsed ? { ...def, ...parsed } : def;
    } catch (_) {
      return def;
    }
  }

  saveLocal(data) {
    const merged = { ...this.getLocalSave(), ...data };
    safeStorageSet(STORAGE_KEYS.save, JSON.stringify(merged));
    return merged;
  }

  async loadCloudSave() {
    const local = this.getLocalSave();
    if (!this.isSupabaseReady()) return local;
    try {
      const rows = await this._supabaseFetch(
        `gf_player_saves?game_id=eq.${encodeURIComponent(this.config.gameId)}&player_id=eq.${encodeURIComponent(this.playerId)}&select=max_level,best_score,coins,sound_enabled,nickname&limit=1`
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const cloud = rows[0];
        const merged = this.saveLocal({
          maxLevel: Math.max(local.maxLevel, Number(cloud.max_level || 1)),
          bestScore: Math.max(local.bestScore, Number(cloud.best_score || 0)),
          coins: Math.max(local.coins, Number(cloud.coins || 0)),
          soundEnabled: cloud.sound_enabled !== undefined ? Boolean(cloud.sound_enabled) : local.soundEnabled,
          nickname: cloud.nickname || local.nickname
        });
        return merged;
      }
    } catch (_) {}
    return local;
  }

  async saveCloudProgress(patch = {}) {
    const merged = this.saveLocal(patch);
    if (!this.isSupabaseReady()) return { synced: false, data: merged };
    try {
      await this._supabaseFetch('rpc/gf_upsert_player_save', {
        method: 'POST',
        body: {
          p_game_id: this.config.gameId,
          p_nickname: merged.nickname || this.nickname,
          p_max_level: merged.maxLevel,
          p_best_score: merged.bestScore,
          p_coins: merged.coins,
          p_sound_enabled: merged.soundEnabled,
          p_save_data: { version: this.config.gameVersion, platform: this.platform }
        }
      });
      return { synced: true, data: merged };
    } catch (e) {
      return { synced: false, data: merged, error: e.message };
    }
  }

  /**
   * 提交成绩至新加坡 Supabase 全球排行榜（经由数据库端防刷分 RPC 校验）
   */
  async submitScore({ score, levelReached, durationSec, revived = false, doubleClaimed = false }) {
    const safeScore = Math.max(0, Math.round(Number(score) || 0));
    const safeDuration = Math.max(1, Math.round(Number(durationSec) || 1));
    const safeLevel = Math.max(1, Math.round(Number(levelReached) || 1));

    const save = this.getLocalSave();
    if (safeScore > save.bestScore) {
      this.saveLocal({ bestScore: safeScore });
    }

    if (!this.isSupabaseReady()) {
      return { ok: false, offline: true, score: safeScore };
    }

    try {
      const res = await this._supabaseFetch('rpc/gf_submit_score', {
        method: 'POST',
        body: {
          p_game_id: this.config.gameId,
          p_nickname: this.nickname,
          p_score: safeScore,
          p_level_reached: safeLevel,
          p_duration_sec: safeDuration,
          p_revived: Boolean(revived),
          p_double_claimed: Boolean(doubleClaimed),
          p_platform: this.platform
        }
      });
      return res || { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /**
   * 拉取全球排行榜 TOP 榜单（已由视图过滤异常作弊成绩）
   */
  async fetchLeaderboard(limit = 10) {
    if (!this.isSupabaseReady()) {
      const local = this.getLocalSave();
      return {
        source: 'local',
        entries: [
          { rank: 1, nickname: local.nickname || this.nickname, score: local.bestScore, level_reached: local.maxLevel, isSelf: true }
        ]
      };
    }

    try {
      const rows = await this._supabaseFetch(
        `gf_leaderboard_top?game_id=eq.${encodeURIComponent(this.config.gameId)}&order=best_score.desc&limit=${limit}`
      );
      return {
        source: 'supabase',
        entries: (rows || []).map((row, idx) => ({
          rank: idx + 1,
          nickname: row.nickname || '匿名玩家',
          score: Number(row.best_score || 0),
          level_reached: Number(row.max_level_reached || 1),
          isSelf: row.player_id === this.playerId
        }))
      };
    } catch (e) {
      const local = this.getLocalSave();
      return {
        source: 'local_fallback',
        error: e.message,
        entries: [
          { rank: 1, nickname: local.nickname || this.nickname, score: local.bestScore, level_reached: local.maxLevel, isSelf: true }
        ]
      };
    }
  }
}

export const platformBridge = new PlatformBridge();
