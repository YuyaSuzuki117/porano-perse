import { describe, it, expect } from 'vitest';
import { isGeminiAvailable, extractJson } from '../gemini-client';

describe('gemini-client', () => {
  it('isGeminiAvailable: GEMINI_API_KEY未設定でfalseを返す', () => {
    // テスト環境ではAPI_KEYが無いはず
    expect(isGeminiAvailable()).toBe(false);
  });

  it('extractJson: JSON文字列を正しくパースする', () => {
    // 直接JSON
    const result1 = extractJson<{ name: string }>('{"name":"テスト"}');
    expect(result1).toEqual({ name: 'テスト' });

    // 配列JSON
    const result2 = extractJson<number[]>('[1, 2, 3]');
    expect(result2).toEqual([1, 2, 3]);

    // Markdown内のJSON
    const result3 = extractJson<{ a: number }>('```json\n{"a": 42}\n```');
    expect(result3).toEqual({ a: 42 });

    // 不正な文字列はnull
    const result4 = extractJson('not json at all');
    expect(result4).toBeNull();

    // 空文字列はnull
    const result5 = extractJson('');
    expect(result5).toBeNull();
  });
});
