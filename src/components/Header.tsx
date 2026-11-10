'use client';

import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, Box, CheckCircle2, Smartphone, WifiOff } from 'lucide-react';

interface SyncData {
  dbCardsCount: number;
  isSyncing: boolean;
  totalIdsFound: number;
  progressPercent: number;
  lastSyncCompletedAt: string | null;
  error: string | null;
}

interface HeaderProps {
  totalInventoryCount: number;
  uniqueInventoryCount: number;
  isOfflineMode?: boolean;
  onOpenDataSync?: () => void;
}

export default function Header({
  totalInventoryCount,
  uniqueInventoryCount,
  isOfflineMode = false,
  onOpenDataSync,
}: HeaderProps) {
  const [sync, setSync] = useState<SyncData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        setSync(data);
      }
    } catch {
      // Offline mode - ignore
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const triggerSync = async () => {
    setIsRefreshing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      await fetchSyncStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4 max-w-7xl mx-auto">
        {/* ロゴとタイトル */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <img
            src="/icon.svg"
            alt="DM Vault"
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl shadow-lg shadow-indigo-500/20 shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2">
                <span>DM Vault</span>
                <span className="hidden sm:inline-block text-xs font-normal text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/50">
                  デュエマ保管庫
                </span>
              </h1>
              {isOfflineMode && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-600/50 px-2 py-0.5 rounded-full">
                  <WifiOff className="w-3 h-3" />
                  単体モード
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400 hidden xs:block">
              デュエル・マスターズ カード&ストレージ管理
            </p>
          </div>
        </div>

        {/* 統計バッジ & スマホ連携ボタン */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
            <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
            <div className="text-xs">
              <span className="text-slate-400 hidden sm:inline">保管総数: </span>
              <span className="font-bold text-white text-xs sm:text-sm">{totalInventoryCount}</span>
              <span className="text-slate-400 text-[10px] ml-0.5">枚</span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="text-xs">
              <span className="text-slate-400 hidden sm:inline">種類: </span>
              <span className="font-bold text-emerald-400 text-xs sm:text-sm">{uniqueInventoryCount}</span>
              <span className="text-slate-400 text-[10px] ml-0.5">種</span>
            </div>
          </div>

          {/* 公式カード同期ステータス (PC表示時) */}
          {!isOfflineMode && (
            <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/40 text-xs">
              <Database className="w-4 h-4 text-purple-400" />
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-medium">公式DB:</span>
                <span className="font-semibold text-purple-300">
                  {sync ? sync.dbCardsCount.toLocaleString() : '24,049'}
                </span>
                <span className="text-slate-500">枚</span>

                {sync?.isSyncing ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    自動取得中 ({sync.progressPercent}%)
                  </span>
                ) : !sync || sync.dbCardsCount >= 20000 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    収録済み
                  </span>
                ) : (
                  <button
                    onClick={triggerSync}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white bg-indigo-900/50 hover:bg-indigo-800 px-2 py-0.5 rounded border border-indigo-700/50 transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    全カード取得
                  </button>
                )}
              </div>
            </div>
          )}

          {/* スマホ連携・データ管理ボタン */}
          {onOpenDataSync && (
            <button
              type="button"
              onClick={onOpenDataSync}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-bold transition shadow-sm"
              title="外出先でのスマホ単体利用・データ書き出し・復元"
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">スマホ連携・データ管理</span>
              <span className="sm:hidden">スマホ・保存</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
