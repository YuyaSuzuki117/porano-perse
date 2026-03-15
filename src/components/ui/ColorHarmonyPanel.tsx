'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  suggestHarmonious,
  type HarmonyType,
} from '@/lib/color-harmony';

const HARMONY_OPTIONS: { value: HarmonyType; label: string }[] = [
  { value: 'complementary', label: '補色' },
  { value: 'analogous', label: '類似色' },
  { value: 'triadic', label: 'トライアド' },
  { value: 'split-complementary', label: '分裂補色' },
];

interface ColorHarmonyPanelProps {
  /** 現在のスタイルアクセント色（デフォルトのベース色） */
  defaultBaseColor?: string;
  /** スウォッチクリック時のコールバック */
  onColorSelect?: (color: string) => void;
}

export function ColorHarmonyPanel({
  defaultBaseColor = '#4a90d9',
  onColorSelect,
}: ColorHarmonyPanelProps) {
  const [baseColor, setBaseColor] = useState(defaultBaseColor);
  const [harmonyType, setHarmonyType] = useState<HarmonyType>('analogous');
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    return suggestHarmonious(baseColor, 5, harmonyType);
  }, [baseColor, harmonyType]);

  const handleSwatchClick = useCallback(
    (color: string) => {
      if (onColorSelect) {
        onColorSelect(color);
        return;
      }
      // フォールバック: クリップボードにコピー
      navigator.clipboard.writeText(color).then(() => {
        setCopiedColor(color);
        setTimeout(() => setCopiedColor(null), 1500);
      }).catch(() => {
        // clipboard API非対応の場合は無視
      });
    },
    [onColorSelect]
  );

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3 space-y-3">
      {/* ヘッダー */}
      <h3 className="text-sm font-medium text-white">カラーハーモニー</h3>

      {/* ベースカラー */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400 shrink-0">ベース</label>
        <input
          type="color"
          value={baseColor}
          onChange={(e) => setBaseColor(e.target.value)}
          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent"
        />
        <span className="text-xs text-gray-500 font-mono">{baseColor}</span>
      </div>

      {/* ハーモニータイプ選択 */}
      <div className="flex flex-wrap gap-1">
        {HARMONY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setHarmonyType(opt.value)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${
              harmonyType === opt.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* カラースウォッチ */}
      <div className="flex gap-1.5">
        {suggestions.map((color, i) => (
          <button
            key={`${color}-${i}`}
            onClick={() => handleSwatchClick(color)}
            title={`${color}${copiedColor === color ? ' (コピー済)' : ''}`}
            className="group relative flex-1"
          >
            <div
              className="w-full aspect-square rounded-md border border-gray-600 hover:border-white transition-colors cursor-pointer
                hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
            />
            <span className="block text-[9px] text-gray-500 text-center mt-0.5 font-mono group-hover:text-gray-300">
              {color.slice(1, 7)}
            </span>
            {copiedColor === color && (
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-blue-600 whitespace-nowrap">
                コピー済
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ヒント */}
      <p className="text-[10px] text-gray-600">
        {onColorSelect
          ? 'スウォッチをクリックで選択家具に適用'
          : 'スウォッチをクリックでクリップボードにコピー'}
      </p>
    </div>
  );
}
