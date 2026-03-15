/**
 * ERP見積書インポート API
 *
 * 生成した見積データをERP側のestimates/estimate_line_itemsテーブルに直接投入する。
 * Supabase共有インスタンスなので直接INSERT可能。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { EstimateLineItemData } from '../generate-estimate/route';

// --- 型定義 ---

interface ExportToERPRequest {
  /** プロジェクト名（ERP側projectsテーブル参照） */
  projectName: string;
  /** 顧客名 */
  clientName: string;
  /** 見積件名 */
  subject: string;
  /** 見積明細 */
  lineItems: EstimateLineItemData[];
  /** 消費税率 */
  taxRate: number;
  /** 備考 */
  notes?: string;
}

// --- ヘルパー ---

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase環境変数が未設定です');
  }
  return createClient(url, key);
}

// --- ハンドラー ---

export async function POST(request: NextRequest) {
  try {
    // ERP連携が有効か確認
    const erpEnabled = process.env.NEXT_PUBLIC_ERP_INTEGRATION_ENABLED === 'true';
    if (!erpEnabled) {
      return NextResponse.json(
        { error: 'ERP連携が無効です。環境変数 NEXT_PUBLIC_ERP_INTEGRATION_ENABLED=true を設定してください。' },
        { status: 403 }
      );
    }

    const body: ExportToERPRequest = await request.json();

    if (!body.clientName || !body.lineItems?.length) {
      return NextResponse.json(
        { error: 'clientName, lineItems は必須です' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // 1. 見積書を作成
    const { data: estimate, error: estError } = await supabase
      .from('estimates')
      .insert({
        estimate_number: '',  // trigger will auto-generate
        client_name: body.clientName,
        subject: body.subject || `${body.projectName} 内装工事見積`,
        tax_rate: body.taxRate || 0.10,
        notes: body.notes || `Porano Perse 3Dパースから自動生成 (${new Date().toLocaleDateString('ja-JP')})`,
        rounding_adjustment: 0,
      })
      .select('id, estimate_number')
      .single();

    if (estError) {
      console.error('[export-to-erp] estimates insert error:', estError);
      return NextResponse.json(
        { error: `見積書の作成に失敗しました: ${estError.message}` },
        { status: 500 }
      );
    }

    // 2. 見積明細を挿入
    const rows = body.lineItems.map((item, idx) => ({
      estimate_id: estimate.id,
      category: item.category,
      item_name: item.item_name,
      specification: item.specification,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      unit_cost: 0,
      sort_order: item.sort_order || idx + 1,
    }));

    const { error: lineError } = await supabase
      .from('estimate_line_items')
      .insert(rows);

    if (lineError) {
      console.error('[export-to-erp] line_items insert error:', lineError);
      // 見積ヘッダーをロールバック（cleanup）
      await supabase.from('estimates').delete().eq('id', estimate.id);
      return NextResponse.json(
        { error: `見積明細の作成に失敗しました: ${lineError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      estimateId: estimate.id,
      estimateNumber: estimate.estimate_number,
      lineItemCount: rows.length,
      erpUrl: `${process.env.NEXT_PUBLIC_ERP_URL || 'https://porano-erp.vercel.app'}/estimates/${estimate.id}`,
    });
  } catch (error) {
    console.error('[export-to-erp] Error:', error);
    return NextResponse.json(
      { error: 'ERPへのエクスポートに失敗しました' },
      { status: 500 }
    );
  }
}
