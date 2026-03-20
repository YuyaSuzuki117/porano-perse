'use client';

import { useState } from 'react';
import { useCorrectionStore } from '@/stores/useCorrectionStore';
import type { LayerVisibility } from '@/types/blueprint';

interface LayerDef {
  key: keyof LayerVisibility;
  label: string;
  shortcutNum: number;
  color: string;
}

const layerDefs: LayerDef[] = [
  { key: 'pdf', label: 'PDF背景', shortcutNum: 1, color: '#8b8b8b' },
  { key: 'grid', label: 'グリッド', shortcutNum: 2, color: '#4a6a8a' },
  { key: 'rooms', label: '部屋ポリゴン', shortcutNum: 3, color: '#3b82f6' },
  { key: 'walls', label: '壁線', shortcutNum: 4, color: '#6b7280' },
  { key: 'fixtures', label: '什器', shortcutNum: 5, color: '#22c55e' },
  { key: 'labels', label: '室名ラベル', shortcutNum: 6, color: '#1d4ed8' },
  { key: 'dimensions', label: '寸法線', shortcutNum: 7, color: '#9ca3af' },
];

export default function LayerPanel() {
  const layers = useCorrectionStore((s) => s.layers);
  const pdfOpacity = useCorrectionStore((s) => s.pdfOpacity);
  const setLayerVisible = useCorrectionStore((s) => s.setLayerVisible);
  const setPdfOpacity = useCorrectionStore((s) => s.setPdfOpacity);

  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-t border-[#1e3a5f]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-bold text-[#8ba4c4] hover:bg-[#1e3a5f]/50 transition-colors"
      >
        <span>レイヤー</span>
        <span className="text-[10px]">{collapsed ? '+' : '-'}</span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-2 space-y-0.5">
          {layerDefs.map((def) => (
            <label
              key={def.key}
              className="flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer hover:bg-[#1e3a5f]/30 transition-colors group"
            >
              {/* カラーインジケータ */}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: layers[def.key] ? def.color : '#333',
                  opacity: layers[def.key] ? 1 : 0.3,
                }}
              />
              {/* チェックボックス */}
              <input
                type="checkbox"
                checked={layers[def.key]}
                onChange={(e) => setLayerVisible(def.key, e.target.checked)}
                className="w-3 h-3 rounded border-[#1e3a5f] bg-[#0d1b2a] text-[#4a90d9] focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              {/* ラベル */}
              <span className={`text-[11px] flex-1 ${layers[def.key] ? 'text-[#c8d8e8]' : 'text-[#4a5568]'}`}>
                {def.label}
              </span>
              {/* ショートカット */}
              <span className="text-[9px] text-[#4a6a8a] opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                {def.shortcutNum}
              </span>
            </label>
          ))}

          {/* PDF不透明度スライダー */}
          {layers.pdf && (
            <div className="px-1.5 pt-1.5">
              <div className="flex items-center justify-between text-[10px] text-[#6b8ab5] mb-0.5">
                <span>PDF不透明度</span>
                <span className="font-mono text-[#c8d8e8]">{Math.round(pdfOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(pdfOpacity * 100)}
                onChange={(e) => setPdfOpacity(parseInt(e.target.value) / 100)}
                className="w-full h-1 bg-[#1e3a5f] rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#4a90d9]
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
