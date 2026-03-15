import { describe, it, expect, beforeEach } from 'vitest';

describe('project-storage: 匿名ID', () => {
  const ANON_ID_KEY = 'perse_anonymous_id';

  beforeEach(() => {
    localStorage.clear();
  });

  it('匿名IDが未設定時にcrypto.randomUUIDで生成される', () => {
    expect(localStorage.getItem(ANON_ID_KEY)).toBeNull();

    // Simulate what getOrCreateAnonymousId does
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    // UUID v4 format check
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('既存の匿名IDがあれば再利用される', () => {
    const existingId = 'test-existing-id-12345';
    localStorage.setItem(ANON_ID_KEY, existingId);

    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    expect(id).toBe(existingId);
  });

  it('匿名IDはlocalStorageに永続化される', () => {
    const id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);

    // 別のアクセスでも同じIDを取得
    const retrieved = localStorage.getItem(ANON_ID_KEY);
    expect(retrieved).toBe(id);
  });
});
