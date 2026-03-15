'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { showToast } from '@/components/ui/Toast';
import {
  listTemplates,
  publishTemplate,
  downloadTemplate,
  likeTemplate,
  getCategoryLabel,
  getAllCategories,
  type MarketplaceTemplate,
  type TemplateCategory,
  type TemplateSortBy,
} from '@/lib/template-marketplace';

interface TemplateMarketplaceProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TemplateMarketplace({ isOpen, onClose }: TemplateMarketplaceProps) {
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<TemplateCategory>('all');
  const [sortBy, setSortBy] = useState<TemplateSortBy>('popular');
  const [tab, setTab] = useState<'browse' | 'publish'>('browse');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // 公開フォーム
  const [pubName, setPubName] = useState('');
  const [pubDesc, setPubDesc] = useState('');
  const [pubCategory, setPubCategory] = useState<string>('cafe');
  const [publishing, setPublishing] = useState(false);

  const importProject = useEditorStore((s) => s.importProject);
  const exportProject = useEditorStore((s) => s.exportProject);
  const projectName = useEditorStore((s) => s.projectName);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const data = await listTemplates(category, sortBy);
    setTemplates(data);
    setLoading(false);
  }, [category, sortBy]);

  useEffect(() => {
    if (isOpen && tab === 'browse') {
      fetchTemplates();
    }
  }, [isOpen, tab, fetchTemplates]);

  const handleUseTemplate = useCallback(async (t: MarketplaceTemplate) => {
    const data = await downloadTemplate(t.id);
    if (!data) {
      showToast('テンプレートの取得に失敗しました', 'error');
      return;
    }
    try {
      // ProjectData / VersionedProjectFile 形式で import
      const json = JSON.stringify(data);
      importProject(json);
      showToast(`テンプレート「${t.name}」を適用しました`, 'success');
      onClose();
    } catch {
      showToast('テンプレートの適用に失敗しました', 'error');
    }
  }, [importProject, onClose]);

  const handleLike = useCallback(async (id: string) => {
    if (likedIds.has(id)) return;
    const ok = await likeTemplate(id);
    if (ok) {
      setLikedIds((prev) => new Set(prev).add(id));
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, likes: t.likes + 1 } : t))
      );
    }
  }, [likedIds]);

  const handlePublish = useCallback(async () => {
    if (!pubName.trim()) {
      showToast('テンプレート名を入力してください', 'error');
      return;
    }
    setPublishing(true);
    try {
      const json = exportProject();
      const parsed = JSON.parse(json);
      const projectData = parsed.data || parsed;
      const id = await publishTemplate(
        pubName.trim(),
        pubDesc.trim(),
        pubCategory,
        projectData
      );
      if (id) {
        showToast('テンプレートを公開しました', 'success');
        setPubName('');
        setPubDesc('');
        setTab('browse');
      } else {
        showToast('公開に失敗しました（ログインが必要です）', 'error');
      }
    } catch {
      showToast('公開に失敗しました', 'error');
    }
    setPublishing(false);
  }, [pubName, pubDesc, pubCategory, exportProject]);

  if (!isOpen) return null;

  const categories = getAllCategories();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[95vw] max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5 text-blue-600">
              <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.8} />
              <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.8} />
              <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.8} />
              <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.8} />
            </svg>
            <h2 className="text-base font-bold text-gray-800">テンプレートマーケットプレイス</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-200 px-5">
          <button
            onClick={() => setTab('browse')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'browse'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            探す
          </button>
          <button
            onClick={() => setTab('publish')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === 'publish'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            公開する
          </button>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'browse' ? (
            <div className="p-5">
              {/* フィルター */}
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      category === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {getCategoryLabel(cat)}
                  </button>
                ))}
              </div>

              {/* ソート */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500">並び順:</span>
                {([
                  ['popular', '人気順'],
                  ['newest', '新着順'],
                  ['downloads', 'DL数'],
                ] as [TemplateSortBy, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      sortBy === key
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* テンプレート一覧 */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">読み込み中...</span>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 text-sm">
                    テンプレートがまだありません。最初の一つを公開してみましょう!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((t) => (
                    <div
                      key={t.id}
                      className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow group"
                    >
                      {/* サムネイル */}
                      <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-4xl">
                        {t.thumbnail || getCategoryEmoji(t.category)}
                      </div>

                      {/* 情報 */}
                      <div className="p-3">
                        <h3 className="text-sm font-semibold text-gray-800 truncate">{t.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{t.author_name}</p>
                        {t.description && (
                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{t.description}</p>
                        )}

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                                <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" strokeLinecap="round" />
                              </svg>
                              {t.downloads}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLike(t.id); }}
                              className={`flex items-center gap-1 transition-colors ${
                                likedIds.has(t.id) ? 'text-red-500' : 'hover:text-red-400'
                              }`}
                            >
                              <svg viewBox="0 0 16 16" fill={likedIds.has(t.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                                <path d="M8 13.5S2 10 2 6a3 3 0 015-2.2A3 3 0 0114 6c0 4-6 7.5-6 7.5z" />
                              </svg>
                              {t.likes}
                            </button>
                          </div>

                          <button
                            onClick={() => handleUseTemplate(t)}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                          >
                            使う
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* 公開フォーム */
            <div className="p-5 max-w-md mx-auto">
              <p className="text-sm text-gray-600 mb-4">
                現在のプロジェクト「{projectName}」をテンプレートとして公開します。
              </p>

              <label className="block mb-3">
                <span className="text-xs font-medium text-gray-700">テンプレート名 *</span>
                <input
                  value={pubName}
                  onChange={(e) => setPubName(e.target.value)}
                  placeholder="例: モダンカフェ 15席"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </label>

              <label className="block mb-3">
                <span className="text-xs font-medium text-gray-700">説明</span>
                <textarea
                  value={pubDesc}
                  onChange={(e) => setPubDesc(e.target.value)}
                  placeholder="レイアウトの特徴やおすすめポイント..."
                  rows={3}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </label>

              <label className="block mb-4">
                <span className="text-xs font-medium text-gray-700">カテゴリ *</span>
                <select
                  value={pubCategory}
                  onChange={(e) => setPubCategory(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {getAllCategories()
                    .filter((c) => c !== 'all')
                    .map((cat) => (
                      <option key={cat} value={cat}>
                        {getCategoryLabel(cat)}
                      </option>
                    ))}
                </select>
              </label>

              <button
                onClick={handlePublish}
                disabled={publishing || !pubName.trim()}
                className="w-full py-2.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {publishing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    公開中...
                  </>
                ) : (
                  '公開する'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    cafe: '\u2615',
    restaurant: '\uD83C\uDF7D\uFE0F',
    office: '\uD83C\uDFE2',
    medical: '\uD83C\uDFE5',
    retail: '\uD83D\uDECD\uFE0F',
    bar: '\uD83C\uDF78',
    hotel: '\uD83C\uDFE8',
    gym: '\uD83C\uDFCB\uFE0F',
  };
  return map[category] || '\uD83D\uDCCB';
}
