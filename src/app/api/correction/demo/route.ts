import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET() {
  try {
    const demoPath = join(process.cwd(), 'output', 'blueprint-analysis', 'ChloeBY_test41.json');
    const data = await readFile(demoPath, 'utf-8');
    return NextResponse.json(JSON.parse(data));
  } catch {
    return NextResponse.json({ error: 'サンプルデータが見つかりません' }, { status: 404 });
  }
}
