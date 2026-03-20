# /project-init — 案件プロジェクト初期化

新規案件のフォルダ構造とメタデータを自動生成する。

## 引数
- `$ARGUMENTS` — 案件名（例: `shibuya_bar`, `ginza_salon`）。省略時は対話で確認。

## 手順

### Step 1: 案件情報の確認
- 案件名（英語snake_case）
- クライアント名（日本語OK）
- 業種（バー/カフェ/サロン/レストラン/オフィス/その他）
- 概算面積（㎡）

### Step 2: フォルダ構造の作成
```
output/projects/<案件名>/
├── input/              # 図面・参考画像の入力
│   ├── blueprints/     # 設計図面 (PDF/画像)
│   └── references/     # 参考写真・イメージ
├── analysis/           # Gemini分析結果 (JSON)
├── dxf/                # 生成DXFファイル
├── blender/            # Blenderシーン (.blend)
├── renders/            # レンダリング出力 (.png)
│   ├── draft/          # ドラフト品質
│   └── final/          # 最終品質
├── deliverables/       # 納品用パッケージ
└── config.json         # 案件メタデータ
```

### Step 3: config.json の生成
```json
{
  "name": "<案件名>",
  "client": "<クライアント名>",
  "type": "<業種>",
  "area_m2": <面積>,
  "created": "<日付>",
  "status": "initialized",
  "rooms": [],
  "render_settings": {
    "quality": "preview",
    "resolution": [1920, 1080]
  }
}
```

### Step 4: 過去知見の参照
- `output/projects/*/lessons.md` から同業種の案件を検索
- 見つかった場合:
  - うまくいったマテリアル/カメラ設定を表示
  - 推奨スタイルJSON、カスタムモデルを提案
  - 過去の失敗パターンを警告
- 見つからない場合: 「この業種は初案件です」と報告

### Step 5: 完了報告
- 作成したフォルダ構造を表示
- 過去知見があれば推奨設定を表示
- 次のステップを案内:「図面を `input/blueprints/` に配置して `/blueprint-to-dxf` を実行」
