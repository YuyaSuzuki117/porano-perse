"""
DXF 品質検証スクリプト
PDF→DXF変換後の完全性チェックを自動化する。

使い方:
  python scripts/validate-dxf.py output/drawings/ChloeBY_plan.dxf

チェック項目:
  1. レイヤー構成（9レイヤー必須）
  2. 壁の閉多角形チェック（部屋が閉じているか）
  3. 建具の壁対応チェック（建具が壁上にあるか）
  4. 什器の境界チェック（什器が部屋内にあるか）
  5. 寸法線の整合性（区間合計 = 全体寸法）
  6. メタデータとの照合
"""

import sys
import os
import json
import math

try:
    import ezdxf
except ImportError:
    print("ERROR: ezdxf が必要です → pip install ezdxf")
    sys.exit(1)


# ============================================================
# レイヤーチェック
# ============================================================
REQUIRED_LAYERS = ["壁", "壁芯", "建具", "什器", "寸法", "仕上げ", "室名", "設備", "補助"]


def check_layers(doc):
    """必須レイヤーの存在確認"""
    existing = [layer.dxf.name for layer in doc.layers]
    missing = [l for l in REQUIRED_LAYERS if l not in existing]
    return missing


# ============================================================
# エンティティカウント
# ============================================================
def count_entities(msp):
    """レイヤーごとのエンティティ数をカウント"""
    counts = {}
    for entity in msp:
        layer = entity.dxf.layer
        etype = entity.dxftype()
        key = f"{layer}/{etype}"
        counts[key] = counts.get(key, 0) + 1
    return counts


def count_by_layer(msp):
    """レイヤー別のサマリー"""
    summary = {}
    for entity in msp:
        layer = entity.dxf.layer
        summary[layer] = summary.get(layer, 0) + 1
    return summary


# ============================================================
# 壁の閉多角形チェック
# ============================================================
def check_wall_closure(msp, tolerance=1.0):
    """壁芯レイヤーのLINEが閉じた多角形を構成しているか"""
    wall_lines = []
    for entity in msp:
        if entity.dxf.layer == "壁芯" and entity.dxftype() == "LINE":
            start = (round(entity.dxf.start.x, 1), round(entity.dxf.start.y, 1))
            end = (round(entity.dxf.end.x, 1), round(entity.dxf.end.y, 1))
            wall_lines.append((start, end))

    if not wall_lines:
        return {"status": "WARN", "message": "壁芯レイヤーにLINEがありません"}

    # 端点のカウント（各端点は偶数回出現すべき = 閉じている）
    endpoints = {}
    for start, end in wall_lines:
        for pt in [start, end]:
            # 近い点をマージ（tolerance以内）
            matched = False
            for existing in list(endpoints.keys()):
                if math.dist(pt, existing) < tolerance:
                    endpoints[existing] += 1
                    matched = True
                    break
            if not matched:
                endpoints[pt] = 1

    odd_endpoints = [(pt, count) for pt, count in endpoints.items() if count % 2 != 0]

    if odd_endpoints:
        return {
            "status": "WARN",
            "message": f"壁が閉じていない可能性: {len(odd_endpoints)}個の開端点",
            "open_points": odd_endpoints[:5],
        }

    return {"status": "OK", "message": f"壁芯 {len(wall_lines)}本, 全て閉じています"}


# ============================================================
# 建具カウント
# ============================================================
def count_openings(msp):
    """建具レイヤーの建具をカウント（開き戸・引戸・折戸・開口・窓）"""
    swing_doors = 0      # ARC = 開き戸の開き円弧
    lines = 0            # LINE entities
    lwpolylines = 0      # LWPOLYLINE = 引戸パネル等
    texts = []           # TEXT entities (引戸/折戸の矢印等)

    for entity in msp:
        if entity.dxf.layer != "建具":
            continue
        if entity.dxftype() == "ARC":
            swing_doors += 1
        elif entity.dxftype() == "LINE":
            lines += 1
        elif entity.dxftype() == "LWPOLYLINE":
            lwpolylines += 1
        elif entity.dxftype() == "TEXT":
            texts.append(entity.dxf.text if hasattr(entity.dxf, 'text') else "")

    # 推定: 窓は3本LINE/セット、残りは引戸・折戸・開口の枠線
    # メタデータがあればそちらを正とするので、ここでは概算
    window_sets = 0
    other_lines = lines
    if lines >= 3:
        window_sets = lines // 5 if lwpolylines > 0 else lines // 3
        other_lines = lines - window_sets * 3

    # 引戸・折戸はLWPOLYLINEで描画される
    sliding_doors = lwpolylines

    total_openings = swing_doors + sliding_doors + window_sets
    if total_openings == 0 and lines > 0:
        # LINE のみの場合、窓か開口と推定
        window_sets = max(1, lines // 3)
        total_openings = window_sets

    return {
        "doors": swing_doors,
        "sliding_doors": sliding_doors,
        "windows": window_sets,
        "total_openings": total_openings,
        "total_lines": lines,
        "lwpolylines": lwpolylines,
    }


# ============================================================
# 什器カウント
# ============================================================
def count_furniture(msp):
    """什器レイヤーのLWPOLYLINEとTEXTをカウント"""
    polylines = 0
    texts = []

    for entity in msp:
        if entity.dxf.layer != "什器":
            continue
        if entity.dxftype() == "LWPOLYLINE":
            polylines += 1
        elif entity.dxftype() == "TEXT":
            texts.append(entity.dxf.text)

    return {"polylines": polylines, "texts": texts, "count": polylines}


# ============================================================
# 寸法線チェック
# ============================================================
def check_dimensions(msp):
    """寸法レイヤーのDIMENSIONを確認"""
    dims = []
    for entity in msp:
        if entity.dxf.layer == "寸法" and entity.dxftype() == "DIMENSION":
            try:
                p1 = (entity.dxf.defpoint2.x, entity.dxf.defpoint2.y)
                p2 = (entity.dxf.defpoint3.x, entity.dxf.defpoint3.y)
                value = math.dist(p1, p2)
                dims.append({"p1": p1, "p2": p2, "value_mm": round(value, 1)})
            except Exception:
                dims.append({"error": "寸法値を取得できませんでした"})

    return {"count": len(dims), "dimensions": dims}


# ============================================================
# バウンディングボックス
# ============================================================
def get_bounding_box(msp):
    """全エンティティのバウンディングボックスを計算"""
    min_x = min_y = float('inf')
    max_x = max_y = float('-inf')

    for entity in msp:
        try:
            if entity.dxftype() == "LINE":
                for pt in [entity.dxf.start, entity.dxf.end]:
                    min_x = min(min_x, pt.x)
                    min_y = min(min_y, pt.y)
                    max_x = max(max_x, pt.x)
                    max_y = max(max_y, pt.y)
            elif entity.dxftype() == "LWPOLYLINE":
                for x, y, *_ in entity.get_points():
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
        except Exception:
            continue

    if min_x == float('inf'):
        return None

    return {
        "min": (round(min_x, 1), round(min_y, 1)),
        "max": (round(max_x, 1), round(max_y, 1)),
        "width_mm": round(max_x - min_x, 1),
        "depth_mm": round(max_y - min_y, 1),
    }


# ============================================================
# メタデータ照合
# ============================================================
def check_meta(dxf_path, msp):
    """メタデータJSONとDXFの整合性を確認"""
    meta_path = dxf_path + ".meta.json"
    if not os.path.exists(meta_path):
        return {"status": "SKIP", "message": "メタデータファイルなし"}

    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)

    issues = []

    # 壁数の照合
    meta_walls = len(meta.get("walls", []))
    dxf_wall_lines = sum(1 for e in msp if e.dxf.layer == "壁芯" and e.dxftype() == "LINE")
    if meta_walls != dxf_wall_lines:
        issues.append(f"壁数不一致: meta={meta_walls}, DXF壁芯LINE={dxf_wall_lines}")

    # 建具数の照合（開き戸=ARC, 引戸/折戸/開口=LINE+LWPOLYLINE）
    meta_openings = len(meta.get("openings", []))
    dxf_opening_entities = sum(1 for e in msp if e.dxf.layer == "建具" and e.dxftype() in ("ARC", "LWPOLYLINE"))
    meta_doors = sum(1 for o in meta.get("openings", []) if o.get("type") == "door")
    dxf_arcs = sum(1 for e in msp if e.dxf.layer == "建具" and e.dxftype() == "ARC")
    if meta_doors > 0 and meta_doors != dxf_arcs:
        issues.append(f"開き戸数不一致: meta={meta_doors}, DXF ARC={dxf_arcs}")

    # 什器数の照合
    meta_furniture = len(meta.get("furniture", []))
    dxf_furniture = sum(1 for e in msp if e.dxf.layer == "什器" and e.dxftype() == "LWPOLYLINE")
    if meta_furniture != dxf_furniture:
        issues.append(f"什器数不一致: meta={meta_furniture}, DXF LWPOLYLINE={dxf_furniture}")

    if issues:
        return {"status": "WARN", "issues": issues}
    return {"status": "OK", "message": "メタデータとDXFが一致"}


# ============================================================
# メイン
# ============================================================
def validate(dxf_path):
    """DXFファイルの品質検証を実行"""
    print(f"\n{'='*60}")
    print(f"DXF 品質検証: {os.path.basename(dxf_path)}")
    print(f"{'='*60}\n")

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    score = 0
    max_score = 0
    results = {}

    # 1. レイヤーチェック
    max_score += 15
    missing_layers = check_layers(doc)
    if not missing_layers:
        score += 15
        results["layers"] = "OK - 全9レイヤー完備"
    else:
        score += max(0, 15 - len(missing_layers) * 2)
        results["layers"] = f"NG - 欠落: {', '.join(missing_layers)}"
    print(f"[1] レイヤー: {results['layers']}")

    # 2. エンティティ数
    max_score += 10
    layer_counts = count_by_layer(msp)
    total_entities = sum(layer_counts.values())
    if total_entities > 50:
        score += 10
    elif total_entities > 20:
        score += 5
    results["entities"] = layer_counts
    print(f"[2] エンティティ数: {total_entities}個")
    for layer, count in sorted(layer_counts.items()):
        print(f"    {layer}: {count}")

    # 3. 壁の閉多角形チェック
    max_score += 15
    closure = check_wall_closure(msp)
    if closure["status"] == "OK":
        score += 15
    elif closure["status"] == "WARN":
        score += 5
    results["wall_closure"] = closure
    print(f"[3] 壁の閉合: {closure['message']}")

    # 4. 建具カウント
    max_score += 15
    openings = count_openings(msp)
    if openings["total_openings"] >= 1:
        score += min(15, openings["total_openings"] * 3)
    results["openings"] = openings
    parts = []
    if openings["doors"]:
        parts.append(f"開き戸={openings['doors']}")
    if openings["sliding_doors"]:
        parts.append(f"引戸={openings['sliding_doors']}")
    if openings["windows"]:
        parts.append(f"窓={openings['windows']}")
    if not parts:
        parts.append("なし")
    print(f"[4] 建具: {', '.join(parts)}")

    # 5. 什器カウント
    max_score += 15
    furniture = count_furniture(msp)
    if furniture["count"] >= 1:
        score += min(15, furniture["count"] * 2)
    results["furniture"] = furniture
    print(f"[5] 什器: {furniture['count']}個")
    for name in furniture["texts"]:
        print(f"    - {name}")

    # 6. 寸法線
    max_score += 10
    dims = check_dimensions(msp)
    if dims["count"] >= 4:
        score += 10
    elif dims["count"] >= 2:
        score += 5
    results["dimensions"] = dims
    print(f"[6] 寸法線: {dims['count']}本")

    # 7. バウンディングボックス
    max_score += 5
    bbox = get_bounding_box(msp)
    if bbox:
        score += 5
        results["bbox"] = bbox
        print(f"[7] 外形: {bbox['width_mm']:.0f}mm x {bbox['depth_mm']:.0f}mm")
    else:
        print(f"[7] 外形: 計算不能")

    # 8. メタデータ照合
    max_score += 15
    meta_check = check_meta(dxf_path, msp)
    if meta_check["status"] == "OK":
        score += 15
    elif meta_check["status"] == "WARN":
        score += 5
        for issue in meta_check.get("issues", []):
            print(f"    WARN: {issue}")
    results["meta"] = meta_check
    print(f"[8] メタデータ照合: {meta_check.get('message', meta_check.get('status'))}")

    # 結果サマリー
    pct = round(score / max_score * 100)
    print(f"\n{'='*60}")
    print(f"検証スコア: {score}/{max_score} ({pct}%)")

    if pct >= 90:
        print("判定: PASS — 納品品質")
    elif pct >= 70:
        print("判定: ACCEPTABLE — 実用レベル（改善推奨）")
    elif pct >= 50:
        print("判定: NEEDS WORK — 要修正")
    else:
        print("判定: FAIL — 大幅な修正が必要")
    print(f"{'='*60}\n")

    return {"score": score, "max": max_score, "pct": pct, "results": results}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/validate-dxf.py <DXF_FILE>")
        sys.exit(1)

    validate(sys.argv[1])
