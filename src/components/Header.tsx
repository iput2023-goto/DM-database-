'use client';

import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, Box, Layers, CheckCircle2, AlertCircle } from 'lucide-react';

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
}

export default function Header({ totalInventoryCount, uniqueInventoryCount }: HeaderProps) {
  const [sync, setSync] = useState<SyncData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        setSync(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 3000);
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
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-4 max-w-7xl mx-auto">
        {/* ロゴとタイトル */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide">
                DM Vault <span className="text-xs font-normal text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800/50">デュエマ保管庫</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">デュエル・マスターズ カード&ストレージ管理</p>
          </div>
        </div>

        {/* 統計バッジ */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 rounded-lg border border-slate-700/60">
            <Box className="w-4 h-4 text-blue-400" />
            <div className="text-xs">
              <span className="text-slate-400">保管総数: </span>
              <span className="font-bold text-white text-sm">{totalInventoryCount}</span>
              <span className="text-slate-400 text-[10px] ml-1">枚</span>
            </div>
            <span className="text-slate-600">|</span>
            <div className="text-xs">
              <span className="text-slate-400">種類: </span>
              <span className="font-bold text-emerald-400">{uniqueInventoryCount}</span>
              <span className="text-slate-400 text-[10px] ml-1">種</span>
            </div>
          </div>

          {/* 公式カード同期ステータス */}
          <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700/40 text-xs">
            <Database className="w-4 h-4 text-purple-400" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-medium">公式カードDB:</span>
                <span className="font-semibold text-purple-300">
                  {sync ? sync.dbCardsCount.toLocaleString() : '...'}
                </span>
                <span className="text-slate-500">枚</span>
                
                {sync?.isSyncing ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-full animate-pulse">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    自動取得中 ({sync.progressPercent}%)
                  </span>
                ) : sync && sync.dbCardsCount >= 20000 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    最新同期済み
                  </span>
                ) : (
                  <button
                    onClick={triggerSync}
                    disabled={isRefreshing}
                    className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white bg-indigo-900/50 hover:bg-indigo-800 px-2 py-0.5 rounded border border-indigo-700/50 transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    全カード取得開始
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

