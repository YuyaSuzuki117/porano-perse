import { describe, it, expect } from 'vitest';
import {
  calculateCostEstimate,
  formatJPY,
  FURNITURE_PRICES,
} from '../cost-estimate';
import type { FurnitureItem, FurnitureType } from '@/types/scene';

function makeFurnitureItem(type: FurnitureType, id: string): FurnitureItem {
  return {
    id,
    type,
    name: type,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

describe('cost-estimate', () => {
  it('calculateCostEstimate: 家具のコスト合計を正しく算出する', () => {
    const furniture: FurnitureItem[] = [
      makeFurnitureItem('chair', 'c1'),
      makeFurnitureItem('chair', 'c2'),
      makeFurnitureItem('table_square', 't1'),
    ];
    const estimate = calculateCostEstimate(furniture);

    // 椅子2脚 + テーブル1台
    const expectedSubtotal =
      FURNITURE_PRICES.chair.averagePrice * 2 +
      FURNITURE_PRICES.table_square.averagePrice * 1;
    expect(estimate.subtotal).toBe(expectedSubtotal);
    expect(estimate.taxRate).toBe(0.1);
    expect(estimate.taxAmount).toBe(Math.floor(expectedSubtotal * 0.1));
    expect(estimate.total).toBe(expectedSubtotal + estimate.taxAmount);
  });

  it('calculateCostEstimate: 空配列は合計0', () => {
    const estimate = calculateCostEstimate([]);
    expect(estimate.subtotal).toBe(0);
    expect(estimate.total).toBe(0);
    expect(estimate.items).toHaveLength(0);
  });

  it('formatJPY: 金額を円表記にフォーマットする', () => {
    expect(formatJPY(120000)).toContain('120,000');
    expect(formatJPY(0)).toContain('0');
  });
});
