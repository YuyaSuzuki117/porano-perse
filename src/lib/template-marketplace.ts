import { supabase } from './supabase';

export interface MarketplaceTemplate {
  id: string;
  author_id: string | null;
  author_name: string;
  name: string;
  description: string | null;
  category: string;
  data: Record<string, unknown>;
  thumbnail: string | null;
  downloads: number;
  likes: number;
  is_public: boolean;
  created_at: string;
}

export type TemplateCategory =
  | 'all'
  | 'cafe'
  | 'restaurant'
  | 'office'
  | 'medical'
  | 'retail'
  | 'bar'
  | 'hotel'
  | 'gym';

export type TemplateSortBy = 'popular' | 'newest' | 'downloads';

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  all: 'すべて',
  cafe: 'カフェ',
  restaurant: 'レストラン',
  office: 'オフィス',
  medical: '医療',
  retail: '小売',
  bar: 'バー',
  hotel: 'ホテル',
  gym: 'ジム',
};

export function getCategoryLabel(cat: TemplateCategory): string {
  return CATEGORY_LABELS[cat] || cat;
}

export function getAllCategories(): TemplateCategory[] {
  return Object.keys(CATEGORY_LABELS) as TemplateCategory[];
}

/**
 * 公開テンプレート一覧を取得
 */
export async function listTemplates(
  category?: TemplateCategory,
  sortBy: TemplateSortBy = 'popular'
): Promise<MarketplaceTemplate[]> {
  if (!supabase) return [];

  let query = supabase
    .from('perse_templates')
    .select('*')
    .eq('is_public', true);

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  switch (sortBy) {
    case 'popular':
      query = query.order('likes', { ascending: false });
      break;
    case 'newest':
      query = query.order('created_at', { ascending: false });
      break;
    case 'downloads':
      query = query.order('downloads', { ascending: false });
      break;
  }

  query = query.limit(50);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to list templates:', error.message);
    return [];
  }
  return (data as MarketplaceTemplate[]) || [];
}

/**
 * テンプレートを公開する
 */
export async function publishTemplate(
  name: string,
  description: string,
  category: string,
  data: Record<string, unknown>,
  thumbnail?: string
): Promise<string | null> {
  if (!supabase) return null;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  const userName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'Anonymous';

  const { data: result, error } = await supabase
    .from('perse_templates')
    .insert({
      author_id: userId,
      author_name: userName,
      name,
      description,
      category,
      data,
      thumbnail: thumbnail || null,
      is_public: true,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to publish template:', error.message);
    return null;
  }
  return result?.id || null;
}

/**
 * テンプレートデータを取得しダウンロード数をインクリメント
 */
export async function downloadTemplate(
  id: string
): Promise<Record<string, unknown> | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('perse_templates')
    .select('data, downloads')
    .eq('id', id)
    .single();

  if (error || !data) {
    console.error('Failed to download template:', error?.message);
    return null;
  }

  // ダウンロード数をインクリメント（ベストエフォート）
  supabase
    .from('perse_templates')
    .update({ downloads: (data.downloads || 0) + 1 })
    .eq('id', id)
    .then(() => {});

  return data.data as Record<string, unknown>;
}

/**
 * テンプレートにいいねする
 */
export async function likeTemplate(id: string): Promise<boolean> {
  if (!supabase) return false;

  const { data, error: fetchError } = await supabase
    .from('perse_templates')
    .select('likes')
    .eq('id', id)
    .single();

  if (fetchError || !data) return false;

  const { error } = await supabase
    .from('perse_templates')
    .update({ likes: (data.likes || 0) + 1 })
    .eq('id', id);

  if (error) {
    console.error('Failed to like template:', error.message);
    return false;
  }
  return true;
}
