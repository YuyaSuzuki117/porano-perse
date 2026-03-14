'use client';

import { Suspense, useRef, useCallback, useMemo, lazy } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, ContactShadows, Stats } from '@react-three/drei';
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
import { Baseboards } from './Baseboards';
import { Wainscoting } from './Wainscoting';
import { CeilingBeams } from './CeilingBeams';
import { DustParticles } from './DustParticles';
import PanoramaExporter from './PanoramaExporter';
import { useEditorStore } from '@/stores/useEditorStore';
import { STYLE_PRESETS } from '@/data/styles';
import { StyleConfig } from '@/types/scene';

// ── 遅延ロード: PostProcessing (heavy, medium/high品質のみ使用) ──
const LazyPostProcessing = lazy(() => import('./PostProcessingEffects'));

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
  const showGrid = useEditorStore((s) => s.showGrid);
  const showDimensions = useEditorStore((s) => s.showDimensions);
  const showFurniture = useEditorStore((s) => s.showFurniture);
  const dayNight = useEditorStore((s) => s.dayNight);
  const fogDistance = useEditorStore((s) => s.fogDistance);
  const lightBrightness = useEditorStore((s) => s.lightBrightness);
  const lightWarmth = useEditorStore((s) => s.lightWarmth);
  const qualityLevel = useEditorStore((s) => s.qualityLevel);
  const wallDisplayMode = useEditorStore((s) => s.wallDisplayMode);
  const isDraggingFurniture = useEditorStore((s) => s.isDraggingFurniture);
  const isFirstPersonMode = useEditorStore((s) => s.isFirstPersonMode);
  const isAutoWalkthrough = useEditorStore((s) => s.isAutoWalkthrough);
  const annotations = useEditorStore((s) => s.annotations);
  const showAnnotations = useEditorStore((s) => s.showAnnotations);
  const activeTool = useEditorStore((s) => s.activeTool);
  const deletingFurnitureIds = useEditorStore((s) => s.deletingFurnitureIds);
  const updateAnnotation = useEditorStore((s) => s.updateAnnotation);
  const deleteAnnotation = useEditorStore((s) => s.deleteAnnotation);
  const addAnnotation = useEditorStore((s) => s.addAnnotation);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);

  const styleConfig: StyleConfig = STYLE_PRESETS[styleName];
  const controlsRef = useRef(null);

  const isNight = dayNight === 'night';

  // スタイル別背景色
  const bgColor = useMemo(() => {
    if (!isNight) {
      // 昼はスタイルによらず薄い背景
      return '#f0f0f0';
    }
    const nightBgMap: Record<string, string> = {
      luxury: '#1a1520',
      japanese: '#1a1a18',
      medical: '#161820',
      industrial: '#181818',
    };
    return nightBgMap[styleName] || '#1a1a2e';
  }, [isNight, styleName]);

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
    const warmBoost = isWarmStyle ? 0.1 : 0;
    gl.toneMappingExposure = isNight
      ? 0.8 + lightBrightness / 400
      : 1.3 + lightBrightness / 200 + warmBoost;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.localClippingEnabled = true;
    // lowモード: シャドウ完全無効 + ピクセル比1.0制限
    if (qualityLevel === 'low') {
      gl.shadowMap.enabled = false;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    } else {
      gl.shadowMap.enabled = true;
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.setPixelRatio(Math.min(window.devicePixelRatio, qualityLevel === 'high' ? 2.0 : 1.5));
    }
    if (canvasRef) {
      (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = gl.domElement;
    }
  }, [canvasRef, isNight, isWarmStyle, lightBrightness, qualityLevel]);

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
      dpr={[1, 2]}
      gl={{ antialias: qualityLevel !== 'low', preserveDrawingBuffer: true, powerPreference: 'high-performance', ...(qualityLevel === 'high' ? { samples: 4 } : {}) }}
      camera={{
        position: cameraPosition,
        fov: dynamicFov,
        near: 0.01,
        far: 200,
      }}
      performance={{ min: 0.5, max: 1 }}
      onCreated={handleCanvasCreated}
      onPointerMissed={handlePointerMissed}
      style={{ background: bgColor }}
    >
      <Suspense fallback={null}>
        {/* lowモードではfog無効 */}
        {qualityLevel !== 'low' && (
          <fog attach="fog" args={[bgColor, fogDistance * 0.7, fogDistance * 1.2]} />
        )}

        <LightingRig style={styleConfig} walls={walls} roomHeight={roomHeight} brightness={effectiveBrightness} warmth={effectiveWarmth} qualityLevel={qualityLevel} />
        <Environment
          preset={envPreset}
          background={false}
          environmentIntensity={qualityLevel === 'high' ? 1.5 : qualityLevel === 'medium' ? 1.2 : 0.8}
          environmentRotation={[0, Math.PI / 4, 0]}
          resolution={qualityLevel === 'high' ? 512 : 256}
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
        <CeilingMesh walls={walls} roomHeight={roomHeight} style={styleConfig} />

        {/* 建築ディテール: 巾木・廻り縁・腰壁・天井梁 */}
        {wallDisplayMode !== 'hidden' && (
          <Baseboards walls={walls} openings={openings} roomHeight={roomHeight} style={styleConfig} />
        )}
        {wallDisplayMode !== 'hidden' && (
          <Wainscoting walls={walls} openings={openings} roomHeight={roomHeight} style={styleConfig} />
        )}
        <CeilingBeams walls={walls} roomHeight={roomHeight} style={styleConfig} />

        {/* ダストパーティクル（high品質のみ） */}
        <DustParticles walls={walls} openings={openings} roomHeight={roomHeight} qualityLevel={qualityLevel} />

        {showDimensions && <RoomDimensionLabel walls={walls} openings={openings} roomLabels={roomLabels} />}

        <WindowLightBeams walls={walls} openings={openings} roomHeight={roomHeight} qualityLevel={qualityLevel} />

        {showFurniture && furniture.map((item) => (
          <Furniture
            key={item.id}
            item={item}
            selected={selectedFurniture === item.id || selectedFurnitureIds.includes(item.id)}
            isDeleting={deletingFurnitureIds.includes(item.id)}
            onSelect={onSelectFurniture}
            onToggleSelect={onToggleFurnitureSelection}
            onMove={onMoveFurniture}
            qualityLevel={qualityLevel}
          />
        ))}

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

        {/* ContactShadows はhigh品質のみ（非常に重い） */}
        {qualityLevel === 'high' && (
          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={isNight ? 0.35 : 0.55}
            scale={maxDim * 1.5}
            blur={3.5}
            far={4}
            resolution={1024}
            color={isWarmStyle ? '#3A2515' : '#1A1A1A'}
          />
        )}

        {showGrid && (() => {
          // スタイル別グリッド色設定
          const gridPreset = (() => {
            switch (styleName) {
              case 'luxury':
              case 'japanese':
                // 非常に薄いグリッド（ほぼ見えない）
                return {
                  cellColor: isNight ? '#333333' : '#e8e8e8',
                  sectionColor: isNight ? '#444444' : '#dddddd',
                };
              case 'industrial':
                // 少し目立つグリッド（コンクリート目地風）
                return {
                  cellColor: isNight ? '#555555' : '#aaaaaa',
                  sectionColor: isNight ? '#777777' : '#888888',
                };
              case 'medical':
                // 薄い青系グリッド
                return {
                  cellColor: isNight ? '#334455' : '#c8d8e8',
                  sectionColor: isNight ? '#556677' : '#a0b8d0',
                };
              default:
                return {
                  cellColor: isNight ? '#444444' : '#d8d8d8',
                  sectionColor: isNight ? '#666666' : '#b0b0b0',
                };
            }
          })();

          return (
            <Grid
              position={[0, 0.001, 0]}
              args={[gridSize.w, gridSize.d]}
              cellSize={0.5}
              cellColor={gridPreset.cellColor}
              sectionSize={1}
              sectionColor={gridPreset.sectionColor}
              fadeDistance={maxDim * 1.5}
              fadeStrength={2}
              infiniteGrid={false}
            />
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

        {/* PostProcessingはmedium/high品質で有効（lowでは無効） */}
        {qualityLevel !== 'low' && (
          <Suspense fallback={null}>
            <LazyPostProcessing
              qualityLevel={qualityLevel}
              ssaoRadius={ssaoRadius}
              ssaoIntensity={ssaoIntensity}
              bloomLuminanceThreshold={bloomLuminanceThreshold}
              bloomIntensity={bloomIntensity}
              vignetteIntensity={vignetteIntensity}
            />
          </Suspense>
        )}
      </Suspense>
    </Canvas>
  );
}
