---
paths:
  - "src/stores/**/*.ts"
---

# Zustand ストアルール

## 命名
- ファイル: `use{Name}Store.ts`
- エクスポート: `export const use{Name}Store = create(...)`

## セレクタ必須
```typescript
// ✅ 個別セレクタ（必要なstateだけ購読）
const walls = useEditorStore(s => s.walls)
const setWalls = useEditorStore(s => s.setWalls)

// ❌ ストア全体（全プロパティ変更で再レンダリング）
const store = useEditorStore()
```

## アクション定義
- set/get をクロージャで使用
- 複雑なロジックはアクション内に閉じ込める
- コンポーネントにビジネスロジックを書かない
