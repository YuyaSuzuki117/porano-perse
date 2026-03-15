import { describe, it, expect } from 'vitest';
import { FURNITURE_CATALOG } from '../furniture';
import { STORE_TEMPLATES, DEFAULT_TEMPLATE } from '../templates';
import type { FurnitureType } from '@/types/scene';

describe('furniture-catalog', () => {
  it('全カタログアイテムにmodelUrlが定義されている', () => {
    for (const item of FURNITURE_CATALOG) {
      expect(item.modelUrl, `${item.type} にmodelUrlがない`).toBeDefined();
      expect(typeof item.modelUrl).toBe('string');
      expect(item.modelUrl!.length).toBeGreaterThan(0);
    }
  });

  it('主要カテゴリが網羅されている', () => {
    const types = new Set(FURNITURE_CATALOG.map((item) => item.type));
    const requiredTypes: FurnitureType[] = [
      'counter', 'table_square', 'table_round', 'chair', 'stool',
      'sofa', 'shelf', 'pendant_light', 'plant', 'partition',
    ];
    for (const t of requiredTypes) {
      expect(types.has(t), `カテゴリ ${t} がカタログにない`).toBe(true);
    }
  });

  it('全アイテムのスケールが正の値', () => {
    for (const item of FURNITURE_CATALOG) {
      expect(item.defaultScale[0], `${item.type} scale[0]`).toBeGreaterThan(0);
      expect(item.defaultScale[1], `${item.type} scale[1]`).toBeGreaterThan(0);
      expect(item.defaultScale[2], `${item.type} scale[2]`).toBeGreaterThan(0);
    }
  });

  it('全アイテムの型が正しい（type, name, icon, defaultScale, defaultColor）', () => {
    for (const item of FURNITURE_CATALOG) {
      expect(typeof item.type).toBe('string');
      expect(typeof item.name).toBe('string');
      expect(typeof item.icon).toBe('string');
      expect(Array.isArray(item.defaultScale)).toBe(true);
      expect(item.defaultScale).toHaveLength(3);
      expect(typeof item.defaultColor).toBe('string');
    }
  });

  it('テンプレートが有効（DEFAULT_TEMPLATEが存在し、STORE_TEMPLATESが2件以上）', () => {
    expect(DEFAULT_TEMPLATE).toBeDefined();
    expect(DEFAULT_TEMPLATE.id).toBeTruthy();
    expect(DEFAULT_TEMPLATE.walls.length).toBeGreaterThan(0);
    expect(DEFAULT_TEMPLATE.furniture.length).toBeGreaterThan(0);
    expect(STORE_TEMPLATES.length).toBeGreaterThanOrEqual(2);

    // 全テンプレートにid, name, wallsがある
    for (const tpl of STORE_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.name).toBeTruthy();
      expect(tpl.walls.length).toBeGreaterThan(0);
    }
  });
});
