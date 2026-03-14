// 3Dシーンの型定義

export interface Annotation {
  id: string;
  text: string;
  position: [number, number, number];
  color: string; // marker color
  visible: boolean;
}

export interface RoomDimensions {
  width: number;   // 幅 (m)
  depth: number;   // 奥行 (m)
  height: number;  // 高さ (m)
}

export type StylePreset =
  | 'japanese'        // 和風
  | 'modern'          // モダン
  | 'cafe'            // カフェ
  | 'industrial'      // インダストリアル
  | 'minimal'         // ミニマル
  | 'luxury'          // ラグジュアリー
  | 'scandinavian'    // 北欧
  | 'retro'           // レトロ
  | 'medical';        // メディカル

export interface StyleConfig {
  name: string;
  nameJa: string;
  wallColor: string;
  floorColor: string;
  floorTexture: 'wood' | 'tile' | 'concrete' | 'tatami' | 'marble' | 'checkerboard' | 'linoleum';
  ceilingColor: string;
  accentColor: string;
  ambientIntensity: number;
  spotlightIntensity: number;
  spotlightColor: string;
  /** ヘミスフィアライトの天空色 */
  hemisphereSkyColor: string;
  /** ヘミスフィアライトの地面色 */
  hemisphereGroundColor: string;
  /** スタイル別家具カラーパレット */
  furniturePalette: {
    primary: string;    // メイン家具色（カウンター、棚など）
    secondary: string;  // 副次色（テーブル天板など）
    accent: string;     // アクセント（クッション、装飾）
    metal: string;      // 金属パーツ
    fabric: string;     // 布地（ソファ、椅子座面）
  };
  /** 家具マテリアルのラフネス */
  furnitureRoughness: number;
  /** 家具マテリアルのメタルネス */
  furnitureMetalness: number;
  /** スタイル別木材タイプ */
  woodType: WoodType;
  /** スタイル別布地タイプ */
  fabricType: FabricType;
  /** スタイル別金属仕上げ */
  metalFinish: MetalFinish;
}

export type WoodType = 'oak' | 'walnut' | 'pine' | 'birch' | 'mahogany' | 'teak' | 'ash' | 'kiri';
export type FabricType = 'linen' | 'velvet' | 'tweed' | 'canvas' | 'wool';
export type MetalFinish = 'brushed' | 'polished' | 'oxidized' | 'matte' | 'brass';

export type FurnitureMaterial = 'wood' | 'metal' | 'fabric' | 'leather' | 'glass' | 'plastic' | 'stone';

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color?: string;
  material?: FurnitureMaterial;
  /** glTF/GLBモデルのURL（指定時は3Dモデルを使用、未指定時はプリミティブ描画） */
  modelUrl?: string;
}

export type FurnitureType =
  | 'counter'         // カウンター
  | 'table_square'    // 四角テーブル
  | 'table_round'     // 丸テーブル
  | 'chair'           // 椅子
  | 'stool'           // スツール
  | 'sofa'            // ソファ
  | 'shelf'           // 棚
  | 'pendant_light'   // ペンダントライト
  | 'plant'           // 観葉植物
  | 'partition'       // パーティション
  | 'register'        // レジカウンター
  | 'sink'            // シンク
  | 'fridge'          // 冷蔵庫
  | 'display_case'    // ショーケース
  | 'bench'           // ベンチ
  | 'mirror'          // 鏡
  | 'reception_desk'  // レセプションデスク
  | 'tv_monitor'      // TVモニター
  | 'washing_machine' // 洗濯機
  | 'coat_rack'       // コートラック
  | 'air_conditioner' // エアコン
  | 'desk'            // デスク
  | 'bookcase'        // 本棚
  | 'kitchen_island'  // キッチンアイランド
  | 'bar_table'       // ハイテーブル
  | 'wardrobe'        // ワードローブ
  | 'shoe_rack'       // 靴棚
  | 'umbrella_stand'  // 傘立て
  | 'cash_register'   // レジ
  | 'menu_board'      // メニューボード
  | 'flower_pot'      // 花瓶/フラワーポット
  | 'ceiling_fan'     // シーリングファン
  | 'rug'             // ラグ/カーペット
  | 'curtain'         // カーテン
  | 'clock'           // 時計（壁掛け）
  | 'trash_can'       // ゴミ箱
  | 'custom';         // カスタム3Dモデル

export interface FurnitureCatalogItem {
  type: FurnitureType;
  name: string;
  icon: string;
  defaultScale: [number, number, number];
  defaultColor: string;
  defaultMaterial?: FurnitureMaterial;
  /** glTF/GLBモデルのURL（ここにURLを指定すれば自動でモデル描画に切り替わる） */
  modelUrl?: string;
}

export interface SceneState {
  room: RoomDimensions;
  style: StylePreset;
  furniture: FurnitureItem[];
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}
