'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';
import { showToast } from '@/components/ui/Toast';
import {
  generatePrompt,
  PROMPT_TEMPLATES,
  type PromptConfig,
  type TargetTool,
  type RenderStyleType,
  type GeneratedPrompt,
  type PromptTemplate,
} from '@/lib/ai-prompt-generator';

// ── 定数 ──────────────────────────────────────────

const TOOL_TABS: { id: TargetTool; label: string; description: string }[] = [
  { id: 'generic', label: '汎用', description: '汎用的なプロンプト' },
  { id: 'midjourney', label: 'Midjourney', description: 'Midjourney v6.1用' },
  { id: 'stable-diffusion', label: 'SD', description: 'Stable Diffusion用' },
  { id: 'nano-banana', label: 'Nano Banana', description: 'Nano Banana用' },
  { id: 'dall-e', label: 'DALL-E', description: 'DALL-E用' },
];

const EXTERNAL_TOOLS = [
  { name: 'Nano Banana', url: 'https://www.nanobanana.com/', color: 'bg-yellow-500' },
  { name: 'Midjourney', url: 'https://www.midjourney.com/', color: 'bg-indigo-500' },
  { name: 'Leonardo.ai', url: 'https://leonardo.ai/', color: 'bg-purple-500' },
  { name: 'Playground AI', url: 'https://playground.ai/', color: 'bg-green-500' },
];

const STYLE_LABEL_MAP: Record<string, string> = {
  japanese: '和風',
  modern: 'モダン',
  cafe: 'カフェ',
  industrial: 'インダストリアル',
  minimal: 'ミニマル',
  luxury: 'ラグジュアリー',
  scandinavian: '北欧',
  retro: 'レトロ',
  medical: 'メディカル',
};

const FURNITURE_NAME_MAP: Record<string, string> = {
  table_square: 'square table',
  table_round: 'round table',
  chair: 'chair',
  sofa: 'sofa',
  counter: 'counter',
  shelf: 'shelf',
  stool: 'stool',
  partition: 'partition',
  desk: 'desk',
  plant: 'plant',
  pendant_light: 'pendant light',
  register: 'cash register',
  reception_desk: 'reception desk',
  bench: 'bench',
};

const RENDER_STYLE_CONVERT: Record<string, RenderStyleType> = {
  realistic: 'photorealistic',
  sketch: 'sketch',
  'colored-pencil': 'colored-pencil',
  watercolor: 'watercolor',
  blueprint: 'blueprint',
};

// ── localStorage ヘルパー ──────────────────────────

const HISTORY_KEY = 'prompt-studio-history';
const MAX_HISTORY = 20;

interface PromptHistoryEntry {
  id: string;
  timestamp: number;
  tool: TargetTool;
  prompt: string;
  negative?: string;
}

function loadHistory(): PromptHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PromptHistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: PromptHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // ignore quota errors
  }
}

// ── メインコンポーネント ───────────────────────────

export default function PromptStudioPanel() {
  const [selectedTool, setSelectedTool] = useState<TargetTool>('generic');
  const [language, setLanguage] = useState<'en' | 'ja'>('en');
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState<GeneratedPrompt | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [history, setHistory] = useState<PromptHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // ストアからシーン情報を個別セレクタで取得
  const style = useEditorStore((s) => s.style);
  const furniture = useEditorStore((s) => s.furniture);
  const renderStyle = useCameraStore((s) => s.renderStyle);
  const dayNight = useCameraStore((s) => s.dayNight);
  const lightWarmth = useCameraStore((s) => s.lightWarmth);

  // 初回ロード
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // シーンから PromptConfig を構築
  const sceneConfig = useMemo((): PromptConfig => {
    // 家具名リスト（重複排除、英語名）
    const furnitureNames = [...new Set(
      furniture.map((f) => FURNITURE_NAME_MAP[f.type] ?? f.type.replace(/_/g, ' '))
    )];

    // 照明判定
    let lighting: 'warm' | 'cool' | 'natural';
    if (lightWarmth > 0.6) lighting = 'warm';
    else if (lightWarmth < 0.4) lighting = 'cool';
    else lighting = 'natural';

    // 素材（スタイルから推定）
    const materialMap: Record<string, string[]> = {
      japanese: ['wood', 'bamboo', 'paper', 'stone'],
      modern: ['glass', 'metal', 'concrete'],
      cafe: ['wood', 'brick', 'fabric'],
      industrial: ['metal', 'concrete', 'exposed brick'],
      minimal: ['white plaster', 'light wood', 'glass'],
      luxury: ['marble', 'gold', 'velvet', 'crystal'],
      scandinavian: ['light wood', 'wool', 'linen'],
      retro: ['wood', 'vinyl', 'brass'],
      medical: ['stainless steel', 'laminate', 'glass'],
    };

    // カラーパレット（スタイルから推定）
    const colorMap: Record<string, string[]> = {
      japanese: ['#8B7355', '#2F4F2F', '#F5F5DC', '#800000'],
      modern: ['#333333', '#FFFFFF', '#4A90D9', '#E0E0E0'],
      cafe: ['#8B4513', '#DEB887', '#F5DEB3', '#2F4F4F'],
      industrial: ['#696969', '#2F2F2F', '#CD853F', '#808080'],
      minimal: ['#FFFFFF', '#F5F5F5', '#333333', '#A0A0A0'],
      luxury: ['#1C1C1C', '#D4AF37', '#800020', '#F5F5F5'],
      scandinavian: ['#FFFFFF', '#E8DCC8', '#7BA7BC', '#B8D4E3'],
      retro: ['#CD853F', '#2F4F4F', '#DAA520', '#8B0000'],
      medical: ['#FFFFFF', '#E8F4FD', '#4A90D9', '#C0C0C0'],
    };

    return {
      style,
      roomType: 'restaurant', // デフォルト。テンプレートで上書き可能
      renderStyle: RENDER_STYLE_CONVERT[renderStyle] ?? 'photorealistic',
      furniture: furnitureNames,
      materials: materialMap[style] ?? ['wood', 'glass'],
      lighting,
      colorPalette: colorMap[style] ?? ['#333333', '#FFFFFF'],
      additionalPrompt: additionalPrompt || undefined,
      targetTool: selectedTool,
      language,
    };
  }, [style, furniture, renderStyle, lightWarmth, additionalPrompt, selectedTool, language]);

  // プロンプト生成
  const handleGenerate = useCallback(() => {
    const result = generatePrompt(sceneConfig);
    setGeneratedPrompt(result);

    // パラメータ付きの場合は結合
    let fullPrompt = result.main;
    if (result.parameters) {
      fullPrompt += ` ${result.parameters}`;
    }
    setEditedPrompt(fullPrompt);
  }, [sceneConfig]);

  // テンプレート適用
  const applyTemplate = useCallback((template: PromptTemplate) => {
    const merged: PromptConfig = {
      ...sceneConfig,
      ...template.config,
      targetTool: selectedTool,
      language,
    };
    const result = generatePrompt(merged);
    setGeneratedPrompt(result);

    let fullPrompt = result.main;
    if (result.parameters) {
      fullPrompt += ` ${result.parameters}`;
    }
    setEditedPrompt(fullPrompt);
    setShowTemplates(false);
    showToast(`テンプレート「${template.name}」を適用しました`, 'success');
  }, [sceneConfig, selectedTool, language]);

  // クリップボードコピー
  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('クリップボードにコピーしました', 'success');

      // 履歴に追加
      const entry: PromptHistoryEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        tool: selectedTool,
        prompt: text,
        negative: generatedPrompt?.negative,
      };
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      saveHistory(updated);
    } catch {
      showToast('コピーに失敗しました', 'error');
    }
  }, [selectedTool, generatedPrompt, history]);

  // スクリーンショットダウンロード
  const handleScreenshot = useCallback(() => {
    const canvases = document.querySelectorAll('canvas');
    let targetCanvas: HTMLCanvasElement | null = null;

    for (const c of canvases) {
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        targetCanvas = c;
        break;
      }
    }
    if (!targetCanvas) {
      for (const c of canvases) {
        if (c.width > 100 && c.height > 100) {
          targetCanvas = c;
          break;
        }
      }
    }

    if (!targetCanvas) {
      showToast('3Dビューが見つかりません', 'error');
      return;
    }

    try {
      const dataUrl = targetCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `perse-screenshot-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('スクリーンショットをダウンロードしました', 'success');
    } catch {
      showToast('スクリーンショットの取得に失敗しました', 'error');
    }
  }, []);

  // 履歴からプロンプトを復元
  const restoreFromHistory = useCallback((entry: PromptHistoryEntry) => {
    setEditedPrompt(entry.prompt);
    setSelectedTool(entry.tool);
    if (entry.negative) {
      setGeneratedPrompt({ main: entry.prompt, negative: entry.negative, language });
    } else {
      setGeneratedPrompt({ main: entry.prompt, language });
    }
    setShowHistory(false);
    showToast('履歴からプロンプトを復元しました', 'success');
  }, [language]);

  return (
    <div className="p-4 space-y-4">
      {/* シーン情報サマリー */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
        <p className="text-[10px] text-gray-400 font-medium">現在のシーン</p>
        <div className="flex flex-wrap gap-1.5">
          <Tag label={`スタイル: ${STYLE_LABEL_MAP[style] ?? style}`} />
          <Tag label={`家具: ${furniture.length}点`} />
          <Tag label={`照明: ${dayNight === 'day' ? '昼' : '夜'}`} />
          <Tag label={`描画: ${renderStyle}`} />
        </div>
      </div>

      {/* ツール選択タブ */}
      <div>
        <p className="text-[10px] text-gray-400 mb-1.5">対象ツール</p>
        <div className="flex flex-wrap gap-1">
          {TOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTool(tab.id)}
              title={tab.description}
              className={
                'px-2.5 py-1 text-[11px] rounded-md transition-colors ' +
                (selectedTool === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200')
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 言語切替 */}
      <div className="flex items-center gap-2">
        <p className="text-[10px] text-gray-400">言語:</p>
        <button
          onClick={() => setLanguage('en')}
          className={
            'px-2 py-0.5 text-[10px] rounded transition-colors ' +
            (language === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500')
          }
        >
          English
        </button>
        <button
          onClick={() => setLanguage('ja')}
          className={
            'px-2 py-0.5 text-[10px] rounded transition-colors ' +
            (language === 'ja' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500')
          }
        >
          日本語
        </button>
      </div>

      {/* 追加指示 */}
      <div>
        <label className="block text-[10px] text-gray-400 mb-1">カスタム指示（任意）</label>
        <textarea
          value={additionalPrompt}
          onChange={(e) => setAdditionalPrompt(e.target.value)}
          placeholder="例: 夕暮れ時の雰囲気、観葉植物多め..."
          rows={2}
          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-blue-500 transition-colors resize-none placeholder:text-gray-400"
        />
      </div>

      {/* テンプレートボタン + 生成ボタン */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowTemplates(!showTemplates)}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          テンプレート
        </button>
        <button
          onClick={handleGenerate}
          className="flex-1 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          プロンプト生成
        </button>
      </div>

      {/* テンプレート一覧 */}
      {showTemplates && (
        <div className="space-y-1.5">
          {PROMPT_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2.5 transition-colors"
            >
              <p className="text-xs font-medium text-gray-700">{t.name}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{t.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* 生成されたプロンプト */}
      {editedPrompt && (
        <div className="space-y-2">
          {/* メインプロンプト */}
          <div className="relative">
            <label className="block text-[10px] text-gray-400 mb-1">
              {selectedTool === 'stable-diffusion' ? 'Positive Prompt' : 'プロンプト'}
            </label>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              rows={5}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 font-mono focus:outline-none focus:border-blue-500 transition-colors resize-y"
            />
            <button
              onClick={() => handleCopy(editedPrompt)}
              className="absolute top-6 right-2 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              title="コピー"
            >
              <ClipboardIcon />
            </button>
          </div>

          {/* Negative Prompt (SD用) */}
          {generatedPrompt?.negative && (
            <div className="relative">
              <label className="block text-[10px] text-gray-400 mb-1">Negative Prompt</label>
              <textarea
                value={generatedPrompt.negative}
                readOnly
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-500 font-mono"
              />
              <button
                onClick={() => handleCopy(generatedPrompt.negative ?? '')}
                className="absolute top-6 right-2 p-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
                title="コピー"
              >
                <ClipboardIcon />
              </button>
            </div>
          )}

          {/* Midjourneyパラメータ */}
          {generatedPrompt?.parameters && (
            <div className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-[10px] text-gray-400 mb-1">パラメータ</p>
              <code className="text-[11px] text-blue-600 font-mono">{generatedPrompt.parameters}</code>
            </div>
          )}
        </div>
      )}

      {/* スクリーンショット + 外部ツールリンク */}
      <div className="space-y-2 pt-2 border-t border-gray-100">
        <button
          onClick={handleScreenshot}
          className="w-full py-2 rounded-lg text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors flex items-center justify-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          スクリーンショットDL
        </button>

        {/* 外部ツールリンク */}
        <p className="text-[10px] text-gray-400">外部ツールで開く</p>
        <div className="grid grid-cols-2 gap-1.5">
          {EXTERNAL_TOOLS.map((tool) => (
            <a
              key={tool.name}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${tool.color} shrink-0`} />
              <span className="text-[11px] text-gray-600 truncate">{tool.name}</span>
              <svg className="w-3 h-3 text-gray-400 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ))}
        </div>
      </div>

      {/* 履歴セクション */}
      <div className="pt-2 border-t border-gray-100">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="text-[10px] text-gray-400">プロンプト履歴 ({history.length})</span>
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showHistory && history.length > 0 && (
          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
            {history.map((entry) => (
              <button
                key={entry.id}
                onClick={() => restoreFromHistory(entry)}
                className="w-full text-left bg-gray-50 hover:bg-gray-100 rounded-lg p-2 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-blue-500 font-medium">{entry.tool}</span>
                  <span className="text-[9px] text-gray-400">
                    {new Date(entry.timestamp).toLocaleString('ja-JP', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500 truncate">{entry.prompt}</p>
              </button>
            ))}
          </div>
        )}

        {showHistory && history.length === 0 && (
          <p className="mt-2 text-[10px] text-gray-400 text-center py-2">履歴がありません</p>
        )}
      </div>
    </div>
  );
}

// ── サブコンポーネント ──────────────────────────

function Tag({ label }: { label: string }) {
  return (
    <span className="px-2 py-0.5 text-[10px] bg-gray-200 rounded-full text-gray-600">
      {label}
    </span>
  );
}

function ClipboardIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}
