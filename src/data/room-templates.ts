// 部屋テンプレートプリセット
// ユーザーが壁を一から描かずに素早く開始できるプリビルドテンプレート集

import { WallSegment, Opening } from '@/types/floor-plan';
import { FurnitureItem, StylePreset } from '@/types/scene';
import { createRectRoom } from '@/lib/geometry';

export interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  style: StylePreset;
  roomHeight: number;
  walls: WallSegment[];
  openings: Opening[];
  furniture: FurnitureItem[];
}

// ユニークID生成ヘルパー
let _rtIdCounter = 0;
function rid(prefix: string): string {
  _rtIdCounter++;
  return `rt_${prefix}_${_rtIdCounter}`;
}

// ============================
// 1. 小規模カフェ (4m x 5m)
// ============================
function createSmallCafeTemplate(): RoomTemplate {
  _rtIdCounter = 0;
  const w = 4, d = 5, h = 2.7;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 2.0, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 1.0, width: 1.2, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 3.0, width: 1.2, height: 1.2, elevation: 0.9 },
  ];

  // 部屋中心 = (0,0)、壁: x=-2..2, y=-2.5..2.5
  const furniture: FurnitureItem[] = [
    // カウンター（奥壁沿い）
    { id: rid('counter'), type: 'counter', name: 'カウンター', position: [0, 0, -2.0], rotation: [0, 0, 0], scale: [2.5, 1.0, 0.5] },
    // テーブル1（左手前）
    { id: rid('table'), type: 'table_round', name: '丸テーブル', position: [-0.8, 0, 0.0], rotation: [0, 0, 0], scale: [0.7, 0.72, 0.7] },
    { id: rid('chair'), type: 'chair', name: '椅子', position: [-0.8, 0, -0.5], rotation: [0, 0, 0], scale: [0.42, 0.82, 0.42] },
    { id: rid('chair'), type: 'chair', name: '椅子', position: [-0.8, 0, 0.5], rotation: [0, Math.PI, 0], scale: [0.42, 0.82, 0.42] },
    // テーブル2（右手前）
    { id: rid('table'), type: 'table_round', name: '丸テーブル', position: [0.8, 0, 0.0], rotation: [0, 0, 0], scale: [0.7, 0.72, 0.7] },
    { id: rid('chair'), type: 'chair', name: '椅子', position: [0.8, 0, -0.5], rotation: [0, 0, 0], scale: [0.42, 0.82, 0.42] },
    { id: rid('chair'), type: 'chair', name: '椅子', position: [0.8, 0, 0.5], rotation: [0, Math.PI, 0], scale: [0.42, 0.82, 0.42] },
    // テーブル3（窓際中央）
    { id: rid('table'), type: 'table_round', name: '丸テーブル', position: [0, 0, 1.2], rotation: [0, 0, 0], scale: [0.7, 0.72, 0.7] },
    { id: rid('chair'), type: 'chair', name: '椅子', position: [-0.4, 0, 1.2], rotation: [0, Math.PI / 2, 0], scale: [0.42, 0.82, 0.42] },
    { id: rid('chair'), type: 'chair', name: '椅子', position: [0.4, 0, 1.2], rotation: [0, -Math.PI / 2, 0], scale: [0.42, 0.82, 0.42] },
    // ペンダントライト
    { id: rid('light'), type: 'pendant_light', name: 'ペンダントライト', position: [0, h - 0.3, 0], rotation: [0, 0, 0], scale: [0.28, 0.35, 0.28] },
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [1.6, 0, 2.0], rotation: [0, 0, 0], scale: [0.4, 1.0, 0.4] },
    // エアコン（左壁、室内向き）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-1.9, 2.2, 0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_small_cafe',
    name: '小規模カフェ',
    description: '4m×5m カウンター+テーブル3席のコンパクトカフェ',
    icon: '☕',
    style: 'cafe',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 2. 美容室 (5m x 6m)
// ============================
function createHairSalonTemplate(): RoomTemplate {
  _rtIdCounter = 100;
  const w = 5, d = 6, h = 2.8;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 2.5, width: 1.0, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 1.2, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 3.0, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  // 壁: x=-2.5..2.5, y=-3..3
  const furniture: FurnitureItem[] = [
    // 受付カウンター（入口近く）
    { id: rid('reception'), type: 'reception_desk', name: '受付', position: [1.2, 0, 2.2], rotation: [0, 0, 0], scale: [1.5, 1.0, 0.6] },
    // ミラー+カット椅子 3セット（奥壁沿い）
    ...[0, 1, 2].flatMap(i => [
      { id: rid('mirror'), type: 'mirror' as const, name: '施術ミラー',
        position: [-1.5 + i * 1.5, 0, -2.6] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.8, 1.3, 0.05] as [number, number, number] },
      { id: rid('chair'), type: 'chair' as const, name: 'カット椅子',
        position: [-1.5 + i * 1.5, 0, -1.8] as [number, number, number],
        rotation: [0, Math.PI, 0] as [number, number, number],
        scale: [0.5, 0.9, 0.5] as [number, number, number] },
      { id: rid('counter'), type: 'counter' as const, name: '施術台',
        position: [-1.5 + i * 1.5, 0, -2.2] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.7, 0.75, 0.35] as [number, number, number] },
    ]),
    // ミラー4つ目（右壁沿い）
    { id: rid('mirror'), type: 'mirror', name: '施術ミラー', position: [2.1, 0, -0.5], rotation: [0, -Math.PI / 2, 0], scale: [0.8, 1.3, 0.05] },
    { id: rid('chair'), type: 'chair', name: 'カット椅子', position: [1.3, 0, -0.5], rotation: [0, Math.PI / 2, 0], scale: [0.5, 0.9, 0.5] },
    // シンク2台（右壁奥）
    { id: rid('sink'), type: 'sink', name: 'シャンプー台', position: [1.8, 0, 0.8], rotation: [0, -Math.PI / 2, 0], scale: [0.7, 0.8, 0.5] },
    { id: rid('sink'), type: 'sink', name: 'シャンプー台', position: [1.8, 0, 1.6], rotation: [0, -Math.PI / 2, 0], scale: [0.7, 0.8, 0.5] },
    // 待合ソファ
    { id: rid('sofa'), type: 'sofa', name: '待合ソファ', position: [-1.5, 0, 2.0], rotation: [0, 0, 0], scale: [1.2, 0.65, 0.6] },
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [-2.0, 0, 2.5], rotation: [0, 0, 0], scale: [0.4, 1.0, 0.4] },
    // エアコン（左壁+奥壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-2.4, 2.2, 0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [0, 2.2, -2.9], rotation: [0, 0, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_hair_salon',
    name: '美容室',
    description: '5m×6m ミラー4席+シャンプー2台+待合の美容室',
    icon: '💇',
    style: 'scandinavian',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 3. コンビニ (6m x 8m)
// ============================
function createConvenienceStoreTemplate(): RoomTemplate {
  _rtIdCounter = 200;
  const w = 6, d = 8, h = 2.8;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    // 自動ドア幅（1.5m）
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3.0, width: 1.5, height: 2.2, elevation: 0 },
    // 窓（正面）
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 0.8, width: 2.0, height: 1.8, elevation: 0.5 },
  ];

  // 壁: x=-3..3, y=-4..4
  const furniture: FurnitureItem[] = [
    // レジカウンター（入口右）
    { id: rid('register'), type: 'register', name: 'レジ', position: [2.0, 0, 3.2], rotation: [0, 0, 0], scale: [0.6, 1.0, 0.5] },
    { id: rid('counter'), type: 'counter', name: 'レジカウンター', position: [2.0, 0, 3.2], rotation: [0, 0, 0], scale: [1.8, 0.9, 0.5] },
    // 商品棚 6本（縦向き 通路を挟んで3列×2）
    ...[0, 1, 2].flatMap(i => [
      { id: rid('shelf'), type: 'shelf' as const, name: '商品棚',
        position: [-1.5, 0, -2.5 + i * 2.0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1.4, 1.6, 0.5] as [number, number, number] },
      { id: rid('shelf'), type: 'shelf' as const, name: '商品棚',
        position: [0.5, 0, -2.5 + i * 2.0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1.4, 1.6, 0.5] as [number, number, number] },
    ]),
    // 追加棚2本（壁際）
    { id: rid('shelf'), type: 'shelf', name: '壁面棚', position: [-2.6, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [3.0, 1.8, 0.4] },
    { id: rid('shelf'), type: 'shelf', name: '壁面棚', position: [-2.6, 0, -2.5], rotation: [0, Math.PI / 2, 0], scale: [2.0, 1.8, 0.4] },
    // 冷蔵庫2台（奥壁沿い）
    { id: rid('fridge'), type: 'fridge', name: '冷蔵庫', position: [-1.5, 0, -3.5], rotation: [0, 0, 0], scale: [1.2, 1.9, 0.7] },
    { id: rid('fridge'), type: 'fridge', name: '冷蔵庫', position: [0.5, 0, -3.5], rotation: [0, 0, 0], scale: [1.2, 1.9, 0.7] },
    // エアコン（左壁+右壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-2.9, 2.2, 0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [2.9, 2.2, 0], rotation: [0, -Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_convenience',
    name: 'コンビニ',
    description: '6m×8m レジ+棚8本+冷蔵庫2台のコンビニ',
    icon: '🏪',
    style: 'modern',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 4. オフィス (6m x 8m)
// ============================
function createOfficeTemplate(): RoomTemplate {
  _rtIdCounter = 300;
  const w = 6, d = 8, h = 2.7;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3.0, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 1.0, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 3.0, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 5.0, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  // 壁: x=-3..3, y=-4..4
  const furniture: FurnitureItem[] = [
    // デスク6台 (2列×3)
    ...[0, 1, 2].flatMap(row => [
      { id: rid('desk'), type: 'desk' as const, name: 'デスク',
        position: [-1.2, 0, -2.5 + row * 1.8] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1.1, 0.73, 0.6] as [number, number, number] },
      { id: rid('desk'), type: 'desk' as const, name: 'デスク',
        position: [1.2, 0, -2.5 + row * 1.8] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [1.1, 0.73, 0.6] as [number, number, number] },
    ]),
    // 椅子6脚（デスクに向かって座る）
    ...[0, 1, 2].flatMap(row => [
      { id: rid('chair'), type: 'chair' as const, name: '椅子',
        position: [-1.2, 0, -2.0 + row * 1.8] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.45, 0.85, 0.45] as [number, number, number] },
      { id: rid('chair'), type: 'chair' as const, name: '椅子',
        position: [1.2, 0, -2.0 + row * 1.8] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.45, 0.85, 0.45] as [number, number, number] },
    ]),
    // 本棚（左壁沿い）
    { id: rid('bookcase'), type: 'bookcase', name: '本棚', position: [-2.6, 0, -2.0], rotation: [0, Math.PI / 2, 0], scale: [0.85, 1.9, 0.35] },
    // パーティション（会議エリア仕切り）
    { id: rid('partition'), type: 'partition', name: 'パーティション', position: [0, 0, 2.0], rotation: [0, 0, 0], scale: [2.0, 1.6, 0.08] },
    // 会議テーブル（奥手前エリア）
    { id: rid('table'), type: 'table_square', name: '会議テーブル', position: [0, 0, 3.0], rotation: [0, 0, 0], scale: [1.5, 0.73, 0.8] },
    // 会議椅子4脚
    { id: rid('chair'), type: 'chair', name: '会議椅子', position: [-0.5, 0, 2.6], rotation: [0, 0, 0], scale: [0.42, 0.82, 0.42] },
    { id: rid('chair'), type: 'chair', name: '会議椅子', position: [0.5, 0, 2.6], rotation: [0, 0, 0], scale: [0.42, 0.82, 0.42] },
    { id: rid('chair'), type: 'chair', name: '会議椅子', position: [-0.5, 0, 3.4], rotation: [0, Math.PI, 0], scale: [0.42, 0.82, 0.42] },
    { id: rid('chair'), type: 'chair', name: '会議椅子', position: [0.5, 0, 3.4], rotation: [0, Math.PI, 0], scale: [0.42, 0.82, 0.42] },
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [2.5, 0, 3.5], rotation: [0, 0, 0], scale: [0.4, 1.0, 0.4] },
    // エアコン（左壁+右壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-2.9, 2.2, 0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [2.9, 2.2, 0], rotation: [0, -Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_office',
    name: 'オフィス',
    description: '6m×8m デスク6台+会議コーナー+パーティション',
    icon: '🏢',
    style: 'modern',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 5. レストラン (8m x 10m)
// ============================
function createRestaurantTemplate(): RoomTemplate {
  _rtIdCounter = 400;
  const w = 8, d = 10, h = 2.8;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4.0, width: 1.2, height: 2.1, elevation: 0 },
    { id: rid('door'), wallId: walls[0].id, type: 'door', positionAlongWall: 7.5, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 1.0, width: 1.8, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 6.5, width: 1.8, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 2.5, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 7.5, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  // 壁: x=-4..4, y=-5..5
  const furniture: FurnitureItem[] = [
    // カウンター（奥壁沿い）
    { id: rid('counter'), type: 'counter', name: 'カウンター', position: [0, 0, -4.2], rotation: [0, 0, 0], scale: [3.5, 1.0, 0.5] },
    // キッチンアイランド（カウンター裏）
    { id: rid('island'), type: 'kitchen_island', name: 'キッチンアイランド', position: [0, 0, -3.2], rotation: [0, 0, 0], scale: [2.0, 0.9, 0.8] },
    // テーブル8席（4列×2）
    ...[0, 1, 2, 3].flatMap(row => [
      { id: rid('table'), type: 'table_square' as const, name: 'テーブル',
        position: [-2.0, 0, -1.5 + row * 2.0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.8, 0.73, 0.8] as [number, number, number] },
      { id: rid('table'), type: 'table_square' as const, name: 'テーブル',
        position: [2.0, 0, -1.5 + row * 2.0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        scale: [0.8, 0.73, 0.8] as [number, number, number] },
    ]),
    // 各テーブルに椅子2脚ずつ（計16脚）
    ...[0, 1, 2, 3].flatMap(row =>
      [-2.0, 2.0].flatMap(x => [
        { id: rid('chair'), type: 'chair' as const, name: '椅子',
          position: [x - 0.45, 0, -1.5 + row * 2.0] as [number, number, number],
          rotation: [0, Math.PI / 2, 0] as [number, number, number],
          scale: [0.42, 0.82, 0.42] as [number, number, number] },
        { id: rid('chair'), type: 'chair' as const, name: '椅子',
          position: [x + 0.45, 0, -1.5 + row * 2.0] as [number, number, number],
          rotation: [0, -Math.PI / 2, 0] as [number, number, number],
          scale: [0.42, 0.82, 0.42] as [number, number, number] },
      ])
    ),
    // ペンダントライト4つ
    ...Array.from({ length: 4 }, (_, i) => ({
      id: rid('light'), type: 'pendant_light' as const, name: 'ペンダントライト',
      position: [-2.0 + Math.floor(i / 2) * 4.0, h - 0.3, -1.0 + (i % 2) * 3.5] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.3, 0.4, 0.3] as [number, number, number],
    })),
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [3.5, 0, 4.2], rotation: [0, 0, 0], scale: [0.5, 1.2, 0.5] },
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [-3.5, 0, 4.2], rotation: [0, 0, 0], scale: [0.5, 1.2, 0.5] },
    // エアコン（左壁×2+奥壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-3.9, 2.2, -2.0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-3.9, 2.2, 2.0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [0, 2.2, -4.9], rotation: [0, 0, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_restaurant',
    name: 'レストラン',
    description: '8m×10m テーブル8席+カウンター+キッチンアイランド',
    icon: '🍽️',
    style: 'cafe',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 6. バー (4m x 8m)
// ============================
function createBarTemplate(): RoomTemplate {
  _rtIdCounter = 500;
  const w = 4, d = 8, h = 2.6;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 2.0, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 4.0, width: 1.2, height: 1.0, elevation: 1.2 },
  ];

  // 壁: x=-2..2, y=-4..4
  const furniture: FurnitureItem[] = [
    // 長いカウンター（左壁沿い、長辺方向）
    { id: rid('counter'), type: 'counter', name: 'カウンター', position: [-1.2, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [6.0, 1.05, 0.55] },
    // スツール8脚（カウンター沿い）
    ...Array.from({ length: 8 }, (_, i) => ({
      id: rid('stool'), type: 'stool' as const, name: 'スツール',
      position: [-0.3, 0, -3.0 + i * 0.85] as [number, number, number],
      rotation: [0, Math.PI / 2, 0] as [number, number, number],
      scale: [0.33, 0.7, 0.33] as [number, number, number],
    })),
    // 酒棚（カウンター背面、左壁沿い）
    { id: rid('shelf'), type: 'shelf', name: '酒棚', position: [-1.7, 0, -1.5], rotation: [0, Math.PI / 2, 0], scale: [2.5, 1.8, 0.3] },
    { id: rid('shelf'), type: 'shelf', name: '酒棚', position: [-1.7, 0, 1.5], rotation: [0, Math.PI / 2, 0], scale: [2.5, 1.8, 0.3] },
    // ペンダントライト2つ
    { id: rid('light'), type: 'pendant_light', name: 'ペンダントライト', position: [-0.5, h - 0.3, -1.5], rotation: [0, 0, 0], scale: [0.25, 0.35, 0.25] },
    { id: rid('light'), type: 'pendant_light', name: 'ペンダントライト', position: [-0.5, h - 0.3, 1.5], rotation: [0, 0, 0], scale: [0.25, 0.35, 0.25] },
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [1.5, 0, 3.5], rotation: [0, 0, 0], scale: [0.35, 0.9, 0.35] },
    // エアコン（奥壁+右壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [0, 2.2, -3.9], rotation: [0, 0, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [1.9, 2.2, 0], rotation: [0, -Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_bar',
    name: 'バー',
    description: '4m×8m ロングカウンター+スツール8席+酒棚',
    icon: '🍸',
    style: 'luxury',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 7. クリニック (6m x 7m)
// ============================
function createClinicTemplate(): RoomTemplate {
  _rtIdCounter = 600;
  const w = 6, d = 7, h = 2.8;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3.0, width: 1.0, height: 2.1, elevation: 0 },
    { id: rid('door'), wallId: walls[0].id, type: 'door', positionAlongWall: 4.5, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 2.0, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[3].id, type: 'window', positionAlongWall: 2.0, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  // 壁: x=-3..3, y=-3.5..3.5
  const furniture: FurnitureItem[] = [
    // 受付カウンター
    { id: rid('counter'), type: 'counter', name: '受付カウンター', position: [1.5, 0, 2.5], rotation: [0, 0, 0], scale: [2.0, 1.0, 0.55] },
    // 待合椅子（ベンチ2脚、入口側左）
    { id: rid('bench'), type: 'bench', name: '待合ベンチ', position: [-1.5, 0, 2.5], rotation: [0, 0, 0], scale: [1.8, 0.45, 0.45] },
    { id: rid('bench'), type: 'bench', name: '待合ベンチ', position: [-1.5, 0, 1.5], rotation: [0, 0, 0], scale: [1.8, 0.45, 0.45] },
    // 待合テーブル
    { id: rid('table'), type: 'table_round', name: '待合テーブル', position: [-1.5, 0, 2.0], rotation: [0, 0, 0], scale: [0.45, 0.42, 0.45] },
    // パーティション（待合と診察エリアの仕切り）
    { id: rid('partition'), type: 'partition', name: '仕切り', position: [0, 0, 0.5], rotation: [0, 0, 0], scale: [5.5, 2.2, 0.08] },
    // パーティション（診察室2部屋の仕切り）
    { id: rid('partition'), type: 'partition', name: '診察室仕切り', position: [0, 0, -1.5], rotation: [0, Math.PI / 2, 0], scale: [3.5, 2.2, 0.08] },
    // 診察台1
    { id: rid('bench'), type: 'bench', name: '診察台', position: [-1.5, 0, -1.0], rotation: [0, 0, 0], scale: [1.6, 0.6, 0.65] },
    // 診察台2
    { id: rid('bench'), type: 'bench', name: '診察台', position: [1.5, 0, -1.0], rotation: [0, 0, 0], scale: [1.6, 0.6, 0.65] },
    // 医療棚
    { id: rid('shelf'), type: 'shelf', name: '医療棚', position: [-2.5, 0, -2.8], rotation: [0, 0, 0], scale: [1.0, 1.5, 0.35] },
    { id: rid('shelf'), type: 'shelf', name: '医療棚', position: [2.5, 0, -2.8], rotation: [0, 0, 0], scale: [1.0, 1.5, 0.35] },
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [-2.5, 0, 3.0], rotation: [0, 0, 0], scale: [0.4, 0.9, 0.4] },
    // エアコン（奥壁+入口壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-1.5, 2.2, -3.4], rotation: [0, 0, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [1.5, 2.2, 3.4], rotation: [0, Math.PI, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_clinic',
    name: 'クリニック',
    description: '6m×7m 受付+待合+診察室2部屋の医院レイアウト',
    icon: '🏥',
    style: 'medical',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// ============================
// 8. アパレルショップ (5m x 7m)
// ============================
function createApparelShopTemplate(): RoomTemplate {
  _rtIdCounter = 700;
  const w = 5, d = 7, h = 3.0;
  const walls = createRectRoom(w, d, h);

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 2.5, width: 1.2, height: 2.2, elevation: 0 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 0.5, width: 1.5, height: 1.8, elevation: 0.5 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 4.0, width: 1.5, height: 1.8, elevation: 0.5 },
  ];

  // 壁: x=-2.5..2.5, y=-3.5..3.5
  const furniture: FurnitureItem[] = [
    // ディスプレイケース3台（中央通路沿い — 左列）
    { id: rid('display'), type: 'display_case', name: 'ディスプレイケース', position: [-0.8, 0, -1.5], rotation: [0, 0, 0], scale: [1.0, 1.0, 0.5] },
    { id: rid('display'), type: 'display_case', name: 'ディスプレイケース', position: [0.0, 0, 0.5], rotation: [0, 0, 0], scale: [1.0, 1.0, 0.5] },
    { id: rid('display'), type: 'display_case', name: 'ディスプレイケース', position: [0.8, 0, 2.0], rotation: [0, 0, 0], scale: [1.0, 1.0, 0.5] },
    // ディスプレイケース4台目
    { id: rid('display'), type: 'display_case', name: 'ディスプレイケース', position: [0.8, 0, 0.5], rotation: [0, 0, 0], scale: [1.0, 1.0, 0.5] },
    // ハンガーラック3本（壁沿い）
    { id: rid('rack'), type: 'coat_rack', name: 'ハンガーラック', position: [-2.0, 0, -2.5], rotation: [0, 0, 0], scale: [0.5, 1.65, 0.5] },
    { id: rid('rack'), type: 'coat_rack', name: 'ハンガーラック', position: [-2.0, 0, -0.5], rotation: [0, 0, 0], scale: [0.5, 1.65, 0.5] },
    { id: rid('rack'), type: 'coat_rack', name: 'ハンガーラック', position: [-2.0, 0, 1.5], rotation: [0, 0, 0], scale: [0.5, 1.65, 0.5] },
    // ミラー2枚（右壁沿い、フィッティング）
    { id: rid('mirror'), type: 'mirror', name: 'フィッティングミラー', position: [2.1, 0, -1.5], rotation: [0, -Math.PI / 2, 0], scale: [0.8, 1.7, 0.05] },
    { id: rid('mirror'), type: 'mirror', name: 'フィッティングミラー', position: [2.1, 0, 0.5], rotation: [0, -Math.PI / 2, 0], scale: [0.8, 1.7, 0.05] },
    // レジカウンター（奥壁右）
    { id: rid('counter'), type: 'counter', name: 'レジカウンター', position: [1.5, 0, -3.0], rotation: [0, 0, 0], scale: [1.5, 0.9, 0.5] },
    { id: rid('register'), type: 'register', name: 'レジ', position: [1.5, 0, -3.0], rotation: [0, 0, 0], scale: [0.5, 1.0, 0.45] },
    // ペンダントライト3つ
    ...Array.from({ length: 3 }, (_, i) => ({
      id: rid('light'), type: 'pendant_light' as const, name: 'ペンダントライト',
      position: [0, h - 0.3, -2.0 + i * 2.0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [0.25, 0.35, 0.25] as [number, number, number],
    })),
    // 観葉植物
    { id: rid('plant'), type: 'plant', name: '観葉植物', position: [2.0, 0, 3.0], rotation: [0, 0, 0], scale: [0.4, 1.1, 0.4] },
    // エアコン（奥壁+左壁）
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [0, 2.2, -3.4], rotation: [0, 0, 0], scale: [0.9, 0.3, 0.25] },
    { id: rid('ac'), type: 'air_conditioner', name: 'エアコン', position: [-2.4, 2.2, 0], rotation: [0, Math.PI / 2, 0], scale: [0.9, 0.3, 0.25] },
  ];

  return {
    id: 'rt_apparel',
    name: 'アパレルショップ',
    description: '5m×7m ディスプレイ4台+ハンガーラック3本+ミラー2枚',
    icon: '👗',
    style: 'luxury',
    roomHeight: h,
    walls,
    openings,
    furniture,
  };
}

// テンプレート一覧（エクスポート）
export const ROOM_TEMPLATES: RoomTemplate[] = [
  createSmallCafeTemplate(),
  createHairSalonTemplate(),
  createConvenienceStoreTemplate(),
  createOfficeTemplate(),
  createRestaurantTemplate(),
  createBarTemplate(),
  createClinicTemplate(),
  createApparelShopTemplate(),
];

// IDで取得するヘルパー
export function getRoomTemplateById(id: string): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((t) => t.id === id);
}
