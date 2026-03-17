# PCB セットアップガイド — Porano Perse (Blender パース制作)

> このPCでBlenderパース制作を行うための環境構築手順

## 1. 必須インストール

### Blender 5.0.1
- **ダウンロード**: https://www.blender.org/download/
- **バージョン**: 5.0.1 以上（5.0 API必須 — `handle_left_type`等の新API使用）
- **インストール先**: デフォルト（`C:\Program Files\Blender Foundation\Blender 5.0\`）
- **GPU**: NVIDIA GPU推奨（OPTIX対応ならレンダリング大幅高速化）
  - CUDA対応: GTX 10xx以上
  - OPTIX対応: RTX 20xx以上（推奨）

### Git
- https://git-scm.com/download/win
- Git LFS も有効化: `git lfs install`

### Node.js 22.x (LTS)
- https://nodejs.org/
- Next.jsアプリのビルド・開発サーバーに必要

### Python 3.12
- https://www.python.org/downloads/
- Blender外のスクリプト実行用（PDF変換等）
- pip パッケージ: `pip install PyMuPDF`（図面PDF→画像変換用）

### Claude Code (CLI)
- `npm install -g @anthropic-ai/claude-code`
- 認証: `claude auth`

### VS Code（推奨）
- Blenderスクリプト編集用

## 2. リポジトリのクローンとセットアップ

```bash
# クローン
git clone https://github.com/YuyaSuzuki117/porano-perse.git
cd porano-perse

# npm依存関係（Webアプリ側）
npm install

# 動作確認
npm run dev          # → localhost:3001
npx tsc --noEmit     # 型チェック
```

## 3. output/ フォルダの転送（Git外）

`output/` は `.gitignore` で除外されているため、手動転送が必要:

```
output/
├── hostclub/              ← ホストクラブ案件 (.blend + .png)
├── projects/              ← 統合済み過去案件
│   ├── daikanyama_null_bar/  ← 代官山NULLバー
│   ├── restaurant_4zone/     ← 飲食店4区画
│   └── store_line_assets/    ← 店舗アセット集
├── backups/               ← Blender設定バックアップ
├── blueprint-analysis/    ← 図面分析結果（Chloe案件）
│   └── chloe/             ← PDF→PNG変換済み図面
└── scene-json/            ← テンプレートJSON
```

**転送方法（いずれか）:**
- USB/外付けHDD でフォルダごとコピー
- OneDrive/Google Drive 経由
- `scp` / `rsync`（LAN経由）

**サイズ**: 約 170MB

## 4. Blender の動作確認

```bash
# Blenderバージョン確認
"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" --version

# ホストクラブパースのテストレンダリング（preview品質, 約2-3分）
"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe" \
  --background --python scripts/render-hostclub.py \
  -- --quality preview --camera main

# 結果確認: output/hostclub/hostclub_main.png
```

## 5. Claude Code の設定

```bash
# プロジェクトディレクトリで起動
cd porano-perse
claude

# 初回起動時にCLAUDE.mdを自動読み込み
# Blenderパース制作用のスラッシュコマンドが使える:
#   /blender-render      - レンダリング実行
#   /blueprint-analyze   - 図面分析
#   /perse-from-blueprint - 図面→パース制作
#   /perse-iterate       - パース品質改善
#   /perse-quality-check - 品質チェック
```

## 6. プロジェクト構造（重要ファイル）

```
scripts/
├── render-hostclub.py         ← ホストクラブ案件レンダラー
├── render-template.py         ← テンプレートベースレンダラー
├── render-daikanyama.py       ← 代官山NULLバー
├── render-deco-bar-v2.py      ← Art Decoバー
├── blender/                   ← Pythonモジュール群
│   ├── core.py                ← シーン初期化・座標変換
│   ├── room_builder.py        ← 壁・床・天井
│   ├── furniture_importer.py  ← GLBインポート
│   ├── lighting.py            ← 照明セットアップ
│   ├── cameras.py             ← カメラプリセット
│   ├── renderer.py            ← Cycles制御
│   ├── presets.py              ← 品質/カメラ/マテリアル標準プリセット
│   ├── blueprint_converter.py  ← 図面JSON→シーン変換器
│   ├── materials/             ← PBR 6種
│   └── models/                ← カスタム家具モデル 7種
├── run-blender-background.ps1 ← 背景実行ヘルパー
├── new-blender-job.ps1        ← 案件フォルダ雛形作成
└── apply-blender-optimization.ps1/.py ← Blender最適化

.claude/
├── commands/                  ← スラッシュコマンド 16個
├── rules/                     ← 自動適用ルール 10個
└── settings.json              ← フック（TypeScript型チェック + ESLint + Python構文チェック）
```

## 7. パース制作ワークフロー

### 新規案件の流れ
1. 要件を文章プロンプトで準備（図面より文章の方が精度が高い）
2. Claude Code で `/perse-from-blueprint` またはスクリプトを直接作成
3. `--quality preview` でテストレンダリング（32spp, ~2分）
4. `/perse-iterate` で反復改善
5. `--quality production` で最終レンダリング（256spp 4K, ~15分）

### コマンド例
```bash
# preview (確認用)
blender --background --python scripts/render-hostclub.py -- --quality preview --camera all

# production (最終)
blender --background --python scripts/render-hostclub.py -- --quality production --camera main
```

## 8. 鉄のルール

- **Blenderは必ず `--background` モード**（GUI不使用）
- **bmesh必須**（`bpy.ops.mesh.*` 禁止）
- **GPU自動検出**: OPTIX → CUDA → CPU フォールバック
- **天井・壁・床を最優先**、家具は後から差し替え
- **余計なものを入れない** — 図面/プロンプトにないものは作らない
- **AI APIは無料枠厳守** — gemini-2.5-flash のみ
- **パース制作指示は文章プロンプト優先** — 図面画像直読みより精度が高い

## 9. GPU性能目安

| GPU | preview (32spp) | draft (64spp) | production (256spp 4K) |
|-----|-----------------|----------------|----------------------|
| RTX 4090 | ~15秒 | ~30秒 | ~3分 |
| RTX 3070 | ~40秒 | ~1.5分 | ~8分 |
| RTX 2060 | ~1.5分 | ~3分 | ~15分 |
| CPU only | ~3分 | ~6分 | ~30分 |

## 10. トラブルシューティング

| 問題 | 対処 |
|------|------|
| `blender.exe` が見つからない | パスを確認。CLAUDE.mdの `## 4. Commands` 参照 |
| GPU検出失敗 | NVIDIAドライバ最新化。Blender設定→System→CUDA/OPTIX有効化 |
| Pythonモジュールエラー | `scripts/blender/__init__.py` の存在確認 |
| レンダリング画像が黒い | カメラの位置/回転確認。`visible_camera` 設定確認 |
| メモリ不足 | production品質のresolutionを下げる（2560x1440等） |
