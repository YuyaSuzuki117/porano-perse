'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { STORE_TEMPLATES } from '@/data/templates';

// ウェルカムモーダルに表示する代表テンプレート
const FEATURED_TEMPLATES = [
  { id: 'cafe_20', emoji: '\u2615', label: '\u30AB\u30D5\u30A7' },
  { id: 'office', emoji: '\uD83C\uDFE2', label: '\u30AA\u30D5\u30A3\u30B9' },
  { id: 'izakaya_30', emoji: '\uD83C\uDF76', label: '\u5C45\u9152\u5C4B' },
];

interface WelcomeModalProps {
  onSelectTemplate: (templateId: string) => void;
  onStartEmpty: () => void;
  onOpenTemplates: () => void;
}

export function WelcomeModal({
  onSelectTemplate,
  onStartEmpty,
  onOpenTemplates,
}: WelcomeModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback((action: () => void) => {
    if (dontShowAgain) {
      localStorage.setItem('porano-perse-welcome-dismissed', 'permanent');
    } else {
      localStorage.setItem('porano-perse-welcome-dismissed', 'true');
    }
    action();
  }, [dontShowAgain]);

  // Escape key to close modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose(() => onStartEmpty());
      }
    };
    document.addEventListener('keydown', onKeyDown);
    // Focus the modal on mount
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose, onStartEmpty]);

  const handleTemplateClick = (templateId: string) => {
    handleClose(() => onSelectTemplate(templateId));
  };

  const handleEmptyClick = () => {
    handleClose(() => onStartEmpty());
  };

  const handleStartClick = () => {
    handleClose(() => onStartEmpty());
  };

  const handleAllTemplatesClick = () => {
    handleClose(() => onOpenTemplates());
  };

  // テンプレートの存在確認
  const availableTemplates = FEATURED_TEMPLATES.filter((ft) =>
    STORE_TEMPLATES.some((t) => t.id === ft.id)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="welcome-modal-title">
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 mt-[15vh] p-8 animate-welcome-in outline-none"
      >
        {/* タイトル */}
        <div className="text-center mb-6">
          <h2 id="welcome-modal-title" className="text-2xl font-bold text-gray-800 mb-2">
            {'\uD83C\uDFE0'} Porano Perse へようこそ
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            3Dで店舗のパースを簡単に作成できる<br />ツールです。
          </p>
        </div>

        {/* テンプレート選択 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {availableTemplates.map((ft) => (
            <button
              key={ft.id}
              onClick={() => handleTemplateClick(ft.id)}
              className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 hover:shadow-md hover:scale-105 transition-all duration-200 cursor-pointer"
            >
              <span className="text-3xl">{ft.emoji}</span>
              <span className="text-xs font-medium text-gray-700">{ft.label}</span>
              <span className="text-[10px] text-gray-400">テンプレ</span>
            </button>
          ))}
        </div>

        {/* すべてのテンプレートリンク */}
        <div className="text-center mb-4">
          <button
            onClick={handleAllTemplatesClick}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
          >
            すべてのテンプレートを見る ({STORE_TEMPLATES.length}種類)
          </button>
        </div>

        {/* 区切り線 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">または</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 空の部屋から始める */}
        <button
          onClick={handleEmptyClick}
          className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-gray-300 text-gray-600 text-sm font-medium hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all duration-200 mb-5"
        >
          空の部屋から始める
        </button>

        {/* ヒントセクション */}
        <div className="bg-blue-50 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-blue-700 mb-2">
            {'\uD83D\uDCA1'} ヒント:
          </p>
          <ul className="text-xs text-blue-600 space-y-1.5">
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">{'・'}</span>
              左側で間取りを描画、右側で3D確認
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">{'・'}</span>
              Ctrl+Z で操作を戻せます
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-blue-400 mt-0.5">{'・'}</span>
              右パネルでスタイル・什器を変更
            </li>
          </ul>
        </div>

        {/* 始めるボタン */}
        <div className="text-center mb-3">
          <button
            onClick={handleStartClick}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors shadow-sm hover:shadow-md"
          >
            始める
          </button>
        </div>

        {/* 次回から表示しない */}
        <label className="flex items-center justify-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-400">次回から表示しない</span>
        </label>
      </div>

      {/* アニメーション用のスタイル */}
      <style jsx>{`
        @keyframes welcome-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-welcome-in {
          animation: welcome-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
