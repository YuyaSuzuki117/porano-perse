// 3Dシーンの型定義

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
  | 'luxury';         // ラグジュアリー

export interface StyleConfig {
  name: string;
  nameJa: string;
  wallColor: string;
  floorColor: string;
  floorTexture: 'wood' | 'tile' | 'concrete' | 'tatami';
  ceilingColor: string;
  accentColor: string;
  ambientIntensity: number;
  spotlightIntensity: number;
  spotlightColor: string;
}

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
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
  | 'partition';      // パーティション

export interface FurnitureCatalogItem {
  type: FurnitureType;
  name: string;
  icon: string;
  defaultScale: [number, number, number];
  defaultColor: string;
}

export interface SceneState {
  room: RoomDimensions;
  style: StylePreset;
  furniture: FurnitureItem[];
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}
