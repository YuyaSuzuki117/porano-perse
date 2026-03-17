import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * POST /api/export-dxf
 * WebアプリのストアデータからDXFを生成してダウンロード
 *
 * Body: { walls, openings, furniture, projectName? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const tmpDir = join(process.cwd(), 'output', 'drawings');
    const id = randomUUID().slice(0, 8);
    const jsonPath = join(tmpDir, `_tmp_${id}.json`);
    const dxfPath = join(tmpDir, `export_${id}.dxf`);

    await mkdir(tmpDir, { recursive: true });
    await writeFile(jsonPath, JSON.stringify(body, null, 2), 'utf-8');

    // Python スクリプトを実行して DXF 生成
    const scriptPath = join(process.cwd(), 'scripts', 'gen-dxf.py');

    await new Promise<void>((resolve, reject) => {
      exec(
        `python "${scriptPath}" --store-json "${jsonPath}" -o "${dxfPath}"`,
        { timeout: 15000 },
        (error, _stdout, stderr) => {
          if (error) {
            console.error('DXF generation error:', stderr);
            reject(new Error(stderr || error.message));
          } else {
            resolve();
          }
        }
      );
    });

    // DXFを読み込んでレスポンス
    const dxfBuffer = await readFile(dxfPath);

    // 一時ファイル削除
    await unlink(jsonPath).catch(() => {});
    await unlink(dxfPath).catch(() => {});

    const projectName = body.projectName || 'floor_plan';
    const filename = `${projectName}.dxf`;

    return new NextResponse(dxfBuffer, {
      headers: {
        'Content-Type': 'application/dxf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error('DXF export failed:', error);
    return NextResponse.json(
      { error: 'DXF生成に失敗しました', detail: String(error) },
      { status: 500 }
    );
  }
}
