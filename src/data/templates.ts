// 店舗テンプレートデータ
// 家具配置済みの状態で即座にプレビューできるテンプレート集

import { WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem, StylePreset } from '@/types/scene';
import { createRectRoom } from '@/lib/geometry';

export interface StoreTemplate {
  id: string;
  name: string;
  description: string;
  style: StylePreset;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
  thumbnail: string; // emoji代用
}

// ユニークID生成ヘルパー
let _idCounter = 0;
function uid(prefix: string): string {
  _idCounter++;
  return `tpl_${prefix}_${_idCounter}`;
}

// ============================
// 1. カフェ 20席 (8x6m)
// ============================
function createCafeTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 8;
  const roomDepth = 6;
  const roomHeight = 2.7;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  // ドア: 南壁(walls[2])の中央付近
  const openings: Opening[] = [
    {
      id: uid('door'),
      wallId: walls[2].id,
      type: 'door',
      positionAlongWall: 4,
      width: 1.0,
      height: 2.1,
      elevation: 0,
    },
    {
      id: uid('win'),
      wallId: walls[0].id,
      type: 'window',
      positionAlongWall: 2,
      width: 1.8,
      height: 1.2,
      elevation: 0.9,
    },
    {
      id: uid('win'),
      wallId: walls[0].id,
      type: 'window',
      positionAlongWall: 6,
      width: 1.8,
      height: 1.2,
      elevation: 0.9,
    },
  ];

  const furniture: FurnitureItem[] = [
    // カウンター（奥壁沿い）
    {
      id: uid('counter'),
      type: 'counter',
      name: 'カウンター',
      position: [0, 0, -2.5],
      rotation: [0, 0, 0],
      scale: [3, 1.1, 0.6],
    },
    // 丸テーブル4脚 + 椅子8脚（2脚ずつ）
    // テーブル1（左手前）
    {
      id: uid('table'),
      type: 'table_round',
      name: '丸テーブル',
      position: [-2.2, 0, -0.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [-2.2, 0, -1.0],
      rotation: [0, 0, 0],
      scale: [0.45, 0.85, 0.45],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [-2.2, 0, 0.0],
      rotation: [0, Math.PI, 0],
      scale: [0.45, 0.85, 0.45],
    },
    // テーブル2（右手前）
    {
      id: uid('table'),
      type: 'table_round',
      name: '丸テーブル',
      position: [2.2, 0, -0.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [2.2, 0, -1.0],
      rotation: [0, 0, 0],
      scale: [0.45, 0.85, 0.45],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [2.2, 0, 0.0],
      rotation: [0, Math.PI, 0],
      scale: [0.45, 0.85, 0.45],
    },
    // テーブル3（左奥寄り）
    {
      id: uid('table'),
      type: 'table_round',
      name: '丸テーブル',
      position: [-2.2, 0, 1.2],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [-2.2, 0, 0.7],
      rotation: [0, 0, 0],
      scale: [0.45, 0.85, 0.45],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [-2.2, 0, 1.7],
      rotation: [0, Math.PI, 0],
      scale: [0.45, 0.85, 0.45],
    },
    // テーブル4（右奥寄り）
    {
      id: uid('table'),
      type: 'table_round',
      name: '丸テーブル',
      position: [2.2, 0, 1.2],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [2.2, 0, 0.7],
      rotation: [0, 0, 0],
      scale: [0.45, 0.85, 0.45],
    },
    {
      id: uid('chair'),
      type: 'chair',
      name: '椅子',
      position: [2.2, 0, 1.7],
      rotation: [0, Math.PI, 0],
      scale: [0.45, 0.85, 0.45],
    },
    // ペンダントライト3つ（天井付近）
    {
      id: uid('light'),
      type: 'pendant_light',
      name: 'ペンダントライト',
      position: [-2.2, roomHeight - 0.3, 0.3],
      rotation: [0, 0, 0],
      scale: [0.3, 0.4, 0.3],
    },
    {
      id: uid('light'),
      type: 'pendant_light',
      name: 'ペンダントライト',
      position: [0, roomHeight - 0.3, 0.3],
      rotation: [0, 0, 0],
      scale: [0.3, 0.4, 0.3],
    },
    {
      id: uid('light'),
      type: 'pendant_light',
      name: 'ペンダントライト',
      position: [2.2, roomHeight - 0.3, 0.3],
      rotation: [0, 0, 0],
      scale: [0.3, 0.4, 0.3],
    },
    // 観葉植物2つ（入口付近と奥のコーナー）
    {
      id: uid('plant'),
      type: 'plant',
      name: '観葉植物',
      position: [3.5, 0, 2.5],
      rotation: [0, 0, 0],
      scale: [0.5, 1.2, 0.5],
    },
    {
      id: uid('plant'),
      type: 'plant',
      name: '観葉植物',
      position: [-3.5, 0, -2.5],
      rotation: [0, 0, 0],
      scale: [0.5, 1.2, 0.5],
    },
    // 棚（壁際）
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚',
      position: [3.5, 0, -1.5],
      rotation: [0, Math.PI / 2, 0],
      scale: [1.2, 1.8, 0.4],
    },
  ];

  return {
    id: 'cafe_20',
    name: 'カフェ 20席',
    description: 'カウンター+丸テーブル4席の定番カフェレイアウト',
    style: 'cafe',
    roomWidth,
    roomDepth,
    roomHeight,
    walls,
    openings,
    furniture,
    thumbnail: '☕',
  };
}

// ============================
// 2. 居酒屋 30席 (10x7m)
// ============================
function createIzakayaTemplate(): StoreTemplate {
  _idCounter = 100;
  const roomWidth = 10;
  const roomDepth = 7;
  const roomHeight = 2.7;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    {
      id: uid('door'),
      wallId: walls[2].id,
      type: 'door',
      positionAlongWall: 5,
      width: 1.2,
      height: 2.1,
      elevation: 0,
    },
  ];

  const furniture: FurnitureItem[] = [
    // 長めのカウンター（奥壁沿い）
    {
      id: uid('counter'),
      type: 'counter',
      name: 'カウンター',
      position: [0, 0, -3.0],
      rotation: [0, 0, 0],
      scale: [4.5, 1.1, 0.6],
    },
    // カウンタースツール6脚
    ...Array.from({ length: 6 }, (_, i) => ({
      id: uid('stool'),
      type: 'stool' as const,
      name: 'スツール',
      position: [-2.0 + i * 0.8, 0, -2.3] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.35, 0.7, 0.35] as [number, number, number],
    })),
    // 四角テーブル5脚 + 各テーブルに椅子4脚（計20脚）
    // テーブル1
    {
      id: uid('table'),
      type: 'table_square',
      name: '四角テーブル',
      position: [-3.0, 0, -0.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    ...[[-3.5, -0.5], [-2.5, -0.5], [-3.0, -1.0], [-3.0, 0.0]].map(([x, z], i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: '椅子',
      position: [x, 0, z] as [number, number, number],
      rotation: [0, i * (Math.PI / 2), 0] as [number, number, number],
      scale: [0.45, 0.85, 0.45] as [number, number, number],
    })),
    // テーブル2
    {
      id: uid('table'),
      type: 'table_square',
      name: '四角テーブル',
      position: [0, 0, -0.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    ...[[-0.5, -0.5], [0.5, -0.5], [0.0, -1.0], [0.0, 0.0]].map(([x, z], i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: '椅子',
      position: [x, 0, z] as [number, number, number],
      rotation: [0, i * (Math.PI / 2), 0] as [number, number, number],
      scale: [0.45, 0.85, 0.45] as [number, number, number],
    })),
    // テーブル3
    {
      id: uid('table'),
      type: 'table_square',
      name: '四角テーブル',
      position: [3.0, 0, -0.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    ...[[ 2.5, -0.5], [3.5, -0.5], [3.0, -1.0], [3.0, 0.0]].map(([x, z], i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: '椅子',
      position: [x, 0, z] as [number, number, number],
      rotation: [0, i * (Math.PI / 2), 0] as [number, number, number],
      scale: [0.45, 0.85, 0.45] as [number, number, number],
    })),
    // テーブル4
    {
      id: uid('table'),
      type: 'table_square',
      name: '四角テーブル',
      position: [-2.0, 0, 1.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    ...[[-2.5, 1.5], [-1.5, 1.5], [-2.0, 1.0], [-2.0, 2.0]].map(([x, z], i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: '椅子',
      position: [x, 0, z] as [number, number, number],
      rotation: [0, i * (Math.PI / 2), 0] as [number, number, number],
      scale: [0.45, 0.85, 0.45] as [number, number, number],
    })),
    // テーブル5
    {
      id: uid('table'),
      type: 'table_square',
      name: '四角テーブル',
      position: [2.0, 0, 1.5],
      rotation: [0, 0, 0],
      scale: [0.8, 0.75, 0.8],
    },
    ...[[ 1.5, 1.5], [2.5, 1.5], [2.0, 1.0], [2.0, 2.0]].map(([x, z], i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: '椅子',
      position: [x, 0, z] as [number, number, number],
      rotation: [0, i * (Math.PI / 2), 0] as [number, number, number],
      scale: [0.45, 0.85, 0.45] as [number, number, number],
    })),
    // 棚2つ（壁際）
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚',
      position: [-4.6, 0, 0.0],
      rotation: [0, Math.PI / 2, 0],
      scale: [1.2, 1.8, 0.4],
    },
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚',
      position: [4.6, 0, 0.0],
      rotation: [0, -Math.PI / 2, 0],
      scale: [1.2, 1.8, 0.4],
    },
    // ペンダントライト4つ
    ...Array.from({ length: 4 }, (_, i) => ({
      id: uid('light'),
      type: 'pendant_light' as const,
      name: 'ペンダントライト',
      position: [-3.0 + i * 2.0, roomHeight - 0.3, 0.0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.3, 0.4, 0.3] as [number, number, number],
    })),
  ];

  return {
    id: 'izakaya_30',
    name: '居酒屋 30席',
    description: 'カウンター+テーブル席の本格居酒屋レイアウト',
    style: 'japanese',
    roomWidth,
    roomDepth,
    roomHeight,
    walls,
    openings,
    furniture,
    thumbnail: '🍶',
  };
}

// ============================
// 3. バー (6x4m)
// ============================
function createBarTemplate(): StoreTemplate {
  _idCounter = 200;
  const roomWidth = 6;
  const roomDepth = 4;
  const roomHeight = 2.7;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    {
      id: uid('door'),
      wallId: walls[2].id,
      type: 'door',
      positionAlongWall: 3,
      width: 0.9,
      height: 2.1,
      elevation: 0,
    },
  ];

  const furniture: FurnitureItem[] = [
    // L字カウンター（奥壁+右壁の2パーツ）
    {
      id: uid('counter'),
      type: 'counter',
      name: 'カウンター（奥）',
      position: [0, 0, -1.5],
      rotation: [0, 0, 0],
      scale: [3.5, 1.1, 0.6],
    },
    {
      id: uid('counter'),
      type: 'counter',
      name: 'カウンター（横）',
      position: [2.2, 0, 0.0],
      rotation: [0, Math.PI / 2, 0],
      scale: [2.5, 1.1, 0.6],
    },
    // スツール8脚（カウンター沿い）
    // 奥カウンター前に5脚
    ...Array.from({ length: 5 }, (_, i) => ({
      id: uid('stool'),
      type: 'stool' as const,
      name: 'スツール',
      position: [-1.5 + i * 0.7, 0, -0.8] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.35, 0.7, 0.35] as [number, number, number],
    })),
    // 横カウンター前に3脚
    ...Array.from({ length: 3 }, (_, i) => ({
      id: uid('stool'),
      type: 'stool' as const,
      name: 'スツール',
      position: [1.5, 0, -0.5 + i * 0.7] as [number, number, number],
      rotation: [0, -Math.PI / 2, 0] as [number, number, number],
      scale: [0.35, 0.7, 0.35] as [number, number, number],
    })),
    // 棚2つ（背面 酒瓶ディスプレイ）
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚',
      position: [-1.5, 0, -1.8],
      rotation: [0, 0, 0],
      scale: [1.5, 1.8, 0.3],
    },
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚',
      position: [0.5, 0, -1.8],
      rotation: [0, 0, 0],
      scale: [1.5, 1.8, 0.3],
    },
    // ペンダントライト3つ
    {
      id: uid('light'),
      type: 'pendant_light',
      name: 'ペンダントライト',
      position: [-1.2, roomHeight - 0.3, -0.8],
      rotation: [0, 0, 0],
      scale: [0.3, 0.4, 0.3],
    },
    {
      id: uid('light'),
      type: 'pendant_light',
      name: 'ペンダントライト',
      position: [0.5, roomHeight - 0.3, -0.8],
      rotation: [0, 0, 0],
      scale: [0.3, 0.4, 0.3],
    },
    {
      id: uid('light'),
      type: 'pendant_light',
      name: 'ペンダントライト',
      position: [1.5, roomHeight - 0.3, 0.3],
      rotation: [0, 0, 0],
      scale: [0.3, 0.4, 0.3],
    },
  ];

  return {
    id: 'bar',
    name: 'バー',
    description: 'L字カウンターの雰囲気ある大人のバー',
    style: 'luxury',
    roomWidth,
    roomDepth,
    roomHeight,
    walls,
    openings,
    furniture,
    thumbnail: '🍸',
  };
}

// ============================
// 4. 美容室 (8x5m)
// ============================
function createSalonTemplate(): StoreTemplate {
  _idCounter = 300;
  const roomWidth = 8;
  const roomDepth = 5;
  const roomHeight = 2.7;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    {
      id: uid('door'),
      wallId: walls[2].id,
      type: 'door',
      positionAlongWall: 4,
      width: 1.2,
      height: 2.1,
      elevation: 0,
    },
    {
      id: uid('win'),
      wallId: walls[0].id,
      type: 'window',
      positionAlongWall: 4,
      width: 2.5,
      height: 1.5,
      elevation: 0.8,
    },
  ];

  const furniture: FurnitureItem[] = [
    // 受付カウンター（入口近く）
    {
      id: uid('counter'),
      type: 'counter',
      name: 'カウンター（受付）',
      position: [2.5, 0, 2.0],
      rotation: [0, 0, 0],
      scale: [1.8, 1.1, 0.6],
    },
    // カット椅子6脚（左右の壁沿いに3脚ずつ）
    ...Array.from({ length: 3 }, (_, i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: 'カット台',
      position: [-3.2, 0, -1.5 + i * 1.5] as [number, number, number],
      rotation: [0, Math.PI / 2, 0] as [number, number, number],
      scale: [0.55, 0.9, 0.55] as [number, number, number],
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: uid('chair'),
      type: 'chair' as const,
      name: 'カット台',
      position: [3.2, 0, -1.5 + i * 1.5] as [number, number, number],
      rotation: [0, -Math.PI / 2, 0] as [number, number, number],
      scale: [0.55, 0.9, 0.55] as [number, number, number],
    })),
    // 棚2つ（壁際ミラー代わり）
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚（ミラー台）',
      position: [-3.7, 0, -0.5],
      rotation: [0, Math.PI / 2, 0],
      scale: [3.0, 1.5, 0.3],
    },
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '棚（ミラー台）',
      position: [3.7, 0, -0.5],
      rotation: [0, -Math.PI / 2, 0],
      scale: [3.0, 1.5, 0.3],
    },
    // パーティション2つ（待合と施術エリアの仕切り）
    {
      id: uid('partition'),
      type: 'partition',
      name: 'パーティション',
      position: [-1.0, 0, 1.0],
      rotation: [0, 0, 0],
      scale: [1.5, 1.8, 0.1],
    },
    {
      id: uid('partition'),
      type: 'partition',
      name: 'パーティション',
      position: [1.0, 0, 1.0],
      rotation: [0, 0, 0],
      scale: [1.5, 1.8, 0.1],
    },
    // 観葉植物（受付脇）
    {
      id: uid('plant'),
      type: 'plant',
      name: '観葉植物',
      position: [3.5, 0, 2.0],
      rotation: [0, 0, 0],
      scale: [0.5, 1.2, 0.5],
    },
  ];

  return {
    id: 'salon',
    name: '美容室',
    description: '受付+カット台6席のスタイリッシュなサロン',
    style: 'modern',
    roomWidth,
    roomDepth,
    roomHeight,
    walls,
    openings,
    furniture,
    thumbnail: '💇',
  };
}

// ============================
// 5. 小売店 (10x8m)
// ============================
function createRetailTemplate(): StoreTemplate {
  _idCounter = 400;
  const roomWidth = 10;
  const roomDepth = 8;
  const roomHeight = 3.0;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    {
      id: uid('door'),
      wallId: walls[2].id,
      type: 'door',
      positionAlongWall: 5,
      width: 1.5,
      height: 2.2,
      elevation: 0,
    },
    {
      id: uid('win'),
      wallId: walls[2].id,
      type: 'window',
      positionAlongWall: 2,
      width: 2.5,
      height: 1.8,
      elevation: 0.5,
    },
    {
      id: uid('win'),
      wallId: walls[2].id,
      type: 'window',
      positionAlongWall: 8,
      width: 2.5,
      height: 1.8,
      elevation: 0.5,
    },
  ];

  const furniture: FurnitureItem[] = [
    // レジカウンター（奥壁付近の右）
    {
      id: uid('counter'),
      type: 'counter',
      name: 'カウンター（レジ）',
      position: [3.5, 0, -3.5],
      rotation: [0, 0, 0],
      scale: [2.0, 1.1, 0.6],
    },
    // 商品棚6つ（左右壁際と中央通路）
    // 左壁沿い
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '商品棚',
      position: [-4.5, 0, -2.0],
      rotation: [0, Math.PI / 2, 0],
      scale: [2.0, 1.8, 0.4],
    },
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '商品棚',
      position: [-4.5, 0, 0.5],
      rotation: [0, Math.PI / 2, 0],
      scale: [2.0, 1.8, 0.4],
    },
    // 右壁沿い
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '商品棚',
      position: [4.5, 0, -2.0],
      rotation: [0, -Math.PI / 2, 0],
      scale: [2.0, 1.8, 0.4],
    },
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '商品棚',
      position: [4.5, 0, 0.5],
      rotation: [0, -Math.PI / 2, 0],
      scale: [2.0, 1.8, 0.4],
    },
    // 中央の島棚
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '商品棚（中央）',
      position: [-1.5, 0, -1.0],
      rotation: [0, 0, 0],
      scale: [1.5, 1.4, 0.5],
    },
    {
      id: uid('shelf'),
      type: 'shelf',
      name: '商品棚（中央）',
      position: [1.5, 0, -1.0],
      rotation: [0, 0, 0],
      scale: [1.5, 1.4, 0.5],
    },
    // ディスプレイテーブル2台（入口付近）
    {
      id: uid('table'),
      type: 'table_square',
      name: 'ディスプレイテーブル',
      position: [-2.0, 0, 2.0],
      rotation: [0, 0, 0],
      scale: [1.2, 0.75, 1.0],
    },
    {
      id: uid('table'),
      type: 'table_square',
      name: 'ディスプレイテーブル',
      position: [2.0, 0, 2.0],
      rotation: [0, 0, 0],
      scale: [1.2, 0.75, 1.0],
    },
    // 観葉植物（入口脇）
    {
      id: uid('plant'),
      type: 'plant',
      name: '観葉植物',
      position: [-4.0, 0, 3.5],
      rotation: [0, 0, 0],
      scale: [0.5, 1.2, 0.5],
    },
  ];

  return {
    id: 'retail',
    name: '小売店',
    description: 'レジ+商品棚+ディスプレイの開放的な物販レイアウト',
    style: 'minimal',
    roomWidth,
    roomDepth,
    roomHeight,
    walls,
    openings,
    furniture,
    thumbnail: '🛍️',
  };
}

// ============================
// 6. オフィス (10x7m)
// ============================
function createOfficeTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 10;
  const roomDepth = 7;
  const roomHeight = 2.7;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 5, width: 1.0, height: 2.1, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 2, width: 2.0, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 6, width: 2.0, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付カウンター
    { id: uid('counter'), type: 'counter', name: '受付カウンター', position: [0, 0, 2.5], rotation: [0, 0, 0], scale: [2.0, 1.0, 0.6] },
    // デスク4台（2行2列）
    { id: uid('table'), type: 'table_square', name: 'デスク', position: [-2.5, 0, -0.5], rotation: [0, 0, 0], scale: [1.2, 0.75, 0.7] },
    { id: uid('table'), type: 'table_square', name: 'デスク', position: [-2.5, 0, -2.0], rotation: [0, 0, 0], scale: [1.2, 0.75, 0.7] },
    { id: uid('table'), type: 'table_square', name: 'デスク', position: [0, 0, -0.5], rotation: [0, 0, 0], scale: [1.2, 0.75, 0.7] },
    { id: uid('table'), type: 'table_square', name: 'デスク', position: [0, 0, -2.0], rotation: [0, 0, 0], scale: [1.2, 0.75, 0.7] },
    // 椅子8脚
    ...[-2.5, 0].flatMap(x => [-0.5, -2.0].flatMap(z => [
      { id: uid('chair'), type: 'chair' as const, name: '椅子', position: [x - 0.5, 0, z] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number], scale: [0.45, 0.85, 0.45] as [number, number, number] },
      { id: uid('chair'), type: 'chair' as const, name: '椅子', position: [x + 0.5, 0, z] as [number, number, number], rotation: [0, -Math.PI / 2, 0] as [number, number, number], scale: [0.45, 0.85, 0.45] as [number, number, number] },
    ])),
    // 会議テーブル
    { id: uid('table'), type: 'table_square', name: '会議テーブル', position: [3.5, 0, -1.5], rotation: [0, 0, 0], scale: [2.0, 0.75, 1.0] },
    // 会議椅子4脚
    { id: uid('chair'), type: 'chair', name: '会議椅子', position: [3.5, 0, -0.7], rotation: [0, Math.PI, 0], scale: [0.45, 0.85, 0.45] },
    { id: uid('chair'), type: 'chair', name: '会議椅子', position: [3.5, 0, -2.3], rotation: [0, 0, 0], scale: [0.45, 0.85, 0.45] },
    { id: uid('chair'), type: 'chair', name: '会議椅子', position: [2.7, 0, -1.5], rotation: [0, Math.PI / 2, 0], scale: [0.45, 0.85, 0.45] },
    { id: uid('chair'), type: 'chair', name: '会議椅子', position: [4.3, 0, -1.5], rotation: [0, -Math.PI / 2, 0], scale: [0.45, 0.85, 0.45] },
    // 棚
    { id: uid('shelf'), type: 'shelf', name: '書類棚', position: [-4.5, 0, -1.0], rotation: [0, Math.PI / 2, 0], scale: [1.2, 1.8, 0.4] },
    // 植物
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [4.5, 0, 2.8], rotation: [0, 0, 0], scale: [0.5, 1.2, 0.5] },
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [-4.5, 0, 2.8], rotation: [0, 0, 0], scale: [0.5, 1.0, 0.5] },
  ];

  return { id: 'office', name: 'オフィス', description: 'デスク4台+会議室+受付の標準レイアウト', style: 'modern', roomWidth, roomDepth, roomHeight, walls, openings, furniture, thumbnail: '🏢' };
}

// ============================
// 7. クリニック (9x7m)
// ============================
function createClinicTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 9;
  const roomDepth = 7;
  const roomHeight = 2.8;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4.5, width: 1.2, height: 2.1, elevation: 0 },
    { id: uid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 2, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付
    { id: uid('counter'), type: 'counter', name: '受付カウンター', position: [2.0, 0, 2.5], rotation: [0, 0, 0], scale: [2.5, 1.0, 0.6] },
    // 待合椅子
    { id: uid('bench'), type: 'bench', name: '待合ベンチ', position: [-2.0, 0, 2.0], rotation: [0, 0, 0], scale: [2.0, 0.45, 0.5] },
    { id: uid('bench'), type: 'bench', name: '待合ベンチ', position: [-2.0, 0, 1.0], rotation: [0, 0, 0], scale: [2.0, 0.45, 0.5] },
    // 待合テーブル
    { id: uid('table'), type: 'table_round', name: '待合テーブル', position: [-2.0, 0, 1.5], rotation: [0, 0, 0], scale: [0.5, 0.45, 0.5] },
    // パーティション（診察室仕切り）
    { id: uid('part'), type: 'partition', name: '仕切り', position: [-0.5, 0, -0.5], rotation: [0, 0, 0], scale: [0.1, 2.2, 4.0] },
    { id: uid('part'), type: 'partition', name: '仕切り', position: [2.0, 0, -0.5], rotation: [0, 0, 0], scale: [0.1, 2.2, 4.0] },
    // 診察台
    { id: uid('bench'), type: 'bench', name: '診察台', position: [0.7, 0, -1.5], rotation: [0, 0, 0], scale: [1.8, 0.6, 0.7] },
    { id: uid('bench'), type: 'bench', name: '診察台', position: [3.2, 0, -1.5], rotation: [0, 0, 0], scale: [1.8, 0.6, 0.7] },
    // 棚
    { id: uid('shelf'), type: 'shelf', name: '医療棚', position: [0.7, 0, -3.0], rotation: [0, 0, 0], scale: [1.0, 1.5, 0.35] },
    // 植物
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [-3.8, 0, 2.8], rotation: [0, 0, 0], scale: [0.5, 1.0, 0.5] },
  ];

  return { id: 'clinic', name: 'クリニック', description: '受付+待合+診察室2部屋の医院レイアウト', style: 'minimal', roomWidth, roomDepth, roomHeight, walls, openings, furniture, thumbnail: '🏥' };
}

// ============================
// 8. ラーメン店 (7x5m)
// ============================
function createRamenTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 7;
  const roomDepth = 5;
  const roomHeight = 2.5;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3.0, width: 1.0, height: 2.1, elevation: 0 },
  ];

  const furniture: FurnitureItem[] = [
    // L字カウンター
    { id: uid('counter'), type: 'counter', name: 'カウンター（横）', position: [0, 0, -0.8], rotation: [0, 0, 0], scale: [5.0, 1.0, 0.5] },
    { id: uid('counter'), type: 'counter', name: 'カウンター（縦）', position: [-2.8, 0, 0.5], rotation: [0, Math.PI / 2, 0], scale: [2.0, 1.0, 0.5] },
    // スツール8脚（横カウンター）
    ...Array.from({ length: 6 }).map((_, i) => ({
      id: uid('stool'), type: 'stool' as const, name: 'スツール',
      position: [-2.0 + i * 0.8, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.35, 0.65, 0.35] as [number, number, number],
    })),
    // スツール（縦カウンター）
    { id: uid('stool'), type: 'stool', name: 'スツール', position: [-2.0, 0, 0.8], rotation: [0, Math.PI / 2, 0], scale: [0.35, 0.65, 0.35] },
    { id: uid('stool'), type: 'stool', name: 'スツール', position: [-2.0, 0, 1.5], rotation: [0, Math.PI / 2, 0], scale: [0.35, 0.65, 0.35] },
    // 棚（厨房側）
    { id: uid('shelf'), type: 'shelf', name: '食器棚', position: [0, 0, -2.0], rotation: [0, 0, 0], scale: [2.0, 1.5, 0.35] },
    // 冷蔵庫
    { id: uid('fridge'), type: 'fridge', name: '冷蔵庫', position: [2.8, 0, -2.0], rotation: [0, 0, 0], scale: [0.7, 1.8, 0.7] },
    // 小テーブル+椅子（窓際）
    { id: uid('table'), type: 'table_square', name: '小テーブル', position: [2.5, 0, 1.5], rotation: [0, 0, 0], scale: [0.6, 0.7, 0.6] },
    { id: uid('chair'), type: 'chair', name: '椅子', position: [2.5, 0, 1.0], rotation: [0, 0, 0], scale: [0.4, 0.8, 0.4] },
    { id: uid('chair'), type: 'chair', name: '椅子', position: [2.5, 0, 2.0], rotation: [0, Math.PI, 0], scale: [0.4, 0.8, 0.4] },
  ];

  return { id: 'ramen', name: 'ラーメン店', description: 'L字カウンター8席+小テーブルのコンパクト店舗', style: 'japanese', roomWidth, roomDepth, roomHeight, walls, openings, furniture, thumbnail: '🍜' };
}

// ============================
// 9. 美容室 (9x6m)
// ============================
function createBeautySalonTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 9;
  const roomDepth = 6;
  const roomHeight = 2.8;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4, width: 1.2, height: 2.1, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 2, width: 2.0, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 5, width: 2.0, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // レセプション
    { id: uid('reception'), type: 'reception_desk', name: 'レセプション', position: [0, 0, 2.0], rotation: [0, 0, 0], scale: [1.8, 1.0, 0.7] },
    // 施術ステーション3席（壁際にミラー+チェア）
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('mirror'), type: 'mirror' as const, name: '施術ミラー',
      position: [-3.5 + i * 2.0, 0, -2.5] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.9, 1.4, 0.05] as [number, number, number],
    })),
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('chair'), type: 'chair' as const, name: 'サロンチェア',
      position: [-3.5 + i * 2.0, 0, -1.5] as [number, number, number],
      rotation: [0, Math.PI, 0] as [number, number, number],
      scale: [0.55, 0.9, 0.55] as [number, number, number],
    })),
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('counter'), type: 'counter' as const, name: '施術台',
      position: [-3.5 + i * 2.0, 0, -2.0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.8, 0.75, 0.4] as [number, number, number],
    })),
    // 待合ソファ
    { id: uid('sofa'), type: 'sofa', name: '待合ソファ', position: [3.0, 0, 1.5], rotation: [0, -Math.PI / 2, 0], scale: [1.5, 0.7, 0.7] },
    { id: uid('table'), type: 'table_round', name: '雑誌テーブル', position: [3.5, 0, 1.5], rotation: [0, 0, 0], scale: [0.5, 0.45, 0.5] },
    // シャンプー台（シンク）
    { id: uid('sink'), type: 'sink', name: 'シャンプー台', position: [3.5, 0, -2.0], rotation: [0, Math.PI, 0], scale: [0.8, 0.8, 0.5] },
    // 植物
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [-3.8, 0, 2.2], rotation: [0, 0, 0], scale: [0.4, 1.0, 0.4] },
    // コートラック
    { id: uid('rack'), type: 'coat_rack', name: 'コートラック', position: [1.5, 0, 2.5], rotation: [0, 0, 0], scale: [0.4, 1.7, 0.4] },
  ];

  return { id: 'beauty_salon', name: '美容室', description: '施術3席+シャンプー+待合のヘアサロン', style: 'scandinavian', roomWidth, roomDepth, roomHeight, walls, openings, furniture, thumbnail: '💇' };
}

// ============================
// 10. フィットネスジム (12x8m)
// ============================
function createFitnessTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 12;
  const roomDepth = 8;
  const roomHeight = 3.0;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 5.5, width: 1.5, height: 2.2, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 1, width: 3.0, height: 1.5, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 7, width: 3.0, height: 1.5, elevation: 0.8 },
  ];

  const furniture: FurnitureItem[] = [
    // ウォールミラー
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('mirror'), type: 'mirror' as const, name: 'ウォールミラー',
      position: [-4.0 + i * 2.5, 0, -3.5] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [2.0, 2.0, 0.05] as [number, number, number],
    })),
    // トレーニングベンチ
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('bench'), type: 'bench' as const, name: 'トレーニングベンチ',
      position: [-4.0 + i * 2.5, 0, -1.5] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1.2, 0.5, 0.35] as [number, number, number],
    })),
    // ダンベルラック
    { id: uid('shelf'), type: 'shelf', name: 'ダンベルラック', position: [5.0, 0, -3.2], rotation: [0, 0, 0], scale: [2.0, 1.2, 0.5] },
    { id: uid('shelf'), type: 'shelf', name: 'ダンベルラック', position: [5.0, 0, -1.5], rotation: [0, 0, 0], scale: [2.0, 1.2, 0.5] },
    // レセプション
    { id: uid('counter'), type: 'counter', name: '受付カウンター', position: [4.0, 0, 3.0], rotation: [0, 0, 0], scale: [2.0, 1.0, 0.5] },
    // ベンチ（ストレッチエリア）
    ...Array.from({ length: 2 }).map((_, i) => ({
      id: uid('bench'), type: 'bench' as const, name: 'ストレッチマット',
      position: [-4.0 + i * 2.5, 0, 1.5] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1.8, 0.1, 0.6] as [number, number, number],
    })),
    // エアコン
    { id: uid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-5.0, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1.0, 0.3, 0.25] },
    { id: uid('ac'), type: 'air_conditioner', name: 'エアコン', position: [5.0, 0, 0], rotation: [0, -Math.PI / 2, 0], scale: [1.0, 0.3, 0.25] },
    // TVモニター
    { id: uid('tv'), type: 'tv_monitor', name: 'TVモニター', position: [0, 0, 3.2], rotation: [0, Math.PI, 0], scale: [1.5, 0.85, 0.08] },
    // 植物
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [-5.2, 0, 3.2], rotation: [0, 0, 0], scale: [0.5, 1.2, 0.5] },
  ];

  return { id: 'fitness', name: 'フィットネスジム', description: 'トレーニングエリア+ストレッチ+受付', style: 'industrial', roomWidth, roomDepth, roomHeight, walls, openings, furniture, thumbnail: '🏋️' };
}

// ============================
// 11. ブティック (8x7m)
// ============================
function createBoutiqueTemplate(): StoreTemplate {
  _idCounter = 0;
  const roomWidth = 8;
  const roomDepth = 7;
  const roomHeight = 3.0;
  const walls = createRectRoom(roomWidth, roomDepth, roomHeight);

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3.5, width: 1.4, height: 2.3, elevation: 0 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 0.5, width: 2.5, height: 1.8, elevation: 0.5 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 5.5, width: 2.0, height: 1.8, elevation: 0.5 },
  ];

  const furniture: FurnitureItem[] = [
    // レジカウンター
    { id: uid('register'), type: 'register', name: 'レジカウンター', position: [3.0, 0, -2.5], rotation: [0, 0, 0], scale: [0.6, 1.0, 0.5] },
    { id: uid('counter'), type: 'counter', name: 'レジ台', position: [3.0, 0, -2.5], rotation: [0, 0, 0], scale: [1.2, 0.9, 0.5] },
    // ショーケース
    ...Array.from({ length: 2 }).map((_, i) => ({
      id: uid('display'), type: 'display_case' as const, name: 'ショーケース',
      position: [-2.5 + i * 2.5, 0, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [1.2, 1.0, 0.5] as [number, number, number],
    })),
    // 壁面棚
    { id: uid('shelf'), type: 'shelf', name: '陳列棚', position: [-3.2, 0, -2.5], rotation: [0, Math.PI / 2, 0], scale: [1.5, 2.0, 0.4] },
    { id: uid('shelf'), type: 'shelf', name: '陳列棚', position: [-3.2, 0, 0.5], rotation: [0, Math.PI / 2, 0], scale: [1.5, 2.0, 0.4] },
    // コートラック
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('rack'), type: 'coat_rack' as const, name: 'ハンガーラック',
      position: [0, 0, -2.8 + i * 1.8] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.5, 1.6, 0.5] as [number, number, number],
    })),
    // フィッティングミラー
    { id: uid('mirror'), type: 'mirror', name: 'フィッティングミラー', position: [3.2, 0, 1.0], rotation: [0, -Math.PI / 2, 0], scale: [0.8, 1.8, 0.05] },
    // ソファ（試着待ち）
    { id: uid('sofa'), type: 'sofa', name: '待合ソファ', position: [2.5, 0, 2.5], rotation: [0, -Math.PI / 2, 0], scale: [1.2, 0.65, 0.65] },
    // 植物
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [-3.2, 0, 2.8], rotation: [0, 0, 0], scale: [0.5, 1.3, 0.5] },
    { id: uid('plant'), type: 'plant', name: '観葉植物', position: [3.2, 0, 2.8], rotation: [0, 0, 0], scale: [0.4, 0.9, 0.4] },
    // ペンダントライト
    ...Array.from({ length: 3 }).map((_, i) => ({
      id: uid('light'), type: 'pendant_light' as const, name: 'ペンダントライト',
      position: [-2.0 + i * 2.0, roomHeight - 0.3, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.25, 0.35, 0.25] as [number, number, number],
    })),
  ];

  return { id: 'boutique', name: 'ブティック', description: 'アパレル陳列+試着+レジのファッション店舗', style: 'luxury', roomWidth, roomDepth, roomHeight, walls, openings, furniture, thumbnail: '👗' };
}

// テンプレート一覧（エクスポート）
export const STORE_TEMPLATES: StoreTemplate[] = [
  createCafeTemplate(),
  createIzakayaTemplate(),
  createBarTemplate(),
  createSalonTemplate(),
  createRetailTemplate(),
  createOfficeTemplate(),
  createClinicTemplate(),
  createRamenTemplate(),
  createBeautySalonTemplate(),
  createFitnessTemplate(),
  createBoutiqueTemplate(),
];

// IDで取得するヘルパー
export function getTemplateById(id: string): StoreTemplate | undefined {
  return STORE_TEMPLATES.find((t) => t.id === id);
}

// デフォルトテンプレート（カフェ 20席）
export const DEFAULT_TEMPLATE = STORE_TEMPLATES[0];
