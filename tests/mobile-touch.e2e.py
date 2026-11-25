#!/usr/bin/env python3
"""
《Celestial Rush》iPhone 竖屏高分屏（390x844, deviceScaleFactor=3, has_touch=True）自动化触摸点击与滑动验收测试
验证项：
1. html / body / #app / canvas 触控样式与视口 1:1 居中对齐（无 Flexbox 叠加偏移）
2. 触摸点击右上角 SFX 静音开关正常切换
3. 触摸点击 TRAILS 面板用 Spirit Jade 永久解锁并装备 JADE LOTUS 皮肤，验证扣除与持久化
4. 触摸点击 GLOBAL LEADERBOARD 弹窗打开与关闭正常
5. 触摸点击 PLAY NOW 成功进入 GameScene 且运行 0 报错
6. 真实模拟单指按住屏幕向右滑、向左滑（CDP touchStart -> touchMove -> touchEnd），验证角色跟手左右移动
"""

import http.server
import json
import os
import socketserver
import sys
import threading
from playwright.sync_api import sync_playwright

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(ROOT_DIR, "dist")
DESIGN_W = 540.0
DESIGN_H = 960.0


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def log_message(self, format, *args):
        pass


def design_to_screen(rect, dx, dy):
    return (
        rect["left"] + rect["width"] * (dx / DESIGN_W),
        rect["top"] + rect["height"] * (dy / DESIGN_H),
    )


def dispatch_touch_drag(cdp, page, rect, points_design, step_delay_ms=35):
    """使用 CDP Input.dispatchTouchEvent 真实模拟 iPhone 单指按住连续滑动"""
    sx0, sy0 = design_to_screen(rect, points_design[0][0], points_design[0][1])
    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchStart",
        "touchPoints": [{"x": round(sx0, 1), "y": round(sy0, 1), "id": 1}],
    })
    page.wait_for_timeout(step_delay_ms)

    for i in range(len(points_design) - 1):
        x1, y1 = points_design[i]
        x2, y2 = points_design[i + 1]
        steps = 8
        for s in range(1, steps + 1):
            t = s / steps
            dx = x1 + (x2 - x1) * t
            dy = y1 + (y2 - y1) * t
            sx, sy = design_to_screen(rect, dx, dy)
            cdp.send("Input.dispatchTouchEvent", {
                "type": "touchMove",
                "touchPoints": [{"x": round(sx, 1), "y": round(sy, 1), "id": 1}],
            })
            page.wait_for_timeout(step_delay_ms)

    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchEnd",
        "touchPoints": [],
    })
    page.wait_for_timeout(60)


def main():
    if not os.path.isfile(os.path.join(DIST_DIR, "index.html")):
        print("❌ 未找到 dist/index.html，请先执行 npm run build")
        sys.exit(1)

    httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                device_scale_factor=3,
                has_touch=True,
                is_mobile=True,
                user_agent=(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
                ),
            )
            page = ctx.new_page()
            page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))

            # 预置 120 Spirit Jade 以便端到端验证 TRAILS 皮肤解锁扣费与持久化闭环
            seed_save = json.dumps({
                "maxLevel": 1,
                "bestScore": 0,
                "coins": 120,
                "soundEnabled": True,
                "unlockedTrails": ["crimson_flame"],
                "selectedTrail": "crimson_flame",
            })
            page.add_init_script(
                f"if (!localStorage.getItem('gf_local_save_v1')) localStorage.setItem('gf_local_save_v1', {json.dumps(seed_save)});"
            )

            page.goto(f"http://127.0.0.1:{port}/", wait_until="networkidle")
            page.wait_for_function("() => window.__GAME_STATE__ && window.__GAME_STATE__.scene === 'MenuScene'", timeout=8000)

            # 1. 验证高分屏 Canvas 居中与样式红线
            dom_check = page.evaluate("""() => {
              const els = ['html', 'body', '#app', 'canvas'].map(sel => {
                const el = document.querySelector(sel);
                const st = el ? getComputedStyle(el) : null;
                return { sel, touchAction: st?.touchAction, pointerEvents: st?.pointerEvents };
              });
              const canvas = document.querySelector('canvas');
              const rect = canvas.getBoundingClientRect().toJSON();
              return { els, rect, dpr: window.devicePixelRatio, title: document.title };
            }""")

            assert dom_check["dpr"] == 3, f"期望 devicePixelRatio=3，实际 {dom_check['dpr']}"
            assert "Celestial Rush" in dom_check["title"], f"页面标题应包含 Celestial Rush，实际 {dom_check['title']}"
            for item in dom_check["els"]:
                assert item["touchAction"] == "none", f"{item['sel']} touch-action 必须为 none，实际 {item['touchAction']}"
                assert item["pointerEvents"] == "auto", f"{item['sel']} pointer-events 必须为 auto，实际 {item['pointerEvents']}"

            rect = dom_check["rect"]
            expected_top = (844 - rect["height"]) / 2
            assert abs(rect["top"] - expected_top) <= 3.0, (
                f"Canvas 垂直居中存在偏移！实际 top={rect['top']:.2f}，期望约 {expected_top:.2f}"
            )
            print(f"✓ 1. iPhone 390x844 (DPR=3) Canvas 视觉与触控边界 1:1 严格对齐 (top={rect['top']:.1f}px, w={rect['width']:.1f}px, h={rect['height']:.1f}px)")

            state0 = page.evaluate("() => window.__GAME_STATE__")
            btns = state0["buttons"]
            assert state0["jadeBalance"] == 120, f"预置灵玉应为 120，实际 {state0['jadeBalance']}"

            # 2. 触摸点击右上角 SFX 静音开关
            sx, sy = design_to_screen(rect, btns["sound"]["x"], btns["sound"]["y"])
            page.touchscreen.tap(sx, sy)
            page.wait_for_timeout(160)
            assert page.evaluate("() => window.__GAME_STATE__.soundEnabled") is False, "点击 SFX 按钮未切换为静音"
            page.touchscreen.tap(sx, sy)
            page.wait_for_timeout(160)
            assert page.evaluate("() => window.__GAME_STATE__.soundEnabled") is True, "再次点击 SFX 按钮未恢复开启"
            print("✓ 2. 触摸点击右上角 SFX ON/OFF 静音开关正常")

            # 3. 触摸点击 TRAILS 面板解锁并装备 JADE LOTUS（40 Jade）
            jx, jy = design_to_screen(rect, btns["trails"]["jade_lotus"]["x"], btns["trails"]["jade_lotus"]["y"])
            page.touchscreen.tap(jx, jy)
            page.wait_for_timeout(200)
            state_trail = page.evaluate("() => window.__GAME_STATE__")
            assert state_trail["selectedTrail"] == "jade_lotus", f"点击 JADE LOTUS 后应装备，实际 {state_trail['selectedTrail']}"
            assert "jade_lotus" in state_trail["unlockedTrails"], "JADE LOTUS 应写入已解锁皮肤列表"
            assert state_trail["jadeBalance"] == 80, f"解锁 40 Jade 皮肤后余额应为 80，实际 {state_trail['jadeBalance']}"
            print("✓ 3. 触摸点击 TRAILS 面板成功解锁并装备 JADE LOTUS（余额 120 -> 80）")

            # 4. 触摸点击 GLOBAL LEADERBOARD 打开并关闭
            lx, ly = design_to_screen(rect, btns["leaderboard"]["x"], btns["leaderboard"]["y"])
            page.touchscreen.tap(lx, ly)
            page.wait_for_timeout(240)
            assert page.evaluate("() => window.__GAME_STATE__.leaderboardOpen") is True, "点击排行榜未打开弹窗"
            cx, cy = design_to_screen(rect, 270, 480 + 258)
            page.touchscreen.tap(cx, cy)
            page.wait_for_timeout(180)
            assert page.evaluate("() => window.__GAME_STATE__.leaderboardOpen") is False, "点击 CLOSE 未关闭排行榜"
            print("✓ 4. 触摸点击 GLOBAL LEADERBOARD 打开与关闭正常")

            # 5. 触摸点击 PLAY NOW 进入 GameScene
            bx, by = design_to_screen(rect, btns["start"]["x"], btns["start"]["y"])
            page.touchscreen.tap(bx, by)
            page.wait_for_function("() => window.__GAME_STATE__.scene === 'GameScene'", timeout=5000)
            page.wait_for_timeout(260)
            print("✓ 5. 触摸点击 PLAY NOW 成功进入 Celestial Rush 局内场景")

            # 6. 真实模拟单指按住向右滑 -> 向左滑，验证角色严格跟手移动
            cdp = ctx.new_cdp_session(page)
            dispatch_touch_drag(cdp, page, rect, [(270, 740), (465, 740)], step_delay_ms=28)
            x_right = page.evaluate("() => window.__GAME_STATE__.playerX")
            assert x_right > 360, f"单指向右滑动后角色应显著右移 (>360)，实际 playerX={x_right}"

            dispatch_touch_drag(cdp, page, rect, [(465, 740), (85, 740)], step_delay_ms=28)
            x_left = page.evaluate("() => window.__GAME_STATE__.playerX")
            assert x_left < 185, f"单指向左滑动后角色应显著左移 (<185)，实际 playerX={x_left}"

            page.wait_for_timeout(450)
            assert len(errors) == 0, f"运行期间捕获到未处理异常：{errors}"
            print(f"✓ 6. 手机单指按住左右跟手滑动验证通过（右滑 X={x_right}px -> 左滑 X={x_left}px，0 报错）")

            browser.close()
    finally:
        httpd.shutdown()

    print("\n🎉 《Celestial Rush》iPhone 竖屏（390x844, DPR=3）触摸点击与滑动全链路验收通过！")


if __name__ == "__main__":
    main()
