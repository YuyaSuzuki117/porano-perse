'use client';

import { useEffect } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';

/**
 * キーボードショートカットを一括管理するカスタムフック。
 * Ctrl+Z (undo), Ctrl+Shift+Z/Y (redo), Ctrl+C/V/D/A,
 * Delete, H (壁), C (天井), G (グリッド), D (寸法), F (什器), P (フォト) 等。
 */
export function useKeyboardShortcuts() {
  const selectedFurnitureId = useEditorStore((s) => s.selectedFurnitureId);
  const selectedFurnitureIds = useEditorStore((s) => s.selectedFurnitureIds);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const duplicateSelectedFurniture = useEditorStore((s) => s.duplicateSelectedFurniture);
  const selectAllFurniture = useEditorStore((s) => s.selectAllFurniture);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const copyFurniture = useEditorStore((s) => s.copyFurniture);
  const pasteFurniture = useEditorStore((s) => s.pasteFurniture);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const duplicateFurniture = useEditorStore((s) => s.duplicateFurniture);
  const wallDisplayMode = useEditorStore((s) => s.wallDisplayMode);
  const setWallDisplayMode = useEditorStore((s) => s.setWallDisplayMode);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const setCeilingVisible = useEditorStore((s) => s.setCeilingVisible);
  const showGrid = useEditorStore((s) => s.showGrid);
  const setShowGrid = useEditorStore((s) => s.setShowGrid);
  const showDimensions = useEditorStore((s) => s.showDimensions);
  const setShowDimensions = useEditorStore((s) => s.setShowDimensions);
  const showFurniture = useEditorStore((s) => s.showFurniture);
  const setShowFurniture = useEditorStore((s) => s.setShowFurniture);
  const photoMode = useEditorStore((s) => s.photoMode);
  const setPhotoMode = useEditorStore((s) => s.setPhotoMode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // テキスト入力中は無視
      const target = e.target as HTMLElement;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          redo();
        } else if (e.key === 'c') {
          e.preventDefault();
          copyFurniture();
        } else if (e.key === 'v') {
          e.preventDefault();
          pasteFurniture();
        } else if (e.key === 'a') {
          e.preventDefault();
          selectAllFurniture();
        } else if (e.key === 'd') {
          e.preventDefault();
          if (selectedFurnitureIds.length > 1) {
            duplicateSelectedFurniture();
          } else if (selectedFurnitureId) {
            duplicateFurniture(selectedFurnitureId);
          }
        }
      }

      // Delete / Backspace で選択中のアイテムを削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      }

      // Escape で選択解除
      if (e.key === 'Escape') {
        setSelectedFurniture(null);
      }

      // H キー: 壁表示モード切替 (solid → transparent → hidden → section → solid)
      if (e.key === 'h' || e.key === 'H') {
        const modes: Array<'solid' | 'transparent' | 'hidden' | 'section'> = ['solid', 'transparent', 'hidden', 'section'];
        const currentIndex = modes.indexOf(wallDisplayMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        setWallDisplayMode(modes[nextIndex]);
      }

      // C キー: 天井表示トグル
      if (e.key === 'c' || e.key === 'C') {
        if (!e.ctrlKey && !e.metaKey) {
          setCeilingVisible(!ceilingVisible);
        }
      }

      // G キー: グリッド表示トグル
      if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey) {
        setShowGrid(!showGrid);
      }

      // D キー: 寸法表示トグル (Ctrl/Cmd なしの場合のみ)
      if ((e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey) {
        setShowDimensions(!showDimensions);
      }

      // F キー: 家具表示トグル
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        setShowFurniture(!showFurniture);
      }

      // P キー: フォトモード切替
      if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) {
        setPhotoMode(!photoMode);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copyFurniture, pasteFurniture, deleteSelected, duplicateFurniture, duplicateSelectedFurniture, selectAllFurniture, selectedFurnitureId, selectedFurnitureIds, setSelectedFurniture, wallDisplayMode, setWallDisplayMode, ceilingVisible, setCeilingVisible, showGrid, setShowGrid, showDimensions, setShowDimensions, showFurniture, setShowFurniture, photoMode, setPhotoMode]);
}
