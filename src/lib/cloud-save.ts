import { supabase } from './supabase';

export interface CloudProject {
  id: string;
  name: string;
  data?: string;
  updated_at: string;
  created_at: string;
}

export async function saveProjectToCloud(name: string, data: string): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: result, error } = await supabase
    .from('perse_projects')
    .upsert({ user_id: user.id, name, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,name' })
    .select('id')
    .single();
  if (error) { console.error('[CloudSave]', error); return null; }
  return result?.id || null;
}

export async function listCloudProjects(): Promise<CloudProject[]> {
  if (!supabase) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('perse_projects')
    .select('id, name, updated_at, created_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) { console.error('[CloudSave]', error); return []; }
  return (data || []) as CloudProject[];
}

export async function loadCloudProject(id: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('perse_projects').select('data').eq('id', id).single();
  if (error) { console.error('[CloudSave]', error); return null; }
  return data?.data || null;
}

export async function deleteCloudProject(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('perse_projects').delete().eq('id', id);
  return !error;
}
