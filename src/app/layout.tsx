import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'デュエマ ストレージマネージャー | カード保管データベース',
  description: 'デュエル・マスターズの全カードに対応した所持カード・ストレージ保管管理アプリ',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}

