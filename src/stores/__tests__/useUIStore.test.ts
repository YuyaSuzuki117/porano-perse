import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../useUIStore';

describe('useUIStore', () => {
  beforeEach(() => {
    // Reset to defaults
    useUIStore.setState({
      activeTool: 'select',
      viewMode: 'split',
      zoom: 1,
      photoMode: false,
      photoModePrevState: null,
      showGrid: true,
      showDimensions: true,
    });
  });

  it('setActiveTool: ツールを切り替えられる', () => {
    useUIStore.getState().setActiveTool('wall');
    expect(useUIStore.getState().activeTool).toBe('wall');

    useUIStore.getState().setActiveTool('furniture');
    expect(useUIStore.getState().activeTool).toBe('furniture');
  });

  it('setViewMode: ビューモードを切り替えられる', () => {
    useUIStore.getState().setViewMode('3d');
    expect(useUIStore.getState().viewMode).toBe('3d');

    useUIStore.getState().setViewMode('2d');
    expect(useUIStore.getState().viewMode).toBe('2d');
  });

  it('zoom: ズーム操作ができる（クランプ 0.1〜5）', () => {
    useUIStore.getState().setZoom(2.5);
    expect(useUIStore.getState().zoom).toBe(2.5);

    // 上限超えはクランプ
    useUIStore.getState().setZoom(10);
    expect(useUIStore.getState().zoom).toBe(5);

    // 下限超えはクランプ
    useUIStore.getState().setZoom(0.01);
    expect(useUIStore.getState().zoom).toBe(0.1);
  });

  it('setPhotoMode: フォトモードでgrid/dimensionsが非表示になり、解除で復帰する', () => {
    // 初期状態: grid/dimensions = true
    expect(useUIStore.getState().showGrid).toBe(true);
    expect(useUIStore.getState().showDimensions).toBe(true);

    useUIStore.getState().setPhotoMode(true);
    expect(useUIStore.getState().photoMode).toBe(true);
    expect(useUIStore.getState().viewMode).toBe('3d');
    expect(useUIStore.getState().showGrid).toBe(false);
    expect(useUIStore.getState().showDimensions).toBe(false);

    useUIStore.getState().setPhotoMode(false);
    expect(useUIStore.getState().photoMode).toBe(false);
    expect(useUIStore.getState().showGrid).toBe(true);
    expect(useUIStore.getState().showDimensions).toBe(true);
  });
});
