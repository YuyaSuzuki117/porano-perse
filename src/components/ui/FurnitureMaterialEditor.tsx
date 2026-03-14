'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { WoodType, FabricType, MetalFinish } from '@/types/scene';

/**
 * 家具マテリアルカスタマイズパネル。
 * 選択中の家具のマテリアルプロパティ（色、木材、布地、金属、不透明度）を
 * 個別にオーバーライド可能。
 */

// ─── マテリアルオーバーライド型定義 ───

export interface MaterialOverrides {
  color?: string;
  woodType?: WoodType;
  fabricType?: FabricType;
  metalFinish?: MetalFinish;
  opacity?: number;
}

// ─── マテリアル管理フック ───

interface UseFurnitureMaterialsReturn {
  /** 家具IDのマテリアルオーバーライドを取得 */
  getMaterialOverride: (id: string) => MaterialOverrides | undefined;
  /** 家具IDのマテリアルオーバーライドを設定 */
  setMaterialOverride: (id: string, overrides: MaterialOverrides) => void;
  /** 家具IDのマテリアルオーバーライドをリセット */
  resetMaterial: (id: string) => void;
  /** 全オーバーライドのマップ */
  overridesMap: Map<string, MaterialOverrides>;
}

export function useFurnitureMaterials(): UseFurnitureMaterialsReturn {
  const [overridesMap, setOverridesMap] = useState<Map<string, MaterialOverrides>>(
    () => new Map()
  );

  const getMaterialOverride = useCallback(
    (id: string): MaterialOverrides | undefined => {
      return overridesMap.get(id);
    },
    [overridesMap]
  );

  const setMaterialOverride = useCallback(
    (id: string, overrides: MaterialOverrides) => {
      setOverridesMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(id) ?? {};
        next.set(id, { ...existing, ...overrides });
        return next;
      });
    },
    []
  );

  const resetMaterial = useCallback((id: string) => {
    setOverridesMap((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return useMemo(
    () => ({ getMaterialOverride, setMaterialOverride, resetMaterial, overridesMap }),
    [getMaterialOverride, setMaterialOverride, resetMaterial, overridesMap]
  );
}

// ─── 選択肢定義 ───

const WOOD_TYPE_OPTIONS: { value: WoodType; label: string }[] = [
  { value: 'oak', label: 'オーク' },
  { value: 'walnut', label: 'ウォールナット' },
  { value: 'pine', label: 'パイン' },
  { value: 'birch', label: 'バーチ' },
  { value: 'mahogany', label: 'マホガニー' },
  { value: 'teak', label: 'チーク' },
  { value: 'ash', label: 'アッシュ' },
  { value: 'kiri', label: '桐' },
];

const FABRIC_TYPE_OPTIONS: { value: FabricType; label: string }[] = [
  { value: 'linen', label: 'リネン' },
  { value: 'velvet', label: 'ベルベット' },
  { value: 'tweed', label: 'ツイード' },
  { value: 'canvas', label: 'キャンバス' },
  { value: 'wool', label: 'ウール' },
];

const METAL_FINISH_OPTIONS: { value: MetalFinish; label: string }[] = [
  { value: 'brushed', label: 'ブラッシュド' },
  { value: 'polished', label: 'ポリッシュ' },
  { value: 'oxidized', label: '酸化仕上げ' },
  { value: 'matte', label: 'マット' },
  { value: 'brass', label: '真鍮' },
];

// ─── UI コンポーネント ───

interface FurnitureMaterialEditorProps {
  /** 選択中の家具ID */
  selectedFurnitureId: string | null;
  /** 選択中の家具タイプ名（表示用） */
  selectedFurnitureName?: string;
  /** 同一タイプの全家具IDリスト（「全家具に適用」用） */
  sameTypeFurnitureIds?: string[];
  /** マテリアル管理フックの戻り値 */
  materials: UseFurnitureMaterialsReturn;
}

export function FurnitureMaterialEditor({
  selectedFurnitureId,
  selectedFurnitureName,
  sameTypeFurnitureIds = [],
  materials,
}: FurnitureMaterialEditorProps) {
  const { getMaterialOverride, setMaterialOverride, resetMaterial } = materials;

  // 選択中家具の現在のオーバーライド
  const currentOverrides = selectedFurnitureId
    ? getMaterialOverride(selectedFurnitureId)
    : undefined;

  /** マテリアルプロパティを更新 */
  const handleChange = useCallback(
    (updates: MaterialOverrides) => {
      if (!selectedFurnitureId) return;
      setMaterialOverride(selectedFurnitureId, updates);
    },
    [selectedFurnitureId, setMaterialOverride]
  );

  /** オーバーライドをリセット */
  const handleReset = useCallback(() => {
    if (!selectedFurnitureId) return;
    resetMaterial(selectedFurnitureId);
  }, [selectedFurnitureId, resetMaterial]);

  /** 同タイプの全家具に現在のオーバーライドを適用 */
  const handleApplyToAll = useCallback(() => {
    if (!selectedFurnitureId || !currentOverrides) return;
    for (const id of sameTypeFurnitureIds) {
      setMaterialOverride(id, { ...currentOverrides });
    }
  }, [selectedFurnitureId, currentOverrides, sameTypeFurnitureIds, setMaterialOverride]);

  if (!selectedFurnitureId) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-4">
        <p className="text-sm text-gray-400 text-center">家具を選択してください</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">
          マテリアル編集
          {selectedFurnitureName && (
            <span className="ml-1 text-xs text-gray-400 font-normal">
              - {selectedFurnitureName}
            </span>
          )}
        </h3>
      </div>

      {/* カラーピッカー */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">カラー</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={currentOverrides?.color ?? '#8B7355'}
            onChange={(e) => handleChange({ color: e.target.value })}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer"
          />
          <input
            type="text"
            value={currentOverrides?.color ?? ''}
            onChange={(e) => handleChange({ color: e.target.value })}
            placeholder="#8B7355"
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>

      {/* 木材タイプ */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">木材タイプ</label>
        <select
          value={currentOverrides?.woodType ?? ''}
          onChange={(e) => handleChange({ woodType: e.target.value as WoodType })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">-- 選択 --</option>
          {WOOD_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 布地タイプ */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">布地タイプ</label>
        <select
          value={currentOverrides?.fabricType ?? ''}
          onChange={(e) => handleChange({ fabricType: e.target.value as FabricType })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">-- 選択 --</option>
          {FABRIC_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 金属仕上げ */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">金属仕上げ</label>
        <select
          value={currentOverrides?.metalFinish ?? ''}
          onChange={(e) => handleChange({ metalFinish: e.target.value as MetalFinish })}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="">-- 選択 --</option>
          {METAL_FINISH_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* 不透明度スライダー */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">
          不透明度: {Math.round((currentOverrides?.opacity ?? 1) * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={currentOverrides?.opacity ?? 1}
          onChange={(e) => handleChange({ opacity: parseFloat(e.target.value) })}
          className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      {/* アクションボタン */}
      <div className="flex gap-2 pt-2 border-t border-gray-100">
        <button
          onClick={handleReset}
          className="flex-1 px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
        >
          リセット
        </button>
        <button
          onClick={handleApplyToAll}
          disabled={!currentOverrides || sameTypeFurnitureIds.length === 0}
          className="flex-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          全家具に適用
        </button>
      </div>
    </div>
  );
}
