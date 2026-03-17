全品質チェックを実行（デプロイ前推奨）

以下を順に実行し、結果をテーブル形式で報告:

1. **TypeScript型チェック**
   ```bash
   cd C:/Users/LENOVO/Projects/porano-perse && npx tsc --noEmit --pretty 2>&1
   ```

2. **ESLint**
   ```bash
   cd C:/Users/LENOVO/Projects/porano-perse && npm run lint 2>&1
   ```

3. **ビルド**
   ```bash
   cd C:/Users/LENOVO/Projects/porano-perse && npm run build 2>&1
   ```

4. **結果報告**

| チェック | 結果 | エラー数 |
|---------|------|---------|
| TypeScript | ✅/❌ | N |
| ESLint | ✅/❌ | N |
| Build | ✅/❌ | N |

エラーがあれば修正提案を添える。全パスなら「デプロイ可能」と報告。
