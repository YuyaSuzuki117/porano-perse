// AIプロンプト生成ライブラリ — 外部AI画像生成ツール向けプロンプトを生成
// API呼び出し不要、全てローカルロジック

export type TargetTool = 'generic' | 'midjourney' | 'dall-e' | 'stable-diffusion' | 'nano-banana';

export type RenderStyleType = 'photorealistic' | 'sketch' | 'watercolor' | 'blueprint' | 'colored-pencil';

export interface PromptConfig {
  style: string;           // 'japanese' | 'modern' | 'cafe' 等
  roomType: string;        // 'restaurant' | 'cafe' | 'office' 等
  renderStyle: RenderStyleType;
  furniture: string[];     // 家具名リスト
  materials: string[];     // 素材リスト
  lighting: 'warm' | 'cool' | 'natural';
  colorPalette: string[];  // HEXカラー
  additionalPrompt?: string;
  targetTool: TargetTool;
  language: 'en' | 'ja';
}

export interface GeneratedPrompt {
  main: string;
  negative?: string;       // Stable Diffusion用
  parameters?: string;     // Midjourney パラメータ等
  language: 'en' | 'ja';
}

// ── スタイル専門用語マップ ──────────────────────────

const STYLE_TERMS_EN: Record<string, string[]> = {
  japanese: ['Japanese interior', 'wa-modern style', 'shoji screens', 'natural wood', 'tatami accents', 'zen-inspired minimalism'],
  modern: ['contemporary interior', 'clean lines', 'open floor plan', 'neutral palette', 'sleek surfaces'],
  cafe: ['cozy cafe interior', 'warm atmosphere', 'exposed brick', 'vintage furniture', 'ambient lighting'],
  industrial: ['industrial loft style', 'exposed pipes', 'concrete walls', 'metal fixtures', 'raw materials'],
  minimal: ['minimalist interior', 'uncluttered space', 'monochromatic palette', 'essential furniture only'],
  luxury: ['luxury interior design', 'high-end finishes', 'marble accents', 'gold fixtures', 'rich fabrics'],
  scandinavian: ['Scandinavian design', 'hygge atmosphere', 'light wood', 'white walls', 'functional beauty'],
  retro: ['retro interior', 'mid-century modern', 'vintage color palette', 'nostalgic atmosphere'],
  medical: ['clean medical interior', 'clinical white', 'functional layout', 'sterile modern aesthetic'],
};

const STYLE_TERMS_JA: Record<string, string[]> = {
  japanese: ['和風モダンインテリア', '障子', '天然木', '畳アクセント', '禅の美意識'],
  modern: ['モダンインテリア', 'クリーンなライン', 'オープンフロア', 'ニュートラルカラー'],
  cafe: ['居心地の良いカフェ空間', '暖かい雰囲気', 'レンガ壁', 'ヴィンテージ家具'],
  industrial: ['インダストリアルスタイル', '配管むき出し', 'コンクリート壁', '金属什器'],
  minimal: ['ミニマルインテリア', '余白のある空間', 'モノクロームパレット'],
  luxury: ['ラグジュアリーインテリア', '高級仕上げ', '大理石アクセント', '上質なファブリック'],
  scandinavian: ['北欧デザイン', 'ヒュッゲな空間', 'ライトウッド', '白い壁', '機能美'],
  retro: ['レトロインテリア', 'ミッドセンチュリーモダン', 'ノスタルジックな雰囲気'],
  medical: ['清潔感のある医療内装', '白を基調', '機能的レイアウト'],
};

const RENDER_STYLE_TERMS_EN: Record<RenderStyleType, string[]> = {
  photorealistic: ['photorealistic rendering', '8K resolution', 'ray tracing', 'professional architectural photography', 'detailed textures'],
  sketch: ['architectural sketch', 'hand-drawn style', 'pencil illustration', 'line art rendering'],
  watercolor: ['watercolor illustration', 'soft washes', 'artistic rendering', 'architectural watercolor'],
  blueprint: ['architectural blueprint', 'technical drawing', 'floor plan visualization', 'engineering diagram'],
  'colored-pencil': ['colored pencil illustration', 'artistic rendering', 'hand-drawn feel', 'soft shading'],
};

const RENDER_STYLE_TERMS_JA: Record<RenderStyleType, string[]> = {
  photorealistic: ['フォトリアルレンダリング', '高解像度', 'レイトレーシング', 'プロフェッショナル建築写真'],
  sketch: ['建築スケッチ', '手描き風', '鉛筆イラスト', 'ライン描画'],
  watercolor: ['水彩画イラスト', 'ソフトウォッシュ', '建築水彩画'],
  blueprint: ['建築図面', '設計図風', 'テクニカルドローイング'],
  'colored-pencil': ['色鉛筆イラスト', '手描き風', 'ソフトシェーディング'],
};

const ROOM_TYPE_EN: Record<string, string> = {
  restaurant: 'restaurant interior',
  cafe: 'cafe interior',
  bar: 'bar interior',
  office: 'office space',
  shop: 'retail shop interior',
  salon: 'beauty salon interior',
  clinic: 'medical clinic interior',
};

const ROOM_TYPE_JA: Record<string, string> = {
  restaurant: 'レストラン内装',
  cafe: 'カフェ内装',
  bar: 'バー内装',
  office: 'オフィス空間',
  shop: '店舗内装',
  salon: '美容サロン内装',
  clinic: 'クリニック内装',
};

const LIGHTING_TERMS_EN: Record<string, string> = {
  warm: 'warm ambient lighting, golden hour glow',
  cool: 'cool daylight, crisp white illumination',
  natural: 'natural sunlight through windows, soft shadows',
};

const LIGHTING_TERMS_JA: Record<string, string> = {
  warm: '暖かみのある間接照明、ゴールデンアワーの光',
  cool: 'クールな自然光、澄んだ白い照明',
  natural: '窓からの自然光、柔らかな影',
};

// ── プロンプト組み立て ──────────────────────────

function buildBaseTerms(config: PromptConfig): string[] {
  const isJa = config.language === 'ja';
  const terms: string[] = [];

  // ルームタイプ
  const roomMap = isJa ? ROOM_TYPE_JA : ROOM_TYPE_EN;
  terms.push(roomMap[config.roomType] ?? (isJa ? '室内空間' : 'interior space'));

  // スタイル
  const styleMap = isJa ? STYLE_TERMS_JA : STYLE_TERMS_EN;
  const stylePhrases = styleMap[config.style] ?? styleMap['modern'] ?? [];
  terms.push(...stylePhrases.slice(0, 3));

  // レンダースタイル
  const renderMap = isJa ? RENDER_STYLE_TERMS_JA : RENDER_STYLE_TERMS_EN;
  const renderPhrases = renderMap[config.renderStyle] ?? renderMap['photorealistic'] ?? [];
  terms.push(...renderPhrases.slice(0, 2));

  // 家具
  if (config.furniture.length > 0) {
    const furnitureStr = config.furniture.slice(0, 6).join(', ');
    terms.push(isJa ? `家具: ${furnitureStr}` : `furniture: ${furnitureStr}`);
  }

  // 素材
  if (config.materials.length > 0) {
    const materialsStr = config.materials.slice(0, 4).join(', ');
    terms.push(isJa ? `素材: ${materialsStr}` : `materials: ${materialsStr}`);
  }

  // 照明
  const lightMap = isJa ? LIGHTING_TERMS_JA : LIGHTING_TERMS_EN;
  terms.push(lightMap[config.lighting] ?? lightMap['natural'] ?? '');

  // カラーパレット
  if (config.colorPalette.length > 0) {
    const colors = config.colorPalette.slice(0, 4).join(', ');
    terms.push(isJa ? `カラーパレット: ${colors}` : `color palette: ${colors}`);
  }

  // 追加プロンプト
  if (config.additionalPrompt) {
    terms.push(config.additionalPrompt);
  }

  return terms.filter(Boolean);
}

// ── ツール別生成関数 ──────────────────────────

export function generateGenericPrompt(config: PromptConfig): GeneratedPrompt {
  const terms = buildBaseTerms(config);
  return {
    main: terms.join(', '),
    language: config.language,
  };
}

export function generateMidjourneyPrompt(config: PromptConfig): GeneratedPrompt {
  // Midjourneyは英語のみ
  const enConfig = { ...config, language: 'en' as const };
  const terms = buildBaseTerms(enConfig);

  // アスペクト比とバージョンパラメータ
  const params = ['--ar 16:9', '--v 6.1', '--s 750', '--q 2'];
  if (config.renderStyle === 'photorealistic') {
    params.push('--style raw');
  }

  return {
    main: terms.join(', '),
    parameters: params.join(' '),
    language: 'en',
  };
}

export function generateStableDiffusionPrompt(config: PromptConfig): GeneratedPrompt {
  const enConfig = { ...config, language: 'en' as const };
  const terms = buildBaseTerms(enConfig);

  // Positive prompt 強化
  const positive = [
    ...terms,
    'masterpiece', 'best quality', 'highly detailed',
    'professional architectural visualization',
  ];

  // Negative prompt
  const negative = [
    'low quality', 'blurry', 'distorted', 'deformed',
    'watermark', 'text', 'signature', 'out of frame',
    'ugly', 'poorly drawn', 'bad anatomy', 'bad proportions',
  ];

  return {
    main: positive.join(', '),
    negative: negative.join(', '),
    language: 'en',
  };
}

export function generateNanoBananaPrompt(config: PromptConfig): GeneratedPrompt {
  // Nano Bananaはシンプルな自然言語
  const terms = buildBaseTerms(config);
  const sentence = config.language === 'ja'
    ? `${terms.slice(0, 5).join('、')}。高品質な建築パースイメージ。`
    : `${terms.slice(0, 5).join(', ')}. High quality architectural perspective image.`;

  return {
    main: sentence,
    language: config.language,
  };
}

export function generateDallEPrompt(config: PromptConfig): GeneratedPrompt {
  const enConfig = { ...config, language: 'en' as const };
  const terms = buildBaseTerms(enConfig);

  // DALL-Eはシンプルで具体的な説明が良い
  const main = `A ${terms.slice(0, 6).join(', ')}. Professional architectural visualization, high detail, realistic proportions.`;

  return {
    main,
    language: 'en',
  };
}

export function generatePrompt(config: PromptConfig): GeneratedPrompt {
  switch (config.targetTool) {
    case 'midjourney':
      return generateMidjourneyPrompt(config);
    case 'stable-diffusion':
      return generateStableDiffusionPrompt(config);
    case 'nano-banana':
      return generateNanoBananaPrompt(config);
    case 'dall-e':
      return generateDallEPrompt(config);
    case 'generic':
    default:
      return generateGenericPrompt(config);
  }
}

// ── プロンプトテンプレート ──────────────────────────

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  config: Partial<PromptConfig>;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'photorealistic-interior',
    name: 'フォトリアル内観パース',
    description: 'プロの建築写真のような高品質レンダリング',
    config: {
      renderStyle: 'photorealistic',
      lighting: 'natural',
      additionalPrompt: 'professional architectural photography, DSLR quality, depth of field',
    },
  },
  {
    id: 'sketch-perspective',
    name: 'スケッチ風パース',
    description: '手描きスケッチのような温かみのある表現',
    config: {
      renderStyle: 'sketch',
      additionalPrompt: 'architectural concept sketch, hand-drawn feel, expressive lines',
    },
  },
  {
    id: 'japanese-modern',
    name: '和風モダン内装',
    description: '和の要素を取り入れたモダンデザイン',
    config: {
      style: 'japanese',
      renderStyle: 'photorealistic',
      lighting: 'warm',
      additionalPrompt: 'Japanese modern interior, wabi-sabi aesthetics, natural materials, indirect lighting',
    },
  },
  {
    id: 'cafe-restaurant',
    name: 'カフェ・レストラン内装',
    description: '居心地の良い飲食空間',
    config: {
      style: 'cafe',
      roomType: 'cafe',
      renderStyle: 'photorealistic',
      lighting: 'warm',
      additionalPrompt: 'cozy cafe atmosphere, pendant lighting, natural materials, inviting space',
    },
  },
  {
    id: 'blueprint-diagram',
    name: '設計図ライクな図面',
    description: 'テクニカルな設計図スタイル',
    config: {
      renderStyle: 'blueprint',
      lighting: 'cool',
      additionalPrompt: 'technical architectural drawing, precise measurements, blue grid lines, engineering style',
    },
  },
  {
    id: 'watercolor-art',
    name: '水彩画風パース',
    description: 'アーティスティックな水彩画表現',
    config: {
      renderStyle: 'watercolor',
      lighting: 'natural',
      additionalPrompt: 'architectural watercolor painting, soft washes, artistic rendering, gallery quality',
    },
  },
];
