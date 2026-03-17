設計図面・平面図をGemini Vision APIで分析し、Blenderパース制作用の構造化データを生成する。

## 引数
- `$ARGUMENTS`: 図面画像のパス（複数可、スペース区切り）

## 手順

### 1. 図面画像の確認
- 指定されたパスの画像ファイルをReadツールで表示確認
- 対応形式: PNG, JPG, PDF（PDFは各ページ読み取り）
- 画像がない場合はユーザーにパスを確認

### 2. Gemini Vision API で図面分析
- `src/app/api/ai/` の既存Gemini連携を参考にAPIコールを構築
- 分析対象:

| 項目 | 抽出内容 |
|------|----------|
| **部屋寸法** | 幅×奥行×天井高（mm単位） |
| **壁構造** | 各壁の位置・厚み・仕上げ材 |
| **開口部** | ドア・窓の位置・サイズ・種類 |
| **造作物** | カウンター・棚・固定什器の位置と寸法 |
| **設備** | エアコン・照明器具・コンセント位置 |
| **床仕上げ** | 素材・パターン・段差 |
| **天井** | 高さ変化・梁・ダウンライト位置 |
| **注記** | 図面上のテキスト・寸法線・記号 |

### 3. 構造化JSONの生成
分析結果を以下の形式で `output/blueprint-analysis/` に保存:

```json
{
  "project_name": "案件名",
  "analyzed_at": "ISO日時",
  "source_files": ["図面パス"],
  "room": {
    "width_mm": 0,
    "depth_mm": 0,
    "ceiling_height_mm": 2700,
    "floor_area_m2": 0
  },
  "walls": [
    {
      "id": "wall_N",
      "start": [x, y],
      "end": [x, y],
      "height_mm": 2700,
      "thickness_mm": 120,
      "finish": "クロス白",
      "openings": [
        {
          "type": "door|window|opening",
          "position_mm": 0,
          "width_mm": 900,
          "height_mm": 2100,
          "sill_height_mm": 0,
          "detail": "片開きドア"
        }
      ]
    }
  ],
  "fixtures": [
    {
      "type": "counter|shelf|built_in",
      "name": "カウンター",
      "position": [x, y, z],
      "dimensions": [w, d, h],
      "material": "木目",
      "notes": ""
    }
  ],
  "furniture_suggestions": [
    {
      "type": "table|chair|sofa|...",
      "position": [x, y],
      "count": 1,
      "notes": "4人掛け"
    }
  ],
  "lighting": {
    "ceiling_lights": [],
    "natural_light_direction": "南",
    "notes": ""
  },
  "floor": {
    "material": "フローリング",
    "pattern": "ヘリンボーン",
    "color": "ナチュラルオーク"
  },
  "style_hints": "モダン和風",
  "notes": "追加情報"
}
```

### 4. Claude Codeパース制作用プロンプト生成
分析JSONを基に、Claude Codeがそのまま使えるBlenderパース制作プロンプトを生成:

```
output/blueprint-analysis/{project_name}_prompt.md
```

プロンプトテンプレート:
```
## パース制作指示: {project_name}

### 部屋構造
- 幅: {width}mm × 奥行: {depth}mm × 天井高: {ceiling_height}mm
- 床面積: {area}m²

### 壁・開口部
{各壁の詳細、位置、開口部}

### 造作物・固定什器
{カウンター等の詳細}

### 床・天井
{仕上げ材の詳細}

### スタイル・マテリアル
{推奨スタイルとマテリアル設定}

### カメラ設定推奨
{部屋形状に最適なカメラアングル3案}

### 制作手順
1. room_builder.py で部屋ジオメトリ生成
2. 開口部の切り抜き
3. 造作物の配置
4. マテリアル適用
5. 照明セットアップ
6. カメラ配置
7. preview品質でテストレンダリング
```

### 5. 結果報告
- 分析JSONのパスを報告
- 制作プロンプトのパスを報告
- 主要な寸法・特徴を簡潔にサマリー
- 次のステップとして `/perse-from-blueprint` の実行を案内

### 注意事項
- 図面の縮尺が不明な場合はユーザーに確認
- 寸法線がある場合はそれを優先、ない場合はGeminiの推定値を使用（推定であることを明記）
- 複数階・複数部屋の場合は部屋ごとに分割してJSON生成
- AI API = 無料枠厳守（gemini-2.5-flash使用）
