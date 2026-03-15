'use client';

import { useState, useCallback, useRef, type DragEvent, type ChangeEvent } from 'react';
import type { StyleAnalysis, LayoutSuggestion, BusinessType } from '@/types/ai';

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

type TabId = 'photo' | 'layout' | 'generate';

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

// ── メインコンポーネント ───────────────────────────

export default function AIAssistPanel({ isOpen, onClose }: AIAssistPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('photo');

  if (!isOpen) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: 'photo', label: '写真分析' },
    { id: 'layout', label: 'レイアウト' },
    { id: 'generate', label: 'AI生成' },
  ];

  return (
    <>
      {/* モバイルオーバーレイ */}
      <div
        className="fixed inset-0 bg-black/40 z-40 md:hidden"
        onClick={onClose}
      />

      {/* パネル本体 */}
      <div
        className={
          'fixed z-50 bg-gray-900/95 backdrop-blur-sm text-gray-100 flex flex-col ' +
          // デスクトップ: 右サイドバー
          'md:right-0 md:top-0 md:bottom-0 md:w-80 md:border-l md:border-gray-700 ' +
          // モバイル: ボトムシート
          'inset-x-0 bottom-0 max-h-[85vh] md:max-h-none rounded-t-2xl md:rounded-none ' +
          'transition-transform duration-300 ease-out'
        }
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          {/* モバイルドラッグハンドル */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-600 rounded-full md:hidden" />
          <h2 className="text-sm font-bold tracking-wide">AIアシスト</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-gray-700 transition-colors text-gray-400 hover:text-gray-200"
            aria-label="閉じる"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* タブ */}
        <div className="flex border-b border-gray-700 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={
                'flex-1 px-3 py-2.5 text-xs font-medium transition-colors ' +
                (activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200')
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
            ? 'border-blue-400 bg-blue-500/10'
            : imageData
              ? 'border-green-500/50 bg-green-500/5'
              : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50')
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
            <svg className="w-6 h-6 mx-auto text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-xs text-green-400 truncate">{imageName}</p>
            <p className="text-[10px] text-gray-500">クリックで変更</p>
          </div>
        ) : (
          <div className="space-y-2">
            <svg className="w-8 h-8 mx-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <p className="text-xs text-gray-400">参考写真をドロップ</p>
            <p className="text-[10px] text-gray-500">またはクリックで選択</p>
          </div>
        )}
      </div>

      {/* 業種選択 */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">業種</label>
        <select
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value as BusinessType)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
            : 'bg-gray-800 text-gray-500 cursor-not-allowed')
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
      <div className="bg-gray-800/60 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{STYLE_LABELS[result.style] ?? result.style}</span>
          <span className="text-[10px] text-gray-400">{Math.round(result.confidence * 100)}%</span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${result.confidence * 100}%` }}
          />
        </div>
        {result.atmosphere && (
          <p className="text-[11px] text-gray-400 leading-relaxed">{result.atmosphere}</p>
        )}
      </div>

      {/* カラーパレット */}
      <div className="bg-gray-800/60 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-2">カラーパレット</p>
        <div className="flex gap-2">
          {[
            { label: 'Primary', color: result.colors.primary },
            { label: 'Secondary', color: result.colors.secondary },
            { label: 'Accent', color: result.colors.accent },
          ].map((c) => (
            <div key={c.label} className="flex-1 text-center">
              <div
                className="w-full h-8 rounded-md border border-gray-600 mb-1"
                style={{ backgroundColor: c.color }}
              />
              <p className="text-[10px] text-gray-500">{c.label}</p>
              <p className="text-[10px] text-gray-400 font-mono">{c.color}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 素材タグ */}
      <div className="bg-gray-800/60 rounded-lg p-3">
        <p className="text-xs text-gray-400 mb-2">素材</p>
        <div className="flex flex-wrap gap-1.5">
          {result.materials.map((m) => (
            <span key={m} className="px-2 py-0.5 text-[11px] bg-gray-700 rounded-full text-gray-300">
              {MATERIAL_LABELS[m] ?? m}
            </span>
          ))}
        </div>
      </div>

      {/* 照明・予算 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 mb-0.5">照明</p>
          <p className="text-xs font-medium">{LIGHTING_LABELS[result.lighting] ?? result.lighting}</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 mb-0.5">予算目安</p>
          <p className="text-xs font-medium">
            {result.estimatedBudgetRange.min}〜{result.estimatedBudgetRange.max}万円
          </p>
        </div>
      </div>

      {/* 適用ボタン */}
      <button className="w-full py-2 rounded-lg text-sm font-medium bg-green-600/80 hover:bg-green-600 text-white transition-colors">
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
  const [suggestions, setSuggestions] = useState<LayoutSuggestion[] | null>(null);

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
      const data: LayoutSuggestion[] = await res.json();
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
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
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
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder:text-gray-600"
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
            : 'bg-gray-800 text-gray-500 cursor-not-allowed')
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

function LayoutCard({ suggestion, index }: { suggestion: LayoutSuggestion; index: number }) {
  const patternLabels = ['パターン A', 'パターン B', 'パターン C'];
  return (
    <div className="bg-gray-800/60 rounded-lg p-3 space-y-2.5">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[10px] text-blue-400 font-medium">{patternLabels[index] ?? `パターン ${index + 1}`}</span>
          <h4 className="text-sm font-medium mt-0.5">{suggestion.layoutName}</h4>
        </div>
        <span className="text-[11px] text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">
          {suggestion.capacityEstimate}人
        </span>
      </div>

      {/* 説明 */}
      <p className="text-[11px] text-gray-400 leading-relaxed">{suggestion.description}</p>

      {/* 動線スコア */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">動線スコア</span>
          <span className="text-[10px] text-gray-400">{suggestion.flowScore}/100</span>
        </div>
        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
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
      <button className="w-full py-1.5 rounded-md text-xs font-medium bg-green-600/80 hover:bg-green-600 text-white transition-colors">
        この配置を適用
      </button>
    </div>
  );
}

// ── タブ3: AI画像生成（準備中） ────────────────────

function ImageGenerationTab() {
  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[300px] text-center">
      <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-gray-300 mb-2">AIイメージ生成</h3>
      <p className="text-xs text-gray-500 leading-relaxed max-w-[220px]">
        Nano Banana (gemini-2.5-flash-image) による完成パースイメージの自動生成機能を準備中です。
      </p>
      <div className="mt-4 px-3 py-1.5 rounded-full bg-gray-800 text-[10px] text-gray-400">
        準備中
      </div>
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
    <div className="rounded-lg bg-red-900/30 border border-red-800/50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-xs text-red-300">{error.message}</p>
          {error.code === 'API_KEY_MISSING' && (
            <p className="text-[10px] text-red-400/70 mt-1">
              .env.local に GEMINI_API_KEY を追加してください
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
