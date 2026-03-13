import { FurnitureCatalogItem } from '@/types/scene';

export const FURNITURE_CATALOG: FurnitureCatalogItem[] = [
  {
    type: 'counter',
    name: 'カウンター',
    icon: '🪵',
    defaultScale: [3, 1.1, 0.6],
    defaultColor: '#8B6914',
  },
  {
    type: 'table_square',
    name: '四角テーブル',
    icon: '⬜',
    defaultScale: [0.8, 0.75, 0.8],
    defaultColor: '#A0522D',
  },
  {
    type: 'table_round',
    name: '丸テーブル',
    icon: '⭕',
    defaultScale: [0.8, 0.75, 0.8],
    defaultColor: '#A0522D',
  },
  {
    type: 'chair',
    name: '椅子',
    icon: '🪑',
    defaultScale: [0.45, 0.85, 0.45],
    defaultColor: '#654321',
  },
  {
    type: 'stool',
    name: 'スツール',
    icon: '🔵',
    defaultScale: [0.35, 0.7, 0.35],
    defaultColor: '#333333',
  },
  {
    type: 'sofa',
    name: 'ソファ',
    icon: '🛋️',
    defaultScale: [1.8, 0.8, 0.8],
    defaultColor: '#8B7355',
  },
  {
    type: 'shelf',
    name: '棚',
    icon: '📚',
    defaultScale: [1.2, 1.8, 0.4],
    defaultColor: '#DEB887',
  },
  {
    type: 'pendant_light',
    name: 'ペンダントライト',
    icon: '💡',
    defaultScale: [0.3, 0.4, 0.3],
    defaultColor: '#FFD700',
  },
  {
    type: 'plant',
    name: '観葉植物',
    icon: '🌿',
    defaultScale: [0.5, 1.2, 0.5],
    defaultColor: '#228B22',
  },
  {
    type: 'partition',
    name: 'パーティション',
    icon: '🧱',
    defaultScale: [1.5, 2.0, 0.1],
    defaultColor: '#D2B48C',
  },
];
