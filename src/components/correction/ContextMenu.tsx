'use client';

import { useEffect, useCallback } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import { showToast } from './Toast';

export interface ContextMenuState {
  x: number;
  y: number;
  roomIdx: number | null;
  wallIdx: number | null;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
  onZoomToRoom: (roomIdx: number) => void;
  onFitAll: () => void;
}

interface MenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

/**
 * 右クリックコンテキストメニュー (ダークテーマ)
 */
export default function ContextMenu({ menu, onClose, onZoomToRoom, onFitAll }: ContextMenuProps) {
  const selectedRoomIdx = useCorrectionStore((s) => s.selectedRoomIdx);
  const selectRoom = useCorrectionStore((s) => s.selectRoom);
  const setActiveTool = useCorrectionStore((s) => s.setActiveTool);
  const deleteRoom = useCorrectionStore((s) => s.deleteRoom);
  const deleteWall = useCorrectionStore((s) => s.deleteWall);
  const mergeRooms = useCorrectionStore((s) => s.mergeRooms);

  // Escape / 外部クリックで閉じる
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = () => onClose();
    window.addEventListener('keydown', handleKey);
    window.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const exec = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  // メニュー項目を構築
  const items: MenuItem[] = [];

  if (menu.roomIdx !== null) {
    // --- 部屋上で右クリック ---
    const roomIdx = menu.roomIdx;
    items.push({
      label: '室名変更',
      action: () => exec(() => {
        selectRoom(roomIdx);
        setActiveTool('editName');
      }),
    });
    items.push({
      label: '部屋を削除',
      danger: true,
      action: () => exec(() => {
        deleteRoom(roomIdx);
        showToast('部屋を削除しました');
      }),
    });
    // マージ: 別の部屋が選択中の場合のみ
    if (selectedRoomIdx !== null && selectedRoomIdx !== roomIdx) {
      items.push({
        label: '選択中の部屋とマージ',
        action: () => exec(() => {
          mergeRooms(selectedRoomIdx, roomIdx);
          showToast('部屋をマージしました');
        }),
      });
    }
    items.push({
      label: 'この部屋にズーム',
      action: () => exec(() => onZoomToRoom(roomIdx)),
    });
  } else if (menu.wallIdx !== null) {
    // --- 壁上で右クリック ---
    const wallIdx = menu.wallIdx;
    items.push({
      label: '壁を削除',
      danger: true,
      action: () => exec(() => {
        deleteWall(wallIdx);
        showToast('壁を削除しました');
      }),
    });
    items.push({
      label: '壁を移動',
      action: () => exec(() => {
        setActiveTool('wallMove');
      }),
    });
  } else {
    // --- 空白エリアで右クリック ---
    items.push({
      label: '部屋を追加',
      action: () => exec(() => setActiveTool('addRoom')),
    });
    items.push({
      label: '全体移動モード',
      action: () => exec(() => setActiveTool('moveAll')),
    });
    items.push({
      label: 'フィットビュー',
      action: () => exec(() => onFitAll()),
    });
  }

  return (
    <div
      className="absolute z-50"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="min-w-[160px] rounded-md border border-[#1e3a5f] bg-[#16213e] shadow-xl py-1">
        {items.map((item, i) => (
          <button
            key={i}
            onClick={item.action}
            className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
              item.danger
                ? 'text-red-400 hover:bg-red-500/20'
                : 'text-[#c8d8e8] hover:bg-[#1e3a5f]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
