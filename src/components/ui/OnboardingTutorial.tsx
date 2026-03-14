'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'porano-perse-tutorial-done';

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: TutorialStep[] = [
  {
    title: 'ようこそ！Porano Perse へ',
    description:
      '3D店舗パースツールへようこそ。このチュートリアルでは、基本的な使い方をステップごとにご案内します。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 20 20" fill="none" className="w-9 h-9">
          <path d="M3 14L10 4l7 10H3z" fill="white" opacity={0.9} />
          <path d="M7 14L10 8l3 6H7z" fill="white" opacity={0.5} />
        </svg>
      </div>
    ),
  },
  {
    title: 'テンプレートまたは壁描画で部屋作成',
    description:
      '設定パネルの「テンプレート」から既存の間取りを選択するか、「図面」タブで壁を自由に描画して部屋を作成します。矩形・L字・U字の定型も用意されています。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-9 h-9">
          <rect x="3" y="3" width="18" height="18" rx="1" />
          <path d="M3 9h18M9 3v18" />
        </svg>
      </div>
    ),
  },
  {
    title: '家具を追加・配置',
    description:
      '設定パネルの「家具カタログ」から什器や家具を選択して追加します。3Dビュー上でドラッグして位置を調整、回転や色変更もできます。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-9 h-9">
          <path d="M4 18V8l4-4h8l4 4v10" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 18h20M6 18v3M18 18v3" strokeLinecap="round" />
        </svg>
      </div>
    ),
  },
  {
    title: 'スタイルで雰囲気を調整',
    description:
      '「スタイル」セクションで壁・床・天井の色やテクスチャを変更できます。照明の明るさや暖かさ、昼夜の切替で空間の雰囲気を自由に演出します。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-9 h-9">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
        </svg>
      </div>
    ),
  },
  {
    title: '3Dビューで視点操作',
    description:
      'マウスドラッグで視点を回転、右ドラッグで移動、スクロールでズームします。カメラプリセットボタンで正面・上面・斜めなどの定位置にワンクリックで切り替えられます。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-9 h-9">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </div>
    ),
  },
  {
    title: 'PDF出力・スクリーンショット',
    description:
      'ヘッダーの「撮影」ボタンで3Dビューのスクリーンショットを保存、「PDF出力」で提案書用のPDFを作成できます。共有リンクやQRコードでの共有も可能です。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-9 h-9">
          <path d="M6 2h8l6 6v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
          <path d="M14 2v6h6" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      </div>
    ),
  },
  {
    title: '準備完了！さっそく始めましょう',
    description:
      '右下の「?」ボタンからいつでもショートカット一覧やチュートリアルを再表示できます。わからないことがあればヘルプパネルもご活用ください。',
    icon: (
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} className="w-9 h-9">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14" strokeLinecap="round" />
          <polyline points="22 4 12 14.01 9 11.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    ),
  },
];

export function OnboardingTutorial({ onComplete }: { onComplete?: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const complete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
    setTimeout(() => onComplete?.(), 300);
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep >= STEPS.length - 1) {
      complete();
      return;
    }
    setAnimating(true);
    setTimeout(() => {
      setCurrentStep((s) => s + 1);
      setAnimating(false);
    }, 200);
  }, [currentStep, complete]);

  const handleBack = useCallback(() => {
    if (currentStep <= 0) return;
    setAnimating(true);
    setTimeout(() => {
      setCurrentStep((s) => s - 1);
      setAnimating(false);
    }, 200);
  }, [currentStep]);

  const step = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div
      className={`fixed inset-0 z-[10000] flex items-center justify-center transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={complete} />

      {/* Card */}
      <div
        className={`relative bg-white rounded-2xl shadow-2xl max-w-md w-[90vw] mx-4 overflow-hidden transition-all duration-300 ${
          visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Skip button */}
        {!isLast && (
          <button
            onClick={complete}
            className="absolute top-4 right-4 text-xs text-gray-400 hover:text-gray-600 transition-colors z-10"
          >
            スキップ
          </button>
        )}

        {/* Content */}
        <div className="p-8 pt-10 text-center">
          <div
            className={`flex justify-center mb-6 transition-all duration-200 ${
              animating ? 'opacity-0 scale-90' : 'opacity-100 scale-100'
            }`}
          >
            {step.icon}
          </div>
          <div
            className={`transition-all duration-200 ${
              animating ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
            }`}
          >
            <h2 className="text-lg font-bold text-gray-800 mb-3">{step.title}</h2>
            <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setAnimating(true);
                setTimeout(() => {
                  setCurrentStep(i);
                  setAnimating(false);
                }, 200);
              }}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'bg-blue-600 w-6'
                  : i < currentStep
                  ? 'bg-blue-300'
                  : 'bg-gray-200'
              }`}
              aria-label={`ステップ ${i + 1}`}
            />
          ))}
        </div>

        {/* Step counter + Nav buttons */}
        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <span className="text-xs text-gray-400 font-medium">
            {currentStep + 1} / {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                戻る
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              {isLast ? '始める' : '次へ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** チュートリアルが完了済みかどうか */
export function isTutorialDone(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

/** チュートリアル完了フラグをリセット */
export function resetTutorial(): void {
  localStorage.removeItem(STORAGE_KEY);
}
