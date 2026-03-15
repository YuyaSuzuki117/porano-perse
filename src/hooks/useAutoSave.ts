'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore, LOCALSTORAGE_KEY } from '@/stores/useEditorStore';
import { useCameraStore } from '@/stores/useCameraStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useUIStore } from '@/stores/useUIStore';
import { autoSave as supabaseAutoSave } from '@/lib/project-storage';

export function useAutoSave(debounceMs = 2000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      (state) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const doSave = () => {
            try {
              const ui = useUIStore.getState();
              const data = {
                projectName: state.projectName,
                walls: state.walls,
                openings: state.openings,
                furniture: state.furniture,
                roomHeight: state.roomHeight,
                style: state.style,
                wallDisplayMode: ui.wallDisplayMode,
                ceilingVisible: ui.ceilingVisible,
                showGrid: ui.showGrid,
                showDimensions: ui.showDimensions,
                dayNight: useCameraStore.getState().dayNight,
              };
              const file = {
                version: 1,
                name: state.projectName,
                createdAt: new Date().toISOString(),
                data,
              };
              // localStorage保存（オフライン対応）
              localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(file));
              useProjectStore.getState().markAutoSaved();

              // Supabase並列保存（利用可能な場合のみ、silent fail）
              try {
                supabaseAutoSave(
                  state.projectName,
                  data as Record<string, unknown>,
                  5000
                );
              } catch {
                // Supabase unavailable — localStorage saved, so safe to ignore
              }
            } catch {
              // localStorage full or unavailable
            }
          };
          // Use requestIdleCallback to avoid blocking UI, fallback to direct call
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(doSave);
          } else {
            doSave();
          }
        }, debounceMs);
      }
    );

    return () => {
      unsub();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [debounceMs]);
}
