'use client';

import React, { useMemo, useCallback } from 'react';
import { useEditorStore } from '@/stores/useEditorStore';
import { checkErgonomics, ErgonomicIssue } from '@/lib/ergonomic-checker';

interface ErgonomicPanelProps {
  onHighlightFurniture?: (ids: string[]) => void;
}

export const ErgonomicPanel: React.FC<ErgonomicPanelProps> = ({ onHighlightFurniture }) => {
  const furniture = useEditorStore(s => s.furniture);
  const walls = useEditorStore(s => s.walls);
  const openings = useEditorStore(s => s.openings);

  const issues = useMemo(
    () => checkErgonomics(furniture, walls, openings),
    [furniture, walls, openings]
  );

  const errors = useMemo(() => issues.filter(i => i.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter(i => i.severity === 'warning'), [issues]);

  const handleClick = useCallback(
    (issue: ErgonomicIssue) => {
      onHighlightFurniture?.(issue.furnitureIds);
    },
    [onHighlightFurniture]
  );

  return (
    <div className="bg-white/90 backdrop-blur rounded-lg shadow-lg p-4 max-h-96 overflow-y-auto">
      <h3 className="text-sm font-bold text-gray-800 mb-3">エルゴノミクスチェック</h3>

      {issues.length === 0 ? (
        <div className="text-center py-4 text-green-600 font-medium">
          問題なし ✅
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500 mb-2">
            {errors.length > 0 && (
              <span className="text-red-600 font-medium mr-2">{errors.length}件のエラー</span>
            )}
            {warnings.length > 0 && (
              <span className="text-yellow-600 font-medium">{warnings.length}件の警告</span>
            )}
          </div>

          <ul className="space-y-2">
            {issues.map((issue, idx) => (
              <li
                key={`${issue.type}-${idx}`}
                className="flex items-start gap-2 p-2 rounded hover:bg-gray-100 cursor-pointer transition-colors text-xs"
                onClick={() => handleClick(issue)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleClick(issue);
                }}
              >
                <span className="flex-shrink-0 mt-0.5">
                  {issue.severity === 'error' ? '❌' : '⚠️'}
                </span>
                <span className="text-gray-700">{issue.message}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
};
