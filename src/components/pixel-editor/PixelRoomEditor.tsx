'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { FURNITURE_CATALOG } from '@/data/furniture';
import { FurnitureType, FurnitureItem } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';

// ─── Retro NES-inspired color palette ─────────────────────────────────
const PAL = {
  black:       '#0f0f0f',
  darkGray:    '#2d2d2d',
  midGray:     '#5a5a5a',
  lightGray:   '#9e9e9e',
  white:       '#f0f0e8',
  cream:       '#e8dcc8',
  brown:       '#8b6914',
  darkBrown:   '#5c4a1e',
  red:         '#c83838',
  darkRed:     '#8a2020',
  orange:      '#d88030',
  yellow:      '#e8c840',
  green:       '#38a838',
  darkGreen:   '#206820',
  teal:        '#38a8a0',
  blue:        '#3878c8',
  darkBlue:    '#203890',
  purple:      '#7838a8',
  pink:        '#d87898',
  skin:        '#e8b888',
  silver:      '#c0c8d0',
  gold:        '#d8a830',
} as const;

type PalKey = keyof typeof PAL;
const _ = 0; // transparent

// ─── 16x16 sprite definitions ─────────────────────────────────────────
// Each sprite is a 16x16 grid of palette color indices (0 = transparent)
// We store them as arrays of PalKey or 0
type SpriteRow = (PalKey | 0)[];
type SpriteData = SpriteRow[];

function createSprite(rows: SpriteData): SpriteData {
  // Pad to 16x16
  while (rows.length < 16) rows.push(new Array(16).fill(0));
  return rows.map(r => {
    while (r.length < 16) r.push(0);
    return r.slice(0, 16);
  });
}

const SPRITES: Record<string, SpriteData> = {
  // ── Chair: side view with backrest ──
  chair: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'darkBrown','darkBrown','darkBrown',_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'brown','brown','brown',_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'brown','brown','brown',_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'brown','brown','brown',_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'brown','brown','brown',_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'brown','brown','brown',_,_,_,_,_,_,_,_,_],
    [_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_,_,_],
    [_,_,_,'brown','brown','brown','brown','brown','brown','brown','brown','brown',_,_,_,_],
    [_,_,_,'brown','cream','cream','cream','cream','cream','cream','cream','brown',_,_,_,_],
    [_,_,_,'brown','cream','cream','cream','cream','cream','cream','cream','brown',_,_,_,_],
    [_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_,_,_],
    [_,_,_,'brown',_,_,_,_,_,_,_,'brown',_,_,_,_],
    [_,_,_,'brown',_,_,_,_,_,_,_,'brown',_,_,_,_],
    [_,_,_,'darkBrown',_,_,_,_,_,_,_,'darkBrown',_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Table: top-down rectangle with legs ──
  table_square: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','orange','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','orange','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Round table ──
  table_round: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_,_,_,_],
    [_,_,_,_,'darkBrown','brown','brown','brown','brown','brown','brown','darkBrown',_,_,_,_],
    [_,_,_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','brown','darkBrown',_,_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','orange','cream','cream','cream','cream','cream','cream','orange','brown','darkBrown',_,_],
    [_,_,_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','brown','darkBrown',_,_,_],
    [_,_,_,_,'darkBrown','brown','brown','brown','brown','brown','brown','darkBrown',_,_,_,_],
    [_,_,_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Sofa: wide with back cushion ──
  sofa: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','orange','orange','orange','orange','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','orange','orange','orange','orange','brown','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_],
    [_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_],
    [_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_],
    [_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_],
    [_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_],
    [_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,_,'brown',_,_,_,_,_,_,_,_,_,_,'brown',_,_],
    [_,_,'darkBrown',_,_,_,_,_,_,_,_,_,_,'darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Counter: long rectangle ──
  counter: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','brown','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','brown','darkBrown',_],
    [_,'darkBrown','brown','gold','cream','cream','cream','cream','cream','cream','cream','cream','gold','brown','darkBrown',_],
    [_,'darkBrown','brown','gold','cream','cream','cream','cream','cream','cream','cream','cream','gold','brown','darkBrown',_],
    [_,'darkBrown','brown','gold','cream','cream','cream','cream','cream','cream','cream','cream','gold','brown','darkBrown',_],
    [_,'darkBrown','brown','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','brown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Shelf: rectangle with horizontal shelves ──
  shelf: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','blue','blue','cream','cream','red','red','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','green','cream','cream','cream','purple','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','orange','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Plant: circle foliage with stem ──
  plant: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'darkGreen','darkGreen','darkGreen',_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkGreen','green','green','green','darkGreen',_,_,_,_,_,_],
    [_,_,_,_,'darkGreen','green','green','green','green','green','darkGreen',_,_,_,_,_],
    [_,_,_,'darkGreen','green','green','green','green','green','green','green','darkGreen',_,_,_,_],
    [_,_,_,'darkGreen','green','green','green','green','green','green','green','darkGreen',_,_,_,_],
    [_,_,'darkGreen','green','green','green','green','green','green','green','green','green','darkGreen',_,_,_],
    [_,_,'darkGreen','green','green','green','green','green','green','green','green','green','darkGreen',_,_,_],
    [_,_,'darkGreen','green','green','green','green','green','green','green','green','green','darkGreen',_,_,_],
    [_,_,_,'darkGreen','green','green','green','green','green','green','green','darkGreen',_,_,_,_],
    [_,_,_,'darkGreen','green','green','green','green','green','green','green','darkGreen',_,_,_,_],
    [_,_,_,_,'darkGreen','green','green','green','green','green','darkGreen',_,_,_,_,_],
    [_,_,_,_,_,'darkGreen','darkGreen','brown','darkGreen','darkGreen',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'brown',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkBrown','darkBrown','brown','darkBrown','darkBrown',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Pendant light ──
  pendant_light: createSprite([
    [_,_,_,_,_,_,_,'midGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'midGray','midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,'gold','gold','yellow','gold','gold',_,_,_,_,_,_],
    [_,_,_,_,'gold','yellow','yellow','yellow','yellow','yellow','gold',_,_,_,_,_],
    [_,_,_,'gold','yellow','yellow','yellow','yellow','yellow','yellow','yellow','gold',_,_,_,_],
    [_,_,_,'gold','yellow','yellow','yellow','yellow','yellow','yellow','yellow','gold',_,_,_,_],
    [_,_,'gold','yellow','yellow','yellow','yellow','yellow','yellow','yellow','yellow','yellow','gold',_,_,_],
    [_,_,'gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold',_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Register / POS ──
  register: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','midGray','blue','blue','blue','blue','blue','midGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','midGray','blue','blue','blue','blue','blue','midGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_],
    [_,_,'darkGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','darkGray',_,_,_],
    [_,_,'darkGray','midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray','darkGray',_,_,_],
    [_,_,'darkGray','midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray','darkGray',_,_,_],
    [_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Stool ──
  stool: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray',_,_,_,_,_,_],
    [_,_,_,_,_,'darkGray','midGray','midGray','midGray','midGray','darkGray',_,_,_,_,_],
    [_,_,_,_,'darkGray','midGray','lightGray','lightGray','lightGray','lightGray','midGray','darkGray',_,_,_,_],
    [_,_,_,_,'darkGray','midGray','lightGray','lightGray','lightGray','lightGray','midGray','darkGray',_,_,_,_],
    [_,_,_,_,'darkGray','midGray','lightGray','lightGray','lightGray','lightGray','midGray','darkGray',_,_,_,_],
    [_,_,_,_,_,'darkGray','midGray','midGray','midGray','midGray','darkGray',_,_,_,_,_],
    [_,_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,'midGray',_,'midGray','midGray',_,'midGray',_,_,_,_,_],
    [_,_,_,_,'midGray',_,_,_,_,_,_,'midGray',_,_,_,_],
    [_,_,_,_,'darkGray',_,_,_,_,_,_,'darkGray',_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Partition ──
  partition: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,_,'brown',_,_,_,_,_,_,_,_,_,_,'brown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Sink ──
  sink: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_],
    [_,_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','teal','teal','teal','teal','teal','teal','teal','teal','lightGray','silver',_,_],
    [_,_,'silver','lightGray','teal','blue','blue','blue','blue','blue','blue','teal','lightGray','silver',_,_],
    [_,_,'silver','lightGray','teal','blue','blue','blue','blue','blue','blue','teal','lightGray','silver',_,_],
    [_,_,'silver','lightGray','teal','blue','blue','blue','blue','blue','blue','teal','lightGray','silver',_,_],
    [_,_,'silver','lightGray','teal','teal','teal','teal','teal','teal','teal','teal','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_,_],
    [_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Fridge ──
  fridge: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','white','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','white','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','midGray','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','midGray','silver',_,_,_],
    [_,_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','white','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','white','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','midGray','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','midGray','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','midGray','silver',_,_,_],
    [_,_,_,'silver','white','white','white','white','white','white','white','white','silver',_,_,_],
    [_,_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Display case / Showcase ──
  display_case: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_],
    [_,'midGray','teal','teal','teal','teal','teal','teal','teal','teal','teal','teal','teal','teal','midGray',_],
    [_,'midGray','teal','white','white','white','white','white','white','white','white','white','white','teal','midGray',_],
    [_,'midGray','teal','white','white','white','white','white','white','white','white','white','white','teal','midGray',_],
    [_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_],
    [_,'midGray','teal','white','white','white','white','white','white','white','white','white','white','teal','midGray',_],
    [_,'midGray','teal','white','white','yellow','white','white','white','orange','white','white','white','teal','midGray',_],
    [_,'midGray','teal','white','white','white','white','white','white','white','white','white','white','teal','midGray',_],
    [_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_],
    [_,'midGray','teal','white','white','white','white','white','white','white','white','white','white','teal','midGray',_],
    [_,'midGray','teal','white','white','white','white','white','white','white','white','white','white','teal','midGray',_],
    [_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Bench ──
  bench: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','orange','orange','orange','orange','brown','darkBrown',_],
    [_,'darkBrown','brown','orange','orange','orange','orange','orange','orange','orange','orange','orange','orange','brown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,_,'brown',_,_,_,_,_,_,_,_,_,_,'brown',_,_],
    [_,_,'brown',_,_,_,_,_,_,_,_,_,_,'brown',_,_],
    [_,_,'darkBrown',_,_,_,_,_,_,_,_,_,_,'darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Mirror ──
  mirror: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,'gold','gold','gold','gold','gold','gold','gold','gold','gold','gold',_,_,_],
    [_,_,_,'gold','silver','silver','silver','silver','silver','silver','silver','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','white','white','white','white','white','white','silver','gold',_,_,_],
    [_,_,_,'gold','silver','silver','silver','silver','silver','silver','silver','silver','gold',_,_,_],
    [_,_,_,'gold','gold','gold','gold','gold','gold','gold','gold','gold','gold',_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Desk ──
  desk: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','cream','cream','cream','cream','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'brown',_,_,_,_,_,_,_,_,_,_,'brown',_,_],
    [_,_,'brown','midGray','midGray','midGray','midGray',_,_,_,_,_,_,'brown',_,_],
    [_,_,'brown','midGray','midGray','midGray','midGray',_,_,_,_,_,_,'brown',_,_],
    [_,_,'darkBrown','midGray','midGray','midGray','midGray',_,_,_,_,_,_,'darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Rug ──
  rug: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed',_],
    [_,'darkRed','red','red','red','red','red','red','red','red','red','red','red','red','darkRed',_],
    [_,'darkRed','red','orange','orange','red','red','red','red','red','red','orange','orange','red','darkRed',_],
    [_,'darkRed','red','orange','gold','orange','red','red','red','red','orange','gold','orange','red','darkRed',_],
    [_,'darkRed','red','red','orange','red','red','gold','gold','red','red','orange','red','red','darkRed',_],
    [_,'darkRed','red','red','red','red','gold','gold','gold','gold','red','red','red','red','darkRed',_],
    [_,'darkRed','red','red','red','red','gold','gold','gold','gold','red','red','red','red','darkRed',_],
    [_,'darkRed','red','red','orange','red','red','gold','gold','red','red','orange','red','red','darkRed',_],
    [_,'darkRed','red','orange','gold','orange','red','red','red','red','orange','gold','orange','red','darkRed',_],
    [_,'darkRed','red','orange','orange','red','red','red','red','red','red','orange','orange','red','darkRed',_],
    [_,'darkRed','red','red','red','red','red','red','red','red','red','red','red','red','darkRed',_],
    [_,'darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed','darkRed',_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Flower pot ──
  flower_pot: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'pink','pink','pink','pink',_,_,_,_,_,_],
    [_,_,_,_,_,'pink','pink','red','red','pink','pink',_,_,_,_,_],
    [_,_,_,_,'pink','red','red','pink','pink','red','red','pink',_,_,_,_],
    [_,_,_,_,_,'pink','pink','red','red','pink','pink',_,_,_,_,_],
    [_,_,_,_,_,_,'green','green','green','green',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'green','green',_,_,_,_,_,_,_],
    [_,_,_,_,_,'green',_,'green','green',_,'green',_,_,_,_,_],
    [_,_,_,_,_,_,'green','green','green','green',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'green','green',_,_,_,_,_,_,_],
    [_,_,_,_,_,'brown','brown','brown','brown','brown','brown',_,_,_,_,_],
    [_,_,_,_,_,'brown','darkBrown','darkBrown','darkBrown','darkBrown','brown',_,_,_,_,_],
    [_,_,_,_,_,_,'brown','darkBrown','darkBrown','brown',_,_,_,_,_,_],
    [_,_,_,_,_,_,'brown','brown','brown','brown',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Trash can ──
  trash_can: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,'midGray','midGray','midGray','midGray','midGray','midGray',_,_,_,_,_],
    [_,_,_,_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,'midGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','midGray',_,_,_,_],
    [_,_,_,_,_,'midGray','midGray','midGray','midGray','midGray','midGray',_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Reception desk: L-shaped counter ──
  reception_desk: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','white','white','white','white','white','white','white','white','white','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','white','white','white','white','white','white','white','white','white','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','cream','cream','cream','cream','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,'darkBrown','cream','cream','cream','cream','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,'darkBrown','cream','cream','cream','cream','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,'darkBrown','cream','cream','cream','cream','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,'darkBrown','cream','cream','cream','cream','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Bar table / high table: tall narrow round top ──
  bar_table: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','darkGray',_,_,_],
    [_,_,_,'darkGray','midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray','darkGray',_,_,_],
    [_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'midGray','midGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Kitchen island: wide counter with stovetop ──
  kitchen_island: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','darkGray','darkGray','cream','cream','cream','cream','cream','darkGray','darkGray','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','darkGray','red','cream','cream','cream','cream','cream','darkGray','red','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','darkGray','darkGray','cream','cream','cream','cream','cream','darkGray','darkGray','cream','cream','darkBrown',_],
    [_,'darkBrown','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','cream','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','brown','darkBrown',_],
    [_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Bookcase: tall shelf with books ──
  bookcase: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','red','red','blue','blue','green','brown','red','blue','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','red','red','blue','blue','green','brown','red','blue','orange','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','blue','green','red','orange','brown','blue','red','green','brown','red','darkBrown',_,_],
    [_,_,'darkBrown','blue','green','red','orange','brown','blue','red','green','brown','red','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','orange','brown','blue','red','green','orange','blue','red','brown','green','darkBrown',_,_],
    [_,_,'darkBrown','orange','brown','blue','red','green','orange','blue','red','brown','green','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','green','red','orange','blue','brown','red','green','orange','blue','brown','darkBrown',_,_],
    [_,_,'darkBrown','green','red','orange','blue','brown','red','green','orange','blue','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Wardrobe: tall cabinet with doors ──
  wardrobe: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','darkBrown','darkBrown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','gold','darkBrown','darkBrown','gold','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','cream','cream','brown','darkBrown','darkBrown','brown','cream','cream','brown','darkBrown',_,_],
    [_,_,'darkBrown','brown','brown','brown','brown','darkBrown','darkBrown','brown','brown','brown','brown','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Shoe rack: low shelves with shoes ──
  shoe_rack: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','cream','brown','brown','cream','cream','cream','red','red','cream','cream','darkBrown',_,_],
    [_,_,'darkBrown','cream','brown','brown','cream','cream','cream','red','red','cream','cream','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','cream','cream','blue','blue','cream','cream','cream','darkBrown','darkBrown','cream','darkBrown',_,_],
    [_,_,'darkBrown','cream','cream','blue','blue','cream','cream','cream','darkBrown','darkBrown','cream','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,'darkBrown','cream','green','green','cream','cream','orange','orange','cream','cream','cream','darkBrown',_,_],
    [_,_,'darkBrown','cream','green','green','cream','cream','orange','orange','cream','cream','cream','darkBrown',_,_],
    [_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── TV monitor: wide screen on stand ──
  tv_monitor: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_],
    [_,'darkGray','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkGray',_],
    [_,'darkGray','darkBlue','blue','blue','blue','blue','blue','blue','blue','blue','blue','blue','darkBlue','darkGray',_],
    [_,'darkGray','darkBlue','blue','blue','blue','blue','blue','blue','blue','blue','blue','blue','darkBlue','darkGray',_],
    [_,'darkGray','darkBlue','blue','blue','blue','blue','blue','blue','blue','blue','blue','blue','darkBlue','darkGray',_],
    [_,'darkGray','darkBlue','blue','blue','blue','blue','blue','blue','blue','blue','blue','blue','darkBlue','darkGray',_],
    [_,'darkGray','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkBlue','darkGray',_],
    [_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_],
    [_,_,_,_,_,_,_,'darkGray','darkGray',_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Cash register: small box with buttons and display ──
  cash_register: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,_,'darkGray','green','green','green','green','green','darkGray',_,_,_,_,_],
    [_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','lightGray','white','white','lightGray','white','white','lightGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','lightGray','white','white','lightGray','white','white','lightGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','lightGray','white','white','lightGray','white','white','lightGray','darkGray',_,_,_,_],
    [_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Washing machine: front-load drum ──
  washing_machine: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_,_],
    [_,_,_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_,_,_],
    [_,_,_,'silver','lightGray','lightGray','lightGray','lightGray','midGray','midGray','blue','lightGray','silver',_,_,_],
    [_,_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_,_],
    [_,_,_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_,_,_],
    [_,_,_,'silver','lightGray','lightGray',_,'teal','teal','teal',_,'lightGray','silver',_,_,_],
    [_,_,_,'silver','lightGray',_,'teal','blue','blue','blue','teal',_,'silver',_,_,_],
    [_,_,_,'silver','lightGray',_,'teal','blue','blue','blue','teal',_,'silver',_,_,_],
    [_,_,_,'silver','lightGray',_,'teal','blue','blue','blue','teal',_,'silver',_,_,_],
    [_,_,_,'silver','lightGray','lightGray',_,'teal','teal','teal',_,'lightGray','silver',_,_,_],
    [_,_,_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_,_,_],
    [_,_,_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Coat rack: vertical pole with hooks ──
  coat_rack: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,'midGray','midGray',_,'darkGray',_,'midGray','midGray',_,_,_,_,_],
    [_,_,_,_,_,'midGray',_,'darkGray',_,'midGray',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,'midGray',_,_,_,'darkGray',_,_,_,'midGray',_,_,_,_],
    [_,_,_,_,'midGray',_,_,'darkGray',_,_,'midGray',_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'darkGray',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_,_],
    [_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Umbrella stand: cylinder with umbrellas ──
  umbrella_stand: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'blue',_,_,'red',_,_,_,_,_,_],
    [_,_,_,_,_,'blue','blue',_,'red','red',_,_,_,_,_,_],
    [_,_,_,_,_,'blue',_,_,_,'red',_,_,_,_,_,_],
    [_,_,_,_,_,'blue',_,_,_,'red',_,_,_,_,_,_],
    [_,_,_,_,_,'blue',_,_,_,'red',_,_,_,_,_,_],
    [_,_,_,_,_,'midGray','midGray','midGray','midGray','midGray',_,_,_,_,_,_],
    [_,_,_,_,'midGray','darkGray','darkGray','darkGray','darkGray','darkGray','midGray',_,_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_,_],
    [_,_,_,_,'midGray','darkGray','midGray','midGray','midGray','darkGray','midGray',_,_,_,_,_],
    [_,_,_,_,'midGray','darkGray','darkGray','darkGray','darkGray','darkGray','midGray',_,_,_,_,_],
    [_,_,_,_,_,'midGray','midGray','midGray','midGray','midGray',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Air conditioner: wall unit with vents ──
  air_conditioner: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_],
    [_,'silver','white','white','white','white','white','white','white','white','white','white','white','white','silver',_],
    [_,'silver','white','white','white','white','white','white','white','white','white','white','green','white','silver',_],
    [_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_],
    [_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_],
    [_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_],
    [_,'silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver',_],
    [_,'silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver','silver',_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'teal','teal','teal','teal',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Curtain: draped fabric ──
  curtain: createSprite([
    [_,'gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold',_],
    [_,'gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold','gold',_],
    [_,_,'silver','silver','lightGray','lightGray','lightGray',_,_,'lightGray','lightGray','lightGray','silver','silver',_,_],
    [_,_,'silver','lightGray','lightGray','lightGray',_,_,_,_,'lightGray','lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray',_,_,_,_,_,_,'lightGray','lightGray','silver',_,_],
    [_,_,'silver','lightGray','lightGray','lightGray',_,_,_,_,'lightGray','lightGray','lightGray','silver',_,_],
    [_,_,'silver','silver','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','silver','silver',_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Menu board: blackboard with writing ──
  menu_board: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','yellow','yellow','yellow','yellow','yellow','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','white','white','white','white','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','white','white','white','white','white','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','white','white','white','darkGray','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkGray','darkBrown',_,_,_],
    [_,_,_,'darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown','darkBrown',_,_,_],
    [_,_,_,_,_,_,_,'brown',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,'brown','brown','brown','brown','brown',_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Ceiling fan: top-down view with blades ──
  ceiling_fan: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'silver',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'silver','silver','silver',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'silver',_,_,_,_,_,_,_,_],
    [_,_,_,'lightGray','lightGray',_,_,'silver',_,_,'lightGray','lightGray',_,_,_,_],
    [_,_,'lightGray','lightGray',_,_,_,'silver',_,_,_,'lightGray','lightGray',_,_,_],
    [_,_,_,_,_,_,'silver','silver','silver',_,_,_,_,_,_,_],
    [_,'silver','silver','silver','silver','silver','midGray','gold','midGray','silver','silver','silver','silver','silver',_,_],
    [_,_,_,_,_,_,'silver','silver','silver',_,_,_,_,_,_,_],
    [_,_,'lightGray','lightGray',_,_,_,'silver',_,_,_,'lightGray','lightGray',_,_,_],
    [_,_,_,'lightGray','lightGray',_,_,'silver',_,_,'lightGray','lightGray',_,_,_,_],
    [_,_,_,_,_,_,_,'silver',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,'silver','silver','silver',_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,'silver',_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),

  // ── Clock: round face with hands ──
  clock: createSprite([
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,_,'darkGray','white','white','white','white','white','white','darkGray',_,_,_,_],
    [_,_,_,'darkGray','white','white','white','darkGray','white','white','white','white','darkGray',_,_,_],
    [_,_,_,'darkGray','white','white','white','darkGray','white','white','white','white','darkGray',_,_,_],
    [_,_,_,'darkGray','white','white','white','darkGray','white','white','white','white','darkGray',_,_,_],
    [_,_,_,'darkGray','white','white','white','darkGray','darkGray','darkGray','white','white','darkGray',_,_,_],
    [_,_,_,'darkGray','white','white','white','white','white','white','white','white','darkGray',_,_,_],
    [_,_,_,'darkGray','white','white','white','white','white','white','white','white','darkGray',_,_,_],
    [_,_,_,_,'darkGray','white','white','white','white','white','white','darkGray',_,_,_,_],
    [_,_,_,_,_,'darkGray','darkGray','darkGray','darkGray','darkGray','darkGray',_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ]),
};

// Fallback generic sprite for types without dedicated pixel art
const GENERIC_SPRITE: SpriteData = createSprite([
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','lightGray','midGray',_,_],
  [_,_,'midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray','midGray',_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
]);

// Map furniture types to sprites
function getSpriteForType(type: string): SpriteData {
  if (SPRITES[type]) return SPRITES[type];
  return GENERIC_SPRITE;
}

// ─── Constants ─────────────────────────────────────────────────────────
const PIXEL_SIZE = 12;         // screen px per "dot"
const GRID_SNAP_M = 0.25;     // metres per grid unit
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const WALL_COLOR = PAL.darkGray;
const FLOOR_COLOR_1 = '#d4c4a8';
const FLOOR_COLOR_2 = '#c8b898';
const FLOOR_PLANK_DARK = '#b8a880';
const FLOOR_PLANK_LIGHT = '#dcd0b4';
const FLOOR_PLANK_LINE = '#a09070';
const SHADOW_COLOR = 'rgba(0,0,0,0.18)';
const SELECTION_COLORS = [PAL.yellow, PAL.orange]; // blinking cycle

// ─── Context menu ──────────────────────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  furnitureId: string | null;
}

// ─── Catalog popup ─────────────────────────────────────────────────────
interface CatalogPopupState {
  x: number;
  y: number;
  worldX: number;
  worldZ: number;
}

// ─── Tool types ────────────────────────────────────────────────────────
type PixelTool = 'select' | 'move' | 'rotate' | 'delete' | 'crt';

// ─── Helper: render sprite to canvas ───────────────────────────────────
function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  x: number,
  y: number,
  pixelSize: number,
  rotationSteps: number = 0, // 0, 1, 2, 3 (each = 90 degrees)
) {
  const size = 16;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      let srcRow = row;
      let srcCol = col;
      // Apply rotation by remapping source coordinates
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
        pixelSize,
        pixelSize,
      );
    }
  }
}

// ─── Helper: render mini sprite thumbnail (for palette) ────────────────
function drawMiniSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteData,
  x: number,
  y: number,
  totalSize: number, // e.g. 32px
) {
  const px = totalSize / 16;
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
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

  // Store access
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

  // Local state
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

  // Blink timer for selection highlight — only triggers redraw when an item is selected
  useEffect(() => {
    if (!selectedFurnitureId) return;
    const interval = setInterval(() => {
      setBlinkPhase((p) => (p + 1) % 2);
      needsRedrawRef.current = true;
    }, 400);
    return () => clearInterval(interval);
  }, [selectedFurnitureId]);

  // ── Compute room bounds from walls ──
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

  // ── Room area calculation ──
  const roomArea = useMemo(() => {
    if (walls.length < 3) return 0;
    // Shoelace formula using wall endpoints
    const pts: { x: number; y: number }[] = [];
    for (const w of walls) {
      pts.push(w.start);
    }
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    return Math.abs(area) / 2;
  }, [walls]);

  // ── World <-> screen coordinate conversion ──
  const worldToScreen = useCallback(
    (wx: number, wy: number, canvasWidth: number, canvasHeight: number) => {
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const roomCenterX = (roomBounds.minX + roomBounds.maxX) / 2;
      const roomCenterY = (roomBounds.minY + roomBounds.maxY) / 2;
      const scale = (PIXEL_SIZE * 4) * zoom; // pixels per metre
      return {
        sx: cx + (wx - roomCenterX) * scale + panOffset.x,
        sy: cy + (wy - roomCenterY) * scale + panOffset.y,
      };
    },
    [zoom, panOffset, roomBounds],
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number, canvasWidth: number, canvasHeight: number) => {
      const cx = canvasWidth / 2;
      const cy = canvasHeight / 2;
      const roomCenterX = (roomBounds.minX + roomBounds.maxX) / 2;
      const roomCenterY = (roomBounds.minY + roomBounds.maxY) / 2;
      const scale = (PIXEL_SIZE * 4) * zoom;
      return {
        wx: (sx - cx - panOffset.x) / scale + roomCenterX,
        wy: (sy - cy - panOffset.y) / scale + roomCenterY,
      };
    },
    [zoom, panOffset, roomBounds],
  );

  // ── Snap to grid ──
  const snapToGrid = (v: number) => Math.round(v / GRID_SNAP_M) * GRID_SNAP_M;

  // ── Hit test: which furniture is at screen position? ──
  const hitTestFurniture = useCallback(
    (sx: number, sy: number, cw: number, ch: number): FurnitureItem | null => {
      const scale = (PIXEL_SIZE * 4) * zoom;
      const spriteScreenSize = 16 * (PIXEL_SIZE * zoom * 0.6);
      // Iterate in reverse so topmost drawn item is hit first
      for (let i = furniture.length - 1; i >= 0; i--) {
        const f = furniture[i];
        const { sx: fx, sy: fy } = worldToScreen(f.position[0], f.position[2], cw, ch);
        const half = spriteScreenSize / 2;
        if (sx >= fx - half && sx <= fx + half && sy >= fy - half && sy <= fy + half) {
          return f;
        }
      }
      return null;
    },
    [furniture, zoom, worldToScreen],
  );

  // ── Resize: set canvas dimensions only on resize ──
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

    // ── Background (dark) ──
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    // ── Vignette ──
    const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, W, H);

    const scale = (PIXEL_SIZE * 4) * zoom; // px per metre
    const spritePixelSize = PIXEL_SIZE * zoom * 0.6;

    // ── Draw floor tiles ──
    if (walls.length > 0) {
      const tileSize = GRID_SNAP_M * scale; // each tile in screen px
      const { sx: floorLeft, sy: floorTop } = worldToScreen(roomBounds.minX, roomBounds.minY, W, H);
      const { sx: floorRight, sy: floorBottom } = worldToScreen(roomBounds.maxX, roomBounds.maxY, W, H);

      // Clip to room polygon for cleaner look
      ctx.save();

      // Build floor polygon from walls for clipping
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

      // Flooring pattern — herringbone-style dot planks
      const startCol = Math.floor((floorLeft) / tileSize) - 1;
      const endCol = Math.ceil((floorRight) / tileSize) + 1;
      const startRow = Math.floor((floorTop) / tileSize) - 1;
      const endRow = Math.ceil((floorBottom) / tileSize) + 1;
      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          // Base plank color alternates in pairs for herringbone illusion
          const plankGroup = Math.floor(c / 2) + Math.floor(r / 2);
          const isLight = plankGroup % 2 === 0;
          ctx.fillStyle = isLight ? FLOOR_COLOR_1 : FLOOR_COLOR_2;
          ctx.fillRect(c * tileSize, r * tileSize, tileSize + 1, tileSize + 1);

          // Wood grain dots (tiny pixel detail)
          const grainSeed = ((c * 7 + r * 13) & 0xFF);
          if (grainSeed % 5 === 0) {
            ctx.fillStyle = isLight ? FLOOR_PLANK_LIGHT : FLOOR_PLANK_DARK;
            const gx = c * tileSize + (grainSeed % 3 + 1) * (tileSize / 5);
            const gy = r * tileSize + ((grainSeed >> 2) % 3 + 1) * (tileSize / 5);
            const dotSize = Math.max(1, tileSize / 8);
            ctx.fillRect(gx, gy, dotSize, dotSize);
          }

          // Plank edge lines (horizontal seams every 2 rows, vertical every 4 cols staggered)
          ctx.fillStyle = FLOOR_PLANK_LINE;
          if (r % 2 === 0) {
            ctx.fillRect(c * tileSize, r * tileSize, tileSize + 1, Math.max(1, tileSize / 12));
          }
          if ((c + (r % 2 === 0 ? 0 : 2)) % 4 === 0) {
            ctx.fillRect(c * tileSize, r * tileSize, Math.max(1, tileSize / 12), tileSize + 1);
          }
        }
      }
      ctx.restore();
    }

    // ── Draw walls ──
    const wallThicknessPx = Math.max(4, 0.12 * scale);
    ctx.strokeStyle = WALL_COLOR;
    ctx.lineWidth = wallThicknessPx;
    ctx.lineCap = 'square';
    for (const w of walls) {
      const p1 = worldToScreen(w.start.x, w.start.y, W, H);
      const p2 = worldToScreen(w.end.x, w.end.y, W, H);
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy);
      ctx.lineTo(p2.sx, p2.sy);
      ctx.stroke();
    }

    // ── Draw openings (gaps in walls) ──
    ctx.strokeStyle = '#5c8aad';
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
      // Draw opening indicator
      ctx.beginPath();
      ctx.moveTo(o1.sx, o1.sy);
      ctx.lineTo(o2.sx, o2.sy);
      ctx.stroke();
      // Door arc indicator
      if (op.type === 'door') {
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(o1.sx, o1.sy, Math.abs(o2.sx - o1.sx) || Math.abs(o2.sy - o1.sy), 0, Math.PI / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Draw furniture ──
    for (const f of furniture) {
      const { sx: fx, sy: fy } = worldToScreen(f.position[0], f.position[2], W, H);
      const sprite = getSpriteForType(f.type);
      const spriteSize = 16 * spritePixelSize;
      const halfSprite = spriteSize / 2;

      // Shadow
      ctx.fillStyle = SHADOW_COLOR;
      ctx.beginPath();
      ctx.ellipse(fx + 2, fy + 3, halfSprite * 0.8, halfSprite * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Rotation: convert radians to 90-degree steps
      const rotSteps = Math.round((f.rotation[1] / (Math.PI / 2))) % 4;

      // Draw sprite
      drawSprite(ctx, sprite, fx - halfSprite, fy - halfSprite, spritePixelSize, rotSteps);

      // Selection highlight (blinking pixel frame)
      if (f.id === selectedFurnitureId) {
        const selColor = SELECTION_COLORS[blinkPhase];
        const altColor = SELECTION_COLORS[(blinkPhase + 1) % 2];
        const margin = 3;
        const bx = fx - halfSprite - margin;
        const by = fy - halfSprite - margin;
        const bw = spriteSize + margin * 2;
        const bh = spriteSize + margin * 2;
        const pxSz = Math.max(2, spritePixelSize * 0.4);

        // Draw pixel-art dashed border (alternating colored squares)
        const stepsH = Math.ceil(bw / pxSz);
        const stepsV = Math.ceil(bh / pxSz);
        for (let i = 0; i < stepsH; i++) {
          ctx.fillStyle = i % 2 === 0 ? selColor : altColor;
          // Top edge
          ctx.fillRect(bx + i * pxSz, by, pxSz, pxSz);
          // Bottom edge
          ctx.fillRect(bx + i * pxSz, by + bh - pxSz, pxSz, pxSz);
        }
        for (let i = 1; i < stepsV - 1; i++) {
          ctx.fillStyle = i % 2 === 0 ? selColor : altColor;
          // Left edge
          ctx.fillRect(bx, by + i * pxSz, pxSz, pxSz);
          // Right edge
          ctx.fillRect(bx + bw - pxSz, by + i * pxSz, pxSz, pxSz);
        }

        // Corner dots (bright)
        ctx.fillStyle = PAL.white;
        ctx.fillRect(bx, by, pxSz, pxSz);
        ctx.fillRect(bx + bw - pxSz, by, pxSz, pxSz);
        ctx.fillRect(bx, by + bh - pxSz, pxSz, pxSz);
        ctx.fillRect(bx + bw - pxSz, by + bh - pxSz, pxSz, pxSz);
      }
    }

    // ── Room info text (retro style) ──
    if (roomArea > 0) {
      const tsubo = roomArea / 3.30579;
      const text = `${roomArea.toFixed(1)}m\u00B2 / ${tsubo.toFixed(1)}\u5764`;
      ctx.font = '600 13px "Courier New", monospace';
      ctx.fillStyle = PAL.yellow;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      // BG box
      const tm = ctx.measureText(text);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(8, H - 32, tm.width + 16, 24);
      ctx.fillStyle = PAL.yellow;
      ctx.fillText(text, 16, H - 27);
    }
  }, [walls, furniture, openings, selectedFurnitureId, zoom, panOffset, roomBounds, worldToScreen, blinkPhase, roomArea]);

  // ── Mark redraw needed when deps change ──
  useEffect(() => {
    needsRedrawRef.current = true;
  }, [walls, furniture, openings, selectedFurnitureId, zoom, panOffset, roomBounds, blinkPhase, roomArea]);

  // ── Render loop: only redraws when flagged ──
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

  // ── Resize observer ──
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
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case '1':
          e.preventDefault();
          setActiveTool('select');
          break;
        case '2':
          e.preventDefault();
          setActiveTool('move');
          break;
        case '3':
          e.preventDefault();
          setActiveTool('rotate');
          break;
        case '4':
          e.preventDefault();
          setActiveTool('delete');
          break;
        case '5':
          e.preventDefault();
          setCrtEnabled(prev => !prev);
          break;
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
      // Pinch zoom start
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
      if (hit) {
        rotateFurniture(hit.id, hit.rotation[1] + Math.PI / 2);
      }
      return;
    }

    // Select / Move
    const hit = hitTestFurniture(sx, sy, cw, ch);
    if (hit) {
      setSelectedFurniture(hit.id);
      if (activeTool === 'select' || activeTool === 'move') {
        const world = screenToWorld(sx, sy, cw, ch);
        setDragging({
          id: hit.id,
          startWorld: { x: world.wx, z: world.wy },
          startPos: [...hit.position],
        });
      }
    } else {
      setSelectedFurniture(null);
      // Start panning on empty area
      setIsPanning(true);
      panStartRef.current = { x: touch.clientX, y: touch.clientY, ox: panOffset.x, oy: panOffset.y };
    }
  }, [activeTool, hitTestFurniture, selectedFurnitureId, panOffset, zoom, setSelectedFurniture, deleteFurniture, rotateFurniture, screenToWorld, getTouchCanvasPos]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    // Pinch zoom
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

      // Detect double-tap for catalog popup
      if (touchStartRef.current && !dragging && !isPanning) {
        // If the touch was very short and didn't move, treat tap as select only
        // Double-tap handled by onDoubleClick fallback
      }

      setIsPanning(false);
      setDragging(null);
      touchStartRef.current = null;
    }
  }, [dragging, isPanning]);

  // ── Mouse handlers ──
  const getCanvasPos = (e: React.MouseEvent): { sx: number; sy: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { sx: 0, sy: 0 };
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu(null);
    setCatalogPopup(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { sx, sy } = { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
    const cw = rect.width;
    const ch = rect.height;

    // Middle mouse or space+click for panning
    if (e.button === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: panOffset.x, oy: panOffset.y };
      return;
    }

    // Right click -> context menu
    if (e.button === 2) {
      const hit = hitTestFurniture(sx, sy, cw, ch);
      if (hit) {
        setSelectedFurniture(hit.id);
        setContextMenu({ x: e.clientX, y: e.clientY, furnitureId: hit.id });
      }
      return;
    }

    // Left click
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
      if (hit) {
        rotateFurniture(hit.id, hit.rotation[1] + Math.PI / 2);
      }
      return;
    }

    // Select / Move
    const hit = hitTestFurniture(sx, sy, cw, ch);
    if (hit) {
      setSelectedFurniture(hit.id);
      if (activeTool === 'select' || activeTool === 'move') {
        const world = screenToWorld(sx, sy, cw, ch);
        setDragging({
          id: hit.id,
          startWorld: { x: world.wx, z: world.wy },
          startPos: [...hit.position],
        });
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
      setCatalogPopup({
        x: e.clientX,
        y: e.clientY,
        worldX: snapToGrid(world.wx),
        worldZ: snapToGrid(world.wy),
      });
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

  // ── Context menu actions ──
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

  // ── Add furniture from catalog ──
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

  // ── Tool buttons data ──
  const tools: { key: PixelTool; label: string; shortcut: string; iconPath: string }[] = [
    { key: 'select', label: 'SELECT', shortcut: '1', iconPath: 'M5 3l10 8-5 2-3 5-2-1 3-5 5-2z' },
    { key: 'move', label: 'MOVE', shortcut: '2', iconPath: 'M8 2l2 4h-4l2-4zm0 14l-2-4h4l-2 4zm-6-6l4-2v4l-4-2zm14 0l-4 2v-4l4 2z' },
    { key: 'rotate', label: 'ROTATE', shortcut: '3', iconPath: 'M12 4a6 6 0 11-6 6h2a4 4 0 104-4V4l3 3-3 3V6z' },
    { key: 'delete', label: 'DELETE', shortcut: '4', iconPath: 'M4 4l10 10M14 4L4 14' },
  ];

  // Side palette: ALL furniture grouped by category
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
    // Add near center of current view
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
    <div ref={containerRef} className="relative w-full h-full flex flex-col bg-[#1a1a2e] overflow-hidden select-none">
      {/* ── Retro toolbar ── */}
      <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-[#16213e] border-b border-[#0f3460]">
        {tools.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTool(t.key)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all ${
              activeTool === t.key
                ? 'bg-[#e94560] text-white shadow-[0_0_8px_rgba(233,69,96,0.5)]'
                : 'bg-[#1a1a40] text-[#9e9e9e] hover:bg-[#2a2a50] hover:text-white'
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

        {/* Separator */}
        <div className="w-px h-5 bg-[#2a2a50] mx-1" />

        {/* CRT toggle */}
        <button
          onClick={() => setCrtEnabled(!crtEnabled)}
          className={`px-2.5 py-1.5 rounded text-[10px] font-bold tracking-wider font-mono transition-all ${
            crtEnabled
              ? 'bg-[#533483] text-white shadow-[0_0_8px_rgba(83,52,131,0.5)]'
              : 'bg-[#1a1a40] text-[#9e9e9e] hover:bg-[#2a2a50] hover:text-white'
          }`}
          title="CRT Effect [5]"
        >
          CRT
          <span className="hidden sm:inline text-[8px] opacity-50 ml-0.5">[5]</span>
        </button>

        {/* Zoom display */}
        <div className="ml-auto text-[10px] font-mono text-[#5a5a5a] px-2">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Side furniture palette ── */}
        <div className="flex-shrink-0 w-[52px] bg-[#16213e] border-r border-[#0f3460] overflow-y-auto scrollbar-thin">
          <div className="py-1 px-0.5">
            {paletteCategories.map((cat) => (
              <div key={cat.label}>
                <div className="text-[7px] font-mono font-bold text-[#5a5a5a] text-center py-0.5 border-b border-[#2a2a50] mb-0.5">
                  {cat.label}
                </div>
                <div className="space-y-1 mb-1">
                  {cat.items.map((item) => (
                    <button
                      key={item.type}
                      onClick={() => handlePaletteAdd(item.type)}
                      className="w-full aspect-square bg-[#1a1a40] rounded border border-[#2a2a50] hover:border-[#e94560] hover:bg-[#2a2a50] transition-all group relative"
                      title={item.name}
                    >
                      <PaletteThumbnail type={item.type} />
                      {/* Tooltip */}
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

          {/* CRT composite overlay: scanlines + color bleed + vignette + curvature */}
          {crtEnabled && (
            <>
              {/* Scanlines */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 1px, transparent 1px, transparent 3px)',
                  mixBlendMode: 'multiply',
                }}
              />
              {/* RGB color bleed — horizontal sub-pixel stripes */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'repeating-linear-gradient(90deg, rgba(255,0,0,0.03) 0px, rgba(0,255,0,0.03) 1px, rgba(0,0,255,0.03) 2px, transparent 3px)',
                  mixBlendMode: 'screen',
                }}
              />
              {/* Vignette burn — darker corners */}
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)',
                }}
              />
              {/* Slight barrel-distortion glow at edges */}
              <div
                className="absolute inset-0 pointer-events-none z-10 rounded-[8px]"
                style={{
                  boxShadow: 'inset 0 0 80px 20px rgba(0,0,0,0.3), inset 0 0 4px 1px rgba(255,255,255,0.02)',
                }}
              />
            </>
          )}

          {/* Empty state */}
          {walls.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center px-6 py-4 bg-black/50 rounded-lg border border-[#2a2a50]">
                <div className="text-[#e94560] font-mono text-sm font-bold mb-1">NO ROOM DATA</div>
                <div className="text-[#5a5a5a] font-mono text-[10px]">
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
            className="fixed z-50 bg-[#16213e] border border-[#0f3460] rounded shadow-2xl shadow-black/50 min-w-[140px] py-1"
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
                    ? 'text-[#e94560] hover:bg-[#e94560]/20'
                    : 'text-[#9e9e9e] hover:bg-[#2a2a50] hover:text-white'
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
            className="fixed z-50 bg-[#16213e] border border-[#0f3460] rounded-lg shadow-2xl shadow-black/50 p-2 max-w-[280px] max-h-[320px] overflow-y-auto"
            style={{
              left: Math.min(catalogPopup.x, window.innerWidth - 300),
              top: Math.min(catalogPopup.y, window.innerHeight - 340),
            }}
          >
            <div className="text-[10px] font-mono font-bold text-[#e94560] px-1 pb-1 border-b border-[#2a2a50] mb-1">
              ADD FURNITURE
            </div>
            <div className="grid grid-cols-4 gap-1">
              {FURNITURE_CATALOG.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleCatalogAdd(item.type)}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded bg-[#1a1a40] hover:bg-[#2a2a50] border border-transparent hover:border-[#e94560] transition-all"
                  title={item.name}
                >
                  <CatalogThumbnail type={item.type} />
                  <span className="text-[8px] font-mono text-[#9e9e9e] truncate w-full text-center">
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

// ── Palette thumbnail: renders sprite on a tiny canvas ──
function PaletteThumbnail({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = 32;
    canvas.height = 32;
    ctx.clearRect(0, 0, 32, 32);
    const sprite = getSpriteForType(type);
    drawMiniSprite(ctx, sprite, 0, 0, 32);
  }, [type]);
  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
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
    canvas.width = 24;
    canvas.height = 24;
    ctx.clearRect(0, 0, 24, 24);
    const sprite = getSpriteForType(type);
    drawMiniSprite(ctx, sprite, 0, 0, 24);
  }, [type]);
  return (
    <canvas
      ref={canvasRef}
      width={24}
      height={24}
      className="w-6 h-6"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
