/**
 * 補正キャンバス 描画レイヤー関数群
 * CorrectionCanvas.tsx から抽出した描画ロジック
 */

import type { BlueprintJson, LayerVisibility, PdfRenderInfo } from '@/types/blueprint';
import { parseScale, mmToCanvas, canvasToMm } from '@/lib/blueprint-geometry';
import { theme, RULER_SIZE, type Theme } from './theme';

// --- ビューステート型 ---
export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  effectiveDpi: number;
  effectivePageHeightPx: number;
  canvasW: number;
  canvasH: number;
}

// --- 座標変換ヘルパー (描画用) ---
function toCanvas(
  x_mm: number,
  y_mm: number,
  blueprint: BlueprintJson,
  vs: ViewState
): { cx: number; cy: number } {
  const scale = parseScale(blueprint.scale_detected);
  return mmToCanvas(x_mm, y_mm, scale, vs.effectiveDpi, vs.effectivePageHeightPx, vs.zoom, vs.panX, vs.panY);
}

function toMm(
  cx: number,
  cy: number,
  blueprint: BlueprintJson,
  vs: ViewState
): { x_mm: number; y_mm: number } {
  const scale = parseScale(blueprint.scale_detected);
  return canvasToMm(cx, cy, scale, vs.effectiveDpi, vs.effectivePageHeightPx, vs.zoom, vs.panX, vs.panY);
}

// ============================================================
// Layer 0: PDF背景
// ============================================================
export function drawPdfBackground(
  ctx: CanvasRenderingContext2D,
  pdfImage: HTMLImageElement | null,
  pdfInfo: PdfRenderInfo | null,
  vs: ViewState,
  layers: LayerVisibility,
  pdfOpacity: number,
): void {
  if (!layers.pdf || !pdfImage || !pdfInfo) return;
  ctx.globalAlpha = pdfOpacity;
  ctx.drawImage(pdfImage, vs.panX, vs.panY, pdfInfo.pageWidthPx * vs.zoom, pdfInfo.pageHeightPx * vs.zoom);
  ctx.globalAlpha = 1;
}

// ============================================================
// Layer 1: グリッド
// ============================================================
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  layers: LayerVisibility,
  gridVisible: boolean,
  t: Theme = theme,
): void {
  if (!layers.grid || !gridVisible) return;

  // ズームに応じてグリッド密度を自動調整
  let gridMm = 1000;
  if (vs.zoom > 0.4) gridMm = 100;
  if (vs.zoom > 2) gridMm = 10;

  const scale = parseScale(blueprint.scale_detected);
  const mmPerPx = (25.4 / vs.effectiveDpi) * scale;
  const gridPx = (gridMm / mmPerPx) * vs.zoom;

  if (gridPx <= 4) return;

  const startMmXY = toMm(0, 0, blueprint, vs);
  const endMmXY = toMm(vs.canvasW, vs.canvasH, blueprint, vs);

  const gStartX = Math.floor(startMmXY.x_mm / gridMm) * gridMm;
  const gEndX = Math.ceil(endMmXY.x_mm / gridMm) * gridMm;
  const gStartY = Math.floor(endMmXY.y_mm / gridMm) * gridMm;
  const gEndY = Math.ceil(startMmXY.y_mm / gridMm) * gridMm;

  for (let x = gStartX; x <= gEndX; x += gridMm) {
    const { cx } = toCanvas(x, 0, blueprint, vs);
    const isMajor = x % (gridMm * 10) === 0;
    ctx.strokeStyle = isMajor ? t.gridMajor : t.gridMinor;
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, vs.canvasH);
    ctx.stroke();
  }
  for (let y = gStartY; y <= gEndY; y += gridMm) {
    const { cy } = toCanvas(0, y, blueprint, vs);
    const isMajor = y % (gridMm * 10) === 0;
    ctx.strokeStyle = isMajor ? t.gridMajor : t.gridMinor;
    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(vs.canvasW, cy);
    ctx.stroke();
  }
}

// ============================================================
// Layer 2: 部屋ポリゴン
// ============================================================
export function drawRooms(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  layers: LayerVisibility,
  selectedRoomIdx: number | null,
  hoveredRoomIdx: number | null,
  t: Theme = theme,
): void {
  if (!layers.rooms) return;

  for (let i = 0; i < blueprint.rooms.length; i++) {
    const room = blueprint.rooms[i];
    if (!room.polygon_mm || room.polygon_mm.length < 3) continue;
    if (!room.center_mm || room.center_mm.length < 2) continue;

    const confidence = room.confidence;
    const isLowConfidence = room.name === '不明' || room.name === '' || (confidence !== undefined && confidence < 0.5);
    const isMediumConfidence = !isLowConfidence && confidence !== undefined && confidence < 0.8;
    const isSelected = selectedRoomIdx === i;
    const isHovered = hoveredRoomIdx === i && !isSelected;

    ctx.beginPath();
    const first = toCanvas(room.polygon_mm[0][0], room.polygon_mm[0][1], blueprint, vs);
    ctx.moveTo(first.cx, first.cy);
    for (let j = 1; j < room.polygon_mm.length; j++) {
      const p = toCanvas(room.polygon_mm[j][0], room.polygon_mm[j][1], blueprint, vs);
      ctx.lineTo(p.cx, p.cy);
    }
    ctx.closePath();

    // 塗り
    if (isLowConfidence) {
      ctx.fillStyle = isHovered ? t.room.fillLowConfHover : t.room.fillLowConf;
    } else if (isMediumConfidence) {
      ctx.fillStyle = isHovered ? t.room.fillMedConfHover : t.room.fillMedConf;
    } else {
      ctx.fillStyle = isHovered ? t.room.fillNormalHover : t.room.fillNormal;
    }
    ctx.fill();

    // 枠線
    ctx.strokeStyle = isLowConfidence ? t.room.strokeLowConf : isMediumConfidence ? t.room.strokeMedConf : t.room.strokeNormal;
    ctx.lineWidth = isSelected ? 2.5 : isHovered ? 2 : 1;
    ctx.stroke();
  }
}

// ============================================================
// Layer 3: 壁線
// ============================================================
export function drawWalls(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  layers: LayerVisibility,
  selectedWallIdx: number | null,
  t: Theme = theme,
): void {
  if (!layers.walls) return;

  for (let i = 0; i < blueprint.walls.length; i++) {
    const wall = blueprint.walls[i];
    const start = toCanvas(wall.start_x_mm, wall.start_y_mm, blueprint, vs);
    const end = toCanvas(wall.end_x_mm, wall.end_y_mm, blueprint, vs);
    const isWallSelected = selectedWallIdx === i;

    ctx.beginPath();
    ctx.moveTo(start.cx, start.cy);
    ctx.lineTo(end.cx, end.cy);
    ctx.strokeStyle = isWallSelected ? t.wall.strokeSelected : t.wall.stroke;
    ctx.lineWidth = isWallSelected ? 3 : 1.5;
    ctx.stroke();

    // 壁選択時にエンドポイント表示
    if (isWallSelected) {
      for (const pt of [start, end]) {
        ctx.beginPath();
        ctx.arc(pt.cx, pt.cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = t.wall.endpointFill;
        ctx.fill();
        ctx.strokeStyle = t.wall.endpointStroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }
}

// ============================================================
// Layer 3.5: 寸法線
// ============================================================
export function drawDimensions(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  layers: LayerVisibility,
  t: Theme = theme,
): void {
  if (!layers.dimensions || vs.zoom <= 0.3) return;

  ctx.font = `${Math.max(8, 9 * vs.zoom)}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (const wall of blueprint.walls) {
    const start = toCanvas(wall.start_x_mm, wall.start_y_mm, blueprint, vs);
    const end = toCanvas(wall.end_x_mm, wall.end_y_mm, blueprint, vs);
    const midX = (start.cx + end.cx) / 2;
    const midY = (start.cy + end.cy) / 2;
    const dx = wall.end_x_mm - wall.start_x_mm;
    const dy = wall.end_y_mm - wall.start_y_mm;
    const lengthMm = Math.round(Math.sqrt(dx * dx + dy * dy));
    if (lengthMm < 200) continue;

    const label = `${lengthMm}`;
    const metrics = ctx.measureText(label);
    ctx.fillStyle = t.dimension.bgFill;
    ctx.fillRect(midX - metrics.width / 2 - 3, midY - 11, metrics.width + 6, 13);
    ctx.fillStyle = t.dimension.textFill;
    ctx.fillText(label, midX, midY);
  }
}

// ============================================================
// Layer 4: 什器
// ============================================================
export function drawFixtures(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  layers: LayerVisibility,
  selectedFixtureIdx: number | null,
  t: Theme = theme,
): void {
  if (!layers.fixtures) return;

  for (let i = 0; i < blueprint.fixtures.length; i++) {
    const fix = blueprint.fixtures[i];
    const center = toCanvas(fix.x_mm, fix.y_mm, blueprint, vs);
    const corner1 = toCanvas(fix.x_mm - fix.width_mm / 2, fix.y_mm - fix.depth_mm / 2, blueprint, vs);
    const corner2 = toCanvas(fix.x_mm + fix.width_mm / 2, fix.y_mm + fix.depth_mm / 2, blueprint, vs);
    const w = Math.abs(corner2.cx - corner1.cx);
    const h = Math.abs(corner2.cy - corner1.cy);

    ctx.save();
    ctx.translate(center.cx, center.cy);
    ctx.rotate((-fix.rotation_deg * Math.PI) / 180);
    ctx.strokeStyle = selectedFixtureIdx === i ? t.fixture.strokeSelected : t.fixture.strokeNormal;
    ctx.lineWidth = selectedFixtureIdx === i ? 2 : 1;
    ctx.setLineDash(selectedFixtureIdx === i ? [] : [3, 2]);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    ctx.restore();
  }
}

// ============================================================
// Layer 5: 室名ラベル
// ============================================================
export function drawLabels(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  layers: LayerVisibility,
  t: Theme = theme,
): void {
  if (!layers.labels) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const room of blueprint.rooms) {
    if (!room.center_mm || isNaN(room.center_mm[0])) continue;
    const c = toCanvas(room.center_mm[0], room.center_mm[1], blueprint, vs);
    const isUnknown = room.name === '不明' || room.name === '';

    ctx.font = `${Math.max(10, 12 * vs.zoom)}px sans-serif`;
    ctx.fillStyle = isUnknown ? t.label.nameUnknown : t.label.nameNormal;
    ctx.fillText(room.name || '不明', c.cx, c.cy);

    ctx.font = `${Math.max(8, 9 * vs.zoom)}px monospace`;
    ctx.fillStyle = t.label.areaNormal;
    ctx.fillText(`${room.area_m2}m2`, c.cx, c.cy + Math.max(11, 14 * vs.zoom));
  }
}

// ============================================================
// Layer 6: 頂点ハンドル (選択中の部屋のみ)
// ============================================================
export function drawVertexHandles(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  selectedRoomIdx: number | null,
  selectedVertexIdx: number | null,
  t: Theme = theme,
): void {
  if (selectedRoomIdx === null || !blueprint.rooms[selectedRoomIdx]) return;

  const room = blueprint.rooms[selectedRoomIdx];
  for (let v = 0; v < room.polygon_mm.length; v++) {
    if (isNaN(room.polygon_mm[v][0]) || isNaN(room.polygon_mm[v][1])) continue;
    const p = toCanvas(room.polygon_mm[v][0], room.polygon_mm[v][1], blueprint, vs);
    const isActiveVertex = selectedVertexIdx === v;

    // 外枠
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, isActiveVertex ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = isActiveVertex ? t.vertex.fillActive : t.vertex.fillNormal;
    ctx.fill();
    ctx.strokeStyle = t.vertex.outerStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 内枠
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, isActiveVertex ? 3 : 2, 0, Math.PI * 2);
    ctx.fillStyle = t.vertex.innerFill;
    ctx.fill();
  }
}

// ============================================================
// Layer 7: 選択ハイライト
// ============================================================
export function drawHighlight(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  selectedRoomIdx: number | null,
  t: Theme = theme,
): void {
  if (selectedRoomIdx === null || !blueprint.rooms[selectedRoomIdx]) return;

  const room = blueprint.rooms[selectedRoomIdx];
  if (room.polygon_mm.length < 3) return;

  ctx.beginPath();
  const f = toCanvas(room.polygon_mm[0][0], room.polygon_mm[0][1], blueprint, vs);
  ctx.moveTo(f.cx, f.cy);
  for (let j = 1; j < room.polygon_mm.length; j++) {
    const p = toCanvas(room.polygon_mm[j][0], room.polygon_mm[j][1], blueprint, vs);
    ctx.lineTo(p.cx, p.cy);
  }
  ctx.closePath();
  ctx.strokeStyle = t.highlight.stroke;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ============================================================
// Layer 8: addRoom 描画中ポリゴン
// ============================================================
export function drawAddRoomPreview(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  activeTool: string,
  newRoomPoints: [number, number][],
  currentMouseMm: { x_mm: number; y_mm: number } | null,
  t: Theme = theme,
): void {
  if (activeTool !== 'addRoom' || newRoomPoints.length === 0) return;

  const pts = newRoomPoints;
  const p0 = toCanvas(pts[0][0], pts[0][1], blueprint, vs);

  ctx.beginPath();
  ctx.moveTo(p0.cx, p0.cy);
  for (let i = 1; i < pts.length; i++) {
    const p = toCanvas(pts[i][0], pts[i][1], blueprint, vs);
    ctx.lineTo(p.cx, p.cy);
  }
  ctx.strokeStyle = t.addRoom.stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (currentMouseMm) {
    const lastPt = toCanvas(pts[pts.length - 1][0], pts[pts.length - 1][1], blueprint, vs);
    const mouseC = toCanvas(currentMouseMm.x_mm, currentMouseMm.y_mm, blueprint, vs);
    ctx.beginPath();
    ctx.moveTo(lastPt.cx, lastPt.cy);
    ctx.lineTo(mouseC.cx, mouseC.cy);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = t.addRoom.stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(mouseC.cx, mouseC.cy);
      ctx.lineTo(p0.cx, p0.cy);
      ctx.strokeStyle = t.addRoom.closingStroke;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = '11px monospace';
    ctx.fillStyle = t.addRoom.textFill;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${pts.length}pt (2x click)`, mouseC.cx + 14, mouseC.cy - 6);
  }

  for (let i = 0; i < pts.length; i++) {
    const p = toCanvas(pts[i][0], pts[i][1], blueprint, vs);
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? t.addRoom.firstPointFill : t.addRoom.pointFill;
    ctx.fill();
    ctx.strokeStyle = t.addRoom.pointStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// ============================================================
// Layer 8.5: wallAdd 描画中
// ============================================================
export function drawWallAddPreview(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  activeTool: string,
  wallAddPoints: [number, number][],
  currentMouseMm: { x_mm: number; y_mm: number } | null,
  t: Theme = theme,
): void {
  if (activeTool !== 'wallAdd' || wallAddPoints.length === 0) return;

  const pts = wallAddPoints;
  const p0 = toCanvas(pts[0][0], pts[0][1], blueprint, vs);

  ctx.beginPath();
  ctx.arc(p0.cx, p0.cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = t.wallAdd.pointFill;
  ctx.fill();
  ctx.strokeStyle = t.wallAdd.pointStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (currentMouseMm) {
    const mouseC = toCanvas(currentMouseMm.x_mm, currentMouseMm.y_mm, blueprint, vs);
    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy);
    ctx.lineTo(mouseC.cx, mouseC.cy);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = t.wallAdd.lineStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);

    // 距離表示
    const dist = Math.round(Math.hypot(currentMouseMm.x_mm - pts[0][0], currentMouseMm.y_mm - pts[0][1]));
    ctx.font = '11px monospace';
    ctx.fillStyle = t.wallAdd.textFill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${dist}mm`, (p0.cx + mouseC.cx) / 2, (p0.cy + mouseC.cy) / 2 - 8);
  }
}

// ============================================================
// Layer 9: 測定線
// ============================================================
export function drawMeasureLine(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  measurePoints: [number, number][],
  currentMouseMm: { x_mm: number; y_mm: number } | null,
  t: Theme = theme,
): void {
  if (measurePoints.length === 0) return;

  // 計測点の描画
  for (let i = 0; i < measurePoints.length; i++) {
    const p = toCanvas(measurePoints[i][0], measurePoints[i][1], blueprint, vs);
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = t.measure.pointFill;
    ctx.fill();
    ctx.strokeStyle = t.measure.pointStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 2点間の線と距離表示
  if (measurePoints.length >= 2) {
    const p0 = toCanvas(measurePoints[0][0], measurePoints[0][1], blueprint, vs);
    const p1 = toCanvas(measurePoints[1][0], measurePoints[1][1], blueprint, vs);

    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy);
    ctx.lineTo(p1.cx, p1.cy);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = t.measure.lineStroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    const dist = Math.round(Math.hypot(measurePoints[1][0] - measurePoints[0][0], measurePoints[1][1] - measurePoints[0][1]));
    const midCx = (p0.cx + p1.cx) / 2;
    const midCy = (p0.cy + p1.cy) / 2;

    // 背景ボックス
    ctx.font = 'bold 12px monospace';
    const label = `${dist}mm`;
    const tm = ctx.measureText(label);
    ctx.fillStyle = t.measure.bgFill;
    ctx.fillRect(midCx - tm.width / 2 - 6, midCy - 18, tm.width + 12, 22);
    ctx.strokeStyle = t.measure.borderStroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(midCx - tm.width / 2 - 6, midCy - 18, tm.width + 12, 22);
    ctx.fillStyle = t.measure.textFill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midCx, midCy - 7);
  }

  // マウス位置への破線プレビュー (測定中 & 1点目のみ)
  if (measurePoints.length === 1 && currentMouseMm) {
    const p0 = toCanvas(measurePoints[0][0], measurePoints[0][1], blueprint, vs);
    const mouseC = toCanvas(currentMouseMm.x_mm, currentMouseMm.y_mm, blueprint, vs);
    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy);
    ctx.lineTo(mouseC.cx, mouseC.cy);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = t.measure.previewStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    const dist = Math.round(Math.hypot(
      currentMouseMm.x_mm - measurePoints[0][0],
      currentMouseMm.y_mm - measurePoints[0][1]
    ));
    ctx.font = '10px monospace';
    ctx.fillStyle = t.measure.previewText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${dist}mm`, (p0.cx + mouseC.cx) / 2, (p0.cy + mouseC.cy) / 2 - 4);
  }
}

// ============================================================
// Layer 10: スナップインジケータ
// ============================================================
export function drawSnapIndicator(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  snapIndicator: { x: number; y: number; type: string } | null,
  snapEnabled: boolean,
  t: Theme = theme,
): void {
  if (!snapIndicator || !snapEnabled) return;

  const { cx: sx, cy: sy } = toCanvas(snapIndicator.x, snapIndicator.y, blueprint, vs);

  if (snapIndicator.type === 'vertex') {
    // ダイヤモンド
    ctx.beginPath();
    ctx.moveTo(sx, sy - 8);
    ctx.lineTo(sx + 8, sy);
    ctx.lineTo(sx, sy + 8);
    ctx.lineTo(sx - 8, sy);
    ctx.closePath();
    ctx.strokeStyle = t.snap.vertexStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (snapIndicator.type === 'endpoint') {
    // 四角
    ctx.strokeStyle = t.snap.endpointStroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - 6, sy - 6, 12, 12);
  } else if (snapIndicator.type === 'midpoint') {
    // 三角
    ctx.beginPath();
    ctx.moveTo(sx, sy - 7);
    ctx.lineTo(sx + 7, sy + 5);
    ctx.lineTo(sx - 7, sy + 5);
    ctx.closePath();
    ctx.strokeStyle = t.snap.midpointStroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (snapIndicator.type === 'grid') {
    // 十字線
    ctx.strokeStyle = t.snap.gridStroke;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, vs.canvasH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(vs.canvasW, sy);
    ctx.stroke();
  }
}

// ============================================================
// Layer 11: ルーラー (上辺・左辺)
// ============================================================
export function drawRuler(
  ctx: CanvasRenderingContext2D,
  blueprint: BlueprintJson,
  vs: ViewState,
  mousePosMm: { x: number; y: number } | null,
  t: Theme = theme,
): void {
  // 上辺ルーラー背景
  ctx.fillStyle = t.ruler.bgFill;
  ctx.fillRect(RULER_SIZE, 0, vs.canvasW - RULER_SIZE, RULER_SIZE);
  // 左辺ルーラー背景
  ctx.fillRect(0, RULER_SIZE, RULER_SIZE, vs.canvasH - RULER_SIZE);
  // 角
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

  const scale = parseScale(blueprint.scale_detected);

  // ルーラー目盛りステップ
  let rulerStep = 1000;
  if (vs.zoom > 0.5) rulerStep = 500;
  if (vs.zoom > 1) rulerStep = 100;
  if (vs.zoom > 2.5) rulerStep = 50;

  // 上辺の目盛り
  ctx.font = '8px monospace';
  ctx.fillStyle = t.ruler.textFill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const leftMm = toMm(RULER_SIZE, 0, blueprint, vs);
  const rightMm = toMm(vs.canvasW, 0, blueprint, vs);
  const startXmm = Math.floor(leftMm.x_mm / rulerStep) * rulerStep;
  const endXmm = Math.ceil(rightMm.x_mm / rulerStep) * rulerStep;

  for (let xmm = startXmm; xmm <= endXmm; xmm += rulerStep) {
    const { cx } = toCanvas(xmm, 0, blueprint, vs);
    if (cx < RULER_SIZE || cx > vs.canvasW) continue;
    const isMajor = xmm % (rulerStep * 5) === 0;
    ctx.strokeStyle = isMajor ? t.ruler.tickMajor : t.ruler.tickMinor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, isMajor ? 0 : RULER_SIZE * 0.5);
    ctx.lineTo(cx, RULER_SIZE);
    ctx.stroke();
    if (isMajor) {
      ctx.fillStyle = t.ruler.textFill;
      ctx.fillText(String(xmm), cx, 1);
    }
  }

  // 左辺の目盛り
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const topMm = toMm(0, RULER_SIZE, blueprint, vs);
  const bottomMm = toMm(0, vs.canvasH, blueprint, vs);
  const startYmm = Math.floor(bottomMm.y_mm / rulerStep) * rulerStep;
  const endYmm = Math.ceil(topMm.y_mm / rulerStep) * rulerStep;

  for (let ymm = startYmm; ymm <= endYmm; ymm += rulerStep) {
    const { cy } = toCanvas(0, ymm, blueprint, vs);
    if (cy < RULER_SIZE || cy > vs.canvasH) continue;
    const isMajor = ymm % (rulerStep * 5) === 0;
    ctx.strokeStyle = isMajor ? t.ruler.tickMajor : t.ruler.tickMinor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(isMajor ? 0 : RULER_SIZE * 0.5, cy);
    ctx.lineTo(RULER_SIZE, cy);
    ctx.stroke();
    if (isMajor) {
      ctx.save();
      ctx.translate(9, cy);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = t.ruler.textFill;
      ctx.fillText(String(ymm), 0, 0);
      ctx.restore();
    }
  }

  // ルーラーのマウス位置マーカー
  if (mousePosMm) {
    const { cx: mCx, cy: mCy } = toCanvas(mousePosMm.x, mousePosMm.y, blueprint, vs);
    ctx.fillStyle = t.ruler.markerFill;
    // 上辺マーカー
    ctx.beginPath();
    ctx.moveTo(mCx - 3, RULER_SIZE);
    ctx.lineTo(mCx + 3, RULER_SIZE);
    ctx.lineTo(mCx, RULER_SIZE - 4);
    ctx.closePath();
    ctx.fill();
    // 左辺マーカー
    ctx.beginPath();
    ctx.moveTo(RULER_SIZE, mCy - 3);
    ctx.lineTo(RULER_SIZE, mCy + 3);
    ctx.lineTo(RULER_SIZE - 4, mCy);
    ctx.closePath();
    ctx.fill();
  }

  // ルーラー境界線
  ctx.strokeStyle = t.ruler.borderStroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RULER_SIZE, 0);
  ctx.lineTo(RULER_SIZE, vs.canvasH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, RULER_SIZE);
  ctx.lineTo(vs.canvasW, RULER_SIZE);
  ctx.stroke();
}
