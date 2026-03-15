import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Porano Perse - 3D店舗パースツール",
  description: "店舗内装の3Dパースをブラウザで作成。2D図面エディタで間取りを描き、リアルタイム3Dプレビューで完成イメージを確認。飲食店・美容室・オフィスなど多業種対応。",
  manifest: "/manifest.json",
  metadataBase: new URL("https://porano-perse.vercel.app"),
  openGraph: {
    title: "Porano Perse - 3D店舗パースツール",
    description: "店舗内装の3Dパースをブラウザで作成。図面エディタ + リアルタイム3Dプレビュー。",
    url: "https://porano-perse.vercel.app",
    siteName: "Porano Perse",
    type: "website",
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "Porano Perse - 3D店舗パースツール",
    description: "店舗内装の3Dパースをブラウザで作成。図面エディタ + リアルタイム3Dプレビュー。",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Porano Perse",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ServiceWorkerRegister />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}
