'use client';

import { useMemo } from 'react';
import { StyleConfig } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';

// スタイル別照明プリセット（色温度・強度倍率）
const STYLE_LIGHTING: Record<string, {
  color: string;
  intensityMult: number;
  downlightIntensityMult: number;
  indirectIntensityMult: number;
  shadowSoftness: number;
}> = {
  japanese:     { color: '#FFE4C0', intensityMult: 0.85, downlightIntensityMult: 0.7, indirectIntensityMult: 1.2, shadowSoftness: 0.9 },
  cafe:         { color: '#FFD9B0', intensityMult: 0.9,  downlightIntensityMult: 0.8, indirectIntensityMult: 1.1, shadowSoftness: 0.85 },
  luxury:       { color: '#FFE8C8', intensityMult: 0.8,  downlightIntensityMult: 0.6, indirectIntensityMult: 0.9, shadowSoftness: 0.7 },
  industrial:   { color: '#F0F0FF', intensityMult: 1.1,  downlightIntensityMult: 1.0, indirectIntensityMult: 0.6, shadowSoftness: 0.5 },
  modern:       { color: '#F8F8F8', intensityMult: 1.0,  downlightIntensityMult: 0.9, indirectIntensityMult: 0.8, shadowSoftness: 0.7 },
  medical:      { color: '#F0F5FF', intensityMult: 1.15, downlightIntensityMult: 1.2, indirectIntensityMult: 1.0, shadowSoftness: 0.95 },
  scandinavian: { color: '#FFF5E6', intensityMult: 1.0,  downlightIntensityMult: 0.9, indirectIntensityMult: 1.0, shadowSoftness: 0.8 },
  retro:        { color: '#FFD4A0', intensityMult: 0.9,  downlightIntensityMult: 0.7, indirectIntensityMult: 1.0, shadowSoftness: 0.8 },
  minimal:      { color: '#FFFFFF', intensityMult: 1.0,  downlightIntensityMult: 0.9, indirectIntensityMult: 0.7, shadowSoftness: 0.7 },
};

interface LightingRigProps {
  style: StyleConfig;
  walls: WallSegment[];
  roomHeight: number;
  brightness?: number;
  warmth?: number;
  /** 描画品質レベル */
  qualityLevel?: 'high' | 'medium' | 'low';
}

interface DownlightPosition {
  x: number;
  z: number;
}

function lerpColor(cold: string, warm: string, t: number): string {
  const c = parseInt(cold.replace('#', ''), 16);
  const w = parseInt(warm.replace('#', ''), 16);
  const r = Math.round(((c >> 16) & 0xff) * (1 - t) + ((w >> 16) & 0xff) * t);
  const g = Math.round(((c >> 8) & 0xff) * (1 - t) + ((w >> 8) & 0xff) * t);
  const b = Math.round((c & 0xff) * (1 - t) + (w & 0xff) * t);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function LightingRig({ style, walls, roomHeight, brightness = 1.0, warmth = 0.5, qualityLevel = 'high' }: LightingRigProps) {
  const roomBounds = useMemo(() => {
    if (walls.length === 0) return { cx: 0, cz: 0, w: 8, d: 6, maxDim: 8 };
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const w = maxX - minX;
    const d = maxY - minY;
    return { cx: (minX + maxX) / 2, cz: (minY + maxY) / 2, w, d, maxDim: Math.max(w, d, roomHeight) };
  }, [walls, roomHeight]);

  const isWarmStyle = style.name === 'japanese' || style.name === 'cafe' || style.name === 'luxury' || style.name === 'retro';
  const effectiveWarmth = isWarmStyle ? Math.max(warmth, 0.5) : warmth;

  // スタイル別照明プリセット
  const styleLighting = STYLE_LIGHTING[style.name] || STYLE_LIGHTING.modern;

  // Color based on warmth slider + スタイル別色温度をブレンド
  const baseLightColor = lerpColor('#E0E8FF', '#FFF0D0', effectiveWarmth);
  const lightColor = lerpColor(baseLightColor, styleLighting.color, 0.5);
  const ambientColor = lerpColor('#FFFFFF', '#FFF5E8', effectiveWarmth);
  const fillColor = lerpColor(lerpColor('#E0E8FF', '#FFE8D0', effectiveWarmth), styleLighting.color, 0.3);

  // スタイル別強度倍率を適用
  const b = brightness * styleLighting.intensityMult;

  // 天井ダウンライトグリッド計算（品質レベルで上限を制限）
  const maxDownlights = qualityLevel === 'low' ? 6 : qualityLevel === 'medium' ? 12 : 20;
  const downlights = useMemo((): DownlightPosition[] => {
    const cols = Math.max(2, Math.ceil(roomBounds.w / 2.5));
    const rows = Math.max(2, Math.ceil(roomBounds.d / 2.5));
    const lights: DownlightPosition[] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (lights.length >= maxDownlights) break;
        lights.push({
          x: roomBounds.cx - roomBounds.w / 2 + (i + 0.5) * (roomBounds.w / cols),
          z: roomBounds.cz - roomBounds.d / 2 + (j + 0.5) * (roomBounds.d / rows),
        });
      }
      if (lights.length >= maxDownlights) break;
    }
    return lights;
  }, [roomBounds, maxDownlights]);

  // ダウンライト1個あたりの強度（合計が一定になるよう分散）
  const downlightIntensity = useMemo(() => {
    const totalIntensity = style.spotlightIntensity * 0.3 * b * styleLighting.downlightIntensityMult;
    return (totalIntensity / downlights.length) * 4;
  }, [style.spotlightIntensity, b, styleLighting.downlightIntensityMult, downlights.length]);

  return (
    <>
      <ambientLight intensity={style.ambientIntensity * b} color={ambientColor} />

      {/* メインHemisphereLight */}
      <hemisphereLight
        color="#B0D0F0"
        groundColor="#4A3520"
        intensity={0.6 * b}
      />

      {/* バウンスライト（床からの間接光シミュレーション）— lowモードでは省略 */}
      {qualityLevel !== 'low' && (
        <hemisphereLight
          color="#8B7355"
          groundColor={lerpColor('#F5E6D3', styleLighting.color, 0.3)}
          intensity={0.35 * b * styleLighting.indirectIntensityMult}
          position={[roomBounds.cx, 0.1, roomBounds.cz]}
        />
      )}

      <directionalLight
        position={[
          roomBounds.cx + roomBounds.w * 0.6,
          roomHeight * 2.5,
          roomBounds.cz + roomBounds.d * 0.4,
        ]}
        intensity={1.2 * b}
        color={lightColor}
        castShadow
        shadow-mapSize={qualityLevel === 'low' ? [1024, 1024] : qualityLevel === 'medium' ? [2048, 2048] : [4096, 4096]}
        shadow-bias={-0.0003}
        shadow-radius={qualityLevel === 'high' ? 6 : 4}
        shadow-normalBias={0.03}
        shadow-camera-near={0.1}
        shadow-camera-far={roomBounds.maxDim * 2.5}
        shadow-camera-left={-roomBounds.maxDim * 0.8}
        shadow-camera-right={roomBounds.maxDim * 0.8}
        shadow-camera-top={roomBounds.maxDim * 0.8}
        shadow-camera-bottom={-roomBounds.maxDim * 0.8}
      />

      <pointLight
        position={[roomBounds.cx, roomHeight - 0.2, roomBounds.cz]}
        intensity={style.spotlightIntensity * b}
        color={lightColor}
        distance={Math.max(roomBounds.w, roomBounds.d) * 3}
        castShadow
        shadow-mapSize={qualityLevel === 'low' ? [512, 512] : qualityLevel === 'medium' ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.001}
        shadow-normalBias={0.02}
      />

      <spotLight
        position={[
          roomBounds.cx - roomBounds.w * 0.3,
          roomHeight - 0.1,
          roomBounds.cz - roomBounds.d * 0.3,
        ]}
        target-position={[roomBounds.cx, 0, roomBounds.cz]}
        angle={Math.PI / 4}
        penumbra={styleLighting.shadowSoftness}
        intensity={style.spotlightIntensity * 0.6 * b}
        color={lightColor}
        distance={Math.max(roomBounds.w, roomBounds.d) * 2}
        castShadow
        shadow-mapSize={qualityLevel === 'low' ? [512, 512] : qualityLevel === 'medium' ? [1024, 1024] : [2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />

      <spotLight
        position={[
          roomBounds.cx + roomBounds.w * 0.3,
          roomHeight - 0.1,
          roomBounds.cz + roomBounds.d * 0.3,
        ]}
        target-position={[roomBounds.cx, 0, roomBounds.cz]}
        angle={Math.PI / 4}
        penumbra={styleLighting.shadowSoftness}
        intensity={style.spotlightIntensity * 0.5 * b}
        color={lightColor}
        distance={Math.max(roomBounds.w, roomBounds.d) * 2}
      />

      <pointLight
        position={[
          roomBounds.cx - roomBounds.w * 0.4,
          roomHeight * 0.5,
          roomBounds.cz - roomBounds.d * 0.4,
        ]}
        intensity={style.spotlightIntensity * 0.3 * b}
        color={fillColor}
        distance={Math.max(roomBounds.w, roomBounds.d) * 2}
      />

      {effectiveWarmth > 0.5 && (
        <>
          <pointLight
            position={[roomBounds.cx + roomBounds.w * 0.4, roomHeight * 0.3, roomBounds.cz]}
            intensity={0.4 * b * (effectiveWarmth - 0.5) * 2}
            color="#FFD090"
            distance={roomBounds.w}
          />
          {/* lowモードでは暖色補助光を1つに削減 */}
          {qualityLevel !== 'low' && (
            <pointLight
              position={[roomBounds.cx, roomHeight * 0.3, roomBounds.cz + roomBounds.d * 0.4]}
              intensity={0.3 * b * (effectiveWarmth - 0.5) * 2}
              color="#FFD090"
              distance={roomBounds.d}
            />
          )}
        </>
      )}

      {/* 天井ダウンライトグリッド */}
      {downlights.map((dl, i) => (
        <spotLight
          key={`dl-${i}`}
          position={[dl.x, roomHeight - 0.05, dl.z]}
          target-position={[dl.x, 0, dl.z]}
          angle={Math.PI / 6}
          penumbra={0.8}
          intensity={downlightIntensity}
          color={lightColor}
          distance={roomHeight * 1.5}
          decay={2}
        />
      ))}

      {/* フィルライト（反対側からの柔らかな補助光）— lowモードでは無効 */}
      {qualityLevel !== 'low' && (
        <directionalLight
          position={[
            roomBounds.cx - roomBounds.w * 0.6,
            roomHeight * 2.0,
            roomBounds.cz - roomBounds.d * 0.4,
          ]}
          intensity={1.2 * 0.3 * b}
          color={fillColor}
          castShadow
          shadow-mapSize={qualityLevel === 'medium' ? [1024, 1024] : [2048, 2048]}
          shadow-bias={-0.0003}
          shadow-radius={qualityLevel === 'high' ? 4 : 2}
          shadow-normalBias={0.03}
          shadow-camera-near={0.1}
          shadow-camera-far={roomBounds.maxDim * 2.5}
          shadow-camera-left={-roomBounds.maxDim * 0.8}
          shadow-camera-right={roomBounds.maxDim * 0.8}
          shadow-camera-top={roomBounds.maxDim * 0.8}
          shadow-camera-bottom={-roomBounds.maxDim * 0.8}
        />
      )}

      {/* コンタクトシャドウ風グラウンドプレーン */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[roomBounds.cx, 0.001, roomBounds.cz]} receiveShadow>
        <planeGeometry args={[roomBounds.w + 2, roomBounds.d + 2]} />
        <shadowMaterial transparent opacity={0.3} />
      </mesh>

      {/* リムライト（奥行き感向上） */}
      <directionalLight
        position={[
          roomBounds.cx - roomBounds.w * 0.5,
          roomHeight * 1.5,
          roomBounds.cz - roomBounds.d * 0.3,
        ]}
        intensity={0.3 * b}
        color={fillColor}
      />
    </>
  );
}
