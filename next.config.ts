import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画像最適化
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // 実験的機能
  experimental: {
    // CSS最適化
    optimizeCss: true,
  },
  // Three.js のサーバーサイド参照を防ぐ
  serverExternalPackages: ['three'],
  // Turbopack設定（Next.js 16デフォルト）
  turbopack: {},
};

export default nextConfig;
