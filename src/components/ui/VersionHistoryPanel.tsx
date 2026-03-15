'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import {
  listVersions,
  loadVersion,
  deleteVersion,
  diffVersions,
  saveVersion,
  type VersionEntry,
  type VersionDiff,
} from '@/lib/version-history';
import type { ProjectData } from '@/stores/useEditorStore';

/** 差分のサマリーテキストを生成 */
function diffSummary(diff: VersionDiff): string {
  const parts: string[] = [];
  if (diff.furnitureAdded > 0) parts.push(`家具 +${diff.furnitureAdded}`);
  if (diff.furnitureRemoved > 0) parts.push(`家具 -${diff.furnitureRemoved}`);
  if (diff.wallsAdded > 0) parts.push(`壁 +${diff.wallsAdded}`);
  if (diff.wallsRemoved > 0) parts.push(`壁 -${diff.wallsRemoved}`);
  if (diff.openingsAdded > 0) parts.push(`開口部 +${diff.openingsAdded}`);
  if (diff.openingsRemoved > 0) parts.push(`開口部 -${diff.openingsRemoved}`);
  if (diff.styleChanged) parts.push(`スタイル: ${diff.oldStyle} → ${diff.newStyle}`);
  if (diff.roomHeightChanged) parts.push('天井高変更');
  return parts.length > 0 ? parts.join(', ') : '変更なし';
}

/** 相対時間表示 */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'たった今';
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  return new Date(dateStr).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

interface VersionHistoryPanelProps {
  /** パネルを閉じるコールバック（オプション） */
  onClose?: () => void;
}

export function VersionHistoryPanel({ onClose }: VersionHistoryPanelProps) {
  const projectName = useEditorStore((s) => s.projectName);
  const importProject = useEditorStore((s) => s.importProject);
  const exportProject = useEditorStore((s) => s.exportProject);

  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(() => {
    setVersions(listVersions(projectName));
  }, [projectName]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // メッセージ自動消去
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 3000);
    return () => clearTimeout(t);
  }, [message]);

  /** 現在の状態をバージョン保存 */
  const handleSave = useCallback(() => {
    const json = exportProject();
    const parsed = JSON.parse(json);
    const data: ProjectData = parsed.data ?? parsed;
    saveVersion(projectName, data, saveName || undefined, false);
    setSaveName('');
    setShowSaveForm(false);
    setMessage('バージョンを保存しました');
    refresh();
  }, [exportProject, projectName, saveName, refresh]);

  /** バージョンを復元 */
  const handleRestore = useCallback(
    (versionId: string) => {
      const entry = loadVersion(versionId);
      if (!entry) return;
      // ProjectData → VersionedProjectFile形式にしてインポート
      const file = {
        version: 1,
        name: entry.projectName,
        createdAt: entry.createdAt,
        data: entry.data,
      };
      importProject(JSON.stringify(file));
      setMessage('バージョンを復元しました');
    },
    [importProject]
  );

  /** バージョンを削除 */
  const handleDelete = useCallback(
    (versionId: string) => {
      deleteVersion(versionId);
      setConfirmDeleteId(null);
      setMessage('バージョンを削除しました');
      refresh();
    },
    [refresh]
  );

  /** 現在の状態と指定バージョンの差分 */
  const getCurrentDiff = useCallback(
    (entry: VersionEntry): VersionDiff | null => {
      try {
        const json = exportProject();
        const parsed = JSON.parse(json);
        const currentData: ProjectData = parsed.data ?? parsed;
        return diffVersions(entry.data, currentData);
      } catch {
        return null;
      }
    },
    [exportProject]
  );

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-gray-600">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-800">バージョン履歴</h3>
          <span className="text-xs text-gray-400">({versions.length}/20)</span>
        </div>
        <button
          onClick={() => setShowSaveForm(!showSaveForm)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
          </svg>
          保存
        </button>
      </div>

      {/* メッセージ */}
      {message && (
        <div className="px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md">
          {message}
        </div>
      )}

      {/* 保存フォーム */}
      {showSaveForm && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="バージョン名（例: レイアウトA完成）"
            className="w-full px-3 py-2 text-xs border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowSaveForm(false)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              保存する
            </button>
          </div>
        </div>
      )}

      {/* バージョン一覧（タイムライン） */}
      {versions.length === 0 ? (
        <div className="py-8 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="w-10 h-10 mx-auto text-gray-300 mb-2">
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-xs text-gray-400">バージョン履歴がありません</p>
          <p className="text-xs text-gray-400 mt-1">上の「保存」ボタンで現在の状態を記録できます</p>
        </div>
      ) : (
        <div className="relative">
          {/* タイムラインの縦線 */}
          <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />

          <div className="space-y-1">
            {versions.map((entry, idx) => {
              const isFirst = idx === 0;
              const diff = idx < versions.length - 1
                ? diffVersions(versions[idx + 1].data, entry.data)
                : null;
              const isPreview = previewId === entry.id;
              const isConfirmDelete = confirmDeleteId === entry.id;

              return (
                <div key={entry.id} className="relative pl-8">
                  {/* タイムラインドット */}
                  <div
                    className={`absolute left-1.5 top-3 w-3 h-3 rounded-full border-2 ${
                      isFirst
                        ? 'bg-blue-500 border-blue-500'
                        : entry.isAuto
                        ? 'bg-gray-300 border-gray-300'
                        : 'bg-white border-blue-400'
                    }`}
                  />

                  <div
                    className={`p-3 rounded-lg border transition-colors ${
                      isFirst
                        ? 'bg-blue-50 border-blue-200'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* バージョン情報 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-800 truncate">
                            {entry.description}
                          </span>
                          {entry.isAuto && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-100 rounded">
                              自動
                            </span>
                          )}
                          {isFirst && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-100 rounded">
                              最新
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {timeAgo(entry.createdAt)}
                          {' · '}
                          {new Date(entry.createdAt).toLocaleString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>

                      {/* アクションボタン */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setPreviewId(isPreview ? null : entry.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                          title="プレビュー"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleRestore(entry.id)}
                          className="p-1 text-gray-400 hover:text-green-600 rounded transition-colors"
                          title="復元"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(isConfirmDelete ? null : entry.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="削除"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* 差分表示 */}
                    {diff && (
                      <div className="mt-1.5 text-[11px] text-gray-500">
                        {diffSummary(diff)}
                      </div>
                    )}

                    {/* 削除確認 */}
                    {isConfirmDelete && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md flex items-center justify-between">
                        <span className="text-xs text-red-600">このバージョンを削除しますか？</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-[11px] text-gray-600 hover:text-gray-800"
                          >
                            いいえ
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="px-2 py-1 text-[11px] font-medium text-white bg-red-500 rounded hover:bg-red-600"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )}

                    {/* プレビュー詳細 */}
                    {isPreview && (
                      <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-md space-y-1.5">
                        <div className="text-[11px] font-medium text-gray-600">スナップショット詳細</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          <div className="text-gray-500">
                            家具: <span className="font-medium text-gray-700">{entry.data.furniture?.length ?? 0}個</span>
                          </div>
                          <div className="text-gray-500">
                            壁: <span className="font-medium text-gray-700">{entry.data.walls?.length ?? 0}枚</span>
                          </div>
                          <div className="text-gray-500">
                            開口部: <span className="font-medium text-gray-700">{entry.data.openings?.length ?? 0}個</span>
                          </div>
                          <div className="text-gray-500">
                            天井高: <span className="font-medium text-gray-700">{entry.data.roomHeight ?? 2.7}m</span>
                          </div>
                          <div className="text-gray-500">
                            スタイル: <span className="font-medium text-gray-700">{entry.data.style}</span>
                          </div>
                          <div className="text-gray-500">
                            ラベル: <span className="font-medium text-gray-700">{entry.data.roomLabels?.length ?? 0}個</span>
                          </div>
                        </div>

                        {/* 現在との差分 */}
                        {(() => {
                          const currentDiff = getCurrentDiff(entry);
                          if (!currentDiff) return null;
                          const summary = diffSummary(currentDiff);
                          if (summary === '変更なし') return (
                            <div className="text-[11px] text-green-600 font-medium mt-1">
                              現在の状態と同じです
                            </div>
                          );
                          return (
                            <div className="text-[11px] text-amber-600 mt-1">
                              現在との差分: {summary}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
