'use client';

import { useState, useRef, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { STYLE_PRESETS } from '@/data/styles';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { FURNITURE_SETS, STORE_FURNITURE_SETS } from '@/data/furniture-sets';
import { STORE_TEMPLATES } from '@/data/templates';
import { ROOM_TEMPLATES } from '@/data/room-templates';
import { LIGHTING_PRESETS, ATMOSPHERE_PRESETS } from '@/data/lighting-presets';
import { FurnitureMaterial, StylePreset } from '@/types/scene';
import { wallLength, computeFloorArea } from '@/lib/geometry';
import { resetTutorial } from '@/components/ui/OnboardingTutorial';
import { resetQuickTips } from '@/components/ui/QuickTips';

interface EditorControlPanelProps {
  isMobile?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export function EditorControlPanel({ isMobile = false, isOpen = false, onClose }: EditorControlPanelProps) {
  const {
    walls,
    furniture,
    roomHeight,
    style,
    selectedWallId,
    selectedFurnitureId,
    viewMode,
    showGrid,
    showDimensions,
    dayNight,
    fogDistance,
    lightBrightness,
    lightWarmth,
    setStyle,
    setRoomHeight,
    addFurniture,
    addFurnitureSet,
    deleteFurniture,
    duplicateFurniture,
    updateFurniture,
    setSelectedFurniture,
    setViewMode,
    deleteWall,
    updateWall,
    rotateFurniture,
    updateFurnitureColor,
    updateFurnitureMaterial,
    initRectRoom,
    initLShapeRoom,
    initUShapeRoom,
    loadTemplate,
    loadRoomTemplate,
    newProject,
    setShowGrid,
    setShowDimensions,
    setDayNight,
    setFogDistance,
    setLightBrightness,
    setLightWarmth,
    snapToGrid3D,
    gridSnapSize,
    snapToWall,
    setSnapToGrid3D,
    setGridSnapSize,
    setSnapToWall,
    showFurniture,
    setShowFurniture,
    activeLightingPreset,
    applyLightingPreset,
    applyFurnitureSet,
    qualityLevel,
    setQualityLevel,
    wallDisplayMode,
    setWallDisplayMode,
    ceilingVisible,
    setCeilingVisible,
    wallColorOverride,
    floorColorOverride,
    wallTextureType,
    floorTextureType,
    setWallColorOverride,
    setFloorColorOverride,
    setWallTextureType,
    setFloorTextureType,
    resetTextureOverrides,
    roomLabels,
    addRoomLabel,
    updateRoomLabel,
    deleteRoomLabel,
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    showAnnotations,
    setShowAnnotations,
    activeTool,
    setActiveTool,
  } = useEditorStore();

  const [annotationColor, setAnnotationColor] = useState('#ef4444');
  const [furnitureTab, setFurnitureTab] = useState<'single' | 'sets'>('single');
  const [showApplyConfirm, setShowApplyConfirm] = useState<string | null>(null);
  const [roomTemplateConfirm, setRoomTemplateConfirm] = useState<string | null>(null);
  const [furnitureSearch, setFurnitureSearch] = useState('');
  const [furnitureCategory, setFurnitureCategory] = useState<string>('all');
  const [matWallOpen, setMatWallOpen] = useState(true);
  const [matFloorOpen, setMatFloorOpen] = useState(false);
  const [matFurnitureOpen, setMatFurnitureOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const selectedWall = walls.find((w) => w.id === selectedWallId);
  const selectedFurnitureItem = furniture.find((f) => f.id === selectedFurnitureId);

  const materialLabels: Record<FurnitureMaterial, string> = {
    wood: '木材',
    metal: '金属',
    fabric: '布',
    leather: '革',
    glass: 'ガラス',
    plastic: '樹脂',
    stone: '石',
  };

  const FURNITURE_CATEGORIES: Record<string, string[]> = {
    '座る': ['chair', 'stool', 'sofa', 'bench'],
    'テーブル': ['counter', 'table_square', 'table_round', 'bar_table', 'kitchen_island', 'desk', 'reception_desk'],
    '収納': ['shelf', 'bookcase', 'wardrobe', 'display_case'],
    '照明': ['pendant_light'],
    '設備': ['register', 'sink', 'fridge', 'washing_machine', 'air_conditioner', 'tv_monitor'],
    'その他': ['plant', 'partition', 'mirror', 'coat_rack'],
  };

  const CATEGORY_LIST = [
    { key: 'all', label: '全て' },
    { key: '座る', label: '座る' },
    { key: 'テーブル', label: 'テーブル' },
    { key: '収納', label: '収納' },
    { key: '照明', label: '照明' },
    { key: '設備', label: '設備' },
    { key: 'その他', label: 'その他' },
  ];

  const filteredCatalog = FURNITURE_CATALOG.filter(item => {
    const searchLower = furnitureSearch.toLowerCase();
    const matchesSearch = furnitureSearch === '' ||
      item.name.toLowerCase().includes(searchLower) ||
      item.type.includes(searchLower);
    const matchesCategory = furnitureCategory === 'all' ||
      (FURNITURE_CATEGORIES[furnitureCategory]?.includes(item.type) ?? false);
    return matchesSearch && matchesCategory;
  });

  const handleAddFurniture = (type: string) => {
    const catalog = FURNITURE_CATALOG.find((c) => c.type === type);
    if (!catalog) return;
    addFurniture({
      id: `${type}_${Date.now()}`,
      type: catalog.type,
      name: catalog.name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [...catalog.defaultScale],
      color: catalog.defaultColor,
      material: catalog.defaultMaterial,
      modelUrl: catalog.modelUrl,
    });
  };

  const handleAddSet = (setId: string) => {
    const furnitureSet = FURNITURE_SETS.find((s) => s.id === setId);
    if (!furnitureSet) return;
    const items = furnitureSet.items.map((item) => ({
      type: item.type,
      name: item.name,
      position: [item.offsetX, 0, item.offsetZ] as [number, number, number],
      rotation: item.rotation,
      scale: item.scale,
      color: item.color,
    }));
    addFurnitureSet(items);
  };

  const modelInputRef = useRef<HTMLInputElement>(null);

  const handleImport3DModel = useCallback((file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'gltf') {
      alert('対応形式: .glb / .gltf ファイルのみ');
      return;
    }
    const nameWithoutExt = file.name.replace(/\.(glb|gltf)$/i, '');
    const name = window.prompt('モデル名を入力', nameWithoutExt) || nameWithoutExt;
    const blobUrl = URL.createObjectURL(file);
    addFurniture({
      id: `custom_${Date.now()}`,
      type: 'custom',
      name,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      modelUrl: blobUrl,
    });
  }, [addFurniture]);

  const handleModelFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport3DModel(file);
    // reset so same file can be re-imported
    e.target.value = '';
  }, [handleImport3DModel]);

  // Panel content shared between mobile and desktop
  const panelContent = (
    <>
      {/* View Mode - hidden on mobile (tab bar handles this) */}
      {!isMobile && (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-1">
            {(['2d', 'split', '3d'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  viewMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {mode === '2d' ? '図面' : mode === '3d' ? '3D' : '分割'}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="w-3 h-3 accent-blue-600"
              />
              グリッド表示
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showDimensions}
                onChange={(e) => setShowDimensions(e.target.checked)}
                className="w-3 h-3 accent-blue-600"
              />
              寸法表示
            </label>
            <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showFurniture}
                onChange={(e) => setShowFurniture(e.target.checked)}
                className="w-3 h-3 accent-blue-600"
              />
              什器表示
            </label>
          </div>
        </div>
      )}

      {/* Mobile: display toggles inline */}
      {isMobile && (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              グリッド
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showDimensions}
                onChange={(e) => setShowDimensions(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              寸法
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={showFurniture}
                onChange={(e) => setShowFurniture(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-600"
              />
              什器
            </label>
          </div>
        </div>
      )}

      {/* 新規プロジェクト + 部屋テンプレート */}
      <Section title="テンプレート" collapsible defaultOpen={false} mobileCollapsible={isMobile}>
        {/* 新規プロジェクトボタン */}
        <button
          onClick={() => {
            if (walls.length > 0 || furniture.length > 0) {
              setRoomTemplateConfirm('__new__');
            } else {
              newProject();
            }
          }}
          className="w-full flex items-center gap-2.5 p-2 mb-2 rounded-lg border-2 border-dashed border-gray-300 bg-white hover:bg-green-50 hover:border-green-400 transition-all text-left group"
        >
          <span className="text-lg flex-shrink-0 group-hover:scale-110 transition-transform">+</span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-700 group-hover:text-green-700">新規プロジェクト</div>
            <div className="text-[10px] text-gray-400">空の部屋から始める (6x6m)</div>
          </div>
        </button>

        {/* 部屋テンプレートプリセット */}
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">部屋プリセット</div>
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {ROOM_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => {
                if (walls.length > 0 || furniture.length > 0) {
                  setRoomTemplateConfirm(tpl.id);
                } else {
                  loadRoomTemplate(tpl.id);
                }
              }}
              className="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all text-center group"
            >
              <span className="text-lg group-hover:scale-110 transition-transform">{tpl.icon}</span>
              <div className="text-[10px] font-semibold text-gray-800 group-hover:text-blue-700 leading-tight">{tpl.name}</div>
              <div className="text-[9px] text-gray-400 leading-tight">{tpl.walls[0] ? `${Math.round(Math.abs(tpl.walls[0].end.x - tpl.walls[0].start.x))}x${Math.round(Math.abs(tpl.walls[1].end.y - tpl.walls[1].start.y))}m` : ''}</div>
            </button>
          ))}
        </div>

        {/* 既存の店舗テンプレート */}
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">店舗テンプレート</div>
        <div className="space-y-1.5">
          {STORE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => loadTemplate(tpl.id)}
              className="w-full flex items-start gap-2.5 p-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all text-left group"
            >
              <span className="text-xl flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                {tpl.thumbnail}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-800 group-hover:text-blue-700">
                  {tpl.name}
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {tpl.roomWidth}x{tpl.roomDepth}m ・ 什器{tpl.furniture.length}点
                </div>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {/* テンプレート適用確認ダイアログ */}
      {roomTemplateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-5 max-w-xs w-full mx-4">
            <p className="text-sm text-gray-800 font-semibold mb-2">プロジェクトを上書きしますか？</p>
            <p className="text-xs text-gray-500 mb-4">現在のデータ（壁・家具）は全て置き換えられます。</p>
            <div className="flex gap-2">
              <button
                onClick={() => setRoomTemplateConfirm(null)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (roomTemplateConfirm === '__new__') {
                    newProject();
                  } else {
                    loadRoomTemplate(roomTemplateConfirm);
                  }
                  setRoomTemplateConfirm(null);
                }}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                適用する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Room Setup */}
      <Section title="部屋設定" collapsible={isMobile} mobileCollapsible={isMobile}>
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">天井高 (m)</label>
            <input
              type="number"
              value={roomHeight}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v > 0 && v <= 10) setRoomHeight(v);
              }}
              min={2}
              max={10}
              step={0.1}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
          {/* 壁の表示制御 */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">壁の表示</label>
            <div className="flex gap-1">
              {([
                { mode: 'solid' as const, label: '実線' },
                { mode: 'transparent' as const, label: '半透明' },
                { mode: 'hidden' as const, label: '非表示' },
                { mode: 'section' as const, label: '断面' },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => setWallDisplayMode(mode)}
                  className={`flex-1 text-[10px] px-1 py-1 rounded transition-all ${
                    wallDisplayMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* 天井の表示制御 */}
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">天井</label>
            <div className="flex gap-1">
              <button
                onClick={() => setCeilingVisible(true)}
                className={`flex-1 text-[10px] px-1.5 py-1 rounded transition-all ${
                  ceilingVisible
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                表示
              </button>
              <button
                onClick={() => setCeilingVisible(false)}
                className={`flex-1 text-[10px] px-1.5 py-1 rounded transition-all ${
                  !ceilingVisible
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                非表示
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">矩形</label>
            <div className="flex gap-1.5">
              {[
                { w: 6, d: 4, label: '小' },
                { w: 8, d: 6, label: '中' },
                { w: 12, d: 8, label: '大' },
              ].map(({ w, d, label }) => (
                <button
                  key={label}
                  onClick={() => initRectRoom(w, d)}
                  className="flex-1 text-[10px] px-1.5 py-1 bg-gray-100 rounded hover:bg-gray-200"
                >
                  {label} {w}x{d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">変形</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => initLShapeRoom(10, 8)}
                className="flex-1 text-[10px] px-1.5 py-1 bg-gray-100 rounded hover:bg-gray-200"
              >
                L字 10x8
              </button>
              <button
                onClick={() => initUShapeRoom(10, 8)}
                className="flex-1 text-[10px] px-1.5 py-1 bg-gray-100 rounded hover:bg-gray-200"
              >
                コの字 10x8
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* 配置設定 (スナップ) */}
      <Section title="配置設定" collapsible={isMobile} mobileCollapsible={isMobile}>
        <div className="space-y-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToGrid3D}
              onChange={(e) => setSnapToGrid3D(e.target.checked)}
              className="w-3.5 h-3.5 accent-green-600"
            />
            グリッドスナップ
          </label>
          {snapToGrid3D && (
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">グリッドサイズ</label>
              <div className="flex gap-1">
                {[
                  { size: 0.1, label: '10cm' },
                  { size: 0.25, label: '25cm' },
                  { size: 0.5, label: '50cm' },
                ].map(({ size, label }) => (
                  <button
                    key={size}
                    onClick={() => setGridSnapSize(size)}
                    className={`flex-1 text-[10px] px-1.5 py-1 rounded transition-all ${
                      gridSnapSize === size
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={snapToWall}
              onChange={(e) => setSnapToWall(e.target.checked)}
              className="w-3.5 h-3.5 accent-amber-500"
            />
            壁スナップ
          </label>
          <p className="text-[9px] text-gray-400">
            壁から30cm以内で自動吸着
          </p>
        </div>
      </Section>

      {/* Style */}
      <Section title="スタイル" collapsible={isMobile} mobileCollapsible={isMobile}>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.entries(STYLE_PRESETS) as [StylePreset, (typeof STYLE_PRESETS)[StylePreset]][]).map(
            ([key, config]) => (
              <button
                key={key}
                onClick={() => setStyle(key)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-all ${
                  style === key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <div
                  className="w-full h-1.5 rounded mb-1"
                  style={{
                    background: `linear-gradient(90deg, ${config.wallColor}, ${config.floorColor}, ${config.accentColor})`,
                  }}
                />
                {config.nameJa}
              </button>
            )
          )}
        </div>
        <button
          onClick={() => useEditorStore.getState().setStyleCompareMode(true)}
          className="mt-2 w-full px-3 py-1.5 rounded text-xs font-medium bg-gradient-to-r from-blue-50 to-orange-50 text-gray-700 hover:from-blue-100 hover:to-orange-100 border border-gray-200 transition-all"
        >
          A/B スタイル比較
        </button>
      </Section>

      {/* マテリアル */}
      <Section title="マテリアル" collapsible defaultOpen={false} mobileCollapsible={isMobile}>
        <div className="space-y-1">
          {/* ── 壁マテリアル ── */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setMatWallOpen(!matWallOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded border border-gray-300 shadow-inner"
                  style={{ backgroundColor: wallColorOverride ?? STYLE_PRESETS[style].wallColor }}
                />
                <span className="text-xs font-medium text-gray-700">壁</span>
                {(wallColorOverride || wallTextureType) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </div>
              <span className="text-[10px] text-gray-400">{matWallOpen ? '▼' : '▶'}</span>
            </button>
            {matWallOpen && (
              <div className="px-2.5 py-2 space-y-2 border-t border-gray-100">
                {/* 壁色 */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1 font-medium">カラー</div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <input
                      type="color"
                      value={wallColorOverride ?? STYLE_PRESETS[style].wallColor}
                      onChange={(e) => setWallColorOverride(e.target.value)}
                      className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-gray-400">
                      {wallColorOverride ?? STYLE_PRESETS[style].wallColor}
                    </span>
                    {wallColorOverride && (
                      <button
                        onClick={() => setWallColorOverride(null)}
                        className="text-[9px] text-blue-500 hover:text-blue-700"
                      >
                        リセット
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { color: '#FFFFFF', label: '白' },
                      { color: '#F5F0E8', label: 'ベージュ' },
                      { color: '#D0D0D0', label: 'グレー' },
                      { color: '#8B7355', label: 'ブラウン' },
                      { color: '#2A1F1F', label: 'ダーク' },
                      { color: '#F0F4F8', label: 'アイス' },
                      { color: '#E8D8C0', label: 'セピア' },
                      { color: '#C0C0C8', label: 'コンクリ' },
                    ].map(({ color, label }) => (
                      <button
                        key={color}
                        onClick={() => setWallColorOverride(color)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border transition-all ${
                          wallColorOverride === color
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm border border-gray-300"
                          style={{ backgroundColor: color }}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 壁テクスチャ */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1 font-medium">テクスチャ</div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { type: null, label: 'スタイル準拠' },
                      { type: 'japanese', label: '漆喰' },
                      { type: 'cafe', label: 'レンガ' },
                      { type: 'industrial', label: 'コンクリート' },
                      { type: 'scandinavian', label: 'ウッドパネル' },
                      { type: 'medical', label: 'タイル' },
                      { type: 'modern', label: '塗装' },
                      { type: 'luxury', label: 'ベルベット' },
                      { type: 'retro', label: 'セピア' },
                    ].map(({ type, label }) => (
                      <button
                        key={type ?? 'default'}
                        onClick={() => setWallTextureType(type)}
                        className={`px-1.5 py-1 rounded text-[10px] transition-all ${
                          wallTextureType === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {(wallColorOverride || wallTextureType) && (
                  <button
                    onClick={() => { setWallColorOverride(null); setWallTextureType(null); }}
                    className="w-full px-2 py-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 text-[10px] border border-gray-200"
                  >
                    壁をスタイルデフォルトに戻す
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── 床マテリアル ── */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setMatFloorOpen(!matFloorOpen)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-5 h-5 rounded border border-gray-300 shadow-inner"
                  style={{ backgroundColor: floorColorOverride ?? STYLE_PRESETS[style].floorColor }}
                />
                <span className="text-xs font-medium text-gray-700">床</span>
                {(floorColorOverride || floorTextureType) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </div>
              <span className="text-[10px] text-gray-400">{matFloorOpen ? '▼' : '▶'}</span>
            </button>
            {matFloorOpen && (
              <div className="px-2.5 py-2 space-y-2 border-t border-gray-100">
                {/* 床色 */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1 font-medium">カラー</div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <input
                      type="color"
                      value={floorColorOverride ?? STYLE_PRESETS[style].floorColor}
                      onChange={(e) => setFloorColorOverride(e.target.value)}
                      className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-gray-400">
                      {floorColorOverride ?? STYLE_PRESETS[style].floorColor}
                    </span>
                    {floorColorOverride && (
                      <button
                        onClick={() => setFloorColorOverride(null)}
                        className="text-[9px] text-blue-500 hover:text-blue-700"
                      >
                        リセット
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {[
                      { color: '#E0D8D0', label: 'ライトウッド' },
                      { color: '#7A5A28', label: 'ダークウッド' },
                      { color: '#B8A84C', label: '畳' },
                      { color: '#E8E0D8', label: '大理石' },
                      { color: '#3A3A4A', label: 'ダークタイル' },
                      { color: '#707078', label: 'コンクリ' },
                      { color: '#D0D8E0', label: 'ライトグレー' },
                      { color: '#C8B896', label: 'オーク' },
                    ].map(({ color, label }) => (
                      <button
                        key={color}
                        onClick={() => setFloorColorOverride(color)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] border transition-all ${
                          floorColorOverride === color
                            ? 'border-blue-400 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm border border-gray-300"
                          style={{ backgroundColor: color }}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 床テクスチャ */}
                <div>
                  <div className="text-[10px] text-gray-500 mb-1 font-medium">テクスチャ</div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { type: null, label: 'スタイル準拠' },
                      { type: 'cafe', label: '木目' },
                      { type: 'modern', label: 'タイル' },
                      { type: 'industrial', label: 'コンクリート' },
                      { type: 'japanese', label: '畳' },
                      { type: 'luxury', label: '大理石' },
                      { type: 'retro', label: '市松模様' },
                      { type: 'medical', label: 'リノリウム' },
                      { type: 'scandinavian', label: 'ライトオーク' },
                    ].map(({ type, label }) => (
                      <button
                        key={type ?? 'default'}
                        onClick={() => setFloorTextureType(type)}
                        className={`px-1.5 py-1 rounded text-[10px] transition-all ${
                          floorTextureType === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {(floorColorOverride || floorTextureType) && (
                  <button
                    onClick={() => { setFloorColorOverride(null); setFloorTextureType(null); }}
                    className="w-full px-2 py-1 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 text-[10px] border border-gray-200"
                  >
                    床をスタイルデフォルトに戻す
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── 什器マテリアル（選択時のみ） ── */}
          {selectedFurnitureItem && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setMatFurnitureOpen(!matFurnitureOpen)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded border border-gray-300 shadow-inner"
                    style={{ backgroundColor: selectedFurnitureItem.color }}
                  />
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[140px]">什器: {selectedFurnitureItem.name}</span>
                </div>
                <span className="text-[10px] text-gray-400">{matFurnitureOpen ? '▼' : '▶'}</span>
              </button>
              {matFurnitureOpen && (
                <div className="px-2.5 py-2 space-y-2 border-t border-gray-100">
                  {/* 什器カラー */}
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1 font-medium">カラー</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedFurnitureItem.color}
                        onChange={(e) => updateFurnitureColor(selectedFurnitureItem.id, e.target.value)}
                        className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono text-gray-400">{selectedFurnitureItem.color}</span>
                    </div>
                  </div>
                  {/* 什器素材 */}
                  <div>
                    <div className="text-[10px] text-gray-500 mb-1 font-medium">素材</div>
                    <div className="grid grid-cols-4 gap-1">
                      {(['wood', 'metal', 'fabric', 'leather', 'glass', 'plastic', 'stone'] as const).map((mat) => (
                        <button
                          key={mat}
                          onClick={() => updateFurnitureMaterial(selectedFurnitureItem.id, mat)}
                          className={`px-1.5 py-1 rounded text-[10px] transition-all ${
                            (selectedFurnitureItem.material || 'wood') === mat
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {materialLabels[mat]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 全リセット */}
          {(wallColorOverride || floorColorOverride || wallTextureType || floorTextureType) && (
            <button
              onClick={resetTextureOverrides}
              className="w-full px-2 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-xs font-medium border border-gray-200 mt-1"
            >
              全てスタイルデフォルトに戻す
            </button>
          )}
        </div>
      </Section>

      {/* Lighting */}
      <Section title="照明・環境" collapsible={isMobile} mobileCollapsible={isMobile}>
        <div className="space-y-2">
          {/* 描画品質 */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1 font-medium">描画品質</div>
            <div className="flex gap-1">
              {([
                { level: 'high' as const, label: '高品質' },
                { level: 'medium' as const, label: '標準' },
                { level: 'low' as const, label: '軽量' },
              ]).map(({ level, label }) => (
                <button
                  key={level}
                  onClick={() => setQualityLevel(level)}
                  className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                    qualityLevel === level
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {qualityLevel === 'low' && (
              <p className="text-[9px] text-gray-400 mt-1">
                モバイルや動作が重い場合に推奨
              </p>
            )}
          </div>
          {/* 照明プリセット — カード形式 */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1 font-medium">照明プリセット</div>
            <div className="grid grid-cols-3 gap-1">
              {LIGHTING_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyLightingPreset(preset)}
                  title={preset.description}
                  className={`relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[9px] font-medium transition-all border ${
                    activeLightingPreset === preset.name
                      ? 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-200 shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span className="text-sm leading-none">{preset.icon}</span>
                  <span className="leading-tight">{preset.name}</span>
                  <div className="flex items-center gap-0.5 mt-0.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full border border-gray-300/50"
                      style={{ backgroundColor: preset.colorHint }}
                    />
                    <span className="text-[8px] text-gray-400">{(preset.brightness * 100).toFixed(0)}%</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* クイック雰囲気ボタン */}
          <div>
            <div className="text-[10px] text-gray-500 mb-1 font-medium">クイック雰囲気</div>
            <div className="grid grid-cols-2 gap-1">
              {ATMOSPHERE_PRESETS.map((atm) => (
                <button
                  key={atm.name}
                  onClick={() => applyLightingPreset({ ...atm, colorHint: '' })}
                  title={atm.description}
                  className={`px-2 py-1 rounded text-[9px] font-medium text-left transition-all border ${
                    activeLightingPreset === atm.name
                      ? 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span className="mr-0.5">{atm.icon}</span>{atm.name}
                </button>
              ))}
            </div>
          </div>

          {/* カスタム調整 */}
          <div className="text-[10px] text-gray-400 mt-1 mb-0.5 font-medium">カスタム調整</div>

          {/* Day/Night Toggle — ビジュアル版 */}
          <div>
            <div className="relative flex rounded-lg overflow-hidden border border-gray-200 h-8">
              {(['day', 'night'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDayNight(mode)}
                  className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium transition-all duration-300 ${
                    dayNight === mode
                      ? mode === 'day'
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-300 text-white shadow-inner'
                        : 'bg-gradient-to-r from-indigo-700 to-indigo-900 text-white shadow-inner'
                      : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  <span className={`transition-transform duration-300 ${dayNight === mode ? 'scale-110' : 'scale-90 opacity-60'}`}>
                    {mode === 'day' ? '\u2600\uFE0F' : '\uD83C\uDF19'}
                  </span>
                  <span>{mode === 'day' ? '昼間' : '夜間'}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 明るさ — スライダー + クイックボタン */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>明るさ</span>
              <span className="font-mono tabular-nums text-[10px] bg-gray-100 px-1 rounded">{(lightBrightness * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={300}
              step={5}
              value={lightBrightness * 100}
              onChange={(e) => setLightBrightness(parseInt(e.target.value) / 100)}
              className="w-full h-1.5 accent-yellow-500"
            />
            <div className="flex gap-0.5 mt-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() => setLightBrightness(pct / 100)}
                  className={`flex-1 text-[9px] py-0.5 rounded border transition-all ${
                    Math.round(lightBrightness * 100) === pct
                      ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                      : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* 色温度 — スライダー + グラデーションバー */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>色温度</span>
              <span className="font-mono tabular-nums text-[10px] bg-gray-100 px-1 rounded">
                {lightWarmth < 0.3 ? '寒色' : lightWarmth > 0.7 ? '暖色' : '中間'}
              </span>
            </div>
            <div
              className="w-full h-1.5 rounded-full mb-1"
              style={{ background: 'linear-gradient(to right, #93c5fd, #fbbf24, #f97316)' }}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={lightWarmth * 100}
              onChange={(e) => setLightWarmth(parseInt(e.target.value) / 100)}
              className="w-full h-1.5 accent-orange-400"
            />
            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
              <span>寒色 (青白)</span>
              <span>暖色 (橙)</span>
            </div>
          </div>

          {/* 奥行感 (Fog) */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
              <span>奥行感</span>
              <span className="font-mono tabular-nums text-[10px] bg-gray-100 px-1 rounded">
                {fogDistance < 20 ? '濃い' : fogDistance > 45 ? '薄い' : '中間'}
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              step={5}
              value={fogDistance}
              onChange={(e) => setFogDistance(parseInt(e.target.value))}
              className="w-full h-1.5 accent-blue-400"
            />
            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
              <span>濃霧</span>
              <span>クリア</span>
            </div>
          </div>
        </div>
      </Section>

      {/* 家具セット一括配置 */}
      <Section title="家具セット一括配置" collapsible defaultOpen={false} mobileCollapsible={isMobile}>
        <div className="space-y-1.5">
          <p className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
            現在の家具はすべてクリアされ、選択したセットに置き換わります
          </p>
          {STORE_FURNITURE_SETS.map((s) => {
            const isRecommended = s.recommendedStyles.includes(style);
            const isConfirming = showApplyConfirm === s.id;
            return (
              <div key={s.id} className="relative">
                <button
                  onClick={() => {
                    if (isConfirming) {
                      const storeSet = STORE_FURNITURE_SETS.find((fs) => fs.id === s.id);
                      if (storeSet) applyFurnitureSet(storeSet);
                      setShowApplyConfirm(null);
                    } else {
                      setShowApplyConfirm(s.id);
                    }
                  }}
                  className={`w-full flex items-start gap-2.5 p-2 rounded-lg border text-left transition-all group ${
                    isConfirming
                      ? 'bg-red-50 border-red-300 hover:bg-red-100'
                      : isRecommended
                        ? 'bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-400'
                        : 'bg-gray-50 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                  }`}
                >
                  <span className="text-xl flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                    {s.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${
                        isConfirming ? 'text-red-700' : 'text-gray-800 group-hover:text-blue-700'
                      }`}>
                        {isConfirming ? 'クリックで適用' : s.name}
                      </span>
                      {isRecommended && !isConfirming && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                          推奨
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {isConfirming ? '既存の家具がすべて削除されます' : s.description}
                    </div>
                    <div className="text-[10px] text-gray-300 mt-0.5">
                      {s.items.length}点
                    </div>
                  </div>
                </button>
                {isConfirming && (
                  <button
                    onClick={() => setShowApplyConfirm(null)}
                    className="absolute top-1 right-1 text-[10px] text-gray-400 hover:text-gray-600 px-1"
                    title="キャンセル"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* Furniture */}
      <Section title="什器・家具" collapsible={isMobile} mobileCollapsible={isMobile} defaultOpen={true}>
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setFurnitureTab('single')}
            className={`flex-1 px-2 py-1 rounded text-[10px] font-medium ${
              furnitureTab === 'single' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'
            }`}
          >
            単品
          </button>
          <button
            onClick={() => setFurnitureTab('sets')}
            className={`flex-1 px-2 py-1 rounded text-[10px] font-medium ${
              furnitureTab === 'sets' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-500'
            }`}
          >
            セット
          </button>
        </div>

        {/* 3Dモデル読込ボタン */}
        <button
          onClick={() => modelInputRef.current?.click()}
          className="w-full mb-2 px-2 py-1.5 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 border border-purple-200 rounded-md text-xs font-medium text-purple-700 flex items-center justify-center gap-1.5 transition-colors"
        >
          <span>📦</span>
          3Dモデル読込 (.glb/.gltf)
        </button>
        <input
          ref={modelInputRef}
          type="file"
          accept=".glb,.gltf"
          onChange={handleModelFileChange}
          className="hidden"
        />

        {/* カスタムモデル一覧 */}
        {furniture.filter(f => f.type === 'custom').length > 0 && (
          <div className="mb-2 p-2 bg-purple-50/50 border border-purple-100 rounded-md">
            <div className="text-[10px] font-medium text-purple-600 mb-1">読込済みモデル</div>
            <div className="text-[9px] text-amber-600 mb-1.5">* ページ再読込後は再インポートが必要です</div>
            <div className="space-y-0.5">
              {furniture.filter(f => f.type === 'custom').map(f => (
                <div
                  key={f.id}
                  className={`flex items-center gap-1 px-1.5 py-1 rounded text-[10px] cursor-pointer transition-colors ${
                    selectedFurnitureId === f.id ? 'bg-purple-200 text-purple-800' : 'hover:bg-purple-100 text-purple-700'
                  }`}
                  onClick={() => setSelectedFurniture(f.id)}
                >
                  <span>📦</span>
                  <span className="truncate flex-1">{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {furnitureTab === 'single' ? (
          <div>
            <input
              type="text"
              value={furnitureSearch}
              onChange={(e) => setFurnitureSearch(e.target.value)}
              placeholder="家具を検索..."
              className={`w-full px-3 py-2 border border-gray-200 rounded-md text-xs placeholder:text-gray-300 focus:border-blue-400 focus:outline-none mb-2 ${
                isMobile ? 'min-h-[44px]' : ''
              }`}
            />
            <div className="flex flex-wrap gap-1 mb-2">
              {CATEGORY_LIST.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setFurnitureCategory(cat.key)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    furnitureCategory === cat.key
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-400">
                該当する什器がありません
              </div>
            ) : (
              <div className={`grid ${isMobile ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                {filteredCatalog.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => handleAddFurniture(item.type)}
                    className={`flex items-center gap-1 px-2 py-1.5 bg-gray-50 rounded hover:bg-blue-50 border border-gray-200 text-left text-xs transition-all duration-150 active:scale-95 hover:border-blue-300 hover:shadow-sm ${
                      isMobile ? 'flex-col gap-0.5 py-2 text-center min-h-[44px]' : ''
                    }`}
                  >
                    <span className={isMobile ? 'text-xl' : 'text-base'}>{item.icon}</span>
                    <span className="text-gray-700 truncate text-[10px]">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {FURNITURE_SETS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleAddSet(s.id)}
                className="w-full flex items-center gap-2 p-2 bg-gray-50 rounded-lg hover:bg-blue-50 border border-gray-200 text-left transition-all duration-150 active:scale-95 hover:border-blue-300 hover:shadow-sm"
              >
                <span className="text-xl">{s.icon}</span>
                <div>
                  <div className="text-xs font-medium text-gray-700">{s.name}</div>
                  <div className="text-[10px] text-gray-400">{s.items.length}点セット</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Selected Wall Properties */}
      {selectedWall && (
        <Section title="選択中の壁">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>長さ</span>
              <span className="font-mono">{wallLength(selectedWall).toFixed(2)}m</span>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">厚さ (m)</label>
              <input
                type="number"
                value={selectedWall.thickness}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0.05 && v <= 1) updateWall(selectedWall.id, { thickness: v });
                }}
                min={0.05}
                max={1}
                step={0.01}
                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">壁色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedWall.color}
                  onChange={(e) => updateWall(selectedWall.id, { color: e.target.value })}
                  className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-gray-400">{selectedWall.color}</span>
              </div>
            </div>
            <button
              onClick={() => deleteWall(selectedWall.id)}
              className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 text-xs font-medium"
            >
              壁を削除
            </button>
          </div>
        </Section>
      )}

      {/* Selected Furniture Properties */}
      {selectedFurnitureItem && (
        <Section title={`選択: ${selectedFurnitureItem.name}`}>
          <div className="space-y-3">
            {/* 回転 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">回転</label>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round((selectedFurnitureItem.rotation[1] * 180) / Math.PI) % 360}
                onChange={(e) => {
                  const deg = parseInt(e.target.value);
                  rotateFurniture(selectedFurnitureItem.id, (deg * Math.PI) / 180);
                }}
                className="w-full h-1.5 accent-blue-600"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400 font-mono">
                  {Math.round((selectedFurnitureItem.rotation[1] * 180) / Math.PI) % 360}°
                </span>
                <div className="flex gap-1">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => rotateFurniture(selectedFurnitureItem.id, (deg * Math.PI) / 180)}
                      className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-600 hover:bg-gray-200"
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* スケール */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">サイズ</label>
              <div className="grid grid-cols-3 gap-1.5">
                {['幅', '高', '奥'].map((label, i) => (
                  <div key={i}>
                    <span className="text-[9px] text-gray-400">{label}</span>
                    <input
                      type="number"
                      value={selectedFurnitureItem.scale[i]}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (v > 0.05 && v <= 10) {
                          const newScale = [...selectedFurnitureItem.scale] as [number, number, number];
                          newScale[i] = v;
                          updateFurniture(selectedFurnitureItem.id, { scale: newScale });
                        }
                      }}
                      min={0.05}
                      max={10}
                      step={0.05}
                      className="w-full px-1 py-0.5 border border-gray-300 rounded text-[10px] font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 位置 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">位置</label>
              <div className="flex gap-2 text-[10px] font-mono text-gray-400">
                <span>X: {selectedFurnitureItem.position[0].toFixed(2)}m</span>
                <span>Z: {selectedFurnitureItem.position[2].toFixed(2)}m</span>
              </div>
            </div>

            {/* 色 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={selectedFurnitureItem.color}
                  onChange={(e) => updateFurnitureColor(selectedFurnitureItem.id, e.target.value)}
                  className="w-8 h-6 rounded border border-gray-300 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-gray-400">{selectedFurnitureItem.color}</span>
              </div>
            </div>

            {/* 素材 */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">素材</label>
              <div className="grid grid-cols-4 gap-1">
                {(['wood', 'metal', 'fabric', 'leather', 'glass', 'plastic', 'stone'] as const).map((mat) => (
                  <button
                    key={mat}
                    onClick={() => updateFurnitureMaterial(selectedFurnitureItem.id, mat)}
                    className={`px-1.5 py-1 rounded text-[10px] ${
                      (selectedFurnitureItem.material || 'wood') === mat
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {materialLabels[mat]}
                  </button>
                ))}
              </div>
            </div>

            {/* 3Dモデル */}
            {selectedFurnitureItem.modelUrl && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">3Dモデル</label>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded border border-green-200">
                  <span className="text-green-600 text-xs">✓</span>
                  <span className="text-[10px] font-mono text-green-700 truncate">
                    {selectedFurnitureItem.modelUrl}
                  </span>
                </div>
              </div>
            )}

            {/* アクション */}
            <div className="flex gap-1">
              <button
                onClick={() => duplicateFurniture(selectedFurnitureItem.id)}
                className="flex-1 px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-xs font-medium"
              >
                複製
              </button>
              <button
                onClick={() =>
                  updateFurniture(selectedFurnitureItem.id, {
                    rotation: [
                      selectedFurnitureItem.rotation[0],
                      selectedFurnitureItem.rotation[1] + Math.PI / 4,
                      selectedFurnitureItem.rotation[2],
                    ],
                  })
                }
                className="flex-1 px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-xs"
              >
                ↻ 45°
              </button>
            </div>
            <button
              onClick={() => {
                deleteFurniture(selectedFurnitureItem.id);
                setSelectedFurniture(null);
              }}
              className="w-full px-2 py-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 text-xs font-medium"
            >
              削除
            </button>
          </div>
        </Section>
      )}

      {/* ルームラベル */}
      <Section title="エリアラベル" defaultOpen={false}>
        <div className="space-y-2">
          {roomLabels.map((label) => (
            <div key={label.id} className="flex items-center gap-1">
              <input
                type="text"
                value={label.name}
                onChange={(e) => updateRoomLabel(label.id, { name: e.target.value })}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
                placeholder="エリア名"
              />
              <button
                onClick={() => deleteRoomLabel(label.id)}
                className="px-1.5 py-1 bg-red-50 text-red-500 rounded hover:bg-red-100 text-xs"
                title="削除"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLabelName.trim()) {
                  const area = computeFloorArea(walls);
                  // デフォルト位置: 壁群の重心
                  const pts = walls.flatMap(w => [w.start, w.end]);
                  const cx = pts.length > 0 ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 0;
                  const cy = pts.length > 0 ? pts.reduce((s, p) => s + p.y, 0) / pts.length : 0;
                  if (area > 0) {
                    addRoomLabel({
                      id: `label_${Date.now()}`,
                      name: newLabelName.trim(),
                      position: { x: cx, y: cy },
                    });
                    setNewLabelName('');
                  }
                }
              }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder="新しいエリア名 (Enter)"
            />
            <button
              onClick={() => {
                if (!newLabelName.trim()) return;
                const pts = walls.flatMap(w => [w.start, w.end]);
                const cx = pts.length > 0 ? pts.reduce((s, p) => s + p.x, 0) / pts.length : 0;
                const cy = pts.length > 0 ? pts.reduce((s, p) => s + p.y, 0) / pts.length : 0;
                addRoomLabel({
                  id: `label_${Date.now()}`,
                  name: newLabelName.trim(),
                  position: { x: cx, y: cy },
                });
                setNewLabelName('');
              }}
              className="px-2 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-xs"
            >
              追加
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            ラベルは閉じた壁エリアの中央に表示されます
          </p>
        </div>
      </Section>

      {/* 注釈 */}
      <Section title="注釈" defaultOpen={false}>
        <div className="space-y-2">
          {/* 表示トグル */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showAnnotations}
              onChange={(e) => setShowAnnotations(e.target.checked)}
              className="accent-blue-500"
            />
            注釈を表示
          </label>

          {/* 配置モードボタン */}
          <button
            onClick={() => setActiveTool(activeTool === 'annotation' ? 'select' : 'annotation')}
            className={`w-full px-2 py-1.5 rounded text-xs font-medium ${
              activeTool === 'annotation'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
            }`}
          >
            {activeTool === 'annotation' ? '配置モード ON (クリックで配置)' : '+ 注釈を追加'}
          </button>

          {/* 色選択 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">色:</span>
            {['#ef4444', '#3b82f6', '#22c55e', '#eab308'].map((c) => (
              <button
                key={c}
                onClick={() => setAnnotationColor(c)}
                className={`w-5 h-5 rounded-full border-2 ${
                  annotationColor === c ? 'border-gray-800 scale-110' : 'border-gray-300'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>

          {/* 注釈リスト */}
          {annotations.length > 0 ? (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {annotations.map((ann, i) => (
                <div key={ann.id} className="flex items-start gap-1.5 p-1.5 bg-gray-50 rounded text-xs group">
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center mt-0.5"
                    style={{ backgroundColor: ann.color }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={ann.text}
                      onChange={(e) => updateAnnotation(ann.id, { text: e.target.value })}
                      className="w-full px-1 py-0.5 border border-transparent hover:border-gray-300 focus:border-blue-400 rounded text-xs bg-transparent outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                    {/* 色変更 */}
                    <select
                      value={ann.color}
                      onChange={(e) => updateAnnotation(ann.id, { color: e.target.value })}
                      className="text-[10px] border border-gray-200 rounded px-0.5 py-0.5 bg-white"
                    >
                      <option value="#ef4444">赤</option>
                      <option value="#3b82f6">青</option>
                      <option value="#22c55e">緑</option>
                      <option value="#eab308">黄</option>
                    </select>
                    {/* 表示/非表示 */}
                    <button
                      onClick={() => updateAnnotation(ann.id, { visible: !ann.visible })}
                      className={`px-1 py-0.5 rounded text-[10px] ${
                        ann.visible ? 'text-gray-500' : 'text-gray-300'
                      }`}
                      title={ann.visible ? '非表示' : '表示'}
                    >
                      {ann.visible ? '👁' : '🚫'}
                    </button>
                    {/* 削除 */}
                    <button
                      onClick={() => deleteAnnotation(ann.id)}
                      className="px-1 py-0.5 text-red-400 hover:text-red-600 text-[10px]"
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">
              注釈がありません。3Dビューでクリックして配置できます。
            </p>
          )}
        </div>
      </Section>

      {/* Help Panel */}
      <Section title="ヘルプ" collapsible defaultOpen={false}>
        <div className="space-y-3">
          {/* ショートカット早見表 */}
          <div>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">主要ショートカット</h4>
            <div className="space-y-0.5 text-[11px]">
              {[
                { keys: 'Ctrl+Z / Y', desc: '元に戻す / やり直す' },
                { keys: 'Ctrl+C / V', desc: 'コピー / 貼付' },
                { keys: 'Ctrl+D', desc: '複製' },
                { keys: 'Shift+Click', desc: '複数選択' },
                { keys: 'Del', desc: '選択削除' },
                { keys: 'H / C / G', desc: '壁 / 天井 / グリッド切替' },
              ].map((s) => (
                <div key={s.keys} className="flex items-center justify-between py-0.5">
                  <span className="text-gray-500">{s.desc}</span>
                  <kbd className="font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 text-[10px]">{s.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
          {/* チュートリアル再実行 */}
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => {
                resetTutorial();
                window.location.reload();
              }}
              className="w-full text-left px-3 py-2 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              チュートリアルを再表示
            </button>
            <button
              onClick={() => {
                resetQuickTips();
              }}
              className="w-full text-left px-3 py-2 text-xs text-gray-500 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              ヒント表示をリセット
            </button>
          </div>
          {/* 基本Tips */}
          <div>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">基本Tips</h4>
            <ul className="text-[11px] text-gray-500 space-y-1 list-none">
              <li className="flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5 flex-shrink-0">&#9679;</span>
                <span>壁をクリックしてドアや窓を追加</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5 flex-shrink-0">&#9679;</span>
                <span>.glb / .gltf ファイルを3Dビューにドラッグ&ドロップでカスタムモデル読込</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5 flex-shrink-0">&#9679;</span>
                <span>共有リンクやQRコードでプロジェクトを他のメンバーに共有可能</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-blue-400 mt-0.5 flex-shrink-0">&#9679;</span>
                <span>プロジェクトは自動保存されます</span>
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Stats */}
      <div className={`${isMobile ? '' : 'mt-auto'} p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-400`}>
        <div>壁: {walls.length} | 什器: {furniture.length}</div>
        <div className="mt-1 text-gray-500 font-medium">
          面積: {computeFloorArea(walls).toFixed(1)}m² ({(computeFloorArea(walls) / 3.306).toFixed(1)}坪)
        </div>
      </div>
    </>
  );

  // Mobile: bottom sheet with swipe gestures and snap heights
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sheetRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const touchStartYRef = useRef(0);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isDraggingSheetRef = useRef(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [sheetHeight, setSheetHeight] = useState<25 | 50 | 75>(50);

  const snapHeights = [25, 50, 75] as const;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    isDraggingSheetRef.current = true;
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingSheetRef.current) return;
    const delta = e.touches[0].clientY - touchStartYRef.current;
    if (sheetRef.current && delta > 0) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleSheetTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDraggingSheetRef.current) return;
    isDraggingSheetRef.current = false;
    const delta = e.changedTouches[0].clientY - touchStartYRef.current;
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
    }

    if (delta > 50) {
      // 下方向スワイプ → 高さを下げるか閉じる
      const currentIdx = snapHeights.indexOf(sheetHeight);
      if (currentIdx <= 0) {
        onClose?.();
      } else {
        setSheetHeight(snapHeights[currentIdx - 1]);
      }
    } else if (delta < -50) {
      // 上方向スワイプ → 高さを上げる
      const currentIdx = snapHeights.indexOf(sheetHeight);
      if (currentIdx < snapHeights.length - 1) {
        setSheetHeight(snapHeights[currentIdx + 1]);
      }
    }
  }, [sheetHeight, onClose]);

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 transition-opacity"
            onClick={onClose}
          />
        )}
        {/* Sheet — スワイプスナップ対応 */}
        <div
          ref={sheetRef}
          className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 bottom-sheet ${
            isOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
          style={{ height: `${sheetHeight}dvh` }}
        >
          {/* Drag handle bar — スワイプ操作エリア */}
          <div
            className="flex flex-col items-center pt-2 pb-1.5 cursor-grab active:cursor-grabbing touch-none select-none"
            onTouchStart={handleSheetTouchStart}
            onTouchMove={handleSheetTouchMove}
            onTouchEnd={handleSheetTouchEnd}
          >
            <div className="w-10 h-1 bg-gray-300 rounded-full mb-1" />
            <div className="w-6 h-0.5 bg-gray-200 rounded-full" />
          </div>
          {/* スナップ高さインジケーター */}
          <div className="flex justify-center gap-1.5 pb-1">
            {snapHeights.map((h) => (
              <button
                key={h}
                onClick={() => setSheetHeight(h)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  sheetHeight === h ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          {/* Scrollable content */}
          <div className="overflow-y-auto text-sm pb-safe scroll-smooth-panel" style={{ height: `calc(${sheetHeight}dvh - 48px)` }}>
            {isOpen ? panelContent : null}
          </div>
        </div>
      </>
    );
  }

  // Desktop: sidebar
  return (
    <div className="w-72 bg-white border-l border-gray-200 overflow-y-auto flex flex-col text-sm scroll-smooth-panel">
      {panelContent}
    </div>
  );
}

function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  mobileCollapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  mobileCollapsible?: boolean;
}) {
  const isCollapsible = collapsible || mobileCollapsible;
  const [isOpen, setIsOpen] = useState(mobileCollapsible ? false : defaultOpen);

  return (
    <div className="border-b border-gray-100">
      <button
        onClick={isCollapsible ? () => setIsOpen(!isOpen) : undefined}
        className={`w-full p-3 pb-2 flex items-center justify-between transition-colors duration-150 ${isCollapsible ? 'cursor-pointer hover:bg-gray-50 active:scale-[0.99]' : 'cursor-default'}`}
      >
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
        {isCollapsible && (
          <span className={`text-[10px] text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
        )}
      </button>
      <div className="section-content" data-open={isCollapsible ? isOpen : true}>
        <div>
          <div className="px-3 pb-3">{children}</div>
        </div>
      </div>
    </div>
  );
}
