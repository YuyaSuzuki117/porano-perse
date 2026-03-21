'use client';

import React, { useCallback, useMemo } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { parseScale, mmToCanvas } from '@/lib/blueprint-geometry';
import type { CorrectionTool } from '@/types/blueprint';

// --- SVGアイコン ---
const SelectIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
  </svg>
);
const EditNameIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const MoveVertexIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 9l-3 3 3 3" /><path d="M9 5l3-3 3 3" />
    <path d="M15 19l3 3-3-3" /><path d="M19 9l3 3-3 3" />
    <line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" />
  </svg>
);
const AddRoomIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);
const DeleteRoomIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const WallAddIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="20" x2="20" y2="4" /><line x1="17" y1="4" x2="20" y2="4" /><line x1="20" y1="4" x2="20" y2="7" />
    <circle cx="4" cy="20" r="2" fill="currentColor" /><circle cx="20" cy="4" r="2" fill="currentColor" />
  </svg>
);
const WallMoveIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="20" x2="20" y2="4" />
    <path d="M8 8l-4 4 4 4" /><path d="M16 8l4 4-4 4" />
  </svg>
);
const WallDeleteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="20" x2="20" y2="4" opacity="0.4" />
    <line x1="8" y1="8" x2="16" y2="16" strokeWidth="3" /><line x1="16" y1="8" x2="8" y2="16" strokeWidth="3" />
  </svg>
);
const MeasureIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 20l20-16" />
    <path d="M6 16l2-2" /><path d="M10 12l2-2" /><path d="M14 8l2-2" />
    <circle cx="2" cy="20" r="1.5" fill="currentColor" /><circle cx="22" cy="4" r="1.5" fill="currentColor" />
  </svg>
);
const SplitRoomIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2" />
  </svg>
);
const CompareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
    <path d="M3 12h4" /><path d="M17 12h4" />
  </svg>
);
const MoveAllIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l3 3-3 3" /><path d="M12 2l-3 3 3 3" />
    <path d="M12 22l3-3-3-3" /><path d="M12 22l-3-3 3-3" />
    <path d="M2 12l3 3 3-3" /><path d="M2 12l3-3 3 3" />
    <path d="M22 12l-3 3-3-3" /><path d="M22 12l-3-3-3 3" />
    <line x1="12" y1="2" x2="12" y2="22" /><line x1="2" y1="12" x2="22" y2="12" />
  </svg>
);
const FitAllIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);
const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);
const SnapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0" fill="currentColor" />
    <path d="M18 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0" fill="currentColor" />
    <path d="M11 5a1 1 0 1 0 2 0 1 1 0 1 0-2 0" fill="currentColor" />
    <path d="M11 19a1 1 0 1 0 2 0 1 1 0 1 0-2 0" fill="currentColor" />
    <line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 2" opacity="0.5" />
    <line x1="2" y1="12" x2="22" y2="12" strokeDasharray="2 2" opacity="0.5" />
  </svg>
);

interface ToolGroup {
  label: string;
  tools: { tool: CorrectionTool; label: string; shortcut: string; icon: React.ReactNode }[];
}

const toolGroups: ToolGroup[] = [
  {
    label: '選択',
    tools: [
      { tool: 'select', label: '選択', shortcut: 'V', icon: <SelectIcon /> },
      { tool: 'editName', label: '室名編集', shortcut: 'N', icon: <EditNameIcon /> },
    ],
  },
  {
    label: '編集',
    tools: [
      { tool: 'moveVertex', label: '頂点移動', shortcut: 'M', icon: <MoveVertexIcon /> },
      { tool: 'addRoom', label: '部屋追加', shortcut: '', icon: <AddRoomIcon /> },
      { tool: 'deleteRoom', label: '部屋削除', shortcut: 'Del', icon: <DeleteRoomIcon /> },
      { tool: 'splitRoom', label: '部屋分割', shortcut: '', icon: <SplitRoomIcon /> },
    ],
  },
  {
    label: '壁',
    tools: [
      { tool: 'wallAdd', label: '壁追加', shortcut: 'W', icon: <WallAddIcon /> },
      { tool: 'wallMove', label: '壁移動', shortcut: '', icon: <WallMoveIcon /> },
      { tool: 'wallDelete', label: '壁削除', shortcut: '', icon: <WallDeleteIcon /> },
    ],
  },
  {
    label: '表示',
    tools: [
      { tool: 'measure', label: '測定', shortcut: 'R', icon: <MeasureIcon /> },
      { tool: 'moveAll', label: '全体移動', shortcut: 'T', icon: <MoveAllIcon /> },
    ],
  },
];

export default function CorrectionToolbar() {
  const activeTool = useCorrectionStore((s) => s.activeTool);
  const zoom = useCorrectionStore((s) => s.zoom);
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const pdfInfo = useCorrectionStore((s) => s.pdfInfo);
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);
  const historyIdx = useCorrectionStore((s) => s.historyIdx);
  const historyLen = useCorrectionStore((s) => s.history.length);
  const snapEnabled = useCorrectionStore((s) => s.snapEnabled);
  const gridVisible = useCorrectionStore((s) => s.gridVisible);
  const selectRoom = useCorrectionStore((s) => s.selectRoom);
  const setActiveTool = useCorrectionStore((s) => s.setActiveTool);
  const setZoom = useCorrectionStore((s) => s.setZoom);
  const setPan = useCorrectionStore((s) => s.setPan);
  const undo = useCorrectionStore((s) => s.undo);
  const redo = useCorrectionStore((s) => s.redo);
  const setSnapEnabled = useCorrectionStore((s) => s.setSnapEnabled);
  const setGridVisible = useCorrectionStore((s) => s.setGridVisible);
  const compareMode = useCorrectionStore((s) => s.compareMode);
  const setCompareMode = useCorrectionStore((s) => s.setCompareMode);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < historyLen - 1;

  const selectedRoom = blueprint && selectedRoomIdx !== null ? blueprint.rooms[selectedRoomIdx] : null;

  const unknownCount = useMemo(() => {
    if (!blueprint) return 0;
    return blueprint.rooms.filter((r) => r.name === '不明' || r.name === '').length;
  }, [blueprint]);

  const handleNextUnknown = useCallback(() => {
    if (!blueprint) return;
    const startIdx = (selectedRoomIdx ?? -1) + 1;
    const rooms = blueprint.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const idx = (startIdx + i) % rooms.length;
      if (rooms[idx].name === '不明' || rooms[idx].name === '') {
        selectRoom(idx);
        const room = rooms[idx];
        const scale = parseScale(blueprint.scale_detected);
        const dpi = pdfInfo?.dpi ?? 150;
        const pageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * dpi / 25.4;
        const { cx, cy } = mmToCanvas(room.center_mm[0], room.center_mm[1], scale, dpi, pageHeightPx, 1, 0, 0);
        const vw = (window.innerWidth - 280) / 2;
        const vh = (window.innerHeight - 100) / 2;
        setPan(vw - cx * zoom, vh - cy * zoom);
        setActiveTool('editName');
        return;
      }
    }
  }, [blueprint, selectedRoomIdx, selectRoom, setPan, zoom, setActiveTool, pdfInfo]);

  const handleFitAll = () => {
    if (!blueprint) return;
    const containerEl = document.querySelector('[data-correction-canvas]');
    const cw = containerEl?.clientWidth ?? 800;
    const ch = containerEl?.clientHeight ?? 600;

    const effectiveDpi = pdfInfo?.dpi ?? 150;
    const scale = parseScale(blueprint.scale_detected);
    const effectivePageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * effectiveDpi / 25.4;

    let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
    for (const room of blueprint.rooms) {
      for (const pt of room.polygon_mm) {
        const { cx, cy } = mmToCanvas(pt[0], pt[1], scale, effectiveDpi, effectivePageHeightPx, 1, 0, 0);
        minCx = Math.min(minCx, cx);
        minCy = Math.min(minCy, cy);
        maxCx = Math.max(maxCx, cx);
        maxCy = Math.max(maxCy, cy);
      }
    }
    if (!isFinite(minCx)) return;

    const bboxW = maxCx - minCx;
    const bboxH = maxCy - minCy;
    const padding = 60;
    const fitZoom = Math.min(
      (cw - padding * 2) / Math.max(bboxW, 1),
      (ch - padding * 2) / Math.max(bboxH, 1),
      3
    );
    const centerBboxX = (minCx + maxCx) / 2;
    const centerBboxY = (minCy + maxCy) / 2;
    setZoom(fitZoom);
    setPan(cw / 2 - centerBboxX * fitZoom, ch / 2 - centerBboxY * fitZoom);
  };

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-[#0d1b2a] border-b border-[#1e3a5f]">
      {/* ツールグループ */}
      {toolGroups.map((group, gi) => (
        <React.Fragment key={group.label}>
          {gi > 0 && <div className="w-px h-6 bg-[#1e3a5f] mx-0.5" />}
          {group.tools.map((t) => (
            <button
              key={t.tool}
              onClick={() => setActiveTool(t.tool)}
              className={`group relative flex items-center justify-center w-8 h-8 rounded transition-all ${
                activeTool === t.tool
                  ? 'bg-[#1e3a5f] text-[#4a90d9] ring-1 ring-[#4a90d9]/60 shadow-[0_0_8px_rgba(74,144,217,0.25)]'
                  : 'text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4]'
              }`}
              aria-label={t.label}
              aria-pressed={activeTool === t.tool}
              title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}`}
            >
              {t.icon}
              {/* ショートカットキー表示（右下に小さく） */}
              {t.shortcut && (
                <span
                  className={`absolute -bottom-0.5 -right-0.5 text-[8px] font-mono font-bold leading-none ${
                    activeTool === t.tool ? 'text-[#4a90d9]' : 'text-[#3a5a7a] group-hover:text-[#6b8ab5]'
                  }`}
                >
                  {t.shortcut}
                </span>
              )}
            </button>
          ))}
        </React.Fragment>
      ))}

      {/* セパレータ */}
      <div className="w-px h-6 bg-[#1e3a5f] mx-1" />

      {/* 壁ユーティリティ */}
      <button
        onClick={() => useCorrectionStore.getState().snapWallEndpoints()}
        className="flex items-center justify-center w-8 h-8 rounded text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4] transition-all"
        title="壁端点スナップ（200mm以内の端点を結合）"
        aria-label="壁端点スナップ"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2.5" fill="currentColor" opacity="0.3" />
          <circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
          <path d="M8 6h8" strokeDasharray="2 2" /><path d="M6 8v8" /><path d="M18 8v8" />
        </svg>
      </button>
      <button
        onClick={() => useCorrectionStore.getState().straightenWalls()}
        className="flex items-center justify-center w-8 h-8 rounded text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4] transition-all"
        title="壁を水平/垂直に矯正（5°以内）"
        aria-label="壁矯正"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" />
          <path d="M5 8l3-3" opacity="0.4" /><path d="M5 8h3v-3" />
        </svg>
      </button>

      <div className="w-px h-6 bg-[#1e3a5f] mx-1" />

      {/* Undo / Redo */}
      <button
        onClick={undo}
        disabled={!canUndo}
        className={`flex items-center justify-center w-8 h-8 rounded transition-all ${
          canUndo ? 'text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4]' : 'text-[#2a3a4f] cursor-not-allowed'
        }`}
        title="元に戻す (Ctrl+Z)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
      </button>
      <button
        onClick={redo}
        disabled={!canRedo}
        className={`flex items-center justify-center w-8 h-8 rounded transition-all ${
          canRedo ? 'text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4]' : 'text-[#2a3a4f] cursor-not-allowed'
        }`}
        title="やり直す (Ctrl+Y)"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
        </svg>
      </button>

      <div className="w-px h-6 bg-[#1e3a5f] mx-1" />

      {/* 表示コントロール */}
      <button
        onClick={handleFitAll}
        className="flex items-center justify-center w-8 h-8 rounded text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4] transition-all"
        title="全体表示 (Ctrl+0)"
      >
        <FitAllIcon />
      </button>

      <button
        onClick={() => setGridVisible(!gridVisible)}
        className={`flex items-center justify-center w-8 h-8 rounded transition-all ${
          gridVisible ? 'bg-[#1e3a5f] text-[#4a90d9]' : 'text-[#6b8ab5] hover:bg-[#16213e]'
        }`}
        title="グリッド表示 (G)"
      >
        <GridIcon />
      </button>

      <button
        onClick={() => setSnapEnabled(!snapEnabled)}
        className={`flex items-center justify-center w-8 h-8 rounded transition-all ${
          snapEnabled ? 'bg-[#1e3a5f] text-[#f59e0b]' : 'text-[#6b8ab5] hover:bg-[#16213e]'
        }`}
        title="スナップ (S)"
      >
        <SnapIcon />
      </button>

      <button
        onClick={() => setCompareMode(!compareMode)}
        className={`flex items-center justify-center w-8 h-8 rounded transition-all ${
          compareMode ? 'bg-[#1e3a5f] text-[#ef4444] ring-1 ring-[#ef4444]/60' : 'text-[#6b8ab5] hover:bg-[#16213e]'
        }`}
        title="修正前と比較"
        aria-label="比較モード"
      >
        <CompareIcon />
      </button>

      <button
        onClick={() => useCorrectionStore.getState().autoAlignToPdf()}
        className="flex items-center justify-center w-8 h-8 rounded text-[#6b8ab5] hover:bg-[#16213e] hover:text-[#8ba4c4] transition-all"
        title="PDF背景に自動整列"
        aria-label="自動整列"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          <path d="M14 3h7v7" /><path d="M3 14v7h7" />
        </svg>
      </button>

      {/* ズーム表示 */}
      <span className="text-[11px] text-[#6b8ab5] tabular-nums min-w-[48px] text-center font-mono">
        {Math.round(zoom * 100)}%
      </span>

      {/* 不明室ボタン */}
      {unknownCount > 0 && (
        <>
          <div className="w-px h-6 bg-[#1e3a5f] mx-1" />
          <button
            onClick={handleNextUnknown}
            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold bg-amber-500/90 text-white hover:bg-amber-500 active:bg-amber-600 transition-colors"
            title="次の不明室にジャンプ"
          >
            <span>不明室</span>
            <span className="text-[10px]">({unknownCount})</span>
          </button>
        </>
      )}

      {/* 選択中の部屋情報 */}
      {selectedRoom && (
        <>
          <div className="w-px h-6 bg-[#1e3a5f] mx-1" />
          <span className="text-[11px] text-[#4a90d9] font-medium truncate max-w-[180px] font-mono">
            {selectedRoom.name || '不明'} | {selectedRoom.area_m2}m2
          </span>
        </>
      )}
    </div>
  );
}
