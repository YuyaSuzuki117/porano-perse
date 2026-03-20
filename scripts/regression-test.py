"""
PDF→DXF 回帰テスト
ゴールドスタンダードと現在の抽出結果を比較し、劣化がないか検証する。

使い方:
  python scripts/regression-test.py
  python scripts/regression-test.py --update ChloeBY   # ゴールドスタンダード更新
"""

import json
import os
import sys
import subprocess
from pathlib import Path

# Windows cp932 対策
if sys.platform == "win32":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

GOLDEN_DIR = Path(__file__).parent.parent / "tests" / "golden"
OUTPUT_DIR = Path(__file__).parent.parent / "output" / "blueprint-analysis"
EXTRACT_SCRIPT = Path(__file__).parent / "pdf-extract-vectors.py"


def load_registry():
    registry_path = GOLDEN_DIR / "registry.json"
    if not registry_path.exists():
        print("ERROR: registry.json が見つかりません")
        sys.exit(1)
    with open(registry_path, "r", encoding="utf-8") as f:
        return json.load(f)


def count_stats(json_path: Path) -> dict:
    """JSONファイルから壁数・部屋数・什器数を集計"""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    rooms = data.get("rooms", [])
    return {
        "walls": len(data.get("walls", [])),
        "rooms": len(rooms),
        "named_rooms": sum(1 for r in rooms if r.get("name", "不明") != "不明"),
        "fixtures": len(data.get("fixtures", [])),
    }


def run_extraction(pdf_path: str, page: int, output_path: Path) -> bool:
    """pdf-extract-vectors.py を実行"""
    cmd = [
        sys.executable, str(EXTRACT_SCRIPT),
        pdf_path,
        "--page", str(page),
        "-o", str(output_path),
        "--pretty",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print(f"  抽出エラー: {result.stderr[:200]}")
        return False
    return True


def compare(expected: dict, actual: dict, tolerance: dict) -> list:
    """期待値と実測値を比較し、差分リストを返す"""
    issues = []
    for key in ["walls", "rooms", "named_rooms", "fixtures"]:
        exp = expected.get(key, 0)
        act = actual.get(key, 0)
        tol = tolerance.get(key, tolerance.get("rooms", 5))
        diff = act - exp
        status = "OK" if abs(diff) <= tol else "NG"
        issues.append({
            "metric": key,
            "expected": exp,
            "actual": act,
            "diff": diff,
            "tolerance": tol,
            "status": status,
        })
    return issues


def main():
    import argparse
    parser = argparse.ArgumentParser(description="PDF→DXF 回帰テスト")
    parser.add_argument("--update", type=str, help="ゴールドスタンダードを更新する案件名")
    args = parser.parse_args()

    registry = load_registry()
    standards = registry.get("golden_standards", [])

    if not standards:
        print("ゴールドスタンダードが登録されていません。")
        print("tests/golden/registry.json に追加してください。")
        return

    if args.update:
        # ゴールドスタンダード更新モード
        target = next((s for s in standards if s["name"] == args.update), None)
        if not target:
            print(f"ERROR: '{args.update}' がregistry.jsonに見つかりません")
            sys.exit(1)

        output_path = OUTPUT_DIR / f"{args.update}_regression.json"
        print(f"抽出実行中: {target['name']}...")
        if run_extraction(target["pdf"], target["page"], output_path):
            golden_path = GOLDEN_DIR / target["json"]
            import shutil
            shutil.copy2(output_path, golden_path)
            stats = count_stats(golden_path)
            target["expected"] = stats
            with open(GOLDEN_DIR / "registry.json", "w", encoding="utf-8") as f:
                json.dump(registry, f, ensure_ascii=False, indent=2)
            print(f"更新完了: {stats}")
        return

    # 回帰テスト実行
    print("=" * 60)
    print("PDF→DXF 回帰テスト")
    print("=" * 60)

    all_pass = True
    for standard in standards:
        name = standard["name"]
        print(f"\n--- {name} ---")

        # 現在のコードで抽出
        output_path = OUTPUT_DIR / f"{name}_regression.json"
        print(f"  抽出実行中...")
        if not run_extraction(standard["pdf"], standard["page"], output_path):
            all_pass = False
            continue

        # 結果比較
        actual = count_stats(output_path)
        issues = compare(standard["expected"], actual, standard.get("tolerance", {}))

        for issue in issues:
            mark = "✓" if issue["status"] == "OK" else "✗"
            diff_str = f"+{issue['diff']}" if issue["diff"] > 0 else str(issue["diff"])
            print(f"  {mark} {issue['metric']:15s}: 期待={issue['expected']:3d}  実測={issue['actual']:3d}  差={diff_str:>4s}  許容=±{issue['tolerance']}")
            if issue["status"] == "NG":
                all_pass = False

    print("\n" + "=" * 60)
    if all_pass:
        print("結果: 全テスト合格")
    else:
        print("結果: 劣化検出あり — 修正を確認してください")
    print("=" * 60)

    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
