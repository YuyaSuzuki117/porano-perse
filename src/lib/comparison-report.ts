import { jsPDF } from 'jspdf';
import type { FurnitureItem, StylePreset } from '@/types/scene';
import { STYLE_PRESETS } from '@/data/styles';
import { FURNITURE_CATALOG } from '@/data/furniture';

// ページサイズ定数 (A4縦)
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

// カラーパレット
const PRIMARY = { r: 37, g: 99, b: 235 };
const DARK = { r: 30, g: 30, b: 40 };
const GRAY = { r: 120, g: 120, b: 130 };
const LIGHT_BG = { r: 245, g: 247, b: 250 };

// 家具タイプ→日本語名マッピング
const FURNITURE_NAMES: Record<string, string> = {};
for (const item of FURNITURE_CATALOG) {
  FURNITURE_NAMES[item.type] = item.name;
}

// ────────────────────────────────────────────────
// 照明色温度の推定（スポットライト色から概算）
// ────────────────────────────────────────────────
function estimateColorTemperature(spotlightColor: string): string {
  const r = parseInt(spotlightColor.slice(1, 3), 16) || 0;
  const b = parseInt(spotlightColor.slice(5, 7), 16) || 0;
  // 赤みが強い→暖色(2700K〜3000K)、青みが強い→昼白色(5000K〜6500K)
  const ratio = r / Math.max(b, 1);
  if (ratio > 2.0) return '2700K（電球色）';
  if (ratio > 1.5) return '3000K（温白色）';
  if (ratio > 1.1) return '4000K（白色）';
  return '5000K（昼白色）';
}

// ────────────────────────────────────────────────
// 雰囲気キーワード推定
// ────────────────────────────────────────────────
function estimateAtmosphere(preset: StylePreset): string {
  const map: Record<StylePreset, string> = {
    japanese: '静寂・侘び寂び・落ち着き',
    modern: 'クリーン・洗練・先進的',
    cafe: '温もり・くつろぎ・親しみやすい',
    industrial: '無骨・クール・開放的',
    minimal: '余白・清潔・シンプル',
    luxury: '高級感・重厚・品格',
    scandinavian: '自然体・明るさ・やさしい',
    retro: 'ノスタルジア・遊び心・個性',
    medical: '清潔感・安心・プロフェッショナル',
  };
  return map[preset] ?? '-';
}

// ────────────────────────────────────────────────
// ヘルパー描画関数
// ────────────────────────────────────────────────

/** ヘッダーバー */
function drawHeader(doc: jsPDF, title: string): void {
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.rect(0, 0, PAGE_W, 12, 'F');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(title, MARGIN, 8);
  const dateStr = new Date().toLocaleDateString('ja-JP');
  doc.text(dateStr, PAGE_W - MARGIN, 8, { align: 'right' });
}

/** フッター */
function drawFooter(doc: jsPDF, pageNum: number, totalPages: number): void {
  doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
  doc.setFontSize(7);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`${pageNum} / ${totalPages}`, PAGE_W / 2, PAGE_H - 4, { align: 'center' });
  doc.text('Porano Perse', MARGIN, PAGE_H - 4);
}

/** セクション見出し */
function drawSectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.rect(MARGIN, y, 3, 8, 'F');
  doc.setFontSize(12);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(text, MARGIN + 6, y + 6);
  return y + 14;
}

// ────────────────────────────────────────────────
// 床材テクスチャの日本語名
// ────────────────────────────────────────────────
const FLOOR_TEXTURE_NAMES: Record<string, string> = {
  wood: '木目フローリング',
  tile: 'タイル',
  concrete: 'コンクリート',
  tatami: '畳',
  marble: '大理石',
  checkerboard: 'チェッカーボード',
  linoleum: 'リノリウム',
};

// ────────────────────────────────────────────────
// メインエクスポート関数
// ────────────────────────────────────────────────

/**
 * スタイル比較レポートPDFを生成
 *
 * @param leftImage - 左側スタイルの画像(data URL)
 * @param rightImage - 右側スタイルの画像(data URL)
 * @param leftStyle - 左側のスタイルプリセット名
 * @param rightStyle - 右側のスタイルプリセット名
 * @param furnitureList - 配置済み家具リスト
 * @param roomArea - 部屋の面積(平米)
 */
export async function generateComparisonReport(
  leftImage: string,
  rightImage: string,
  leftStyle: string,
  rightStyle: string,
  furnitureList: FurnitureItem[],
  roomArea: number,
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const totalPages = 3;
  const leftPreset = STYLE_PRESETS[leftStyle as StylePreset];
  const rightPreset = STYLE_PRESETS[rightStyle as StylePreset];

  // フォールバック（不明なスタイル名）
  const leftName = leftPreset?.nameJa ?? leftStyle;
  const rightName = rightPreset?.nameJa ?? rightStyle;

  // ════════════════════════════════════════════════
  // ページ1: タイトル + 画像比較
  // ════════════════════════════════════════════════
  drawHeader(doc, 'Style Comparison Report');

  // メインタイトル
  doc.setFontSize(22);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text('Style Comparison Report', PAGE_W / 2, 30, { align: 'center' });

  // サブタイトル
  doc.setFontSize(11);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`${leftName}  vs  ${rightName}`, PAGE_W / 2, 40, { align: 'center' });

  // 区切り線
  doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 45, PAGE_W - MARGIN, 45);

  // 左右画像を並べて配置
  const imgW = (CONTENT_W - 6) / 2;
  const imgH = imgW * 0.65;
  const imgY = 52;

  // 左スタイル画像
  try {
    doc.addImage(leftImage, 'JPEG', MARGIN, imgY, imgW, imgH);
  } catch {
    doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
    doc.rect(MARGIN, imgY, imgW, imgH, 'F');
  }
  // 左ラベル
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.roundedRect(MARGIN, imgY + imgH + 2, imgW, 8, 1, 1, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(leftName, MARGIN + imgW / 2, imgY + imgH + 7.5, { align: 'center' });

  // 右スタイル画像
  const rightX = MARGIN + imgW + 6;
  try {
    doc.addImage(rightImage, 'JPEG', rightX, imgY, imgW, imgH);
  } catch {
    doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
    doc.rect(rightX, imgY, imgW, imgH, 'F');
  }
  // 右ラベル
  doc.setFillColor(100, 100, 110);
  doc.roundedRect(rightX, imgY + imgH + 2, imgW, 8, 1, 1, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(rightName, rightX + imgW / 2, imgY + imgH + 7.5, { align: 'center' });

  // 部屋情報
  let infoY = imgY + imgH + 18;
  doc.setFontSize(9);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`Room Area: ${roomArea.toFixed(1)} m\u00B2`, MARGIN, infoY);
  doc.text(`Furniture: ${furnitureList.length} items`, PAGE_W - MARGIN, infoY, { align: 'right' });

  // VS マーク（中央）
  const vsY = imgY + imgH / 2;
  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.circle(PAGE_W / 2, vsY, 6, 'F');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('VS', PAGE_W / 2, vsY + 2, { align: 'center' });

  drawFooter(doc, 1, totalPages);

  // ════════════════════════════════════════════════
  // ページ2: 比較テーブル
  // ════════════════════════════════════════════════
  doc.addPage();
  drawHeader(doc, 'Detail Comparison');

  let tableY = drawSectionTitle(doc, 18, 'Detail Comparison');

  // テーブル列定義
  const col1X = MARGIN;           // 属性名
  const col2X = MARGIN + 50;      // 左スタイル値
  const col3X = MARGIN + 50 + (CONTENT_W - 50) / 2; // 右スタイル値
  const col1W = 50;
  const col2W = (CONTENT_W - 50) / 2;
  const col3W = col2W;

  // テーブルヘッダー
  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.rect(MARGIN, tableY, CONTENT_W, 9, 'F');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('Attribute', col1X + 3, tableY + 6);
  doc.text(leftName, col2X + col2W / 2, tableY + 6, { align: 'center' });
  doc.text(rightName, col3X + col3W / 2, tableY + 6, { align: 'center' });
  tableY += 9;

  // 比較行データを構築
  interface ComparisonRow {
    attribute: string;
    leftVal: string;
    rightVal: string;
    leftColor?: string;
    rightColor?: string;
  }

  const rows: ComparisonRow[] = [];

  if (leftPreset && rightPreset) {
    rows.push({
      attribute: 'Wall Color',
      leftVal: leftPreset.wallColor,
      rightVal: rightPreset.wallColor,
      leftColor: leftPreset.wallColor,
      rightColor: rightPreset.wallColor,
    });
    rows.push({
      attribute: 'Floor Material',
      leftVal: FLOOR_TEXTURE_NAMES[leftPreset.floorTexture] ?? leftPreset.floorTexture,
      rightVal: FLOOR_TEXTURE_NAMES[rightPreset.floorTexture] ?? rightPreset.floorTexture,
    });
    rows.push({
      attribute: 'Color Temperature',
      leftVal: estimateColorTemperature(leftPreset.spotlightColor),
      rightVal: estimateColorTemperature(rightPreset.spotlightColor),
    });
    rows.push({
      attribute: 'Furniture Material',
      leftVal: `${leftPreset.woodType} / ${leftPreset.metalFinish}`,
      rightVal: `${rightPreset.woodType} / ${rightPreset.metalFinish}`,
    });
    rows.push({
      attribute: 'Atmosphere',
      leftVal: estimateAtmosphere(leftStyle as StylePreset),
      rightVal: estimateAtmosphere(rightStyle as StylePreset),
    });
    rows.push({
      attribute: 'Ambient Intensity',
      leftVal: `${leftPreset.ambientIntensity.toFixed(2)}`,
      rightVal: `${rightPreset.ambientIntensity.toFixed(2)}`,
    });
    rows.push({
      attribute: 'Wood Type',
      leftVal: leftPreset.woodType,
      rightVal: rightPreset.woodType,
    });
    rows.push({
      attribute: 'Fabric Type',
      leftVal: leftPreset.fabricType,
      rightVal: rightPreset.fabricType,
    });
    rows.push({
      attribute: 'Furniture Roughness',
      leftVal: leftPreset.furnitureRoughness.toFixed(2),
      rightVal: rightPreset.furnitureRoughness.toFixed(2),
    });
  }

  // テーブル行を描画
  const rowHeight = 11;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const isEven = i % 2 === 0;

    if (isEven) {
      doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
      doc.rect(MARGIN, tableY, CONTENT_W, rowHeight, 'F');
    }

    // 属性名
    doc.setFontSize(8);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(row.attribute, col1X + 3, tableY + 7);

    // 左スタイル値（色見本がある場合は表示）
    if (row.leftColor) {
      const cr = parseInt(row.leftColor.slice(1, 3), 16) || 0;
      const cg = parseInt(row.leftColor.slice(3, 5), 16) || 0;
      const cb = parseInt(row.leftColor.slice(5, 7), 16) || 0;
      doc.setFillColor(cr, cg, cb);
      doc.rect(col2X + 3, tableY + 2.5, 5, 5, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(col2X + 3, tableY + 2.5, 5, 5, 'S');
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(row.leftVal, col2X + 11, tableY + 7);
    } else {
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(row.leftVal, col2X + 3, tableY + 7);
    }

    // 右スタイル値
    if (row.rightColor) {
      const cr = parseInt(row.rightColor.slice(1, 3), 16) || 0;
      const cg = parseInt(row.rightColor.slice(3, 5), 16) || 0;
      const cb = parseInt(row.rightColor.slice(5, 7), 16) || 0;
      doc.setFillColor(cr, cg, cb);
      doc.rect(col3X + 3, tableY + 2.5, 5, 5, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.rect(col3X + 3, tableY + 2.5, 5, 5, 'S');
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(row.rightVal, col3X + 11, tableY + 7);
    } else {
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text(row.rightVal, col3X + 3, tableY + 7);
    }

    tableY += rowHeight;
  }

  drawFooter(doc, 2, totalPages);

  // ════════════════════════════════════════════════
  // ページ3: 家具リスト + 概算コスト
  // ════════════════════════════════════════════════
  doc.addPage();
  drawHeader(doc, 'Furniture List');

  let furnY = drawSectionTitle(doc, 18, 'Furniture List & Cost Estimate');

  // テーブルヘッダー
  const fColWidths = [10, 50, 35, 30, 25, CONTENT_W - 150];
  const fColX: number[] = [MARGIN];
  for (let c = 1; c < fColWidths.length; c++) {
    fColX.push(fColX[c - 1] + fColWidths[c - 1]);
  }
  const fHeaders = ['No.', 'Name', 'Type', 'Material', 'Qty', 'Est. Cost'];

  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.rect(MARGIN, furnY, CONTENT_W, 8, 'F');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  fHeaders.forEach((h, i) => {
    doc.text(h, fColX[i] + 2, furnY + 5.5);
  });
  furnY += 8;

  // 家具をタイプ別にグルーピングしてカウント
  const furnitureGroups = new Map<string, { item: FurnitureItem; count: number }>();
  for (const f of furnitureList) {
    const key = `${f.type}_${f.material ?? 'default'}`;
    const existing = furnitureGroups.get(key);
    if (existing) {
      existing.count++;
    } else {
      furnitureGroups.set(key, { item: f, count: 1 });
    }
  }

  // 概算単価テーブル（家具タイプ別の参考価格・円）
  const ESTIMATED_UNIT_PRICES: Record<string, number> = {
    counter: 150000, table_square: 45000, table_round: 50000,
    chair: 15000, stool: 8000, sofa: 120000, shelf: 35000,
    pendant_light: 25000, plant: 5000, partition: 30000,
    register: 200000, sink: 80000, fridge: 150000,
    display_case: 90000, bench: 40000, mirror: 20000,
    reception_desk: 180000, tv_monitor: 60000, washing_machine: 100000,
    coat_rack: 12000, air_conditioner: 80000, desk: 50000,
    bookcase: 40000, kitchen_island: 200000, bar_table: 35000,
    wardrobe: 60000, shoe_rack: 15000, umbrella_stand: 5000,
    cash_register: 150000, menu_board: 10000, flower_pot: 3000,
    ceiling_fan: 30000, rug: 20000, curtain: 15000,
    clock: 8000, trash_can: 3000, custom: 50000,
  };

  let totalCost = 0;
  let rowIndex = 0;

  for (const [, { item, count }] of furnitureGroups) {
    if (furnY > PAGE_H - 25) break; // ページ溢れ防止

    const isEven = rowIndex % 2 === 0;
    if (isEven) {
      doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
      doc.rect(MARGIN, furnY, CONTENT_W, 8, 'F');
    }

    const unitPrice = ESTIMATED_UNIT_PRICES[item.type] ?? 30000;
    const lineCost = unitPrice * count;
    totalCost += lineCost;

    const displayName = FURNITURE_NAMES[item.type] ?? item.name;

    doc.setFontSize(7);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(String(rowIndex + 1), fColX[0] + 2, furnY + 5.5);
    doc.text(displayName, fColX[1] + 2, furnY + 5.5);
    doc.text(item.type, fColX[2] + 2, furnY + 5.5);
    doc.text(item.material ?? '-', fColX[3] + 2, furnY + 5.5);
    doc.text(String(count), fColX[4] + 2, furnY + 5.5);
    doc.text(`\u00A5${lineCost.toLocaleString()}`, fColX[5] + 2, furnY + 5.5);

    furnY += 8;
    rowIndex++;
  }

  // 合計行
  furnY += 4;
  doc.setDrawColor(DARK.r, DARK.g, DARK.b);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, furnY, PAGE_W - MARGIN, furnY);
  furnY += 6;

  doc.setFontSize(10);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text('Total Estimate:', MARGIN + 3, furnY);
  doc.setTextColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.text(`\u00A5${totalCost.toLocaleString()}`, PAGE_W - MARGIN, furnY, { align: 'right' });

  // 注記
  furnY += 10;
  doc.setFontSize(7);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text('* Cost estimates are reference values only. Actual prices may vary.', MARGIN, furnY);

  // 部屋面積あたりのコスト
  if (roomArea > 0) {
    furnY += 5;
    const costPerSqm = Math.round(totalCost / roomArea);
    doc.text(`Cost per m\u00B2: \u00A5${costPerSqm.toLocaleString()}`, MARGIN, furnY);
  }

  drawFooter(doc, 3, totalPages);

  // ════════════════════════════════════════════════
  // ダウンロード
  // ════════════════════════════════════════════════
  doc.save(`style_comparison_${leftStyle}_vs_${rightStyle}.pdf`);
}
