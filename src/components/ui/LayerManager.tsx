'use client';

import { useCallback } from 'react';
import { create } from 'zustand';
import { FurnitureType } from '@/types/scene';

/**
 * レイヤー管理パネル — 家具カテゴリごとの表示/非表示を制御。
 * カテゴリ: 座席、テーブル、収納、照明、設備、その他
 */

// ─── カテゴリ定義 ───

export type CategoryName = '座席' | 'テーブル' | '収納' | '照明' | '設備' | 'その他';

interface CategoryConfig {
  name: CategoryName;
  color: string;
  types: ReadonlySet<FurnitureType>;
}

const CATEGORY_CONFIGS: readonly CategoryConfig[] = [
  {
    name: '座席',
    color: '#3B82F6', // blue-500
    types: new Set<FurnitureType>(['chair', 'stool', 'bench', 'sofa']),
  },
  {
    name: 'テーブル',
    color: '#F59E0B', // amber-500
    types: new Set<FurnitureType>(['table_square', 'table_round', 'counter', 'bar_table', 'desk', 'kitchen_island', 'reception_desk']),
  },
  {
    name: '収納',
    color: '#10B981', // emerald-500
    types: new Set<FurnitureType>(['shelf', 'bookcase', 'wardrobe', 'shoe_rack', 'display_case', 'coat_rack', 'umbrella_stand']),
  },
  {
    name: '照明',
    color: '#F97316', // orange-500
    types: new Set<FurnitureType>(['pendant_light', 'ceiling_fan']),
  },
  {
    name: '設備',
    color: '#8B5CF6', // violet-500
    types: new Set<FurnitureType>(['sink', 'fridge', 'air_conditioner', 'washing_machine', 'register', 'cash_register']),
  },
  {
    name: 'その他',
    color: '#6B7280', // gray-500
    types: new Set<FurnitureType>([
      'plant', 'partition', 'mirror', 'tv_monitor', 'menu_board',
      'flower_pot', 'rug', 'curtain', 'clock', 'trash_can', 'custom',
    ]),
  },
] as const;

/** 家具タイプからカテゴリ名を取得 */
export function getFurnitureCategory(type: string): CategoryName {
  for (const config of CATEGORY_CONFIGS) {
    if (config.types.has(type as FurnitureType)) {
      return config.name;
    }
  }
  return 'その他';
}

// ─── Zustand ストア ───

interface LayerState {
  /** 表示中のカテゴリセット */
  visibleCategories: Set<CategoryName>;
  /** カテゴリの表示/非表示をトグル */
  toggleCategory: (category: CategoryName) => void;
  /** 指定カテゴリのみ表示（Solo） */
  soloCategory: (category: CategoryName) => void;
  /** 全カテゴリを表示 */
  showAll: () => void;
  /** 全カテゴリを非表示 */
  hideAll: () => void;
}

const ALL_CATEGORIES: Set<CategoryName> = new Set(
  CATEGORY_CONFIGS.map((c) => c.name)
);

export const useLayerStore = create<LayerState>((set) => ({
  visibleCategories: new Set(ALL_CATEGORIES),

  toggleCategory: (category) =>
    set((state) => {
      const next = new Set(state.visibleCategories);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return { visibleCategories: next };
    }),

  soloCategory: (category) =>
    set(() => ({
      visibleCategories: new Set([category]),
    })),

  showAll: () =>
    set(() => ({
      visibleCategories: new Set(ALL_CATEGORIES),
    })),

  hideAll: () =>
    set(() => ({
      visibleCategories: new Set<CategoryName>(),
    })),
}));

// ─── UI コンポーネント ───

interface LayerManagerProps {
  /** 各カテゴリに属する家具の数 (カテゴリ名 → 個数) */
  categoryCounts?: Map<CategoryName, number>;
}

export function LayerManager({ categoryCounts }: LayerManagerProps) {
  const visibleCategories = useLayerStore((s) => s.visibleCategories);
  const toggleCategory = useLayerStore((s) => s.toggleCategory);
  const soloCategory = useLayerStore((s) => s.soloCategory);
  const showAll = useLayerStore((s) => s.showAll);
  const hideAll = useLayerStore((s) => s.hideAll);

  const handleToggle = useCallback((category: CategoryName) => {
    toggleCategory(category);
  }, [toggleCategory]);

  const handleSolo = useCallback((category: CategoryName) => {
    soloCategory(category);
  }, [soloCategory]);

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 space-y-3">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">レイヤー管理</h3>
        <div className="flex gap-1">
          <button
            onClick={showAll}
            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
          >
            全表示
          </button>
          <button
            onClick={hideAll}
            className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100 transition-colors"
          >
            全非表示
          </button>
        </div>
      </div>

      {/* カテゴリリスト */}
      <div className="space-y-1">
        {CATEGORY_CONFIGS.map((config) => {
          const isVisible = visibleCategories.has(config.name);
          const count = categoryCounts?.get(config.name) ?? 0;

          return (
            <div
              key={config.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {/* カラーインジケーター */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color, opacity: isVisible ? 1 : 0.3 }}
              />

              {/* チェックボックス */}
              <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isVisible}
                  onChange={() => handleToggle(config.name)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className={`text-sm ${isVisible ? 'text-gray-700' : 'text-gray-400'}`}>
                  {config.name}
                </span>
              </label>

              {/* カウントバッジ */}
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                {count}
              </span>

              {/* Soloボタン */}
              <button
                onClick={() => handleSolo(config.name)}
                className="text-xs px-1.5 py-0.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                title={`${config.name}のみ表示`}
              >
                S
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
