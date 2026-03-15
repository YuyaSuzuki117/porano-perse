'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { useProjectStore, SavedProject } from '@/stores/useProjectStore';

interface ProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectListModal({ isOpen, onClose }: ProjectListModalProps) {
  const listSavedProjects = useProjectStore((s) => s.listSavedProjects);
  const saveProjectToList = useProjectStore((s) => s.saveProjectToList);
  const loadProjectFromList = useProjectStore((s) => s.loadProjectFromList);
  const deleteProjectFromList = useProjectStore((s) => s.deleteProjectFromList);
  const projectName = useEditorStore((s) => s.projectName);

  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // プロジェクト一覧を更新
  const refreshList = useCallback(() => {
    setProjects(listSavedProjects());
  }, [listSavedProjects]);

  // isOpenが変わったらリストを更新
  useEffect(() => {
    if (isOpen) {
      setProjects(listSavedProjects());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSave = useCallback(() => {
    saveProjectToList();
    refreshList();
  }, [saveProjectToList, refreshList]);

  const handleLoad = useCallback((id: string) => {
    loadProjectFromList(id);
    onClose();
  }, [loadProjectFromList, onClose]);

  const handleDelete = useCallback((id: string, name: string) => {
    if (confirm(`"${name}" を削除しますか？`)) {
      deleteProjectFromList(id);
      refreshList();
    }
  }, [deleteProjectFromList, refreshList]);

  const handleShareProject = useCallback(async (id: string) => {
    // 対象プロジェクトを一時的にロードしてURL生成
    const project = projects.find((p) => p.id === id);
    if (!project) return;

    // Base64エンコード
    const encoded = btoa(unescape(encodeURIComponent(project.data)));
    const url = `${window.location.origin}${window.location.pathname}?project=${encoded}`;

    if (url.length > 2000) {
      alert('プロジェクトが大きすぎるためURL共有できません。JSON保存をご利用ください。');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, [projects]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-blue-600">
              <path d="M2 15V5a1 1 0 011-1h4l2 2h6a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
            </svg>
            <h2 className="text-base font-semibold text-gray-800">保存済みプロジェクト</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* プロジェクト一覧 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {projects.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} className="w-10 h-10 mx-auto mb-3 text-gray-300">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p>保存済みプロジェクトがありません</p>
              <p className="text-xs mt-1 text-gray-300">下のボタンから現在のプロジェクトを保存できます</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-200 rounded-lg p-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-gray-800 truncate">
                        {project.name}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        更新: {formatDate(project.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <button
                      onClick={() => handleLoad(project.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3">
                        <path d="M2 13V5a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
                      </svg>
                      開く
                    </button>
                    <button
                      onClick={() => handleShareProject(project.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      {copiedId === project.id ? (
                        <>
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3 text-green-600">
                            <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-green-600">コピー済</span>
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3">
                            <path d="M6 10a3 3 0 004 0l3-3a3 3 0 00-4-4L7.5 4.5" strokeLinecap="round" />
                            <path d="M10 6a3 3 0 00-4 0L3 9a3 3 0 004 4l1.5-1.5" strokeLinecap="round" />
                          </svg>
                          共有
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(project.id, project.name)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-md transition-colors ml-auto"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3">
                        <path d="M4 4h8M5.5 4V3a1 1 0 011-1h3a1 1 0 011 1v1M6 7v4M10 7v4M5 4l.5 9a1 1 0 001 1h3a1 1 0 001-1L11 4" />
                      </svg>
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            保存済み: {projects.length}件
          </span>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
              <path d="M3 2h8l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
              <path d="M5 2v4h5V2" />
              <rect x="4" y="9" width="8" height="4" rx="0.5" />
            </svg>
            「{projectName}」を保存
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return isoString;
  }
}
