/**
 * layout-rules.ts
 *
 * 業種別の配置ルール・家具間距離制約・動線分析・レイアウト品質スコア計算
 * AI提案のプロンプト注入とバリデーションに使用する
 */

import type { LayoutFurnitureItem, LayoutSuggestion, BusinessType } from '@/types/ai'

// ────────────────────────────────────────────────
// 1. 業種別配置ルール
// ────────────────────────────────────────────────

/** 業種別の必須家具と推奨家具 */
export interface BusinessFurnitureRule {
  /** 必須家具（提案に含めないとペナルティ） */
  required: string[]
  /** 推奨家具（あると加点） */
  recommended: string[]
  /** 壁際に置くべき家具 */
  wallAligned: string[]
  /** 中央配置が望ましい家具 */
  centerPlaced: string[]
  /** 入口付近に置くべき家具 */
  nearEntrance: string[]
  /** 推奨座席密度（人/m²） */
  seatDensityRange: { min: number; max: number }
}

export const BUSINESS_FURNITURE_RULES: Record<string, BusinessFurnitureRule> = {
  restaurant: {
    required: ['table', 'chair', 'counter', 'register'],
    recommended: ['partition', 'shelf', 'plant'],
    wallAligned: ['counter', 'shelf', 'register'],
    centerPlaced: ['table'],
    nearEntrance: ['register'],
    seatDensityRange: { min: 0.5, max: 1.5 },
  },
  cafe: {
    required: ['counter', 'table', 'chair'],
    recommended: ['sofa', 'stool', 'shelf', 'plant', 'register'],
    wallAligned: ['counter', 'shelf'],
    centerPlaced: ['table', 'sofa'],
    nearEntrance: ['register', 'counter'],
    seatDensityRange: { min: 0.3, max: 1.0 },
  },
  bar: {
    required: ['counter', 'stool'],
    recommended: ['shelf', 'sofa', 'table', 'fridge', 'sink'],
    wallAligned: ['counter', 'shelf', 'fridge', 'sink'],
    centerPlaced: ['table'],
    nearEntrance: [],
    seatDensityRange: { min: 0.3, max: 1.2 },
  },
  office: {
    required: ['desk', 'chair'],
    recommended: ['shelf', 'table', 'partition', 'plant'],
    wallAligned: ['shelf', 'desk'],
    centerPlaced: ['table'],
    nearEntrance: ['reception_desk'],
    seatDensityRange: { min: 0.15, max: 0.5 },
  },
  shop: {
    required: ['shelf', 'register'],
    recommended: ['display_case', 'table', 'counter'],
    wallAligned: ['shelf', 'register'],
    centerPlaced: ['display_case', 'table'],
    nearEntrance: ['register'],
    seatDensityRange: { min: 0, max: 0.2 },
  },
  salon: {
    required: ['chair', 'mirror', 'reception_desk'],
    recommended: ['sofa', 'sink', 'shelf'],
    wallAligned: ['mirror', 'shelf', 'sink'],
    centerPlaced: [],
    nearEntrance: ['reception_desk', 'sofa'],
    seatDensityRange: { min: 0.2, max: 0.6 },
  },
  clinic: {
    required: ['desk', 'chair', 'reception_desk'],
    recommended: ['bench', 'shelf', 'partition', 'sink'],
    wallAligned: ['shelf', 'bench', 'sink'],
    centerPlaced: ['desk'],
    nearEntrance: ['reception_desk', 'bench'],
    seatDensityRange: { min: 0.15, max: 0.4 },
  },
}

// ────────────────────────────────────────────────
// 2. 家具間距離制約
// ────────────────────────────────────────────────

/** 距離制約の定義 */
export interface DistanceConstraint {
  /** 最小距離（メートル） */
  min: number
  /** 説明 */
  description: string
}

/** グローバルな距離制約 */
export const DISTANCE_CONSTRAINTS = {
  /** テーブル間の最小間隔 */
  tableBetween: { min: 0.6, description: 'テーブル間隔60cm以上' } as DistanceConstraint,
  /** 通路幅 */
  passageWidth: { min: 0.8, description: '通路幅80cm以上（車椅子対応は90cm）' } as DistanceConstraint,
  /** 壁からの最小距離 */
  wallClearance: { min: 0.3, description: '壁から30cm以上（壁際家具を除く）' } as DistanceConstraint,
  /** 椅子の引きしろ */
  chairPullback: { min: 0.5, description: '椅子を引くスペース50cm' } as DistanceConstraint,
  /** 家具同士の最小間隔 */
  furnitureGap: { min: 0.3, description: '家具間30cm以上' } as DistanceConstraint,
  /** 入口前のクリアランス */
  entranceClearance: { min: 1.0, description: '入口前に1m以上のスペース' } as DistanceConstraint,
  /** レジ前のクリアランス */
  registerClearance: { min: 0.8, description: 'レジ前に80cm以上のスペース' } as DistanceConstraint,
}

// ────────────────────────────────────────────────
// 3. 壁際配置ルール
// ────────────────────────────────────────────────

/** 壁際に配置すべき家具かどうか */
export function shouldBeWallAligned(furnitureType: string, businessType: string): boolean {
  const rules = BUSINESS_FURNITURE_RULES[businessType]
  if (!rules) return false
  return rules.wallAligned.some((t) => furnitureType.includes(t))
}

/** 入口付近に配置すべき家具かどうか */
export function shouldBeNearEntrance(furnitureType: string, businessType: string): boolean {
  const rules = BUSINESS_FURNITURE_RULES[businessType]
  if (!rules) return false
  return rules.nearEntrance.some((t) => furnitureType.includes(t))
}

// ────────────────────────────────────────────────
// 4. レイアウト品質スコア計算
// ────────────────────────────────────────────────

/** 品質スコアの内訳 */
export interface LayoutQualityScore {
  /** 総合スコア (0-100) */
  total: number
  /** 通路幅スコア (0-100): 全通路が80cm以上確保されているか */
  passageScore: number
  /** 動線スコア (0-100): 入口から各席への到達性 */
  flowScore: number
  /** 効率スコア (0-100): 面積利用率 */
  efficiencyScore: number
  /** 必須家具スコア (0-100): 業種の必須家具がそろっているか */
  requiredFurnitureScore: number
  /** 配置ルールスコア (0-100): 壁際/中央/入口付近のルール準拠度 */
  placementRuleScore: number
  /** 詳細メッセージ */
  details: string[]
}

/**
 * レイアウト提案の品質スコアを計算する
 */
export function calculateLayoutQuality(
  suggestion: LayoutSuggestion,
  roomWidth: number,
  roomDepth: number,
  businessType: string,
): LayoutQualityScore {
  const details: string[] = []
  const furniture = suggestion.furniture
  const roomArea = roomWidth * roomDepth

  // --- 1. 通路幅スコア ---
  const passageScore = calcPassageScore(furniture, roomWidth, roomDepth, details)

  // --- 2. 動線スコア ---
  const flowScore = calcFlowScore(furniture, roomWidth, roomDepth, details)

  // --- 3. 効率スコア ---
  const efficiencyScore = calcEfficiencyScore(furniture, roomArea, businessType, details)

  // --- 4. 必須家具スコア ---
  const requiredFurnitureScore = calcRequiredFurnitureScore(furniture, businessType, details)

  // --- 5. 配置ルールスコア ---
  const placementRuleScore = calcPlacementRuleScore(furniture, roomWidth, roomDepth, businessType, details)

  // 重み付き平均
  const total = Math.round(
    passageScore * 0.25 +
    flowScore * 0.20 +
    efficiencyScore * 0.20 +
    requiredFurnitureScore * 0.20 +
    placementRuleScore * 0.15
  )

  return {
    total,
    passageScore,
    flowScore,
    efficiencyScore,
    requiredFurnitureScore,
    placementRuleScore,
    details,
  }
}

/** 通路幅スコア: 家具間の最小距離が80cm以上か */
function calcPassageScore(
  furniture: LayoutFurnitureItem[],
  roomWidth: number,
  roomDepth: number,
  details: string[],
): number {
  if (furniture.length < 2) return 100

  let violations = 0
  let totalPairs = 0

  for (let i = 0; i < furniture.length; i++) {
    for (let j = i + 1; j < furniture.length; j++) {
      const a = furniture[i]
      const b = furniture[j]

      // 家具の端同士の距離を計算
      const dx = Math.abs(a.x - b.x)
      const dz = Math.abs(a.z - b.z)
      const gapX = dx - (a.width / 2 + b.width / 2)
      const gapZ = dz - (a.depth / 2 + b.depth / 2)

      // X方向またはZ方向でオーバーラップがある場合のみ通路チェック
      if (gapX > 0 && gapX < DISTANCE_CONSTRAINTS.passageWidth.min && gapZ < 0) {
        violations++
        details.push(`${a.name}と${b.name}の間隔が${(gapX * 100).toFixed(0)}cm（80cm未満）`)
      }
      if (gapZ > 0 && gapZ < DISTANCE_CONSTRAINTS.passageWidth.min && gapX < 0) {
        violations++
        details.push(`${a.name}と${b.name}の間隔が${(gapZ * 100).toFixed(0)}cm（80cm未満）`)
      }
      totalPairs++
    }
  }

  // 壁との距離チェック（壁際家具以外）
  for (const item of furniture) {
    const distToWalls = [
      item.x - item.width / 2,                // 左壁
      roomWidth - (item.x + item.width / 2),   // 右壁
      item.z - item.depth / 2,                 // 手前壁
      roomDepth - (item.z + item.depth / 2),   // 奥壁
    ]
    const minDist = Math.min(...distToWalls)
    if (minDist < 0) {
      violations += 2
      details.push(`${item.name}が壁にめり込んでいます`)
    }
  }

  if (totalPairs === 0) return 100
  const violationRate = violations / totalPairs
  return Math.round(Math.max(0, 100 - violationRate * 200))
}

/** 動線スコア: 入口(x=roomWidth/2, z=0)から各家具への到達性 */
function calcFlowScore(
  furniture: LayoutFurnitureItem[],
  roomWidth: number,
  roomDepth: number,
  details: string[],
): number {
  if (furniture.length === 0) return 50

  // 入口は手前中央と仮定
  const entranceX = roomWidth / 2
  const entranceZ = 0

  // 各家具への直線距離を計算し、到達性を評価
  let totalReachability = 0
  const maxDist = Math.sqrt(roomWidth ** 2 + roomDepth ** 2)

  for (const item of furniture) {
    const dist = Math.sqrt((item.x - entranceX) ** 2 + (item.z - entranceZ) ** 2)
    // 距離が短いほど到達性が高い（正規化）
    const reachability = 1 - dist / maxDist
    totalReachability += reachability
  }

  const avgReachability = totalReachability / furniture.length

  // 重なりチェック（動線を塞ぐ家具がないか）
  let blockCount = 0
  for (const item of furniture) {
    // 入口の真正面（x方向中央付近、z方向手前）に大きな家具があると動線を塞ぐ
    if (
      Math.abs(item.x - entranceX) < 0.8 &&
      item.z < roomDepth * 0.3 &&
      item.width > 1.0
    ) {
      blockCount++
      details.push(`${item.name}が入口正面の動線を塞いでいる可能性`)
    }
  }

  const baseScore = avgReachability * 100
  const penalty = blockCount * 15
  return Math.round(Math.max(0, Math.min(100, baseScore - penalty)))
}

/** 効率スコア: 面積利用率が適切か */
function calcEfficiencyScore(
  furniture: LayoutFurnitureItem[],
  roomArea: number,
  businessType: string,
  details: string[],
): number {
  if (furniture.length === 0) return 0

  // 家具の総占有面積
  const totalFurnitureArea = furniture.reduce(
    (sum, item) => sum + item.width * item.depth,
    0,
  )
  const utilizationRate = totalFurnitureArea / roomArea

  // 業種別の理想利用率
  const idealRanges: Record<string, { min: number; max: number }> = {
    restaurant: { min: 0.25, max: 0.45 },
    cafe: { min: 0.20, max: 0.40 },
    bar: { min: 0.20, max: 0.40 },
    office: { min: 0.30, max: 0.50 },
    shop: { min: 0.25, max: 0.50 },
    salon: { min: 0.25, max: 0.45 },
    clinic: { min: 0.20, max: 0.40 },
  }

  const ideal = idealRanges[businessType] ?? { min: 0.25, max: 0.45 }

  if (utilizationRate < ideal.min) {
    const diff = ideal.min - utilizationRate
    details.push(`面積利用率${(utilizationRate * 100).toFixed(0)}%（理想${(ideal.min * 100).toFixed(0)}%以上）`)
    return Math.round(Math.max(0, 100 - diff * 300))
  }
  if (utilizationRate > ideal.max) {
    const diff = utilizationRate - ideal.max
    details.push(`面積利用率${(utilizationRate * 100).toFixed(0)}%（過密: ${(ideal.max * 100).toFixed(0)}%以下推奨）`)
    return Math.round(Math.max(0, 100 - diff * 300))
  }

  return 100
}

/** 必須家具スコア: 業種の必須家具がそろっているか */
function calcRequiredFurnitureScore(
  furniture: LayoutFurnitureItem[],
  businessType: string,
  details: string[],
): number {
  const rules = BUSINESS_FURNITURE_RULES[businessType]
  if (!rules) return 80

  const types = furniture.map((f) => f.type.toLowerCase())

  let found = 0
  for (const req of rules.required) {
    if (types.some((t) => t.includes(req))) {
      found++
    } else {
      details.push(`必須家具「${req}」が不足`)
    }
  }

  if (rules.required.length === 0) return 100
  return Math.round((found / rules.required.length) * 100)
}

/** 配置ルールスコア: 壁際/入口付近の配置ルールに準拠しているか */
function calcPlacementRuleScore(
  furniture: LayoutFurnitureItem[],
  roomWidth: number,
  roomDepth: number,
  businessType: string,
  details: string[],
): number {
  const rules = BUSINESS_FURNITURE_RULES[businessType]
  if (!rules || furniture.length === 0) return 80

  let correctPlacements = 0
  let totalChecks = 0

  const wallThreshold = 0.8 // 壁から0.8m以内なら壁際とみなす
  const entranceThreshold = roomDepth * 0.3 // 入口から30%以内なら入口付近とみなす

  for (const item of furniture) {
    const typeLC = item.type.toLowerCase()

    // 壁際チェック
    if (rules.wallAligned.some((t) => typeLC.includes(t))) {
      totalChecks++
      const nearWall =
        item.x - item.width / 2 < wallThreshold ||
        roomWidth - (item.x + item.width / 2) < wallThreshold ||
        item.z - item.depth / 2 < wallThreshold ||
        roomDepth - (item.z + item.depth / 2) < wallThreshold
      if (nearWall) {
        correctPlacements++
      } else {
        details.push(`${item.name}は壁際推奨だが中央に配置`)
      }
    }

    // 入口付近チェック
    if (rules.nearEntrance.some((t) => typeLC.includes(t))) {
      totalChecks++
      if (item.z < entranceThreshold) {
        correctPlacements++
      } else {
        details.push(`${item.name}は入口付近推奨だが奥に配置`)
      }
    }
  }

  if (totalChecks === 0) return 80
  return Math.round((correctPlacements / totalChecks) * 100)
}

// ────────────────────────────────────────────────
// 5. プロンプト注入用ルールテキスト生成
// ────────────────────────────────────────────────

/**
 * AI提案のプロンプトに注入する配置ルールテキストを生成
 */
export function buildLayoutRulesPrompt(
  businessType: string,
  roomWidth: number,
  roomDepth: number,
): string {
  const rules = BUSINESS_FURNITURE_RULES[businessType]
  if (!rules) return ''

  const area = roomWidth * roomDepth
  const seatEstimate = {
    min: Math.floor(area * rules.seatDensityRange.min),
    max: Math.floor(area * rules.seatDensityRange.max),
  }

  return `
## 業種別配置ルール（${businessType}）
### 必須家具
${rules.required.map((f) => `- ${f}`).join('\n')}

### 推奨追加家具
${rules.recommended.map((f) => `- ${f}`).join('\n')}

### 配置位置ルール
- 壁際に置くべき家具: ${rules.wallAligned.join(', ')}
- 中央配置が望ましい家具: ${rules.centerPlaced.join(', ') || 'なし'}
- 入口付近に置くべき家具: ${rules.nearEntrance.join(', ') || 'なし'}

### 推定収容人数
- この面積(${area.toFixed(1)}m²)での推奨: ${seatEstimate.min}〜${seatEstimate.max}人

### 家具間距離制約（厳守）
- テーブル間の最小間隔: ${DISTANCE_CONSTRAINTS.tableBetween.min * 100}cm以上
- 通路幅: ${DISTANCE_CONSTRAINTS.passageWidth.min * 100}cm以上
- 壁からの最小距離（壁際家具以外）: ${DISTANCE_CONSTRAINTS.wallClearance.min * 100}cm以上
- 椅子の引きしろ: ${DISTANCE_CONSTRAINTS.chairPullback.min * 100}cm以上
- 入口前クリアランス: ${DISTANCE_CONSTRAINTS.entranceClearance.min * 100}cm以上

### 動線ルール
- 入口（手前中央 x=${(roomWidth / 2).toFixed(1)}m, z=0m）から全席に到達可能であること
- 入口正面に大型家具を置かないこと（動線遮断防止）
- レジは入口付近に配置（お客様の出入り動線を考慮）
`
}

// ────────────────────────────────────────────────
// 6. バリデーション: 家具重なり検出
// ────────────────────────────────────────────────

/** 2つの家具が重なっているか判定 */
export function isOverlapping(a: LayoutFurnitureItem, b: LayoutFurnitureItem): boolean {
  const aLeft = a.x - a.width / 2
  const aRight = a.x + a.width / 2
  const aTop = a.z - a.depth / 2
  const aBottom = a.z + a.depth / 2

  const bLeft = b.x - b.width / 2
  const bRight = b.x + b.width / 2
  const bTop = b.z - b.depth / 2
  const bBottom = b.z + b.depth / 2

  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop
}

/** 壁との衝突チェック */
export function isOutOfRoom(item: LayoutFurnitureItem, roomWidth: number, roomDepth: number): boolean {
  return (
    item.x - item.width / 2 < -0.05 ||
    item.x + item.width / 2 > roomWidth + 0.05 ||
    item.z - item.depth / 2 < -0.05 ||
    item.z + item.depth / 2 > roomDepth + 0.05
  )
}

/**
 * レイアウト提案の家具配置をバリデーションし、問題を修正する
 */
export function validateAndFixLayout(
  suggestion: LayoutSuggestion,
  roomWidth: number,
  roomDepth: number,
): LayoutSuggestion {
  const fixed = suggestion.furniture.map((item) => {
    const halfW = item.width / 2
    const halfD = item.depth / 2
    const margin = 0.15 // 壁際家具用の最小マージン

    return {
      ...item,
      // 壁からはみ出さないようにクランプ
      x: Math.max(halfW + margin, Math.min(roomWidth - halfW - margin, item.x)),
      z: Math.max(halfD + margin, Math.min(roomDepth - halfD - margin, item.z)),
    }
  })

  // 重なり検出＆除外
  const noOverlap: LayoutFurnitureItem[] = []
  for (const item of fixed) {
    const overlaps = noOverlap.some((existing) => isOverlapping(item, existing))
    if (!overlaps) {
      noOverlap.push(item)
    }
  }

  return {
    ...suggestion,
    furniture: noOverlap,
  }
}
