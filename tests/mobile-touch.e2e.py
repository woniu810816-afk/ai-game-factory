#!/usr/bin/env python3
"""
iPhone 竖屏高分屏（390x844, deviceScaleFactor=3, has_touch=True）自动化触摸验收测试
验证：
1. html / body / #app / canvas 触控样式与视口居中对齐（无 Flexbox 叠加偏移）
2. 点击「音效开」「全球排行榜」「◀」「▶」全部灵敏响应
3. 实际点击「▶」后关卡数字变为第 2 关
4. 实际点击「开始冲刺」后成功进入 GameScene（level=2）且无任何运行时错误
"""

import http.server
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
              return { els, rect, dpr: window.devicePixelRatio, innerW: window.innerWidth, innerH: window.innerHeight };
            }""")

            assert dom_check["dpr"] == 3, f"期望 devicePixelRatio=3，实际 {dom_check['dpr']}"
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
            assert state0["selectedLevel"] == 1, f"初始关卡应为 1，实际 {state0['selectedLevel']}"

            # 2. 点击「音效开」按钮
            sx, sy = design_to_screen(rect, btns["sound"]["x"], btns["sound"]["y"])
            page.touchscreen.tap(sx, sy)
            page.wait_for_timeout(180)
            assert page.evaluate("() => window.__GAME_STATE__.soundEnabled") is False, "点击音效按钮未切换为静音"
            page.touchscreen.tap(sx, sy)
            page.wait_for_timeout(180)
            assert page.evaluate("() => window.__GAME_STATE__.soundEnabled") is True, "再次点击音效按钮未恢复开启"
            print("✓ 2. 触摸点击「音效开/关」按钮响应正常")

            # 3. 点击「全球排行榜」并关闭
            lx, ly = design_to_screen(rect, btns["leaderboard"]["x"], btns["leaderboard"]["y"])
            page.touchscreen.tap(lx, ly)
            page.wait_for_timeout(250)
            assert page.evaluate("() => window.__GAME_STATE__.leaderboardOpen") is True, "点击全球排行榜未打开弹窗"
            cx, cy = design_to_screen(rect, 270, 480 + 258)
            page.touchscreen.tap(cx, cy)
            page.wait_for_timeout(200)
            assert page.evaluate("() => window.__GAME_STATE__.leaderboardOpen") is False, "点击关闭排行榜未生效"
            print("✓ 3. 触摸点击「全球排行榜」打开与关闭正常")

            # 4. 点击「▶」切换至第 2 关，并测试「◀」回退再切回第 2 关
            nx, ny = design_to_screen(rect, btns["nextLevel"]["x"], btns["nextLevel"]["y"])
            px, py = design_to_screen(rect, btns["prevLevel"]["x"], btns["prevLevel"]["y"])
            page.touchscreen.tap(nx, ny)
            page.wait_for_timeout(180)
            lvl_after_next = page.evaluate("() => window.__GAME_STATE__.selectedLevel")
            assert lvl_after_next == 2, f"点击 ▶ 后期望变为第 2 关，实际为第 {lvl_after_next} 关"
            page.touchscreen.tap(px, py)
            page.wait_for_timeout(150)
            assert page.evaluate("() => window.__GAME_STATE__.selectedLevel") == 1, "点击 ◀ 应切回第 1 关"
            page.touchscreen.tap(nx, ny)
            page.wait_for_timeout(150)
            assert page.evaluate("() => window.__GAME_STATE__.selectedLevel") == 2, "再次点击 ▶ 应变为第 2 关"
            print("✓ 4. 触摸点击「▶」「◀」成功将关卡切换为第 2 关")

            # 5. 点击「🚀 开始冲刺」进入 GameScene（第 2 关）并持续运行无报错
            bx, by = design_to_screen(rect, btns["start"]["x"], btns["start"]["y"])
            page.touchscreen.tap(bx, by)
            page.wait_for_function("() => window.__GAME_STATE__.scene === 'GameScene'", timeout=5000)
            page.wait_for_timeout(1200)

            game_state = page.evaluate("() => window.__GAME_STATE__")
            assert game_state["scene"] == "GameScene", f"期望进入 GameScene，实际 {game_state['scene']}"
            assert game_state["level"] == 2, f"期望进入第 2 关，实际第 {game_state['level']} 关"

            # 模拟局内手指触摸左右点击操控
            tx, ty = design_to_screen(rect, 420, 760)
            page.touchscreen.tap(tx, ty)
            page.wait_for_timeout(300)

            assert len(errors) == 0, f"运行期间捕获到未处理异常：{errors}"
            print("✓ 5. 触摸点击「开始冲刺」成功进入第 2 关游戏运行场景，且 0 报错！")

            browser.close()
    finally:
        httpd.shutdown()

    print("\n🎉 iPhone 竖屏（390x844, DPR=3）自动化手机触摸验收全部通过！")


if __name__ == "__main__":
    main()
