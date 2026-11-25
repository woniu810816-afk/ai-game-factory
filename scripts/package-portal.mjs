#!/usr/bin/env node
/**
 * 全球零成本多平台门户分发包打包脚本：生成 dist-portal.zip
 * 兼容：generic（CrazyGames/GameMonetize/itch.io 无外链通用包）、playgama、crazygames、gamemonetize、gamepix、telegram、poki
 *
 * 自动校验红线：
 * 1. dist/ 根目录直接存在 index.html，全部资源均为相对路径（无 /assets/ 绝对路径）
 * 2. generic 通用包无任何外部脚本依赖，弱网秒开
 * 3. 包体严格校验远小于 2MB（软红线 2MB，硬上限 5MB）
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const distDir = path.join(rootDir, 'dist');
const portalTmpDir = path.join(rootDir, '.portal-stage');
const outZip = path.join(rootDir, 'dist-portal.zip');

const SOFT_LIMIT_MB = 2;
const HARD_LIMIT_MB = 5;

const portalArg = process.argv.find((a) => a.startsWith('--portal='));
const portal = portalArg ? portalArg.split('=')[1].trim().toLowerCase() : 'generic';

const PORTAL_SDK_SNIPPETS = {
  generic: '<!-- 通用零外链分发包：完全符合 CrazyGames / GameMonetize / itch.io 离线静态包规范 -->',
  playgama: '<script src="https://bridge.playgama.com/v1/stable/playgama-bridge.js"></script>',
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  gamemonetize: '<!-- GameMonetize SDK 将由平台壳层按 Game ID 注入 -->',
  gamepix: '<script src="https://integration.gamepix.com/sdk/v3/gamepix.sdk.js"></script>',
  telegram: '<script src="https://telegram.org/js/telegram-web-app.js"></script>',
  poki: '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'
};

if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('❌ 未找到 dist/index.html，请先执行 npm run build');
  process.exit(1);
}

fs.rmSync(portalTmpDir, { recursive: true, force: true });
fs.rmSync(outZip, { force: true });
fs.cpSync(distDir, portalTmpDir, { recursive: true });

const indexPath = path.join(portalTmpDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const snippet = PORTAL_SDK_SNIPPETS[portal] || PORTAL_SDK_SNIPPETS.generic;
html = html.replace('<!-- PORTAL_SDK_INJECT -->', snippet);
fs.writeFileSync(indexPath, html, 'utf8');

if (/src="\/assets\//.test(html) || /href="\/assets\//.test(html)) {
  console.error('❌ 检测到绝对路径 /assets/ 引用，请确保 vite.config.js 中 base 为 "./"');
  process.exit(1);
}

if (portal === 'generic' && /<script[^>]+src=["']https?:\/\//i.test(html)) {
  console.error('❌ 通用分发包 dist-portal.zip 检测到外部 script 依赖，违反零外链规范！');
  process.exit(1);
}

try {
  execFileSync('zip', ['-r', '-q', outZip, '.'], { cwd: portalTmpDir });
} catch (_) {
  execFileSync('python3', [
    '-c',
    `import os, zipfile
with zipfile.ZipFile(${JSON.stringify(outZip)}, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, _, files in os.walk(${JSON.stringify(portalTmpDir)}):
        for f in files:
            full = os.path.join(root, f)
            zf.write(full, os.path.relpath(full, ${JSON.stringify(portalTmpDir)}))`
  ]);
}

fs.rmSync(portalTmpDir, { recursive: true, force: true });

const stats = fs.statSync(outZip);
const sizeMb = stats.size / (1024 * 1024);

console.log('✅ 门户分发包生成成功：dist-portal.zip');
console.log(`   - 目标门户：${portal}`);
console.log(`   - 压缩包体积：${sizeMb.toFixed(2)} MB（目标远小于 ${SOFT_LIMIT_MB} MB，硬上限 ${HARD_LIMIT_MB} MB）`);

if (sizeMb > HARD_LIMIT_MB) {
  console.error(`❌ 体积超过硬上限（${HARD_LIMIT_MB} MB）！`);
  process.exit(1);
}
if (sizeMb >= SOFT_LIMIT_MB) {
  console.warn(`⚠️ 体积接近或超过 ${SOFT_LIMIT_MB} MB 弱网秒开红线！`);
}
