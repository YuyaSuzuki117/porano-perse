'use client';

import { useState, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';

/**
 * GLB/GLTF 3Dモデルのドラッグ&ドロップ処理を管理するカスタムフック。
 * ファイルバリデーション、モデル読込、家具追加を一括で行う。
 */
export function useDragDrop() {
  const [isDragOver, setIsDragOver] = useState(false);
  const addFurniture = useEditorStore((s) => s.addFurniture);

  /** ドロップされた3Dモデルファイルを家具として追加 */
  const handleDrop3DModel = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') return;
    const nameWithoutExt = file.name.replace(/\.(glb|gltf)$/i, '');
    const name = window.prompt('モデル名を入力', nameWithoutExt) || nameWithoutExt;
    const blobUrl = URL.createObjectURL(file);
    addFurniture({
      id: `custom_${Date.now()}`,
      type: 'custom',
      name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      modelUrl: blobUrl,
    });
  }, [addFurniture]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
    if (hasFiles) setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const modelFile = files.find(f => /\.(glb|gltf)$/i.test(f.name));
    if (modelFile) handleDrop3DModel(modelFile);
  }, [handleDrop3DModel]);

  return {
    isDragOver,
    dragHandlers: { onDragOver, onDragLeave, onDrop },
  };
}
