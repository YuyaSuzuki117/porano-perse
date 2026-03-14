/**
 * furniture-snap — 家具の自動スナップ・グルーピング
 *
 * テーブルと椅子、カウンターとスツール、デスクとモニターなど、
 * 関連する家具を自動的に最適な位置に配置する。
 */

import { FurnitureItem, FurnitureType } from '@/types/scene';

// ─── スナップ候補の型 ─────────────────────────────────
export interface SnapSuggestion {
  /** スナップ先の位置 [x, y, z] */
  targetPosition: [number, number, number];
  /** スナップ先の回転角（Y軸ラジアン） */
  targetRotation: number;
  /** スナップ理由の説明（UI表示用） */
  reason: string;
}

// ─── スナップルール定数 ─────────────────────────────────
const SNAP_DISTANCE_THRESHOLD = 2.0;    // スナップ検出の最大距離(m)
const CHAIR_TABLE_MARGIN = 0.1;          // 椅子とテーブルの間隔(m)
const STOOL_SPACING = 0.6;              // スツール同士の間隔(m)
const PENDANT_HEIGHT = 2.0;             // ペンダントライトの高さ(m)
const MONITOR_DESK_OFFSET = 0.15;       // モニターのデスク奥寄せ(m)

/**
 * 2点間のXZ平面上の距離を算出
 */
function distanceXZ(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * ある家具タイプがテーブル系かどうか判定
 */
function isTableType(type: FurnitureType): boolean {
  return type === 'table_square' || type === 'table_round' || type === 'kitchen_island';
}

/**
 * ある家具タイプがデスク系かどうか判定
 */
function isDeskType(type: FurnitureType): boolean {
  return type === 'desk' || type === 'reception_desk';
}

/**
 * 既存の家具配置を元に、新しいアイテムのスナップ候補を計算する。
 *
 * @param furniture 配置済みの全家具
 * @param newItem 新規配置する家具
 * @returns スナップ候補の配列（距離が近い順）
 */
export function computeSnapSuggestions(
  furniture: FurnitureItem[],
  newItem: FurnitureItem,
): SnapSuggestion[] {
  const suggestions: SnapSuggestion[] = [];

  for (const existing of furniture) {
    const dist = distanceXZ(existing.position, newItem.position);
    if (dist > SNAP_DISTANCE_THRESHOLD) continue;

    // ルール1: 椅子 → テーブルの端にスナップ（内向き）
    if (
      (newItem.type === 'chair' || newItem.type === 'stool') &&
      isTableType(existing.type)
    ) {
      const tableHalfW = existing.scale[0] / 2 + newItem.scale[2] / 2 + CHAIR_TABLE_MARGIN;
      const tableHalfD = existing.scale[2] / 2 + newItem.scale[2] / 2 + CHAIR_TABLE_MARGIN;

      // 4辺にスナップ候補を生成
      const edges: Array<{ pos: [number, number, number]; rot: number; label: string }> = [
        { pos: [existing.position[0], 0, existing.position[2] - tableHalfD], rot: 0, label: '手前' },
        { pos: [existing.position[0], 0, existing.position[2] + tableHalfD], rot: Math.PI, label: '奥' },
        { pos: [existing.position[0] - tableHalfW, 0, existing.position[2]], rot: Math.PI / 2, label: '左' },
        { pos: [existing.position[0] + tableHalfW, 0, existing.position[2]], rot: -Math.PI / 2, label: '右' },
      ];

      for (const edge of edges) {
        suggestions.push({
          targetPosition: edge.pos,
          targetRotation: edge.rot,
          reason: `${existing.name}の${edge.label}にスナップ`,
        });
      }
    }

    // ルール2: スツール → カウンターの前面に等間隔スナップ
    if (newItem.type === 'stool' && existing.type === 'counter') {
      const counterFrontZ = existing.position[2] + existing.scale[2] / 2 + newItem.scale[2] / 2 + CHAIR_TABLE_MARGIN;
      const counterWidth = existing.scale[0];
      const seatCount = Math.floor(counterWidth / STOOL_SPACING);

      for (let i = 0; i < seatCount; i++) {
        const offsetX = (i - (seatCount - 1) / 2) * STOOL_SPACING;
        suggestions.push({
          targetPosition: [existing.position[0] + offsetX, 0, counterFrontZ],
          targetRotation: Math.PI,
          reason: `${existing.name}の前に等間隔配置 (${i + 1}/${seatCount})`,
        });
      }
    }

    // ルール3: ペンダントライト → テーブル中心の上方にスナップ
    if (newItem.type === 'pendant_light' && isTableType(existing.type)) {
      suggestions.push({
        targetPosition: [existing.position[0], PENDANT_HEIGHT, existing.position[2]],
        targetRotation: 0,
        reason: `${existing.name}の真上にスナップ (高さ${PENDANT_HEIGHT}m)`,
      });
    }

    // ルール4: モニター → デスクの中央奥にスナップ
    if (newItem.type === 'tv_monitor' && isDeskType(existing.type)) {
      const deskBackZ = existing.position[2] - existing.scale[2] / 2 + MONITOR_DESK_OFFSET;
      const deskTopY = existing.scale[1]; // デスクの高さ

      suggestions.push({
        targetPosition: [existing.position[0], deskTopY, deskBackZ],
        targetRotation: 0,
        reason: `${existing.name}の中央奥に設置`,
      });
    }
  }

  // 距離の近い順にソート
  suggestions.sort((a, b) => {
    const distA = distanceXZ(a.targetPosition, newItem.position);
    const distB = distanceXZ(b.targetPosition, newItem.position);
    return distA - distB;
  });

  return suggestions;
}

/**
 * テーブルの周囲に椅子を等間隔に配置する。
 *
 * @param tablePos テーブルの中心位置 [x, y, z]
 * @param tableSize テーブルのサイズ [width, height, depth]
 * @param chairCount 配置する椅子の数
 * @returns 椅子のFurnitureItem配列
 */
export function applyTableChairSet(
  tablePos: [number, number, number],
  tableSize: [number, number, number],
  chairCount: number,
): FurnitureItem[] {
  const chairs: FurnitureItem[] = [];

  // テーブルの半径（楕円近似でXとZの平均）
  const radiusX = tableSize[0] / 2 + 0.35 + CHAIR_TABLE_MARGIN;
  const radiusZ = tableSize[2] / 2 + 0.35 + CHAIR_TABLE_MARGIN;

  for (let i = 0; i < chairCount; i++) {
    // 等角度で配置（最初の椅子は手前中央から）
    const angle = (i / chairCount) * Math.PI * 2 - Math.PI / 2;

    const x = tablePos[0] + radiusX * Math.cos(angle);
    const z = tablePos[2] + radiusZ * Math.sin(angle);

    // 椅子はテーブル中心を向く
    const facingAngle = Math.atan2(
      tablePos[0] - x,
      tablePos[2] - z,
    );

    const chairId = `chair_set_${Date.now()}_${i}`;

    chairs.push({
      id: chairId,
      type: 'chair',
      name: `椅子 ${i + 1}`,
      position: [x, 0, z],
      rotation: [0, facingAngle, 0],
      scale: [0.45, 0.85, 0.45],
      color: '#654321',
      material: 'wood',
    });
  }

  return chairs;
}
