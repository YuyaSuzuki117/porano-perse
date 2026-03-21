'use client';

import { useState, useEffect, useCallback } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { polygonBBox } from '@/lib/blueprint-geometry';
import { showToast } from './Toast';

/**
 * 座標パネル: 選択中の要素の正確な数値入力
 */
export default function CoordinatePanel() {
  const blueprint = useCorrectionStore((s) => s.blueprint);
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);
  const selectedVertexIdx = useCorrectionStore((s) => s.selectedVertexIdx);
  const selectedWallIdx = useCorrectionStore((s) => s.selectedWallIdx);
  const selectedFixtureIdx = useCorrectionStore((s) => s.selectedFixtureIdx);
  const moveVertex = useCorrectionStore((s) => s.moveVertex);
  const moveFixture = useCorrectionStore((s) => s.moveFixture);

  const [collapsed, setCollapsed] = useState(false);
  const [editX, setEditX] = useState('');
  const [editY, setEditY] = useState('');

  const room = blueprint && selectedRoomIdx !== null ? blueprint.rooms[selectedRoomIdx] : null;
  const wall = blueprint && selectedWallIdx !== null ? blueprint.walls[selectedWallIdx] : null;
  const fixture = blueprint && selectedFixtureIdx !== null ? blueprint.fixtures[selectedFixtureIdx] : null;
  const vertex = room && selectedVertexIdx !== null ? room.polygon_mm[selectedVertexIdx] : null;

  // 選択変更時に値をリセット
  useEffect(() => {
    if (vertex) {
      setEditX(String(vertex[0]));
      setEditY(String(vertex[1]));
    } else if (fixture) {
      setEditX(String(fixture.x_mm));
      setEditY(String(fixture.y_mm));
    } else {
      setEditX('');
      setEditY('');
    }
  }, [vertex, fixture, selectedVertexIdx, selectedFixtureIdx]);

  const handleApply = useCallback(() => {
    const x = parseFloat(editX);
    const y = parseFloat(editY);
    if (isNaN(x) || isNaN(y)) {
      showToast('無効な数値です');
      return;
    }
    if (x < 0 || y < 0) {
      showToast('座標は正の値にしてください');
      return;
    }
    if (x > 100000 || y > 100000) {
      showToast('座標が範囲外です');
      return;
    }

    if (selectedRoomIdx !== null && selectedVertexIdx !== null) {
      moveVertex(selectedRoomIdx, selectedVertexIdx, x, y);
    } else if (selectedFixtureIdx !== null) {
      moveFixture(selectedFixtureIdx, x, y);
    }
  }, [editX, editY, selectedRoomIdx, selectedVertexIdx, selectedFixtureIdx, moveVertex, moveFixture]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  }, [handleApply]);

  const hasSelection = room || wall || fixture;
  if (!hasSelection || !blueprint) return null;

  // 部屋のバウンディングボックス
  const roomBBox = room ? polygonBBox(room.polygon_mm) : null;

  // 壁の長さ
  const wallLength = wall
    ? Math.round(Math.hypot(wall.end_x_mm - wall.start_x_mm, wall.end_y_mm - wall.start_y_mm))
    : null;

  return (
    <div className="border-t border-[#1e3a5f]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-[#8ba4c4] hover:bg-[#1e3a5f]/50 transition-colors"
      >
        <span>座標</span>
        <span className="text-[10px]">{collapsed ? '+' : '-'}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-1.5">
          {/* 部屋情報 */}
          {room && (
            <>
              <div className="text-[10px] text-[#6b8ab5] font-medium mb-1">
                部屋: {room.name || '不明'}
              </div>
              {roomBBox && (
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div className="text-[#6b8ab5]">幅: <span className="text-[#c8d8e8] font-mono">{roomBBox.width}mm</span></div>
                  <div className="text-[#6b8ab5]">奥行: <span className="text-[#c8d8e8] font-mono">{roomBBox.height}mm</span></div>
                  <div className="text-[#6b8ab5]">面積: <span className="text-[#c8d8e8] font-mono">{room.area_m2}m2</span></div>
                  <div className="text-[#6b8ab5]">頂点: <span className="text-[#c8d8e8] font-mono">{room.polygon_mm.length}</span></div>
                </div>
              )}
            </>
          )}

          {/* 頂点座標入力 */}
          {vertex && (
            <div className="mt-1.5">
              <div className="text-[10px] text-[#6b8ab5] font-medium mb-1">
                頂点 #{(selectedVertexIdx ?? 0) + 1}
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-[9px] text-[#6b8ab5]">X (mm)</label>
                  <input
                    type="number"
                    value={editX}
                    onChange={(e) => setEditX(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] text-[11px] font-mono px-1.5 py-0.5 rounded focus:outline-none focus:border-[#4a90d9]"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[#6b8ab5]">Y (mm)</label>
                  <input
                    type="number"
                    value={editY}
                    onChange={(e) => setEditY(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] text-[11px] font-mono px-1.5 py-0.5 rounded focus:outline-none focus:border-[#4a90d9]"
                  />
                </div>
              </div>
              <button
                onClick={handleApply}
                className="mt-1 w-full text-[10px] bg-[#1e3a5f] text-[#8ba4c4] py-0.5 rounded hover:bg-[#2a4a6f] transition-colors"
              >
                適用
              </button>
            </div>
          )}

          {/* 壁情報 */}
          {wall && (
            <>
              <div className="text-[10px] text-[#6b8ab5] font-medium mb-1">
                壁: {wall.id}
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div className="text-[#6b8ab5]">始点X: <span className="text-[#c8d8e8] font-mono">{wall.start_x_mm}</span></div>
                <div className="text-[#6b8ab5]">始点Y: <span className="text-[#c8d8e8] font-mono">{wall.start_y_mm}</span></div>
                <div className="text-[#6b8ab5]">終点X: <span className="text-[#c8d8e8] font-mono">{wall.end_x_mm}</span></div>
                <div className="text-[#6b8ab5]">終点Y: <span className="text-[#c8d8e8] font-mono">{wall.end_y_mm}</span></div>
                <div className="text-[#6b8ab5]">長さ: <span className="text-[#c8d8e8] font-mono">{wallLength}mm</span></div>
                <div className="text-[#6b8ab5]">厚さ: <span className="text-[#c8d8e8] font-mono">{wall.thickness_mm}mm</span></div>
              </div>
            </>
          )}

          {/* 什器情報 */}
          {fixture && (
            <>
              <div className="text-[10px] text-[#6b8ab5] font-medium mb-1">
                什器: {fixture.name || '名称なし'}
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="text-[9px] text-[#6b8ab5]">X (mm)</label>
                  <input
                    type="number"
                    value={editX}
                    onChange={(e) => setEditX(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] text-[11px] font-mono px-1.5 py-0.5 rounded focus:outline-none focus:border-[#4a90d9]"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[#6b8ab5]">Y (mm)</label>
                  <input
                    type="number"
                    value={editY}
                    onChange={(e) => setEditY(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="w-full bg-[#0d1b2a] border border-[#1e3a5f] text-[#c8d8e8] text-[11px] font-mono px-1.5 py-0.5 rounded focus:outline-none focus:border-[#4a90d9]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1 text-[10px]">
                <div className="text-[#6b8ab5]">幅: <span className="text-[#c8d8e8] font-mono">{fixture.width_mm}mm</span></div>
                <div className="text-[#6b8ab5]">奥行: <span className="text-[#c8d8e8] font-mono">{fixture.depth_mm}mm</span></div>
                <div className="text-[#6b8ab5]">回転: <span className="text-[#c8d8e8] font-mono">{fixture.rotation_deg}deg</span></div>
              </div>
              <button
                onClick={handleApply}
                className="mt-1 w-full text-[10px] bg-[#1e3a5f] text-[#8ba4c4] py-0.5 rounded hover:bg-[#2a4a6f] transition-colors"
              >
                適用
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
