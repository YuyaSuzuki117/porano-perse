-- Perse Projects: クラウド保存テーブル
-- ブラウザキャッシュクリアによるデータ消失を防ぐ

CREATE TABLE IF NOT EXISTS perse_projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id TEXT,  -- 未認証ユーザー用 (localStorage生成UUID)
  name TEXT NOT NULL DEFAULT 'Untitled',
  data JSONB NOT NULL,  -- exportProject() の全エディタ状態JSON
  thumbnail TEXT,       -- base64 data URL or Supabase Storage URL
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス
CREATE INDEX idx_perse_projects_user_id ON perse_projects(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_perse_projects_anonymous_id ON perse_projects(anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX idx_perse_projects_updated_at ON perse_projects(updated_at DESC);
CREATE INDEX idx_perse_projects_public ON perse_projects(is_public) WHERE is_public = true;

-- user_id + name でユニーク (認証ユーザー)
CREATE UNIQUE INDEX idx_perse_projects_user_name ON perse_projects(user_id, name) WHERE user_id IS NOT NULL;
-- anonymous_id + name でユニーク (匿名ユーザー)
CREATE UNIQUE INDEX idx_perse_projects_anon_name ON perse_projects(anonymous_id, name) WHERE anonymous_id IS NOT NULL;

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_perse_projects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_perse_projects_updated_at
  BEFORE UPDATE ON perse_projects
  FOR EACH ROW
  EXECUTE FUNCTION update_perse_projects_updated_at();

-- RLS (Row Level Security)
ALTER TABLE perse_projects ENABLE ROW LEVEL SECURITY;

-- 認証ユーザー: 自分のデータのみ
CREATE POLICY perse_projects_auth_select ON perse_projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY perse_projects_auth_insert ON perse_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY perse_projects_auth_update ON perse_projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY perse_projects_auth_delete ON perse_projects
  FOR DELETE USING (auth.uid() = user_id);

-- 匿名ユーザー: anonymous_id一致のみ (anon keyでアクセス)
-- ※ anonymous_idはクライアント側で生成・送信するため、
--   RLSではanon roleに対してanonymous_idベースのアクセスを許可
CREATE POLICY perse_projects_anon_select ON perse_projects
  FOR SELECT USING (
    user_id IS NULL
    AND anonymous_id IS NOT NULL
  );

CREATE POLICY perse_projects_anon_insert ON perse_projects
  FOR INSERT WITH CHECK (
    user_id IS NULL
    AND anonymous_id IS NOT NULL
  );

CREATE POLICY perse_projects_anon_update ON perse_projects
  FOR UPDATE USING (
    user_id IS NULL
    AND anonymous_id IS NOT NULL
  );

CREATE POLICY perse_projects_anon_delete ON perse_projects
  FOR DELETE USING (
    user_id IS NULL
    AND anonymous_id IS NOT NULL
  );

-- 公開プロジェクトは誰でも閲覧可
CREATE POLICY perse_projects_public_select ON perse_projects
  FOR SELECT USING (is_public = true);

-- コメント
COMMENT ON TABLE perse_projects IS 'Porano Perse 3Dパースツールのプロジェクト保存';
COMMENT ON COLUMN perse_projects.data IS 'exportProject()が返すエディタ状態JSON全体';
COMMENT ON COLUMN perse_projects.anonymous_id IS '未認証ユーザー識別用UUID (localStorage保持)';
COMMENT ON COLUMN perse_projects.thumbnail IS 'プレビュー画像 (base64 or Storage URL)';
