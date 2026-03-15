'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isWebGLLost: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  private webglLostHandler: ((e: Event) => void) | null = null;
  private webglRestoredHandler: ((e: Event) => void) | null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isWebGLLost: false };
    this.webglRestoredHandler = null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidMount() {
    // WebGLコンテキスト喪失を検出
    this.webglLostHandler = (e: Event) => {
      e.preventDefault();
      console.error('[ErrorBoundary] WebGL context lost');
      this.setState({ hasError: true, isWebGLLost: true, error: new Error('WebGL context lost') });
    };
    this.webglRestoredHandler = () => {
      console.log('[ErrorBoundary] WebGL context restored');
      this.setState({ hasError: false, isWebGLLost: false, error: null });
    };
    document.addEventListener('webglcontextlost', this.webglLostHandler);
    document.addEventListener('webglcontextrestored', this.webglRestoredHandler);
  }

  componentWillUnmount() {
    if (this.webglLostHandler) {
      document.removeEventListener('webglcontextlost', this.webglLostHandler);
    }
    if (this.webglRestoredHandler) {
      document.removeEventListener('webglcontextrestored', this.webglRestoredHandler);
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, isWebGLLost: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isWebGL = this.state.isWebGLLost ||
        this.state.error?.message?.toLowerCase().includes('webgl') ||
        this.state.error?.message?.toLowerCase().includes('context');

      return (
        <div className="flex-1 flex items-center justify-center bg-gray-900">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} className="w-8 h-8">
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">
              {isWebGL ? '3Dビューでエラーが発生しました' : '表示エラーが発生しました'}
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              {isWebGL
                ? 'WebGLコンテキストが失われました。GPUメモリ不足やブラウザのバックグラウンド処理が原因の可能性があります。'
                : '3Dレンダリングエラーが発生しました。'}
              リロードしてください。
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
              >
                再試行
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                リロード
              </button>
            </div>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-gray-500 cursor-pointer">エラー詳細</summary>
                <pre className="mt-2 text-[10px] text-red-400 bg-gray-800 p-2 rounded overflow-x-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
