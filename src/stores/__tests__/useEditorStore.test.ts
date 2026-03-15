import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import { useUIStore } from '../useUIStore';
import type { WallSegment } from '@/types/floor-plan';
import type { FurnitureItem } from '@/types/scene';

// Helper: create a wall segment
function makeWall(id: string, x1 = 0, y1 = 0, x2 = 5, y2 = 0): WallSegment {
  return {
    id,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: 0.12,
    height: 2.7,
    color: '#FFFFFF',
  };
}

// Helper: create a furniture item
function makeFurniture(id: string, position: [number, number, number] = [1, 0, 1]): FurnitureItem {
  return {
    id,
    type: 'chair',
    name: 'テスト椅子',
    position,
    rotation: [0, 0, 0],
    scale: [0.45, 0.85, 0.45],
    color: '#654321',
    material: 'wood',
  };
}

describe('useEditorStore', () => {
  beforeEach(() => {
    // Reset store to clean state
    useEditorStore.setState({
      walls: [],
      openings: [],
      furniture: [],
      roomLabels: [],
      annotations: [],
      roomHeight: 2.7,
      style: 'cafe',
      history: [],
      historyIndex: -1,
      deletingFurnitureIds: [],
      clipboard: null,
    });
    useUIStore.getState()._setSelection({
      selectedFurnitureId: null,
      selectedFurnitureIds: [],
      selectedWallId: null,
    });
  });

  // ── 壁操作 (3件) ──

  it('addWall: 壁を追加できる', () => {
    const wall = makeWall('w1');
    useEditorStore.getState().addWall(wall);
    const walls = useEditorStore.getState().walls;
    expect(walls).toHaveLength(1);
    expect(walls[0].id).toBe('w1');
  });

  it('updateWall: 壁を更新できる', () => {
    const wall = makeWall('w2');
    useEditorStore.getState().addWall(wall);
    useEditorStore.getState().updateWall('w2', { color: '#FF0000' });
    const updated = useEditorStore.getState().walls.find((w) => w.id === 'w2');
    expect(updated?.color).toBe('#FF0000');
  });

  it('deleteWall: 壁を削除できる', () => {
    useEditorStore.getState().addWall(makeWall('w3'));
    useEditorStore.getState().addWall(makeWall('w4', 0, 0, 0, 5));
    expect(useEditorStore.getState().walls).toHaveLength(2);
    useEditorStore.getState().deleteWall('w3');
    expect(useEditorStore.getState().walls).toHaveLength(1);
    expect(useEditorStore.getState().walls[0].id).toBe('w4');
  });

  // ── 家具操作 (4件) ──

  it('addFurniture: 家具を追加して選択状態になる', () => {
    const chair = makeFurniture('f1');
    useEditorStore.getState().addFurniture(chair);
    expect(useEditorStore.getState().furniture).toHaveLength(1);
    expect(useUIStore.getState().selectedFurnitureId).toBe('f1');
  });

  it('moveFurniture: 家具を移動できる', () => {
    useEditorStore.getState().addFurniture(makeFurniture('f2', [0, 0, 0]));
    useEditorStore.getState().moveFurniture('f2', [3, 0, 4]);
    const moved = useEditorStore.getState().furniture.find((f) => f.id === 'f2');
    expect(moved?.position).toEqual([3, 0, 4]);
  });

  it('rotateFurniture: 家具を回転できる', () => {
    useEditorStore.getState().addFurniture(makeFurniture('f3'));
    useEditorStore.getState().rotateFurniture('f3', Math.PI / 2);
    const rotated = useEditorStore.getState().furniture.find((f) => f.id === 'f3');
    expect(rotated?.rotation[1]).toBeCloseTo(Math.PI / 2);
  });

  it('deleteFurniture: markForDeletion + completeDeleteで家具を削除できる', () => {
    useEditorStore.getState().addFurniture(makeFurniture('f4'));
    useEditorStore.getState().addFurniture(makeFurniture('f5', [2, 0, 2]));
    expect(useEditorStore.getState().furniture).toHaveLength(2);

    // deleteFurniture は mark → completeDelete の2段階
    useEditorStore.getState().deleteFurniture('f4');
    expect(useEditorStore.getState().deletingFurnitureIds).toContain('f4');

    useEditorStore.getState().completeDeleteFurniture('f4');
    expect(useEditorStore.getState().furniture).toHaveLength(1);
    expect(useEditorStore.getState().furniture[0].id).toBe('f5');
  });

  // ── Undo/Redo (1件) ──

  it('undo/redo: 2回目の壁追加をundoし、redoで復元できる', () => {
    // 2つ壁を追加（history に2つのスナップショット）
    useEditorStore.getState().addWall(makeWall('uw1'));
    useEditorStore.getState().addWall(makeWall('uw2', 0, 0, 0, 5));
    expect(useEditorStore.getState().walls).toHaveLength(2);

    // undo → 1つ目の壁だけの状態に戻る
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().walls).toHaveLength(1);
    expect(useEditorStore.getState().walls[0].id).toBe('uw1');

    // redo → 2つ目の壁も復元
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().walls).toHaveLength(2);
  });
});
