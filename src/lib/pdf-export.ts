import { jsPDF } from 'jspdf';
import { StylePreset, Annotation } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';
import { FurnitureItem } from '@/types/scene';
import { FURNITURE_CATALOG } from '@/data/furniture';

const STYLE_NAMES: Record<StylePreset, string> = {
  japanese: 'Wafuu (Japanese)',
  modern: 'Modern',
  cafe: 'Cafe',
  industrial: 'Industrial',
  minimal: 'Minimal',
  luxury: 'Luxury',
  scandinavian: 'Scandinavian',
  retro: 'Retro',
  medical: 'Medical',
};

// Furniture type to Japanese display name mapping
const FURNITURE_NAMES: Record<string, string> = {};
for (const item of FURNITURE_CATALOG) {
  FURNITURE_NAMES[item.type] = item.name;
}

interface RoomInfo {
  projectName: string;
  walls: WallSegment[];
  furniture: FurnitureItem[];
  style: StylePreset;
  roomHeight: number;
  annotations?: Annotation[];
}

// Accent color
const ACCENT = { r: 37, g: 99, b: 235 }; // #2563EB

function computeRoomDimensions(walls: WallSegment[]): { width: number; depth: number } {
  if (walls.length === 0) return { width: 0, depth: 0 };

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  return {
    width: Math.round((maxX - minX) * 100) / 100,
    depth: Math.round((maxY - minY) * 100) / 100,
  };
}

function formatDate(): string {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
}

// Helper: draw accent line
function drawAccentLine(pdf: jsPDF, x1: number, y: number, x2: number, thickness: number = 0.8) {
  pdf.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
  pdf.setLineWidth(thickness);
  pdf.line(x1, y, x2, y);
}

// Helper: draw page number
function drawPageNumber(pdf: jsPDF, pageNum: number, totalPages: number) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  pdf.setFontSize(8);
  pdf.setTextColor(160, 160, 160);
  pdf.text(`${pageNum} / ${totalPages}`, pageW / 2, pageH - 6, { align: 'center' });
}

// Helper: draw header on content pages
function drawContentHeader(pdf: jsPDF, title: string, margin: number) {
  const pageW = pdf.internal.pageSize.getWidth();
  pdf.setFontSize(14);
  pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
  pdf.text(title, margin, margin + 8);
  drawAccentLine(pdf, margin, margin + 12, pageW - margin, 0.5);
}

// Group furniture by type and count
function groupFurniture(furniture: FurnitureItem[]): Array<{
  type: string;
  name: string;
  scale: [number, number, number];
  count: number;
  notes: string;
}> {
  const groups = new Map<string, {
    type: string;
    name: string;
    scale: [number, number, number];
    count: number;
    notes: string;
  }>();

  for (const f of furniture) {
    const key = `${f.type}_${f.scale[0].toFixed(2)}_${f.scale[1].toFixed(2)}_${f.scale[2].toFixed(2)}`;
    if (groups.has(key)) {
      groups.get(key)!.count++;
    } else {
      const catalogName = FURNITURE_NAMES[f.type] || f.name || f.type;
      groups.set(key, {
        type: f.type,
        name: catalogName,
        scale: f.scale,
        count: 1,
        notes: f.material ? f.material : '',
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * Export a multi-page professional proposal PDF.
 *
 * Page 1: Cover
 * Page 2: 3D Perspective View
 * Page 3: Floor Plan + Room Info
 * Page 4: Furniture List
 * Page 5: Notes
 */
export function exportProposalPDF(
  canvasRef3D: React.RefObject<HTMLCanvasElement | null>,
  canvasRef2D: React.RefObject<HTMLCanvasElement | null> | null,
  roomInfo: RoomInfo
): void {
  if (!canvasRef3D.current) {
    alert('3D view not found. Please switch to 3D mode first.');
    return;
  }

  const canvas3D = canvasRef3D.current;
  const image3D = canvas3D.toDataURL('image/png');
  const image2D = canvasRef2D?.current ? canvasRef2D.current.toDataURL('image/png') : null;

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();  // 297
  const pageH = pdf.internal.pageSize.getHeight(); // 210
  const margin = 15;
  const contentW = pageW - margin * 2;
  const dateStr = formatDate();
  const dims = computeRoomDimensions(roomInfo.walls);
  const area = dims.width * dims.depth;
  const tsubo = area / 3.306;
  const totalPages = 5;

  // ============================================================
  // PAGE 1: COVER
  // ============================================================
  {
    // Background - subtle gradient effect via rectangles
    pdf.setFillColor(250, 251, 253);
    pdf.rect(0, 0, pageW, pageH, 'F');

    // Top accent bar
    pdf.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.rect(0, 0, pageW, 3, 'F');

    // Left accent line
    pdf.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.rect(margin, 40, 2, 80, 'F');

    // Title
    pdf.setFontSize(32);
    pdf.setTextColor(30, 30, 30);
    pdf.text('Store Layout Proposal', margin + 10, 65);

    // Subtitle (Japanese)
    pdf.setFontSize(14);
    pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.text('Tenpo Layout Teian-sho', margin + 10, 78);

    // Divider
    drawAccentLine(pdf, margin + 10, 85, margin + 120, 0.5);

    // Project name
    pdf.setFontSize(18);
    pdf.setTextColor(60, 60, 60);
    pdf.text(roomInfo.projectName, margin + 10, 100);

    // Room summary
    pdf.setFontSize(11);
    pdf.setTextColor(100, 100, 100);
    const styleName = STYLE_NAMES[roomInfo.style] || roomInfo.style;
    pdf.text(`Style: ${styleName}`, margin + 10, 112);
    pdf.text(`${dims.width}m x ${dims.depth}m  (${area.toFixed(1)} m2 / ${tsubo.toFixed(1)} tsubo)`, margin + 10, 120);

    // Date
    pdf.setFontSize(11);
    pdf.setTextColor(80, 80, 80);
    pdf.text(dateStr, margin + 10, 135);

    // Bottom section: Presented by
    pdf.setFontSize(12);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Presented by', pageW - margin, pageH - 30, { align: 'right' });
    pdf.setFontSize(16);
    pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.text('Porano Plaza', pageW - margin, pageH - 20, { align: 'right' });

    // Bottom accent bar
    pdf.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.rect(0, pageH - 3, pageW, 3, 'F');

    // Small logo text
    pdf.setFontSize(8);
    pdf.setTextColor(180, 180, 180);
    pdf.text('Porano Perse - 3D Store Design Tool', pageW - margin, pageH - 8, { align: 'right' });

    drawPageNumber(pdf, 1, totalPages);
  }

  // ============================================================
  // PAGE 2: 3D PERSPECTIVE VIEW
  // ============================================================
  pdf.addPage();
  {
    drawContentHeader(pdf, '3D Perspective View  /  3D Paasu', margin);

    const imgTop = margin + 18;
    const imgAreaH = pageH - imgTop - 30;
    const canvasAspect = canvas3D.width / canvas3D.height;
    let imgW = contentW;
    let imgH = imgW / canvasAspect;
    if (imgH > imgAreaH) {
      imgH = imgAreaH;
      imgW = imgH * canvasAspect;
    }
    const imgX = margin + (contentW - imgW) / 2;
    const imgY = imgTop + 2;

    // Shadow effect
    pdf.setFillColor(230, 230, 230);
    pdf.roundedRect(imgX + 1.5, imgY + 1.5, imgW, imgH, 2, 2, 'F');

    // Image with border
    pdf.addImage(image3D, 'PNG', imgX, imgY, imgW, imgH);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(imgX, imgY, imgW, imgH, 2, 2, 'S');

    // Caption
    const captionY = imgY + imgH + 6;
    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    const styleName = STYLE_NAMES[roomInfo.style] || roomInfo.style;
    pdf.text(
      `Style: ${styleName}  |  ${dims.width}m x ${dims.depth}m x ${roomInfo.roomHeight}m`,
      pageW / 2,
      captionY,
      { align: 'center' }
    );

    drawPageNumber(pdf, 2, totalPages);
  }

  // ============================================================
  // PAGE 3: FLOOR PLAN + ROOM INFO
  // ============================================================
  pdf.addPage();
  {
    drawContentHeader(pdf, 'Floor Plan & Room Specifications  /  Heimen-zu', margin);

    const topY = margin + 18;

    if (image2D && canvasRef2D?.current) {
      // 2D floor plan image - left half
      const planW = contentW * 0.55;
      const planH = pageH - topY - 30;
      const canvas2D = canvasRef2D.current;
      const aspect2D = canvas2D.width / canvas2D.height;
      let imgW = planW;
      let imgH = imgW / aspect2D;
      if (imgH > planH) {
        imgH = planH;
        imgW = imgH * aspect2D;
      }
      const imgX = margin;
      const imgY = topY + 2;

      // Shadow + border
      pdf.setFillColor(245, 245, 245);
      pdf.roundedRect(imgX + 1, imgY + 1, imgW, imgH, 2, 2, 'F');
      pdf.addImage(image2D, 'PNG', imgX, imgY, imgW, imgH);
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(imgX, imgY, imgW, imgH, 2, 2, 'S');
    } else {
      // No 2D canvas available - show placeholder
      const placeholderX = margin;
      const placeholderY = topY + 2;
      const placeholderW = contentW * 0.55;
      const placeholderH = pageH - topY - 30;
      pdf.setFillColor(248, 248, 248);
      pdf.setDrawColor(220, 220, 220);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(placeholderX, placeholderY, placeholderW, placeholderH, 2, 2, 'FD');
      pdf.setFontSize(10);
      pdf.setTextColor(180, 180, 180);
      pdf.text('2D Floor Plan', placeholderX + placeholderW / 2, placeholderY + placeholderH / 2, { align: 'center' });
      pdf.setFontSize(8);
      pdf.text('(Switch to split/2D mode to capture)', placeholderX + placeholderW / 2, placeholderY + placeholderH / 2 + 6, { align: 'center' });
    }

    // Right side: Room specifications
    const specX = margin + contentW * 0.6;
    const specW = contentW * 0.38;
    let specY = topY + 4;

    // Spec card background
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(220, 225, 230);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(specX, specY, specW, 110, 3, 3, 'FD');

    specY += 8;

    pdf.setFontSize(12);
    pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.text('Room Specifications', specX + 6, specY);
    pdf.text('Shitsu Shiyou', specX + 6, specY + 6);

    specY += 14;
    drawAccentLine(pdf, specX + 6, specY, specX + specW - 6, 0.3);
    specY += 8;

    const specs = [
      { label: 'Menseki (Area)', value: `${area.toFixed(1)} m2  (${tsubo.toFixed(1)} tsubo)` },
      { label: 'Size', value: `${dims.width}m x ${dims.depth}m` },
      { label: 'Tenjou-daka (Height)', value: `${roomInfo.roomHeight}m` },
      { label: 'Style', value: STYLE_NAMES[roomInfo.style] || roomInfo.style },
      { label: 'Kabe-su (Walls)', value: `${roomInfo.walls.length}` },
      { label: 'Kagu-su (Furniture)', value: `${roomInfo.furniture.length}` },
    ];

    pdf.setFontSize(9);
    for (const spec of specs) {
      pdf.setTextColor(100, 100, 100);
      pdf.text(spec.label, specX + 8, specY);
      pdf.setTextColor(40, 40, 40);
      pdf.text(spec.value, specX + specW - 8, specY, { align: 'right' });
      specY += 10;
      // Light separator
      pdf.setDrawColor(235, 235, 235);
      pdf.setLineWidth(0.2);
      pdf.line(specX + 8, specY - 4, specX + specW - 8, specY - 4);
    }

    drawPageNumber(pdf, 3, totalPages);
  }

  // ============================================================
  // PAGE 4: FURNITURE LIST
  // ============================================================
  pdf.addPage();
  {
    drawContentHeader(pdf, 'Furniture Specifications  /  Kagu Shiyou-sho', margin);

    const grouped = groupFurniture(roomInfo.furniture);
    const tableTop = margin + 22;

    // Table header
    const colX = [margin, margin + 14, margin + 80, margin + 140, margin + 200, margin + 230];
    const colLabels = ['No.', 'Name (Meishou)', 'Type', 'Size (W x D x H)', 'Qty', 'Notes'];

    // Header background
    pdf.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
    pdf.rect(margin, tableTop, contentW, 8, 'F');

    pdf.setFontSize(8);
    pdf.setTextColor(255, 255, 255);
    for (let i = 0; i < colLabels.length; i++) {
      pdf.text(colLabels[i], colX[i] + 2, tableTop + 5.5);
    }

    // Table rows
    let rowY = tableTop + 8;
    const rowH = 9;

    if (grouped.length === 0) {
      pdf.setFontSize(9);
      pdf.setTextColor(150, 150, 150);
      pdf.text('No furniture placed.', margin + contentW / 2, rowY + 12, { align: 'center' });
    } else {
      let totalCount = 0;
      grouped.forEach((item, idx) => {
        // Alternating row background
        if (idx % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(margin, rowY, contentW, rowH, 'F');
        }

        // Row border
        pdf.setDrawColor(230, 230, 230);
        pdf.setLineWidth(0.2);
        pdf.line(margin, rowY + rowH, margin + contentW, rowY + rowH);

        pdf.setFontSize(8);
        pdf.setTextColor(60, 60, 60);

        // No.
        pdf.text(String(idx + 1), colX[0] + 2, rowY + 6);

        // Name
        pdf.setTextColor(30, 30, 30);
        pdf.text(item.name, colX[1] + 2, rowY + 6);

        // Type
        pdf.setTextColor(100, 100, 100);
        pdf.text(item.type, colX[2] + 2, rowY + 6);

        // Size
        const sizeStr = `${(item.scale[0] * 1000).toFixed(0)} x ${(item.scale[2] * 1000).toFixed(0)} x ${(item.scale[1] * 1000).toFixed(0)} mm`;
        pdf.text(sizeStr, colX[3] + 2, rowY + 6);

        // Qty
        pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
        pdf.text(String(item.count), colX[4] + 2, rowY + 6);

        // Notes
        pdf.setTextColor(140, 140, 140);
        pdf.text(item.notes, colX[5] + 2, rowY + 6);

        totalCount += item.count;
        rowY += rowH;

        // Page break check (leave room for total row + page number)
        if (rowY > pageH - 35 && idx < grouped.length - 1) {
          drawPageNumber(pdf, 4, totalPages);
          pdf.addPage();
          drawContentHeader(pdf, 'Furniture Specifications (cont.)', margin);
          rowY = margin + 22;
          // Redraw header
          pdf.setFillColor(ACCENT.r, ACCENT.g, ACCENT.b);
          pdf.rect(margin, rowY, contentW, 8, 'F');
          pdf.setFontSize(8);
          pdf.setTextColor(255, 255, 255);
          for (let i = 0; i < colLabels.length; i++) {
            pdf.text(colLabels[i], colX[i] + 2, rowY + 5.5);
          }
          rowY += 8;
        }
      });

      // Total row
      rowY += 2;
      pdf.setFillColor(240, 244, 248);
      pdf.rect(margin, rowY, contentW, rowH + 1, 'F');
      pdf.setDrawColor(ACCENT.r, ACCENT.g, ACCENT.b);
      pdf.setLineWidth(0.5);
      pdf.line(margin, rowY, margin + contentW, rowY);

      pdf.setFontSize(9);
      pdf.setTextColor(40, 40, 40);
      pdf.text('TOTAL', colX[1] + 2, rowY + 6.5);
      pdf.text(`${grouped.length} types`, colX[3] + 2, rowY + 6.5);
      pdf.setTextColor(ACCENT.r, ACCENT.g, ACCENT.b);
      pdf.text(String(totalCount), colX[4] + 2, rowY + 6.5);
      pdf.text('items', colX[4] + 14, rowY + 6.5);
    }

    drawPageNumber(pdf, 4, totalPages);
  }

  // ============================================================
  // PAGE 5: NOTES & ANNOTATIONS
  // ============================================================
  pdf.addPage();
  {
    const visibleAnnotations = (roomInfo.annotations || []).filter((a) => a.visible);

    if (visibleAnnotations.length > 0) {
      drawContentHeader(pdf, 'Annotations & Notes  /  Chuushaku & Bikou', margin);
    } else {
      drawContentHeader(pdf, 'Notes  /  Bikou', margin);
    }

    let topY = margin + 22;

    // Render annotations if any
    if (visibleAnnotations.length > 0) {
      const COLOR_NAMES: Record<string, string> = {
        '#ef4444': 'Red',
        '#3b82f6': 'Blue',
        '#22c55e': 'Green',
        '#eab308': 'Yellow',
      };

      for (let i = 0; i < visibleAnnotations.length; i++) {
        const ann = visibleAnnotations[i];

        // Color dot
        const dotColor = ann.color;
        const r = parseInt(dotColor.slice(1, 3), 16);
        const g = parseInt(dotColor.slice(3, 5), 16);
        const b = parseInt(dotColor.slice(5, 7), 16);
        pdf.setFillColor(r, g, b);
        pdf.circle(margin + 4, topY + 1.5, 2.5, 'F');

        // Number in circle
        pdf.setFontSize(7);
        pdf.setTextColor(255, 255, 255);
        pdf.text(String(i + 1), margin + 4, topY + 2.5, { align: 'center' });

        // Annotation text
        pdf.setFontSize(9);
        pdf.setTextColor(40, 40, 40);
        pdf.text(ann.text, margin + 12, topY + 3);

        // Position info
        pdf.setFontSize(7);
        pdf.setTextColor(160, 160, 160);
        const posStr = `(${ann.position[0].toFixed(1)}, ${ann.position[1].toFixed(1)}, ${ann.position[2].toFixed(1)}) ${COLOR_NAMES[ann.color] || ''}`;
        pdf.text(posStr, pageW - margin, topY + 3, { align: 'right' });

        topY += 10;

        // Page break check
        if (topY > pageH - 60) break;
      }

      // Separator between annotations and notes
      topY += 4;
      drawAccentLine(pdf, margin, topY, pageW - margin, 0.3);
      topY += 8;
    }

    // Lined area for handwritten notes
    const lineSpacing = 12;
    const numLines = Math.floor((pageH - topY - 50) / lineSpacing);

    pdf.setDrawColor(230, 235, 240);
    pdf.setLineWidth(0.2);

    for (let i = 0; i < numLines; i++) {
      const y = topY + i * lineSpacing;
      pdf.line(margin, y, pageW - margin, y);
    }

    // Bottom section
    const bottomY = pageH - 40;

    // Separator
    drawAccentLine(pdf, margin, bottomY, pageW - margin, 0.3);

    // Contact placeholder
    pdf.setFontSize(9);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Contact / Renraku-saki:', margin, bottomY + 8);
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.2);
    pdf.line(margin + 45, bottomY + 8, margin + 160, bottomY + 8);

    pdf.text('TEL:', margin, bottomY + 16);
    pdf.line(margin + 15, bottomY + 16, margin + 80, bottomY + 16);
    pdf.text('Email:', margin + 90, bottomY + 16);
    pdf.line(margin + 105, bottomY + 16, margin + 200, bottomY + 16);

    // Footer note
    pdf.setFontSize(7);
    pdf.setTextColor(170, 170, 170);
    pdf.text(
      'This proposal was auto-generated by Porano Perse (Kono teian-sho wa Porano Perse ni yori jidou seisei saremashita)',
      pageW / 2,
      pageH - 14,
      { align: 'center' }
    );

    drawPageNumber(pdf, 5, totalPages);
  }

  // Save
  const filename = `${roomInfo.projectName.replace(/\s+/g, '_')}_proposal_${dateStr.replace(/\//g, '')}.pdf`;
  pdf.save(filename);
}

/**
 * Legacy single-page export (kept for backward compatibility).
 */
export function exportPDF(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  roomInfo: RoomInfo
): void {
  exportProposalPDF(canvasRef, null, roomInfo);
}
