import { jsPDF } from 'jspdf';
import type { Annotation } from '@/types/scene';

// ページサイズ定数 (A4横)
const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;

// カラーパレット
const PRIMARY = { r: 37, g: 99, b: 235 };     // #2563EB
const DARK = { r: 30, g: 30, b: 40 };
const GRAY = { r: 120, g: 120, b: 130 };
const LIGHT_BG = { r: 245, g: 247, b: 250 };

/** ビューポイント情報 */
interface CameraViewpoint {
  /** ビューポイント名 */
  name: string;
  /** カメラ位置からレンダリングした画像をdata URLで返す */
  render: () => Promise<string>;
}

// ────────────────────────────────────────────────
// ヘルパー関数
// ────────────────────────────────────────────────

/** ヘッダーバーを描画 */
function drawHeader(doc: jsPDF, title: string): void {
  // 上部バー
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.rect(0, 0, PAGE_W, 12, 'F');

  // ヘッダーテキスト
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(title, MARGIN, 8);

  // 日付（右寄せ）
  const dateStr = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(dateStr, PAGE_W - MARGIN, 8, { align: 'right' });
}

/** フッター（ページ番号）を描画 */
function drawFooter(doc: jsPDF, pageNum: number, totalPages: number): void {
  doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');

  doc.setFontSize(7);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`${pageNum} / ${totalPages}`, PAGE_W / 2, PAGE_H - 4, { align: 'center' });
  doc.text('Porano Perse', MARGIN, PAGE_H - 4);
}

/** セクション見出しを描画 */
function drawSectionTitle(doc: jsPDF, y: number, text: string): number {
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.rect(MARGIN, y, 3, 8, 'F');
  doc.setFontSize(12);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(text, MARGIN + 6, y + 6);
  return y + 14;
}

/** アノテーション番号マーカーを描画 */
function drawAnnotationMarker(doc: jsPDF, x: number, y: number, index: number): void {
  // 丸いマーカー
  doc.setFillColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.circle(x, y, 3.5, 'F');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(String(index + 1), x, y + 1.5, { align: 'center' });
}

// ────────────────────────────────────────────────
// メインエクスポート関数
// ────────────────────────────────────────────────

/**
 * 3Dアノテーション付きプレゼンテーションPDFを生成
 *
 * @param canvas - Three.jsレンダリングキャンバス（タイトルページのサムネイルに使用）
 * @param projectName - プロジェクト名
 * @param annotations - アノテーション配列
 * @param cameraPositions - 4つのビューポイント（正面・側面・上面・パース）
 */
export async function generateAnnotatedPDF(
  canvas: HTMLCanvasElement,
  projectName: string,
  annotations: Annotation[],
  cameraPositions: CameraViewpoint[],
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const visibleAnnotations = annotations.filter(a => a.visible);
  const viewCount = Math.min(cameraPositions.length, 4);
  const totalPages = 2 + viewCount; // タイトル + ビュー×N + サマリー

  // ════════════════════════════════════════════════
  // ページ1: タイトルページ
  // ════════════════════════════════════════════════
  drawHeader(doc, projectName);

  // メインタイトル
  doc.setFontSize(28);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text(projectName, PAGE_W / 2, 50, { align: 'center' });

  // サブタイトル
  doc.setFontSize(14);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text('3D Store Design Presentation', PAGE_W / 2, 62, { align: 'center' });

  // 区切り線
  doc.setDrawColor(PRIMARY.r, PRIMARY.g, PRIMARY.b);
  doc.setLineWidth(0.5);
  doc.line(PAGE_W / 2 - 40, 68, PAGE_W / 2 + 40, 68);

  // サムネイル画像（メインキャンバスのスナップショット）
  try {
    const thumbDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const thumbW = 120;
    const thumbH = (canvas.height / canvas.width) * thumbW;
    const thumbX = (PAGE_W - thumbW) / 2;
    doc.addImage(thumbDataUrl, 'JPEG', thumbX, 75, thumbW, Math.min(thumbH, 90));
  } catch {
    // キャンバスが取得できない場合はプレースホルダー
    doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
    doc.rect((PAGE_W - 120) / 2, 75, 120, 70, 'F');
    doc.setFontSize(10);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text('3D Preview', PAGE_W / 2, 110, { align: 'center' });
  }

  // プロジェクト情報
  const infoY = 175;
  doc.setFontSize(9);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  const dateStr = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.text(`作成日: ${dateStr}`, MARGIN + 20, infoY);
  doc.text(`アノテーション: ${visibleAnnotations.length}件`, MARGIN + 20, infoY + 6);
  doc.text(`ビューポイント: ${viewCount}面`, PAGE_W - MARGIN - 20, infoY, { align: 'right' });

  // 会社情報プレースホルダー
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text('[ 会社名・ロゴをここに配置 ]', PAGE_W / 2, infoY + 14, { align: 'center' });

  drawFooter(doc, 1, totalPages);

  // ════════════════════════════════════════════════
  // ページ2〜5: 各ビューポイント + アノテーション
  // ════════════════════════════════════════════════
  for (let v = 0; v < viewCount; v++) {
    doc.addPage();
    const viewpoint = cameraPositions[v];
    const pageNum = v + 2;

    drawHeader(doc, `${projectName} - ${viewpoint.name}`);

    // ビューポイント名
    let contentY = drawSectionTitle(doc, 18, viewpoint.name);

    // レンダリング画像を取得して配置
    try {
      const imageDataUrl = await viewpoint.render();
      const imgW = CONTENT_W * 0.65;
      const imgH = imgW * 0.56; // 16:9相当
      const imgX = MARGIN;
      doc.addImage(imageDataUrl, 'JPEG', imgX, contentY, imgW, imgH);

      // 画像の右側にアノテーション一覧を配置
      const listX = MARGIN + imgW + 8;
      const listW = CONTENT_W - imgW - 8;
      let listY = contentY + 2;

      doc.setFontSize(9);
      doc.setTextColor(DARK.r, DARK.g, DARK.b);
      doc.text('Annotations', listX, listY);
      listY += 6;

      // 表示中のアノテーションを右サイドバーに列挙
      for (let ai = 0; ai < visibleAnnotations.length; ai++) {
        if (listY > PAGE_H - 30) break; // ページ下端超えを防止

        const ann = visibleAnnotations[ai];
        drawAnnotationMarker(doc, listX + 3.5, listY, ai);

        // テキスト（長い場合は切り詰め）
        doc.setFontSize(7);
        doc.setTextColor(DARK.r, DARK.g, DARK.b);
        const maxTextLen = Math.floor(listW / 2);
        const displayText = ann.text.length > maxTextLen
          ? ann.text.substring(0, maxTextLen) + '...'
          : ann.text;
        doc.text(displayText, listX + 10, listY + 1.5);

        // 座標情報
        doc.setFontSize(6);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        const posStr = `(${ann.position[0].toFixed(1)}, ${ann.position[1].toFixed(1)}, ${ann.position[2].toFixed(1)})`;
        doc.text(posStr, listX + 10, listY + 5.5);

        listY += 11;
      }

      contentY += imgH + 6;
    } catch {
      // レンダリング失敗時はプレースホルダー
      doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
      doc.rect(MARGIN, contentY, CONTENT_W, 100, 'F');
      doc.setFontSize(10);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(`${viewpoint.name} - レンダリング取得失敗`, PAGE_W / 2, contentY + 50, { align: 'center' });
      contentY += 106;
    }

    drawFooter(doc, pageNum, totalPages);
  }

  // ════════════════════════════════════════════════
  // 最終ページ: アノテーションサマリーテーブル
  // ════════════════════════════════════════════════
  doc.addPage();
  drawHeader(doc, `${projectName} - アノテーション一覧`);

  let tableY = drawSectionTitle(doc, 18, 'アノテーション一覧');

  // テーブルヘッダー
  const colWidths = [12, 80, 55, 55, CONTENT_W - 202]; // No, テキスト, 位置, 色, 備考
  const colX = [MARGIN];
  for (let c = 1; c < colWidths.length; c++) {
    colX.push(colX[c - 1] + colWidths[c - 1]);
  }
  const headers = ['No.', 'テキスト', '位置 (X, Y, Z)', 'カラー', '備考'];

  // ヘッダー行の背景
  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.rect(MARGIN, tableY, CONTENT_W, 8, 'F');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  headers.forEach((h, i) => {
    doc.text(h, colX[i] + 2, tableY + 5.5);
  });
  tableY += 8;

  // データ行
  for (let i = 0; i < visibleAnnotations.length; i++) {
    if (tableY > PAGE_H - 25) {
      // ページ溢れ時は新ページ
      drawFooter(doc, totalPages, totalPages);
      doc.addPage();
      drawHeader(doc, `${projectName} - アノテーション一覧（続き）`);
      tableY = 22;
    }

    const ann = visibleAnnotations[i];
    const isEven = i % 2 === 0;

    // 交互背景色
    if (isEven) {
      doc.setFillColor(LIGHT_BG.r, LIGHT_BG.g, LIGHT_BG.b);
      doc.rect(MARGIN, tableY, CONTENT_W, 8, 'F');
    }

    doc.setFontSize(7);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);

    // No.（マーカー付き）
    drawAnnotationMarker(doc, colX[0] + 5, tableY + 4, i);

    // テキスト
    const maxChars = 40;
    const text = ann.text.length > maxChars ? ann.text.substring(0, maxChars) + '...' : ann.text;
    doc.text(text, colX[1] + 2, tableY + 5.5);

    // 位置
    const posStr = `${ann.position[0].toFixed(2)}, ${ann.position[1].toFixed(2)}, ${ann.position[2].toFixed(2)}`;
    doc.text(posStr, colX[2] + 2, tableY + 5.5);

    // カラー（色見本 + Hexコード）
    const colorHex = ann.color;
    const cr = parseInt(colorHex.slice(1, 3), 16) || 0;
    const cg = parseInt(colorHex.slice(3, 5), 16) || 0;
    const cb = parseInt(colorHex.slice(5, 7), 16) || 0;
    doc.setFillColor(cr, cg, cb);
    doc.rect(colX[3] + 2, tableY + 1.5, 4, 4, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(colX[3] + 2, tableY + 1.5, 4, 4, 'S');
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(colorHex, colX[3] + 8, tableY + 5.5);

    // 備考（空欄 - ユーザー追記用）
    doc.setTextColor(180, 180, 180);
    doc.text('-', colX[4] + 2, tableY + 5.5);

    tableY += 8;
  }

  // アノテーションが無い場合
  if (visibleAnnotations.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text('アノテーションが登録されていません', PAGE_W / 2, tableY + 20, { align: 'center' });
  }

  drawFooter(doc, totalPages, totalPages);

  // ════════════════════════════════════════════════
  // ダウンロード
  // ════════════════════════════════════════════════
  const safeFileName = projectName.replace(/[^\w\u3000-\u9FFF\u30A0-\u30FF\u3040-\u309F-]/g, '_');
  doc.save(`${safeFileName}_presentation.pdf`);
}
