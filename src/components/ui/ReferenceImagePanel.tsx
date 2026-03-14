'use client';

import React, { useState, useCallback, useRef } from 'react';

/**
 * リファレンス画像管理パネル。
 * 実店舗写真のアップロード、不透明度・位置・スケールの調整、
 * 削除を行うUI。
 */

export interface ReferenceImageState {
  /** 画像のdataURL */
  imageUrl: string;
  /** 不透明度 (0-1) */
  opacity: number;
  /** 3D空間での位置オフセット [x, y, z] */
  position: [number, number, number];
  /** スケール倍率 */
  scale: number;
  /** 表示/非表示 */
  visible: boolean;
}

const DEFAULT_STATE: ReferenceImageState = {
  imageUrl: '',
  opacity: 0.5,
  position: [0, 1.5, -2],
  scale: 1,
  visible: true,
};

interface ReferenceImagePanelProps {
  /** 状態変更コールバック（親コンポーネントに状態を通知） */
  onChange?: (state: ReferenceImageState) => void;
}

export function ReferenceImagePanel({ onChange }: ReferenceImagePanelProps) {
  const [state, setState] = useState<ReferenceImageState>(DEFAULT_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 状態を更新し、親にも通知 */
  const updateState = useCallback(
    (updates: Partial<ReferenceImageState>) => {
      setState((prev) => {
        const next = { ...prev, ...updates };
        onChange?.(next);
        return next;
      });
    },
    [onChange]
  );

  /** ファイル選択時の処理 — dataURLとして読み込み */
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          updateState({ imageUrl: result, visible: true });
        }
      };
      reader.readAsDataURL(file);
    },
    [updateState]
  );

  /** 位置オフセットの更新 */
  const handlePositionChange = useCallback(
    (axis: 0 | 1 | 2, value: number) => {
      const newPos: [number, number, number] = [...state.position];
      newPos[axis] = value;
      updateState({ position: newPos });
    },
    [state.position, updateState]
  );

  /** 画像を削除しリセット */
  const handleRemove = useCallback(() => {
    updateState({ imageUrl: '', visible: false });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [updateState]);

  const hasImage = state.imageUrl.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">リファレンス画像</h3>
        {hasImage && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.visible}
              onChange={(e) => updateState({ visible: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-500">表示</span>
          </label>
        )}
      </div>

      {/* ファイル入力 */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500 font-medium">画像ファイル</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png"
          onChange={handleFileChange}
          className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 file:cursor-pointer"
        />
      </div>

      {hasImage && (
        <>
          {/* プレビュー */}
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <img
              src={state.imageUrl}
              alt="リファレンス画像プレビュー"
              className="w-full h-20 object-cover"
            />
          </div>

          {/* 不透明度スライダー */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">
              不透明度: {Math.round(state.opacity * 100)}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(state.opacity * 100)}
              onChange={(e) => updateState({ opacity: parseInt(e.target.value, 10) / 100 })}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* 位置オフセット */}
          <div className="space-y-2">
            <label className="text-xs text-gray-500 font-medium">位置オフセット (m)</label>
            <div className="grid grid-cols-3 gap-2">
              {(['X', 'Y', 'Z'] as const).map((axis, index) => (
                <div key={axis} className="space-y-0.5">
                  <span className="text-[10px] text-gray-400 font-medium">{axis}</span>
                  <input
                    type="number"
                    step={0.1}
                    value={state.position[index as 0 | 1 | 2]}
                    onChange={(e) =>
                      handlePositionChange(
                        index as 0 | 1 | 2,
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* スケールスライダー */}
          <div className="space-y-1">
            <label className="text-xs text-gray-500 font-medium">
              スケール: {state.scale.toFixed(1)}x
            </label>
            <input
              type="range"
              min={0.1}
              max={5}
              step={0.1}
              value={state.scale}
              onChange={(e) => updateState({ scale: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          {/* 削除ボタン */}
          <button
            onClick={handleRemove}
            className="w-full px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
          >
            削除
          </button>
        </>
      )}
    </div>
  );
}
