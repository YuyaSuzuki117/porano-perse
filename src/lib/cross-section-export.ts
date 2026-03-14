/**
 * 断面図エクスポート — 指定位置での断面図をCanvas 2D APIで描画しPNGとして出力
 *
 * 建築図面スタイル（細い黒線、薄い塗りつぶし）で
 * 床線・天井線・壁輪郭・家具シルエット・寸法注釈を描画する。
 */

import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem, FurnitureType } from '@/types/scene';
import { FURNITURE_CATALOG } from '@/data/furniture';

// --- 型定義 ---

export interface CrossSectionParams {
  walls: WallSegment[];
  furniture: FurnitureItem[];
  ceilingHeight: number;
  /** 断面位置（メートル） */
  sectionPosition: number;
  /** 断面軸: 'x'=X軸に垂直（左右方向の断面）, 'z'=Z軸に垂直（前後方向の断面） */
  sectionAxis: 'x' | 'z';
  /** 出力画像幅（ピクセル） */
  width?: number;
  /** 出力画像高さ（ピクセル） */
  height?: number;
}

/** 断面図上の矩形要素 */
interface SectionRect {
  /** 断面の横軸上の位置（メートル） */
  hPos: number;
  /** 底辺の高さ（メートル） */
  bottom: number;
  /** 幅（メートル） */
  width: number;
  /** 高さ（メートル） */
  height: number;
  /** 表示名 */
  label: string;
  /** 要素タイプ */
  type: 'wall' | 'furniture';
  /** 塗りつぶし色 */
  fillColor: string;
}

// --- 定数 ---

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 600;
const MARGIN = 60; // マージン（ピクセル @ 1x解像度）
const SCALE_BAR_HEIGHT = 20;
const ANNOTATION_FONT_SIZE = 11;
const LABEL_FONT_SIZE = 9;

/** 家具タイプ別の代表的な高さ（メートル） */
const FURNITURE_HEIGHTS: Partial<Record<FurnitureType, number>> = {
  counter: 1.1,
  table_square: 0.75,
  table_round: 0.75,
  chair: 0.85,
  stool: 0.7,
  sofa: 0.8,
  shelf: 1.8,
  pendant_light: 0.3,
  plant: 1.2,
  partition: 1.5,
  register: 1.0,
  sink: 0.85,
  fridge: 1.8,
  display_case: 1.3,
  bench: 0.45,
  mirror: 1.0,
  reception_desk: 1.1,
  tv_monitor: 0.6,
  washing_machine: 0.85,
  coat_rack: 1.7,
  air_conditioner: 0.3,
  desk: 0.72,
  bookcase: 1.8,
  kitchen_island: 0.9,
  bar_table: 1.05,
  wardrobe: 2.0,
  shoe_rack: 0.8,
  umbrella_stand: 0.6,
  cash_register: 0.3,
  menu_board: 0.6,
  flower_pot: 0.4,
  ceiling_fan: 0.3,
  rug: 0.02,
  curtain: 2.2,
  clock: 0.3,
  trash_can: 0.6,
};

/** 天井取付家具（Y位置を天井から計算） */
const CEILING_MOUNTED: Set<FurnitureType> = new Set([
  'pendant_light',
  'ceiling_fan',
  'air_conditioner',
]);

// --- メイン関数 ---

/**
 * 断面図をPNG dataURLとして生成
 * 2x解像度で描画し、クリスプな出力を実現
 */
export async function generateCrossSectionPNG(params: CrossSectionParams): Promise<string> {
  const {
    walls,
    furniture,
    ceilingHeight,
    sectionPosition,
    sectionAxis,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  } = params;

  const scale = 2; // Retina対応の2倍描画
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2Dコンテキストを取得できませんでした');

  ctx.scale(scale, scale);

  // --- 部屋の境界計算 ---
  const roomBounds = computeRoomBounds(walls);
  const horizontalAxis = sectionAxis === 'x' ? 'z' : 'x'; // 断面の横軸
  const hMin = horizontalAxis === 'x' ? roomBounds.minX : roomBounds.minZ;
  const hMax = horizontalAxis === 'x' ? roomBounds.maxX : roomBounds.maxZ;
  const roomWidth = hMax - hMin;
  const roomHeightM = ceilingHeight;

  // --- 描画エリア計算 ---
  const drawWidth = width - MARGIN * 2;
  const drawHeight = height - MARGIN * 2 - SCALE_BAR_HEIGHT;
  const scaleH = drawWidth / (roomWidth > 0 ? roomWidth : 1);
  const scaleV = drawHeight / (roomHeightM > 0 ? roomHeightM : 1);
  const drawScale = Math.min(scaleH, scaleV) * 0.85; // 少し余裕を持たせる
  const offsetX = MARGIN + (drawWidth - roomWidth * drawScale) / 2;
  const floorY = MARGIN + drawHeight - (drawHeight - roomHeightM * drawScale) / 2;

  // メートル→ピクセル変換
  const toPixelX = (m: number) => offsetX + (m - hMin) * drawScale;
  const toPixelY = (m: number) => floorY - m * drawScale;

  // --- 背景 ---
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // --- 断面と交差する要素を収集 ---
  const sectionElements = collectSectionElements(
    walls,
    furniture,
    ceilingHeight,
    sectionPosition,
    sectionAxis
  );

  // --- 部屋輪郭（床・天井・壁） ---
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 1.5;

  // 床線
  ctx.beginPath();
  ctx.moveTo(toPixelX(hMin), toPixelY(0));
  ctx.lineTo(toPixelX(hMax), toPixelY(0));
  ctx.stroke();

  // 天井線
  ctx.beginPath();
  ctx.setLineDash([6, 3]);
  ctx.moveTo(toPixelX(hMin), toPixelY(ceilingHeight));
  ctx.lineTo(toPixelX(hMax), toPixelY(ceilingHeight));
  ctx.stroke();
  ctx.setLineDash([]);

  // 壁（左右）
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(toPixelX(hMin), toPixelY(0));
  ctx.lineTo(toPixelX(hMin), toPixelY(ceilingHeight));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toPixelX(hMax), toPixelY(0));
  ctx.lineTo(toPixelX(hMax), toPixelY(ceilingHeight));
  ctx.stroke();

  // --- 壁断面のハッチング ---
  for (const el of sectionElements.filter((e) => e.type === 'wall')) {
    const x1 = toPixelX(el.hPos);
    const x2 = toPixelX(el.hPos + el.width);
    const y1 = toPixelY(el.bottom + el.height);
    const y2 = toPixelY(el.bottom);

    // 薄い塗りつぶし
    ctx.fillStyle = el.fillColor;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // ハッチング（斜線）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.clip();
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 0.5;
    const step = 5;
    for (let i = -Math.abs(y2 - y1); i < Math.abs(x2 - x1) + Math.abs(y2 - y1); i += step) {
      ctx.beginPath();
      ctx.moveTo(x1 + i, y1);
      ctx.lineTo(x1 + i - Math.abs(y2 - y1), y2);
      ctx.stroke();
    }
    ctx.restore();

    // 輪郭線
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  // --- 家具シルエット ---
  for (const el of sectionElements.filter((e) => e.type === 'furniture')) {
    const x1 = toPixelX(el.hPos);
    const x2 = toPixelX(el.hPos + el.width);
    const y1 = toPixelY(el.bottom + el.height);
    const y2 = toPixelY(el.bottom);

    // 塗りつぶし
    ctx.fillStyle = el.fillColor;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // 輪郭線
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    // ラベル
    ctx.fillStyle = '#666666';
    ctx.font = `${LABEL_FONT_SIZE}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(el.label, (x1 + x2) / 2, y1 - 3);
  }

  // --- 寸法注釈 ---
  ctx.fillStyle = '#333333';
  ctx.font = `${ANNOTATION_FONT_SIZE}px sans-serif`;

  // 部屋高さ（左側）
  drawDimension(ctx, toPixelX(hMin) - 25, toPixelY(0), toPixelX(hMin) - 25, toPixelY(ceilingHeight), `${ceilingHeight.toFixed(1)}m`);

  // 部屋幅（下側）
  drawDimension(ctx, toPixelX(hMin), toPixelY(0) + 20, toPixelX(hMax), toPixelY(0) + 20, `${roomWidth.toFixed(1)}m`, true);

  // 家具高さ注釈（主要な家具のみ）
  const majorFurniture = sectionElements.filter((e) => e.type === 'furniture' && e.height > 0.5);
  for (const el of majorFurniture.slice(0, 4)) {
    const xCenter = toPixelX(el.hPos + el.width / 2);
    drawDimension(
      ctx,
      xCenter + 5,
      toPixelY(el.bottom),
      xCenter + 5,
      toPixelY(el.bottom + el.height),
      `${el.height.toFixed(2)}m`
    );
  }

  // --- 断面位置表示 ---
  ctx.fillStyle = '#999999';
  ctx.font = `${ANNOTATION_FONT_SIZE}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(
    `Section @ ${sectionAxis.toUpperCase()} = ${sectionPosition.toFixed(2)}m`,
    MARGIN,
    height - 10
  );

  // --- スケールバー ---
  drawScaleBar(ctx, width, height, drawScale);

  return canvas.toDataURL('image/png');
}

// --- 内部ユーティリティ ---

function computeRoomBounds(walls: WallSegment[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  if (walls.length === 0) return { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minZ = Math.min(minZ, w.start.y, w.end.y);
    maxZ = Math.max(maxZ, w.start.y, w.end.y);
  }
  return { minX, maxX, minZ, maxZ };
}

/** 断面と交差する壁・家具要素を収集 */
function collectSectionElements(
  walls: WallSegment[],
  furniture: FurnitureItem[],
  ceilingHeight: number,
  sectionPos: number,
  sectionAxis: 'x' | 'z'
): SectionRect[] {
  const elements: SectionRect[] = [];
  const tolerance = 0.15; // 断面との交差判定のマージン

  // 壁の交差チェック
  for (const wall of walls) {
    // 2D座標系: wall.start/end は (x, y) で、y → 3D z
    const wStart = sectionAxis === 'x'
      ? { h: wall.start.y, v: wall.start.x }
      : { h: wall.start.x, v: wall.start.y };
    const wEnd = sectionAxis === 'x'
      ? { h: wall.end.y, v: wall.end.x }
      : { h: wall.end.x, v: wall.end.y };

    // 断面と壁が交差するか
    const vMin = Math.min(wStart.v, wEnd.v) - wall.thickness / 2;
    const vMax = Math.max(wStart.v, wEnd.v) + wall.thickness / 2;

    if (sectionPos >= vMin - tolerance && sectionPos <= vMax + tolerance) {
      const hMin = Math.min(wStart.h, wEnd.h);
      const hMax = Math.max(wStart.h, wEnd.h);

      // 壁に沿った断面（長い壁）は細い断面として表示
      const isAlongWall = Math.abs(wStart.v - wEnd.v) < 0.01;
      const wallWidth = isAlongWall ? (hMax - hMin) : wall.thickness;
      const wallHPos = isAlongWall ? hMin : (hMin + hMax) / 2 - wall.thickness / 2;

      elements.push({
        hPos: wallHPos,
        bottom: 0,
        width: wallWidth,
        height: wall.height || ceilingHeight,
        label: '',
        type: 'wall',
        fillColor: 'rgba(180, 180, 180, 0.3)',
      });
    }
  }

  // 家具の交差チェック
  for (const item of furniture) {
    const catalogItem = FURNITURE_CATALOG.find((c) => c.type === item.type);
    const itemScale = item.scale;
    // 家具の位置（3D座標: [x, y, z]）
    const itemPos = item.position;

    // 断面軸方向のサイズと位置
    const depthAxis = sectionAxis === 'x' ? 0 : 2; // x断面ならx方向のサイズ、z断面ならz方向
    const horizAxis = sectionAxis === 'x' ? 2 : 0; // 断面図の横軸に使う方向

    const itemDepthSize = itemScale[depthAxis];
    const itemDepthPos = itemPos[depthAxis];

    // 断面との交差判定
    if (
      sectionPos >= itemDepthPos - itemDepthSize / 2 - tolerance &&
      sectionPos <= itemDepthPos + itemDepthSize / 2 + tolerance
    ) {
      const itemHPos = itemPos[horizAxis] - itemScale[horizAxis] / 2;
      const itemWidth = itemScale[horizAxis];
      const furnitureHeight = FURNITURE_HEIGHTS[item.type] ?? itemScale[1];
      const isCeiling = CEILING_MOUNTED.has(item.type);

      elements.push({
        hPos: itemHPos,
        bottom: isCeiling ? ceilingHeight - furnitureHeight - 0.1 : 0,
        width: itemWidth,
        height: furnitureHeight,
        label: catalogItem?.name ?? item.name,
        type: 'furniture',
        fillColor: 'rgba(100, 150, 200, 0.2)',
      });
    }
  }

  return elements;
}

/** 寸法線を描画 */
function drawDimension(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  label: string,
  horizontal = false
): void {
  ctx.save();
  ctx.strokeStyle = '#666666';
  ctx.fillStyle = '#333333';
  ctx.lineWidth = 0.7;
  ctx.font = `${ANNOTATION_FONT_SIZE}px sans-serif`;

  // 線分
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // 端点マーカー
  const markerSize = 3;
  if (horizontal) {
    // 横方向の寸法線
    ctx.beginPath();
    ctx.moveTo(x1, y1 - markerSize);
    ctx.lineTo(x1, y1 + markerSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2 - markerSize);
    ctx.lineTo(x2, y2 + markerSize);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillText(label, (x1 + x2) / 2, y1 + ANNOTATION_FONT_SIZE + 3);
  } else {
    // 縦方向の寸法線
    ctx.beginPath();
    ctx.moveTo(x1 - markerSize, y1);
    ctx.lineTo(x1 + markerSize, y1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2 - markerSize, y2);
    ctx.lineTo(x2 + markerSize, y2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(x1 - 10, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/** スケールバーを描画 */
function drawScaleBar(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  pxPerMeter: number
): void {
  // 1メートルのスケールバー
  const barLengthPx = pxPerMeter;
  const barY = canvasHeight - 25;
  const barX = canvasWidth - MARGIN - barLengthPx;

  ctx.save();
  ctx.strokeStyle = '#333333';
  ctx.fillStyle = '#333333';
  ctx.lineWidth = 1.5;

  // バー本体
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barLengthPx, barY);
  ctx.stroke();

  // 端点
  ctx.beginPath();
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY + 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(barX + barLengthPx, barY - 4);
  ctx.lineTo(barX + barLengthPx, barY + 4);
  ctx.stroke();

  // ラベル
  ctx.font = `${LABEL_FONT_SIZE}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('1m', barX + barLengthPx / 2, barY - 6);

  ctx.restore();
}
