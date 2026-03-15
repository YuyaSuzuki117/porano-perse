---
paths:
  - "src/components/three/**/*.{ts,tsx}"
  - "src/lib/**/*.{ts,tsx}"
  - "src/hooks/**/*.ts"
---

# WebGL / Three.js パフォーマンスルール

## メモリ管理
- テクスチャ・ジオメトリ・マテリアルは必ず `dispose()` する
- useEffect の cleanup で dispose を忘れない
- `useMemo` でジオメトリ/マテリアル生成をキャッシュ（依存配列を正確に）
- テクスチャキャッシュは `src/lib/texture-cache.ts` 経由で一元管理

## レンダリング最適化
- InstancedMesh: 同一ジオメトリの家具が5個以上なら InstancedMesh 使用
- LOD: カメラ距離に応じてジオメトリ詳細度を切り替え
- Frustum Culling: Three.js デフォルト有効を確認
- useFrame 内: 毎フレーム new 禁止、ref 経由で直接操作のみ

## バンドルサイズ
- Three.js は named import のみ: `import { BoxGeometry } from 'three'`
- `import * as THREE from 'three'` は型注釈以外禁止
- Drei のコンポーネントも個別 import

## モバイル制約
- quality: 'high' はモバイルで WebGL クラッシュ → デフォルト 'medium'
- postprocessing: モバイルでは SSAO/Bloom 無効化
- テクスチャ解像度: モバイルは最大 512x512
