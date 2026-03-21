'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { parseScale, mmToCanvas } from '@/lib/blueprint-geometry';
import { showToast } from '@/components/correction/Toast';

const COMMON_NAMES = [
  'トイレ', '廊下', 'PS', 'EV', 'ENT', '更衣室', 'バックヤード',
  '事務室', '倉庫', '玄関', '洗面所', '厨房', 'ホール',
  'カウンター', 'VIPルーム', '個室', '待合室',
];

/**
 * 室名編集用フローティング入力 (ダークテーマ)
 * Tab で不明室を巡回、クイックネームボタン付き
 */
export default function RoomNameEditor() {
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const pdfInfo = useCorrectionStore((s) => s.pdfInfo);
  const zoom = useCorrectionStore((s) => s.zoom);
  const panX = useCorrectionStore((s) => s.panX);
  const panY = useCorrectionStore((s) => s.panY);
  const activeTool = useCorrectionStore((s) => s.activeTool);
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);
  const setRoomName = useCorrectionStore((s) => s.setRoomName);
  const setActiveTool = useCorrectionStore((s) => s.setActiveTool);
  const navigateUnknown = useCorrectionStore((s) => s.navigateUnknown);

  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  const room = blueprint && selectedRoomIdx !== null ? blueprint.rooms[selectedRoomIdx] : null;
  const isVisible = activeTool === 'editName' && room !== null;

  // 不明室の進捗カウント
  const unknownProgress = useMemo(() => {
    if (!blueprint) return { current: 0, total: 0 };
    const unknowns = blueprint.rooms
      .map((r, i) => ({ idx: i, name: r.name }))
      .filter(r => !r.name || r.name === '不明');
    const currentPos = unknowns.findIndex(u => u.idx === selectedRoomIdx);
    return { current: currentPos + 1, total: unknowns.length };
  }, [blueprint, selectedRoomIdx]);

  useEffect(() => {
    if (isVisible && room) {
      setName(room.name === '不明' ? '' : room.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isVisible, room, selectedRoomIdx]);

  const handleSave = useCallback(() => {
    if (selectedRoomIdx !== null && name.trim() !== '') {
      setRoomName(selectedRoomIdx, name.trim());
      showToast(`${name.trim()} に変更`);
      // 確定後、次の不明室へ自動ナビゲーション
      navigateUnknown('next');
    }
  }, [selectedRoomIdx, name, setRoomName, navigateUnknown]);

  const handleCancel = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        navigateUnknown(e.shiftKey ? 'prev' : 'next');
      }
    },
    [handleSave, handleCancel, navigateUnknown]
  );

  const handleQuickName = useCallback(
    (suggestion: string) => {
      if (selectedRoomIdx !== null) {
        setRoomName(selectedRoomIdx, suggestion);
        showToast(`${suggestion} に変更`);
        // 次の不明室へ自動ナビゲーション
        navigateUnknown('next');
      }
    },
    [selectedRoomIdx, setRoomName, navigateUnknown]
  );

  if (!isVisible || !room || !blueprint) return null;

  const nearbyTexts = room.nearby_texts ?? [];
  const commonSet = new Set(COMMON_NAMES);
  const filteredNearby = nearbyTexts.filter((t) => !commonSet.has(t));
  const filteredCommon = COMMON_NAMES.filter((s) => !nearbyTexts.includes(s));

  const scale = parseScale(blueprint.scale_detected);
  const dpi = pdfInfo?.dpi ?? 150;
  const pageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * dpi / 25.4;
  const { cx, cy } = mmToCanvas(room.center_mm[0], room.center_mm[1], scale, dpi, pageHeightPx, zoom, panX, panY);

  // パネル位置: 部屋の近くに表示 (画面外の場合は上部中央にフォールバック)
  const container = document.querySelector('[data-correction-canvas]');
  const containerRect = container?.getBoundingClientRect();
  const isOffScreen = !containerRect ||
    cx < 0 || cy < 0 ||
    cx > containerRect.width || cy > containerRect.height;

  const panelStyle = isOffScreen
    ? { left: '50%', top: '8px', transform: 'translateX(-50%)' }
    : { left: `${cx}px`, top: `${cy}px`, transform: 'translate(-50%, -50%)' };

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={panelStyle}
    >
      <div className="bg-[#16213e] rounded-lg shadow-xl border border-[#4a90d9]/50 p-2 min-w-[260px] max-w-[320px]">
        {/* ヘッダー: 進捗 + 面積 */}
        <div className="flex items-center justify-between mb-1">
          <div className="text-[10px] font-mono">
            {unknownProgress.total > 0 ? (
              <span className="text-[#f59e0b]">
                {unknownProgress.current}/{unknownProgress.total} 不明室
              </span>
            ) : (
              <span className="text-[#22c55e]">全室名前付き</span>
            )}
          </div>
          <div className="text-[10px] text-[#4a6a8a] font-mono">
            Room#{selectedRoomIdx} {room.area_m2}m2
          </div>
        </div>

        {/* 入力行 */}
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="室名を入力 (Enter確定)"
            className="px-2 py-1 text-sm bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] rounded focus:outline-none focus:ring-1 focus:ring-[#4a90d9] flex-1 min-w-0"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
            className="px-2 py-1 text-xs bg-[#4a90d9] text-white rounded hover:bg-[#3a80c9] shrink-0"
          >
            OK
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); handleCancel(); }}
            className="px-2 py-1 text-xs bg-[#1e3a5f] text-[#6b8ab5] rounded hover:bg-[#2a4a6f] shrink-0"
          >
            x
          </button>
        </div>

        {/* nearby_texts 候補 (ハイライト) */}
        {filteredNearby.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {filteredNearby.map((s) => (
              <button
                key={`nearby-${s}`}
                onMouseDown={(e) => { e.preventDefault(); handleQuickName(s); }}
                className="px-1.5 py-0.5 text-[10px] rounded border border-[#4a90d9]/50 bg-[#4a90d9]/20 text-[#4a90d9] hover:bg-[#4a90d9]/30 transition-colors font-medium"
              >
                * {s}
              </button>
            ))}
          </div>
        )}

        {/* 定型室名ボタングリッド */}
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          {filteredCommon.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); handleQuickName(s); }}
              className="px-1 py-0.5 text-[10px] rounded border border-[#1e3a5f] text-[#6b8ab5] hover:bg-[#1e3a5f] hover:text-[#8ba4c4] transition-colors truncate"
            >
              {s}
            </button>
          ))}
        </div>

        {/* 操作ヒント */}
        <div className="mt-1.5 text-[9px] text-[#4a6a8a] text-center">
          Tab: 次の不明室 | Shift+Tab: 前 | Enter: 確定+次へ
        </div>
      </div>
    </div>
  );
}
