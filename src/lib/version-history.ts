/**
 * version-history.ts — localStorageベースのバージョン履歴管理
 *
 * 保存構造: localStorage['perse-version-history'] = VersionEntry[]
 * 最大20バージョン保持（古いものは自動削除）
 */

import type { ProjectData, VersionedProjectFile } from '@/stores/useEditorStore';

const STORAGE_KEY = 'perse-version-history';
const MAX_VERSIONS = 20;

// --- Types ---

export interface VersionEntry {
  id: string;
  projectName: string;
  description: string;
  createdAt: string;
  data: ProjectData;
  /** 自動保存かユーザー手動保存か */
  isAuto: boolean;
}

export interface VersionDiff {
  furnitureAdded: number;
  furnitureRemoved: number;
  wallsAdded: number;
  wallsRemoved: number;
  openingsAdded: number;
  openingsRemoved: number;
  styleChanged: boolean;
  roomHeightChanged: boolean;
  oldStyle?: string;
  newStyle?: string;
}

// --- Internal Helpers ---

function readAll(): VersionEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VersionEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: VersionEntry[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// --- Public API ---

/**
 * バージョンを保存
 * @returns 保存されたバージョンのID
 */
export function saveVersion(
  projectName: string,
  data: ProjectData,
  description?: string,
  isAuto = false
): string {
  const entries = readAll();
  const id = `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry: VersionEntry = {
    id,
    projectName,
    description: description || (isAuto ? '自動保存' : '手動保存'),
    createdAt: new Date().toISOString(),
    data: structuredClone(data),
    isAuto,
  };

  entries.unshift(entry);

  // 最大数を超えたら古いものを削除
  while (entries.length > MAX_VERSIONS) {
    entries.pop();
  }

  writeAll(entries);
  return id;
}

/**
 * プロジェクト名でフィルタしたバージョン一覧（新しい順）
 */
export function listVersions(projectName?: string): VersionEntry[] {
  const entries = readAll();
  if (!projectName) return entries;
  return entries.filter((e) => e.projectName === projectName);
}

/**
 * 特定バージョンのデータを取得
 */
export function loadVersion(versionId: string): VersionEntry | null {
  const entries = readAll();
  return entries.find((e) => e.id === versionId) ?? null;
}

/**
 * バージョンを削除
 */
export function deleteVersion(versionId: string): boolean {
  const entries = readAll();
  const idx = entries.findIndex((e) => e.id === versionId);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  writeAll(entries);
  return true;
}

/**
 * 2つのバージョン間の差分を計算
 */
export function diffVersions(v1: ProjectData, v2: ProjectData): VersionDiff {
  const f1 = v1.furniture?.length ?? 0;
  const f2 = v2.furniture?.length ?? 0;
  const w1 = v1.walls?.length ?? 0;
  const w2 = v2.walls?.length ?? 0;
  const o1 = v1.openings?.length ?? 0;
  const o2 = v2.openings?.length ?? 0;

  return {
    furnitureAdded: Math.max(0, f2 - f1),
    furnitureRemoved: Math.max(0, f1 - f2),
    wallsAdded: Math.max(0, w2 - w1),
    wallsRemoved: Math.max(0, w1 - w2),
    openingsAdded: Math.max(0, o2 - o1),
    openingsRemoved: Math.max(0, o1 - o2),
    styleChanged: v1.style !== v2.style,
    roomHeightChanged: v1.roomHeight !== v2.roomHeight,
    oldStyle: v1.style !== v2.style ? v1.style : undefined,
    newStyle: v1.style !== v2.style ? v2.style : undefined,
  };
}

// --- Auto Version Detection ---

/** 前回の自動保存チェック用キャッシュ */
let _lastAutoKey = '';

/**
 * 現在の状態を前回と比較し、大きな変更があれば自動バージョン保存
 * 判定基準: 家具5個以上の変化、壁の追加/削除、スタイル変更
 */
export function checkAndAutoSave(projectName: string, current: ProjectData): boolean {
  const entries = readAll();
  // 同プロジェクトの最新バージョンと比較
  const latest = entries.find((e) => e.projectName === projectName);

  // フィンガープリント生成（簡易）
  const key = `${current.furniture?.length ?? 0}_${current.walls?.length ?? 0}_${current.style}_${current.roomHeight}`;
  if (key === _lastAutoKey) return false;

  if (!latest) {
    // 初回保存
    _lastAutoKey = key;
    saveVersion(projectName, current, '初期状態', true);
    return true;
  }

  const diff = diffVersions(latest.data, current);
  const shouldSave =
    diff.furnitureAdded >= 5 ||
    diff.furnitureRemoved >= 5 ||
    diff.wallsAdded > 0 ||
    diff.wallsRemoved > 0 ||
    diff.styleChanged;

  if (shouldSave) {
    _lastAutoKey = key;
    const parts: string[] = [];
    if (diff.furnitureAdded > 0) parts.push(`家具+${diff.furnitureAdded}`);
    if (diff.furnitureRemoved > 0) parts.push(`家具-${diff.furnitureRemoved}`);
    if (diff.wallsAdded > 0) parts.push(`壁+${diff.wallsAdded}`);
    if (diff.wallsRemoved > 0) parts.push(`壁-${diff.wallsRemoved}`);
    if (diff.styleChanged) parts.push(`スタイル変更: ${diff.newStyle}`);
    saveVersion(projectName, current, parts.join(', ') || '自動保存', true);
    return true;
  }

  _lastAutoKey = key;
  return false;
}

/**
 * 全バージョン数を取得
 */
export function getVersionCount(projectName?: string): number {
  return listVersions(projectName).length;
}

/**
 * 全バージョンを削除（プロジェクト名指定時はそのプロジェクトのみ）
 */
export function clearVersions(projectName?: string): void {
  if (!projectName) {
    writeAll([]);
    return;
  }
  const entries = readAll().filter((e) => e.projectName !== projectName);
  writeAll(entries);
}
