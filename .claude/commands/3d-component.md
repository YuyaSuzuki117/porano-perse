新しい3Dコンポーネントを作成: $ARGUMENTS

以下の手順で実装:

1. `src/components/three/` に新規ファイル作成
2. 既存コンポーネント（WallMeshGroup.tsx, Furniture.tsx等）のパターンに従う
3. 必須要素:
   - TypeScript interface でprops定義
   - React.memo でラップ
   - useRef<THREE.Mesh|Group> で参照
   - useFrame は必要な場合のみ
4. useEditorStore から必要なstateのみセレクタで取得
5. スタイル別の分岐は `data/styles.ts` のSTYLE_PALETTEを参照
6. Room.tsx に組み込む場合は適切な位置に追加

コンポーネント名が指定されていない場合はユーザーに確認。
