'use client';

import React from 'react';
import { Html } from '@react-three/drei';
import { FurnitureItem } from '@/types/scene';

interface FurnitureDimensionLabelProps {
  item: FurnitureItem;
  visible: boolean; // true when hovered
}

/**
 * 家具ホバー時に幅x奥行x高さのラベルを表示するコンポーネント。
 * Html (drei) を使って3D空間上にオーバーレイ表示する。
 */
export const FurnitureDimensionLabel = React.memo(function FurnitureDimensionLabel({
  item,
  visible,
}: FurnitureDimensionLabelProps) {
  if (!visible) return null;

  const [w, h, d] = item.scale;

  return (
    <Html
      position={[0, h + 0.2, 0]}
      center
      style={{ pointerEvents: 'none' }}
      zIndexRange={[100, 0]}
    >
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          color: '#fff',
          fontSize: '11px',
          padding: '2px 6px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
          fontFamily: 'system-ui, sans-serif',
          lineHeight: 1.4,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        W&times;D&times;H: {w.toFixed(2)}&times;{d.toFixed(2)}&times;{h.toFixed(2)}m
      </div>
    </Html>
  );
});
