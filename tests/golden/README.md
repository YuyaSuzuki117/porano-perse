# ゴールドスタンダード (回帰テスト用)

PDF→DXF パイプラインの回帰テスト用正解データ。

## 使い方

### ゴールドスタンダードの追加
1. `pdf-extract-vectors.py` で抽出したJSONの品質を目視確認
2. 「これが正解」と判断したら:
   ```bash
   cp output/blueprint-analysis/ChloeBY_test13.json tests/golden/ChloeBY.json
   ```
3. `registry.json` にメタデータを追加

### 回帰テストの実行
```bash
python scripts/regression-test.py
```

### registry.json の構造
```json
{
  "golden_standards": [
    {
      "name": "ChloeBY",
      "json": "ChloeBY.json",
      "pdf": "C:/Users/y-suz/OneDrive/デスクトップ/ChloeBY展開図‗見積用20251202 2.pdf",
      "page": 0,
      "expected": {
        "walls": 31,
        "rooms": 27,
        "named_rooms": 25,
        "fixtures": 14
      },
      "tolerance": {
        "walls": 3,
        "rooms": 5,
        "fixtures": 5
      },
      "approved_by": "鈴木",
      "approved_date": "2026-03-19",
      "notes": "test13ベース。壁マスク増強・PS分割済み"
    }
  ]
}
```
