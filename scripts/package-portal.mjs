#!/usr/bin/env node
/**
 * 门户分发包打包脚本：生成符合 Poki / CrazyGames 规范的 dist-portal.zip
 *
 * 检查项：
 * 1. 确保 dist/ 根目录直接存在 index.html，且采用相对路径资源引用
 * 2. 支持按参数 --portal=poki|crazygames|generic 按需注入门户官方 SDK 标签
 * 3. 自动校验体积红线（Poki 建议首包 < 5MB、硬上限 15MB）
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const distDir = path.join(rootDir, 'dist');
const portalTmpDir = path.join(rootDir, '.portal-stage');
const outZip = path.join(rootDir, 'dist-portal.zip');

const SOFT_LIMIT_MB = 5;
const HARD_LIMIT_MB = 15;

const portalArg = process.argv.find((a) => a.startsWith('--portal='));
const portal = portalArg ? portalArg.split('=')[1].trim().toLowerCase() : 'generic';

const PORTAL_SDK_SNIPPETS = {
  poki: '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  telegram: '<script src="https://telegram.org/js/telegram-web-app.js"></script>',
  generic: '<!-- 通用分发包：上传 Poki/CrazyGames 时可传 --portal=poki 或 --portal=crazygames 自动注入对应官方 SDK -->'
};

if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('❌ 未找到 dist/index.html，请先执行 npm run build');
  process.exit(1);
}

fs.rmSync(portalTmpDir, { recursive: true, force: true });
fs.rmSync(outZip, { force: true });
fs.cpSync(distDir, portalTmpDir, { recursive: true });

// 按目标门户注入官方 SDK 标签，并校验无绝对根路径引用
const indexPath = path.join(portalTmpDir, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const snippet = PORTAL_SDK_SNIPPETS[portal] || PORTAL_SDK_SNIPPETS.generic;
html = html.replace('<!-- PORTAL_SDK_INJECT -->', snippet);
fs.writeFileSync(indexPath, html, 'utf8');

if (/src="\/assets\//.test(html) || /href="\/assets\//.test(html)) {
  console.error('❌ 检测到绝对路径 /assets/ 引用，请确保 vite.config.js 中 base 为 "./"');
  process.exit(1);
}

// 打包 zip（优先使用系统 zip，缺省回退 python3 zipfile）
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

console.log(`✅ 门户分发包生成成功：dist-portal.zip`);
console.log(`   - 目标门户：${portal}`);
console.log(`   - 压缩包体积：${sizeMb.toFixed(2)} MB（建议 <= ${SOFT_LIMIT_MB} MB，硬上限 ${HARD_LIMIT_MB} MB）`);

if (sizeMb > HARD_LIMIT_MB) {
  console.error(`❌ 体积超过门户硬上限（${HARD_LIMIT_MB} MB），请优化贴图/音频资源后再上传！`);
  process.exit(1);
}
if (sizeMb > SOFT_LIMIT_MB) {
  console.warn(`⚠️ 提示：体积超过建议首包阈值 ${SOFT_LIMIT_MB} MB，建议精简资源以提升 Poki 首屏转化率。`);
}
