現在の作業コンテキストをメモリに保存（セッション中断対策）

手順:

1. **現在の作業状態を収集**
   - `git status` — 未コミット変更
   - `git log --oneline -n 5` — 直近のコミット
   - 現在取り組んでいるタスク/機能

2. **メモリファイルに保存**
   `~/.claude/projects/C--Users-LENOVO/memory/porano-perse-session.md` に以下を書き出す:

   ```markdown
   ---
   name: porano-perse-session
   description: Porano Perse 直近セッション状態（中断復帰用）
   type: project
   ---

   ## 最終作業日時: {現在日時}
   ## 作業内容: {取り組んでいた機能/タスク}
   ## 未完了事項: {残りのステップ}
   ## 変更ファイル: {変更したファイル一覧}
   ## 注意点: {次回セッションで知っておくべきこと}
   ```

3. **完了報告**
   「コンテキスト保存完了。次回セッションで自動参照されます。」

これにより `/clear` 後や新セッションでも状態復元が可能。
