import { NextRequest, NextResponse } from 'next/server';
import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';

const BLUEPRINT_DIR = join(process.cwd(), 'output', 'blueprint-analysis');
const CORRECTION_DIR = join(process.cwd(), 'output', 'correction');

/** 利用可能なデモファイル */
const DEMO_FILES: Record<string, { json: string; pdf?: string }> = {
  chloe: { json: 'ChloeBY_test41.json' },
  sankei59: { json: 'sankei59_v6.json', pdf: 'sankei59.pdf' },
};

/**
 * GET /api/correction/demo?file=sankei59
 * file省略時は chloe を返す
 * with_pdf=1 でPDFレンダリング情報も含める
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get('file') || 'chloe';
    const withPdf = searchParams.get('with_pdf') === '1';

    const demo = DEMO_FILES[fileKey];
    if (!demo) {
      return NextResponse.json(
        { error: `不明なデモファイル: ${fileKey}`, available: Object.keys(DEMO_FILES) },
        { status: 400 }
      );
    }

    const jsonPath = join(BLUEPRINT_DIR, demo.json);
    const data = await readFile(jsonPath, 'utf-8');
    const blueprint = JSON.parse(data);

    // PDF背景も返す場合
    let pdfInfo = null;
    if (withPdf && demo.pdf) {
      const pdfPath = join(BLUEPRINT_DIR, demo.pdf);
      try {
        await access(pdfPath);
        await mkdir(CORRECTION_DIR, { recursive: true });

        const id = randomUUID().slice(0, 8);
        const pngPath = join(CORRECTION_DIR, `render_${id}.png`);

        const pythonCmd = `python -c "import fitz; doc=fitz.open('${pdfPath.replace(/\\/g, '/')}'); page=doc[0]; pix=page.get_pixmap(dpi=150); pix.save('${pngPath.replace(/\\/g, '/')}'); print(f'{page.rect.width},{page.rect.height},{pix.width},{pix.height}')"`;

        const output = await new Promise<string>((resolve, reject) => {
          exec(pythonCmd, { timeout: 15000, encoding: 'utf-8' }, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout.trim());
          });
        });

        const [pageWidthPt, pageHeightPt, pageWidthPx, pageHeightPx] = output.split(',').map(Number);
        pdfInfo = {
          imageUrl: `/api/correction/render-pdf?id=${id}`,
          pageWidthPt,
          pageHeightPt,
          dpi: 150,
          pageWidthPx,
          pageHeightPx,
        };
      } catch {
        // PDFなしでもJSONは返す
      }
    }

    return NextResponse.json({ blueprint, pdfInfo });
  } catch {
    return NextResponse.json({ error: 'サンプルデータが見つかりません' }, { status: 404 });
  }
}
