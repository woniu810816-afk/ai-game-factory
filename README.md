# 🏺 INVESTITURE: Relic Forge（封神锻炉：天劫破阵）— 100% Serverless 旗舰休闲游戏

本作是面向全球市场的东方商周神话原创旗舰休闲策略肉鸽游戏（**Phaser 4 + Vite**），全量程序化美术与实时 Web Audio 东方古典民乐合成，门户压缩包远小于 **2MB**，非洲/东南亚弱网手机也能秒开：
- **黄金竖屏双区玩法**：上半屏（42%）商周古战场（全封闭青铜战盔战将守卫青铜阵门，抗击分波水墨妖魔与每 5 波巨型青铜妖王）；下半屏（58%）5×5 商周青铜八卦锻炉 + 无倒计时三选一五行拼图（手机单指拖拽自动上移 60px 防遮挡 + 落点与消行高亮预览）；
- **五行炼宝神通 + 天道共鸣**：火尖枪穿透火焰束、打神鞭多目标连锁闪电、番天印天降范围砸击（震屏 + 60ms 顿帧）、混天绫全屏击退减速波、青莲阵门回血护盾；单次消除 ≥2 行/列触发「天道共鸣」双倍威力爆发；
- **肉鸽「元始敕令」与反套路「天劫异变」**：满灵气弹出 3 张青铜竹简强化卡（支持激励广告重抽）；每 3 波触发八卦盘顺时针旋转 90°、紫雷封印 2 格（旁消解锁）或高风险「真假灵丹」异变；
- **双语 `EN / 中` 实时切换 + 4 尊封神战将**：哪吒（免费）、杨戬、雷震子、姜子牙各自拥有真实生效的局内被动，精魄永久解锁并预留新加坡 Supabase 同步；
- **零成本全球多平台架构**：兼容 Playgama Bridge / CrazyGames / GameMonetize / GamePix / Telegram WebApp + AdsGram / Poki / itch.io，100% GitHub Pages + GitHub Actions + 新加坡 Supabase + GA4，零独立服务器运维成本。

---

## 一、目录结构

```text
game-factory/
├── .github/workflows/
│   ├── deploy-and-package.yml   # 推送 main 自动测试、构建、部署 GitHub Pages + 打包 dist-portal.zip
│   ├── itch-deploy.yml          # itch.io butler push 自动增量推送工作流
│   └── daily-patrol.yml         # 每天北京时间 08:30 拉取 GA4 中文日报 + 清理 Supabase 异常高分
├── supabase/
│   └── game_factory_schema_rls.sql  # 新加坡 Supabase 独立表（gf_* 前缀）与防刷分 RLS/RPC
├── scripts/
│   ├── package-portal.mjs       # 打包零外链、全相对路径且远小于 2MB 的通用门户包 dist-portal.zip
│   └── daily-patrol.mjs         # 零依赖 GA4 日报拉取 + Supabase 反作弊清理与保活脚本
├── src/
│   ├── i18n.js                  # 默认英文 + 顶部 EN / 中 实时双语切换字典（零日文字符）
│   ├── config.js                # 五行配置、4 尊封神战将、8 张元始敕令卡池与 5×5 八卦锻炉参数
│   ├── platform-bridge.js       # 零成本全球多平台 SDK（Playgama/CrazyGames/GameMonetize/GamePix/Telegram AdsGram/Poki）
│   ├── audio/synth-sfx.js       # Web Audio 古筝五声音阶、商周编钟、琵琶急奏与唐代战鼓实时合成
│   ├── scenes/
│   │   ├── BootScene.js         # 全套商周青铜纹样、全封闭青铜战盔战将与水墨妖魔程序化纹理
│   │   ├── MenuScene.js         # 双语主界面、EN / 中 切换、4 尊封神战将解锁面板与全球封神榜
│   │   ├── GameScene.js         # 竖屏双区商周古战场 + 5×5 八卦锻炉 + 肉鸽敕令 + 天劫异变 + 太乙真火复活
│   │   └── ResultScene.js       # 双语结算页（精魄翻倍激励广告 + 全球封神榜 TOP 3）
│   └── main.js                  # Phaser 4 入口、iPhone Retina 1:1 触控坐标同步与广告静音联动
└── tests/
    ├── game-factory.test.mjs    # 自动化单元测试、红线扫描与移动端 E2E 联动入口
    └── mobile-touch.e2e.py      # iPhone 390×844 DPR=3 点击开局、双语切换与单指拖拽 5×5 消行端到端验收
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
