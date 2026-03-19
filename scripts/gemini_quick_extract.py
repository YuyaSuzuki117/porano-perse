#!/usr/bin/env python3
"""Gemini 2.5 Flash で平面図の意味理解を高速抽出 (google-genai SDK streaming)

座標精度はルールベース(pdf-extract-vectors.py)に任せ、
Geminiには室名・什器名・壁分類など「意味理解」だけを担当させる。
"""
import fitz, json, re, sys, os, time

PDF_PATH = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\y-suz\OneDrive\デスクトップ\ChloeBY展開図‗見積用20251202 2.pdf"
OUT_PATH = sys.argv[2] if len(sys.argv) > 2 else "output/blueprint-analysis/ChloeBY_gemini.json"
API_KEY = os.environ.get("GEMINI_API_KEY", "")

if not API_KEY:
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        for line in open(env_path):
            if line.startswith("GEMINI_API_KEY="):
                API_KEY = line.strip().split("=", 1)[1]

# PDF → 画像
print("=== PDF → Gemini Vision 意味理解抽出 ===", flush=True)
doc = fitz.open(PDF_PATH)
page = doc[0]
mat = fitz.Matrix(150/72, 150/72)
pix = page.get_pixmap(matrix=mat)
img_bytes = pix.tobytes("png")
print(f"  画像: {len(img_bytes)//1024} KB ({pix.width}x{pix.height}px)", flush=True)

# 軽量プロンプト（座標不要・意味理解のみ）
PROMPT = """この平面図から以下を読み取り、JSON形式で出力してください。
座標は不要です。名前・分類・数量のみ出力してください。

```json
{
  "source": "gemini-vision",
  "project_name": "図面タイトルまたは案件名",
  "scale": "1:50等",
  "overall_shape": "矩形/L字/不整形",
  "overall_width_mm": 外形幅の実寸mm,
  "overall_depth_mm": 外形奥行の実寸mm,
  "rooms": [
    {"name": "室名(図面表記通り)", "approx_area_m2": 概算面積, "position_description": "左上/中央等の位置説明"}
  ],
  "doors": [
    {"type": "開き戸/引戸/折戸", "connects": ["室名A", "室名B"], "width_mm": 幅}
  ],
  "windows": [
    {"wall_side": "北/南/東/西", "width_mm": 幅}
  ],
  "fixtures": [
    {"name": "什器名(図面表記通り)", "type": "家具/設備/機器", "room": "設置室名"}
  ],
  "notes": "図面から読み取れる特記事項"
}
```

全ての部屋・ドア・窓・什器を省略せず含めてください。"""

# google-genai SDK ストリーミング
from google import genai
from google.genai import types

client = genai.Client(api_key=API_KEY)

print(f"  Gemini 2.5 Flash (streaming, 意味理解モード)...", flush=True)
t0 = time.time()

response = client.models.generate_content_stream(
    model="gemini-2.5-flash",
    contents=[
        types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
        PROMPT,
    ],
    config=types.GenerateContentConfig(
        temperature=0.1,
        max_output_tokens=16384,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    ),
)

raw_text = ""
chunk_count = 0
for chunk in response:
    if chunk.text:
        raw_text += chunk.text
        chunk_count += 1
        if chunk_count % 5 == 0:
            print(".", end="", flush=True)

elapsed = time.time() - t0
print(f"\n  完了 ({elapsed:.1f}秒, {len(raw_text)}文字)", flush=True)

# JSONを抽出
m = re.search(r"```json\s*(.*?)```", raw_text, re.DOTALL)
if m:
    json_str = m.group(1)
else:
    start = raw_text.find("{")
    end = raw_text.rfind("}") + 1
    if start >= 0 and end > start:
        json_str = raw_text[start:end]
    else:
        print(f"  ERROR: JSONが見つかりません\n{raw_text[:500]}")
        sys.exit(1)

try:
    parsed = json.loads(json_str)
except json.JSONDecodeError as e:
    print(f"  ERROR: JSONパース失敗: {e}")
    debug_path = OUT_PATH.replace(".json", "_raw.txt")
    with open(debug_path, "w", encoding="utf-8") as f:
        f.write(raw_text)
    print(f"  生応答保存: {debug_path}")
    sys.exit(1)

# merge-extractions.py 互換形式に変換
# Geminiの意味理解結果をai.json形式に変換
compat = {
    "source": "gemini-vision",
    "pdf_file": os.path.basename(PDF_PATH),
    "scale_detected": parsed.get("scale", "1:50"),
    "project_name": parsed.get("project_name", ""),
    "room": {
        "width_mm": parsed.get("overall_width_mm", 0),
        "depth_mm": parsed.get("overall_depth_mm", 0),
        "ceiling_height_mm": 2700,
        "shape": parsed.get("overall_shape", ""),
    },
    "walls": [],  # 座標はルールベースに任せる
    "rooms": [],
    "fixtures": [],
}

# 部屋変換
for i, r in enumerate(parsed.get("rooms", [])):
    compat["rooms"].append({
        "name": r.get("name", f"Room_{i+1}"),
        "area_m2": r.get("approx_area_m2", 0),
        "center_mm": [0, 0],  # ルールベースで補完
        "position_description": r.get("position_description", ""),
    })

# 什器変換
for f in parsed.get("fixtures", []):
    compat["fixtures"].append({
        "name": f.get("name", ""),
        "type": f.get("type", ""),
        "room": f.get("room", ""),
        "x_mm": 0, "y_mm": 0,  # ルールベースで補完
        "width_mm": 0, "depth_mm": 0,
        "estimated": True,
    })

# 建具情報も保存
compat["doors"] = parsed.get("doors", [])
compat["windows"] = parsed.get("windows", [])
compat["notes"] = parsed.get("notes", "")

# 保存
os.makedirs(os.path.dirname(os.path.abspath(OUT_PATH)), exist_ok=True)
with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(compat, f, ensure_ascii=False, indent=2)

# サマリー
rooms = compat["rooms"]
fixtures = compat["fixtures"]
doors = compat.get("doors", [])
windows = compat.get("windows", [])
print(f"\n=== Gemini 抽出完了 ({elapsed:.1f}秒) ===", flush=True)
print(f"  部屋: {len(rooms)}室  什器: {len(fixtures)}個  ドア: {len(doors)}個  窓: {len(windows)}個", flush=True)
print(f"\n  室名一覧:", flush=True)
for r in rooms:
    print(f"    {r['name']}: ~{r.get('area_m2','')}m² ({r.get('position_description','')})", flush=True)
print(f"\n  什器一覧:", flush=True)
for f in fixtures:
    print(f"    {f['name']} ({f.get('type','')}) → {f.get('room','')}", flush=True)
print(f"\n  出力: {OUT_PATH}", flush=True)
