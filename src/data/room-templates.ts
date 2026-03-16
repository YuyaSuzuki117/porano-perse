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

// 家具生成ヘルパー
function rf(type: string, name: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], sc: [number, number, number] = [1, 1, 1]): FurnitureItem {
  return { id: rid(type), type: type as FurnitureItem['type'], name, position: pos, rotation: rot, scale: sc };
}

// ============================
// 1. 小規模カフェ (6m x 7m)
// ============================
function createSmallCafeTemplate(): RoomTemplate {
  _rtIdCounter = 0;
  const w = 6, d = 7, h = 2.7;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3.0, width: 1.0, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 1.5, width: 1.5, height: 1.3, elevation: 0.8 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 4.5, width: 1.5, height: 1.3, elevation: 0.8 },
  ];

  const furniture: FurnitureItem[] = [
    // カウンター＆バックバー
    rf('counter', 'カウンター', [0, 0, -hd + 0.4], [0, 0, 0], [3.0, 1.0, 0.5]),
    rf('espresso_machine', 'エスプレッソマシン', [-0.8, 0.85, -hd + 0.25], [0, 0, 0], [0.4, 0.45, 0.35]),
    rf('cake_showcase', 'ケーキショーケース', [0.8, 0, -hd + 0.25], [0, 0, 0], [1.0, 0.9, 0.5]),
    rf('register', 'レジ', [1.8, 0, -hd + 0.4], [0, 0, 0], [0.5, 0.9, 0.45]),
    // カウンタースツール3脚
    ...Array.from({ length: 3 }, (_, i) => rf('stool', 'スツール', [-0.8 + i * 0.8, 0, -hd + 1.2], [0, 0, 0], [0.35, 0.7, 0.35])),
    // 丸テーブル4セット
    ...[-1.3, 1.3].flatMap(x => [0, 1.8].flatMap(z => [
      rf('table_round', '丸テーブル', [x, 0, z], [0, 0, 0], [0.7, 0.72, 0.7]),
      rf('chair', '椅子', [x, 0, z - 0.45], [0, 0, 0], [0.42, 0.82, 0.42]),
      rf('chair', '椅子', [x, 0, z + 0.45], [0, Math.PI, 0], [0.42, 0.82, 0.42]),
    ])),
    // ソファ席 (左壁沿い)
    rf('sofa', 'ソファ', [-hw + 0.5, 0, 0.8], [0, Math.PI / 2, 0], [1.4, 0.65, 0.6]),
    rf('table_round', 'ソファテーブル', [-hw + 1.3, 0, 0.8], [0, 0, 0], [0.55, 0.5, 0.55]),
    // 装飾
    rf('menu_board', 'メニューボード', [0, 1.5, hd - 0.12], [0, Math.PI, 0], [0.7, 0.5, 0.05]),
    rf('clock', '時計', [0, 2.0, -hd + 0.08], [0, 0, 0], [0.3, 0.3, 0.05]),
    // ペンダントライト3つ
    ...Array.from({ length: 3 }, (_, i) => rf('pendant_light', 'ペンダントライト', [-1.5 + i * 1.5, h - 0.3, 0.8], [0, 0, 0], [0.28, 0.35, 0.28])),
    rf('indirect_light', '間接照明', [0, 2.0, -hd + 0.12], [0, 0, 0], [0.1, 0.3, 2.5]),
    // 植物
    rf('plant', '観葉植物', [hw - 0.4, 0, hd - 0.4], [0, 0, 0], [0.5, 1.2, 0.5]),
    rf('plant_small', '小型植物', [-1.5, 0.72, 0], [0, 0, 0], [0.2, 0.3, 0.2]),
    rf('flower_pot', '花瓶', [1.3, 0.72, 1.8], [0, 0, 0], [0.18, 0.25, 0.18]),
    // 入口
    rf('coat_rack', 'コートラック', [1.5, 0, hd - 0.35], [0, 0, 0], [0.4, 1.7, 0.4]),
    rf('umbrella_stand', '傘立て', [2.0, 0, hd - 0.25], [0, 0, 0], [0.25, 0.55, 0.25]),
    rf('trash_can', 'ゴミ箱', [-hw + 0.35, 0, hd - 0.3], [0, 0, 0], [0.28, 0.6, 0.28]),
    // ラグ＆カーテン
    rf('rug', 'ラグ', [0, 0.01, 0.8], [0, 0, 0], [2.5, 0.02, 2]),
    rf('curtain', 'カーテン', [-1.5, 0, -hd + 0.08], [0, 0, 0], [0.5, 2.2, 0.08]),
    rf('curtain', 'カーテン', [1.5, 0, -hd + 0.08], [0, 0, 0], [0.5, 2.2, 0.08]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, 0], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, 0], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_small_cafe', name: '小規模カフェ', description: '6m×7m カウンター+テーブル4+ソファ席のカフェ', icon: '☕', style: 'cafe', roomHeight: h, walls, openings, furniture };
}

// ============================
// 2. 美容室 (8m x 8m)
// ============================
function createHairSalonTemplate(): RoomTemplate {
  _rtIdCounter = 100;
  const w = 8, d = 8, h = 2.8;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4, width: 1.2, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 2, width: 1.8, height: 1.3, elevation: 0.8 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 6, width: 1.8, height: 1.3, elevation: 0.8 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 4, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // レセプション
    rf('reception_desk', 'レセプション', [2, 0, hd - 1.0], [0, 0, 0], [1.8, 1.0, 0.65]),
    rf('register', 'レジ', [2.6, 0, hd - 1.0], [0, 0, 0], [0.45, 0.9, 0.4]),
    // 待合
    rf('waiting_sofa', '待合ソファ', [-1.5, 0, hd - 1.0], [0, 0, 0], [1.8, 0.65, 0.65]),
    rf('table_round', '雑誌テーブル', [-1.5, 0, hd - 1.8], [0, 0, 0], [0.45, 0.42, 0.45]),
    rf('coat_rack', 'コートラック', [0.5, 0, hd - 0.35], [0, 0, 0], [0.4, 1.7, 0.4]),
    rf('umbrella_stand', '傘立て', [1.0, 0, hd - 0.25], [0, 0, 0], [0.25, 0.55, 0.25]),
    // ミラーステーション5席 (奥壁沿い)
    ...Array.from({ length: 5 }, (_, i) => [
      rf('mirror_station', '施術ミラー', [-3 + i * 1.5, 0, -hd + 0.15], [0, 0, 0], [0.85, 1.4, 0.05]),
      rf('counter', '施術台', [-3 + i * 1.5, 0, -hd + 0.5], [0, 0, 0], [0.7, 0.75, 0.35]),
      rf('chair', 'カット椅子', [-3 + i * 1.5, 0, -hd + 1.2], [0, Math.PI, 0], [0.5, 0.9, 0.5]),
    ]).flat(),
    // シャンプーステーション2台 (右壁沿い)
    rf('shampoo_station', 'シャンプー台', [hw - 0.4, 0, -1.5], [0, -Math.PI / 2, 0], [0.7, 0.8, 0.5]),
    rf('shampoo_station', 'シャンプー台', [hw - 0.4, 0, 0], [0, -Math.PI / 2, 0], [0.7, 0.8, 0.5]),
    // 仕切り
    rf('partition', '待合仕切り', [0, 0, 1.5], [0, 0, 0], [5, 1.6, 0.08]),
    // 装飾
    rf('clock', '時計', [0, 2.0, -hd + 0.08], [0, 0, 0], [0.3, 0.3, 0.05]),
    ...Array.from({ length: 3 }, (_, i) => rf('pendant_light', 'ペンダントライト', [-2 + i * 2, h - 0.3, -0.5], [0, 0, 0], [0.28, 0.35, 0.28])),
    rf('indirect_light', '間接照明', [0, 2.0, -hd + 0.12], [0, 0, 0], [0.1, 0.3, 4]),
    // 植物
    rf('plant', '観葉植物', [-hw + 0.4, 0, hd - 0.4], [0, 0, 0], [0.5, 1.1, 0.5]),
    rf('plant_small', '小型植物', [-3, 0.75, -hd + 0.5], [0, 0, 0], [0.2, 0.3, 0.2]),
    rf('plant_small', '小型植物', [3, 0.75, -hd + 0.5], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.08], [0, 0, 0], [0.9, 0.3, 0.25]),
    rf('air_purifier', '空気清浄機', [-hw + 0.35, 0, 0], [0, Math.PI / 2, 0], [0.3, 0.6, 0.3]),
  ];

  return { id: 'rt_hair_salon', name: '美容室', description: '8m×8m ミラー5席+シャンプー2台+待合', icon: '💇', style: 'scandinavian', roomHeight: h, walls, openings, furniture };
}

// ============================
// 3. コンビニ (8m x 10m)
// ============================
function createConvenienceStoreTemplate(): RoomTemplate {
  _rtIdCounter = 200;
  const w = 8, d = 10, h = 2.8;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4.0, width: 1.5, height: 2.2, elevation: 0 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 1.0, width: 2.5, height: 1.8, elevation: 0.5 },
  ];

  const furniture: FurnitureItem[] = [
    // レジカウンター (入口右)
    rf('counter', 'レジカウンター', [hw - 1.2, 0, hd - 1.0], [0, 0, 0], [2.0, 0.9, 0.5]),
    rf('register', 'レジ1', [hw - 1.5, 0, hd - 1.0], [0, 0, 0], [0.5, 0.9, 0.45]),
    rf('register', 'レジ2', [hw - 0.8, 0, hd - 1.0], [0, 0, 0], [0.5, 0.9, 0.45]),
    // 商品棚 (中央3列×2＋壁際)
    ...[-1.5, 0, 1.5].flatMap(x => [-3, -0.5].map(z =>
      rf('shelf', '商品棚', [x, 0, z], [0, 0, 0], [1.4, 1.6, 0.5])
    )),
    rf('shelf', '商品棚', [-1.5, 0, 2], [0, 0, 0], [1.4, 1.6, 0.5]),
    // 壁面棚
    rf('shelf', '壁面棚', [-hw + 0.25, 0, -2], [0, Math.PI / 2, 0], [3.0, 1.8, 0.4]),
    rf('shelf', '壁面棚', [-hw + 0.25, 0, 1], [0, Math.PI / 2, 0], [2.5, 1.8, 0.4]),
    rf('shelf', '壁面棚', [hw - 0.25, 0, -2], [0, -Math.PI / 2, 0], [2.5, 1.8, 0.4]),
    // 冷蔵庫4台 (奥壁沿い)
    ...Array.from({ length: 4 }, (_, i) => rf('fridge', '冷蔵庫', [-2.5 + i * 1.5, 0, -hd + 0.35], [0, 0, 0], [1.2, 1.9, 0.7])),
    // コーヒーマシン
    rf('coffee_machine', 'コーヒーマシン', [hw - 0.4, 0, 0], [0, -Math.PI / 2, 0], [0.5, 0.5, 0.4]),
    // ATM
    rf('atm', 'ATM', [-hw + 0.4, 0, hd - 1.0], [0, Math.PI / 2, 0], [0.5, 1.5, 0.6]),
    // サイネージ
    rf('digital_signage', 'サイネージ', [0, 1.5, hd - 0.12], [0, Math.PI, 0], [1.0, 0.6, 0.08]),
    rf('guide_board', 'フロアガイド', [1, 0, hd - 0.5], [0, Math.PI, 0], [0.4, 1.2, 0.25]),
    // 安全
    rf('security_camera', '防犯カメラ', [-hw + 0.2, 2.5, -hd + 0.2], [0, Math.PI / 4, 0], [0.15, 0.15, 0.2]),
    rf('security_camera', '防犯カメラ', [hw - 0.2, 2.5, hd - 0.2], [0, -Math.PI * 0.75, 0], [0.15, 0.15, 0.2]),
    rf('fire_extinguisher', '消火器', [hw - 0.25, 0, -3], [0, 0, 0], [0.15, 0.5, 0.15]),
    rf('trash_can', 'ゴミ箱', [hw - 0.4, 0, hd - 2.0], [0, 0, 0], [0.3, 0.65, 0.3]),
    rf('trash_can', 'ゴミ箱', [-hw + 0.4, 0, hd - 0.4], [0, 0, 0], [0.3, 0.65, 0.3]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.08], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_convenience', name: 'コンビニ', description: '8m×10m レジ2台+棚10本+冷蔵庫4+ATM', icon: '🏪', style: 'modern', roomHeight: h, walls, openings, furniture };
}

// ============================
// 4. オフィス (10m x 10m)
// ============================
function createOfficeTemplate(): RoomTemplate {
  _rtIdCounter = 300;
  const w = 10, d = 10, h = 2.7;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 5, width: 1.0, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 1.5, width: 1.8, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 5, width: 1.8, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 8.5, width: 1.8, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // デスク10台 (5列×2行)
    ...Array.from({ length: 5 }, (_, col) => [-1.2, 1.2].flatMap(x => [
      rf('office_desk', 'デスク', [x, 0, -3.5 + col * 1.6], [0, 0, 0], [1.1, 0.73, 0.6]),
      rf('office_chair', '椅子', [x, 0, -3.5 + col * 1.6 + 0.55], [0, Math.PI, 0], [0.48, 0.9, 0.48]),
    ])).flat(),
    // 会議エリア (右奥)
    rf('partition', '会議室仕切り', [hw - 2.5, 0, 1.5], [0, Math.PI / 2, 0], [4, 1.8, 0.08]),
    rf('table_square', '会議テーブル', [hw - 1.8, 0, -1], [0, 0, 0], [2.0, 0.73, 1.0]),
    ...Array.from({ length: 3 }, (_, i) => rf('chair', '会議椅子', [hw - 2.5 + i * 0.7, 0, -1.7], [0, 0, 0], [0.42, 0.82, 0.42])),
    ...Array.from({ length: 3 }, (_, i) => rf('chair', '会議椅子', [hw - 2.5 + i * 0.7, 0, -0.3], [0, Math.PI, 0], [0.42, 0.82, 0.42])),
    rf('whiteboard', 'ホワイトボード', [hw - 0.15, 0, -1], [0, -Math.PI / 2, 0], [1.5, 1.0, 0.05]),
    // ファイルキャビネット
    ...Array.from({ length: 4 }, (_, i) => rf('file_cabinet', 'キャビネット', [-hw + 0.3, 0, -3 + i * 1.2], [0, Math.PI / 2, 0], [0.42, 1.3, 0.55])),
    // 本棚
    rf('bookcase', '本棚', [-hw + 0.3, 0, 2], [0, Math.PI / 2, 0], [0.9, 1.9, 0.35]),
    rf('bookcase', '本棚', [-hw + 0.3, 0, 3.2], [0, Math.PI / 2, 0], [0.9, 1.9, 0.35]),
    // プリンター
    rf('printer_stand', 'プリンター台', [-hw + 1.5, 0, -hd + 0.4], [0, 0, 0], [0.6, 0.7, 0.5]),
    // リフレッシュ
    rf('water_server', 'ウォーターサーバー', [hw - 0.4, 0, hd - 1.5], [0, 0, 0], [0.35, 1.1, 0.35]),
    rf('trash_can', 'ゴミ箱', [hw - 0.4, 0, hd - 2.2], [0, 0, 0], [0.28, 0.6, 0.28]),
    rf('trash_can', 'ゴミ箱', [-2, 0, -hd + 0.35], [0, 0, 0], [0.28, 0.6, 0.28]),
    // 装飾
    rf('clock', '時計', [0, 2.0, -hd + 0.08], [0, 0, 0], [0.35, 0.35, 0.05]),
    rf('clock', '時計', [0, 2.0, hd - 0.08], [0, Math.PI, 0], [0.35, 0.35, 0.05]),
    rf('plant_large', '大型植物', [hw - 0.4, 0, hd - 0.4], [0, 0, 0], [0.55, 1.3, 0.55]),
    rf('plant', '観葉植物', [-hw + 0.4, 0, hd - 0.4], [0, 0, 0], [0.45, 1.0, 0.45]),
    rf('plant', '観葉植物', [3, 0, 2.5], [0, 0, 0], [0.45, 1.0, 0.45]),
    rf('plant_small', '卓上植物', [-1.2, 0.73, -3.5], [0, 0, 0], [0.18, 0.25, 0.18]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.08], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_office', name: 'オフィス', description: '10m×10m デスク10台+会議室+キャビネット+リフレッシュ', icon: '🏢', style: 'modern', roomHeight: h, walls, openings, furniture };
}

// ============================
// 5. レストラン (12m x 12m)
// ============================
function createRestaurantTemplate(): RoomTemplate {
  _rtIdCounter = 400;
  const w = 12, d = 12, h = 2.8;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 6, width: 1.4, height: 2.2, elevation: 0 },
    { id: rid('door'), wallId: walls[0].id, type: 'door', positionAlongWall: 11, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 1.5, width: 2.0, height: 1.3, elevation: 0.8 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 9.5, width: 2.0, height: 1.3, elevation: 0.8 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 3, width: 1.8, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 9, width: 1.8, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // カウンター＆キッチン (奥壁)
    rf('counter', 'カウンター', [0, 0, -hd + 0.5], [0, 0, 0], [5, 1.0, 0.5]),
    rf('kitchen_island', 'キッチンアイランド', [0, 0, -hd + 1.5], [0, 0, 0], [2.5, 0.9, 0.8]),
    rf('register', 'レジ', [3.5, 0, -hd + 0.5], [0, 0, 0], [0.5, 0.9, 0.45]),
    rf('wine_rack', 'ワインラック', [-hw + 0.3, 0, -hd + 0.3], [0, Math.PI / 2, 0], [1.0, 1.8, 0.4]),
    rf('fridge', '冷蔵庫', [hw - 0.4, 0, -hd + 0.35], [0, 0, 0], [0.7, 1.8, 0.7]),
    rf('dish_cabinet', '食器棚', [-3.5, 0, -hd + 0.25], [0, 0, 0], [1.5, 1.5, 0.35]),
    // 四角テーブル10セット (5列×2)
    ...Array.from({ length: 5 }, (_, row) => [-2.5, 2.5].flatMap(x => [
      rf('table_square', 'テーブル', [x, 0, -2.5 + row * 2.0], [0, 0, 0], [0.85, 0.73, 0.85]),
      rf('chair', '椅子', [x - 0.5, 0, -2.5 + row * 2.0], [0, Math.PI / 2, 0], [0.42, 0.82, 0.42]),
      rf('chair', '椅子', [x + 0.5, 0, -2.5 + row * 2.0], [0, -Math.PI / 2, 0], [0.42, 0.82, 0.42]),
      rf('chair', '椅子', [x, 0, -3.0 + row * 2.0], [0, 0, 0], [0.42, 0.82, 0.42]),
      rf('chair', '椅子', [x, 0, -2.0 + row * 2.0], [0, Math.PI, 0], [0.42, 0.82, 0.42]),
    ])).flat(),
    // ブースソファ2セット (左壁沿い)
    rf('booth_sofa', 'ブースソファ', [-hw + 0.45, 0, -1], [0, Math.PI / 2, 0], [1.8, 0.7, 0.7]),
    rf('table_square', 'ブーステーブル', [-hw + 1.3, 0, -1], [0, 0, 0], [0.7, 0.65, 0.7]),
    rf('booth_sofa', 'ブースソファ', [-hw + 0.45, 0, 2], [0, Math.PI / 2, 0], [1.8, 0.7, 0.7]),
    rf('table_square', 'ブーステーブル', [-hw + 1.3, 0, 2], [0, 0, 0], [0.7, 0.65, 0.7]),
    // 装飾
    rf('menu_board', 'メニューボード', [0, 1.5, hd - 0.12], [0, Math.PI, 0], [0.8, 0.6, 0.05]),
    rf('clock', '時計', [0, 2.0, -hd + 0.08], [0, 0, 0], [0.35, 0.35, 0.05]),
    // ペンダントライト8つ
    ...Array.from({ length: 8 }, (_, i) => rf('pendant_light', 'ペンダントライト', [-4 + (i % 4) * 2.5, h - 0.3, -1 + Math.floor(i / 4) * 4], [0, 0, 0], [0.3, 0.4, 0.3])),
    rf('indirect_light', '間接照明', [-hw + 0.12, 2.0, 0], [0, Math.PI / 2, 0], [0.1, 0.3, 4]),
    rf('indirect_light', '間接照明', [hw - 0.12, 2.0, 0], [0, -Math.PI / 2, 0], [0.1, 0.3, 4]),
    // 入口
    rf('coat_rack', 'コートラック', [2, 0, hd - 0.35], [0, 0, 0], [0.4, 1.7, 0.4]),
    rf('umbrella_stand', '傘立て', [2.8, 0, hd - 0.25], [0, 0, 0], [0.25, 0.55, 0.25]),
    // 植物
    rf('plant_large', '大型植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    rf('plant_large', '大型植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    rf('plant', '観葉植物', [hw - 0.5, 0, -hd + 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    rf('flower_pot', '花瓶', [-2.5, 0.73, -0.5], [0, 0, 0], [0.18, 0.25, 0.18]),
    rf('flower_pot', '花瓶', [2.5, 0.73, 1.5], [0, 0, 0], [0.18, 0.25, 0.18]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, -2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, 3], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, -2], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.08], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_restaurant', name: 'レストラン', description: '12m×12m テーブル10+ブース2+カウンター+キッチン', icon: '🍽️', style: 'cafe', roomHeight: h, walls, openings, furniture };
}

// ============================
// 6. バー (6m x 10m)
// ============================
function createBarTemplate(): RoomTemplate {
  _rtIdCounter = 500;
  const w = 6, d = 10, h = 2.6;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 3, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 5, width: 1.2, height: 1.0, elevation: 1.2 },
  ];

  const furniture: FurnitureItem[] = [
    // ロングカウンター (左壁沿い)
    rf('counter', 'カウンター', [-hw + 1.0, 0, 0], [0, Math.PI / 2, 0], [8, 1.05, 0.55]),
    // スツール10脚
    ...Array.from({ length: 10 }, (_, i) => rf('bar_stool', 'バースツール', [-hw + 1.8, 0, -4 + i * 0.85], [0, Math.PI / 2, 0], [0.33, 0.72, 0.33])),
    // バックバー
    rf('shelf', '酒棚', [-hw + 0.2, 0, -2.5], [0, Math.PI / 2, 0], [3.5, 1.9, 0.3]),
    rf('shelf', '酒棚', [-hw + 0.2, 0, 2.5], [0, Math.PI / 2, 0], [3.5, 1.9, 0.3]),
    rf('wine_rack', 'ワインラック', [-hw + 0.2, 0, 0], [0, Math.PI / 2, 0], [1.2, 1.8, 0.4]),
    rf('cocktail_station', 'カクテルステーション', [-hw + 0.8, 0, -1], [0, Math.PI / 2, 0], [0.8, 0.9, 0.5]),
    rf('ice_bin', 'アイスビン', [-hw + 0.8, 0, 0.5], [0, 0, 0], [0.5, 0.6, 0.4]),
    rf('beer_server', 'ビールサーバー', [-hw + 0.8, 0, 2], [0, 0, 0], [0.4, 0.7, 0.3]),
    rf('sink', 'シンク', [-hw + 0.8, 0, -3.5], [0, Math.PI / 2, 0], [0.55, 0.85, 0.5]),
    // バーテーブル2セット
    rf('bar_table', 'バーテーブル', [1.5, 0, -1.5], [0, 0, 0], [0.55, 1.0, 0.55]),
    rf('bar_chair', 'バーチェア', [1.1, 0, -1.5], [0, Math.PI / 2, 0], [0.38, 0.72, 0.38]),
    rf('bar_chair', 'バーチェア', [1.9, 0, -1.5], [0, -Math.PI / 2, 0], [0.38, 0.72, 0.38]),
    rf('bar_table', 'バーテーブル', [1.5, 0, 1.5], [0, 0, 0], [0.55, 1.0, 0.55]),
    rf('bar_chair', 'バーチェア', [1.1, 0, 1.5], [0, Math.PI / 2, 0], [0.38, 0.72, 0.38]),
    rf('bar_chair', 'バーチェア', [1.9, 0, 1.5], [0, -Math.PI / 2, 0], [0.38, 0.72, 0.38]),
    // 照明
    ...Array.from({ length: 4 }, (_, i) => rf('pendant_light', 'ペンダントライト', [-hw + 1.8, h - 0.3, -3 + i * 2], [0, 0, 0], [0.25, 0.35, 0.25])),
    rf('indirect_light', '間接照明', [-hw + 0.12, 2.0, 0], [0, Math.PI / 2, 0], [0.1, 0.3, 6]),
    rf('indirect_light', '間接照明', [hw - 0.12, 2.0, 0], [0, -Math.PI / 2, 0], [0.1, 0.3, 4]),
    rf('indirect_light', '間接照明', [0, 2.0, -hd + 0.12], [0, 0, 0], [0.1, 0.3, 3]),
    // スピーカー
    rf('speaker', 'スピーカー', [hw - 0.15, 2.0, -3], [0, -Math.PI / 2, 0], [0.22, 0.3, 0.18]),
    rf('speaker', 'スピーカー', [hw - 0.15, 2.0, 3], [0, -Math.PI / 2, 0], [0.22, 0.3, 0.18]),
    // 装飾
    rf('clock', '時計', [0, 2.0, -hd + 0.08], [0, 0, 0], [0.35, 0.35, 0.05]),
    rf('plant', '観葉植物', [hw - 0.4, 0, hd - 0.4], [0, 0, 0], [0.45, 1.1, 0.45]),
    rf('plant_small', '小型植物', [1.5, 1.0, 0], [0, 0, 0], [0.2, 0.28, 0.2]),
    // 空調
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, 0], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.08], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_bar', name: 'バー', description: '6m×10m ロングカウンター10席+バーテーブル2+酒棚・ワインラック', icon: '🍸', style: 'luxury', roomHeight: h, walls, openings, furniture };
}

// ============================
// 7. クリニック (8m x 10m)
// ============================
function createClinicTemplate(): RoomTemplate {
  _rtIdCounter = 600;
  const w = 8, d = 10, h = 2.8;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4, width: 1.2, height: 2.1, elevation: 0 },
    { id: rid('door'), wallId: walls[0].id, type: 'door', positionAlongWall: 6, width: 0.9, height: 2.1, elevation: 0 },
    { id: rid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 2.5, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[3].id, type: 'window', positionAlongWall: 2.5, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: rid('win'), wallId: walls[3].id, type: 'window', positionAlongWall: 7.5, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付
    rf('counter', '受付カウンター', [2, 0, hd - 1.0], [0, 0, 0], [2.5, 1.0, 0.55]),
    rf('register', 'レジ', [2.8, 0, hd - 1.0], [0, 0, 0], [0.45, 0.9, 0.4]),
    // 待合エリア
    ...Array.from({ length: 4 }, (_, i) => rf('bench', '待合ベンチ', [-2 + i * 1.3, 0, hd - 1.5], [0, 0, 0], [1.0, 0.45, 0.45])),
    rf('table_round', '待合テーブル', [-1, 0, hd - 2.5], [0, 0, 0], [0.45, 0.42, 0.45]),
    rf('table_round', '待合テーブル', [1.5, 0, hd - 2.5], [0, 0, 0], [0.45, 0.42, 0.45]),
    rf('tv_monitor', 'TVモニター', [0, 1.5, hd - 0.12], [0, Math.PI, 0], [1.0, 0.6, 0.08]),
    rf('shelf', '雑誌棚', [-hw + 0.3, 0, hd - 1.5], [0, Math.PI / 2, 0], [1.2, 0.9, 0.35]),
    // 仕切り
    rf('partition', '待合仕切り', [0, 0, 2], [0, 0, 0], [7, 2.2, 0.08]),
    rf('partition', '診察室仕切り', [0, 0, -1], [0, Math.PI / 2, 0], [5, 2.2, 0.08]),
    // 診察室1 (左)
    rf('treatment_bed', '診察台', [-2.5, 0, 0], [0, 0, 0], [1.6, 0.6, 0.65]),
    rf('desk', '診察デスク', [-2.5, 0, -2.5], [0, 0, 0], [1.1, 0.73, 0.55]),
    rf('chair', '診察椅子', [-2.5, 0, -1.8], [0, Math.PI, 0], [0.42, 0.82, 0.42]),
    rf('chair', '患者椅子', [-2.5, 0, -3.2], [0, 0, 0], [0.42, 0.82, 0.42]),
    rf('shelf', '医療棚', [-hw + 0.25, 0, -2], [0, Math.PI / 2, 0], [1.5, 1.5, 0.35]),
    // 診察室2 (右)
    rf('treatment_bed', '診察台', [2.5, 0, 0], [0, 0, 0], [1.6, 0.6, 0.65]),
    rf('desk', '診察デスク', [2.5, 0, -2.5], [0, 0, 0], [1.1, 0.73, 0.55]),
    rf('chair', '診察椅子', [2.5, 0, -1.8], [0, Math.PI, 0], [0.42, 0.82, 0.42]),
    rf('chair', '患者椅子', [2.5, 0, -3.2], [0, 0, 0], [0.42, 0.82, 0.42]),
    rf('shelf', '医療棚', [hw - 0.25, 0, -2], [0, -Math.PI / 2, 0], [1.5, 1.5, 0.35]),
    // 診察室3 (奥中央) — 処置室
    rf('treatment_bed', '処置台', [0, 0, -hd + 1.5], [0, Math.PI / 2, 0], [1.6, 0.6, 0.65]),
    rf('sink', '手洗いシンク', [0, 0, -hd + 0.4], [0, 0, 0], [0.55, 0.85, 0.45]),
    rf('shelf', '処置棚', [-1.5, 0, -hd + 0.25], [0, 0, 0], [1.0, 1.5, 0.35]),
    // 設備
    rf('water_server', 'ウォーターサーバー', [-hw + 0.4, 0, hd - 2.8], [0, 0, 0], [0.35, 1.1, 0.35]),
    rf('fire_extinguisher', '消火器', [hw - 0.25, 0, 0], [0, 0, 0], [0.15, 0.5, 0.15]),
    rf('aed', 'AED', [hw - 0.12, 1.2, 2.5], [0, -Math.PI / 2, 0], [0.3, 0.35, 0.15]),
    // 装飾
    rf('clock', '時計', [0, 2.0, hd - 0.08], [0, Math.PI, 0], [0.3, 0.3, 0.05]),
    ...Array.from({ length: 3 }, (_, i) => rf('pendant_light', 'ペンダントライト', [-2.5 + i * 2.5, h - 0.3, hd - 1.5], [0, 0, 0], [0.28, 0.35, 0.28])),
    rf('plant', '観葉植物', [-hw + 0.4, 0, hd - 0.4], [0, 0, 0], [0.45, 1.0, 0.45]),
    rf('plant', '観葉植物', [hw - 0.4, 0, hd - 0.4], [0, 0, 0], [0.45, 1.0, 0.45]),
    rf('plant_small', '小型植物', [2, 1.0, hd - 1.0], [0, 0, 0], [0.18, 0.25, 0.18]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, hd - 0.08], [0, Math.PI, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_clinic', name: 'クリニック', description: '8m×10m 受付+待合+診察室2+処置室の医院', icon: '🏥', style: 'medical', roomHeight: h, walls, openings, furniture };
}

// ============================
// 8. アパレルショップ (8m x 10m)
// ============================
function createApparelShopTemplate(): RoomTemplate {
  _rtIdCounter = 700;
  const w = 8, d = 10, h = 3.0;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 4, width: 1.4, height: 2.2, elevation: 0 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 0.8, width: 2.0, height: 1.8, elevation: 0.5 },
    { id: rid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 6.5, width: 2.0, height: 1.8, elevation: 0.5 },
  ];

  const furniture: FurnitureItem[] = [
    // レジカウンター (奥壁右)
    rf('counter', 'レジカウンター', [hw - 1.3, 0, -hd + 0.5], [0, 0, 0], [2.0, 0.9, 0.5]),
    rf('register', 'レジ', [hw - 1.3, 0, -hd + 0.5], [0, 0, 0], [0.45, 0.9, 0.4]),
    // ディスプレイケース6つ (中央)
    ...[-1.5, 0, 1.5].flatMap(x => [-1.5, 1.5].map(z =>
      rf('display_case', 'ディスプレイケース', [x, 0, z], [0, 0, 0], [1.1, 1.0, 0.5])
    )),
    // ガラスショーケース
    rf('glass_showcase', 'ガラスショーケース', [-hw + 0.5, 0, -hd + 1.0], [0, Math.PI / 2, 0], [1.5, 1.2, 0.5]),
    rf('glass_showcase', 'ガラスショーケース', [-hw + 0.5, 0, -hd + 3.0], [0, Math.PI / 2, 0], [1.5, 1.2, 0.5]),
    // ハンガーラック5本 (壁沿い)
    ...Array.from({ length: 3 }, (_, i) => rf('hanger_rack', 'ハンガーラック', [-hw + 0.4, 0, -0.5 + i * 2.5], [0, Math.PI / 2, 0], [1.4, 1.6, 0.45])),
    ...Array.from({ length: 2 }, (_, i) => rf('hanger_rack', 'ハンガーラック', [hw - 0.4, 0, -2 + i * 2.5], [0, -Math.PI / 2, 0], [1.4, 1.6, 0.45])),
    // マネキン4体 (入口ディスプレイ)
    ...[-2.5, -1, 1, 2.5].map(x => rf('mannequin', 'マネキン', [x, 0, hd - 0.8], [0, Math.PI, 0], [0.38, 1.7, 0.28])),
    // フィッティングルーム2つ (右奥)
    rf('fitting_room', 'フィッティングルーム', [hw - 1.0, 0, 1], [0, 0, 0], [1.1, 2.2, 1.1]),
    rf('fitting_room', 'フィッティングルーム', [hw - 1.0, 0, 3], [0, 0, 0], [1.1, 2.2, 1.1]),
    // ミラー
    rf('mirror', 'フィッティングミラー', [hw - 2.2, 0, 1.5], [0, 0, 0], [0.85, 1.8, 0.05]),
    rf('mirror', 'フィッティングミラー', [hw - 2.2, 0, 3.5], [0, 0, 0], [0.85, 1.8, 0.05]),
    rf('mirror', 'ウォールミラー', [-hw + 0.12, 0, 3], [0, Math.PI / 2, 0], [1.0, 1.8, 0.05]),
    // ソファ (試着待ち)
    rf('sofa', '待合ソファ', [hw - 3, 0, 2], [0, 0, 0], [1.3, 0.65, 0.65]),
    rf('table_round', 'サイドテーブル', [hw - 3, 0, 1.2], [0, 0, 0], [0.4, 0.48, 0.4]),
    // サイネージ
    rf('digital_signage', 'サイネージ', [-1.5, 1.6, hd - 0.12], [0, Math.PI, 0], [1.0, 0.6, 0.08]),
    // 照明
    ...Array.from({ length: 4 }, (_, i) => rf('pendant_light', 'ペンダントライト', [-2.5 + i * 1.7, h - 0.3, 0], [0, 0, 0], [0.25, 0.35, 0.25])),
    rf('indirect_light', '間接照明', [-hw + 0.12, 2.2, 0], [0, Math.PI / 2, 0], [0.1, 0.3, 4]),
    rf('indirect_light', '間接照明', [0, 2.2, -hd + 0.12], [0, 0, 0], [0.1, 0.3, 4]),
    // 植物
    rf('plant_large', '大型植物', [-hw + 0.45, 0, hd - 0.45], [0, 0, 0], [0.55, 1.4, 0.55]),
    rf('plant', '観葉植物', [hw - 0.45, 0, hd - 0.45], [0, 0, 0], [0.45, 1.1, 0.45]),
    rf('plant', '観葉植物', [0, 0, 3.5], [0, 0, 0], [0.45, 1.0, 0.45]),
    rf('flower_pot', '花瓶', [-1.5, 1.0, -1.5], [0, 0, 0], [0.18, 0.25, 0.18]),
    // 空調
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.08], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_apparel', name: 'アパレルショップ', description: '8m×10m ディスプレイ6+ハンガー5+マネキン4+フィッティング2', icon: '👗', style: 'luxury', roomHeight: h, walls, openings, furniture };
}

// ============================
// アール・デコ・ラウンジバー (10m x 12m)
// ============================
function createArtDecoBarTemplate(): RoomTemplate {
  _rtIdCounter = 900;
  const w = 10, d = 12, h = 3.5;
  const walls = createRectRoom(w, d, h);
  const hw = w / 2, hd = d / 2;

  const openings: Opening[] = [
    { id: rid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 5.0, width: 1.4, height: 2.4, elevation: 0 },
  ];

  const furniture: FurnitureItem[] = [
    // === バーカウンター（北壁沿い） ===
    rf('counter', 'バーカウンター', [0, 0, -hd + 0.5], [0, 0, 0], [4.0, 1.1, 0.6]),

    // === バースツール6脚 ===
    ...Array.from({ length: 6 }, (_, i) =>
      rf('stool', 'バースツール', [-2.0 + i * 0.8, 0, -hd + 1.5], [0, 0, 0], [0.4, 0.75, 0.4])
    ),

    // === 前景: クラブチェア + 真鍮テーブル（4セット） ===
    // セット1（左前）
    rf('club_chair', 'クラブチェア青', [-2.5, 0, 1.5], [0, Math.PI * 0.2, 0]),
    rf('club_chair', 'クラブチェア緑', [-1.5, 0, 2.2], [0, -Math.PI * 0.3, 0]),
    rf('brass_table', '真鍮テーブル', [-2.0, 0, 1.8]),

    // セット2（左中）
    rf('club_chair', 'クラブチェア緑', [-2.8, 0, -0.2], [0, Math.PI * 0.4, 0]),
    rf('club_chair', 'クラブチェア青', [-1.8, 0, 0.3], [0, -Math.PI * 0.2, 0]),
    rf('brass_table', '真鍮テーブル', [-2.3, 0, 0.0]),

    // セット3（右前）
    rf('club_chair', 'クラブチェア青', [1.5, 0, 2.0], [0, -Math.PI * 0.2, 0]),
    rf('club_chair', 'クラブチェア緑', [2.5, 0, 1.3], [0, Math.PI * 0.3, 0]),
    rf('brass_table', '真鍮テーブル', [2.0, 0, 1.6]),

    // セット4（右中）
    rf('club_chair', 'クラブチェア緑', [1.8, 0, -0.5], [0, -Math.PI * 0.4, 0]),
    rf('club_chair', 'クラブチェア青', [2.8, 0, 0.2], [0, Math.PI * 0.2, 0]),
    rf('brass_table', '真鍮テーブル', [2.3, 0, -0.2]),

    // === ペンダントライト（アール・デコ球形）===
    ...Array.from({ length: 4 }, (_, i) =>
      rf('pendant_light', 'ペンダントライト', [-1.5 + i * 1.0, h - 0.5, -1.0], [0, 0, 0], [0.35, 0.45, 0.35])
    ),
    ...Array.from({ length: 3 }, (_, i) =>
      rf('pendant_light', 'ペンダントライト', [-1.0 + i * 1.0, h - 0.5, 1.5], [0, 0, 0], [0.35, 0.45, 0.35])
    ),

    // === 植物 ===
    rf('plant_small', '小型植物', [-1.0, 1.1, -hd + 0.3]),
    rf('plant_small', '小型植物', [1.0, 1.1, -hd + 0.3]),

    // === 空調（隠し） ===
    rf('air_conditioner', 'エアコン', [-hw + 0.08, 2.8, 0], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    rf('air_conditioner', 'エアコン', [hw - 0.08, 2.8, 0], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'rt_art_deco_bar', name: 'アール・デコバー', description: '10m×12m 高級ラウンジバー クラブチェア8+バースツール6+真鍮テーブル4', icon: '🥃', style: 'art_deco_bar', roomHeight: h, walls, openings, furniture };
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
  createArtDecoBarTemplate(),
];

// IDで取得するヘルパー
export function getRoomTemplateById(id: string): RoomTemplate | undefined {
  return ROOM_TEMPLATES.find((t) => t.id === id);
}
