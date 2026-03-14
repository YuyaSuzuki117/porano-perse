'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, createPortal } from '@react-three/fiber';

// --- 日本語コメント ---
// カメラ移動時にラジアルブラーオーバーレイを表示するモーションブラーエフェクト
// useFrame でカメラ速度を追跡し、高速移動時にブラー強度を自動調整
// ウォークスルー/ツアーモードでの臨場感向上に使用

interface MotionBlurEffectProps {
  /** エフェクトの有効/無効 */
  enabled?: boolean;
  /** ブラー強度 (0-1) */
  intensity?: number;
  /** ラジアルブラーのサンプル数 */
  samples?: number;
}

/** ラジアルブラー用フラグメントシェーダー */
const radialBlurFragmentShader = `
  uniform float uIntensity;
  uniform float uVelocity;
  uniform int uSamples;

  varying vec2 vUv;

  void main() {
    // 画面中心からの方向ベクトル
    vec2 center = vec2(0.5, 0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);

    // 速度に応じたブラー量
    float blurAmount = uIntensity * uVelocity * dist * 0.02;

    // ブラーが無い場合は完全透明
    if (blurAmount < 0.001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    // ラジアル方向に沿ったグラデーション（半透明の暗いオーバーレイ）
    vec2 normalizedDir = normalize(dir);

    // 外周ほど強いブラー効果を暗いオーバーレイで表現
    float alpha = blurAmount * dist * 2.0;
    alpha = clamp(alpha, 0.0, 0.4);

    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
  }
`;

/** バーテックスシェーダー（スクリーンスペースクワッド用） */
const screenQuadVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

/** スクリーンスペースクワッド用ジオメトリ（NDC座標 -1〜1） */
const screenQuadGeometry = new THREE.PlaneGeometry(2, 2);

/**
 * モーションブラーエフェクトコンポーネント
 * カメラの移動速度に応じてラジアルブラーオーバーレイを表示
 *
 * 使用例:
 * <MotionBlurEffect enabled={isWalkthroughMode} intensity={0.3} />
 */
export const MotionBlurEffect = React.memo(function MotionBlurEffect({
  enabled = true,
  intensity = 0.3,
  samples = 8,
}: MotionBlurEffectProps) {
  const { scene } = useThree();

  // 前フレームのカメラ位置を保持
  const prevCameraPos = useRef(new THREE.Vector3());
  const prevCameraRot = useRef(new THREE.Euler());
  // 現在の速度（スムーズ化済み）
  const currentVelocity = useRef(0);
  // 初期化フラグ
  const initialized = useRef(false);

  // シェーダーマテリアルのユニフォーム
  const uniforms = useMemo(
    () => ({
      uIntensity: { value: intensity },
      uVelocity: { value: 0.0 },
      uSamples: { value: samples },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // ユニフォームは ref 的に更新するので初回のみ生成
  );

  // シェーダーマテリアル
  const blurMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: screenQuadVertexShader,
        fragmentShader: radialBlurFragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    [uniforms]
  );

  // HUD シーン（メインシーンの上にオーバーレイ）
  const hudScene = useMemo(() => new THREE.Scene(), []);
  const hudCamera = useMemo(() => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    return cam;
  }, []);

  // フレームごとの速度計算とユニフォーム更新
  useFrame(({ camera, gl }) => {
    if (!enabled) {
      uniforms.uVelocity.value = 0;
      return;
    }

    // 初回フレームは前位置を初期化するだけ
    if (!initialized.current) {
      prevCameraPos.current.copy(camera.position);
      prevCameraRot.current.copy(camera.rotation);
      initialized.current = true;
      return;
    }

    // カメラの移動距離（位置変化 + 回転変化）
    const posDelta = camera.position.distanceTo(prevCameraPos.current);
    const rotDeltaX = Math.abs(camera.rotation.x - prevCameraRot.current.x);
    const rotDeltaY = Math.abs(camera.rotation.y - prevCameraRot.current.y);
    const rotDelta = rotDeltaX + rotDeltaY;

    // 速度を正規化 (位置+回転を組み合わせ)
    const rawVelocity = posDelta * 5.0 + rotDelta * 2.0;

    // スムーズ化（急激な変化を抑制）
    const smoothFactor = 0.15;
    currentVelocity.current =
      currentVelocity.current * (1 - smoothFactor) + rawVelocity * smoothFactor;

    // 閾値以下はブラー無し
    const clampedVelocity =
      currentVelocity.current < 0.02 ? 0 : Math.min(currentVelocity.current, 1.0);

    // ユニフォーム更新
    uniforms.uIntensity.value = intensity;
    uniforms.uVelocity.value = clampedVelocity;
    uniforms.uSamples.value = samples;

    // 前フレーム位置を保存
    prevCameraPos.current.copy(camera.position);
    prevCameraRot.current.copy(camera.rotation);

    // HUD シーンをメインシーンの後に描画
    if (clampedVelocity > 0) {
      gl.autoClear = false;
      gl.render(hudScene, hudCamera);
      gl.autoClear = true;
    }
  });

  if (!enabled) return null;

  // HUD シーンにオーバーレイクワッドをポータル描画
  return (
    <>
      {createPortal(
        <mesh geometry={screenQuadGeometry} material={blurMaterial} />,
        hudScene
      )}
    </>
  );
});

MotionBlurEffect.displayName = 'MotionBlurEffect';
