import { create } from 'zustand';

// ──────────────────────────────────────────
// 軽量 i18n システム（自前実装・外部ライブラリ不使用）
// Zustand ベース言語状態管理 + localStorage 永続化
// ──────────────────────────────────────────

export type Locale = 'ja' | 'en';

const STORAGE_KEY = 'porano-perse-locale';

// 翻訳辞書
const translations = {
  ja: {
    // ── ヘッダー ──
    'header.new': '新規',
    'header.save': '保存',
    'header.open': '開く',
    'header.list': '一覧',
    'header.share': '共有',
    'header.export': '出力',
    'header.template': 'テンプレート',
    'header.qr': 'QR',
    'header.clipboard_import': '貼付読込',
    'header.copied': 'コピー済',
    'header.undo': '元に戻す',
    'header.redo': 'やり直す',
    'header.zoom_in': 'ズームイン',
    'header.zoom_out': 'ズームアウト',
    'header.zoom_reset': 'ズームリセット',
    'header.screenshot': 'スクリーンショット',
    'header.hi_res': '高解像度出力',
    'header.pdf': '提案書PDF',
    'header.print': '印刷',
    'header.watermark': 'ウォーターマーク追加',
    'header.menu': 'メニューを開く',
    'header.auto_saved': '自動保存済み',
    'header.export_menu': '出力メニュー',

    // ── ツール ──
    'tool.select': '選択',
    'tool.wall': '壁',
    'tool.door': 'ドア',
    'tool.window': '窓',
    'tool.furniture': '什器・家具',
    'tool.measure': '計測',

    // ── パネル ──
    'panel.finish': '仕上げ材',
    'panel.equipment': '設備',
    'panel.wall': '壁',
    'panel.floor': '床',
    'panel.ceiling': '天井',
    'panel.wall_material': '壁マテリアル',
    'panel.floor_material': '床マテリアル',
    'panel.furniture_material': '什器マテリアル',
    'panel.room_settings': '部屋設定',
    'panel.ceiling_height': '天井高 (m)',
    'panel.wall_display': '壁の表示',
    'panel.ceiling_display': '天井',
    'panel.style': 'スタイル',
    'panel.atmosphere': '空間演出',
    'panel.furniture_set': '家具セット一括配置',
    'panel.furniture_catalog': '什器・家具',
    'panel.wall_snap': '壁スナップ',
    'panel.wall_snap_desc': '壁から30cm以内で自動吸着',
    'panel.dark_mode': 'ダークモード',
    'panel.layer': 'レイヤー',
    'panel.cost_estimate': '概算見積',
    'panel.cross_section': '断面図',
    'panel.reference_image': '参考画像',
    'panel.ergonomic': 'エルゴノミクス',
    'panel.color_harmony': '配色分析',
    'panel.render_quality': 'レンダリング品質',
    'panel.color_blind': '色覚シミュレーター',
    'panel.batch_edit': '一括編集',
    'panel.texture_upload': 'テクスチャアップロード',
    'panel.undo_timeline': '操作履歴',
    'panel.model_import': 'モデル読込',

    // ── ビューモード ──
    'view.2d': '2D図面',
    'view.3d': '3Dプレビュー',
    'view.split': '分割',
    'view.photo': 'フォトモード',
    'view.photo_end': 'フォトモード終了',

    // ── ダイアログ ──
    'dialog.save_confirm': '保存しますか？',
    'dialog.overwrite_confirm': '上書きしますか？',
    'dialog.delete_confirm': '削除しますか？',
    'dialog.new_confirm': '現在のプロジェクトを破棄して新規作成しますか？',
    'dialog.select_json': 'JSONファイルを選択してください。',
    'dialog.load_failed': 'ファイルの読み込みに失敗しました。',
    'dialog.too_large_url': 'プロジェクトが大きすぎるためURL共有できません。JSON保存をご利用ください。',
    'dialog.too_large_qr': 'URLが長すぎるためQRコードを生成できません。共有リンクをご利用ください。',
    'dialog.too_large_qr_gen': 'プロジェクトが大きすぎるためQRコードを生成できません',
    'dialog.share_copied': '共有リンクをクリップボードにコピーしました',
    'dialog.cloud_saved': 'クラウドにも保存しました',
    'dialog.clipboard_empty': 'クリップボードが空です',
    'dialog.clipboard_invalid': 'クリップボードのテキストが有効なJSONではありません',
    'dialog.clipboard_denied': 'クリップボードへのアクセスが許可されていません',
    'dialog.clipboard_imported': 'クリップボードからプロジェクトを読み込みました',
    'dialog.replace_warning': '現在のデータ（壁・家具）は全て置き換えられます。',
    'dialog.furniture_clear_warning': '既存の家具がすべて削除されます',
    'dialog.furniture_set_warning': '現在の家具はすべてクリアされ、選択したセットに置き換わります',

    // ── 単位 ──
    'unit.tsubo': '坪',
    'unit.sqm': 'm²',

    // ── ウェルカムモーダル ──
    'welcome.title': 'Porano Perse へようこそ',
    'welcome.subtitle': '3Dで店舗のパースを簡単に作成できる\nツールです。',
    'welcome.start': '始める',
    'welcome.empty_room': '空の部屋から始める',
    'welcome.all_templates': 'すべてのテンプレートを見る',
    'welcome.template_suffix': '種類',
    'welcome.template_label': 'テンプレ',
    'welcome.dont_show': '次回から表示しない',
    'welcome.or': 'または',
    'welcome.hint_title': 'ヒント:',
    'welcome.hint_1': '左側で間取りを描画、右側で3D確認',
    'welcome.hint_2': 'Ctrl+Z で操作を戻せます',
    'welcome.hint_3': '右パネルでスタイル・什器を変更',

    // ── その他 ──
    'misc.rendering': 'レンダリング中...',
    'misc.loading_3d': '3Dエンジンを読み込み中...',
    'misc.drag_rotate': 'ドラッグ: 回転',
    'misc.pinch_zoom': 'ピンチ: ズーム',
    'misc.shoot': '撮影',
    'misc.shoot_hd': '撮影 (HD)',
    'misc.normal_shoot': '通常撮影',
    'misc.back': '戻る',
    'misc.fullscreen_end': 'フルスクリーン終了',
    'misc.drop_model': '3Dモデルをドロップして読込',
    'misc.drop_format': '.glb / .gltf',
    'misc.create_wall_hint': '2D図面で壁を作成すると3Dに反映されます',
    'misc.cafe': 'カフェ',
    'misc.office': 'オフィス',
    'misc.izakaya': '居酒屋',
    'misc.furniture_catalog': '什器',

    // ── 壁表示モード ──
    'wall_mode.solid': 'ソリッド',
    'wall_mode.transparent': '透過',
    'wall_mode.hidden': '非表示',
    'wall_mode.section': '断面',

    // ── スタイル名 ──
    'style.natural': 'ナチュラル',
    'style.modern': 'モダン',
    'style.retro': 'レトロ',
    'style.japanese': '和風',
    'style.industrial': 'インダストリアル',
    'style.change_desc': '壁・床・照明を一括で切り替え',

    // ── カテゴリ ──
    'category.seating': '椅子・ソファ',
    'category.table': 'テーブル',
    'category.storage': '収納・棚',
    'category.lighting': '照明',
    'category.decor': '装飾',
    'category.equipment': '設備',
    'category.counter': 'カウンター',
    'category.partition': 'パーティション',
  },

  en: {
    // ── Header ──
    'header.new': 'New',
    'header.save': 'Save',
    'header.open': 'Open',
    'header.list': 'List',
    'header.share': 'Share',
    'header.export': 'Export',
    'header.template': 'Templates',
    'header.qr': 'QR',
    'header.clipboard_import': 'Paste Import',
    'header.copied': 'Copied',
    'header.undo': 'Undo',
    'header.redo': 'Redo',
    'header.zoom_in': 'Zoom In',
    'header.zoom_out': 'Zoom Out',
    'header.zoom_reset': 'Reset Zoom',
    'header.screenshot': 'Screenshot',
    'header.hi_res': 'Hi-Res Export',
    'header.pdf': 'Proposal PDF',
    'header.print': 'Print',
    'header.watermark': 'Add Watermark',
    'header.menu': 'Open Menu',
    'header.auto_saved': 'Auto-saved',
    'header.export_menu': 'Export Menu',

    // ── Tools ──
    'tool.select': 'Select',
    'tool.wall': 'Wall',
    'tool.door': 'Door',
    'tool.window': 'Window',
    'tool.furniture': 'Furniture',
    'tool.measure': 'Measure',

    // ── Panels ──
    'panel.finish': 'Finishes',
    'panel.equipment': 'Equipment',
    'panel.wall': 'Wall',
    'panel.floor': 'Floor',
    'panel.ceiling': 'Ceiling',
    'panel.wall_material': 'Wall Material',
    'panel.floor_material': 'Floor Material',
    'panel.furniture_material': 'Furniture Material',
    'panel.room_settings': 'Room Settings',
    'panel.ceiling_height': 'Ceiling Height (m)',
    'panel.wall_display': 'Wall Display',
    'panel.ceiling_display': 'Ceiling',
    'panel.style': 'Style',
    'panel.atmosphere': 'Atmosphere',
    'panel.furniture_set': 'Furniture Set Placement',
    'panel.furniture_catalog': 'Furniture',
    'panel.wall_snap': 'Wall Snap',
    'panel.wall_snap_desc': 'Auto-snap within 30cm of walls',
    'panel.dark_mode': 'Dark Mode',
    'panel.layer': 'Layers',
    'panel.cost_estimate': 'Cost Estimate',
    'panel.cross_section': 'Cross Section',
    'panel.reference_image': 'Reference Image',
    'panel.ergonomic': 'Ergonomics',
    'panel.color_harmony': 'Color Harmony',
    'panel.render_quality': 'Render Quality',
    'panel.color_blind': 'Color Blind Simulator',
    'panel.batch_edit': 'Batch Edit',
    'panel.texture_upload': 'Texture Upload',
    'panel.undo_timeline': 'Undo Timeline',
    'panel.model_import': 'Model Import',

    // ── View Mode ──
    'view.2d': '2D Plan',
    'view.3d': '3D Preview',
    'view.split': 'Split',
    'view.photo': 'Photo Mode',
    'view.photo_end': 'Exit Photo Mode',

    // ── Dialogs ──
    'dialog.save_confirm': 'Save changes?',
    'dialog.overwrite_confirm': 'Overwrite?',
    'dialog.delete_confirm': 'Delete?',
    'dialog.new_confirm': 'Discard current project and create new?',
    'dialog.select_json': 'Please select a JSON file.',
    'dialog.load_failed': 'Failed to load file.',
    'dialog.too_large_url': 'Project too large for URL sharing. Please use JSON export.',
    'dialog.too_large_qr': 'URL too long for QR code. Please use share link.',
    'dialog.too_large_qr_gen': 'Project too large to generate QR code',
    'dialog.share_copied': 'Share link copied to clipboard',
    'dialog.cloud_saved': 'Also saved to cloud',
    'dialog.clipboard_empty': 'Clipboard is empty',
    'dialog.clipboard_invalid': 'Clipboard text is not valid JSON',
    'dialog.clipboard_denied': 'Clipboard access denied',
    'dialog.clipboard_imported': 'Project imported from clipboard',
    'dialog.replace_warning': 'All current data (walls, furniture) will be replaced.',
    'dialog.furniture_clear_warning': 'All existing furniture will be removed',
    'dialog.furniture_set_warning': 'All current furniture will be cleared and replaced with the selected set',

    // ── Units ──
    'unit.tsubo': 'tsubo',
    'unit.sqm': 'm\u00B2',

    // ── Welcome Modal ──
    'welcome.title': 'Welcome to Porano Perse',
    'welcome.subtitle': 'Create 3D store perspectives\nwith ease.',
    'welcome.start': 'Get Started',
    'welcome.empty_room': 'Start with empty room',
    'welcome.all_templates': 'View all templates',
    'welcome.template_suffix': 'types',
    'welcome.template_label': 'Template',
    'welcome.dont_show': "Don't show again",
    'welcome.or': 'or',
    'welcome.hint_title': 'Tips:',
    'welcome.hint_1': 'Draw floor plans on the left, preview 3D on the right',
    'welcome.hint_2': 'Use Ctrl+Z to undo',
    'welcome.hint_3': 'Change styles and furniture in the right panel',

    // ── Misc ──
    'misc.rendering': 'Rendering...',
    'misc.loading_3d': 'Loading 3D engine...',
    'misc.drag_rotate': 'Drag: Rotate',
    'misc.pinch_zoom': 'Pinch: Zoom',
    'misc.shoot': 'Capture',
    'misc.shoot_hd': 'Capture (HD)',
    'misc.normal_shoot': 'Standard Capture',
    'misc.back': 'Back',
    'misc.fullscreen_end': 'Exit Fullscreen',
    'misc.drop_model': 'Drop 3D model to import',
    'misc.drop_format': '.glb / .gltf',
    'misc.create_wall_hint': 'Draw walls in 2D plan to see them in 3D',
    'misc.cafe': 'Cafe',
    'misc.office': 'Office',
    'misc.izakaya': 'Izakaya',
    'misc.furniture_catalog': 'Furniture',

    // ── Wall Display Mode ──
    'wall_mode.solid': 'Solid',
    'wall_mode.transparent': 'Transparent',
    'wall_mode.hidden': 'Hidden',
    'wall_mode.section': 'Section',

    // ── Style Names ──
    'style.natural': 'Natural',
    'style.modern': 'Modern',
    'style.retro': 'Retro',
    'style.japanese': 'Japanese',
    'style.industrial': 'Industrial',
    'style.change_desc': 'Switch walls, floor, and lighting together',

    // ── Categories ──
    'category.seating': 'Chairs & Sofas',
    'category.table': 'Tables',
    'category.storage': 'Storage',
    'category.lighting': 'Lighting',
    'category.decor': 'Decoration',
    'category.equipment': 'Equipment',
    'category.counter': 'Counter',
    'category.partition': 'Partition',
  },
} as const;

export type TranslationKey = keyof typeof translations.ja;

// ── Zustand ストア ──
interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'ja';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ja') return stored;
  } catch { /* noop */ }
  return 'ja';
}

export const useI18nStore = create<I18nState>((set) => ({
  locale: getInitialLocale(),
  setLocale: (locale) => {
    try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* noop */ }
    set({ locale });
  },
  toggleLocale: () => set((s) => {
    const next: Locale = s.locale === 'ja' ? 'en' : 'ja';
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
    return { locale: next };
  }),
}));

// ── 翻訳関数フック ──
export function useTranslation() {
  const locale = useI18nStore((s) => s.locale);

  const t = (key: TranslationKey): string => {
    return translations[locale][key] ?? translations.ja[key] ?? key;
  };

  return { t, locale };
}

// ── ストア外で使う翻訳関数（コールバック内等） ──
export function t(key: TranslationKey): string {
  const locale = useI18nStore.getState().locale;
  return translations[locale][key] ?? translations.ja[key] ?? key;
}
