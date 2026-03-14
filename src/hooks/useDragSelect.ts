'use client';

import { useState, useCallback, useRef } from 'react';
import * as THREE from 'three';

/**
 * 3Dビューポートでの矩形ドラッグ選択フック。
 * Shift+左ドラッグで選択矩形を描画し、
 * Frustumベースで範囲内の家具を判定する。
 */

/** スクリーン座標での選択矩形 */
export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** ドラッグ開始時のスクリーン座標 */
interface DragStart {
  x: number;
  y: number;
}

export interface UseDragSelectReturn {
  /** ドラッグ中かどうか */
  isDragging: boolean;
  /** 現在の選択矩形（ドラッグ中のみ有効） */
  selectionRect: SelectionRect | null;
  /** ドラッグ選択を開始（Shift+マウスダウン時に呼ぶ） */
  startDragSelect: (x: number, y: number) => void;
  /** ドラッグ中の更新（マウスムーブ時に呼ぶ） */
  updateDragSelect: (x: number, y: number) => void;
  /** ドラッグ選択を終了し、Frustum内のオブジェクトIDを返す */
  endDragSelect: (
    camera: THREE.Camera,
    furnitureObjects: Map<string, THREE.Object3D>,
    canvasWidth: number,
    canvasHeight: number
  ) => string[];
}

/**
 * スクリーン座標の矩形をNDC（正規化デバイス座標）に変換
 */
function screenRectToNDC(
  rect: SelectionRect,
  canvasWidth: number,
  canvasHeight: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  return {
    minX: (Math.min(left, right) / canvasWidth) * 2 - 1,
    maxX: (Math.max(left, right) / canvasWidth) * 2 - 1,
    // Y軸はスクリーンと逆
    minY: -(Math.max(top, bottom) / canvasHeight) * 2 + 1,
    maxY: -(Math.min(top, bottom) / canvasHeight) * 2 + 1,
  };
}

/**
 * NDC矩形からFrustumを構築し、範囲内のオブジェクトを判定
 */
function selectByFrustum(
  camera: THREE.Camera,
  ndc: { minX: number; maxX: number; minY: number; maxY: number },
  furnitureObjects: Map<string, THREE.Object3D>
): string[] {
  const projMatrix = camera.projectionMatrix.clone();
  const viewMatrix = camera.matrixWorldInverse.clone();
  const vpMatrix = projMatrix.multiply(viewMatrix);

  // 選択矩形用の投影行列を構築
  const selectionMatrix = new THREE.Matrix4();
  const scaleX = 2 / (ndc.maxX - ndc.minX);
  const scaleY = 2 / (ndc.maxY - ndc.minY);
  const offsetX = -(ndc.maxX + ndc.minX) / (ndc.maxX - ndc.minX);
  const offsetY = -(ndc.maxY + ndc.minY) / (ndc.maxY - ndc.minY);

  selectionMatrix.set(
    scaleX, 0, 0, offsetX,
    0, scaleY, 0, offsetY,
    0, 0, 1, 0,
    0, 0, 0, 1
  );

  const selectionVPMatrix = selectionMatrix.multiply(vpMatrix);

  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(selectionVPMatrix);

  const selectedIds: string[] = [];
  const boundingBox = new THREE.Box3();
  const sphere = new THREE.Sphere();

  furnitureObjects.forEach((obj, id) => {
    // バウンディングボックスからバウンディングスフィアを生成して判定
    boundingBox.setFromObject(obj);
    boundingBox.getBoundingSphere(sphere);

    if (frustum.intersectsSphere(sphere)) {
      selectedIds.push(id);
    }
  });

  return selectedIds;
}

export function useDragSelect(): UseDragSelectReturn {
  const [isDragging, setIsDragging] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const dragStartRef = useRef<DragStart | null>(null);

  /** ドラッグ選択を開始 */
  const startDragSelect = useCallback((x: number, y: number) => {
    dragStartRef.current = { x, y };
    setIsDragging(true);
    setSelectionRect({ x, y, width: 0, height: 0 });
  }, []);

  /** ドラッグ中の矩形を更新 */
  const updateDragSelect = useCallback((x: number, y: number) => {
    const start = dragStartRef.current;
    if (!start) return;

    // 左上起点になるよう正規化
    const rectX = Math.min(start.x, x);
    const rectY = Math.min(start.y, y);
    const width = Math.abs(x - start.x);
    const height = Math.abs(y - start.y);

    setSelectionRect({ x: rectX, y: rectY, width, height });
  }, []);

  /** ドラッグ選択を終了し、範囲内の家具IDを返す */
  const endDragSelect = useCallback((
    camera: THREE.Camera,
    furnitureObjects: Map<string, THREE.Object3D>,
    canvasWidth: number,
    canvasHeight: number
  ): string[] => {
    const rect = selectionRect;
    setIsDragging(false);
    setSelectionRect(null);
    dragStartRef.current = null;

    if (!rect || rect.width < 5 || rect.height < 5) {
      // 最小サイズ未満の場合は選択なしとみなす
      return [];
    }

    const ndc = screenRectToNDC(rect, canvasWidth, canvasHeight);
    return selectByFrustum(camera, ndc, furnitureObjects);
  }, [selectionRect]);

  return {
    isDragging,
    selectionRect,
    startDragSelect,
    updateDragSelect,
    endDragSelect,
  };
}
