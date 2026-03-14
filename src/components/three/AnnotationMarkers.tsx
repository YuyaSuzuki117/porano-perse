'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { Annotation } from '@/types/scene';

const PIN_COLORS: Record<string, string> = {
  '#ef4444': '#ef4444', // red
  '#3b82f6': '#3b82f6', // blue
  '#22c55e': '#22c55e', // green
  '#eab308': '#eab308', // yellow
};

// Shared geometries (created once outside component)
const sphereGeometry = new THREE.SphereGeometry(0.06, 12, 12);
const cylinderGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.15, 8);

interface AnnotationPinProps {
  annotation: Annotation;
  index: number;
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
}

const AnnotationPin = React.memo(function AnnotationPin({
  annotation,
  index,
  onUpdate,
  onDelete,
}: AnnotationPinProps) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(annotation.text);
  const groupRef = useRef<THREE.Group>(null);

  if (!annotation.visible) return null;

  const color = PIN_COLORS[annotation.color] || annotation.color;

  return (
    <group
      ref={groupRef}
      position={annotation.position}
    >
      {/* Pin stem (cylinder) */}
      <mesh
        geometry={cylinderGeometry}
        position={[0, 0.075, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
      >
        <meshStandardMaterial color="#888888" />
      </mesh>

      {/* Pin head (sphere) */}
      <mesh
        geometry={sphereGeometry}
        position={[0, 0.18, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          setHovered(true);
        }}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.2}
        />
      </mesh>

      {/* Number badge */}
      <Html
        position={[0, 0.18, 0]}
        center
        distanceFactor={5}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            backgroundColor: color,
            color: '#fff',
            fontSize: 10,
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid #fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            userSelect: 'none',
          }}
        >
          {index + 1}
        </div>
      </Html>

      {/* Tooltip on hover */}
      {hovered && (
        <Html
          position={[0, 0.35, 0]}
          center
          distanceFactor={8}
          style={{ pointerEvents: 'auto' }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: '8px 12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              maxWidth: 220,
              minWidth: 120,
              fontSize: 12,
              color: '#1f2937',
              lineHeight: 1.4,
            }}
            onMouseLeave={() => {
              if (!editing) setHovered(false);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color, fontSize: 11 }}>#{index + 1}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => {
                    setEditing(true);
                    setEditText(annotation.text);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#6b7280',
                    padding: '0 2px',
                  }}
                  title="編集"
                >
                  &#9998;
                </button>
                <button
                  onClick={() => onDelete(annotation.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    color: '#ef4444',
                    padding: '0 2px',
                  }}
                  title="削除"
                >
                  &times;
                </button>
              </div>
            </div>

            {editing ? (
              <div>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  rows={2}
                  style={{
                    width: '100%',
                    fontSize: 11,
                    border: '1px solid #d1d5db',
                    borderRadius: 4,
                    padding: 4,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <button
                    onClick={() => {
                      onUpdate(annotation.id, { text: editText });
                      setEditing(false);
                    }}
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditText(annotation.text);
                    }}
                    style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      background: '#f3f4f6',
                      color: '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {annotation.text}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
});

interface AnnotationMarkersProps {
  annotations: Annotation[];
  onUpdate: (id: string, updates: Partial<Annotation>) => void;
  onDelete: (id: string) => void;
}

export const AnnotationMarkers = React.memo(function AnnotationMarkers({
  annotations,
  onUpdate,
  onDelete,
}: AnnotationMarkersProps) {
  return (
    <group>
      {annotations.map((ann, i) => (
        <AnnotationPin
          key={ann.id}
          annotation={ann}
          index={i}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </group>
  );
});

interface AnnotationPlacementProps {
  active: boolean;
  onPlace: (position: [number, number, number]) => void;
}

export const AnnotationPlacement = React.memo(function AnnotationPlacement({
  active,
  onPlace,
}: AnnotationPlacementProps) {
  const [previewPos, setPreviewPos] = useState<[number, number, number] | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!active) return;
    e.stopPropagation();
    const point = e.point;
    setPreviewPos([point.x, point.y, point.z]);
  }, [active]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!active) return;
    e.stopPropagation();
    const point = e.point;
    onPlace([point.x, point.y, point.z]);
  }, [active, onPlace]);

  if (!active) return null;

  return (
    <group>
      {/* Invisible raycasting plane at floor level */}
      <mesh
        ref={planeRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {/* Preview marker */}
      {previewPos && (
        <group position={previewPos}>
          <mesh geometry={cylinderGeometry} position={[0, 0.075, 0]}>
            <meshStandardMaterial color="#888888" transparent opacity={0.5} />
          </mesh>
          <mesh geometry={sphereGeometry} position={[0, 0.18, 0]}>
            <meshStandardMaterial color="#ef4444" transparent opacity={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
});
