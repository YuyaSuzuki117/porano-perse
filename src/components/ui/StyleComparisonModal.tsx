'use client';

import { useState, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { STYLE_PRESETS } from '@/data/styles';
import { StylePreset } from '@/types/scene';

interface StyleComparisonModalProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function StyleComparisonModal({ canvasRef }: StyleComparisonModalProps) {
  const style = useEditorStore((s) => s.style);
  const setStyle = useEditorStore((s) => s.setStyle);
  const styleCompareMode = useEditorStore((s) => s.styleCompareMode);
  const styleCompareLeft = useEditorStore((s) => s.styleCompareLeft);
  const styleCompareRight = useEditorStore((s) => s.styleCompareRight);
  const styleCompareLeftName = useEditorStore((s) => s.styleCompareLeftName);
  const styleCompareRightName = useEditorStore((s) => s.styleCompareRightName);
  const setStyleCompareScreenshot = useEditorStore((s) => s.setStyleCompareScreenshot);
  const clearStyleComparison = useEditorStore((s) => s.clearStyleComparison);

  const [capturing, setCapturing] = useState(false);
  const [selectedCompareStyle, setSelectedCompareStyle] = useState<StylePreset | null>(null);
  const [step, setStep] = useState<'select' | 'comparing'>('select');

  const captureScreenshot = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch {
      return null;
    }
  }, [canvasRef]);

  const handleStartComparison = useCallback(async (compareStyle: StylePreset) => {
    setCapturing(true);

    // Step 1: Capture current style as "A"
    // Wait a frame for canvas to be ready
    await new Promise((r) => setTimeout(r, 100));
    const currentScreenshot = captureScreenshot();
    const currentStyleConfig = STYLE_PRESETS[style];
    if (currentScreenshot) {
      setStyleCompareScreenshot('left', currentScreenshot, currentStyleConfig.nameJa);
    }

    // Step 2: Switch to comparison style, wait for render, capture as "B"
    const originalStyle = style;
    setStyle(compareStyle);

    // Wait for the style change to propagate and render (multiple frames)
    await new Promise((r) => setTimeout(r, 800));
    const compareScreenshot = captureScreenshot();
    const compareStyleConfig = STYLE_PRESETS[compareStyle];
    if (compareScreenshot) {
      setStyleCompareScreenshot('right', compareScreenshot, compareStyleConfig.nameJa);
    }

    // Step 3: Restore original style
    setStyle(originalStyle);
    setCapturing(false);
    setStep('comparing');
  }, [captureScreenshot, style, setStyle, setStyleCompareScreenshot]);

  const handleClose = useCallback(() => {
    clearStyleComparison();
    setStep('select');
    setSelectedCompareStyle(null);
  }, [clearStyleComparison]);

  const handleApplyRight = useCallback(() => {
    if (selectedCompareStyle) {
      setStyle(selectedCompareStyle);
    }
    handleClose();
  }, [selectedCompareStyle, setStyle, handleClose]);

  if (!styleCompareMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">
            {step === 'select' ? 'スタイル比較 - 比較するスタイルを選択' : 'スタイル比較結果'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {step === 'select' && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                現在のスタイル: <strong>{STYLE_PRESETS[style].nameJa}</strong> と比較するスタイルを選んでください。
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(Object.entries(STYLE_PRESETS) as [StylePreset, (typeof STYLE_PRESETS)[StylePreset]][]).map(
                  ([key, config]) => {
                    if (key === style) return null;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          setSelectedCompareStyle(key);
                          handleStartComparison(key);
                        }}
                        disabled={capturing}
                        className={`p-3 rounded-lg border-2 transition-all text-left ${
                          capturing
                            ? 'opacity-50 cursor-wait border-gray-200'
                            : 'border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer'
                        }`}
                      >
                        <div
                          className="w-full h-3 rounded mb-2"
                          style={{
                            background: `linear-gradient(90deg, ${config.wallColor}, ${config.floorColor}, ${config.accentColor})`,
                          }}
                        />
                        <div className="text-sm font-medium text-gray-700">{config.nameJa}</div>
                      </button>
                    );
                  }
                )}
              </div>
              {capturing && (
                <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  スクリーンショットをキャプチャ中...
                </div>
              )}
            </div>
          )}

          {step === 'comparing' && styleCompareLeft && styleCompareRight && (
            <div>
              <div className="grid grid-cols-2 gap-4">
                {/* Left: A案 (current) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">A</span>
                    <span className="text-sm font-medium text-gray-700">{styleCompareLeftName}</span>
                    <span className="text-xs text-gray-400">(現在)</span>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                    <img
                      src={styleCompareLeft}
                      alt={`A案: ${styleCompareLeftName}`}
                      className="w-full h-auto"
                    />
                  </div>
                </div>

                {/* Right: B案 (comparison) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded">B</span>
                    <span className="text-sm font-medium text-gray-700">{styleCompareRightName}</span>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                    <img
                      src={styleCompareRight}
                      alt={`B案: ${styleCompareRightName}`}
                      className="w-full h-auto"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-6 justify-center">
                <button
                  onClick={() => {
                    setStep('select');
                  }}
                  className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  別のスタイルで比較
                </button>
                <button
                  onClick={handleApplyRight}
                  className="px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors font-medium"
                >
                  B案 ({styleCompareRightName}) を適用
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                >
                  A案のまま閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
