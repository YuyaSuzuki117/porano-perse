'use client';

import React, { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'porano-perse-expert-mode';

// External store for localStorage-backed expert mode
const listeners = new Set<() => void>();

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function setExpertMode(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(value));
  listeners.forEach(cb => cb());
}

/**
 * Hook to access and toggle expert mode.
 *
 * Beginner: essential panels only (テンプレート, 部屋設定, スタイル, 什器)
 * Expert: all panels including advanced (分析ツール, 3D表示オプション, マテリアル, 断面図, etc.)
 */
export function useExpertMode(): { isExpert: boolean; toggleExpertMode: () => void } {
  const isExpert = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleExpertMode = useCallback(() => {
    setExpertMode(!getSnapshot());
  }, []);

  return { isExpert, toggleExpertMode };
}

/** Essential panel IDs shown in beginner mode */
export const BEGINNER_PANELS = [
  'templates',
  'room-settings',
  'style',
  'furniture',
] as const;

/** Additional panel IDs shown only in expert mode */
export const EXPERT_PANELS = [
  'analysis-tools',
  '3d-display-options',
  'materials',
  'cross-section',
  'ergonomics',
  'lighting',
  'obstruction',
  'color-blind',
  'annotations',
  'camera-bookmarks',
] as const;

export type PanelId = (typeof BEGINNER_PANELS)[number] | (typeof EXPERT_PANELS)[number];

/**
 * Returns whether a panel should be visible given the current mode.
 */
export function isPanelVisible(panelId: string, isExpert: boolean): boolean {
  if ((BEGINNER_PANELS as readonly string[]).includes(panelId)) return true;
  if ((EXPERT_PANELS as readonly string[]).includes(panelId)) return isExpert;
  // Unknown panels default to expert-only
  return isExpert;
}

export const ExpertModeToggle: React.FC = () => {
  const { isExpert, toggleExpertMode } = useExpertMode();

  return (
    <button
      onClick={toggleExpertMode}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        transition-all duration-200 shadow-sm border
        ${isExpert
          ? 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100'
          : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
        }
      `}
      title={isExpert ? 'エキスパートモード: 全パネル表示中' : '初心者モード: 基本パネルのみ表示中'}
    >
      <span>{isExpert ? '⚡' : '🔰'}</span>
      <span>{isExpert ? 'エキスパート' : '初心者'}</span>
    </button>
  );
};
