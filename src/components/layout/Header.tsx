'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useUIStore } from '@/stores/useUIStore';
import { ExportPanel } from '@/components/ui/ExportPanel';
import { KeyboardShortcuts } from '@/components/ui/KeyboardShortcuts';
import { ProjectListModal } from '@/components/ui/ProjectListModal';
import { QRCodeModal } from '@/components/ui/QRCodeModal';
import { showToast } from '@/components/ui/Toast';
import { AuthButton } from '@/components/ui/AuthButton';
import { CollaborationPanel } from '@/components/ui/CollaborationPanel';
import { saveProject as saveToSupabase } from '@/lib/project-storage';
import { TemplateMarketplace } from '@/components/ui/TemplateMarketplace';
import { useTranslation, useI18nStore, t as tGlobal } from '@/lib/i18n';
import type { ScreenshotOptions } from '@/hooks/useScreenshot';

interface HeaderProps {
  onScreenshot?: (scaleOrOptions?: number | ScreenshotOptions) => void;
  onHiResScreenshot?: () => void;
  onExportPDF?: () => void;
  onPrint?: () => void;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  onBatchExport?: (options?: ScreenshotOptions) => void;
  batchProgress?: { current: number; total: number } | null;
}

export function Header({ onScreenshot, onHiResScreenshot, onExportPDF, onPrint, canvasRef, onBatchExport, batchProgress }: HeaderProps) {
  const { t } = useTranslation();
  const toggleLocale = useI18nStore((s) => s.toggleLocale);
  const locale = useI18nStore((s) => s.locale);
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const zoom = useUIStore(s => s.zoom);
  const zoomIn = useUIStore(s => s.zoomIn);
  const zoomOut = useUIStore(s => s.zoomOut);
  const resetZoom = useUIStore(s => s.resetZoom);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const exportProject = useEditorStore((s) => s.exportProject);
  const importProject = useEditorStore((s) => s.importProject);
  const resetProject = useEditorStore((s) => s.resetProject);
  const lastAutoSaved = useProjectStore((s) => s.lastAutoSaved);
  const getShareUrl = useProjectStore((s) => s.getShareUrl);

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProjectList, setShowProjectList] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const enableWatermark = useProjectStore((s) => s.enableWatermark);
  const setEnableWatermark = useProjectStore((s) => s.setEnableWatermark);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // モバイルメニューを画面外クリックで閉じる
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const close = () => setMobileMenuOpen(false);
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [mobileMenuOpen]);

  // エクスポートドロップダウンを画面外クリックで閉じる
  useEffect(() => {
    if (!exportDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [exportDropdownOpen]);

  const handleNameCommit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed) setProjectName(trimmed);
    setIsEditingName(false);
  }, [nameInput, setProjectName]);

  const handleSave = useCallback(async () => {
    const json = exportProject();

    // JSONファイルとしてダウンロード
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `porano-perse-project-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Supabaseにも保存（利用可能な場合）
    try {
      const data = JSON.parse(json);
      const savedId = await saveToSupabase({ name: projectName, data });
      if (savedId) {
        showToast(tGlobal('dialog.cloud_saved'), 'success');
      }
    } catch {
      // Supabase unavailable — file download succeeded, so safe to ignore
    }
  }, [exportProject, projectName]);

  const handleLoad = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      alert(tGlobal('dialog.select_json'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        importProject(reader.result);
      }
    };
    reader.onerror = () => {
      alert(tGlobal('dialog.load_failed'));
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [importProject]);

  const handleNew = useCallback(() => {
    if (confirm(tGlobal('dialog.new_confirm'))) {
      resetProject();
    }
  }, [resetProject]);

  const handleShare = useCallback(async () => {
    const { url, tooLong } = getShareUrl();
    if (tooLong) {
      showToast(tGlobal('dialog.too_large_url'), 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      showToast(tGlobal('dialog.share_copied'), 'success');
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setShareCopied(true);
      showToast(tGlobal('dialog.share_copied'), 'success');
      setTimeout(() => setShareCopied(false), 2000);
    }
  }, [getShareUrl]);

  const handleClipboardImport = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        showToast(tGlobal('dialog.clipboard_empty'), 'error');
        return;
      }
      try {
        JSON.parse(text);
        importProject(text);
        showToast(tGlobal('dialog.clipboard_imported'), 'success');
      } catch {
        showToast(tGlobal('dialog.clipboard_invalid'), 'error');
      }
    } catch {
      showToast(tGlobal('dialog.clipboard_denied'), 'error');
    }
  }, [importProject]);

  const handleShowQR = useCallback(() => {
    const { url, tooLong } = getShareUrl();
    if (tooLong) {
      showToast(tGlobal('dialog.too_large_qr_gen'), 'error');
      return;
    }
    // QRコードは約2953文字が実用上限
    if (url.length > 2500) {
      showToast(tGlobal('dialog.too_large_qr'), 'error');
      return;
    }
    setQrUrl(url);
    setShowQR(true);
  }, [getShareUrl]);

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-3 md:px-4 shrink-0 select-none relative pt-safe" role="banner" aria-label={locale === 'ja' ? 'ヘッダーナビゲーション' : 'Header Navigation'}>
      {/* ロゴ */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
            <path d="M3 14L10 4l7 10H3z" fill="white" opacity={0.9} />
            <path d="M7 14L10 8l3 6H7z" fill="white" opacity={0.5} />
          </svg>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-base font-bold tracking-tight text-gray-800">Porano</span>
          <span className="text-base font-light text-gray-400 mx-0.5">/</span>
          <span className="text-base font-semibold text-blue-600">Perse</span>
        </div>
      </div>

      {/* プロジェクト名（クリックで編集） */}
      <div className="ml-2 md:ml-4 flex items-center gap-2 flex-1 min-w-0">
        <div className="w-px h-5 bg-gray-200" />
        {isEditingName ? (
          <input
            autoFocus
            aria-label="プロジェクト名を入力"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameCommit();
              if (e.key === 'Escape') { setNameInput(projectName); setIsEditingName(false); }
            }}
            className="text-xs text-gray-700 bg-white px-2.5 py-1 rounded-md border border-blue-400 outline-none w-24 md:w-40"
          />
        ) : (
          <button
            onClick={() => { setNameInput(projectName); setIsEditingName(true); }}
            className="text-xs text-gray-600 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-text max-w-[6rem] md:max-w-none truncate"
            aria-label={`プロジェクト名: ${projectName} - クリックで編集`}
          >
            {projectName}
          </button>
        )}
        {lastAutoSaved && (
          <span className="text-[9px] text-gray-500 whitespace-nowrap" title={`${t('header.auto_saved')}: ${new Date(lastAutoSaved).toLocaleTimeString(locale === 'ja' ? 'ja-JP' : 'en-US')}`}>
            {t('header.auto_saved')} {new Date(lastAutoSaved).toLocaleTimeString(locale === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* 新規・保存・読込（デスクトップのみ） */}
      <div className="hidden md:flex ml-4 items-center gap-1.5">
        <button
          onClick={handleNew}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.new')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5" aria-hidden="true">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
          <span>{t('header.new')}</span>
        </button>
        <button
          onClick={handleSave}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.save')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M3 2h8l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
            <path d="M5 2v4h5V2" />
            <rect x="4" y="9" width="8" height="4" rx="0.5" />
          </svg>
          <span>{t('header.save')}</span>
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.open')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5" aria-hidden="true">
            <path d="M2 13V5a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
          </svg>
          <span>{t('header.open')}</span>
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          onClick={() => setShowProjectList(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.list')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
            <path d="M2 13V5a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
            <path d="M4 4V3a1 1 0 011-1h3l2 2h3a1 1 0 011 1v1" />
          </svg>
          <span>{t('header.list')}</span>
        </button>
        <button
          onClick={() => setShowMarketplace(true)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.template')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
            <rect x="2" y="2" width="5" height="5" rx="1" />
            <rect x="9" y="2" width="5" height="5" rx="1" />
            <rect x="2" y="9" width="5" height="5" rx="1" />
            <rect x="9" y="9" width="5" height="5" rx="1" />
          </svg>
          <span>{t('header.template')}</span>
        </button>
        <button
          onClick={handleShare}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.share')}
        >
          {shareCopied ? (
            <>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 text-green-600">
                <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-green-600">{t('header.copied')}</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
                <path d="M6 10a3 3 0 004 0l3-3a3 3 0 00-4-4L7.5 4.5" strokeLinecap="round" />
                <path d="M10 6a3 3 0 00-4 0L3 9a3 3 0 004 4l1.5-1.5" strokeLinecap="round" />
              </svg>
              <span>{t('header.share')}</span>
            </>
          )}
        </button>
        <button
          onClick={handleShowQR}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.qr')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
            <rect x="2" y="2" width="5" height="5" rx="0.5" />
            <rect x="9" y="2" width="5" height="5" rx="0.5" />
            <rect x="2" y="9" width="5" height="5" rx="0.5" />
            <rect x="10" y="10" width="3" height="3" rx="0.5" />
          </svg>
          <span>{t('header.qr')}</span>
        </button>
        <button
          onClick={handleClipboardImport}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={t('header.clipboard_import')}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
            <rect x="4" y="2" width="8" height="12" rx="1" />
            <path d="M6 2V1a1 1 0 011-1h2a1 1 0 011 1v1" />
            <path d="M7 8h2M7 10.5h2" />
          </svg>
          <span>{t('header.clipboard_import')}</span>
        </button>
      </div>

      {/* ファイル入力（モバイル・デスクトップ共用） */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.perse.json"
        onChange={handleLoad}
        className="hidden"
        aria-label="プロジェクトファイルを選択"
        tabIndex={-1}
      />

      {/* Collab + Auth + Undo/Redo + Zoom + Screenshot（デスクトップのみ） */}
      <div className="hidden md:flex ml-auto items-center gap-1 relative">
        {/* 言語切替 */}
        <button
          onClick={toggleLocale}
          className="px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors border border-gray-200"
          aria-label={locale === 'ja' ? 'Switch to English' : '日本語に切替'}
          title={locale === 'ja' ? 'Switch to English' : '日本語に切替'}
        >
          {locale === 'ja' ? 'EN' : 'JA'}
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <CollaborationPanel />
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <AuthButton />
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <KeyboardShortcuts />
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          onClick={undo}
          disabled={!canUndo()}
          className={`p-1.5 rounded-md transition-colors ${
            canUndo()
              ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              : 'text-gray-200 cursor-not-allowed'
          }`}
          aria-label={`${t('header.undo')} (Ctrl+Z)`}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M4 8l4-4M4 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h9a4 4 0 010 8H9" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className={`p-1.5 rounded-md transition-colors ${
            canRedo()
              ? 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              : 'text-gray-200 cursor-not-allowed'
          }`}
          aria-label={`${t('header.redo')} (Ctrl+Shift+Z)`}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M16 8l-4-4M16 8l-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 8H7a4 4 0 000 8h4" strokeLinecap="round" />
          </svg>
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* ズームコントロール */}
        <div className="flex items-center gap-0.5 bg-gray-50 rounded-md border border-gray-200 px-1">
          <button
            onClick={zoomOut}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
            aria-label={t('header.zoom_out')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3" aria-hidden="true">
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
          <span className="text-[10px] text-gray-500 font-mono w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
            aria-label={t('header.zoom_in')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3" aria-hidden="true">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
          <button
            onClick={resetZoom}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors text-[9px] font-medium"
            aria-label={t('header.zoom_reset')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3">
              <path d="M2 8a6 6 0 1011.5 2.5" />
              <path d="M2 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* 出力ドロップダウン */}
        <div className="relative" ref={exportDropdownRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setExportDropdownOpen(!exportDropdownOpen); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
            aria-label={t('header.export_menu')}
            aria-expanded={exportDropdownOpen}
            aria-haspopup="true"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5">
              <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" strokeLinecap="round" />
            </svg>
            <span>{t('header.export')}</span>
            <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-2.5 h-2.5 ml-0.5">
              <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {exportDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white shadow-xl border border-gray-200 rounded-lg z-50 w-56 py-1" role="menu" aria-label={t('header.export_menu')}>
              {onScreenshot && (
                <button
                  onClick={() => { onScreenshot(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-blue-500">
                    <rect x="2" y="4" width="12" height="9" rx="1.5" />
                    <circle cx="8" cy="8.5" r="2.5" />
                    <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
                  </svg>
                  <div>
                    <div>{t('header.screenshot')}</div>
                    <div className="text-[10px] text-gray-400 font-normal">PNG</div>
                  </div>
                </button>
              )}
              {onHiResScreenshot && (
                <button
                  onClick={() => { onHiResScreenshot(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-purple-500">
                    <rect x="1" y="3" width="14" height="10" rx="1.5" />
                    <path d="M5 8h6M8 5.5v5" strokeLinecap="round" />
                  </svg>
                  <div>
                    <div>{t('header.hi_res')}</div>
                    <div className="text-[10px] text-gray-400 font-normal">4K PNG</div>
                  </div>
                </button>
              )}
              {onExportPDF && (
                <button
                  onClick={() => { onExportPDF(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-red-500">
                    <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                    <path d="M10 2v4h4" />
                    <path d="M6 9h4M6 11.5h4" />
                  </svg>
                  <div>
                    <div>{t('header.pdf')}</div>
                    <div className="text-[10px] text-gray-400 font-normal">PDF</div>
                  </div>
                </button>
              )}
              {onPrint && (
                <button
                  onClick={() => { onPrint(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-500">
                    <rect x="3" y="6" width="10" height="6" rx="1" />
                    <path d="M4 6V2h8v4" />
                    <path d="M4 10h8v4H4z" />
                  </svg>
                  <div>
                    <div>{t('header.print')}</div>
                    <div className="text-[10px] text-gray-400 font-normal">{locale === 'ja' ? 'ブラウザ印刷' : 'Browser Print'}</div>
                  </div>
                </button>
              )}
              <div className="border-t border-gray-100 mt-1 pt-1 px-4 py-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={enableWatermark}
                    onChange={(e) => setEnableWatermark(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                  />
                  <span>{t('header.watermark')}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">Porano Plaza</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* エクスポート */}
        <ExportPanel onCapture3D={onScreenshot || (() => {})} canvasRef={canvasRef} onBatchExport={onBatchExport} batchProgress={batchProgress} />
      </div>

      {/* モバイル: タッチターゲット44px以上のボタン群 */}
      <div className="flex md:hidden items-center gap-0.5 ml-auto">
        <button
          onClick={undo}
          disabled={!canUndo()}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md transition-colors active:bg-gray-100 ${
            canUndo() ? 'text-gray-500' : 'text-gray-200 cursor-not-allowed'
          }`}
          aria-label={t('header.undo')}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
            <path d="M4 8l4-4M4 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h9a4 4 0 010 8H9" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={redo}
          disabled={!canRedo()}
          className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md transition-colors active:bg-gray-100 ${
            canRedo() ? 'text-gray-500' : 'text-gray-200 cursor-not-allowed'
          }`}
          aria-label={t('header.redo')}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
            <path d="M16 8l-4-4M16 8l-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 8H7a4 4 0 000 8h4" strokeLinecap="round" />
          </svg>
        </button>
        {onScreenshot && (
          <button
            onClick={() => onScreenshot()}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md bg-blue-600 text-white active:bg-blue-700 transition-colors"
            aria-label={t('header.screenshot')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
              <rect x="2" y="4" width="12" height="9" rx="1.5" />
              <circle cx="8" cy="8.5" r="2.5" />
              <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
            </svg>
          </button>
        )}
        {onExportPDF && (
          <button
            onClick={onExportPDF}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md bg-red-600 text-white active:bg-red-700 transition-colors"
            aria-label={t('header.pdf')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
              <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
              <path d="M10 2v4h4" />
              <path d="M6 9h4M6 11.5h4" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(!mobileMenuOpen); }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md text-gray-600 active:bg-gray-100 transition-colors"
          aria-label={t('header.menu')}
          aria-expanded={mobileMenuOpen}
          aria-haspopup="true"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5" aria-hidden="true">
            <line x1="3" y1="5" x2="17" y2="5" strokeLinecap="round" />
            <line x1="3" y1="10" x2="17" y2="10" strokeLinecap="round" />
            <line x1="3" y1="15" x2="17" y2="15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* モバイルメニュー — タッチターゲット44px以上 */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full right-0 bg-white shadow-xl border border-gray-200 rounded-b-lg z-50 w-56 p-2" role="menu" aria-label={t('header.menu')}>
          <button onClick={() => { handleNew(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.new')}</button>
          <button onClick={() => { handleSave(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.save')}</button>
          <button onClick={() => { fileInputRef.current?.click(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.open')}</button>
          <button onClick={() => { setShowProjectList(true); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.list')}</button>
          <button onClick={() => { setShowMarketplace(true); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.template')}</button>
          <button onClick={() => { handleShare(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">
            {shareCopied ? `${t('header.copied')}!` : t('header.share')}
          </button>
          <button onClick={() => { handleShowQR(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.qr')}</button>
          <button onClick={() => { handleClipboardImport(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.clipboard_import')}</button>
          <hr className="my-1 border-gray-100"/>
          {onScreenshot && (
            <button onClick={() => { onScreenshot(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.screenshot')} (PNG)</button>
          )}
          {onHiResScreenshot && (
            <button onClick={() => { onHiResScreenshot(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.hi_res')} (4K PNG)</button>
          )}
          {onExportPDF && (
            <button onClick={() => { onExportPDF(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.pdf')}</button>
          )}
          {onPrint && (
            <button onClick={() => { onPrint(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.print')}</button>
          )}
          <hr className="my-1 border-gray-100"/>
          <label className="flex items-center gap-2 px-4 py-3 text-sm font-medium cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              checked={enableWatermark}
              onChange={(e) => setEnableWatermark(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 w-4 h-4"
            />
            <span>{t('header.watermark')}</span>
          </label>
          <div className="px-1 py-1">
            <ExportPanel onCapture3D={onScreenshot || (() => {})} canvasRef={canvasRef} onBatchExport={onBatchExport} batchProgress={batchProgress} />
          </div>
        </div>
      )}
      <ProjectListModal isOpen={showProjectList} onClose={() => setShowProjectList(false)} />
      <QRCodeModal isOpen={showQR} onClose={() => setShowQR(false)} url={qrUrl} projectName={projectName} />
      <TemplateMarketplace isOpen={showMarketplace} onClose={() => setShowMarketplace(false)} />
    </header>
  );
}
