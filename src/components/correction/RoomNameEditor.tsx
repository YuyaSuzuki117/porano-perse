'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { parseScale, mmToCanvas } from '@/lib/blueprint-geometry';
import { showToast } from '@/components/correction/Toast';

/**
 * 室名編集用フローティング入力 (ダークテーマ)
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

  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');

  const room = blueprint && selectedRoomIdx !== null ? blueprint.rooms[selectedRoomIdx] : null;
  const isVisible = activeTool === 'editName' && room !== null;

  useEffect(() => {
    if (isVisible && room) {
      setName(room.name === '不明' ? '' : room.name);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isVisible, room]);

  const handleSave = useCallback(() => {
    if (selectedRoomIdx !== null && name.trim() !== '') {
      setRoomName(selectedRoomIdx, name.trim());
      showToast(`${name.trim()} に変更`);
    }
    setActiveTool('select');
  }, [selectedRoomIdx, name, setRoomName, setActiveTool]);

  const handleCancel = useCallback(() => {
    setActiveTool('select');
  }, [setActiveTool]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); handleCancel(); }
    },
    [handleSave, handleCancel]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (selectedRoomIdx !== null) {
        setRoomName(selectedRoomIdx, suggestion);
        showToast(`${suggestion} に変更`);
      }
      setActiveTool('select');
    },
    [selectedRoomIdx, setRoomName, setActiveTool]
  );

  if (!isVisible || !room || !blueprint) return null;

  const genericSuggestions = [
    'ホール', 'VIPルーム', 'トイレ', '厨房', '事務所',
    '倉庫', '更衣室', '通路', 'EV', 'PS',
    '控室', 'クローク', 'エントランス', 'バックヤード', '洗面所',
  ];

  const nearbyTexts = room.nearby_texts ?? [];
  const genericSet = new Set(genericSuggestions);
  const filteredNearby = nearbyTexts.filter((t) => !genericSet.has(t));
  const filteredGeneric = genericSuggestions.filter((s) => !nearbyTexts.includes(s));

  const scale = parseScale(blueprint.scale_detected);
  const dpi = pdfInfo?.dpi ?? 150;
  const pageHeightPx = pdfInfo?.pageHeightPx ?? (blueprint.room.depth_mm / scale) * dpi / 25.4;
  const { cx, cy } = mmToCanvas(room.center_mm[0], room.center_mm[1], scale, dpi, pageHeightPx, zoom, panX, panY);

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={{ left: `${cx}px`, top: `${cy}px`, transform: 'translate(-50%, -50%)' }}
    >
      <div className="bg-[#16213e] rounded-lg shadow-xl border border-[#4a90d9]/50 p-2 min-w-[220px]">
        <div className="text-[10px] text-[#4a6a8a] mb-1 text-right font-mono">
          {room.area_m2}m2
        </div>

        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            placeholder="室名を入力"
            className="px-2 py-1 text-sm bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] rounded focus:outline-none focus:ring-1 focus:ring-[#4a90d9] flex-1 min-w-0"
          />
          <button
            onClick={handleSave}
            className="px-2 py-1 text-xs bg-[#4a90d9] text-white rounded hover:bg-[#3a80c9] shrink-0"
          >
            OK
          </button>
          <button
            onClick={handleCancel}
            className="px-2 py-1 text-xs bg-[#1e3a5f] text-[#6b8ab5] rounded hover:bg-[#2a4a6f] shrink-0"
          >
            x
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {filteredNearby.map((s) => (
            <button
              key={`nearby-${s}`}
              onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(s); }}
              className="px-1.5 py-0.5 text-[10px] rounded border border-[#4a90d9]/50 bg-[#4a90d9]/10 text-[#4a90d9] hover:bg-[#4a90d9]/20 transition-colors"
            >
              * {s}
            </button>
          ))}
          {filteredGeneric.map((s) => (
            <button
              key={s}
              onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(s); }}
              className="px-1.5 py-0.5 text-[10px] rounded border border-[#1e3a5f] text-[#6b8ab5] hover:bg-[#1e3a5f] hover:text-[#8ba4c4] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
