#!/usr/bin/env python3
"""
《INVESTITURE: Relic Forge》V1.0 MVP iPhone 竖屏（390x844, DPR=3, has_touch=True）端到端验收测试
验证项：
1. html / body / #app / canvas 触控红线（touch-action: none, pointer-events: auto）与 Retina 1:1 居中对齐
2. 主界面顶部「EN / 中」轻量双语实时切换与回切
3. 触摸点击「PLAY」进入 8 列 1:1 对齐战场（验证 battleGeom 与 boardGeom 1:1 对齐、dragLiftY=65）
4. 验证同步回合制：等待 500ms 不放块妖魔纹丝不动；单指拖拽落子 1 块后，上方妖魔严格同步推进 1 格
5. 持续真实单指拖拽拼图块（含 65px 防遮挡上移）填满某一条有敌人的垂直列，
   验证消列精准击中上方对应纵道的敌人（扣血或击杀），全程 0 报错！
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


def dispatch_touch_drag(cdp, page, rect, start_pt, end_pt, steps=9, step_delay_ms=18):
    """使用 CDP Input.dispatchTouchEvent 真实模拟 iPhone 单指拖拽"""
    sx0, sy0 = design_to_screen(rect, start_pt[0], start_pt[1])
    cdp.send("Input.dispatchTouchEvent", {
        "type": "touchStart",
        "touchPoints": [{"x": round(sx0, 1), "y": round(sy0, 1), "id": 1}],
    })
    page.wait_for_timeout(35)

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
    page.wait_for_timeout(120)
    return mid_dragging


def choose_column_focused_move(board, tray, enemy_lanes):
    """贪心寻优：优先将拼图块填入有敌人的目标纵列，触发垂直消列精准命中对应纵道敌人"""
    size = len(board)
    best = None

    # 计算当前每列已有格数，锁定最接近填满且上方有敌人的纵道
    col_counts = [sum(1 for r in range(size) if board[r][c] is not None) for c in range(size)]
    enemy_lane_set = set(enemy_lanes)

    for piece in tray:
        if not piece:
            continue
        cells = piece["cells"]
        for r in range(size):
            for c in range(size):
                ok = True
                placed = []
                for dr, dc in cells:
                    nr, nc = r + dr, c + dc
                    if nr < 0 or nr >= size or nc < 0 or nc >= size or board[nr][nc] is not None:
                        ok = False
                        break
                    placed.append((nr, nc))
                if not ok:
                    continue

                sim = [row[:] for row in board]
                for nr, nc in placed:
                    sim[nr][nc] = piece["element"]

                col_clears_hit_enemy = 0
                col_clears_any = 0
                row_clears = 0
                for cc in range(size):
                    if all(sim[rr][cc] is not None for rr in range(size)):
                        col_clears_any += 1
                        if cc in enemy_lane_set:
                            col_clears_hit_enemy += 1
                for rr in range(size):
                    if all(sim[rr][cc] is not None for cc in range(size)):
                        row_clears += 1

                # 优先堆满某个有敌人的列，并把该列越堆越高
                target_col_progress = 0
                for _, nc in placed:
                    if nc in enemy_lane_set:
                        target_col_progress += (col_counts[nc] + 1) * 45
                    else:
                        target_col_progress += (col_counts[nc] + 1) * 10

                score = (
                    col_clears_hit_enemy * 200000
                    + col_clears_any * 10000
                    + target_col_progress
                    - (row_clears * 4000 if col_clears_hit_enemy == 0 else 0)
                )
                if best is None or score > best["score"]:
                    best = {"score": score, "piece": piece, "row": r, "col": c}
    return best


def drag_piece_to(cdp, page, rect, geom, piece, row, col):
    cells = piece["cells"]
    max_r = max(dr for dr, _ in cells) + 1
    max_c = max(dc for _, dc in cells) + 1
    target_cx = geom["originX"] + (col + max_c / 2.0) * geom["cellSize"]
    target_cy = geom["originY"] + (row + max_r / 2.0) * geom["cellSize"]
    # 严格配合游戏内 65px 上移防手指遮挡逻辑
    finger_end = (target_cx, target_cy + geom["dragLiftY"])
    finger_start = (piece["x"], piece["y"])
    return dispatch_touch_drag(cdp, page, rect, finger_start, finger_end)


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

            # 1. 验证 iPhone 390x844 DPR=3 触控样式与 Canvas 1:1 居中对齐
            dom = page.evaluate("""() => {
              const els = ['html', 'body', '#app', 'canvas'].map(sel => {
                const el = document.querySelector(sel);
                const st = el ? getComputedStyle(el) : null;
                return { sel, touchAction: st?.touchAction, pointerEvents: st?.pointerEvents };
              });
              const canvas = document.querySelector('canvas');
              const rect = canvas.getBoundingClientRect().toJSON();
              return { els, rect, dpr: window.devicePixelRatio };
            }""")
            assert dom["dpr"] == 3, f"期望 DPR=3，实际 {dom['dpr']}"
            for item in dom["els"]:
                assert item["touchAction"] == "none", f"{item['sel']} touch-action 必须为 none"
                assert item["pointerEvents"] == "auto", f"{item['sel']} pointer-events 必须为 auto"
            rect = dom["rect"]
            expected_top = (844 - rect["height"]) / 2
            assert abs(rect["top"] - expected_top) <= 3.0, f"Canvas 垂直居中存在偏移！top={rect['top']}"
            print(f"✓ 1. iPhone 390x844 (DPR=3) Canvas 1:1 对齐与触控红线通过 (top={rect['top']:.1f}px)")

            # 2. 验证 EN / 中 双语切换
            st0 = page.evaluate("() => window.__GAME_STATE__")
            btns = st0["buttons"]
            assert st0["lang"] == "en", f"默认应为英文 en，实际 {st0['lang']}"
            lx, ly = design_to_screen(rect, btns["lang"]["x"], btns["lang"]["y"])
            page.touchscreen.tap(lx, ly)
            page.wait_for_timeout(150)
            assert page.evaluate("() => window.__GAME_STATE__.lang") == "zh", "点击 EN/中 未切换为中文"
            page.touchscreen.tap(lx, ly)
            page.wait_for_timeout(150)
            assert page.evaluate("() => window.__GAME_STATE__.lang") == "en", "再次点击 EN/中 未切回英文"
            print("✓ 2. 顶部「EN / 中」轻量双语切换验证通过")

            # 3. 触摸点击 PLAY 开局，验证 8 条纵道与 8×8 阵盘 1:1 垂直对齐 & dragLiftY=65
            sx, sy = design_to_screen(rect, btns["start"]["x"], btns["start"]["y"])
            page.touchscreen.tap(sx, sy)
            page.wait_for_function("() => window.__GAME_STATE__.scene === 'GameScene'", timeout=5000)
            page.wait_for_timeout(200)

            gs0 = page.evaluate("() => window.__GAME_STATE__")
            bgeom = gs0["boardGeom"]
            fgeom = gs0["battleGeom"]
            assert bgeom["size"] == 8 and fgeom["lanes"] == 8, "必须为 8×8 阵盘与 8 条纵道"
            assert bgeom["originX"] == fgeom["originX"], "上方 8 纵道与下方 8 列 X 起点必须 1:1 严格对齐"
            assert bgeom["cellSize"] == fgeom["laneWidth"], "上方纵道宽与下方列宽必须 1:1 严格对齐"
            assert bgeom["dragLiftY"] == 65, f"拖拽防遮挡上移应为 65px，实际 {bgeom['dragLiftY']}"
            print("✓ 3. 触摸开局成功，8 条纵道与 8×8 阵盘 1:1 垂直对齐且 dragLiftY=65px")

            # 4. 验证同步回合制：不放块等待 500ms 妖魔纹丝不动；放 1 块后妖魔严格向下推进 1 格
            enemies_idle_before = gs0["enemies"]
            assert len(enemies_idle_before) >= 2, "开局应已刷出第 1 波妖魔"
            page.wait_for_timeout(500)
            enemies_idle_after = page.evaluate("() => window.__GAME_STATE__.enemies")
            assert enemies_idle_before == enemies_idle_after, "未放拼图时妖魔不应移动（违反同步回合制）"

            cdp = ctx.new_cdp_session(page)
            tracked_enemy = enemies_idle_before[0]
            first_move = choose_column_focused_move(
                gs0["board"], gs0["tray"], [e["lane"] for e in enemies_idle_before]
            )
            assert first_move is not None
            was_dragging = drag_piece_to(
                cdp, page, rect, bgeom, first_move["piece"], first_move["row"], first_move["col"]
            )
            assert was_dragging, "单指拖拽期间应进入 dragging=True 状态"

            gs1 = page.evaluate("() => window.__GAME_STATE__")
            assert gs1["piecesPlaced"] == 1 and gs1["turnCount"] == 1, "放 1 块后应推进至第 1 回合"
            moved_enemy = next((e for e in gs1["enemies"] if e["id"] == tracked_enemy["id"]), None)
            assert moved_enemy is not None, "第 1 回合未消行时追踪的妖魔应仍存活"
            assert moved_enemy["row"] == tracked_enemy["row"] + 1, (
                f"放 1 块后妖魔应同步推进 1 格：原 row={tracked_enemy['row']}，现 row={moved_enemy['row']}"
            )
            print(f"✓ 4. 同步回合制验证通过（不放块静止，落子 1 块后妖魔 row {tracked_enemy['row']} -> {moved_enemy['row']}）")

            # 5. 持续真实单指拖拽直至填满某条有敌人的垂直列，验证消列精准击中上方对应纵道敌人
            col_hit_verified = False
            col_hit_detail = ""
            for _step in range(28):
                gs = page.evaluate("() => window.__GAME_STATE__")
                if gs["isEnded"]:
                    break
                enemy_lanes = [e["lane"] for e in gs["enemies"]]
                move = choose_column_focused_move(gs["board"], gs["tray"], enemy_lanes)
                if move is None:
                    break

                # 记录放块前各纵道敌人的 (id, hp) 快照
                enemies_before = {e["id"]: dict(e) for e in gs["enemies"]}
                prev_placed = gs["piecesPlaced"]

                drag_piece_to(cdp, page, rect, bgeom, move["piece"], move["row"], move["col"])
                gs_after = page.evaluate("() => window.__GAME_STATE__")
                assert gs_after["piecesPlaced"] == prev_placed + 1, "单指拖拽拼图块应精准落入 8×8 盘面"

                last_cast = gs_after.get("lastCast")
                if last_cast and last_cast.get("fullCols"):
                    cleared_cols = last_cast["fullCols"]
                    hit_ids = set(last_cast.get("hitEnemyIds") or [])
                    # 检查被消除的列中，是否有对应纵道敌人在本回合被精准命中（掉血或被击杀）
                    for col_idx in cleared_cols:
                        lane_targets_before = [
                            e for e in enemies_before.values()
                            if e["lane"] == col_idx or (e["span"] == 2 and e["lane"] + 1 == col_idx)
                        ]
                        for tgt in lane_targets_before:
                            if tgt["id"] in hit_ids:
                                after_e = next((x for x in gs_after["enemies"] if x["id"] == tgt["id"]), None)
                                if after_e is None or after_e["hp"] < tgt["hp"]:
                                    col_hit_verified = True
                                    status = "击杀" if after_e is None else f"HP {tgt['hp']}->{after_e['hp']}"
                                    col_hit_detail = (
                                        f"消除第 {col_idx + 1} 列（属性 {last_cast['element']}）"
                                        f"精准命中第 {col_idx + 1} 号纵道妖魔（{status}）"
                                    )
                                    break
                        if col_hit_verified:
                            break
                if col_hit_verified:
                    break

            assert col_hit_verified, "未能在 28 步内验证消列精准击中上方对应纵道敌人"
            assert len(errors) == 0, f"运行期间捕获未处理异常：{errors}"
            print(f"✓ 5. 消列精准打击验证通过：{col_hit_detail}，全程 0 报错！")

            browser.close()
    finally:
        httpd.shutdown()

    print("\n🎉 《INVESTITURE: Relic Forge》V1.0 MVP iPhone 端到端验收全部通过！")


if __name__ == "__main__":
    main()
