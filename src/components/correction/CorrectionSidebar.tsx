'use client';

import { useState, useCallback, useRef } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { parseScale, mmToCanvas, validateRoomArea } from '@/lib/blueprint-geometry';
import CoordinatePanel from './CoordinatePanel';
import LayerPanel from './LayerPanel';
import UndoHistory from './UndoHistory';


/**
 * 右サイドバー: 部屋一覧・什器・レイヤー・座標パネル
 * ダークテーマ CAD風
 */
export default function CorrectionSidebar() {
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);
  const selectRoom = useCorrectionStore((s) => s.selectRoom);
  const selectedRoomIndices = useCorrectionStore((s) => s.selectedRoomIndices);
  const toggleRoomSelect = useCorrectionStore((s) => s.toggleRoomSelect);
  const setActiveTool = useCorrectionStore((s) => s.setActiveTool);
  const setPan = useCorrectionStore((s) => s.setPan);
  const setZoom = useCorrectionStore((s) => s.setZoom);
  const zoom = useCorrectionStore((s) => s.zoom);
  const pdfInfo = useCorrectionStore((s) => s.pdfInfo);

  const snapshots = useCorrectionStore((s) => s._snapshots);
  const restoreSnapshot = useCorrectionStore((s) => s.restoreSnapshot);

  const [isOpen, setIsOpen] = useState(true);
  const [showUnknownOnly, setShowUnknownOnly] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [roomsCollapsed, setRoomsCollapsed] = useState(false);

  const handleRoomClick = useCallback(
    (idx: number) => {
      selectRoom(idx);
      if (blueprint) {
        const room = blueprint.rooms[idx];
        const scale = parseScale(blueprint.scale_detected);
        const dpi = pdfInfo?.dpi ?? 150;
        const pageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * dpi / 25.4;
        const { cx, cy } = mmToCanvas(room.center_mm[0], room.center_mm[1], scale, dpi, pageHeightPx, 1, 0, 0);
        const vpCenterX = (window.innerWidth - 260) / 2;
        const vpCenterY = (window.innerHeight - 100) / 2;
        setPan(vpCenterX - cx * zoom, vpCenterY - cy * zoom);
      }
    },
    [blueprint, pdfInfo, zoom, selectRoom, setPan]
  );

  const handleRoomDoubleClick = useCallback(
    (idx: number) => {
      if (!blueprint) return;
      const room = blueprint.rooms[idx];
      if (!room || room.polygon_mm.length < 3) return;
      selectRoom(idx);

      // 部屋のバウンディングボックスを計算してズーム
      const scale = parseScale(blueprint.scale_detected);
      const dpi = pdfInfo?.dpi ?? 150;
      const pageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * dpi / 25.4;

      let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
      for (const pt of room.polygon_mm) {
        const { cx, cy } = mmToCanvas(pt[0], pt[1], scale, dpi, pageHeightPx, 1, 0, 0);
        minCx = Math.min(minCx, cx); minCy = Math.min(minCy, cy);
        maxCx = Math.max(maxCx, cx); maxCy = Math.max(maxCy, cy);
      }

      // キャンバスのサイズを取得（サイドバー幅260pxを差し引く）
      const canvasW = window.innerWidth - 260;
      const canvasH = window.innerHeight - 100; // ツールバー + ExportBar分を差し引く
      const padding = 100;
      const bboxW = maxCx - minCx;
      const bboxH = maxCy - minCy;
      const fitZoom = Math.min(
        (canvasW - padding * 2) / Math.max(bboxW, 1),
        (canvasH - padding * 2) / Math.max(bboxH, 1),
        3
      );
      const centerX = (minCx + maxCx) / 2;
      const centerY = (minCy + maxCy) / 2;
      setZoom(fitZoom);
      setPan(canvasW / 2 - centerX * fitZoom, canvasH / 2 - centerY * fitZoom);
    },
    [blueprint, pdfInfo, selectRoom, setZoom, setPan]
  );

  const handleEditClick = useCallback(
    (e: React.MouseEvent, idx: number) => {
      e.stopPropagation();
      selectRoom(idx);
      setActiveTool('editName');
    },
    [selectRoom, setActiveTool]
  );

  if (!blueprint) return null;

  const rooms = blueprint.rooms;
  const fixtures = blueprint.fixtures;
  const warnings = blueprint.warnings ?? [];

  const unknownCount = rooms.filter((r) => r.name === '不明' || r.name === '').length;
  const namedCount = rooms.length - unknownCount;
  const namedFixtures = fixtures.filter((f) => f.name && f.name !== '').length;
  const progressPercent = rooms.length > 0 ? Math.round((namedCount / rooms.length) * 100) : 0;

  const filteredRooms = showUnknownOnly
    ? rooms.map((room, idx) => ({ room, idx })).filter(({ room }) => room.name === '不明' || room.name === '')
    : rooms.map((room, idx) => ({ room, idx }));

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-[#16213e] border border-[#1e3a5f] rounded-l-lg px-1 py-4 shadow text-[#6b8ab5] hover:text-[#8ba4c4] hover:bg-[#1e3a5f]"
        title="サイドバーを開く"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    );
  }

  return (
    <div className="w-[260px] h-full bg-[#16213e] border-l border-[#1e3a5f] flex flex-col overflow-hidden">
      {/* ヘッダー: 部屋一覧 */}
      <div className="px-3 py-2 border-b border-[#1e3a5f]">
        <div className="flex items-center justify-between mb-1.5">
          <button
            onClick={() => setRoomsCollapsed(!roomsCollapsed)}
            className="text-xs font-bold text-[#8ba4c4] hover:text-[#c8d8e8] flex items-center gap-1"
          >
            <span className="text-[10px]">{roomsCollapsed ? '+' : '-'}</span>
            部屋一覧 ({rooms.length})
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="text-[#4a6a8a] hover:text-[#8ba4c4] transition-colors"
            title="サイドバーを閉じる"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* 進捗バー */}
        <div className="mb-1.5">
          <div className="flex items-center justify-between text-[10px] mb-0.5">
            <span className="text-[#6b8ab5]">
              {namedCount}/{rooms.length}室
            </span>
            <span className={`font-bold font-mono ${progressPercent === 100 ? 'text-green-400' : 'text-[#4a90d9]'}`}>
              {progressPercent}%
            </span>
          </div>
          <div className="w-full h-1 bg-[#0d1b2a] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progressPercent === 100 ? 'bg-green-500' : 'bg-[#4a90d9]'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {unknownCount > 0 && (
          <label className="flex items-center gap-1.5 text-[10px] text-[#6b8ab5] cursor-pointer">
            <input
              type="checkbox"
              checked={showUnknownOnly}
              onChange={(e) => setShowUnknownOnly(e.target.checked)}
              className="w-3 h-3 rounded border-[#1e3a5f] bg-[#0d1b2a] text-red-500 focus:ring-0"
            />
            <span className="text-red-400">不明のみ ({unknownCount})</span>
          </label>
        )}
      </div>

      {/* 部屋リスト */}
      {!roomsCollapsed && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <ul>
            {filteredRooms.map(({ room, idx }) => {
              const isUnknown = room.name === '不明' || room.name === '';
              const isSelected = selectedRoomIdx === idx;
              const isHovered = hoveredIdx === idx && !isSelected;
              const conf = room.confidence;
              const dotColor = (isUnknown || (conf !== undefined && conf < 0.5))
                ? '#ef4444'
                : (conf !== undefined && conf < 0.8)
                  ? '#eab308'
                  : '#22c55e';

              const isMultiSelected = selectedRoomIndices.includes(idx);

              return (
                <li key={idx}>
                  <button
                    onClick={(e) => {
                      if (e.shiftKey) {
                        toggleRoomSelect(idx);
                      } else {
                        handleRoomClick(idx);
                      }
                    }}
                    onDoubleClick={() => handleRoomDoubleClick(idx)}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors group border-l-2 ${
                      isSelected
                        ? 'bg-[#1e3a5f]/60 border-[#4a90d9] text-[#c8d8e8]'
                        : isMultiSelected
                          ? 'bg-[#1e3a5f]/40 border-l-2 border-cyan-400 text-[#c8d8e8]'
                          : isHovered
                            ? 'bg-[#1e3a5f]/30 border-[#4a6a8a] text-[#8ba4c4]'
                            : 'border-transparent text-[#6b8ab5] hover:bg-[#1e3a5f]/20'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className={`font-medium truncate ${isUnknown ? 'text-red-400' : ''}`}>
                        {room.name || '不明'}
                      </span>
                      {conf !== undefined && (
                        <span className="text-[9px] text-[#4a6a8a] tabular-nums font-mono">
                          {Math.round(conf * 100)}%
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        <button
                          onClick={(e) => handleEditClick(e, idx)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[#1e3a5f] transition-opacity text-[#4a90d9]"
                          title="室名を編集"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {(() => {
                          const v = validateRoomArea(room);
                          if (!v.valid && v.expected !== null) {
                            return (
                              <span className="text-[9px] text-amber-400 tabular-nums font-mono" title={`差異: ${v.diffPercent?.toFixed(0)}%`}>
                                {room.area_m2}m2 ⚠ PDF:{v.expected}m2
                              </span>
                            );
                          }
                          return (
                            <span className="text-[9px] text-[#4a6a8a] tabular-nums font-mono">
                              {room.area_m2}m2
                            </span>
                          );
                        })()}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* 什器セクション */}
          <div className="border-t border-[#1e3a5f] mt-1">
            <div className="px-3 py-1.5">
              <h3 className="text-[10px] font-bold text-[#6b8ab5]">
                什器 ({fixtures.length})
              </h3>
            </div>
            <div className="px-3 pb-1.5 text-[10px] text-[#4a6a8a] font-mono">
              <span>名前あり: {namedFixtures}</span>
              <span className="mx-1.5">|</span>
              <span>名前なし: {fixtures.length - namedFixtures}</span>
            </div>
          </div>

          {/* 警告セクション */}
          {warnings.length > 0 && (
            <div className="border-t border-[#1e3a5f] mt-1">
              <div className="px-3 py-1.5">
                <h3 className="text-[10px] font-bold text-amber-400">
                  警告 ({warnings.length})
                </h3>
              </div>
              <ul className="px-3 pb-1.5 space-y-0.5">
                {warnings.map((w, i) => (
                  <li key={i} className="text-[10px] text-amber-400/80 flex items-start gap-1">
                    <span className="shrink-0 mt-0.5">!</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* レイヤーパネル */}
      <LayerPanel />

      {/* 操作履歴パネル */}
      <UndoHistory />

      {/* バックアップパネル */}
      {snapshots.length > 0 && (
        <div className="border-t border-[#1e3a5f] mt-1">
          <div className="px-3 py-1.5">
            <h3 className="text-[10px] font-bold text-[#6b8ab5] uppercase tracking-wider">
              バックアップ ({snapshots.length})
            </h3>
          </div>
          <ul className="max-h-24 overflow-y-auto">
            {snapshots.map((snap, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-1 text-[10px] text-[#6b8ab5]">
                <span>{new Date(snap.timestamp).toLocaleTimeString('ja-JP')}</span>
                <button
                  onClick={() => restoreSnapshot(i)}
                  className="text-[#4a90d9] hover:text-white text-[9px]"
                >
                  復元
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 座標パネル */}
      <CoordinatePanel />
    </div>
  );
}
