'use client';

import { useState, useCallback } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';

/**
 * 下部バー: JSON保存・DXF出力・修正状態表示 (ダークテーマ)
 */
export default function ExportBar() {
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const historyIdx = useCorrectionStore((s) => s.historyIdx);
  const resetToOriginal = useCorrectionStore((s) => s.resetToOriginal);
  const [exporting, setExporting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const editCount = Math.max(0, historyIdx);

  const unknownCount = blueprint
    ? blueprint.rooms.filter((r) => r.name === '不明' || r.name === '').length
    : 0;
  const namedCount = blueprint ? blueprint.rooms.length - unknownCount : 0;
  const totalRooms = blueprint?.rooms.length ?? 0;
  const progressPercent = totalRooms > 0 ? Math.round((namedCount / totalRooms) * 100) : 0;
  const hasUnknown = unknownCount > 0;

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 2000);
  }, []);

  const handleJsonSave = useCallback(() => {
    if (!blueprint) return;
    const json = JSON.stringify(blueprint, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blueprint.project_name || 'blueprint'}_corrected.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess('JSON保存完了');
  }, [blueprint, showSuccess]);

  const handleDxfExport = useCallback(async () => {
    if (!blueprint || hasUnknown) return;
    setExporting(true);
    try {
      const res = await fetch('/api/correction/export-dxf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blueprint),
      });
      if (!res.ok) throw new Error(`DXF export failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${blueprint.project_name || 'blueprint'}_corrected.dxf`;
      a.click();
      URL.revokeObjectURL(url);
      showSuccess('DXF出力完了');
    } catch (err) {
      console.error('DXF export error:', err);
      alert('DXFエクスポートに失敗しました。');
    } finally {
      setExporting(false);
    }
  }, [blueprint, hasUnknown, showSuccess]);

  const handleReset = useCallback(() => {
    resetToOriginal();
    setShowResetConfirm(false);
  }, [resetToOriginal]);

  if (!blueprint) return null;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-[#0d1b2a] border-t border-[#1e3a5f]">
      {/* 左: 状態表示 */}
      <div className="flex items-center gap-3 text-[11px]">
        {editCount === 0 ? (
          <span className="text-[#4a6a8a]">未修正</span>
        ) : (
          <span className="text-[#4a90d9] font-medium font-mono">
            {editCount}箇所修正
          </span>
        )}
        <span className={`font-medium font-mono ${hasUnknown ? 'text-amber-400' : 'text-green-400'}`}>
          {namedCount}/{totalRooms}室 ({progressPercent}%)
        </span>
        <span className="text-[#4a6a8a]">|</span>
        <span className="text-[#4a6a8a] font-mono">
          壁{blueprint.walls.length} 什器{blueprint.fixtures.length}
        </span>
      </div>

      {/* 右: ボタン群 */}
      <div className="flex items-center gap-2">
        {/* リセット */}
        {showResetConfirm ? (
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-red-400">リセット?</span>
            <button
              onClick={handleReset}
              className="px-2 py-0.5 text-[10px] bg-red-500/80 text-white rounded hover:bg-red-500 transition-colors"
            >
              はい
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-2 py-0.5 text-[10px] bg-[#1e3a5f] text-[#6b8ab5] rounded hover:bg-[#2a4a6f] transition-colors"
            >
              いいえ
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#6b8ab5] rounded hover:bg-[#1e3a5f] transition-colors border border-[#1e3a5f]"
            title="全修正を取り消す"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            リセット
          </button>
        )}

        <div className="w-px h-5 bg-[#1e3a5f]" />

        {/* JSON保存 */}
        <button
          onClick={handleJsonSave}
          className="flex items-center gap-1 px-3 py-1 text-[10px] font-medium bg-[#1e3a5f] text-[#8ba4c4] rounded hover:bg-[#2a4a6f] transition-colors border border-[#2a4a6f]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
          </svg>
          JSON
        </button>

        {/* DXF出力 */}
        <div className="relative group">
          <button
            onClick={handleDxfExport}
            disabled={exporting || hasUnknown}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] font-medium rounded transition-colors border ${
              exporting || hasUnknown
                ? 'bg-[#1e3a5f]/50 text-[#4a6a8a] border-[#1e3a5f] cursor-not-allowed'
                : 'bg-[#4a90d9] text-white border-[#4a90d9] hover:bg-[#3a80c9]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exporting ? 'DXF...' : 'DXF'}
          </button>
          {hasUnknown && (
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-50">
              <div className="bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                不明{unknownCount}室を確定してください
              </div>
            </div>
          )}
        </div>

        {/* 成功メッセージ */}
        {successMsg && (
          <span className="text-[10px] text-green-400 font-medium animate-pulse">{successMsg}</span>
        )}
      </div>
    </div>
  );
}
