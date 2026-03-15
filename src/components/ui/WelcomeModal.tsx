'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { STORE_TEMPLATES } from '@/data/templates';
import { useTranslation } from '@/lib/i18n';

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
  const { t } = useTranslation();
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
        {/* 次回から表示しない — 上部に配置 */}
        <label className="flex items-center gap-2 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">{t('welcome.dont_show')}</span>
        </label>

        {/* タイトル */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
            <h2 id="welcome-modal-title" className="text-xl font-semibold text-gray-800">
              {t('welcome.title')}
            </h2>
          </div>
          <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">
            {t('welcome.subtitle')}
          </p>
        </div>

        {/* テンプレート選択 — リストスタイル */}
        <div className="space-y-2 mb-4">
          {availableTemplates.map((ft) => (
            <button
              key={ft.id}
              onClick={() => handleTemplateClick(ft.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <span className="text-xl">{ft.emoji}</span>
              <div>
                <span className="text-sm font-medium text-gray-700">{ft.label}</span>
                <span className="text-xs text-gray-400 ml-2">{t('welcome.template_label')}</span>
              </div>
            </button>
          ))}
        </div>

        {/* すべてのテンプレートリンク */}
        <div className="mb-6">
          <button
            onClick={handleAllTemplatesClick}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
          >
            {t('welcome.all_templates')} ({STORE_TEMPLATES.length}{t('welcome.template_suffix')})
          </button>
        </div>

        {/* 区切り線 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">{t('welcome.or')}</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 空の部屋から始める */}
        <button
          onClick={handleEmptyClick}
          className="w-full py-2.5 px-4 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 text-sm hover:border-blue-400 hover:text-blue-600 hover:bg-gray-50 transition-all duration-200 mb-6"
        >
          {t('welcome.empty_room')}
        </button>

        {/* ヒントセクション */}
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-2">
            {t('welcome.hint_title')}
          </p>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-1.5">
              <span className="text-gray-300 mt-0.5">{'・'}</span>
              {t('welcome.hint_1')}
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-gray-300 mt-0.5">{'・'}</span>
              {t('welcome.hint_2')}
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-gray-300 mt-0.5">{'・'}</span>
              {t('welcome.hint_3')}
            </li>
          </ul>
        </div>

        {/* 始めるボタン */}
        <div className="text-center">
          <button
            onClick={handleStartClick}
            className="bg-white hover:bg-gray-50 text-blue-600 border border-blue-200 px-8 py-2.5 rounded-lg font-medium text-sm transition-colors"
          >
            {t('welcome.start')}
          </button>
        </div>
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
