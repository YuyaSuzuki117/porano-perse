import { FurnitureItem, FurnitureType } from '@/types/scene';
import { WallSegment } from '@/types/floor-plan';

export interface Obstruction {
  furnitureId: string;
  type: 'door' | 'drawer';
  blockedBy: string; // furniture id or 'wall'
  clearance: number; // actual meters
  required: number;  // required meters
  message: string;
}

interface AABB2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Furniture types that have front-opening doors/drawers */
const FRONT_OPENING_TYPES: Record<FurnitureType, { openingType: 'door' | 'drawer'; clearance: number }> = {
  wardrobe: { openingType: 'door', clearance: 0.6 },
  fridge: { openingType: 'door', clearance: 0.6 },
  shelf: { openingType: 'door', clearance: 0.5 },
  sink: { openingType: 'drawer', clearance: 0.5 },
  bookcase: { openingType: 'door', clearance: 0.5 },
  display_case: { openingType: 'door', clearance: 0.6 },
} as Record<string, { openingType: 'door' | 'drawer'; clearance: number }>;

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

/**
 * Get the front zone AABB (the area that must be clear for door/drawer to open).
 * "Front" is the -Z direction in the furniture's local space, rotated by Y rotation.
 */
function getFrontClearanceZone(item: FurnitureItem, clearance: number): AABB2D {
  const [px, , pz] = item.position;
  const [sx, , sz] = item.scale;
  const ry = item.rotation[1];

  // Front direction in world space (local -Z rotated by ry)
  const frontDirX = -Math.sin(ry);
  const frontDirZ = -Math.cos(ry);

  // Right direction in world space
  const rightDirX = Math.cos(ry);
  const rightDirZ = -Math.sin(ry);

  // Front zone center: from furniture center, offset forward by (sz/2 + clearance/2)
  const offsetDist = sz / 2 + clearance / 2;
  const cx = px + frontDirX * offsetDist;
  const cz = pz + frontDirZ * offsetDist;

  // Zone dimensions: width = furniture width, depth = clearance
  const halfW = sx / 2;
  const halfD = clearance / 2;

  // Compute AABB of the rotated zone
  const absRightX = Math.abs(rightDirX);
  const absRightZ = Math.abs(rightDirZ);
  const absFrontX = Math.abs(frontDirX);
  const absFrontZ = Math.abs(frontDirZ);

  const extentX = halfW * absRightX + halfD * absFrontX;
  const extentZ = halfW * absRightZ + halfD * absFrontZ;

  return {
    minX: cx - extentX,
    maxX: cx + extentX,
    minZ: cz - extentZ,
    maxZ: cz + extentZ,
  };
}

function aabbOverlap(a: AABB2D, b: AABB2D): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function aabbDistance(a: AABB2D, b: AABB2D): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function distToWall(zone: AABB2D, wall: WallSegment): number {
  // Check min distance from any point in zone to wall segment
  const cx = (zone.minX + zone.maxX) / 2;
  const cz = (zone.minZ + zone.maxZ) / 2;

  const ax = wall.start.x, az = wall.start.y;
  const bx = wall.end.x, bz = wall.end.y;
  const abx = bx - ax, abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq === 0) return Math.sqrt((cx - ax) ** 2 + (cz - az) ** 2);

  const t = Math.max(0, Math.min(1, ((cx - ax) * abx + (cz - az) * abz) / lenSq));
  const projX = ax + t * abx;
  const projZ = az + t * abz;

  // Distance from zone edge to wall point
  const dx = Math.max(zone.minX - projX, projX - zone.maxX, 0);
  const dz = Math.max(zone.minZ - projZ, projZ - zone.maxZ, 0);
  return Math.sqrt(dx * dx + dz * dz);
}

const TYPE_NAME_MAP: Record<string, string> = {
  wardrobe: 'ワードローブ',
  fridge: '冷蔵庫',
  shelf: '棚',
  sink: 'シンク',
  bookcase: '本棚',
  display_case: 'ショーケース',
};

export function detectObstructions(
  furniture: FurnitureItem[],
  walls: WallSegment[]
): Obstruction[] {
  const obstructions: Obstruction[] = [];
  const allAABBs = furniture.map(f => ({ item: f, aabb: getAABB(f) }));

  for (const item of furniture) {
    const config = FRONT_OPENING_TYPES[item.type];
    if (!config) continue;

    const frontZone = getFrontClearanceZone(item, config.clearance);
    const itemName = item.name || TYPE_NAME_MAP[item.type] || item.type;

    // Check against other furniture
    for (const { item: other, aabb: otherAABB } of allAABBs) {
      if (other.id === item.id) continue;

      if (aabbOverlap(frontZone, otherAABB)) {
        const actualClearance = aabbDistance(getAABB(item), otherAABB);
        const otherName = other.name || other.type;
        obstructions.push({
          furnitureId: item.id,
          type: config.openingType,
          blockedBy: other.id,
          clearance: actualClearance,
          required: config.clearance,
          message: `${itemName}の${config.openingType === 'door' ? '扉' : '引き出し'}が${otherName}に干渉しています（間隔${actualClearance.toFixed(2)}m、必要${config.clearance}m）`,
        });
      }
    }

    // Check against walls
    for (const wall of walls) {
      const wallDist = distToWall(frontZone, wall);
      if (wallDist < 0.05) {
        const actualClearance = distToWall(getAABB(item), wall);
        obstructions.push({
          furnitureId: item.id,
          type: config.openingType,
          blockedBy: 'wall',
          clearance: actualClearance,
          required: config.clearance,
          message: `${itemName}の${config.openingType === 'door' ? '扉' : '引き出し'}が壁に干渉しています（間隔${actualClearance.toFixed(2)}m、必要${config.clearance}m）`,
        });
      }
    }
  }

  return obstructions;
}
