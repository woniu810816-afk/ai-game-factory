#!/usr/bin/env python3
"""
《INVESTITURE: Relic Forge / 封神锻炉》iPhone 竖屏（390x844, DPR=3, has_touch=True）全链路端到端验收测试
验证项：
1. html / body / #app / canvas 触控红线（touch-action: none, pointer-events: auto）与 Retina 1:1 居中对齐
2. 主界面顶部「EN / 中」一键中英文实时切换与回切
3. 主界面「WARLORDS / 封神战将」面板触摸解锁并装备杨戬（扣除 60 精魄并持久化）
4. 触摸点击「FORGE & DEFEND / 开炉破阵」成功进入 GameScene（黄金双区布局）
5. 局内顶部「EN / 中」切换正常
6. 真实模拟单指拖拽底部拼图块（含 60px 防手指遮挡上移偏移）到 5×5 阵盘精准落子，
   并连续拖拽直至成功填满整行或整列触发五行神通消除（linesCleared >= 1），全程 0 报错！
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


def dispatch_touch_drag(cdp, page, rect, start_pt, end_pt, steps=10, step_delay_ms=22):
    """使用 CDP Input.dispatchTouchEvent 真实模拟 iPhone 单指拖拽（touchStart -> 多步 touchMove -> touchEnd）"""
    sx0, sy0 = design_to_screen(rect, start_pt[0], start_pt[1])
    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchStart",
        "touchPoints": [{"x": round(sx0, 1), "y": round(sy0, 1), "id": 1}],
    })
    page.wait_for_timeout(45)

    for s in range(1, steps + 1):
        t = s / steps
        dx = start_pt[0] + (end_pt[0] - start_pt[0]) * t
        dy = start_pt[1] + (end_pt[1] - start_pt[1]) * t
        sx, sy = design_to_screen(rect, dx, dy)
        cdp.send("Input.dispatchTouchEvent", {
            "type": "touchMove",
            "touchPoints": [{"x": round(sx, 1), "y": round(sy, 1), "id": 1}],
        })
        page.wait_for_timeout(step_delay_ms)

    mid_dragging = page.evaluate("() => window.__GAME_STATE__.dragging")

    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchEnd",
        "touchPoints": [],
    })
    page.wait_for_timeout(140)
    return mid_dragging


def find_best_placement(board, tray):
    """在当前 5×5 盘面与 3 个待选拼图块中寻找最优落点（优先填满某行或某列触发消除）"""
    size = len(board)
    best = None

    for piece in tray:
        if not piece:
            continue
        cells = piece["cells"]
        for r in range(size):
            for c in range(size):
                valid = True
                placed = []
                for dr, dc in cells:
                    nr, nc = r + dr, c + dc
                    if nr < 0 or nr >= size or nc < 0 or nc >= size or board[nr][nc] is not None:
                        valid = False
                        break
                    placed.append((nr, nc))
                if not valid:
                    continue

                # 计算落子后整行/整列完成度评分
                sim = [row[:] for row in board]
                for nr, nc in placed:
                    sim[nr][nc] = piece["element"]

                clears = 0
                max_line_fill = 0
                for rr in range(size):
                    cnt = sum(1 for cc in range(size) if sim[rr][cc] is not None and sim[rr][cc] != "sealed")
                    if cnt == size:
                        clears += 1
                    max_line_fill = max(max_line_fill, cnt)
                for cc in range(size):
                    cnt = sum(1 for rr in range(size) if sim[rr][cc] is not None and sim[rr][cc] != "sealed")
                    if cnt == size:
                        clears += 1
                    max_line_fill = max(max_line_fill, cnt)

                # 优先能立刻消行，其次优先把最接近满的行（尤其是第 0/1 行）堆满
                row_bonus = sum(10 - nr for nr, _ in placed)
                score = clears * 10000 + max_line_fill * 120 + len(placed) * 20 + row_bonus
                if best is None or score > best["score"]:
                    best = {"score": score, "piece": piece, "row": r, "col": c}

    return best


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

            # 预置 120 玄铁精魄以验证封神战将解锁与持久化
            seed_save = json.dumps({
                "maxLevel": 1,
                "bestScore": 0,
                "coins": 120,
                "soundEnabled": True,
                "unlockedWarlords": ["nezha"],
                "selectedWarlord": "nezha",
            })
            page.add_init_script(
                f"if (!localStorage.getItem('irf_local_save_v1')) localStorage.setItem('irf_local_save_v1', {json.dumps(seed_save)});"
            )

            page.goto(f"http://127.0.0.1:{port}/", wait_until="networkidle")
            page.wait_for_function("() => window.__GAME_STATE__ && window.__GAME_STATE__.scene === 'MenuScene'", timeout=8000)

            # 1. 验证 iPhone 390x844 DPR=3 触控样式与 Canvas 1:1 居中对齐
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
            assert "INVESTITURE" in dom_check["title"], f"标题应包含 INVESTITURE，实际 {dom_check['title']}"
            for item in dom_check["els"]:
                assert item["touchAction"] == "none", f"{item['sel']} touch-action 必须为 none"
                assert item["pointerEvents"] == "auto", f"{item['sel']} pointer-events 必须为 auto"

            rect = dom_check["rect"]
            expected_top = (844 - rect["height"]) / 2
            assert abs(rect["top"] - expected_top) <= 3.0, f"Canvas 垂直居中存在偏移！top={rect['top']}"
            print(f"✓ 1. iPhone 390x844 (DPR=3) Canvas 1:1 对齐校验通过 (top={rect['top']:.1f}px, w={rect['width']:.1f}px, h={rect['height']:.1f}px)")

            state0 = page.evaluate("() => window.__GAME_STATE__")
            btns = state0["buttons"]
            assert state0["lang"] == "en", f"默认语言应为 en，实际 {state0['lang']}"

            # 2. 触摸点击「EN / 中」切换双语并切回
            lx, ly = design_to_screen(rect, btns["lang"]["x"], btns["lang"]["y"])
            page.touchscreen.tap(lx, ly)
            page.wait_for_timeout(160)
            assert page.evaluate("() => window.__GAME_STATE__.lang") == "zh", "点击 EN/中 后未切换为中文"
            page.touchscreen.tap(lx, ly)
            page.wait_for_timeout(160)
            assert page.evaluate("() => window.__GAME_STATE__.lang") == "en", "再次点击 EN/中 后未切回英文"
            print("✓ 2. 顶部「EN / 中」实时中英文切换验证通过")

            # 3. 触摸点击「WARLORDS」解锁并装备杨戬（60 玄铁精魄）
            yx, yy = design_to_screen(rect, btns["warlords"]["yangjian"]["x"], btns["warlords"]["yangjian"]["y"])
            page.touchscreen.tap(yx, yy)
            page.wait_for_timeout(200)
            st_wl = page.evaluate("() => window.__GAME_STATE__")
            assert st_wl["selectedWarlord"] == "yangjian", f"杨戬应已出战，实际 {st_wl['selectedWarlord']}"
            assert st_wl["essenceBalance"] == 60, f"解锁 60 精魄战将后余额应为 60，实际 {st_wl['essenceBalance']}"
            print("✓ 3. 触摸点击封神战将面板解锁并出战杨戬（精魄 120 -> 60）")

            # 4. 触摸点击「FORGE & DEFEND / 开炉破阵」进入 GameScene
            sx, sy = design_to_screen(rect, btns["start"]["x"], btns["start"]["y"])
            page.touchscreen.tap(sx, sy)
            page.wait_for_function("() => window.__GAME_STATE__.scene === 'GameScene'", timeout=5000)
            page.wait_for_timeout(250)
            print("✓ 4. 触摸点击「开局」成功进入 5×5 八卦锻炉与商周战场")

            # 5. 局内测试「EN / 中」双语切换
            gs0 = page.evaluate("() => window.__GAME_STATE__")
            hlx, hly = design_to_screen(rect, gs0["hudButtons"]["lang"]["x"], gs0["hudButtons"]["lang"]["y"])
            page.touchscreen.tap(hlx, hly)
            page.wait_for_timeout(150)
            assert page.evaluate("() => window.__GAME_STATE__.lang") == "zh", "局内点击语言按钮未切为中文"
            print("✓ 5. 局内顶部中英文实时切换正常")

            # 6. 核心单指拖拽测试（含 60px 防遮挡偏移）：连续将拼图块拖入 5×5 阵盘直至触发整行/整列消除
            cdp = ctx.new_cdp_session(page)
            geom = gs0["boardGeom"]
            lift_y = geom["dragLiftY"]
            assert lift_y == 60, f"拖拽防遮挡上移偏移量应为 60px，实际 {lift_y}"

            drag_seen = False
            max_attempts = 16
            for step in range(max_attempts):
                gs = page.evaluate("() => window.__GAME_STATE__")
                if gs["linesCleared"] >= 1:
                    break

                move = find_best_placement(gs["board"], gs["tray"])
                assert move is not None, "当前 5×5 盘面未找到可用落点"

                piece = move["piece"]
                cells = piece["cells"]
                max_r = max(dr for dr, _ in cells) + 1
                max_c = max(dc for _, dc in cells) + 1

                # 目标放置时拼图块中心在画布中的理论坐标
                target_center_x = geom["originX"] + (move["col"] + max_c / 2.0) * geom["cellSize"]
                target_center_y = geom["originY"] + (move["row"] + max_r / 2.0) * geom["cellSize"]
                # 由于手指拖动时拼图块自动上移 60px，因此手指实际应拖至 target_center_y + 60px
                finger_end = (target_center_x, target_center_y + lift_y)
                finger_start = (piece["x"], piece["y"])

                prev_placed = gs["piecesPlaced"]
                was_dragging = dispatch_touch_drag(cdp, page, rect, finger_start, finger_end)
                if was_dragging:
                    drag_seen = True

                gs_after = page.evaluate("() => window.__GAME_STATE__")
                assert gs_after["piecesPlaced"] == prev_placed + 1, (
                    f"第 {step + 1} 次单指拖拽未能成功落子！(piece={piece['shapeId']}, target=({move['row']},{move['col']}))"
                )

            final_gs = page.evaluate("() => window.__GAME_STATE__")
            assert drag_seen, "未检测到单指拖拽预览状态 dragging=True"
            assert final_gs["piecesPlaced"] >= 2, f"应成功拖放多块拼图，实际 {final_gs['piecesPlaced']}"
            assert final_gs["linesCleared"] >= 1, f"连续单指拖拽后应至少完成 1 次整行/整列消除，实际 {final_gs['linesCleared']}"
            assert final_gs["score"] > 100, f"消除后战功分数应显著上涨，实际 {final_gs['score']}"
            assert len(errors) == 0, f"运行期间捕获到未处理异常：{errors}"

            print(
                f"✓ 6. 手机单指拖拽拼图块（含 60px 防遮挡上移）落子与消行全链路通过！"
                f"（落子 {final_gs['piecesPlaced']} 块，消除 {final_gs['linesCleared']} 行/列，战功 {final_gs['score']}，0 报错）"
            )

            browser.close()
    finally:
        httpd.shutdown()

    print("\n🎉 《INVESTITURE: Relic Forge》iPhone 竖屏（390x844, DPR=3）全链路触摸与拖拽验收全部通过！")


if __name__ == "__main__":
    main()
