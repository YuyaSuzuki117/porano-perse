'use client';

import { useState, useCallback } from 'react';
import { FurnitureItem, FurnitureMaterial } from '@/types/scene';

const MATERIAL_OPTIONS: { value: FurnitureMaterial; label: string }[] = [
  { value: 'wood', label: '木材' },
  { value: 'metal', label: '金属' },
  { value: 'fabric', label: '布地' },
  { value: 'leather', label: 'レザー' },
  { value: 'glass', label: 'ガラス' },
  { value: 'plastic', label: 'プラスチック' },
  { value: 'stone', label: '石材' },
];

interface BatchEditPanelProps {
  selectedIds: string[];
  furniture: FurnitureItem[];
  onUpdate: (id: string, updates: Partial<FurnitureItem>) => void;
}

export function BatchEditPanel({ selectedIds, furniture, onUpdate }: BatchEditPanelProps) {
  const [uniformScale, setUniformScale] = useState(1.0);
  const [color, setColor] = useState('#888888');
  const [material, setMaterial] = useState<FurnitureMaterial>('wood');
  const [rotationY, setRotationY] = useState(0);

  const selectedFurniture = furniture.filter((f) => selectedIds.includes(f.id));

  const applyToAll = useCallback(
    (getUpdates: (item: FurnitureItem) => Partial<FurnitureItem>) => {
      selectedFurniture.forEach((item) => {
        onUpdate(item.id, getUpdates(item));
      });
    },
    [selectedFurniture, onUpdate]
  );

  const handleApplyScale = useCallback(() => {
    applyToAll((item) => ({
      scale: [
        item.scale[0] * uniformScale,
        item.scale[1] * uniformScale,
        item.scale[2] * uniformScale,
      ] as [number, number, number],
    }));
  }, [applyToAll, uniformScale]);

  const handleApplyColor = useCallback(() => {
    applyToAll(() => ({ color }));
  }, [applyToAll, color]);

  const handleApplyMaterial = useCallback(() => {
    applyToAll(() => ({ material }));
  }, [applyToAll, material]);

  const handleApplyRotation = useCallback(() => {
    const radians = (rotationY * Math.PI) / 180;
    applyToAll((item) => ({
      rotation: [item.rotation[0], radians, item.rotation[2]] as [number, number, number],
    }));
  }, [applyToAll, rotationY]);

  if (selectedIds.length < 2) return null;

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3 space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">一括編集</h3>
        <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
          {selectedIds.length}件の家具を選択中
        </span>
      </div>

      {/* スケール */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400">スケール (均一)</label>
          <button
            onClick={handleApplyScale}
            className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            全てに適用
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.1}
            max={3.0}
            step={0.1}
            value={uniformScale}
            onChange={(e) => setUniformScale(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs text-gray-300 w-10 text-right font-mono">
            {uniformScale.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* カラー */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400">カラー</label>
          <button
            onClick={handleApplyColor}
            className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            全てに適用
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border border-gray-600 cursor-pointer bg-transparent"
          />
          <span className="text-xs text-gray-400 font-mono">{color}</span>
        </div>
      </div>

      {/* マテリアル */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400">マテリアル</label>
          <button
            onClick={handleApplyMaterial}
            className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            全てに適用
          </button>
        </div>
        <select
          value={material}
          onChange={(e) => setMaterial(e.target.value as FurnitureMaterial)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          {MATERIAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Y軸回転 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-400">Y軸回転</label>
          <button
            onClick={handleApplyRotation}
            className="text-[10px] px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            全てに適用
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={360}
            step={15}
            value={rotationY}
            onChange={(e) => setRotationY(parseInt(e.target.value, 10))}
            className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs text-gray-300 w-10 text-right font-mono">
            {rotationY}°
          </span>
        </div>
      </div>
    </div>
  );
}
