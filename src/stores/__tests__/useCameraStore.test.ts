import { describe, it, expect, beforeEach } from 'vitest';
import { useCameraStore } from '../useCameraStore';
import { LIGHTING_PRESETS } from '@/data/lighting-presets';

describe('useCameraStore', () => {
  beforeEach(() => {
    useCameraStore.setState({
      cameraPreset: null,
      cameraBookmarks: [],
      lightBrightness: 1.0,
      lightWarmth: 0.5,
      dayNight: 'day',
      activeLightingPreset: null,
    });
  });

  it('setCameraPreset: カメラプリセットを設定できる', () => {
    useCameraStore.getState().setCameraPreset('top');
    expect(useCameraStore.getState().cameraPreset).toBe('top');

    useCameraStore.getState().setCameraPreset(null);
    expect(useCameraStore.getState().cameraPreset).toBeNull();
  });

  it('addCameraBookmark/deleteCameraBookmark: ブックマークの追加・削除', () => {
    useCameraStore.getState().addCameraBookmark(
      '入口ビュー',
      [5, 3, 5],
      [0, 0, 0],
    );
    const bookmarks = useCameraStore.getState().cameraBookmarks;
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].name).toBe('入口ビュー');
    expect(bookmarks[0].position).toEqual([5, 3, 5]);

    useCameraStore.getState().deleteCameraBookmark(bookmarks[0].id);
    expect(useCameraStore.getState().cameraBookmarks).toHaveLength(0);
  });

  it('applyLightingPreset: ライティングプリセットが反映される', () => {
    const preset = LIGHTING_PRESETS[0]; // 自然光
    useCameraStore.getState().applyLightingPreset(preset);

    const state = useCameraStore.getState();
    expect(state.lightBrightness).toBe(preset.brightness);
    expect(state.lightWarmth).toBe(preset.warmth);
    expect(state.dayNight).toBe(preset.dayNight);
    expect(state.activeLightingPreset).toBe(preset.name);
  });
});
