---
paths:
  - "src/data/**/*.ts"
---

# データカタログルール

## 家具・設備の追加手順
1. `src/data/furniture.ts` にエントリ追加（id, name, category, dimensions, materials）
2. `scripts/gen-glb.mjs` に対応ジオメトリ追加 → `node scripts/gen-glb.mjs` で GLB 生成
3. `src/lib/gltf-loader.ts` のモデルマッピング確認

## テンプレート追加
- `src/data/room-templates.ts` に追加
- 必ず AC（エアコン）を含める（全テンプレート共通ルール）
- 壁・ドア・窓の配置は WallSegment[] 形式

## スタイル追加
- `src/data/styles.ts` の STYLE_PALETTE に追加
- 対応テクスチャ・装飾・照明の全連携が必要（`/style-add` コマンド参照）

## 仕上げ材
- `src/data/finish-materials.ts` に追加
- PBR パラメータ（roughness, metalness）必須
- Canvas API テクスチャ生成関数を対応追加
