/**
 * パースデータ → 見積データ変換 API
 *
 * パースの家具・仕上げ材・設備データを受け取り、
 * cost-estimate.ts の価格データを使って見積明細を生成する。
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  FURNITURE_PRICES,
  calculateCostEstimate,
  formatJPY,
  type CostEstimate,
  type CostLineItem,
} from '@/lib/cost-estimate';
import type { FurnitureItem, FurnitureType } from '@/types/scene';
import type { FinishCostSection, FinishCostLineItem } from '@/types/finishing';

// --- 型定義 ---

interface GenerateEstimateRequest {
  /** プロジェクト名 */
  projectName: string;
  /** 顧客名 */
  clientName: string;
  /** 配置家具リスト */
  furniture: FurnitureItem[];
  /** 仕上げ材コストセクション（オプション） */
  finishCosts?: FinishCostSection;
  /** 建具コストセクション（オプション） */
  fittingCosts?: FinishCostSection;
  /** 設備コストセクション（オプション） */
  equipmentCosts?: FinishCostSection;
  /** 配線・配管コストセクション（オプション） */
  routingCosts?: FinishCostSection;
  /** 単価オーバーライド（家具タイプ → 単価） */
  priceOverrides?: Record<string, number>;
  /** 消費税率（デフォルト10%） */
  taxRate?: number;
}

export interface EstimateLineItemData {
  category: string;
  item_name: string;
  specification: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  sort_order: number;
}

export interface GenerateEstimateResponse {
  projectName: string;
  clientName: string;
  lineItems: EstimateLineItemData[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  formatted: {
    subtotal: string;
    taxAmount: string;
    total: string;
  };
}

// --- ハンドラー ---

export async function POST(request: NextRequest) {
  try {
    const body: GenerateEstimateRequest = await request.json();

    if (!body.projectName || !body.clientName || !body.furniture) {
      return NextResponse.json(
        { error: 'projectName, clientName, furniture は必須です' },
        { status: 400 }
      );
    }

    // 単価オーバーライドをMap化
    const overrides = body.priceOverrides
      ? new Map(Object.entries(body.priceOverrides) as [FurnitureType, number][])
      : undefined;

    // 家具コスト計算
    const furnitureEstimate: CostEstimate = calculateCostEstimate(body.furniture, overrides);

    // 見積明細を生成
    const lineItems: EstimateLineItemData[] = [];
    let sortOrder = 1;

    // 1. 家具
    for (const item of furnitureEstimate.items) {
      lineItems.push({
        category: '什器・家具',
        item_name: item.nameJa,
        specification: item.type,
        quantity: item.quantity,
        unit: '台',
        unit_price: item.unitPrice,
        sort_order: sortOrder++,
      });
    }

    // 2. 仕上げ材
    if (body.finishCosts?.items?.length) {
      for (const item of body.finishCosts.items) {
        lineItems.push({
          category: '仕上げ材',
          item_name: item.name,
          specification: item.spec || null,
          quantity: item.quantity,
          unit: item.unit || 'm\u00B2',
          unit_price: item.unitPrice,
          sort_order: sortOrder++,
        });
      }
    }

    // 3. 建具
    if (body.fittingCosts?.items?.length) {
      for (const item of body.fittingCosts.items) {
        lineItems.push({
          category: '建具',
          item_name: item.name,
          specification: item.spec || null,
          quantity: item.quantity,
          unit: item.unit || '枚',
          unit_price: item.unitPrice,
          sort_order: sortOrder++,
        });
      }
    }

    // 4. 設備
    if (body.equipmentCosts?.items?.length) {
      for (const item of body.equipmentCosts.items) {
        lineItems.push({
          category: '設備',
          item_name: item.name,
          specification: item.spec || null,
          quantity: item.quantity,
          unit: item.unit || '台',
          unit_price: item.unitPrice,
          sort_order: sortOrder++,
        });
      }
    }

    // 5. 配線・配管
    if (body.routingCosts?.items?.length) {
      for (const item of body.routingCosts.items) {
        lineItems.push({
          category: '配線・配管',
          item_name: item.name,
          specification: item.spec || null,
          quantity: item.quantity,
          unit: item.unit || 'm',
          unit_price: item.unitPrice,
          sort_order: sortOrder++,
        });
      }
    }

    // 合計計算
    const subtotal = lineItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    const taxRate = body.taxRate ?? 0.10;
    const taxAmount = Math.floor(subtotal * taxRate);
    const total = subtotal + taxAmount;

    const response: GenerateEstimateResponse = {
      projectName: body.projectName,
      clientName: body.clientName,
      lineItems,
      subtotal,
      taxRate,
      taxAmount,
      total,
      formatted: {
        subtotal: formatJPY(subtotal),
        taxAmount: formatJPY(taxAmount),
        total: formatJPY(total),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[generate-estimate] Error:', error);
    return NextResponse.json(
      { error: '見積データの生成に失敗しました' },
      { status: 500 }
    );
  }
}
