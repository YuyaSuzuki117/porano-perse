'use client';

/**
 * ToneMappingController — renderStyle に応じてトーンマッピングを動的に切り替え
 *
 * blueprintモードではACESトーンマッピングが暗色を持ち上げてしまうため、
 * NoToneMappingに切り替えてシェーダー出力をそのまま画面に反映する。
 * 他のモードではACESを維持。
 *
 * Canvas内に配置するReact Three Fiberコンポーネント。
 */

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface ToneMappingControllerProps {
  renderStyle: 'realistic' | 'sketch' | 'colored-pencil' | 'watercolor' | 'blueprint';
}

export function ToneMappingController({ renderStyle }: ToneMappingControllerProps) {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    if (renderStyle === 'blueprint') {
      // blueprintモード: トーンマッピング無効 + sRGB出力で正確な暗紺を表示
      gl.toneMapping = THREE.NoToneMapping;
      gl.toneMappingExposure = 1.0;
      gl.outputColorSpace = THREE.SRGBColorSpace;
    } else {
      // 他のモード: ACES復元 + sRGB出力
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.outputColorSpace = THREE.SRGBColorSpace;
    }
  }, [gl, renderStyle]);

  return null;
}
