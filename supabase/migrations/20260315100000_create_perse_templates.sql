CREATE TABLE IF NOT EXISTS perse_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  author_id UUID REFERENCES auth.users(id),
  author_name TEXT DEFAULT 'Anonymous',
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- cafe, restaurant, office, medical, retail, bar, hotel, gym
  data JSONB NOT NULL,
  thumbnail TEXT,
  downloads INT DEFAULT 0,
  likes INT DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE perse_templates ENABLE ROW LEVEL SECURITY;

-- 公開テンプレートは誰でも読める
CREATE POLICY "Public templates are viewable by everyone"
  ON perse_templates FOR SELECT
  USING (is_public = true);

-- 認証済みユーザーは自分のテンプレートを作成できる
CREATE POLICY "Authenticated users can insert templates"
  ON perse_templates FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- 自分のテンプレートを更新できる
CREATE POLICY "Users can update own templates"
  ON perse_templates FOR UPDATE
  USING (auth.uid() = author_id);

-- 自分のテンプレートを削除できる
CREATE POLICY "Users can delete own templates"
  ON perse_templates FOR DELETE
  USING (auth.uid() = author_id);

-- インデックス
CREATE INDEX idx_perse_templates_category ON perse_templates(category);
CREATE INDEX idx_perse_templates_downloads ON perse_templates(downloads DESC);
CREATE INDEX idx_perse_templates_created_at ON perse_templates(created_at DESC);
