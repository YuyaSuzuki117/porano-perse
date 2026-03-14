---
paths:
  - "src/components/floor-plan/**/*.{ts,tsx}"
---

# 2D図面エディタルール

## 座標系
- 2D: (x, y) — Canvasピクセル座標
- 3D変換時: 2D の y → 3D の z（y/zスワップ）
- 壁データ: WallSegment[] が Single Source of Truth

## Canvas描画
- requestAnimationFrame でレンダリングループ
- オフスクリーンCanvas でテクスチャキャッシュ
- DPI対応: `window.devicePixelRatio` 考慮

## 2D/3D同期
- 図面変更 → useEditorStore更新 → 3Dシーン自動再レンダリング
- 逆方向（3D→2D）の変更は禁止（Single Source of Truth維持）
