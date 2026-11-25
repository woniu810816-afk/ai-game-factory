# 🎮 Game Factory — 标准化 HTML5 休闲游戏母版（100% Serverless）

本项目是一套**零独立服务器（Serverless）**的 HTML5 休闲小游戏工业化生产母版，基于最新稳定版 **Phaser.js + Vite** 构建，内置 Poki / CrazyGames / Telegram Mini App / itch.io 多渠道商业化桥接、Google Analytics 4 (GA4) 埋点体系、新加坡 Supabase 防刷分全球排行榜与玩家云存档，以及全自动 GitHub Actions 流水线。

> **架构红线**：100% 采用「GitHub Pages / Cloudflare Pages + GitHub Actions + 新加坡 Supabase + GA4」无服务器方案，零 VPS 运维成本。

---

## 一、目录结构

```text
game-factory/
├── .github/workflows/
│   ├── deploy-and-package.yml   # 推送 main 自动测试、构建、部署 GitHub Pages + 打包 dist-portal.zip
│   ├── itch-deploy.yml          # 预留 itch.io butler push 自动增量推送工作流
│   └── daily-patrol.yml         # 每天北京时间 08:30 拉取 GA4 中文日报 + 清理 Supabase 异常高分
├── supabase/
│   └── game_factory_schema_rls.sql  # 新加坡 Supabase 独立表（gf_* 前缀）与防刷分 RLS/RPC
├── scripts/
│   ├── package-portal.mjs       # 打包符合 Poki / CrazyGames 体积规范的 dist-portal.zip
│   └── daily-patrol.mjs         # 零依赖 GA4 日报拉取 + Supabase 反作弊清理与保活脚本
├── src/
│   ├── config.js                # 环境变量与运行时配置读取（零硬编码密钥）
│   ├── platform-bridge.js       # 统一商业化（Poki/CrazyGames/Telegram）+ GA4 + Supabase 桥接层
│   ├── audio/synth-sfx.js       # 零外部资源的 Web Audio 合成音效引擎（自动联动广告静音）
│   ├── scenes/
│   │   ├── BootScene.js         # 启动、程序化矢量纹理生成、SDK 初始化与云存档拉取
│   │   ├── MenuScene.js         # 开始菜单、关卡选择、音效开关、全球排行榜弹窗
│   │   ├── GameScene.js         # 2D 竖屏休闲玩法《星际冲刺》（触控拖动 + 键盘双端操控）
│   │   └── ResultScene.js       # 结算界面（激励广告复活/双倍积分 + 插屏广告停顿点）
│   └── main.js                  # Phaser 入口、竖屏自适应与广告暂停/静音联动
└── tests/game-factory.test.mjs  # 零依赖 Node.js 自动化单元测试
```

---

## 二、本地开发与打包命令

```bash
# 1. 安装依赖
npm install

# 2. 本地热更新开发
npm run dev

# 3. 运行自动化测试（含安全扫描、Bridge 生命周期与巡检逻辑）
npm test

# 4. 生产构建（产物输出至 dist/）
npm run build

# 5. 生成门户分发包 dist-portal.zip（可传 --portal=poki 或 --portal=crazygames 注入对应官方 SDK）
node scripts/package-portal.mjs --portal=poki
```

---

## 三、新加坡 Supabase 初始化步骤

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard) 进入新加坡项目，打开 **`SQL Editor`**；
2. 粘贴 [supabase/game_factory_schema_rls.sql](supabase/game_factory_schema_rls.sql) 全部内容并点击 **`Run`**；
3. 建表后自动获得以下隔离对象（均使用 `gf_` 前缀，与其它业务完全隔离）：
   - `gf_player_saves`：玩家云存档（校验玩家请求头哈希，防越权篡改）
   - `gf_leaderboard_scores`：全球成绩表（禁止客户端直写，统一走 `gf_submit_score` 防刷分 RPC 校验分速/时长/频控）
   - `gf_leaderboard_top`：公开榜单只读视图（自动过滤异常作弊成绩）
   - `gf_patrol_reports`：每日巡检清理日志

---

## 四、GitHub Secrets 与 Variables 配置清单

前往仓库 **`Settings` → `Secrets and variables` → `Actions`** 按需配置：

| 类型 | 名称 | 用途 | 必填 |
| --- | --- | --- | --- |
| Variable / Secret | `SUPABASE_URL` | 新加坡 Supabase 项目地址（`https://xxx.supabase.co`） | 排行榜/云存档必填 |
| Variable / Secret | `SUPABASE_PUBLISHABLE_KEY` | 新版 `sb_publishable_...` 可发布密钥（或旧版 anon Key） | 排行榜/云存档必填 |
| Secret | `SUPABASE_SECRET_KEY` | 后端管理密钥（`sb_secret_...`），仅用于每日巡检清理异常高分，**绝不打包进前端** | 每日反作弊清理必填 |
| Variable / Secret | `GA4_MEASUREMENT_ID` | 前端 GA4 衡量 ID（如 `G-XXXXXXXXXX`） | 前端埋点必填 |
| Secret | `GA4_PROPERTY_ID` | GA4 媒体资源数字 ID（供每日巡检脚本拉取数据） | 每日日报必填 |
| Secret | `GA4_SERVICE_ACCOUNT_JSON` | 具有 GA4 只读权限的 Google Service Account JSON 内容 | 每日日报必填 |
| Secret | `ITCH_API_KEY` | itch.io Butler API Key | itch.io 自动推送可选 |
| Variable | `ITCH_TARGET` | itch.io 项目标识（形如 `yourname/star-dash`） | itch.io 自动推送可选 |
| Secret | `REPORT_WEBHOOK_URL` | 飞书 / 企微 / 自定义机器人 Webhook 地址（每日简报自动推送） | 可选 |

---

## 五、多平台零服务器分发指南

1. **GitHub Pages（自动）**：在仓库 **`Settings` → `Pages`** 将 Source 改为 **`GitHub Actions`**，每次推送 `main` 即自动发布至 `https://<用户名>.github.io/ai-game-factory/`。
2. **Cloudflare Pages（同步托管）**：在 Cloudflare Pages 关联本仓库，Build command 填 `npm run build`，Output directory 填 `dist`（已配置 `base: './'` 零改动兼容）。
3. **Telegram Mini App**：通过 `@BotFather` 创建 Mini App，将 Web App URL 指向 GitHub Pages 或 Cloudflare Pages 的 HTTPS 地址即可，`src/platform-bridge.js` 会自动调用 `Telegram.WebApp.ready()` 与 `expand()` 并读取玩家昵称。
4. **Poki / CrazyGames 上传**：在 GitHub Actions 的 **`自动构建、部署 GitHub Pages 并打包门户分发包`** 页面点击 **`Run workflow`**，选择目标门户（`poki` 或 `crazygames`），运行完成后下载 Artifact 中的 `dist-portal.zip` 直接提交审核。
5. **itch.io 增量发布**：配好 `ITCH_API_KEY` 和 `ITCH_TARGET` 后，在 Actions 手动触发 **`itch.io Butler 自动增量推送`** 或推送 `v1.0.0` 标签即可完成增量发布。
