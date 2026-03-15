'use client';

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import type { StyleAnalysis, LayoutSuggestion, BusinessType } from '@/types/ai';
import type { ScoredLayoutSuggestion } from '@/lib/ai-layout-suggester';
import type { LayoutQualityScore } from '@/lib/layout-rules';
import type { StylePreset, FurnitureType, FurnitureItem } from '@/types/scene';
import { useEditorStore } from '@/stores/useEditorStore';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { showToast } from '@/components/ui/Toast';
import PromptStudioPanel from '@/components/ui/PromptStudioPanel';

// ── 定数 ──────────────────────────────────────────

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'restaurant', label: '飲食店' },
  { value: 'cafe', label: 'カフェ' },
  { value: 'bar', label: 'バー' },
  { value: 'office', label: 'オフィス' },
  { value: 'shop', label: 'ショップ' },
  { value: 'salon', label: 'サロン' },
  { value: 'clinic', label: 'クリニック' },
];

const STYLE_OPTIONS = [
  { value: '', label: '自動判定' },
  { value: 'modern', label: 'モダン' },
  { value: 'japanese', label: '和風' },
  { value: 'industrial', label: 'インダストリアル' },
  { value: 'scandinavian', label: '北欧' },
  { value: 'natural', label: 'ナチュラル' },
  { value: 'luxury', label: 'ラグジュアリー' },
  { value: 'retro', label: 'レトロ' },
  { value: 'cafe', label: 'カフェ風' },
  { value: 'minimal', label: 'ミニマル' },
];

const STYLE_LABELS: Record<string, string> = {
  modern: 'モダン',
  japanese: '和風',
  industrial: 'インダストリアル',
  scandinavian: '北欧',
  natural: 'ナチュラル',
  luxury: 'ラグジュアリー',
  retro: 'レトロ',
  cafe: 'カフェ風',
  minimal: 'ミニマル',
};

const MATERIAL_LABELS: Record<string, string> = {
  wood: '木材',
  concrete: 'コンクリート',
  metal: '金属',
  fabric: 'ファブリック',
  glass: 'ガラス',
  stone: '石材',
  leather: 'レザー',
};

const LIGHTING_LABELS: Record<string, string> = {
  warm: '暖色系',
  neutral: 'ニュートラル',
  cool: '寒色系',
};

const PERSE_STYLE_OPTIONS = [
  { value: 'photorealistic', label: 'フォトリアル' },
  { value: 'sketch', label: 'スケッチ風' },
  { value: 'watercolor', label: '水彩画風' },
  { value: 'modern', label: 'モダン' },
  { value: 'japanese', label: '和風' },
  { value: 'industrial', label: 'インダストリアル' },
  { value: 'scandinavian', label: '北欧' },
  { value: 'luxury', label: 'ラグジュアリー' },
  { value: 'cafe', label: 'カフェ風' },
  { value: 'minimal', label: 'ミニマル' },
  { value: 'warm', label: '暖かみのある' },
  { value: 'cool', label: 'クールモダン' },
  { value: 'blueprint', label: '設計図風' },
];

type TabId = 'photo' | 'layout' | 'generate' | 'prompt-studio';

interface AIAssistPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── エラー判定 ─────────────────────────────────────

interface APIError {
  message: string;
  code: string;
}

function parseAPIError(err: unknown): APIError {
  if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
    return { message: 'ネットワークに接続できません', code: 'NETWORK_ERROR' };
  }
  if (err instanceof Error) {
    if (err.message.includes('API_KEY') || err.message.includes('未設定')) {
      return { message: 'APIキーが未設定です。環境変数 GEMINI_API_KEY を設定してください。', code: 'API_KEY_MISSING' };
    }
    if (err.message.includes('429') || err.message.includes('rate')) {
      return { message: 'リクエスト制限に達しました。しばらく待ってから再試行してください。', code: 'RATE_LIMIT' };
    }
    return { message: err.message, code: 'UNKNOWN' };
  }
  return { message: '不明なエラーが発生しました', code: 'UNKNOWN' };
}

// ── ストア連携ヘルパー ──────────────────────────────

const STYLE_MAP: Record<string, StylePreset> = {
  modern: 'modern',
  japanese: 'japanese',
  industrial: 'industrial',
  scandinavian: 'scandinavian',
  natural: 'scandinavian', // closest match
  luxury: 'luxury',
  retro: 'retro',
  cafe: 'cafe',
  minimal: 'minimal',
};

function applyStyleToStore(analysisStyle: string) {
  const mapped = STYLE_MAP[analysisStyle];
  if (!mapped) return;
  const store = useEditorStore.getState();
  store.setStyle(mapped);
  showToast(`スタイル「${STYLE_LABELS[analysisStyle] ?? analysisStyle}」を適用しました`, 'success');
}

function resolveFurnitureType(aiType: string): FurnitureType {
  const normalized = aiType.toLowerCase().replace(/[\s_-]+/g, '_');
  const catalog = FURNITURE_CATALOG.find(
    (c) => c.type === normalized || c.name.includes(aiType)
  );
  if (catalog) return catalog.type;
  // Fallback mapping
  const fallbacks: Record<string, FurnitureType> = {
    table: 'table_square',
    round_table: 'table_round',
    chair: 'chair',
    sofa: 'sofa',
    counter: 'counter',
    shelf: 'shelf',
    stool: 'stool',
    partition: 'partition',
    desk: 'desk',
    plant: 'plant',
    light: 'pendant_light',
    register: 'register',
    reception: 'reception_desk',
    bench: 'bench',
  };
  for (const [key, val] of Object.entries(fallbacks)) {
    if (normalized.includes(key)) return val;
  }
  return 'table_square'; // ultimate fallback
}

function applyLayoutToStore(suggestion: LayoutSuggestion) {
  const store = useEditorStore.getState();
  const items: Omit<FurnitureItem, 'id'>[] = suggestion.furniture.map((f) => {
    const furnitureType = resolveFurnitureType(f.type);
    const catalog = FURNITURE_CATALOG.find((c) => c.type === furnitureType);
    return {
      type: furnitureType,
      name: f.name,
      position: [f.x, 0, f.z] as [number, number, number],
      rotation: [0, f.rotation, 0] as [number, number, number],
      scale: catalog?.defaultScale ?? [1, 1, 1],
      color: catalog?.defaultColor,
      modelUrl: catalog?.modelUrl,
    };
  });
  store.addFurnitureSet(items);
  showToast(`「${suggestion.layoutName}」(${items.length}点) を配置しました`, 'success');
}

// ── メインコンポーネント ───────────────────────────

export default function AIAssistPanel({ isOpen, onClose }: AIAssistPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('photo');

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'photo', label: '写真分析' },
    { id: 'layout', label: 'レイアウト' },
    { id: 'generate', label: 'AI生成' },
    { id: 'prompt-studio', label: 'プロンプト' },
  ];

  return (
    <>
      {/* モバイルオーバーレイ */}
      <div
        className="fixed inset-0 bg-black/30 z-40 md:hidden"
        onClick={onClose}
      />

      {/* パネル本体 */}
      <div
        className={
          'fixed z-50 bg-white text-gray-800 flex flex-col ' +
          // デスクトップ: 右サイドバー
          'md:right-0 md:top-0 md:bottom-0 md:w-80 md:border-l md:border-gray-200 ' +
          // モバイル: ボトムシート
          'inset-x-0 bottom-0 max-h-[85vh] md:max-h-none rounded-t-2xl md:rounded-none ' +
          'transition-transform duration-300 ease-out shadow-lg'
        }
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
          {/* モバイルドラッグハンドル */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-300 rounded-full md:hidden" />
          <h2 className="text-sm font-bold tracking-wide text-gray-700">アシスト</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            aria-label="閉じる"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-200 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                'flex-1 px-3 py-2.5 text-xs font-medium transition-colors ' +
                (activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-400 hover:text-gray-600')
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'photo' && <PhotoAnalysisTab />}
          {activeTab === 'layout' && <LayoutSuggestionTab />}
          {activeTab === 'generate' && <ImageGenerationTab />}
          {activeTab === 'prompt-studio' && <PromptStudioPanel />}
        </div>
      </div>
    </>
  );
}

// ── タブ1: 写真分析 ────────────────────────────────

function PhotoAnalysisTab() {
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);
  const [result, setResult] = useState<StyleAnalysis | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string)?.split(',')[1];
      if (base64) {
        setImageData(base64);
        setImageName(file.name);
        setError(null);
        setResult(null);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const analyze = async () => {
    if (!imageData) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData, businessType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `サーバーエラー (${res.status})`);
      }
      const data: StyleAnalysis = await res.json();
      setResult(data);
    } catch (err) {
      setError(parseAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* アップロードエリア */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={
          'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ' +
          (isDragging
            ? 'border-blue-400 bg-blue-50'
            : imageData
              ? 'border-green-400 bg-green-50'
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50')
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
        {imageData ? (
          <div className="space-y-1">
            <svg className="w-6 h-6 mx-auto text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-xs text-green-600 truncate">{imageName}</p>
            <p className="text-[10px] text-gray-400">クリックで変更</p>
          </div>
        ) : (
          <div className="space-y-2">
            <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <p className="text-xs text-gray-400">参考写真をドロップ</p>
            <p className="text-[10px] text-gray-500">またはクリックで選択</p>
          </div>
        )}
      </div>

      {/* 業種選択 */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">業種</label>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
        >
          {BUSINESS_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>{bt.label}</option>
          ))}
        </select>
      </div>

      {/* 分析ボタン */}
      <button
        onClick={analyze}
        disabled={!imageData || loading}
        className={
          'w-full py-2.5 rounded-lg text-sm font-medium transition-all ' +
          (imageData && !loading
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed')
        }
      >
        {loading ? <Spinner label="分析中..." /> : '分析する'}
      </button>

      {/* エラー */}
      {error && <ErrorBanner error={error} />}

      {/* 結果 */}
      {result && <PhotoResult result={result} />}
    </div>
  );
}

function PhotoResult({ result }: { result: StyleAnalysis }) {
  return (
    <div className="space-y-3 pt-2">
      {/* スタイル + 信頼度 */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{STYLE_LABELS[result.style] ?? result.style}</span>
          <span className="text-[10px] text-gray-400">{Math.round(result.confidence * 100)}%</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${result.confidence * 100}%` }}
          />
        </div>
        {result.atmosphere && (
          <p className="text-[11px] text-gray-500 leading-relaxed">{result.atmosphere}</p>
        )}
      </div>

      {/* カラーパレット */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-2">カラーパレット</p>
        <div className="flex gap-2">
          {[
            { label: 'Primary', color: result.colors.primary },
            { label: 'Secondary', color: result.colors.secondary },
            { label: 'Accent', color: result.colors.accent },
          ].map((c) => (
            <div key={c.label} className="flex-1 text-center">
              <div
                className="w-full h-8 rounded-md border border-gray-200 mb-1"
                style={{ backgroundColor: c.color }}
              />
              <p className="text-[10px] text-gray-400">{c.label}</p>
              <p className="text-[10px] text-gray-500 font-mono">{c.color}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 素材タグ */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-2">素材</p>
        <div className="flex flex-wrap gap-1.5">
          {result.materials.map((m) => (
            <span key={m} className="px-2 py-0.5 text-[11px] bg-gray-200 rounded-full text-gray-600">
              {MATERIAL_LABELS[m] ?? m}
            </span>
          ))}
        </div>
      </div>

      {/* 照明・予算 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] text-gray-400 mb-0.5">照明</p>
          <p className="text-xs font-medium text-gray-700">{LIGHTING_LABELS[result.lighting] ?? result.lighting}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] text-gray-400 mb-0.5">予算目安</p>
          <p className="text-xs font-medium text-gray-700">
            {result.estimatedBudgetRange.min}〜{result.estimatedBudgetRange.max}万円
          </p>
        </div>
      </div>

      {/* 適用ボタン */}
      <button
        onClick={() => applyStyleToStore(result.style)}
        className="w-full py-2 rounded-lg text-sm font-medium bg-green-600/80 hover:bg-green-600 text-white transition-colors"
      >
        このスタイルを適用
      </button>
    </div>
  );
}

// ── タブ2: レイアウト提案 ──────────────────────────

function LayoutSuggestionTab() {
  const [businessType, setBusinessType] = useState<BusinessType>('restaurant');
  const [width, setWidth] = useState(8);
  const [depth, setDepth] = useState(6);
  const [style, setStyle] = useState('');
  const [requirements, setRequirements] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[] | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/suggest-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessType,
          width,
          depth,
          ...(style && { style }),
          ...(requirements && { requirements }),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `サーバーエラー (${res.status})`);
      }
      const data: ScoredLayoutSuggestion[] = await res.json();
      setSuggestions(data);
    } catch (err) {
      setError(parseAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 業種選択 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">業種</label>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
        >
          {BUSINESS_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>{bt.label}</option>
          ))}
        </select>
      </div>

      {/* 部屋サイズ */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">部屋サイズ</label>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              min={1}
              max={100}
              step={0.5}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-[10px] text-gray-500 mt-0.5 text-center">幅 (m)</p>
          </div>
          <span className="text-gray-500 text-sm pt-[-8px]">×</span>
          <div className="flex-1">
            <input
              type="number"
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              min={1}
              max={100}
              step={0.5}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <p className="text-[10px] text-gray-500 mt-0.5 text-center">奥行 (m)</p>
          </div>
        </div>
      </div>

      {/* スタイル選択 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">スタイル（任意）</label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
        >
          {STYLE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* 追加要件 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">追加要件（任意）</label>
        <textarea
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          placeholder="例: カウンター席を含めたい、個室が必要..."
          rows={3}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder:text-gray-400"
        />
      </div>

      {/* 提案取得ボタン */}
      <button
        onClick={fetchSuggestions}
        disabled={loading}
        className={
          'w-full py-2.5 rounded-lg text-sm font-medium transition-all ' +
          (!loading
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed')
        }
      >
        {loading ? <Spinner label="提案を取得中..." /> : '提案を取得'}
      </button>

      {/* エラー */}
      {error && <ErrorBanner error={error} />}

      {/* 提案カード */}
      {suggestions && (
        <div className="space-y-3 pt-2">
          {suggestions.map((s, i) => (
            <LayoutCard key={i} suggestion={s} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function LayoutCard({ suggestion, index }: { suggestion: ScoredLayoutSuggestion; index: number }) {
  const patternLabels = ['パターン A', 'パターン B', 'パターン C'];
  const [showDetails, setShowDetails] = useState(false);
  const qs = suggestion.qualityScore;

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2.5">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] text-blue-400 font-medium">{patternLabels[index] ?? `パターン ${index + 1}`}</span>
          <h4 className="text-sm font-medium mt-0.5">{suggestion.layoutName}</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
            {suggestion.capacityEstimate}人
          </span>
          {qs && (
            <span
              className={
                'text-[11px] font-bold px-2 py-0.5 rounded-full ' +
                (qs.total >= 80
                  ? 'bg-green-50 text-green-600'
                  : qs.total >= 60
                    ? 'bg-yellow-50 text-yellow-600'
                    : 'bg-red-50 text-red-600')
              }
            >
              {qs.total}点
            </span>
          )}
        </div>
      </div>

      {/* 説明 */}
      <p className="text-[11px] text-gray-400 leading-relaxed">{suggestion.description}</p>

      {/* 品質スコア内訳 */}
      {qs && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">品質スコア</span>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-[9px] text-blue-400 hover:text-blue-300"
            >
              {showDetails ? '閉じる' : '詳細'}
            </button>
          </div>
          <QualityScoreBar label="総合" score={qs.total} />
          {showDetails && (
            <div className="space-y-1 pl-1">
              <QualityScoreBar label="通路幅" score={qs.passageScore} />
              <QualityScoreBar label="動線" score={qs.flowScore} />
              <QualityScoreBar label="効率" score={qs.efficiencyScore} />
              <QualityScoreBar label="必須家具" score={qs.requiredFurnitureScore} />
              <QualityScoreBar label="配置ルール" score={qs.placementRuleScore} />
              {qs.details.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {qs.details.slice(0, 5).map((d, di) => (
                    <p key={di} className="text-[9px] text-gray-500 leading-tight">
                      - {d}
                    </p>
                  ))}
                  {qs.details.length > 5 && (
                    <p className="text-[9px] text-gray-500">...他{qs.details.length - 5}件</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 動線スコア (AIからの自己申告値) */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">AI動線スコア</span>
          <span className="text-[10px] text-gray-400">{suggestion.flowScore}/100</span>
        </div>
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={
              'h-full rounded-full transition-all duration-500 ' +
              (suggestion.flowScore >= 80
                ? 'bg-green-500'
                : suggestion.flowScore >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-500')
            }
            style={{ width: `${suggestion.flowScore}%` }}
          />
        </div>
      </div>

      {/* 理由 */}
      {suggestion.reasoning && (
        <p className="text-[10px] text-gray-500 leading-relaxed italic">{suggestion.reasoning}</p>
      )}

      {/* 適用ボタン */}
      <button
        onClick={() => applyLayoutToStore(suggestion)}
        className="w-full py-1.5 rounded-md text-xs font-medium bg-green-600/80 hover:bg-green-600 text-white transition-colors"
      >
        この配置を適用
      </button>
    </div>
  );
}

/** スコアバーコンポーネント */
function QualityScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] text-gray-500 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={
            'h-full rounded-full transition-all duration-500 ' +
            (score >= 80
              ? 'bg-green-500'
              : score >= 60
                ? 'bg-yellow-500'
                : 'bg-red-500')
          }
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[9px] text-gray-400 w-6 text-right">{score}</span>
    </div>
  );
}

// ── タブ3: AIパースイメージ生成 ──────────────────────

/** 3Dキャンバスからbase64スクリーンショットを取得 */
function capture3DCanvasBase64(): { base64: string; mimeType: string } | null {
  // R3Fのキャンバスを探す（preserveDrawingBuffer: true が必要）
  const canvases = document.querySelectorAll('canvas');
  let targetCanvas: HTMLCanvasElement | null = null;

  for (const c of canvases) {
    // R3Fキャンバスは通常WebGLコンテキストを持つ
    // 注意: getContext() は既に取得済みのコンテキストを返す（新規作成しない）
    // WebGL2 → WebGL の順で確認
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (gl) {
      targetCanvas = c;
      break;
    }
  }

  // WebGLコンテキスト取得で見つからない場合のフォールバック:
  // data-engine属性やサイズからR3Fキャンバスを推定
  if (!targetCanvas) {
    for (const c of canvases) {
      // R3Fは通常最も大きなキャンバスを使う
      if (c.width > 100 && c.height > 100) {
        targetCanvas = c;
        break;
      }
    }
  }

  if (!targetCanvas) return null;

  try {
    // toDataURL は preserveDrawingBuffer: true でないと空画像になる場合がある
    const dataUrl = targetCanvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    if (!base64 || base64.length < 1000) {
      // 空画像（極小base64）の場合は失敗とみなす
      console.warn('[capture3DCanvas] Canvas returned empty or tiny image — preserveDrawingBuffer may be false');
      return null;
    }
    return { base64, mimeType: 'image/png' };
  } catch (e) {
    console.warn('[capture3DCanvas] toDataURL failed:', e);
    return null;
  }
}

function ImageGenerationTab() {
  const [style, setStyle] = useState('photorealistic');
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<APIError | null>(null);
  const [generatedImage, setGeneratedImage] = useState<{
    base64: string;
    mimeType: string;
    description: string;
  } | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const captureAndGenerate = async () => {
    setLoading(true);
    setError(null);
    setGeneratedImage(null);

    // 3Dキャンバスからスクリーンショットを取得
    const captured = capture3DCanvasBase64();
    if (!captured) {
      setError({
        message: '3Dビューのキャプチャに失敗しました。以下を確認してください:\n' +
          '- 3Dビューが画面に表示されていること\n' +
          '- 家具や壁が配置されていること\n' +
          '- ブラウザがWebGLをサポートしていること',
        code: 'CAPTURE_FAILED',
      });
      setLoading(false);
      return;
    }

    setScreenshotPreview(`data:${captured.mimeType};base64,${captured.base64}`);

    try {
      const res = await fetch('/api/ai/generate-perse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: captured.base64,
          mimeType: captured.mimeType,
          style,
          additionalPrompt: additionalPrompt || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `サーバーエラー (${res.status})`);
      }

      const data = await res.json();
      setGeneratedImage({
        base64: data.imageBase64,
        mimeType: data.imageMimeType,
        description: data.description,
      });
    } catch (err) {
      setError(parseAPIError(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = useCallback(() => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = `data:${generatedImage.mimeType};base64,${generatedImage.base64}`;
    link.download = `perse-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('パースイメージをダウンロードしました', 'success');
  }, [generatedImage]);

  return (
    <div className="p-4 space-y-4">
      {/* 説明 */}
      <div className="bg-gray-50 rounded-lg p-3">
        <p className="text-xs text-gray-400 leading-relaxed">
          現在の3Dビューをキャプチャし、AIがフォトリアルな完成パースイメージを生成します。
        </p>
      </div>

      {/* スタイル選択 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">スタイル</label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          disabled={loading}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
        >
          {PERSE_STYLE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* 追加指示 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">追加指示（任意）</label>
        <textarea
          value={additionalPrompt}
          onChange={(e) => setAdditionalPrompt(e.target.value)}
          placeholder="例: 夕暮れ時の雰囲気で、観葉植物を多めに..."
          rows={2}
          disabled={loading}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder:text-gray-400 disabled:opacity-50"
        />
      </div>

      {/* 生成ボタン */}
      <button
        onClick={captureAndGenerate}
        disabled={loading}
        className={
          'w-full py-2.5 rounded-lg text-sm font-medium transition-all ' +
          (!loading
            ? 'bg-blue-600 hover:bg-blue-500 text-white'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed')
        }
      >
        {loading ? <Spinner label="パースイメージを生成中..." /> : '3Dビューからパースイメージを生成'}
      </button>

      {/* ローディング中の進捗表示 */}
      {loading && (
        <div className="bg-blue-50 rounded-lg p-3 space-y-2 border border-blue-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <p className="text-xs text-blue-600 font-medium">AIが画像を生成しています...</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-blue-400">
              Gemini Image Generation で処理中
            </p>
            <p className="text-[10px] text-blue-400">
              通常20〜50秒かかります。このままお待ちください。
            </p>
          </div>
          {/* 進捗バーアニメーション */}
          <div className="h-1 bg-blue-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 rounded-full animate-[progress_50s_linear]"
              style={{ animation: 'progress 50s linear forwards' }} />
          </div>
          <style>{`@keyframes progress { from { width: 0% } to { width: 95% } }`}</style>
          {screenshotPreview && (
            <div>
              <p className="text-[10px] text-blue-400 mb-1">入力画像:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshotPreview}
                alt="キャプチャされた3Dビュー"
                className="w-full rounded-md border border-blue-200 opacity-70"
              />
            </div>
          )}
        </div>
      )}

      {/* エラー */}
      {error && <ErrorBanner error={error} />}

      {/* 生成結果 */}
      {generatedImage && (
        <div className="space-y-3 pt-2">
          {/* 生成画像プレビュー */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-400 mb-1">生成されたパースイメージ</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:${generatedImage.mimeType};base64,${generatedImage.base64}`}
              alt="生成されたパースイメージ"
              className="w-full rounded-md border border-gray-200"
            />
          </div>

          {/* 説明テキスト */}
          {generatedImage.description && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {generatedImage.description}
              </p>
            </div>
          )}

          {/* ダウンロードボタン */}
          <button
            onClick={downloadImage}
            className="w-full py-2 rounded-lg text-sm font-medium bg-green-600/80 hover:bg-green-600 text-white transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            ダウンロード
          </button>

          {/* 再生成ボタン */}
          <button
            onClick={captureAndGenerate}
            className="w-full py-1.5 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
          >
            別のスタイルで再生成
          </button>
        </div>
      )}
    </div>
  );
}

// ── 共通サブコンポーネント ──────────────────────────

function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </span>
  );
}

function ErrorBanner({ error }: { error: APIError }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-xs text-red-600 whitespace-pre-line">{error.message}</p>
          {error.code === 'API_KEY_MISSING' && (
            <p className="text-[10px] text-red-400 mt-1">
              .env.local に GEMINI_API_KEY を追加してください
            </p>
          )}
          {error.code === 'RATE_LIMIT' && (
            <p className="text-[10px] text-red-400 mt-1">
              Google AI Studio 無料枠の制限です。1〜2分後に再試行してください。
            </p>
          )}
          {error.code === 'CAPTURE_FAILED' && (
            <p className="text-[10px] text-red-400 mt-1">
              3Dビュータブに切り替えてから再試行してください。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
