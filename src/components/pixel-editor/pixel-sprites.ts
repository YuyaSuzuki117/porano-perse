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

// ── Isometric Chair (32x32): viewed from 45deg ──
export const SPRITES: Record<string, SpriteData> = {
  chair: createSprite([
    seg(10,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],10),
    seg(9,['darkBrown','highlight','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown','darkBrown'],9),
    seg(8,['darkBrown','brown','highlight','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','brown','darkBrown','darkBrown'],8),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','shadow2','darkBrown'],9),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','shadow2','darkBrown'],10),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','shadow2','darkBrown'],10),
    seg(8,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],10),
    seg(7,['shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2'],10),
    seg(4,[...rep('darkBrown',24)],4),
    seg(3,['darkBrown','highlight',...rep('cream',20),'brown','darkBrown'],3),
    seg(3,['darkBrown','brown',...rep('peach',20),'shadow2','brown','darkBrown'],3),
    seg(3,['darkBrown','brown','cream',...rep('peach',18),'shadow2','brown','darkBrown'],3),
    seg(4,['darkBrown','brown',...rep('cream',20),'shadow2','darkBrown'],4),
    seg(5,[...rep('darkBrown',22)],5),
    seg(5,['darkBrown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'darkBrown'],5),
    seg(5,['darkBrown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'darkBrown'],5),
    seg(6,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],6),
    seg(6,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],6),
    seg(6,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],6),
    seg(6,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],6),
    ...Array(12).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  table_square: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(6,[...rep('darkBrown',20)],6),
    seg(4,['darkBrown','highlight',...rep('lightBrown',20),'brown','darkBrown'],4),
    seg(3,['darkBrown','brown','highlight',...rep('cream',20),'lightBrown','shadow2','darkBrown'],3),
    seg(2,['darkBrown','brown','lightBrown',...rep('cream',22),'lightBrown','shadow2','darkBrown'],2),
    seg(2,['darkBrown','brown','lightBrown',...rep('cream',22),'shadow2','brown','darkBrown'],2),
    seg(3,['darkBrown','brown','lightBrown',...rep('cream',20),'shadow2','brown','darkBrown'],3),
    seg(4,['darkBrown','brown',...rep('lightBrown',20),'shadow2','darkBrown'],4),
    seg(6,[...rep('darkBrown',20)],6),
    seg(6,['shadow2',...rep('shadow1',18),'shadow2'],6),
    seg(7,[...rep('shadow1',18)],7),
    seg(7,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],7),
    seg(7,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],7),
    seg(8,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],8),
    seg(8,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],8),
    seg(9,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],9),
    seg(9,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],9),
    ...Array(12).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  table_round: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(9,[...rep('darkBrown',14)],9),
    seg(6,['darkBrown','highlight',...rep('lightBrown',16),'brown','darkBrown'],6),
    seg(4,['darkBrown','brown','highlight',...rep('cream',18),'shadow2','brown'],4),
    seg(3,['darkBrown','brown',...rep('cream',22),'shadow2','darkBrown'],3),
    seg(3,['darkBrown','brown',...rep('cream',22),'shadow2','darkBrown'],3),
    seg(4,['darkBrown','brown','lightBrown',...rep('cream',18),'shadow2','brown'],4),
    seg(6,['darkBrown','brown',...rep('lightBrown',16),'shadow2','darkBrown'],6),
    seg(9,[...rep('darkBrown',14)],9),
    seg(9,['shadow2',...rep('shadow1',12),'shadow2'],9),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(13,[...rep('shadow1',6)],13),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  sofa: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(2,[...rep('darkBrown',28)],2),
    seg(1,['darkBrown','brown',...rep('softOrange',26),'brown','darkBrown'],1),
    seg(1,['darkBrown','brown','softOrange',...rep('peach',24),'softOrange','brown','darkBrown'],1),
    seg(1,['darkBrown','brown','softOrange',...rep('peach',24),'softOrange','brown','darkBrown'],1),
    seg(1,['darkBrown','brown',...rep('softOrange',26),'brown','darkBrown'],1),
    seg(2,[...rep('darkBrown',28)],2),
    seg(2,['brown',...rep('cream',26),'brown'],2),
    seg(2,['brown','cream',...rep('highlight',24),'cream','brown'],2),
    seg(2,['brown',...rep('cream',26),'brown'],2),
    seg(2,[...rep('darkBrown',28)],2),
    seg(2,['shadow2',...rep('shadow1',26),'shadow2'],2),
    seg(3,[...rep('shadow1',26)],3),
    seg(3,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],3),
    seg(3,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],3),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  counter: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(4,[...rep('darkBrown',24)],4),
    seg(3,['darkBrown','highlight',...rep('golden',22),'shadow2','darkBrown'],3),
    seg(3,['darkBrown','brown','highlight',...rep('cream',20),'shadow2','brown','darkBrown'],3),
    seg(3,['darkBrown','brown',...rep('golden',22),'shadow2','darkBrown'],3),
    seg(4,[...rep('darkBrown',24)],4),
    seg(4,['shadow2','brown',...rep('brown',20),'brown','shadow2'],4),
    seg(4,['shadow2','brown',...rep('darkBrown',20),'brown','shadow2'],4),
    seg(4,['shadow2','brown',...rep('darkBrown',20),'brown','shadow2'],4),
    seg(4,['shadow2','brown',...rep('brown',20),'brown','shadow2'],4),
    seg(5,[...rep('shadow1',22)],5),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  plant: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(10,['olive','olive','olive','sage','sage','sage','olive','olive','sage','sage','olive','olive'],10),
    seg(8,['olive',...rep('sage',14),'olive'],8),
    seg(7,['olive',...rep('sage',16),'olive'],7),
    seg(6,['olive','sage','sage','sage','sage','mint','sage','sage','sage','sage','sage','sage','mint','sage','sage','sage','sage','sage','sage','olive'],6),
    seg(6,['olive',...rep('sage',18),'olive'],6),
    seg(7,['olive',...rep('sage',16),'olive'],7),
    seg(8,['olive',...rep('sage',14),'olive'],8),
    seg(9,['olive','olive',...rep('sage',10),'olive','olive'],9),
    seg(11,['olive','olive',...rep('sage',6),'olive','olive'],11),
    seg(13,['olive',...rep('brown',4),'olive'],13),
    seg(14,[...rep('brown',4)],14),
    seg(10,[...rep('darkBrown',12)],10),
    seg(10,['darkBrown',...rep('warmRed',10),'darkBrown'],10),
    seg(11,['darkBrown',...rep('warmRed',8),'darkBrown'],11),
    seg(11,['darkBrown',...rep('shadow1',8),'darkBrown'],11),
    seg(12,['darkBrown',...rep('shadow1',6),'darkBrown'],12),
    seg(12,[...rep('darkBrown',8)],12),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  shelf: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(4,[...rep('darkBrown',24)],4),
    seg(4,['darkBrown','brown',...rep('cream',20),'brown','darkBrown'],4),
    seg(4,['darkBrown','brown','cream','skyBlue','skyBlue','cream','cream','warmRed','warmRed','cream','cream','cream','sage','cream','cream','cream','cream','lavender','cream','cream','cream','cream','brown','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    seg(4,['darkBrown','brown','cream','cream','sage','cream','cream','cream','cream','golden','golden','cream','cream','cream','cream','cream','cream','cream','softOrange','cream','cream','cream','brown','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    seg(4,['darkBrown','brown','cream','cream','cream','cream','warmRed','cream','cream','cream','cream','skyBlue','skyBlue','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    seg(4,['shadow2','brown',...rep('brown',20),'shadow2'],4),
    seg(4,['shadow2',...rep('darkBrown',22),'shadow2'],4),
    seg(4,['shadow2',...rep('darkBrown',22),'shadow2'],4),
    seg(5,[...rep('shadow1',22)],5),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  pendant_light: createSprite([
    seg(15,['midGray','midGray'],15),
    seg(15,['midGray','midGray'],15),
    seg(15,['midGray','midGray'],15),
    seg(14,[...rep('midGray',4)],14),
    seg(12,[...rep('golden',8)],12),
    seg(10,[...rep('golden',12)],10),
    seg(9,['golden','golden',...rep('highlight',10),'golden','golden'],9),
    seg(9,['golden','golden',...rep('highlight',10),'golden','golden'],9),
    seg(10,[...rep('golden',12)],10),
    seg(12,[...rep('golden',8)],12),
    ...Array(22).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  register: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(8,[...rep('darkGray',16)],8),
    seg(7,['darkGray',...rep('midGray',14),'darkGray'],7),
    seg(7,['darkGray','midGray',...rep('skyBlue',12),'midGray','darkGray'],7),
    seg(7,['darkGray',...rep('midGray',14),'darkGray'],7),
    seg(8,[...rep('darkGray',16)],8),
    seg(8,['shadow2',...rep('silver',14),'shadow2'],8),
    seg(8,['shadow2','silver','white','white','silver','white','white','silver','white','white','silver','white','white','silver','silver','shadow2'],8),
    seg(8,['shadow2',...rep('silver',14),'shadow2'],8),
    seg(9,[...rep('shadow1',14)],9),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  stool: createSprite([
    ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(9,[...rep('darkGray',14)],9),
    seg(8,['darkGray','highlight',...rep('silver',11),'shadow2','darkGray'],8),
    seg(8,['darkGray','midGray',...rep('silver',11),'shadow2','darkGray'],8),
    seg(9,[...rep('darkGray',14)],9),
    seg(10,['midGray','midGray',0,0,0,0,0,0,0,0,'midGray','midGray'],10),
    seg(10,['midGray',0,0,0,0,0,0,0,0,0,0,'midGray'],10),
    seg(9,['midGray',0,0,0,0,0,0,0,0,0,0,0,0,'midGray'],9),
    seg(9,['midGray',0,0,0,0,0,0,0,0,0,0,0,0,'midGray'],9),
    seg(8,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],8),
    seg(8,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],8),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  partition: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(2,[...rep('darkBrown',28)],2),
    seg(2,['darkBrown','highlight',...rep('cream',25),'shadow2'],2),
    seg(2,['darkBrown',...rep('cream',26),'shadow2'],2),
    seg(2,['darkBrown',...rep('cream',26),'shadow2'],2),
    seg(2,['darkBrown',...rep('cream',26),'shadow2'],2),
    seg(2,['darkBrown',...rep('cream',26),'shadow2'],2),
    seg(2,['darkBrown',...rep('cream',26),'shadow2'],2),
    seg(2,[...rep('darkBrown',28)],2),
    seg(2,['shadow2',...rep('shadow1',26),'shadow2'],2),
    seg(3,[...rep('shadow1',26)],3),
    seg(3,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],3),
    seg(3,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],3),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ══════════════════════════════════════════════════════════════
  // NEW SPRITES (25 additional furniture types)
  // ══════════════════════════════════════════════════════════════

  // ── Bench: long wooden bench with seat and legs ──
  bench: createSprite([
    ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
    // Seat top
    seg(2,[...rep('darkBrown',28)],2),
    seg(1,['darkBrown','highlight',...rep('lightBrown',26),'brown','darkBrown'],1),
    seg(1,['darkBrown','brown','lightBrown',...rep('cream',24),'shadow2','brown'],1),
    seg(1,['darkBrown','brown',...rep('lightBrown',26),'shadow2','darkBrown'],1),
    seg(2,[...rep('darkBrown',28)],2),
    // Seat edge thickness
    seg(2,['shadow2',...rep('shadow1',26),'shadow2'],2),
    seg(3,[...rep('shadow1',26)],3),
    // Legs
    seg(3,['brown','brown',0,0,0,0,0,0,0,0,0,0,'brown','brown',0,0,0,0,0,0,0,0,0,0,'brown','brown'],3),
    seg(3,['brown','brown',0,0,0,0,0,0,0,0,0,0,'brown','brown',0,0,0,0,0,0,0,0,0,0,'brown','brown'],3),
    seg(3,['shadow1','shadow1',0,0,0,0,0,0,0,0,0,0,'shadow1','shadow1',0,0,0,0,0,0,0,0,0,0,'shadow1','shadow1'],3),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Mirror: oval wall-hung mirror with frame ──
  mirror: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(10,[...rep('darkBrown',12)],10),
    seg(8,['darkBrown','brown',...rep('darkBrown',10),'brown','darkBrown'],8),
    seg(7,['darkBrown','brown','darkBrown',...rep('paleBlue',8),'darkBrown','brown','darkBrown'],7),
    seg(6,['darkBrown','brown','darkBrown',...rep('paleBlue',4),...rep('glassHighlight',4),...rep('paleBlue',2),'darkBrown','brown','darkBrown'],6),
    seg(6,['darkBrown','brown','darkBrown',...rep('paleBlue',3),...rep('glassHighlight',4),...rep('paleBlue',3),'darkBrown','brown','darkBrown'],6),
    seg(6,['darkBrown','brown','darkBrown',...rep('glass',4),...rep('paleBlue',4),...rep('glass',2),'darkBrown','brown','darkBrown'],6),
    seg(6,['darkBrown','brown','darkBrown',...rep('glass',10),'darkBrown','brown','darkBrown'],6),
    seg(6,['darkBrown','brown','darkBrown',...rep('glass',10),'darkBrown','brown','darkBrown'],6),
    seg(7,['darkBrown','brown','darkBrown',...rep('glass',8),'darkBrown','brown','darkBrown'],7),
    seg(8,['darkBrown','brown',...rep('darkBrown',10),'brown','darkBrown'],8),
    seg(10,[...rep('darkBrown',12)],10),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Reception Desk: L-shaped counter ──
  reception_desk: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top surface
    seg(2,[...rep('darkBrown',28)],2),
    seg(1,['darkBrown','brown',...rep('lightBrown',26),'brown','darkBrown'],1),
    seg(1,['darkBrown','brown','lightBrown',...rep('cream',24),'lightBrown','brown'],1),
    seg(1,['darkBrown','brown',...rep('lightBrown',26),'brown','darkBrown'],1),
    seg(2,[...rep('darkBrown',28)],2),
    // Front face - L shape
    seg(2,['shadow2','brown',...rep('lightBrown',14),...rep('brown',12),'shadow2'],2),
    seg(2,['shadow2','brown',...rep('darkBrown',14),'brown',...rep('darkBrown',10),'shadow2'],2),
    seg(2,['shadow2','brown',...rep('darkBrown',14),'brown',...rep('darkBrown',10),'shadow2'],2),
    seg(2,['shadow2','brown',...rep('darkBrown',14),'brown',...rep('darkBrown',10),'shadow2'],2),
    seg(2,['shadow2','brown',...rep('brown',14),'brown',...rep('brown',10),'shadow2'],2),
    seg(3,[...rep('shadow1',26)],3),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── TV Monitor: thin screen on stand ──
  tv_monitor: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    // Screen frame
    seg(4,[...rep('darkGray',24)],4),
    seg(3,['darkGray','darkMetal',...rep('darkGray',20),'darkMetal','darkGray'],3),
    seg(3,['darkGray','darkMetal',...rep('deepBlue',20),'darkMetal','darkGray'],3),
    seg(3,['darkGray','darkMetal',...rep('deepBlue',5),...rep('skyBlue',10),...rep('deepBlue',5),'darkMetal','darkGray'],3),
    seg(3,['darkGray','darkMetal',...rep('deepBlue',20),'darkMetal','darkGray'],3),
    seg(3,['darkGray','darkMetal',...rep('skyBlue',4),...rep('deepBlue',12),...rep('skyBlue',4),'darkMetal','darkGray'],3),
    seg(3,['darkGray','darkMetal',...rep('deepBlue',20),'darkMetal','darkGray'],3),
    seg(3,['darkGray','darkMetal',...rep('deepBlue',20),'darkMetal','darkGray'],3),
    seg(4,[...rep('darkGray',24)],4),
    // Stand neck
    seg(13,[...rep('darkGray',6)],13),
    seg(13,[...rep('darkGray',6)],13),
    // Stand base
    seg(10,[...rep('darkGray',12)],10),
    seg(10,['darkGray',...rep('midGray',10),'darkGray'],10),
    seg(11,[...rep('shadow1',10)],11),
    ...Array(17).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Washing Machine: drum-style ──
  washing_machine: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top
    seg(6,[...rep('lightMetal',20)],6),
    seg(5,['lightMetal',...rep('silver',20),'lightMetal'],5),
    seg(5,['lightMetal',...rep('silver',20),'lightMetal'],5),
    seg(6,[...rep('lightMetal',20)],6),
    // Front face
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(6,['midGray','silver','silver',...rep('glass',5),...rep('glassHighlight',3),...rep('glass',4),'silver','silver','silver','midGray'],6),
    seg(6,['midGray','silver',...rep('glass',5),...rep('iceBlue',4),...rep('glass',5),'silver','midGray'],6),
    seg(6,['midGray','silver','silver',...rep('glass',5),...rep('iceBlue',3),...rep('glass',5),'silver','midGray'],6),
    seg(6,['midGray','silver','silver',...rep('glass',14),'silver','midGray'],6),
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(7,[...rep('shadow1',18)],7),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Coat Rack: pole with hooks ──
  coat_rack: createSprite([
    // Top hooks (spread out)
    seg(8,['brown',0,0,0,0,0,'brown',0,0,0,0,0,0,0,0,'brown'],8),
    seg(9,['brown',0,0,0,0,'brown',0,0,0,0,0,0,0,'brown'],9),
    seg(10,['brown',0,0,0,'brown',0,0,0,0,0,0,'brown'],10),
    seg(11,['brown',0,0,'darkBrown','darkBrown',0,0,0,0,'brown'],11),
    seg(12,['brown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','brown'],12),
    // Pole
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('brown',4)],14),
    seg(14,[...rep('shadow1',4)],14),
    // Base
    seg(11,[...rep('darkBrown',10)],11),
    seg(11,['darkBrown',...rep('brown',8),'darkBrown'],11),
    seg(12,[...rep('shadow1',8)],12),
    ...Array(15).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Air Conditioner: wall-mounted unit ──
  air_conditioner: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top frame
    seg(4,[...rep('lightMetal',24)],4),
    seg(3,['lightMetal',...rep('silver',24),'lightMetal'],3),
    // Vents
    seg(3,['lightMetal','silver',...rep('midGray',1),...rep('silver',2),...rep('midGray',1),...rep('silver',2),...rep('midGray',1),...rep('silver',2),...rep('midGray',1),...rep('silver',2),...rep('midGray',1),...rep('silver',2),...rep('midGray',1),...rep('silver',2),...rep('midGray',1),...rep('silver',2),...rep('midGray',1),'lightMetal'],3),
    seg(3,['lightMetal','silver',...alt('midGray','silver',22),'lightMetal'],3),
    seg(3,['lightMetal',...rep('silver',24),'lightMetal'],3),
    // Bottom panel with air outlet
    seg(4,['lightMetal',...rep('midGray',22),'lightMetal'],4),
    seg(4,[...rep('lightMetal',24)],4),
    // Bottom edge shadow
    seg(5,[...rep('shadow1',22)],5),
    ...Array(22).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Desk: office desk with drawer ──
  desk: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // Desk top
    seg(4,[...rep('darkBrown',24)],4),
    seg(3,['darkBrown','brown',...rep('lightBrown',22),'brown','darkBrown'],3),
    seg(2,['darkBrown','brown','lightBrown',...rep('lightWood',22),'lightBrown','brown','darkBrown'],2),
    seg(2,['darkBrown','brown','lightBrown',...rep('lightWood',22),'lightBrown','brown','darkBrown'],2),
    seg(3,['darkBrown','brown',...rep('lightBrown',22),'brown','darkBrown'],3),
    seg(4,[...rep('darkBrown',24)],4),
    // Front face with drawers
    seg(4,['shadow2','brown',...rep('lightBrown',20),'brown','shadow2'],4),
    seg(4,['shadow2','brown','lightBrown','darkBrown',...rep('lightBrown',7),'darkBrown','darkBrown',...rep('lightBrown',7),'darkBrown','lightBrown','brown','shadow2'],4),
    seg(4,['shadow2','brown','lightBrown','darkBrown',...rep('lightBrown',3),'midGray',...rep('lightBrown',3),'darkBrown','darkBrown',...rep('lightBrown',3),'midGray',...rep('lightBrown',3),'darkBrown','lightBrown','brown','shadow2'],4),
    seg(4,['shadow2','brown','lightBrown','darkBrown',...rep('lightBrown',7),'darkBrown','darkBrown',...rep('lightBrown',7),'darkBrown','lightBrown','brown','shadow2'],4),
    seg(4,['shadow2','brown',...rep('lightBrown',20),'brown','shadow2'],4),
    seg(5,[...rep('shadow1',22)],5),
    // Legs
    seg(5,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],5),
    seg(5,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],5),
    ...Array(12).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Bookcase: tall shelf packed with books ──
  bookcase: createSprite([
    // Top frame
    seg(4,[...rep('darkBrown',24)],4),
    // Shelf 1 (top)
    seg(4,['darkBrown',...rep('cream',22),'darkBrown'],4),
    seg(4,['darkBrown','cream','fabricRed','fabricRed','fabricBlue','sage','sage','fabricRed','golden','golden','cream','fabricBlue','fabricBlue','cream','olive','sage','sage','fabricRed','fabricRed','cream','fabricBlue','cream','cream','darkBrown'],4),
    seg(4,['darkBrown','cream','fabricRed','fabricRed','fabricBlue','sage','sage','fabricRed','golden','golden','cream','fabricBlue','fabricBlue','cream','olive','sage','sage','fabricRed','fabricRed','cream','fabricBlue','cream','cream','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    // Shelf 2 (middle)
    seg(4,['darkBrown',...rep('cream',22),'darkBrown'],4),
    seg(4,['darkBrown','cream','sage','sage','fabricRed','cream','fabricBlue','fabricBlue','cream','golden','sage','cream','cream','fabricRed','fabricRed','olive','cream','cream','fabricBlue','sage','sage','cream','cream','darkBrown'],4),
    seg(4,['darkBrown','cream','sage','sage','fabricRed','cream','fabricBlue','fabricBlue','cream','golden','sage','cream','cream','fabricRed','fabricRed','olive','cream','cream','fabricBlue','sage','sage','cream','cream','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    // Shelf 3 (bottom)
    seg(4,['darkBrown',...rep('cream',22),'darkBrown'],4),
    seg(4,['darkBrown','cream','fabricBlue','fabricRed','cream','sage','sage','cream','fabricRed','fabricRed','golden','cream','fabricBlue','cream','sage','fabricRed','cream','cream','olive','fabricBlue','fabricBlue','cream','cream','darkBrown'],4),
    seg(4,['darkBrown','cream','fabricBlue','fabricRed','cream','sage','sage','cream','fabricRed','fabricRed','golden','cream','fabricBlue','cream','sage','fabricRed','cream','cream','olive','fabricBlue','fabricBlue','cream','cream','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    // Front face
    seg(4,['shadow2','brown',...rep('brown',20),'shadow2'],4),
    seg(4,['shadow2',...rep('darkBrown',22),'shadow2'],4),
    seg(4,['shadow2',...rep('darkBrown',22),'shadow2'],4),
    seg(5,[...rep('shadow1',22)],5),
    ...Array(15).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Kitchen Island: large kitchen workspace ──
  kitchen_island: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Top surface (marble-like)
    seg(2,[...rep('darkGray',28)],2),
    seg(1,['darkGray','midGray',...rep('silver',24),...rep('midGray',1),'darkGray'],1),
    seg(1,['darkGray','midGray','silver',...rep('lightMetal',6),...rep('silver',12),...rep('lightMetal',4),'silver','midGray','darkGray'],1),
    seg(1,['darkGray','midGray',...rep('silver',24),...rep('midGray',1),'darkGray'],1),
    seg(2,[...rep('darkGray',28)],2),
    // Front face (wood panels)
    seg(2,['shadow2','brown',...rep('lightBrown',24),'brown','shadow2'],2),
    seg(2,['shadow2','brown',...rep('darkBrown',24),'brown','shadow2'],2),
    seg(2,['shadow2','brown',...rep('darkBrown',24),'brown','shadow2'],2),
    seg(2,['shadow2','brown',...rep('darkBrown',24),'brown','shadow2'],2),
    seg(2,['shadow2','brown',...rep('lightBrown',24),'brown','shadow2'],2),
    seg(3,[...rep('shadow1',26)],3),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Bar Table: high table with slim top ──
  bar_table: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Slim top
    seg(8,[...rep('darkBrown',16)],8),
    seg(7,['darkBrown','brown',...rep('lightBrown',14),'brown'],7),
    seg(7,['darkBrown','brown','lightBrown',...rep('cream',12),'lightBrown','brown'],7),
    seg(7,['darkBrown','brown',...rep('lightBrown',14),'brown'],7),
    seg(8,[...rep('darkBrown',16)],8),
    // Edge
    seg(8,['shadow2',...rep('shadow1',14),'shadow2'],8),
    // Tall legs
    seg(9,['brown',0,0,0,0,0,0,0,0,0,0,0,0,'brown'],9),
    seg(9,['brown',0,0,0,0,0,0,0,0,0,0,0,0,'brown'],9),
    seg(10,['brown',0,0,0,0,0,0,0,0,0,0,'brown'],10),
    seg(10,['brown',0,0,0,0,0,0,0,0,0,0,'brown'],10),
    seg(10,['brown',0,0,0,0,0,0,0,0,0,0,'brown'],10),
    seg(11,['brown',0,0,0,0,0,0,0,0,'brown'],11),
    seg(11,['brown',0,0,0,0,0,0,0,0,'brown'],11),
    seg(11,['shadow1',0,0,0,0,0,0,0,0,'shadow1'],11),
    // Base ring
    seg(10,[...rep('shadow1',12)],10),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Wardrobe: tall closet with double doors ──
  wardrobe: createSprite([
    // Top edge
    seg(4,[...rep('darkBrown',24)],4),
    seg(3,['darkBrown','brown',...rep('lightBrown',22),'brown','darkBrown'],3),
    seg(4,[...rep('darkBrown',24)],4),
    // Door panels
    seg(4,['darkBrown','lightBrown',...rep('cream',9),'darkBrown','darkBrown',...rep('cream',9),'lightBrown','darkBrown'],4),
    seg(4,['darkBrown','lightBrown',...rep('cream',9),'darkBrown','darkBrown',...rep('cream',9),'lightBrown','darkBrown'],4),
    seg(4,['darkBrown','lightBrown',...rep('cream',4),'midGray',...rep('cream',4),'darkBrown','darkBrown',...rep('cream',4),'midGray',...rep('cream',4),'lightBrown','darkBrown'],4),
    seg(4,['darkBrown','lightBrown',...rep('cream',9),'darkBrown','darkBrown',...rep('cream',9),'lightBrown','darkBrown'],4),
    seg(4,['darkBrown','lightBrown',...rep('cream',9),'darkBrown','darkBrown',...rep('cream',9),'lightBrown','darkBrown'],4),
    seg(4,['darkBrown','lightBrown',...rep('cream',9),'darkBrown','darkBrown',...rep('cream',9),'lightBrown','darkBrown'],4),
    seg(4,[...rep('darkBrown',24)],4),
    // Front face lower
    seg(4,['shadow2','brown',...rep('darkBrown',20),'brown','shadow2'],4),
    seg(4,['shadow2','brown',...rep('darkBrown',20),'brown','shadow2'],4),
    seg(5,[...rep('shadow1',22)],5),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Shoe Rack: low shelf with shoes ──
  shoe_rack: createSprite([
    ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
    // Frame top
    seg(6,[...rep('darkBrown',20)],6),
    // Shelf 1
    seg(6,['darkBrown','cream','darkBrown','darkBrown','cream','fabricRed','fabricRed','cream','darkGray','darkGray','cream','cream','fabricBlue','fabricBlue','cream','brown','brown','cream','cream','darkBrown'],6),
    seg(6,[...rep('darkBrown',20)],6),
    // Shelf 2
    seg(6,['darkBrown','cream','fabricBlue','fabricBlue','cream','cream','darkGray','darkGray','cream','fabricRed','fabricRed','cream','brown','brown','cream','cream','darkBrown','darkBrown','cream','darkBrown'],6),
    seg(6,[...rep('darkBrown',20)],6),
    // Front edge
    seg(6,['shadow2',...rep('shadow1',18),'shadow2'],6),
    seg(7,[...rep('shadow1',18)],7),
    // Short legs
    seg(7,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],7),
    seg(7,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],7),
    ...Array(17).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Umbrella Stand: cylindrical container ──
  umbrella_stand: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Umbrella handles sticking out
    seg(10,['brown',0,0,'midGray',0,0,0,0,'darkBrown',0,0,0],10),
    seg(11,['brown',0,'midGray',0,0,0,'darkBrown'],11),
    seg(12,['brown','midGray',0,0,'darkBrown'],12),
    // Container top rim
    seg(10,[...rep('darkGray',12)],10),
    seg(9,['darkGray',...rep('midGray',12),'darkGray'],9),
    // Container body
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('midGray',12),'darkGray'],9),
    // Bottom
    seg(10,[...rep('darkGray',12)],10),
    seg(10,[...rep('shadow1',12)],10),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Cash Register: modern POS terminal ──
  cash_register: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // Screen (angled)
    seg(8,[...rep('darkGray',16)],8),
    seg(7,['darkGray',...rep('deepBlue',14),'darkGray'],7),
    seg(7,['darkGray','deepBlue',...rep('skyBlue',6),...rep('deepBlue',6),'darkGray'],7),
    seg(7,['darkGray',...rep('deepBlue',14),'darkGray'],7),
    seg(8,[...rep('darkGray',16)],8),
    // Base with buttons
    seg(6,[...rep('darkGray',20)],6),
    seg(6,['darkGray',...rep('silver',4),...rep('darkGray',2),...rep('silver',4),...rep('darkGray',2),...rep('silver',4),'darkGray'],6),
    seg(6,['darkGray',...rep('silver',18),'darkGray'],6),
    seg(7,[...rep('shadow1',18)],7),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Menu Board: standing chalkboard ──
  menu_board: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    // Frame top
    seg(8,[...rep('darkBrown',16)],8),
    // Board area (dark green chalkboard)
    seg(7,['darkBrown',...rep('darkGreen',16),'darkBrown'],7),
    seg(7,['darkBrown','darkGreen',...rep('cream',2),...rep('darkGreen',4),...rep('cream',3),...rep('darkGreen',5),'darkBrown'],7),
    seg(7,['darkBrown',...rep('darkGreen',16),'darkBrown'],7),
    seg(7,['darkBrown','darkGreen',...rep('cream',4),...rep('darkGreen',3),...rep('cream',5),...rep('darkGreen',2),'darkBrown'],7),
    seg(7,['darkBrown',...rep('darkGreen',16),'darkBrown'],7),
    seg(7,['darkBrown','darkGreen',...rep('cream',3),...rep('darkGreen',6),...rep('cream',2),...rep('darkGreen',3),'darkBrown'],7),
    seg(7,['darkBrown',...rep('darkGreen',16),'darkBrown'],7),
    seg(8,[...rep('darkBrown',16)],8),
    // Legs (A-frame)
    seg(9,['brown','brown',0,0,0,0,0,0,0,0,0,0,'brown','brown'],9),
    seg(8,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],8),
    seg(7,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],7),
    seg(7,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],7),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Flower Pot: small decorative pot with flowers ──
  flower_pot: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Flowers
    seg(10,['petal',0,'petal',0,'petal',0,'petal',0,'petal',0,0,'petal'],10),
    seg(9,['petal','petal','petalDark','petal','golden','petal','petalDark','petal','petal',0,'petal','petal','petalDark','petal'],9),
    seg(10,['greenLeaf','petal','petal','greenLeaf','petal','petal','greenLeaf','petal','petal','greenLeaf','petal','greenLeaf'],10),
    // Stems
    seg(11,['greenLeaf','greenLeaf','sage','greenLeaf','greenLeaf','sage','greenLeaf','greenLeaf','sage','greenLeaf'],11),
    seg(12,['sage','greenLeaf','sage','greenLeaf','sage','greenLeaf','sage','greenLeaf'],12),
    seg(13,['sage','greenLeaf','sage','greenLeaf','sage','greenLeaf'],13),
    // Pot
    seg(10,[...rep('darkBrown',12)],10),
    seg(10,['darkBrown',...rep('warmRed',10),'darkBrown'],10),
    seg(10,['darkBrown','warmRed',...rep('softOrange',4),...rep('warmRed',4),'warmRed','darkBrown'],10),
    seg(11,['darkBrown',...rep('warmRed',8),'darkBrown'],11),
    seg(11,['darkBrown',...rep('shadow1',8),'darkBrown'],11),
    seg(12,['darkBrown',...rep('shadow1',6),'darkBrown'],12),
    seg(12,[...rep('darkBrown',8)],12),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Ceiling Fan: seen from below at isometric angle ──
  ceiling_fan: createSprite([
    seg(15,['midGray','midGray'],15),
    seg(15,['midGray','midGray'],15),
    seg(14,[...rep('midGray',4)],14),
    // Blades radiating outward
    seg(4,[0,0,0,0,0,0,0,0,'lightBrown','lightBrown','lightBrown','midGray','midGray','lightBrown','lightBrown','lightBrown',0,0,0,0,0,0,0,0],4),
    seg(2,['lightBrown','lightBrown',0,0,0,0,'lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','midGray','midGray','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown',0,0,0,0,'lightBrown','lightBrown',0,0,0,0,0,0],2),
    seg(4,[0,0,0,0,'lightBrown','lightBrown','lightBrown','cream','cream','cream','cream','midGray','midGray','cream','cream','cream','cream','lightBrown','lightBrown','lightBrown',0,0,0,0],4),
    seg(6,[0,0,0,0,'lightBrown','cream','cream','cream','cream','cream','cream','midGray','midGray','cream','cream','cream','cream','cream','cream','lightBrown'],6),
    // Center motor housing
    seg(10,[...rep('midGray',4),...rep('darkGray',4),...rep('midGray',4)],10),
    seg(6,[0,0,0,0,'lightBrown','cream','cream','cream','cream','cream','cream','midGray','midGray','cream','cream','cream','cream','cream','cream','lightBrown'],6),
    seg(4,[0,0,0,0,'lightBrown','lightBrown','lightBrown','cream','cream','cream','cream','midGray','midGray','cream','cream','cream','cream','lightBrown','lightBrown','lightBrown',0,0,0,0],4),
    seg(2,['lightBrown','lightBrown',0,0,0,0,'lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','midGray','midGray','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown',0,0,0,0,'lightBrown','lightBrown',0,0,0,0,0,0],2),
    seg(4,[0,0,0,0,0,0,0,0,'lightBrown','lightBrown','lightBrown','midGray','midGray','lightBrown','lightBrown','lightBrown',0,0,0,0,0,0,0,0],4),
    ...Array(20).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Rug: flat diamond shape on floor ──
  rug: createSprite([
    ...Array(8).fill(new Array(SPRITE_SIZE).fill(0)),
    // Flat isometric diamond
    seg(12,[...rep('fabricRed',8)],12),
    seg(10,['fabricRed','fabricRed',...rep('softOrange',8),'fabricRed','fabricRed'],10),
    seg(8,['fabricRed','softOrange','softOrange',...rep('golden',8),...rep('softOrange',2),'softOrange','fabricRed'],8),
    seg(6,['fabricRed','softOrange','golden','golden',...rep('cream',8),...rep('golden',2),'golden','softOrange','softOrange','fabricRed'],6),
    seg(4,['fabricRed','softOrange','golden','cream','cream',...rep('peach',8),...rep('cream',4),'golden','softOrange','softOrange','fabricRed'],4),
    seg(4,['fabricRed','softOrange','golden','cream',...rep('peach',8),...rep('cream',6),'golden','softOrange','fabricRed'],4),
    seg(6,['fabricRed','softOrange','golden','golden',...rep('cream',8),...rep('golden',2),'golden','softOrange','softOrange','fabricRed'],6),
    seg(8,['fabricRed','softOrange','softOrange',...rep('golden',8),...rep('softOrange',2),'softOrange','fabricRed'],8),
    seg(10,['fabricRed','fabricRed',...rep('softOrange',8),'fabricRed','fabricRed'],10),
    seg(12,[...rep('fabricRed',8)],12),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Curtain: hanging fabric with folds ──
  curtain: createSprite([
    // Rod
    seg(4,[...rep('midGray',24)],4),
    seg(4,['midGray',...rep('silver',22),'midGray'],4),
    // Fabric folds
    seg(4,['fabricBlue','fabricBlue',...rep('skyBlue',4),'fabricBlue','fabricBlue',...rep('skyBlue',4),'fabricBlue','fabricBlue',...rep('skyBlue',4),'fabricBlue','fabricBlue',...rep('skyBlue',4)],4),
    seg(4,['fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('paleBlue',5),'fabricBlue',...rep('paleBlue',5),'fabricBlue',...rep('paleBlue',5),'fabricBlue',...rep('paleBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('paleBlue',5),'fabricBlue',...rep('paleBlue',5),'fabricBlue',...rep('paleBlue',5),'fabricBlue',...rep('paleBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue',...rep('skyBlue',5),'fabricBlue'],4),
    seg(4,['fabricBlue','fabricBlue',...rep('skyBlue',4),'fabricBlue','fabricBlue',...rep('skyBlue',4),'fabricBlue','fabricBlue',...rep('skyBlue',4),'fabricBlue','fabricBlue',...rep('skyBlue',4)],4),
    seg(5,[...rep('shadow1',22)],5),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Clock: wall-hung round clock ──
  clock: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(10,[...rep('darkBrown',12)],10),
    seg(8,['darkBrown','brown',...rep('darkBrown',10),'brown','darkBrown'],8),
    seg(7,['darkBrown','brown','darkBrown',...rep('cream',8),'darkBrown','brown','darkBrown'],7),
    seg(7,['darkBrown','brown','darkBrown','cream','cream','cream','darkBrown','cream','cream','cream','cream','darkBrown','brown','darkBrown'],7),
    seg(7,['darkBrown','brown','darkBrown','cream','cream','cream','cream','darkBrown','cream','cream','cream','darkBrown','brown','darkBrown'],7),
    seg(7,['darkBrown','brown','darkBrown','cream','cream','cream','cream','darkBrown','darkBrown','cream','cream','darkBrown','brown','darkBrown'],7),
    seg(7,['darkBrown','brown','darkBrown',...rep('cream',8),'darkBrown','brown','darkBrown'],7),
    seg(8,['darkBrown','brown',...rep('darkBrown',10),'brown','darkBrown'],8),
    seg(10,[...rep('darkBrown',12)],10),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Trash Can: cylindrical bin ──
  trash_can: createSprite([
    ...Array(5).fill(new Array(SPRITE_SIZE).fill(0)),
    // Lid
    seg(10,[...rep('darkGray',12)],10),
    seg(9,['darkGray',...rep('midGray',12),'darkGray'],9),
    seg(10,[...rep('darkGray',12)],10),
    // Body
    seg(9,['darkGray',...rep('midGray',12),'darkGray'],9),
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('silver',12),'darkGray'],9),
    seg(9,['darkGray',...rep('midGray',12),'darkGray'],9),
    seg(9,['darkGray',...rep('midGray',12),'darkGray'],9),
    // Bottom
    seg(10,[...rep('darkGray',12)],10),
    seg(10,[...rep('shadow1',12)],10),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // showcase is defined after the object via reassignment

  // ── Fridge: tall refrigerator ──
  fridge: createSprite([
    // Top
    seg(6,[...rep('lightMetal',20)],6),
    seg(5,['lightMetal',...rep('silver',20),'lightMetal'],5),
    seg(6,[...rep('lightMetal',20)],6),
    // Upper door (freezer)
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(6,['midGray','silver',...rep('lightMetal',8),'midGray',...rep('lightMetal',7),'silver','midGray'],6),
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(6,[...rep('darkGray',20)],6),
    // Lower door (fridge)
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(6,['midGray','silver',...rep('lightMetal',16),'silver','midGray'],6),
    seg(6,['midGray','silver',...rep('lightMetal',8),'midGray',...rep('lightMetal',7),'silver','midGray'],6),
    seg(6,['midGray','silver',...rep('lightMetal',16),'silver','midGray'],6),
    seg(6,['midGray',...rep('silver',18),'midGray'],6),
    seg(6,[...rep('midGray',20)],6),
    // Bottom edge
    seg(6,['shadow2',...rep('shadow1',18),'shadow2'],6),
    seg(7,[...rep('shadow1',18)],7),
    ...Array(17).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Sink: kitchen/bathroom sink ──
  sink: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // Faucet
    seg(11,[...rep('midGray',4),...rep('silver',2),...rep('midGray',2)],11),
    seg(12,[0,0,0,0,'silver','silver','midGray'],12),
    seg(12,[0,0,0,0,0,'silver'],12),
    // Basin top
    seg(6,[...rep('lightMetal',20)],6),
    seg(5,['lightMetal',...rep('silver',20),'lightMetal'],5),
    // Basin hollow
    seg(5,['lightMetal','silver',...rep('paleBlue',4),...rep('iceBlue',4),...rep('paleBlue',4),...rep('silver',6),'lightMetal'],5),
    seg(5,['lightMetal','silver',...rep('iceBlue',4),...rep('paleBlue',6),...rep('silver',8),'lightMetal'],5),
    seg(5,['lightMetal',...rep('silver',20),'lightMetal'],5),
    seg(6,[...rep('lightMetal',20)],6),
    // Cabinet
    seg(6,['shadow2','midGray',...rep('silver',16),'midGray','shadow2'],6),
    seg(6,['shadow2','midGray',...rep('silver',7),'midGray',...rep('silver',8),'midGray','shadow2'],6),
    seg(6,['shadow2','midGray',...rep('silver',16),'midGray','shadow2'],6),
    seg(7,[...rep('shadow1',18)],7),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  // ── Display Case (alias for showcase) ──
  display_case: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(4,[...rep('darkGray',24)],4),
    seg(3,['darkGray','midGray',...rep('darkGray',22),'midGray'],3),
    seg(3,['darkGray','midGray',...rep('glass',7),'golden','golden',...rep('glass',5),...rep('glassHighlight',5),'midGray','darkGray'],3),
    seg(3,['darkGray','midGray',...rep('glass',4),'warmRed','warmRed','glass','golden','glass',...rep('glass',4),...rep('glassHighlight',4),...rep('glass',2),'midGray','darkGray'],3),
    seg(3,['darkGray','midGray',...rep('glass',22),'midGray','darkGray'],3),
    seg(3,['darkGray','midGray',...rep('glass',22),'midGray','darkGray'],3),
    seg(4,[...rep('darkGray',24)],4),
    seg(4,['shadow2','midGray',...rep('silver',20),'midGray','shadow2'],4),
    seg(4,['shadow2','midGray',...rep('silver',20),'midGray','shadow2'],4),
    seg(5,[...rep('shadow1',22)],5),
    ...Array(20).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),
};

// Fix the showcase sprite (remove the broken line with alias)
SPRITES.showcase = createSprite([
  ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
  seg(4,[...rep('darkGray',24)],4),
  seg(3,['darkGray','midGray',...rep('darkGray',22),'midGray'],3),
  seg(3,['darkGray','midGray',...rep('glass',7),'golden','golden',...rep('glass',5),...rep('glassHighlight',5),'midGray','darkGray'],3),
  seg(3,['darkGray','midGray',...rep('glass',4),'warmRed','warmRed','glass','golden','glass',...rep('glass',4),...rep('glassHighlight',4),...rep('glass',2),'midGray','darkGray'],3),
  seg(3,['darkGray','midGray',...rep('glass',22),'midGray','darkGray'],3),
  seg(3,['darkGray','midGray',...rep('glass',22),'midGray','darkGray'],3),
  seg(4,[...rep('darkGray',24)],4),
  seg(4,['shadow2','midGray',...rep('silver',20),'midGray','shadow2'],4),
  seg(4,['shadow2','midGray',...rep('silver',20),'midGray','shadow2'],4),
  seg(5,[...rep('shadow1',22)],5),
  ...Array(20).fill(new Array(SPRITE_SIZE).fill(0)),
]);

// Fallback generic sprite
export const GENERIC_SPRITE: SpriteData = createSprite([
  ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
  seg(6,[...rep('midGray',20)],6),
  seg(5,['midGray',...rep('silver',20),'midGray'],5),
  seg(5,['midGray',...rep('silver',20),'midGray'],5),
  seg(5,['midGray',...rep('silver',20),'midGray'],5),
  seg(5,['midGray',...rep('silver',20),'midGray'],5),
  seg(6,[...rep('midGray',20)],6),
  seg(6,['shadow2',...rep('shadow1',18),'shadow2'],6),
  seg(7,[...rep('shadow1',18)],7),
  ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
]);

export function getSpriteForType(type: string): SpriteData {
  if (SPRITES[type]) return SPRITES[type];
  return GENERIC_SPRITE;
}
