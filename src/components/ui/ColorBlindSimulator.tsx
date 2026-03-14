'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ColorBlindType, simulateImageColorBlindness } from '@/lib/color-blind-simulator';

interface ColorBlindSimulatorProps {
  /** Reference to the 3D canvas element */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}

const TYPE_OPTIONS: { value: ColorBlindType; label: string; description: string }[] = [
  { value: 'normal', label: '通常', description: '色覚正常' },
  { value: 'protanopia', label: '1型色覚 (P型)', description: '赤色が見えにくい — 日本人男性の約1.5%' },
  { value: 'deuteranopia', label: '2型色覚 (D型)', description: '緑色が見えにくい — 日本人男性の約3.5%' },
  { value: 'tritanopia', label: '3型色覚 (T型)', description: '青色が見えにくい — 非常に稀' },
  { value: 'achromatopsia', label: '全色盲', description: '色が全く見えない — 非常に稀' },
];

export const ColorBlindSimulator: React.FC<ColorBlindSimulatorProps> = ({ canvasRef }) => {
  const [selectedType, setSelectedType] = useState<ColorBlindType>('normal');
  const [splitView, setSplitView] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const updateOverlay = useCallback(() => {
    if (!canvasRef?.current || !overlayCanvasRef.current || selectedType === 'normal' || !isActive) {
      return;
    }

    const srcCanvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width = srcCanvas.width;
    overlay.height = srcCanvas.height;

    const simulated = simulateImageColorBlindness(srcCanvas, selectedType);

    if (splitView) {
      // Left half: original, Right half: simulated
      const halfW = overlay.width / 2;
      ctx.drawImage(srcCanvas, 0, 0, halfW, overlay.height, 0, 0, halfW, overlay.height);
      ctx.drawImage(simulated, halfW, 0, halfW, overlay.height, halfW, 0, halfW, overlay.height);

      // Divider line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, overlay.height);
      ctx.stroke();

      // Labels
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(halfW - 60, 8, 50, 20);
      ctx.fillRect(halfW + 10, 8, 50, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.fillText('元画像', halfW - 55, 22);
      ctx.fillText('シミュレーション', halfW + 15, 22);
    } else {
      ctx.drawImage(simulated, 0, 0);
    }
  }, [canvasRef, selectedType, splitView, isActive]);

  useEffect(() => {
    if (!isActive || selectedType === 'normal') {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const loop = () => {
      updateOverlay();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, selectedType, updateOverlay]);

  const selectedOption = TYPE_OPTIONS.find(o => o.value === selectedType);

  return (
    <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-800">色覚シミュレーター</h3>
        <button
          onClick={() => setIsActive(!isActive)}
          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
            isActive
              ? 'bg-blue-500 text-white'
              : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
          }`}
        >
          {isActive ? 'ON' : 'OFF'}
        </button>
      </div>

      {isActive && (
        <>
          <div className="mb-3">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ColorBlindType)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {selectedOption && selectedType !== 'normal' && (
            <p className="text-xs text-gray-500 mb-2">{selectedOption.description}</p>
          )}

          {selectedType !== 'normal' && (
            <div className="flex items-center gap-2 mb-3">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={splitView}
                  onChange={(e) => setSplitView(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-400"
                />
                <span className="text-xs text-gray-700">Before/After 分割表示</span>
              </label>
            </div>
          )}

          <div className="text-xs text-gray-400 border-t border-gray-200 pt-2 mt-2">
            日本人男性の約5%が色覚多様性に該当します。
            店舗デザインの色使いが全てのお客様に伝わるか確認できます。
          </div>
        </>
      )}

      {/* Overlay canvas (positioned over the 3D viewport by parent) */}
      {isActive && selectedType !== 'normal' && (
        <canvas
          ref={overlayCanvasRef}
          className="hidden"
          aria-hidden="true"
        />
      )}
    </div>
  );
};
