# 🏺 INVESTITURE: Relic Forge（封神锻炉）— V1.0 核心玩法 MVP（100% Serverless）

本版本为 **「第 1 步核心玩法 MVP」**，专注极致打磨 **「8 列 1:1 对齐 × 同步回合制 × 落子定属性 × 横竖策略分化」** 的核心消除战斗手感：
- **黄金 8 列 1:1 对齐竖屏布局**：上方约 30% 为 8 条纵道（Lane 1~8）商周古战场（佩戴全封闭青铜战盔与红氅的哪吒背影剪影守卫阵门）；下方约 70% 为 8×8 青铜八卦锻炉 + 底部 3 个经典 Block Blast 拼图槽（无倒计时，放完 3 块自动刷新，单指拖拽自动上移 `65px` 防遮挡）；
- **同步回合制 + 落点预警联动**：玩家每成功落子 1 块，上方妖魔才统一推进 1 格（不放块不动，零时间焦虑）；手指悬停即将消行/消列的位置时，上方对应纵道或前排区域同步亮起攻击预警光带；
- **落子定属性 & 横竖策略分化**：火 Flame（朱砂红+火焰纹）/ 金 Thunder（流光金+雷纹）/ 水 Tide（玄青色+水波纹），消列精准轰穿对应纵道、消行横扫 8 道前排，同时消除 ≥2 行/列触发 `RESONANCE ×2!` 共鸣双倍威力与震屏；
- **精简 10 波通关循环**：3 种清晰区分的水墨妖魔 + 第 10 波关底巨型青铜妖王 Boss，1 秒极速重开（`PLAY AGAIN`）；顶部附带轻量 `EN / 中` 切换开关。

---

## 一、目录结构

```text
game-factory/
├── .github/workflows/
│   ├── deploy-and-package.yml   # 推送 main 自动测试、构建、部署 GitHub Pages + 打包 dist-portal.zip
│   ├── itch-deploy.yml          # itch.io butler push 自动增量推送工作流
│   └── daily-patrol.yml         # 每日 GA4 中文日报 + 新加坡 Supabase 巡检保活
├── scripts/
│   ├── package-portal.mjs       # 打包零外链通用轻量分发包 dist-portal.zip（~0.38 MB）
│   └── daily-patrol.mjs         # GA4 日报与 Supabase 保活巡检脚本
├── src/
│   ├── i18n.js                  # 默认简洁英文 + 顶部轻量 EN / 中 切换字典（零日文字符）
│   ├── config.js                # 8 纵道与 8×8 阵盘 1:1 对齐参数、dragLiftY=65、火/金/水三属性与 10 种拼图
│   ├── audio/synth-sfx.js       # Web Audio 古筝五声音阶、商周编钟、琵琶急奏与唐代战鼓合成
│   ├── scenes/
│   │   ├── BootScene.js         # 全套商周青铜三属性方块、哪吒全封闭战盔背影与 3+1 水墨妖魔程序化美术
│   │   ├── MenuScene.js         # 极简主界面（EN / 中、SFX、三属性图解、一键 PLAY 开局）
│   │   └── GameScene.js         # 核心 8 列对齐同步回合制战斗、落点纵道预警联动、10 波循环与 1 秒重开
│   └── main.js                  # Phaser 4 入口、iPhone Retina (DPR=3) 触控映射与防页面滚动
└── tests/
    ├── game-factory.test.mjs    # 自动化单元测试、红线扫描与移动端 E2E 联动入口
    └── mobile-touch.e2e.py      # iPhone 390×844 DPR=3 触摸开局、同步推进 1 格与消列精准命中 E2E 验收
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
