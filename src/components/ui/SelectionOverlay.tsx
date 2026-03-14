'use client';

import React from 'react';
import { SelectionRect } from '@/hooks/useDragSelect';

/**
 * 矩形ドラッグ選択のビジュアルオーバーレイ。
 * 3Dビューポートの上に絶対配置で表示。
 * 青い半透明矩形と破線ボーダーで選択範囲を示す。
 */

interface SelectionOverlayProps {
  /** 選択矩形の座標とサイズ（スクリーンピクセル） */
  rect: SelectionRect | null;
  /** オーバーレイの表示/非表示 */
  visible: boolean;
}

export const SelectionOverlay = React.memo(function SelectionOverlay({
  rect,
  visible,
}: SelectionOverlayProps) {
  if (!visible || !rect) return null;

  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        border: '2px dashed rgba(59, 130, 246, 0.7)',
        borderRadius: 2,
        zIndex: 50,
      }}
    />
  );
});

SelectionOverlay.displayName = 'SelectionOverlay';
