'use client';

import { useState, useCallback, useMemo } from 'react';
import { FurnitureType, FurnitureMountType } from '@/types/scene';
import { FURNITURE_CATALOG } from '@/data/furniture';

/**
 * 家具のY軸（高さ）位置を管理するカスタムフック。
 * 壁掛けアイテムはデフォルト2.0m、天井アイテムは天井高-0.1m、床置きアイテムは0mから開始。
 * 天井高のレンジ内でオフセットを調整可能。
 */

/** 壁掛けアイテムのデフォルト高さ (m) */
const WALL_MOUNT_DEFAULT_HEIGHT = 2.0;

/** 天井アイテムのデフォルト高さ (m) — 天井高から引く値 */
const CEILING_MOUNT_OFFSET = 0.1;

/** 床置きアイテムのデフォルト高さ (m) */
const FLOOR_DEFAULT_HEIGHT = 0;

/** デフォルト天井高 (m) */
const DEFAULT_CEILING_HEIGHT = 2.7;

/** 家具タイプから設置タイプを取得 */
export function getMountType(type: FurnitureType): FurnitureMountType {
  const catalog = FURNITURE_CATALOG.find((c) => c.type === type);
  return catalog?.mountType ?? 'floor';
}

/** 壁掛け/天井アイテムかどうかを判定 */
export function isWallMounted(type: FurnitureType): boolean {
  const mt = getMountType(type);
  return mt === 'wall' || mt === 'ceiling';
}

/** 家具タイプに応じたデフォルト高さを取得 */
export function getDefaultHeight(type: FurnitureType, ceilingHeight: number = DEFAULT_CEILING_HEIGHT): number {
  const mt = getMountType(type);
  if (mt === 'wall') return WALL_MOUNT_DEFAULT_HEIGHT;
  if (mt === 'ceiling') return ceilingHeight - CEILING_MOUNT_OFFSET;
  return FLOOR_DEFAULT_HEIGHT;
}

export interface UseFurnitureHeightReturn {
  /** 家具の高さオフセットを調整 */
  adjustHeight: (furnitureId: string, height: number) => void;
  /** 家具の現在の高さオフセットを取得 */
  getHeight: (furnitureId: string) => number;
  /** 特定の家具タイプのデフォルト高さを取得 */
  getDefaultHeightForType: (type: FurnitureType) => number;
  /** 天井高を設定 */
  setCeilingHeight: (height: number) => void;
  /** 現在の天井高 */
  ceilingHeight: number;
  /** 高さオフセットをリセット */
  resetHeight: (furnitureId: string) => void;
  /** 全家具の高さオフセットをリセット */
  resetAllHeights: () => void;
}

export function useFurnitureHeight(
  initialCeilingHeight: number = DEFAULT_CEILING_HEIGHT
): UseFurnitureHeightReturn {
  // 家具ID → 高さオフセットのマップ
  const [heightMap, setHeightMap] = useState<Map<string, number>>(() => new Map());
  const [ceilingHeight, setCeilingHeight] = useState(initialCeilingHeight);

  /** 高さオフセットを調整（0 〜 天井高の範囲にクランプ） */
  const adjustHeight = useCallback((furnitureId: string, height: number) => {
    const clamped = Math.max(0, Math.min(height, ceilingHeight));
    setHeightMap((prev) => {
      const next = new Map(prev);
      next.set(furnitureId, clamped);
      return next;
    });
  }, [ceilingHeight]);

  /** 家具の高さオフセットを取得（未設定の場合はデフォルト値 0 を返す） */
  const getHeight = useCallback((furnitureId: string): number => {
    return heightMap.get(furnitureId) ?? FLOOR_DEFAULT_HEIGHT;
  }, [heightMap]);

  /** 家具タイプに応じたデフォルト高さを返す */
  const getDefaultHeightForType = useCallback((type: FurnitureType): number => {
    return getDefaultHeight(type);
  }, []);

  /** 特定の家具の高さオフセットをリセット */
  const resetHeight = useCallback((furnitureId: string) => {
    setHeightMap((prev) => {
      const next = new Map(prev);
      next.delete(furnitureId);
      return next;
    });
  }, []);

  /** 全家具の高さオフセットをリセット */
  const resetAllHeights = useCallback(() => {
    setHeightMap(new Map());
  }, []);

  return useMemo(() => ({
    adjustHeight,
    getHeight,
    getDefaultHeightForType,
    setCeilingHeight,
    ceilingHeight,
    resetHeight,
    resetAllHeights,
  }), [adjustHeight, getHeight, getDefaultHeightForType, ceilingHeight, resetHeight, resetAllHeights]);
}
