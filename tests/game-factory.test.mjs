import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ELEMENTS, ELEMENT_KEYS, WARLORDS, DECREE_POOL, getWarlord } from '../src/config.js';
import { i18n } from '../src/i18n.js';
import { PlatformBridge } from '../src/platform-bridge.js';
import { buildChineseBriefing, patrolSupabaseLeaderboard } from '../scripts/daily-patrol.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ============================================================================
// 1. 安全红线、零独立服务器与零日文字符视觉规范扫描
// ============================================================================
const scanTargets = [
  'index.html',
  'src/config.js',
  'src/i18n.js',
  'src/platform-bridge.js',
  'src/main.js',
  'src/audio/synth-sfx.js',
  'src/scenes/BootScene.js',
  'src/scenes/MenuScene.js',
  'src/scenes/GameScene.js',
  'src/scenes/ResultScene.js',
  'supabase/game_factory_schema_rls.sql',
  'scripts/package-portal.mjs',
  'scripts/daily-patrol.mjs',
  '.github/workflows/deploy-and-package.yml',
  '.github/workflows/itch-deploy.yml',
  '.github/workflows/daily-patrol.yml'
];

const secretPatterns = [
  /https:\/\/[a-z0-9]{15,}\.supabase\.co/i,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /sb_publishable_[A-Za-z0-9_-]{12,}/,
  /sb_secret_[A-Za-z0-9_-]{8,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /vultr/i,
  /[\u3040-\u309F\u30A0-\u30FF]/ // 严禁出现日文假名字符
];

for (const rel of scanTargets) {
  const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  for (const pat of secretPatterns) {
    assert.equal(pat.test(content), false, `检测到违规硬编码或红线违规项：${rel} 匹配 ${pat}`);
  }
}
console.log('✓ 1. 无硬编码密钥、零 VPS 与零日文字符红线扫描通过');

// ============================================================================
// 2. 新加坡 Supabase 防刷分 RLS 与核心对象校验
// ============================================================================
const sql = fs.readFileSync(path.join(rootDir, 'supabase/game_factory_schema_rls.sql'), 'utf8');
for (const tbl of ['gf_player_saves', 'gf_leaderboard_scores', 'gf_patrol_reports']) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tbl}\\b`));
  assert.match(sql, new RegExp(`ALTER TABLE public\\.${tbl}\\s+ENABLE ROW LEVEL SECURITY`));
}
for (const fn of ['gf_upsert_player_save', 'gf_submit_score', 'gf_cleanup_anomalous_scores']) {
  assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\b`));
}
console.log('✓ 2. 新加坡 Supabase 表结构与防刷分 RLS/RPC 校验通过');

// ============================================================================
// 3. 《INVESTITURE: Relic Forge》五行、4 尊封神战将、元始敕令、双语与埋点校验
// ============================================================================
{
  assert.deepEqual(ELEMENT_KEYS, ['fire', 'metal', 'earth', 'water', 'wood']);
  for (const k of ELEMENT_KEYS) assert.ok(ELEMENTS[k]?.texture);

  assert.equal(WARLORDS.length, 4, '应提供 4 尊封神战将');
  assert.equal(WARLORDS[0].id, 'nezha');
  assert.equal(WARLORDS[0].cost, 0, '哪吒必须默认免费');
  assert.ok(WARLORDS.slice(1).every((w) => w.cost > 0), '杨戬/雷震子/姜子牙需用玄铁精魄解锁');
  assert.equal(getWarlord('unknown').id, 'nezha');
  assert.ok(DECREE_POOL.length >= 6, '肉鸽元始敕令卡池至少 6 张');

  // 双语切换测试
  i18n.setLang('en');
  assert.equal(i18n.t('titleMain'), 'INVESTITURE');
  i18n.toggle();
  assert.equal(i18n.lang, 'zh');
  assert.equal(i18n.t('titleMain'), '封神锻炉');
  i18n.setLang('en');

  // 校验 3 个高价值激励广告位与关键 GA4 埋点
  const allSrc = [
    'src/platform-bridge.js',
    'src/scenes/MenuScene.js',
    'src/scenes/GameScene.js',
    'src/scenes/ResultScene.js'
  ].map((p) => fs.readFileSync(path.join(rootDir, p), 'utf8')).join('\n');

  for (const token of [
    'revive_taiyi',
    'reroll_decree',
    'double_essence',
    'heavenly_resonance',
    'tribulation_trigger',
    'decree_pick',
    'warlord_unlock',
    'game_over'
  ]) {
    assert.ok(allSrc.includes(`'${token}'`), `缺少必需商业化/埋点标记：${token}`);
  }
  console.log('✓ 3. 五行配置、4 尊封神战将、双语切换、元始敕令与 3 大激励广告点校验通过');
}

// ============================================================================
// 4. PlatformBridge：零成本多平台 SDK 探测 + 广告静音暂停 + sb_publishable_ 请求头
// ============================================================================
{
  const pauseCalls = [];
  const gaEvents = [];

  // 4A. 验证 Playgama Bridge 探测与激励广告回调
  globalThis.window = {
    gtag: (_cmd, name, params) => gaEvents.push({ name, params }),
    bridge: {
      initialize: async () => {},
      platform: { sendMessage: () => {} },
      advertisement: {
        showInterstitial: async () => {},
        showRewarded: async () => {},
        on: (_ev, cb) => setTimeout(() => cb('rewarded'), 10)
      }
    }
  };
  const pgBridge = new PlatformBridge({
    gameId: 'investiture-test',
    supabaseUrl: 'https://demo.supabase.co',
    supabaseKey: 'sb_publishable_demo_opaque',
    commercialCooldownMs: 0
  });
  pgBridge.setAudioPauseHandlers({
    onPause: (t) => pauseCalls.push(`pause:${t}`),
    onResume: (t) => pauseCalls.push(`resume:${t}`)
  });
  await pgBridge.init();
  assert.equal(pgBridge.platform, 'playgama', '应自动识别 Playgama Bridge');
  pgBridge.loadingFinished();
  pgBridge.gameplayStart({ warlord_id: 'nezha' });

  const comm = await pgBridge.showCommercialBreak('retry');
  assert.equal(comm.shown, true);
  const rew = await pgBridge.showRewardedBreak('revive_taiyi');
  assert.equal(rew.granted, true);
  assert.deepEqual(pauseCalls, ['pause:commercial', 'resume:commercial', 'pause:rewarded', 'resume:rewarded']);

  // 4B. 验证 GameMonetize / GamePix / Telegram AdsGram 探测
  globalThis.window = { sdk: { showBanner: () => {} } };
  assert.equal(new PlatformBridge().detectPlatform(), 'gamemonetize');
  globalThis.window = { GamePix: { rewardAd: async () => ({ success: true }) } };
  assert.equal(new PlatformBridge().detectPlatform(), 'gamepix');
  globalThis.window = { Telegram: { WebApp: { initData: 'mock' } }, Adsgram: { init: () => ({ show: async () => {} }) } };
  assert.equal(new PlatformBridge().detectPlatform(), 'telegram');

  // 验证 sb_publishable_ 绝不写入 Authorization 头
  const sbHeaders = pgBridge.buildSupabaseHeaders();
  assert.equal(sbHeaders.apikey, 'sb_publishable_demo_opaque');
  assert.equal('Authorization' in sbHeaders, false);

  const eventNames = gaEvents.map((e) => e.name);
  assert.ok(eventNames.includes('game_boot'));
  assert.ok(eventNames.includes('game_start'));
  assert.ok(eventNames.includes('ad_rewarded_complete'));

  delete globalThis.window;
  console.log('✓ 4. 多平台零成本 SDK（Playgama/GameMonetize/GamePix/Telegram AdsGram）与 Supabase 请求头测试通过');
}

// ============================================================================
// 5. 每日巡检脚本（GA4 日报渲染 + Supabase 异常高分清理）
// ============================================================================
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      ok: true,
      newly_flagged: 2,
      deleted_flagged: 4,
      valid_scores_remaining: 88
    })
  });

  const spRes = await patrolSupabaseLeaderboard({
    supabaseUrl: 'https://demo.supabase.co',
    secretKey: 'sb_secret_mock_token'
  });
  globalThis.fetch = originalFetch;

  assert.equal(spRes.newlyFlagged, 2);
  const md = buildChineseBriefing({
    dateStr: '2026-11-25',
    ga4: { configured: true, activeUsers: 500, newUsers: 220, sessions: 750, avgEngagementSec: 210, events: { game_boot: 700, level_start: 1000, level_complete: 600, level_fail: 400, ad_rewarded_complete: 180, ad_commercial_complete: 290 } },
    supabase: spRes
  });
  assert.ok(md.includes('活跃玩家（DAU） | 500'));
  console.log('✓ 5. 每日中文数据简报渲染与新加坡 Supabase 反作弊巡检测试通过');
}

// ============================================================================
// 6. iPhone 390×844 (DPR=3) 触摸点击、中英文切换与单指拖拽 5×5 消行端到端验收
// ============================================================================
{
  const hasDist = fs.existsSync(path.join(rootDir, 'dist', 'index.html'));
  let hasPlaywright = false;
  try {
    execFileSync('python3', ['-c', 'import playwright'], { stdio: 'ignore' });
    hasPlaywright = true;
  } catch (_) {
    hasPlaywright = false;
  }

  if (hasDist && hasPlaywright) {
    console.log('\n▶ 正在执行 iPhone 390×844 (DPR=3) 触摸开局、双语切换与单指拖拽拼图消行 E2E 测试...');
    execFileSync('python3', [path.join(rootDir, 'tests', 'mobile-touch.e2e.py')], {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } else {
    console.log('ℹ 6. 当前无 dist 产物或无 Playwright 环境，跳过本地浏览器 E2E（本地 npm run build && npm test 自动全量执行）');
  }
}

console.log('\n🎉 《INVESTITURE: Relic Forge》全部自动化验收测试通过！');
