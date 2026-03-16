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

// 家具生成ヘルパー
function f(type: string, name: string, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], sc: [number, number, number] = [1, 1, 1]): FurnitureItem {
  return { id: uid(type), type: type as FurnitureItem['type'], name, position: pos, rotation: rot, scale: sc };
}

// ============================
// 1. カフェ 30席 (12x9m)
// ============================
function createCafeTemplate(): StoreTemplate {
  _idCounter = 0;
  const W = 12, D = 9, H = 2.8;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 6, width: 1.2, height: 2.2, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 2, width: 2.0, height: 1.4, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 6, width: 2.0, height: 1.4, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 10, width: 2.0, height: 1.4, elevation: 0.8 },
    { id: uid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 4.5, width: 2.0, height: 1.4, elevation: 0.8 },
  ];

  const furniture: FurnitureItem[] = [
    // カウンター＆バックバー (奥壁)
    f('counter', 'カウンター', [0, 0, -hd + 0.5], [0, 0, 0], [5, 1.1, 0.6]),
    f('espresso_machine', 'エスプレッソマシン', [-1.5, 0.9, -hd + 0.3], [0, 0, 0], [0.5, 0.5, 0.4]),
    f('cake_showcase', 'ケーキショーケース', [1.5, 0, -hd + 0.3], [0, 0, 0], [1.2, 1.0, 0.6]),
    f('register', 'レジ', [3, 0, -hd + 0.5], [0, 0, 0], [0.6, 1.0, 0.5]),
    f('shelf', '食器棚', [-3.5, 0, -hd + 0.2], [0, 0, 0], [1.5, 1.8, 0.35]),
    f('coffee_machine', 'コーヒーマシン', [0.5, 0.9, -hd + 0.3], [0, 0, 0], [0.4, 0.5, 0.35]),
    // カウンタースツール 4脚
    ...Array.from({ length: 4 }, (_, i) => f('stool', 'カウンタースツール', [-1.5 + i * 1.2, 0, -hd + 1.3], [0, 0, 0], [0.35, 0.7, 0.35])),
    // 丸テーブル6セット (左3, 右3)
    ...[-3.5, -1.5, 0.5].flatMap(x => [
      f('table_round', '丸テーブル', [x, 0, -0.5], [0, 0, 0], [0.8, 0.75, 0.8]),
      f('chair', '椅子', [x, 0, -1.0], [0, 0, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [x, 0, 0.0], [0, Math.PI, 0], [0.45, 0.85, 0.45]),
    ]),
    ...[-3.5, -1.5, 0.5].flatMap(x => [
      f('table_round', '丸テーブル', [x, 0, 1.8], [0, 0, 0], [0.8, 0.75, 0.8]),
      f('chair', '椅子', [x, 0, 1.3], [0, 0, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [x, 0, 2.3], [0, Math.PI, 0], [0.45, 0.85, 0.45]),
    ]),
    // 四角テーブル3セット (右エリア) 各4椅子
    ...[[-0.5], [1.5], [3.5]].flatMap(([z]) => [
      f('table_square', '四角テーブル', [3.8, 0, z], [0, 0, 0], [0.9, 0.75, 0.9]),
      f('chair', '椅子', [3.3, 0, z - 0.5], [0, Math.PI / 4, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [4.3, 0, z - 0.5], [0, -Math.PI / 4, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [3.3, 0, z + 0.5], [0, Math.PI * 0.75, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [4.3, 0, z + 0.5], [0, -Math.PI * 0.75, 0], [0.45, 0.85, 0.45]),
    ]),
    // ソファ席 (右壁沿い)
    f('booth_sofa', 'ソファ席', [hw - 0.5, 0, -1.8], [0, -Math.PI / 2, 0], [1.8, 0.7, 0.7]),
    f('table_round', 'ソファテーブル', [hw - 1.3, 0, -1.8], [0, 0, 0], [0.6, 0.5, 0.6]),
    // 装飾・設備
    f('menu_board', 'メニューボード', [hw - 0.15, 1.5, -2.5], [0, -Math.PI / 2, 0], [0.8, 0.6, 0.05]),
    f('digital_signage', 'デジタルサイネージ', [-2, 1.5, hd - 0.15], [0, Math.PI, 0], [1.0, 0.6, 0.08]),
    f('clock', '時計', [0, 2.0, -hd + 0.1], [0, 0, 0], [0.35, 0.35, 0.05]),
    // ペンダントライト6つ
    ...Array.from({ length: 6 }, (_, i) => f('pendant_light', 'ペンダントライト', [-4 + i * 1.6, H - 0.3, 0.5], [0, 0, 0], [0.3, 0.4, 0.3])),
    // 間接照明
    f('indirect_light', '間接照明', [-hw + 0.2, 2.0, -2], [0, Math.PI / 2, 0], [0.1, 0.3, 1.5]),
    f('indirect_light', '間接照明', [hw - 0.2, 2.0, -2], [0, -Math.PI / 2, 0], [0.1, 0.3, 1.5]),
    // 植物
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant', '観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.5, 1.2, 0.5]),
    f('plant_small', '小型観葉植物', [-2.5, 0.9, -hd + 0.3], [0, 0, 0], [0.25, 0.35, 0.25]),
    f('flower_pot', '花瓶', [2.5, 0.75, 1.8], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 入口周辺
    f('coat_rack', 'コートラック', [1.5, 0, hd - 0.4], [0, 0, 0], [0.4, 1.7, 0.4]),
    f('umbrella_stand', '傘立て', [2.2, 0, hd - 0.3], [0, 0, 0], [0.3, 0.6, 0.3]),
    f('trash_can', 'ゴミ箱', [-0.5, 0, hd - 0.3], [0, 0, 0], [0.3, 0.65, 0.3]),
    // ラグ＆カーテン
    f('rug', 'ラグ', [-1.5, 0.01, 0.5], [0, 0, 0], [3, 0.02, 2.5]),
    f('rug', 'ラグ', [3.8, 0.01, 1.5], [0, 0, 0], [2, 0.02, 3]),
    f('curtain', 'カーテン', [-4, 0, -hd + 0.1], [0, 0, 0], [0.6, 2.2, 0.1]),
    f('curtain', 'カーテン', [2, 0, -hd + 0.1], [0, 0, 0], [0.6, 2.2, 0.1]),
    // 空調・安全
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.9, 0.3, 0.25]),
    f('air_purifier', '空気清浄機', [-hw + 0.4, 0, 2.5], [0, Math.PI / 2, 0], [0.3, 0.6, 0.3]),
  ];

  return { id: 'cafe_30', name: 'カフェ 30席', description: 'カウンター+丸テーブル6+四角3+ソファ席の本格カフェ', style: 'cafe', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '☕' };
}

// ============================
// 2. 居酒屋 50席 (16x12m)
// ============================
function createIzakayaTemplate(): StoreTemplate {
  _idCounter = 200;
  const W = 16, D = 12, H = 2.7;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 8, width: 1.4, height: 2.2, elevation: 0 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 3, width: 2.0, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 13, width: 2.0, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // カウンター＆バックバー
    f('counter', 'カウンター', [0, 0, -hd + 0.5], [0, 0, 0], [6, 1.1, 0.6]),
    f('beer_server', 'ビールサーバー', [-2, 0, -hd + 0.2], [0, 0, 0], [0.4, 0.7, 0.3]),
    f('fridge', '冷蔵庫', [4, 0, -hd + 0.3], [0, 0, 0], [0.7, 1.8, 0.7]),
    f('shelf', '酒棚', [-4, 0, -hd + 0.2], [0, 0, 0], [2.5, 1.9, 0.35]),
    f('shelf', '酒棚', [1, 0, -hd + 0.2], [0, 0, 0], [2.5, 1.9, 0.35]),
    // カウンタースツール 8脚
    ...Array.from({ length: 8 }, (_, i) => f('stool', 'スツール', [-2.8 + i * 0.8, 0, -hd + 1.4], [0, 0, 0], [0.35, 0.7, 0.35])),
    // 四角テーブル8セット (4x2グリッド) 各4椅子
    ...[-4.5, -1.5, 1.5, 4.5].flatMap(x => [-1, 2.5].flatMap(z => [
      f('table_square', '四角テーブル', [x, 0, z], [0, 0, 0], [0.9, 0.75, 0.9]),
      f('chair', '椅子', [x - 0.5, 0, z], [0, Math.PI / 2, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [x + 0.5, 0, z], [0, -Math.PI / 2, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [x, 0, z - 0.5], [0, 0, 0], [0.45, 0.85, 0.45]),
      f('chair', '椅子', [x, 0, z + 0.5], [0, Math.PI, 0], [0.45, 0.85, 0.45]),
    ])),
    // ブースソファ4セット (壁際)
    ...[-5, -2, 1, 4].map(z => f('booth_sofa', 'ブースソファ', [-hw + 0.5, 0, z], [0, Math.PI / 2, 0], [1.5, 0.7, 0.7])),
    ...[-5, -2, 1, 4].map(z => f('table_square', 'ブーステーブル', [-hw + 1.5, 0, z], [0, 0, 0], [0.7, 0.65, 0.7])),
    // パーティション (半個室)
    f('partition', '仕切り', [-hw + 1.0, 0, -0.5], [0, 0, 0], [0.08, 1.8, 1.2]),
    f('partition', '仕切り', [-hw + 1.0, 0, 2.8], [0, 0, 0], [0.08, 1.8, 1.2]),
    // 装飾
    f('menu_board', 'メニューボード', [0, 1.5, hd - 0.15], [0, Math.PI, 0], [1.0, 0.7, 0.05]),
    f('clock', '時計', [0, 2.0, -hd + 0.1], [0, 0, 0], [0.4, 0.4, 0.05]),
    f('digital_signage', 'サイネージ', [hw - 0.15, 1.5, 0], [0, -Math.PI / 2, 0], [1.0, 0.6, 0.08]),
    // ペンダントライト8つ
    ...Array.from({ length: 8 }, (_, i) => f('pendant_light', 'ペンダントライト', [-6 + i * 1.7, H - 0.3, 0.5], [0, 0, 0], [0.3, 0.4, 0.3])),
    // 間接照明
    ...[-3, 0, 3].map(z => f('indirect_light', '間接照明', [hw - 0.2, 2.0, z], [0, -Math.PI / 2, 0], [0.1, 0.3, 1.2])),
    f('indirect_light', '間接照明', [-hw + 0.2, 2.0, 0], [0, Math.PI / 2, 0], [0.1, 0.3, 2.0]),
    // 植物
    f('plant_large', '大型観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant', '観葉植物', [hw - 0.5, 0, -hd + 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    f('plant', '観葉植物', [-hw + 0.5, 0, -hd + 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    // 入口
    f('coat_rack', 'コートラック', [2, 0, hd - 0.4], [0, 0, 0], [0.4, 1.7, 0.4]),
    f('umbrella_stand', '傘立て', [2.8, 0, hd - 0.3], [0, 0, 0], [0.3, 0.6, 0.3]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, 3], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -2], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, 3], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'izakaya_50', name: '居酒屋 50席', description: 'カウンター+テーブル8+ブース4の本格居酒屋', style: 'japanese', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🍶' };
}

// ============================
// 3. バー (10x7m)
// ============================
function createBarTemplate(): StoreTemplate {
  _idCounter = 500;
  const W = 10, D = 7, H = 2.7;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 5, width: 1.0, height: 2.1, elevation: 0 },
  ];

  const furniture: FurnitureItem[] = [
    // L字カウンター
    f('counter', 'カウンター（横）', [0, 0, -hd + 0.5], [0, 0, 0], [5, 1.1, 0.6]),
    f('counter', 'カウンター（縦）', [hw - 0.8, 0, 0], [0, Math.PI / 2, 0], [4, 1.1, 0.6]),
    // バースツール10脚
    ...Array.from({ length: 6 }, (_, i) => f('bar_stool', 'バースツール', [-2.5 + i * 0.9, 0, -hd + 1.3], [0, 0, 0], [0.35, 0.75, 0.35])),
    ...Array.from({ length: 4 }, (_, i) => f('bar_stool', 'バースツール', [hw - 1.6, 0, -1.5 + i * 0.9], [0, -Math.PI / 2, 0], [0.35, 0.75, 0.35])),
    // バックバー
    f('shelf', '酒棚上段', [-2, 0, -hd + 0.15], [0, 0, 0], [2.5, 2.0, 0.3]),
    f('shelf', '酒棚下段', [1, 0, -hd + 0.15], [0, 0, 0], [2.5, 2.0, 0.3]),
    f('wine_rack', 'ワインラック', [3.5, 0, -hd + 0.2], [0, 0, 0], [1.0, 1.8, 0.4]),
    f('cocktail_station', 'カクテルステーション', [-0.5, 0, -hd + 0.3], [0, 0, 0], [0.8, 0.9, 0.5]),
    f('ice_bin', 'アイスビン', [0.5, 0, -hd + 0.3], [0, 0, 0], [0.5, 0.6, 0.4]),
    f('beer_server', 'ビールサーバー', [2.5, 0, -hd + 0.3], [0, 0, 0], [0.4, 0.7, 0.3]),
    f('sink', 'シンク', [-3.5, 0, -hd + 0.3], [0, 0, 0], [0.6, 0.85, 0.5]),
    // バーテーブル3セット
    ...[-3, -1, 1].map(x => f('bar_table', 'バーテーブル', [x, 0, 1.5], [0, 0, 0], [0.6, 1.0, 0.6])),
    ...[-3, -1, 1].flatMap(x => [
      f('bar_chair', 'バーチェア', [x - 0.4, 0, 1.5], [0, Math.PI / 2, 0], [0.4, 0.75, 0.4]),
      f('bar_chair', 'バーチェア', [x + 0.4, 0, 1.5], [0, -Math.PI / 2, 0], [0.4, 0.75, 0.4]),
    ]),
    // ペンダントライト5つ
    ...Array.from({ length: 5 }, (_, i) => f('pendant_light', 'ペンダントライト', [-3 + i * 1.5, H - 0.3, -0.5], [0, 0, 0], [0.25, 0.35, 0.25])),
    // 間接照明
    f('indirect_light', '間接照明', [-hw + 0.15, 2.0, 0], [0, Math.PI / 2, 0], [0.1, 0.3, 2.5]),
    f('indirect_light', '間接照明', [0, 2.0, hd - 0.15], [0, Math.PI, 0], [0.1, 0.3, 3.0]),
    f('indirect_light', '間接照明', [-2, 2.0, -hd + 0.15], [0, 0, 0], [0.1, 0.3, 2.5]),
    // 装飾
    f('speaker', 'スピーカー', [-hw + 0.2, 2.0, -2], [0, Math.PI / 2, 0], [0.25, 0.35, 0.2]),
    f('speaker', 'スピーカー', [-hw + 0.2, 2.0, 2], [0, Math.PI / 2, 0], [0.25, 0.35, 0.2]),
    f('clock', '時計', [0, 2.0, -hd + 0.1], [0, 0, 0], [0.4, 0.4, 0.05]),
    f('plant', '観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.5, 1.2, 0.5]),
    f('plant_small', '小型観葉植物', [2, 1.0, 1.5], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, 0], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, hd - 0.1], [0, Math.PI, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'bar', name: 'バー', description: 'L字カウンター+バーテーブル3席のムーディーバー', style: 'luxury', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🍸' };
}

// ============================
// 4. 美容室 (12x8m)
// ============================
function createSalonTemplate(): StoreTemplate {
  _idCounter = 700;
  const W = 12, D = 8, H = 2.8;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 6, width: 1.2, height: 2.2, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 3, width: 2.5, height: 1.5, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 9, width: 2.5, height: 1.5, elevation: 0.8 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付エリア
    f('reception_desk', 'レセプション', [3.5, 0, hd - 1.0], [0, 0, 0], [2.0, 1.0, 0.7]),
    f('register', 'レジ', [4.2, 0, hd - 1.0], [0, 0, 0], [0.5, 1.0, 0.45]),
    // 待合エリア
    f('waiting_sofa', '待合ソファ', [-3, 0, hd - 1.0], [0, 0, 0], [2.0, 0.7, 0.7]),
    f('table_round', '雑誌テーブル', [-3, 0, hd - 1.8], [0, 0, 0], [0.5, 0.45, 0.5]),
    f('coat_rack', 'コートラック', [1.5, 0, hd - 0.4], [0, 0, 0], [0.4, 1.7, 0.4]),
    f('umbrella_stand', '傘立て', [2.2, 0, hd - 0.3], [0, 0, 0], [0.3, 0.6, 0.3]),
    // ミラーステーション6席 (奥壁沿い)
    ...Array.from({ length: 6 }, (_, i) => [
      f('mirror_station', '施術ミラー', [-4.5 + i * 1.8, 0, -hd + 0.2], [0, 0, 0], [0.9, 1.5, 0.05]),
      f('counter', '施術台', [-4.5 + i * 1.8, 0, -hd + 0.6], [0, 0, 0], [0.8, 0.75, 0.4]),
      f('chair', 'サロンチェア', [-4.5 + i * 1.8, 0, -hd + 1.3], [0, Math.PI, 0], [0.55, 0.9, 0.55]),
    ]).flat(),
    // シャンプーステーション3台 (右壁沿い)
    ...Array.from({ length: 3 }, (_, i) => f('shampoo_station', 'シャンプー台', [hw - 0.5, 0, -2 + i * 1.5], [0, -Math.PI / 2, 0], [0.8, 0.8, 0.5])),
    // パーティション
    f('partition', '仕切り', [0, 0, 1.2], [0, 0, 0], [6, 1.8, 0.08]),
    // 装飾
    f('clock', '時計', [0, 2.0, -hd + 0.1], [0, 0, 0], [0.35, 0.35, 0.05]),
    f('speaker', 'スピーカー', [-hw + 0.2, 2.0, -1], [0, Math.PI / 2, 0], [0.2, 0.3, 0.18]),
    f('speaker', 'スピーカー', [hw - 0.2, 2.0, -1], [0, -Math.PI / 2, 0], [0.2, 0.3, 0.18]),
    // ペンダントライト4つ
    ...Array.from({ length: 4 }, (_, i) => f('pendant_light', 'ペンダントライト', [-3 + i * 2, H - 0.3, -1], [0, 0, 0], [0.3, 0.4, 0.3])),
    f('indirect_light', '間接照明', [0, 2.0, -hd + 0.15], [0, 0, 0], [0.1, 0.3, 5]),
    f('indirect_light', '間接照明', [-hw + 0.15, 2.0, -1], [0, Math.PI / 2, 0], [0.1, 0.3, 2]),
    // 植物
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant', '観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    f('plant_small', '小型植物', [-1, 0.75, -hd + 0.6], [0, 0, 0], [0.2, 0.3, 0.2]),
    f('plant_small', '小型植物', [4, 0.75, -hd + 0.6], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, hd - 0.1], [0, Math.PI, 0], [0.9, 0.3, 0.25]),
    f('air_purifier', '空気清浄機', [-hw + 0.4, 0, 0], [0, Math.PI / 2, 0], [0.3, 0.6, 0.3]),
  ];

  return { id: 'salon', name: '美容室', description: '施術6席+シャンプー3+待合のフルサロン', style: 'scandinavian', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '💇' };
}

// ============================
// 5. 小売店 (14x10m)
// ============================
function createRetailTemplate(): StoreTemplate {
  _idCounter = 1000;
  const W = 14, D = 10, H = 3.0;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 7, width: 1.8, height: 2.3, elevation: 0 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 2, width: 3.0, height: 2.0, elevation: 0.5 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 11, width: 3.0, height: 2.0, elevation: 0.5 },
  ];

  const furniture: FurnitureItem[] = [
    // レジエリア (奥壁右)
    f('counter', 'レジカウンター', [hw - 1.5, 0, -hd + 0.5], [0, 0, 0], [2.5, 1.0, 0.6]),
    f('register', 'レジ', [hw - 1.5, 0, -hd + 0.5], [0, 0, 0], [0.6, 1.0, 0.5]),
    f('shelf', '紙袋棚', [hw - 0.3, 0, -hd + 0.2], [0, -Math.PI / 2, 0], [1.0, 1.2, 0.35]),
    // 壁面棚 (左壁沿い 4本)
    ...Array.from({ length: 4 }, (_, i) => f('shelf', '壁面棚', [-hw + 0.3, 0, -3 + i * 2], [0, Math.PI / 2, 0], [1.8, 2.0, 0.4])),
    // 壁面棚 (右壁沿い 2本)
    ...Array.from({ length: 2 }, (_, i) => f('shelf', '壁面棚', [hw - 0.3, 0, 0 + i * 2.5], [0, -Math.PI / 2, 0], [2.0, 2.0, 0.4])),
    // 中央島棚 (3列×2)
    ...[-2.5, 0, 2.5].flatMap(x => [-1.5, 1.5].map(z => f('shelf', '商品棚', [x, 0, z], [0, 0, 0], [1.8, 1.5, 0.5]))),
    // ディスプレイケース (入口付近)
    ...[-3, -1, 1, 3].map(x => f('display_case', 'ディスプレイケース', [x, 0, hd - 1.5], [0, 0, 0], [1.2, 1.0, 0.5])),
    // ガラスショーケース
    f('glass_showcase', 'ガラスショーケース', [-hw + 1.0, 0, -hd + 1.5], [0, 0, 0], [1.5, 1.2, 0.5]),
    f('glass_showcase', 'ガラスショーケース', [-hw + 1.0, 0, -hd + 3.5], [0, 0, 0], [1.5, 1.2, 0.5]),
    // マネキン
    ...[-4.5, -2, 2, 4.5].map(x => f('mannequin', 'マネキン', [x, 0, hd - 0.8], [0, Math.PI, 0], [0.4, 1.7, 0.3])),
    // サイネージ・ガイド
    f('digital_signage', 'デジタルサイネージ', [-4, 1.5, hd - 0.15], [0, Math.PI, 0], [1.2, 0.7, 0.08]),
    f('digital_signage', 'デジタルサイネージ', [4, 1.5, hd - 0.15], [0, Math.PI, 0], [1.2, 0.7, 0.08]),
    f('guide_board', 'フロアガイド', [0, 0, hd - 0.8], [0, Math.PI, 0], [0.5, 1.3, 0.3]),
    // ペンダントライト6つ
    ...Array.from({ length: 6 }, (_, i) => f('pendant_light', 'ペンダントライト', [-5 + i * 2, H - 0.3, 0], [0, 0, 0], [0.3, 0.4, 0.3])),
    // 植物
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.5, 0.6]),
    f('plant_large', '大型観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.5, 0.6]),
    f('plant', '観葉植物', [-hw + 0.5, 0, -hd + 0.5], [0, 0, 0], [0.5, 1.2, 0.5]),
    f('plant', '観葉植物', [0, 0, 3.5], [0, 0, 0], [0.5, 1.0, 0.5]),
    // 安全設備
    f('security_camera', '防犯カメラ', [-hw + 0.3, 2.6, -hd + 0.3], [0, Math.PI / 4, 0], [0.15, 0.15, 0.2]),
    f('security_camera', '防犯カメラ', [hw - 0.3, 2.6, hd - 0.3], [0, -Math.PI * 0.75, 0], [0.15, 0.15, 0.2]),
    f('fire_extinguisher', '消火器', [hw - 0.3, 0, -2], [0, 0, 0], [0.15, 0.5, 0.15]),
    f('aed', 'AED', [-hw + 0.15, 1.2, 0], [0, Math.PI / 2, 0], [0.3, 0.35, 0.15]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, 2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -2], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, 2], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'retail', name: '小売店', description: '棚10本+ショーケース+マネキンの本格物販', style: 'minimal', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🛍️' };
}

// ============================
// 6. オフィス (16x12m)
// ============================
function createOfficeTemplate(): StoreTemplate {
  _idCounter = 1400;
  const W = 16, D = 12, H = 2.7;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 8, width: 1.2, height: 2.1, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 2, width: 2.0, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 6, width: 2.0, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 10, width: 2.0, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 14, width: 2.0, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付エリア
    f('counter', '受付カウンター', [0, 0, hd - 1.0], [0, 0, 0], [2.5, 1.0, 0.6]),
    f('waiting_sofa', '待合ソファ', [-3, 0, hd - 1.0], [0, 0, 0], [2.0, 0.65, 0.7]),
    f('table_round', '待合テーブル', [-3, 0, hd - 1.8], [0, 0, 0], [0.5, 0.45, 0.5]),
    // オフィスデスク8台 (4列×2行)
    ...[-5, -2.5, 0, 2.5].flatMap(x => [-3, -0.5].flatMap(z => [
      f('office_desk', 'オフィスデスク', [x, 0, z], [0, 0, 0], [1.2, 0.73, 0.7]),
      f('office_chair', 'オフィスチェア', [x, 0, z + 0.6], [0, Math.PI, 0], [0.5, 0.9, 0.5]),
    ])),
    // 会議エリア (右奥)
    f('partition', '会議室仕切り', [hw - 3.5, 0, 0.5], [0, Math.PI / 2, 0], [5, 2.0, 0.08]),
    f('table_square', '会議テーブル', [hw - 2.5, 0, -2.5], [0, 0, 0], [2.5, 0.73, 1.2]),
    ...Array.from({ length: 3 }, (_, i) => f('chair', '会議椅子', [hw - 3.5 + i * 1.0, 0, -3.3], [0, 0, 0], [0.45, 0.85, 0.45])),
    ...Array.from({ length: 3 }, (_, i) => f('chair', '会議椅子', [hw - 3.5 + i * 1.0, 0, -1.7], [0, Math.PI, 0], [0.45, 0.85, 0.45])),
    f('whiteboard', 'ホワイトボード', [hw - 0.2, 0, -2.5], [0, -Math.PI / 2, 0], [1.8, 1.2, 0.05]),
    f('projector', 'プロジェクター', [hw - 2.5, 2.3, -4.5], [0, 0, 0], [0.35, 0.15, 0.3]),
    f('tv_monitor', 'TVモニター', [hw - 0.2, 1.3, -2.5], [0, -Math.PI / 2, 0], [1.2, 0.7, 0.08]),
    // ファイルキャビネット (左壁沿い)
    ...Array.from({ length: 4 }, (_, i) => f('file_cabinet', 'キャビネット', [-hw + 0.3, 0, -4 + i * 1.2], [0, Math.PI / 2, 0], [0.45, 1.3, 0.6])),
    // 本棚
    f('bookcase', '本棚', [-hw + 0.3, 0, 1], [0, Math.PI / 2, 0], [1.0, 1.9, 0.35]),
    f('bookcase', '本棚', [-hw + 0.3, 0, 2.5], [0, Math.PI / 2, 0], [1.0, 1.9, 0.35]),
    // プリンター
    f('printer_stand', 'プリンター台', [-hw + 1.5, 0, -hd + 0.5], [0, 0, 0], [0.6, 0.7, 0.5]),
    // リフレッシュコーナー
    f('water_server', 'ウォーターサーバー', [hw - 0.5, 0, hd - 1.8], [0, 0, 0], [0.35, 1.1, 0.35]),
    f('vending_machine', '自販機', [hw - 0.5, 0, hd - 3.0], [0, -Math.PI / 2, 0], [0.7, 1.8, 0.7]),
    f('trash_can', 'ゴミ箱', [hw - 0.5, 0, hd - 2.5], [0, 0, 0], [0.3, 0.65, 0.3]),
    f('trash_can', 'ゴミ箱', [-2, 0, -hd + 0.4], [0, 0, 0], [0.3, 0.65, 0.3]),
    // 装飾
    f('clock', '時計', [0, 2.0, -hd + 0.1], [0, 0, 0], [0.4, 0.4, 0.05]),
    f('clock', '時計', [0, 2.0, hd - 0.1], [0, Math.PI, 0], [0.4, 0.4, 0.05]),
    // 植物
    f('plant_large', '大型観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant', '観葉植物', [3, 0, 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    f('plant', '観葉植物', [-4, 0, 3], [0, 0, 0], [0.5, 1.0, 0.5]),
    f('plant_small', '卓上植物', [-5, 0.73, -3], [0, 0, 0], [0.2, 0.3, 0.2]),
    f('plant_small', '卓上植物', [0, 0.73, -3], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 安全設備
    f('fire_extinguisher', '消火器', [-hw + 0.3, 0, -2], [0, 0, 0], [0.15, 0.5, 0.15]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, 2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -2], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'office', name: 'オフィス', description: 'デスク8台+会議室+受付+リフレッシュコーナー', style: 'modern', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🏢' };
}

// ============================
// 7. クリニック (14x10m)
// ============================
function createClinicTemplate(): StoreTemplate {
  _idCounter = 1800;
  const W = 14, D = 10, H = 2.8;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 7, width: 1.4, height: 2.2, elevation: 0 },
    { id: uid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 2, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 5, width: 1.5, height: 1.2, elevation: 0.9 },
    { id: uid('win'), wallId: walls[3].id, type: 'window', positionAlongWall: 5, width: 1.5, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付
    f('counter', '受付カウンター', [3, 0, hd - 1.0], [0, 0, 0], [3.0, 1.0, 0.6]),
    f('register', 'レジ', [4, 0, hd - 1.0], [0, 0, 0], [0.5, 1.0, 0.45]),
    // 待合エリア (左半分)
    ...Array.from({ length: 4 }, (_, i) => f('bench', '待合ベンチ', [-3.5 + i * 1.8, 0, hd - 1.5], [0, 0, 0], [1.5, 0.45, 0.5])),
    f('table_round', '待合テーブル', [-2, 0, hd - 2.5], [0, 0, 0], [0.5, 0.45, 0.5]),
    f('table_round', '待合テーブル', [1, 0, hd - 2.5], [0, 0, 0], [0.5, 0.45, 0.5]),
    f('tv_monitor', 'TVモニター', [0, 1.5, hd - 0.15], [0, Math.PI, 0], [1.2, 0.7, 0.08]),
    f('digital_signage', 'サイネージ', [-5, 1.5, hd - 0.15], [0, Math.PI, 0], [0.8, 0.5, 0.08]),
    f('shelf', '雑誌棚', [-5.5, 0, hd - 1.0], [0, 0, 0], [1.0, 1.0, 0.35]),
    // 仕切り (待合⇔診察)
    f('partition', '待合仕切り', [0, 0, 1.5], [0, 0, 0], [12, 2.2, 0.08]),
    // 診察室3部屋 (手前左から右に)
    // 仕切り壁
    f('partition', '診察室仕切り1', [-2.5, 0, -1.5], [0, Math.PI / 2, 0], [5, 2.2, 0.08]),
    f('partition', '診察室仕切り2', [2.5, 0, -1.5], [0, Math.PI / 2, 0], [5, 2.2, 0.08]),
    // 診察室1 (左)
    f('treatment_bed', '診察台', [-5, 0, -1], [0, 0, 0], [1.8, 0.6, 0.7]),
    f('desk', '診察デスク', [-5, 0, -3], [0, 0, 0], [1.2, 0.73, 0.6]),
    f('chair', '診察椅子', [-5, 0, -2.3], [0, Math.PI, 0], [0.45, 0.85, 0.45]),
    f('chair', '患者椅子', [-5, 0, -3.6], [0, 0, 0], [0.45, 0.85, 0.45]),
    f('shelf', '医療棚', [-hw + 0.3, 0, -2.5], [0, Math.PI / 2, 0], [1.5, 1.5, 0.35]),
    // 診察室2 (中央)
    f('treatment_bed', '診察台', [0, 0, -1], [0, 0, 0], [1.8, 0.6, 0.7]),
    f('desk', '診察デスク', [0, 0, -3], [0, 0, 0], [1.2, 0.73, 0.6]),
    f('chair', '診察椅子', [0, 0, -2.3], [0, Math.PI, 0], [0.45, 0.85, 0.45]),
    f('chair', '患者椅子', [0, 0, -3.6], [0, 0, 0], [0.45, 0.85, 0.45]),
    f('shelf', '医療棚', [-0.8, 0, -hd + 0.3], [0, 0, 0], [1.0, 1.5, 0.35]),
    // 診察室3 (右) — 処置室
    f('treatment_bed', '処置台', [5, 0, -1], [0, 0, 0], [1.8, 0.6, 0.7]),
    f('sink', '手洗いシンク', [5, 0, -3.5], [0, 0, 0], [0.6, 0.85, 0.5]),
    f('shelf', '医療棚', [hw - 0.3, 0, -2.5], [0, -Math.PI / 2, 0], [1.5, 1.5, 0.35]),
    f('shelf', '処置棚', [5, 0, -hd + 0.3], [0, 0, 0], [1.0, 1.5, 0.35]),
    // 共用設備
    f('water_server', 'ウォーターサーバー', [-hw + 0.5, 0, hd - 2.5], [0, 0, 0], [0.35, 1.1, 0.35]),
    f('fire_extinguisher', '消火器', [hw - 0.3, 0, 0], [0, 0, 0], [0.15, 0.5, 0.15]),
    f('aed', 'AED', [hw - 0.15, 1.2, 2], [0, -Math.PI / 2, 0], [0.3, 0.35, 0.15]),
    // 装飾
    f('clock', '時計', [0, 2.0, hd - 0.1], [0, Math.PI, 0], [0.35, 0.35, 0.05]),
    f('plant', '観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    f('plant', '観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    f('plant_small', '小型植物', [3, 1.0, hd - 1.0], [0, 0, 0], [0.2, 0.3, 0.2]),
    // ペンダントライト
    ...Array.from({ length: 4 }, (_, i) => f('pendant_light', 'ペンダントライト', [-4.5 + i * 3, H - 0.3, hd - 1.5], [0, 0, 0], [0.3, 0.4, 0.3])),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -2], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -2], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, 3], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, 3], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'clinic', name: 'クリニック', description: '受付+待合+診察3室+処置室の本格医院', style: 'medical', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🏥' };
}

// ============================
// 8. ラーメン店 (10x8m)
// ============================
function createRamenTemplate(): StoreTemplate {
  _idCounter = 2200;
  const W = 10, D = 8, H = 2.6;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 5, width: 1.0, height: 2.1, elevation: 0 },
  ];

  const furniture: FurnitureItem[] = [
    // L字カウンター
    f('counter', 'カウンター（横）', [0, 0, -1.0], [0, 0, 0], [6, 1.0, 0.5]),
    f('counter', 'カウンター（縦）', [-hw + 1.0, 0, 1], [0, Math.PI / 2, 0], [3, 1.0, 0.5]),
    // カウンタースツール10脚
    ...Array.from({ length: 7 }, (_, i) => f('stool', 'スツール', [-2.4 + i * 0.8, 0, -0.2], [0, 0, 0], [0.35, 0.65, 0.35])),
    ...Array.from({ length: 3 }, (_, i) => f('stool', 'スツール', [-hw + 1.8, 0, -0.2 + i * 0.8], [0, Math.PI / 2, 0], [0.35, 0.65, 0.35])),
    // 四角テーブル3セット (右エリア)
    ...[0.5, 2.0, 3.5].flatMap(z => [
      f('table_square', '四角テーブル', [3.5, 0, z], [0, 0, 0], [0.7, 0.72, 0.7]),
      f('chair', '椅子', [3.0, 0, z], [0, Math.PI / 2, 0], [0.4, 0.8, 0.4]),
      f('chair', '椅子', [4.0, 0, z], [0, -Math.PI / 2, 0], [0.4, 0.8, 0.4]),
      f('chair', '椅子', [3.5, 0, z - 0.4], [0, 0, 0], [0.4, 0.8, 0.4]),
      f('chair', '椅子', [3.5, 0, z + 0.4], [0, Math.PI, 0], [0.4, 0.8, 0.4]),
    ]),
    // 厨房エリア (カウンター裏)
    f('noodle_cooker', '麺茹で機', [0, 0, -2.0], [0, 0, 0], [0.8, 0.9, 0.6]),
    f('fridge', '冷蔵庫', [3, 0, -hd + 0.35], [0, 0, 0], [0.7, 1.8, 0.7]),
    f('ice_maker', '製氷機', [1.5, 0, -hd + 0.35], [0, 0, 0], [0.6, 0.8, 0.6]),
    f('shelf', '食器棚', [-1, 0, -hd + 0.2], [0, 0, 0], [2.0, 1.5, 0.35]),
    f('shelf', '調味料棚', [-3, 0, -hd + 0.2], [0, 0, 0], [1.5, 1.2, 0.3]),
    f('sink', 'シンク', [2, 0, -2.0], [0, 0, 0], [0.6, 0.85, 0.5]),
    // 入口エリア
    f('vending_machine', '券売機', [1, 0, hd - 0.4], [0, Math.PI, 0], [0.7, 1.6, 0.7]),
    f('menu_board', 'メニューボード', [-1, 1.5, hd - 0.15], [0, Math.PI, 0], [0.8, 0.6, 0.05]),
    f('water_server', 'ウォーターサーバー', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.35, 1.1, 0.35]),
    f('trash_can', 'ゴミ箱', [-hw + 0.5, 0, hd - 0.4], [0, 0, 0], [0.3, 0.65, 0.3]),
    // ペンダントライト4つ
    ...Array.from({ length: 4 }, (_, i) => f('pendant_light', 'ペンダントライト', [-2 + i * 1.5, H - 0.3, -0.5], [0, 0, 0], [0.3, 0.35, 0.3])),
    // 空調
    f('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, 1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'ramen', name: 'ラーメン店', description: 'L字カウンター10席+テーブル3席+本格厨房', style: 'japanese', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🍜' };
}

// ============================
// 9. ビューティーサロン (14x10m)
// ============================
function createBeautySalonTemplate(): StoreTemplate {
  _idCounter = 2500;
  const W = 14, D = 10, H = 2.8;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 7, width: 1.4, height: 2.2, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 3, width: 2.5, height: 1.5, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 8, width: 2.5, height: 1.5, elevation: 0.8 },
    { id: uid('win'), wallId: walls[1].id, type: 'window', positionAlongWall: 5, width: 2.0, height: 1.2, elevation: 0.9 },
  ];

  const furniture: FurnitureItem[] = [
    // レセプション＆待合
    f('reception_desk', 'レセプション', [4, 0, hd - 1.2], [0, 0, 0], [2.2, 1.0, 0.7]),
    f('register', 'レジ', [4.8, 0, hd - 1.2], [0, 0, 0], [0.5, 1.0, 0.45]),
    f('waiting_sofa', '待合ソファ', [-3, 0, hd - 1.0], [0, 0, 0], [2.0, 0.7, 0.7]),
    f('waiting_sofa', '待合ソファ', [-5.5, 0, hd - 1.0], [0, 0, 0], [2.0, 0.7, 0.7]),
    f('table_round', '雑誌テーブル', [-4.3, 0, hd - 1.8], [0, 0, 0], [0.5, 0.45, 0.5]),
    f('coat_rack', 'コートラック', [1.5, 0, hd - 0.4], [0, 0, 0], [0.4, 1.7, 0.4]),
    // ミラーステーション5席 (奥壁沿い)
    ...Array.from({ length: 5 }, (_, i) => [
      f('mirror_station', '施術ミラー', [-5 + i * 2.2, 0, -hd + 0.2], [0, 0, 0], [1.0, 1.5, 0.05]),
      f('counter', '施術台', [-5 + i * 2.2, 0, -hd + 0.6], [0, 0, 0], [0.9, 0.75, 0.4]),
      f('chair', 'サロンチェア', [-5 + i * 2.2, 0, -hd + 1.4], [0, Math.PI, 0], [0.55, 0.9, 0.55]),
    ]).flat(),
    // シャンプーステーション3台 (右壁沿い)
    ...Array.from({ length: 3 }, (_, i) => f('shampoo_station', 'シャンプー台', [hw - 0.5, 0, -3 + i * 1.5], [0, -Math.PI / 2, 0], [0.8, 0.8, 0.5])),
    // トリートメントベッド2台 (右奥)
    f('partition', 'トリートメント仕切り', [hw - 3, 0, -hd + 2.5], [0, 0, 0], [0.08, 2.0, 4]),
    f('treatment_bed', 'トリートメントベッド', [hw - 1.5, 0, -hd + 1.5], [0, 0, 0], [1.8, 0.6, 0.7]),
    f('treatment_bed', 'トリートメントベッド', [hw - 1.5, 0, -hd + 3.5], [0, 0, 0], [1.8, 0.6, 0.7]),
    // 設備
    f('dresser', 'ドレッサー', [-hw + 0.5, 0, 0], [0, Math.PI / 2, 0], [0.8, 0.75, 0.45]),
    f('wardrobe', 'ワードローブ', [-hw + 0.3, 0, -2], [0, Math.PI / 2, 0], [1.0, 1.8, 0.6]),
    // 仕切り
    f('partition', '待合仕切り', [0, 0, 2], [0, 0, 0], [8, 1.8, 0.08]),
    // 装飾
    ...Array.from({ length: 4 }, (_, i) => f('pendant_light', 'ペンダントライト', [-4 + i * 2.5, H - 0.3, -1], [0, 0, 0], [0.3, 0.4, 0.3])),
    ...[-4, 0, 4].map(x => f('indirect_light', '間接照明', [x, 2.0, -hd + 0.15], [0, 0, 0], [0.1, 0.3, 1.5])),
    f('indirect_light', '間接照明', [-hw + 0.15, 2.0, -1], [0, Math.PI / 2, 0], [0.1, 0.3, 2.0]),
    f('speaker', 'スピーカー', [-hw + 0.2, 2.0, -2], [0, Math.PI / 2, 0], [0.2, 0.3, 0.18]),
    f('speaker', 'スピーカー', [hw - 0.2, 2.0, -2], [0, -Math.PI / 2, 0], [0.2, 0.3, 0.18]),
    f('clock', '時計', [0, 2.0, -hd + 0.1], [0, 0, 0], [0.35, 0.35, 0.05]),
    // 植物
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.5, 0.6]),
    f('plant_large', '大型観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant', '観葉植物', [1, 0, 2.5], [0, 0, 0], [0.5, 1.1, 0.5]),
    f('plant_small', '小型植物', [-5, 0.75, -hd + 0.6], [0, 0, 0], [0.2, 0.3, 0.2]),
    f('plant_small', '小型植物', [0, 0.75, -hd + 0.6], [0, 0, 0], [0.2, 0.3, 0.2]),
    f('plant_small', '小型植物', [3.8, 0.75, -hd + 0.6], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, hd - 0.1], [0, Math.PI, 0], [0.9, 0.3, 0.25]),
    f('air_purifier', '空気清浄機', [-hw + 0.4, 0, 3], [0, Math.PI / 2, 0], [0.3, 0.6, 0.3]),
    f('air_purifier', '空気清浄機', [hw - 0.4, 0, 3], [0, -Math.PI / 2, 0], [0.3, 0.6, 0.3]),
  ];

  return { id: 'beauty_salon', name: 'ビューティーサロン', description: '施術5席+シャンプー3+トリートメント2+待合', style: 'scandinavian', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '💇' };
}

// ============================
// 10. フィットネスジム (18x14m)
// ============================
function createFitnessTemplate(): StoreTemplate {
  _idCounter = 2900;
  const W = 18, D = 14, H = 3.2;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 9, width: 1.8, height: 2.3, elevation: 0 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 2, width: 3, height: 1.5, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 8, width: 3, height: 1.5, elevation: 0.8 },
    { id: uid('win'), wallId: walls[0].id, type: 'window', positionAlongWall: 14, width: 3, height: 1.5, elevation: 0.8 },
  ];

  const furniture: FurnitureItem[] = [
    // 受付
    f('counter', '受付カウンター', [6, 0, hd - 1.0], [0, 0, 0], [3.0, 1.0, 0.6]),
    // ロッカー
    ...Array.from({ length: 4 }, (_, i) => f('locker', 'ロッカー', [hw - 0.4, 0, -5 + i * 1.2], [0, -Math.PI / 2, 0], [0.4, 1.8, 0.9])),
    // ウォールミラー (奥壁)
    ...Array.from({ length: 4 }, (_, i) => f('mirror', 'ウォールミラー', [-5 + i * 3, 0, -hd + 0.15], [0, 0, 0], [2.5, 2.2, 0.05])),
    // トレッドミル4台 (ミラー前)
    ...Array.from({ length: 4 }, (_, i) => f('treadmill', 'トレッドミル', [-5.5 + i * 2.5, 0, -hd + 2], [0, 0, 0], [0.8, 1.3, 1.8])),
    // ダンベルラック3台 (左壁沿い)
    ...Array.from({ length: 3 }, (_, i) => f('dumbbell_rack', 'ダンベルラック', [-hw + 0.5, 0, -4 + i * 2.5], [0, Math.PI / 2, 0], [2.0, 1.2, 0.5])),
    // トレーニングベンチ4台
    ...Array.from({ length: 4 }, (_, i) => f('bench', 'トレーニングベンチ', [-4 + i * 2.5, 0, -1.5], [0, 0, 0], [1.3, 0.5, 0.4])),
    // ヨガマット6枚 (左手前エリア)
    ...Array.from({ length: 6 }, (_, i) => f('yoga_mat', 'ヨガマット', [-6 + (i % 3) * 2.5, 0.02, 2 + Math.floor(i / 3) * 2], [0, 0, 0], [1.8, 0.03, 0.6])),
    // TVモニター3台
    ...[-5, 0, 5].map(x => f('tv_monitor', 'TVモニター', [x, 2.0, -hd + 0.15], [0, 0, 0], [1.0, 0.6, 0.08])),
    // スピーカー4つ
    f('speaker', 'スピーカー', [-hw + 0.2, 2.5, -4], [0, Math.PI / 2, 0], [0.25, 0.35, 0.2]),
    f('speaker', 'スピーカー', [-hw + 0.2, 2.5, 3], [0, Math.PI / 2, 0], [0.25, 0.35, 0.2]),
    f('speaker', 'スピーカー', [hw - 0.2, 2.5, -4], [0, -Math.PI / 2, 0], [0.25, 0.35, 0.2]),
    f('speaker', 'スピーカー', [hw - 0.2, 2.5, 3], [0, -Math.PI / 2, 0], [0.25, 0.35, 0.2]),
    // リフレッシュコーナー
    f('water_server', 'ウォーターサーバー', [hw - 0.5, 0, 2], [0, 0, 0], [0.35, 1.1, 0.35]),
    f('water_server', 'ウォーターサーバー', [-hw + 0.5, 0, 4], [0, 0, 0], [0.35, 1.1, 0.35]),
    f('vending_machine', '自販機', [hw - 0.5, 0, 3.5], [0, -Math.PI / 2, 0], [0.7, 1.8, 0.7]),
    f('bench', '休憩ベンチ', [3, 0, 5], [0, 0, 0], [1.5, 0.45, 0.4]),
    // 装飾
    f('clock', '時計', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.5, 0.5, 0.05]),
    f('clock', '時計', [0, 2.2, hd - 0.1], [0, Math.PI, 0], [0.5, 0.5, 0.05]),
    f('digital_signage', 'サイネージ', [3, 1.5, hd - 0.15], [0, Math.PI, 0], [1.2, 0.7, 0.08]),
    // 植物
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.7, 1.5, 0.7]),
    f('plant_large', '大型観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.7, 1.5, 0.7]),
    f('plant', '観葉植物', [0, 0, hd - 0.5], [0, 0, 0], [0.5, 1.2, 0.5]),
    f('plant', '観葉植物', [-hw + 0.5, 0, -hd + 0.5], [0, 0, 0], [0.5, 1.0, 0.5]),
    // 安全
    f('fire_extinguisher', '消火器', [-hw + 0.3, 0, 0], [0, 0, 0], [0.15, 0.5, 0.15]),
    f('aed', 'AED', [hw - 0.15, 1.2, 0], [0, -Math.PI / 2, 0], [0.3, 0.35, 0.15]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -3], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, 3], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -3], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, 3], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'fitness', name: 'フィットネスジム', description: 'トレッドミル4+ベンチ4+ヨガ6+ダンベル3の本格ジム', style: 'industrial', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '🏋️' };
}

// ============================
// 11. ブティック (14x10m)
// ============================
function createBoutiqueTemplate(): StoreTemplate {
  _idCounter = 3300;
  const W = 14, D = 10, H = 3.0;
  const walls = createRectRoom(W, D, H);
  const hw = W / 2, hd = D / 2;

  const openings: Opening[] = [
    { id: uid('door'), wallId: walls[2].id, type: 'door', positionAlongWall: 6, width: 1.6, height: 2.3, elevation: 0 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 1, width: 3.0, height: 2.0, elevation: 0.5 },
    { id: uid('win'), wallId: walls[2].id, type: 'window', positionAlongWall: 10, width: 3.0, height: 2.0, elevation: 0.5 },
  ];

  const furniture: FurnitureItem[] = [
    // レジエリア (奥壁右)
    f('counter', 'レジカウンター', [hw - 2, 0, -hd + 0.6], [0, 0, 0], [2.0, 0.9, 0.5]),
    f('register', 'レジ', [hw - 2, 0, -hd + 0.6], [0, 0, 0], [0.5, 1.0, 0.45]),
    // マネキン6体 (入口付近ディスプレイ)
    ...[-5, -3, -1, 1, 3, 5].map(x => f('mannequin', 'マネキン', [x, 0, hd - 1.0], [0, Math.PI, 0], [0.4, 1.7, 0.3])),
    // ハンガーラック6本 (左右壁沿い)
    ...Array.from({ length: 3 }, (_, i) => f('hanger_rack', 'ハンガーラック', [-hw + 0.5, 0, -3.5 + i * 2.5], [0, Math.PI / 2, 0], [1.5, 1.6, 0.5])),
    ...Array.from({ length: 3 }, (_, i) => f('hanger_rack', 'ハンガーラック', [hw - 0.5, 0, -3.5 + i * 2.5], [0, -Math.PI / 2, 0], [1.5, 1.6, 0.5])),
    // ディスプレイケース (中央)
    ...[-2, 0, 2].map(x => f('display_case', 'ディスプレイケース', [x, 0, -1], [0, 0, 0], [1.3, 1.0, 0.5])),
    f('display_case', 'ディスプレイケース', [0, 0, 1.5], [0, 0, 0], [1.3, 1.0, 0.5]),
    // ガラスショーケース (奥壁沿い)
    f('glass_showcase', 'ガラスショーケース', [-4, 0, -hd + 0.5], [0, 0, 0], [2.0, 1.2, 0.5]),
    f('glass_showcase', 'ガラスショーケース', [0, 0, -hd + 0.5], [0, 0, 0], [2.0, 1.2, 0.5]),
    // フィッティングルーム (右奥)
    f('fitting_room', 'フィッティングルーム', [hw - 1.5, 0, 1], [0, 0, 0], [1.2, 2.2, 1.2]),
    f('fitting_room', 'フィッティングルーム', [hw - 1.5, 0, 3], [0, 0, 0], [1.2, 2.2, 1.2]),
    // ミラー
    f('mirror', 'フィッティングミラー', [hw - 3, 0, 0.5], [0, 0, 0], [0.9, 1.8, 0.05]),
    f('mirror', 'フィッティングミラー', [hw - 3, 0, 2.5], [0, 0, 0], [0.9, 1.8, 0.05]),
    f('mirror', 'ウォールミラー', [-hw + 0.15, 0, 0], [0, Math.PI / 2, 0], [1.2, 2.0, 0.05]),
    f('mirror', 'ウォールミラー', [-hw + 0.15, 0, -3], [0, Math.PI / 2, 0], [1.2, 2.0, 0.05]),
    // ソファ (試着待ち)
    f('sofa', '待合ソファ', [hw - 4, 0, 2], [0, 0, 0], [1.5, 0.65, 0.7]),
    f('table_round', 'サイドテーブル', [hw - 4, 0, 1.2], [0, 0, 0], [0.4, 0.5, 0.4]),
    // サイネージ
    f('digital_signage', 'サイネージ', [-2, 1.8, hd - 0.15], [0, Math.PI, 0], [1.2, 0.7, 0.08]),
    f('digital_signage', 'サイネージ', [2, 1.8, hd - 0.15], [0, Math.PI, 0], [1.2, 0.7, 0.08]),
    // 照明
    ...Array.from({ length: 4 }, (_, i) => f('pendant_light', 'ペンダントライト', [-4.5 + i * 3, H - 0.3, -1], [0, 0, 0], [0.25, 0.35, 0.25])),
    ...[-4, 0, 4].map(x => f('indirect_light', '間接照明', [x, 2.2, -hd + 0.15], [0, 0, 0], [0.1, 0.3, 2])),
    f('indirect_light', '間接照明', [-hw + 0.15, 2.2, 0], [0, Math.PI / 2, 0], [0.1, 0.3, 3]),
    // 植物
    f('plant_large', '大型観葉植物', [-hw + 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.5, 0.6]),
    f('plant_large', '大型観葉植物', [hw - 0.5, 0, hd - 0.5], [0, 0, 0], [0.6, 1.4, 0.6]),
    f('plant', '観葉植物', [0, 0, 3], [0, 0, 0], [0.5, 1.2, 0.5]),
    f('flower_pot', '花瓶', [-4, 1.0, -1], [0, 0, 0], [0.2, 0.3, 0.2]),
    f('flower_pot', '花瓶', [4, 1.0, -1], [0, 0, 0], [0.2, 0.3, 0.2]),
    // 空調
    f('air_conditioner', 'エアコン', [-hw + 0.1, 2.2, -1], [0, Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [hw - 0.1, 2.2, -1], [0, -Math.PI / 2, 0], [0.9, 0.3, 0.25]),
    f('air_conditioner', 'エアコン', [0, 2.2, -hd + 0.1], [0, 0, 0], [0.9, 0.3, 0.25]),
  ];

  return { id: 'boutique', name: 'ブティック', description: 'マネキン6+ハンガー6+ショーケース+フィッティング2', style: 'luxury', roomWidth: W, roomDepth: D, roomHeight: H, walls, openings, furniture, thumbnail: '👗' };
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

// デフォルトテンプレート（カフェ 30席）
export const DEFAULT_TEMPLATE = STORE_TEMPLATES[0];
