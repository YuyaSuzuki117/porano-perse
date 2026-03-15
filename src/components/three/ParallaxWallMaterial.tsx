'use client';

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, useFrame } from '@react-three/fiber';
import { perlin2d } from '@/lib/perlin-noise-texture';

/* ─── 型定義 ─── */

export type ParallaxTextureType = 'brick' | 'tile' | 'stone';

export interface ParallaxWallMaterialProps {
  baseColor?: string;
  heightScale?: number;
  textureType?: ParallaxTextureType;
  quality?: 'high' | 'medium' | 'low';
  repeat?: [number, number];
}

/* ─── プロシージャルテクスチャ生成 ─── */

function generateBaseTexture(type: ParallaxTextureType, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  switch (type) {
    case 'brick': {
      // モルタル背景
      ctx.fillStyle = 'rgb(160,155,140)';
      ctx.fillRect(0, 0, size, size);
      const brickW = size / 4;
      const brickH = size / 8;
      const mortarW = size * 0.012;
      // レンガベースカラーパレット（自然な色バリエーション）
      const brickColors: [number, number, number][] = [
        [180, 90, 60], [170, 80, 50], [190, 95, 65], [165, 85, 55],
        [185, 88, 58], [175, 92, 62], [160, 78, 48], [195, 100, 70],
      ];
      let brickIdx = 0;
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 === 0 ? 0 : brickW / 2;
        for (let col = -1; col < 5; col++) {
          const bx = col * brickW + offset;
          const by = row * brickH;
          brickIdx++;
          // レンガごとに異なるベースカラーを選択
          const baseCol = brickColors[brickIdx % brickColors.length];

          // レンガ面にPerlinノイズベースのテクスチャを適用
          const innerX = Math.max(0, Math.round(bx + mortarW));
          const innerY = Math.max(0, Math.round(by + mortarW));
          const innerW = Math.min(Math.round(brickW - mortarW * 2), size - innerX);
          const innerH = Math.min(Math.round(brickH - mortarW * 2), size - innerY);
          if (innerW <= 0 || innerH <= 0) continue;

          const brickImageData = ctx.createImageData(innerW, innerH);
          const bd = brickImageData.data;
          for (let py = 0; py < innerH; py++) {
            for (let px = 0; px < innerW; px++) {
              // Perlinノイズで自然な色ムラと表面のザラつきを生成
              const nx = (px + brickIdx * 50) / 40;
              const ny = (py + brickIdx * 37) / 40;
              const surfaceNoise = perlin2d(nx, ny) * 12;
              const grainNoise = perlin2d(nx * 5, ny * 5) * 4;
              const combined = surfaceNoise + grainNoise * 0.4;

              const idx = (py * innerW + px) * 4;
              bd[idx]     = Math.max(0, Math.min(255, Math.round(baseCol[0] + combined)));
              bd[idx + 1] = Math.max(0, Math.min(255, Math.round(baseCol[1] + combined * 0.6)));
              bd[idx + 2] = Math.max(0, Math.min(255, Math.round(baseCol[2] + combined * 0.4)));
              bd[idx + 3] = 255;
            }
          }
          ctx.putImageData(brickImageData, innerX, innerY);

          // エッジの経年変化（角が丸くなった感じ）
          ctx.globalAlpha = 0.15;
          const edgeGrad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
          edgeGrad.addColorStop(0, 'rgba(0,0,0,0.1)');
          edgeGrad.addColorStop(0.15, 'transparent');
          edgeGrad.addColorStop(0.85, 'transparent');
          edgeGrad.addColorStop(1, 'rgba(0,0,0,0.08)');
          ctx.fillStyle = edgeGrad;
          ctx.fillRect(innerX, innerY, innerW, innerH);
          ctx.globalAlpha = 1;
        }
      }
      break;
    }
    case 'tile': {
      ctx.fillStyle = 'rgb(230,225,215)';
      ctx.fillRect(0, 0, size, size);
      const tileSize = size / 4;
      const grout = size * 0.008;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          ctx.fillStyle = `rgb(${220 + Math.floor(Math.random() * 15)},${215 + Math.floor(Math.random() * 15)},${205 + Math.floor(Math.random() * 15)})`;
          ctx.fillRect(col * tileSize + grout, row * tileSize + grout, tileSize - grout * 2, tileSize - grout * 2);
          // 溝
          ctx.fillStyle = 'rgb(180,175,165)';
          ctx.fillRect(col * tileSize, row * tileSize, tileSize, grout);
          ctx.fillRect(col * tileSize, row * tileSize, grout, tileSize);
        }
      }
      break;
    }
    case 'stone': {
      ctx.fillStyle = 'rgb(150,145,135)';
      ctx.fillRect(0, 0, size, size);
      // 不規則な石パターン
      for (let i = 0; i < 12; i++) {
        const sx = Math.random() * size;
        const sy = Math.random() * size;
        const sw = 40 + Math.random() * 80;
        const sh = 30 + Math.random() * 60;
        const sv = Math.floor(Math.random() * 30 - 15);
        ctx.fillStyle = `rgb(${145 + sv},${140 + sv},${130 + sv})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sw / 2, sh / 2, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        // エッジ
        ctx.strokeStyle = 'rgba(100,95,85,0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sw / 2, sh / 2, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
  }
  return canvas;
}

function generateHeightMap(type: ParallaxTextureType, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // ベース: 中間グレー
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, size, size);

  switch (type) {
    case 'brick': {
      const brickW = size / 4;
      const brickH = size / 8;
      const mortarW = size * 0.015;
      for (let row = 0; row < 8; row++) {
        const offset = row % 2 === 0 ? 0 : brickW / 2;
        for (let col = -1; col < 5; col++) {
          const x = col * brickW + offset;
          const y = row * brickH;
          // モルタル溝（低い）
          ctx.fillStyle = 'rgb(60,60,60)';
          ctx.fillRect(x - mortarW, y, mortarW * 2, brickH);
          ctx.fillRect(x, y - mortarW, brickW, mortarW * 2);
          // レンガ面（高い）
          ctx.fillStyle = 'rgb(180,180,180)';
          ctx.fillRect(x + mortarW, y + mortarW, brickW - mortarW * 2, brickH - mortarW * 2);
        }
      }
      break;
    }
    case 'tile': {
      const tileSize = size / 4;
      const grout = size * 0.012;
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          ctx.fillStyle = 'rgb(190,190,190)';
          ctx.fillRect(col * tileSize + grout, row * tileSize + grout, tileSize - grout * 2, tileSize - grout * 2);
          ctx.fillStyle = 'rgb(50,50,50)';
          ctx.fillRect(col * tileSize, row * tileSize, tileSize, grout);
          ctx.fillRect(col * tileSize, row * tileSize, grout, tileSize);
        }
      }
      break;
    }
    case 'stone': {
      for (let i = 0; i < 12; i++) {
        const sx = Math.random() * size;
        const sy = Math.random() * size;
        const sw = 40 + Math.random() * 80;
        const sh = 30 + Math.random() * 60;
        const brightness = 150 + Math.floor(Math.random() * 60);
        ctx.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sw / 2, sh / 2, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
        // 隙間
        ctx.strokeStyle = 'rgb(40,40,40)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sw / 2, sh / 2, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
  }
  return canvas;
}

/* ─── シェーダー ─── */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D baseMap;
  uniform sampler2D heightMap;
  uniform float heightScale;
  uniform int numSamples;
  uniform vec2 textureRepeat;

  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vNormal;

  vec2 parallaxOcclusionMapping(vec2 uv, vec3 viewDir) {
    float layerDepth = 1.0 / float(numSamples);
    float currentLayerDepth = 0.0;

    // viewDir を tangent space へ近似変換
    vec2 p = viewDir.xy / viewDir.z * heightScale;
    vec2 deltaUv = p / float(numSamples);

    vec2 currentUv = uv;
    float currentHeight = texture2D(heightMap, currentUv).r;

    for (int i = 0; i < 16; i++) {
      if (i >= numSamples) break;
      if (currentLayerDepth >= currentHeight) break;
      currentUv -= deltaUv;
      currentHeight = texture2D(heightMap, currentUv).r;
      currentLayerDepth += layerDepth;
    }

    // 前レイヤーとの線形補間
    vec2 prevUv = currentUv + deltaUv;
    float afterDepth = currentHeight - currentLayerDepth;
    float beforeDepth = texture2D(heightMap, prevUv).r - currentLayerDepth + layerDepth;
    float weight = afterDepth / (afterDepth - beforeDepth);
    return mix(currentUv, prevUv, weight);
  }

  void main() {
    vec2 scaledUv = vUv * textureRepeat;
    vec2 offsetUv = parallaxOcclusionMapping(scaledUv, vViewDir);
    vec4 color = texture2D(baseMap, offsetUv);

    // 簡易ライティング
    float diffuse = max(dot(vNormal, normalize(vec3(0.5, 1.0, 0.3))), 0.0);
    float ambient = 0.3;
    color.rgb *= (ambient + diffuse * 0.7);

    gl_FragColor = color;
  }
`;

/* ─── カスタムシェーダーマテリアル ─── */

const ParallaxShaderMaterial = shaderMaterial(
  {
    baseMap: new THREE.Texture(),
    heightMap: new THREE.Texture(),
    heightScale: 0.02,
    numSamples: 12,
    textureRepeat: new THREE.Vector2(1, 1),
  },
  vertexShader,
  fragmentShader,
);

extend({ ParallaxShaderMaterial });

// Three.jsの型拡張
declare module '@react-three/fiber' {
  interface ThreeElements {
    parallaxShaderMaterial: {
      baseMap?: THREE.Texture;
      heightMap?: THREE.Texture;
      heightScale?: number;
      numSamples?: number;
      textureRepeat?: THREE.Vector2;
      attach?: string;
      ref?: React.Ref<THREE.ShaderMaterial>;
    };
  }
}

/* ─── コンポーネント ─── */

const ParallaxWallMaterial: React.FC<ParallaxWallMaterialProps> = ({
  baseColor: _baseColor,
  heightScale = 0.02,
  textureType = 'brick',
  quality = 'medium',
  repeat = [1, 1],
}) => {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const texSize = quality === 'high' ? 1024 : quality === 'medium' ? 512 : 256;
  const sampleCount = quality === 'high' ? 16 : quality === 'medium' ? 12 : 8;

  const { baseMap, heightMap } = useMemo(() => {
    const baseCanvas = generateBaseTexture(textureType, texSize);
    const heightCanvas = generateHeightMap(textureType, texSize);

    const baseTex = new THREE.CanvasTexture(baseCanvas);
    baseTex.wrapS = THREE.RepeatWrapping;
    baseTex.wrapT = THREE.RepeatWrapping;

    const heightTex = new THREE.CanvasTexture(heightCanvas);
    heightTex.wrapS = THREE.RepeatWrapping;
    heightTex.wrapT = THREE.RepeatWrapping;

    return { baseMap: baseTex, heightMap: heightTex };
  }, [textureType, texSize]);

  const textureRepeat = useMemo(() => new THREE.Vector2(repeat[0], repeat[1]), [repeat]);

  // 低品質時はフォールバック
  if (quality === 'low') {
    return (
      <meshStandardMaterial
        attach="material"
        map={baseMap}
        roughness={0.8}
      />
    );
  }

  // useFrame でユニフォーム更新（再レンダリング不要な変更に対応）
  useFrame(() => {
    if (matRef.current) {
      const uniforms = (matRef.current as unknown as { uniforms: Record<string, THREE.IUniform> }).uniforms;
      if (uniforms) {
        uniforms.heightScale.value = Math.max(0, Math.min(0.05, heightScale));
      }
    }
  });

  return (
    <parallaxShaderMaterial
      ref={matRef}
      attach="material"
      baseMap={baseMap}
      heightMap={heightMap}
      heightScale={Math.max(0, Math.min(0.05, heightScale))}
      numSamples={sampleCount}
      textureRepeat={textureRepeat}
    />
  );
};

export default React.memo(ParallaxWallMaterial);
