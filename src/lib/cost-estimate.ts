/**
 * コスト見積もり — 配置家具の概算費用を算出
 *
 * 家具タイプ別のデフォルト単価データベースを持ち、
 * 配置済み家具リストから合計金額・税込金額を計算する。
 */

import { FurnitureItem, FurnitureType } from '@/types/scene';

// --- 型定義 ---

/** 家具タイプ別の価格情報（税抜、円） */
export interface FurniturePriceInfo {
  minPrice: number;
  maxPrice: number;
  averagePrice: number;
  /** 日本語名 */
  nameJa: string;
}

/** 見積もり明細行 */
export interface CostLineItem {
  type: FurnitureType;
  nameJa: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/** 見積もり結果 */
export interface CostEstimate {
  items: CostLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  /** フォーマット済み文字列 */
  formatted: {
    subtotal: string;
    taxAmount: string;
    total: string;
  };
}

// --- 価格データベース（税抜、JPY） ---

export const FURNITURE_PRICES: Record<FurnitureType, FurniturePriceInfo> = {
  counter: { minPrice: 80000, maxPrice: 200000, averagePrice: 120000, nameJa: 'カウンター' },
  table_square: { minPrice: 15000, maxPrice: 50000, averagePrice: 30000, nameJa: '四角テーブル' },
  table_round: { minPrice: 20000, maxPrice: 60000, averagePrice: 35000, nameJa: '丸テーブル' },
  chair: { minPrice: 8000, maxPrice: 30000, averagePrice: 15000, nameJa: '椅子' },
  stool: { minPrice: 5000, maxPrice: 20000, averagePrice: 10000, nameJa: 'スツール' },
  sofa: { minPrice: 50000, maxPrice: 200000, averagePrice: 100000, nameJa: 'ソファ' },
  shelf: { minPrice: 10000, maxPrice: 50000, averagePrice: 25000, nameJa: '棚' },
  pendant_light: { minPrice: 10000, maxPrice: 40000, averagePrice: 20000, nameJa: 'ペンダントライト' },
  plant: { minPrice: 3000, maxPrice: 15000, averagePrice: 8000, nameJa: '観葉植物' },
  partition: { minPrice: 15000, maxPrice: 60000, averagePrice: 30000, nameJa: 'パーティション' },
  register: { minPrice: 30000, maxPrice: 100000, averagePrice: 60000, nameJa: 'レジカウンター' },
  sink: { minPrice: 20000, maxPrice: 80000, averagePrice: 45000, nameJa: 'シンク' },
  fridge: { minPrice: 50000, maxPrice: 300000, averagePrice: 150000, nameJa: '冷蔵庫' },
  display_case: { minPrice: 30000, maxPrice: 150000, averagePrice: 70000, nameJa: 'ショーケース' },
  bench: { minPrice: 15000, maxPrice: 50000, averagePrice: 28000, nameJa: 'ベンチ' },
  mirror: { minPrice: 5000, maxPrice: 30000, averagePrice: 12000, nameJa: '鏡' },
  reception_desk: { minPrice: 50000, maxPrice: 200000, averagePrice: 100000, nameJa: 'レセプションデスク' },
  tv_monitor: { minPrice: 30000, maxPrice: 150000, averagePrice: 70000, nameJa: 'TVモニター' },
  washing_machine: { minPrice: 40000, maxPrice: 200000, averagePrice: 100000, nameJa: '洗濯機' },
  coat_rack: { minPrice: 5000, maxPrice: 20000, averagePrice: 10000, nameJa: 'コートラック' },
  air_conditioner: { minPrice: 50000, maxPrice: 200000, averagePrice: 100000, nameJa: 'エアコン' },
  desk: { minPrice: 15000, maxPrice: 80000, averagePrice: 40000, nameJa: 'デスク' },
  bookcase: { minPrice: 15000, maxPrice: 60000, averagePrice: 30000, nameJa: '本棚' },
  kitchen_island: { minPrice: 80000, maxPrice: 300000, averagePrice: 150000, nameJa: 'キッチンアイランド' },
  bar_table: { minPrice: 20000, maxPrice: 60000, averagePrice: 35000, nameJa: 'ハイテーブル' },
  wardrobe: { minPrice: 30000, maxPrice: 120000, averagePrice: 60000, nameJa: 'ワードローブ' },
  shoe_rack: { minPrice: 5000, maxPrice: 25000, averagePrice: 12000, nameJa: '靴棚' },
  umbrella_stand: { minPrice: 2000, maxPrice: 10000, averagePrice: 5000, nameJa: '傘立て' },
  cash_register: { minPrice: 30000, maxPrice: 150000, averagePrice: 80000, nameJa: 'レジ' },
  menu_board: { minPrice: 5000, maxPrice: 30000, averagePrice: 15000, nameJa: 'メニューボード' },
  flower_pot: { minPrice: 2000, maxPrice: 15000, averagePrice: 6000, nameJa: '花瓶/フラワーポット' },
  ceiling_fan: { minPrice: 15000, maxPrice: 60000, averagePrice: 30000, nameJa: 'シーリングファン' },
  rug: { minPrice: 10000, maxPrice: 50000, averagePrice: 25000, nameJa: 'ラグ/カーペット' },
  curtain: { minPrice: 8000, maxPrice: 40000, averagePrice: 20000, nameJa: 'カーテン' },
  clock: { minPrice: 3000, maxPrice: 20000, averagePrice: 8000, nameJa: '時計（壁掛け）' },
  trash_can: { minPrice: 2000, maxPrice: 10000, averagePrice: 5000, nameJa: 'ゴミ箱' },
  custom: { minPrice: 10000, maxPrice: 100000, averagePrice: 50000, nameJa: 'カスタム' },
  // Round 9 追加家具
  refrigerator: { minPrice: 30000, maxPrice: 150000, averagePrice: 80000, nameJa: '冷蔵庫' },
  washbasin: { minPrice: 25000, maxPrice: 120000, averagePrice: 60000, nameJa: '洗面台' },
  toilet: { minPrice: 30000, maxPrice: 200000, averagePrice: 80000, nameJa: 'トイレ' },
  stairs: { minPrice: 200000, maxPrice: 800000, averagePrice: 400000, nameJa: '階段' },
  register_counter: { minPrice: 80000, maxPrice: 250000, averagePrice: 150000, nameJa: 'レジカウンター' },
  showcase: { minPrice: 50000, maxPrice: 200000, averagePrice: 100000, nameJa: 'ショーケース' },
  bed: { minPrice: 30000, maxPrice: 200000, averagePrice: 80000, nameJa: 'ベッド' },
  bar_stool: { minPrice: 8000, maxPrice: 30000, averagePrice: 15000, nameJa: 'バースツール' },
  hanger_rack: { minPrice: 10000, maxPrice: 40000, averagePrice: 20000, nameJa: 'ハンガーラック' },
  // 飲食店向け
  booth_sofa: { minPrice: 60000, maxPrice: 250000, averagePrice: 130000, nameJa: 'ブースソファ' },
  bar_chair: { minPrice: 10000, maxPrice: 40000, averagePrice: 20000, nameJa: 'バーチェア' },
  wine_rack: { minPrice: 15000, maxPrice: 80000, averagePrice: 40000, nameJa: 'ワインラック' },
  dish_cabinet: { minPrice: 30000, maxPrice: 150000, averagePrice: 70000, nameJa: '食器棚' },
  coffee_machine: { minPrice: 50000, maxPrice: 500000, averagePrice: 200000, nameJa: 'コーヒーマシン' },
  // オフィス向け
  office_desk: { minPrice: 20000, maxPrice: 100000, averagePrice: 50000, nameJa: 'オフィスデスク' },
  office_chair: { minPrice: 15000, maxPrice: 80000, averagePrice: 35000, nameJa: 'オフィスチェア' },
  file_cabinet: { minPrice: 15000, maxPrice: 60000, averagePrice: 30000, nameJa: 'ファイルキャビネット' },
  whiteboard: { minPrice: 5000, maxPrice: 30000, averagePrice: 15000, nameJa: 'ホワイトボード' },
  printer_stand: { minPrice: 8000, maxPrice: 25000, averagePrice: 15000, nameJa: 'プリンター台' },
  // 美容・医療向け
  treatment_bed: { minPrice: 30000, maxPrice: 150000, averagePrice: 70000, nameJa: '施術ベッド' },
  shampoo_station: { minPrice: 80000, maxPrice: 300000, averagePrice: 150000, nameJa: 'シャンプー台' },
  mirror_station: { minPrice: 30000, maxPrice: 120000, averagePrice: 60000, nameJa: 'ミラー台' },
  waiting_sofa: { minPrice: 50000, maxPrice: 200000, averagePrice: 100000, nameJa: '待合ソファ' },
  // 小売向け
  display_shelf: { minPrice: 15000, maxPrice: 80000, averagePrice: 40000, nameJa: 'ディスプレイ棚' },
  glass_showcase: { minPrice: 40000, maxPrice: 200000, averagePrice: 100000, nameJa: 'ガラスショーケース' },
  mannequin: { minPrice: 10000, maxPrice: 50000, averagePrice: 25000, nameJa: 'マネキン' },
  fitting_room: { minPrice: 50000, maxPrice: 200000, averagePrice: 100000, nameJa: '試着室' },
  // 共通設備
  vending_machine: { minPrice: 100000, maxPrice: 500000, averagePrice: 250000, nameJa: '自動販売機' },
  atm: { minPrice: 200000, maxPrice: 800000, averagePrice: 400000, nameJa: 'ATM' },
  coat_hanger: { minPrice: 5000, maxPrice: 20000, averagePrice: 10000, nameJa: 'コートハンガー' },
  fire_extinguisher: { minPrice: 5000, maxPrice: 15000, averagePrice: 8000, nameJa: '消火器' },
  aed: { minPrice: 200000, maxPrice: 400000, averagePrice: 280000, nameJa: 'AED' },
  plant_large: { minPrice: 8000, maxPrice: 30000, averagePrice: 15000, nameJa: '観葉植物（大）' },
  plant_small: { minPrice: 1000, maxPrice: 5000, averagePrice: 2500, nameJa: '観葉植物（小）' },
  digital_signage: { minPrice: 80000, maxPrice: 400000, averagePrice: 200000, nameJa: 'デジタルサイネージ' },
  indirect_light: { minPrice: 10000, maxPrice: 50000, averagePrice: 25000, nameJa: '間接照明' },
};

// --- 消費税率 ---

const TAX_RATE = 0.10;

// --- ユーティリティ ---

/** 数値を円表記にフォーマット */
export function formatJPY(amount: number): string {
  return `\u00A5${amount.toLocaleString('ja-JP')}`;
}

/**
 * 配置済み家具リストからコスト見積もりを計算
 * @param furniture - 配置済み家具リスト
 * @param priceOverrides - ユーザーが上書きした単価（家具タイプ→単価のMap）
 * @returns 見積もり結果
 */
export function calculateCostEstimate(
  furniture: FurnitureItem[],
  priceOverrides?: Map<FurnitureType, number>
): CostEstimate {
  // タイプ別に数量を集計
  const countByType = new Map<FurnitureType, number>();
  for (const item of furniture) {
    countByType.set(item.type, (countByType.get(item.type) ?? 0) + 1);
  }

  // 明細行を生成
  const items: CostLineItem[] = [];
  for (const [type, quantity] of countByType) {
    const priceInfo = FURNITURE_PRICES[type];
    const unitPrice = priceOverrides?.get(type) ?? priceInfo.averagePrice;
    items.push({
      type,
      nameJa: priceInfo.nameJa,
      quantity,
      unitPrice,
      subtotal: unitPrice * quantity,
    });
  }

  // 金額の大きい順にソート
  items.sort((a, b) => b.subtotal - a.subtotal);

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = Math.floor(subtotal * TAX_RATE);
  const total = subtotal + taxAmount;

  return {
    items,
    subtotal,
    taxRate: TAX_RATE,
    taxAmount,
    total,
    formatted: {
      subtotal: formatJPY(subtotal),
      taxAmount: formatJPY(taxAmount),
      total: formatJPY(total),
    },
  };
}

/**
 * 見積もりデータをCSV文字列に変換
 */
export function costEstimateToCSV(estimate: CostEstimate): string {
  const lines: string[] = [];
  // ヘッダー
  lines.push('品目,数量,単価(税抜),小計');
  // 明細
  for (const item of estimate.items) {
    lines.push(`${item.nameJa},${item.quantity},${item.unitPrice},${item.subtotal}`);
  }
  // フッター
  lines.push('');
  lines.push(`小計,,,${estimate.subtotal}`);
  lines.push(`消費税(${(estimate.taxRate * 100).toFixed(0)}%),,,${estimate.taxAmount}`);
  lines.push(`合計,,,${estimate.total}`);

  return lines.join('\n');
}

// ─── 仕上げ材・設備・配線のコスト計算 ────────────────────

import { WallSegment, Opening } from '@/types/floor-plan';
import {
  WallFinishAssignment, RoomFinishAssignment, FittingSpec,
  EquipmentItem, RouteSegment, FinishCostSection, FinishCostLineItem,
} from '@/types/finishing';
import { getFinishMaterial } from '@/data/finish-materials';
import { ROUTE_TYPES } from '@/data/equipment-catalog';

/** 壁面積計算 (壁長さ × 室高 - 開口部面積) */
export function calcWallArea(wall: WallSegment, roomHeight: number, openings: Opening[]): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLen = Math.sqrt(dx * dx + dy * dy);
  const grossArea = wallLen * roomHeight;
  const wallOpenings = openings.filter(o => o.wallId === wall.id);
  const openingArea = wallOpenings.reduce((sum, o) => sum + o.width * o.height, 0);
  return Math.max(0, grossArea - openingArea);
}

/** 仕上げ材コストセクション */
export function calcFinishCosts(
  walls: WallSegment[], openings: Opening[], roomHeight: number,
  wallAssignments: WallFinishAssignment[], roomAssignments: RoomFinishAssignment[], floorArea: number,
): FinishCostSection {
  const items: FinishCostLineItem[] = [];
  for (const assign of wallAssignments) {
    const wall = walls.find(w => w.id === assign.wallId);
    const mat = getFinishMaterial(assign.finishMaterialId);
    if (!wall || !mat) continue;
    const area = calcWallArea(wall, roomHeight, openings);
    if (area > 0) {
      items.push({ name: `壁: ${mat.name}`, quantity: Math.round(area * 10) / 10, unit: 'm²', unitPrice: mat.unitPrice, total: Math.round(area * mat.unitPrice) });
    }
  }
  for (const assign of roomAssignments) {
    if (assign.floorFinishId) {
      const mat = getFinishMaterial(assign.floorFinishId);
      if (mat) {
        const area = assign.floorAreaOverride ?? floorArea;
        items.push({ name: `床: ${mat.name}`, quantity: Math.round(area * 10) / 10, unit: 'm²', unitPrice: mat.unitPrice, total: Math.round(area * mat.unitPrice) });
      }
    }
    if (assign.ceilingFinishId) {
      const mat = getFinishMaterial(assign.ceilingFinishId);
      if (mat) {
        const area = assign.floorAreaOverride ?? floorArea;
        items.push({ name: `天井: ${mat.name}`, quantity: Math.round(area * 10) / 10, unit: 'm²', unitPrice: mat.unitPrice, total: Math.round(area * mat.unitPrice) });
      }
    }
  }
  return { label: '仕上げ材', items, subtotal: items.reduce((s, i) => s + i.total, 0) };
}

/** 建具コストセクション */
export function calcFittingCosts(fittings: FittingSpec[]): FinishCostSection {
  const items: FinishCostLineItem[] = fittings.map(f => ({
    name: f.productName, spec: f.material, quantity: f.quantity, unit: '枚', unitPrice: f.unitPrice, total: f.unitPrice * f.quantity,
  }));
  return { label: '建具', items, subtotal: items.reduce((s, i) => s + i.total, 0) };
}

/** 設備コストセクション */
export function calcEquipmentCosts(equipment: EquipmentItem[]): FinishCostSection {
  const items: FinishCostLineItem[] = equipment.map(e => ({
    name: e.name, spec: e.spec, quantity: e.quantity, unit: '台', unitPrice: e.unitPrice, total: e.unitPrice * e.quantity,
  }));
  return { label: '設備', items, subtotal: items.reduce((s, i) => s + i.total, 0) };
}

/** 配線・配管コストセクション */
export function calcRoutingCosts(routes: RouteSegment[]): FinishCostSection {
  const items: FinishCostLineItem[] = routes.map(r => {
    const rt = ROUTE_TYPES.find(t => t.type === r.type);
    let len = 0;
    for (let i = 1; i < r.points.length; i++) {
      const dx = r.points[i][0] - r.points[i - 1][0];
      const dy = r.points[i][1] - r.points[i - 1][1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return { name: rt?.name || r.type, quantity: Math.round(len * 10) / 10, unit: 'm', unitPrice: rt?.unitPrice || 3000, total: Math.round(len * (rt?.unitPrice || 3000)) };
  });
  return { label: '配線・配管', items, subtotal: items.reduce((s, i) => s + i.total, 0) };
}
