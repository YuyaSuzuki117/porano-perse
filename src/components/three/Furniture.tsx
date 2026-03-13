'use client';

import { useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { FurnitureItem } from '@/types/scene';

interface FurnitureProps {
  item: FurnitureItem;
  selected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, position: [number, number, number]) => void;
}

export function Furniture({ item, selected, onSelect, onMove }: FurnitureProps) {
  const ref = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragOffset = useRef(new THREE.Vector3());

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect(item.id);
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    const intersect = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersect);
    dragOffset.current.copy(intersect).sub(new THREE.Vector3(...item.position));
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!isDragging) return;
    e.stopPropagation();

    const intersect = new THREE.Vector3();
    e.ray.intersectPlane(dragPlane.current, intersect);
    const newPos: [number, number, number] = [
      intersect.x - dragOffset.current.x,
      item.position[1],
      intersect.z - dragOffset.current.z,
    ];
    onMove(item.id, newPos);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <group
      ref={ref}
      position={item.position}
      rotation={item.rotation}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <FurnitureModel type={item.type} scale={item.scale} color={item.color} />
      {selected && <SelectionIndicator scale={item.scale} />}
    </group>
  );
}

function SelectionIndicator({ scale }: { scale: [number, number, number] }) {
  const maxDim = Math.max(scale[0], scale[2]) + 0.2;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <ringGeometry args={[maxDim * 0.4, maxDim * 0.5, 32]} />
      <meshBasicMaterial color="#3B82F6" transparent opacity={0.6} />
    </mesh>
  );
}

function FurnitureModel({ type, scale, color }: { type: string; scale: [number, number, number]; color: string }) {
  switch (type) {
    case 'counter':
      return <Counter scale={scale} color={color} />;
    case 'table_square':
      return <TableSquare scale={scale} color={color} />;
    case 'table_round':
      return <TableRound scale={scale} color={color} />;
    case 'chair':
      return <Chair scale={scale} color={color} />;
    case 'stool':
      return <Stool scale={scale} color={color} />;
    case 'sofa':
      return <Sofa scale={scale} color={color} />;
    case 'shelf':
      return <Shelf scale={scale} color={color} />;
    case 'pendant_light':
      return <PendantLight scale={scale} color={color} />;
    case 'plant':
      return <Plant scale={scale} color={color} />;
    case 'partition':
      return <Partition scale={scale} color={color} />;
    default:
      return (
        <mesh position={[0, scale[1] / 2, 0]} castShadow>
          <boxGeometry args={scale} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
  }
}

function Counter({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h, d] = scale;
  return (
    <group>
      {/* 天板 */}
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[w, 0.05, d]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      {/* 本体 */}
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h - 0.05, d - 0.1]} />
        <meshStandardMaterial color={adjustColor(color, -20)} roughness={0.7} />
      </mesh>
    </group>
  );
}

function TableSquare({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h, d] = scale;
  const legW = 0.04;
  return (
    <group>
      <mesh position={[0, h, 0]} castShadow>
        <boxGeometry args={[w, 0.03, d]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} position={[x * (w / 2 - legW), h / 2, z * (d / 2 - legW)]} castShadow>
          <boxGeometry args={[legW, h, legW]} />
          <meshStandardMaterial color={adjustColor(color, -30)} />
        </mesh>
      ))}
    </group>
  );
}

function TableRound({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h] = scale;
  return (
    <group>
      <mesh position={[0, h, 0]} castShadow>
        <cylinderGeometry args={[w / 2, w / 2, 0.03, 32]} />
        <meshStandardMaterial color={color} roughness={0.4} />
      </mesh>
      <mesh position={[0, h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, h, 8]} />
        <meshStandardMaterial color={adjustColor(color, -30)} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[w / 4, w / 4, 0.03, 32]} />
        <meshStandardMaterial color={adjustColor(color, -30)} />
      </mesh>
    </group>
  );
}

function Chair({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h, d] = scale;
  const seatH = h * 0.5;
  const legW = 0.03;
  return (
    <group>
      {/* 座面 */}
      <mesh position={[0, seatH, 0]} castShadow>
        <boxGeometry args={[w, 0.03, d]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 背もたれ */}
      <mesh position={[0, h * 0.75, -d / 2 + 0.015]} castShadow>
        <boxGeometry args={[w, h * 0.5, 0.03]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {/* 脚 */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} position={[x * (w / 2 - legW), seatH / 2, z * (d / 2 - legW)]}>
          <boxGeometry args={[legW, seatH, legW]} />
          <meshStandardMaterial color={adjustColor(color, -40)} />
        </mesh>
      ))}
    </group>
  );
}

function Stool({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h] = scale;
  return (
    <group>
      <mesh position={[0, h, 0]} castShadow>
        <cylinderGeometry args={[w / 2, w / 2, 0.04, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const angle = (i * Math.PI * 2) / 4;
        return (
          <mesh key={i} position={[Math.cos(angle) * w * 0.3, h / 2, Math.sin(angle) * w * 0.3]}>
            <cylinderGeometry args={[0.015, 0.02, h, 6]} />
            <meshStandardMaterial color={adjustColor(color, -30)} metalness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

function Sofa({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h, d] = scale;
  return (
    <group>
      {/* 座面 */}
      <mesh position={[0, h * 0.4, d * 0.05]} castShadow>
        <boxGeometry args={[w, h * 0.3, d * 0.8]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {/* 背もたれ */}
      <mesh position={[0, h * 0.6, -d * 0.35]} castShadow>
        <boxGeometry args={[w, h * 0.6, d * 0.25]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {/* 肘掛け */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (w / 2 - 0.08), h * 0.45, 0]} castShadow>
          <boxGeometry args={[0.15, h * 0.4, d]} />
          <meshStandardMaterial color={adjustColor(color, -15)} roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Shelf({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h, d] = scale;
  const shelves = 4;
  return (
    <group>
      {/* 側板 */}
      {[-1, 1].map((side, i) => (
        <mesh key={i} position={[side * (w / 2 - 0.015), h / 2, 0]} castShadow>
          <boxGeometry args={[0.03, h, d]} />
          <meshStandardMaterial color={adjustColor(color, -10)} />
        </mesh>
      ))}
      {/* 棚板 */}
      {Array.from({ length: shelves + 1 }).map((_, i) => (
        <mesh key={`shelf-${i}`} position={[0, (h / shelves) * i, 0]}>
          <boxGeometry args={[w - 0.04, 0.02, d]} />
          <meshStandardMaterial color={color} />
        </mesh>
      ))}
      {/* 背板 */}
      <mesh position={[0, h / 2, -d / 2 + 0.005]}>
        <boxGeometry args={[w - 0.04, h, 0.01]} />
        <meshStandardMaterial color={adjustColor(color, -20)} />
      </mesh>
    </group>
  );
}

function PendantLight({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h] = scale;
  return (
    <group>
      {/* コード */}
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.005, 0.005, h, 6]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* シェード */}
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[w / 2, h * 0.5, 16, 1, true]} />
        <meshStandardMaterial color={color} side={THREE.DoubleSide} metalness={0.3} />
      </mesh>
      {/* 電球 */}
      <mesh position={[0, -0.05, 0]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial color="#FFF8E1" emissive="#FFF8E1" emissiveIntensity={2} />
      </mesh>
      <pointLight position={[0, -0.1, 0]} intensity={0.5} color="#FFE4B5" distance={4} castShadow />
    </group>
  );
}

function Plant({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h] = scale;
  return (
    <group>
      {/* 鉢 */}
      <mesh position={[0, h * 0.15, 0]} castShadow>
        <cylinderGeometry args={[w * 0.3, w * 0.25, h * 0.3, 12]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      {/* 土 */}
      <mesh position={[0, h * 0.3, 0]}>
        <cylinderGeometry args={[w * 0.28, w * 0.28, 0.02, 12]} />
        <meshStandardMaterial color="#3E2723" />
      </mesh>
      {/* 葉（球体で近似） */}
      {[
        [0, h * 0.65, 0],
        [w * 0.15, h * 0.55, w * 0.1],
        [-w * 0.12, h * 0.58, -w * 0.08],
        [w * 0.05, h * 0.75, -w * 0.1],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <sphereGeometry args={[w * 0.25, 8, 8]} />
          <meshStandardMaterial color={i % 2 === 0 ? color : adjustColor(color, 15)} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Partition({ scale, color }: { scale: [number, number, number]; color: string }) {
  const [w, h, d] = scale;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.7} transparent opacity={0.9} />
      </mesh>
      {/* フレーム */}
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w + 0.02, h + 0.02, d + 0.01]} />
        <meshStandardMaterial color={adjustColor(color, -40)} wireframe />
      </mesh>
    </group>
  );
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
