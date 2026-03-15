/**
 * project-storage.ts — Supabase プロジェクト保存/読込API
 *
 * 認証ユーザー: user_id ベースで保存
 * 匿名ユーザー: localStorage生成の anonymous_id ベースで保存
 * 両方とも Supabase に永続化され、キャッシュクリアでもデータは失われない
 * (匿名の場合は anonymous_id が失われると復元不可)
 */

import { supabase } from './supabase';

// --- Types ---

export interface PerseProject {
  id: string;
  name: string;
  data?: Record<string, unknown>; // JSONB — exportProject() の結果
  thumbnail?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveProjectParams {
  name: string;
  data: Record<string, unknown>; // exportProject() をパースしたオブジェクト
  thumbnail?: string | null;
  existingId?: string; // 指定時はUPDATE
}

// --- Anonymous ID ---

const ANON_ID_KEY = 'perse_anonymous_id';

function getOrCreateAnonymousId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

// --- Owner helpers ---

async function getOwnerFilter(): Promise<{ user_id?: string; anonymous_id?: string } | null> {
  if (!supabase) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return { user_id: user.id };
  }

  const anonId = getOrCreateAnonymousId();
  if (anonId) {
    return { anonymous_id: anonId };
  }

  return null;
}

// --- CRUD ---

/**
 * プロジェクトを保存 (UPSERT)
 * existingId 指定時は UPDATE、なければ INSERT (name重複時は上書き)
 */
export async function saveProject(params: SaveProjectParams): Promise<string | null> {
  if (!supabase) return null;
  const owner = await getOwnerFilter();
  if (!owner) return null;

  const row = {
    ...owner,
    name: params.name,
    data: params.data,
    thumbnail: params.thumbnail ?? null,
    updated_at: new Date().toISOString(),
  };

  if (params.existingId) {
    // 明示的UPDATE
    const { data, error } = await supabase
      .from('perse_projects')
      .update(row)
      .eq('id', params.existingId)
      .select('id')
      .single();

    if (error) {
      console.error('[ProjectStorage] update error:', error);
      return null;
    }
    return data?.id ?? null;
  }

  // SELECT→INSERT/UPDATE パターン（部分ユニークインデックスは
  // PostgREST の on_conflict では参照できないため upsert 不可）
  let existingQuery = supabase
    .from('perse_projects')
    .select('id')
    .eq('name', params.name);

  if (owner.user_id) {
    existingQuery = existingQuery.eq('user_id', owner.user_id);
  } else if (owner.anonymous_id) {
    existingQuery = existingQuery.eq('anonymous_id', owner.anonymous_id);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    // UPDATE existing row
    const { data, error } = await supabase
      .from('perse_projects')
      .update(row)
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) {
      console.error('[ProjectStorage] upsert-update error:', error);
      return null;
    }
    return data?.id ?? null;
  }

  // INSERT new row
  const { data, error } = await supabase
    .from('perse_projects')
    .insert(row)
    .select('id')
    .single();

  if (error) {
    console.error('[ProjectStorage] insert error:', error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * プロジェクトを読み込み
 */
export async function loadProject(id: string): Promise<PerseProject | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('perse_projects')
    .select('id, name, data, thumbnail, is_public, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[ProjectStorage] load error:', error);
    return null;
  }
  return data as PerseProject;
}

/**
 * ユーザーのプロジェクト一覧を取得 (data除外で軽量)
 */
export async function listProjects(): Promise<Omit<PerseProject, 'data'>[]> {
  if (!supabase) return [];
  const owner = await getOwnerFilter();
  if (!owner) return [];

  let query = supabase
    .from('perse_projects')
    .select('id, name, thumbnail, is_public, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (owner.user_id) {
    query = query.eq('user_id', owner.user_id);
  } else if (owner.anonymous_id) {
    query = query.eq('anonymous_id', owner.anonymous_id);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[ProjectStorage] list error:', error);
    return [];
  }
  return (data ?? []) as Omit<PerseProject, 'data'>[];
}

/**
 * プロジェクトを削除
 */
export async function deleteProject(id: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('perse_projects')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[ProjectStorage] delete error:', error);
    return false;
  }
  return true;
}

// --- Auto Save (デバウンス付き) ---

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedProjectId: string | null = null;

/**
 * 自動保存 — デバウンス付き (デフォルト5秒)
 * 連続呼び出しされても最後の呼び出しから debounceMs 後に1回だけ保存
 */
export function autoSave(
  name: string,
  data: Record<string, unknown>,
  debounceMs = 5000
): void {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = setTimeout(async () => {
    const id = await saveProject({
      name,
      data,
      existingId: lastSavedProjectId ?? undefined,
    });
    if (id) {
      lastSavedProjectId = id;
    }
  }, debounceMs);
}

/**
 * 自動保存の対象プロジェクトIDをリセット
 * (新規プロジェクト作成時などに呼ぶ)
 */
export function resetAutoSaveTarget(): void {
  lastSavedProjectId = null;
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
}

/**
 * 現在の自動保存対象IDを取得
 */
export function getAutoSaveTargetId(): string | null {
  return lastSavedProjectId;
}
