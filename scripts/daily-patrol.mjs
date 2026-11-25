#!/usr/bin/env node
/**
 * 零独立服务器（Serverless）每日自动化数据日报与后台巡检脚本
 *
 * 运行环境：GitHub Actions（Node.js 20+ 原生 crypto + fetch，零额外依赖）
 * 功能：
 * 1. 拉取 Google Analytics 4 (GA4) 昨日核心经营指标（DAU、新用户、开局、通关、激励广告、互动时长）
 * 2. 巡检新加坡 Supabase 全球排行榜并自动清理异常高分/作弊记录，同时完成数据库日常保活
 * 3. 输出简体中文 Markdown 日报至 reports/ 与 $GITHUB_STEP_SUMMARY，支持可选 Webhook 推送
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function base64Url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * 使用 GA4 Service Account JSON 签发 RS256 JWT 并换取 Google OAuth2 Access Token
 */
export async function fetchGoogleAccessToken(serviceAccountJson) {
  const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GA4_SERVICE_ACCOUNT_JSON 缺少 client_email 或 private_key 字段');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = base64Url(signer.sign(sa.private_key));
  const assertion = `${unsigned}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`GA4 OAuth 认证失败：${tokenJson.error_description || tokenRes.status}`);
  }
  return tokenJson.access_token;
}

/**
 * 拉取 GA4 昨日经营简报数据
 */
export async function pullGA4DailyMetrics({ propertyId, serviceAccountJson }) {
  if (!propertyId || !serviceAccountJson) {
    return {
      configured: false,
      note: '尚未配置 GA4_PROPERTY_ID 或 GA4_SERVICE_ACCOUNT_JSON，已跳过 GA4 拉取'
    };
  }

  const token = await fetchGoogleAccessToken(serviceAccountJson);
  const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;

  // 1. 拉取大盘指标（DAU、新用户、互动时长、会话数）
  const overviewRes = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'newUsers' },
        { name: 'sessions' },
        { name: 'userEngagementDuration' }
      ]
    })
  });
  const overview = await overviewRes.json();
  if (!overviewRes.ok) {
    throw new Error(`GA4 大盘查询失败：${overview.error?.message || overviewRes.status}`);
  }

  // 2. 拉取游戏关键事件分布（开局、通关、失败、激励广告完成）
  const eventsRes = await fetch(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: ['game_boot', 'level_start', 'level_complete', 'level_fail', 'ad_rewarded_complete', 'ad_commercial_complete']
          }
        }
      }
    })
  });
  const eventsData = await eventsRes.json();

  const row = overview.rows?.[0]?.metricValues || [];
  const activeUsers = Number(row[0]?.value || 0);
  const newUsers = Number(row[1]?.value || 0);
  const sessions = Number(row[2]?.value || 0);
  const engagementSec = Number(row[3]?.value || 0);

  const eventMap = {};
  for (const r of eventsData.rows || []) {
    const name = r.dimensionValues?.[0]?.value;
    const cnt = Number(r.metricValues?.[0]?.value || 0);
    if (name) eventMap[name] = cnt;
  }

  return {
    configured: true,
    activeUsers,
    newUsers,
    sessions,
    avgEngagementSec: activeUsers > 0 ? Math.round(engagementSec / activeUsers) : 0,
    events: {
      game_boot: eventMap.game_boot || 0,
      level_start: eventMap.level_start || 0,
      level_complete: eventMap.level_complete || 0,
      level_fail: eventMap.level_fail || 0,
      ad_rewarded_complete: eventMap.ad_rewarded_complete || 0,
      ad_commercial_complete: eventMap.ad_commercial_complete || 0
    }
  };
}

/**
 * 巡检并清理新加坡 Supabase 排行榜中的异常高分数据（兼容 sb_secret_ / service_role 与只读保活回退）
 */
export async function patrolSupabaseLeaderboard({ supabaseUrl, secretKey, publishableKey, gameId = null, maxScore = 300000, maxSps = 180 }) {
  const baseUrl = String(supabaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl || (!secretKey && !publishableKey)) {
    return {
      configured: false,
      note: '尚未配置 SUPABASE_URL 与密钥，已跳过新加坡 Supabase 排行榜巡检'
    };
  }

  // 若配置了后端管理密钥（SUPABASE_SECRET_KEY），执行反作弊清理 RPC
  if (secretKey) {
    const isJwt = secretKey.startsWith('eyJ') && secretKey.split('.').length === 3;
    const headers = {
      apikey: secretKey,
      'Content-Type': 'application/json'
    };
    if (isJwt) headers.Authorization = `Bearer ${secretKey}`;

    const res = await fetch(`${baseUrl}/rest/v1/rpc/gf_cleanup_anomalous_scores`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_game_id: gameId || null,
        p_max_score: maxScore,
        p_max_sps: maxSps,
        p_min_duration: 3,
        p_delete_older_days: 7
      })
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!res.ok) {
      throw new Error(`Supabase 反作弊清理 RPC 失败（HTTP ${res.status}）：${data?.message || text}`);
    }
    return {
      configured: true,
      mode: 'cleanup_rpc',
      newlyFlagged: Number(data?.newly_flagged || 0),
      deletedFlagged: Number(data?.deleted_flagged || 0),
      validRemaining: Number(data?.valid_scores_remaining || 0)
    };
  }

  // 未配置 Secret Key 时，自动降级为只读保活查询，确保新加坡 Supabase 永不休眠
  const isJwt = publishableKey.startsWith('eyJ') && publishableKey.split('.').length === 3;
  const headers = { apikey: publishableKey };
  if (isJwt) headers.Authorization = `Bearer ${publishableKey}`;

  const pingRes = await fetch(`${baseUrl}/rest/v1/gf_leaderboard_top?select=game_id&limit=1`, { headers });
  if (!pingRes.ok) {
    throw new Error(`Supabase 只读保活查询失败（HTTP ${pingRes.status}）`);
  }
  return {
    configured: true,
    mode: 'keep_alive_only',
    note: '仅配置了可发布密钥，已完成保活查询；如需自动清理作弊高分请在 GitHub Secrets 补充 SUPABASE_SECRET_KEY'
  };
}

/**
 * 渲染简体中文每日经营与安全巡检简报（Markdown）
 */
export function buildChineseBriefing({ dateStr, ga4, supabase }) {
  const lines = [
    `# 🎮 Game Factory 每日数据简报与后台巡检（${dateStr}）`,
    '',
    '> 运行模式：100% Serverless（GitHub Actions + GA4 + 新加坡 Supabase，零独立服务器）',
    '',
    '## 一、Google Analytics 4（昨日玩家数据）'
  ];

  if (!ga4.configured) {
    lines.push(`- 状态：⚠️ ${ga4.note}`);
  } else {
    const clearRate = ga4.events.level_start > 0
      ? ((ga4.events.level_complete / ga4.events.level_start) * 100).toFixed(1) + '%'
      : '0.0%';
    lines.push(
      `| 指标 | 昨日数值 |`,
      `| --- | ---: |`,
      `| 活跃玩家（DAU） | ${ga4.activeUsers} |`,
      `| 新增玩家 | ${ga4.newUsers} |`,
      `| 会话总数 | ${ga4.sessions} |`,
      `| 人均互动时长 | ${ga4.avgEngagementSec} 秒 |`,
      `| 游戏启动（game_boot） | ${ga4.events.game_boot} |`,
      `| 开局次数（level_start） | ${ga4.events.level_start} |`,
      `| 通关次数 / 通关率 | ${ga4.events.level_complete}（${clearRate}） |`,
      `| 激励视频完成（复活/双倍） | ${ga4.events.ad_rewarded_complete} |`,
      `| 插屏广告完成 | ${ga4.events.ad_commercial_complete} |`
    );
  }

  lines.push('', '## 二、新加坡 Supabase 排行榜反作弊巡检与保活');
  if (!supabase.configured) {
    lines.push(`- 状态：⚠️ ${supabase.note}`);
  } else if (supabase.mode === 'cleanup_rpc') {
    lines.push(
      `- 巡检状态：✅ 已完成异常高分巡检与数据库保活`,
      `- 本次新拦截作弊高分：**${supabase.newlyFlagged}** 条`,
      `- 物理清理历史作弊脏数据：**${supabase.deletedFlagged}** 条`,
      `- 当前有效排行榜成绩总数：**${supabase.validRemaining}** 条`
    );
  } else {
    lines.push(`- 巡检状态：✅ 保活成功（${supabase.note}）`);
  }

  lines.push('', `---`, `生成时间（UTC）：${new Date().toISOString()}`);
  return lines.join('\n');
}

async function main() {
  const dateStr = new Date().toISOString().slice(0, 10);
  let ga4Result;
  let supabaseResult;

  try {
    ga4Result = await pullGA4DailyMetrics({
      propertyId: process.env.GA4_PROPERTY_ID,
      serviceAccountJson: process.env.GA4_SERVICE_ACCOUNT_JSON
    });
  } catch (e) {
    ga4Result = { configured: false, note: `拉取异常：${e.message}` };
  }

  try {
    supabaseResult = await patrolSupabaseLeaderboard({
      supabaseUrl: process.env.SUPABASE_URL,
      secretKey: process.env.SUPABASE_SECRET_KEY,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      gameId: process.env.GAME_ID || null
    });
  } catch (e) {
    supabaseResult = { configured: false, note: `巡检异常：${e.message}` };
  }

  const markdown = buildChineseBriefing({ dateStr, ga4: ga4Result, supabase: supabaseResult });
  console.log(markdown);

  const reportDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, `daily-report-${dateStr}.md`), markdown, 'utf8');

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n', 'utf8');
  }

  // 可选 Webhook 推送（支持飞书 / 企微 / Slack / 自定义 Serverless 机器人）
  if (process.env.REPORT_WEBHOOK_URL) {
    try {
      await fetch(process.env.REPORT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text: markdown }, text: markdown })
      });
    } catch (e) {
      console.warn('⚠️ Webhook 推送失败：', e.message);
    }
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  main().catch((err) => {
    console.error('❌ 巡检执行失败：', err);
    process.exit(1);
  });
}
