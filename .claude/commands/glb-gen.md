GLBモデルを生成/更新: $ARGUMENTS

手順:

1. **現状確認**
   - `scripts/gen-glb.mjs` を読み、既存モデル一覧を把握
   - `public/models/` の既存GLBファイルを確認

2. **モデル追加/修正**
   - `scripts/gen-glb.mjs` にジオメトリ定義を追加
   - Three.js のプリミティブ（Box, Cylinder, Sphere等）を組み合わせ
   - リアルなプロポーションを意識（実寸法をメートル単位で）

3. **生成実行**
   ```bash
   cd C:/Users/LENOVO/Projects/porano-perse && node scripts/gen-glb.mjs
   ```

4. **カタログ連携**
   - `src/data/furniture.ts` のエントリと modelId を対応
   - `src/lib/gltf-loader.ts` のマッピング確認

5. **動作確認**
   - dev server で3Dシーンにモデルが表示されることを確認
   - Playwright MCP でスクリーンショット取得

注意: GLBはraw バイナリ生成（Three.js GLTFExporter はNode.jsで使えない）
