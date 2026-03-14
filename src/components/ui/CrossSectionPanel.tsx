'use client';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';
import { generateCrossSectionPNG, CrossSectionParams } from '@/lib/cross-section-export';

// --- 型定義 ---

interface CrossSectionPanelProps {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  ceilingHeight: number;
  onClose?: () => void;
}

// --- ユーティリティ ---

/** 部屋の境界を計算 */
function getRoomExtent(walls: WallSegment[], axis: 'x' | 'z'): { min: number; max: number } {
  if (walls.length === 0) return { min: -3, max: 3 };
  let min = Infinity, max = -Infinity;
  for (const w of walls) {
    if (axis === 'x') {
      min = Math.min(min, w.start.x, w.end.x);
      max = Math.max(max, w.start.x, w.end.x);
    } else {
      // 2D y → 3D z
      min = Math.min(min, w.start.y, w.end.y);
      max = Math.max(max, w.start.y, w.end.y);
    }
  }
  return { min, max };
}

// --- コンポーネント ---

/**
 * 断面図パネル — 断面位置・軸を指定して断面図を生成・プレビュー・ダウンロード
 */
export default function CrossSectionPanel({
  walls,
  furniture,
  ceilingHeight,
  onClose,
}: CrossSectionPanelProps) {
  const [sectionAxis, setSectionAxis] = useState<'x' | 'z'>('x');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const canvasPreviewRef = useRef<HTMLImageElement>(null);

  // 断面可能範囲
  const extent = useMemo(() => getRoomExtent(walls, sectionAxis), [walls, sectionAxis]);
  const [sectionPosition, setSectionPosition] = useState((extent.min + extent.max) / 2);

  // 軸変更時に位置をリセット
  useEffect(() => {
    const newExtent = getRoomExtent(walls, sectionAxis);
    setSectionPosition((newExtent.min + newExtent.max) / 2);
  }, [sectionAxis, walls]);

  // 断面図生成
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const params: CrossSectionParams = {
        walls,
        furniture,
        ceilingHeight,
        sectionPosition,
        sectionAxis,
        width: 1200,
        height: 600,
      };
      const dataUrl = await generateCrossSectionPNG(params);
      setPreviewUrl(dataUrl);
    } catch (error) {
      console.error('[CrossSectionPanel] 断面図生成に失敗:', error);
      alert('断面図の生成に失敗しました。');
    } finally {
      setGenerating(false);
    }
  }, [walls, furniture, ceilingHeight, sectionPosition, sectionAxis]);

  // PNGダウンロード
  const handleDownload = useCallback(() => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `cross-section-${sectionAxis}${sectionPosition.toFixed(1)}m.png`;
    link.click();
  }, [previewUrl, sectionAxis, sectionPosition]);

  // 初回とパラメータ変更時に自動生成
  useEffect(() => {
    // デバウンス付きで自動生成
    const timer = setTimeout(() => {
      handleGenerate();
    }, 300);
    return () => clearTimeout(timer);
  }, [handleGenerate]);

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden w-full max-w-2xl">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-750 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          断面図エクスポート
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="閉じる"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* コントロール */}
      <div className="px-4 py-3 space-y-3 border-b border-gray-200 dark:border-gray-700">
        {/* 断面軸トグル */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16">断面軸</span>
          <div className="flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setSectionAxis('x')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sectionAxis === 'x'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              X軸に垂直
            </button>
            <button
              onClick={() => setSectionAxis('z')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sectionAxis === 'z'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
              }`}
            >
              Z軸に垂直
            </button>
          </div>
        </div>

        {/* 断面位置スライダー */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-16">位置</span>
          <input
            type="range"
            min={extent.min}
            max={extent.max}
            step={0.05}
            value={sectionPosition}
            onChange={(e) => setSectionPosition(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 w-14 text-right font-mono">
            {sectionPosition.toFixed(2)}m
          </span>
        </div>
      </div>

      {/* プレビュー */}
      <div className="relative bg-gray-100 dark:bg-gray-900 flex items-center justify-center min-h-[200px]">
        {generating && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 z-10">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {previewUrl ? (
          <img
            ref={canvasPreviewRef}
            src={previewUrl}
            alt="断面図プレビュー"
            className="max-w-full max-h-[300px] object-contain"
          />
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">
            断面図を生成中...
          </span>
        )}
      </div>

      {/* アクションバー */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          再生成
        </button>
        <button
          onClick={handleDownload}
          disabled={!previewUrl}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          PNGダウンロード
        </button>
      </div>
    </div>
  );
}
