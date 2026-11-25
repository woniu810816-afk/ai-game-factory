/**
 * 零成本全球多平台统一商业化 SDK、GA4 埋点与新加坡 Supabase 云存档/榜单桥接层
 *
 * 兼容平台：
 * - Playgama Bridge (window.bridge)
 * - CrazyGames HTML5 SDK v2/v3 (window.CrazyGames.SDK)
 * - GameMonetize SDK (window.sdk)
 * - GamePix SDK (window.GamePix)
 * - Telegram Mini App (window.Telegram.WebApp) + AdsGram 激励广告 (window.Adsgram)
 * - Poki SDK v2 (window.PokiSDK)
 * - GitHub Pages / Cloudflare Pages / itch.io 独立站模式
 *
 * 3 个核心高价值激励广告触发点：
 * 1) revive_taiyi   — 濒死「太乙真火」清两行复活
 * 2) reroll_decree  — 肉鸽「元始敕令」三选一重抽
 * 3) double_essence — 结算玄铁精魄翻倍
 */

import { getRuntimeConfig } from './config.js';

const STORAGE_KEYS = {
  playerId: 'gf_player_id_v1',
  playerSecret: 'gf_player_secret_v1',
  nickname: 'gf_player_nickname_v1',
  save: 'irf_local_save_v1',
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
    const name = `Forge_${this.playerId.slice(-4).toUpperCase()}`;
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
   * 自动探测当前运行平台：
   * playgama / poki / crazygames / gamemonetize / gamepix / telegram / standalone
   */
  detectPlatform() {
    if (typeof window === 'undefined') return 'standalone';
    if (this.config.portalTarget && this.config.portalTarget !== 'auto') {
      return this.config.portalTarget;
    }
    if (window.bridge?.advertisement || window.bridge?.platform) return 'playgama';
    if (window.PokiSDK) return 'poki';
    if (window.CrazyGames?.SDK && window.CrazyGames.SDK.environment !== 'disabled') return 'crazygames';
    if (window.sdk?.showBanner) return 'gamemonetize';
    if (window.GamePix) return 'gamepix';
    if (window.Telegram?.WebApp && (window.Telegram.WebApp.initData || window.Adsgram)) return 'telegram';
    return 'standalone';
  }

  setAudioPauseHandlers({ onPause, onResume }) {
    this.pauseHandlers = {
      onPause: typeof onPause === 'function' ? onPause : () => {},
      onResume: typeof onResume === 'function' ? onResume : () => {}
    };
  }

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

  async init() {
    if (this.initialized) return { platform: this.platform };
    this.platform = this.detectPlatform();
    this._initGA4();

    try {
      if (this.platform === 'playgama' && window.bridge?.initialize) {
        await window.bridge.initialize().catch(() => {});
      } else if (this.platform === 'poki' && window.PokiSDK?.init) {
        await window.PokiSDK.init().catch(() => {});
      } else if (this.platform === 'crazygames' && window.CrazyGames?.SDK?.init) {
        await window.CrazyGames.SDK.init().catch(() => {});
      } else if (this.platform === 'telegram' && window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready?.();
        window.Telegram.WebApp.expand?.();
      }
    } catch (_) {}

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

  loadingFinished() {
    try {
      if (this.platform === 'playgama') {
        window.bridge?.platform?.sendMessage?.('game_ready');
      } else if (this.platform === 'poki') {
        window.PokiSDK?.gameLoadingFinished?.();
      } else if (this.platform === 'crazygames') {
        window.CrazyGames?.SDK?.game?.loadingStop?.();
      } else if (this.platform === 'gamepix') {
        window.GamePix?.loaded?.();
      }
    } catch (_) {}
    this.trackEvent('game_ready', {});
  }

  gameplayStart(meta = {}) {
    if (!this.isGameplayActive) {
      this.isGameplayActive = true;
      try {
        if (this.platform === 'playgama') {
          window.bridge?.platform?.sendMessage?.('gameplay_started');
        } else if (this.platform === 'poki') {
          window.PokiSDK?.gameplayStart?.();
        } else if (this.platform === 'crazygames') {
          window.CrazyGames?.SDK?.game?.gameplayStart?.();
        }
      } catch (_) {}
    }
    this.trackEvent('game_start', meta);
    this.trackEvent('level_start', meta);
  }

  gameplayStop() {
    if (!this.isGameplayActive) return;
    this.isGameplayActive = false;
    try {
      if (this.platform === 'playgama') {
        window.bridge?.platform?.sendMessage?.('gameplay_stopped');
      } else if (this.platform === 'poki') {
        window.PokiSDK?.gameplayStop?.();
      } else if (this.platform === 'crazygames') {
        window.CrazyGames?.SDK?.game?.gameplayStop?.();
      }
    } catch (_) {}
  }

  happyTime() {
    try {
      if (this.platform === 'crazygames') {
        window.CrazyGames?.SDK?.game?.happytime?.();
      } else if (this.platform === 'gamepix') {
        window.GamePix?.happyMoment?.();
      }
    } catch (_) {}
  }

  /**
   * 自然停顿插屏广告（Playgama / Poki / CrazyGames / GameMonetize / GamePix）
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
      if (this.platform === 'playgama' && window.bridge?.advertisement?.showInterstitial) {
        await window.bridge.advertisement.showInterstitial();
      } else if (this.platform === 'poki' && window.PokiSDK?.commercialBreak) {
        await window.PokiSDK.commercialBreak();
      } else if (this.platform === 'crazygames' && window.CrazyGames?.SDK?.ad?.requestAd) {
        await new Promise((resolve) => {
          window.CrazyGames.SDK.ad.requestAd('midgame', {
            adStarted: () => {},
            adFinished: () => resolve(),
            adError: () => resolve()
          });
        });
      } else if (this.platform === 'gamemonetize' && window.sdk?.showBanner) {
        await Promise.resolve(window.sdk.showBanner());
      } else if (this.platform === 'gamepix' && window.GamePix?.interstitialAd) {
        await window.GamePix.interstitialAd();
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
   * 统一激励视频广告（兼容 Playgama / Poki / CrazyGames / GameMonetize / GamePix / Telegram AdsGram）
   * @param {'revive_taiyi'|'reroll_decree'|'double_essence'|string} rewardType
   */
  async showRewardedBreak(rewardType = 'revive_taiyi') {
    this.gameplayStop();
    this.trackEvent('ad_rewarded_request', { reward_type: rewardType });

    this.pauseHandlers.onPause('rewarded');
    try {
      let granted = false;
      let reason = 'completed';

      if (this.platform === 'playgama' && window.bridge?.advertisement?.showRewarded) {
        granted = await new Promise((resolve) => {
          let settled = false;
          const done = (ok) => {
            if (!settled) { settled = true; resolve(ok); }
          };
          try {
            window.bridge.advertisement.on?.('rewarded_state_changed', (state) => {
              if (state === 'rewarded') done(true);
              if (state === 'closed' || state === 'failed') done(false);
            });
            Promise.resolve(window.bridge.advertisement.showRewarded()).then(() => {
              setTimeout(() => done(true), 200);
            }).catch(() => done(false));
          } catch (_) {
            done(false);
          }
        });
        reason = granted ? 'playgama_granted' : 'playgama_denied';
      } else if (this.platform === 'poki' && window.PokiSDK?.rewardedBreak) {
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
      } else if (this.platform === 'gamemonetize' && window.sdk?.showBanner) {
        await Promise.resolve(window.sdk.showBanner());
        granted = true;
        reason = 'gamemonetize_granted';
      } else if (this.platform === 'gamepix' && window.GamePix?.rewardAd) {
        const res = await window.GamePix.rewardAd();
        granted = Boolean(res?.success !== false);
        reason = granted ? 'gamepix_granted' : 'gamepix_denied';
      } else if (this.platform === 'telegram' && window.Adsgram?.init) {
        const blockId = this.config.adsgramBlockId || '';
        if (blockId) {
          const adController = window.Adsgram.init({ blockId });
          await adController.show();
          granted = true;
          reason = 'adsgram_granted';
        } else {
          await new Promise((r) => setTimeout(r, 300));
          granted = true;
          reason = 'telegram_demo';
        }
      } else {
        // 独立站 / GitHub Pages 演示模式：模拟短暂激励回调以便验收全链路闭环
        await new Promise((r) => setTimeout(r, 280));
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

  buildSupabaseHeaders(extra = {}) {
    const key = this.config.supabaseKey;
    const headers = {
      apikey: key,
      'x-gf-player-id': this.playerId,
      'x-gf-player-secret': this.playerSecret,
      ...extra
    };
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
      throw new Error('Supabase configuration missing');
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
   * 读取玩家本地与云端存档（玄铁精魄 coins、4 尊战将解锁与装备状态、最高波次与战功）
   */
  getLocalSave() {
    const def = {
      maxLevel: 1, // 对应最高波次 bestWave
      bestScore: 0,
      coins: 0, // 对应玄铁精魄 Iron Essence
      soundEnabled: true,
      nickname: this.nickname,
      unlockedWarlords: ['nezha'],
      selectedWarlord: 'nezha'
    };
    try {
      const parsed = JSON.parse(safeStorageGet(STORAGE_KEYS.save) || 'null');
      if (!parsed) return def;
      const warlords = Array.isArray(parsed.unlockedWarlords)
        ? Array.from(new Set(['nezha', ...parsed.unlockedWarlords]))
        : ['nezha'];
      const selected = warlords.includes(parsed.selectedWarlord) ? parsed.selectedWarlord : 'nezha';
      return {
        ...def,
        ...parsed,
        maxLevel: Math.max(1, Number(parsed.maxLevel || 1)),
        coins: Math.max(0, Number(parsed.coins || 0)),
        bestScore: Math.max(0, Number(parsed.bestScore || 0)),
        unlockedWarlords: warlords,
        selectedWarlord: selected
      };
    } catch (_) {
      return def;
    }
  }

  saveLocal(data) {
    const prev = this.getLocalSave();
    const merged = { ...prev, ...data };
    merged.coins = Math.max(0, Math.round(Number(merged.coins || 0)));
    merged.bestScore = Math.max(0, Math.round(Number(merged.bestScore || 0)));
    merged.maxLevel = Math.max(1, Math.round(Number(merged.maxLevel || 1)));
    const nextWarlords = Array.isArray(merged.unlockedWarlords)
      ? Array.from(new Set(['nezha', ...merged.unlockedWarlords]))
      : prev.unlockedWarlords;
    merged.unlockedWarlords = nextWarlords;
    merged.selectedWarlord = nextWarlords.includes(merged.selectedWarlord) ? merged.selectedWarlord : 'nezha';
    safeStorageSet(STORAGE_KEYS.save, JSON.stringify(merged));
    return merged;
  }

  async loadCloudSave() {
    const local = this.getLocalSave();
    if (!this.isSupabaseReady()) return local;
    try {
      const rows = await this._supabaseFetch(
        `gf_player_saves?game_id=eq.${encodeURIComponent(this.config.gameId)}&player_id=eq.${encodeURIComponent(this.playerId)}&select=max_level,best_score,coins,sound_enabled,nickname,save_data&limit=1`
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const cloud = rows[0];
        const cloudData = (cloud.save_data && typeof cloud.save_data === 'object') ? cloud.save_data : {};
        const cloudWarlords = Array.isArray(cloudData.unlockedWarlords) ? cloudData.unlockedWarlords : [];
        const mergedWarlords = Array.from(new Set(['nezha', ...local.unlockedWarlords, ...cloudWarlords]));
        const selectedWarlord = mergedWarlords.includes(local.selectedWarlord)
          ? local.selectedWarlord
          : (mergedWarlords.includes(cloudData.selectedWarlord) ? cloudData.selectedWarlord : 'nezha');

        return this.saveLocal({
          maxLevel: Math.max(local.maxLevel, Number(cloud.max_level || 1)),
          bestScore: Math.max(local.bestScore, Number(cloud.best_score || 0)),
          coins: Math.max(local.coins, Number(cloud.coins || 0)),
          soundEnabled: cloud.sound_enabled !== undefined ? Boolean(cloud.sound_enabled) : local.soundEnabled,
          nickname: cloud.nickname || local.nickname,
          unlockedWarlords: mergedWarlords,
          selectedWarlord
        });
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
          p_save_data: {
            version: this.config.gameVersion,
            platform: this.platform,
            unlockedWarlords: merged.unlockedWarlords,
            selectedWarlord: merged.selectedWarlord
          }
        }
      });
      return { synced: true, data: merged };
    } catch (e) {
      return { synced: false, data: merged, error: e.message };
    }
  }

  async submitScore({ score, levelReached, durationSec, revived = false, doubleClaimed = false }) {
    const safeScore = Math.max(0, Math.round(Number(score) || 0));
    const safeDuration = Math.max(1, Math.round(Number(durationSec) || 1));
    const safeLevel = Math.max(1, Math.round(Number(levelReached) || 1));

    const save = this.getLocalSave();
    if (safeScore > save.bestScore || safeLevel > save.maxLevel) {
      this.saveLocal({
        bestScore: Math.max(save.bestScore, safeScore),
        maxLevel: Math.max(save.maxLevel, safeLevel)
      });
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
          nickname: row.nickname || 'Guest',
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
