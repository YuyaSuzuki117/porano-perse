import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { join } from 'path';

const CORRECTION_DIR = join(process.cwd(), 'output', 'correction');

/**
 * POST /api/correction/render-pdf
 * PDFファイルをアップロードし、指定ページをPNG画像にレンダリング
 *
 * Body: multipart/form-data { pdf: File, page?: number }
 * Returns: { imageUrl, pageWidthPt, pageHeightPt, dpi, pageWidthPx, pageHeightPx }
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const page = Number(formData.get('page') ?? 0);

    if (!pdfFile) {
      return NextResponse.json(
        { error: 'PDFファイルが指定されていません' },
        { status: 400 }
      );
    }

    await mkdir(CORRECTION_DIR, { recursive: true });

    const id = randomUUID().slice(0, 8);
    const pdfPath = join(CORRECTION_DIR, `_tmp_${id}.pdf`);
    const pngPath = join(CORRECTION_DIR, `render_${id}.png`);

    // PDFを一時ファイルに保存
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    await writeFile(pdfPath, pdfBuffer);

    // PyMuPDFでPNGにレンダリング
    const pythonCmd = `python -c "import fitz; doc=fitz.open('${pdfPath.replace(/\\/g, '/')}'); page=doc[${page}]; pix=page.get_pixmap(dpi=150); pix.save('${pngPath.replace(/\\/g, '/')}'); print(f'{page.rect.width},{page.rect.height},{pix.width},{pix.height}')"`;

    const output = await new Promise<string>((resolve, reject) => {
      exec(
        pythonCmd,
        { timeout: 15000, encoding: 'utf-8' },
        (error, stdout, stderr) => {
          if (error) {
            console.error('PDF render error:', stderr);
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout.trim());
          }
        }
      );
    });

    // stdout: "pageWidthPt,pageHeightPt,pixelWidth,pixelHeight"
    const [pageWidthPt, pageHeightPt, pageWidthPx, pageHeightPx] = output
      .split(',')
      .map(Number);

    return NextResponse.json({
      imageUrl: `/api/correction/render-pdf?id=${id}`,
      pageWidthPt,
      pageHeightPt,
      dpi: 150,
      pageWidthPx,
      pageHeightPx,
    });
  } catch (error) {
    console.error('PDF render failed:', error);
    return NextResponse.json(
      { error: 'PDFレンダリングに失敗しました', detail: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/correction/render-pdf?id=XXXXXXXX
 * レンダリング済みPNG画像を返す
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id || !/^[a-f0-9-]{8}$/.test(id)) {
      return NextResponse.json(
        { error: '無効な画像IDです' },
        { status: 400 }
      );
    }

    const pngPath = join(CORRECTION_DIR, `render_${id}.png`);
    const pngBuffer = await readFile(pngPath);

    return new NextResponse(pngBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('PNG serve failed:', error);
    return NextResponse.json(
      { error: '画像が見つかりません', detail: String(error) },
      { status: 404 }
    );
  }
}
