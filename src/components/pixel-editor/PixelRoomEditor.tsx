'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { FurnitureType, FurnitureItem } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';

// ─── Legend of Mana inspired color palette ─────────────────────────────
const PAL = {
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
} as const;

type PalKey = keyof typeof PAL;
const _ = 0; // transparent

// ─── 32x32 isometric sprite definitions ─────────────────────────────────
type SpriteRow = (PalKey | 0)[];
type SpriteData = SpriteRow[];

const SPRITE_SIZE = 32;

function createSprite(rows: SpriteData): SpriteData {
  while (rows.length < SPRITE_SIZE) rows.push(new Array(SPRITE_SIZE).fill(0));
  return rows.map(r => {
    while (r.length < SPRITE_SIZE) r.push(0);
    return r.slice(0, SPRITE_SIZE);
  });
}

// Helper to create a filled row segment
function seg(pre: number, fills: (PalKey | 0)[], post: number): SpriteRow {
  const row: SpriteRow = [];
  for (let i = 0; i < pre; i++) row.push(0);
  row.push(...fills);
  for (let i = 0; i < post; i++) row.push(0);
  while (row.length < SPRITE_SIZE) row.push(0);
  return row.slice(0, SPRITE_SIZE);
}

// ── Isometric Chair (32x32): viewed from 45deg ──
const SPRITES: Record<string, SpriteData> = {
  chair: createSprite([
    // rows 0-5: backrest top
    seg(10,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],10),
    seg(9,['darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown','darkBrown'],9),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','brown','darkBrown','darkBrown'],8),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','brown','darkBrown'],9),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','darkBrown'],10),
    seg(8,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','darkBrown'],10),
    // rows 6-9: backrest bottom / seat top
    seg(8,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],10),
    seg(7,['shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2','shadow2'],10),
    // rows 8-13: seat diamond
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    seg(3,['darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],3),
    seg(3,['darkBrown','brown','cream','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','cream','brown','darkBrown'],3),
    seg(3,['darkBrown','brown','cream','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','cream','brown','darkBrown'],3),
    seg(4,['darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],4),
    seg(5,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],5),
    // rows 14-19: legs
    seg(5,['darkBrown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'darkBrown'],5),
    seg(5,['darkBrown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'darkBrown'],5),
    seg(6,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],6),
    seg(6,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],6),
    seg(6,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],6),
    seg(6,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],6),
    // 20-31 empty
    ...Array(12).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  table_square: createSprite([
    // rows 0-3 empty
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    // rows 4-7: tabletop diamond
    seg(6,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],6),
    seg(4,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','darkBrown'],4),
    seg(3,['darkBrown','brown','lightBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','lightBrown','brown','darkBrown'],3),
    seg(2,['darkBrown','brown','lightBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','lightBrown','brown','darkBrown'],2),
    seg(2,['darkBrown','brown','lightBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','lightBrown','brown','darkBrown'],2),
    seg(3,['darkBrown','brown','lightBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','lightBrown','brown','darkBrown'],3),
    seg(4,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','darkBrown'],4),
    seg(6,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],6),
    // rows 12-13: front edge thickness
    seg(6,['shadow2','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow2'],6),
    seg(7,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],7),
    // rows 14-19: legs
    seg(7,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],7),
    seg(7,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],7),
    seg(8,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],8),
    seg(8,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],8),
    seg(9,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],9),
    seg(9,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],9),
    // 20-31
    ...Array(12).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  table_round: createSprite([
    ...Array(3).fill(new Array(SPRITE_SIZE).fill(0)),
    // Oval/diamond tabletop
    seg(9,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],9),
    seg(6,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','darkBrown'],6),
    seg(4,['darkBrown','brown','lightBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','lightBrown','brown'],4),
    seg(3,['darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],3),
    seg(3,['darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],3),
    seg(4,['darkBrown','brown','lightBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','lightBrown','brown'],4),
    seg(6,['darkBrown','brown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','lightBrown','brown','darkBrown'],6),
    seg(9,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],9),
    // Edge
    seg(9,['shadow2','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow2'],9),
    // Pedestal
    seg(14,['brown','brown','brown','brown'],14),
    seg(14,['brown','brown','brown','brown'],14),
    seg(14,['brown','brown','brown','brown'],14),
    seg(13,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],13),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  sofa: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    // Back cushion
    seg(2,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],2),
    seg(1,['darkBrown','brown','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','brown','darkBrown'],1),
    seg(1,['darkBrown','brown','softOrange','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','softOrange','brown','darkBrown'],1),
    seg(1,['darkBrown','brown','softOrange','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','peach','softOrange','brown','darkBrown'],1),
    seg(1,['darkBrown','brown','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','softOrange','brown','darkBrown'],1),
    seg(2,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],2),
    // Seat cushion
    seg(2,['brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown'],2),
    seg(2,['brown','cream','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','cream','brown'],2),
    seg(2,['brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown'],2),
    seg(2,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],2),
    // Front face
    seg(2,['shadow2','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow2'],2),
    seg(3,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],3),
    // Legs
    seg(3,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],3),
    seg(3,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],3),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  counter: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    seg(3,['darkBrown','brown','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','brown','darkBrown'],3),
    seg(3,['darkBrown','brown','golden','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','golden','brown','darkBrown'],3),
    seg(3,['darkBrown','brown','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','brown','darkBrown'],3),
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    // Front face
    seg(4,['shadow2','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','shadow2'],4),
    seg(4,['shadow2','brown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','brown','shadow2'],4),
    seg(4,['shadow2','brown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','brown','shadow2'],4),
    seg(4,['shadow2','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','shadow2'],4),
    seg(5,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],5),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  plant: createSprite([
    ...Array(1).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(10,['olive','olive','olive','sage','sage','sage','olive','olive','sage','sage','olive','olive'],10),
    seg(8,['olive','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','olive'],8),
    seg(7,['olive','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','olive'],7),
    seg(6,['olive','sage','sage','sage','sage','mint','sage','sage','sage','sage','sage','sage','mint','sage','sage','sage','sage','sage','sage','olive'],6),
    seg(6,['olive','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','olive'],6),
    seg(7,['olive','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','olive'],7),
    seg(8,['olive','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','olive'],8),
    seg(9,['olive','olive','sage','sage','sage','sage','sage','sage','sage','sage','sage','sage','olive','olive'],9),
    seg(11,['olive','olive','sage','sage','sage','sage','sage','sage','sage','olive','olive'],11),
    seg(13,['olive','brown','brown','brown','brown','olive'],13),
    seg(14,['brown','brown','brown','brown'],14),
    // Pot
    seg(10,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],10),
    seg(10,['darkBrown','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','darkBrown'],10),
    seg(11,['darkBrown','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','warmRed','darkBrown'],11),
    seg(11,['darkBrown','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','darkBrown'],11),
    seg(12,['darkBrown','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','darkBrown'],12),
    seg(12,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],12),
    ...Array(14).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  shelf: createSprite([
    ...Array(2).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    seg(4,['darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],4),
    seg(4,['darkBrown','brown','cream','skyBlue','skyBlue','cream','cream','warmRed','warmRed','cream','cream','cream','sage','cream','cream','cream','cream','lavender','cream','cream','cream','cream','brown','darkBrown'],4),
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    seg(4,['darkBrown','brown','cream','cream','sage','cream','cream','cream','cream','golden','golden','cream','cream','cream','cream','cream','cream','cream','softOrange','cream','cream','cream','brown','darkBrown'],4),
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    seg(4,['darkBrown','brown','cream','cream','cream','cream','warmRed','cream','cream','cream','cream','skyBlue','skyBlue','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown'],4),
    seg(4,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],4),
    // Front face
    seg(4,['shadow2','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','shadow2'],4),
    seg(4,['shadow2','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','shadow2'],4),
    seg(4,['shadow2','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','shadow2'],4),
    seg(5,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],5),
    ...Array(16).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  pendant_light: createSprite([
    seg(15,['midGray','midGray'],15),
    seg(15,['midGray','midGray'],15),
    seg(15,['midGray','midGray'],15),
    seg(14,['midGray','midGray','midGray','midGray'],14),
    seg(12,['golden','golden','golden','golden','golden','golden','golden','golden'],12),
    seg(10,['golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden'],10),
    seg(9,['golden','golden','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','golden','golden'],9),
    seg(9,['golden','golden','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','highlight','golden','golden'],9),
    seg(10,['golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden','golden'],10),
    seg(12,['golden','golden','golden','golden','golden','golden','golden','golden'],12),
    ...Array(22).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  register: createSprite([
    ...Array(4).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(8,['darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray'],8),
    seg(7,['darkGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','darkGray'],7),
    seg(7,['darkGray','midGray','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','skyBlue','midGray','midGray','darkGray'],7),
    seg(7,['darkGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','darkGray'],7),
    seg(8,['darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray'],8),
    // Front
    seg(8,['shadow2','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','shadow2'],8),
    seg(8,['shadow2','silver','white','white','silver','white','white','silver','white','white','silver','white','white','silver','silver','shadow2'],8),
    seg(8,['shadow2','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','shadow2'],8),
    seg(9,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],9),
    ...Array(19).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),

  stool: createSprite([
    ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
    seg(9,['darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray'],9),
    seg(8,['darkGray','midGray','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','midGray','darkGray'],8),
    seg(8,['darkGray','midGray','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','midGray','darkGray'],8),
    seg(9,['darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray'],9),
    // Legs
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
    seg(2,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],2),
    seg(2,['darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown'],2),
    seg(2,['darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown'],2),
    seg(2,['darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown'],2),
    seg(2,['darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown'],2),
    seg(2,['darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown'],2),
    seg(2,['darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown'],2),
    seg(2,['darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown'],2),
    // Front
    seg(2,['shadow2','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow2'],2),
    seg(3,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],3),
    // Legs
    seg(3,['brown',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'brown'],3),
    seg(3,['shadow1',0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,'shadow1'],3),
    ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
  ]),
};

// Fallback generic sprite
const GENERIC_SPRITE: SpriteData = createSprite([
  ...Array(6).fill(new Array(SPRITE_SIZE).fill(0)),
  seg(6,['midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray'],6),
  seg(5,['midGray','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','midGray'],5),
  seg(5,['midGray','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','midGray'],5),
  seg(5,['midGray','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','midGray'],5),
  seg(5,['midGray','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','midGray'],5),
  seg(6,['midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray'],6),
  seg(6,['shadow2','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow2'],6),
  seg(7,['shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1','shadow1'],7),
  ...Array(18).fill(new Array(SPRITE_SIZE).fill(0)),
]);

function getSpriteForType(type: string): SpriteData {
  if (SPRITES[type]) return SPRITES[type];
  return GENERIC_SPRITE;
}

// ─── Constants ─────────────────────────────────────────────────────────
const TILE_W_BASE = 64;        // isometric tile width at zoom=1
const GRID_SNAP_M = 0.25;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const SHADOW_COLOR = 'rgba(42,31,20,0.25)';
const SELECTION_COLORS = [PAL.golden, PAL.softOrange];

// ─── Isometric coordinate helpers ──────────────────────────────────────
function isoProject(wx: number, wy: number, tileW: number): { ix: number; iy: number } {
  const tileH = tileW / 2;
  return {
    ix: (wx - wy) * tileW / 2,
    iy: (wx + wy) * tileH / 2,
  };
}

function isoUnproject(ix: number, iy: number, tileW: number): { wx: number; wy: number } {
  const tileH = tileW / 2;
  return {
    wx: (ix / (tileW / 2) + iy / (tileH / 2)) / 2,
    wy: (iy / (tileH / 2) - ix / (tileW / 2)) / 2,
  };
}

// ─── Context menu / Catalog popup ──────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  furnitureId: string | null;
}

interface CatalogPopupState {
  x: number;
  y: number;
  worldX: number;
  worldZ: number;
}

type PixelTool = 'select' | 'move' | 'rotate' | 'delete' | 'crt';

// ─── Helper: render sprite to canvas ───────────────────────────────────
function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  x: number,
  y: number,
  pixelSize: number,
  rotationSteps: number = 0,
) {
  const size = SPRITE_SIZE;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let srcRow = row;
      let srcCol = col;
      const steps = ((rotationSteps % 4) + 4) % 4;
      if (steps === 1) { srcRow = col; srcCol = size - 1 - row; }
      else if (steps === 2) { srcRow = size - 1 - row; srcCol = size - 1 - col; }
      else if (steps === 3) { srcRow = size - 1 - col; srcCol = row; }

      const palKey = sprite[srcRow]?.[srcCol];
      if (!palKey) continue;
      ctx.fillStyle = PAL[palKey as PalKey] || '#ff00ff';
      ctx.fillRect(
        x + col * pixelSize,
        y + row * pixelSize,
        pixelSize + 0.5,
        pixelSize + 0.5,
      );
    }
  }
}

// ─── Mini sprite thumbnail ─────────────────────────────────────────────
function drawMiniSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  x: number,
  y: number,
  totalSize: number,
) {
  const px = totalSize / SPRITE_SIZE;
  for (let row = 0; row < SPRITE_SIZE; row++) {
    for (let col = 0; col < SPRITE_SIZE; col++) {
      const palKey = sprite[row]?.[col];
      if (!palKey) continue;
      ctx.fillStyle = PAL[palKey as PalKey] || '#ff00ff';
      ctx.fillRect(x + col * px, y + row * px, Math.ceil(px), Math.ceil(px));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════
export default function PixelRoomEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const needsRedrawRef = useRef(true);
  const rafIdRef = useRef<number>(0);

  const walls = useEditorStore((s) => s.walls);
  const furniture = useEditorStore((s) => s.furniture);
  const openings = useEditorStore((s) => s.openings);
  const selectedFurnitureId = useEditorStore((s) => s.selectedFurnitureId);
  const setSelectedFurniture = useEditorStore((s) => s.setSelectedFurniture);
  const moveFurniture = useEditorStore((s) => s.moveFurniture);
  const rotateFurniture = useEditorStore((s) => s.rotateFurniture);
  const deleteFurniture = useEditorStore((s) => s.deleteFurniture);
  const duplicateFurniture = useEditorStore((s) => s.duplicateFurniture);
  const addFurniture = useEditorStore((s) => s.addFurniture);

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<PixelTool>('select');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [catalogPopup, setCatalogPopup] = useState<CatalogPopupState | null>(null);
  const [crtEnabled, setCrtEnabled] = useState(false);
  const [blinkPhase, setBlinkPhase] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [dragging, setDragging] = useState<{ id: string; startWorld: { x: number; z: number }; startPos: [number, number, number] } | null>(null);

  useEffect(() => {
    if (!selectedFurnitureId) return;
    const interval = setInterval(() => {
      setBlinkPhase((p) => (p + 1) % 2);
      needsRedrawRef.current = true;
    }, 400);
    return () => clearInterval(interval);
  }, [selectedFurnitureId]);

  const roomBounds = useMemo(() => {
    if (walls.length === 0) return { minX: -3, maxX: 3, minY: -3, maxY: 3 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      minY = Math.min(minY, w.start.y, w.end.y);
      maxY = Math.max(maxY, w.start.y, w.end.y);
    }
    const pad = 1;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [walls]);

  const roomArea = useMemo(() => {
    if (walls.length < 3) return 0;
    const pts: { x: number; y: number }[] = [];
    for (const w of walls) pts.push(w.start);
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    return Math.abs(area) / 2;
  }, [walls]);

  // ── Isometric world <-> screen ──
  const tileW = TILE_W_BASE * zoom;

  const worldToScreen = useCallback(
    (wx: number, wy: number, canvasWidth: number, canvasHeight: number) => {
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const roomCX = (roomBounds.minX + roomBounds.maxX) / 2;
      const roomCY = (roomBounds.minY + roomBounds.maxY) / 2;
      // Isometric projection relative to room center
      const relX = wx - roomCX;
      const relY = wy - roomCY;
      const iso = isoProject(relX, relY, tileW);
      return {
        sx: cx + iso.ix + panOffset.x,
        sy: cy + iso.iy + panOffset.y,
      };
    },
    [tileW, panOffset, roomBounds],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number, canvasWidth: number, canvasHeight: number) => {
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const roomCX = (roomBounds.minX + roomBounds.maxX) / 2;
      const roomCY = (roomBounds.minY + roomBounds.maxY) / 2;
      const isoX = sx - cx - panOffset.x;
      const isoY = sy - cy - panOffset.y;
      const world = isoUnproject(isoX, isoY, tileW);
      return {
        wx: world.wx + roomCX,
        wy: world.wy + roomCY,
      };
    },
    [tileW, panOffset, roomBounds],
  );

  const snapToGrid = (v: number) => Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;

  // ── Hit test (isometric) ──
  const hitTestFurniture = useCallback(
    (sx: number, sy: number, cw: number, ch: number): FurnitureItem | null => {
      const spriteScreenSize = SPRITE_SIZE * (zoom * 1.2);
      for (let i = furniture.length - 1; i >= 0; i--) {
        const f = furniture[i];
        const { sx: fx, sy: fy } = worldToScreen(f.position[0], f.position[2], cw, ch);
        const half = spriteScreenSize / 2;
        if (sx >= fx - half && sx <= fx + half && sy >= fy - half - 8 && sy <= fy + half) {
          return f;
        }
      }
      return null;
    },
    [furniture, zoom, worldToScreen],
  );

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      needsRedrawRef.current = true;
    }
  }, []);

  // ── Draw isometric diamond tile ──
  const drawDiamond = useCallback((
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    tw: number, th: number,
    fillColor: string,
    strokeColor?: string,
  ) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy - th / 2);
    ctx.lineTo(cx + tw / 2, cy);
    ctx.lineTo(cx, cy + th / 2);
    ctx.lineTo(cx - tw / 2, cy);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }, []);

  // ── Main render ──
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width;
    const H = rect.height;

    // ── Background: deep indigo gradient (LoM night sky) ──
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0d1b2a');
    bgGrad.addColorStop(0.5, '#1b2838');
    bgGrad.addColorStop(1, '#162032');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle star-like dots
    const starSeed = 42;
    for (let i = 0; i < 40; i++) {
      const sx2 = ((starSeed * (i + 1) * 7) % 1000) / 1000 * W;
      const sy2 = ((starSeed * (i + 1) * 13) % 1000) / 1000 * H * 0.5;
      const brightness = 0.1 + ((i * 37) % 100) / 300;
      ctx.fillStyle = `rgba(255,248,240,${brightness})`;
      ctx.fillRect(Math.floor(sx2), Math.floor(sy2), 1.5, 1.5);
    }

    // Vignette
    const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);

    const currentTileW = tileW;
    const currentTileH = currentTileW / 2;
    const spritePixelSize = zoom * 1.2;

    // ── Draw floor tiles (isometric diamond grid) ──
    if (walls.length > 0) {
      // Build wall polygon for clipping
      ctx.save();
      if (walls.length >= 3) {
        ctx.beginPath();
        const p0 = worldToScreen(walls[0].start.x, walls[0].start.y, W, H);
        ctx.moveTo(p0.sx, p0.sy);
        for (const w of walls) {
          const p = worldToScreen(w.end.x, w.end.y, W, H);
          ctx.lineTo(p.sx, p.sy);
        }
        ctx.closePath();
        ctx.clip();
      }

      // Tile the floor area
      const step = GRID_SNAP_M;
      const padTiles = 2;
      const minTX = Math.floor((roomBounds.minX - padTiles) / step) * step;
      const maxTX = Math.ceil((roomBounds.maxX + padTiles) / step) * step;
      const minTY = Math.floor((roomBounds.minY - padTiles) / step) * step;
      const maxTY = Math.ceil((roomBounds.maxY + padTiles) / step) * step;

      for (let ty = minTY; ty < maxTY; ty += step) {
        for (let tx = minTX; tx < maxTX; tx += step) {
          const center = worldToScreen(tx + step / 2, ty + step / 2, W, H);
          const tilePxW = step * currentTileW;
          const tilePxH = step * currentTileH;

          // Warm wood color with variation for handpainted feel
          const hash = ((Math.floor(tx * 4) * 7 + Math.floor(ty * 4) * 13) & 0xFF);
          const colorIdx = hash % 5;
          const tileColors = ['#d4bc8a', '#cdb480', '#c8ae78', '#d0b888', '#c4a870'];
          const baseColor = tileColors[colorIdx];

          drawDiamond(ctx, center.sx, center.sy, tilePxW, tilePxH, baseColor, '#b89860');

          // Subtle wood grain
          if (hash % 3 === 0) {
            const grainX = center.sx + (hash % 5 - 2) * tilePxW * 0.1;
            const grainY = center.sy + ((hash >> 2) % 3 - 1) * tilePxH * 0.1;
            ctx.fillStyle = colorIdx % 2 === 0 ? '#dcc898' : '#b89860';
            ctx.fillRect(grainX, grainY, Math.max(1, tilePxW * 0.15), Math.max(1, tilePxH * 0.08));
          }
        }
      }
      ctx.restore();
    }

    // ── Draw walls (isometric 3D walls with height) ──
    // Sort walls: draw back walls first (higher world Y first for isometric)
    const sortedWalls = [...walls].sort((a, b) => {
      const aY = Math.min(a.start.y, a.end.y);
      const bY = Math.min(b.start.y, b.end.y);
      return aY - bY;  // draw walls with smaller Y (back) first
    });

    const wallHeight = 0.8; // visual wall height in world units
    for (const w of sortedWalls) {
      const p1 = worldToScreen(w.start.x, w.start.y, W, H);
      const p2 = worldToScreen(w.end.x, w.end.y, W, H);

      // Wall top position (shifted up by wallHeight in iso projection)
      const wallUpPx = wallHeight * currentTileH;

      // Determine if this is a "back" wall (top/left) or "front" wall
      const midY = (w.start.y + w.end.y) / 2;
      const roomMidY = (roomBounds.minY + roomBounds.maxY) / 2;
      const isBackWall = midY < roomMidY;
      const midX = (w.start.x + w.end.x) / 2;
      const roomMidX = (roomBounds.minX + roomBounds.maxX) / 2;
      const isLeftWall = midX < roomMidX;

      // Wall colors - pastel LoM style
      const wallTopColor = w.color || '#e8d8c0';
      const wallFrontColor = isBackWall || isLeftWall ? '#c8b8a0' : '#a89878';

      // Draw wall front face (quadrilateral)
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p2.sx, p2.sy - wallUpPx);
      ctx.lineTo(p1.sx, p1.sy - wallUpPx);
      ctx.closePath();
      ctx.fillStyle = wallFrontColor;
      ctx.fill();
      ctx.strokeStyle = PAL.shadow1;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw wall top face (parallelogram for depth illusion)
      const topDepth = currentTileH * 0.06;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy - wallUpPx);
      ctx.lineTo(p2.sx, p2.sy - wallUpPx);
      ctx.lineTo(p2.sx + topDepth, p2.sy - wallUpPx - topDepth);
      ctx.lineTo(p1.sx + topDepth, p1.sy - wallUpPx - topDepth);
      ctx.closePath();
      ctx.fillStyle = wallTopColor;
      ctx.fill();
      ctx.strokeStyle = PAL.shadow2;
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Wall base shadow
      ctx.save();
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.lineTo(p2.sx + 4, p2.sy + 2);
      ctx.lineTo(p1.sx + 4, p1.sy + 2);
      ctx.closePath();
      ctx.fillStyle = '#2a1f14';
      ctx.fill();
      ctx.restore();
    }

    // ── Draw openings ──
    ctx.strokeStyle = PAL.skyBlue;
    ctx.lineWidth = 2;
    for (const op of openings) {
      const wall = walls.find(w => w.id === op.wallId);
      if (!wall) continue;
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      const nx = dx / len;
      const ny = dy / len;
      const startM = op.positionAlongWall;
      const endM = startM + op.width;
      const o1 = worldToScreen(wall.start.x + nx * startM, wall.start.y + ny * startM, W, H);
      const o2 = worldToScreen(wall.start.x + nx * endM, wall.start.y + ny * endM, W, H);
      ctx.beginPath();
      ctx.moveTo(o1.sx, o1.sy);
      ctx.lineTo(o2.sx, o2.sy);
      ctx.stroke();
      if (op.type === 'door') {
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(o1.sx, o1.sy, Math.abs(o2.sx - o1.sx) || Math.abs(o2.sy - o1.sy), 0, Math.PI / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Draw furniture (sorted by iso depth: painter's algorithm) ──
    const sortedFurniture = [...furniture].sort((a, b) => {
      // Sort by isometric depth (wx + wy gives depth)
      const depthA = a.position[0] + a.position[2];
      const depthB = b.position[0] + b.position[2];
      return depthA - depthB;
    });

    for (const f of sortedFurniture) {
      const { sx: fx, sy: fy } = worldToScreen(f.position[0], f.position[2], W, H);
      const sprite = getSpriteForType(f.type);
      const spriteSize = SPRITE_SIZE * spritePixelSize;
      const halfSprite = spriteSize / 2;

      // Isometric shadow (diamond-shaped ellipse)
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#2a1f14';
      ctx.beginPath();
      ctx.ellipse(fx + 2, fy + halfSprite * 0.3 + 2, halfSprite * 0.7, halfSprite * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Rotation steps
      const rotSteps = Math.round((f.rotation[1] / (Math.PI / 2))) % 4;

      // Draw sprite (positioned so bottom-center aligns with iso position)
      drawSprite(ctx, sprite, fx - halfSprite, fy - halfSprite * 0.7, spritePixelSize, rotSteps);

      // Selection highlight (blinking pixel frame)
      if (f.id === selectedFurnitureId) {
        const selColor = SELECTION_COLORS[blinkPhase];
        const altColor = SELECTION_COLORS[(blinkPhase + 1) % 2];
        const margin = 3;
        const bx = fx - halfSprite - margin;
        const by = fy - halfSprite * 0.7 - margin;
        const bw = spriteSize + margin * 2;
        const bh = spriteSize + margin * 2;
        const pxSz = Math.max(2, spritePixelSize * 0.5);

        const stepsH = Math.ceil(bw / pxSz);
        const stepsV = Math.ceil(bh / pxSz);
        for (let i = 0; i < stepsH; i++) {
          ctx.fillStyle = i % 2 === 0 ? selColor : altColor;
          ctx.fillRect(bx + i * pxSz, by, pxSz, pxSz);
          ctx.fillRect(bx + i * pxSz, by + bh - pxSz, pxSz, pxSz);
        }
        for (let i = 1; i < stepsV - 1; i++) {
          ctx.fillStyle = i % 2 === 0 ? selColor : altColor;
          ctx.fillRect(bx, by + i * pxSz, pxSz, pxSz);
          ctx.fillRect(bx + bw - pxSz, by + i * pxSz, pxSz, pxSz);
        }

        ctx.fillStyle = PAL.white;
        ctx.fillRect(bx, by, pxSz, pxSz);
        ctx.fillRect(bx + bw - pxSz, by, pxSz, pxSz);
        ctx.fillRect(bx, by + bh - pxSz, pxSz, pxSz);
        ctx.fillRect(bx + bw - pxSz, by + bh - pxSz, pxSz, pxSz);
      }
    }

    // ── Warm overlay ──
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = '#f0c8a8';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // ── Room info text ──
    if (roomArea > 0) {
      const tsubo = roomArea / 3.30579;
      const text = `${roomArea.toFixed(1)}m\u00B2 / ${tsubo.toFixed(1)}\u5764`;
      ctx.font = '600 13px "Courier New", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const tm = ctx.measureText(text);
      ctx.fillStyle = 'rgba(13,27,42,0.75)';
      ctx.fillRect(8, H - 32, tm.width + 16, 24);
      ctx.fillStyle = PAL.golden;
      ctx.fillText(text, 16, H - 27);
    }
  }, [walls, furniture, openings, selectedFurnitureId, zoom, panOffset, roomBounds, worldToScreen, blinkPhase, roomArea, tileW, drawDiamond]);

  useEffect(() => {
    needsRedrawRef.current = true;
  }, [walls, furniture, openings, selectedFurnitureId, zoom, panOffset, roomBounds, blinkPhase, roomArea]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      if (needsRedrawRef.current) {
        needsRedrawRef.current = false;
        syncCanvasSize();
        render();
      }
      rafIdRef.current = requestAnimationFrame(loop);
    };
    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [render, syncCanvasSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      needsRedrawRef.current = true;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case '1': e.preventDefault(); setActiveTool('select'); break;
        case '2': e.preventDefault(); setActiveTool('move'); break;
        case '3': e.preventDefault(); setActiveTool('rotate'); break;
        case '4': e.preventDefault(); setActiveTool('delete'); break;
        case '5': e.preventDefault(); setCrtEnabled(prev => !prev); break;
        case 'r':
        case 'R':
          if (selectedFurnitureId) {
            e.preventDefault();
            const f = furniture.find(fi => fi.id === selectedFurnitureId);
            if (f) rotateFurniture(f.id, f.rotation[1] + Math.PI / 2);
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (selectedFurnitureId) {
            e.preventDefault();
            deleteFurniture(selectedFurnitureId);
            setSelectedFurniture(null);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setSelectedFurniture(null);
          setContextMenu(null);
          setCatalogPopup(null);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFurnitureId, furniture, rotateFurniture, deleteFurniture, setSelectedFurniture]);

  // ── Touch handlers ──
  const getTouchCanvasPos = useCallback((touch: { clientX: number; clientY: number }): { sx: number; sy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    return { sx: touch.clientX - rect.left, sy: touch.clientY - rect.top };
  }, []);

  const touchStartRef = useRef<{ id: number; sx: number; sy: number; time: number } | null>(null);
  const touchPinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    setContextMenu(null);
    setCatalogPopup(null);

    if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      touchPinchRef.current = { dist, zoom };
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const { sx, sy } = getTouchCanvasPos(touch);
    touchStartRef.current = { id: touch.identifier, sx, sy, time: Date.now() };

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;

    if (activeTool === 'delete') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) {
        deleteFurniture(hit.id);
        if (selectedFurnitureId === hit.id) setSelectedFurniture(null);
      }
      return;
    }

    if (activeTool === 'rotate') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) rotateFurniture(hit.id, hit.rotation[1] + Math.PI / 2);
      return;
    }

    const hit = hitTestFurniture(sx, sy, cw, ch);
    if (hit) {
      setSelectedFurniture(hit.id);
      if (activeTool === 'select' || activeTool === 'move') {
        const world = screenToWorld(sx, sy, cw, ch);
        setDragging({ id: hit.id, startWorld: { x: world.wx, z: world.wy }, startPos: [...hit.position] });
      }
    } else {
      setSelectedFurniture(null);
      setIsPanning(true);
      panStartRef.current = { x: touch.clientX, y: touch.clientY, ox: panOffset.x, oy: panOffset.y };
    }
  }, [activeTool, hitTestFurniture, selectedFurnitureId, panOffset, zoom, setSelectedFurniture, deleteFurniture, rotateFurniture, screenToWorld, getTouchCanvasPos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 2 && touchPinchRef.current) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const scale = dist / touchPinchRef.current.dist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchPinchRef.current.zoom * scale));
      setZoom(newZoom);
      return;
    }

    if (e.touches.length !== 1) return;
    const touch = e.touches[0];

    if (isPanning) {
      const dx = touch.clientX - panStartRef.current.x;
      const dy = touch.clientY - panStartRef.current.y;
      setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }

    if (dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      const world = screenToWorld(sx, sy, rect.width, rect.height);
      const dx = world.wx - dragging.startWorld.x;
      const dz = world.wy - dragging.startWorld.z;
      const newX = snapToGrid(dragging.startPos[0] + dx);
      const newZ = snapToGrid(dragging.startPos[2] + dz);
      moveFurniture(dragging.id, [newX, dragging.startPos[1], newZ]);
    }
  }, [isPanning, dragging, screenToWorld, moveFurniture]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 0) {
      touchPinchRef.current = null;
      setIsPanning(false);
      setDragging(null);
      touchStartRef.current = null;
    }
  }, []);

  // ── Mouse handlers ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu(null);
    setCatalogPopup(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cw = rect.width;
    const ch = rect.height;

    if (e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
      return;
    }

    if (e.button === 2) {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) {
        setSelectedFurniture(hit.id);
        setContextMenu({ x: e.clientX, y: e.clientY, furnitureId: hit.id });
      }
      return;
    }

    if (activeTool === 'delete') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) {
        deleteFurniture(hit.id);
        if (selectedFurnitureId === hit.id) setSelectedFurniture(null);
      }
      return;
    }

    if (activeTool === 'rotate') {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) rotateFurniture(hit.id, hit.rotation[1] + Math.PI / 2);
      return;
    }

    const hit = hitTestFurniture(sx, sy, cw, ch);
    if (hit) {
      setSelectedFurniture(hit.id);
      if (activeTool === 'select' || activeTool === 'move') {
        const world = screenToWorld(sx, sy, cw, ch);
        setDragging({ id: hit.id, startWorld: { x: world.wx, z: world.wy }, startPos: [...hit.position] });
      }
    } else {
      setSelectedFurniture(null);
    }
  }, [activeTool, hitTestFurniture, selectedFurnitureId, panOffset, setSelectedFurniture, deleteFurniture, rotateFurniture, screenToWorld]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      return;
    }

    if (dragging) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy, rect.width, rect.height);
      const dx = world.wx - dragging.startWorld.x;
      const dz = world.wy - dragging.startWorld.z;
      const newX = snapToGrid(dragging.startPos[0] + dx);
      const newZ = snapToGrid(dragging.startPos[2] + dz);
      moveFurniture(dragging.id, [newX, dragging.startPos[1], newZ]);
    }
  }, [isPanning, dragging, screenToWorld, moveFurniture]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragging(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTestFurniture(sx, sy, rect.width, rect.height);
    if (!hit) {
      const world = screenToWorld(sx, sy, rect.width, rect.height);
      setCatalogPopup({ x: e.clientX, y: e.clientY, worldX: snapToGrid(world.wx), worldZ: snapToGrid(world.wy) });
    }
  }, [hitTestFurniture, screenToWorld]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta)));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const handleContextAction = useCallback((action: string) => {
    if (!contextMenu?.furnitureId) return;
    const id = contextMenu.furnitureId;
    switch (action) {
      case 'rotate':
        rotateFurniture(id, (furniture.find(f => f.id === id)?.rotation[1] ?? 0) + Math.PI / 2);
        break;
      case 'duplicate':
        duplicateFurniture(id);
        break;
      case 'delete':
        deleteFurniture(id);
        if (selectedFurnitureId === id) setSelectedFurniture(null);
        break;
    }
    setContextMenu(null);
  }, [contextMenu, rotateFurniture, duplicateFurniture, deleteFurniture, furniture, selectedFurnitureId, setSelectedFurniture]);

  const handleCatalogAdd = useCallback((type: FurnitureType) => {
    if (!catalogPopup) return;
    const catalogItem = FURNITURE_CATALOG.find(c => c.type === type);
    if (!catalogItem) return;
    addFurniture({
      id: `pixel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      name: catalogItem.name,
      position: [catalogPopup.worldX, 0, catalogPopup.worldZ],
      rotation: [0, 0, 0],
      scale: catalogItem.defaultScale,
      color: catalogItem.defaultColor,
      material: catalogItem.defaultMaterial,
    });
    setCatalogPopup(null);
  }, [catalogPopup, addFurniture]);

  const tools: { key: PixelTool; label: string; shortcut: string; iconPath: string }[] = [
    { key: 'select', label: 'SELECT', shortcut: '1', iconPath: 'M5 3l10 8-5 2-3 5-2-1 3-5 5-2z' },
    { key: 'move', label: 'MOVE', shortcut: '2', iconPath: 'M8 2l2 4h-4l2-4zm0 14l-2-4h4l-2 4zm-6-6l4-2v4l-4-2zm14 0l-4 2v-4l4 2z' },
    { key: 'rotate', label: 'ROTATE', shortcut: '3', iconPath: 'M12 4a6 6 0 11-6 6h2a4 4 0 104-4V4l3 3-3 3V6z' },
    { key: 'delete', label: 'DELETE', shortcut: '4', iconPath: 'M4 4l10 10M14 4L4 14' },
  ];

  const paletteCategories = useMemo(() => {
    const cats: { label: string; items: typeof FURNITURE_CATALOG }[] = [
      { label: 'TABLE', items: FURNITURE_CATALOG.filter(f => ['counter','table_square','table_round','bar_table','kitchen_island','reception_desk','desk'].includes(f.type)) },
      { label: 'SEAT', items: FURNITURE_CATALOG.filter(f => ['chair','stool','sofa','bench'].includes(f.type)) },
      { label: 'STORAGE', items: FURNITURE_CATALOG.filter(f => ['shelf','bookcase','wardrobe','shoe_rack','display_case'].includes(f.type)) },
      { label: 'APPLIANCE', items: FURNITURE_CATALOG.filter(f => ['fridge','sink','washing_machine','register','cash_register','tv_monitor','air_conditioner'].includes(f.type)) },
      { label: 'DECOR', items: FURNITURE_CATALOG.filter(f => ['plant','flower_pot','rug','mirror','pendant_light','ceiling_fan','clock','curtain','partition','menu_board','coat_rack','umbrella_stand','trash_can'].includes(f.type)) },
    ];
    return cats.filter(c => c.items.length > 0);
  }, []);

  const handlePaletteAdd = useCallback((type: FurnitureType) => {
    const catalogItem = FURNITURE_CATALOG.find(c => c.type === type);
    if (!catalogItem) return;
    const canvas = canvasRef.current;
    let wx = 0, wz = 0;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const center = screenToWorld(rect.width / 2, rect.height / 2, rect.width, rect.height);
      wx = snapToGrid(center.wx);
      wz = snapToGrid(center.wy);
    }
    addFurniture({
      id: `pixel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      name: catalogItem.name,
      position: [wx, 0, wz],
      rotation: [0, 0, 0],
      scale: catalogItem.defaultScale,
      color: catalogItem.defaultColor,
      material: catalogItem.defaultMaterial,
    });
  }, [addFurniture, screenToWorld]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-[#0d1b2a] overflow-hidden select-none">
      {/* ── Toolbar ── */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-[#162032] border-b border-[#2a3848]">
        {tools.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTool(t.key)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all ${
              activeTool === t.key
                ? 'bg-[#c8584a] text-white shadow-[0_0_8px_rgba(200,88,74,0.5)]'
                : 'bg-[#1b2838] text-[#8a8a90] hover:bg-[#2a3848] hover:text-white'
            }`}
            title={`${t.label} [${t.shortcut}]`}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-3.5 h-3.5">
              <path d={t.iconPath} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">{t.label}</span>
            <span className="hidden sm:inline text-[8px] opacity-50 ml-0.5">[{t.shortcut}]</span>
          </button>
        ))}

        <div className="w-px h-5 bg-[#2a3848] mx-1" />

        <button
          onClick={() => setCrtEnabled(!crtEnabled)}
          className={`px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all ${
            crtEnabled
              ? 'bg-[#a888c0] text-white shadow-[0_0_8px_rgba(168,136,192,0.5)]'
              : 'bg-[#1b2838] text-[#8a8a90] hover:bg-[#2a3848] hover:text-white'
          }`}
          title="CRT Effect [5]"
        >
          CRT
          <span className="hidden sm:inline text-[8px] opacity-50 ml-0.5">[5]</span>
        </button>

        <div className="ml-auto text-[10px] font-mono text-[#607888] px-2">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Side furniture palette ── */}
        <div className="flex-shrink-0 w-[52px] bg-[#162032] border-r border-[#2a3848] overflow-y-auto scrollbar-thin">
          <div className="py-1 px-0.5">
            {paletteCategories.map((cat) => (
              <div key={cat.label}>
                <div className="text-[7px] font-mono font-bold text-[#607888] text-center py-0.5 border-b border-[#2a3848] mb-0.5">
                  {cat.label}
                </div>
                <div className="space-y-1 mb-1">
                  {cat.items.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => handlePaletteAdd(item.type)}
                      className="w-full aspect-square bg-[#1b2838] rounded border border-[#2a3848] hover:border-[#c8584a] hover:bg-[#2a3848] transition-all group relative"
                      title={item.name}
                    >
                      <PaletteThumbnail type={item.type} />
                      <div className="absolute left-full ml-1 top-1/2 -translate-y-1/2 bg-black/90 text-white text-[9px] font-mono px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        {item.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 relative min-w-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
            style={{ imageRendering: 'pixelated' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />

          {/* CRT overlay */}
          {crtEnabled && (
            <>
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'multiply' }} />
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'repeating-linear-gradient(90deg, rgba(255,0,0,0.03) 0px, rgba(0,255,0,0.03) 1px, rgba(0,0,255,0.03) 2px, transparent 3px)', mixBlendMode: 'screen' }} />
              <div className="absolute inset-0 pointer-events-none z-10" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)' }} />
              <div className="absolute inset-0 pointer-events-none z-10 rounded-[8px]" style={{ boxShadow: 'inset 0 0 80px 20px rgba(0,0,0,0.3), inset 0 0 4px 1px rgba(255,255,255,0.02)' }} />
            </>
          )}

          {/* Empty state */}
          {walls.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center px-6 py-4 bg-black/50 rounded-lg border border-[#2a3848]">
                <div className="text-[#c8584a] font-mono text-sm font-bold mb-1">NO ROOM DATA</div>
                <div className="text-[#607888] font-mono text-[10px]">
                  Draw walls in the floor plan editor first
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-[#162032] border border-[#2a3848] rounded shadow-2xl shadow-black/50 min-w-[140px] py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {[
              { action: 'rotate', label: 'Rotate 90\u00B0', icon: '\u21BB' },
              { action: 'duplicate', label: 'Duplicate', icon: '\u2750' },
              { action: 'delete', label: 'Delete', icon: '\u2716' },
            ].map(({ action, label, icon }) => (
              <button
                key={action}
                onClick={() => handleContextAction(action)}
                className={`w-full text-left px-3 py-1.5 text-[11px] font-mono flex items-center gap-2 transition-colors ${
                  action === 'delete'
                    ? 'text-[#c8584a] hover:bg-[#c8584a]/20'
                    : 'text-[#8a8a90] hover:bg-[#2a3848] hover:text-white'
                }`}
              >
                <span className="text-sm">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Catalog popup ── */}
      {catalogPopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCatalogPopup(null)} />
          <div
            className="fixed z-50 bg-[#162032] border border-[#2a3848] rounded-lg shadow-2xl shadow-black/50 p-2 max-w-[280px] max-h-[320px] overflow-y-auto"
            style={{
              left: Math.min(catalogPopup.x, window.innerWidth - 300),
              top: Math.min(catalogPopup.y, window.innerHeight - 340),
            }}
          >
            <div className="text-[10px] font-mono font-bold text-[#c8584a] px-1 pb-1 border-b border-[#2a3848] mb-1">
              ADD FURNITURE
            </div>
            <div className="grid grid-cols-4 gap-1">
              {FURNITURE_CATALOG.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleCatalogAdd(item.type)}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-[#1b2838] hover:bg-[#2a3848] border border-transparent hover:border-[#c8584a] transition-all"
                  title={item.name}
                >
                  <CatalogThumbnail type={item.type} />
                  <span className="text-[8px] font-mono text-[#8a8a90] truncate w-full text-center">
                    {item.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Palette thumbnail ──
function PaletteThumbnail({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 40;
    canvas.height = 40;
    ctx.clearRect(0, 0, 40, 40);
    const sprite = getSpriteForType(type);
    drawMiniSprite(ctx, sprite, 4, 4, 32);
  }, [type]);
  return (
    <canvas
      ref={canvasRef}
      width={40}
      height={40}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

// ── Catalog popup thumbnail ──
function CatalogThumbnail({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 28;
    canvas.height = 28;
    ctx.clearRect(0, 0, 28, 28);
    const sprite = getSpriteForType(type);
    drawMiniSprite(ctx, sprite, 2, 2, 24);
  }, [type]);
  return (
    <canvas
      ref={canvasRef}
      width={28}
      height={28}
      className="w-7 h-7"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
