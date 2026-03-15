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
import { cn } from '@/lib/cn';
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

// Reusable icon-only button for header
function HeaderIconButton({
  onClick,
  disabled,
  active,
  ariaLabel,
  title,
  children,
  className: extraClass,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  ariaLabel: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded-sm active:scale-95',
        disabled && 'text-gray-300 cursor-not-allowed',
        !disabled && !active && 'text-gray-500 hover:bg-gray-50',
        !disabled && active && 'text-blue-600 bg-gray-50',
        extraClass
      )}
      aria-label={ariaLabel}
      title={title || ariaLabel}
    >
      {children}
    </button>
  );
}

// Separator line
function Sep() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />;
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
  const [shareDropdownOpen, setShareDropdownOpen] = useState(false);
  const [settingsDropdownOpen, setSettingsDropdownOpen] = useState(false);
  const [advancedExportOpen, setAdvancedExportOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const shareDropdownRef = useRef<HTMLDivElement>(null);
  const settingsDropdownRef = useRef<HTMLDivElement>(null);
  const enableWatermark = useProjectStore((s) => s.enableWatermark);
  const setEnableWatermark = useProjectStore((s) => s.setEnableWatermark);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const close = () => setMobileMenuOpen(false);
    window.addEventListener('click', close, { once: true });
    return () => window.removeEventListener('click', close);
  }, [mobileMenuOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!exportDropdownOpen && !shareDropdownOpen && !settingsDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportDropdownOpen && exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false);
      }
      if (shareDropdownOpen && shareDropdownRef.current && !shareDropdownRef.current.contains(e.target as Node)) {
        setShareDropdownOpen(false);
      }
      if (settingsDropdownOpen && settingsDropdownRef.current && !settingsDropdownRef.current.contains(e.target as Node)) {
        setSettingsDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [exportDropdownOpen, shareDropdownOpen, settingsDropdownOpen]);

  const handleNameCommit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (trimmed) setProjectName(trimmed);
    setIsEditingName(false);
  }, [nameInput, setProjectName]);

  const handleSave = useCallback(async () => {
    const json = exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `porano-perse-project-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    try {
      const data = JSON.parse(json);
      const savedId = await saveToSupabase({ name: projectName, data });
      if (savedId) {
        showToast(tGlobal('dialog.cloud_saved'), 'success');
      }
    } catch {
      // Supabase unavailable
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
    if (url.length > 2500) {
      showToast(tGlobal('dialog.too_large_qr'), 'error');
      return;
    }
    setQrUrl(url);
    setShowQR(true);
  }, [getShareUrl]);

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-3 md:px-4 shrink-0 select-none relative pt-safe" role="banner" aria-label={locale === 'ja' ? 'ヘッダーナビゲーション' : 'Header Navigation'}>
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-blue-600 rounded-sm flex items-center justify-center">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
            <path d="M3 14L10 4l7 10H3z" fill="white" opacity={0.9} />
            <path d="M7 14L10 8l3 6H7z" fill="white" opacity={0.5} />
          </svg>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-sm font-medium tracking-wide text-gray-800">PORANO</span>
          <span className="text-sm font-light text-gray-300 mx-0.5">/</span>
          <span className="text-sm font-medium tracking-wide text-blue-600">PERSE</span>
        </div>
      </div>

      {/* Project name (click to edit) */}
      <div className="ml-2 md:ml-4 flex items-center gap-2 flex-1 min-w-0">
        <Sep />
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
            className="text-xs text-gray-700 bg-transparent blueprint-input w-24 md:w-40"
          />
        ) : (
          <button
            onClick={() => { setNameInput(projectName); setIsEditingName(true); }}
            className="text-xs text-gray-600 bg-transparent px-1 py-0.5 border-b border-gray-200 hover:border-gray-400 cursor-text max-w-[6rem] md:max-w-none truncate rounded-none"
            aria-label={`プロジェクト名: ${projectName} - クリックで編集`}
          >
            {projectName}
          </button>
        )}
        {lastAutoSaved && (
          <span className="text-[9px] text-gray-400 whitespace-nowrap hidden md:inline blueprint-num" title={`${t('header.auto_saved')}: ${new Date(lastAutoSaved).toLocaleTimeString(locale === 'ja' ? 'ja-JP' : 'en-US')}`}>
            {t('header.auto_saved')} {new Date(lastAutoSaved).toLocaleTimeString(locale === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Desktop controls */}
      <div className="hidden md:flex items-center gap-0.5">
        {/* File operations: New / Open / Save (icon-only) */}
        <HeaderIconButton onClick={handleNew} ariaLabel={t('header.new')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <line x1="8" y1="3" x2="8" y2="13" />
            <line x1="3" y1="8" x2="13" y2="8" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton onClick={() => fileInputRef.current?.click()} ariaLabel={t('header.open')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M2 13V5a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton onClick={handleSave} ariaLabel={t('header.save')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M3 2h8l3 3v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
            <path d="M5 2v4h5V2" />
            <rect x="4" y="9" width="8" height="4" rx="0.5" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton onClick={() => setShowProjectList(true)} ariaLabel={t('header.list')}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M2 13V5a1 1 0 011-1h3l2 2h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1z" />
            <path d="M4 4V3a1 1 0 011-1h3l2 2h3a1 1 0 011 1v1" />
          </svg>
        </HeaderIconButton>

        <Sep />

        {/* Undo / Redo */}
        <HeaderIconButton onClick={undo} disabled={!canUndo()} ariaLabel={`${t('header.undo')} (Ctrl+Z)`}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M4 8l4-4M4 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h9a4 4 0 010 8H9" strokeLinecap="round" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton onClick={redo} disabled={!canRedo()} ariaLabel={`${t('header.redo')} (Ctrl+Shift+Z)`}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
            <path d="M16 8l-4-4M16 8l-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 8H7a4 4 0 000 8h4" strokeLinecap="round" />
          </svg>
        </HeaderIconButton>

        <Sep />

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 border border-gray-200 rounded-sm px-1">
          <button
            onClick={zoomOut}
            className="p-1 text-gray-500 hover:bg-gray-50 rounded-sm active:scale-95"
            aria-label={t('header.zoom_out')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3" aria-hidden="true">
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
          <span className="blueprint-num text-[10px] text-gray-500 w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1 text-gray-500 hover:bg-gray-50 rounded-sm active:scale-95"
            aria-label={t('header.zoom_in')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3" aria-hidden="true">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
          <button
            onClick={resetZoom}
            className="p-1 text-gray-500 hover:bg-gray-50 rounded-sm active:scale-95"
            aria-label={t('header.zoom_reset')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3 h-3" aria-hidden="true">
              <path d="M2 8a6 6 0 1011.5 2.5" />
              <path d="M2 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <Sep />

        {/* Share dropdown */}
        <div className="relative" ref={shareDropdownRef}>
          <HeaderIconButton
            onClick={() => { setShareDropdownOpen(!shareDropdownOpen); setExportDropdownOpen(false); setSettingsDropdownOpen(false); }}
            active={shareDropdownOpen}
            ariaLabel={t('header.share')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
              <circle cx="12" cy="4" r="2" />
              <circle cx="4" cy="8" r="2" />
              <circle cx="12" cy="12" r="2" />
              <line x1="6" y1="7" x2="10" y2="5" />
              <line x1="6" y1="9" x2="10" y2="11" />
            </svg>
          </HeaderIconButton>

          {shareDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white shadow border border-gray-200 rounded-sm z-50 w-52 py-1" role="menu">
              <button
                onClick={() => { handleShare(); setShareDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400">
                  <path d="M6 10a3 3 0 004 0l3-3a3 3 0 00-4-4L7.5 4.5" strokeLinecap="round" />
                  <path d="M10 6a3 3 0 00-4 0L3 9a3 3 0 004 4l1.5-1.5" strokeLinecap="round" />
                </svg>
                {shareCopied ? t('header.copied') : t('header.share')} URL
              </button>
              <button
                onClick={() => { handleShowQR(); setShareDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400">
                  <rect x="2" y="2" width="5" height="5" rx="0.5" />
                  <rect x="9" y="2" width="5" height="5" rx="0.5" />
                  <rect x="2" y="9" width="5" height="5" rx="0.5" />
                  <rect x="10" y="10" width="3" height="3" rx="0.5" />
                </svg>
                {t('header.qr')}
              </button>
              <button
                onClick={() => { handleClipboardImport(); setShareDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400">
                  <rect x="4" y="2" width="8" height="12" rx="1" />
                  <path d="M6 2V1a1 1 0 011-1h2a1 1 0 011 1v1" />
                  <path d="M7 8h2M7 10.5h2" />
                </svg>
                {t('header.clipboard_import')}
              </button>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-4 py-1.5">
                <CollaborationPanel />
              </div>
            </div>
          )}
        </div>

        {/* Export dropdown */}
        <div className="relative" ref={exportDropdownRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setExportDropdownOpen(!exportDropdownOpen); setShareDropdownOpen(false); setSettingsDropdownOpen(false); }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium active:scale-95',
              exportDropdownOpen
                ? 'bg-blue-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
            aria-label={t('header.export_menu')}
            aria-expanded={exportDropdownOpen}
            aria-haspopup="true"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" strokeLinecap="round" />
            </svg>
            <span>{t('header.export')}</span>
            <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-2.5 h-2.5 ml-0.5" aria-hidden="true">
              <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {exportDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white shadow border border-gray-200 rounded-sm z-50 w-56 py-1" role="menu" aria-label={t('header.export_menu')}>
              {onScreenshot && (
                <button
                  onClick={() => { onScreenshot(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-blue-500">
                    <rect x="2" y="4" width="12" height="9" rx="1.5" />
                    <circle cx="8" cy="8.5" r="2.5" />
                    <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
                  </svg>
                  <div>
                    <div>{t('header.screenshot')}</div>
                    <div className="text-[10px] text-gray-400">PNG</div>
                  </div>
                </button>
              )}
              {onHiResScreenshot && (
                <button
                  onClick={() => { onHiResScreenshot(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-blue-500">
                    <rect x="1" y="3" width="14" height="10" rx="1.5" />
                    <path d="M5 8h6M8 5.5v5" strokeLinecap="round" />
                  </svg>
                  <div>
                    <div>{t('header.hi_res')}</div>
                    <div className="text-[10px] text-gray-400">4K PNG</div>
                  </div>
                </button>
              )}
              {onExportPDF && (
                <button
                  onClick={() => { onExportPDF(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-blue-500">
                    <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
                    <path d="M10 2v4h4" />
                    <path d="M6 9h4M6 11.5h4" />
                  </svg>
                  <div>
                    <div>{t('header.pdf')}</div>
                    <div className="text-[10px] text-gray-400">PDF</div>
                  </div>
                </button>
              )}
              {onPrint && (
                <button
                  onClick={() => { onPrint(); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400">
                    <rect x="3" y="6" width="10" height="6" rx="1" />
                    <path d="M4 6V2h8v4" />
                    <path d="M4 10h8v4H4z" />
                  </svg>
                  <div>
                    <div>{t('header.print')}</div>
                    <div className="text-[10px] text-gray-400">{locale === 'ja' ? 'ブラウザ印刷' : 'Browser Print'}</div>
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
              <div className="border-t border-gray-100 mt-1">
                <button
                  onClick={() => { setAdvancedExportOpen(true); setExportDropdownOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400">
                    <rect x="2" y="2" width="5" height="5" rx="0.5" />
                    <rect x="9" y="2" width="5" height="5" rx="0.5" />
                    <rect x="2" y="9" width="5" height="5" rx="0.5" />
                    <rect x="9" y="9" width="5" height="5" rx="0.5" />
                  </svg>
                  <div>
                    <div>{locale === 'ja' ? '詳細出力...' : 'Advanced Export...'}</div>
                    <div className="text-[10px] text-gray-400">{locale === 'ja' ? '提案書・バッチ・動画' : 'Proposal / Batch / Video'}</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Export panel (advanced) — triggered from dropdown */}
        <ExportPanel
          onCapture3D={onScreenshot || (() => {})}
          canvasRef={canvasRef}
          onBatchExport={onBatchExport}
          batchProgress={batchProgress}
          hideTrigger
          externalOpen={advancedExportOpen}
          onExternalClose={() => setAdvancedExportOpen(false)}
        />

        <Sep />

        {/* Settings dropdown */}
        <div className="relative" ref={settingsDropdownRef}>
          <HeaderIconButton
            onClick={() => { setSettingsDropdownOpen(!settingsDropdownOpen); setExportDropdownOpen(false); setShareDropdownOpen(false); }}
            active={settingsDropdownOpen}
            ariaLabel={locale === 'ja' ? '設定' : 'Settings'}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4" aria-hidden="true">
              <circle cx="8" cy="8" r="2.5" />
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M13.07 2.93l-1.41 1.41M4.34 11.66l-1.41 1.41" />
            </svg>
          </HeaderIconButton>

          {settingsDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white shadow border border-gray-200 rounded-sm z-50 w-52 py-1" role="menu">
              <button
                onClick={() => { toggleLocale(); setSettingsDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400" aria-hidden="true">
                  <circle cx="8" cy="8" r="6" />
                  <ellipse cx="8" cy="8" rx="3" ry="6" />
                  <line x1="2" y1="8" x2="14" y2="8" />
                </svg>
                {locale === 'ja' ? 'Switch to English' : '日本語に切替'}
              </button>
              <button
                onClick={() => { setShowMarketplace(true); setSettingsDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2.5"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4 text-gray-400" aria-hidden="true">
                  <rect x="2" y="2" width="5" height="5" rx="1" />
                  <rect x="9" y="2" width="5" height="5" rx="1" />
                  <rect x="2" y="9" width="5" height="5" rx="1" />
                  <rect x="9" y="9" width="5" height="5" rx="1" />
                </svg>
                {t('header.template')}
              </button>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-4 py-1.5">
                <KeyboardShortcuts />
              </div>
              <div className="border-t border-gray-100 my-1" />
              <div className="px-4 py-1.5">
                <AuthButton />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.perse.json"
        onChange={handleLoad}
        className="hidden"
        aria-label="プロジェクトファイルを選択"
        tabIndex={-1}
      />

      {/* Mobile controls */}
      <div className="flex md:hidden items-center gap-0.5 ml-auto">
        <HeaderIconButton onClick={undo} disabled={!canUndo()} ariaLabel={t('header.undo')}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5" aria-hidden="true">
            <path d="M4 8l4-4M4 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 8h9a4 4 0 010 8H9" strokeLinecap="round" />
          </svg>
        </HeaderIconButton>
        <HeaderIconButton onClick={redo} disabled={!canRedo()} ariaLabel={t('header.redo')}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5" aria-hidden="true">
            <path d="M16 8l-4-4M16 8l-4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M16 8H7a4 4 0 000 8h4" strokeLinecap="round" />
          </svg>
        </HeaderIconButton>
        {onScreenshot && (
          <button
            onClick={() => onScreenshot()}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm bg-blue-600 text-white active:scale-95"
            aria-label={t('header.screenshot')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5" aria-hidden="true">
              <rect x="2" y="4" width="12" height="9" rx="1.5" />
              <circle cx="8" cy="8.5" r="2.5" />
              <path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1" />
            </svg>
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(!mobileMenuOpen); }}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-sm text-gray-600 active:scale-95"
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

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full right-0 bg-white shadow border border-gray-200 rounded-sm z-50 w-56 p-2" role="menu" aria-label={t('header.menu')}>
          <button onClick={() => { handleNew(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.new')}</button>
          <button onClick={() => { handleSave(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.save')}</button>
          <button onClick={() => { fileInputRef.current?.click(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.open')}</button>
          <button onClick={() => { setShowProjectList(true); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.list')}</button>
          <hr className="my-1 border-gray-100"/>
          <button onClick={() => { handleShare(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">
            {shareCopied ? `${t('header.copied')}!` : t('header.share')} URL
          </button>
          <button onClick={() => { handleShowQR(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.qr')}</button>
          <button onClick={() => { handleClipboardImport(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.clipboard_import')}</button>
          <hr className="my-1 border-gray-100"/>
          <button onClick={() => { setShowMarketplace(true); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">{t('header.template')}</button>
          <button onClick={() => { toggleLocale(); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">
            {locale === 'ja' ? 'Switch to English' : '日本語に切替'}
          </button>
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
          <button onClick={() => { setAdvancedExportOpen(true); setMobileMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm font-medium active:bg-gray-100 rounded min-h-[44px]">
            {locale === 'ja' ? '詳細出力...' : 'Advanced Export...'}
          </button>
        </div>
      )}
      <ProjectListModal isOpen={showProjectList} onClose={() => setShowProjectList(false)} />
      <QRCodeModal isOpen={showQR} onClose={() => setShowQR(false)} url={qrUrl} projectName={projectName} />
      <TemplateMarketplace isOpen={showMarketplace} onClose={() => setShowMarketplace(false)} />
    </header>
  );
}
