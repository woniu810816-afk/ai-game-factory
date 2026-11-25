# 🎮 Celestial Rush — 面向欧美市场的东方玄幻休闲街机游戏（100% Serverless）

本项目基于标准化 HTML5 休闲游戏母版（**Phaser 4 + Vite**）升级为首款面向欧美 Poki / CrazyGames 市场的高留存东方玄幻休闲街机游戏 **《Celestial Rush》**：
- **零外部版权素材程序化美术**：全封闭古风战盔行者、双旋转风火轮、青铜雷纹阵、陨星、发光金玉（Spirit Jade）、护体金钟（Shield）与吸宝灵符（Magnet）；
- **实时 Web Audio 古风音效**：五声音阶古风拨弦（随连击升调）与低频战鼓动态节奏；
- **核心爽感与商业化留存闭环**：单指跟手滑动、Near-Miss 擦身加分、10 连击 5 秒无敌 FEVER 撞碎（微震+顿帧）、4 款 TRAILS 流光拖尾皮肤灵玉解锁、`REVIVE (AD)` 原地复活与 `2X JADE (AD)` 双倍灵玉激励广告闭环；
- **100% Serverless 架构**：GitHub Pages / Cloudflare Pages + GitHub Actions + 新加坡 Supabase 防刷分排行榜/云存档 + GA4 核心事件上报，零独立服务器运维成本。

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
│   ├── config.js                # 运行时配置与 4 款 TRAILS 流光拖尾皮肤定义（零硬编码密钥）
│   ├── platform-bridge.js       # 统一商业化（Poki/CrazyGames/Telegram）+ GA4 + Supabase 桥接层
│   ├── audio/synth-sfx.js       # Web Audio 五声音阶古风拨弦 + 动态低频战鼓实时合成引擎
│   ├── scenes/
│   │   ├── BootScene.js         # 启动、程序化东方玄幻矢量纹理生成、SDK 初始化与云存档拉取
│   │   ├── MenuScene.js         # 全英文主界面、TRAILS 流光皮肤面板、静音开关与全球排行榜
│   │   ├── GameScene.js         # 《Celestial Rush》核心玩法（跟手滑动、Near-Miss、10连击 FEVER）
│   │   └── ResultScene.js       # 结算界面（REVIVE (AD) 原地复活、2X JADE (AD) 双倍灵玉、全球榜）
│   └── main.js                  # Phaser 4 入口、iPhone Retina 1:1 坐标同步与广告暂停/静音联动
└── tests/
    ├── game-factory.test.mjs    # 自动化单元测试、安全红线扫描与移动端 E2E 联动入口
    └── mobile-touch.e2e.py      # iPhone 竖屏（390x844, DPR=3）触摸点击与单指滑动验收测试
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
