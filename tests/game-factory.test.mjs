import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TRAIL_SKINS, getTrailSkin } from '../src/config.js';
import { PlatformBridge } from '../src/platform-bridge.js';
import { buildChineseBriefing, patrolSupabaseLeaderboard } from '../scripts/daily-patrol.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ============================================================================
// 1. 安全红线与零独立服务器规范扫描
// ============================================================================
const scanTargets = [
  'index.html',
  'src/config.js',
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
  /vultr/i
];

for (const rel of scanTargets) {
  const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  for (const pat of secretPatterns) {
    assert.equal(pat.test(content), false, `检测到违规硬编码或禁止项：${rel} 匹配 ${pat}`);
  }
}
console.log('✓ 1. 无硬编码密钥与零 VPS 环境红线扫描通过');

// ============================================================================
// 2. Supabase SQL 防刷分 RLS 与核心对象校验
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
// 3. 《Celestial Rush》TRAILS 皮肤配置与 GA4 关键事件埋点完整性校验
// ============================================================================
{
  assert.equal(TRAIL_SKINS.length, 4, '应提供 4 款 TRAILS 流光拖尾皮肤');
  assert.equal(TRAIL_SKINS[0].cost, 0, '第 1 款默认烈焰皮肤必须免费');
  assert.ok(TRAIL_SKINS.slice(1).every((s) => s.cost > 0), '其余 3 款皮肤需用灵玉解锁');
  assert.equal(getTrailSkin('unknown_id').id, 'crimson_flame');

  const allSceneSource = [
    'src/platform-bridge.js',
    'src/scenes/MenuScene.js',
    'src/scenes/GameScene.js',
    'src/scenes/ResultScene.js'
  ].map((p) => fs.readFileSync(path.join(rootDir, p), 'utf8')).join('\n');

  for (const ev of ['game_start', 'near_miss', 'fever_trigger', 'rewarded_revive', 'skin_unlock', 'game_over']) {
    assert.ok(allSceneSource.includes(`'${ev}'`), `缺少必需 GA4 关键事件上报：${ev}`);
  }
  console.log('✓ 3. Celestial Rush TRAILS 4 款皮肤与 6 项核心 GA4 埋点校验通过');
}

// ============================================================================
// 4. PlatformBridge：Poki / CrazyGames 广告静音暂停 + 皮肤存档合并 + sb_publishable_ 请求头
// ============================================================================
{
  const pauseCalls = [];
  const gaEvents = [];
  const pokiCalls = [];

  globalThis.window = {
    gtag: (_cmd, name, params) => gaEvents.push({ name, params }),
    PokiSDK: {
      init: async () => { pokiCalls.push('init'); },
      gameLoadingFinished: () => { pokiCalls.push('loadingFinished'); },
      gameplayStart: () => { pokiCalls.push('gameplayStart'); },
      gameplayStop: () => { pokiCalls.push('gameplayStop'); },
      commercialBreak: async () => { pokiCalls.push('commercialBreak'); },
      rewardedBreak: async () => { pokiCalls.push('rewardedBreak'); return true; }
    }
  };

  const bridge = new PlatformBridge({
    gameId: 'celestial-rush-test',
    supabaseUrl: 'https://demo.supabase.co',
    supabaseKey: 'sb_publishable_demo_opaque',
    commercialCooldownMs: 0
  });

  bridge.setAudioPauseHandlers({
    onPause: (type) => pauseCalls.push(`pause:${type}`),
    onResume: (type) => pauseCalls.push(`resume:${type}`)
  });

  await bridge.init();
  assert.equal(bridge.platform, 'poki', '应自动识别 Poki 渠道');
  bridge.loadingFinished();
  bridge.gameplayStart({ trail_id: 'crimson_flame' });
  bridge.gameplayStart({ trail_id: 'crimson_flame' }); // 重复调用不应重复触发 PokiSDK.gameplayStart
  assert.equal(pokiCalls.filter((x) => x === 'gameplayStart').length, 1);

  const comm = await bridge.showCommercialBreak('retry');
  assert.equal(comm.shown, true);
  assert.deepEqual(pauseCalls.slice(0, 2), ['pause:commercial', 'resume:commercial']);

  const rew = await bridge.showRewardedBreak('revive');
  assert.equal(rew.granted, true);
  assert.deepEqual(pauseCalls.slice(2, 4), ['pause:rewarded', 'resume:rewarded']);

  // 验证 GA4 埋点完整性
  const eventNames = gaEvents.map((e) => e.name);
  assert.ok(eventNames.includes('game_boot'));
  assert.ok(eventNames.includes('player_retention'));
  assert.ok(eventNames.includes('game_ready'));
  assert.ok(eventNames.includes('game_start'));
  assert.ok(eventNames.includes('ad_commercial_complete'));
  assert.ok(eventNames.includes('ad_rewarded_complete'));

  // 验证 sb_publishable_ 密钥绝不写入 Authorization 头
  const sbHeaders = bridge.buildSupabaseHeaders();
  assert.equal(sbHeaders.apikey, 'sb_publishable_demo_opaque');
  assert.equal('Authorization' in sbHeaders, false);

  delete globalThis.window;
  console.log('✓ 4. PlatformBridge 生命周期、广告静音暂停、GA4 埋点与 sb_publishable_ 兼容性测试通过');
}

// ============================================================================
// 5. 每日巡检脚本（GA4 日报渲染 + Supabase 异常高分清理调用）
// ============================================================================
{
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedHeaders = {};
  globalThis.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedHeaders = opts.headers || {};
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        ok: true,
        newly_flagged: 3,
        deleted_flagged: 5,
        valid_scores_remaining: 120
      })
    };
  };

  const spRes = await patrolSupabaseLeaderboard({
    supabaseUrl: 'https://demo.supabase.co',
    secretKey: 'sb_secret_mock_token'
  });
  globalThis.fetch = originalFetch;

  assert.equal(capturedUrl, 'https://demo.supabase.co/rest/v1/rpc/gf_cleanup_anomalous_scores');
  assert.equal(capturedHeaders.apikey, 'sb_secret_mock_token');
  assert.equal('Authorization' in capturedHeaders, false, '新版 sb_secret_ 同样不应放入 Authorization 头');
  assert.equal(spRes.newlyFlagged, 3);
  assert.equal(spRes.deletedFlagged, 5);

  const md = buildChineseBriefing({
    dateStr: '2026-11-25',
    ga4: {
      configured: true,
      activeUsers: 420,
      newUsers: 180,
      sessions: 610,
      avgEngagementSec: 195,
      events: {
        game_boot: 600,
        level_start: 1200,
        level_complete: 720,
        level_fail: 480,
        ad_rewarded_complete: 210,
        ad_commercial_complete: 340
      }
    },
    supabase: spRes
  });
  assert.ok(md.includes('活跃玩家（DAU） | 420'));
  assert.ok(md.includes('60.0%'));
  assert.ok(md.includes('本次新拦截作弊高分：**3** 条'));
  console.log('✓ 5. 每日中文数据简报渲染与新加坡 Supabase 反作弊巡检测试通过');
}

// ============================================================================
// 6. 手机竖屏（iPhone 390x844, DPR=3）触摸点击与滑动模拟 E2E 联动验收
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
    console.log('\n▶ 正在执行 iPhone 竖屏触摸点击与滑动自动化验收测试...');
    execFileSync('python3', [path.join(rootDir, 'tests', 'mobile-touch.e2e.py')], {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } else {
    console.log('ℹ 6. 当前无 dist 构建产物或未安装 Playwright 浏览器，跳过本地 E2E（本地运行 npm run build && npm test 将自动执行全套手机触摸测试）');
  }
}

console.log('\n🎉 Celestial Rush 全部自动化验收测试通过！');
