新しいインテリアスタイルを追加: $ARGUMENTS

手順:

1. **既存スタイル構造を確認**
   - `src/data/styles.ts` のSTYLE_PALETTE読み取り
   - 既存9スタイルのパターン把握

2. **新スタイル定義**
   - `styles.ts` にスタイルパレット追加（primary/secondary/accent/metal/fabric）
   - PBR値設定（roughness/metalness）
   - 壁/床/天井テクスチャパラメータ

3. **テクスチャ対応**
   - `WallMeshGroup.tsx` — 壁テクスチャ分岐追加
   - `FloorMesh.tsx` — 床テクスチャ分岐追加
   - `CeilingMesh.tsx` — 天井テクスチャ分岐追加

4. **装飾・照明対応**
   - `WallDecorations.tsx` — 壁装飾パターン追加
   - `LightingRig.tsx` — 照明色温度追加
   - `Furniture.tsx` — 家具カラーマッピング追加
   - 腰壁/幅木/梁 の対応確認

5. **動作確認**
   - ControlPanelでスタイル選択可能か確認
   - Playwright MCPでスクリーンショット取得
