"""
ルールベース + AI 抽出結果マージスクリプト

pdf-extract-vectors.py (ルールベース) と pdf-to-json-gemini.py (AI/Gemini) の
出力JSONをマージし、両方の強みを活かした統合JSONを生成する。

マージ戦略:
  - 壁座標: ルールベース優先 (ベクター精度)
  - 部屋名: AI優先 (文脈理解)
  - 什器: AI優先 (名前/用途)、座標はルールベースで補正
  - 建具: ルールベース優先 (位置精度)、タイプ分類はAIで補完

使い方:
  python scripts/merge-extractions.py rule.json ai.json -o merged.json [--pretty]

入力:
  rule.json — pdf-extract-vectors.py の出力 (source: "pdf-extract")
  ai.json   — pdf-to-json-gemini.py の出力 (source: "gemini-vision")

出力:
  merged.json — マージ済み統合JSON (source: "merged")
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


# ---------------------------------------------------------------------------
# 定数
# ---------------------------------------------------------------------------

# 部屋中心点のマッチング距離閾値 (mm)
ROOM_MATCH_THRESHOLD_MM = 2000

# 什器マッチング距離閾値 (mm)
FIXTURE_MATCH_THRESHOLD_MM = 1000

# 什器重複判定距離 (mm)
FIXTURE_DEDUP_THRESHOLD_MM = 500

# 建具マッチング距離 (壁上の位置, mm)
OPENING_MATCH_THRESHOLD_MM = 500

# 面積乖離警告閾値
AREA_DIVERGENCE_WARN = 0.20  # 20%


# ---------------------------------------------------------------------------
# ユーティリティ
# ---------------------------------------------------------------------------

def distance_2d(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """2点間のユークリッド距離"""
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def point_in_polygon(px: float, py: float, polygon: List[List[float]]) -> bool:
    """点がポリゴン内にあるか (Ray casting法)"""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def polygon_centroid(polygon: List[List[float]]) -> Tuple[float, float]:
    """ポリゴンの重心を計算"""
    if not polygon:
        return (0.0, 0.0)
    cx = sum(p[0] for p in polygon) / len(polygon)
    cy = sum(p[1] for p in polygon) / len(polygon)
    return (cx, cy)


def wall_midpoint(wall: dict) -> Tuple[float, float]:
    """壁の中点を計算"""
    mx = (wall.get("start_x_mm", 0) + wall.get("end_x_mm", 0)) / 2
    my = (wall.get("start_y_mm", 0) + wall.get("end_y_mm", 0)) / 2
    return (mx, my)


def wall_length(wall: dict) -> float:
    """壁の長さを計算 (mm)"""
    dx = wall.get("end_x_mm", 0) - wall.get("start_x_mm", 0)
    dy = wall.get("end_y_mm", 0) - wall.get("start_y_mm", 0)
    return math.sqrt(dx * dx + dy * dy)


# ---------------------------------------------------------------------------
# マージロジック
# ---------------------------------------------------------------------------

def merge_walls(rule_walls: List[dict], ai_walls: List[dict]) -> List[dict]:
    """
    壁のマージ: ルールベースの座標をベースに、AIの壁タイプで補完

    ルールベースの壁はベクターから直接抽出されており座標精度が高い。
    AIの壁は画像推定のため座標は不正確だが、exterior/interior/partitionの
    分類が文脈理解に基づいて正確な場合がある。
    """
    merged = []

    for rw in rule_walls:
        wall = dict(rw)  # shallow copy
        wall["merge_source"] = "rule"

        # AIの壁で最も近いものを探す (中点距離)
        r_mid = wall_midpoint(rw)
        best_ai = None
        best_dist = float("inf")
        for aw in ai_walls:
            a_mid = wall_midpoint(aw)
            d = distance_2d(r_mid, a_mid)
            if d < best_dist:
                best_dist = d
                best_ai = aw

        # 近い壁が見つかった場合、タイプ情報を補完
        if best_ai and best_dist < max(wall_length(rw) * 0.5, 2000):
            ai_type = best_ai.get("type")
            rule_type = wall.get("type")
            # ルールベースにタイプがない/不明な場合はAIで補完
            if not rule_type or rule_type == "unknown":
                if ai_type:
                    wall["type"] = ai_type
                    wall["type_source"] = "ai"

        merged.append(wall)

    return merged


def merge_rooms(rule_rooms: List[dict], ai_rooms: List[dict]) -> List[dict]:
    """
    部屋のマージ: ルールベースのポリゴン + AIの部屋名

    ルールベースは正確なポリゴンを持つが部屋名が不完全なことがある。
    AIは部屋名が正確だがポリゴン形状の精度が低い。
    """
    merged = []
    used_ai_indices = set()

    for rr in rule_rooms:
        room = dict(rr)
        room["merge_source"] = "rule"

        # ルールベースのポリゴン内にAI部屋の中心点が含まれるか検索
        r_polygon = rr.get("polygon_mm", [])
        best_ai_idx = None
        best_dist = float("inf")

        for i, ar in enumerate(ai_rooms):
            if i in used_ai_indices:
                continue

            ai_center = ar.get("center_mm")
            if ai_center and len(ai_center) == 2 and r_polygon:
                # まずポリゴン内判定
                if point_in_polygon(ai_center[0], ai_center[1], r_polygon):
                    best_ai_idx = i
                    best_dist = 0
                    break

                # ポリゴン内にない場合は重心距離
                r_center = polygon_centroid(r_polygon)
                d = distance_2d((ai_center[0], ai_center[1]), r_center)
                if d < best_dist:
                    best_dist = d
                    best_ai_idx = i
            elif ai_center and len(ai_center) == 2:
                # ルールベースにポリゴンがない場合 center_mm で比較
                r_center = rr.get("center_mm", [0, 0])
                if r_center:
                    d = distance_2d(
                        (ai_center[0], ai_center[1]),
                        (r_center[0] if isinstance(r_center, list) else 0,
                         r_center[1] if isinstance(r_center, list) else 0)
                    )
                    if d < best_dist:
                        best_dist = d
                        best_ai_idx = i

        # マッチしたAI部屋から名前を取得
        if best_ai_idx is not None and best_dist < ROOM_MATCH_THRESHOLD_MM:
            ai_room = ai_rooms[best_ai_idx]
            used_ai_indices.add(best_ai_idx)

            # AI部屋名で補完 (ルールベースに名前がないか "不明" の場合)
            rule_name = room.get("name", "")
            ai_name = ai_room.get("name", "")
            if ai_name and (not rule_name or rule_name == "不明" or rule_name.startswith("Room_")):
                room["name"] = ai_name
                room["name_source"] = "ai"
            else:
                room["name_source"] = "rule"

        merged.append(room)

    # AIにしかない部屋 (ルールベースで見落とされた部屋)
    for i, ar in enumerate(ai_rooms):
        if i not in used_ai_indices:
            ai_room = dict(ar)
            ai_room["merge_source"] = "ai_only"
            ai_room["name_source"] = "ai"
            merged.append(ai_room)

    return merged


def merge_fixtures(rule_fixtures: List[dict], ai_fixtures: List[dict]) -> List[dict]:
    """
    什器のマージ: AIの什器名をベースに、座標をルールベースで補正

    AIは什器の名前と用途を正確に理解できるが座標が不正確。
    ルールベースは形状から什器を検出するが名前を付けられない。
    """
    merged = []
    used_rule_indices = set()

    for af in ai_fixtures:
        fixture = dict(af)
        fixture["merge_source"] = "ai"

        ai_pos = (af.get("x_mm", 0), af.get("y_mm", 0))

        # ルールベースの什器で最も近いものを探す
        best_rule_idx = None
        best_dist = float("inf")
        for i, rf in enumerate(rule_fixtures):
            if i in used_rule_indices:
                continue
            rule_pos = (rf.get("x_mm", 0), rf.get("y_mm", 0))
            d = distance_2d(ai_pos, rule_pos)
            if d < best_dist:
                best_dist = d
                best_rule_idx = i

        # 近接するルールベース什器があれば座標を補正
        if best_rule_idx is not None and best_dist < FIXTURE_MATCH_THRESHOLD_MM:
            rf = rule_fixtures[best_rule_idx]
            used_rule_indices.add(best_rule_idx)

            # 座標をルールベースで上書き
            fixture["x_mm"] = rf.get("x_mm", fixture.get("x_mm", 0))
            fixture["y_mm"] = rf.get("y_mm", fixture.get("y_mm", 0))
            fixture["coord_source"] = "rule"

            # サイズもルールベースの方が正確な場合がある
            if rf.get("width_mm") and rf.get("depth_mm"):
                fixture["width_mm"] = rf["width_mm"]
                fixture["depth_mm"] = rf["depth_mm"]
                fixture["size_source"] = "rule"
        else:
            fixture["coord_source"] = "ai"

        merged.append(fixture)

    # ルールベースにしかない什器を追加
    for i, rf in enumerate(rule_fixtures):
        if i not in used_rule_indices:
            fixture = dict(rf)
            fixture["merge_source"] = "rule_only"
            fixture["coord_source"] = "rule"
            merged.append(fixture)

    # 重複除去 (同名で近接する什器を統合)
    deduped = []
    skip_indices = set()
    for i, f1 in enumerate(merged):
        if i in skip_indices:
            continue
        for j, f2 in enumerate(merged):
            if j <= i or j in skip_indices:
                continue
            # 同名 + 近接 → 統合
            name1 = f1.get("name", "").lower()
            name2 = f2.get("name", "").lower()
            if name1 and name2 and name1 == name2:
                d = distance_2d(
                    (f1.get("x_mm", 0), f1.get("y_mm", 0)),
                    (f2.get("x_mm", 0), f2.get("y_mm", 0))
                )
                if d < FIXTURE_DEDUP_THRESHOLD_MM:
                    skip_indices.add(j)
        deduped.append(f1)

    return deduped


def merge_openings(rule_walls: List[dict], ai_walls: List[dict]) -> List[dict]:
    """
    建具のマージ: ルールベースの壁ごとのopeningsをベースに、AIのタイプ分類で補完

    この関数はマージ済みの壁リスト(ルールベースベース)に対して、
    AIの建具タイプ情報を適用する。結果はwalls内のopeningsとして返す。
    """
    # AIの全建具をフラットに展開 (壁ID→建具リスト)
    ai_openings_flat = []
    for aw in ai_walls:
        wall_start = (aw.get("start_x_mm", 0), aw.get("start_y_mm", 0))
        for op in aw.get("openings", []):
            ai_openings_flat.append({
                "wall_start": wall_start,
                "opening": op,
            })

    # ルールベースの壁ごとにopeningsを処理
    for rw in rule_walls:
        openings = rw.get("openings", [])
        for op in openings:
            # タイプが "opening" (不明) の場合、AIで補完
            if op.get("type") in ("opening", "unknown", None):
                # 壁上の位置で最もマッチするAI建具を探す
                op_pos = op.get("position_mm", 0)
                best_ai_op = None
                best_diff = float("inf")
                for ai_item in ai_openings_flat:
                    ai_op = ai_item["opening"]
                    ai_pos = ai_op.get("position_mm", 0)
                    diff = abs(op_pos - ai_pos)
                    if diff < best_diff:
                        best_diff = diff
                        best_ai_op = ai_op

                if best_ai_op and best_diff < OPENING_MATCH_THRESHOLD_MM:
                    ai_type = best_ai_op.get("type")
                    if ai_type and ai_type != "opening":
                        op["type"] = ai_type
                        op["type_source"] = "ai"

    return rule_walls


# ---------------------------------------------------------------------------
# 品質スコア
# ---------------------------------------------------------------------------

def calculate_quality_score(merged: dict) -> dict:
    """
    マージ結果の品質スコアを算出 (100点満点)

    配点:
      壁閉合率: 30点
      部屋名付与率: 20点
      什器検出: 15点
      建具全数: 15点
      面積整合性: 10点
      マージ信頼度: 10点
    """
    scores = {}

    walls = merged.get("walls", [])
    rooms = merged.get("rooms", [])
    fixtures = merged.get("fixtures", [])

    # 壁閉合率 (30点) — 壁が存在するかの基本チェック
    wall_count = len(walls)
    if wall_count > 0:
        # 壁同士の端点接続をチェック (簡易版)
        endpoints = []
        for w in walls:
            endpoints.append((w.get("start_x_mm", 0), w.get("start_y_mm", 0)))
            endpoints.append((w.get("end_x_mm", 0), w.get("end_y_mm", 0)))
        # 各端点が他の端点と接続しているかチェック
        connected = 0
        for i, ep in enumerate(endpoints):
            for j, ep2 in enumerate(endpoints):
                if i != j and distance_2d(ep, ep2) < 100:  # 100mm以内
                    connected += 1
                    break
        closure_rate = connected / len(endpoints) if endpoints else 0
        scores["wall_closure"] = round(closure_rate * 30, 1)
    else:
        scores["wall_closure"] = 0

    # 部屋名付与率 (20点)
    room_count = len(rooms)
    if room_count > 0:
        named = sum(1 for r in rooms
                    if r.get("name") and r["name"] != "不明" and not r["name"].startswith("Room_"))
        scores["room_naming"] = round((named / room_count) * 20, 1)
    else:
        scores["room_naming"] = 0

    # 什器検出 (15点)
    fixture_count = len(fixtures)
    if fixture_count > 0:
        # 名前のある什器の割合
        named_fixtures = sum(1 for f in fixtures if f.get("name"))
        scores["fixture_detection"] = round((named_fixtures / fixture_count) * 15, 1)
    else:
        scores["fixture_detection"] = 0

    # 建具全数 (15点)
    total_openings = sum(len(w.get("openings", [])) for w in walls)
    typed_openings = sum(
        1 for w in walls for o in w.get("openings", [])
        if o.get("type") and o["type"] not in ("opening", "unknown")
    )
    if total_openings > 0:
        scores["opening_classification"] = round((typed_openings / total_openings) * 15, 1)
    else:
        scores["opening_classification"] = 7.5  # 建具なしは中間点

    # 面積整合性 (10点)
    room_info = merged.get("room", {})
    total_width = room_info.get("width_mm", 0)
    total_depth = room_info.get("depth_mm", 0)
    envelope_area = (total_width * total_depth) / 1e6  # m2
    room_area_sum = sum(r.get("area_m2", 0) for r in rooms)
    if envelope_area > 0 and room_area_sum > 0:
        ratio = room_area_sum / envelope_area
        # L字型等では合計<外形が正常
        divergence = abs(1.0 - ratio)
        if divergence < 0.1:
            scores["area_consistency"] = 10.0
        elif divergence < 0.3:
            scores["area_consistency"] = round((1 - divergence) * 10, 1)
        else:
            scores["area_consistency"] = round(max(0, (1 - divergence)) * 10, 1)
    else:
        scores["area_consistency"] = 5.0  # データ不足は中間点

    # マージ信頼度 (10点)
    # rule_only / ai_only のアイテムが少ないほど信頼度が高い
    merge_only_count = 0
    total_items = 0
    for r in rooms:
        total_items += 1
        if r.get("merge_source") in ("ai_only",):
            merge_only_count += 1
    for f in fixtures:
        total_items += 1
        if f.get("merge_source") in ("rule_only", "ai_only"):
            merge_only_count += 1
    if total_items > 0:
        agreement_rate = 1.0 - (merge_only_count / total_items)
        scores["merge_confidence"] = round(agreement_rate * 10, 1)
    else:
        scores["merge_confidence"] = 5.0

    scores["total"] = round(sum(scores.values()), 1)
    return scores


# ---------------------------------------------------------------------------
# メイン
# ---------------------------------------------------------------------------

def merge(rule_data: dict, ai_data: dict) -> dict:
    """2つの抽出結果をマージして統合JSONを返す"""

    merged = {
        "source": "merged",
        "merge_timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "rule_source": rule_data.get("source", "unknown"),
        "ai_source": ai_data.get("source", "unknown"),
        "pdf_file": rule_data.get("pdf_file") or ai_data.get("pdf_file", ""),
        "scale_detected": rule_data.get("scale_detected") or ai_data.get("scale_detected", ""),
        "project_name": rule_data.get("project_name") or ai_data.get("project_name", ""),
    }

    # 全体寸法: ルールベース優先
    rule_room = rule_data.get("room", {})
    ai_room = ai_data.get("room", {})
    merged["room"] = {
        "width_mm": rule_room.get("width_mm") or ai_room.get("width_mm", 0),
        "depth_mm": rule_room.get("depth_mm") or ai_room.get("depth_mm", 0),
        "ceiling_height_mm": rule_room.get("ceiling_height_mm") or ai_room.get("ceiling_height_mm", 2700),
        "shape": rule_room.get("shape") or ai_room.get("shape", "unknown"),
    }

    # 壁マージ
    rule_walls = rule_data.get("walls", [])
    ai_walls = ai_data.get("walls", [])
    merged_walls = merge_walls(rule_walls, ai_walls)

    # 建具マージ (壁のopeningsを補完)
    merged_walls = merge_openings(merged_walls, ai_walls)
    merged["walls"] = merged_walls

    # 部屋マージ
    rule_rooms = rule_data.get("rooms", [])
    ai_rooms = ai_data.get("rooms", [])
    merged["rooms"] = merge_rooms(rule_rooms, ai_rooms)

    # 什器マージ
    rule_fixtures = rule_data.get("fixtures", [])
    ai_fixtures = ai_data.get("fixtures", [])
    merged["fixtures"] = merge_fixtures(rule_fixtures, ai_fixtures)

    # 品質スコア
    merged["quality_score"] = calculate_quality_score(merged)

    # サマリー
    total_openings = sum(len(w.get("openings", [])) for w in merged["walls"])
    merged["summary"] = {
        "walls": len(merged["walls"]),
        "rooms": len(merged["rooms"]),
        "rooms_named": sum(1 for r in merged["rooms"]
                          if r.get("name") and r["name"] != "不明"),
        "fixtures": len(merged["fixtures"]),
        "openings": total_openings,
        "quality_total": merged["quality_score"]["total"],
    }

    # 警告
    warnings = []
    rule_wall_count = len(rule_walls)
    ai_wall_count = len(ai_walls)
    if rule_wall_count > 0 and ai_wall_count > 0:
        diff_ratio = abs(rule_wall_count - ai_wall_count) / max(rule_wall_count, ai_wall_count)
        if diff_ratio > 0.3:
            warnings.append(
                f"壁本数の乖離が大きい: ルール={rule_wall_count}, AI={ai_wall_count} "
                f"(差{abs(rule_wall_count - ai_wall_count)}本, {diff_ratio:.0%})"
            )

    rule_room_count = len(rule_rooms)
    ai_room_count = len(ai_rooms)
    if rule_room_count > 0 and ai_room_count > 0:
        diff = abs(rule_room_count - ai_room_count)
        if diff > 3:
            warnings.append(
                f"部屋数の乖離: ルール={rule_room_count}, AI={ai_room_count} (差{diff}室)"
            )

    merged["warnings"] = warnings

    return merged


def main():
    parser = argparse.ArgumentParser(
        description="ルールベース + AI 抽出結果マージ"
    )
    parser.add_argument("rule_json", help="ルールベース抽出JSON (pdf-extract-vectors.py の出力)")
    parser.add_argument("ai_json", help="AI抽出JSON (pdf-to-json-gemini.py の出力)")
    parser.add_argument("-o", "--output", required=True, help="出力マージ済みJSON")
    parser.add_argument("--pretty", action="store_true", help="整形出力")
    args = parser.parse_args()

    # 入力チェック
    for path, label in [(args.rule_json, "ルールベースJSON"), (args.ai_json, "AI JSON")]:
        if not os.path.exists(path):
            print(f"エラー: {label} が見つかりません: {path}", file=sys.stderr)
            sys.exit(1)

    # JSON読み込み
    with open(args.rule_json, "r", encoding="utf-8") as f:
        rule_data = json.load(f)
    with open(args.ai_json, "r", encoding="utf-8") as f:
        ai_data = json.load(f)

    print("=== 抽出結果マージ ===")
    print(f"  ルールベース: {args.rule_json}")
    print(f"    壁: {len(rule_data.get('walls', []))}本, "
          f"部屋: {len(rule_data.get('rooms', []))}室, "
          f"什器: {len(rule_data.get('fixtures', []))}個")
    print(f"  AI (Gemini): {args.ai_json}")
    print(f"    壁: {len(ai_data.get('walls', []))}本, "
          f"部屋: {len(ai_data.get('rooms', []))}室, "
          f"什器: {len(ai_data.get('fixtures', []))}個")
    print()

    # マージ実行
    merged = merge(rule_data, ai_data)

    # 結果表示
    summary = merged["summary"]
    score = merged["quality_score"]
    print(f"  マージ結果:")
    print(f"    壁: {summary['walls']}本")
    print(f"    部屋: {summary['rooms']}室 (名前あり: {summary['rooms_named']})")
    print(f"    什器: {summary['fixtures']}個")
    print(f"    建具: {summary['openings']}箇所")
    print(f"    品質スコア: {score['total']}/100")
    print(f"      壁閉合: {score['wall_closure']}/30")
    print(f"      部屋名: {score['room_naming']}/20")
    print(f"      什器: {score['fixture_detection']}/15")
    print(f"      建具: {score['opening_classification']}/15")
    print(f"      面積: {score['area_consistency']}/10")
    print(f"      信頼度: {score['merge_confidence']}/10")

    if merged["warnings"]:
        print()
        print("  警告:")
        for w in merged["warnings"]:
            print(f"    - {w}")

    # 保存
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    indent = 2 if args.pretty else None
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=indent)

    print(f"\n出力: {args.output}")
    print(f"\n次のステップ:")
    print(f"  python scripts/gen-dxf.py --json {args.output} -o output/drawings/<案件名>.dxf")


if __name__ == "__main__":
    main()
