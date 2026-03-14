/** 照明プリセット定義 */
export interface LightingPreset {
  name: string;          // 日本語名
  description: string;   // 説明
  brightness: number;    // lightBrightness値 (0.2〜3.0)
  warmth: number;        // lightWarmth値 (0〜1)
  dayNight: 'day' | 'night';
  icon: string;          // emoji
  colorHint: string;     // CSS色 — プリセットカードの色温度インジケーター
}

export const LIGHTING_PRESETS: LightingPreset[] = [
  { name: '自然光', description: '明るい昼間の自然光', brightness: 1.0, warmth: 0.5, dayNight: 'day', icon: '☀️', colorHint: '#fffbe6' },
  { name: '温かみ', description: '温かみのある落ち着いた照明', brightness: 0.85, warmth: 0.75, dayNight: 'day', icon: '🕯️', colorHint: '#ffe0b2' },
  { name: 'クール', description: 'クールな昼白色オフィス照明', brightness: 1.0, warmth: 0.25, dayNight: 'day', icon: '🏢', colorHint: '#e3f2fd' },
  { name: 'ドラマチック', description: 'コントラスト強めの演出照明', brightness: 0.6, warmth: 0.85, dayNight: 'night', icon: '🎭', colorHint: '#ffcc80' },
  { name: 'ショールーム', description: '商品が映える明るい照明', brightness: 1.3, warmth: 0.35, dayNight: 'day', icon: '💡', colorHint: '#f5f5f5' },
  { name: '夕暮れ', description: '夕方のゴールデンアワー', brightness: 0.7, warmth: 0.9, dayNight: 'night', icon: '🌇', colorHint: '#ffab40' },
];

/** クイック雰囲気プリセット — 明るさ・色温度・昼夜を一括セット */
export interface AtmospherePreset {
  name: string;
  description: string;
  icon: string;
  brightness: number;
  warmth: number;
  dayNight: 'day' | 'night';
}

export const ATMOSPHERE_PRESETS: AtmospherePreset[] = [
  { name: '明るい店舗', description: '高輝度・ニュートラル・昼', icon: '🏪', brightness: 1.2, warmth: 0.45, dayNight: 'day' },
  { name: '落ち着いた雰囲気', description: '中輝度・暖色・昼', icon: '🛋️', brightness: 0.8, warmth: 0.75, dayNight: 'day' },
  { name: 'バー/夜', description: '低輝度・超暖色・夜', icon: '🍸', brightness: 0.5, warmth: 0.95, dayNight: 'night' },
  { name: 'ショールーム', description: '高輝度・寒色・昼', icon: '🖼️', brightness: 1.3, warmth: 0.3, dayNight: 'day' },
];
