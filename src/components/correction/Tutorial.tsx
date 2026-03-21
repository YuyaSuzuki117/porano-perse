'use client';

import { useState, useEffect } from 'react';

const TUTORIAL_DONE_KEY = 'porano-correction-tutorial-done';

const steps = [
  {
    title: 'ステップ 1: ファイルを読み込む',
    desc: 'JSONファイル（必須）とPDF（任意）をドラッグ＆ドロップ、またはファイル選択で読み込みます。',
    icon: '📂',
  },
  {
    title: 'ステップ 2: 不明室に名前をつける',
    desc: 'Tab キーで不明室を巡回し、ワンクリックで室名を選択できます。Enter で確定すると自動で次の不明室に移動します。',
    icon: '🏷️',
  },
  {
    title: 'ステップ 3: 部屋の形を修正',
    desc: '頂点をドラッグして部屋の形を調整できます。スナップ機能 (S) で正確に配置。',
    icon: '📐',
  },
  {
    title: 'ステップ 4: 出力する',
    desc: 'Ctrl+S でJSON保存、Ctrl+E でDXF出力。下部の出力バーからもワンクリックで出力できます。',
    icon: '💾',
  },
];

export default function Tutorial() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(TUTORIAL_DONE_KEY)) {
        setVisible(true);
      }
    } catch { /* ignore */ }
  }, []);

  const handleClose = () => {
    setVisible(false);
    try {
      localStorage.setItem(TUTORIAL_DONE_KEY, '1');
    } catch { /* ignore */ }
  };

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!visible) return null;

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#16213e] rounded-xl border border-[#4a90d9]/50 shadow-2xl max-w-md w-full mx-4 p-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#c8d8e8]">図面補正ツールの使い方</h2>
          <button
            onClick={handleClose}
            className="text-[#4a6a8a] hover:text-[#c8d8e8] transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* ステップインジケータ */}
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-[#4a90d9]' : 'bg-[#1e3a5f]'
              }`}
            />
          ))}
        </div>

        {/* コンテンツ */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">{current.icon}</div>
          <h3 className="text-base font-bold text-[#c8d8e8] mb-2">{current.title}</h3>
          <p className="text-sm text-[#8ba4c4] leading-relaxed">{current.desc}</p>
        </div>

        {/* ナビゲーション */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={step === 0}
            className={`px-4 py-2 rounded text-sm transition-colors ${
              step === 0
                ? 'text-[#2a3a4f] cursor-not-allowed'
                : 'text-[#6b8ab5] hover:text-[#c8d8e8] hover:bg-[#1e3a5f]'
            }`}
          >
            ← 戻る
          </button>
          <span className="text-[10px] text-[#4a6a8a] font-mono">
            {step + 1} / {steps.length}
          </span>
          <button
            onClick={handleNext}
            className="px-4 py-2 rounded text-sm font-bold bg-[#4a90d9] text-white hover:bg-[#3a80c9] transition-colors"
          >
            {step === steps.length - 1 ? '始める' : '次へ →'}
          </button>
        </div>

        {/* スキップ */}
        <div className="text-center mt-3">
          <button
            onClick={handleClose}
            className="text-[10px] text-[#4a6a8a] hover:text-[#6b8ab5] transition-colors"
          >
            次回から表示しない
          </button>
        </div>
      </div>
    </div>
  );
}
