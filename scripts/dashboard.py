"""
PDF→DXF パイプライン検証ダッシュボード

モバイルからも進捗確認・テストPDFアップロード・比較検証が可能。
Tailscale経由でアクセス: http://100.110.33.34:3002

起動:
  cd ~/porano-perse
  python scripts/dashboard.py

機能:
  1. 元PDF ↔ DXF出力の並列・重ね合わせ比較
  2. パース画像の閲覧
  3. テストPDFアップロード → 自動パイプライン実行
  4. PDCA進捗トラッカー
  5. 抽出サマリー・警告の確認
"""

import io
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file

# プロジェクトルート
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
OUTPUT_DIR = PROJECT_ROOT / "output"
DRAWINGS_DIR = OUTPUT_DIR / "drawings"
ANALYSIS_DIR = OUTPUT_DIR / "blueprint-analysis"
UPLOAD_DIR = OUTPUT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

# PDCA 進捗データ (メモリ内、再起動でリセット)
pdca_log = []


def add_pdca(phase: str, item: str, status: str = "in_progress"):
    pdca_log.append({
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "phase": phase,
        "item": item,
        "status": status,
    })


# 初期PDCA項目
add_pdca("Plan", "寸法線の端点ペアリング", "done")
add_pdca("Plan", "CAD色ベースレイヤー分類", "done")
add_pdca("Plan", "壁端点スナップ+接続グラフ", "done")
add_pdca("Plan", "引戸・折戸・開口検出", "done")
add_pdca("Plan", "部屋ポリゴン構築", "done")
add_pdca("Plan", "中心線計算修正", "done")
add_pdca("Plan", "JW_CAD重複テキスト除去", "done")
add_pdca("Check", "外壁形状の精度", "issue")
add_pdca("Check", "内壁位置のずれ", "issue")
add_pdca("Check", "カウンター等の什器検出", "issue")
add_pdca("Check", "斜め壁の対応", "issue")
add_pdca("Check", "線幅ベース壁判定の最適化", "issue")
add_pdca("Act", "比較ツール構築", "done")
add_pdca("Act", "ダッシュボード構築", "done")
add_pdca("Plan", "座標原点オフセット保存 (origin_offset_mm)", "done")
add_pdca("Do", "pdf-extract-vectors.py: to_json()に原点オフセット保存", "done")
add_pdca("Do", "compare-pdf-dxf.py: world_to_pixel()に原点オフセット加算", "done")
add_pdca("Check", "test15: オーバーレイ座標ズレ大幅改善 (2026-03-19)", "done")
add_pdca("Do", "スケール検出: COMMON_SCALES に1:60/1:40/1:75追加、CV<2%で実測値使用", "done")
add_pdca("Check", "test16: スケール1:50→1:60修正。全28投票がratio=60.0で一致 (2026-03-19)", "done")
add_pdca("Check", "座標変換は数学的に正しいことを検証。壁位置は0.3mm精度で正確", "done")
add_pdca("Do", "compare-pdf-dxf.py: PDF太線参照レイヤー追加 (灰色)", "done")
add_pdca("Do", "ページ範囲外壁フィルタ追加: 46→40壁 (偽壁6本除去)", "done")
add_pdca("Do", "モルフォロジーclose強化: 中間カーネル(21x21)追加", "done")
add_pdca("Check", "部屋ポリゴン: フラッドフィル方式の限界。ドア開口から部屋がマージ (2026-03-19)", "done")
add_pdca("Act", "室名テキストシード方式に全面書換え。BFS deque最適化 (2026-03-19)", "done")
add_pdca("Check", "test22: 部屋30室検出、ドア開口マージ解消、17秒で処理完了", "done")
add_pdca("Do", "部屋ポリゴン壁スナップ: 頂点→最寄り壁座標にスナップ+共線頂点除去", "done")
add_pdca("Do", "什器バリデーション: max3000mm、aspect<12、非什器KW(PS/EV等)除外 → 70→56什器", "done")
add_pdca("Do", "寸法線ペアリング修正: 全端点最遠→単一線best-match方式。全56寸法ratio=1.00", "done")
add_pdca("Do", "BFS面積制限(30m²)、不明室テキスト近傍マッチ、ポリゴン頂点マージ", "done")
add_pdca("Do", "モルフォロジー3段階close(9/21/35px)、面積閾値0.6m²", "done")
add_pdca("Check", "test29: 34室/40壁/56什器、avg5.9pts、寸法56/56一致、max30m²", "done")
add_pdca("Act", "壁レイキャスト方式導入: 室名→4方向レイ→壁hit→矩形ポリゴン (2026-03-19)", "done")
add_pdca("Check", "test30: 36室(24named)/max9.6m²/レイキャスト部屋は4pts矩形。巨大リーク解消", "done")
add_pdca("Act", "壁セグメントレイキャスト(ラスター→壁リスト)、適応min_wall_len、シードnudge", "done")
add_pdca("Check", "test37: レイキャスト限界→PDFグラフ閉路方式で突破", "done")
add_pdca("Act", "壁グラフ閉路: PDF太線753ノード→最小閉路46個→エリア部屋ポリゴン置換", "done")
add_pdca("Check", "test39: エリア35㎡=17.3m²(49%),21.8㎡=7.9(36%),20.5㎡=7.3(36%) 全3-9倍改善", "done")
add_pdca("Do", "壁検出精度改善: ラスター壁救済(キャップ付き), BFS壁マスク強化, Quad bezier対応 (2026-03-20)", "done")
add_pdca("Do", "ポリゴン自己交差除去+幾何学的救済, ラスター壁検証再有効化 (2026-03-20)", "done")
add_pdca("Do", "compare-pdf-dxf.py修正, sankei59ゴールデン登録, 室名判定改善(58%→100%) (2026-03-20)", "done")
add_pdca("Check", "test42: ChloeBY walls=44, rooms=32, named=32(100%), fixtures=48 (2026-03-20)", "done")


@app.route("/")
def index():
    return HTML_TEMPLATE


@app.route("/api/files")
def list_files():
    """出力ファイル一覧"""
    files = {"drawings": [], "analysis": [], "uploads": []}

    for f in sorted(DRAWINGS_DIR.glob("*")):
        if f.is_file():
            files["drawings"].append({
                "name": f.name,
                "size": f.stat().st_size,
                "ext": f.suffix,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
            })

    for f in sorted(ANALYSIS_DIR.glob("*.json")):
        files["analysis"].append({
            "name": f.name,
            "size": f.stat().st_size,
            "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
        })

    for f in sorted(UPLOAD_DIR.glob("*.pdf")):
        files["uploads"].append({
            "name": f.name,
            "size": f.stat().st_size,
            "mtime": datetime.fromtimestamp(f.stat().st_mtime).strftime("%m/%d %H:%M"),
        })

    return jsonify(files)


@app.route("/api/analysis/<name>")
def get_analysis(name):
    """分析JSON取得"""
    path = ANALYSIS_DIR / name
    if path.exists():
        with open(path, encoding="utf-8") as f:
            return jsonify(json.load(f))
    return jsonify({"error": "not found"}), 404


@app.route("/api/pdca")
def get_pdca():
    """PDCA進捗"""
    return jsonify(pdca_log)


@app.route("/api/pdca", methods=["POST"])
def add_pdca_entry():
    """PDCA項目追加"""
    data = request.json
    add_pdca(data.get("phase", ""), data.get("item", ""), data.get("status", "in_progress"))
    return jsonify({"ok": True})


@app.route("/file/<path:filepath>")
def serve_file(filepath):
    """出力ファイルを配信"""
    full = OUTPUT_DIR / filepath
    if full.exists() and full.is_file():
        return send_file(full)
    return "Not found", 404


@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    """PDFアップロード → パイプライン実行"""
    if "file" not in request.files:
        return jsonify({"error": "ファイルがありません"}), 400

    file = request.files["file"]
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "PDFファイルのみ対応"}), 400

    # 保存
    safe_name = file.filename.replace(" ", "_")
    save_path = UPLOAD_DIR / safe_name
    file.save(str(save_path))

    stem = Path(safe_name).stem
    json_out = ANALYSIS_DIR / f"{stem}.json"
    dxf_out = DRAWINGS_DIR / f"{stem}.dxf"

    add_pdca("Do", f"PDF抽出開始: {safe_name}", "in_progress")

    # Step 1: PDF → JSON
    try:
        r1 = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "scripts" / "pdf-extract-vectors.py"),
             str(save_path), "--pretty", "-o", str(json_out)],
            capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace"
        )
        extract_output = r1.stderr + r1.stdout
    except Exception as e:
        add_pdca("Check", f"PDF抽出エラー: {e}", "issue")
        return jsonify({"error": str(e)}), 500

    # Step 2: JSON → DXF
    try:
        r2 = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "scripts" / "gen-dxf.py"),
             "--json", str(json_out), "-o", str(dxf_out)],
            capture_output=True, text=True, timeout=120, encoding="utf-8", errors="replace"
        )
    except Exception as e:
        add_pdca("Check", f"DXF生成エラー: {e}", "issue")
        return jsonify({"error": str(e)}), 500

    # Step 3: 比較画像生成
    compare_out = DRAWINGS_DIR / f"{stem}_compare.png"
    try:
        r3 = subprocess.run(
            [sys.executable, str(PROJECT_ROOT / "scripts" / "compare-pdf-dxf.py"),
             str(save_path), str(dxf_out), "-o", str(compare_out)],
            capture_output=True, text=True, timeout=180, encoding="utf-8", errors="replace"
        )
    except Exception:
        pass  # 比較画像は失敗しても続行

    # Step 4: DXFプレビュー画像
    preview_path = DRAWINGS_DIR / f"{stem}_preview.png"
    try:
        subprocess.run(
            [sys.executable, "-c", f"""
import ezdxf, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
doc = ezdxf.readfile(r'{dxf_out}')
fig, ax = plt.subplots(figsize=(16,16), dpi=150)
ax.set_aspect('equal')
ctx = RenderContext(doc)
Frontend(ctx, MatplotlibBackend(ax)).draw_layout(doc.modelspace())
fig.savefig(r'{preview_path}', bbox_inches='tight', facecolor='white')
"""],
            capture_output=True, text=True, timeout=120
        )
    except Exception:
        pass

    # Step 5: 元PDF画像化
    orig_img_path = DRAWINGS_DIR / f"{stem}_original.png"
    try:
        subprocess.run(
            [sys.executable, "-c", f"""
import fitz
doc = fitz.open(r'{save_path}')
page = doc[0]
pix = page.get_pixmap(matrix=fitz.Matrix(2,2))
pix.save(r'{orig_img_path}')
doc.close()
"""],
            capture_output=True, text=True, timeout=60
        )
    except Exception:
        pass

    add_pdca("Do", f"パイプライン完了: {safe_name}", "done")

    # 分析結果を返す
    result = {"status": "ok", "files": {}}
    if json_out.exists():
        with open(json_out, encoding="utf-8") as f:
            result["analysis"] = json.load(f)
        result["files"]["json"] = f"blueprint-analysis/{stem}.json"
    if dxf_out.exists():
        result["files"]["dxf"] = f"drawings/{stem}.dxf"
    if preview_path.exists():
        result["files"]["preview"] = f"drawings/{stem}_preview.png"
    if orig_img_path.exists():
        result["files"]["original"] = f"drawings/{stem}_original.png"
    if (DRAWINGS_DIR / f"{stem}_compare_overlay.png").exists():
        result["files"]["overlay"] = f"drawings/{stem}_compare_overlay.png"
    if (DRAWINGS_DIR / f"{stem}_compare_sidebyside.png").exists():
        result["files"]["sidebyside"] = f"drawings/{stem}_compare_sidebyside.png"

    result["log"] = extract_output

    return jsonify(result)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PDF-DXF Pipeline Dashboard</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, sans-serif; background: #0d1117; color: #c9d1d9; }
.header { background: #161b22; padding: 12px 16px; border-bottom: 1px solid #30363d; display: flex; align-items: center; gap: 12px; }
.header h1 { font-size: 18px; color: #58a6ff; }
.header .badge { background: #238636; color: #fff; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
.tabs { display: flex; background: #161b22; border-bottom: 1px solid #30363d; overflow-x: auto; }
.tab { padding: 10px 16px; cursor: pointer; color: #8b949e; border-bottom: 2px solid transparent; white-space: nowrap; font-size: 14px; }
.tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }
.content { padding: 16px; max-width: 1200px; margin: 0 auto; }
.card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
.card-header { padding: 12px 16px; border-bottom: 1px solid #30363d; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
.card-body { padding: 16px; }
.upload-zone { border: 2px dashed #30363d; border-radius: 8px; padding: 32px; text-align: center; cursor: pointer; transition: border-color 0.2s; }
.upload-zone:hover, .upload-zone.dragover { border-color: #58a6ff; background: #161b2280; }
.upload-zone input { display: none; }
.btn { background: #238636; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
.btn:hover { background: #2ea043; }
.btn:disabled { background: #21262d; color: #484f58; cursor: not-allowed; }
.btn-blue { background: #1f6feb; }
.btn-blue:hover { background: #388bfd; }
.img-container { position: relative; overflow: auto; max-height: 70vh; border: 1px solid #30363d; border-radius: 4px; background: #0d1117; }
.img-container img { max-width: 100%; display: block; }
.compare-toggle { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.compare-toggle .btn { font-size: 12px; padding: 6px 12px; }
.compare-toggle .btn.active { outline: 2px solid #58a6ff; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; }
th { color: #8b949e; font-weight: 500; }
.status-done { color: #3fb950; }
.status-issue { color: #f85149; }
.status-in_progress { color: #d29922; }
.pdca-phase { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.pdca-Plan { background: #1f6feb20; color: #58a6ff; }
.pdca-Do { background: #23863620; color: #3fb950; }
.pdca-Check { background: #f8514920; color: #f85149; }
.pdca-Act { background: #d2992220; color: #d29922; }
.summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.summary-item { text-align: center; padding: 16px 8px; background: #21262d; border-radius: 8px; }
.summary-item .num { font-size: 28px; font-weight: 700; color: #58a6ff; }
.summary-item .label { font-size: 12px; color: #8b949e; margin-top: 4px; }
.warning { background: #f8514915; border-left: 3px solid #f85149; padding: 8px 12px; margin: 4px 0; font-size: 13px; border-radius: 0 4px 4px 0; }
.log-box { background: #0d1117; border: 1px solid #30363d; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
.loading { display: inline-block; width: 16px; height: 16px; border: 2px solid #30363d; border-top-color: #58a6ff; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.file-list { max-height: 300px; overflow-y: auto; }
.file-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #21262d; font-size: 13px; }
.file-item a { color: #58a6ff; text-decoration: none; }
.file-size { color: #8b949e; font-size: 11px; }
@media (max-width: 600px) {
  .summary-grid { grid-template-columns: repeat(3, 1fr); }
  .compare-toggle { flex-wrap: wrap; }
}
</style>
</head>
<body>

<div class="header">
  <h1>PDF-DXF Pipeline</h1>
  <span class="badge" id="statusBadge">READY</span>
  <span style="margin-left:auto; font-size:12px; color:#8b949e;" id="clock"></span>
</div>

<div class="tabs" id="tabs">
  <div class="tab active" data-tab="compare">比較検証</div>
  <div class="tab" data-tab="upload">PDFテスト</div>
  <div class="tab" data-tab="pdca">PDCA進捗</div>
  <div class="tab" data-tab="files">ファイル</div>
</div>

<div class="content">

<!-- 比較検証タブ -->
<div id="tab-compare" class="tab-content">
  <div class="card">
    <div class="card-header">
      比較表示
      <select id="compareSelect" style="background:#21262d;color:#c9d1d9;border:1px solid #30363d;padding:4px 8px;border-radius:4px;">
        <option value="">-- ファイル選択 --</option>
      </select>
    </div>
    <div class="card-body">
      <div class="compare-toggle" id="compareToggle">
        <button class="btn btn-blue active" data-view="overlay">重ね合わせ</button>
        <button class="btn btn-blue" data-view="sidebyside">並列比較</button>
        <button class="btn btn-blue" data-view="original">元PDF</button>
        <button class="btn btn-blue" data-view="dxf">DXF出力</button>
        <button class="btn btn-blue" data-view="perse">パース</button>
      </div>
      <div class="img-container" id="compareView">
        <p style="padding:40px;text-align:center;color:#8b949e;">ファイルを選択してください</p>
      </div>
    </div>
  </div>

  <div class="card" id="summaryCard" style="display:none;">
    <div class="card-header">抽出サマリー</div>
    <div class="card-body">
      <div class="summary-grid" id="summaryGrid"></div>
      <div id="warningsList" style="margin-top:12px;"></div>
    </div>
  </div>
</div>

<!-- PDFテストタブ -->
<div id="tab-upload" class="tab-content" style="display:none;">
  <div class="card">
    <div class="card-header">テストPDFアップロード</div>
    <div class="card-body">
      <div class="upload-zone" id="uploadZone">
        <input type="file" id="fileInput" accept=".pdf">
        <p style="font-size:16px; margin-bottom:8px;">PDFをドラッグ＆ドロップ</p>
        <p style="color:#8b949e;">またはタップしてファイルを選択</p>
      </div>
      <div id="uploadProgress" style="margin-top:12px; display:none;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="loading"></div>
          <span id="uploadStatus">処理中...</span>
        </div>
      </div>
      <div id="uploadResult" style="margin-top:12px;"></div>
    </div>
  </div>

  <div class="card" id="uploadLogCard" style="display:none;">
    <div class="card-header">実行ログ</div>
    <div class="card-body">
      <div class="log-box" id="uploadLog"></div>
    </div>
  </div>
</div>

<!-- PDCAタブ -->
<div id="tab-pdca" class="tab-content" style="display:none;">
  <div class="card">
    <div class="card-header">
      PDCA 改善トラッカー
      <button class="btn" onclick="addPdcaPrompt()" style="font-size:12px;padding:4px 10px;">+ 追加</button>
    </div>
    <div class="card-body">
      <table>
        <thead><tr><th>時刻</th><th>Phase</th><th>項目</th><th>状態</th></tr></thead>
        <tbody id="pdcaTable"></tbody>
      </table>
    </div>
  </div>
</div>

<!-- ファイルタブ -->
<div id="tab-files" class="tab-content" style="display:none;">
  <div class="card">
    <div class="card-header">出力ファイル</div>
    <div class="card-body file-list" id="fileList"></div>
  </div>
</div>

</div>

<script>
// タブ切り替え
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).style.display = 'block';
  });
});

// 時計
setInterval(() => {
  document.getElementById('clock').textContent = new Date().toLocaleString('ja-JP');
}, 1000);

// 比較表示
let currentProject = '';
let currentView = 'overlay';

document.getElementById('compareToggle').addEventListener('click', e => {
  if (e.target.dataset.view) {
    currentView = e.target.dataset.view;
    document.querySelectorAll('#compareToggle .btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    updateCompareView();
  }
});

document.getElementById('compareSelect').addEventListener('change', e => {
  currentProject = e.target.value;
  updateCompareView();
  loadSummary(currentProject);
});

function updateCompareView() {
  const container = document.getElementById('compareView');
  if (!currentProject) {
    container.innerHTML = '<p style="padding:40px;text-align:center;color:#8b949e;">ファイルを選択してください</p>';
    return;
  }
  const stem = currentProject;
  const viewMap = {
    overlay: `drawings/${stem}_compare_overlay.png`,
    sidebyside: `drawings/${stem}_compare_sidebyside.png`,
    original: `drawings/${stem}_original.png`,
    dxf: `drawings/${stem}_preview.png`,
    perse: `drawings/${stem}.png`,
  };
  const src = viewMap[currentView];
  container.innerHTML = `<img src="/file/${src}" onerror="this.parentElement.innerHTML='<p style=\\'padding:40px;text-align:center;color:#f85149;\\'>画像なし</p>'" style="cursor:zoom-in;" onclick="this.style.maxWidth=this.style.maxWidth==='none'?'100%':'none'">`;
}

function loadSummary(stem) {
  fetch(`/api/analysis/${stem}.json`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) { document.getElementById('summaryCard').style.display='none'; return; }
      document.getElementById('summaryCard').style.display='block';
      const s = data.pass1_summary || {};
      const grid = document.getElementById('summaryGrid');
      grid.innerHTML = [
        ['壁', s.total_walls],
        ['ドア', s.total_doors],
        ['引戸', s.total_sliding_doors],
        ['窓', s.total_windows],
        ['開口', s.total_openings],
        ['什器', s.total_fixtures],
        ['部屋', s.total_rooms],
        ['寸法', s.total_dimensions_total],
        ['信頼度', (data.confidence * 100).toFixed(0) + '%'],
      ].map(([label, num]) =>
        `<div class="summary-item"><div class="num">${num||0}</div><div class="label">${label}</div></div>`
      ).join('');

      const wl = document.getElementById('warningsList');
      wl.innerHTML = (data.warnings || []).map(w =>
        `<div class="warning">${w}</div>`
      ).join('') || '<p style="color:#3fb950;">警告なし</p>';
    });
}

// ファイル一覧読み込み
function loadFiles() {
  fetch('/api/files').then(r => r.json()).then(data => {
    // 比較セレクトボックス更新
    const select = document.getElementById('compareSelect');
    const stems = new Set();
    data.analysis.forEach(f => stems.add(f.name.replace('.json', '')));
    const current = select.value;
    select.innerHTML = '<option value="">-- 選択 --</option>';
    stems.forEach(s => {
      select.innerHTML += `<option value="${s}" ${s===current?'selected':''}>${s}</option>`;
    });

    // ファイルリスト
    const list = document.getElementById('fileList');
    const allFiles = [
      ...data.drawings.map(f => ({...f, dir: 'drawings'})),
      ...data.analysis.map(f => ({...f, dir: 'blueprint-analysis'})),
    ].sort((a, b) => b.mtime.localeCompare(a.mtime));

    list.innerHTML = allFiles.slice(0, 50).map(f => {
      const sizeStr = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+'MB' : (f.size/1024).toFixed(0)+'KB';
      return `<div class="file-item">
        <a href="/file/${f.dir}/${f.name}" target="_blank">${f.name}</a>
        <span><span class="file-size">${sizeStr}</span> <span class="file-size">${f.mtime}</span></span>
      </div>`;
    }).join('');
  });
}

// PDFアップロード
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files[0]) uploadPDF(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadPDF(fileInput.files[0]); });

function uploadPDF(file) {
  const progress = document.getElementById('uploadProgress');
  const status = document.getElementById('uploadStatus');
  const result = document.getElementById('uploadResult');
  const logCard = document.getElementById('uploadLogCard');

  progress.style.display = 'block';
  result.innerHTML = '';
  logCard.style.display = 'none';
  status.textContent = `${file.name} を処理中... (1-2分かかります)`;
  document.getElementById('statusBadge').textContent = 'PROCESSING';
  document.getElementById('statusBadge').style.background = '#d29922';

  const formData = new FormData();
  formData.append('file', file);

  fetch('/api/upload', { method: 'POST', body: formData })
    .then(r => r.json())
    .then(data => {
      progress.style.display = 'none';
      document.getElementById('statusBadge').textContent = 'READY';
      document.getElementById('statusBadge').style.background = '#238636';

      if (data.error) {
        result.innerHTML = `<div class="warning">${data.error}</div>`;
        return;
      }

      const links = Object.entries(data.files || {}).map(([k, v]) =>
        `<a href="/file/${v}" target="_blank" class="btn btn-blue" style="margin:4px;font-size:12px;">${k}</a>`
      ).join('');
      result.innerHTML = `<p style="color:#3fb950;margin-bottom:8px;">完了!</p>${links}`;

      if (data.log) {
        logCard.style.display = 'block';
        document.getElementById('uploadLog').textContent = data.log;
      }

      // ファイル一覧更新 & 比較表示に自動切り替え
      loadFiles();
      setTimeout(() => {
        const stem = file.name.replace('.pdf','').replace(/ /g,'_');
        document.getElementById('compareSelect').value = stem;
        currentProject = stem;
        updateCompareView();
        loadSummary(stem);
        document.querySelector('[data-tab="compare"]').click();
      }, 500);
    })
    .catch(err => {
      progress.style.display = 'none';
      result.innerHTML = `<div class="warning">エラー: ${err}</div>`;
      document.getElementById('statusBadge').textContent = 'ERROR';
      document.getElementById('statusBadge').style.background = '#f85149';
    });
}

// PDCA読み込み
function loadPDCA() {
  fetch('/api/pdca').then(r => r.json()).then(data => {
    const tbody = document.getElementById('pdcaTable');
    tbody.innerHTML = data.reverse().map(d =>
      `<tr>
        <td style="font-size:11px;color:#8b949e;">${d.time.split(' ')[1]}</td>
        <td><span class="pdca-phase pdca-${d.phase}">${d.phase}</span></td>
        <td>${d.item}</td>
        <td class="status-${d.status}">${d.status === 'done' ? '完了' : d.status === 'issue' ? '要対応' : '進行中'}</td>
      </tr>`
    ).join('');
  });
}

function addPdcaPrompt() {
  const phase = prompt('Phase (Plan/Do/Check/Act):');
  const item = prompt('項目:');
  if (phase && item) {
    fetch('/api/pdca', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({phase, item, status: 'in_progress'})
    }).then(() => loadPDCA());
  }
}

// 初期読み込み
loadFiles();
loadPDCA();

// ChloeBY_test4をデフォルト選択
setTimeout(() => {
  const sel = document.getElementById('compareSelect');
  if (sel.querySelector('option[value="ChloeBY_test4"]')) {
    sel.value = 'ChloeBY_test4';
    currentProject = 'ChloeBY_test4';
    updateCompareView();
    loadSummary('ChloeBY_test4');
  }
}, 1000);
</script>
</body>
</html>"""


if __name__ == "__main__":
    print("=" * 50)
    print("PDF-DXF Pipeline Dashboard")
    print("=" * 50)
    print(f"Local:     http://localhost:3002")
    print(f"Tailscale: http://100.110.33.34:3002")
    print(f"Project:   {PROJECT_ROOT}")
    print("=" * 50)
    app.run(host="0.0.0.0", port=3002, debug=False)
