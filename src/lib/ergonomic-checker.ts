import { FurnitureItem, FurnitureType } from '@/types/scene';
import { WallSegment, Opening } from '@/types/floor-plan';

export type ErgonomicSeverity = 'warning' | 'error';

export interface ErgonomicIssue {
  type: string;
  severity: ErgonomicSeverity;
  message: string;
  furnitureIds: string[];
  position: [number, number, number];
}

interface AABB2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function getAABB(item: FurnitureItem): AABB2D {
  const [px, , pz] = item.position;
  const [sx, , sz] = item.scale;
  const ry = item.rotation[1];
  const cosR = Math.abs(Math.cos(ry));
  const sinR = Math.abs(Math.sin(ry));
  const halfX = (sx * cosR + sz * sinR) / 2;
  const halfZ = (sx * sinR + sz * cosR) / 2;
  return { minX: px - halfX, maxX: px + halfX, minZ: pz - halfZ, maxZ: pz + halfZ };
}

function aabbDistance(a: AABB2D, b: AABB2D): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function distToWallSegment(px: number, pz: number, wall: WallSegment): number {
  const ax = wall.start.x, az = wall.start.y;
  const bx = wall.end.x, bz = wall.end.y;
  const abx = bx - ax, abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  return Math.sqrt((px - ax - t * abx) ** 2 + (pz - az - t * abz) ** 2);
}

function minDistToWalls(item: FurnitureItem, walls: WallSegment[]): number {
  const aabb = getAABB(item);
  const cx = (aabb.minX + aabb.maxX) / 2;
  const cz = (aabb.minZ + aabb.maxZ) / 2;
  const halfX = (aabb.maxX - aabb.minX) / 2;
  const halfZ = (aabb.maxZ - aabb.minZ) / 2;
  const extentMax = Math.max(halfX, halfZ);

  let minDist = Infinity;
  for (const wall of walls) {
    const d = distToWallSegment(cx, cz, wall) - extentMax;
    if (d < minDist) minDist = d;
  }
  return Math.max(0, minDist);
}

const TABLE_TYPES: FurnitureType[] = ['table_square', 'table_round', 'counter', 'bar_table', 'kitchen_island'];
const SEATING_TYPES: FurnitureType[] = ['chair', 'stool', 'bench', 'sofa'];

function getOpeningWorldPos(opening: Opening, walls: WallSegment[]): [number, number, number] | null {
  const wall = walls.find(w => w.id === opening.wallId);
  if (!wall) return null;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return null;
  const t = opening.positionAlongWall / len;
  const x = wall.start.x + dx * t;
  const z = wall.start.y + dy * t;
  return [x, 0, z];
}

export function checkErgonomics(
  furniture: FurnitureItem[],
  walls: WallSegment[],
  openings: Opening[]
): ErgonomicIssue[] {
  const issues: ErgonomicIssue[] = [];
  const aabbs = furniture.map(f => ({ item: f, aabb: getAABB(f) }));

  // Rule 1: Table-chair distance (0.6-0.8m ideal)
  const tables = aabbs.filter(f => TABLE_TYPES.includes(f.item.type));
  const seats = aabbs.filter(f => SEATING_TYPES.includes(f.item.type));

  for (const table of tables) {
    for (const seat of seats) {
      const dist = aabbDistance(table.aabb, seat.aabb);
      if (dist > 0 && dist < 0.4) {
        issues.push({
          type: 'table_chair_too_close',
          severity: 'warning',
          message: `${table.item.name}と${seat.item.name}の間隔が${dist.toFixed(2)}mです。座るには最低0.6m必要です。`,
          furnitureIds: [table.item.id, seat.item.id],
          position: seat.item.position,
        });
      } else if (dist > 1.2) {
        // too far - only warn for chairs near tables
        const midX = (table.item.position[0] + seat.item.position[0]) / 2;
        const midZ = (table.item.position[2] + seat.item.position[2]) / 2;
        if (dist < 2.0) {
          issues.push({
            type: 'table_chair_too_far',
            severity: 'warning',
            message: `${table.item.name}と${seat.item.name}の間隔が${dist.toFixed(2)}mです。快適な距離は0.6〜0.8mです。`,
            furnitureIds: [table.item.id, seat.item.id],
            position: [midX, 0, midZ],
          });
        }
      }
    }
  }

  // Rule 2: Aisle width (min 0.9m ADA, recommended 1.2m)
  for (let i = 0; i < aabbs.length; i++) {
    for (let j = i + 1; j < aabbs.length; j++) {
      const dist = aabbDistance(aabbs[i].aabb, aabbs[j].aabb);
      if (dist > 0 && dist < 0.9) {
        const midX = (aabbs[i].item.position[0] + aabbs[j].item.position[0]) / 2;
        const midZ = (aabbs[i].item.position[2] + aabbs[j].item.position[2]) / 2;
        issues.push({
          type: 'aisle_too_narrow',
          severity: dist < 0.6 ? 'error' : 'warning',
          message: `${aabbs[i].item.name}と${aabbs[j].item.name}の間隔が${dist.toFixed(2)}mです。通路幅は最低0.9m（車椅子対応は1.2m）必要です。`,
          furnitureIds: [aabbs[i].item.id, aabbs[j].item.id],
          position: [midX, 0, midZ],
        });
      }
    }
  }

  // Rule 3: Counter height vs stool (stool seat 25-30cm below counter)
  const counters = aabbs.filter(f => f.item.type === 'counter' || f.item.type === 'bar_table');
  const stools = aabbs.filter(f => f.item.type === 'stool');
  for (const counter of counters) {
    for (const stool of stools) {
      const dist = aabbDistance(counter.aabb, stool.aabb);
      if (dist < 1.5) {
        const counterH = counter.item.scale[1];
        const stoolH = stool.item.scale[1];
        const diff = counterH - stoolH;
        if (diff < 0.2 || diff > 0.35) {
          issues.push({
            type: 'counter_stool_height',
            severity: 'warning',
            message: `カウンター高${counterH.toFixed(2)}mに対しスツール高${stoolH.toFixed(2)}mです。差が25〜30cmが理想です（現在${(diff * 100).toFixed(0)}cm差）。`,
            furnitureIds: [counter.item.id, stool.item.id],
            position: stool.item.position,
          });
        }
      }
    }
  }

  // Rule 4: Door clearance (min 1.0m clear zone)
  const doors = openings.filter(o => o.type === 'door');
  for (const door of doors) {
    const doorPos = getOpeningWorldPos(door, walls);
    if (!doorPos) continue;

    for (const { item, aabb } of aabbs) {
      const cx = (aabb.minX + aabb.maxX) / 2;
      const cz = (aabb.minZ + aabb.maxZ) / 2;
      const halfX = (aabb.maxX - aabb.minX) / 2;
      const halfZ = (aabb.maxZ - aabb.minZ) / 2;

      const dx = Math.max(Math.abs(doorPos[0] - cx) - halfX, 0);
      const dz = Math.max(Math.abs(doorPos[2] - cz) - halfZ, 0);
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 1.0) {
        issues.push({
          type: 'door_clearance',
          severity: dist < 0.5 ? 'error' : 'warning',
          message: `ドア前の${item.name}までの距離が${dist.toFixed(2)}mです。ドア前には最低1.0mの空間が必要です。`,
          furnitureIds: [item.id],
          position: doorPos,
        });
      }
    }
  }

  // Rule 5: Wall-to-furniture (min 0.45m for passage)
  for (const { item } of aabbs) {
    const wallDist = minDistToWalls(item, walls);
    if (wallDist > 0 && wallDist < 0.45) {
      issues.push({
        type: 'wall_clearance',
        severity: 'warning',
        message: `${item.name}と壁の間隔が${wallDist.toFixed(2)}mです。通行には最低0.45m必要です。`,
        furnitureIds: [item.id],
        position: item.position,
      });
    }
  }

  return issues;
}
