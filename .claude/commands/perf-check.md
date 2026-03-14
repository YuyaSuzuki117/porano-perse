3Dシーンのパフォーマンスを診断: $ARGUMENTS

以下を順に実行:

1. **ビルドサイズ分析**
   - `npm run build` を実行
   - .next/static のバンドルサイズ確認
   - Three.js関連の chunk サイズ特定

2. **ドローコール・ジオメトリ分析**
   - `src/components/three/` 全ファイルを走査
   - mesh/geometry/material の生成箇所をカウント
   - useFrame内のnew演算子を検出
   - 未memoのコンポーネントを列挙

3. **テクスチャメモリ分析**
   - Canvas APIテクスチャの解像度確認
   - dispose漏れの検出
   - 重複テクスチャ生成の検出

4. **改善提案**
   - 具体的なコード箇所と修正案を提示
   - 優先度: High/Medium/Low で分類

結果をテーブル形式でまとめて報告。
