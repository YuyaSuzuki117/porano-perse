'use client';

interface HeaderProps {
  projectName?: string;
  onScreenshot?: () => void;
}

export function Header({ projectName = '新規プロジェクト', onScreenshot }: HeaderProps) {
  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 shrink-0">
      <h1 className="text-lg font-bold text-gray-800">
        <span className="text-blue-600">Porano</span>
        <span className="text-gray-400 mx-1">/</span>
        <span className="text-gray-600">Perse</span>
      </h1>
      <span className="ml-3 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
        {projectName}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {onScreenshot && (
          <button
            onClick={onScreenshot}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
          >
            スクリーンショット
          </button>
        )}
      </div>
    </header>
  );
}
