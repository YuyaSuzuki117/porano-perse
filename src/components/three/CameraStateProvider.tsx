'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { setCameraStateGetter } from '@/components/ui/CameraBookmarkPanel';

/**
 * R3Fキャンバス内に配置し、カメラの現在位置をUI側から取得可能にするブリッジコンポーネント。
 * CameraBookmarkPanel の setCameraStateGetter にゲッター関数を登録する。
 */
export function CameraStateProvider() {
  const { camera, controls } = useThree();

  useEffect(() => {
    setCameraStateGetter(() => {
      const position: [number, number, number] = [
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ];

      // OrbitControls の target を取得（あれば）
      let target: [number, number, number];
      const orbitControls = controls as unknown as { target?: THREE.Vector3 };
      if (orbitControls?.target) {
        target = [
          orbitControls.target.x,
          orbitControls.target.y,
          orbitControls.target.z,
        ];
      } else {
        // fallback: カメラの注視方向にデフォルトターゲットを推定
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        target = [
          camera.position.x + dir.x * 3,
          camera.position.y + dir.y * 3,
          camera.position.z + dir.z * 3,
        ];
      }

      return { position, target };
    });

    return () => {
      setCameraStateGetter(() => ({
        position: [0, 2, 5],
        target: [0, 0, 0],
      }));
    };
  }, [camera, controls]);

  return null;
}
