import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ELEMENTS, ELEMENT_KEYS, PIECE_SHAPES, MAX_WAVES, GAME_DESIGN } from '../src/config.js';
import { i18n } from '../src/i18n.js';
import { PlatformBridge } from '../src/platform-bridge.js';
import { buildChineseBriefing, patrolSupabaseLeaderboard } from '../scripts/daily-patrol.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// ============================================================================
// 1. 安全红线、零 VPS 与零日文字符视觉规范扫描
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
  /[\u3040-\u309F\u30A0-\u30FF]/
];

for (const rel of scanTargets) {
  const content = fs.readFileSync(path.join(rootDir, rel), 'utf8');
  for (const pat of secretPatterns) {
    assert.equal(pat.test(content), false, `检测到违规硬编码或红线违规项：${rel} 匹配 ${pat}`);
  }
}
console.log('✓ 1. 无硬编码密钥、零 VPS 与零日文字符红线扫描通过');

// ============================================================================
// 2. V1.0 MVP 核心规格校验（8列1:1对齐、65px上移、火/金/水三属性、10种拼图、10波、双语）
// ============================================================================
{
  assert.equal(GAME_DESIGN.board.size, 8, '锻炉必须为 8×8');
  assert.equal(GAME_DESIGN.battle.lanes, 8, '上方战场必须为 8 条纵道');
  assert.equal(GAME_DESIGN.board.originX, GAME_DESIGN.battle.originX, '8 纵道与 8 列 X 坐标必须 1:1 严格对齐');
  assert.equal(GAME_DESIGN.board.cellSize, GAME_DESIGN.battle.laneWidth, '纵道宽与列宽必须 1:1 严格对齐');
  assert.equal(GAME_DESIGN.board.dragLiftY, 65, '单指拖拽防遮挡上移必须为 65px');
  assert.deepEqual(ELEMENT_KEYS, ['fire', 'thunder', 'tide'], 'MVP 三大核心属性应为 fire / thunder / tide');
  for (const k of ELEMENT_KEYS) assert.ok(ELEMENTS[k]?.texture);
  assert.equal(PIECE_SHAPES.length, 10, '应内置 10 种经典 Block Blast 基础形状');
  assert.equal(MAX_WAVES, 10, 'MVP 精简循环必须为 10 波');

  i18n.setLang('en');
  assert.equal(i18n.t('titleMain'), 'INVESTITURE');
  i18n.toggle();
  assert.equal(i18n.lang, 'zh');
  assert.equal(i18n.t('titleMain'), '封神锻炉');
  i18n.setLang('en');
  console.log('✓ 2. V1.0 MVP 8列1:1对齐、65px拖拽偏移、火/金/水三属性与10波双语配置校验通过');
}

// ============================================================================
// 3. 新加坡 Supabase 表结构与 PlatformBridge 基础设施校验
// ============================================================================
{
  const sql = fs.readFileSync(path.join(rootDir, 'supabase/game_factory_schema_rls.sql'), 'utf8');
  for (const tbl of ['gf_player_saves', 'gf_leaderboard_scores', 'gf_patrol_reports']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tbl}\\b`));
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${tbl}\\s+ENABLE ROW LEVEL SECURITY`));
  }

  const bridge = new PlatformBridge({
    supabaseUrl: 'https://demo.supabase.co',
    supabaseKey: 'sb_publishable_demo_opaque'
  });
  const headers = bridge.buildSupabaseHeaders();
  assert.equal(headers.apikey, 'sb_publishable_demo_opaque');
  assert.equal('Authorization' in headers, false);
  console.log('✓ 3. 新加坡 Supabase RLS 与 PlatformBridge 基础设施校验通过');
}

// ============================================================================
// 4. 每日巡检脚本校验
// ============================================================================
{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ ok: true, newly_flagged: 1, deleted_flagged: 2, valid_scores_remaining: 50 })
  });
  const spRes = await patrolSupabaseLeaderboard({
    supabaseUrl: 'https://demo.supabase.co',
    secretKey: 'sb_secret_mock_token'
  });
  globalThis.fetch = originalFetch;
  assert.equal(spRes.newlyFlagged, 1);
  const md = buildChineseBriefing({
    dateStr: '2026-11-25',
    ga4: { configured: true, activeUsers: 120, newUsers: 60, sessions: 180, avgEngagementSec: 150, events: { game_boot: 160, level_start: 200, level_complete: 100, level_fail: 100, ad_rewarded_complete: 0, ad_commercial_complete: 0 } },
    supabase: spRes
  });
  assert.ok(md.includes('活跃玩家（DAU） | 120'));
  console.log('✓ 4. 每日中文巡检简报测试通过');
}

// ============================================================================
// 5. iPhone 390×844 (DPR=3) 端到端触摸开局、同步推进与消列精准命中测试
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
    console.log('\n▶ 正在执行 iPhone 390×844 (DPR=3) 8列同步回合制与消列精准打击 E2E 测试...');
    execFileSync('python3', [path.join(rootDir, 'tests', 'mobile-touch.e2e.py')], {
      cwd: rootDir,
      stdio: 'inherit'
    });
  } else {
    console.log('ℹ 5. 当前无 dist 构建产物或 Playwright 环境，跳过浏览器 E2E（本地 npm run build && npm test 自动运行全量 E2E）');
  }
}

console.log('\n🎉 《INVESTITURE: Relic Forge》V1.0 MVP 全部自动化验收测试通过！');
