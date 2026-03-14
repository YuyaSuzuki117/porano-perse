'use client';

import { useEffect, useRef } from 'react';
import { useEditorStore, LOCALSTORAGE_KEY } from '@/stores/useEditorStore';

export function useAutoSave(debounceMs = 2000) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useEditorStore.subscribe(
      (state) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const doSave = () => {
            try {
              const data = {
                projectName: state.projectName,
                walls: state.walls,
                openings: state.openings,
                furniture: state.furniture,
                roomHeight: state.roomHeight,
                style: state.style,
                wallDisplayMode: state.wallDisplayMode,
                ceilingVisible: state.ceilingVisible,
                showGrid: state.showGrid,
                showDimensions: state.showDimensions,
                dayNight: state.dayNight,
              };
              const file = {
                version: 1,
                name: state.projectName,
                createdAt: new Date().toISOString(),
                data,
              };
              localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(file));
              state.markAutoSaved();
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
