"""
PDF平面図 → blueprint JSON (Gemini Vision API)

Usage:
  python scripts/pdf-to-json-gemini.py <pdf_path> -o <output.json> [--page N]

環境変数:
  GEMINI_API_KEY  Google AI Studio APIキー
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.request
import urllib.error

# --- Gemini API設定 ---
MODEL = "gemini-2.5-flash"
API_BASE = "https://generativelanguage.googleapis.com/v1beta"

EXTRACTION_PROMPT = """あなたは建築図面の読み取りエキスパートです。
添付した平面図から以下の情報を正確に読み取り、JSON形式で出力してください。

## 読み取りルール（厳守）

1. **単位はすべてmm（ミリメートル）**
2. **座標系**: 原点=図面の左下角、X=右方向、Y=上方向
3. **縮尺**: 図面の縮尺表記（1:50等）を確認し、寸法線の値を実寸mmで記録
4. **推測禁止**: 寸法線が読めない場合はドアサイズ(幅900mm)を基準に推定し、"estimated": true を付ける
5. **省略禁止**: 図面に描かれている全ての壁・建具・什器・部屋を含める

## 読み取り手順

### Pass 1: 全体把握
- 外形寸法（幅×奥行）を寸法線から読み取る
- 全室名をリストアップ
- 全建具（ドア・窓・引戸・折戸・開口）を数える
- 全什器・設備を数える

### Pass 2: 詳細抽出
- 各壁の始点・終点座標を寸法線から正確に算出
- 各壁上の建具の位置・幅・タイプを記録
- 各什器の位置・サイズを記録

## 出力JSON形式

```json
{
  "source": "gemini-vision",
  "pdf_file": "ファイル名",
  "scale_detected": "1:50",
  "project_name": "案件名",
  "walls": [
    {
      "id": "W1",
      "start_x_mm": 0, "start_y_mm": 0,
      "end_x_mm": 12000, "end_y_mm": 0,
      "thickness_mm": 120,
      "type": "exterior",
      "openings": [
        {"type": "door", "position_mm": 3000, "width_mm": 900, "height_mm": 2100},
        {"type": "window", "position_mm": 6000, "width_mm": 1800, "height_mm": 1200, "sill_mm": 800},
        {"type": "sliding_door", "position_mm": 9000, "width_mm": 1600, "height_mm": 2100}
      ]
    }
  ],
  "rooms": [
    {
      "name": "エリアA",
      "wall_ids": ["W1", "W2", "W3", "W4"],
      "area_m2": 35.0,
      "center_mm": [6000, 4000],
      "polygon_mm": [[0,0], [12000,0], [12000,7000], [0,7000]]
    }
  ],
  "fixtures": [
    {
      "name": "カウンター",
      "x_mm": 3000, "y_mm": 5000,
      "width_mm": 2400, "depth_mm": 600,
      "rotation_deg": 0, "estimated": false
    }
  ]
}
```

## フィールド説明
- walls.id: "W1","W2"...連番
- walls.type: "exterior"(外壁)/"interior"(内壁)/"partition"(間仕切り)
- walls.openings.type: "door"/"sliding_door"/"folding_door"/"window"/"opening"
- walls.openings.position_mm: 壁始点からの距離
- rooms.polygon_mm: 部屋の頂点座標（時計回り）
- fixtures.x_mm/y_mm: 左下角座標
- fixtures.estimated: 推定サイズの場合 true

## 重要
- **壁は必ず閉じたループを形成** — 各部屋を囲む壁が途切れないように
- **寸法線の区間合計が外形寸法と一致するか検算**
- **展開方向図や凡例エリアの要素は含めない**（平面図部分のみ）
- 日本語テキストはそのまま出力
- L字型・凸字型の部屋は polygon_mm で正確に形状を表現

JSONのみ出力してください。説明文は不要です。"""

VALIDATION_PROMPT = """先ほど出力したJSONを以下の観点で検証・修正してください。

1. **壁の閉合チェック**: 各部屋のwall_idsの壁が閉じたループを形成しているか？
2. **寸法検算**: 外形の各辺の区間合計 = 全体寸法か？
3. **建具の全数チェック**: 図面のドア/窓/引戸を全数カウントし、openingsと一致するか？
4. **室名の全数チェック**: 図面の全室名がrooms配列に含まれているか？
5. **polygon_mmの妥当性**: 各部屋の面積が area_m2 と整合するか？

修正後のJSONを出力してください。JSONのみ、説明不要。"""


def pdf_page_to_base64(pdf_path: str, page_num: int = 0) -> str:
    """PDFの指定ページを画像としてBase64エンコード"""
    import fitz
    doc = fitz.open(pdf_path)
    if page_num >= len(doc):
        print(f"エラー: ページ {page_num} は存在しません (全{len(doc)}ページ)")
        sys.exit(1)
    page = doc[page_num]
    pix = page.get_pixmap(dpi=200)
    img_bytes = pix.tobytes("png")
    doc.close()
    return base64.b64encode(img_bytes).decode("utf-8")


def call_gemini(api_key: str, prompt: str, image_b64: str = None,
                model: str = MODEL, max_retries: int = 3) -> str:
    """Gemini APIを呼び出してテキストを取得"""
    url = f"{API_BASE}/models/{model}:generateContent?key={api_key}"

    parts = []
    if image_b64:
        parts.append({
            "inline_data": {
                "mime_type": "image/png",
                "data": image_b64
            }
        })
    parts.append({"text": prompt})

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 32768,
            "thinkingConfig": {"thinkingBudget": 0},
        }
    }

    data = json.dumps(payload).encode("utf-8")

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(
                url, data=data,
                headers={"Content-Type": "application/json"}
            )
            resp = urllib.request.urlopen(req, timeout=300)
            result = json.loads(resp.read().decode("utf-8"))
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            return text
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 2 ** (attempt + 1) * 10
                print(f"  レート制限 (429)。{wait}秒待機... (リトライ {attempt+1}/{max_retries})")
                time.sleep(wait)
            else:
                body = e.read().decode("utf-8") if e.fp else ""
                print(f"  API エラー {e.code}: {body[:200]}")
                raise
        except Exception as e:
            print(f"  通信エラー: {e}")
            if attempt < max_retries - 1:
                time.sleep(5)
            else:
                raise

    raise RuntimeError("Gemini API: 最大リトライ回数に達しました")


def extract_json_from_response(text: str) -> dict:
    """Geminiの応答からJSON部分を抽出"""
    # ```json ... ``` を除去
    import re
    match = re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
    if match:
        text = match.group(1)
    return json.loads(text)


def main():
    parser = argparse.ArgumentParser(description="PDF平面図 → blueprint JSON (Gemini Vision)")
    parser.add_argument("pdf_path", help="入力PDFファイル")
    parser.add_argument("-o", "--output", required=True, help="出力JSONファイル")
    parser.add_argument("--page", type=int, default=0, help="平面図のページ番号 (0始まり)")
    parser.add_argument("--skip-validation", action="store_true", help="検証パスをスキップ")
    parser.add_argument("--api-key", help="Gemini APIキー (未指定時は環境変数 GEMINI_API_KEY)")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("エラー: GEMINI_API_KEY を環境変数に設定するか --api-key で指定してください")
        sys.exit(1)

    pdf_path = args.pdf_path
    if not os.path.exists(pdf_path):
        print(f"エラー: {pdf_path} が見つかりません")
        sys.exit(1)

    print(f"=== PDF → JSON (Gemini Vision) ===")
    print(f"  PDF: {pdf_path}")
    print(f"  ページ: {args.page}")
    print(f"  モデル: {MODEL}")
    print()

    # Step 1: PDF → 画像
    print("[1/3] PDF → 画像変換...")
    img_b64 = pdf_page_to_base64(pdf_path, args.page)
    print(f"  画像サイズ: {len(img_b64) // 1024} KB (Base64)")

    # Step 2: Gemini で抽出
    print("[2/3] Gemini Vision で図面読み取り...")
    raw_response = call_gemini(api_key, EXTRACTION_PROMPT, img_b64)
    try:
        data = extract_json_from_response(raw_response)
    except json.JSONDecodeError as e:
        print(f"  JSON解析エラー: {e}")
        print(f"  生レスポンス保存: {args.output}.raw.txt")
        with open(f"{args.output}.raw.txt", "w", encoding="utf-8") as f:
            f.write(raw_response)
        sys.exit(1)

    walls = len(data.get("walls", []))
    rooms = len(data.get("rooms", []))
    fixtures = len(data.get("fixtures", []))
    openings = sum(len(w.get("openings", [])) for w in data.get("walls", []))
    print(f"  初回結果: 壁{walls}本, 部屋{rooms}室, 什器{fixtures}個, 開口{openings}箇所")

    # Step 3: 検証パス
    if not args.skip_validation:
        print("[3/3] 検証パス（Gemini自己チェック）...")
        validation_input = VALIDATION_PROMPT + "\n\n```json\n" + json.dumps(data, ensure_ascii=False, indent=2) + "\n```"
        validated_response = call_gemini(api_key, validation_input, img_b64)
        try:
            data = extract_json_from_response(validated_response)
            walls2 = len(data.get("walls", []))
            rooms2 = len(data.get("rooms", []))
            fixtures2 = len(data.get("fixtures", []))
            print(f"  検証後: 壁{walls2}本(+{walls2-walls}), 部屋{rooms2}室(+{rooms2-rooms}), 什器{fixtures2}個(+{fixtures2-fixtures})")
        except json.JSONDecodeError:
            print("  検証パスのJSON解析失敗 — 初回結果を使用")
    else:
        print("[3/3] 検証パス: スキップ")

    # 保存
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n出力: {args.output}")
    print(f"  壁: {len(data.get('walls',[]))}本")
    print(f"  部屋: {len(data.get('rooms',[]))}室")
    print(f"  什器: {len(data.get('fixtures',[]))}個")
    print(f"\n次のステップ:")
    print(f"  python scripts/gen-dxf.py --json {args.output} -o output/drawings/<案件名>.dxf")


if __name__ == "__main__":
    main()
