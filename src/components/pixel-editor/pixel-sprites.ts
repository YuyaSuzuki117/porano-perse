// ─── Legend of Mana inspired color palette ─────────────────────────────
export const PAL = {
  // Base
  black: '#2a1f14',
  darkBrown: '#5c3a1e',
  brown: '#8b6b3e',
  lightBrown: '#c4a06a',
  cream: '#f0e8d0',
  white: '#fff8f0',

  // Warm
  warmRed: '#c8584a',
  softOrange: '#e8a060',
  golden: '#e8c860',
  peach: '#f0c8a8',

  // Cool (low saturation)
  sage: '#7ca868',
  olive: '#5c8850',
  skyBlue: '#88b8d0',
  slate: '#607888',

  // Accent
  rose: '#d08888',
  lavender: '#a888c0',
  mint: '#88c8b0',

  // Shadow / Highlight
  shadow1: '#4a3828',
  shadow2: '#6a5438',
  highlight: '#fff0d8',

  // Extra utility
  silver: '#b8c0c8',
  midGray: '#8a8a90',
  darkGray: '#4a4a50',

  // Additional colors for new sprites
  teal: '#5a9898',
  deepBlue: '#4868a0',
  paleBlue: '#a8c8e0',
  palePink: '#e8b8c0',
  wood: '#a87840',
  darkWood: '#6a4820',
  lightWood: '#d8b878',
  glass: '#c0d8e8',
  glassHighlight: '#e0f0ff',
  darkMetal: '#3a3a40',
  lightMetal: '#c8c8d0',
  fabricRed: '#b84848',
  fabricBlue: '#5878a0',
  greenLeaf: '#68a848',
  darkGreen: '#3a6830',
  petal: '#e8a0a0',
  petalDark: '#c87878',
  iceBlue: '#b8d8f0',

  // Furniture-specific accent colors for better differentiation
  cushionRed: '#d45050',
  cushionBlue: '#5080c0',
  woodCherry: '#a04030',
  woodMaple: '#d8a050',
  metalBrass: '#c0a060',
  ceramicWhite: '#e8e8f0',
  leatherBrown: '#8b5a2b',
  fabricGreen: '#508050',

  // New colors for improved sprites
  slatBack: '#7a4a28',
  seatPad: '#e0b888',
  sofaDeep: '#a03838',
  sofaLight: '#e87070',
  sofaPillow: '#6898d0',
  woodGrain: '#b88848',
  terracotta: '#c06838',
  terracottaDark: '#8a4020',
  potRim: '#d88050',
  leafDark: '#2a5020',
  leafMid: '#488838',
  leafLight: '#90c870',
  flowerYellow: '#f0d040',
  flowerPink: '#e890a0',
  screenGlow: '#80c0e0',
  receiptWhite: '#f8f0e0',
  brassKnob: '#d0b060',
  chalkGreen: '#2a4a2a',
  chalkText: '#c8d8b0',
} as const;

export type PalKey = keyof typeof PAL;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ = 0; // transparent

// ─── 32x32 isometric sprite definitions ─────────────────────────────────
export type SpriteRow = (PalKey | 0)[];
export type SpriteData = SpriteRow[];

export const SPRITE_SIZE = 32;

export function createSprite(rows: SpriteData): SpriteData {
  while (rows.length < SPRITE_SIZE) rows.push(new Array(SPRITE_SIZE).fill(0));
  return rows.map(r => {
    while (r.length < SPRITE_SIZE) r.push(0);
    return r.slice(0, SPRITE_SIZE);
  });
}

// Helper to create a filled row segment
export function seg(pre: number, fills: (PalKey | 0)[], post: number): SpriteRow {
  const row: SpriteRow = [];
  for (let i = 0; i < pre; i++) row.push(0);
  row.push(...fills);
  for (let i = 0; i < post; i++) row.push(0);
  while (row.length < SPRITE_SIZE) row.push(0);
  return row.slice(0, SPRITE_SIZE);
}

// Helper: repeat a color n times
function rep(color: PalKey | 0, n: number): (PalKey | 0)[] {
  return new Array(n).fill(color);
}

// Helper: alternate two colors
function alt(a: PalKey | 0, b: PalKey | 0, n: number): (PalKey | 0)[] {
  const result: (PalKey | 0)[] = [];
  for (let i = 0; i < n; i++) result.push(i % 2 === 0 ? a : b);
  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// PROFESSIONAL QUALITY PIXEL ART SPRITES — Habbo Hotel / Stardew Valley style
// Each item has a UNIQUE silhouette, consistent top-left isometric lighting
// ══════════════════════════════════════════════════════════════════════════

export const SPRITES: Record<string, SpriteData> = {

  // ── CHAIR: Wooden dining chair with tall slatted backrest ──────────────
  // Distinctive: TALL narrow vertical silhouette, 3 visible slats, red cushion seat
  chair: createSprite([
    // Row 0-1: Backrest top rail (curved)
    seg(10, ['darkWood', ...rep('slatBack', 10), 'darkWood'], 10),
    seg(9, ['darkWood', 'highlight', ...rep('woodMaple', 10), 'shadow2', 'darkWood'], 8),
    // Row 2-5: Three vertical slats with gaps between
    seg(9, ['darkWood', 'woodMaple', 0, 'woodMaple', 'woodMaple', 0, 'woodMaple', 'woodMaple', 0, 'woodMaple', 'woodMaple', 0, 'darkWood'], 8),
    seg(9, ['darkWood', 'brown', 0, 'woodMaple', 'brown', 0, 'woodMaple', 'brown', 0, 'woodMaple', 'brown', 0, 'darkWood'], 8),
    seg(9, ['darkWood', 'woodMaple', 0, 'brown', 'woodMaple', 0, 'brown', 'woodMaple', 0, 'brown', 'woodMaple', 0, 'darkWood'], 8),
    seg(9, ['darkWood', 'brown', 0, 'woodMaple', 'brown', 0, 'woodMaple', 'brown', 0, 'woodMaple', 'brown', 0, 'darkWood'], 8),
    // Row 6-7: Bottom rail of backrest
    seg(9, ['darkWood', 'highlight', ...rep('woodMaple', 10), 'shadow2', 'darkWood'], 8),
    seg(9, ['darkWood', ...rep('slatBack', 12), 'darkWood'], 8),
    // Row 8-9: Back legs connect to seat rails
    seg(9, ['darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood'], 8),
    seg(8, ['darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood'], 8),
    // Row 10: Seat frame
    seg(7, ['darkWood', ...rep('slatBack', 16), 'darkWood'], 7),
    // Row 11-13: Cushioned seat (warm red pad on wood)
    seg(7, ['darkWood', 'highlight', ...rep('cushionRed', 14), 'shadow2', 'darkWood'], 7),
    seg(7, ['darkWood', 'cushionRed', ...rep('sofaLight', 6), ...rep('cushionRed', 8), 'darkWood'], 7),
    seg(7, ['darkWood', ...rep('cushionRed', 14), 'shadow2', 'darkWood'], 7),
    // Row 14: Seat frame bottom
    seg(7, ['darkWood', ...rep('slatBack', 16), 'darkWood'], 7),
    seg(7, ['shadow2', ...rep('shadow1', 16), 'shadow2'], 7),
    // Row 15-18: Four splayed legs
    seg(7, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 7),
    seg(6, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 6),
    seg(5, ['brown', 'woodMaple', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'woodMaple', 'brown'], 5),
    seg(5, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 5),
  ]),

  // ── TABLE (SQUARE): Wooden dining table with grain and cross-brace ────
  // Distinctive: WIDE FLAT horizontal shape, visible wood grain, thick legs
  table_square: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // Row 4-5: Tabletop front edge (thickness)
    seg(3, [...rep('darkWood', 26)], 3),
    seg(2, ['darkWood', 'highlight', ...rep('woodMaple', 24), 'shadow2', 'darkWood'], 2),
    // Row 6-9: Table surface with rich wood grain
    seg(2, ['darkWood', 'woodMaple', 'lightBrown', ...rep('woodMaple', 5), 'woodGrain', ...rep('woodMaple', 6), 'woodGrain', ...rep('woodMaple', 5), 'lightBrown', 'woodMaple', 'shadow2', 'darkWood'], 2),
    seg(2, ['darkWood', 'woodMaple', ...rep('lightBrown', 3), ...rep('woodMaple', 8), 'woodGrain', ...rep('woodMaple', 8), ...rep('lightBrown', 2), 'shadow2', 'darkWood'], 2),
    seg(2, ['darkWood', 'woodMaple', 'woodGrain', ...rep('woodMaple', 6), 'lightBrown', ...rep('woodMaple', 4), 'lightBrown', ...rep('woodMaple', 6), 'woodGrain', 'woodMaple', 'shadow2', 'darkWood'], 2),
    seg(2, ['darkWood', 'brown', ...rep('woodMaple', 10), 'woodGrain', ...rep('woodMaple', 10), 'brown', 'shadow2', 'darkWood'], 2),
    // Row 10-11: Tabletop back edge + shadow
    seg(2, ['darkWood', 'shadow2', ...rep('brown', 22), 'shadow2', 'darkWood'], 2),
    seg(3, [...rep('darkWood', 26)], 3),
    // Row 12: Apron/skirt
    seg(4, ['shadow2', ...rep('slatBack', 22), 'shadow2'], 4),
    seg(4, ['shadow1', 'slatBack', ...rep('darkWood', 20), 'slatBack', 'shadow1'], 4),
    // Row 14-15: Cross-brace
    seg(6, ['brown', 'darkWood', 0, 0, ...rep('darkWood', 10), 0, 0, 'darkWood', 'brown'], 6),
    seg(6, ['brown', 0, 'darkWood', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'darkWood', 0, 'brown'], 6),
    // Row 16-19: Four thick legs
    seg(5, ['brown', 'woodMaple', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'woodMaple', 'brown'], 5),
    seg(5, ['brown', 'woodMaple', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'woodMaple', 'brown'], 5),
    seg(5, ['brown', 'shadow2', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow2', 'brown'], 5),
    seg(5, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 5),
  ]),

  // ── TABLE (ROUND): Circular table with pedestal base ──────────────────
  // Distinctive: DIAMOND/OVAL top shape (isometric circle), single central pedestal
  table_round: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Row 3-4: Top of ellipse
    seg(10, [...rep('darkWood', 12)], 10),
    seg(7, ['darkWood', 'highlight', ...rep('cream', 14), 'shadow2', 'darkWood'], 7),
    // Row 5-7: Wide part of ellipse (table surface)
    seg(5, ['darkWood', 'highlight', 'cream', ...rep('lightBrown', 6), ...rep('cream', 8), ...rep('lightBrown', 2), 'cream', 'shadow2', 'darkWood'], 5),
    seg(4, ['darkWood', 'cream', ...rep('lightBrown', 3), ...rep('cream', 12), ...rep('lightBrown', 3), 'shadow2', 'darkWood'], 4),
    seg(4, ['darkWood', 'cream', 'lightBrown', ...rep('cream', 16), 'lightBrown', 'shadow2', 'darkWood'], 4),
    // Row 8-9: Back of ellipse
    seg(5, ['darkWood', 'brown', ...rep('lightBrown', 16), 'shadow2', 'darkWood'], 5),
    seg(7, ['darkWood', 'brown', ...rep('shadow2', 14), 'darkWood'], 7),
    // Row 10: Table edge
    seg(10, [...rep('darkWood', 12)], 10),
    seg(10, ['shadow2', ...rep('shadow1', 10), 'shadow2'], 10),
    // Row 12-15: Central pedestal
    seg(13, ['darkWood', 'brown', 'woodMaple', 'brown', 'darkWood', 'shadow1'], 13),
    seg(13, ['darkWood', 'woodMaple', 'brown', 'woodMaple', 'darkWood', 'shadow1'], 13),
    seg(13, ['darkWood', 'brown', 'woodMaple', 'brown', 'darkWood', 'shadow1'], 13),
    seg(13, ['shadow1', 'darkWood', 'brown', 'darkWood', 'shadow1'], 14),
    // Row 16-17: Three-leg base (tripod feet)
    seg(10, ['shadow1', 'darkWood', 'brown', 0, 0, 0, 0, 0, 'brown', 'darkWood', 'shadow1'], 11),
    seg(8, ['shadow1', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'shadow1'], 8),
    seg(7, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 7),
  ]),

  // ── SOFA: Large comfortable sofa with cushions and throw pillow ────────
  // Distinctive: WIDEST furniture item, deep/rounded, two seat cushions, accent pillow
  sofa: createSprite([
    // Row 0: empty
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    // Row 1-2: Back cushion top (tall, rounded)
    seg(3, ['darkBrown', ...rep('sofaDeep', 24), 'darkBrown'], 3),
    seg(2, ['darkBrown', 'sofaDeep', 'highlight', ...rep('cushionRed', 22), 'shadow2', 'sofaDeep', 'darkBrown'], 2),
    // Row 3-5: Back cushion body with pillow seams
    seg(1, ['darkBrown', 'sofaDeep', 'cushionRed', 'highlight', ...rep('sofaLight', 9), 'sofaDeep', ...rep('sofaLight', 9), 'cushionRed', 'sofaDeep', 'darkBrown'], 1),
    seg(1, ['darkBrown', 'sofaDeep', 'cushionRed', ...rep('sofaLight', 10), 'sofaDeep', ...rep('sofaLight', 10), 'cushionRed', 'sofaDeep', 'darkBrown'], 1),
    seg(1, ['darkBrown', 'sofaDeep', ...rep('cushionRed', 24), 'sofaDeep', 'darkBrown'], 1),
    // Row 6-7: Armrests (rounded, higher than seat, wider than back)
    seg(0, ['darkBrown', 'sofaDeep', 'sofaLight', 'cushionRed', 'sofaDeep', ...rep('slatBack', 20), 'sofaDeep', 'cushionRed', 'sofaLight', 'sofaDeep', 'darkBrown'], 0),
    seg(0, ['darkBrown', 'sofaDeep', 'highlight', 'sofaLight', 'sofaDeep', ...rep('darkBrown', 20), 'sofaDeep', 'sofaLight', 'cushionRed', 'sofaDeep', 'darkBrown'], 0),
    // Row 8-10: Seat cushions with visible dividing seam + throw pillow
    seg(0, ['darkBrown', 'sofaDeep', 'cushionRed', 'sofaLight', 'sofaDeep', 'highlight', ...rep('peach', 8), 'sofaDeep', 'sofaPillow', 'sofaPillow', ...rep('peach', 7), 'cushionRed', 'sofaDeep', 'cushionRed', 'sofaLight', 'sofaDeep', 'darkBrown'], 0),
    seg(0, ['darkBrown', 'sofaDeep', 'cushionRed', 'sofaLight', 'sofaDeep', 'peach', ...rep('cream', 7), 'sofaDeep', 'sofaPillow', 'highlight', 'sofaPillow', ...rep('cream', 6), 'peach', 'sofaDeep', 'sofaLight', 'cushionRed', 'sofaDeep', 'darkBrown'], 0),
    seg(0, ['darkBrown', 'sofaDeep', 'sofaLight', 'cushionRed', 'sofaDeep', ...rep('peach', 9), 'sofaDeep', ...rep('peach', 9), 'sofaDeep', 'cushionRed', 'sofaLight', 'sofaDeep', 'darkBrown'], 0),
    // Row 11: Seat front edge
    seg(0, ['darkBrown', 'sofaDeep', ...rep('darkBrown', 28), 'sofaDeep', 'darkBrown'], 0),
    // Row 12-13: Front face of sofa (skirt)
    seg(1, ['shadow2', 'darkBrown', ...rep('slatBack', 26), 'darkBrown', 'shadow2'], 1),
    seg(1, ['shadow1', 'shadow2', ...rep('darkBrown', 26), 'shadow2', 'shadow1'], 1),
    // Row 14-15: Short legs and floor shadow
    seg(2, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 2),
    seg(2, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 2),
  ]),

  // ── COUNTER: Service counter with register + coffee cups on top ────────
  // Distinctive: WIDE horizontal, items visible ON TOP, open shelf underneath
  counter: createSprite([
    // Row 0-1: Items on counter — register silhouette left, cups right
    seg(5, ['darkGray', 'darkGray', 'darkGray', 'darkGray', 'darkGray', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'ceramicWhite', 'ceramicWhite'], 5),
    seg(5, ['darkGray', 'screenGlow', 'screenGlow', 'screenGlow', 'darkGray', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'ceramicWhite', 'cream', 'ceramicWhite', 'ceramicWhite'], 5),
    seg(5, ['darkGray', 'darkGray', 'darkGray', 'darkGray', 'darkGray', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'ceramicWhite', 0, 'ceramicWhite'], 5),
    // Row 3-5: Counter top surface (wide, cream marble)
    seg(3, [...rep('darkWood', 26)], 3),
    seg(2, ['darkWood', 'highlight', ...rep('cream', 24), 'shadow2', 'darkWood'], 2),
    seg(2, ['darkWood', 'cream', ...rep('woodMaple', 8), ...rep('cream', 8), ...rep('woodMaple', 6), 'shadow2', 'darkWood'], 2),
    // Row 6: Top edge
    seg(3, [...rep('darkWood', 26)], 3),
    // Row 7-10: Front panel with alternating wood texture
    seg(3, ['shadow2', 'brown', ...rep('woodMaple', 6), ...rep('lightBrown', 6), ...rep('woodMaple', 6), ...rep('lightBrown', 4), 'brown', 'shadow2'], 3),
    seg(3, ['shadow2', 'brown', ...rep('darkWood', 22), 'brown', 'shadow2'], 3),
    seg(3, ['shadow2', 'brown', ...rep('lightBrown', 6), ...rep('woodMaple', 6), ...rep('lightBrown', 6), ...rep('woodMaple', 4), 'brown', 'shadow2'], 3),
    seg(3, ['shadow2', 'brown', ...rep('darkWood', 22), 'brown', 'shadow2'], 3),
    // Row 11-12: Open shelf underneath with items visible
    seg(3, ['shadow2', 'brown', 'cream', ...rep(0, 6), 'cream', 'metalBrass', 'metalBrass', 'cream', ...rep(0, 6), 'cream', 'brown', 'shadow2'], 3),
    seg(3, ['shadow2', 'brown', 'cream', ...rep(0, 6), 'cream', 'cream', 'cream', 'cream', ...rep(0, 6), 'cream', 'brown', 'shadow2'], 3),
    // Row 13: Base
    seg(3, ['shadow1', ...rep('darkWood', 24), 'shadow1'], 3),
    seg(4, [...rep('shadow1', 24)], 4),
  ]),

  // ── PLANT: Lush potted plant with multi-layer foliage ─────────────────
  // Distinctive: ORGANIC irregular silhouette, green canopy wider than pot, flowers
  plant: createSprite([
    // Row 0-1: Top leaves poking up (irregular, organic)
    seg(12, ['leafMid', 0, 'greenLeaf', 0, 'leafLight'], 15),
    seg(10, ['leafMid', 'greenLeaf', 0, 'leafLight', 'sage', 0, 'greenLeaf', 'leafMid'], 14),
    // Row 2-4: Upper canopy — lush, different green tones
    seg(7, ['leafDark', 'leafMid', 'greenLeaf', 'sage', 'flowerPink', 'greenLeaf', 'leafLight', 'sage', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'leafDark'], 12),
    seg(6, ['leafDark', 'sage', 'greenLeaf', 'leafMid', 'greenLeaf', 'leafLight', 'sage', 'flowerYellow', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'leafMid', 'leafLight', 'greenLeaf', 'sage', 'leafDark'], 9),
    seg(5, ['olive', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'leafLight', 'leafMid', 'sage', 'greenLeaf', 'mint', 'sage', 'leafMid', 'greenLeaf', 'sage', 'leafLight', 'greenLeaf', 'leafMid', 'sage', 'olive'], 8),
    // Row 5-7: Widest part of canopy — extends beyond pot width
    seg(4, ['leafDark', 'greenLeaf', 'sage', 'flowerPink', 'leafMid', 'leafLight', 'greenLeaf', 'sage', 'leafMid', 'greenLeaf', 'leafLight', 'sage', 'greenLeaf', 'leafMid', 'flowerYellow', 'sage', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'leafDark'], 7),
    seg(5, ['olive', 'leafMid', 'greenLeaf', 'sage', 'leafLight', 'leafMid', 'sage', 'greenLeaf', 'leafMid', 'sage', 'leafLight', 'greenLeaf', 'sage', 'leafMid', 'greenLeaf', 'sage', 'leafMid', 'olive'], 9),
    seg(6, ['leafDark', 'greenLeaf', 'sage', 'leafMid', 'greenLeaf', 'sage', 'leafMid', 'greenLeaf', 'sage', 'leafMid', 'greenLeaf', 'sage', 'leafMid', 'greenLeaf', 'sage', 'leafDark'], 10),
    // Row 8-9: Lower foliage tapering + drooping leaves
    seg(7, ['olive', 'sage', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'leafMid', 'sage', 'greenLeaf', 'olive'], 12),
    seg(9, ['leafDark', 'sage', 'leafMid', 'brown', 'brown', 'leafMid', 'sage', 'leafDark'], 15),
    // Row 10-11: Trunk/stem
    seg(12, ['sage', 'brown', 'darkBrown', 'brown', 'sage'], 15),
    seg(13, ['brown', 'darkBrown', 'brown', 'brown'], 15),
    // Row 12-13: Decorative pot — wide rim
    seg(10, ['terracottaDark', ...rep('terracotta', 10), 'terracottaDark'], 10),
    seg(9, ['terracottaDark', 'terracotta', 'highlight', ...rep('potRim', 8), 'shadow2', 'terracotta', 'terracottaDark'], 9),
    // Row 14-16: Pot body tapering down
    seg(10, ['terracottaDark', 'terracotta', ...rep('softOrange', 4), ...rep('warmRed', 4), 'terracotta', 'terracottaDark'], 10),
    seg(10, ['terracottaDark', 'warmRed', ...rep('softOrange', 3), 'terracotta', ...rep('warmRed', 3), 'shadow2', 'terracottaDark'], 10),
    seg(11, ['terracottaDark', ...rep('warmRed', 6), 'shadow2', 'terracottaDark'], 12),
    // Row 17: Pot base
    seg(12, ['terracottaDark', ...rep('shadow1', 6), 'terracottaDark'], 12),
  ]),

  // ── SHELF: Bookshelf — tall with 4 levels of colorful books ───────────
  // Distinctive: TALLEST furniture, vertical rectangle, colorful book spines visible
  shelf: createSprite([
    // Row 0: Top frame
    seg(5, [...rep('darkWood', 22)], 5),
    seg(5, ['darkWood', 'highlight', ...rep('slatBack', 18), 'shadow2', 'darkWood'], 5),
    // Row 2-3: Shelf 1 — books of different heights
    seg(5, ['darkWood', 'cream', 'fabricRed', 'fabricRed', 'cream', 'fabricBlue', 'sage', 'sage', 'golden', 'cream', 'fabricRed', 'lavender', 'lavender', 'cream', 'sage', 'fabricBlue', 'fabricBlue', 'golden', 'cream', 'cream', 'darkWood'], 5),
    seg(5, ['darkWood', 'cream', 'fabricRed', 'fabricRed', 'cream', 'fabricBlue', 'sage', 'sage', 'golden', 'cream', 'fabricRed', 'lavender', 'lavender', 'cream', 'sage', 'fabricBlue', 'fabricBlue', 'golden', 'cream', 'cream', 'darkWood'], 5),
    // Row 4: Shelf divider
    seg(5, ['darkWood', ...rep('slatBack', 20), 'darkWood'], 5),
    // Row 5-6: Shelf 2 — different book arrangement
    seg(5, ['darkWood', 'cream', 'sage', 'sage', 'cream', 'golden', 'golden', 'cream', 'fabricRed', 'fabricRed', 'fabricBlue', 'cream', 'warmRed', 'warmRed', 'lavender', 'cream', 'sage', 'sage', 'cream', 'fabricBlue', 'darkWood'], 5),
    seg(5, ['darkWood', 'cream', 'sage', 'sage', 'cream', 'golden', 'golden', 'cream', 'fabricRed', 'cream', 'fabricBlue', 'cream', 'warmRed', 'warmRed', 'lavender', 'cream', 'sage', 'sage', 'cream', 'fabricBlue', 'darkWood'], 5),
    // Row 7: Shelf divider
    seg(5, ['darkWood', ...rep('slatBack', 20), 'darkWood'], 5),
    // Row 8-9: Shelf 3
    seg(5, ['darkWood', 'cream', 'fabricBlue', 'fabricBlue', 'fabricRed', 'cream', 'sage', 'cream', 'golden', 'golden', 'cream', 'lavender', 'fabricRed', 'cream', 'fabricBlue', 'sage', 'cream', 'golden', 'cream', 'olive', 'darkWood'], 5),
    seg(5, ['darkWood', 'cream', 'fabricBlue', 'cream', 'fabricRed', 'cream', 'sage', 'cream', 'golden', 'golden', 'cream', 'lavender', 'fabricRed', 'cream', 'fabricBlue', 'sage', 'cream', 'golden', 'cream', 'olive', 'darkWood'], 5),
    // Row 10: Shelf divider
    seg(5, ['darkWood', ...rep('slatBack', 20), 'darkWood'], 5),
    // Row 11-12: Shelf 4 (bottom)
    seg(5, ['darkWood', 'cream', 'warmRed', 'warmRed', 'cream', 'fabricBlue', 'fabricBlue', 'sage', 'cream', 'fabricRed', 'cream', 'golden', 'golden', 'cream', 'olive', 'olive', 'cream', 'lavender', 'lavender', 'cream', 'darkWood'], 5),
    seg(5, ['darkWood', 'cream', 'warmRed', 'warmRed', 'cream', 'fabricBlue', 'fabricBlue', 'sage', 'cream', 'fabricRed', 'cream', 'golden', 'golden', 'cream', 'olive', 'olive', 'cream', 'lavender', 'lavender', 'cream', 'darkWood'], 5),
    // Row 13: Bottom frame
    seg(5, ['darkWood', ...rep('slatBack', 20), 'darkWood'], 5),
    seg(5, ['shadow2', ...rep('shadow1', 20), 'shadow2'], 5),
    // Row 15-16: Base/feet
    seg(5, ['darkWood', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'darkWood'], 5),
    seg(5, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 5),
  ]),

  // ── PENDANT LIGHT: Hanging lamp with warm glow ────────────────────────
  // Distinctive: SUSPENDED from top, cone shade, visible warm glow halo
  pendant_light: createSprite([
    // Row 0-3: Thin chain/cord
    seg(15, ['midGray', 'midGray'], 15),
    seg(15, ['midGray', 'midGray'], 15),
    seg(15, ['midGray', 'midGray'], 15),
    seg(14, ['midGray', 'darkGray', 'midGray', 'midGray'], 14),
    // Row 4-5: Top of lampshade (narrow)
    seg(12, ['darkGray', ...rep('golden', 6), 'darkGray'], 12),
    seg(10, ['darkGray', 'golden', 'highlight', ...rep('golden', 6), 'shadow2', 'darkGray'], 10),
    // Row 6-8: Wider lampshade (dome/cone shape)
    seg(8, ['darkGray', 'golden', 'highlight', ...rep('softOrange', 10), 'golden', 'shadow2', 'darkGray'], 8),
    seg(7, ['darkGray', 'golden', 'highlight', ...rep('softOrange', 4), ...rep('golden', 4), ...rep('softOrange', 4), 'shadow2', 'golden', 'darkGray'], 7),
    seg(6, ['darkGray', 'metalBrass', ...rep('golden', 16), 'shadow2', 'darkGray'], 6),
    // Row 9: Shade bottom rim
    seg(7, [...rep('darkGray', 18)], 7),
    // Row 10-12: Warm glow effect (transparent-ish warm tones)
    seg(9, ['highlight', ...rep('golden', 12), 'highlight'], 9),
    seg(10, ['golden', ...rep('highlight', 8), 'golden', 'golden'], 10),
    seg(12, ['golden', ...rep('highlight', 6), 'golden'], 12),
  ]),

  // ── REGISTER: Cash register / POS with angled screen ──────────────────
  // Distinctive: ANGLED SCREEN on top, visible keypad grid, receipt paper
  register: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Row 2-3: Receipt paper sticking out the top
    seg(19, ['receiptWhite', 'receiptWhite'], 11),
    seg(18, ['receiptWhite', 'midGray', 'receiptWhite'], 11),
    // Row 4-7: Angled screen
    seg(8, [...rep('darkGray', 16)], 8),
    seg(7, ['darkGray', 'darkMetal', ...rep('deepBlue', 12), 'darkMetal', 'darkGray'], 7),
    seg(7, ['darkGray', 'darkMetal', 'deepBlue', 'screenGlow', 'screenGlow', 'deepBlue', 'deepBlue', 'screenGlow', 'screenGlow', 'screenGlow', 'deepBlue', 'screenGlow', 'deepBlue', 'darkMetal', 'darkGray'], 7),
    seg(7, ['darkGray', 'darkMetal', ...rep('deepBlue', 12), 'darkMetal', 'darkGray'], 7),
    seg(8, [...rep('darkGray', 16)], 8),
    // Row 9-12: Keypad body with button grid
    seg(7, [...rep('darkGray', 18)], 7),
    seg(7, ['darkGray', 'silver', 'white', 'silver', 'darkGray', 'silver', 'white', 'silver', 'darkGray', 'silver', 'white', 'silver', 'darkGray', 'silver', 'white', 'silver', 'darkGray', 'darkGray'], 7),
    seg(7, ['darkGray', 'silver', 'silver', 'silver', 'darkGray', 'silver', 'silver', 'silver', 'darkGray', 'silver', 'silver', 'silver', 'darkGray', 'silver', 'silver', 'silver', 'darkGray', 'darkGray'], 7),
    seg(7, [...rep('darkGray', 18)], 7),
    // Row 13: Cash drawer
    seg(7, ['shadow2', 'darkGray', ...rep('midGray', 14), 'darkGray', 'shadow2'], 7),
    seg(8, [...rep('shadow1', 16)], 8),
  ]),

  // ── STOOL: Bar stool with round seat and footrest ring ────────────────
  // Distinctive: SMALL round seat, single pole, visible footrest ring
  stool: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // Row 4-5: Round padded seat (small)
    seg(10, [...rep('darkGray', 12)], 10),
    seg(9, ['darkGray', 'highlight', ...rep('silver', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(10, [...rep('darkGray', 12)], 10),
    // Row 8: Seat bottom
    seg(11, [...rep('shadow1', 10)], 11),
    // Row 9-10: Single pole
    seg(14, ['midGray', 'silver', 'midGray', 'shadow1'], 14),
    seg(14, ['midGray', 'silver', 'midGray', 'shadow1'], 14),
    // Row 11-12: Footrest ring (wider than pole)
    seg(10, ['shadow1', 'midGray', ...rep('silver', 8), 'midGray', 'shadow1'], 10),
    seg(10, ['shadow1', ...rep('midGray', 10), 'shadow1'], 10),
    // Row 13-15: Pole continues
    seg(14, ['midGray', 'silver', 'midGray', 'shadow1'], 14),
    seg(14, ['midGray', 'silver', 'midGray', 'shadow1'], 14),
    // Row 16-17: Base (spread feet)
    seg(9, ['shadow1', 'midGray', 'midGray', 0, 0, 0, 0, 0, 0, 0, 0, 'midGray', 'midGray', 'shadow1'], 9),
    seg(8, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 8),
  ]),

  // ── PARTITION: Room divider panel ─────────────────────────────────────
  partition: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top rail
    seg(2, [...rep('darkWood', 28)], 2),
    seg(2, ['darkWood', 'highlight', ...rep('slatBack', 24), 'shadow2', 'darkWood'], 2),
    // Panel body — fabric or frosted glass look
    seg(2, ['darkWood', 'cream', ...rep('paleBlue', 10), 'cream', 'cream', ...rep('paleBlue', 10), 'cream', 'darkWood'], 2),
    seg(2, ['darkWood', 'cream', ...rep('glassHighlight', 3), ...rep('paleBlue', 7), 'cream', 'cream', ...rep('glassHighlight', 3), ...rep('paleBlue', 7), 'cream', 'darkWood'], 2),
    seg(2, ['darkWood', 'cream', ...rep('paleBlue', 10), 'cream', 'cream', ...rep('paleBlue', 10), 'cream', 'darkWood'], 2),
    seg(2, ['darkWood', 'cream', ...rep('paleBlue', 10), 'cream', 'cream', ...rep('paleBlue', 10), 'cream', 'darkWood'], 2),
    seg(2, ['darkWood', 'cream', ...rep('glassHighlight', 2), ...rep('paleBlue', 8), 'cream', 'cream', ...rep('glassHighlight', 2), ...rep('paleBlue', 8), 'cream', 'darkWood'], 2),
    seg(2, ['darkWood', 'cream', ...rep('paleBlue', 10), 'cream', 'cream', ...rep('paleBlue', 10), 'cream', 'darkWood'], 2),
    // Bottom rail
    seg(2, ['darkWood', 'shadow2', ...rep('slatBack', 24), 'shadow2', 'darkWood'], 2),
    seg(2, [...rep('darkWood', 28)], 2),
    seg(2, ['shadow2', ...rep('shadow1', 26), 'shadow2'], 2),
    // Feet
    seg(3, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 3),
    seg(3, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 3),
  ]),

  // ══════════════════════════════════════════════════════════════
  // ADDITIONAL FURNITURE SPRITES
  // ══════════════════════════════════════════════════════════════

  // ── BENCH: Long wooden bench ──────────────────────────────────────────
  // Distinctive: VERY WIDE, LOW, no back, simple plank seat
  bench: createSprite([
    ...Array(7).fill(new Array(SPRITE_SIZE).fill(0)),
    // Seat planks (two visible planks with gap)
    seg(1, [...rep('darkWood', 30)], 1),
    seg(0, ['darkWood', 'highlight', ...rep('woodMaple', 12), 'darkWood', ...rep('lightBrown', 12), 'woodMaple', 'shadow2', 'darkWood'], 0),
    seg(0, ['darkWood', 'woodMaple', ...rep('lightBrown', 12), 'darkWood', ...rep('woodMaple', 12), 'lightBrown', 'shadow2', 'darkWood'], 0),
    seg(1, ['darkWood', 'shadow2', ...rep('brown', 26), 'shadow2', 'darkWood'], 1),
    seg(1, [...rep('darkWood', 30)], 1),
    // Edge
    seg(2, ['shadow2', ...rep('shadow1', 28)], 2),
    // Legs (3 pairs evenly spaced)
    seg(2, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown', 0, 0, 0, 0, 'brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 2),
    seg(2, ['brown', 'woodMaple', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'woodMaple', 0, 0, 0, 0, 'woodMaple', 'brown', 0, 0, 0, 0, 0, 0, 0, 'woodMaple', 'brown'], 2),
    seg(2, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1', 0, 0, 0, 0, 'shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 2),
  ]),

  // ── MIRROR: Oval wall mirror with ornate frame ────────────────────────
  // Distinctive: OVAL shape, reflective glass with highlight streak
  mirror: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(10, [...rep('darkWood', 12)], 10),
    seg(8, ['darkWood', 'metalBrass', ...rep('darkWood', 10), 'metalBrass', 'darkWood'], 8),
    seg(7, ['darkWood', 'metalBrass', 'darkWood', ...rep('glass', 4), ...rep('glassHighlight', 4), 'darkWood', 'metalBrass', 'darkWood'], 7),
    seg(6, ['darkWood', 'metalBrass', 'darkWood', ...rep('glass', 3), ...rep('glassHighlight', 4), ...rep('paleBlue', 3), 'darkWood', 'metalBrass', 'darkWood'], 6),
    seg(6, ['darkWood', 'metalBrass', 'darkWood', ...rep('paleBlue', 3), ...rep('glassHighlight', 3), ...rep('glass', 4), 'darkWood', 'metalBrass', 'darkWood'], 6),
    seg(6, ['darkWood', 'metalBrass', 'darkWood', ...rep('glass', 5), ...rep('paleBlue', 5), 'darkWood', 'metalBrass', 'darkWood'], 6),
    seg(6, ['darkWood', 'metalBrass', 'darkWood', ...rep('glass', 10), 'darkWood', 'metalBrass', 'darkWood'], 6),
    seg(7, ['darkWood', 'metalBrass', 'darkWood', ...rep('glass', 4), ...rep('paleBlue', 4), 'darkWood', 'metalBrass', 'darkWood'], 7),
    seg(8, ['darkWood', 'metalBrass', ...rep('darkWood', 10), 'metalBrass', 'darkWood'], 8),
    seg(10, [...rep('darkWood', 12)], 10),
    // Decorative bottom
    seg(14, ['metalBrass', 'darkWood', 'metalBrass'], 15),
  ]),

  // ── RECEPTION DESK: L-shaped counter ──────────────────────────────────
  // Distinctive: L-SHAPE visible, professional look
  reception_desk: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top surface
    seg(2, [...rep('darkWood', 28)], 2),
    seg(1, ['darkWood', 'highlight', ...rep('cream', 26), 'shadow2', 'darkWood'], 1),
    seg(1, ['darkWood', 'cream', ...rep('lightBrown', 24), 'cream', 'shadow2', 'darkWood'], 1),
    seg(2, [...rep('darkWood', 28)], 2),
    // Front face — L-shape: left tall, right shorter
    seg(2, ['shadow2', 'brown', ...rep('woodMaple', 14), 'darkWood', ...rep('woodMaple', 10), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('slatBack', 14), 'darkWood', ...rep('slatBack', 10), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('woodMaple', 14), 'darkWood', ...rep('woodMaple', 10), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('slatBack', 14), 'darkWood', ...rep('slatBack', 10), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('woodMaple', 14), 'brown', 'shadow2', ...rep(0, 12)], 2),
    seg(3, [...rep('shadow1', 16), ...rep(0, 13)], 3),
  ]),

  // ── TV MONITOR: Thin screen on stand ──────────────────────────────────
  // Distinctive: VERY THIN rectangle, wide screen, small stand
  tv_monitor: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    // Thin bezel
    seg(3, [...rep('darkMetal', 26)], 3),
    seg(2, ['darkMetal', 'darkGray', ...rep('darkMetal', 24), 'darkGray', 'darkMetal'], 2),
    // Screen
    seg(2, ['darkMetal', 'darkGray', ...rep('deepBlue', 24), 'darkGray', 'darkMetal'], 2),
    seg(2, ['darkMetal', 'darkGray', ...rep('deepBlue', 6), ...rep('screenGlow', 4), ...rep('deepBlue', 6), ...rep('skyBlue', 4), ...rep('deepBlue', 4), 'darkGray', 'darkMetal'], 2),
    seg(2, ['darkMetal', 'darkGray', ...rep('deepBlue', 24), 'darkGray', 'darkMetal'], 2),
    seg(2, ['darkMetal', 'darkGray', ...rep('skyBlue', 8), ...rep('deepBlue', 8), ...rep('screenGlow', 8), 'darkGray', 'darkMetal'], 2),
    seg(2, ['darkMetal', 'darkGray', ...rep('deepBlue', 24), 'darkGray', 'darkMetal'], 2),
    seg(2, ['darkMetal', 'darkGray', ...rep('deepBlue', 24), 'darkGray', 'darkMetal'], 2),
    // Bottom bezel
    seg(3, [...rep('darkMetal', 26)], 3),
    // Thin stand neck
    seg(13, [...rep('darkGray', 4), 'shadow1', 'shadow1'], 13),
    seg(13, [...rep('darkGray', 4), 'shadow1', 'shadow1'], 13),
    // Wide base
    seg(9, [...rep('darkGray', 14)], 9),
    seg(9, ['darkGray', ...rep('midGray', 12), 'darkGray'], 9),
    seg(10, [...rep('shadow1', 12)], 10),
  ]),

  // ── WASHING MACHINE: Drum-style with round door window ────────────────
  washing_machine: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top panel with controls
    seg(6, [...rep('lightMetal', 20)], 6),
    seg(5, ['lightMetal', 'midGray', 'midGray', 'silver', 'silver', ...rep('lightMetal', 10), 'darkGray', 'darkGray', 'darkGray', 'midGray', 'midGray', 'lightMetal'], 5),
    seg(6, [...rep('lightMetal', 20)], 6),
    // Front face with round door
    seg(6, ['midGray', ...rep('silver', 18), 'midGray'], 6),
    seg(6, ['midGray', 'silver', 'silver', 'silver', ...rep('darkGray', 10), 'silver', 'silver', 'silver', 'silver', 'midGray'], 6),
    seg(6, ['midGray', 'silver', 'silver', 'darkGray', 'darkGray', ...rep('glass', 3), ...rep('glassHighlight', 3), ...rep('glass', 2), 'darkGray', 'darkGray', 'silver', 'silver', 'midGray'], 6),
    seg(6, ['midGray', 'silver', 'silver', 'darkGray', ...rep('glass', 3), ...rep('iceBlue', 4), ...rep('glass', 3), 'darkGray', 'silver', 'silver', 'midGray'], 6),
    seg(6, ['midGray', 'silver', 'silver', 'darkGray', 'darkGray', ...rep('glass', 3), ...rep('iceBlue', 2), ...rep('glass', 3), 'darkGray', 'darkGray', 'silver', 'silver', 'midGray'], 6),
    seg(6, ['midGray', 'silver', 'silver', 'silver', ...rep('darkGray', 10), 'silver', 'silver', 'silver', 'silver', 'midGray'], 6),
    seg(6, ['midGray', ...rep('silver', 18), 'midGray'], 6),
    // Bottom
    seg(6, ['shadow2', ...rep('midGray', 18), 'shadow2'], 6),
    seg(7, [...rep('shadow1', 18)], 7),
  ]),

  // ── COAT RACK: Pole with hooks ────────────────────────────────────────
  // Distinctive: VERY THIN vertical, hooks at top, single pole
  coat_rack: createSprite([
    // Row 0-4: Hooks spreading out at top (tree-like)
    seg(7, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 7),
    seg(8, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 8),
    seg(9, ['woodMaple', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'woodMaple'], 9),
    seg(10, ['brown', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'brown'], 10),
    seg(12, ['brown', 'darkWood', 'darkBrown', 'darkBrown', 'darkWood', 'brown'], 12),
    // Row 5: Finial/top knob
    seg(13, ['darkWood', 'brown', 'woodMaple', 'brown', 'darkWood'], 13),
    // Row 6-13: Pole
    seg(14, ['darkWood', 'brown', 'woodMaple', 'shadow2'], 14),
    seg(14, ['darkWood', 'woodMaple', 'brown', 'shadow2'], 14),
    seg(14, ['darkWood', 'brown', 'woodMaple', 'shadow2'], 14),
    seg(14, ['darkWood', 'woodMaple', 'brown', 'shadow2'], 14),
    seg(14, ['darkWood', 'brown', 'woodMaple', 'shadow2'], 14),
    seg(14, ['darkWood', 'woodMaple', 'brown', 'shadow2'], 14),
    seg(14, ['darkWood', 'brown', 'woodMaple', 'shadow2'], 14),
    seg(14, ['shadow1', 'darkWood', 'shadow1', 'shadow1'], 14),
    // Row 14-16: Tripod base
    seg(10, ['shadow1', 'darkWood', 'brown', 0, 0, 0, 0, 0, 'brown', 'darkWood', 'shadow1'], 11),
    seg(8, ['shadow1', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'shadow1'], 8),
    seg(7, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 7),
  ]),

  // ── AIR CONDITIONER: Wall-mounted unit with vents ─────────────────────
  air_conditioner: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top
    seg(3, [...rep('lightMetal', 26)], 3),
    seg(2, ['lightMetal', 'highlight', ...rep('ceramicWhite', 24), 'lightMetal'], 2),
    // Status LEDs
    seg(2, ['lightMetal', 'ceramicWhite', 'greenLeaf', 0, 0, ...rep('ceramicWhite', 19), 'lightMetal'], 2),
    // Body
    seg(2, ['lightMetal', ...rep('ceramicWhite', 24), 'lightMetal'], 2),
    seg(2, ['lightMetal', ...rep('ceramicWhite', 24), 'lightMetal'], 2),
    // Vent slats (angled)
    seg(3, ['lightMetal', ...alt('midGray', 'silver', 24), 'lightMetal'], 3),
    seg(3, ['lightMetal', ...alt('silver', 'midGray', 24), 'lightMetal'], 3),
    // Bottom edge (curved)
    seg(4, ['midGray', ...rep('lightMetal', 22), 'midGray'], 4),
    seg(5, [...rep('shadow1', 22)], 5),
  ]),

  // ── DESK: Office desk with drawers ────────────────────────────────────
  // Distinctive: Flat top + drawer cabinet on one side
  desk: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Desk top
    seg(3, [...rep('darkWood', 26)], 3),
    seg(2, ['darkWood', 'highlight', ...rep('lightWood', 24), 'shadow2', 'darkWood'], 2),
    seg(2, ['darkWood', 'lightWood', ...rep('woodMaple', 22), 'lightWood', 'shadow2', 'darkWood'], 2),
    seg(2, ['darkWood', 'shadow2', ...rep('lightWood', 24), 'shadow2', 'darkWood'], 2),
    seg(3, [...rep('darkWood', 26)], 3),
    // Left: open leg, Right: drawer cabinet
    seg(3, ['darkWood', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'slatBack', ...rep('lightBrown', 10), 'slatBack', 'darkWood'], 3),
    seg(3, ['darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'slatBack', ...rep('lightBrown', 4), 'brassKnob', ...rep('lightBrown', 5), 'slatBack', 'darkWood'], 3),
    seg(3, ['darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', ...rep('slatBack', 12), 'darkWood'], 3),
    seg(3, ['darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'slatBack', ...rep('lightBrown', 4), 'brassKnob', ...rep('lightBrown', 5), 'slatBack', 'darkWood'], 3),
    seg(3, ['darkWood', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'slatBack', ...rep('lightBrown', 10), 'slatBack', 'darkWood'], 3),
    // Base
    seg(3, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...rep('shadow1', 14)], 3),
  ]),

  // ── BOOKCASE: Tall shelf packed with books ────────────────────────────
  bookcase: createSprite([
    // Top ornamental crown
    seg(3, ['darkWood', 'highlight', ...rep('slatBack', 22), 'shadow2', 'darkWood'], 3),
    seg(4, [...rep('darkWood', 24)], 4),
    // Shelf 1 — top shelf (taller books)
    seg(4, ['darkWood', ...rep('cream', 22), 'darkWood'], 4),
    seg(4, ['darkWood', 'fabricRed', 'fabricRed', 'cream', 'fabricBlue', 'sage', 'sage', 'fabricRed', 'golden', 'golden', 'cream', 'fabricBlue', 'fabricBlue', 'cream', 'olive', 'sage', 'sage', 'fabricRed', 'fabricRed', 'cream', 'fabricBlue', 'cream', 'cream', 'darkWood'], 4),
    seg(4, ['darkWood', 'fabricRed', 'fabricRed', 'cream', 'fabricBlue', 'sage', 'sage', 'fabricRed', 'golden', 'golden', 'cream', 'fabricBlue', 'fabricBlue', 'cream', 'olive', 'sage', 'sage', 'warmRed', 'fabricRed', 'cream', 'fabricBlue', 'cream', 'cream', 'darkWood'], 4),
    // Shelf divider
    seg(4, [...rep('darkWood', 24)], 4),
    // Shelf 2 — medium books
    seg(4, ['darkWood', 'cream', 'sage', 'sage', 'fabricRed', 'cream', 'fabricBlue', 'fabricBlue', 'cream', 'golden', 'sage', 'cream', 'cream', 'fabricRed', 'fabricRed', 'olive', 'cream', 'cream', 'fabricBlue', 'sage', 'sage', 'cream', 'cream', 'darkWood'], 4),
    seg(4, ['darkWood', 'cream', 'sage', 'sage', 'fabricRed', 'cream', 'fabricBlue', 'fabricBlue', 'cream', 'golden', 'sage', 'cream', 'cream', 'fabricRed', 'fabricRed', 'olive', 'cream', 'cream', 'fabricBlue', 'sage', 'sage', 'cream', 'cream', 'darkWood'], 4),
    // Shelf divider
    seg(4, [...rep('darkWood', 24)], 4),
    // Shelf 3 — shorter books + vase
    seg(4, ['darkWood', 'cream', 'fabricBlue', 'fabricRed', 'cream', 'sage', 'sage', 'cream', 'fabricRed', 'fabricRed', 'golden', 'cream', 'fabricBlue', 'cream', 'sage', 'fabricRed', 'cream', 'ceramicWhite', 'ceramicWhite', 'fabricBlue', 'fabricBlue', 'cream', 'cream', 'darkWood'], 4),
    seg(4, ['darkWood', 'cream', 'fabricBlue', 'fabricRed', 'cream', 'sage', 'cream', 'cream', 'fabricRed', 'fabricRed', 'golden', 'cream', 'fabricBlue', 'cream', 'sage', 'fabricRed', 'cream', 'ceramicWhite', 'greenLeaf', 'fabricBlue', 'fabricBlue', 'cream', 'cream', 'darkWood'], 4),
    // Bottom frame
    seg(4, [...rep('darkWood', 24)], 4),
    // Front face
    seg(4, ['shadow2', ...rep('slatBack', 22), 'shadow2'], 4),
    seg(5, [...rep('shadow1', 22)], 5),
    // Feet
    seg(5, ['darkWood', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'darkWood'], 5),
  ]),

  // ── KITCHEN ISLAND: Large workspace with marble top ───────────────────
  kitchen_island: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Marble top
    seg(2, [...rep('darkGray', 28)], 2),
    seg(1, ['darkGray', 'highlight', ...rep('ceramicWhite', 8), ...rep('silver', 8), ...rep('ceramicWhite', 8), 'shadow2', 'darkGray'], 1),
    seg(1, ['darkGray', 'ceramicWhite', ...rep('silver', 6), ...rep('ceramicWhite', 12), ...rep('silver', 6), 'shadow2', 'darkGray'], 1),
    seg(2, [...rep('darkGray', 28)], 2),
    // Front face — wood panels with handles
    seg(2, ['shadow2', 'brown', ...rep('woodMaple', 6), 'darkWood', ...rep('woodMaple', 6), 'darkWood', ...rep('woodMaple', 6), 'darkWood', ...rep('woodMaple', 4), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('lightBrown', 3), 'brassKnob', ...rep('lightBrown', 2), 'darkWood', ...rep('lightBrown', 2), 'brassKnob', ...rep('lightBrown', 3), 'darkWood', ...rep('lightBrown', 3), 'brassKnob', ...rep('lightBrown', 2), 'darkWood', ...rep('lightBrown', 4), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('woodMaple', 6), 'darkWood', ...rep('woodMaple', 6), 'darkWood', ...rep('woodMaple', 6), 'darkWood', ...rep('woodMaple', 4), 'brown', 'shadow2'], 2),
    seg(2, ['shadow2', 'brown', ...rep('slatBack', 24), 'brown', 'shadow2'], 2),
    seg(3, [...rep('shadow1', 26)], 3),
  ]),

  // ── BAR TABLE: High table with slim top and tall legs ─────────────────
  bar_table: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    // Slim top
    seg(8, [...rep('darkWood', 16)], 8),
    seg(7, ['darkWood', 'highlight', ...rep('woodMaple', 14), 'shadow2'], 7),
    seg(7, ['darkWood', 'woodMaple', ...rep('cream', 12), 'lightBrown', 'shadow2'], 7),
    seg(7, ['darkWood', 'shadow2', ...rep('woodMaple', 14), 'shadow2'], 7),
    seg(8, [...rep('darkWood', 16)], 8),
    // Edge thickness
    seg(8, ['shadow2', ...rep('shadow1', 14), 'shadow2'], 8),
    // Very tall legs (distinctive feature)
    seg(9, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 9),
    seg(9, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 9),
    seg(10, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 10),
    seg(10, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 10),
    // Crossbar (footrest height)
    seg(9, ['brown', ...rep('darkWood', 12), 'brown'], 9),
    seg(10, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 10),
    seg(10, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 10),
    seg(11, ['shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1'], 11),
    // Floor contacts
    seg(10, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 10),
  ]),

  // ── WARDROBE: Tall closet with double doors ───────────────────────────
  wardrobe: createSprite([
    // Crown molding
    seg(3, ['darkWood', 'highlight', ...rep('slatBack', 22), 'shadow2', 'darkWood'], 3),
    seg(4, [...rep('darkWood', 24)], 4),
    // Double doors
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 9), 'darkWood', 'darkWood', ...rep('cream', 9), 'lightBrown', 'darkWood'], 4),
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 9), 'darkWood', 'darkWood', ...rep('cream', 9), 'lightBrown', 'darkWood'], 4),
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 4), 'brassKnob', ...rep('cream', 4), 'darkWood', 'darkWood', ...rep('cream', 4), 'brassKnob', ...rep('cream', 4), 'lightBrown', 'darkWood'], 4),
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 9), 'darkWood', 'darkWood', ...rep('cream', 9), 'lightBrown', 'darkWood'], 4),
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 9), 'darkWood', 'darkWood', ...rep('cream', 9), 'lightBrown', 'darkWood'], 4),
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 9), 'darkWood', 'darkWood', ...rep('cream', 9), 'lightBrown', 'darkWood'], 4),
    seg(4, ['darkWood', 'lightBrown', ...rep('cream', 9), 'darkWood', 'darkWood', ...rep('cream', 9), 'lightBrown', 'darkWood'], 4),
    // Bottom frame
    seg(4, [...rep('darkWood', 24)], 4),
    // Base with feet
    seg(4, ['shadow2', 'slatBack', ...rep('darkWood', 20), 'slatBack', 'shadow2'], 4),
    seg(4, ['shadow2', ...rep('shadow1', 22), 'shadow2'], 4),
    // Feet
    seg(5, ['darkWood', 'darkWood', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'darkWood', 'darkWood'], 5),
    seg(5, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 5),
  ]),

  // ── SHOE RACK: Low shelf with shoes visible ───────────────────────────
  shoe_rack: createSprite([
    ...Array(5).fill(new Array(SPRITE_SIZE).fill(0)),
    // Frame top
    seg(6, [...rep('darkWood', 20)], 6),
    seg(6, ['darkWood', 'highlight', ...rep('slatBack', 16), 'shadow2', 'darkWood'], 6),
    // Shelf 1 — shoes (different colors = different pairs)
    seg(6, ['darkWood', 'cream', 'darkGray', 'darkGray', 'cream', 'fabricRed', 'fabricRed', 'cream', 'cream', 'brown', 'brown', 'cream', 'fabricBlue', 'fabricBlue', 'cream', 'cream', 'darkGray', 'darkGray', 'cream', 'darkWood'], 6),
    seg(6, ['darkWood', ...rep('slatBack', 18), 'darkWood'], 6),
    // Shelf 2 — more shoes
    seg(6, ['darkWood', 'cream', 'fabricBlue', 'fabricBlue', 'cream', 'cream', 'darkGray', 'darkGray', 'cream', 'warmRed', 'warmRed', 'cream', 'cream', 'brown', 'brown', 'cream', 'fabricRed', 'fabricRed', 'cream', 'darkWood'], 6),
    seg(6, ['darkWood', ...rep('slatBack', 18), 'darkWood'], 6),
    // Bottom
    seg(6, [...rep('darkWood', 20)], 6),
    seg(6, ['shadow2', ...rep('shadow1', 18), 'shadow2'], 6),
    // Short legs
    seg(7, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 7),
    seg(7, ['shadow1', 'shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1', 'shadow1'], 7),
  ]),

  // ── UMBRELLA STAND: Cylindrical container with umbrellas ──────────────
  umbrella_stand: createSprite([
    // Row 0-3: Umbrella handles sticking out (distinctive!)
    seg(9, ['brown', 'brown', 0, 0, 'fabricBlue', 0, 0, 0, 'darkGray', 0, 0, 0, 0, 'fabricRed'], 9),
    seg(10, ['brown', 0, 0, 'fabricBlue', 0, 0, 'darkGray'], 15),
    seg(11, ['woodMaple', 0, 'fabricBlue', 0, 'darkGray'], 16),
    seg(12, ['woodMaple', 'fabricBlue', 'darkGray'], 17),
    // Container top rim
    seg(10, [...rep('darkGray', 12)], 10),
    seg(9, ['darkGray', 'highlight', ...rep('silver', 10), 'shadow2', 'darkGray'], 9),
    // Container body (cylinder)
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'midGray', ...rep('silver', 10), 'shadow2', 'darkGray'], 9),
    // Bottom
    seg(10, [...rep('darkGray', 12)], 10),
    seg(10, [...rep('shadow1', 12)], 10),
  ]),

  // ── CASH REGISTER: Modern POS terminal ────────────────────────────────
  cash_register: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Receipt paper
    seg(17, ['receiptWhite', 'receiptWhite', 'midGray'], 12),
    // Screen (angled up)
    seg(8, [...rep('darkGray', 16)], 8),
    seg(7, ['darkGray', ...rep('deepBlue', 3), ...rep('screenGlow', 4), ...rep('deepBlue', 5), 'screenGlow', 'darkGray'], 7),
    seg(7, ['darkGray', ...rep('deepBlue', 14), 'darkGray'], 7),
    seg(8, [...rep('darkGray', 16)], 8),
    // Base with touchscreen buttons
    seg(6, [...rep('darkGray', 20)], 6),
    seg(6, ['darkGray', 'silver', 'white', 'silver', 'silver', 'white', 'silver', 'silver', 'white', 'silver', 'silver', 'white', 'silver', 'silver', 'white', 'silver', 'silver', 'white', 'silver', 'darkGray'], 6),
    seg(6, ['darkGray', ...rep('silver', 18), 'darkGray'], 6),
    seg(7, [...rep('shadow1', 18)], 7),
  ]),

  // ── MENU BOARD: Standing chalkboard ───────────────────────────────────
  menu_board: createSprite([
    // Frame top
    seg(8, [...rep('darkWood', 16)], 8),
    // Chalkboard area
    seg(7, ['darkWood', ...rep('chalkGreen', 16), 'darkWood'], 7),
    seg(7, ['darkWood', 'chalkGreen', ...rep('chalkText', 3), ...rep('chalkGreen', 5), ...rep('chalkText', 4), ...rep('chalkGreen', 3), 'darkWood'], 7),
    seg(7, ['darkWood', ...rep('chalkGreen', 16), 'darkWood'], 7),
    seg(7, ['darkWood', 'chalkGreen', ...rep('chalkText', 5), ...rep('chalkGreen', 3), ...rep('chalkText', 3), ...rep('chalkGreen', 4), 'darkWood'], 7),
    seg(7, ['darkWood', ...rep('chalkGreen', 16), 'darkWood'], 7),
    seg(7, ['darkWood', 'chalkGreen', ...rep('chalkText', 2), ...rep('chalkGreen', 4), ...rep('chalkText', 6), ...rep('chalkGreen', 3), 'darkWood'], 7),
    seg(7, ['darkWood', ...rep('chalkGreen', 16), 'darkWood'], 7),
    seg(7, ['darkWood', 'chalkGreen', ...rep('golden', 4), ...rep('chalkGreen', 4), ...rep('golden', 4), ...rep('chalkGreen', 3), 'darkWood'], 7),
    // Frame bottom
    seg(8, [...rep('darkWood', 16)], 8),
    // A-frame legs (spread)
    seg(9, ['brown', 'brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown', 'brown'], 9),
    seg(8, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 8),
    seg(7, ['brown', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'brown'], 7),
    seg(7, ['shadow1', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 'shadow1'], 7),
  ]),

  // ── FLOWER POT: Small decorative pot with colorful flowers ────────────
  flower_pot: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Flowers (colorful, organic)
    seg(10, ['flowerPink', 0, 'flowerYellow', 0, 'flowerPink', 0, 'petal', 0, 'flowerYellow', 0, 'flowerPink', 0], 10),
    seg(9, ['flowerPink', 'petalDark', 'flowerYellow', 'flowerPink', 'golden', 'flowerPink', 'petalDark', 'flowerYellow', 'petal', 'flowerPink', 'petalDark', 'petal', 'flowerYellow', 'flowerPink'], 9),
    seg(10, ['greenLeaf', 'petal', 'flowerPink', 'greenLeaf', 'flowerYellow', 'petal', 'greenLeaf', 'flowerPink', 'petal', 'greenLeaf', 'petal', 'greenLeaf'], 10),
    // Stems with leaves
    seg(11, ['greenLeaf', 'sage', 'greenLeaf', 'sage', 'greenLeaf', 'sage', 'greenLeaf', 'sage', 'greenLeaf', 'sage'], 11),
    seg(12, ['sage', 'greenLeaf', 'sage', 'greenLeaf', 'sage', 'greenLeaf', 'sage', 'greenLeaf'], 12),
    seg(13, ['sage', 'greenLeaf', 'sage', 'greenLeaf', 'sage', 'greenLeaf'], 13),
    // Pot rim
    seg(10, [...rep('terracottaDark', 12)], 10),
    seg(10, ['terracottaDark', 'highlight', ...rep('potRim', 8), 'shadow2', 'terracottaDark'], 10),
    // Pot body
    seg(10, ['terracottaDark', 'warmRed', ...rep('softOrange', 4), ...rep('warmRed', 4), 'shadow2', 'terracottaDark'], 10),
    seg(11, ['terracottaDark', ...rep('warmRed', 4), ...rep('shadow2', 4), 'terracottaDark'], 11),
    seg(11, ['terracottaDark', ...rep('shadow1', 8), 'terracottaDark'], 11),
    // Pot base
    seg(12, ['terracottaDark', ...rep('shadow1', 6), 'terracottaDark'], 12),
    seg(12, [...rep('shadow1', 8)], 12),
  ]),

  // ── CEILING FAN: Viewed from below (isometric) ────────────────────────
  ceiling_fan: createSprite([
    // Rod
    seg(15, ['midGray', 'midGray'], 15),
    seg(15, ['midGray', 'midGray'], 15),
    seg(14, [...rep('midGray', 4)], 14),
    // Blades radiating outward (4 blades, X pattern)
    seg(4, [0, 0, 0, 0, 0, 0, 0, 0, 'lightBrown', 'lightBrown', 'lightBrown', 'midGray', 'midGray', 'lightBrown', 'lightBrown', 'lightBrown', 0, 0, 0, 0, 0, 0, 0, 0], 4),
    seg(2, ['lightBrown', 'lightBrown', 0, 0, 0, 0, 'lightBrown', 'lightBrown', 'lightBrown', 'woodMaple', 'lightBrown', 'midGray', 'midGray', 'lightBrown', 'woodMaple', 'lightBrown', 'lightBrown', 'lightBrown', 0, 0, 0, 0, 'lightBrown', 'lightBrown', 0, 0, 0, 0, 0, 0], 2),
    seg(4, [0, 0, 0, 0, 'lightBrown', 'lightBrown', 'lightBrown', 'cream', 'cream', 'woodMaple', 'cream', 'midGray', 'midGray', 'cream', 'woodMaple', 'cream', 'cream', 'lightBrown', 'lightBrown', 'lightBrown', 0, 0, 0, 0], 4),
    seg(6, [0, 0, 0, 0, 'lightBrown', 'cream', 'cream', 'woodMaple', 'cream', 'cream', 'cream', 'midGray', 'midGray', 'cream', 'cream', 'cream', 'woodMaple', 'cream', 'cream', 'lightBrown'], 6),
    // Center motor
    seg(10, [...rep('midGray', 4), ...rep('darkGray', 4), ...rep('midGray', 4)], 10),
    seg(6, [0, 0, 0, 0, 'lightBrown', 'cream', 'cream', 'woodMaple', 'cream', 'cream', 'cream', 'midGray', 'midGray', 'cream', 'cream', 'cream', 'woodMaple', 'cream', 'cream', 'lightBrown'], 6),
    seg(4, [0, 0, 0, 0, 'lightBrown', 'lightBrown', 'lightBrown', 'cream', 'cream', 'woodMaple', 'cream', 'midGray', 'midGray', 'cream', 'woodMaple', 'cream', 'cream', 'lightBrown', 'lightBrown', 'lightBrown', 0, 0, 0, 0], 4),
    seg(2, ['lightBrown', 'lightBrown', 0, 0, 0, 0, 'lightBrown', 'lightBrown', 'lightBrown', 'woodMaple', 'lightBrown', 'midGray', 'midGray', 'lightBrown', 'woodMaple', 'lightBrown', 'lightBrown', 'lightBrown', 0, 0, 0, 0, 'lightBrown', 'lightBrown', 0, 0, 0, 0, 0, 0], 2),
    seg(4, [0, 0, 0, 0, 0, 0, 0, 0, 'lightBrown', 'lightBrown', 'lightBrown', 'midGray', 'midGray', 'lightBrown', 'lightBrown', 'lightBrown', 0, 0, 0, 0, 0, 0, 0, 0], 4),
  ]),

  // ── RUG: Flat diamond shape with pattern ──────────────────────────────
  rug: createSprite([
    ...Array(8).fill(new Array(SPRITE_SIZE).fill(0)),
    // Isometric diamond with layered border pattern
    seg(12, [...rep('fabricRed', 8)], 12),
    seg(10, ['fabricRed', 'fabricRed', ...rep('softOrange', 8), 'fabricRed', 'fabricRed'], 10),
    seg(8, ['fabricRed', 'softOrange', 'softOrange', ...rep('golden', 8), ...rep('softOrange', 2), 'softOrange', 'fabricRed'], 8),
    seg(6, ['fabricRed', 'softOrange', 'golden', 'golden', ...rep('cream', 8), ...rep('golden', 2), 'golden', 'softOrange', 'softOrange', 'fabricRed'], 6),
    seg(4, ['fabricRed', 'softOrange', 'golden', 'cream', 'cream', ...rep('peach', 8), ...rep('cream', 4), 'golden', 'softOrange', 'softOrange', 'fabricRed'], 4),
    seg(4, ['fabricRed', 'softOrange', 'golden', 'cream', ...rep('peach', 8), ...rep('cream', 6), 'golden', 'softOrange', 'fabricRed'], 4),
    seg(6, ['fabricRed', 'softOrange', 'golden', 'golden', ...rep('cream', 8), ...rep('golden', 2), 'golden', 'softOrange', 'softOrange', 'fabricRed'], 6),
    seg(8, ['fabricRed', 'softOrange', 'softOrange', ...rep('golden', 8), ...rep('softOrange', 2), 'softOrange', 'fabricRed'], 8),
    seg(10, ['fabricRed', 'fabricRed', ...rep('softOrange', 8), 'fabricRed', 'fabricRed'], 10),
    seg(12, [...rep('fabricRed', 8)], 12),
  ]),

  // ── CURTAIN: Hanging fabric with folds ────────────────────────────────
  curtain: createSprite([
    // Rod with rings
    seg(3, [...rep('metalBrass', 26)], 3),
    seg(3, ['metalBrass', 'brassKnob', ...rep('metalBrass', 4), 'brassKnob', ...rep('metalBrass', 4), 'brassKnob', ...rep('metalBrass', 4), 'brassKnob', ...rep('metalBrass', 4), 'brassKnob', ...rep('metalBrass', 2), 'brassKnob', 'metalBrass'], 3),
    // Fabric folds with shading
    seg(3, ['fabricBlue', 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('skyBlue', 6), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('paleBlue', 3), ...rep('skyBlue', 3), 'fabricBlue', ...rep('paleBlue', 2), ...rep('skyBlue', 3), 'fabricBlue', ...rep('paleBlue', 2), ...rep('skyBlue', 3), 'fabricBlue', ...rep('paleBlue', 2), ...rep('skyBlue', 3), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('skyBlue', 6), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('skyBlue', 6), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('paleBlue', 2), ...rep('skyBlue', 4), 'fabricBlue', ...rep('paleBlue', 2), ...rep('skyBlue', 3), 'fabricBlue', ...rep('paleBlue', 2), ...rep('skyBlue', 3), 'fabricBlue', ...rep('paleBlue', 3), ...rep('skyBlue', 2), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('skyBlue', 6), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', ...rep('skyBlue', 6), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue'], 3),
    seg(3, ['fabricBlue', 'fabricBlue', ...rep('skyBlue', 5), 'fabricBlue', 'fabricBlue', ...rep('skyBlue', 4), 'fabricBlue', 'fabricBlue', ...rep('skyBlue', 4), 'fabricBlue', 'fabricBlue', ...rep('skyBlue', 4), 'fabricBlue', 'fabricBlue'], 3),
    // Hem
    seg(3, [...rep('fabricBlue', 26)], 3),
    seg(4, [...rep('shadow1', 24)], 4),
  ]),

  // ── CLOCK: Wall-hung round clock ──────────────────────────────────────
  clock: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Round frame
    seg(10, [...rep('darkWood', 12)], 10),
    seg(8, ['darkWood', 'metalBrass', ...rep('darkWood', 10), 'metalBrass', 'darkWood'], 8),
    // Clock face
    seg(7, ['darkWood', 'metalBrass', 'darkWood', 'cream', 'cream', 'darkBrown', 'cream', 'cream', 'cream', 'cream', 'cream', 'darkWood', 'metalBrass', 'darkWood'], 7),
    seg(7, ['darkWood', 'metalBrass', 'darkWood', 'cream', 'cream', 'cream', 'cream', 'cream', 'cream', 'cream', 'cream', 'darkWood', 'metalBrass', 'darkWood'], 7),
    seg(7, ['darkWood', 'metalBrass', 'darkWood', 'darkBrown', 'cream', 'cream', 'cream', 'darkBrown', 'darkBrown', 'cream', 'cream', 'darkWood', 'metalBrass', 'darkWood'], 7),
    // Hands (cross pattern from center)
    seg(7, ['darkWood', 'metalBrass', 'darkWood', 'cream', 'cream', 'cream', 'cream', 'darkBrown', 'cream', 'cream', 'cream', 'darkWood', 'metalBrass', 'darkWood'], 7),
    seg(7, ['darkWood', 'metalBrass', 'darkWood', 'cream', 'cream', 'cream', 'cream', 'cream', 'cream', 'darkBrown', 'cream', 'darkWood', 'metalBrass', 'darkWood'], 7),
    seg(8, ['darkWood', 'metalBrass', ...rep('darkWood', 10), 'metalBrass', 'darkWood'], 8),
    seg(10, [...rep('darkWood', 12)], 10),
  ]),

  // ── TRASH CAN: Cylindrical bin with foot pedal ────────────────────────
  trash_can: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // Lid with handle
    seg(12, ['midGray', ...rep('darkGray', 6), 'midGray'], 12),
    seg(10, [...rep('darkGray', 12)], 10),
    seg(9, ['darkGray', 'highlight', ...rep('midGray', 10), 'shadow2', 'darkGray'], 9),
    seg(10, [...rep('darkGray', 12)], 10),
    // Body
    seg(9, ['darkGray', 'midGray', ...rep('silver', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'silver', ...rep('lightMetal', 10), 'shadow2', 'darkGray'], 9),
    seg(9, ['darkGray', 'midGray', ...rep('silver', 10), 'shadow2', 'darkGray'], 9),
    // Bottom band
    seg(9, ['darkGray', ...rep('midGray', 12), 'darkGray'], 9),
    seg(10, [...rep('darkGray', 12)], 10),
    // Foot pedal
    seg(10, [...rep('shadow1', 12), 0, 0, 'midGray', 'midGray'], 8),
    seg(11, [...rep('shadow1', 10)], 11),
  ]),

  // ── DISPLAY CASE: Glass showcase with items ───────────────────────────
  display_case: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(4, [...rep('darkGray', 24)], 4),
    seg(3, ['darkGray', 'midGray', ...rep('darkGray', 22), 'midGray'], 3),
    // Glass with items inside
    seg(3, ['darkGray', 'midGray', ...rep('glass', 7), 'golden', 'golden', ...rep('glass', 5), ...rep('glassHighlight', 5), 'midGray', 'darkGray'], 3),
    seg(3, ['darkGray', 'midGray', ...rep('glass', 4), 'warmRed', 'warmRed', 'glass', 'golden', 'glass', ...rep('glass', 4), ...rep('glassHighlight', 4), ...rep('glass', 2), 'midGray', 'darkGray'], 3),
    seg(3, ['darkGray', 'midGray', ...rep('glass', 22), 'midGray', 'darkGray'], 3),
    seg(3, ['darkGray', 'midGray', ...rep('glass', 22), 'midGray', 'darkGray'], 3),
    seg(4, [...rep('darkGray', 24)], 4),
    // Base cabinet
    seg(4, ['shadow2', 'midGray', ...rep('silver', 20), 'midGray', 'shadow2'], 4),
    seg(4, ['shadow2', 'midGray', ...rep('silver', 20), 'midGray', 'shadow2'], 4),
    seg(5, [...rep('shadow1', 22)], 5),
  ]),

  // ── FRIDGE: Tall refrigerator with two doors ──────────────────────────
  fridge: createSprite([
    // Top
    seg(6, [...rep('lightMetal', 20)], 6),
    seg(5, ['lightMetal', 'highlight', ...rep('ceramicWhite', 18), 'shadow2', 'lightMetal'], 5),
    seg(6, [...rep('lightMetal', 20)], 6),
    // Upper door (freezer) with handle
    seg(6, ['midGray', ...rep('ceramicWhite', 16), 'brassKnob', 'silver', 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 16), 'brassKnob', 'silver', 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 18), 'midGray'], 6),
    // Divider
    seg(6, [...rep('darkGray', 20)], 6),
    // Lower door (fridge) with handle
    seg(6, ['midGray', ...rep('ceramicWhite', 16), 'brassKnob', 'silver', 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 18), 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 16), 'brassKnob', 'silver', 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 18), 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 18), 'midGray'], 6),
    seg(6, ['midGray', ...rep('ceramicWhite', 18), 'midGray'], 6),
    // Bottom
    seg(6, ['shadow2', ...rep('midGray', 18), 'shadow2'], 6),
    seg(7, [...rep('shadow1', 18)], 7),
  ]),

  // ── SINK: Kitchen/bathroom sink with faucet ───────────────────────────
  sink: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Faucet (tall curved pipe)
    seg(12, [...rep('midGray', 3), 'silver', 'silver'], 15),
    seg(12, [0, 0, 0, 'silver', 'midGray', 'silver'], 13),
    seg(12, [0, 0, 0, 0, 'silver', 'silver'], 14),
    seg(12, [0, 0, 0, 0, 0, 'silver', 'silver'], 13),
    // Basin top surface
    seg(6, [...rep('lightMetal', 20)], 6),
    seg(5, ['lightMetal', 'highlight', ...rep('ceramicWhite', 18), 'shadow2', 'lightMetal'], 5),
    // Basin hollow (visible water area)
    seg(5, ['lightMetal', 'ceramicWhite', ...rep('iceBlue', 4), ...rep('paleBlue', 4), ...rep('iceBlue', 4), ...rep('ceramicWhite', 6), 'lightMetal'], 5),
    seg(5, ['lightMetal', 'ceramicWhite', ...rep('paleBlue', 4), ...rep('iceBlue', 6), ...rep('ceramicWhite', 8), 'lightMetal'], 5),
    seg(5, ['lightMetal', 'shadow2', ...rep('ceramicWhite', 18), 'shadow2', 'lightMetal'], 5),
    seg(6, [...rep('lightMetal', 20)], 6),
    // Cabinet below
    seg(6, ['shadow2', 'midGray', ...rep('ceramicWhite', 7), 'midGray', ...rep('ceramicWhite', 7), 'midGray', 'shadow2'], 6),
    seg(6, ['shadow2', 'midGray', ...rep('ceramicWhite', 3), 'brassKnob', ...rep('ceramicWhite', 3), 'midGray', ...rep('ceramicWhite', 3), 'brassKnob', ...rep('ceramicWhite', 3), 'midGray', 'shadow2'], 6),
    seg(6, ['shadow2', 'midGray', ...rep('ceramicWhite', 16), 'midGray', 'shadow2'], 6),
    seg(7, [...rep('shadow1', 18)], 7),
  ]),
};

// Fix the showcase sprite
SPRITES.showcase = createSprite([
  ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
  seg(4, [...rep('darkGray', 24)], 4),
  seg(3, ['darkGray', 'midGray', ...rep('darkGray', 22), 'midGray'], 3),
  seg(3, ['darkGray', 'midGray', ...rep('glass', 7), 'golden', 'golden', ...rep('glass', 5), ...rep('glassHighlight', 5), 'midGray', 'darkGray'], 3),
  seg(3, ['darkGray', 'midGray', ...rep('glass', 4), 'warmRed', 'warmRed', 'glass', 'golden', 'glass', ...rep('glass', 4), ...rep('glassHighlight', 4), ...rep('glass', 2), 'midGray', 'darkGray'], 3),
  seg(3, ['darkGray', 'midGray', ...rep('glass', 22), 'midGray', 'darkGray'], 3),
  seg(3, ['darkGray', 'midGray', ...rep('glass', 22), 'midGray', 'darkGray'], 3),
  seg(4, [...rep('darkGray', 24)], 4),
  seg(4, ['shadow2', 'midGray', ...rep('silver', 20), 'midGray', 'shadow2'], 4),
  seg(4, ['shadow2', 'midGray', ...rep('silver', 20), 'midGray', 'shadow2'], 4),
  seg(5, [...rep('shadow1', 22)], 5),
  ...Array(20).fill(new Array(SPRITE_SIZE).fill(0)),
]);

// Fallback generic sprite
export const GENERIC_SPRITE: SpriteData = createSprite([
  ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
  seg(6, [...rep('midGray', 20)], 6),
  seg(5, ['midGray', 'highlight', ...rep('silver', 18), 'shadow2', 'midGray'], 5),
  seg(5, ['midGray', 'silver', ...rep('lightMetal', 18), 'shadow2', 'midGray'], 5),
  seg(5, ['midGray', 'silver', ...rep('lightMetal', 18), 'shadow2', 'midGray'], 5),
  seg(5, ['midGray', 'silver', ...rep('lightMetal', 18), 'shadow2', 'midGray'], 5),
  seg(6, [...rep('midGray', 20)], 6),
  seg(6, ['shadow2', ...rep('shadow1', 18), 'shadow2'], 6),
  seg(7, [...rep('shadow1', 18)], 7),
  ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
]);

export function getSpriteForType(type: string): SpriteData {
  if (SPRITES[type]) return SPRITES[type];
  return GENERIC_SPRITE;
}
