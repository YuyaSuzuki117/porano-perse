'use client';

import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';

interface FurnitureContextMenuProps {
  furnitureId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

/**
 * モバイル3Dビュー用長押しコンテキストメニュー。
 * 回転・複製・ロック・削除をタッチで操作可能にする。
 */
export const FurnitureContextMenu = React.memo(function FurnitureContextMenu({
  furnitureId,
  position,
  onClose,
}: FurnitureContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const rotateFurniture = useEditorStore((s) => s.rotateFurniture);
  const duplicateFurniture = useEditorStore((s) => s.duplicateFurniture);
  const toggleLockFurniture = useEditorStore((s) => s.toggleLockFurniture);
  const deleteFurniture = useEditorStore((s) => s.deleteFurniture);
  const furniture = useEditorStore((s) => s.furniture);

  const item = furniture.find((f) => f.id === furnitureId);
  const isLocked = item?.locked ?? false;

  // メニュー外タップで閉じる
  useEffect(() => {
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 少し遅延して登録（長押しイベントの伝播を防ぐ）
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('touchstart', handleOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [onClose]);

  // メニューが画面外にはみ出さないよう調整
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 160),
    top: Math.min(position.y, window.innerHeight - 200),
    zIndex: 9999,
  };

  const actions: { label: string; onClick: () => void }[] = [
    {
      label: '回転',
      onClick: () => {
        const currentRot = item?.rotation[1] ?? 0;
        rotateFurniture(furnitureId, currentRot + Math.PI / 2);
        onClose();
      },
    },
    {
      label: '複製',
      onClick: () => {
        duplicateFurniture(furnitureId);
        onClose();
      },
    },
    {
      label: isLocked ? 'ロック解除' : 'ロック',
      onClick: () => {
        toggleLockFurniture(furnitureId);
        onClose();
      },
    },
    {
      label: '削除',
      onClick: () => {
        deleteFurniture(furnitureId);
        onClose();
      },
    },
  ];

  return (
    <div ref={menuRef} style={menuStyle}>
      <div
        style={{
          background: 'rgba(30, 30, 30, 0.95)',
          borderRadius: '12px',
          padding: '4px 0',
          minWidth: '140px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden',
        }}
      >
        {actions.map((action, i) => (
          <button
            key={action.label}
            onClick={action.onClick}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              color: action.label === '削除' ? '#ef4444' : '#fff',
              fontSize: '14px',
              textAlign: 'left',
              cursor: 'pointer',
              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              fontFamily: 'system-ui, sans-serif',
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
});
