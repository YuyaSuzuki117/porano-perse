'use client';

import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Sphere } from '@react-three/drei';
import * as THREE from 'three';

interface SunSimulationProps {
  /** アニメーション有効フラグ */
  enabled: boolean;
  /** 時刻（0〜24、小数可） */
  timeOfDay: number;
  /** 緯度（デフォルト35＝東京） */
  latitude?: number;
  /** 時刻変更コールバック */
  onTimeChange: (time: number) => void;
}

// ────────────────────────────────────────────────
// 太陽位置の簡易計算
// ────────────────────────────────────────────────

/**
 * 簡易太陽位置アルゴリズム
 *
 * 時刻と緯度から太陽の仰角（elevation）と方位角（azimuth）を計算する。
 * 春分/秋分の近似として赤緯=0を仮定し、時角から位置を求める。
 */
function calculateSunPosition(
  timeOfDay: number,
  latitudeDeg: number,
): { elevation: number; azimuth: number } {
  const latRad = (latitudeDeg * Math.PI) / 180;

  // 時角: 正午=0、1時間=15度
  const hourAngle = ((timeOfDay - 12) * 15 * Math.PI) / 180;

  // 赤緯を0と仮定（春分/秋分近似）
  const declination = 0;

  // 仰角
  const sinElevation =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation)));

  // 方位角
  const cosAzimuth =
    (Math.sin(declination) - Math.sin(elevation) * Math.sin(latRad)) /
    (Math.cos(elevation) * Math.cos(latRad) + 1e-10);
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

  return { elevation, azimuth };
}

/**
 * 色温度をRGBに変換
 *
 * 仰角に応じてウォーム（日の出/日没）〜ニュートラル（正午）を補間。
 */
function sunColorFromElevation(elevation: number): THREE.Color {
  // 仰角を0〜1に正規化（0=地平線、1=天頂）
  const t = Math.max(0, Math.min(1, elevation / (Math.PI / 2)));

  // 日の出/日没: 暖色 (2200K相当) → 正午: ニュートラル (5500K相当)
  const warmColor = new THREE.Color(1.0, 0.6, 0.3); // 暖色
  const noonColor = new THREE.Color(1.0, 0.98, 0.92); // 昼光色
  const nightColor = new THREE.Color(0.1, 0.12, 0.2); // 夜間

  if (elevation < 0) {
    // 日没後: 暗い青紫
    return nightColor;
  }

  return warmColor.clone().lerp(noonColor, t);
}

/**
 * 太陽の強度を仰角に応じて計算
 */
function sunIntensityFromElevation(elevation: number): number {
  if (elevation < -0.1) return 0; // 夜
  if (elevation < 0.05) return 0.2; // 薄明
  // 仰角に比例（最大値2.5）
  return 0.5 + 2.0 * Math.max(0, Math.min(1, elevation / (Math.PI / 3)));
}

// ────────────────────────────────────────────────
// 定数
// ────────────────────────────────────────────────

/** シーン内での太陽の距離（見た目用） */
const SUN_DISTANCE = 30;
/** 太陽スプライトの半径 */
const SUN_SPRITE_RADIUS = 0.8;
/** アニメーション速度（秒/サイクル） */
const ANIMATION_SPEED = 0.02; // 1フレームあたりの時刻増分

// ────────────────────────────────────────────────
// コンポーネント
// ────────────────────────────────────────────────

/**
 * リアルタイム太陽シミュレーション
 *
 * 時刻と緯度に基づいて太陽（ディレクショナルライト）の位置・色・強度を計算し、
 * enabledの場合は自動的に時刻を進めてアニメーションする。
 */
export const SunSimulation = memo(function SunSimulation({
  enabled,
  timeOfDay,
  latitude = 35,
  onTimeChange,
}: SunSimulationProps) {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const sunMeshRef = useRef<THREE.Mesh>(null);
  const timeRef = useRef(timeOfDay);

  // 現在の時刻を同期
  timeRef.current = timeOfDay;

  // 太陽位置・色・強度を計算
  const sunState = useMemo(() => {
    const { elevation, azimuth } = calculateSunPosition(timeOfDay, latitude);
    const color = sunColorFromElevation(elevation);
    const intensity = sunIntensityFromElevation(elevation);

    // 太陽の3D位置（球面座標→直交座標）
    const x = SUN_DISTANCE * Math.cos(elevation) * Math.sin(azimuth);
    const y = SUN_DISTANCE * Math.sin(elevation);
    const z = SUN_DISTANCE * Math.cos(elevation) * Math.cos(azimuth);

    return { position: [x, y, z] as const, color, intensity, elevation };
  }, [timeOfDay, latitude]);

  // アニメーション有効時にフレームごとに時刻を進める
  useFrame(() => {
    if (!enabled) return;

    let newTime = timeRef.current + ANIMATION_SPEED;
    if (newTime >= 24) newTime -= 24;
    onTimeChange(newTime);
  });

  // 太陽が地平線より下の場合は非表示
  const isVisible = sunState.elevation > -0.05;

  return (
    <>
      {/* ディレクショナルライト（太陽光） */}
      <directionalLight
        ref={lightRef}
        position={[sunState.position[0], sunState.position[1], sunState.position[2]]}
        color={sunState.color}
        intensity={sunState.intensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.001}
      />

      {/* 太陽スプライト（ビルボード） */}
      {isVisible && (
        <Billboard
          position={[sunState.position[0], sunState.position[1], sunState.position[2]]}
          follow
          lockX={false}
          lockY={false}
          lockZ={false}
        >
          <Sphere ref={sunMeshRef} args={[SUN_SPRITE_RADIUS, 16, 16]}>
            <meshBasicMaterial
              color={sunState.color}
              transparent
              opacity={Math.min(1, sunState.intensity * 0.8)}
              toneMapped={false}
            />
          </Sphere>
        </Billboard>
      )}

      {/* 環境光（太陽の補助光、仰角に応じて調整） */}
      <ambientLight
        color={sunState.elevation > 0 ? '#b0c4de' : '#1a1a2e'}
        intensity={sunState.elevation > 0 ? 0.3 + sunState.intensity * 0.15 : 0.05}
      />
    </>
  );
});
