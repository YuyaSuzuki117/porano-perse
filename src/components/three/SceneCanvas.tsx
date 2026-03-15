'use client';

import React, { Suspense, useRef, useCallback, useMemo, lazy, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, ContactShadows, Stats, Html } from '@react-three/drei';
import * as THREE from 'three';
import { WallMeshGroup } from './WallMeshGroup';
import { FloorMesh } from './FloorMesh';
import { CeilingMesh } from './CeilingMesh';
import { LightingRig } from './LightingRig';
import { Furniture } from './Furniture';
import { CameraController } from './CameraController';
import { CameraStateProvider } from './CameraStateProvider';
import { WalkthroughControls } from './WalkthroughControls';
import { RoomDimensionLabel } from './RoomDimensionLabel';
import { WallDecorations } from './WallDecorations';
import { WallNiches } from './WallNiches';
import { WindowLightBeams } from './WindowLightBeams';
import { FurnitureRug } from './FurnitureRug';
import { AnnotationMarkers, AnnotationPlacement } from './AnnotationMarkers';
import { PerformanceManager } from './PerformanceManager';
import { OcclusionCullingProvider, useVisibleFurniture } from './OcclusionCullingProvider';
import { Baseboards } from './Baseboards';
import { Wainscoting } from './Wainscoting';
import { CeilingBeams } from './CeilingBeams';
import { DustParticles } from './DustParticles';
import PanoramaExporter from './PanoramaExporter';
import { FlowHeatmap } from './FlowHeatmap';
import { LightingAnalysis } from './LightingAnalysis';
import { HumanFigure } from './HumanFigure';
import { EnvironmentPresets } from './EnvironmentPresets';
import { MotionBlurEffect } from './MotionBlurEffect';
import { LightGlow } from './LightGlow';
import FlowSimulation from './FlowSimulation';
import { ReferenceImageOverlay } from './ReferenceImageOverlay';
import { CollisionHeatmap } from './CollisionHeatmap';
import PlacementPreview from './PlacementPreview';
import { GodRays } from './GodRays';
import { LensFlare } from './LensFlare';
import { WetFloorEffect } from './WetFloorEffect';
import { ProceduralSkybox } from './ProceduralSkybox';
import { AreaLightSystem } from './AreaLightSystem';
import { GlassCondensation } from './GlassCondensation';
import { CausticEffect } from './CausticEffect';
import { SunSimulation } from './SunSimulation';
import { AcousticVisualization } from './AcousticVisualization';
import { WindowDoorFrame3D } from './WindowDoorFrame3D';
import { EvacuationOverlay } from './EvacuationOverlay';
import { ElectricalOverlay } from './ElectricalOverlay';
import { HVACVisualization } from './HVACVisualization';
import { SmokeParticles } from './SmokeParticles';
import FloorReflection from './FloorReflection';
import AmbientOcclusionPlanes from './AmbientOcclusionPlanes';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';
import { useUIStore } from '@/stores/useUIStore';
import { STYLE_PRESETS } from '@/data/styles';
import { StyleConfig } from '@/types/scene';

// ── 遅延ロード: PostProcessing (heavy, medium/high品質のみ使用) ──
const LazyPostProcessing = lazy(() => import('./PostProcessingEffects'));

/** オクルージョンカリング対応の家具リスト */
import type { FurnitureItem } from '@/types/scene';

interface OccludedFurnitureListProps {
  furniture: FurnitureItem[];
  selectedFurniture: string | null;
  selectedFurnitureIds: string[];
  deletingFurnitureIds: string[];
  onSelectFurniture: (id: string | null) => void;
  onToggleFurnitureSelection?: (id: string) => void;
  onMoveFurniture: (id: string, position: [number, number, number]) => void;
  qualityLevel: 'high' | 'medium' | 'low';
}

const OccludedFurnitureList = React.memo(function OccludedFurnitureList({
  furniture,
  selectedFurniture,
  selectedFurnitureIds,
  deletingFurnitureIds,
  onSelectFurniture,
  onToggleFurnitureSelection,
  onMoveFurniture,
  qualityLevel,
}: OccludedFurnitureListProps) {
  const visibleIds = useVisibleFurniture();

  return (
    <>
      {furniture.map((item) => {
        // 選択中の家具は常に表示、それ以外はオクルージョンカリングに従う
        const isSelected = selectedFurniture === item.id || selectedFurnitureIds.includes(item.id);
        if (!isSelected && !visibleIds.has(item.id)) return null;

        return (
          <Furniture
            key={item.id}
            item={item}
            selected={isSelected}
            isDeleting={deletingFurnitureIds.includes(item.id)}
            onSelect={onSelectFurniture}
            onToggleSelect={onToggleFurnitureSelection}
            onMove={onMoveFurniture}
            qualityLevel={qualityLevel}
          />
        );
      })}
    </>
  );
});

interface SceneCanvasProps {
  selectedFurniture: string | null;
  selectedFurnitureIds?: string[];
  onSelectFurniture: (id: string | null) => void;
  onToggleFurnitureSelection?: (id: string) => void;
  onMoveFurniture: (id: string, position: [number, number, number]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  panoramaTrigger?: boolean;
  onPanoramaComplete?: () => void;
}

export function SceneCanvas({
  selectedFurniture,
  selectedFurnitureIds = [],
  onSelectFurniture,
  onToggleFurnitureSelection,
  onMoveFurniture,
  canvasRef,
  panoramaTrigger = false,
  onPanoramaComplete,
}: SceneCanvasProps) {
  const walls = useEditorStore((s) => s.walls);
  const openings = useEditorStore((s) => s.openings);
  const roomLabels = useEditorStore((s) => s.roomLabels);
  const furniture = useEditorStore((s) => s.furniture);
  const styleName = useEditorStore((s) => s.style);
  const roomHeight = useEditorStore((s) => s.roomHeight);
  const showGrid = useUIStore(s => s.showGrid);
  const showDimensions = useUIStore(s => s.showDimensions);
  const showFurniture = useUIStore(s => s.showFurniture);
  const dayNight = useCameraStore((s) => s.dayNight);
  const fogDistance = useCameraStore((s) => s.fogDistance);
  const lightBrightness = useCameraStore((s) => s.lightBrightness);
  const lightWarmth = useCameraStore((s) => s.lightWarmth);
  const qualityLevel = useCameraStore((s) => s.qualityLevel);
  const wallDisplayMode = useUIStore(s => s.wallDisplayMode);
  const isDraggingFurniture = useUIStore(s => s.isDraggingFurniture);
  const isFirstPersonMode = useCameraStore((s) => s.isFirstPersonMode);
  const isAutoWalkthrough = useCameraStore((s) => s.isAutoWalkthrough);
  const annotations = useEditorStore((s) => s.annotations);
  const showAnnotations = useUIStore(s => s.showAnnotations);
  const activeTool = useUIStore(s => s.activeTool);
  const showFlowHeatmap = useUIStore(s => s.showFlowHeatmap);
  const showLightingAnalysis = useUIStore(s => s.showLightingAnalysis);
  const deletingFurnitureIds = useEditorStore((s) => s.deletingFurnitureIds);
  const photoMode = useUIStore(s => s.photoMode);
  const showHumanFigures = useCameraStore((s) => s.showHumanFigures);
  const environmentPreset = useCameraStore((s) => s.environmentPreset);
  const motionBlurEnabled = useCameraStore((s) => s.motionBlurEnabled);
  const showLightGlow = useCameraStore((s) => s.showLightGlow);
  const showFlowSimulation = useCameraStore((s) => s.showFlowSimulation);
  const referenceImageUrl = useCameraStore((s) => s.referenceImageUrl);
  const referenceImageOpacity = useCameraStore((s) => s.referenceImageOpacity);
  const showCollisionHeatmap = useUIStore(s => s.showCollisionHeatmap);
  const showGodRays = useCameraStore((s) => s.showGodRays);
  const godRayIntensity = useCameraStore((s) => s.godRayIntensity);
  const wetFloorEnabled = useCameraStore((s) => s.wetFloorEnabled);
  const wetFloorWetness = useCameraStore((s) => s.wetFloorWetness);
  const showLensFlare = useCameraStore((s) => s.showLensFlare);
  const skyTimeOfDay = useCameraStore((s) => s.skyTimeOfDay);
  const showProceduralSky = useCameraStore((s) => s.showProceduralSky);
  const showAreaLights = useCameraStore((s) => s.showAreaLights);
  const glassCondensation = useCameraStore((s) => s.glassCondensation);
  const showCaustics = useCameraStore((s) => s.showCaustics);
  const causticsIntensity = useCameraStore((s) => s.causticsIntensity);
  const showSunSimulation = useCameraStore((s) => s.showSunSimulation);
  const showAcoustics = useCameraStore((s) => s.showAcoustics);
  const showWindowDoorFrames = useCameraStore((s) => s.showWindowDoorFrames);
  const showEvacuation = useCameraStore((s) => s.showEvacuation);
  const showElectrical = useCameraStore((s) => s.showElectrical);
  const showHVAC = useCameraStore((s) => s.showHVAC);
  const showSmoke = useCameraStore((s) => s.showSmoke);
  const renderStyle = useCameraStore((s) => s.renderStyle);
  const setSkyTimeOfDay = useCameraStore((s) => s.setSkyTimeOfDay);
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);
  const deleteAnnotation = useEditorStore((s) => s.deleteAnnotation);
  const addAnnotation = useEditorStore((s) => s.addAnnotation);
  const setActiveTool = useUIStore(s => s.setActiveTool);

  // エキスパートモード: 高度なエフェクトはエキスパートのみ表示
  const [isExpert, setIsExpert] = useState(false);
  useEffect(() => {
    const stored = typeof localStorage !== 'undefined' && localStorage.getItem('porano-perse-expert-mode') === 'true';
    setIsExpert(stored);
    const handler = () => setIsExpert(localStorage.getItem('porano-perse-expert-mode') === 'true');
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const styleConfig: StyleConfig = STYLE_PRESETS[styleName];
  const controlsRef = useRef(null);

  const isNight = dayNight === 'night';
  const isSketchStyle = renderStyle === 'sketch' || renderStyle === 'watercolor' || renderStyle === 'colored-pencil';

  // スタイル別背景色（上部 / 下部のグラデーション用ペア）
  const { bgColor, bgGradient } = useMemo(() => {
    // スケッチモード: 紙色（グラデーション無し）
    if (isSketchStyle) {
      return { bgColor: '#faf8f0', bgGradient: null as null };
    }
    if (!isNight) {
      // 昼: 上が明るく、下がやや暗い → 空間の奥行き感
      return { bgColor: '#ebebeb', bgGradient: { top: '#f5f5f5', bottom: '#e0e0e0' } };
    }
    const nightBgMap: Record<string, { bg: string; top: string; bottom: string }> = {
      luxury: { bg: '#1a1520', top: '#201a28', bottom: '#120e18' },
      japanese: { bg: '#1a1a18', top: '#201f1c', bottom: '#121210' },
      medical: { bg: '#161820', top: '#1c1e28', bottom: '#0e1018' },
      industrial: { bg: '#181818', top: '#1e1e1e', bottom: '#101010' },
    };
    const n = nightBgMap[styleName] || { bg: '#1a1a2e', top: '#202038', bottom: '#121224' };
    return { bgColor: n.bg, bgGradient: { top: n.top, bottom: n.bottom } };
  }, [isNight, isSketchStyle, styleName]);

  const envPreset = isNight ? 'night' : 'apartment';
  const effectiveBrightness = isNight ? lightBrightness * 0.4 : lightBrightness;
  const effectiveWarmth = isNight ? Math.max(lightWarmth, 0.6) : lightWarmth;
  const bloomIntensity = isNight ? 0.6 : 0.3;
  const vignetteIntensity = isNight ? 0.6 : 0.4;

  const { cameraPosition, cameraTarget, gridSize, maxDim } = useMemo(() => {
    if (walls.length === 0) {
      return {
        cameraPosition: [3, 2.5, 3] as [number, number, number],
        cameraTarget: [0, 1, 0] as [number, number, number],
        gridSize: { w: 8, d: 6 },
        maxDim: 8,
      };
    }
    const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
    const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    const maxDim = Math.max(w, d, roomHeight);

    return {
      // 室内に入った俯瞰視点: 手前コーナー付近から部屋中央を見下ろす
      cameraPosition: [cx + w * 0.3, roomHeight * 0.85, cz + d * 0.35] as [number, number, number],
      cameraTarget: [cx, roomHeight * 0.3, cz] as [number, number, number],
      gridSize: { w, d },
      maxDim,
    };
  }, [walls, roomHeight]);

  // タスク1: 部屋サイズに応じた動的FOV計算
  const dynamicFov = useMemo(() => {
    return Math.max(40, Math.min(65, 70 - maxDim * 2));
  }, [maxDim]);

  // タスク2: 部屋サイズ連動SSAOパラメータ — ソフトで自然なAO（半径大・強度控えめ）
  const ssaoRadius = useMemo(() => Math.max(0.08, Math.min(0.5, maxDim * 0.035)), [maxDim]);
  const ssaoIntensity = useMemo(() => Math.max(5, Math.min(15, 18 - maxDim * 0.8)), [maxDim]);

  // タスク2: 照明連動Bloom luminanceThreshold
  const bloomLuminanceThreshold = useMemo(() => {
    return isNight ? 0.5 : Math.max(0.7, 1.0 - lightBrightness / 200);
  }, [isNight, lightBrightness]);

  // 暖色スタイル判定（トーンマッピング露出補正用）
  const isWarmStyle = styleName === 'japanese' || styleName === 'cafe' || styleName === 'luxury' || styleName === 'retro';

  // 品質レベル連動トーンマッピング・シャドウマップ設定
  const handleCanvasCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    // 暖色スタイルは若干露出を上げて明るく温かみのある印象に
    const warmBoost = isWarmStyle ? 0.10 : 0.02;
    gl.toneMappingExposure = isNight
      ? 0.80 + lightBrightness / 450
      : 1.25 + lightBrightness / 250 + warmBoost;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.localClippingEnabled = true;
    // sketch/watercolorモード: シャドウ無効（軽量レンダリング）
    if (isSketchStyle) {
      gl.shadowMap.enabled = false;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }
    // lowモード: シャドウ完全無効 + ピクセル比1.0制限
    else if (qualityLevel === 'low') {
      gl.shadowMap.enabled = false;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    } else if (!isSketchStyle) {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, qualityLevel === 'high' ? 2.5 : 1.5));
      // high品質: 物理ベースライト減衰（リアルな光の落ち方）
      if (qualityLevel === 'high') {
        // Three.js r155+: renderer.useLegacyLights は非推奨だが光減衰に影響
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (gl as any).useLegacyLights = false;
      }
    }
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = gl.domElement;
    }
  }, [canvasRef, isNight, isWarmStyle, isSketchStyle, lightBrightness, qualityLevel]);

  const handlePointerMissed = useCallback(() => {
    onSelectFurniture(null);
  }, [onSelectFurniture]);

  const handleAnnotationPlace = useCallback((position: [number, number, number]) => {
    const text = window.prompt('注釈テキストを入力:');
    if (text && text.trim()) {
      addAnnotation(text.trim(), position);
      setActiveTool('select');
    }
  }, [addAnnotation, setActiveTool]);

  return (
    <Canvas
      shadows
      dpr={qualityLevel === 'low' ? [1, 1.5] : [1, 2]}
      gl={{ antialias: qualityLevel !== 'low', preserveDrawingBuffer: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true, ...(qualityLevel === 'high' ? { samples: 4 } : {}) }}
      camera={{
        position: cameraPosition,
        fov: dynamicFov,
        near: 0.01,
        far: 200,
      }}
      performance={{ min: 0.5, max: 1 }}
      onCreated={handleCanvasCreated}
      onPointerMissed={handlePointerMissed}
      style={{ background: bgGradient ? `linear-gradient(to bottom, ${bgGradient.top}, ${bgGradient.bottom})` : bgColor }}
    >
      <Suspense fallback={null}>
        {/* lowモード・スケッチモードではfog無効 */}
        {qualityLevel !== 'low' && !isSketchStyle && (
          <fog attach="fog" args={[bgColor, fogDistance * 0.7, fogDistance * 1.15]} />
        )}

        <LightingRig style={styleConfig} walls={walls} roomHeight={roomHeight} brightness={effectiveBrightness} warmth={effectiveWarmth} qualityLevel={qualityLevel} />
        <EnvironmentPresets
          preset={isNight ? 'night' : (environmentPreset as 'studio' | 'indoor' | 'outdoor' | 'sunset' | 'warehouse' | 'night')}
          intensity={qualityLevel === 'high' ? 1.8 : qualityLevel === 'medium' ? 1.2 : 0.6}
          showBackground={false}
        />

        <WallMeshGroup walls={walls} openings={openings} style={styleConfig} />
        {/* 壁非表示モードでは装飾・ニッチもレンダリングしない */}
        {wallDisplayMode !== 'hidden' && (
          <WallDecorations walls={walls} openings={openings} roomHeight={roomHeight} style={styleConfig} />
        )}
        {wallDisplayMode !== 'hidden' && (
          <WallNiches walls={walls} openings={openings} roomHeight={roomHeight} style={styleConfig} />
        )}
        <FloorMesh walls={walls} style={styleConfig} />
        {!isSketchStyle && <FloorReflection />}
        <CeilingMesh walls={walls} roomHeight={roomHeight} style={styleConfig} />

        {/* 擬似AO: コーナーダークニング */}
        <AmbientOcclusionPlanes />

        {/* 建築ディテール: 巾木・廻り縁・腰壁・天井梁 */}
        {wallDisplayMode !== 'hidden' && (
          <Baseboards walls={walls} openings={openings} roomHeight={roomHeight} style={styleConfig} />
        )}
        {wallDisplayMode !== 'hidden' && (
          <Wainscoting walls={walls} openings={openings} roomHeight={roomHeight} style={styleConfig} />
        )}
        <CeilingBeams walls={walls} roomHeight={roomHeight} style={styleConfig} />

        {/* ダストパーティクル・分析オーバーレイ（エキスパートモードのみ） */}
        {isExpert && (
          <>
            <DustParticles walls={walls} openings={openings} roomHeight={roomHeight} qualityLevel={qualityLevel} />
            <FlowHeatmap walls={walls} openings={openings} furniture={furniture} visible={showFlowHeatmap} />
            <LightingAnalysis walls={walls} openings={openings} furniture={furniture} roomHeight={roomHeight} visible={showLightingAnalysis} brightness={lightBrightness} />
            <CollisionHeatmap furniture={furniture} walls={walls} visible={showCollisionHeatmap} />
          </>
        )}

        {showDimensions && <RoomDimensionLabel walls={walls} openings={openings} roomLabels={roomLabels} roomHeight={roomHeight} />}

        <WindowLightBeams walls={walls} openings={openings} roomHeight={roomHeight} qualityLevel={qualityLevel} />

        {showFurniture && (
          <OcclusionCullingProvider walls={walls} furniture={furniture} enabled={walls.length >= 3}>
            <OccludedFurnitureList
              furniture={furniture}
              selectedFurniture={selectedFurniture}
              selectedFurnitureIds={selectedFurnitureIds}
              deletingFurnitureIds={deletingFurnitureIds}
              onSelectFurniture={onSelectFurniture}
              onToggleFurnitureSelection={onToggleFurnitureSelection}
              onMoveFurniture={onMoveFurniture}
              qualityLevel={qualityLevel}
            />
          </OcclusionCullingProvider>
        )}

        {showFurniture && <FurnitureRug furniture={furniture} />}

        {/* 注釈マーカー */}
        {showAnnotations && annotations.length > 0 && (
          <AnnotationMarkers
            annotations={annotations.filter((a) => a.visible)}
            onUpdate={updateAnnotation}
            onDelete={deleteAnnotation}
          />
        )}

        {/* 注釈配置モード */}
        <AnnotationPlacement
          active={activeTool === 'annotation'}
          onPlace={handleAnnotationPlace}
        />

        {/* 人物シルエット（スケール参照用） */}
        {showHumanFigures && (
          <>
            <HumanFigure position={[1, 0, 1]} pose="standing" />
            <HumanFigure position={[2, 0, 2]} pose="sitting" />
            <HumanFigure position={[-1, 0, 1.5]} pose="walking" rotation={[0, Math.PI / 3, 0]} />
          </>
        )}

        {/* ライトグロー（ペンダントライト周辺のグロー効果） */}
        {showLightGlow && qualityLevel !== 'low' && furniture.filter(f => f.type === 'pendant_light').map(light => (
          <LightGlow
            key={`glow-${light.id}`}
            position={[light.position[0], light.position[1] + (light.heightOffset ?? 0) + 0.3, light.position[2]]}
            color={styleConfig.spotlightColor || '#FFF5E6'}
            intensity={0.8}
            size={0.6}
          />
        ))}

        {/* 動線シミュレーション（エキスパートモードのみ） */}
        {isExpert && showFlowSimulation && (
          <FlowSimulation
            enabled={showFlowSimulation}
            walls={walls}
            furniture={furniture}
            speed={1}
          />
        )}

        {/* 参照画像オーバーレイ */}
        {referenceImageUrl && (
          <ReferenceImageOverlay
            imageUrl={referenceImageUrl}
            opacity={referenceImageOpacity}
            position={[0, roomHeight / 2, 0]}
            scale={Math.max(gridSize.w, gridSize.d) * 0.5}
            visible={true}
          />
        )}

        {/* ゴッドレイ（窓からの光の筋）（エキスパートモードのみ） */}
        {isExpert && showGodRays && qualityLevel !== 'low' && (
          <GodRays
            openings={openings.filter(o => o.type === 'window')}
            walls={walls}
            roomHeight={roomHeight}
            intensity={godRayIntensity}
            enabled={true}
          />
        )}

        {/* ウェットフロア（エキスパートモードのみ） */}
        {isExpert && wetFloorEnabled && (
          <WetFloorEffect
            walls={walls}
            wetness={wetFloorWetness}
            enabled={true}
          />
        )}

        {/* プロシージャルスカイボックス（エキスパートモードのみ） */}
        {isExpert && showProceduralSky && (
          <ProceduralSkybox timeOfDay={skyTimeOfDay} enabled={true} />
        )}

        {/* エリアライトシステム */}
        {showAreaLights && openings.length > 0 && (
          <AreaLightSystem
            openings={openings}
            walls={walls}
            roomHeight={roomHeight}
            style={styleConfig}
            qualityLevel={qualityLevel}
          />
        )}

        {/* ガラス結露エフェクト（エキスパートモードのみ） */}
        {isExpert && glassCondensation !== 'off' && openings.length > 0 && (
          <GlassCondensation
            walls={walls}
            openings={openings}
            roomHeight={roomHeight}
            temperature={glassCondensation}
            enabled={true}
          />
        )}

        {/* コースティクスエフェクト（エキスパートモードのみ） */}
        {isExpert && showCaustics && openings.length > 0 && (
          <CausticEffect
            openings={openings}
            walls={walls}
            intensity={causticsIntensity}
            enabled={true}
          />
        )}

        {/* 太陽シミュレーション（エキスパートモードのみ） */}
        {isExpert && showSunSimulation && (
          <SunSimulation
            enabled={true}
            timeOfDay={skyTimeOfDay}
            latitude={35}
            onTimeChange={setSkyTimeOfDay}
          />
        )}

        {/* 音響シミュレーション可視化（エキスパートモードのみ） */}
        {isExpert && showAcoustics && (
          <AcousticVisualization
            walls={walls}
            furniture={furniture}
            roomHeight={roomHeight}
            enabled={true}
          />
        )}

        {/* 3D窓・ドアフレーム */}
        {showWindowDoorFrames && qualityLevel !== 'low' && openings.map((opening) => {
          const wall = walls.find((w) => w.id === opening.wallId);
          if (!wall) return null;
          return (
            <WindowDoorFrame3D
              key={`frame-${opening.id}`}
              opening={opening}
              wall={wall}
              roomHeight={roomHeight}
              style={styleName}
              qualityLevel={qualityLevel}
            />
          );
        })}

        {/* 避難経路オーバーレイ（エキスパートモードのみ） */}
        {isExpert && showEvacuation && (
          <EvacuationOverlay
            walls={walls}
            openings={openings}
            furniture={furniture}
            roomHeight={roomHeight}
            enabled={true}
          />
        )}

        {/* 電気配線オーバーレイ（エキスパートモードのみ） */}
        {isExpert && showElectrical && (
          <ElectricalOverlay
            walls={walls}
            furniture={furniture}
            roomHeight={roomHeight}
            enabled={true}
          />
        )}

        {/* 空調効率可視化（エキスパートモードのみ） */}
        {isExpert && showHVAC && (
          <HVACVisualization
            walls={walls}
            furniture={furniture}
            roomHeight={roomHeight}
            enabled={true}
          />
        )}

        {/* 煙・蒸気パーティクル（エキスパートモードのみ） */}
        {isExpert && showSmoke && furniture.filter(f => ['refrigerator', 'kitchen_island'].includes(f.type)).map(item => (
          <SmokeParticles
            key={`smoke-${item.id}`}
            position={[item.position[0], item.position[1] + (item.scale?.[1] ?? 1), item.position[2]]}
            type="steam"
            intensity={0.6}
            enabled={true}
          />
        ))}

        {/* レンズフレア（エキスパートモードのみ） */}
        {isExpert && showLensFlare && qualityLevel !== 'low' && furniture.filter(f => f.type === 'pendant_light').map(light => (
          <LensFlare
            key={`flare-${light.id}`}
            position={[light.position[0], light.position[1] + (light.heightOffset ?? 0) + 0.3, light.position[2]]}
            color={styleConfig.spotlightColor || '#FFF5E6'}
            intensity={0.7}
            size={0.25}
          />
        ))}

        {/* モーションブラー（ウォークスルー・巡回時） */}
        {motionBlurEnabled && qualityLevel !== 'low' && (
          <MotionBlurEffect enabled={isAutoWalkthrough || isFirstPersonMode} intensity={0.3} />
        )}

        {/* ContactShadows はhigh品質のみ（非常に重い）、スケッチモードでは無効 */}
        {qualityLevel === 'high' && !isSketchStyle && (
          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={isNight ? 0.35 : 0.45}
            scale={maxDim * 1.5}
            blur={4.0}
            far={5}
            resolution={2048}
            color={isWarmStyle ? '#3A2515' : '#1A1A1A'}
          />
        )}

        {showGrid && (() => {
          // スタイル別グリッド色設定
          const gridPreset = (() => {
            switch (styleName) {
              case 'luxury':
              case 'japanese':
                return {
                  cellColor: isNight ? '#333333' : '#e8e8e8',
                  sectionColor: isNight ? '#444444' : '#cccccc',
                };
              case 'industrial':
                return {
                  cellColor: isNight ? '#555555' : '#aaaaaa',
                  sectionColor: isNight ? '#777777' : '#808080',
                };
              case 'medical':
                return {
                  cellColor: isNight ? '#334455' : '#c8d8e8',
                  sectionColor: isNight ? '#556677' : '#90a8c0',
                };
              default:
                return {
                  cellColor: isNight ? '#444444' : '#d8d8d8',
                  sectionColor: isNight ? '#666666' : '#a0a0a0',
                };
            }
          })();

          // 座標ラベル: グリッド端に1m刻みで座標表示
          const halfW = gridSize.w / 2;
          const halfD = gridSize.d / 2;
          const coordLabelsX: { pos: [number, number, number]; text: string }[] = [];
          const coordLabelsZ: { pos: [number, number, number]; text: string }[] = [];
          for (let x = Math.ceil(-halfW); x <= Math.floor(halfW); x++) {
            coordLabelsX.push({ pos: [x, 0.01, halfD + 0.25], text: `${x.toFixed(0)}` });
          }
          for (let z = Math.ceil(-halfD); z <= Math.floor(halfD); z++) {
            coordLabelsZ.push({ pos: [-halfW - 0.25, 0.01, z], text: `${z.toFixed(0)}` });
          }

          return (
            <>
              <Grid
                position={[0, 0.001, 0]}
                args={[gridSize.w, gridSize.d]}
                cellSize={0.5}
                cellColor={gridPreset.cellColor}
                cellThickness={0.6}
                sectionSize={1}
                sectionColor={gridPreset.sectionColor}
                sectionThickness={1.4}
                fadeDistance={maxDim * 1.5}
                fadeStrength={2}
                infiniteGrid={false}
              />
              {/* X軸座標ラベル (手前端) */}
              {coordLabelsX.map((cl) => (
                <Html key={`cx-${cl.text}`} position={cl.pos} center style={{ pointerEvents: 'none' }}>
                  <div style={{ fontSize: '8px', color: isNight ? '#888' : '#999', fontFamily: 'monospace', fontWeight: 500 }}>
                    {cl.text}
                  </div>
                </Html>
              ))}
              {/* Z軸座標ラベル (左端) */}
              {coordLabelsZ.map((cl) => (
                <Html key={`cz-${cl.text}`} position={cl.pos} center style={{ pointerEvents: 'none' }}>
                  <div style={{ fontSize: '8px', color: isNight ? '#888' : '#999', fontFamily: 'monospace', fontWeight: 500 }}>
                    {cl.text}
                  </div>
                </Html>
              ))}
            </>
          );
        })()}

        {!isFirstPersonMode && (
          <OrbitControls
            ref={controlsRef}
            makeDefault
            enabled={!isDraggingFurniture && !isAutoWalkthrough}
            target={cameraTarget}
            maxPolarAngle={Math.PI * 0.85}
            minDistance={Math.max(0.3, Math.min(maxDim * 0.08, 0.8))}
            maxDistance={20}
            enableDamping
            dampingFactor={0.08}
            zoomSpeed={0.8}
            rotateSpeed={0.5}
            panSpeed={0.8}
          />
        )}

        <CameraController />
        <CameraStateProvider />
        <WalkthroughControls />

        {/* パフォーマンスマネージャー (LOD一括管理) */}
        <PerformanceManager />

        {/* FPSカウンター: 開発モードで常時表示 */}
        {process.env.NODE_ENV === 'development' && <Stats />}

        {/* パノラマエクスポーター */}
        {onPanoramaComplete && (
          <PanoramaExporter trigger={panoramaTrigger} onComplete={onPanoramaComplete} />
        )}

        {/* PostProcessingはmedium/high品質で有効（lowでは無効）、sketch/watercolorでも軽量エフェクト適用 */}
        {(qualityLevel !== 'low' || isSketchStyle) && (
          <Suspense fallback={null}>
            <LazyPostProcessing
              qualityLevel={qualityLevel}
              ssaoRadius={ssaoRadius}
              ssaoIntensity={ssaoIntensity}
              bloomLuminanceThreshold={bloomLuminanceThreshold}
              bloomIntensity={bloomIntensity}
              vignetteIntensity={vignetteIntensity}
              photoMode={photoMode}
              renderStyle={renderStyle}
            />
          </Suspense>
        )}
      </Suspense>
    </Canvas>
  );
}
