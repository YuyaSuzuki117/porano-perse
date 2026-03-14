---
paths:
  - "src/components/three/**/*.{ts,tsx}"
---

# Three.js / React Three Fiber コンポーネントルール

## パフォーマンス必須
- `React.memo()` で不要な再レンダリング防止
- ジオメトリ・マテリアルはコンポーネント外で定義（再生成防止）
- `useFrame` 内で `setState` 禁止 — ref経由で直接操作
- テクスチャはCanvas APIプロシージャル生成（AI画像生成API禁止）

## 型安全
- ref は常に型指定: `useRef<THREE.Mesh>(null)`
- props に interface 定義必須
- `any` 禁止 → `unknown` + 型ガード

## パターン
```tsx
const geometry = new THREE.BoxGeometry(1, 1, 1) // コンポーネント外

export const MyMesh = React.memo(({ position }: Props) => {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.01
  })
  return <mesh ref={meshRef} geometry={geometry} position={position} />
})
```

## 禁止事項
- MeshReflectorMaterial（WebGLシェーダーエラー）→ meshPhysicalMaterial + envMapIntensity
- useFrame内でのnew演算子（GC負荷）
- 未disposeのテクスチャ/ジオメトリ（メモリリーク）
