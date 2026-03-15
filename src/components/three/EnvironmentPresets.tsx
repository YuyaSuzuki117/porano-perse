'use client';

import React, { useMemo } from 'react';
import { Environment } from '@react-three/drei';

// --- 日本語コメント ---
// drei の Environment コンポーネントをラップし、6種の環境プリセットを提供
// スタジオ・室内・屋外・夕暮れ・倉庫・夜間に対応
// 各プリセットは環境マップ・光強度・背景色を一括設定

/** 環境プリセット名 */
export type EnvironmentPresetName = 'studio' | 'indoor' | 'outdoor' | 'sunset' | 'warehouse' | 'night';

interface EnvironmentPresetsProps {
  /** 使用するプリセット名 */
  preset?: EnvironmentPresetName;
  /** 環境マップの強度倍率 (0-3) */
  intensity?: number;
  /** 背景に環境マップを表示するか */
  showBackground?: boolean;
}

/** drei の Environment preset に渡す名前マッピング */
type DreiPresetName = 'studio' | 'apartment' | 'park' | 'sunset' | 'warehouse' | 'night';

/** プリセット設定定義 */
interface PresetConfig {
  /** drei Environment の preset 名 */
  dreiPreset: DreiPresetName;
  /** 環境マップの強度 */
  envMapIntensity: number;
  /** 背景色 (showBackground=false 時に使用) */
  backgroundColor: string;
  /** 背景グラデーション上部の色 */
  backgroundGradientTop: string;
  /** 背景グラデーション下部の色 */
  backgroundGradientBottom: string;
}

/** 6種の環境プリセット定義 */
const PRESETS: Record<EnvironmentPresetName, PresetConfig> = {
  // スタジオ: 均一な柔らかい光、製品撮影向け（環境反射強化）
  studio: {
    dreiPreset: 'studio',
    envMapIntensity: 1.3,
    backgroundColor: '#e8e8e8',
    backgroundGradientTop: '#f5f5f5',
    backgroundGradientBottom: '#d0d0d0',
  },
  // 室内: 暖かみのあるアパートメント光、インテリア確認向け（反射品質向上のため強度増）
  indoor: {
    dreiPreset: 'apartment',
    envMapIntensity: 1.2,
    backgroundColor: '#f5ead6',
    backgroundGradientTop: '#fff5e6',
    backgroundGradientBottom: '#d4c4a8',
  },
  // 屋外: 自然光、明るいシーン
  outdoor: {
    dreiPreset: 'park',
    envMapIntensity: 1.2,
    backgroundColor: '#c8dce8',
    backgroundGradientTop: '#a0c4e8',
    backgroundGradientBottom: '#e0ead0',
  },
  // 夕暮れ: 暖色の低い太陽光、雰囲気確認向け
  sunset: {
    dreiPreset: 'sunset',
    envMapIntensity: 1.0,
    backgroundColor: '#f0c880',
    backgroundGradientTop: '#e8a040',
    backgroundGradientBottom: '#c8a070',
  },
  // 倉庫: 工業的な硬い光、実用的な確認向け
  warehouse: {
    dreiPreset: 'warehouse',
    envMapIntensity: 0.9,
    backgroundColor: '#b8b8b8',
    backgroundGradientTop: '#c8c8c8',
    backgroundGradientBottom: '#909090',
  },
  // 夜間: 暗い環境、照明デザイン確認向け
  night: {
    dreiPreset: 'night',
    envMapIntensity: 0.3,
    backgroundColor: '#1a1a2e',
    backgroundGradientTop: '#16213e',
    backgroundGradientBottom: '#0f0f1a',
  },
};

/**
 * 環境プリセットコンポーネント
 * drei の Environment をラップし、統一されたプリセット設定を提供
 *
 * 使用例:
 * <EnvironmentPresets preset="indoor" intensity={0.8} showBackground={false} />
 */
export const EnvironmentPresets = React.memo(function EnvironmentPresets({
  preset = 'studio',
  intensity = 1.0,
  showBackground = false,
}: EnvironmentPresetsProps) {
  const config = useMemo(() => PRESETS[preset], [preset]);

  // 最終的な環境マップ強度（プリセット値 × ユーザー指定倍率）
  const finalIntensity = useMemo(
    () => config.envMapIntensity * intensity,
    [config.envMapIntensity, intensity]
  );

  return (
    <>
      {/* drei Environment: HDR 環境マップを提供 */}
      <Environment
        preset={config.dreiPreset}
        background={showBackground}
        environmentIntensity={finalIntensity}
      />

      {/* showBackground=false の場合、単色の背景色を設定 */}
      {!showBackground && (
        <color attach="background" args={[config.backgroundColor]} />
      )}
    </>
  );
});

EnvironmentPresets.displayName = 'EnvironmentPresets';
